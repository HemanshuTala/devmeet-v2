"""
CODE-09: AWS S3 integration for code snapshot persistence
This module provides S3 integration for storing code execution snapshots.
"""
import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

logger = logging.getLogger("s3-service")


class S3CodeSnapshotService:
    """AWS S3 service for code execution snapshot persistence."""
    
    def __init__(self):
        self.bucket_name = os.getenv("AWS_S3_CODE_SNAPSHOTS_BUCKET", "devmeet-code-snapshots")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize S3 client with credentials from environment or IAM role."""
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
                logger.info("S3 client initialized with explicit credentials")
            else:
                self.s3_client = boto3.client('s3', region_name=self.region)
                logger.info("S3 client initialized with default credential chain")
            
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
    
    async def upload_code_snapshot(
        self,
        session_id: str,
        language: str,
        code: str,
        execution_result: dict
    ) -> Optional[str]:
        """
        Upload a code execution snapshot to S3.
        
        Returns:
            S3 object key if successful, None otherwise
        """
        if not self.is_available():
            logger.debug("S3 service not available, skipping snapshot upload")
            return None
        
        try:
            snapshot = {
                "session_id": session_id,
                "language": language,
                "code": code,
                "execution_result": execution_result,
                "timestamp": datetime.utcnow().isoformat(),
                "version": "1.0"
            }
            
            snapshot_json = json.dumps(snapshot, default=str, indent=2)
            
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            s3_key = f"code_snapshots/{session_id}/{language}_{timestamp}.json"
            
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=snapshot_json,
                ContentType='application/json',
                ServerSideEncryption='AES256'
            )
            
            logger.info(f"Code snapshot uploaded to S3: {s3_key}")
            return s3_key
            
        except Exception as e:
            logger.error(f"Failed to upload code snapshot to S3: {e}")
            return None
    
    async def download_code_snapshot(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """Download a code snapshot from S3."""
        if not self.is_available():
            logger.debug("S3 service not available, cannot download snapshot")
            return None
        
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            snapshot_json = response['Body'].read().decode('utf-8')
            snapshot = json.loads(snapshot_json)
            
            logger.info(f"Code snapshot downloaded from S3: {s3_key}")
            return snapshot
            
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'NoSuchKey':
                logger.warning(f"Snapshot not found: {s3_key}")
            else:
                logger.error(f"S3 download error: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to download code snapshot: {e}")
            return None
    
    async def list_session_snapshots(self, session_id: str) -> list:
        """List all code snapshots for a session."""
        if not self.is_available():
            return []
        
        try:
            prefix = f"code_snapshots/{session_id}/"
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
            
            snapshots.sort(key=lambda x: x['last_modified'], reverse=True)
            return snapshots
            
        except Exception as e:
            logger.error(f"Failed to list code snapshots: {e}")
            return []


s3_code_service = S3CodeSnapshotService()
