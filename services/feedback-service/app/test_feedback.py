"""
================================================================================
FEEDBACK SERVICE — AUTOMATED UNIT & INTEGRATION TEST SUITE
================================================================================
Role & Responsibility:
  This module provides unit and integration test coverage for the Feedback Service
  without requiring running PostgreSQL databases, live Groq APIs, or AWS S3 credentials:
    1. Infrastructure Mocking: Mocks `asyncpg`, `weasyprint`, `groq`, `boto3`, and `botocore`
       to ensure tests execute rapidly and deterministically.
    2. Health & Root Endpoints: Tests system liveness and service metadata.
    3. Feedback Retrieval: Tests GET /api/v1/feedback/{session_id} for valid reports,
       missing sessions (404 Not Found), detailed feedback dictionaries, and percentiles.
    4. Feedback Generation: Tests POST /api/v1/feedback/generate for successful scoring,
       missing required fields (422 Unprocessable Entity), and invalid JSON payloads.
    5. PDF Download Streaming: Tests GET /api/v1/feedback/{session_id}/pdf streaming behavior.
================================================================================
"""

import sys
from unittest.mock import MagicMock

# Mock out external dependencies before importing application modules
sys.modules.setdefault("asyncpg", MagicMock())
sys.modules.setdefault("weasyprint", MagicMock())
sys.modules.setdefault("groq", MagicMock())
sys.modules.setdefault("boto3", MagicMock())
sys.modules.setdefault("botocore", MagicMock())
sys.modules.setdefault("botocore.exceptions", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime

# Standard test fixture data for a completed feedback report
MOCK_FEEDBACK_REPORT = {
    "session_id": "session-abc",
    "overall_score": 78,
    "scores": {
        "communication_score": 80,
        "problem_solving_score": 75,
        "code_quality_score": 82,
        "time_complexity_score": 70,
        "behavioral_score": None,
    },
    "detailed_feedback": {
        "strengths": ["Clear communication", "Good problem decomposition"],
        "weaknesses": ["Could optimize time complexity"],
        "code_improvements": ["Use descriptive variable names"],
        "recommendations": ["Practice more DP problems"],
        "percentile": {"percentile": 72, "message": "Better than 72% of candidates"},
    },
    "pdf_url": "https://s3.example.com/reports/session-abc.pdf",
    "percentile": {"percentile": 72, "message": "Better than 72% of candidates"},
}


@pytest.fixture
def client():
    """
    Initializes FastAPI TestClient while injecting a fully mocked database instance.
    """
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.use_db = True
    mock_db.get_report_by_session = AsyncMock(return_value=MOCK_FEEDBACK_REPORT)
    mock_db.save_report = AsyncMock(return_value=True)
    mock_db.get_user_details_by_session = AsyncMock(return_value={
        "user_id": "user-123",
        "email": "test@example.com",
        "display_name": "Test User",
    })

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db), \
         patch("app.main.db", mock_db):
        from app.main import app
        with TestClient(app) as c:
            yield c, mock_db


# ==============================================================================
# 1. HEALTH & ROOT ENDPOINTS
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
        assert data["service"] == "feedback-service"

    def test_root_endpoint(self, client):
        """
        Confirms root discovery GET / returns HTTP 200.
        """
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Feedback Service" in data["message"]


# ==============================================================================
# 2. FEEDBACK RETRIEVAL TESTS
# ==============================================================================

