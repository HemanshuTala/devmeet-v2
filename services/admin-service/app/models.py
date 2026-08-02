from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class Plan(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class UserSummary(BaseModel):
    id: str
    email: str
    display_name: str
    plan: str
    created_at: str
    total_sessions: int
    is_blocked: bool


class UserDetailResponse(BaseModel):
    id: str
    email: str
    display_name: str
    plan: str
    is_blocked: bool
    created_at: datetime
    updated_at: datetime
    total_sessions: int
    completed_sessions: int


class PlanUpdateRequest(BaseModel):
    plan: str = Field(..., pattern="^(free|pro|enterprise)$")


class AuditLog(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: str


class AdminStats(BaseModel):
    total_users: int
    new_users_today: int
    total_sessions: int
    sessions_today: int
    completed_sessions: int
    active_sessions: int
    revenue_estimate: float
    pro_users: int
    enterprise_users: int
    free_users: int
    blocked_users: int
