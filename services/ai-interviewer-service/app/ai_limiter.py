"""
================================================================================
AI INTERVIEWER SERVICE — RATE LIMITING, CONCURRENCY GUARDS & TOKEN BUDGETING
================================================================================
Role & Responsibility:
  This module enforces multi-tiered resource protection and cost-control guards
  before any request triggers external Large Language Model (LLM) inference:
    1. Sliding Window Rate Limiter: Caps requests at 30 queries/minute per candidate
       using Redis Sorted Sets (`ZSET`), eliminating burst attacks and API abuse.
    2. Concurrency Guard: Enforces a single active LLM stream per candidate via
       Redis `SET NX` locks with automatic TTL expiration to prevent overlapping turns.
    3. Session Token Budgeting: Tracks cumulative prompt + completion token usage
       per interview session against a maximum ceiling (default: 50,000 tokens)
       to protect against infinite loops or runaway billing.

Architectural Value & Fault Tolerance:
  - Fail-Open Philosophy: If the central Redis cluster experiences transient outages,
    these guard checks fail open (log warnings and allow requests). In an interview
    platform, user experience during a live session is prioritized over strict metric
    enforcement during infrastructure faults.
  - Accurate Retry-After Calculations: When rate limits are triggered, the module
    computes the exact second when the oldest request in the sliding window rolls off,
    returning an RFC 7231 standard `Retry-After` HTTP header.
================================================================================
"""

import os
import time
import logging
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger("ai_limiter")

# ==============================================================================
# CONFIGURATION CONSTANTS (ENV OVERRIDABLE)
# ==============================================================================
# Maximum number of AI inference requests allowed within the sliding window
RATE_LIMIT_REQUESTS = int(os.getenv("AI_RATE_LIMIT", "30"))

# Duration of the sliding rate limit window in seconds (60 seconds = 1 minute)
RATE_LIMIT_WINDOW = int(os.getenv("AI_RATE_WINDOW", "60"))

# Maximum concurrent LLM generation streams allowed simultaneously for one user
MAX_CONCURRENT = int(os.getenv("AI_MAX_CONCURRENT", "1"))

# Hard ceiling for total tokens consumed within a single interview session (50k tokens)
TOKEN_BUDGET = int(os.getenv("AI_TOKEN_BUDGET", "50000"))

# Safety time-to-live (seconds) for concurrency locks if the worker crashes mid-stream
CONCURRENT_TTL = 120

# Module-level Redis client connection caching to prevent reconnect churn
_redis_client = None
_redis_initialized = False


