"""
AWS S3 Session Snapshot Backup and Recovery Service.
===================================================
SESS-08: Long-term archival and replay snapshot storage for interview sessions.

Why S3 Snapshots are Used:
--------------------------
While active interview sessions reside in PostgreSQL for rapid relational querying,
completed interviews (including full conversational transcripts, code submissions,
proctoring violation timelines, and evaluation rubrics) are archived into AWS S3
(or MinIO in local development environments):
1. Disaster Recovery & Replay:
   Enables candidates and recruiters to replay the entire interview step-by-step
   from an immutable JSON snapshot.
2. Long-term Cold Storage:
   Offloads large transcript and code payload blobs from the primary database cluster,
   optimizing database indexing and query performance.
3. Server-Side Encryption:
   All objects stored in S3 are protected using AES-256 server-side encryption.
4. Graceful Degradation:
   If AWS credentials or S3 buckets are not configured (e.g. offline dev mode),
   the service disables itself gracefully without crashing session completions.
"""

import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

logger = logging.getLogger("s3-service")


class S3Service:
    """
    AWS S3 client managing session snapshot uploads, downloads, and presigned URLs.
    """
    
    def __init__(self):
        """
        Initializes S3 bucket configurations from environment variables.
        Defaults to bucket 'devmeet-sessions' in region 'us-east-1'.
        """
        self.bucket_name = os.getenv("AWS_S3_SESSIONS_BUCKET", "devmeet-sessions")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """
        Initializes boto3 S3 client using environment keys or AWS IAM Instance Profile.
        
        Tests bucket connectivity using `head_bucket`. If credentials or bucket are missing,
        sets `self.s3_client = None` to gracefully disable cloud archival features.
        """
        try:
            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
            
            if aws_access_key and aws_secret_key:
                self.s3_client = boto3.client(
                    's3',
                    region_name=self.region,
                    aws_access_key_id=aws_access_key,
                    aws_secret_access_key=aws_secret_key
                )
                logger.info("S3 client initialized with explicit environment credentials")
            else:
                # Fallback to IAM instance metadata / ~/.aws/credentials default provider chain
                self.s3_client = boto3.client('s3', region_name=self.region)
                logger.info("S3 client initialized with default AWS credential chain")
            
            # Validate bucket existence and IAM permissions
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"S3 bucket '{self.bucket_name}' verified and accessible")
            
        except NoCredentialsError:
            logger.warning("AWS credentials not found. S3 snapshot features disabled.")
            self.s3_client = None
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                logger.warning(f"S3 bucket '{self.bucket_name}' not found. S3 snapshot features disabled.")
            else:
                logger.error(f"S3 initialization client error: {e}")
            self.s3_client = None
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None
    
    def is_available(self) -> bool:
        """
        Returns True if the boto3 S3 client is initialized and connected, False otherwise.
        """
        return self.s3_client is not None
    
    async def upload_session_snapshot(
        self,
        session_id: str,
        session_data: Dict[str, Any],
        conversation_turns: list,
        code_submissions: list
    ) -> Optional[str]:
        """
        Bundles interview session data, turns, and code submissions into an encrypted S3 JSON snapshot.

        Parameters:
            session_id (str): Interview session UUID.
            session_data (Dict): Metadata from PostgreSQL `sessions` row.
            conversation_turns (list): Complete list of dialogue turns.
            code_submissions (list): Chronological code revisions.

        Returns:
            Optional[str]: S3 object key (e.g. `sessions/<id>/snapshot_20261020_190000.json`)
            or None if S3 is unavailable.
        """
        if not self.is_available():
            logger.debug("S3 service not available, skipping snapshot upload")
            return None
        
        try:
            # Package structured snapshot archive
            snapshot = {
                "session_id": session_id,
                "session_data": session_data,
                "conversation_turns": conversation_turns,
                "code_submissions": code_submissions,
                "snapshot_timestamp": datetime.utcnow().isoformat(),
                "version": "1.0"
            }
            
            # Format JSON string (default=str handles UUID and datetime objects safely)
            snapshot_json = json.dumps(snapshot, default=str, indent=2)
            
            # Generate deterministic path key
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            s3_key = f"sessions/{session_id}/snapshot_{timestamp}.json"
            
            # Upload with AES-256 server-side encryption
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=snapshot_json,
                ContentType='application/json',
                ServerSideEncryption='AES256'
            )
            
            logger.info(f"Session snapshot uploaded successfully to S3: {s3_key}")
            return s3_key
            
        except Exception as e:
            logger.error(f"Failed to upload session snapshot to S3: {e}")
            return None
    
    async def download_session_snapshot(self, session_id: str, snapshot_key: str = None) -> Optional[Dict[str, Any]]:
        """
        Downloads and parses a session snapshot from S3.

        Parameters:
            session_id (str): Interview session UUID.
            snapshot_key (Optional[str]): Explicit S3 key; if omitted, fetches the latest snapshot.

        Returns:
            Optional[Dict]: Parsed snapshot JSON dictionary, or None if not found.
        """
        if not self.is_available():
            logger.debug("S3 service not available, cannot download snapshot")
            return None
        
        try:
            if not snapshot_key:
                # Find the latest snapshot key for this session prefix
                snapshot_key = await self._get_latest_snapshot_key(session_id)
                if not snapshot_key:
                    logger.warning(f"No snapshot found for session {session_id}")
                    return None
            
            # Fetch object stream from S3
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=snapshot_key
            )
            
            snapshot_json = response['Body'].read().decode('utf-8')
            snapshot = json.loads(snapshot_json)
            
            logger.info(f"Session snapshot downloaded from S3: {snapshot_key}")
            return snapshot
            
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'NoSuchKey':
                logger.warning(f"Snapshot not found: {snapshot_key}")
            else:
                logger.error(f"S3 download error: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to download session snapshot: {e}")
            return None
    
    async def _get_latest_snapshot_key(self, session_id: str) -> Optional[str]:
        """
        Finds the most recently modified snapshot object key for a session.
        """
        try:
            prefix = f"sessions/{session_id}/"
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            
            if 'Contents' not in response or not response['Contents']:
                return None
            
            # Sort by LastModified timestamp descending
            objects = sorted(
                response['Contents'],
                key=lambda x: x['LastModified'],
                reverse=True
            )
            
            return objects[0]['Key']
            
        except Exception as e:
            logger.error(f"Failed to list snapshots: {e}")
            return None
    
    async def list_session_snapshots(self, session_id: str) -> list:
        """
        Returns a list of all historical snapshot revisions available for a session.
        """
        if not self.is_available():
            return []
        
        try:
            prefix = f"sessions/{session_id}/"
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            
            if 'Contents' not in response:
                return []
            
            snapshots = []
            for obj in response['Contents']:
                snapshots.append({
                    "key": obj['Key'],
                    "last_modified": obj['LastModified'].isoformat(),
                    "size": obj['Size']
                })
            
            # Sort by newest first
            snapshots.sort(key=lambda x: x['last_modified'], reverse=True)
            return snapshots
            
        except Exception as e:
            logger.error(f"Failed to list snapshots: {e}")
            return []
    
    async def delete_snapshot(self, snapshot_key: str) -> bool:
        """
        Deletes a specific snapshot object from S3.
        """
        if not self.is_available():
            return False
        
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=snapshot_key
            )
            logger.info(f"Snapshot deleted: {snapshot_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete snapshot: {e}")
            return False
    
    async def generate_presigned_url(self, snapshot_key: str, expiration_seconds: int = 3600) -> Optional[str]:
        """
        Generates a secure, time-limited presigned GET URL for client downloading.

        Parameters:
            snapshot_key (str): S3 object key.
            expiration_seconds (int): URL validity window (default: 3600 = 1 hour).
        """
        if not self.is_available():
            return None
        
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': snapshot_key
                },
                ExpiresIn=expiration_seconds
            )
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None


# Global singleton instance of S3Service
s3_service = S3Service()
