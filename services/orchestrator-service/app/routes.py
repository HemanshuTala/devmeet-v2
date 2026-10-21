"""
Interview Orchestrator Routes Aggregator.
========================================
Prefix: `/api/v1/sessions`

Aggregates modular routers:
- `routers.sessions`: Lifecycle (create, list, get, start, complete, cancel, heartbeat).
- `routers.turns`: Dialogue turns transcription, pause, resume.
- `routers.proctoring`: Code submissions, anti-cheating, recording consent.
- `routers.snapshots`: S3 snapshot backups and restore.

Maintains backward-compatibility re-exports for service test suites and dependencies.
"""

from fastapi import APIRouter

# Re-exports for dependencies, database, caching & test suite monkeypatching
from .database import db
from .redis_client import redis_lock
from .s3_service import s3_service
from .idempotency import check_idempotency
from .outbox import emit_event
from .clients import (
    get_http_client,
    _get_http_client,
    fetch_seed_question,
    verify_token,
    check_quota,
    AUTH_SERVICE_URL,
    USER_SERVICE_URL,
    SEARCH_SERVICE_URL,
)
from .models import (
    CreateSessionRequest,
    SessionResponse,
    TurnResponse,
    CreateTurnRequest,
    InterviewType,
    Difficulty,
    InterviewStatus,
    CodeSubmission,
    validate_state_transition,
    validate_pause_window,
    validate_cheating_threshold,
)
from .routers.deps import (
    security,
    AI_INTERVIEWER_URL,
    assert_no_active_session,
    clear_active_session_for_user,
    get_current_user,
    get_token_from_credentials,
    get_session_cached,
)

# Sub-routers
from .routers.sessions import router as sessions_router
from .routers.turns import router as turns_router
from .routers.proctoring import (
    router as proctoring_router,
    CheatingReportRequest,
    RecordingConsentRequest,
)
from .routers.snapshots import (
    router as snapshots_router,
    _upload_session_snapshot_to_s3,
)

# Root sessions router aggregating sub-routers
router = APIRouter()

# Mount sub-routers
router.include_router(sessions_router)
router.include_router(turns_router)
router.include_router(proctoring_router)
router.include_router(snapshots_router)
