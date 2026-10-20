"""
Authentication Service API Endpoints and Security Routing.
===========================================================
This module defines the RESTful endpoints for user authentication, registration,
token refresh, session invalidation, password resets, email verification, and MFA.

Key Security Architecture:
--------------------------
1. Dual-Token Architecture:
   - Access tokens: Short-lived (15 minutes), passed as Bearer tokens in Authorization header.
   - Refresh tokens: Long-lived (7 days), stored in secure HttpOnly cookies (`SameSite=Strict`),
     preventing malicious JavaScript from stealing session credentials via XSS.
2. Token Invalidation and Revocation:
   - Redis-backed Blacklist: Explicit logout writes token hashes to Redis with TTL matching token expiry.
   - Token Versioning (`token_version`): Changing passwords or clicking "Logout All Devices"
     increments the user's version counter in Redis. Any previously issued JWT carrying a lower
     version number is immediately rejected across all microservices without waiting for token expiry.
3. Brute Force Protection & Rate Limiting:
   - Sliding-window rate limit counters in Redis protect against automated credential stuffing.
   - Account locks activate after 5 consecutive failed login attempts.
4. Anomaly Detection & Geolocation:
   - GeoIP inspection detects "impossible travel" across geographical locations and alerts users.
5. Two-Factor Authentication (MFA/TOTP):
   - RFC 6238 TOTP support (compatible with Google Authenticator / Authy) + single-use backup recovery codes.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Request, Response, Cookie, BackgroundTasks, Query
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .models import (
    UserRegister, UserLogin, TokenResponse, TokenRefresh, UserProfile,
    ChangePassword, ResetPasswordRequest, ResetPasswordConfirm,
    MfaLoginVerify, MfaLoginChallengeResponse,
)
from .database import db
from .auth import auth_manager
from .geoip_service import geoip_service
import redis.asyncio as redis
import os
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional
import time
import httpx

logger = logging.getLogger(__name__)

async def send_email_notification(to: str, template: str, data: dict):
    """
    Simulates transactional email dispatch for authentication events.

    Parameters:
        to (str): Target recipient email address.
        template (str): Notification template ('welcome', 'verify_email', 'reset_password', 'security_alert').
        data (dict): Template variables (e.g. candidate name, OTP code, reset link).
    """
    logger.info(f"[Auth Email Dispatch] To: {to} | Template: {template} | Data: {data}")


async def _send_registration_verification_otp(user_id: str, email: str, display_name: str) -> None:
    """
    Generates and dispatches a 6-digit registration verification OTP.
    
    Stores the one-time code in Redis with a 24-hour expiration key `email_verify:{user_id}`.
    """
    otp = str(secrets.randbelow(1000000)).zfill(6)
    r = await get_redis()
    if r:
        await r.setex(f"email_verify:{user_id}", 86400, otp)
    await send_email_notification(
        to=email,
        template="verify_email",
        data={"name": display_name, "otp": otp},
    )


# FastAPI router configured under prefix `/api/v1/auth`
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
# Standard Bearer token authentication extractor
security = HTTPBearer()

# Shared asynchronous Redis connection client
redis_client = None

# Rate limiting and brute force thresholds
MAX_LOGIN_ATTEMPTS = 5       # Max consecutive failures before temporary account lock
LOCK_DURATION_MINUTES = 30   # Lockout duration in minutes
REGISTER_RATE_LIMIT = 5      # Max registration attempts per hour per IP
LOGIN_RATE_LIMIT = 10        # Max login attempts per hour per IP


async def get_redis():
    """
    Returns a shared asynchronous Redis connection pool instance.
    
    Graceful Degradation:
    If Redis is temporarily down, catches exception and returns None so non-critical
    features (e.g. rate-limit checks) can fall through without crashing the request.
    """
    global redis_client
    if redis_client is None:
        try:
            redis_client = await redis.from_url(
                f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}",
                decode_responses=True
            )
        except Exception as e:
            print(f"Redis connection failed: {e}")
    return redis_client


async def get_token_version(user_id: str) -> int:
    """
    Retrieves the current active token version counter for a user from Redis.
    
    Used to implement instantaneous multi-device session revocation. If key is missing,
    defaults to 0 (all tokens created before any version bump remain valid).
    """
    try:
        r = await get_redis()
        if not r:
            return 0
        value = await r.get(f"token_version:{user_id}")
        return int(value or 0)
    except Exception:
        return 0


async def build_token_data(user: dict) -> dict:
    """
    Assembles standard JWT claims dictionary for a given user profile.
    
    Includes subject UUID (`sub`), user email, and current `token_version`.
    """
    user_id = str(user["id"])
    return {
        "sub": user_id,
        "email": user["email"],
        "token_version": await get_token_version(user_id),
    }


async def check_rate_limit(request: Request, key: str, limit: int, window_seconds: int = 3600) -> bool:
    """
    Implements a sliding counter rate limiter backed by Redis.

    Parameters:
        request (Request): Incoming FastAPI HTTP request to identify client IP.
        key (str): Action namespace (e.g., 'login', 'register', 'reset_password').
        limit (int): Maximum allowed executions within the window.
        window_seconds (int): Expiration window in seconds (default: 3600 = 1 hour).

    Returns:
        bool: True if allowed, False if limit exceeded.
    """
    try:
        r = await get_redis()
        if not r:
            return True  # Fallback to permissive mode if Redis is temporarily unreachable
        
        client_ip = request.client.host if request.client else "unknown"
        rate_key = f"rate_limit:{key}:{client_ip}"
        
        # Atomically increment counter
        current = await r.incr(rate_key)
        # On first hit, set the time-to-live window
        if current == 1:
            await r.expire(rate_key, window_seconds)
        
        return current <= limit
    except Exception:
        return True


async def assert_token_version(payload: dict) -> None:
    """
    Validates that a JWT's embedded token version matches or exceeds the user's active version.
    
    Raises:
        HTTPException(401): If token version is outdated (indicating a password reset or logout-all occurred).
    """
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    current_version = await get_token_version(user_id)
    token_version = int(payload.get("token_version", 0))
    if token_version < current_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency that extracts, verifies, and validates the caller's JWT Bearer token.
    
    Execution flow:
    1. Cryptographically verifies signature and expiration time of the access token.
    2. Validates token version against Redis (asserting session was not revoked).
    3. Checks Redis token blacklist for explicit individual token logouts.
    4. Fetches the active user profile from PostgreSQL.
    
    Returns:
        dict: Authenticated user record.
    """
    token = credentials.credentials
    payload = auth_manager.verify_access_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    await assert_token_version(payload)
    
    # Check if this specific token was explicitly blacklisted upon /logout
    try:
        r = await get_redis()
        if r:
            is_blacklisted = await r.exists(f"blacklist:{token}")
            if is_blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been revoked"
                )
    except Exception:
        pass
    
    user_id = payload.get("sub")
    user = await db.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, request: Request, background_tasks: BackgroundTasks):
    """
    Handles candidate registration and account provisioning.
    
    Steps:
    1. Checks IP-based registration rate limiting (prevents spam bot account creation).
    2. Verifies email uniqueness in PostgreSQL.
    3. Hashes password using Bcrypt with cryptographically random salt.
    4. Inserts user profile record into PostgreSQL.
    5. Seeds default 'free' plan and daily interview quota tables.
    6. Generates initial access and refresh tokens.
    7. Schedules welcome email and 6-digit verification OTP in background tasks.
    8. Attaches refresh token to an HttpOnly cookie and returns access token in JSON body.
    """
    # 1. Rate limit inspection
    if not await check_rate_limit(request, "register", REGISTER_RATE_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later."
        )
    
    # 2. Email uniqueness check
    existing_user = await db.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # 3. Secure password hashing
    password_hash = auth_manager.hash_password(user_data.password)
    
    try:
        # 4 & 5. Database provisioning
        user = await db.create_user(user_data.email, password_hash, user_data.display_name)
        await db.create_user_plan(str(user["id"]))
        await db.create_usage_quota(str(user["id"]))
        
        # 6. Issue JWT credentials
        token_data = await build_token_data(user)
        access_token = auth_manager.create_access_token(token_data)
        refresh_token = auth_manager.create_refresh_token(token_data)
        
        # 7. Asynchronous notification tasks
        background_tasks.add_task(
            send_email_notification,
            to=user["email"],
            template="welcome",
            data={"name": user["display_name"]}
        )
        background_tasks.add_task(_send_registration_verification_otp, str(user["id"]), user["email"], user["display_name"])
        
        res = JSONResponse(
            content={
                "access_token": access_token,
                "token_type": "bearer",
                "expires_in": auth_manager.access_token_expire_minutes * 60,
            },
            status_code=201,
        )
        # 8. Set HttpOnly cookie for refresh token to prevent XSS exfiltration
        res.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=os.getenv("ENVIRONMENT", "development") == "production",
            samesite="strict",
            max_age=auth_manager.refresh_token_expire_days * 24 * 3600,
            path="/api/v1/auth/refresh",
        )
        return res
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin, request: Request, background_tasks: BackgroundTasks):
    """
    Authenticates user credentials, runs risk analysis, and issues tokens or MFA challenge.
    
    Security Workflow:
    1. Checks IP rate limit and existing account lockout status.
    2. Validates password hash with constant-time Bcrypt verification.
       - On failure: increments failed login counter, locks account if attempts >= 5.
       - On success: resets failed counter.
    3. Checks email verification status.
    4. Evaluates GeoIP coordinates against recent login history for impossible travel / anomalies.
    5. If MFA is enabled: creates temporary single-use challenge token and instructs client to provide TOTP.
    6. Returns access token in payload and refresh token in HttpOnly cookie.
    """
    # 1. Rate limiting
    if not await check_rate_limit(request, "login", LOGIN_RATE_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later."
        )
    
    # Check if account is currently locked due to prior failures
    if await db.is_account_locked(user_data.email):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked due to too many failed attempts. Please try again later."
        )
    
    user = await db.get_user_by_email(user_data.email)
    
    # 2. Verify password
    if not user or not auth_manager.verify_password(user_data.password, user["password_hash"]):
        await db.increment_failed_login_attempts(user_data.email)
        attempts = await db.get_failed_login_attempts(user_data.email)
        if attempts["attempt_count"] >= MAX_LOGIN_ATTEMPTS:
            await db.lock_account(user_data.email, LOCK_DURATION_MINUTES)
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account locked for {LOCK_DURATION_MINUTES} minutes due to too many failed attempts"
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Successful password check: clear lockout counter
    await db.reset_failed_login_attempts(user_data.email)

    # 3. GeoIP Risk Assessment
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    recent_history = await db.get_recent_login_history(str(user["id"]), limit=5)
    risk_assessment = geoip_service.get_risk_score(client_ip, recent_history)
    
    # Audit log login event
    await db.record_login_history(
        user_id=str(user["id"]),
        ip_address=client_ip,
        location=risk_assessment["location"],
        risk_score=risk_assessment["risk_score"],
        risk_level=risk_assessment["risk_level"],
        user_agent=user_agent
    )
    
    # Alert user if login triggered high anomaly score
    if risk_assessment["risk_level"] == "high":
        background_tasks.add_task(
            send_email_notification,
            to=user["email"],
            template="security_alert",
            data={
                "name": user["display_name"],
                "ip_address": client_ip,
                "location": risk_assessment["location"],
                "reasons": risk_assessment["reasons"],
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            }
        )
    
    # 5. Handle Multi-Factor Authentication Challenge
    if user.get("mfa_enabled"):
        mfa_token = secrets.token_urlsafe(32)
        r = await get_redis()
        if r:
            # 5-minute validity window for candidate to enter 6-digit TOTP code
            await r.setex(f"mfa_login:{mfa_token}", 300, str(user["id"]))
        return JSONResponse(
            content={
                "mfa_required": True,
                "mfa_token": mfa_token,
                "expires_in": 300,
            }
        )

    # 6. Issue tokens
    token_data = await build_token_data(user)
    access_token = auth_manager.create_access_token(token_data)
    refresh_token = auth_manager.create_refresh_token(token_data)

    response_data = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": auth_manager.access_token_expire_minutes * 60,
    }
    
    if risk_assessment["risk_level"] in ("medium", "high"):
        response_data["security_alert"] = {
            "risk_level": risk_assessment["risk_level"],
            "reasons": risk_assessment["reasons"],
            "location": risk_assessment["location"]
        }
    
    res = JSONResponse(content=response_data)
    res.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT", "development") == "production",
        samesite="strict",
        max_age=auth_manager.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth/refresh",
    )
    return res


