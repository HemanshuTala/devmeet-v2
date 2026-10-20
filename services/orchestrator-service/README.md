# Orchestrator Service (`orchestrator-service`)

## 1. Service Overview

The **Orchestrator Service** is the central state machine and workflow coordinator of DevMeet. It governs the entire interview session lifecycle from creation, turn management, and anti-cheat monitoring to session completion and outbox event dispatch.

### Key Responsibilities
- **Interview State Machine**: Manages transitions between `created`, `in_progress`, `paused`, `completed`, and `cancelled` with strict state validation.
- **Concurrent Session Guard**: Enforces that a user can only have at most one active interview session at any time using distributed Redis locks.
- **Transactional Outbox Pattern**: When a session completes, the status change and an outbox event (`session.completed`) are written to PostgreSQL inside the same atomic database transaction, preventing dual-write inconsistency.
- **Turn Orchestration**: Manages sequential interview dialogue turns in `conversation_turns`.
- **Proctoring Telemetry**: Tracks candidate tab switching, copy-pasting, and camera gaze telemetry.
- **Disaster Recovery Snapshots**: Exports and restores session state to AWS S3.

---

## 2. Session Lifecycle & State Machine

```mermaid
stateDiagram-v2
    [*] --> created : POST /sessions
    created --> in_progress : POST /{id}/start
    in_progress --> paused : POST /{id}/pause
    paused --> in_progress : POST /{id}/resume
    in_progress --> completed : POST /{id}/complete
    paused --> completed : POST /{id}/complete
    created --> cancelled : POST /{id}/cancel
    in_progress --> cancelled : POST /{id}/cancel
    completed --> [*]
    cancelled --> [*]
```

### Turn Processing Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate
    participant Orch as Orchestrator Service (:8003)
    participant DB as PostgreSQL
    participant AI as AI Interviewer (:8004)
    participant Outbox as Outbox Publisher / RabbitMQ

    Candidate->>Orch: POST /sessions/{id}/turns (Candidate Message)
    Orch->>DB: INSERT conversation_turns (role='candidate')
    Orch->>AI: POST /interview/question/stream (SSE)
    AI-->>Orch: Streamed AI Interviewer Response
    Orch->>DB: INSERT conversation_turns (role='interviewer')
    Orch-->>Candidate: Return turn confirmation

    Note over Candidate,Outbox: Candidate finishes interview
    Candidate->>Orch: POST /sessions/{id}/complete
    rect rgb(240, 248, 255)
        Note over Orch,DB: Atomic Database Transaction
        Orch->>DB: UPDATE sessions SET status='completed'
        Orch->>DB: INSERT outbox_events (event_type='session.completed')
    end
    Orch->>Orch: Release Redis active session lock
    Orch-->>Candidate: Return completed session metadata
```

---

## 3. Modular Code Structure

```text
services/orchestrator-service/
├── app/
│   ├── clients.py           # HTTP clients for Auth, User, and Search services
│   ├── routes.py            # Cleaned FastAPI route controllers
│   ├── database.py          # PostgreSQL session, turn, and code operations
│   ├── redis_client.py      # Redis distributed locks and session caching
│   ├── outbox.py            # Transactional outbox event emitter
│   ├── idempotency.py       # Request deduplication with 24-hr expiry
│   ├── s3_service.py        # S3 snapshot backup and disaster recovery
│   ├── models.py            # Pydantic schemas & state machine validators
│   ├── middleware.py        # Correlation ID tracing middleware
│   └── test_orchestrator.py # 9 unit tests verifying session state transitions
├── Dockerfile
├── requirements.txt
└── README.md
```

---

## 4. API Endpoints

### `POST /api/v1/sessions`
- **Purpose**: Creates a new interview session.
- **Workflow**:
  1. Validates JWT with `auth-service`.
  2. Concurrently checks quota with `user-service` and checks for active sessions in Redis.
  3. Fetches domain seed question from `search-service`.
  4. Inserts session into `sessions` table in `created` status.
  5. Acquires active session key in Redis: `user:{user_id}:active_session`.

### `POST /api/v1/sessions/{id}/turns`
- **Purpose**: Submits candidate turn and persists both candidate input and AI interviewer response.

### `POST /api/v1/sessions/{id}/complete`
- **Purpose**: Completes interview session atomically, writing a `session.completed` outbox record.

### `POST /api/v1/sessions/{id}/cheating`
- **Purpose**: Increments cheating telemetry counters (tab switch count, paste count) for proctoring audits.

---

## 5. Testing & Verification

```bash
# Run orchestrator service tests
$env:PYTHONPATH="E:\AI INTERVIEW\services\orchestrator-service"
python -m pytest services/orchestrator-service/app/test_orchestrator.py -v
```

---

## 6. Common Technical Interview Questions & Answers

### Q1: What is the Transactional Outbox Pattern and why do you use it here?
> **Answer**: In a microservices architecture, updating a database and publishing an event to a message queue (RabbitMQ) is a dual-write problem. If the database update succeeds but the message broker crashes before the message is published, the event is lost. By inserting the event into the `outbox_events` table inside the *exact same PostgreSQL database transaction* as the session status update, atomicity is guaranteed by the ACID database. A background relay worker then reads unpublished outbox events and reliably publishes them to RabbitMQ.

### Q2: How do you prevent a user from opening two simultaneous interview tabs?
> **Answer**: We use a two-tiered check:
> 1. Fast path: Redis distributed key `user:{user_id}:active_session` is checked first.
> 2. Authoritative path: If not in cache, PostgreSQL is queried for any session in `created` or `in_progress` status for that `user_id`. If found, the endpoint rejects the request with HTTP 409 Conflict.
