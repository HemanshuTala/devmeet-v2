"""
Data Schemas and Validation Models for User Service.
====================================================
This module defines Pydantic v2 models and Enums for candidate profiles,
preferences, subscription tiers, interview usage quotas, and leaderboard rankings.

Key Validation Features:
------------------------
- OWASP Cross-Site Scripting (XSS) prevention: Disallows HTML tags (`<...>` regex) in display names.
- Array Sanitization: Trims whitespace and strips empty strings from skills and target companies.
- Type Enums: Explicit subscription tiers (`Plan.FREE`, `Plan.PRO`, `Plan.ENTERPRISE`).
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import re


class Plan(str, Enum):
    """
    Candidate subscription plan tiers.
    
    - FREE: 2 interviews per day, 10 per month, standard AI questions.
    - PRO: 10 interviews per day, 50 per month, advanced system design & code sandbox.
    - ENTERPRISE: Unlimited interviews, custom rubrics, team analytics.
    """
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class UserProfileUpdate(BaseModel):
    """
    Request schema for updating a candidate's profile details.
    
    All fields are optional to allow partial PATCH updates.
    """
    display_name: Optional[str] = Field(None, min_length=2, max_length=100, description="Public name shown to interviewer")
    avatar_url: Optional[str] = Field(None, max_length=500, description="Public S3/CDN URL for candidate profile picture")
    bio: Optional[str] = Field(None, max_length=1000, description="Short candidate professional summary")
    target_companies: Optional[List[str]] = Field(None, description="Target employers (e.g. ['Google', 'Stripe', 'Meta'])")
    skills: Optional[List[str]] = Field(None, description="Primary technical skills (e.g. ['Python', 'System Design', 'React'])")
    interview_reminder_enabled: Optional[bool] = Field(None, description="Whether candidate receives practice reminder emails")
    profile_public: Optional[bool] = Field(None, description="Whether profile is visible on global leaderboards")

    @field_validator('display_name')
    @classmethod
    def validate_display_name(cls, v):
        """
        Prevents stored Cross-Site Scripting (XSS) by ensuring display name contains no HTML tags.
        """
        if v is not None:
            if re.search(r'<[^>]*>', v):
                raise ValueError('Display name cannot contain HTML tags')
            return v.strip()
        return v

    @field_validator('target_companies', 'skills')
    @classmethod
    def validate_arrays(cls, v):
        """
        Sanitizes string list inputs by stripping whitespace and filtering out blank entries.
        """
        if v is not None:
            return [item.strip() for item in v if item.strip()]
        return v


class UserProfileResponse(BaseModel):
    """
    Response schema returning comprehensive candidate profile information.
    """
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
    """
    Response schema tracking daily and monthly interview quota consumption.
    
    Informs frontend UI widgets of remaining sessions before reaching plan caps.
    """
    interviews_today: int
    interviews_this_month: int
    last_reset_date: datetime
    plan: Plan
    daily_limit: int
    monthly_limit: int
    remaining_today: int
    remaining_month: int


class UserPlanResponse(BaseModel):
    """
    Response schema representing user's current billing plan tier and subscription dates.
    """
    plan: Plan
    created_at: datetime
    updated_at: datetime


class LeaderboardEntry(BaseModel):
    """
    Schema for top-performing candidates displayed on the public community leaderboard.
    """
    user_id: str
    display_name: str
    avatar_url: Optional[str] = None
    avg_score: float
    sessions_count: int