async def _get_redis():
    """
    Lazy-initializes and returns a singleton asynchronous Redis client instance.

    Returns:
      aioredis.Redis | None: The active Redis connection pool, or None if unreachable.

    Design Rationale:
      - Uses lazy initialization so importing this module during unit testing does
        not trigger immediate network connections or throw connection errors.
      - Sets short connection and socket timeouts (2.0s) so degraded Redis instances
        do not stall HTTP request lifecycles.
    """
    global _redis_client, _redis_initialized
    if _redis_initialized:
        return _redis_client
        
    _redis_initialized = True
    try:
        import redis.asyncio as aioredis
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        
        # Initialize connection with UTF-8 response decoding
        _redis_client = aioredis.Redis(
            host=host,
            port=port,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
        # Verify cluster health with a non-blocking ping
        await _redis_client.ping()
        logger.info("AI rate limiter connected to Redis at %s:%s", host, port)
    except Exception as e:
        logger.warning("AI rate limiter: Redis unavailable (%s). Rate limiting disabled.", e)
        _redis_client = None
        
    return _redis_client


async def check_ai_rate_limit(user_id: str) -> None:
    """
    Enforces a Redis-backed Sliding Window rate limit per user.

    Parameters:
      user_id (str): The unique identifier of the authenticated candidate.

    Raises:
      HTTPException (429 Too Many Requests): If the candidate exceeded RATE_LIMIT_REQUESTS
                                             in the trailing RATE_LIMIT_WINDOW seconds.

    How the Sliding Window Works:
      1. Uses a Redis Sorted Set (`ZSET`) where both the element member and its score
         are floating-point epoch timestamps (`now`).
      2. Executes an atomic Redis Pipeline:
         a. `ZREMRANGEBYSCORE`: Purges entries older than `now - RATE_LIMIT_WINDOW`.
         b. `ZCARD`: Counts remaining requests within the current 60-second window.
         c. `ZADD`: Records the current request timestamp.
         d. `EXPIRE`: Refreshes TTL so idle sets are pruned from Redis memory.
      3. If `count >= RATE_LIMIT_REQUESTS`, fetches the oldest timestamp in the set,
         computes the exact `retry_after` delay, and aborts with HTTP 429.
    """
    r = await _get_redis()
    # Graceful degradation: Allow request if Redis is unreachable
    if not r:
        return

    key = f"ai:rate:{user_id}"
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    try:
        # Pipeline batches all commands into a single TCP round-trip to Redis
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)       # Prune stale timestamps
        pipe.zcard(key)                                   # Count active queries in window
        pipe.zadd(key, {str(now): now})                   # Insert current request timestamp
        pipe.expire(key, RATE_LIMIT_WINDOW)               # Refresh key TTL
        results = await pipe.execute()

        # results[1] corresponds to ZCARD (count before adding current request)
        count = results[1]
        if count >= RATE_LIMIT_REQUESTS:
            # Query the oldest entry in the window to determine when capacity frees up
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
    Acquires an exclusive concurrency slot for candidate AI generation.

    Parameters:
      user_id (str): The unique identifier of the authenticated candidate.

    Returns:
      bool: True if slot was successfully acquired.

    Raises:
      HTTPException (429 Too Many Requests): If another AI generation is actively running.

    Design Rationale:
      - Uses `SET key value NX EX TTL` (Set if Not eXists with an Expiration TTL).
      - Prevents candidates from opening multiple tabs or spamming turns while the model
        is mid-stream, which would otherwise waste expensive GPU tokens and desynchronize
        the interview state machine.
      - 120s TTL ensures the lock auto-cleans even if the server container crashes mid-turn.
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
    """
    Releases the exclusive concurrency lock when generation finishes or fails.

    Parameters:
      user_id (str): The unique identifier of the candidate releasing their slot.

    Side Effects:
      Deletes key `ai:concurrent:{user_id}` from Redis, permitting subsequent turns.
    """
    r = await _get_redis()
    if not r:
        return
    try:
        await r.delete(f"ai:concurrent:{user_id}")
    except Exception as e:
        logger.error("Failed to release AI slot: %s", e)


async def check_token_budget(session_id: str) -> None:
    """
    Verifies that the session has not exceeded its cumulative LLM token allowance.

    Parameters:
      session_id (str): The active interview session identifier.

    Raises:
      HTTPException (429 Too Many Requests): If total session tokens >= TOKEN_BUDGET.

    Architectural Value:
      Prevents runaway billing or infinite prompt loops from consuming unlimited LLM quota.
      Once 50,000 tokens are consumed in a single interview, the user must conclude the session.
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
    Atomically increments the token counter for an interview session.

    Parameters:
      session_id (str): The target interview session identifier.
      tokens (int): Count of tokens consumed by the latest LLM completion turn.

    Returns:
      Optional[int]: The updated total cumulative token count for the session,
                     or None if Redis was unreachable.

    Side Effects:
      Calls `INCRBY` on Redis key `ai:tokens:{session_id}` and sets a 24-hour expiration (86400s).
    """
    r = await _get_redis()
    if not r:
        return None

    key = f"ai:tokens:{session_id}"
    try:
        # Atomic counter increment
        new_total = await r.incrby(key, tokens)
        # Ensure session usage keys expire automatically after 24 hours
        await r.expire(key, 86400)
        return new_total
    except Exception as e:
        logger.error("Failed to record tokens: %s", e)
        return None
