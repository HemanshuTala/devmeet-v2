from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import re


class Plan(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    bio: Optional[str] = Field(None, max_length=1000)
    target_companies: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    interview_reminder_enabled: Optional[bool] = None
    profile_public: Optional[bool] = None

    @validator('display_name')
    def validate_display_name(cls, v):
        if v is not None:
            if re.search(r'<[^>]*>', v):
                raise ValueError('Display name cannot contain HTML tags')
            return v.strip()
        return v

    @validator('target_companies', 'skills')
    def validate_arrays(cls, v):
        if v is not None:
            # Sanitize array elements
            return [item.strip() for item in v if item.strip()]
        return v


class UserProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    target_companies: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    interview_reminder_enabled: bool
    profile_public: bool
    created_at: datetime
    updated_at: datetime


class UserQuotaResponse(BaseModel):
    interviews_today: int
    interviews_this_month: int
    last_reset_date: datetime
    plan: Plan
    daily_limit: int
    monthly_limit: int
    remaining_today: int
    remaining_month: int


class UserPlanResponse(BaseModel):
    plan: Plan
    created_at: datetime
    updated_at: datetime


class LeaderboardEntry(BaseModel):
    user_id: str
    display_name: str
    avatar_url: Optional[str] = None
    avg_score: float
    sessions_count: int
