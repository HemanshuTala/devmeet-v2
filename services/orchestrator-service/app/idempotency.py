"""
Idempotency layer for the orchestrator service.

Prevents duplicate side effects when clients retry requests.
Uses the Idempotency-Key header + user identity to cache results.

Usage in routes:
    @router.post("/sessions")
    async def create_session(
        ...,
        idempotency: IdempotencyResult = Depends(idempotency_guard),
    ):
        if idempotency.cached:
            return JSONResponse(content=idempotency.response_body, status_code=idempotency.response_code)
        # ... do work ...
        await idempotency.store(201, response_dict)
        return response_dict
"""
import hashlib
import json
import logging
from typing import Optional
from dataclasses import dataclass, field

from fastapi import Request, HTTPException, status
from .database import db

logger = logging.getLogger("idempotency")


@dataclass
class IdempotencyResult:
    """Holds idempotency check result and provides store() for completing the record."""
    cached: bool = False
    response_code: Optional[int] = None
    response_body: Optional[dict] = None
    # Internal fields for store()
    _key: str = ""
    _user_id: str = ""
    _endpoint: str = ""
    _request_hash: str = ""

    async def store(self, response_code: int, response_body: dict) -> None:
        """Persist the result so future retries return the cached response."""
        if not self._key:
            return
        try:
            async with db.pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE idempotency_records
                    SET status = 'completed',
                        response_code = $1,
                        response_body = $2::jsonb
                    WHERE key = $3 AND user_id = $4
                    """,
                    response_code,
                    json.dumps(response_body),
                    self._key,
                    self._user_id,
                )
        except Exception as e:
            logger.error("Failed to store idempotency result: %s", e)

    async def mark_failed(self) -> None:
        """Mark the record as failed so the key can be reused."""
        if not self._key:
            return
        try:
            async with db.pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE idempotency_records
                    SET status = 'failed'
                    WHERE key = $1 AND user_id = $2
                    """,
                    self._key,
                    self._user_id,
                )
        except Exception as e:
            logger.error("Failed to mark idempotency as failed: %s", e)


def _hash_body(body: bytes) -> str:
    """SHA-256 fingerprint of the request body."""
    return hashlib.sha256(body).hexdigest()


async def check_idempotency(request: Request, user_id: str) -> IdempotencyResult:
    """
    Check/create an idempotency record for the current request.

    Call this at the top of any route handler after authentication.
    If no Idempotency-Key header is present, returns a no-op result
    (idempotency is opt-in for backwards compatibility).
    """
    idem_key = request.headers.get("Idempotency-Key")
    if not idem_key:
        return IdempotencyResult()

    endpoint = f"{request.method} {request.url.path}"
    body = await request.body()
    request_hash = _hash_body(body)

    async with db.pool.acquire() as conn:
        # Check for existing record
        row = await conn.fetchrow(
            """
            SELECT status, response_code, response_body, request_hash
            FROM idempotency_records
            WHERE key = $1 AND user_id = $2 AND expires_at > NOW()
            """,
            idem_key,
            user_id,
        )

        if row:
            # Same key but different request body → reject per spec
            if row["request_hash"] != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Idempotency-Key reused with a different request body.",
                )

            if row["status"] == "completed" and row["response_body"] is not None:
                logger.info(
                    "Idempotency cache hit: key=%s endpoint=%s",
                    idem_key, endpoint,
                )
                return IdempotencyResult(
                    cached=True,
                    response_code=row["response_code"],
                    response_body=json.loads(row["response_body"])
                    if isinstance(row["response_body"], str)
                    else row["response_body"],
                )

            if row["status"] == "processing":
                # Another request with the same key is still in flight
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A request with this Idempotency-Key is already being processed.",
                )

            # status == 'failed' → allow retry, update the record
            await conn.execute(
                """
                UPDATE idempotency_records
                SET status = 'processing',
                    request_hash = $1,
                    created_at = NOW(),
                    expires_at = NOW() + INTERVAL '24 hours'
                WHERE key = $2 AND user_id = $3
                """,
                request_hash,
                idem_key,
                user_id,
            )
        else:
            # Insert new processing record
            await conn.execute(
                """
                INSERT INTO idempotency_records (key, user_id, endpoint, request_hash, status)
                VALUES ($1, $2, $3, $4, 'processing')
                ON CONFLICT (key, user_id) DO UPDATE
                SET status = 'processing',
                    request_hash = $4,
                    endpoint = $3,
                    created_at = NOW(),
                    expires_at = NOW() + INTERVAL '24 hours'
                """,
                idem_key,
                user_id,
                endpoint,
                request_hash,
            )

    return IdempotencyResult(
        _key=idem_key,
        _user_id=user_id,
        _endpoint=endpoint,
        _request_hash=request_hash,
    )
