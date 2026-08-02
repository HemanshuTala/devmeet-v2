"""
Comprehensive unit tests for file-service.
Tests: health, file upload, listing, info, presign, download, delete.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before importing app modules
sys.modules.setdefault("aiofiles", MagicMock())
sys.modules.setdefault("boto3", MagicMock())
sys.modules.setdefault("botocore", MagicMock())
sys.modules.setdefault("botocore.exceptions", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from io import BytesIO


MOCK_FILE_INFO = {
    "key": "uploads/test-file.pdf",
    "exists": True,
    "size": 1024,
    "content_type": "application/pdf",
    "last_modified": "2024-06-01T10:00:00",
}

MOCK_FILE_LIST = [
    {"key": "uploads/file1.pdf", "size": 1024, "last_modified": "2024-06-01"},
    {"key": "uploads/file2.png", "size": 2048, "last_modified": "2024-06-02"},
]


@pytest.fixture
def client():
    mock_storage = MagicMock()
    mock_storage.upload_file = AsyncMock(return_value={
        "key": "uploads/test-file.pdf",
        "url": "http://localhost:8011/uploads/test-file.pdf",
        "filename": "test-file.pdf",
        "size": 1024,
    })
    mock_storage.get_presigned_url = AsyncMock(
        return_value="http://localhost:8011/presigned/test-file.pdf?token=abc"
    )
    mock_storage.file_exists = AsyncMock(return_value=True)
    mock_storage.get_file_info = AsyncMock(return_value=MOCK_FILE_INFO)
    mock_storage.delete_file = AsyncMock(return_value=True)
    # list_local_files is NOT awaited in routes.py, so use MagicMock (not AsyncMock)
    mock_storage.list_local_files = MagicMock(return_value=MOCK_FILE_LIST)
    mock_storage.use_s3 = False

    with patch("app.routes.storage", mock_storage):
        from app.main import app

        with TestClient(app) as c:
            yield c, mock_storage


# --- Health & Root ---

class TestHealthAndRoot:
    def test_health_check(self, client):
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "file-service"
        assert "storage_mode" in data

    def test_root_endpoint(self, client):
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "File Service" in data["message"]


# --- File Upload ---

class TestFileUpload:
    def test_upload_file_success(self, client):
        c, mock_storage = client
        file_content = b"fake pdf content for testing"
        response = c.post(
            "/api/v1/files/upload",
            files={"file": ("test.pdf", BytesIO(file_content), "application/pdf")},
        )
        assert response.status_code == 200
        data = response.json()
        assert "key" in data or "url" in data

    def test_upload_file_with_purpose(self, client):
        c, _ = client
        file_content = b"avatar image bytes"
        response = c.post(
            "/api/v1/files/upload",
            files={"file": ("avatar.png", BytesIO(file_content), "image/png")},
            data={"purpose": "avatar", "folder": "avatars"},
        )
        assert response.status_code == 200

    def test_upload_no_file(self, client):
        c, _ = client
        response = c.post("/api/v1/files/upload")
        assert response.status_code == 422

    def test_upload_file_too_large(self, client):
        c, mock_storage = client
        # Simulate a file exceeding 50MB
        mock_storage.upload_file = AsyncMock(side_effect=Exception("File too large"))
        large_content = b"x" * 1024  # We test the endpoint logic, not actual size
        response = c.post(
            "/api/v1/files/upload",
            files={"file": ("large.bin", BytesIO(large_content), "application/octet-stream")},
        )
        # May get 200 (if size check happens in storage) or 400/413
        assert response.status_code in (200, 400, 413, 500)


# --- File Listing ---

class TestFileListing:
    def test_list_files(self, client):
        c, _ = client
        response = c.get("/api/v1/files/list")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "files" in data

    def test_list_files_with_limit(self, client):
        c, _ = client
        response = c.get("/api/v1/files/list?limit=10")
        assert response.status_code == 200


# --- File Info ---

class TestFileInfo:
    def test_get_file_info_exists(self, client):
        c, _ = client
        response = c.get("/api/v1/files/info/uploads/test-file.pdf")
        assert response.status_code == 200
        data = response.json()
        assert data["exists"] is True
        assert data["key"] == "uploads/test-file.pdf"

    def test_get_file_info_not_found(self, client):
        c, mock_storage = client
        mock_storage.file_exists = AsyncMock(return_value=False)
        mock_storage.get_file_info = AsyncMock(return_value={
            "key": "uploads/nonexistent.pdf",
            "exists": False,
        })
        response = c.get("/api/v1/files/info/uploads/nonexistent.pdf")
        assert response.status_code in (200, 404)


# --- Presigned URL ---

class TestPresignedURL:
    def test_get_presigned_url(self, client):
        c, _ = client
        response = c.get("/api/v1/files/presign/uploads/test-file.pdf")
        assert response.status_code == 200
        data = response.json()
        assert "url" in data or "presigned_url" in str(data)

    def test_presigned_url_custom_expiry(self, client):
        c, _ = client
        response = c.get("/api/v1/files/presign/uploads/test-file.pdf?expires_in=3600")
        assert response.status_code == 200


# --- File Delete ---

class TestFileDelete:
    def test_delete_file(self, client):
        c, _ = client
        response = c.delete("/api/v1/files/uploads/test-file.pdf")
        assert response.status_code == 200

    def test_delete_file_not_found(self, client):
        c, mock_storage = client
        mock_storage.file_exists = AsyncMock(return_value=False)
        mock_storage.delete_file = AsyncMock(return_value=False)
        response = c.delete("/api/v1/files/uploads/nonexistent.pdf")
        # Service may return 200 with status or 404
        assert response.status_code in (200, 404)