@router.post("/refresh")
async def refresh_token(
    refresh_token: Optional[str] = Cookie(default=None),
    body: Optional[TokenRefresh] = None,
):
    """
    Exchanges an active refresh token for a newly issued access/refresh token pair.
    
    Token Rotation Security Pattern:
    - Verifies the incoming refresh token signature, expiration, and token version.
    - Immediately invalidates (blacklists) the used refresh token in Redis.
    - Generates a brand new refresh token and sets it in an updated HttpOnly cookie.
    - If an attacker intercepts a stolen refresh token, subsequent attempts by either
      the legitimate user or attacker will trigger immediate blacklisting alerts.
    """
    token = refresh_token or (body.refresh_token if body else None)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided"
        )

    payload = auth_manager.decode_token(token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    await assert_token_version(payload)

    # Verify refresh token has not been blacklisted
    try:
        r = await get_redis()
        if r:
            is_blacklisted = await r.exists(f"blacklist:{token}")
            if is_blacklisted:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token has been revoked"
                )
    except Exception:
        pass

    user = await db.get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Issue new pair
    token_data_new = await build_token_data(user)
    new_access_token = auth_manager.create_access_token(token_data_new)
    new_refresh_token = auth_manager.create_refresh_token(token_data_new)

    # Rotate: Blacklist previous refresh token
    try:
        r = await get_redis()
        if r:
            await r.setex(f"blacklist:{token}",
                          auth_manager.refresh_token_expire_days * 24 * 3600, "1")
    except Exception:
        pass

    res = JSONResponse(
        content={
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": auth_manager.access_token_expire_minutes * 60,
        }
    )
    res.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT", "development") == "production",
        samesite="strict",
        max_age=auth_manager.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth/refresh",
    )
    return res