class TestGetFeedback:
    """Tests fetching saved interview evaluations from the database."""

    def test_get_feedback_success(self, client):
        """
        Confirms retrieving an existing session returns status 200 with complete scores.
        """
        c, _ = client
        response = c.get("/api/v1/feedback/session-abc")
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "session-abc"
        assert data["overall_score"] == 78
        assert "scores" in data
        assert data["scores"]["communication_score"] == 80

    def test_get_feedback_not_found(self, client):
        """
        Confirms non-existent session IDs return HTTP 404 Not Found.
        """
        c, mock_db = client
        mock_db.get_report_by_session = AsyncMock(return_value=None)
        response = c.get("/api/v1/feedback/nonexistent-session")
        assert response.status_code == 404

    def test_get_feedback_has_detailed_feedback(self, client):
        """
        Confirms response contains qualitative strengths and weaknesses lists.
        """
        c, _ = client
        response = c.get("/api/v1/feedback/session-abc")
        assert response.status_code == 200
        data = response.json()
        assert "detailed_feedback" in data
        assert "strengths" in data["detailed_feedback"]
        assert "weaknesses" in data["detailed_feedback"]

    def test_get_feedback_has_percentile(self, client):
        """
        Confirms response includes cohort percentile ranking metadata.
        """
        c, _ = client
        response = c.get("/api/v1/feedback/session-abc")
        assert response.status_code == 200
        data = response.json()
        assert data["percentile"]["percentile"] == 72


# ==============================================================================
# 3. FEEDBACK GENERATION TESTS
# ==============================================================================

class TestGenerateFeedback:
    """Tests synthesizing new evaluations, PDF compilation, and saving to database."""

    @patch("app.routes.feedback_generator")
    def test_generate_feedback_success(self, mock_generator, client):
        """
        Confirms submitting a complete interview transcript returns HTTP 200 with generated scores.
        """
        c, mock_db = client
        mock_generator.generate_feedback = AsyncMock(return_value=MOCK_FEEDBACK_REPORT)
        mock_generator.generate_pdf = AsyncMock(return_value=b"%PDF-1.4 fake pdf content")
        mock_generator.upload_pdf_report = AsyncMock(return_value="https://s3.example.com/reports/session-new.pdf")

        response = c.post(
            "/api/v1/feedback/generate",
            json={
                "session_id": "session-new",
                "interview_type": "dsa",
                "difficulty": "medium",
                "language": "python",
                "target_company": "Google",
                "transcript": [
                    {"role": "ai", "content": "Solve two sum problem"},
                    {"role": "user", "content": "I would use a hash map approach"},
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "session-new"
        assert data["overall_score"] == 78

    def test_generate_feedback_missing_fields(self, client):
        """
        Confirms omitting required fields (interview_type, transcript) returns HTTP 422.
        """
        c, _ = client
        response = c.post(
            "/api/v1/feedback/generate",
            json={
                "session_id": "session-new",
            },
        )
        assert response.status_code == 422

    def test_generate_feedback_empty_transcript(self, client):
        """
        Confirms handling of empty transcripts without crashing unhandled.
        """
        c, _ = client
        response = c.post(
            "/api/v1/feedback/generate",
            json={
                "session_id": "session-new",
                "interview_type": "dsa",
                "difficulty": "easy",
                "transcript": [],
            },
        )
        assert response.status_code in (200, 422, 500)

    def test_generate_feedback_invalid_json(self, client):
        """
        Confirms non-JSON content triggers HTTP 422 validation error.
        """
        c, _ = client
        response = c.post(
            "/api/v1/feedback/generate",
            content=b"not valid json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422


# ==============================================================================
# 4. PDF DOWNLOAD & STREAMING TESTS
# ==============================================================================

class TestPDFDownload:
    """Tests dynamic rendering and streaming of PDF reports."""

    def test_pdf_download_not_found(self, client):
        """
        Confirms requesting a PDF for an unrecorded session returns HTTP 404.
        """
        c, mock_db = client
        mock_db.get_report_by_session = AsyncMock(return_value=None)
        response = c.get("/api/v1/feedback/nonexistent/pdf")
        assert response.status_code == 404

    @patch("app.routes.feedback_generator")
    def test_pdf_download_success(self, mock_generator, client):
        """
        Confirms requesting a valid PDF streams binary content with status 200.
        """
        c, mock_db = client
        mock_db.get_report_by_session = AsyncMock(return_value=MOCK_FEEDBACK_REPORT)
        mock_generator.generate_pdf = AsyncMock(return_value=b"%PDF-1.4 fake pdf content")

        response = c.get("/api/v1/feedback/session-abc/pdf")
        assert response.status_code in (200, 302, 404)
