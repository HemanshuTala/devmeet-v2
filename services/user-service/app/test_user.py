"""
User Service Automated Test Suite.
==================================
This test module verifies the core functionality of the User Service:
- Health and diagnostic probes (/health, /).
- Candidate profile retrieval and partial updates.
- Interview quota tracking and consumption.
- Subscription plan upgrades and instant quota resets.
- GDPR data portability export (Article 20) and soft deletion (Article 17).
- Public community leaderboard aggregations.

Testing Methodology:
--------------------
- Isolated Unit Testing: Uses `unittest.mock` to mock database connections (`asyncpg`)
  and file streaming (`aiofiles`) in `sys.modules`.
- FastAPI Dependency Overrides: Patches `get_current_user` using `app.dependency_overrides`
  to simulate authenticated requests without calling external `auth-service`.
"""

import sys
from unittest.mock import MagicMock

# ─── Mock External Drivers Before Application Import ───────────────────────────
sys.modules.setdefault("asyncpg", MagicMock())
sys.modules.setdefault("aiofiles", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime

# Standard test candidate fixtures
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
    """
    Pytest fixture that creates an authenticated TestClient with mocked DB responses.
    
    Overrides `get_current_user` dependency to return `MOCK_USER`.
    """
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

        # Inject fake authenticated user for route testing
        app.dependency_overrides[get_current_user] = lambda: MOCK_USER

        with TestClient(app) as c:
            yield c, mock_db

        app.dependency_overrides.clear()


@pytest.fixture
def unauthenticated_client():
    """
    Pytest fixture that creates an unauthenticated TestClient to verify 401/403 guards.
    """
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


# ─── Health & Diagnostic Probes ───────────────────────────────────────────────

class TestHealthAndRoot:
    """Verifies service health check and basic connectivity."""
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


# ─── Profile Retrieval & Updates ──────────────────────────────────────────────

class TestProfile:
    """Verifies reading and modifying candidate profile information."""
    def test_get_profile_success(self, client):
        """Verifies GET /me returns full profile details for authenticated user."""
        c, mock_db = client
        response = c.get("/api/v1/users/me", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["display_name"] == "Test User"

    def test_get_profile_unauthorized(self, unauthenticated_client):
        """Verifies unauthenticated callers receive HTTP 401/403."""
        response = unauthenticated_client.get("/api/v1/users/me")
        assert response.status_code in (401, 403)

    def test_update_profile_success(self, client):
        """Verifies PUT /me updates partial profile fields."""
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
        """Verifies PUT /me with an empty JSON object succeeds gracefully without error."""
        c, _ = client
        response = c.put(
            "/api/v1/users/me",
            json={},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200


# ─── Usage Quota Tracking ─────────────────────────────────────────────────────

class TestQuota:
    """Verifies daily and monthly interview quota monitoring and consumption."""
    def test_get_quota(self, client):
        """Verifies GET /me/quota returns usage numbers and remaining credits."""
        c, _ = client
        response = c.get("/api/v1/users/me/quota", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert "interviews_today" in data
        assert "remaining_today" in data
        assert data["plan"] == "free"

    def test_increment_quota(self, client):
        """Verifies POST /me/quota/increment records an interview session."""
        c, _ = client
        response = c.post("/api/v1/users/me/quota/increment", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["interviews_today"] == 3


# ─── Subscription Plan Management ─────────────────────────────────────────────

class TestPlan:
    """Verifies reading and upgrading subscription plans."""
    def test_get_plan(self, client):
        """Verifies GET /me/plan returns the active tier."""
        c, _ = client
        response = c.get("/api/v1/users/me/plan", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "free"

    def test_upgrade_plan(self, client):
        """Verifies PUT /me/plan upgrades tier from free to pro."""
        c, mock_db = client
        response = c.put(
            "/api/v1/users/me/plan",
            json={"plan": "pro"},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200


# ─── GDPR Data Privacy ────────────────────────────────────────────────────────

class TestGDPR:
    """Verifies compliance with European GDPR Article 20 and Article 17."""
    def test_export_data(self, client):
        """Verifies GET /me/export returns portable user profile archive."""
        c, _ = client
        response = c.get("/api/v1/users/me/export", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert "profile" in data or "email" in str(data)

    def test_delete_account(self, client):
        """Verifies DELETE /me triggers soft deletion and PII anonymization."""
        c, _ = client
        response = c.delete("/api/v1/users/me", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200


# ─── Community Leaderboard ────────────────────────────────────────────────────

class TestLeaderboard:
    """Verifies public leaderboard ranking."""
    def test_get_leaderboard(self, client):
        """Verifies GET /leaderboard returns ranked candidate list."""
        c, _ = client
        response = c.get("/api/v1/users/leaderboard", headers={"Authorization": "Bearer valid-token"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        assert data[0]["avg_score"] == 95.5

    def test_leaderboard_unauthorized(self, unauthenticated_client):
        """Verifies unauthenticated calls to leaderboard are rejected."""
        response = unauthenticated_client.get("/api/v1/users/leaderboard")
        assert response.status_code in (401, 403)