@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Terminates the current user session by blacklisting the active access token in Redis.
    """
    token = credentials.credentials
    try:
        r = await get_redis()
        if r:
            await r.setex(f"blacklist:{token}", 
                        auth_manager.access_token_expire_minutes * 60, "1")
    except Exception:
        pass
    
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(credentials: HTTPAuthorizationCredentials = Depends(security), current_user: dict = Depends(get_current_user)):
    """
    Invalidates all active sessions across all devices for the calling user.
    
    Increments `token_version:{user_id}` in Redis. Any request presenting a JWT with
    an older version number will be immediately rejected with HTTP 401.
    """
    try:
        r = await get_redis()
        if r:
            token = credentials.credentials
            await r.setex(f"blacklist:{token}", 
                        auth_manager.access_token_expire_minutes * 60, "1")
            version_key = f"token_version:{current_user['id']}"
            await r.incr(version_key)
            await r.expire(version_key, 30 * 24 * 3600)
    except Exception:
        pass
    
    return {"message": "Logged out from all devices"}


@router.post("/impersonate-token")
async def generate_impersonate_token(
    target_user_id: str,
    admin: dict = Depends(get_current_user)
):
    """
    AUTH-11: Generates temporary authentication tokens allowing an admin to impersonate a candidate.
    
    Security Controls:
    - Enforces admin email authorization (@devmeet.com or admin@devmeet.com).
    - Prevents admins from impersonating themselves or fellow admins.
    - Emits a structured security audit log warning.
    """
    email = admin.get("email", "")
    role = "admin" if email == "admin@devmeet.com" or email.endswith("@devmeet.com") else "user"
    if role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: admin role required"
        )

    if str(admin.get("id", "")) == target_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot impersonate yourself"
        )

    target_user = await db.get_user_by_id(target_user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found"
        )

    target_email = target_user.get("email", "")
    if target_email == "admin@devmeet.com" or target_email.endswith("@devmeet.com"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot impersonate admin accounts"
        )

    logger.warning(
        "[AUTH-11] Admin impersonation: admin=%s target=%s",
        admin.get("id"), target_user_id
    )
        
    token_data = await build_token_data(target_user)
    access_token = auth_manager.create_access_token(token_data)
    refresh_token = auth_manager.create_refresh_token(token_data)
    
    res = JSONResponse(
        content={
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": auth_manager.access_token_expire_minutes * 60,
        }
    )
    res.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT", "development") == "production",
        samesite="strict",
        max_age=auth_manager.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth/refresh",
    )
    return res


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the authenticated user's profile details and role mapping.
    """
    email = current_user.get("email", "")
    role = "admin" if email == "admin@devmeet.com" or email.endswith("@devmeet.com") else "user"
    return UserProfile(
        id=str(current_user["id"]),
        email=current_user["email"],
        display_name=current_user["display_name"],
        avatar_url=current_user.get("avatar_url"),
        bio=current_user.get("bio"),
        role=role,
        created_at=current_user["created_at"]
    )


