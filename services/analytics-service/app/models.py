from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class EventType(str, Enum):
    session_created = 'session_created'
    session_started = 'session_started'
    session_completed = 'session_completed'
    session_cancelled = 'session_cancelled'
    user_registered = 'user_registered'
    user_login = 'user_login'
    code_executed = 'code_executed'
    feedback_generated = 'feedback_generated'
    page_view = 'page_view'

class AnalyticsEvent(BaseModel):
    event_type: EventType
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None

class DailySessionMetric(BaseModel):
    date: str
    count: int

class LanguageDistributionMetric(BaseModel):
    language: str
    count: int

class ScoreDistributionMetric(BaseModel):
    range: str
    count: int

class MetricsResponse(BaseModel):
    total_users: int
    total_sessions: int
    completed_sessions: int
    active_sessions: int
    sessions_today: int
    avg_session_score: float
    dsa_sessions: int
    behavioral_sessions: int
    system_design_sessions: int
    top_languages: List[LanguageDistributionMetric]
    daily_sessions: List[DailySessionMetric]
    score_distribution: List[ScoreDistributionMetric]
