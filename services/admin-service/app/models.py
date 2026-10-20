"""
================================================================================
ADMIN SERVICE — PYDANTIC SCHEMAS & ADMINISTRATIVE DATA TRANSFER OBJECTS (DTOs)
================================================================================
Role & Responsibility:
  This module defines the validation models and API contracts for back-office
  administrative moderation, user lifecycle management, and security audit logs:
    1. Plan Enum: Whitelisted subscription tiers ('free', 'pro', 'enterprise').
    2. UserSummary: Lightweight summary DTO for populating administrative user tables.
    3. UserDetailResponse: Comprehensive candidate inspection model including timestamps,
       suspension flags, and interview completion counts.
    4. PlanUpdateRequest: Strict regex-validated schema for manual tier overrides.
    5. AuditLog: Security logging schema recording administrative actions for SOC2 compliance.
    6. AdminStats: Master operational overview model containing user counts, subscription
       distributions, and revenue estimates.
================================================================================
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class Plan(str, Enum):
    """
    Whitelisted subscription tiers supported across the DevMeet platform.
    """
    FREE = "free"                # Standard candidate plan (daily quotas apply)
    PRO = "pro"                  # Unlimited practice, full hints, and code sandbox execution
    ENTERPRISE = "enterprise"    # Custom team pools, advanced proctoring, and priority LLM models


class UserSummary(BaseModel):
    """
    Compact user overview schema returned for administrative candidate tables.

    Attributes:
      id (str): User account UUID.
      email (str): Candidate email address.
      display_name (str): Full name or handle.
      plan (str): Current subscription tier.
      created_at (str): ISO 8601 registration timestamp.
      total_sessions (int): Total interview sessions initiated by user.
      is_blocked (bool): True if candidate account is suspended or banned.
    """
    id: str = Field(..., description="Unique user UUID.")
    email: str = Field(..., description="Registered email address.")
    display_name: str = Field(..., description="Candidate display name.")
    plan: str = Field(..., description="Subscription plan tier.")
    created_at: str = Field(..., description="Account creation timestamp.")
    total_sessions: int = Field(..., description="Lifetime sessions created.")
    is_blocked: bool = Field(..., description="Whether user account is blocked.")


class UserDetailResponse(BaseModel):
    """
    Comprehensive user inspection model for detailed administrative profile views.

    Attributes:
      id (str): User UUID.
      email (str): Candidate email.
      display_name (str): Full name.
      plan (str): Subscription plan.
      is_blocked (bool): Administrative suspension status.
      created_at (datetime): Registration date.
      updated_at (datetime): Last modification timestamp.
      total_sessions (int): Total interview attempts.
      completed_sessions (int): Completed sessions with generated reports.
    """
    id: str = Field(..., description="User account identifier.")
    email: str = Field(..., description="Candidate email address.")
    display_name: str = Field(..., description="Candidate display name.")
    plan: str = Field(..., description="Active subscription tier.")
    is_blocked: bool = Field(..., description="Account moderation state.")
    created_at: datetime = Field(..., description="Account creation datetime.")
    updated_at: datetime = Field(..., description="Last update datetime.")
    total_sessions: int = Field(..., description="Total sessions initiated.")
    completed_sessions: int = Field(..., description="Total sessions evaluated.")


class PlanUpdateRequest(BaseModel):
    """
    Schema for manual administrative subscription overrides.

    Attributes:
      plan (str): New plan tier (strictly validated via regex: 'free', 'pro', or 'enterprise').
    """
    plan: str = Field(
        ...,
        pattern="^(free|pro|enterprise)$",
        description="Target subscription plan ('free', 'pro', 'enterprise').",
    )


class AuditLog(BaseModel):
    """
    Administrative audit trail record for SOC2 compliance and security auditing.

    Attributes:
      id (str): Audit entry UUID.
      user_id (Optional[str]): Admin user who executed the action.
      action (str): Action identifier (e.g., 'block_user', 'update_plan', 'delete_session').
      resource_type (str): Affected entity type ('user', 'session', 'report').
      resource_id (Optional[str]): Affected target entity UUID.
      ip_address (Optional[str]): Originating network IP address of the admin.
      metadata (Optional[Dict[str, Any]]): Contextual before/after state diff.
      created_at (str): ISO 8601 audit timestamp.
    """
    id: str = Field(..., description="Audit log entry identifier.")
    user_id: Optional[str] = Field(default=None, description="Admin user UUID who took action.")
    action: str = Field(..., description="Administrative action name.")
    resource_type: str = Field(..., description="Target resource domain.")
    resource_id: Optional[str] = Field(default=None, description="Target resource UUID.")
    ip_address: Optional[str] = Field(default=None, description="Originating client IP address.")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional context or diff.")
    created_at: str = Field(..., description="Log generation timestamp.")


class AdminStats(BaseModel):
    """
    Operational KPI summary model for the master administration dashboard.

    Attributes:
      total_users (int): Total registered candidate accounts.
      new_users_today (int): Users registered during current UTC day.
      total_sessions (int): Lifetime interview sessions created.
      sessions_today (int): Sessions created today.
      completed_sessions (int): Successfully evaluated interviews.
      active_sessions (int): Real-time ongoing sessions.
      revenue_estimate (float): Monthly Recurring Revenue (MRR) estimate based on paid plans.
      pro_users (int): Users on Pro plan.
      enterprise_users (int): Users on Enterprise plan.
      free_users (int): Users on Free plan.
      blocked_users (int): Suspended or banned candidate accounts.
    """
    total_users: int = Field(..., description="Total platform users.")
    new_users_today: int = Field(..., description="Registrations today.")
    total_sessions: int = Field(..., description="Lifetime sessions.")
    sessions_today: int = Field(..., description="Sessions today.")
    completed_sessions: int = Field(..., description="Completed sessions.")
    active_sessions: int = Field(..., description="Currently active sessions.")
    revenue_estimate: float = Field(..., description="Estimated Monthly Recurring Revenue in USD.")
    pro_users: int = Field(..., description="Users on Pro subscription tier.")
    enterprise_users: int = Field(..., description="Users on Enterprise tier.")
    free_users: int = Field(..., description="Users on Free tier.")
    blocked_users: int = Field(..., description="Count of suspended user accounts.")