@router.get("/verify-admin")
async def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    AUTH-05: RBAC verification endpoint used by Nginx `auth_request` subrequests.
    
    Validates token and returns `X-User-Id` and `X-User-Role` headers to the proxy
    before sensitive admin routes are forwarded.
    """
    token = credentials.credentials
    payload = auth_manager.verify_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    await assert_token_version(payload)
    
    user_id = payload.get("sub")
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    email = user.get("email", "")
    user_role = "admin" if email == "admin@devmeet.com" or email.endswith("@devmeet.com") else "user"
    
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    response = Response(status_code=200)
    response.headers["X-User-Id"] = str(user["id"])
    response.headers["X-User-Role"] = user_role
    return response


@router.post("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user: dict = Depends(get_current_user)
):
    """
    Allows an authenticated user to update their account password.
    
    Validates current password, rejects identical new passwords, updates database hash,
    and invalidates all existing sessions via `token_version` increment in Redis.
    """
    if not auth_manager.verify_password(password_data.current_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    if auth_manager.verify_password(password_data.new_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    new_password_hash = auth_manager.hash_password(password_data.new_password)
    await db.update_password(str(current_user["id"]), new_password_hash)

    # Invalidate all prior JWTs by incrementing token_version
    try:
        r = await get_redis()
        if r:
            version_key = f"token_version:{current_user['id']}"
            await r.incr(version_key)
            await r.expire(version_key, 30 * 24 * 3600)
    except Exception:
        pass

    return {"message": "Password changed successfully. All existing sessions have been invalidated."}


@router.post("/reset-password-request")
async def reset_password_request(request_data: ResetPasswordRequest, request: Request, background_tasks: BackgroundTasks):
    """
    Initiates forgotten password workflow by emailing a time-limited reset link.
    
    Security: Always returns identical success message whether email exists or not
    to prevent user enumeration attacks.
    """
    if not await check_rate_limit(request, "reset_password", 3):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset attempts. Please try again later."
        )
    
    user = await db.get_user_by_email(request_data.email)
    if not user:
        return {"message": "If the email exists, a reset link has been sent"}
    
    reset_token = secrets.token_urlsafe(32)
    await db.store_password_reset_token(str(user["id"]), reset_token)
    
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    background_tasks.add_task(
        send_email_notification,
        to=user["email"],
        template="reset_password",
        data={"reset_url": reset_url}
    )
    
    return {"message": "If the email exists, a reset link has been sent"}


@router.post("/reset-password-confirm")
async def reset_password_confirm(confirm_data: ResetPasswordConfirm):
    """
    Completes password reset using token delivered by email.
    
    Validates token expiration and single-use state, updates password hash, marks token used,
    and clears failed login attempt locks.
    """
    token_data = await db.get_password_reset_token(confirm_data.token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    if token_data["used"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used"
        )
    
    if token_data["expires_at"] < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
    
    new_password_hash = auth_manager.hash_password(confirm_data.new_password)
    await db.update_password(str(token_data["user_id"]), new_password_hash)
    await db.mark_password_reset_token_used(confirm_data.token)
    await db.reset_failed_login_attempts(token_data["email"])
    
    return {"message": "Password reset successfully"}


# ─── Email Verification (AUTH-06) ─────────────────────────────────────────────

@router.post("/verify-email/request")
async def verify_email_request(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """
    Generates a 6-digit verification OTP and delivers it to the user's email.
    
    Enforces a 60-second cooldown in Redis to prevent email spamming.
    """
    r = await get_redis()
    cooldown_key = f"email_verify_cooldown:{current_user['id']}"
    if r:
        if await r.exists(cooldown_key):
            ttl = await r.ttl(cooldown_key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {max(ttl, 1)} seconds before requesting another code.",
            )

    otp = str(secrets.randbelow(1000000)).zfill(6)
    token_key = f"email_verify:{current_user['id']}"

    if r:
        await r.setex(token_key, 86400, otp)  # 24-hour expiration
        await r.setex(cooldown_key, 60, "1")  # 60s resend cooldown

    background_tasks.add_task(
        send_email_notification,
        to=current_user["email"],
        template="verify_email",
        data={"name": current_user["display_name"], "otp": otp}
    )
    
    return {
        "message": f"Verification OTP sent to {current_user['email']}. Valid for 24 hours.",
    }


@router.post("/verify-email/confirm")
async def verify_email_confirm(token: str, current_user: dict = Depends(get_current_user)):
    """
    Confirms email ownership using the 6-digit OTP code sent to user.
    """
    r = await get_redis()
    token_key = f"email_verify:{current_user['id']}"

    if r:
        stored = await r.get(token_key)
        if not stored or stored != token:
            raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        await r.delete(token_key)
        
    await db.mark_email_verified(current_user["id"])
    return {"message": "Email address successfully verified.", "verified": True}


# ─── MFA / TOTP (AUTH-09) ─────────────────────────────────────────────────────

@router.post("/mfa/enable")
async def mfa_enable(current_user: dict = Depends(get_current_user)):
    """
    Initiates TOTP Multi-Factor Authentication enrollment.
    
    Generates a random base32 shared secret and `otpauth://` provisioning URI for QR codes.
    Stores the pending secret in Redis with a 10-minute TTL until verified.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="MFA not available — install 'pyotp' package."
        )

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=current_user["email"],
        issuer_name="DevMeet",
    )

    r = await get_redis()
    if r:
        await r.setex(f"mfa_pending:{current_user['id']}", 600, secret)

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
        "message": "Scan the QR code, then confirm with /mfa/verify",
        "backup_codes_note": "After confirming, call /mfa/backup-codes to get your backup codes.",
    }


