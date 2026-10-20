"""
DevMeet Admin Service - API Route Endpoints
===========================================
This module defines the RESTful endpoints for privileged administrative operations across
the DevMeet platform.

Core Capabilities:
1. Role-Based Access Control (RBAC):
   - Every route is guarded by `require_admin`, querying the Auth Service (`/api/v1/auth/me`)
     to assert caller credentials and ensure role is 'admin' or 'super_admin'.
2. Platform Health & Business Intelligence:
   - Aggregated system metrics (user counts, session completion ratios, estimated MRR).
3. Candidate & User Management:
   - Paginated user directory with subscription tier and block status filtering.
   - User account detail view with nested interview history.
   - User moderation: Account suspension/blocking and unblocking.
   - Manual plan overrides (granting Pro or Enterprise access).
   - GDPR Right-to-be-Forgotten: Permanent soft-delete with PII scrubbing.
   - Support Impersonation: Inter-service delegation to Auth Service for temporary tokens.
4. Session Moderation:
   - Platform-wide session listing and administrative termination of runaway sessions.
5. Immutable Security Auditing:
   - Forensic event logging recording operator IDs, target resources, client IPs, and timestamps.
"""

from fastapi import APIRouter, HTTPException, Query, Request, Body, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from datetime import datetime
from .models import UserSummary, AuditLog, AdminStats, UserDetailResponse, PlanUpdateRequest
from .database import db
import httpx
import os

# FastAPI router mount point under /api/v1/admin
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# HTTP Bearer security scheme extractor for JWT tokens
security = HTTPBearer()

# Base URL for inter-service communication with the central Auth Service
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")

_admin_http_client: Optional[httpx.AsyncClient] = None


def get_admin_http_client() -> httpx.AsyncClient:
    """Returns or initializes a connection-pooled HTTP client for admin inter-service calls."""
    global _admin_http_client
    if _admin_http_client is None or _admin_http_client.is_closed:
        _admin_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=3.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=50)
        )
    return _admin_http_client


async def close_admin_http_client():
    """Gracefully closes the pooled admin HTTP client on service shutdown."""
    global _admin_http_client
    if _admin_http_client and not _admin_http_client.is_closed:
        await _admin_http_client.aclose()
        _admin_http_client = None


