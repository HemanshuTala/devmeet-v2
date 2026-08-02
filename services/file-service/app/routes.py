from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional
from datetime import datetime
import os
import io
from .storage import storage

router = APIRouter(prefix="/api/v1/files", tags=["files"])

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

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    purpose: Optional[str] = Form("other"),
    folder: Optional[str] = Form("uploads"),
):
    """
    Upload a file to S3 (or local disk fallback).
    Returns a URL and storage key for future access.
    """
    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds 50 MB limit")

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {content_type}")

    try:
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
    """Upload raw bytes (used internally by code-execution and feedback services)."""
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
    expires_in: int = Query(default=604800, ge=60, le=604800),
):
    """Generate a time-limited pre-signed URL for downloading a file."""
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
    Directly stream a file from local storage.
    Only works in local mode — in S3 mode, use presigned URL instead.
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

    def iterfile():
        with open(local_path, "rb") as f:
            while chunk := f.read(65536):
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
    """Check if a file exists and get metadata."""
    exists = await storage.file_exists(key)
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")

    info = await storage.get_file_info(key)
    return info


@router.delete("/{key:path}")
async def delete_file(key: str):
    """Delete a file from storage."""
    exists = await storage.file_exists(key)
    if not exists:
        raise HTTPException(status_code=404, detail="File not found")

    success = await storage.delete_file(key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete file")

    return {"deleted": True, "key": key}


@router.get("/list")
async def list_files(
    folder: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List files. Only returns results in local mode."""
    files = storage.list_local_files(folder=folder, limit=limit)
    return {
        "files": files,
        "total": len(files),
        "storage_backend": "s3" if storage.use_s3 else "local",
    }
