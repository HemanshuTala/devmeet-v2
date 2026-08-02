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

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
FILE_SERVICE_URL = os.getenv("FILE_SERVICE_URL", "http://localhost:8011")


async def verify_token(token: str) -> dict:
    """Verify token with Auth Service"""
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
    # Build updates dict with only non-None fields
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
    plan: str  # "free", "pro", or "enterprise"


@router.put("/me/plan")
async def upgrade_plan(
    request: PlanUpgradeRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    USER-02: Mid-cycle plan upgrade/downgrade.
    On upgrade: resets daily/monthly quota counters so the user immediately
    benefits from higher limits without waiting for the next billing cycle.
    On downgrade: keeps current quota counts (limits apply on next check).
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

    # Update the plan tier
    await db.update_user_plan(current_user["id"], new_plan)

    # On upgrade, reset quota counters so user gets full limits immediately
    if is_upgrade:
        try:
            await db.reset_quota(current_user["id"])
        except Exception:
            pass  # Non-critical; quota will still update on next increment

    # Return updated quota
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
    USER-01: Upload avatar with virus scan via file service.
    """
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5MB limit"
        )
    
    # Upload to file service with virus scan
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
            
            # Update user profile with new avatar URL
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
    Internal endpoint — called by payment-service after a successful Stripe webhook.
    Updates the user's subscription plan tier.
    No user JWT required; secured by internal network (service mesh / K8s namespace).
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
    GDPR Article 20: Export all personal data associated with this account.
    Returns a JSON dump of profile, preferences, and session counts.
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
    USER-04: GDPR Article 17 - Right to Erasure.
    Anonymizes all personal fields on the user's account.
    Account is soft-deleted (anonymized), not hard-deleted.
    Data is retained for 30 days before permanent deletion.
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
    USER-06: Leaderboard of users who opted into public profiles.
    Ranked by average feedback score across completed sessions.
    """
    entries = await db.get_leaderboard(min(max(limit, 1), 100))
    return entries
