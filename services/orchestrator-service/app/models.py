"""
Data Models, Enums, and State Machine Logic for Interview Orchestration.
=========================================================================
This module defines the core domain models, Enums, and transition validation
functions governing interview sessions in DevMeet.

Key Responsibilities:
---------------------
1. Finite State Machine (FSM):
   Defines the strict lifecycle states of an interview session:
   - `created`     : Session initialized, awaiting candidate to enter room.
   - `in_progress` : Live interview active, audio/video streaming, timer ticking.
   - `paused`      : Temporarily paused by candidate (up to 30 minutes max).
   - `completed`   : Successfully finished; terminal state, triggers feedback generation.
   - `cancelled`   : Terminated early or aborted; terminal state.
2. Anti-Cheating & Proctoring Thresholds:
   Evaluates tab switching and copy-paste volume to flag integrity violations.
3. Chat Turn Representation:
   Maintains chronological dialogue records between AI Interviewer and Candidate.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class InterviewType(str, Enum):
    """
    Format and domain of the technical interview.
    - DSA: Data Structures and Algorithms (live code editor, test cases).
    - BEHAVIORAL: Leadership principles, STAR method, communication rubrics.
    - SYSTEM_DESIGN: High-level architecture, scalability, trade-off discussions.
    """
    DSA = "dsa"
    BEHAVIORAL = "behavioral"
    SYSTEM_DESIGN = "system_design"


class Difficulty(str, Enum):
    """Complexity level determining question difficulty and rubric strictness."""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InterviewStatus(str, Enum):
    """
    Finite State Machine (FSM) states for an interview session.
    """
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# SESS-02: Directed Graph of Permitted State Transitions
# Prevents illegal transitions (e.g. jumping directly from CREATED to COMPLETED,
# or resurrecting a session from terminal COMPLETED state).
VALID_STATE_TRANSITIONS = {
    InterviewStatus.CREATED: [InterviewStatus.IN_PROGRESS, InterviewStatus.CANCELLED],
    InterviewStatus.IN_PROGRESS: [InterviewStatus.PAUSED, InterviewStatus.COMPLETED, InterviewStatus.CANCELLED],
    InterviewStatus.PAUSED: [InterviewStatus.IN_PROGRESS, InterviewStatus.COMPLETED, InterviewStatus.CANCELLED],
    InterviewStatus.COMPLETED: [],  # Terminal state: No transitions allowed
    InterviewStatus.CANCELLED: [],  # Terminal state: No transitions allowed
}


def validate_state_transition(current_status: InterviewStatus, new_status: InterviewStatus) -> bool:
    """
    SESS-02: Validates whether a state machine transition is legally permitted.

    Parameters:
        current_status (InterviewStatus): The existing status recorded in PostgreSQL.
        new_status (InterviewStatus): The requested destination status.

    Returns:
        bool: True if transition is valid or is an idempotent no-op, False otherwise.
    """
    if current_status == new_status:
        return True  # Idempotent no-op transition is allowed
    return new_status in VALID_STATE_TRANSITIONS.get(current_status, [])


def validate_pause_window(paused_at: datetime, max_pause_minutes: int = 30) -> bool:
    """
    Checks whether a paused session is still within the allowable resume window.

    Why this rule exists:
    Candidates are allowed short breaks (up to 30 minutes) to resolve connectivity
    issues without losing session state. If a session remains paused past 30 minutes,
    it is considered abandoned and cannot be resumed.

    Parameters:
        paused_at (datetime): Timestamp when candidate hit pause.
        max_pause_minutes (int): Allowable break duration (default: 30 minutes).

    Returns:
        bool: True if resume is still valid, False if pause window expired.
    """
    from datetime import timedelta
    if not paused_at:
        return False
    expiry_time = paused_at + timedelta(minutes=max_pause_minutes)
    return datetime.now() < expiry_time


def validate_cheating_threshold(tab_switch_count: int, paste_count: int, max_violations: int = 3) -> bool:
    """
    Evaluates cumulative proctoring violation counts against allowable thresholds.

    Parameters:
        tab_switch_count (int): Times candidate lost window focus.
        paste_count (int): Times candidate pasted external clipboard content into editor.
        max_violations (int): Cutoff threshold for integrity alerts (default: 3).

    Returns:
        bool: True if candidate is within integrity limits, False if flagged.
    """
    total_violations = tab_switch_count + paste_count
    return total_violations < max_violations


class CreateSessionRequest(BaseModel):
    """
    Request schema for launching a new AI mock interview session.
    """
    interview_type: InterviewType = Field(..., description="Interview domain: dsa, behavioral, system_design")
    difficulty: Difficulty = Field(default=Difficulty.MEDIUM, description="Target difficulty tier")
    target_company: Optional[str] = Field(None, max_length=100, description="Target company style (e.g. Google, Amazon)")
    focus_area: Optional[str] = Field(None, max_length=200, description="Specific topic (e.g. Binary Trees, Concurrency)")
    duration_minutes: int = Field(default=30, ge=15, le=120, description="Session timer length (15 to 120 minutes)")
    recording_consent: Optional[bool] = Field(False, description="Candidate consent for audio/video playback storage")


class SessionResponse(BaseModel):
    """
    Comprehensive session metadata representation returned to client.
    """
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
    """
    Single conversational exchange turn in the interview dialogue history.
    """
    id: str
    session_id: str
    role: str  # "interviewer" or "candidate"
    content: str
    turn_number: int
    created_at: datetime


class CreateTurnRequest(BaseModel):
    """
    Request payload to append a message turn to the session transcript.
    """
    role: str = Field(..., pattern="^(interviewer|candidate)$", description="Must be interviewer or candidate")
    content: str = Field(..., min_length=1, max_length=10000, description="Dialogue message content")


class CodeSubmission(BaseModel):
    """
    Payload containing candidate source code submitted for sandbox evaluation.
    """
    session_id: str
    language: str
    code: str
