"""
Transactional Outbox Pattern Implementation for Orchestrator Service.
=====================================================================
This module guarantees reliable event delivery between the Orchestrator Service
and downstream consumer microservices (primarily `feedback-service`).

The Dual-Write Problem Solved by Transactional Outbox:
------------------------------------------------------
When a candidate finishes an interview, two operations must happen:
1. Update database state: `UPDATE sessions SET status = 'completed' WHERE id = ...`
2. Notify feedback service to evaluate transcript and generate rubric score report.

The Problem with Direct HTTP Calls:
If the application commits the database transaction and then attempts an HTTP POST
to `feedback-service`, a network glitch, timeout, or container restart will cause
the notification to be permanently lost! The user's interview is marked completed,
but their report is never generated.

How the Transactional Outbox Works:
-----------------------------------
1. Atomic Emission (`emit_event`):
   - Inside the EXACT SAME PostgreSQL transaction that updates the session status,
     an event record is inserted into the `outbox_events` table (`published = FALSE`).
   - If the database commit succeeds, the event is guaranteed to be saved. If it rolls back,
     no phantom event is created.
2. Background Polling & Dispatch (`OutboxPublisher`):
   - A resilient background asyncio task periodically polls for unpublished rows.
   - For `session.completed` events, it queries the full conversation transcript from
     `conversation_turns` and sends an HTTP POST to `feedback-service:8007/api/v1/feedback/generate`.
   - On HTTP 200/201/202, it flags the row as `published = TRUE` and records `published_at = NOW()`.
   - If downstream is down or times out, the event remains unpublished and will be automatically
     retried on the next polling cycle without dropping data.
"""

import asyncio
import json
import logging
import uuid
from typing import Optional

import httpx

from .database import db

logger = logging.getLogger("outbox")

FEEDBACK_SERVICE_URL = None  # Populated from environment on application startup


async def emit_event(
    conn,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict,
) -> str:
    """
    Inserts an event record into `outbox_events` within the caller's active database transaction.

    Parameters:
        conn (asyncpg.Connection): Active database connection holding an uncommitted transaction.
        event_type (str): Event name (e.g. 'session.completed').
        aggregate_type (str): Domain entity category (e.g. 'session').
        aggregate_id (str): Primary key UUID of the affected entity.
        payload (dict): Structured context payload for downstream consumers.

    Returns:
        str: Generated event UUID.
    """
    event_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
        VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)
        """,
        uuid.UUID(event_id),
        event_id,
        aggregate_type,
        uuid.UUID(aggregate_id),
        json.dumps(payload),
    )
    logger.debug("Outbox event emitted: %s %s/%s", event_type, aggregate_type, aggregate_id)
    return event_id


class OutboxPublisher:
    """
    Background worker that queries unpublished outbox rows and delivers them reliably.
    """

    def __init__(self, poll_interval: float = 5.0, batch_size: int = 20):
        """
        Parameters:
            poll_interval (float): Polling frequency in seconds (default: 5.0s).
            batch_size (int): Max events to process per polling tick (default: 20).
        """
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self, feedback_service_url: str):
        """
        Initializes the target feedback URL and starts the background asyncio polling task.
        """
        global FEEDBACK_SERVICE_URL
        FEEDBACK_SERVICE_URL = feedback_service_url
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Outbox publisher started (interval=%.1fs)", self.poll_interval)

    async def stop(self):
        """
        Signals the polling loop to stop and gracefully awaits task cancellation.
        """
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Outbox publisher stopped")

    async def _poll_loop(self):
        """
        Infinite polling loop executed as a background asyncio task.
        """
        while self._running:
            try:
                await self._process_batch()
            except Exception as e:
                logger.error("Outbox publisher error: %s", e)
            await asyncio.sleep(self.poll_interval)

    async def _process_batch(self):
        """
        Queries a batch of unpublished events from PostgreSQL and dispatches each sequentially.
        """
        if not db.pool:
            return

        async with db.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, event_type, aggregate_type, aggregate_id, payload, created_at
                FROM outbox_events
                WHERE published = FALSE
                ORDER BY created_at ASC
                LIMIT $1
                """,
                self.batch_size,
            )

        for row in rows:
            success = await self._dispatch_event(row)
            if success:
                # Mark as published atomically upon successful downstream HTTP acknowledgment
                async with db.pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE outbox_events
                        SET published = TRUE, published_at = NOW()
                        WHERE id = $1
                        """,
                        row["id"],
                    )

    async def _dispatch_event(self, row) -> bool:
        """
        Routes an outbox event to its corresponding handler based on `event_type`.
        """
        event_type = row["event_type"]
        payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])

        try:
            if event_type == "session.completed":
                return await self._handle_session_completed(payload)
            else:
                logger.warning("Unknown outbox event type: %s", event_type)
                # Mark unhandled event types as published to prevent infinite retry loops
                return True
        except Exception as e:
            logger.error(
                "Failed to dispatch outbox event %s (type=%s): %s",
                row["id"], event_type, e,
            )
            return False

    async def _handle_session_completed(self, payload: dict) -> bool:
        """
        Dispatches `session.completed` event to `feedback-service` for AI report generation.

        Steps:
        1. Validates required payload fields (session_id, interview_type, difficulty).
        2. Queries PostgreSQL `conversation_turns` to build the full interview transcript.
        3. Sends HTTP POST to `/api/v1/feedback/generate`.
        4. Returns True on HTTP 200/201/202, triggering the published flag update in PostgreSQL.
        """
        if not FEEDBACK_SERVICE_URL:
            logger.warning("FEEDBACK_SERVICE_URL not configured, skipping dispatch")
            return False

        session_id = payload.get("session_id")
        interview_type = payload.get("interview_type")
        difficulty = payload.get("difficulty")
        language = payload.get("language", "python")
        target_company = payload.get("target_company")

        if not session_id or not interview_type or not difficulty:
            logger.warning(
                "Outbox event missing required fields for session %s — skipping feedback generation",
                session_id,
            )
            return True

        # Fetch conversation dialogue history from PostgreSQL
        transcript: list = []
        try:
            if db.pool:
                import uuid as _uuid
                async with db.pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT role, content
                        FROM conversation_turns
                        WHERE session_id = $1
                        ORDER BY turn_number ASC
                        """,
                        _uuid.UUID(session_id),
                    )
                    transcript = [{"role": r["role"], "content": r["content"]} for r in rows]
        except Exception as e:
            logger.error("Failed to fetch turns for session %s: %s", session_id, e)

        try:
            # 30-second timeout allows sufficient window for feedback service to acknowledge
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{FEEDBACK_SERVICE_URL}/api/v1/feedback/generate",
                    json={
                        "session_id": session_id,
                        "interview_type": interview_type,
                        "difficulty": difficulty,
                        "language": language,
                        "target_company": target_company,
                        "transcript": transcript,
                    },
                )
                if response.status_code in (200, 201, 202):
                    logger.info(
                        "Feedback generation triggered successfully for session %s", session_id
                    )
                    return True
                else:
                    logger.warning(
                        "Feedback service returned %d for session %s: %s",
                        response.status_code, session_id, response.text[:200],
                    )
                    return False
        except httpx.TimeoutException:
            logger.error("Timeout calling feedback-service for session %s", session_id)
            return False
        except Exception as e:
            logger.error("Error calling feedback-service: %s", e)
            return False


# Global singleton instance of the outbox publisher
outbox_publisher = OutboxPublisher()
