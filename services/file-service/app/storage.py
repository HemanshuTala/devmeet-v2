"""
File Storage Manager
Supports AWS S3 (when credentials provided) or local disk fallback.
"""
import os
import uuid
import aiofiles
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List

LOCAL_DIR = Path(os.getenv("LOCAL_UPLOAD_DIR", "uploads"))
BASE_URL = os.getenv("BASE_URL", "http://localhost:8011")
S3_BUCKET = os.getenv("S3_BUCKET", "")
AWS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

_use_s3 = bool(AWS_KEY and AWS_SECRET and S3_BUCKET)

_s3_client = None
if _use_s3:
    try:
        import boto3
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
    def __init__(self):
        self.use_s3 = _use_s3
        self.local_dir = LOCAL_DIR
        self.local_dir.mkdir(parents=True, exist_ok=True)

    def _make_key(self, filename: str, folder: str = "uploads") -> str:
        safe = filename.replace(" ", "_").replace("/", "_")
        return f"{folder}/{uuid.uuid4().hex}_{safe}"

    async def upload_file(
        self,
        content: bytes,
        filename: str,
        content_type: str,
        folder: str = "uploads",
    ) -> dict:
        key = self._make_key(filename, folder)

        if self.use_s3 and _s3_client:
            _s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
            url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
            backend = "s3"
        else:
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
        if self.use_s3 and _s3_client:
            return _s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=expires_in,
            )
        return f"{BASE_URL}/api/v1/files/download/{key}"

    async def file_exists(self, key: str) -> bool:
        try:
            if self.use_s3 and _s3_client:
                _s3_client.head_object(Bucket=S3_BUCKET, Key=key)
                return True
            return (self.local_dir / key).exists()
        except Exception:
            return False

    async def delete_file(self, key: str) -> bool:
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


storage = StorageManager()
