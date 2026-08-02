"""
AI rate limiting and token budget enforcement for ai-interviewer-service.

Three guards applied before every LLM call:
  1. Sliding window rate limit  — 30 AI requests / minute / user
  2. Concurrency guard          — 1 concurrent AI generation / user
  3. Token budget               — 50,000 tokens / session

Redis key layout:
  ai:rate:{user_id}        — sorted set (timestamps for sliding window)
  ai:concurrent:{user_id}  — string with TTL (set NX)
  ai:tokens:{session_id}   — integer accumulator

Graceful degradation: if Redis is unavailable, all checks pass
(we never block users because of infra failure).
"""
import os
import time
import logging
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger("ai_limiter")

# Configuration (overridable via env)
RATE_LIMIT_REQUESTS = int(os.getenv("AI_RATE_LIMIT", "30"))
RATE_LIMIT_WINDOW   = int(os.getenv("AI_RATE_WINDOW", "60"))      # seconds
MAX_CONCURRENT      = int(os.getenv("AI_MAX_CONCURRENT", "1"))
TOKEN_BUDGET        = int(os.getenv("AI_TOKEN_BUDGET", "50000"))
CONCURRENT_TTL      = 120  # seconds before stale lock auto-expires

# Module-level Redis client — lazy-initialized
_redis_client = None
_redis_initialized = False


async def _get_redis():
    """Lazy-initialize an async Redis client. Returns None if unavailable."""
    global _redis_client, _redis_initialized
    if _redis_initialized:
        return _redis_client
    _redis_initialized = True
    try:
        import redis.asyncio as aioredis
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        _redis_client = aioredis.Redis(
            host=host, port=port,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
        await _redis_client.ping()
        logger.info("AI rate limiter connected to Redis at %s:%s", host, port)
    except Exception as e:
        logger.warning("AI rate limiter: Redis unavailable (%s). Rate limiting disabled.", e)
        _redis_client = None
    return _redis_client


async def check_ai_rate_limit(user_id: str) -> None:
    """
    Sliding window rate limit: max RATE_LIMIT_REQUESTS per RATE_LIMIT_WINDOW seconds.
    Raises HTTP 429 with Retry-After header if exceeded.
    """
    r = await _get_redis()
    if not r:
        return

    key = f"ai:rate:{user_id}"
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    try:
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, RATE_LIMIT_WINDOW)
        results = await pipe.execute()

        count = results[1]  # count before adding current request
        if count >= RATE_LIMIT_REQUESTS:
            oldest = await r.zrange(key, 0, 0, withscores=True)
            retry_after = int(RATE_LIMIT_WINDOW - (now - oldest[0][1])) + 1 if oldest else RATE_LIMIT_WINDOW
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "AI_RATE_LIMIT_EXCEEDED",
                    "message": f"AI request limit of {RATE_LIMIT_REQUESTS}/min exceeded. Please slow down.",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Rate limit check failed: %s", e)


async def acquire_ai_slot(user_id: str) -> bool:
    """
    Concurrency guard: at most MAX_CONCURRENT simultaneous AI calls per user.
    Returns True if slot acquired, raises 429 if at limit.
    Uses SET NX with TTL to prevent stale locks on crash.
    """
    r = await _get_redis()
    if not r:
        return True

    key = f"ai:concurrent:{user_id}"
    try:
        acquired = await r.set(key, "1", nx=True, ex=CONCURRENT_TTL)
        if not acquired:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "AI_CONCURRENT_LIMIT",
                    "message": "Another AI generation is still in progress. Please wait for it to finish.",
                },
            )
        return True
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Concurrency check failed: %s", e)
        return True


async def release_ai_slot(user_id: str) -> None:
    """Release the concurrency slot after AI call completes or fails."""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.delete(f"ai:concurrent:{user_id}")
    except Exception as e:
        logger.error("Failed to release AI slot: %s", e)


async def check_token_budget(session_id: str) -> None:
    """
    Token budget: raise 429 if session has consumed >= TOKEN_BUDGET tokens.
    """
    r = await _get_redis()
    if not r:
        return

    key = f"ai:tokens:{session_id}"
    try:
        current = await r.get(key)
        total = int(current or 0)
        if total >= TOKEN_BUDGET:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "TOKEN_BUDGET_EXCEEDED",
                    "message": f"Session token budget of {TOKEN_BUDGET:,} tokens exhausted. "
                               "Please end this session and start a new one.",
                    "tokens_used": total,
                    "budget": TOKEN_BUDGET,
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Token budget check failed: %s", e)


async def record_tokens_used(session_id: str, tokens: int) -> Optional[int]:
    """
    Increment the session token counter. Returns new total.
    TTL defaults to 24 hours (sessions don't last longer).
    """
    r = await _get_redis()
    if not r:
        return None

    key = f"ai:tokens:{session_id}"
    try:
        new_total = await r.incrby(key, tokens)
        await r.expire(key, 86400)
        return new_total
    except Exception as e:
        logger.error("Failed to record tokens: %s", e)
        return None
