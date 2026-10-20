"""
User Service API Routes and Handlers.
=====================================
Prefix: `/api/v1/users`
This module defines the REST API endpoints for user profile management,
preferences, subscription plans, quota consumption, GDPR data portability,
account soft deletion, and public leaderboard rankings.

Key Endpoints:
--------------
- GET  `/me`               : Retrieves candidate profile details.
- PUT  `/me`               : Updates profile (display name, bio, target companies, skills).
- GET  `/me/quota`         : Checks daily and monthly interview quota remaining.
- POST `/me/quota/increment`: Atomically consumes an interview credit (called by orchestrator).
- GET  `/me/plan`          : Retrieves current billing tier.
- PUT  `/me/plan`          : Upgrades/downgrades plan tier mid-cycle.
- POST `/me/avatar`        : Uploads profile picture with virus scanning via `file-service`.
- PUT  `/{user_id}/plan`   : Internal webhook endpoint called by `payment-service`.
- GET  `/me/export`        : GDPR Article 20 data export.
- DELETE `/me`             : GDPR Article 17 Right to Erasure (soft delete & PII scrub).
- GET  `/leaderboard`      : Public community rankings by average interview score.
"""

from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import httpx
import os
import aiofiles
from typing import List
from .models import UserProfileUpdate, UserProfileResponse, UserQuotaResponse, UserPlanResponse, Plan, LeaderboardEntry
from .database import db

router = APIRouter(prefix="/api/v1/users", tags=["users"])
security = HTTPBearer()

# Microservice endpoints resolved via environment variables or default local ports
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
FILE_SERVICE_URL = os.getenv("FILE_SERVICE_URL", "http://localhost:8011")


async def verify_token(token: str) -> dict:
    """
    Validates a JWT Bearer token by forwarding it to Auth Service (`auth-service:8001`).

    Parameters:
        token (str): Raw JWT token string from Authorization header.

    Returns:
        dict: User profile dictionary if valid, or None if expired/invalid.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{AUTH_SERVICE_URL}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            if response.status_code == 200:
                return response.json()
            return None
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency that validates the caller's JWT token and returns authenticated user data.
    
    Raises:
        HTTPException(401): If token is invalid or rejected by Auth Service.
    """
    token = credentials.credentials
    user = await verify_token(token)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return user


@router.get("/me", response_model=UserProfileResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the full profile details of the authenticated candidate.
    """
    user = await db.get_user_by_id(current_user["id"])
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserProfileResponse(
        id=str(user["id"]),
        email=user["email"],
        display_name=user["display_name"],
        avatar_url=user.get("avatar_url"),
        bio=user.get("bio"),
        target_companies=user.get("target_companies"),
        skills=user.get("skills"),
        interview_reminder_enabled=user["interview_reminder_enabled"],
        profile_public=user["profile_public"],
        created_at=user["created_at"],
        updated_at=user["updated_at"]
    )


@router.put("/me", response_model=UserProfileResponse)
async def update_profile(
    profile_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Applies partial updates to the candidate's profile.
    
    Filters out None attributes to only persist explicitly supplied fields.
    """
    updates = {}
    if profile_data.display_name is not None:
        updates["display_name"] = profile_data.display_name
    if profile_data.avatar_url is not None:
        updates["avatar_url"] = profile_data.avatar_url
    if profile_data.bio is not None:
        updates["bio"] = profile_data.bio
    if profile_data.target_companies is not None:
        updates["target_companies"] = profile_data.target_companies
    if profile_data.skills is not None:
        updates["skills"] = profile_data.skills
    if profile_data.interview_reminder_enabled is not None:
        updates["interview_reminder_enabled"] = profile_data.interview_reminder_enabled
    if profile_data.profile_public is not None:
        updates["profile_public"] = profile_data.profile_public
    
    user = await db.update_user_profile(current_user["id"], updates)
    
    return UserProfileResponse(
        id=str(user["id"]),
        email=user["email"],
        display_name=user["display_name"],
        avatar_url=user.get("avatar_url"),
        bio=user.get("bio"),
        target_companies=user.get("target_companies"),
        skills=user.get("skills"),
        interview_reminder_enabled=user["interview_reminder_enabled"],
        profile_public=user["profile_public"],
        created_at=user["created_at"],
        updated_at=user["updated_at"]
    )


@router.get("/me/quota", response_model=UserQuotaResponse)
async def get_quota(current_user: dict = Depends(get_current_user)):
    """
    Retrieves current interview session consumption and remaining credits.
    
    Calculates `remaining_today` and `remaining_month` against plan limits.
    Returns -1 for remaining limits when the user is on an unlimited plan (Pro/Enterprise).
    """
    quota = await db.get_user_quota(current_user["id"])
    
    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User quota not found"
        )
    
    limits = await db.get_plan_limits(quota["plan"])
    
    return UserQuotaResponse(
        interviews_today=quota["interviews_today"],
        interviews_this_month=quota["interviews_this_month"],
        last_reset_date=quota["last_reset_date"],
        plan=Plan(quota["plan"]),
        daily_limit=limits["daily"],
        monthly_limit=limits["monthly"],
        remaining_today=max(0, limits["daily"] - quota["interviews_today"]) if limits["daily"] > 0 else -1,
        remaining_month=max(0, limits["monthly"] - quota["interviews_this_month"]) if limits["monthly"] > 0 else -1
    )


