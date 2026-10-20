"""
DevMeet File & Object Storage Service - REST API Endpoints
==========================================================
This module provides centralized, secure object storage for candidate resumes, avatars,
interview evaluation PDF reports, audio recordings, and code execution snapshots.

Key Architectural Responsibilities:
1. Multi-Part & Raw Byte Upload Pipelines:
   - `/upload`: Accepts standard multipart form data uploads from web clients with
     strict MIME type whitelisting and 50MB file size limits.
   - `/upload-bytes`: Dedicated internal microservice ingestion endpoint (used by `code-execution`
     and `feedback-service`) for streaming raw binary payloads.
2. Dual Storage Engine (AWS S3 + Local Disk Fallback):
   - Uses AWS S3 via `boto3` when valid AWS credentials exist.
   - Automatically falls back to local disk storage (`uploads/`) for offline/local development.
3. Secure Download & Presigned URL Generation:
   - `/presign/{key}`: Mints time-limited, cryptographically signed AWS S3 download URLs
     (default 7-day expiration), offloading file streaming bandwidth from application servers.
   - `/download/{key}`: Streams binary data directly in chunks (64KB) when running in local disk mode.
4. Storage Management & Metadata Inspection:
   - `/info/{key}`: Queries object metadata, content length, and MIME types.
   - `DELETE /{key}`: Deletes blobs from either S3 or local disk.
   - `/list`: Inspects locally stored files in reverse chronological order.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional
from datetime import datetime
import os
import io
from .storage import storage

# Configure FastAPI router mount point under /api/v1/files
router = APIRouter(prefix="/api/v1/files", tags=["files"])

# Strict MIME type whitelist preventing execution of malicious uploads (e.g. .exe, .html, .svg scripts)
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "text/plain", "text/csv",
    "application/json",
    "application/zip",
    "audio/webm", "audio/ogg", "audio/mp4",
    "video/webm", "video/mp4",
    "application/octet-stream",
}

# Maximum allowed file upload size: 50 Megabytes
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    purpose: Optional[str] = Form("other"),
    folder: Optional[str] = Form("uploads"),
):
    """
    Handles candidate multipart form uploads (resumes, profile pictures, documents).

    Validation Pipeline:
    1. Checks for non-zero file content size.
    2. Enforces maximum 50MB limit to prevent storage exhaustion or denial-of-service.
    3. Verifies MIME type against `ALLOWED_CONTENT_TYPES` whitelist.
    4. Delegates persistence to `StorageManager` (S3 or local disk).

    Args:
        file (UploadFile): Multipart file upload payload.
        purpose (str, optional): Semantic file purpose tag ('resume', 'avatar', 'report').
        folder (str, optional): Target logical folder prefix in storage.

    Returns:
        dict: Upload result including accessible URL, storage key, file size, and backend type.

    Raises:
        HTTPException(400): If file content is empty.
        HTTPException(413): If file exceeds 50MB.
        HTTPException(415): If MIME type is unsupported.
        HTTPException(500): If backend storage write fails.
    """
    # Read binary bytes into memory
    content = await file.read()

    # Reject empty files
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Enforce 50MB ceiling
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")

    # Inspect and validate content type against security whitelist
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {content_type}")

    try:
        # Write to active storage backend
        res = await storage.upload_file(
            content=content,
            filename=file.filename or "unnamed",
            content_type=content_type,
            folder=folder,
        )
        return {
            "url": res["url"],
            "key": res["key"],
            "filename": res["filename"],
            "size": len(content),
            "content_type": content_type,
            "purpose": purpose,
            "storage_backend": res.get("backend", "local"),
            "created_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload-bytes")
async def upload_bytes(
    request: Request,
    filename: str = Query(...),
    content_type: str = Query(default="application/octet-stream"),
    folder: str = Query(default="uploads"),
):
    """
    Internal inter-service endpoint for streaming raw byte buffers directly to storage.
    Used by `code-execution-service` (code snapshots) and `feedback-service` (PDF reports).

    Args:
        request (Request): Raw HTTP request whose body contains binary bytes.
        filename (str): Name of destination file.
        content_type (str): MIME type of the payload.
        folder (str): Target subfolder.

    Returns:
        dict: Storage reference payload with URL and key.

    Raises:
        HTTPException(400): If payload body is empty.
        HTTPException(500): On storage failure.
    """
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Content is empty")
    try:
        res = await storage.upload_file(
            content=content,
            filename=filename,
            content_type=content_type,
            folder=folder,
        )
        return {
            "url": res["url"],
            "key": res["key"],
            "filename": res["filename"],
            "size": len(content),
            "content_type": content_type,
            "storage_backend": res.get("backend", "local"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/presign/{key:path}")
async def get_presigned_url(
    key: str,
    expires_in: int = Query(default=604800, ge=60, le=604800, description="TTL in seconds (default 7 days)"),
):
    """
    Generates a cryptographically signed, time-limited direct download URL.

    Security & Architecture:
    - Protects S3 buckets by keeping them private (no public read permissions).
    - Offloads high-bandwidth file streaming directly to AWS S3 CDN edges.
    - Bounded expiration TTL between 60 seconds and 7 days (604,800 seconds).

    Args:
        key (str): Path of target object key.
        expires_in (int): Expiration interval in seconds.

    Returns:
        dict: Pre-signed URL, storage key, and unix timestamp expiration.

    Raises:
        HTTPException(404): If file key does not exist.
    """
    exists = await storage.file_exists(key)
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")

    url = await storage.get_presigned_url(key, expires_in)
    return {
        "url": url,
        "key": key,
        "expires_in": expires_in,
        "expires_at": datetime.utcnow().timestamp() + expires_in,
    }


@router.get("/download/{key:path}")
async def download_file(key: str):
    """
    Directly streams file bytes from local disk storage in 64KB chunks.

    Behavior:
    - If running in S3 mode: Redirects client to `/api/v1/files/presign/{key}`.
    - If running in local disk mode: Streams file with appropriate MIME headers.

    Args:
        key (str): Storage path key.

    Returns:
        StreamingResponse: Stream of binary chunks.

    Raises:
        HTTPException(302): If operating in S3 mode (redirects to presign).
        HTTPException(404): If file not found on disk.
    """
    if storage.use_s3:
        raise HTTPException(
            status_code=302,
            detail="Use presigned URL for S3-backed files",
            headers={"Location": f"/api/v1/files/presign/{key}"},
        )

    local_path = os.path.join(storage.local_dir, key)
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Chunked iterator to stream large files without loading entire payload into RAM
    def iterfile():
        with open(local_path, "rb") as f:
            while chunk := f.read(65536):  # 64KB chunk buffer
                yield chunk

    filename = os.path.basename(local_path)
    content_type = "application/octet-stream"
    if filename.endswith(".pdf"):
        content_type = "application/pdf"
    elif filename.endswith(".png"):
        content_type = "image/png"
    elif filename.endswith(".json"):
        content_type = "application/json"

    return StreamingResponse(
        iterfile(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/info/{key:path}")
async def file_info(key: str):
    """
    Queries file existence, byte size, MIME content type, and last modification timestamp.

    Args:
        key (str): Object storage key.

    Returns:
        dict: File metadata attributes.

    Raises:
        HTTPException(404): If file does not exist.
    """
    exists = await storage.file_exists(key)
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")

    info = await storage.get_file_info(key)
    return info


@router.delete("/{key:path}")
async def delete_file(key: str):
    """
    Permanently deletes a file from S3 or local storage.

    Args:
        key (str): Object storage key to delete.

    Returns:
        dict: Confirmation payload.

    Raises:
        HTTPException(404): If file does not exist.
        HTTPException(500): If deletion fails.
    """
    exists = await storage.file_exists(key)
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")

    success = await storage.delete_file(key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete file")

    return {"deleted": True, "key": key}


@router.get("/list")
async def list_files(
    folder: Optional[str] = Query(None, description="Optional subfolder to filter"),
    limit: int = Query(50, ge=1, le=200, description="Max files to list"),
):
    """
    Lists files currently stored on local disk.

    Note:
    Only returns directory files in local disk mode; cloud S3 listing is omitted
    for security and performance.

    Args:
        folder (str, optional): Subfolder filter.
        limit (int): Pagination ceiling.

    Returns:
        dict: List of file descriptors and count.
    """
    files = storage.list_local_files(folder=folder, limit=limit)
    return {
        "files": files,
        "total": len(files),
        "storage_backend": "s3" if storage.use_s3 else "local",
    }
