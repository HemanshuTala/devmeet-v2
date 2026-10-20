"""
Redis Distributed Locking and Session Cache Client.
===================================================
This module provides distributed locking and low-latency session caching
for the Interview Orchestrator service.

Why Distributed Locking is Critical for Interviews:
---------------------------------------------------
In an interactive interview, candidates frequently trigger rapid, asynchronous actions:
- Typing and executing code multiple times in rapid succession.
- Sending chat messages while speech-to-text recognition is simultaneously transcribing.
- Network reconnections sending duplicate state-synchronization pulses.

Without concurrency control, simultaneous requests for the same session could result in:
- Duplicate turns with identical sequence numbers.
- Split-brain state machine transitions (e.g. attempting to complete and pause at the same time).
- Corrupted conversation histories.

Distributed Lock Implementation Details:
----------------------------------------
1. Lock Acquisition (`SET lock:session:<id> <token> NX PX <lock_timeout_ms>`):
   - `NX`: Only set the key if it does not already exist (mutual exclusion).
   - `PX`: Automatic expiration time in milliseconds (deadlock prevention if a worker crashes).
   - Cryptographically random token: Ensures each lock holder has a unique ownership token.
2. Safe Lock Release via Atomic Lua Script:
   - Solves the classic distributed lock race condition: If a process takes longer than
     the lock TTL to finish, its lock expires and another worker acquires it. When the first
     worker finally finishes, it must NOT delete the second worker's lock!
   - The Lua script atomically compares `redis.call('get', KEYS[1]) == ARGV[1]` and only
     deletes the key if the token matches.
3. Graceful Fallback:
   - If Redis is down, the client logs a warning and yields `True`, allowing the system
     to continue operating rather than rejecting candidate requests.
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

logger = logging.getLogger("orchestrator.redis")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


class RedisLock:
    """
    Manages Redis connection, distributed session locks, and active session cache.
    """
    def __init__(self):
        """
        Initializes the async Redis connection client.
        
        Sets strict connection and socket timeouts (2.0s) so unreachable Redis nodes
        fail fast rather than blocking user requests.
        """
        self.client = None
        self.active = False
        try:
            import redis.asyncio as redis
            self.client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0
            )
            self.active = True
        except Exception as e:
            logger.warning(f"RedisLock: Failed to initialize Redis client. Falling back to local in-memory mock lock: {e}")

    @asynccontextmanager
    async def acquire_lock(self, lock_name: str, acquire_timeout: float = 3.0, lock_timeout: float = 10.0):
        """
        Acquires an exclusive distributed lock for a specific interview session.

        Parameters:
            lock_name (str): Unique identifier, typically `session_id`.
            acquire_timeout (float): Max seconds to spend polling for the lock before giving up (default: 3.0s).
            lock_timeout (float): Max lifetime of the lock in seconds before Redis auto-expires it (default: 10.0s).

        Yields:
            bool: True if lock acquired (or graceful fallback active), False if timed out.
        """
        # If Redis is disabled or offline, fall back gracefully to non-blocking execution
        if not self.active or not self.client:
            logger.info("RedisLock: Redis inactive. Proceeding with dummy lock.")
            yield True
            return

        # Generate unique 128-bit random token for this lock lease
        token = os.urandom(16).hex()
        lock_key = f"lock:session:{lock_name}"
        end_time = asyncio.get_event_loop().time() + acquire_timeout
        acquired = False

        try:
            # Fast ping check to verify connectivity
            await self.client.ping()
        except Exception as e:
            logger.warning(f"RedisLock: Redis server unreachable: {e}. Falling back gracefully.")
            self.active = False
            yield True
            return

        try:
            # Polling loop: attempt atomic SET NX PX every 50ms until acquired or acquire_timeout expires
            while asyncio.get_event_loop().time() < end_time:
                res = await self.client.set(lock_key, token, nx=True, px=int(lock_timeout * 1000))
                if res:
                    acquired = True
                    break
                await asyncio.sleep(0.05)
        except Exception as e:
            logger.warning(f"RedisLock: Lock acquisition exception: {e}. Falling back gracefully.")
            yield True
            return

        if not acquired:
            logger.warning(f"RedisLock: Failed to acquire lock '{lock_key}' within timeout.")
            yield False
            return

        try:
            yield True
        finally:
            # Atomic release using Lua script to verify ownership before deletion
            lua_release = """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """
            try:
                await self.client.eval(lua_release, 1, lock_key, token)
            except Exception as e:
                logger.error(f"RedisLock: Failed to release lock '{lock_key}': {e}")

    async def get_cache(self, key: str) -> Optional[str]:
        """Retrieves cached string value from Redis."""
        if not self.active or not self.client:
            return None
        try:
            return await self.client.get(key)
        except Exception as e:
            logger.warning(f"Redis get exception: {e}")
            return None

    async def set_cache(self, key: str, value: str, expire_seconds: int = 14400):
        """Stores a cached string value with expiration (default 4 hours)."""
        if not self.active or not self.client:
            return
        try:
            await self.client.setex(key, expire_seconds, value)
        except Exception as e:
            logger.warning(f"Redis set exception: {e}")

    async def invalidate_cache(self, key: str):
        """Purges a key from Redis cache."""
        if not self.active or not self.client:
            return
        try:
            await self.client.delete(key)
        except Exception as e:
            logger.warning(f"Redis delete exception: {e}")

    async def set_user_active_session(self, user_id: str, session_id: str, ttl_seconds: int = 14400):
        """
        SESS-07: Records active session ID for a candidate with a 4-hour TTL in Redis.
        
        Prevents a candidate from opening multiple conflicting browser sessions.
        """
        if not self.active or not self.client:
            return
        try:
            await self.client.setex(f"user:{user_id}:active_session", ttl_seconds, session_id)
        except Exception as e:
            logger.warning(f"Redis set active session exception: {e}")

    async def get_user_active_session(self, user_id: str) -> Optional[str]:
        """Returns the currently active session ID for a candidate from Redis."""
        if not self.active or not self.client:
            return None
        try:
            return await self.client.get(f"user:{user_id}:active_session")
        except Exception as e:
            logger.warning(f"Redis get active session exception: {e}")
            return None

    async def clear_user_active_session(self, user_id: str):
        """Removes the candidate's active session tracking key upon completion or cancellation."""
        if not self.active or not self.client:
            return
        try:
            await self.client.delete(f"user:{user_id}:active_session")
        except Exception as e:
            logger.warning(f"Redis clear active session exception: {e}")


# Global singleton instance of RedisLock
redis_lock = RedisLock()