@router.get("/me/plan", response_model=UserPlanResponse)
async def get_plan(current_user: dict = Depends(get_current_user)):
    """
    Retrieves candidate's current subscription plan record.
    """
    plan = await db.get_user_plan(current_user["id"])
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User plan not found"
        )
    
    return UserPlanResponse(
        plan=Plan(plan["plan"]),
        created_at=plan["created_at"],
        updated_at=plan["updated_at"]
    )


class PlanUpgradeRequest(BaseModel):
    """Payload schema for requesting a plan tier upgrade or downgrade."""
    plan: str  # "free", "pro", or "enterprise"


@router.put("/me/plan")
async def upgrade_plan(
    request: PlanUpgradeRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    USER-02: Handles self-serve mid-cycle plan upgrades and downgrades.
    
    On Upgrade (e.g. Free -> Pro):
    - Resets `interviews_today` and `interviews_this_month` to 0 so the user immediately
      benefits from higher allowances without waiting for the next billing cycle.
    
    On Downgrade:
    - Retains existing usage counters; stricter limits will take effect on next interview.
    """
    new_plan = request.plan.lower()
    if new_plan not in ("free", "pro", "enterprise"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan '{new_plan}'. Must be free, pro, or enterprise."
        )

    current_plan_row = await db.get_user_plan(current_user["id"])
    current_plan = current_plan_row["plan"] if current_plan_row else "free"

    if current_plan == new_plan:
        raise HTTPException(
            status_code=400,
            detail=f"User is already on the '{new_plan}' plan."
        )

    PLAN_RANK = {"free": 0, "pro": 1, "enterprise": 2}
    is_upgrade = PLAN_RANK.get(new_plan, 0) > PLAN_RANK.get(current_plan, 0)

    # Update subscription record
    await db.update_user_plan(current_user["id"], new_plan)

    # On upgrade, reset quota counters immediately
    if is_upgrade:
        try:
            await db.reset_quota(current_user["id"])
        except Exception:
            pass

    quota = await db.get_user_quota(current_user["id"])
    limits = await db.get_plan_limits(new_plan)

    return {
        "success": True,
        "previous_plan": current_plan,
        "new_plan": new_plan,
        "change_type": "upgrade" if is_upgrade else "downgrade",
        "quota_reset": is_upgrade,
        "quota": {
            "interviews_today": quota["interviews_today"] if quota else 0,
            "interviews_this_month": quota["interviews_this_month"] if quota else 0,
            "daily_limit": limits["daily"],
            "monthly_limit": limits["monthly"],
        },
        "message": (
            f"Successfully upgraded to {new_plan.upper()}! Your quota has been reset. Enjoy your new limits!"
            if is_upgrade else
            f"Plan changed to {new_plan.upper()}. Current usage counts are retained."
        ),
    }


@router.post("/me/quota/increment")
async def increment_quota(current_user: dict = Depends(get_current_user)):
    """
    Consumes 1 interview session credit.
    
    Called by `orchestrator-service` when a candidate launches a new interview session.
    Returns HTTP 429 Too Many Requests if the candidate has exhausted their daily or monthly allowance.
    """
    try:
        quota = await db.increment_quota(current_user["id"])
        limits = await db.get_plan_limits(quota["plan"])
        
        return UserQuotaResponse(
            interviews_today=quota["interviews_today"],
            interviews_this_month=quota["interviews_this_month"],
            last_reset_date=quota["last_reset_date"],
            plan=Plan(quota["plan"]),
            daily_limit=limits["daily"],
            monthly_limit=limits["monthly"],
            remaining_today=max(0, limits["daily"] - quota["interviews_today"]) if limits["daily"] > 0 else -1,
            remaining_month=max(0, limits["monthly"] - quota["interviews_this_month"]) if limits["monthly"] > 0 else -1
        )
    except Exception as e:
        if "limit reached" in str(e):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to increment quota"
        )


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    USER-01: Handles candidate avatar image upload with virus scanning.
    
    Security Controls:
    1. MIME Type Whitelist: Restricts to jpeg, png, gif, and webp images.
    2. Size Limit: Rejects uploads larger than 5 Megabytes.
    3. Multi-service Delegation: Streams bytes to `file-service` with `virus_scan=true`.
    4. Database Update: Saves the returned signed S3/CDN URL into candidate's profile.
    """
    # 1. Validate MIME type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # 2. Enforce 5MB file size limit
    max_size = 5 * 1024 * 1024  # 5MB
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5MB limit"
        )
    
    # 3. Forward to file service for scanning and persistence
    try:
        async with httpx.AsyncClient() as client:
            files = {"file": (file.filename, content, file.content_type)}
            data = {"purpose": "avatar", "virus_scan": "true"}
            response = await client.post(
                f"{FILE_SERVICE_URL}/api/v1/files/upload",
                files=files,
                data=data,
                timeout=30.0
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to upload file to file service"
                )
            
            file_data = response.json()
            avatar_url = file_data.get("url")
            
            if not avatar_url:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="File service did not return a URL"
                )
            
            # 4. Save avatar URL in PostgreSQL
            await db.update_user_profile(current_user["id"], {"avatar_url": avatar_url})
            
            return {
                "success": True,
                "avatar_url": avatar_url,
                "message": "Avatar uploaded successfully"
            }
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"File service unavailable: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload avatar: {str(e)}"
        )


