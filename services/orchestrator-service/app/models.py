from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class InterviewType(str, Enum):
    DSA = "dsa"
    BEHAVIORAL = "behavioral"
    SYSTEM_DESIGN = "system_design"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InterviewStatus(str, Enum):
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# SESS-02: Valid state transitions
VALID_STATE_TRANSITIONS = {
    InterviewStatus.CREATED: [InterviewStatus.IN_PROGRESS, InterviewStatus.CANCELLED],
    InterviewStatus.IN_PROGRESS: [InterviewStatus.PAUSED, InterviewStatus.COMPLETED, InterviewStatus.CANCELLED],
    InterviewStatus.PAUSED: [InterviewStatus.IN_PROGRESS, InterviewStatus.COMPLETED, InterviewStatus.CANCELLED],
    InterviewStatus.COMPLETED: [],  # Terminal state
    InterviewStatus.CANCELLED: [],  # Terminal state
}


def validate_state_transition(current_status: InterviewStatus, new_status: InterviewStatus) -> bool:
    """
    SESS-02: Validate that a state transition is allowed.
    Returns True if the transition is valid, False otherwise.
    """
    if current_status == new_status:
        return True  # No-op transition is allowed
    return new_status in VALID_STATE_TRANSITIONS.get(current_status, [])


def validate_pause_window(paused_at: datetime, max_pause_minutes: int = 30) -> bool:
    """
    Validate that a paused session is within the allowed pause window.
    Returns True if pause is still valid, False if expired.
    """
    from datetime import timedelta
    if not paused_at:
        return False
    expiry_time = paused_at + timedelta(minutes=max_pause_minutes)
    return datetime.now() < expiry_time


def validate_cheating_threshold(tab_switch_count: int, paste_count: int, max_violations: int = 3) -> bool:
    """
    Validate that cheating violations are within allowed threshold.
    Returns True if within threshold, False if exceeded.
    """
    total_violations = tab_switch_count + paste_count
    return total_violations < max_violations


class CreateSessionRequest(BaseModel):
    interview_type: InterviewType
    difficulty: Difficulty = Field(default=Difficulty.MEDIUM)
    target_company: Optional[str] = Field(None, max_length=100)
    focus_area: Optional[str] = Field(None, max_length=200)
    duration_minutes: int = Field(default=30, ge=15, le=120)
    recording_consent: Optional[bool] = False


class SessionResponse(BaseModel):
    id: str
    user_id: str
    interview_type: InterviewType
    difficulty: Difficulty
    target_company: Optional[str]
    focus_area: Optional[str]
    duration_minutes: int
    status: InterviewStatus
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    elapsed_seconds: Optional[int] = 0
    tab_switch_count: Optional[int] = 0
    paste_count: Optional[int] = 0
    recording_consent: Optional[bool] = False


class TurnResponse(BaseModel):
    id: str
    session_id: str
    role: str  # "interviewer" or "candidate"
    content: str
    turn_number: int
    created_at: datetime


class CreateTurnRequest(BaseModel):
    role: str = Field(..., pattern="^(interviewer|candidate)$")
    content: str = Field(..., min_length=1, max_length=10000)


class CodeSubmission(BaseModel):
    session_id: str
    language: str
    code: str
