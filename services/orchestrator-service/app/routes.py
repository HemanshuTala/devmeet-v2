"""
Interview Orchestrator API Endpoints and Session Lifecycle Handlers.
=====================================================================
Prefix: `/api/v1/sessions`
This module defines the RESTful routes governing the full end-to-end interview lifecycle:
- Session Creation with parallel quota verification and problem seeding (`asyncio.gather`).
- Finite State Machine state transitions (`start`, `pause`, `resume`, `complete`, `cancel`).
- Distributed concurrency locks via Redis (`lock:session:<user_id>`).
- Dialogue turns transcription (`get_turns`, `create_turn`).
- Code submission persistence during live coding exercises.
- Proctoring telemetry ingestion (tab-switching, clipboard pasting).
- Client heartbeat pings with 30-minute auto-expiry on paused sessions and 90s disconnection cleanup.
- AWS S3 backup snapshot exports, downloads, and presigned URLs.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import asyncio
import httpx
import os
import json
from datetime import datetime
from typing import Optional
from .models import (
    CreateSessionRequest, SessionResponse, TurnResponse, CreateTurnRequest,
    InterviewType, Difficulty, InterviewStatus, CodeSubmission,
    validate_state_transition, validate_pause_window, validate_cheating_threshold
)
from .database import db
from .redis_client import redis_lock
from .s3_service import s3_service
from .idempotency import check_idempotency
from .outbox import emit_event
from .clients import (
    get_http_client,
    _get_http_client,
    fetch_seed_question,
    verify_token,
    check_quota,
    AUTH_SERVICE_URL,
    USER_SERVICE_URL,
    SEARCH_SERVICE_URL,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])
security = HTTPBearer()

AI_INTERVIEWER_URL = os.getenv("AI_INTERVIEWER_URL", "http://localhost:8004")


async def assert_no_active_session(user_id: str) -> None:
    """
    SESS-07: Verifies that candidate does not already have an unfinished interview session.

    Execution:
    1. Checks Redis key `user:<user_id>:active_session` for instant memory-speed rejection.
    2. Falls back to PostgreSQL checking for rows in 'created', 'in_progress', or 'paused'.
    
    Raises:
        HTTPException(409 Conflict): If another active session exists.
    """
    cached_id = await redis_lock.get_user_active_session(user_id)
    if cached_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CONCURRENT_SESSION",
                "message": "You already have an active interview session.",
                "active_session_id": cached_id,
            },
        )

    active = await db.get_user_active_session(user_id)
    if active:
        # Repopulate Redis cache for future checks
        await redis_lock.set_user_active_session(user_id, str(active["id"]))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CONCURRENT_SESSION",
                "message": "You already have an active interview session.",
                "active_session_id": str(active["id"]),
            },
        )


async def clear_active_session_for_user(user_id: str, session_id: str) -> None:
    """
    Evicts the active session reference from Redis when an interview completes or cancels.
    """
    cached_id = await redis_lock.get_user_active_session(user_id)
    if cached_id == session_id or cached_id is None:
        await redis_lock.clear_user_active_session(user_id)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency validating incoming Bearer token against Auth Service.
    """
    token = credentials.credentials
    user = await verify_token(token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return user


async def get_token_from_credentials(credentials: HTTPAuthorizationCredentials) -> str:
    """Helper extracting raw JWT token string."""
    return credentials.credentials


async def get_session_cached(session_id: str) -> Optional[dict]:
    """
    SESS-03: Fetches session metadata from Redis cache with a 4-hour TTL,
    falling back to PostgreSQL if cache misses.
    """
    cache_key = f"session:{session_id}"
    cached = await redis_lock.get_cache(cache_key)
    if cached:
        try:
            data = json.loads(cached)
            # Reconstruct datetime objects from ISO strings
            for k in ["created_at", "updated_at", "started_at", "completed_at", "paused_at"]:
                if data.get(k):
                    data[k] = datetime.fromisoformat(data[k])
            return data
        except Exception:
            pass

    session = await db.get_session(session_id)
    if session:
        try:
            serialized = {}
            for k, v in session.items():
                if isinstance(v, datetime):
                    serialized[k] = v.isoformat()
                else:
                    serialized[k] = v
            await redis_lock.set_cache(cache_key, json.dumps(serialized), 14400)
        except Exception:
            pass
    return session


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    request: Request,
    session_data: CreateSessionRequest,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Provisions a new interview session.

    Execution Pipeline:
    1. Idempotency Check: Returns cached response if Idempotency-Key was already executed.
    2. Distributed Lock: Acquires Redis lock on `current_user['id']` to prevent race conditions.
    3. Parallel Validation (`asyncio.gather`):
       - User Service: Deducts 1 interview quota credit.
       - Active Session Check: Rejects concurrent interviews.
       - Search Service: Fetches random seed problem matching role/difficulty.
    4. Database Insertion: Inserts row in `sessions` table in `created` status.
    5. Cache & Idempotency Storage: Sets active session in Redis and caches response for 24h.
    """
    # 1. Idempotency check
    idempotency = await check_idempotency(request, current_user["id"])
    if idempotency.cached:
        return JSONResponse(content=idempotency.response_body, status_code=idempotency.response_code)

    # 2. Acquire Redis lock
    async with redis_lock.acquire_lock(current_user["id"]) as lock_acquired:
        if not lock_acquired:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Another session creation is currently in progress. Please try again."
            )
        
        # 3. Parallel external calls
        token = await get_token_from_credentials(credentials)
        request_id = getattr(request.state, "request_id", None)

        focus_area = session_data.focus_area
        target_company = session_data.target_company

        quota_result, session_result, seed = await asyncio.gather(
            check_quota(current_user["id"], token, request_id),
            assert_no_active_session(current_user["id"]),
            fetch_seed_question(
                session_data.interview_type.value,
                session_data.difficulty.value,
                target_company,
                request_id=request_id,
            ),
            return_exceptions=True,
        )

        # Propagate exceptions
        if isinstance(session_result, Exception):
            raise session_result
        if isinstance(quota_result, Exception):
            raise quota_result
        if not quota_result:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Interview quota exceeded. You have used your 5 free interviews. Please upgrade to Pro for unlimited sessions."
            )
        if isinstance(seed, Exception):
            raise seed
        if seed:
            if not focus_area:
                focus_area = seed.get("title")
            if not target_company and seed.get("company_tags"):
                tags = seed["company_tags"]
                if tags:
                    target_company = tags[0]

        # 4. Insert session in PostgreSQL
        session = await db.create_session(
            user_id=current_user["id"],
            interview_type=session_data.interview_type.value,
            difficulty=session_data.difficulty.value,
            target_company=target_company,
            focus_area=focus_area,
            duration_minutes=session_data.duration_minutes,
            recording_consent=session_data.recording_consent or False
        )

        # 5. Track active session in Redis
        await redis_lock.set_user_active_session(current_user["id"], str(session["id"]))

        response_data = SessionResponse(
            id=str(session["id"]),
            user_id=str(session["user_id"]),
            interview_type=InterviewType(session["interview_type"]),
            difficulty=Difficulty(session["difficulty"]),
            target_company=session.get("target_company"),
            focus_area=session.get("focus_area"),
            duration_minutes=session["duration_minutes"],
            status=InterviewStatus(session["status"]),
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            started_at=session.get("started_at"),
            completed_at=session.get("completed_at"),
            elapsed_seconds=session.get("elapsed_seconds", 0),
            tab_switch_count=session.get("tab_switch_count", 0),
            paste_count=session.get("paste_count", 0),
            recording_consent=session.get("recording_consent", False)
        )

        # 6. Store idempotency response
        await idempotency.store(201, response_data.model_dump(mode="json"))
        return response_data


@router.get("", response_model=list[SessionResponse])
async def get_sessions(current_user: dict = Depends(get_current_user)):
    """
    Retrieves candidate's interview session history.
    """
    sessions = await db.get_user_sessions(current_user["id"])
    
    return [
        SessionResponse(
            id=str(s["id"]),
            user_id=str(s["user_id"]),
            interview_type=InterviewType(s["interview_type"]),
            difficulty=Difficulty(s["difficulty"]),
            target_company=s.get("target_company"),
            focus_area=s.get("focus_area"),
            duration_minutes=s["duration_minutes"],
            status=InterviewStatus(s["status"]),
            created_at=s["created_at"],
            updated_at=s["updated_at"],
            started_at=s.get("started_at"),
            completed_at=s.get("completed_at"),
            elapsed_seconds=s.get("elapsed_seconds", 0),
            tab_switch_count=s.get("tab_switch_count", 0),
            paste_count=s.get("paste_count", 0)
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves full details of a specific interview session.
    """
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
    
    return SessionResponse(
        id=str(session["id"]),
        user_id=str(session["user_id"]),
        interview_type=InterviewType(session["interview_type"]),
        difficulty=Difficulty(session["difficulty"]),
        target_company=session.get("target_company"),
        focus_area=session.get("focus_area"),
        duration_minutes=session["duration_minutes"],
        status=InterviewStatus(session["status"]),
        created_at=session["created_at"],
        updated_at=session["updated_at"],
        started_at=session.get("started_at"),
        completed_at=session.get("completed_at"),
        elapsed_seconds=session.get("elapsed_seconds", 0),
        tab_switch_count=session.get("tab_switch_count", 0),
        paste_count=session.get("paste_count", 0)
    )


@router.post("/{session_id}/start", response_model=SessionResponse)
async def start_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Transitions interview session from 'created' to 'in_progress'.
    
    Validates state transition against FSM graph, stamps `started_at = NOW()`,
    invalidates stale Redis cache, and sets active session tracking.
    """
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
    
    # Validate FSM transition
    current_status = InterviewStatus(session["status"])
    new_status = InterviewStatus.IN_PROGRESS
    if not validate_state_transition(current_status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {current_status.value} to {new_status.value}"
        )
    
    updated_session = await db.update_session_status(session_id, "in_progress")
    await redis_lock.invalidate_cache(f"session:{session_id}")
    await redis_lock.set_user_active_session(str(updated_session["user_id"]), session_id)

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


@router.post("/{session_id}/complete", response_model=SessionResponse)
async def complete_session(
    session_id: str,
    request: Request,
    elapsed_seconds: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Terminates the interview session in 'completed' status and initiates feedback generation.

    Atomic Transactional Outbox Pattern:
    1. Opens database transaction.
    2. Updates status to 'completed' and stamps `completed_at = NOW()`.
    3. Emits `session.completed` outbox event inside the SAME database transaction.
    4. Clears active session in Redis.
    5. Dispatches background task to snapshot session to S3.
    """
    # Idempotency check
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
    
    # Validate FSM transition
    current_status = InterviewStatus(session["status"])
    new_status = InterviewStatus.COMPLETED
    if not validate_state_transition(current_status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {current_status.value} to {new_status.value}"
        )
    
    # Atomic Outbox Emission & Status Update
    try:
        async with db.pool.acquire() as conn:
            async with conn.transaction():
                update_fields = ["status = $2", "updated_at = NOW()", "completed_at = NOW()"]
                params: list = [session_id, "completed"]
                if elapsed_seconds is not None:
                    update_fields.append(f"elapsed_seconds = $3")
                    params.append(elapsed_seconds)

                row = await conn.fetchrow(
                    f"""
                    UPDATE sessions
                    SET {', '.join(update_fields)}
                    WHERE id = $1
                    RETURNING {db._SESSION_COLUMNS}
                    """,
                    *params,
                )
                updated_session = dict(row)

                # Emit transactional outbox event
                await emit_event(
                    conn,
                    event_type="session.completed",
                    aggregate_type="session",
                    aggregate_id=session_id,
                    payload={
                        "session_id": session_id,
                        "user_id": current_user["id"],
                        "interview_type": updated_session.get("interview_type"),
                        "difficulty": updated_session.get("difficulty"),
                        "language": updated_session.get("language", "python"),
                        "target_company": updated_session.get("target_company"),
                    },
                )
    except Exception as e:
        import logging
        logging.getLogger("routes").error("Failed to complete session atomically: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete session. Please try again."
        )

    await redis_lock.invalidate_cache(f"session:{session_id}")
    await clear_active_session_for_user(str(updated_session["user_id"]), session_id)

    # Trigger background archival snapshot upload to AWS S3
    if s3_service.is_available():
        background_tasks.add_task(
            _upload_session_snapshot_to_s3,
            session_id,
            updated_session
        )

    response_data = SessionResponse(
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

    await idempotency.store(200, response_data.model_dump(mode="json"))
    return response_data


@router.get("/{session_id}/turns", response_model=list[TurnResponse])
async def get_turns(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves the chronological conversation dialogue transcript for a session.
    """
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


class CheatingReportRequest(BaseModel):
    """Schema for reporting proctoring violations."""
    type: str  # "tab_switch" or "paste"


@router.post("/{session_id}/cheating", response_model=SessionResponse)
async def report_cheating(
    session_id: str,
    payload: CheatingReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Logs an anti-cheating violation (browser tab unfocused or external text pasted).
    """
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


# ─── Recording Consent (VID-05) ───────────────────────────────────────────────

class RecordingConsentRequest(BaseModel):
    consent: bool

@router.post("/{session_id}/consent", response_model=SessionResponse)
async def update_recording_consent(
    session_id: str,
    payload: RecordingConsentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    VID-05: Updates candidate's consent flag for video/audio recording.
    """
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


# ─── Heartbeat (SESS-05, SESS-06) ─────────────────────────────────────────────

@router.post("/{session_id}/heartbeat")
async def session_heartbeat(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    SESS-05: Ingests client heartbeats sent every 30 seconds.
    
    Automatic Recovery & Stale Session Garbage Collection:
    1. If session is paused > 30 minutes: auto-completes the session per SESS-04.
    2. If no heartbeat received in > 90 seconds (3 missed heartbeats): auto-cancels abandoned session.
    """
    from datetime import datetime, timezone, timedelta

    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    current_status = session.get("status")

    # 1. Auto-complete paused sessions exceeding 30-minute threshold
    if current_status == "paused" and session.get("paused_at"):
        paused_at = session["paused_at"]
        if hasattr(paused_at, "tzinfo") and paused_at.tzinfo is None:
            paused_at = paused_at.replace(tzinfo=timezone.utc)
        pause_duration = (datetime.now(timezone.utc) - paused_at).total_seconds()
        if pause_duration > 30 * 60:
            await db.update_session_status(session_id, "completed")
            await redis_lock.invalidate_cache(f"session:{session_id}")
            return {
                "session_id": session_id,
                "status": "completed",
                "message": "Session auto-completed: exceeded 30-minute pause limit",
                "auto_completed": True,
            }

    if current_status in ("completed", "cancelled"):
        return {"session_id": session_id, "status": current_status, "active": False}

    # 2. Auto-cancel stale sessions abandoned for > 90 seconds
    last_heartbeat = session.get("last_heartbeat_at")
    if last_heartbeat:
        if hasattr(last_heartbeat, "tzinfo") and last_heartbeat.tzinfo is None:
            last_heartbeat = last_heartbeat.replace(tzinfo=timezone.utc)
        heartbeat_age = (datetime.now(timezone.utc) - last_heartbeat).total_seconds()
        if heartbeat_age > 90:
            await db.update_session_status(session_id, "cancelled")
            await redis_lock.invalidate_cache(f"session:{session_id}")
            return {
                "session_id": session_id,
                "status": "cancelled",
                "message": "Session auto-cancelled: heartbeat timeout exceeded (90s)",
                "auto_cancelled": True,
            }

    # Record heartbeat timestamp
    await db.record_heartbeat(session_id)
    return {
        "session_id": session_id,
        "status": current_status,
        "active": True,
        "heartbeat_at": datetime.now(timezone.utc).isoformat(),
        "reconnect_window": 30,
    }


# ─── Cancel Session ────────────────────────────────────────────────────────────

@router.post("/{session_id}/cancel")
async def cancel_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Aborts an active session prior to completion.
    """
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if session.get("status") in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Session already in terminal state: {session.get('status')}",
        )

    await db.update_session_status(session_id, "cancelled")
    await redis_lock.invalidate_cache(f"session:{session_id}")
    await clear_active_session_for_user(str(session["user_id"]), session_id)
    return {"session_id": session_id, "status": "cancelled", "message": "Session cancelled."}


# ─── SESS-08: S3 Snapshot Management ─────────────────────────────────────────────

async def _upload_session_snapshot_to_s3(session_id: str, session_data: dict):
    """
    Helper function executing in background task to serialize and upload snapshot archive to S3.
    """
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
        print(f"Failed to upload session snapshot to S3: {e}")


@router.get("/{session_id}/snapshots")
async def list_session_snapshots(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Lists all available S3 backup snapshots for a session.
    """
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


@router.get("/{session_id}/turns", response_model=list[TurnResponse])
async def get_turns(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
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
    """Persist a conversation turn for session transcript replay."""
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
    SESS-04: Pause a session with a 30-minute window before auto-expiry.
    Accepts elapsed_seconds query param to persist the timer value.
    """
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
    
    # SESS-02: Validate state transition
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
    SESS-04: Resume a paused session within the 30-minute window.
    Returns elapsed_seconds from DB so frontend can restore the timer.
    """
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
    
    # SESS-02: Validate state transition
    current_status = InterviewStatus(session["status"])
    new_status = InterviewStatus.IN_PROGRESS
    if not validate_state_transition(current_status, new_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition from {current_status.value} to {new_status.value}"
        )
    
    # Validate pause window - session must be resumed within 30 minutes
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


@router.post("/{session_id}/code", response_model=CodeSubmission)
async def submit_code(
    session_id: str,
    request: Request,
    code_data: CodeSubmission,
    current_user: dict = Depends(get_current_user)
):
    # Idempotency: return cached response on retry
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


class CheatingReportRequest(BaseModel):
    type: str  # "tab_switch" or "paste"


@router.post("/{session_id}/cheating", response_model=SessionResponse)
async def report_cheating(
    session_id: str,
    payload: CheatingReportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Log a cheating violation (tab switch or copy-paste) for the session.
    """
    session = await get_session_cached(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        
    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        
    if payload.type not in ("tab_switch", "paste"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid violation type")
        
    await db.increment_cheating_count(session_id, payload.type)
    await redis_lock.invalidate_cache(f"session:{session_id}")
    
    # Reload session from PostgreSQL to get all fresh values
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


# ─── Recording Consent (VID-05) ───────────────────────────────────────────────

class RecordingConsentRequest(BaseModel):
    consent: bool

@router.post("/{session_id}/consent", response_model=SessionResponse)
async def update_recording_consent(
    session_id: str,
    payload: RecordingConsentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    VID-05: Store user's explicit recording consent for this session.
    Only Pro/Enterprise users can enable recording.
    """
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


# ─── Heartbeat (SESS-05, SESS-06) ─────────────────────────────────────────────

@router.post("/{session_id}/heartbeat")
async def session_heartbeat(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    SESS-05: Client sends a heartbeat every 30 seconds while session is active.
    Implements graceful session recovery with 30s reconnect window.
    If the session is in 'paused' state and has been paused > 30 minutes,
    it is automatically completed per SESS-04.
    """
    from datetime import datetime, timezone, timedelta

    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    current_status = session.get("status")

    # Auto-expire paused sessions older than 30 minutes (SESS-04)
    if current_status == "paused" and session.get("paused_at"):
        paused_at = session["paused_at"]
        if hasattr(paused_at, "tzinfo") and paused_at.tzinfo is None:
            paused_at = paused_at.replace(tzinfo=timezone.utc)
        pause_duration = (datetime.now(timezone.utc) - paused_at).total_seconds()
        if pause_duration > 30 * 60:  # 30 minutes
            await db.update_session_status(session_id, "completed")
            await redis_lock.invalidate_cache(f"session:{session_id}")
            return {
                "session_id": session_id,
                "status": "completed",
                "message": "Session auto-completed: exceeded 30-minute pause limit",
                "auto_completed": True,
            }

    if current_status in ("completed", "cancelled"):
        return {"session_id": session_id, "status": current_status, "active": False}

    # SESS-05: Check last heartbeat for graceful recovery (allow 90s before stale auto-cancel)
    last_heartbeat = session.get("last_heartbeat_at")
    if last_heartbeat:
        if hasattr(last_heartbeat, "tzinfo") and last_heartbeat.tzinfo is None:
            last_heartbeat = last_heartbeat.replace(tzinfo=timezone.utc)
        heartbeat_age = (datetime.now(timezone.utc) - last_heartbeat).total_seconds()
        if heartbeat_age > 90:  # Allow up to 90 seconds (3 missed heartbeats) before stale auto-cancel
            # Session considered stale, auto-cancel
            await db.update_session_status(session_id, "cancelled")
            await redis_lock.invalidate_cache(f"session:{session_id}")
            return {
                "session_id": session_id,
                "status": "cancelled",
                "message": "Session auto-cancelled: heartbeat timeout exceeded (90s)",
                "auto_cancelled": True,
            }

    # Record heartbeat timestamp
    await db.record_heartbeat(session_id)
    return {
        "session_id": session_id,
        "status": current_status,
        "active": True,
        "heartbeat_at": datetime.now(timezone.utc).isoformat(),
        "reconnect_window": 30,  # SESS-05: 30s reconnect window
    }


# ─── Cancel ───────────────────────────────────────────────────────────────────

@router.post("/{session_id}/cancel")
async def cancel_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Cancel an active session before it completes."""
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if str(session["user_id"]) != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if session.get("status") in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Session already in terminal state: {session.get('status')}",
        )

    await db.update_session_status(session_id, "cancelled")
    await redis_lock.invalidate_cache(f"session:{session_id}")
    await clear_active_session_for_user(str(session["user_id"]), session_id)
    return {"session_id": session_id, "status": "cancelled", "message": "Session cancelled."}


# ─── SESS-08: S3 Snapshot Management ─────────────────────────────────────────────

async def _upload_session_snapshot_to_s3(session_id: str, session_data: dict):
    """Helper function to upload session snapshot to S3."""
    try:
        # Get conversation turns and code submissions
        conversation_turns = await db.get_conversation_turns(session_id)
        code_submissions = await db.get_code_submissions(session_id)
        
        # Upload to S3
        s3_key = await s3_service.upload_session_snapshot(
            session_id=session_id,
            session_data=session_data,
            conversation_turns=conversation_turns,
            code_submissions=code_submissions
        )
        
        if s3_key:
            # Record the S3 key in the database
            await db.record_s3_snapshot(session_id, s3_key)
    except Exception as e:
        print(f"Failed to upload session snapshot to S3: {e}")


@router.get("/{session_id}/snapshots")
async def list_session_snapshots(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List all available S3 snapshots for a session."""
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
    """Restore a session from an S3 snapshot."""
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

    # Download snapshot from S3
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
    """Generate a presigned URL for downloading a snapshot."""
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
