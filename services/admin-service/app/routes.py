from fastapi import APIRouter, HTTPException, Query, Request, Body, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from datetime import datetime
from .models import UserSummary, AuditLog, AdminStats, UserDetailResponse, PlanUpdateRequest
from .database import db
import httpx
import os

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
security = HTTPBearer()

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")


# ─── RBAC: Admin Guard (AUTH-05) ─────────────────────────────────────────────

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dependency that verifies the caller holds an admin or super_admin role.
    Raises HTTP 403 if the role check fails.
    """
    token = credentials.credentials
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{AUTH_SERVICE_URL}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid or expired token")
            user = response.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Auth service unavailable")

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
    """Return platform-level stats: total users, active sessions, completions, etc."""
    stats = await db.get_admin_stats()
    return stats


# ─── User Management ─────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserSummary])
async def list_users(
    q: Optional[str] = Query(None, description="Search by name or email"),
    plan: Optional[str] = Query(None, description="Filter by plan: free, pro, enterprise"),
    is_blocked: Optional[bool] = Query(None, description="Filter by blocked status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin),
):
    """List all registered users with optional search and filters."""
    users = await db.get_all_users(search=q, plan=plan, is_blocked=is_blocked, limit=limit, offset=offset)
    return users


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user(user_id: str, admin: dict = Depends(require_admin)):
    """Get a full profile for a specific user."""
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
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
    """Block a user account, preventing login."""
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("is_blocked"):
        return {"blocked": True, "user_id": user_id, "note": "Already blocked"}

    success = await db.block_user(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to block user")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=None,
        action="user.block",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"user_email": user["email"]},
    )
    return {"blocked": True, "user_id": user_id, "email": user["email"]}


@router.post("/users/{user_id}/unblock")
async def unblock_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Unblock a previously blocked user account."""
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
        user_id=None,
        action="user.unblock",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"user_email": user["email"]},
    )
    return {"unblocked": True, "user_id": user_id, "email": user["email"]}


@router.put("/users/{user_id}/plan")
async def change_user_plan(user_id: str, payload: PlanUpdateRequest, request: Request, admin: dict = Depends(require_admin)):
    """Manually override a user's subscription plan (admin action)."""
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success = await db.update_user_plan(user_id, payload.plan)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update plan")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=None,
        action="user.plan_change",
        resource_type="user",
        resource_id=user_id,
        ip_address=ip,
        metadata={"email": user["email"], "new_plan": payload.plan},
    )
    return {"success": True, "user_id": user_id, "plan": payload.plan}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Anonymize and soft-delete a user account (GDPR compliance)."""
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success = await db.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to anonymize user")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=None,
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
    AUTH-11: Admin impersonation of users (audit logged).
    Requests impersonation tokens from the auth-service and logs audit trail.
    """
    target = await db.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    token = credentials.credentials
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
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
    user_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin),
):
    """List interview sessions across all users."""
    sessions = await db.get_all_sessions(user_id=user_id, status=status, limit=limit, offset=offset)
    return {"sessions": sessions, "total": len(sessions)}


@router.delete("/sessions/{session_id}")
async def cancel_session(session_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Force-cancel an active interview session."""
    success = await db.cancel_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or already terminal")

    ip = request.client.host if request.client else "unknown"
    await db.create_audit_log(
        user_id=None,
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
    user_id: Optional[str] = Query(None, description="Filter logs by user_id"),
    action: Optional[str] = Query(None, description="Filter by action name, e.g. 'user.block'"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin),
):
    """Fetch audit log entries for compliance and security monitoring."""
    logs = await db.get_audit_logs(limit=limit, offset=offset, user_id=user_id, action=action)
    return logs


# ─── System Health ────────────────────────────────────────────────────────────────

@router.get("/system/health")
async def system_health(admin: dict = Depends(require_admin)):
    """Check admin service connectivity to database."""
    db_ok = not db._use_memory
    return {
        "admin_service": "healthy",
        "database": "connected" if db_ok else "in-memory fallback",
        "checked_at": datetime.utcnow().isoformat(),
    }