# ─── RBAC: Admin Guard (AUTH-05) ─────────────────────────────────────────────

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    FastAPI dependency enforcing Role-Based Access Control (RBAC) on admin routes.
    
    Architecture / Flow:
    1. Extracts the Bearer token from the incoming HTTP Authorization header.
    2. Issues an inter-service GET request to the Auth Service's `/api/v1/auth/me` endpoint.
    3. Verifies that the authenticated user's role is either 'admin' or 'super_admin'.
    4. Rejects unauthorized or regular candidate tokens with HTTP 403 Forbidden.
    5. Handles token expiration (401) or auth service downtime (503).

    Args:
        credentials (HTTPAuthorizationCredentials): Injected Bearer token payload.

    Returns:
        dict: The authenticated administrator's profile claims.

    Raises:
        HTTPException(401): If the token is invalid or expired.
        HTTPException(403): If the user does not possess an administrative role.
        HTTPException(503): If the Auth Service is unreachable.
    """
    token = credentials.credentials
    try:
        # Validate token against Auth Service with pooled client
        client = get_admin_http_client()
        response = await client.get(
            f"{AUTH_SERVICE_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user = response.json()
    except HTTPException:
        # Re-raise explicit HTTP exceptions
        raise
    except Exception:
        # Prevent silent failure if auth-service is down or network partition occurs
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    # Verify administrative privilege level
    role = user.get("role", "user")
    if role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=403,
            detail="Access denied: admin role required",
        )
    return user


# ─── Stats & Overview ────────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStats)
async def get_stats(admin: dict = Depends(require_admin)):
    """
    Retrieves platform-wide key performance indicators (KPIs) and operational metrics.

    Calculates:
    - User totals, daily sign-ups, and suspended accounts.
    - Tier breakdowns (Free, Pro, Enterprise) and estimated monthly recurring revenue (MRR).
    - Interview session throughput (active, completed, daily volume).

    Security:
        Requires 'admin' or 'super_admin' role.

    Returns:
        AdminStats: Strongly-typed Pydantic model containing platform telemetry.
    """
    stats = await db.get_admin_stats()
    return stats


# ─── User Management ─────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserSummary])
async def list_users(
    q: Optional[str] = Query(None, description="Search by name or email substring"),
    plan: Optional[str] = Query(None, description="Filter by plan: free, pro, enterprise"),
    is_blocked: Optional[bool] = Query(None, description="Filter by blocked status"),
    limit: int = Query(50, ge=1, le=200, description="Page size limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    admin: dict = Depends(require_admin),
):
    """
    Fetches a paginated, filterable directory of platform candidate and operator accounts.

    Supports filtering by search query (email or display name), plan subscription tier,
    and account suspension state.

    Args:
        q (str, optional): Keyword query for substring match.
        plan (str, optional): Tier filter ('free', 'pro', 'enterprise').
        is_blocked (bool, optional): Boolean filter for suspended accounts.
        limit (int): Bounded pagination limit (1-200, default 50).
        offset (int): Starting record offset.
        admin (dict): Injected administrator session payload.

    Returns:
        List[UserSummary]: List of matching user profile records.
    """
    users = await db.get_all_users(search=q, plan=plan, is_blocked=is_blocked, limit=limit, offset=offset)
    return users


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user(user_id: str, admin: dict = Depends(require_admin)):
    """
    Retrieves deep operational profile details for an individual user account.

    Combines profile data with session aggregates (total sessions initiated, completed sessions).

    Args:
        user_id (str): UUID string of the candidate/user.
        admin (dict): Injected administrator session.

    Returns:
        UserDetailResponse: Extended profile including interview participation statistics.

    Raises:
        HTTPException(404): If user account does not exist.
    """
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Fetch historical interview sessions to compute completion metrics
    sessions = await db.get_user_sessions(user_id)
    return UserDetailResponse(
        id=str(user["id"]),
        email=user["email"],
        display_name=user["display_name"],
        plan=user.get("plan", "free"),
        is_blocked=user.get("is_blocked", False),
        created_at=user["created_at"],
        updated_at=user.get("updated_at", user["created_at"]),
        total_sessions=len(sessions),
        completed_sessions=sum(1 for s in sessions if s.get("status") == "completed"),
    )


@router.post("/users/{user_id}/block")
async def block_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """
    Suspends a candidate account immediately, invalidating login capabilities.

    Side Effects:
    - Sets `is_blocked = True` in user repository.
    - Appends an audit event (`user.block`) with operator IP and target email.

    Args:
        user_id (str): Target user UUID.
        request (Request): Raw HTTP request for IP resolution.
        admin (dict): Injected admin caller credentials.

    Returns:
        dict: Confirmation payload with blocked status and email.

    Raises:
        HTTPException(404): If user does not exist.
        HTTPException(500): If database update fails.
    """
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("is_blocked"):
        return {"blocked": True, "user_id": user_id, "note": "Already blocked"}

    success = await db.block_user(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to block user")

    # Extract remote caller IP address for audit compliance
    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=str(admin.get("id")) if admin else None,
        action="user.block",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"user_email": user["email"]},
    )
    return {"blocked": True, "user_id": user_id, "email": user["email"]}


@router.post("/users/{user_id}/unblock")
async def unblock_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """
    Restores active account status to a previously suspended user account.

    Side Effects:
    - Sets `is_blocked = False` in database.
    - Logs an immutable security audit entry (`user.unblock`).

    Args:
        user_id (str): Target user UUID.
        request (Request): HTTP request object.
        admin (dict): Authenticated admin details.

    Returns:
        dict: Unblock confirmation payload.

    Raises:
        HTTPException(404): If target user is not found.
        HTTPException(500): If database operation fails.
    """
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("is_blocked"):
        return {"unblocked": True, "user_id": user_id, "note": "Not currently blocked"}

    success = await db.unblock_user(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to unblock user")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=str(admin.get("id")) if admin else None,
        action="user.unblock",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"user_email": user["email"]},
    )
    return {"unblocked": True, "user_id": user_id, "email": user["email"]}


@router.put("/users/{user_id}/plan")
async def change_user_plan(user_id: str, payload: PlanUpdateRequest, request: Request, admin: dict = Depends(require_admin)):
    """
    Manually overrides a user's subscription tier (e.g. promoting candidate to Pro for testing).

    Side Effects:
    - Updates `user_plans` record in the database.
    - Creates an audit log entry (`user.plan_change`).

    Args:
        user_id (str): Target user UUID.
        payload (PlanUpdateRequest): JSON request body specifying target plan ('free', 'pro', 'enterprise').
        request (Request): HTTP request object.
        admin (dict): Injected admin caller credentials.

    Returns:
        dict: Confirmation containing updated plan name.

    Raises:
        HTTPException(404): If user is not found.
        HTTPException(500): If update fails.
    """
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success = await db.update_user_plan(user_id, payload.plan)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update plan")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=str(admin.get("id")) if admin else None,
        action="user.plan_change",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"email": user["email"], "new_plan": payload.plan},
    )
    return {"success": True, "user_id": user_id, "plan": payload.plan}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """
    Anonymizes and soft-deletes a user profile in compliance with GDPR Article 17 ("Right to Erasure").

    Removes all personally identifiable information (PII) including real email, names,
    passwords, and profile links while preserving referential integrity for historical interviews.

    Args:
        user_id (str): Target user UUID.
        request (Request): HTTP request object.
        admin (dict): Authenticated admin details.

    Returns:
        dict: Erasure confirmation with GDPR compliance notice.

    Raises:
        HTTPException(404): If user is not found.
        HTTPException(500): If anonymization fails.
    """
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success = await db.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to anonymize user")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=str(admin.get("id")) if admin else None,
        action="user.delete",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"previous_email": user["email"]},
    )
    return {"deleted": True, "user_id": user_id, "note": "User anonymized per GDPR policy"}


@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    admin: dict = Depends(require_admin)
):
    """
    Generates scoped impersonation tokens to allow support operators to reproduce candidate issues.

    Inter-Service Delegation:
    - Calls `POST {AUTH_SERVICE_URL}/api/v1/auth/impersonate-token` forwarding the admin's JWT.
    - Logs a critical security audit record tracking both admin and impersonated target IDs.

    Args:
        user_id (str): Target candidate user UUID.
        request (Request): HTTP request object.
        credentials (HTTPAuthorizationCredentials): Admin Bearer token.
        admin (dict): Injected admin caller claims.

    Returns:
        dict: Temporary session access token for impersonation.

    Raises:
        HTTPException(404): If target user does not exist.
        HTTPException(503): If Auth Service fails to respond.
    """
    target = await db.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    token = credentials.credentials
    try:
        # Request short-lived impersonation token from centralized Auth Service using pooled client
        client = get_admin_http_client()
        response = await client.post(
            f"{AUTH_SERVICE_URL}/api/v1/auth/impersonate-token?target_user_id={user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
            if response.status_code != 200:
                detail = "Failed to generate impersonation token"
                try:
                    detail = response.json().get("detail", detail)
                except Exception:
                    pass
                raise HTTPException(status_code=response.status_code, detail=detail)
            tokens_data = response.json()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=str(admin["id"]),
        action="user.impersonate",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"impersonated_email": target["email"], "admin_email": admin["email"]},
    )

    return tokens_data


# ─── Session Management ───────────────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    user_id: Optional[str] = Query(None, description="Filter by candidate user ID"),
    status: Optional[str] = Query(None, description="Filter by session status: in_progress, completed, etc."),
    limit: int = Query(50, ge=1, le=200, description="Max session records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    admin: dict = Depends(require_admin),
):
    """
    Lists platform-wide interview sessions with optional user or lifecycle state filtering.

    Args:
        user_id (str, optional): Candidate user UUID filter.
        status (str, optional): Session state filter.
        limit (int): Page size.
        offset (int): Offset.
        admin (dict): Injected admin caller credentials.

    Returns:
        dict: Payload containing the matching sessions and count.
    """
    sessions = await db.get_all_sessions(user_id=user_id, status=status, limit=limit, offset=offset)
    return {"sessions": sessions, "total": len(sessions)}


@router.delete("/sessions/{session_id}")
async def cancel_session(session_id: str, request: Request, admin: dict = Depends(require_admin)):
    """
    Forces cancellation of a stuck, orphaned, or abusive active interview session.

    Side Effects:
    - Sets session status to 'cancelled' in the database.
    - Logs an administrative audit event (`session.force_cancel`).

    Args:
        session_id (str): Session UUID string.
        request (Request): HTTP request object.
        admin (dict): Authenticated admin details.

    Returns:
        dict: Cancellation confirmation payload.

    Raises:
        HTTPException(404): If session not found or already in terminal state (completed/cancelled).
    """
    success = await db.cancel_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or already terminal")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=str(admin.get("id")) if admin else None,
        action="session.force_cancel",
        resource_type="session",
        resource_id=session_id,
        ip_address=ip,
        metadata={},
    )
    return {"cancelled": True, "session_id": session_id}


# ─── Audit Logs ──────────────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=List[AuditLog])
async def list_audit_logs(
    user_id: Optional[str] = Query(None, description="Filter logs by actor user_id"),
    action: Optional[str] = Query(None, description="Filter by action name, e.g. 'user.block'"),
    limit: int = Query(100, ge=1, le=500, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    admin: dict = Depends(require_admin),
):
    """
    Queries immutable security audit logs for compliance, incident response, and forensic review.

    Args:
        user_id (str, optional): Filter by acting administrator ID.
        action (str, optional): Filter by action string.
        limit (int): Pagination limit (1-500).
        offset (int): Pagination offset.
        admin (dict): Injected admin credentials.

    Returns:
        List[AuditLog]: Chronologically sorted list of matching audit entries.
    """
    logs = await db.get_audit_logs(limit=limit, offset=offset, user_id=user_id, action=action)
    return logs


# ─── System Health ────────────────────────────────────────────────────────────────

@router.get("/system/health")
async def system_health(admin: dict = Depends(require_admin)):
    """
    Returns administrative service health and relational database connectivity status.

    Returns:
        dict: System status flags and ISO timestamp.
    """
    # Check whether database is operating via PostgreSQL pool or mock fallback
    db_ok = getattr(db, "use_db", not getattr(db, "_use_memory", True))
    return {
        "admin_service": "healthy",
        "database": "connected" if db_ok else "in-memory fallback",
        "checked_at": datetime.utcnow().isoformat(),
    }
