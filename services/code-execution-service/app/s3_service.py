"""
================================================================================
CODE EXECUTION SERVICE — AWS S3 / MINIO CODE SNAPSHOT PERSISTENCE
================================================================================
Role & Responsibility:
  This module manages cloud object storage archiving for candidate code submissions
  and sandbox execution results. Storing snapshots in AWS S3 or MinIO provides:
    1. Auditing & Anti-Plagiarism: Persists full historical code revisions with UTC timestamps.
    2. Post-Interview Code Playback: Enables interviewers and automated feedback evaluators
       to review exactly how the candidate's code evolved throughout the interview session.
    3. Zero-Data Loss Architecture: Separates transient ephemeral container storage from
       immutable, AES-256 server-side encrypted object archives.
================================================================================
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import boto3
from botocore.exceptions import ClientError, NoCredentialsError

logger = logging.getLogger("s3-service")


class S3CodeSnapshotService:
    """
    AWS S3 and S3-compatible client managing code revision snapshots.

    Attributes:
      bucket_name (str): S3 bucket identifier (default: 'devmeet-code-snapshots').
      region (str): AWS region string (default: 'us-east-1').
      s3_client (boto3.client | None): Configured Boto3 S3 client.
    """

    def __init__(self):
        """Initializes S3 bucket settings and triggers client authentication."""
        self.bucket_name = os.getenv("AWS_S3_CODE_SNAPSHOTS_BUCKET", "devmeet-code-snapshots")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._initialize_client()

    def _initialize_client(self):
        """
        Initializes the Boto3 S3 client using explicit keys or the AWS IAM default credential chain.

        Error Handling:
          - NoCredentialsError: Logs a warning and disables S3 features cleanly without crashing.
          - 404 Bucket Not Found: Disables S3 features gracefully if the bucket has not been provisioned.
        """
        try:
            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

            if aws_access_key and aws_secret_key:
                self.s3_client = boto3.client(
                    "s3",
                    region_name=self.region,
                    aws_access_key_id=aws_access_key,
                    aws_secret_access_key=aws_secret_key,
                )
                logger.info("S3 client initialized with explicit credentials")
            else:
                self.s3_client = boto3.client("s3", region_name=self.region)
                logger.info("S3 client initialized with default credential chain")

            # Check bucket accessibility
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"S3 bucket '{self.bucket_name}' is accessible")

        except NoCredentialsError:
            logger.warning("AWS credentials not found. S3 features will be disabled.")
            self.s3_client = None
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code == "404":
                logger.warning(f"S3 bucket '{self.bucket_name}' does not exist. S3 features will be disabled.")
            else:
                logger.error(f"S3 initialization error: {e}")
            self.s3_client = None
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None

    def is_available(self) -> bool:
        """
        Verifies if the S3 client is connected and the bucket is accessible.

        Returns:
          bool: True if S3 upload/download operations can be safely performed.
        """
        return self.s3_client is not None

    async def upload_code_snapshot(
        self,
        session_id: str,
        language: str,
        code: str,
        execution_result: dict,
    ) -> Optional[str]:
        """
        Serializes and uploads a code execution revision to S3 with AES-256 encryption.

        Parameters:
          session_id (str): The active interview session identifier.
          language (str): Programming language (e.g., 'python', 'javascript').
          code (str): The candidate's source code at the time of execution.
          execution_result (dict): Execution output, exit codes, and timing metrics.

        Returns:
          Optional[str]: S3 object key (e.g. 'code_snapshots/{session_id}/python_20261020_193000.json')
                         or None if S3 is unavailable or upload fails.
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
                "version": "1.0",
            }

            snapshot_json = json.dumps(snapshot, default=str, indent=2)

            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            s3_key = f"code_snapshots/{session_id}/{language}_{timestamp}.json"

            # Upload JSON snapshot with AES-256 server-side encryption
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=snapshot_json,
                ContentType="application/json",
                ServerSideEncryption="AES256",
            )

            logger.info(f"Code snapshot uploaded to S3: {s3_key}")
            return s3_key

        except Exception as e:
            logger.error(f"Failed to upload code snapshot to S3: {e}")
            return None

    async def download_code_snapshot(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves and deserializes a stored code snapshot from S3.

        Parameters:
          s3_key (str): The S3 object key identifier.

        Returns:
          Optional[Dict[str, Any]]: The parsed snapshot dictionary, or None if not found.
        """
        if not self.is_available():
            logger.debug("S3 service not available, cannot download snapshot")
            return None

        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key,
            )

            snapshot_json = response["Body"].read().decode("utf-8")
            snapshot = json.loads(snapshot_json)

            logger.info(f"Code snapshot downloaded from S3: {s3_key}")
            return snapshot

        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "NoSuchKey":
                logger.warning(f"Snapshot not found: {s3_key}")
            else:
                logger.error(f"S3 download error: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to download code snapshot: {e}")
            return None

    async def list_session_snapshots(self, session_id: str) -> List[dict]:
        """
        Lists all historical code revisions for a given interview session, sorted newest first.

        Parameters:
          session_id (str): The target interview session identifier.

        Returns:
          List[dict]: Array of snapshot descriptors containing 'key', 'last_modified', and 'size'.
        """
        if not self.is_available():
            return []

        try:
            prefix = f"code_snapshots/{session_id}/"
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
            )

            if "Contents" not in response:
                return []

            snapshots = []
            for obj in response["Contents"]:
                snapshots.append({
                    "key": obj["Key"],
                    "last_modified": obj["LastModified"].isoformat(),
                    "size": obj["Size"],
                })

            # Sort revisions chronologically descending (newest first)
            snapshots.sort(key=lambda x: x["last_modified"], reverse=True)
            return snapshots

        except Exception as e:
            logger.error(f"Failed to list code snapshots: {e}")
            return []


# Singleton service instance shared across API routes
s3_code_service = S3CodeSnapshotService()