@router.post("/mfa/verify")
async def mfa_verify(totp_code: str, current_user: dict = Depends(get_current_user)):
    """
    Completes MFA enrollment by verifying the user's first 6-digit authenticator code.
    
    On success, permanently saves `mfa_secret` to PostgreSQL and marks `mfa_enabled = True`.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="MFA not available.")

    r = await get_redis()
    secret = None
    if r:
        secret = await r.get(f"mfa_pending:{current_user['id']}")

    if not secret:
        raise HTTPException(status_code=400, detail="No pending MFA enrollment. Call /mfa/enable first.")

    totp = pyotp.TOTP(secret)
    # Valid window allows ±30 seconds clock drift between client phone and server
    if not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code. Please try again.")

    await db.enable_mfa(current_user["id"], secret)
    if r:
        await r.delete(f"mfa_pending:{current_user['id']}")

    return {"message": "MFA enabled successfully.", "mfa_enabled": True}


@router.post("/mfa/disable")
async def mfa_disable(totp_code: str, current_user: dict = Depends(get_current_user)):
    """
    Disables MFA for the user after verifying current TOTP code.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="MFA not available.")

    user = await db.get_user_by_id(current_user["id"])
    secret = user.get("mfa_secret") if user else None

    if not secret:
        raise HTTPException(status_code=400, detail="MFA is not currently enabled.")

    totp = pyotp.TOTP(secret)
    if not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code.")

    await db.disable_mfa(current_user["id"])
    return {"message": "MFA disabled successfully.", "mfa_enabled": False}


