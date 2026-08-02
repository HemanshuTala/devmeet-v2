"""
Auth Service — unit tests for health, registration, login, token, MFA, and security endpoints.
Uses FastAPI TestClient with mocked database.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before any app imports
sys.modules.setdefault("asyncpg", MagicMock())
sys.modules.setdefault("geoip2", MagicMock())
sys.modules.setdefault("geoip2.database", MagicMock())
sys.modules.setdefault("geoip2.errors", MagicMock())
sys.modules.setdefault("pyotp", MagicMock())
sys.modules.setdefault("authlib", MagicMock())
sys.modules.setdefault("authlib.oauth2", MagicMock())
sys.modules.setdefault("authlib.oauth2.rfc7636", MagicMock())
_mock_redis = MagicMock()
_mock_redis.asyncio = MagicMock()
_mock_redis.asyncio.from_url = MagicMock(return_value=MagicMock())
sys.modules.setdefault("redis", _mock_redis)
sys.modules.setdefault("redis.asyncio", _mock_redis.asyncio)

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime, timedelta


@pytest.fixture
def client():
    mock_db = MagicMock()
    # Make all db methods async by default
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db.get_user_by_email = AsyncMock(return_value=None)
    mock_db.get_user_by_id = AsyncMock(return_value=None)
    mock_db.create_user = AsyncMock(return_value=None)
    mock_db.create_user_plan = AsyncMock()
    mock_db.create_usage_quota = AsyncMock()
    mock_db.is_account_locked = AsyncMock(return_value=False)
    mock_db.increment_failed_login_attempts = AsyncMock()
    mock_db.get_failed_login_attempts = AsyncMock(return_value={"attempt_count": 0})
    mock_db.reset_failed_login_attempts = AsyncMock()
    mock_db.lock_account = AsyncMock()
    mock_db.get_recent_login_history = AsyncMock(return_value=[])
    mock_db.record_login_history = AsyncMock()
    mock_db.update_password = AsyncMock()
    mock_db.store_password_reset_token = AsyncMock()
    mock_db.get_password_reset_token = AsyncMock(return_value=None)
    mock_db.mark_password_reset_token_used = AsyncMock()
    mock_db.verify_user_email = AsyncMock()
    mock_db.mark_email_verified = AsyncMock()
    mock_db.enable_mfa = AsyncMock()
    mock_db.disable_mfa = AsyncMock()

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db):
        from app.main import app
        with TestClient(app) as c:
            yield c, mock_db


def test_health_check(client):
    c, _ = client
    resp = c.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "auth-service"


# ─── Registration ─────────────────────────────────────────────────────────────

def test_register_success(client):
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value=None)
    mock_db.create_user = AsyncMock(return_value={
        "id": "user-123",
        "email": "test@example.com",
        "display_name": "Test User",
        "role": "user",
        "is_active": True,
        "is_verified": False,
        "mfa_enabled": False,
    })
    mock_db.create_user_plan = AsyncMock(return_value=None)
    mock_db.create_usage_quota = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123!",
        "display_name": "Test User",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_register_duplicate_email(client):
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "existing-user",
        "email": "taken@example.com",
    })

    resp = c.post("/api/v1/auth/register", json={
        "email": "taken@example.com",
        "password": "SecurePass123!",
        "display_name": "Dup User",
    })
    assert resp.status_code == 400


def test_register_weak_password_no_uppercase(client):
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "weakpass1!",
        "display_name": "Weak",
    })
    assert resp.status_code == 422


def test_register_weak_password_too_short(client):
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "Sh1!",
        "display_name": "Short",
    })
    assert resp.status_code == 422


def test_register_weak_password_no_special(client):
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "NoSpecial123",
        "display_name": "NoSpec",
    })
    assert resp.status_code == 422


def test_register_xss_in_display_name(client):
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123!",
        "display_name": "<script>alert('xss')</script>",
    })
    assert resp.status_code == 422


def test_register_invalid_email(client):
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "not-an-email",
        "password": "SecurePass123!",
        "display_name": "User",
    })
    assert resp.status_code == 422


# ─── Login ────────────────────────────────────────────────────────────────────

def test_login_success(client):
    c, mock_db = client
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    mock_db.is_account_locked = AsyncMock(return_value=False)
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "user-123",
        "email": "test@example.com",
        "display_name": "Test User",
        "role": "user",
        "is_active": True,
        "is_verified": True,
        "email_verified": True,
        "mfa_enabled": False,
        "password_hash": pwd_context.hash("SecurePass123!"),
    })
    mock_db.reset_failed_login_attempts = AsyncMock()
    mock_db.get_recent_login_history = AsyncMock(return_value=[])
    mock_db.record_login_history = AsyncMock()

    resp = c.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "SecurePass123!",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data


def test_login_wrong_password(client):
    c, mock_db = client
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    mock_db.is_account_locked = AsyncMock(return_value=False)
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "user-123",
        "email": "test@example.com",
        "password_hash": pwd_context.hash("CorrectPassword!"),
        "is_active": True,
        "mfa_enabled": False,
    })
    mock_db.increment_failed_login_attempts = AsyncMock()
    mock_db.get_failed_login_attempts = AsyncMock(return_value={"attempt_count": 1})

    resp = c.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "WrongPassword!",
    })
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    c, mock_db = client
    mock_db.is_account_locked = AsyncMock(return_value=False)
    mock_db.get_user_by_email = AsyncMock(return_value=None)
    mock_db.increment_failed_login_attempts = AsyncMock()
    mock_db.get_failed_login_attempts = AsyncMock(return_value={"attempt_count": 1})

    resp = c.post("/api/v1/auth/login", json={
        "email": "nobody@example.com",
        "password": "Whatever123!",
    })
    assert resp.status_code == 401


def test_login_account_locked(client):
    c, mock_db = client
    mock_db.is_account_locked = AsyncMock(return_value=True)

    resp = c.post("/api/v1/auth/login", json={
        "email": "locked@example.com",
        "password": "Password123!",
    })
    assert resp.status_code == 423


def test_login_unverified_email(client):
    c, mock_db = client
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    mock_db.is_account_locked = AsyncMock(return_value=False)
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "user-unverified",
        "email": "unverified@example.com",
        "display_name": "Unverified",
        "password_hash": pwd_context.hash("Password123!"),
        "is_active": True,
        "email_verified": False,
        "mfa_enabled": False,
    })
    mock_db.reset_failed_login_attempts = AsyncMock()

    resp = c.post("/api/v1/auth/login", json={
        "email": "unverified@example.com",
        "password": "Password123!",
    })
    assert resp.status_code == 403


# ─── Token Refresh ────────────────────────────────────────────────────────────

def test_refresh_no_token(client):
    c, _ = client
    resp = c.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


# ─── Protected Endpoints ─────────────────────────────────────────────────────

def test_me_no_auth(client):
    c, _ = client
    resp = c.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


def test_logout_no_auth(client):
    c, _ = client
    resp = c.post("/api/v1/auth/logout")
    assert resp.status_code in (401, 403)


# ─── Password Reset ──────────────────────────────────────────────────────────

def test_reset_password_request_nonexistent_email(client):
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/reset-password-request", json={
        "email": "nobody@example.com",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "reset_token" not in data


def test_reset_password_request_success(client):
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value={
        "id": "user-1",
        "email": "user@example.com",
        "display_name": "User",
    })
    mock_db.store_password_reset_token = AsyncMock()

    resp = c.post("/api/v1/auth/reset-password-request", json={
        "email": "user@example.com",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "reset_token" not in data


def test_reset_password_confirm_invalid_token(client):
    c, mock_db = client
    mock_db.get_password_reset_token = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/reset-password-confirm", json={
        "token": "invalid-token",
        "new_password": "NewPassword123!",
    })
    assert resp.status_code == 400


def test_reset_password_confirm_expired_token(client):
    c, mock_db = client
    mock_db.get_password_reset_token = AsyncMock(return_value={
        "user_id": "user-1",
        "email": "user@example.com",
        "used": False,
        "expires_at": datetime.now() - timedelta(hours=1),
    })

    resp = c.post("/api/v1/auth/reset-password-confirm", json={
        "token": "expired-token",
        "new_password": "NewPassword123!",
    })
    assert resp.status_code == 400


def test_reset_password_confirm_used_token(client):
    c, mock_db = client
    mock_db.get_password_reset_token = AsyncMock(return_value={
        "user_id": "user-1",
        "email": "user@example.com",
        "used": True,
        "expires_at": datetime.now() + timedelta(hours=1),
    })

    resp = c.post("/api/v1/auth/reset-password-confirm", json={
        "token": "used-token",
        "new_password": "NewPassword123!",
    })
    assert resp.status_code == 400


# ─── Password Validation ─────────────────────────────────────────────────────

def test_password_validation_no_digit():
    from app.models import UserRegister
    with pytest.raises(Exception):
        UserRegister(email="t@e.com", password="NoDigitHere!", display_name="X")


def test_password_validation_valid():
    from app.models import UserRegister
    user = UserRegister(email="t@e.com", password="Valid1Pass!", display_name="Test")
    assert user.password == "Valid1Pass!"
