"""
DevMeet Search Service - Automated Unit & Integration Test Suite
================================================================
This test module verifies the core functional requirements and edge cases of the
search, question discovery, and problem bank microservice:
1. Operational Telemetry & Service Probes:
   - Verifies public `/health` and root `/` endpoints without authentication.
2. Full-Text Problem Search & Filtering:
   - Tests free-text search queries (e.g. 'two sum') and ranking.
   - Tests interview track filtering ('dsa', 'behavioral', 'system_design').
   - Tests difficulty level filtering ('easy', 'medium', 'hard').
   - Tests company tag filtering ('Google', 'Meta').
   - Validates pagination bounds (1 to 100) and asserts 422 on invalid page limits.
3. Random Problem Dispatch:
   - Tests random problem selection for interview initialization.
   - Tests constrained random selection by track and difficulty.
   - Asserts 404 Not Found when no questions match the requested filters.
4. Individual Problem Retrieval:
   - Tests fetching full problem descriptions, tags, and hints by ID.
   - Asserts 404 Not Found for nonexistent question IDs.
5. Problem Creation & Ingestion:
   - Tests adding new technical interview questions with complete metadata.
   - Tests automated UUID generation when question ID is omitted.
   - Enforces Pydantic schema validation failures (422) on missing required fields.
"""

import sys
from unittest.mock import MagicMock

