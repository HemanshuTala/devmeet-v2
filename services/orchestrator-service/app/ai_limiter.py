"""
AI rate limiting and token budget enforcement for the orchestrator service.

Three guards applied before forwarding requests to ai-interviewer-service:
  1. Sliding window rate limit  — 30 AI requests / minute / user
  2. Concurrency guard          — 1 concurrent AI generation / user
  3. Token budget               — 50,000 tokens / session

Redis key layout:
  ai:rate:{user_id}        — sorted set (timestamps, sliding window)
  ai:concurrent:{user_id}  — string counter with TTL
  ai:tokens:{session_id}   — integer accumulator
"""
import time
import logging
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger("ai_limiter")

# Limits (override via env if needed)
RATE_LIMIT_REQUESTS = 30       # max requests per window
RATE_LIMIT_WINDOW   = 60       # seconds
MAX_CONCURRENT      = 1        # concurrent AI calls per user
TOKEN_BUDGET        = 50_000   # tokens per session
CONCURRENT_TTL      = 120      # seconds before stale lock auto-expires


async def check_ai_rate_limit(user_id: str, redis) -> None:
    """
    Sliding window rate limit: max RATE_LIMIT_REQUESTS per RATE_LIMIT_WINDOW seconds.
    Raises HTTP 429 with Retry-After header if exceeded.
    """
    key = f"ai:rate:{user_id}"
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, RATE_LIMIT_WINDOW)
    results = await pipe.execute()

    count = results[1]  # count before adding current request
    if count >= RATE_LIMIT_REQUESTS:
        # Find oldest entry to compute retry-after
        oldest = await redis.zrange(key, 0, 0, withscores=True)
        retry_after = int(RATE_LIMIT_WINDOW - (now - oldest[0][1])) + 1 if oldest else RATE_LIMIT_WINDOW
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "AI_RATE_LIMIT_EXCEEDED",
                "message": f"AI request limit of {RATE_LIMIT_REQUESTS}/min exceeded.",
                "retry_after": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )


async def acquire_ai_slot(user_id: str, redis) -> bool:
    """
    Concurrency guard: allow at most MAX_CONCURRENT simultaneous AI calls per user.
    Returns True if slot acquired, False if already at limit.
    Uses SET NX with TTL to prevent stale locks on crash.
    """
    key = f"ai:concurrent:{user_id}"
    acquired = await redis.set(key, "1", nx=True, ex=CONCURRENT_TTL)
    return bool(acquired)


async def release_ai_slot(user_id: str, redis) -> None:
    """Release the concurrency slot after AI call completes or fails."""
    key = f"ai:concurrent:{user_id}"
    await redis.delete(key)


async def check_token_budget(session_id: str, tokens_used: int, redis) -> None:
    """
    Token budget: raise 429 if session has consumed >= TOKEN_BUDGET tokens.
    Call with the token count of the *current* request before sending it.
    """
    key = f"ai:tokens:{session_id}"
    current = await redis.get(key)
    total = int(current or 0) + tokens_used
    if total > TOKEN_BUDGET:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "TOKEN_BUDGET_EXCEEDED",
                "message": f"Session token budget of {TOKEN_BUDGET:,} tokens exhausted.",
                "tokens_used": int(current or 0),
                "budget": TOKEN_BUDGET,
            },
        )


async def record_tokens_used(session_id: str, tokens: int, redis, ttl: int = 86400) -> int:
    """
    Increment the session token counter. Returns new total.
    TTL defaults to 24 hours (sessions don't last longer).
    """
    key = f"ai:tokens:{session_id}"
    new_total = await redis.incrby(key, tokens)
    await redis.expire(key, ttl)
    return new_total
