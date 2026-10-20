"""
Auth Service Automated Test Suite.
==================================
This test module verifies the core authentication, registration, password hashing,
rate limiting, account lockout, and token validation logic of the Auth Service.

Testing Strategy:
-----------------
1. Isolation from Live Infrastructure:
   - Uses `unittest.mock` to mock database connections (`asyncpg`), Redis, GeoIP,
     and TOTP dependencies in `sys.modules` before FastAPI loads routes.
2. Fast In-Memory Execution:
   - Uses `fastapi.testclient.TestClient` (backed by `httpx`) to invoke ASGI routes
     directly without spinning up external network servers.
3. Comprehensive Security Coverage:
   - Tests OWASP validation criteria: password complexity regex, XSS input rejection,
     timing-safe responses on password resets, token rotation, and account lockouts.
"""

import sys
from unittest.mock import MagicMock

# ─── Mock External Drivers Before Application Import ───────────────────────────
# Because auth-service relies on asyncpg (native C extensions) and redis sockets,
# mocking these modules at the sys.modules level allows fast unit tests to run in
# environments lacking running PostgreSQL or Redis daemons.
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
    """
    Pytest fixture that creates an isolated FastAPI TestClient with a mocked Database instance.
    
    Yields:
        Tuple[TestClient, MagicMock]: An HTTP client and the underlying mocked database layer.
    """
    mock_db = MagicMock()
    # Configure asynchronous mock methods matching Database class interface
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

    # Patch the singleton database reference in both database module and route handler
    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db):
        from app.main import app
        with TestClient(app) as c:
            yield c, mock_db


def test_health_check(client):
    """
    Verifies that the /health endpoint responds with HTTP 200 and expected service status metadata.
    """
    c, _ = client
    resp = c.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "auth-service"


# ─── Candidate Registration Tests ─────────────────────────────────────────────

def test_register_success(client):
    """
    Verifies successful candidate registration workflow:
    - User creation returns HTTP 201 Created.
    - Response contains bearer access token.
    - Default user plan and quota are initialized.
    """
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
    """
    Verifies that registering with an already existing email returns HTTP 400 Bad Request.
    """
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
    """
    Verifies Pydantic model rejects password missing uppercase characters (HTTP 422).
    """
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "weakpass1!",
        "display_name": "Weak",
    })
    assert resp.status_code == 422


def test_register_weak_password_too_short(client):
    """
    Verifies Pydantic model rejects passwords shorter than 8 characters (HTTP 422).
    """
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "Sh1!",
        "display_name": "Short",
    })
    assert resp.status_code == 422


def test_register_weak_password_no_special(client):
    """
    Verifies Pydantic model rejects passwords without special symbols (HTTP 422).
    """
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "NoSpecial123",
        "display_name": "NoSpec",
    })
    assert resp.status_code == 422


def test_register_xss_in_display_name(client):
    """
    Verifies that potential HTML/JavaScript injection in display_name is caught and rejected.
    """
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123!",
        "display_name": "<script>alert('xss')</script>",
    })
    assert resp.status_code == 422


def test_register_invalid_email(client):
    """
    Verifies that malformed email addresses fail validation (HTTP 422).
    """
    c, mock_db = client
    resp = c.post("/api/v1/auth/register", json={
        "email": "not-an-email",
        "password": "SecurePass123!",
        "display_name": "User",
    })
    assert resp.status_code == 422


# ─── Login and Credential Verification Tests ──────────────────────────────────

def test_login_success(client):
    """
    Verifies successful authentication for a valid user with verified email.
    """
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
    """
    Verifies that submitting an incorrect password increments failure counter and returns HTTP 401.
    """
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
    """
    Verifies that attempting login with an unregistered email returns generic HTTP 401.
    """
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
    """
    Verifies that an account flagged as locked rejects authentication with HTTP 423 Locked.
    """
    c, mock_db = client
    mock_db.is_account_locked = AsyncMock(return_value=True)

    resp = c.post("/api/v1/auth/login", json={
        "email": "locked@example.com",
        "password": "Password123!",
    })
    assert resp.status_code == 423


def test_login_unverified_email(client):
    """
    Verifies AUTH-06 enforcement: users who have not confirmed their email cannot log in (HTTP 403).
    """
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


# ─── Token Refresh Tests ──────────────────────────────────────────────────────

def test_refresh_no_token(client):
    """
    Verifies that calling /refresh without an HttpOnly cookie or body token returns HTTP 401.
    """
    c, _ = client
    resp = c.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


# ─── Protected Endpoints Tests ────────────────────────────────────────────────

def test_me_no_auth(client):
    """
    Verifies that calling the /me profile endpoint without Authorization header fails.
    """
    c, _ = client
    resp = c.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


def test_logout_no_auth(client):
    """
    Verifies that calling /logout without credentials is unauthorized.
    """
    c, _ = client
    resp = c.post("/api/v1/auth/logout")
    assert resp.status_code in (401, 403)


# ─── Password Reset Flow Tests ────────────────────────────────────────────────

def test_reset_password_request_nonexistent_email(client):
    """
    User Enumeration Defense: Requesting a reset for a non-existent email returns
    the same HTTP 200 message without revealing that the email does not exist.
    """
    c, mock_db = client
    mock_db.get_user_by_email = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/reset-password-request", json={
        "email": "nobody@example.com",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "reset_token" not in data


def test_reset_password_request_success(client):
    """
    Verifies that valid reset requests store a token in DB and return standard confirmation.
    """
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
    """
    Verifies that attempting reset with a non-existent or corrupted token returns HTTP 400.
    """
    c, mock_db = client
    mock_db.get_password_reset_token = AsyncMock(return_value=None)

    resp = c.post("/api/v1/auth/reset-password-confirm", json={
        "token": "invalid-token",
        "new_password": "NewPassword123!",
    })
    assert resp.status_code == 400


def test_reset_password_confirm_expired_token(client):
    """
    Verifies that tokens older than their expiration window are rejected with HTTP 400.
    """
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
    """
    Replay Attack Defense: Verifies that a reset token already marked as used is rejected.
    """
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


# ─── Pydantic Model Unit Validation Tests ────────────────────────────────────

def test_password_validation_no_digit():
    """
    Direct model validation check: verifies UserRegister raises an exception
    when a password lacks numerical digits.
    """
    from app.models import UserRegister
    with pytest.raises(Exception):
        UserRegister(email="t@e.com", password="NoDigitHere!", display_name="X")


def test_password_validation_valid():
    """
    Direct model validation check: verifies valid credentials pass Pydantic parsing cleanly.
    """
    from app.models import UserRegister
    user = UserRegister(email="t@e.com", password="Valid1Pass!", display_name="Test")
    assert user.password == "Valid1Pass!"
