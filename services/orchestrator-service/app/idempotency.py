"""
Idempotency Control Layer for Orchestrator Service.
===================================================
This module implements the Stripe-style Idempotency Key pattern (IETF RFC draft standard)
to prevent duplicate side-effects from accidental client retries, network blips, or double clicks.

Why Idempotency is Critical for Interview Sessions:
---------------------------------------------------
Creating an interview session consumes the user's daily interview quota, spins up an AI context,
and sets up video channels. If a client's mobile or broadband network times out on the HTTP POST,
the frontend auto-retries.
Without idempotency:
- The user would be charged twice against their quota.
- Two competing session records would be created in PostgreSQL.
- Two video rooms would be provisioned.

How This Implementation Works:
------------------------------
1. Opt-In Header (`Idempotency-Key: <client_generated_uuid>`):
   - The browser or client generates a unique UUID v4 before submitting the mutation.
2. Request Fingerprinting (SHA-256 Hash of Request Body):
   - We hash the incoming payload to guarantee the payload hasn't changed.
   - If a client re-uses the same key with different parameters, we reject it with
     HTTP 422 Unprocessable Entity per idempotency specifications.
3. State Management in `idempotency_records` table:
   - `processing`: Another in-flight request is currently executing; returns HTTP 409 Conflict.
   - `completed`: Returns the exact previously cached HTTP response code and JSON body immediately.
   - `failed`: Prior attempt encountered an exception; resets state and permits safe retry.
   - Records expire automatically after 24 hours (`expires_at > NOW()`).
"""

import hashlib
import json
import logging
from typing import Optional
from dataclasses import dataclass, field

from fastapi import Request, HTTPException, status
from .database import db

# Logger for idempotency tracing
logger = logging.getLogger("idempotency")


@dataclass
class IdempotencyResult:
    """
    Encapsulates the state of an idempotency lookup and provides methods
    to finalize the record upon successful handler completion.
    """
    cached: bool = False
    response_code: Optional[int] = None
    response_body: Optional[dict] = None
    
    # Internal record identifiers passed to store() and mark_failed()
    _key: str = ""
    _user_id: str = ""
    _endpoint: str = ""
    _request_hash: str = ""

    async def store(self, response_code: int, response_body: dict) -> None:
        """
        Marks the idempotency record as 'completed' and saves the response body.
        
        Future retries presenting the same Idempotency-Key within 24 hours will
        immediately receive this saved response without executing downstream services.
        """
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
        """
        Marks the record as 'failed' if an unhandled error occurred during handler execution.
        
        Allows the client to retry using the same key without being blocked by a stuck 'processing' state.
        """
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
    """
    Computes a deterministic SHA-256 fingerprint of the raw HTTP request body bytes.
    """
    return hashlib.sha256(body).hexdigest()


async def check_idempotency(request: Request, user_id: str) -> IdempotencyResult:
    """
    Inspects the `Idempotency-Key` header and checks existing records in PostgreSQL.

    Execution Flow:
    1. If `Idempotency-Key` header is absent, returns an empty `IdempotencyResult` (opt-in behavior).
    2. Hashes the request body bytes with SHA-256.
    3. Queries `idempotency_records` table for matching (key, user_id) tuple.
    4. Evaluates status:
       - Payload mismatch: HTTP 422 (key reuse with different data).
       - 'completed': Returns cached response immediately.
       - 'processing': HTTP 409 Conflict (concurrent duplicate in flight).
       - 'failed' or new: Locks record as 'processing' with a 24-hour expiration.

    Parameters:
        request (Request): Starlette/FastAPI request object.
        user_id (str): Authenticated caller's user UUID.

    Returns:
        IdempotencyResult: State object indicating whether request was served from cache.
    """
    idem_key = request.headers.get("Idempotency-Key")
    if not idem_key:
        return IdempotencyResult()

    endpoint = f"{request.method} {request.url.path}"
    body = await request.body()
    request_hash = _hash_body(body)

    async with db.pool.acquire() as conn:
        # Check for existing unexpired record
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
            # Reusing the same key with different parameters violates the idempotency contract
            if row["request_hash"] != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Idempotency-Key reused with a different request body.",
                )

            # Cache hit: Return exact prior response
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

            # Concurrent in-flight request: Prevent duplicate processing race condition
            if row["status"] == "processing":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A request with this Idempotency-Key is already being processed.",
                )

            # Previous attempt failed: Reset record to 'processing' and allow retry
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
            # First attempt: Insert new record in 'processing' status
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
