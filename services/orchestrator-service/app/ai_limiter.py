"""
AI Rate Limiting and Token Budget Enforcement.
==============================================
This module enforces rate limits, concurrency guards, and LLM token budgets
before the Orchestrator delegates prompt inference to the `ai-interviewer-service`.

Why These Three Guards are Critical:
------------------------------------
LLM inference (Groq Llama 3 / Mixtral APIs) incurs compute latency and API quota costs.
To prevent malicious API exhaustion, runaway token bills, and client stutter:
1. Sliding Window Rate Limiter (Sorted Set in Redis):
   - Restricts each user to at most 30 AI requests per minute.
   - Accurately tracks request timestamps in a Redis sorted set (`ZADD`).
   - Prunes timestamps older than the 60s sliding window (`ZREMRANGEBYSCORE`).
   - Emits HTTP 429 with precise `Retry-After` seconds header when tripped.
2. User Concurrency Guard (Atomic `SET NX EX` in Redis):
   - Restricts each candidate to 1 active streaming AI generation at a time.
   - Prevents race conditions where a candidate double-taps "Answer" while the LLM is already generating.
   - Includes a 120-second safety TTL so crashed requests do not lock the user out permanently.
3. Session Token Budget Cap (Integer Counter in Redis):
   - Caps total prompt + completion tokens at 50,000 tokens per interview session.
   - Halts runaway conversational recursion or excessively large code dump prompts.
"""

import time
import logging
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger("ai_limiter")

# Rate limiting and resource governance thresholds
RATE_LIMIT_REQUESTS = 30       # Max AI generation prompts allowed per user per minute
RATE_LIMIT_WINDOW   = 60       # Window size in seconds (1 minute)
MAX_CONCURRENT      = 1        # Max concurrent in-flight LLM generations per user
TOKEN_BUDGET        = 50_000   # Max cumulative token consumption per interview session
CONCURRENT_TTL      = 120      # Safety TTL in seconds before an abandoned concurrency lock auto-expires


async def check_ai_rate_limit(user_id: str, redis) -> None:
    """
    Evaluates sliding-window request volume using Redis Sorted Sets.

    Algorithm:
    1. Pipeline commands atomically:
       - `ZREMRANGEBYSCORE key 0 (now - 60s)` : Evicts requests outside the current 60s sliding window.
       - `ZCARD key`                         : Counts remaining valid requests within window.
       - `ZADD key now now`                  : Records current request timestamp.
       - `EXPIRE key 60`                     : Renews key expiration.
    2. If prior count >= 30:
       - Calculates exact remaining seconds until oldest request expires.
       - Raises HTTP 429 Too Many Requests with standard `Retry-After` header.

    Parameters:
        user_id (str): Candidate UUID.
        redis (Redis): Asynchronous Redis client.

    Raises:
        HTTPException(429): If user exceeded 30 requests in the rolling 60s window.
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

    count = results[1]  # Request count before adding current request
    if count >= RATE_LIMIT_REQUESTS:
        # Inspect oldest entry to compute exact Retry-After seconds
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
    Acquires exclusive concurrency slot to prevent simultaneous AI generations for the same user.

    Uses atomic Redis `SET key 1 NX EX 120`.
    Returns True if slot was acquired, False if another generation is already in flight.
    """
    key = f"ai:concurrent:{user_id}"
    acquired = await redis.set(key, "1", nx=True, ex=CONCURRENT_TTL)
    return bool(acquired)


async def release_ai_slot(user_id: str, redis) -> None:
    """
    Releases concurrency slot upon generation completion or failure.
    """
    key = f"ai:concurrent:{user_id}"
    await redis.delete(key)


async def check_token_budget(session_id: str, tokens_used: int, redis) -> None:
    """
    Validates that a new request will not exceed the session's 50,000 token budget.

    Parameters:
        session_id (str): Interview session UUID.
        tokens_used (int): Estimated tokens in the proposed prompt payload.
        redis (Redis): Asynchronous Redis client.

    Raises:
        HTTPException(429): If cumulative consumption exceeds TOKEN_BUDGET.
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
    Atomically increments cumulative token usage for the session in Redis.

    Parameters:
        session_id (str): Interview session UUID.
        tokens (int): Actual prompt + completion tokens consumed.
        redis (Redis): Asynchronous Redis client.
        ttl (int): Expiration in seconds (default: 86400 = 24 hours).

    Returns:
        int: The new cumulative token total.
    """
    key = f"ai:tokens:{session_id}"
    new_total = await redis.incrby(key, tokens)
    await redis.expire(key, ttl)
    return new_total
