"""
Session Lifecycle Endpoints Router.
===================================
Manages creation, listing, retrieval, state transitions, completion,
cancellation, and heartbeat health checks for interview sessions.
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, status, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials

from app.models import (
    CreateSessionRequest, SessionResponse, InterviewType, Difficulty,
    InterviewStatus, validate_state_transition
)
from app.idempotency import check_idempotency
from app.outbox import emit_event
from app.s3_service import s3_service
from app.routers.deps import (
    security,
    get_db,
    get_redis_lock,
    get_current_user,
    get_token_from_credentials,
    get_session_cached,
    clear_active_session_for_user,
    assert_no_active_session as default_assert_no_active,
)
from app.clients import (
    check_quota as default_check_quota,
    fetch_seed_question as default_fetch_seed,
)

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])
logger = logging.getLogger("orchestrator.sessions")


def get_check_quota_fn():
    routes_mod = sys.modules.get("app.routes")
    if routes_mod and hasattr(routes_mod, "check_quota"):
        return routes_mod.check_quota
    return default_check_quota


def get_assert_no_active_fn():
    routes_mod = sys.modules.get("app.routes")
    if routes_mod and hasattr(routes_mod, "assert_no_active_session"):
        return routes_mod.assert_no_active_session
    return default_assert_no_active


def get_fetch_seed_fn():
    routes_mod = sys.modules.get("app.routes")
    if routes_mod and hasattr(routes_mod, "fetch_seed_question"):
        return routes_mod.fetch_seed_question
    return default_fetch_seed


def _upload_snapshot_task(session_id: str, session_data: dict):
    from app.routers.snapshots import _upload_session_snapshot_to_s3
    return _upload_session_snapshot_to_s3(session_id, session_data)


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
    db = get_db()
    redis_lock = get_redis_lock()
    check_quota = get_check_quota_fn()
    assert_no_active = get_assert_no_active_fn()
    fetch_seed = get_fetch_seed_fn()

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
            assert_no_active(current_user["id"]),
            fetch_seed(
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
    db = get_db()
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
    db = get_db()
    redis_lock = get_redis_lock()

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
                    update_fields.append("elapsed_seconds = $3")
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
        logger.error("Failed to complete session atomically: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete session. Please try again."
        )

    await redis_lock.invalidate_cache(f"session:{session_id}")
    await clear_active_session_for_user(str(updated_session["user_id"]), session_id)

    # Trigger background archival snapshot upload to AWS S3
    if s3_service.is_available():
        background_tasks.add_task(
            _upload_snapshot_task,
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
    db = get_db()
    redis_lock = get_redis_lock()

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


@router.post("/{session_id}/cancel")
async def cancel_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Aborts an active session prior to completion.
    """
    db = get_db()
    redis_lock = get_redis_lock()

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
