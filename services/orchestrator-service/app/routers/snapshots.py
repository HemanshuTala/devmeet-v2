"""
S3 Snapshot Archival and Disaster Recovery Router.
==================================================
Manages creation, listing, reconstruction, and presigned download URL generation
for S3 session backup snapshots.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends, status
from app.s3_service import s3_service
from app.routers.deps import get_db, get_current_user

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])
logger = logging.getLogger("orchestrator.snapshots")


async def _upload_session_snapshot_to_s3(session_id: str, session_data: dict):
    """
    Helper function executing in background task to serialize and upload snapshot archive to S3.
    """
    db = get_db()
    try:
        conversation_turns = await db.get_conversation_turns(session_id)
        code_submissions = await db.get_code_submissions(session_id)
        
        s3_key = await s3_service.upload_session_snapshot(
            session_id=session_id,
            session_data=session_data,
            conversation_turns=conversation_turns,
            code_submissions=code_submissions
        )
        
        if s3_key:
            await db.record_s3_snapshot(session_id, s3_key)
    except Exception as e:
        logger.error("Failed to upload session snapshot to S3: %s", e)


@router.get("/{session_id}/snapshots")
async def list_session_snapshots(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Lists all available S3 backup snapshots for a session.
    """
    db = get_db()
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not s3_service.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 service is not available"
        )

    snapshots = await s3_service.list_session_snapshots(session_id)
    return {
        "session_id": session_id,
        "snapshots": snapshots,
        "count": len(snapshots)
    }


@router.post("/{session_id}/restore")
async def restore_session_from_snapshot(
    session_id: str,
    snapshot_key: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Downloads and reconstructs session state from an S3 backup snapshot.
    """
    db = get_db()
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not s3_service.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 service is not available"
        )

    snapshot = await s3_service.download_session_snapshot(session_id, snapshot_key)
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found"
        )

    return {
        "session_id": session_id,
        "snapshot": snapshot,
        "message": "Session snapshot retrieved successfully"
    }


@router.get("/{session_id}/snapshots/{snapshot_key}/download-url")
async def get_snapshot_download_url(
    session_id: str,
    snapshot_key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Generates a secure presigned URL for downloading a session snapshot.
    """
    db = get_db()
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not s3_service.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 service is not available"
        )

    url = await s3_service.generate_presigned_url(snapshot_key, expiration_seconds=3600)
    if not url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate download URL"
        )

    return {
        "download_url": url,
        "expires_in": 3600
    }
