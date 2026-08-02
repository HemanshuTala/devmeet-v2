import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

logger = logging.getLogger("orchestrator.redis")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

class RedisLock:
    def __init__(self):
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
        Acquires a distributed lock using Redis.
        If Redis is not available or connection fails, falls back gracefully.
        """
        if not self.active or not self.client:
            logger.info("RedisLock: Redis inactive. Proceeding with dummy lock.")
            yield True
            return

        token = os.urandom(16).hex()
        lock_key = f"lock:session:{lock_name}"
        end_time = asyncio.get_event_loop().time() + acquire_timeout
        acquired = False

        try:
            # Test connection once to fail-fast if Redis server is down
            await self.client.ping()
        except Exception as e:
            logger.warning(f"RedisLock: Redis server unreachable: {e}. Falling back gracefully.")
            self.active = False # Deactivate to avoid repeating ping delays
            yield True
            return

        try:
            while asyncio.get_event_loop().time() < end_time:
                # Set key if not exists (NX) with expiry (PX)
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
            # Safely release lock using Lua script to check token value matches
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
        """Get cached value by key."""
        if not self.active or not self.client:
            return None
        try:
            return await self.client.get(key)
        except Exception as e:
            logger.warning(f"Redis get exception: {e}")
            return None

    async def set_cache(self, key: str, value: str, expire_seconds: int = 14400):
        """Set cached value with expiry."""
        if not self.active or not self.client:
            return
        try:
            await self.client.setex(key, expire_seconds, value)
        except Exception as e:
            logger.warning(f"Redis set exception: {e}")

    async def invalidate_cache(self, key: str):
        """Delete cached value."""
        if not self.active or not self.client:
            return
        try:
            await self.client.delete(key)
        except Exception as e:
            logger.warning(f"Redis delete exception: {e}")

    async def set_user_active_session(self, user_id: str, session_id: str, ttl_seconds: int = 14400):
        """SESS-07: Track one active session per user (4h TTL)."""
        if not self.active or not self.client:
            return
        try:
            await self.client.setex(f"user:{user_id}:active_session", ttl_seconds, session_id)
        except Exception as e:
            logger.warning(f"Redis set active session exception: {e}")

    async def get_user_active_session(self, user_id: str) -> Optional[str]:
        if not self.active or not self.client:
            return None
        try:
            return await self.client.get(f"user:{user_id}:active_session")
        except Exception as e:
            logger.warning(f"Redis get active session exception: {e}")
            return None

    async def clear_user_active_session(self, user_id: str):
        if not self.active or not self.client:
            return
        try:
            await self.client.delete(f"user:{user_id}:active_session")
        except Exception as e:
            logger.warning(f"Redis clear active session exception: {e}")

redis_lock = RedisLock()
