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
    """Call Notification Service to send email."""
    notification_url = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8008")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{notification_url}/api/v1/notifications/email",
                json={"to": to, "template": template, "data": data},
                timeout=5.0
            )
    except Exception as e:
        print(f"Failed to send email via notification service: {e}")


async def _send_registration_verification_otp(user_id: str, email: str, display_name: str) -> None:
    """AUTH-06: Send OTP on registration so users can verify before password login."""
    otp = str(secrets.randbelow(1000000)).zfill(6)
    r = await get_redis()
    if r:
        await r.setex(f"email_verify:{user_id}", 86400, otp)
    await send_email_notification(
        to=email,
        template="verify_email",
        data={"name": display_name, "otp": otp},
    )


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
security = HTTPBearer()

# Redis for token blacklist and rate limiting
redis_client = None

# Rate limiting configuration
MAX_LOGIN_ATTEMPTS = 5
LOCK_DURATION_MINUTES = 30
REGISTER_RATE_LIMIT = 5  # per hour per IP
LOGIN_RATE_LIMIT = 10  # per hour per IP


async def get_redis():
    global redis_client
    if redis_client is None:
        try:
            redis_client = await redis.from_url(
                f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}",
                decode_responses=True
            )
        except Exception as e:
            # Log error but don't crash - service can work without Redis
            print(f"Redis connection failed: {e}")
    return redis_client


async def get_token_version(user_id: str) -> int:
    try:
        r = await get_redis()
        if not r:
            return 0
        value = await r.get(f"token_version:{user_id}")
        return int(value or 0)
    except Exception:
        return 0


async def build_token_data(user: dict) -> dict:
    user_id = str(user["id"])
    return {
        "sub": user_id,
        "email": user["email"],
        "token_version": await get_token_version(user_id),
    }


async def check_rate_limit(request: Request, key: str, limit: int, window_seconds: int = 3600) -> bool:
    """Check if request is within rate limit"""
    try:
        r = await get_redis()
        if not r:
            return True  # Allow if Redis is unavailable
        
        client_ip = request.client.host if request.client else "unknown"
        rate_key = f"rate_limit:{key}:{client_ip}"
        
        current = await r.incr(rate_key)
        if current == 1:
            await r.expire(rate_key, window_seconds)
        
        return current <= limit
    except Exception:
        return True  # Allow if Redis fails


