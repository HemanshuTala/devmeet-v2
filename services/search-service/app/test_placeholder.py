"""
Comprehensive unit tests for search-service.
Tests: health, search questions, random question, question by ID, create question.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before importing app modules
sys.modules.setdefault("elasticsearch", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


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
    def test_health_check(self, client):
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "search-service"

    def test_root_endpoint(self, client):
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Search Service" in data["message"]


# --- Search Questions ---

class TestSearchQuestions:
    def test_search_with_query(self, client):
        c, mock_engine = client
        response = c.get("/api/v1/search/questions?q=two+sum")
        assert response.status_code == 200
        data = response.json()
        assert "questions" in data
        assert data["total"] == 1
        assert data["questions"][0]["title"] == "Two Sum"

    def test_search_with_type_filter(self, client):
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
        c, _ = client
        response = c.get("/api/v1/search/questions?difficulty=easy")
        assert response.status_code == 200

    def test_search_with_company_filter(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions?company=Google")
        assert response.status_code == 200

    def test_search_with_pagination(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions?limit=5&offset=10")
        assert response.status_code == 200

    def test_search_no_params(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions")
        assert response.status_code == 200
        data = response.json()
        assert "questions" in data

    def test_search_invalid_limit(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions?limit=0")
        assert response.status_code == 422

    def test_search_limit_too_high(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions?limit=200")
        assert response.status_code == 422


# --- Random Question ---

class TestRandomQuestion:
    def test_get_random_question(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions/random")
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "title" in data
        assert "difficulty" in data

    def test_get_random_question_with_type(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions/random?interview_type=dsa")
        assert response.status_code == 200

    def test_get_random_question_with_difficulty(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions/random?difficulty=hard")
        assert response.status_code == 200

    def test_get_random_question_none_found(self, client):
        c, mock_engine = client
        mock_engine.get_random_question = AsyncMock(return_value=None)
        response = c.get("/api/v1/search/questions/random?interview_type=dsa&difficulty=hard")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data


# --- Question by ID ---

class TestQuestionById:
    def test_get_question_by_id(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions/q-001")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "q-001"
        assert data["title"] == "Two Sum"
        assert data["difficulty"] == "easy"

    def test_get_question_not_found(self, client):
        c, mock_engine = client
        mock_engine.get_question_by_id = AsyncMock(return_value=None)
        response = c.get("/api/v1/search/questions/nonexistent-id")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    def test_get_question_has_tags(self, client):
        c, _ = client
        response = c.get("/api/v1/search/questions/q-001")
        assert response.status_code == 200
        data = response.json()
        assert "tags" in data
        assert "array" in data["tags"]


# --- Create Question ---

class TestCreateQuestion:
    def test_create_question(self, client):
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
        c, _ = client
        response = c.post(
            "/api/v1/search/questions",
            json={"title": "Incomplete"},
        )
        assert response.status_code == 422
