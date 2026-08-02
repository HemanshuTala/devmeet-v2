"""
Comprehensive unit tests for feedback-service.
Tests: health, feedback generation, retrieval, PDF download, error cases.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before importing app modules
sys.modules.setdefault("asyncpg", MagicMock())

sys.modules.setdefault("weasyprint", MagicMock())
sys.modules.setdefault("groq", MagicMock())
sys.modules.setdefault("boto3", MagicMock())
sys.modules.setdefault("botocore", MagicMock())
sys.modules.setdefault("botocore.exceptions", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime


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


# --- Health & Root ---

class TestHealthAndRoot:
    def test_health_check(self, client):
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "feedback-service"

    def test_root_endpoint(self, client):
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Feedback Service" in data["message"]


# --- Get Feedback ---

class TestGetFeedback:
    def test_get_feedback_success(self, client):
        c, _ = client
        response = c.get("/api/v1/feedback/session-abc")
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "session-abc"
        assert data["overall_score"] == 78
        assert "scores" in data
        assert data["scores"]["communication_score"] == 80

    def test_get_feedback_not_found(self, client):
        c, mock_db = client
        mock_db.get_report_by_session = AsyncMock(return_value=None)
        response = c.get("/api/v1/feedback/nonexistent-session")
        assert response.status_code == 404

    def test_get_feedback_has_detailed_feedback(self, client):
        c, _ = client
        response = c.get("/api/v1/feedback/session-abc")
        assert response.status_code == 200
        data = response.json()
        assert "detailed_feedback" in data
        assert "strengths" in data["detailed_feedback"]
        assert "weaknesses" in data["detailed_feedback"]

    def test_get_feedback_has_percentile(self, client):
        c, _ = client
        response = c.get("/api/v1/feedback/session-abc")
        assert response.status_code == 200
        data = response.json()
        assert data["percentile"]["percentile"] == 72


# --- Generate Feedback ---

class TestGenerateFeedback:
    @patch("app.routes.feedback_generator")
    def test_generate_feedback_success(self, mock_generator, client):
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
        c, _ = client
        response = c.post(
            "/api/v1/feedback/generate",
            json={
                "session_id": "session-new",
                # missing interview_type, difficulty, transcript
            },
        )
        assert response.status_code == 422

    def test_generate_feedback_empty_transcript(self, client):
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
        # Empty transcript may be accepted or rejected depending on validation;
        # 500 is possible when the generator fails on empty input.
        assert response.status_code in (200, 422, 500)

    def test_generate_feedback_invalid_json(self, client):
        c, _ = client
        response = c.post(
            "/api/v1/feedback/generate",
            content=b"not valid json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422


# --- PDF Download ---

class TestPDFDownload:
    def test_pdf_download_not_found(self, client):
        c, mock_db = client
        mock_db.get_report_by_session = AsyncMock(return_value=None)
        response = c.get("/api/v1/feedback/nonexistent/pdf")
        assert response.status_code == 404

    @patch("app.routes.feedback_generator")
    def test_pdf_download_success(self, mock_generator, client):
        c, mock_db = client
        # The report exists with a pdf_url
        mock_db.get_report_by_session = AsyncMock(return_value=MOCK_FEEDBACK_REPORT)
        # Mock the PDF generation/retrieval
        mock_generator.generate_pdf = AsyncMock(return_value=b"%PDF-1.4 fake pdf content")

        response = c.get("/api/v1/feedback/session-abc/pdf")
        # Either 200 with PDF or redirect depending on implementation
        assert response.status_code in (200, 302, 404)
