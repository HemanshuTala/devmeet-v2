"""
Comprehensive unit tests for analytics-service.
Tests: health, event tracking, metrics, daily stats, user dashboard.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before importing app modules
sys.modules.setdefault("asyncpg", MagicMock())


import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime


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
            "started": 100, "completed": 75, "feedback_viewed": 50
        })
        mock_db.get_retention_metrics = AsyncMock(return_value={
            "d1": 80, "d7": 50, "d30": 25
        })
        mock_db.get_realtime_stats = AsyncMock(return_value={
            "events_per_minute": 12, "active_sessions_estimate": 3
        })

        from app.main import app

        with TestClient(app) as c:
            yield c, mock_db


# --- Health & Root ---

class TestHealthAndRoot:
    def test_health_check(self, client):
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "analytics-service"

    def test_root_endpoint(self, client):
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Analytics" in data["message"]


# --- Event Tracking ---

class TestEventTracking:
    def test_track_event_success(self, client):
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
        c, _ = client
        response = c.post(
            "/api/v1/analytics/event",
            json={"event_type": "page_view"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tracked"] is True

    def test_track_event_invalid_type(self, client):
        c, _ = client
        response = c.post(
            "/api/v1/analytics/event",
            json={"event_type": "invalid_event_type_xyz"},
        )
        assert response.status_code == 422

    def test_track_event_missing_type(self, client):
        c, _ = client
        response = c.post(
            "/api/v1/analytics/event",
            json={"user_id": "user-123"},
        )
        assert response.status_code == 422

    def test_track_events_batch(self, client):
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


# --- Metrics ---

class TestMetrics:
    def test_get_metrics(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/metrics")
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 150
        assert data["total_sessions"] == 800
        assert data["avg_session_score"] == 72.5

    def test_get_daily_metrics(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/daily")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3

    def test_get_daily_metrics_with_days_param(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/daily?days=7")
        assert response.status_code == 200

    def test_get_daily_metrics_invalid_days(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/daily?days=0")
        assert response.status_code == 422

    def test_get_languages(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/languages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["language"] == "python"

    def test_get_scores(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/scores")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# --- User Dashboard ---

class TestUserDashboard:
    def test_get_user_dashboard(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "user-123"
        assert data["total_sessions"] == 25

    def test_get_user_dashboard_with_days(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/dashboard?days=30")
        assert response.status_code == 200

    def test_get_user_sessions(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/sessions")
        assert response.status_code == 200

    def test_get_user_score_trend(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/user/user-123/score-trend")
        assert response.status_code == 200


# --- Advanced Endpoints ---

class TestAdvancedEndpoints:
    def test_conversion_funnel(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/funnel")
        assert response.status_code == 200

    def test_retention(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/retention")
        assert response.status_code == 200

    def test_realtime_stats(self, client):
        c, _ = client
        response = c.get("/api/v1/analytics/realtime")
        assert response.status_code == 200
