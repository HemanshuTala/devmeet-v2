"""
DevMeet File Service - Object & Local Storage Manager
=====================================================
This module manages blob and document storage for candidate resumes, session code snapshots,
feedback PDF reports, and candidate avatar images across DevMeet.

Key Architectural Responsibilities:
1. Hybrid Dual-Backend Driver (AWS S3 vs. Local Filesystem):
   - In production or cloud deployments: Stores blobs in an AWS S3 bucket using `boto3`.
   - In development, on-premise, or disconnected environments: Gracefully degrades to
     the local disk (`uploads/` directory) with asynchronous chunk writing (`aiofiles`).
2. Conflict-Free Key Generation:
   - Sanitizes filenames and prepends a UUIDv4 hex prefix to prevent path traversal attacks
     and name collisions (`folder/{uuid4}_{filename}`).
3. Secure Direct Access (Presigned URLs):
   - In S3 mode: Generates cryptographically signed, time-limited presigned GET URLs
     (default 1-hour expiration) offloading bandwidth from internal microservices.
   - In local mode: Returns reverse-proxied direct streaming URLs (`/api/v1/files/download/...`).
4. Lifecycle Management:
   - Provides asynchronous file inspection (`head_object` / `stat`), existence checks,
     deletion, and local directory scanning.
"""

import os
import uuid
import aiofiles
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List

# Local disk root storage directory
LOCAL_DIR = Path(os.getenv("LOCAL_UPLOAD_DIR", "uploads"))

# Service base URL for constructing local file download paths
BASE_URL = os.getenv("BASE_URL", "http://localhost:8011")

# AWS S3 Cloud Storage Credentials & Configuration
S3_BUCKET = os.getenv("S3_BUCKET", "")
AWS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Evaluate whether S3 configuration is complete
_use_s3 = bool(AWS_KEY and AWS_SECRET and S3_BUCKET)

_s3_client = None
if _use_s3:
    try:
        import boto3
        # Initialize boto3 S3 client with credentials
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=AWS_KEY,
            aws_secret_access_key=AWS_SECRET,
            region_name=AWS_REGION,
        )
        print(f"[file-service] Using S3 backend: {S3_BUCKET}")
    except Exception as e:
        print(f"[file-service] S3 init failed: {e}, falling back to local storage")
        _use_s3 = False
else:
    print(f"[file-service] No AWS credentials — using local disk storage at {LOCAL_DIR}")


