"""
Orchestrator Service — unit tests for session lifecycle (create, start, complete, cancel).
Uses FastAPI TestClient with mocked database.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before any app imports
sys.modules.setdefault("asyncpg", MagicMock())
_mock_botocore = MagicMock()
_mock_botocore.exceptions = MagicMock()
_mock_botocore.exceptions.ClientError = Exception
_mock_botocore.exceptions.NoCredentialsError = Exception
sys.modules.setdefault("boto3", MagicMock())
sys.modules.setdefault("botocore", _mock_botocore)
sys.modules.setdefault("botocore.exceptions", _mock_botocore.exceptions)

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.get_session = AsyncMock(return_value=None)
    mock_db.create_session = AsyncMock(return_value=None)
    mock_db.update_session_status = AsyncMock(return_value=None)
    mock_db.count_active_sessions = AsyncMock(return_value=0)
    mock_db.get_user_sessions = AsyncMock(return_value=[])
    mock_db.save_turn = AsyncMock()
    mock_db.get_session_turns = AsyncMock(return_value=[])

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.routes.redis_lock") as mock_redis:
        mock_redis.get_cache = AsyncMock(return_value=None)
        mock_redis.set_cache = AsyncMock()
        mock_redis.invalidate_cache = AsyncMock()
        mock_redis.get_user_active_session = AsyncMock(return_value=None)
        mock_redis.set_user_active_session = AsyncMock()
        mock_redis.clear_user_active_session = AsyncMock()

        from contextlib import asynccontextmanager
        @asynccontextmanager
        async def fake_lock(*a, **kw):
            yield True
        mock_redis.acquire_lock = fake_lock

        from app.main import app
        with TestClient(app) as c:
            yield c, mock_db


def _mock_jwt(monkeypatch):
    """Patch JWT verification to return a fixed user."""
    async def fake_verify(token):
        return {
            "id": "user-1", "sub": "user-1", "role": "user", "email": "test@example.com",
        }
    monkeypatch.setattr("app.routes.verify_token", fake_verify)


def test_health_check(client):
    c, _ = client
    resp = c.get("/health")
    assert resp.status_code == 200
    assert resp.json()["service"] == "orchestrator-service"


def test_root(client):
    c, _ = client
    resp = c.get("/")
    assert resp.status_code == 200


def test_create_session(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.create_session = AsyncMock(return_value={
        "id": "sess-1",
        "user_id": "user-1",
        "interview_type": "dsa",
        "difficulty": "medium",
        "duration_minutes": 45,
        "status": "created",
        "created_at": "2026-07-12T10:00:00Z",
        "updated_at": "2026-07-12T10:00:00Z",
        "started_at": None,
        "completed_at": None,
        "elapsed_seconds": 0,
        "tab_switch_count": 0,
        "paste_count": 0,
    })
    mock_db.count_active_sessions = AsyncMock(return_value=0)

    async def fake_quota(user_id, token):
        return True
    monkeypatch.setattr("app.routes.check_quota", fake_quota)

    async def fake_assert_no_active(*a, **kw):
        pass
    monkeypatch.setattr("app.routes.assert_no_active_session", fake_assert_no_active)

    async def fake_seed(*a, **kw):
        return None
    monkeypatch.setattr("app.routes.fetch_seed_question", fake_seed)

    resp = c.post("/api/v1/sessions", json={
        "interview_type": "dsa",
        "difficulty": "medium",
        "duration_minutes": 45,
    }, headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 201
    assert resp.json()["status"] == "created"


def test_create_session_invalid_type(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.count_active_sessions = AsyncMock(return_value=0)

    resp = c.post("/api/v1/sessions", json={
        "interview_type": "invalid_type",
        "difficulty": "easy",
    }, headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code in (400, 422)


def test_get_session(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.get_session = AsyncMock(return_value={
        "id": "sess-1",
        "user_id": "user-1",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "duration_minutes": 30,
        "status": "created",
        "created_at": "2026-07-12T10:00:00Z",
        "updated_at": "2026-07-12T10:00:00Z",
        "started_at": None,
        "completed_at": None,
        "elapsed_seconds": 0,
        "tab_switch_count": 0,
        "paste_count": 0,
    })

    resp = c.get("/api/v1/sessions/sess-1", headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 200
    assert resp.json()["id"] == "sess-1"


def test_start_session(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.get_session = AsyncMock(return_value={
        "id": "sess-1", "user_id": "user-1", "status": "created",
        "interview_type": "dsa", "difficulty": "easy", "duration_minutes": 30,
        "created_at": "2026-07-12T10:00:00Z", "updated_at": "2026-07-12T10:00:00Z",
        "started_at": None, "completed_at": None,
        "elapsed_seconds": 0, "tab_switch_count": 0, "paste_count": 0,
    })
    mock_db.update_session_status = AsyncMock(return_value={
        "id": "sess-1", "user_id": "user-1", "status": "in_progress",
        "interview_type": "dsa", "difficulty": "easy", "duration_minutes": 30,
        "created_at": "2026-07-12T10:00:00Z", "updated_at": "2026-07-12T10:01:00Z",
        "started_at": "2026-07-12T10:01:00Z", "completed_at": None,
        "elapsed_seconds": 0, "tab_switch_count": 0, "paste_count": 0,
    })

    resp = c.post("/api/v1/sessions/sess-1/start", headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_cancel_session(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.get_session = AsyncMock(return_value={
        "id": "sess-1", "user_id": "user-1", "status": "created",
        "interview_type": "dsa", "difficulty": "easy", "duration_minutes": 30,
        "created_at": "2026-07-12T10:00:00Z", "updated_at": "2026-07-12T10:00:00Z",
        "started_at": None, "completed_at": None,
        "elapsed_seconds": 0, "tab_switch_count": 0, "paste_count": 0,
    })
    mock_db.update_session_status = AsyncMock(return_value=None)

    resp = c.post("/api/v1/sessions/sess-1/cancel", headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_cancel_completed_session_fails(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.get_session = AsyncMock(return_value={
        "id": "sess-1", "user_id": "user-1", "status": "completed",
        "interview_type": "dsa", "difficulty": "easy", "duration_minutes": 30,
        "created_at": "2026-07-12T10:00:00Z", "updated_at": "2026-07-12T10:00:00Z",
        "started_at": None, "completed_at": None,
        "elapsed_seconds": 0, "tab_switch_count": 0, "paste_count": 0,
    })

    resp = c.post("/api/v1/sessions/sess-1/cancel", headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code in (400, 409)


def test_get_session_not_found(client, monkeypatch):
    c, mock_db = client
    _mock_jwt(monkeypatch)
    mock_db.get_session = AsyncMock(return_value=None)

    resp = c.get("/api/v1/sessions/nonexistent", headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 404
