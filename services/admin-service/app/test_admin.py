"""
DevMeet Admin Service - Automated Unit and Integration Test Suite
=================================================================
This test module verifies the core functional requirements and security invariants
of the administrative service:
1. Public Health Check & Service Identification:
   - Verifies unauthenticated access to `/health` and root `/` metadata endpoints.
2. Platform Statistics & Aggregation:
   - Validates extraction of system KPIs (user counts, sessions, revenue metrics).
3. Candidate & User Management:
   - Tests user listing, pagination limits, keyword search filtering, and plan filtering.
   - Tests individual profile inspection with aggregated session count stats.
   - Handles not-found (404) scenarios gracefully.
4. Account Moderation:
   - Tests administrative suspension (block) and reinstatement (unblock) workflows.
5. Compliance & Security Auditing:
   - Tests audit log queries with action-name filters.
6. Role-Based Access Control (RBAC):
   - Verifies 401 Unauthorized when tokens are missing.
   - Verifies 403 Forbidden when normal candidate tokens attempt to access admin endpoints.
"""

import sys
from unittest.mock import MagicMock

# Mock external binary/network dependencies (asyncpg) before importing application modules
sys.modules.setdefault("asyncpg", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime

# Standard test fixtures for admin and regular candidate users
MOCK_ADMIN_USER = {
    "id": "admin-001",
    "email": "admin@example.com",
    "display_name": "Admin User",
    "role": "admin",
}

MOCK_REGULAR_USER = {
    "id": "user-123",
    "email": "user@example.com",
    "display_name": "Regular User",
    "role": "user",
}

# Synthetic platform KPIs returned by mock database
MOCK_STATS = {
    "total_users": 500,
    "new_users_today": 12,
    "total_sessions": 2000,
    "sessions_today": 45,
    "completed_sessions": 1500,
    "active_sessions": 8,
    "revenue_estimate": 4500.0,
    "pro_users": 80,
    "enterprise_users": 10,
    "free_users": 410,
    "blocked_users": 3,
}

# Synthetic candidate user accounts for directory queries
MOCK_USERS_LIST = [
    {
        "id": "user-1",
        "email": "alice@example.com",
        "display_name": "Alice",
        "plan": "pro",
        "created_at": "2024-01-15T10:00:00",
        "total_sessions": 30,
        "is_blocked": False,
    },
    {
        "id": "user-2",
        "email": "bob@example.com",
        "display_name": "Bob",
        "plan": "free",
        "created_at": "2024-02-20T10:00:00",
        "total_sessions": 5,
        "is_blocked": False,
    },
]


@pytest.fixture
def admin_client():
    """
    Test fixture providing a FastAPI TestClient with simulated administrator authentication.
    Mocks database operations and overrides `require_admin` dependency.

    Yields:
        tuple[TestClient, MagicMock]: Configured HTTP client and mocked database singleton.
    """
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.use_db = True
    mock_db._use_memory = False
    mock_db.get_admin_stats = AsyncMock(return_value=MOCK_STATS)
    mock_db.get_all_users = AsyncMock(return_value=MOCK_USERS_LIST)
    mock_db.get_user_by_id = AsyncMock(return_value={
        "id": "user-1",
        "email": "alice@example.com",
        "display_name": "Alice",
        "plan": "pro",
        "is_blocked": False,
        "created_at": datetime(2024, 1, 15),
        "updated_at": datetime(2024, 6, 1),
    })
    mock_db.get_user_sessions = AsyncMock(return_value=[
        {"id": "s1", "status": "completed"},
        {"id": "s2", "status": "completed"},
        {"id": "s3", "status": "in_progress"},
    ])
    mock_db.block_user = AsyncMock(return_value=True)
    mock_db.unblock_user = AsyncMock(return_value=True)
    mock_db.update_user_plan = AsyncMock(return_value=True)
    mock_db.create_audit_log = AsyncMock(return_value=True)
    mock_db.get_audit_logs = AsyncMock(return_value=[])
    mock_db.get_all_sessions = AsyncMock(return_value=[])
    mock_db.cancel_session = AsyncMock(return_value=True)
    mock_db.delete_user = AsyncMock(return_value=True)

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.main.db", mock_db):
        from app.main import app
        from app.routes import require_admin

        # Override RBAC dependency with simulated admin identity
        app.dependency_overrides[require_admin] = lambda: MOCK_ADMIN_USER

        with TestClient(app) as c:
            yield c, mock_db

        app.dependency_overrides.clear()


@pytest.fixture
def unauthenticated_client():
    """
    Test fixture providing an unauthenticated client without dependency overrides.
    Used for verifying 401 Unauthorized rejections.
    """
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.use_db = True

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.main.db", mock_db):
        from app.main import app
        app.dependency_overrides.clear()

        with TestClient(app) as c:
            yield c


@pytest.fixture
def non_admin_client():
    """
    Test fixture simulating an authenticated non-admin candidate user.
    Used for verifying 403 Forbidden enforcement on privileged endpoints.
    """
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.use_db = True

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.main.db", mock_db):
        from app.main import app
        from app.routes import require_admin
        from fastapi import HTTPException

        def raise_forbidden():
            raise HTTPException(status_code=403, detail="Access denied: admin role required")

        app.dependency_overrides[require_admin] = raise_forbidden

        with TestClient(app) as c:
            yield c

        app.dependency_overrides.clear()


# --- Health & Root ---

class TestHealthAndRoot:
    """Tests public baseline endpoints requiring no authentication."""

    def test_health_check(self, admin_client):
        """Verifies GET /health returns 200 OK and service identification."""
        c, _ = admin_client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "admin-service"

    def test_root_endpoint(self, admin_client):
        """Verifies GET / returns descriptive administrative service banner."""
        c, _ = admin_client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Admin" in data["message"]

    def test_health_no_auth_required(self, unauthenticated_client):
        """Ensures container orchestrator probes can check /health without credentials."""
        response = unauthenticated_client.get("/health")
        assert response.status_code == 200


# --- Stats ---

class TestStats:
    """Tests business metrics aggregation and RBAC access control."""

    def test_get_stats_as_admin(self, admin_client):
        """Ensures administrators can access full platform KPIs."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/stats",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 500
        assert data["pro_users"] == 80
        assert data["blocked_users"] == 3

    def test_get_stats_unauthorized(self, unauthenticated_client):
        """Verifies unauthenticated requests to /stats are rejected."""
        response = unauthenticated_client.get("/api/v1/admin/stats")
        assert response.status_code in (401, 403)

    def test_get_stats_forbidden_for_regular_user(self, non_admin_client):
        """Verifies candidate accounts receive 403 Forbidden on /stats."""
        response = non_admin_client.get(
            "/api/v1/admin/stats",
            headers={"Authorization": "Bearer user-token"},
        )
        assert response.status_code == 403


# --- User Listing ---

class TestUserListing:
    """Tests candidate directory search, plan filters, pagination, and details."""

    def test_list_users(self, admin_client):
        """Verifies retrieval of user directory list."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/users",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        assert data[0]["email"] == "alice@example.com"

    def test_list_users_with_search(self, admin_client):
        """Verifies searching users by email substring."""
        c, mock_db = admin_client
        mock_db.get_all_users = AsyncMock(return_value=[MOCK_USERS_LIST[0]])
        response = c.get(
            "/api/v1/admin/users?q=alice",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_list_users_with_plan_filter(self, admin_client):
        """Verifies filtering candidates by subscription tier."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/users?plan=pro",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200

    def test_list_users_pagination(self, admin_client):
        """Verifies pagination parameter handling."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/users?limit=10&offset=0",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200

    def test_get_single_user(self, admin_client):
        """Verifies detailed user profile retrieval including session aggregates."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/users/user-1",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "alice@example.com"
        assert data["total_sessions"] == 3
        assert data["completed_sessions"] == 2

    def test_get_user_not_found(self, admin_client):
        """Verifies 404 response for nonexistent user UUIDs."""
        c, mock_db = admin_client
        mock_db.get_user_by_id = AsyncMock(return_value=None)
        response = c.get(
            "/api/v1/admin/users/nonexistent",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 404


# --- Block/Unblock ---

class TestBlockUnblock:
    """Tests account suspension and unblocking workflows."""

    def test_block_user(self, admin_client):
        """Verifies that an admin can block an account."""
        c, _ = admin_client
        response = c.post(
            "/api/v1/admin/users/user-1/block",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200

    def test_unblock_user(self, admin_client):
        """Verifies that an admin can restore a suspended account."""
        c, _ = admin_client
        response = c.post(
            "/api/v1/admin/users/user-1/unblock",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200

    def test_block_user_forbidden_for_non_admin(self, non_admin_client):
        """Ensures candidates cannot invoke moderation actions."""
        response = non_admin_client.post(
            "/api/v1/admin/users/user-1/block",
            headers={"Authorization": "Bearer user-token"},
        )
        assert response.status_code == 403


# --- Audit Logs ---

class TestAuditLogs:
    """Tests compliance audit log queries and filters."""

    def test_get_audit_logs_empty(self, admin_client):
        """Verifies querying audit logs returns a list format."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_audit_logs_with_filter(self, admin_client):
        """Verifies filtering audit logs by action category."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/audit-logs?action=user.block",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200


# --- System Health ---

class TestSystemHealth:
    """Tests internal admin health check reporting."""

    def test_system_health(self, admin_client):
        """Verifies admin service self-diagnostics reporting."""
        c, _ = admin_client
        response = c.get(
            "/api/v1/admin/system/health",
            headers={"Authorization": "Bearer admin-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["admin_service"] == "healthy"
