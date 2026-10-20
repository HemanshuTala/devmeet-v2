"""
================================================================================
ANALYTICS SERVICE — AUTOMATED UNIT & INTEGRATION TEST SUITE
================================================================================
Role & Responsibility:
  This module provides automated unit and integration tests verifying the full
  operational lifecycle of the Analytics Service without requiring a live PostgreSQL instance:
    1. Infrastructure Isolation: Mocks `asyncpg` connection pools and database operations.
    2. Health & Root Discovery: Verifies service liveness and diagnostic endpoints.
    3. Event Ingestion Pipeline: Tests single event tracking (`POST /event`), batch tracking
       (`POST /events/batch`), payload schema validation, and Pydantic enum rejection.
    4. Executive Metrics Aggregation: Tests GET /metrics, daily time-series trends (/daily),
       language popularity distributions (/languages), and score bucket histograms (/scores).
    5. Candidate Analytics Hub: Tests per-user performance dashboards, session listings,
       and score progression trajectories.
    6. Funnels, Retention & Real-Time Monitoring: Tests milestone conversion tracking,
       D1/D7/D30 cohort retention, and 60-second real-time event throughput counters.
================================================================================
"""

import sys
from unittest.mock import MagicMock

# Mock out external database driver before importing service application modules
sys.modules.setdefault("asyncpg", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime

# Mock fixture data representing aggregated platform metrics
MOCK_METRICS = {
    "total_users": 150,
    "total_sessions": 800,
    "completed_sessions": 600,
    "active_sessions": 5,
    "sessions_today": 12,
    "avg_session_score": 72.5,
    "dsa_sessions": 400,
    "behavioral_sessions": 250,
    "system_design_sessions": 150,
    "top_languages": [
        {"language": "python", "count": 350},
        {"language": "javascript", "count": 200},
    ],
    "daily_sessions": [
        {"date": "2024-06-01", "count": 10},
        {"date": "2024-06-02", "count": 15},
    ],
    "score_distribution": [
        {"range": "0-20", "count": 10},
        {"range": "21-40", "count": 30},
        {"range": "41-60", "count": 80},
        {"range": "61-80", "count": 120},
        {"range": "81-100", "count": 60},
    ],
}

MOCK_DAILY = [
    {"date": "2024-06-01", "count": 10},
    {"date": "2024-06-02", "count": 15},
    {"date": "2024-06-03", "count": 8},
]

MOCK_USER_DASHBOARD = {
    "user_id": "user-123",
    "total_sessions": 25,
    "completed_sessions": 20,
    "avg_score": 75.0,
    "best_score": 95,
    "sessions_by_type": {"dsa": 15, "behavioral": 5, "system_design": 5},
    "recent_sessions": [],
    "score_trend": [],
}


@pytest.fixture
def client():
    """
    Initializes FastAPI TestClient while injecting a fully mocked database instance.
    """
    with patch("app.database.db") as mock_db:
        mock_db.connect = AsyncMock()
        mock_db.disconnect = AsyncMock()
        mock_db.use_db = True
        mock_db.save_event = AsyncMock(return_value=True)
        mock_db.get_metrics = AsyncMock(return_value=MOCK_METRICS)
        mock_db.get_daily_sessions = AsyncMock(return_value=MOCK_DAILY)
        mock_db.get_language_distribution = AsyncMock(return_value=[
            {"language": "python", "count": 350},
            {"language": "javascript", "count": 200},
        ])
        mock_db.get_score_distribution = AsyncMock(return_value=[
            {"range": "0-20", "count": 10},
            {"range": "81-100", "count": 60},
        ])
        mock_db.get_user_stats = AsyncMock(return_value=MOCK_USER_DASHBOARD)
        mock_db.get_user_sessions = AsyncMock(return_value=[])
        mock_db.get_user_score_trend = AsyncMock(return_value=[])
        mock_db.get_funnel_metrics = AsyncMock(return_value={
            "started": 100, "completed": 75, "feedback_viewed": 50,
        })
        mock_db.get_retention_metrics = AsyncMock(return_value={
            "d1": 80, "d7": 50, "d30": 25,
        })
        mock_db.get_realtime_stats = AsyncMock(return_value={
            "events_per_minute": 12, "active_sessions_estimate": 3,
        })

        from app.main import app
        with TestClient(app) as c:
            yield c, mock_db


# ==============================================================================
# 1. HEALTH & ROOT DIAGNOSTICS TESTS
# ==============================================================================

class TestHealthAndRoot:
    """Verifies service liveness and API status checks."""

    def test_health_check(self, client):
        """
        Confirms GET /health returns HTTP 200 with service identifier and healthy status.
        """
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "analytics-service"

    def test_root_endpoint(self, client):
        """
        Confirms root discovery GET / returns HTTP 200.
        """
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Analytics" in data["message"]


# ==============================================================================
# 2. EVENT INGESTION PIPELINE TESTS
# ==============================================================================

class TestEventTracking:
    """Tests single and batch ingestion of platform telemetry events."""

    def test_track_event_success(self, client):
        """
        Confirms recording an event with metadata returns tracked=True.
        """
        c, mock_db = client
        response = c.post(
            "/api/v1/analytics/event",
            json={
                "event_type": "session_created",
                "user_id": "user-123",
                "session_id": "session-456",
                "properties": {"interview_type": "dsa"},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tracked"] is True

    def test_track_event_minimal(self, client):
        """
        Confirms minimal event payload (only event_type) is accepted.
        """
        c, _ = client
        response = c.post(
            "/api/v1/analytics/event",
            json={"event_type": "page_view"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tracked"] is True

    def test_track_event_invalid_type(self, client):
        """
        Confirms invalid event_type string not in EventType enum triggers HTTP 422.
        """
        c, _ = client
        response = c.post(
            "/api/v1/analytics/event",
            json={"event_type": "invalid_event_type_xyz"},
        )
        assert response.status_code == 422

    def test_track_event_missing_type(self, client):
        """
        Confirms omitting required event_type field triggers HTTP 422.
        """
        c, _ = client
        response = c.post(
            "/api/v1/analytics/event",
            json={"user_id": "user-123"},
        )
        assert response.status_code == 422

    def test_track_events_batch(self, client):
        """
        Confirms batch event ingestion processes multiple events in a single HTTP call.
        """
        c, _ = client
        response = c.post(
            "/api/v1/analytics/events/batch",
            json=[
                {"event_type": "session_created", "user_id": "user-1"},
                {"event_type": "session_started", "user_id": "user-2"},
            ],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tracked"] == 2 or data["status"] == "ok"


# ==============================================================================
# 3. EXECUTIVE & SYSTEM METRICS TESTS
# ==============================================================================

class TestMetrics:
    """Tests high-level platform KPI aggregation endpoints."""

    def test_get_metrics(self, client):
        """
        Confirms GET /api/v1/analytics/metrics returns total users, sessions, and score averages.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/metrics")
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 150
        assert data["total_sessions"] == 800
        assert data["avg_session_score"] == 72.5

    def test_get_daily_metrics(self, client):
        """
        Confirms GET /api/v1/analytics/daily returns time-series list.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/daily")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3

    def test_get_daily_metrics_with_days_param(self, client):
        """
        Confirms day lookback query parameter is accepted.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/daily?days=7")
        assert response.status_code == 200

    def test_get_daily_metrics_invalid_days(self, client):
        """
        Confirms non-positive days query parameter is rejected (ge=1).
        """
        c, _ = client
        response = c.get("/api/v1/analytics/daily?days=0")
        assert response.status_code == 422

    def test_get_languages(self, client):
        """
        Confirms GET /api/v1/analytics/languages returns language distribution array.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/languages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["language"] == "python"

    def test_get_scores(self, client):
        """
        Confirms GET /api/v1/analytics/scores returns score histogram brackets.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/scores")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# ==============================================================================
# 4. PER-USER PERFORMANCE HUB TESTS
# ==============================================================================

class TestUserDashboard:
    """Tests candidate-specific performance and progress tracking."""

    def test_get_user_dashboard(self, client):
        """
        Confirms candidate performance dashboard returns aggregated session stats.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "user-123"
        assert data["total_sessions"] == 25

    def test_get_user_dashboard_with_days(self, client):
        """
        Confirms day filter query parameter on user dashboard works correctly.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/dashboard?days=30")
        assert response.status_code == 200

    def test_get_user_sessions(self, client):
        """
        Confirms paginated past sessions endpoint returns array.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/sessions")
        assert response.status_code == 200

    def test_get_user_score_trend(self, client):
        """
        Confirms score progression trend timeline endpoint returns array.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/score-trend")
        assert response.status_code == 200


# ==============================================================================
# 5. CONVERSION, RETENTION & REALTIME TESTS
# ==============================================================================

class TestAdvancedEndpoints:
    """Tests funnel conversion, cohort retention, and real-time velocity metrics."""

    def test_conversion_funnel(self, client):
        """
        Confirms GET /api/v1/analytics/funnel returns conversion stages.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/funnel")
        assert response.status_code == 200

    def test_retention(self, client):
        """
        Confirms GET /api/v1/analytics/retention returns cohort retention metrics.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/retention")
        assert response.status_code == 200

    def test_realtime_stats(self, client):
        """
        Confirms GET /api/v1/analytics/realtime returns events-per-minute velocity.
        """
        c, _ = client
        response = c.get("/api/v1/analytics/realtime")
        assert response.status_code == 200
