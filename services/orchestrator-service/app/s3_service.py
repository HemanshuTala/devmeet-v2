"""
SESS-08: AWS S3 backup snapshots for session history replay
This module provides S3 integration for storing and retrieving session snapshots.
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
    """AWS S3 service for session snapshot backup and recovery."""
    
    def __init__(self):
        self.bucket_name = os.getenv("AWS_S3_SESSIONS_BUCKET", "devmeet-sessions")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize S3 client with credentials from environment or IAM role."""
        try:
            # Try to initialize with explicit credentials if provided
            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
            
            if aws_access_key and aws_secret_key:
                self.s3_client = boto3.client(
                    's3',
                    region_name=self.region,
                    aws_access_key_id=aws_access_key,
                    aws_secret_access_key=aws_secret_key
                )
                logger.info("S3 client initialized with explicit credentials")
            else:
                # Use IAM role or default credential chain
                self.s3_client = boto3.client('s3', region_name=self.region)
                logger.info("S3 client initialized with default credential chain")
            
            # Test connection by checking if bucket exists
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"S3 bucket '{self.bucket_name}' is accessible")
            
        except NoCredentialsError:
            logger.warning("AWS credentials not found. S3 features will be disabled.")
            self.s3_client = None
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                logger.warning(f"S3 bucket '{self.bucket_name}' does not exist. S3 features will be disabled.")
            else:
                logger.error(f"S3 initialization error: {e}")
            self.s3_client = None
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None
    
    def is_available(self) -> bool:
        """Check if S3 service is available."""
        return self.s3_client is not None
    
    async def upload_session_snapshot(
        self,
        session_id: str,
        session_data: Dict[str, Any],
        conversation_turns: list,
        code_submissions: list
    ) -> Optional[str]:
        """
        Upload a complete session snapshot to S3.
        
        Returns:
            S3 object key if successful, None otherwise
        """
        if not self.is_available():
            logger.debug("S3 service not available, skipping snapshot upload")
            return None
        
        try:
            snapshot = {
                "session_id": session_id,
                "session_data": session_data,
                "conversation_turns": conversation_turns,
                "code_submissions": code_submissions,
                "snapshot_timestamp": datetime.utcnow().isoformat(),
                "version": "1.0"
            }
            
            # Serialize to JSON
            snapshot_json = json.dumps(snapshot, default=str, indent=2)
            
            # Generate S3 key
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            s3_key = f"sessions/{session_id}/snapshot_{timestamp}.json"
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=snapshot_json,
                ContentType='application/json',
                ServerSideEncryption='AES256'
            )
            
            logger.info(f"Session snapshot uploaded to S3: {s3_key}")
            return s3_key
            
        except Exception as e:
            logger.error(f"Failed to upload session snapshot to S3: {e}")
            return None
    
    async def download_session_snapshot(self, session_id: str, snapshot_key: str = None) -> Optional[Dict[str, Any]]:
        """
        Download a session snapshot from S3.
        
        Args:
            session_id: The session ID
            snapshot_key: Optional specific snapshot key. If not provided, fetches the latest.
        
        Returns:
            Snapshot data if successful, None otherwise
        """
        if not self.is_available():
            logger.debug("S3 service not available, cannot download snapshot")
            return None
        
        try:
            if not snapshot_key:
                # Find the latest snapshot for this session
                snapshot_key = await self._get_latest_snapshot_key(session_id)
                if not snapshot_key:
                    logger.warning(f"No snapshot found for session {session_id}")
                    return None
            
            # Download from S3
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
        """Get the latest snapshot key for a session."""
        try:
            prefix = f"sessions/{session_id}/"
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            
            if 'Contents' not in response or not response['Contents']:
                return None
            
            # Sort by last modified date and get the latest
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
        """List all available snapshots for a session."""
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
            
            # Sort by last modified date (newest first)
            snapshots.sort(key=lambda x: x['last_modified'], reverse=True)
            
            return snapshots
            
        except Exception as e:
            logger.error(f"Failed to list snapshots: {e}")
            return []
    
    async def delete_snapshot(self, snapshot_key: str) -> bool:
        """Delete a specific snapshot from S3."""
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
        """Generate a presigned URL for downloading a snapshot."""
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


s3_service = S3Service()
