"""
Transactional Outbox pattern for the orchestrator service.

Instead of calling downstream services directly (fragile HTTP calls that can fail
after the DB transaction commits), we insert an event into the outbox table within
the same transaction. A background publisher polls unpublished events and dispatches
them reliably.

Usage in routes:
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("UPDATE sessions SET status='completed' ...")
            await emit_event(
                conn,
                event_type="session.completed",
                aggregate_type="session",
                aggregate_id=session_id,
                payload={"session_id": session_id, "user_id": user_id},
            )
"""
import asyncio
import json
import logging
import uuid
from typing import Optional

import httpx

from .database import db

logger = logging.getLogger("outbox")

FEEDBACK_SERVICE_URL = None  # Set from environment in start_publisher()


async def emit_event(
    conn,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict,
) -> str:
    """
    Insert an event into the outbox table within the caller's transaction.

    Must be called inside an active transaction on `conn` so the event
    is atomically committed with the domain change.

    Returns the event UUID.
    """
    event_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
        VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)
        """,
        uuid.UUID(event_id),
        event_type,
        aggregate_type,
        uuid.UUID(aggregate_id),
        json.dumps(payload),
    )
    logger.debug("Outbox event emitted: %s %s/%s", event_type, aggregate_type, aggregate_id)
    return event_id


class OutboxPublisher:
    """
    Background task that polls the outbox_events table for unpublished events
    and dispatches them to the appropriate downstream service.

    Runs as an asyncio task started on app startup and cancelled on shutdown.
    """

    def __init__(self, poll_interval: float = 5.0, batch_size: int = 20):
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self, feedback_service_url: str):
        """Start the background publisher loop."""
        global FEEDBACK_SERVICE_URL
        FEEDBACK_SERVICE_URL = feedback_service_url
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Outbox publisher started (interval=%.1fs)", self.poll_interval)

    async def stop(self):
        """Stop the background publisher."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Outbox publisher stopped")

    async def _poll_loop(self):
        """Main polling loop — fetch unpublished events and dispatch them."""
        while self._running:
            try:
                await self._process_batch()
            except Exception as e:
                logger.error("Outbox publisher error: %s", e)
            await asyncio.sleep(self.poll_interval)

    async def _process_batch(self):
        """Fetch and process a batch of unpublished events."""
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
        """Dispatch a single event to the appropriate handler. Returns True on success."""
        event_type = row["event_type"]
        payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])

        try:
            if event_type == "session.completed":
                return await self._handle_session_completed(payload)
            else:
                logger.warning("Unknown outbox event type: %s", event_type)
                # Mark as published anyway to avoid infinite retry
                return True
        except Exception as e:
            logger.error(
                "Failed to dispatch outbox event %s (type=%s): %s",
                row["id"], event_type, e,
            )
            return False

    async def _handle_session_completed(self, payload: dict) -> bool:
        """
        Dispatch session.completed → feedback-service to generate feedback.
        Replaces the old direct HTTP call that was outside the DB transaction.
        """
        if not FEEDBACK_SERVICE_URL:
            logger.warning("FEEDBACK_SERVICE_URL not configured, skipping dispatch")
            return False

        session_id = payload.get("session_id")
        user_id = payload.get("user_id")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{FEEDBACK_SERVICE_URL}/api/v1/feedback/generate",
                    json={"session_id": session_id, "user_id": user_id},
                )
                if response.status_code in (200, 201, 202):
                    logger.info(
                        "Feedback generation triggered for session %s", session_id
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


# Singleton instance
outbox_publisher = OutboxPublisher()