async def assert_token_version(payload: dict) -> None:
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
    token = credentials.credentials
    payload = auth_manager.verify_access_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    await assert_token_version(payload)
    
    # Check if token is blacklisted
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
        pass  # Continue if Redis fails
    
    user_id = payload.get("sub")
    user = await db.get_user_by_id(user_id)  # Use get_user_by_id for security
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, request: Request, background_tasks: BackgroundTasks):
    # Rate limiting
    if not await check_rate_limit(request, "register", REGISTER_RATE_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later."
        )
    
    # Check if user exists (case-insensitive)
    existing_user = await db.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash password
    password_hash = auth_manager.hash_password(user_data.password)
    
    try:
        # Create user with transaction
        user = await db.create_user(user_data.email, password_hash, user_data.display_name)
        
        # Create user plan and quota
        await db.create_user_plan(str(user["id"]))
        await db.create_usage_quota(str(user["id"]))
        
        # Generate tokens
        token_data = await build_token_data(user)
        access_token = auth_manager.create_access_token(token_data)
        refresh_token = auth_manager.create_refresh_token(token_data)
        
        # Send welcome + verification emails asynchronously (AUTH-06)
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
        # AUTH-04: Set refresh token in HttpOnly cookie — prevents XSS theft
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
    # Rate limiting
    if not await check_rate_limit(request, "login", LOGIN_RATE_LIMIT):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later."
        )
    
    # Check if account is locked
    if await db.is_account_locked(user_data.email):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked due to too many failed attempts. Please try again later."
        )
    
    user = await db.get_user_by_email(user_data.email)
    
    if not user or not auth_manager.verify_password(user_data.password, user["password_hash"]):
        # Increment failed login attempts
        await db.increment_failed_login_attempts(user_data.email)
        
        # Check if should lock account
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
    
    # Reset failed login attempts on successful login
    await db.reset_failed_login_attempts(user_data.email)

    # AUTH-06: Require verified email for password login (OAuth marks verified on callback)
    if user.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before signing in. Check your inbox or request a new code in Settings.",
        )

    # AUTH-12: IP-based suspicious login detection
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    # Get recent login history for risk assessment
    recent_history = await db.get_recent_login_history(str(user["id"]), limit=5)
    
    # Calculate risk score using GeoIP
    risk_assessment = geoip_service.get_risk_score(client_ip, recent_history)
    
    # Record login history
    await db.record_login_history(
        user_id=str(user["id"]),
        ip_address=client_ip,
        location=risk_assessment["location"],
        risk_score=risk_assessment["risk_score"],
        risk_level=risk_assessment["risk_level"],
        user_agent=user_agent
    )
    
    # Send security notification for high-risk logins
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
    
    # AUTH-09: MFA challenge before issuing tokens
    if user.get("mfa_enabled"):
        mfa_token = secrets.token_urlsafe(32)
        r = await get_redis()
        if r:
            await r.setex(f"mfa_login:{mfa_token}", 300, str(user["id"]))
        return JSONResponse(
            content={
                "mfa_required": True,
                "mfa_token": mfa_token,
                "expires_in": 300,
            }
        )

    # Generate tokens
    token_data = await build_token_data(user)
    access_token = auth_manager.create_access_token(token_data)
    refresh_token = auth_manager.create_refresh_token(token_data)

    # Include risk assessment in response for client-side awareness
    response_data = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": auth_manager.access_token_expire_minutes * 60,
    }
    
    # Only include risk info if it's medium or high
    if risk_assessment["risk_level"] in ("medium", "high"):
        response_data["security_alert"] = {
            "risk_level": risk_assessment["risk_level"],
            "reasons": risk_assessment["reasons"],
            "location": risk_assessment["location"]
        }
    
    res = JSONResponse(content=response_data)
    # AUTH-04: Set refresh token in HttpOnly cookie — prevents XSS theft
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
    """AUTH-04: Reads refresh_token from HttpOnly cookie or request body fallback."""
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

    # Check if token is blacklisted
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

    # Verify user still exists
    user = await db.get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Generate new tokens
    token_data_new = await build_token_data(user)
    new_access_token = auth_manager.create_access_token(token_data_new)
    new_refresh_token = auth_manager.create_refresh_token(token_data_new)

    # Blacklist old refresh token (token rotation)
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
    # Issue new refresh token in HttpOnly cookie
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
    token = credentials.credentials
    try:
        r = await get_redis()
        if r:
            # Blacklist the token
            await r.setex(f"blacklist:{token}", 
                        auth_manager.access_token_expire_minutes * 60, "1")
    except Exception:
        pass  # Continue even if Redis fails
    
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(credentials: HTTPAuthorizationCredentials = Depends(security), current_user: dict = Depends(get_current_user)):
    """Logout from all devices by blacklisting all tokens for user"""
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
    """AUTH-11: Admin token generation for user impersonation."""
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
        
    # Generate tokens representing target user
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
    AUTH-05: Verify admin role for API Gateway RBAC enforcement.
    Returns user_id and role in headers for nginx auth_request.
    """
    from fastapi import Response
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
    
    # Return user info in headers for nginx auth_request
    response = Response(status_code=200)
    response.headers["X-User-Id"] = str(user["id"])
    response.headers["X-User-Role"] = user_role
    return response



@router.post("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user: dict = Depends(get_current_user)
):
    # Verify current password
    if not auth_manager.verify_password(password_data.current_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Check if new password is same as current
    if auth_manager.verify_password(password_data.new_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    # Hash new password
    new_password_hash = auth_manager.hash_password(password_data.new_password)
    
    # Update password
    await db.update_password(str(current_user["id"]), new_password_hash)

    # AUTH-10: Invalidate all existing sessions by incrementing token_version in Redis.
    # All JWTs issued before this point will fail token_version check on next request.
    try:
        r = await get_redis()
        if r:
            version_key = f"token_version:{current_user['id']}"
            await r.incr(version_key)
            # Ensure the key persists for at least 30 days (matches max refresh TTL)
            await r.expire(version_key, 30 * 24 * 3600)
    except Exception:
        pass

    return {"message": "Password changed successfully. All existing sessions have been invalidated."}


@router.post("/reset-password-request")
async def reset_password_request(request_data: ResetPasswordRequest, request: Request, background_tasks: BackgroundTasks):
    # Rate limiting
    if not await check_rate_limit(request, "reset_password", 3):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset attempts. Please try again later."
        )
    
    # Check if user exists
    user = await db.get_user_by_email(request_data.email)
    if not user:
        # Don't reveal if email exists for security
        return {"message": "If the email exists, a reset link has been sent"}
    
    # Generate secure reset token
    reset_token = secrets.token_urlsafe(32)
    
    # Store token in database
    await db.store_password_reset_token(str(user["id"]), reset_token)
    
    # Send reset link email asynchronously
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    background_tasks.add_task(
        send_email_notification,
        to=user["email"],
        template="reset_password",
        data={"reset_url": reset_url}
    )
    
    return {
        "message": "If the email exists, a reset link has been sent"
    }


@router.post("/reset-password-confirm")
async def reset_password_confirm(confirm_data: ResetPasswordConfirm):
    # Validate token
    token_data = await db.get_password_reset_token(confirm_data.token)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Check if token already used
    if token_data["used"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used"
        )
    
    # Check if token expired
    if token_data["expires_at"] < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
    
    # Hash new password
    new_password_hash = auth_manager.hash_password(confirm_data.new_password)
    
    # Update password
    await db.update_password(str(token_data["user_id"]), new_password_hash)
    
    # Mark token as used
    await db.mark_password_reset_token_used(confirm_data.token)
    
    # Reset failed login attempts
    await db.reset_failed_login_attempts(token_data["email"])
    
    return {"message": "Password reset successfully"}


# ─── Email Verification (AUTH-06) ─────────────────────────────────────────────

@router.post("/verify-email/request")
async def verify_email_request(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """
    Generate a 6-digit OTP and email it to the user.
    Stores OTP in Redis with 24-hour expiry (per AUTH-06).
    Sends via Amazon SES through Notification Service.
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
        await r.setex(token_key, 86400, otp)  # 24-hour TTL
        await r.setex(cooldown_key, 60, "1")  # 60s resend cooldown

    # Send verification email asynchronously
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
    """Confirm email using the OTP sent to the user."""
    r = await get_redis()
    token_key = f"email_verify:{current_user['id']}"

    if r:
        stored = await r.get(token_key)
        if not stored or stored != token:
            raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        await r.delete(token_key)
    # Mark email as verified in DB
    await db.mark_email_verified(current_user["id"])
    return {"message": "Email address successfully verified.", "verified": True}


# ─── MFA / TOTP (AUTH-09) ─────────────────────────────────────────────────────

@router.post("/mfa/enable")
async def mfa_enable(current_user: dict = Depends(get_current_user)):
    """
    Begin MFA enrollment: generate a TOTP secret and return
    - the raw secret (for manual entry)
    - a provisioning URI (for QR code generation in the frontend)
    """
    try:
        import pyotp
        import base64
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

    # Store pending MFA secret in Redis until user confirms it
    r = await get_redis()
    if r:
        await r.setex(f"mfa_pending:{current_user['id']}", 600, secret)  # 10 min TTL

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
        "message": "Scan the QR code, then confirm with /mfa/verify",
        "backup_codes_note": "After confirming, call /mfa/backup-codes to get your backup codes.",
    }


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