# ─── Service-to-Service: Plan Update (called by payment-service) ─────────────────

@router.put("/{user_id}/plan")
async def update_user_plan_internal(user_id: str, body: dict):
    """
    Internal service-to-service endpoint called by `payment-service` upon Stripe webhook confirmation.
    
    Updates the candidate's subscription tier without requiring an end-user JWT.
    Protected at the network/gateway layer (inaccessible from external public internet).
    """
    new_plan = body.get("plan", "free")
    if new_plan not in ("free", "pro", "enterprise"):
        raise HTTPException(status_code=400, detail=f"Invalid plan: {new_plan}")
    try:
        await db.update_user_plan(user_id, new_plan)
        return {"success": True, "user_id": user_id, "plan": new_plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plan update failed: {str(e)}")


# ─── GDPR: Data Export ────────────────────────────────────────────────────────────

@router.get("/me/export")
async def export_my_data(current_user: dict = Depends(get_current_user)):
    """
    GDPR Article 20: Data Portability Export.
    
    Generates a structured, downloadable JSON archive containing all personal metadata,
    candidate settings, skills, target companies, plan history, and usage metrics.
    """
    user = await db.get_user_by_id(current_user["id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    quota = await db.get_user_quota(current_user["id"])
    plan = await db.get_user_plan(current_user["id"])

    export = {
        "data_export_version": "1.0",
        "exported_at": __import__("datetime").datetime.utcnow().isoformat(),
        "profile": {
            "id": str(user["id"]),
            "email": user["email"],
            "display_name": user["display_name"],
            "avatar_url": user.get("avatar_url"),
            "bio": user.get("bio"),
            "target_companies": user.get("target_companies"),
            "skills": user.get("skills"),
            "profile_public": user.get("profile_public"),
            "interview_reminder_enabled": user.get("interview_reminder_enabled"),
            "created_at": user["created_at"].isoformat() if hasattr(user["created_at"], "isoformat") else str(user["created_at"]),
        },
        "subscription": {
            "plan": plan["plan"] if plan else "free",
        },
        "usage": {
            "interviews_this_month": quota["interviews_this_month"] if quota else 0,
            "interviews_today": quota["interviews_today"] if quota else 0,
        },
        "note": "For complete session transcripts and feedback reports, contact privacy@devmeet.com",
    }
    return export


# ─── Account Soft-Delete (GDPR Right to Erasure) ─────────────────────────────────

@router.delete("/me")
async def delete_my_account(current_user: dict = Depends(get_current_user)):
    """
    USER-04: GDPR Article 17 - Right to Erasure / Account Deletion.
    
    Anonymizes all personal identifying fields and marks the account as soft-deleted.
    Terminates any active interview sessions and queues final data purging after 30 days.
    """
    try:
        result = await db.soft_delete_user(current_user["id"])
        if not result:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "deleted": True,
            "user_id": str(result["id"]),
            "deleted_at": result["deleted_at"].isoformat() if hasattr(result["deleted_at"], "isoformat") else str(result["deleted_at"]),
            "note": "Account anonymized per GDPR policy. Data will be permanently deleted after 30 days."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Account deletion failed: {str(e)}")


@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(limit: int = 25, current_user: dict = Depends(get_current_user)):
    """
    USER-06: Global Community Leaderboard.
    
    Returns public candidate profiles ranked by average interview feedback score.
    The `limit` parameter is clamped between 1 and 100 to protect server resources.
    """
    entries = await db.get_leaderboard(min(max(limit, 1), 100))
    return entries
