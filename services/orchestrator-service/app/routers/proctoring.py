"""
Proctoring, Code Submissions, and Telemetry Router.
==================================================
Manages candidate code submission snapshots, anti-cheating telemetry ingestion
(tab switching, clipboard pasting), and recording consent updates.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.models import CodeSubmission, SessionResponse, InterviewType, Difficulty, InterviewStatus
from app.idempotency import check_idempotency
from app.routers.deps import (
    get_db,
    get_redis_lock,
    get_current_user,
    get_session_cached,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


class CheatingReportRequest(BaseModel):
    """Schema for reporting proctoring violations."""
    type: str  # "tab_switch" or "paste"


class RecordingConsentRequest(BaseModel):
    """Schema for recording consent updates."""
    consent: bool


@router.post("/{session_id}/code", response_model=CodeSubmission)
async def submit_code(
    session_id: str,
    request: Request,
    code_data: CodeSubmission,
    current_user: dict = Depends(get_current_user)
):
    """
    Saves a code submission snapshot for candidate code runs.
    """
    db = get_db()
    idempotency = await check_idempotency(request, current_user["id"])
    if idempotency.cached:
        return JSONResponse(content=idempotency.response_body, status_code=idempotency.response_code)

    session = await get_session_cached(session_id)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    submission = await db.create_code_submission(
        session_id=session_id,
        language=code_data.language,
        code=code_data.code
    )

    response_data = CodeSubmission(
        session_id=str(submission["session_id"]),
        language=submission["language"],
        code=submission["code"]
    )

    await idempotency.store(200, response_data.model_dump(mode="json"))
    return response_data


@router.post("/{session_id}/cheating", response_model=SessionResponse)
async def report_cheating(
    session_id: str,
    payload: CheatingReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Logs an anti-cheating violation (browser tab unfocused or external text pasted).
    """
    db = get_db()
    redis_lock = get_redis_lock()
    session = await get_session_cached(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        
    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        
    if payload.type not in ("tab_switch", "paste"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid violation type")
        
    await db.increment_cheating_count(session_id, payload.type)
    await redis_lock.invalidate_cache(f"session:{session_id}")
    
    fresh_session = await db.get_session(session_id)
    
    return SessionResponse(
        id=str(fresh_session["id"]),
        user_id=str(fresh_session["user_id"]),
        interview_type=InterviewType(fresh_session["interview_type"]),
        difficulty=Difficulty(fresh_session["difficulty"]),
        target_company=fresh_session.get("target_company"),
        focus_area=fresh_session.get("focus_area"),
        duration_minutes=fresh_session["duration_minutes"],
        status=InterviewStatus(fresh_session["status"]),
        created_at=fresh_session["created_at"],
        updated_at=fresh_session["updated_at"],
        started_at=fresh_session.get("started_at"),
        completed_at=fresh_session.get("completed_at"),
        elapsed_seconds=fresh_session.get("elapsed_seconds", 0),
        tab_switch_count=fresh_session.get("tab_switch_count", 0),
        paste_count=fresh_session.get("paste_count", 0),
        recording_consent=fresh_session.get("recording_consent", False)
    )


@router.post("/{session_id}/consent", response_model=SessionResponse)
async def update_recording_consent(
    session_id: str,
    payload: RecordingConsentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    VID-05: Updates candidate's consent flag for video/audio recording.
    """
    db = get_db()
    session = await get_session_cached(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    updated = await db.update_recording_consent(session_id, payload.consent)
    return SessionResponse(
        id=str(updated["id"]),
        user_id=str(updated["user_id"]),
        interview_type=InterviewType(updated["interview_type"]),
        difficulty=Difficulty(updated["difficulty"]),
        target_company=updated.get("target_company"),
        focus_area=updated.get("focus_area"),
        duration_minutes=updated["duration_minutes"],
        status=InterviewStatus(updated["status"]),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"],
        started_at=updated.get("started_at"),
        completed_at=updated.get("completed_at"),
        elapsed_seconds=updated.get("elapsed_seconds", 0),
        tab_switch_count=updated.get("tab_switch_count", 0),
        paste_count=updated.get("paste_count", 0),
        recording_consent=updated.get("recording_consent", False)
    )
