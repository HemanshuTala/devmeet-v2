"""
Common Dependencies and Guards for Orchestrator Service.
========================================================
Provides authentication dependencies, token verification, Redis caching helpers,
and duplicate active session validation.
"""

import json
import os
import sys
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import db as default_db
from app.redis_client import redis_lock as default_redis_lock
from app.clients import verify_token as default_verify_token

security = HTTPBearer()
AI_INTERVIEWER_URL = os.getenv("AI_INTERVIEWER_URL", "http://localhost:8004")


def get_db():
    """Returns database instance, respecting test monkeypatches on app.routes."""
    routes_mod = sys.modules.get("app.routes")
    if routes_mod and hasattr(routes_mod, "db"):
        return routes_mod.db
    return default_db


def get_redis_lock():
    """Returns Redis lock instance, respecting test monkeypatches on app.routes."""
    routes_mod = sys.modules.get("app.routes")
    if routes_mod and hasattr(routes_mod, "redis_lock"):
        return routes_mod.redis_lock
    return default_redis_lock


def get_verify_token_fn():
    """Returns verify_token function, respecting test monkeypatches on app.routes."""
    routes_mod = sys.modules.get("app.routes")
    if routes_mod and hasattr(routes_mod, "verify_token"):
        return routes_mod.verify_token
    return default_verify_token


async def assert_no_active_session(user_id: str) -> None:
    """
    SESS-07: Verifies that candidate does not already have an unfinished interview session.

    Execution:
    1. Checks Redis key `user:<user_id>:active_session` for instant memory-speed rejection.
    2. Falls back to PostgreSQL checking for rows in 'created', 'in_progress', or 'paused'.
    
    Raises:
        HTTPException(409 Conflict): If another active session exists.
    """
    r_lock = get_redis_lock()
    database = get_db()

    cached_id = await r_lock.get_user_active_session(user_id)
    if cached_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CONCURRENT_SESSION",
                "message": "You already have an active interview session.",
                "active_session_id": cached_id,
            },
        )

    active = await database.get_user_active_session(user_id)
    if active:
        # Repopulate Redis cache for future checks
        await r_lock.set_user_active_session(user_id, str(active["id"]))
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
    r_lock = get_redis_lock()
    cached_id = await r_lock.get_user_active_session(user_id)
    if cached_id == session_id or cached_id is None:
        await r_lock.clear_user_active_session(user_id)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency validating incoming Bearer token against Auth Service.
    """
    token = credentials.credentials
    verify_fn = get_verify_token_fn()
    user = await verify_fn(token)
    
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
    r_lock = get_redis_lock()
    database = get_db()

    cache_key = f"session:{session_id}"
    cached = await r_lock.get_cache(cache_key)
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

    session = await database.get_session(session_id)
    if session:
        try:
            serialized = {}
            for k, v in session.items():
                if isinstance(v, datetime):
                    serialized[k] = v.isoformat()
                else:
                    serialized[k] = v
            await r_lock.set_cache(cache_key, json.dumps(serialized), 14400)
        except Exception:
            pass
    return session
