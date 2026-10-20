"""
Interview Orchestrator Service Application Entry Point.
=======================================================
Port: 8003
Service Responsibility:
-----------------------
The Interview Orchestrator Service is the central mission-critical coordinator
of the DevMeet platform. It manages interview session state machines, proctoring
events, video room allocations, inter-service calls, and feedback triggering.

Key Architectural Responsibilities:
-----------------------------------
1. Finite State Machine (FSM):
   Coordinates session state transitions:
   `created` -> `active` -> `paused` -> `completed` / `abandoned` / `expired`.
2. Concurrency and Distributed Locks:
   Uses Redis locks (`session_lock:{session_id}`) to serialize concurrent candidate
   actions and avoid split-brain state mutations.
3. Transactional Outbox Publisher:
   Runs an asynchronous background worker (`outbox_publisher`) adhering to the
   Transactional Outbox Pattern. When an interview completes, completion events
   are atomically written to PostgreSQL `outbox_events` and reliably dispatched
   to `feedback-service:8007` with automatic retries and exponential backoff.
4. Proctoring Event Ingestion:
   Collects tab-switch, face-absence, and multi-face violation telemetry from the client
   and calculates real-time integrity penalties.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import db
from .routes import router
from .outbox import outbox_publisher
from .middleware import RequestIDMiddleware

# Upstream Feedback Service URL for outbox event delivery
FEEDBACK_SERVICE_URL = os.getenv("FEEDBACK_SERVICE_URL", "http://localhost:8007")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the startup and shutdown lifecycles of the Orchestrator service.

    Startup:
    1. Connects to PostgreSQL connection pool via `asyncpg`.
    2. Initializes and launches the background Transactional Outbox publisher loop
       to poll and dispatch pending interview completion events.

    Shutdown:
    1. Gracefully signals the outbox publisher loop to terminate.
    2. Closes database connection pools.
    """
    # ─── Startup Phase ───
    await db.connect()
    await outbox_publisher.start(FEEDBACK_SERVICE_URL)
    yield
    # ─── Shutdown Phase ───
    await outbox_publisher.stop()
    await db.disconnect()


# Initialize FastAPI application
app = FastAPI(
    title="Interview Orchestrator Service",
    description="Session management, interview state machine, proctoring, and event coordination",
    version="1.0.0",
    lifespan=lifespan
)

# ─── Cross-Origin Resource Sharing (CORS) ─────────────────────────────────────
# Allows secure credentials and WebSocket/HTTP traffic from frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Distributed Tracing Middleware ───────────────────────────────────────────
# Injects and propagates `X-Request-ID` across all inter-service communications
app.add_middleware(RequestIDMiddleware)

# Mount all interview session routes under `/api/v1/interviews`
app.include_router(router)


@app.get("/health")
async def health_check():
    """
    Standard microservice health probe returning container status.
    """
    return {"status": "healthy", "service": "orchestrator-service"}


@app.get("/")
async def root():
    """
    Diagnostic root message for orchestrator service.
    """
    return {"message": "Interview Orchestrator Service API"}


if __name__ == "__main__":
    # Local development server runner
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