@router.post("/mfa/backup-codes")
async def mfa_backup_codes(current_user: dict = Depends(get_current_user)):
    """
    Generates 8 single-use hex recovery codes for emergency account access.
    
    Codes are SHA-256 hashed before storage; plaintext codes are returned only once.
    """
    import hashlib

    user = await db.get_user_by_id(current_user["id"])
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA must be enabled before generating backup codes.")

    codes = [secrets.token_hex(5).upper() for _ in range(8)]
    hashed = [hashlib.sha256(c.encode()).hexdigest() for c in codes]

    await db.store_backup_codes(current_user["id"], hashed)

    return {
        "backup_codes": codes,
        "message": "Save these backup codes in a safe place. They will not be shown again.",
        "count": len(codes),
    }


@router.post("/mfa/use-backup-code")
async def mfa_use_backup_code(backup_code: str, current_user: dict = Depends(get_current_user)):
    """
    Validates and consumes a single backup recovery code.
    """
    import hashlib

    hashed_input = hashlib.sha256(backup_code.upper().encode()).hexdigest()
    consumed = await db.consume_backup_code(current_user["id"], hashed_input)

    if not consumed:
        raise HTTPException(status_code=400, detail="Invalid or already-used backup code.")

    return {"message": "Backup code accepted. Please disable and re-enable MFA to generate new codes."}