# Mock external binary/network dependencies (elasticsearch) before importing application modules
sys.modules.setdefault("elasticsearch", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

# Standard test fixtures for problem card representations
MOCK_QUESTION = {
    "id": "q-001",
    "title": "Two Sum",
    "description": "Given an array of integers, return indices of the two numbers that add up to a target.",
    "interview_type": "dsa",
    "difficulty": "easy",
    "tags": ["array", "hash-map"],
    "company_tags": ["Google", "Amazon"],
    "hints": ["Think about using a hash map for O(n) solution"],
}

MOCK_SEARCH_RESPONSE = {
    "questions": [MOCK_QUESTION],
    "total": 1,
    "query": "two sum",
}

MOCK_BEHAVIORAL_QUESTION = {
    "id": "q-002",
    "title": "Tell me about a time you resolved a conflict",
    "description": "Describe a situation where you had a disagreement with a colleague.",
    "interview_type": "behavioral",
    "difficulty": "medium",
    "tags": ["conflict-resolution", "teamwork"],
    "company_tags": ["Meta", "Microsoft"],
    "hints": ["Use STAR method"],
}


@pytest.fixture
def client():
    """
    Test fixture providing a FastAPI TestClient with mocked search engine singleton.

    Yields:
        tuple[TestClient, MagicMock]: Configured HTTP client and search engine mock.
    """
    with patch("app.routes.search_engine") as mock_engine:
        mock_engine.search = AsyncMock(return_value=MOCK_SEARCH_RESPONSE)
        mock_engine.get_random_question = AsyncMock(return_value=MOCK_QUESTION)
        mock_engine.get_question_by_id = AsyncMock(return_value=MOCK_QUESTION)
        mock_engine.add_question = AsyncMock(return_value=True)
        mock_engine.use_es = False

        from app.main import app

        with TestClient(app) as c:
            yield c, mock_engine


# --- Health & Root ---

class TestHealthAndRoot:
    """Tests public baseline operational endpoints."""

    def test_health_check(self, client):
        """Verifies GET /health returns 200 OK and reports service identifier."""
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "search-service"

    def test_root_endpoint(self, client):
        """Verifies root endpoint service identity banner."""
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Search Service" in data["message"]


# --- Search Questions ---

class TestSearchQuestions:
    """Tests question catalog search, keyword scoring, and filter parameters."""

    def test_search_with_query(self, client):
        """Verifies keyword search across problem titles and descriptions."""
        c, mock_engine = client
        response = c.get("/api/v1/search/questions?q=two+sum")
        assert response.status_code == 200
        data = response.json()
        assert "questions" in data
        assert data["total"] == 1
        assert data["questions"][0]["title"] == "Two Sum"

    def test_search_with_type_filter(self, client):
        """Verifies filtering by interview track (e.g. 'behavioral')."""
        c, mock_engine = client
        mock_engine.search = AsyncMock(return_value={
            "questions": [MOCK_BEHAVIORAL_QUESTION],
            "total": 1,
            "query": None,
        })
        response = c.get("/api/v1/search/questions?interview_type=behavioral")
        assert response.status_code == 200
        data = response.json()
        assert data["questions"][0]["interview_type"] == "behavioral"

    def test_search_with_difficulty_filter(self, client):
        """Verifies filtering problems by difficulty level."""
        c, _ = client
        response = c.get("/api/v1/search/questions?difficulty=easy")
        assert response.status_code == 200

    def test_search_with_company_filter(self, client):
        """Verifies filtering problems by targeted hiring company."""
        c, _ = client
        response = c.get("/api/v1/search/questions?company=Google")
        assert response.status_code == 200

    def test_search_with_pagination(self, client):
        """Verifies offset and limit pagination parameters."""
        c, _ = client
        response = c.get("/api/v1/search/questions?limit=5&offset=10")
        assert response.status_code == 200

    def test_search_no_params(self, client):
        """Verifies search without query parameters returns default catalog."""
        c, _ = client
        response = c.get("/api/v1/search/questions")
        assert response.status_code == 200
        data = response.json()
        assert "questions" in data

    def test_search_invalid_limit(self, client):
        """Ensures limit < 1 triggers a 422 Unprocessable Entity error."""
        c, _ = client
        response = c.get("/api/v1/search/questions?limit=0")
        assert response.status_code == 422

    def test_search_limit_too_high(self, client):
        """Ensures limit > 100 triggers a 422 Unprocessable Entity error."""
        c, _ = client
        response = c.get("/api/v1/search/questions?limit=200")
        assert response.status_code == 422


# --- Random Question ---

class TestRandomQuestion:
    """Tests random problem sampling for interview generators."""

    def test_get_random_question(self, client):
        """Verifies unconstrained random problem sampling."""
        c, _ = client
        response = c.get("/api/v1/search/questions/random")
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "title" in data
        assert "difficulty" in data

    def test_get_random_question_with_type(self, client):
        """Verifies random sampling constrained by interview track."""
        c, _ = client
        response = c.get("/api/v1/search/questions/random?interview_type=dsa")
        assert response.status_code == 200

    def test_get_random_question_with_difficulty(self, client):
        """Verifies random sampling constrained by difficulty tier."""
        c, _ = client
        response = c.get("/api/v1/search/questions/random?difficulty=hard")
        assert response.status_code == 200

    def test_get_random_question_none_found(self, client):
        """Ensures 404 Not Found when no questions match criteria."""
        c, mock_engine = client
        mock_engine.get_random_question = AsyncMock(return_value=None)
        response = c.get("/api/v1/search/questions/random?interview_type=dsa&difficulty=hard")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data


# --- Question by ID ---

class TestQuestionById:
    """Tests retrieving full problem details by primary key."""

    def test_get_question_by_id(self, client):
        """Verifies fetching an existing problem card."""
        c, _ = client
        response = c.get("/api/v1/search/questions/q-001")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "q-001"
        assert data["title"] == "Two Sum"
        assert data["difficulty"] == "easy"

    def test_get_question_not_found(self, client):
        """Verifies 404 Not Found when requesting nonexistent question IDs."""
        c, mock_engine = client
        mock_engine.get_question_by_id = AsyncMock(return_value=None)
        response = c.get("/api/v1/search/questions/nonexistent-id")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    def test_get_question_has_tags(self, client):
        """Verifies that returned problems contain algorithmic tags."""
        c, _ = client
        response = c.get("/api/v1/search/questions/q-001")
        assert response.status_code == 200
        data = response.json()
        assert "tags" in data
        assert "array" in data["tags"]


# --- Create Question ---

class TestCreateQuestion:
    """Tests problem authoring and ingestion."""

    def test_create_question(self, client):
        """Verifies adding a complete technical problem to the question catalog."""
        c, mock_engine = client
        new_question = {
            "id": "q-new",
            "title": "Merge Sort",
            "description": "Implement merge sort algorithm",
            "interview_type": "dsa",
            "difficulty": "medium",
            "tags": ["sorting", "divide-and-conquer"],
            "company_tags": ["Microsoft"],
            "hints": ["Split array in half recursively"],
        }
        response = c.post("/api/v1/search/questions", json=new_question)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Merge Sort"

    def test_create_question_auto_id(self, client):
        """Verifies automatic UUID generation when problem ID is left empty."""
        c, _ = client
        question_no_id = {
            "id": "",
            "title": "Binary Search",
            "description": "Implement binary search",
            "interview_type": "dsa",
            "difficulty": "easy",
            "tags": ["binary-search"],
            "company_tags": [],
            "hints": [],
        }
        response = c.post("/api/v1/search/questions", json=question_no_id)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] != ""

    def test_create_question_missing_fields(self, client):
        """Ensures incomplete problem schemas trigger a 422 Unprocessable Entity error."""
        c, _ = client
        response = c.post(
            "/api/v1/search/questions",
            json={"title": "Incomplete"},
        )
        assert response.status_code == 422