class StorageManager:
    """
    Unified object storage interface supporting both Amazon Web Services S3
    and asynchronous local disk persistence.
    """

    def __init__(self):
        """
        Initializes storage driver attributes and creates local storage directories.
        """
        self.use_s3 = _use_s3
        self.local_dir = LOCAL_DIR
        # Ensure target upload directory exists on disk
        self.local_dir.mkdir(parents=True, exist_ok=True)

    def _make_key(self, filename: str, folder: str = "uploads") -> str:
        """
        Constructs a collision-free, sanitized storage key path.

        Args:
            filename (str): Original uploaded file name.
            folder (str): Logical bucket directory (e.g. 'resumes', 'avatars').

        Returns:
            str: Path-sanitized key with UUID prefix.
        """
        # Sanitize whitespace and path traversal delimiters
        safe = filename.replace(" ", "_").replace("/", "_")
        return f"{folder}/{uuid.uuid4().hex}_{safe}"

    async def upload_file(
        self,
        content: bytes,
        filename: str,
        content_type: str,
        folder: str = "uploads",
    ) -> dict:
        """
        Persists raw binary bytes to the active storage backend.

        Args:
            content (bytes): File binary content payload.
            filename (str): Name of the file.
            content_type (str): MIME type (e.g. 'application/pdf', 'image/png').
            folder (str): Target subfolder name.

        Returns:
            dict: File metadata including public/download URL, storage key, size, and backend type.
        """
        key = self._make_key(filename, folder)

        if self.use_s3 and _s3_client:
            # Upload directly to Amazon S3 bucket
            _s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
            url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
            backend = "s3"
        else:
            # Write to local disk using non-blocking asynchronous file I/O
            dest = self.local_dir / key
            dest.parent.mkdir(parents=True, exist_ok=True)
            async with aiofiles.open(dest, "wb") as f:
                await f.write(content)
            url = f"{BASE_URL}/api/v1/files/download/{key}"
            backend = "local"

        return {
            "url": url,
            "key": key,
            "filename": filename,
            "size": len(content),
            "content_type": content_type,
            "backend": backend,
        }

    async def get_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        """
        Generates a secure, temporary pre-signed URL for direct browser downloads.

        Args:
            key (str): Storage object key.
            expires_in (int): Expiration TTL in seconds (default 3600s / 1 hour).

        Returns:
            str: Pre-signed AWS S3 URL or direct service download endpoint.
        """
        if self.use_s3 and _s3_client:
            return _s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=expires_in,
            )
        return f"{BASE_URL}/api/v1/files/download/{key}"

    async def file_exists(self, key: str) -> bool:
        """
        Checks whether an object key exists in S3 or on the local filesystem.

        Args:
            key (str): Target object key.

        Returns:
            bool: True if file exists and is accessible, False otherwise.
        """
        try:
            if self.use_s3 and _s3_client:
                _s3_client.head_object(Bucket=S3_BUCKET, Key=key)
                return True
            return (self.local_dir / key).exists()
        except Exception:
            return False

    async def delete_file(self, key: str) -> bool:
        """
        Deletes a stored file from S3 or local disk.

        Args:
            key (str): Object key to delete.

        Returns:
            bool: True on successful deletion, False on failure.
        """
        try:
            if self.use_s3 and _s3_client:
                _s3_client.delete_object(Bucket=S3_BUCKET, Key=key)
            else:
                path = self.local_dir / key
                if path.exists():
                    path.unlink()
            return True
        except Exception:
            return False

    async def get_file_info(self, key: str) -> dict:
        """
        Inspects file metadata including file size, MIME type, and last modification timestamp.

        Args:
            key (str): Object key.

        Returns:
            dict: File metadata attributes, or empty dictionary if not found.
        """
        if self.use_s3 and _s3_client:
            try:
                obj = _s3_client.head_object(Bucket=S3_BUCKET, Key=key)
                return {
                    "key": key,
                    "size": obj["ContentLength"],
                    "content_type": obj.get("ContentType", "application/octet-stream"),
                    "last_modified": obj["LastModified"].isoformat(),
                    "backend": "s3",
                }
            except Exception:
                return {}
        else:
            path = self.local_dir / key
            if path.exists():
                stat = path.stat()
                return {
                    "key": key,
                    "size": stat.st_size,
                    "content_type": "application/octet-stream",
                    "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "backend": "local",
                    "url": f"{BASE_URL}/api/v1/files/download/{key}",
                }
            return {}

    def list_local_files(self, folder: Optional[str] = None, limit: int = 50) -> List[dict]:
        """
        Lists files stored on local disk sorted in reverse chronological order.

        Args:
            folder (str, optional): Target subfolder filter.
            limit (int): Maximum records to return.

        Returns:
            List[dict]: Summaries of locally persisted files.
        """
        if self.use_s3:
            return []
        base = self.local_dir / folder if folder else self.local_dir
        if not base.exists():
            return []
        files = []
        for f in sorted(base.rglob("*"), key=lambda x: -x.stat().st_mtime):
            if f.is_file():
                rel = f.relative_to(self.local_dir)
                files.append({
                    "key": str(rel).replace("\\", "/"),
                    "url": f"{BASE_URL}/api/v1/files/download/{str(rel).replace(chr(92), '/')}",
                    "size": f.stat().st_size,
                    "filename": f.name,
                    "last_modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                })
                if len(files) >= limit:
                    break
        return files


# Global singleton instance of the unified storage manager
storage = StorageManager()