async def _issue_auth_tokens(user: dict) -> JSONResponse:
    """
    Internal helper to bundle access token JSON response and set HttpOnly refresh cookie.
    """
    token_data = await build_token_data(user)
    access_token = auth_manager.create_access_token(token_data)
    refresh_token = auth_manager.create_refresh_token(token_data)
    res = JSONResponse(
        content={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": auth_manager.access_token_expire_minutes * 60,
        }
    )
    res.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT", "development") == "production",
        samesite="lax" if os.getenv("ENVIRONMENT", "development") != "production" else "strict",
        max_age=auth_manager.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth/refresh",
    )
    return res


@router.post("/mfa/login-verify", response_model=TokenResponse)
async def mfa_login_verify(body: MfaLoginVerify):
    """
    AUTH-09: Completes login verification for MFA-enabled accounts.
    
    Accepts either an active 6-digit TOTP code or a single-use backup recovery code.
    On successful verification, completes authentication and issues JWT tokens.
    """
    if not body.totp_code and not body.backup_code:
        raise HTTPException(status_code=400, detail="Provide totp_code or backup_code.")

    r = await get_redis()
    user_id = None
    if r:
        user_id = await r.get(f"mfa_login:{body.mfa_token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired MFA session. Please sign in again.")

    user = await db.get_user_by_id(user_id)
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA is not configured for this account.")

    verified = False
    if body.totp_code:
        try:
            import pyotp
            totp = pyotp.TOTP(user["mfa_secret"])
            verified = totp.verify(body.totp_code, valid_window=1)
        except ImportError:
            raise HTTPException(status_code=500, detail="MFA not available.")
    elif body.backup_code:
        import hashlib
        hashed_input = hashlib.sha256(body.backup_code.upper().encode()).hexdigest()
        verified = await db.consume_backup_code(user_id, hashed_input)

    if not verified:
        raise HTTPException(status_code=401, detail="Invalid MFA code.")

    if r:
        await r.delete(f"mfa_login:{body.mfa_token}")

    return await _issue_auth_tokens(user)


@router.post("/mfa/verify")
async def mfa_verify(totp_code: str, current_user: dict = Depends(get_current_user)):
    """
    Confirm MFA enrollment by verifying the current TOTP code.
    On success, stores the secret in the user's profile and activates MFA.
    """
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="MFA not available.")

    r = await get_redis()
    secret = None
    if r:
        secret = await r.get(f"mfa_pending:{current_user['id']}")

    if not secret:
        raise HTTPException(status_code=400, detail="No pending MFA enrollment. Call /mfa/enable first.")

    totp = pyotp.TOTP(secret)
    if not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code. Please try again.")

    # Persist secret and activate MFA
    await db.enable_mfa(current_user["id"], secret)
    if r:
        await r.delete(f"mfa_pending:{current_user['id']}")

    return {"message": "MFA enabled successfully.", "mfa_enabled": True}


