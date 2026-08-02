"""
Comprehensive unit tests for user-service.
Tests: health, profile CRUD, quota, plan management, GDPR export/delete, leaderboard.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before importing app modules
sys.modules.setdefault("asyncpg", MagicMock())

sys.modules.setdefault("aiofiles", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime


MOCK_USER = {
    "id": "user-123",
    "email": "test@example.com",
    "display_name": "Test User",
    "role": "user",
}

MOCK_PROFILE = {
    "id": "user-123",
    "email": "test@example.com",
    "display_name": "Test User",
    "avatar_url": None,
    "bio": "A developer",
    "target_companies": ["Google", "Meta"],
    "skills": ["Python", "Go"],
    "interview_reminder_enabled": True,
    "profile_public": True,
    "created_at": datetime(2024, 1, 1),
    "updated_at": datetime(2024, 6, 1),
}


@pytest.fixture
def client():
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.get_user_by_id = AsyncMock(return_value=MOCK_PROFILE)
    mock_db.update_user_profile = AsyncMock(return_value=MOCK_PROFILE)
    mock_db.get_user_quota = AsyncMock(return_value={
        "interviews_today": 2,
        "interviews_this_month": 15,
        "last_reset_date": datetime(2024, 6, 1),
        "plan": "free",
    })
    mock_db.get_plan_limits = AsyncMock(return_value={
        "daily": 5,
        "monthly": 30,
    })
    mock_db.get_user_plan = AsyncMock(return_value={
        "plan": "free",
        "created_at": datetime(2024, 1, 1),
        "updated_at": datetime(2024, 6, 1),
    })
    mock_db.update_user_plan = AsyncMock(return_value=True)
    mock_db.reset_quota = AsyncMock(return_value=None)
    mock_db.increment_quota = AsyncMock(return_value={
        "interviews_today": 3,
        "interviews_this_month": 16,
        "last_reset_date": datetime(2024, 6, 1),
        "plan": "free",
    })
    mock_db.soft_delete_user = AsyncMock(return_value={
        "id": "user-123",
        "deleted_at": datetime(2024, 6, 15),
    })
    mock_db.get_leaderboard = AsyncMock(return_value=[
        {
            "user_id": "user-1",
            "display_name": "Top Player",
            "avatar_url": None,
            "avg_score": 95.5,
            "sessions_count": 42,
        },
        {
            "user_id": "user-2",
            "display_name": "Runner Up",
            "avatar_url": None,
            "avg_score": 88.0,
            "sessions_count": 30,
        },
    ])

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.main.db", mock_db):
        from app.main import app
        from app.routes import get_current_user

        app.dependency_overrides[get_current_user] = lambda: MOCK_USER

        with TestClient(app) as c:
            yield c, mock_db

        app.dependency_overrides.clear()


@pytest.fixture
def unauthenticated_client():
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.main.db", mock_db):
        from app.main import app
        app.dependency_overrides.clear()

        with TestClient(app) as c:
            yield c


# --- Health & Root ---

class TestHealthAndRoot:
    def test_health_check(self, client):
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "user-service"

    def test_root_endpoint(self, client):
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "User Service" in data["message"]


# --- Profile ---

class TestProfile:
    def test_get_profile_success(self, client):
        c, mock_db = client
        response = c.get("/api/v1/users/me", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["display_name"] == "Test User"

    def test_get_profile_unauthorized(self, unauthenticated_client):
        response = unauthenticated_client.get("/api/v1/users/me")
        assert response.status_code in (401, 403)

    def test_update_profile_success(self, client):
        c, mock_db = client
        updated = {**MOCK_PROFILE, "display_name": "Updated Name", "bio": "New bio"}
        mock_db.update_user_profile = AsyncMock(return_value=updated)

        response = c.put(
            "/api/v1/users/me",
            json={"display_name": "Updated Name", "bio": "New bio"},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Updated Name"

    def test_update_profile_empty_body(self, client):
        c, _ = client
        response = c.put(
            "/api/v1/users/me",
            json={},
            headers={"Authorization": "Bearer valid-token"},
        )
        # Empty update should still succeed (all fields optional)
        assert response.status_code == 200


# --- Quota ---

class TestQuota:
    def test_get_quota(self, client):
        c, _ = client
        response = c.get("/api/v1/users/me/quota", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert "interviews_today" in data
        assert "remaining_today" in data
        assert data["plan"] == "free"

    def test_increment_quota(self, client):
        c, _ = client
        response = c.post("/api/v1/users/me/quota/increment", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["interviews_today"] == 3


# --- Plan ---

class TestPlan:
    def test_get_plan(self, client):
        c, _ = client
        response = c.get("/api/v1/users/me/plan", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "free"

    def test_upgrade_plan(self, client):
        c, mock_db = client
        response = c.put(
            "/api/v1/users/me/plan",
            json={"plan": "pro"},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200


# --- GDPR ---

class TestGDPR:
    def test_export_data(self, client):
        c, _ = client
        response = c.get("/api/v1/users/me/export", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert "profile" in data or "email" in str(data)

    def test_delete_account(self, client):
        c, _ = client
        response = c.delete("/api/v1/users/me", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200


# --- Leaderboard ---

class TestLeaderboard:
    def test_get_leaderboard(self, client):
        c, _ = client
        response = c.get("/api/v1/users/leaderboard", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        assert data[0]["avg_score"] == 95.5

    def test_leaderboard_unauthorized(self, unauthenticated_client):
        response = unauthenticated_client.get("/api/v1/users/leaderboard")
        assert response.status_code in (401, 403)
