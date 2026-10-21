"""
Dialogue Turns and Session Pause/Resume Router.
==============================================
Manages chronological conversation turns between candidate and AI interviewer,
as well as pausing and resuming interviews with a 30-minute grace window.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from app.models import (
    TurnResponse, CreateTurnRequest, SessionResponse,
    InterviewType, Difficulty, InterviewStatus,
    validate_state_transition, validate_pause_window,
)
from app.routers.deps import (
    get_db,
    get_redis_lock,
    get_current_user,
    get_session_cached,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.get("/{session_id}/turns", response_model=list[TurnResponse])
async def get_turns(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves the chronological conversation dialogue transcript for a session.
    """
    db = get_db()
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
    
    turns = await db.get_conversation_turns(session_id)
    
    return [
        TurnResponse(
            id=str(t["id"]),
            session_id=str(t["session_id"]),
            role=t["role"],
            content=t["content"],
            turn_number=t["turn_number"],
            created_at=t["created_at"]
        )
        for t in turns
    ]


@router.post("/{session_id}/turns", response_model=TurnResponse, status_code=status.HTTP_201_CREATED)
async def create_turn(
    session_id: str,
    turn_data: CreateTurnRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Appends a new dialogue turn (interviewer question or candidate answer) to the session transcript.
    """
    db = get_db()
    session = await get_session_cached(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    existing_turns = await db.get_conversation_turns(session_id)
    turn_number = len(existing_turns) + 1

    turn = await db.create_conversation_turn(
        session_id=session_id,
        role=turn_data.role,
        content=turn_data.content,
        turn_number=turn_number,
    )

    return TurnResponse(
        id=str(turn["id"]),
        session_id=str(turn["session_id"]),
        role=turn["role"],
        content=turn["content"],
        turn_number=turn["turn_number"],
        created_at=turn["created_at"],
    )


@router.post("/{session_id}/pause", response_model=SessionResponse)
async def pause_session(
    session_id: str,
    elapsed_seconds: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """
    SESS-04: Pauses an active interview session with a 30-minute grace window.
    
    Persists elapsed timer seconds in database and stamps `paused_at`.
    """
    db = get_db()
    redis_lock = get_redis_lock()
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
    
    current_status = InterviewStatus(session["status"])
    new_status = InterviewStatus.PAUSED
    if not validate_state_transition(current_status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {current_status.value} to {new_status.value}"
        )
    
    updated_session = await db.pause_session(session_id, elapsed_seconds=elapsed_seconds)
    await redis_lock.invalidate_cache(f"session:{session_id}")
    
    return SessionResponse(
        id=str(updated_session["id"]),
        user_id=str(updated_session["user_id"]),
        interview_type=InterviewType(updated_session["interview_type"]),
        difficulty=Difficulty(updated_session["difficulty"]),
        target_company=updated_session.get("target_company"),
        focus_area=updated_session.get("focus_area"),
        duration_minutes=updated_session["duration_minutes"],
        status=InterviewStatus(updated_session["status"]),
        created_at=updated_session["created_at"],
        updated_at=updated_session["updated_at"],
        started_at=updated_session.get("started_at"),
        completed_at=updated_session.get("completed_at"),
        elapsed_seconds=updated_session.get("elapsed_seconds", 0),
        tab_switch_count=updated_session.get("tab_switch_count", 0),
        paste_count=updated_session.get("paste_count", 0)
    )


@router.post("/{session_id}/resume", response_model=SessionResponse)
async def resume_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    SESS-04: Resumes a paused session within the 30-minute window.
    
    Re-validates that elapsed break time did not exceed 30 minutes, restores status
    to 'in_progress', and clears `paused_at`.
    """
    db = get_db()
    redis_lock = get_redis_lock()
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
    
    current_status = InterviewStatus(session["status"])
    new_status = InterviewStatus.IN_PROGRESS
    if not validate_state_transition(current_status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {current_status.value} to {new_status.value}"
        )
    
    # Enforce 30-minute break deadline
    paused_at = session.get("paused_at")
    if paused_at and not validate_pause_window(paused_at):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Session pause window has expired (30 minutes). Please start a new interview."
        )
    
    updated_session = await db.resume_session(session_id)
    await redis_lock.invalidate_cache(f"session:{session_id}")
    
    return SessionResponse(
        id=str(updated_session["id"]),
        user_id=str(updated_session["user_id"]),
        interview_type=InterviewType(updated_session["interview_type"]),
        difficulty=Difficulty(updated_session["difficulty"]),
        target_company=updated_session.get("target_company"),
        focus_area=updated_session.get("focus_area"),
        duration_minutes=updated_session["duration_minutes"],
        status=InterviewStatus(updated_session["status"]),
        created_at=updated_session["created_at"],
        updated_at=updated_session["updated_at"],
        started_at=updated_session.get("started_at"),
        completed_at=updated_session.get("completed_at"),
        elapsed_seconds=updated_session.get("elapsed_seconds", 0),
        tab_switch_count=updated_session.get("tab_switch_count", 0),
        paste_count=updated_session.get("paste_count", 0)
    )