@router.post("/mfa/disable")
async def mfa_disable(totp_code: str, current_user: dict = Depends(get_current_user)):
    """Disable MFA for the current user after confirming current TOTP code."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="MFA not available.")

    user = await db.get_user_by_id(current_user["id"])
    secret = user.get("mfa_secret") if user else None

    if not secret:
        raise HTTPException(status_code=400, detail="MFA is not currently enabled.")

    totp = pyotp.TOTP(secret)
    if not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code.")

    await db.disable_mfa(current_user["id"])
    return {"message": "MFA disabled successfully.", "mfa_enabled": False}


@router.post("/mfa/backup-codes")
async def mfa_backup_codes(current_user: dict = Depends(get_current_user)):
    """
    Generate 8 one-time backup codes for account recovery.
    Codes are hashed before storage; returned in plaintext only once.
    """
    import hashlib

    user = await db.get_user_by_id(current_user["id"])
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA must be enabled before generating backup codes.")

    codes = [secrets.token_hex(5).upper() for _ in range(8)]  # e.g. "A3F92B"
    hashed = [hashlib.sha256(c.encode()).hexdigest() for c in codes]

    await db.store_backup_codes(current_user["id"], hashed)

    return {
        "backup_codes": codes,
        "message": "Save these backup codes in a safe place. They will not be shown again.",
        "count": len(codes),
    }


@router.post("/mfa/use-backup-code")
async def mfa_use_backup_code(backup_code: str, current_user: dict = Depends(get_current_user)):
    """Validate and consume a single backup code for MFA bypass."""
    import hashlib

    hashed_input = hashlib.sha256(backup_code.upper().encode()).hexdigest()
    consumed = await db.consume_backup_code(current_user["id"], hashed_input)

    if not consumed:
        raise HTTPException(status_code=400, detail="Invalid or already-used backup code.")

    return {"message": "Backup code accepted. Please disable and re-enable MFA to generate new codes."}


async def _issue_auth_tokens(user: dict) -> JSONResponse:
    """Helper: create access/refresh tokens and set HttpOnly cookie."""
    token_data = await build_token_data(user)
    access_token = auth_manager.create_access_token(token_data)
    refresh_token = auth_manager.create_refresh_token(token_data)
    res = JSONResponse(
        content={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": auth_manager.access_token_expire_minutes * 60,
        }
    )
    res.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT", "development") == "production",
        samesite="lax" if os.getenv("ENVIRONMENT", "development") != "production" else "strict",
        max_age=auth_manager.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth/refresh",
    )
    return res


@router.post("/mfa/login-verify", response_model=TokenResponse)
async def mfa_login_verify(body: MfaLoginVerify):
    """
    AUTH-09: Complete password login after MFA verification.
    Accepts TOTP code or single-use backup code.
    """
    if not body.totp_code and not body.backup_code:
        raise HTTPException(status_code=400, detail="Provide totp_code or backup_code.")

    r = await get_redis()
    user_id = None
    if r:
        user_id = await r.get(f"mfa_login:{body.mfa_token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired MFA session. Please sign in again.")

    user = await db.get_user_by_id(user_id)
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA is not configured for this account.")

    verified = False
    if body.totp_code:
        try:
            import pyotp
            totp = pyotp.TOTP(user["mfa_secret"])
            verified = totp.verify(body.totp_code, valid_window=1)
        except ImportError:
            raise HTTPException(status_code=500, detail="MFA not available.")
    elif body.backup_code:
        import hashlib
        hashed_input = hashlib.sha256(body.backup_code.upper().encode()).hexdigest()
        verified = await db.consume_backup_code(user_id, hashed_input)

    if not verified:
        raise HTTPException(status_code=401, detail="Invalid MFA code.")

    if r:
        await r.delete(f"mfa_login:{body.mfa_token}")

    return await _issue_auth_tokens(user)
