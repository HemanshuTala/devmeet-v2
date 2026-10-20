"""
================================================================================
ANALYTICS SERVICE — PYDANTIC SCHEMAS & ANALYTICS DATA TRANSFER OBJECTS (DTOs)
================================================================================
Role & Responsibility:
  This module defines the validation models and response schemas for system-wide
  analytics events, candidate score distributions, and time-series reporting:
    1. EventType Enum: Standardized taxonomy of trackable user actions across services
       (session lifecycle, authentication, code execution, feedback generation).
    2. AnalyticsEvent: Ingestion schema for logging user interactions and telemetry.
    3. DailySessionMetric: Time-series bucket model for plotting daily session volume graphs.
    4. LanguageDistributionMetric: Aggregation bucket for programming language popularity.
    5. ScoreDistributionMetric: Histogram bucket model for candidate score bands (e.g., 0-50, 50-70).
    6. MetricsResponse: Master executive dashboard payload containing aggregated system KPIs.
================================================================================
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class EventType(str, Enum):
    """
    Standardized enumerated event types captured across the microservices ecosystem.
    Inherits from `str` for direct JSON serialization and PostgreSQL compatibility.
    """
    session_created = "session_created"        # New interview session booked/initialized
    session_started = "session_started"        # Candidate entered the live room
    session_completed = "session_completed"    # Interview concluded successfully
    session_cancelled = "session_cancelled"    # Session aborted by candidate or proctor
    user_registered = "user_registered"        # New candidate account created
    user_login = "user_login"                  # Candidate authenticated
    code_executed = "code_executed"            # Candidate ran code in execution sandbox
    feedback_generated = "feedback_generated"  # Evaluation report generated and scored
    page_view = "page_view"                    # Route navigation telemetry


class AnalyticsEvent(BaseModel):
    """
    Inbound payload structure for recording platform telemetry events.

    Attributes:
      event_type (EventType): Categorized taxonomy identifier.
      user_id (Optional[str]): Authenticated candidate identifier (if applicable).
      session_id (Optional[str]): Associated interview session UUID (if applicable).
      properties (Optional[Dict[str, Any]]): Arbitrary key-value metadata payload
                                             (e.g., browser user-agent, route path, latency).
      ip_address (Optional[str]): Client IP address for geolocation metrics.
    """
    event_type: EventType = Field(
        ...,
        description="Categorized event action identifier.",
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Associated candidate user UUID.",
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Associated interview session UUID.",
    )
    properties: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom event attributes and context metadata.",
    )
    ip_address: Optional[str] = Field(
        default=None,
        description="Originating client network IP address.",
    )


class DailySessionMetric(BaseModel):
    """
    Time-series metric point for charting daily interview volume.

    Attributes:
      date (str): Calendar date formatted as 'YYYY-MM-DD'.
      count (int): Total number of interview sessions conducted on this date.
    """
    date: str = Field(..., description="Date string in YYYY-MM-DD format.")
    count: int = Field(..., description="Number of sessions on this date.")


class LanguageDistributionMetric(BaseModel):
    """
    Programming language utilization metric.

    Attributes:
      language (str): Language name ('python', 'javascript', 'cpp', etc.).
      count (int): Total code execution submissions using this language.
    """
    language: str = Field(..., description="Programming language name.")
    count: int = Field(..., description="Total executions recorded for this language.")


class ScoreDistributionMetric(BaseModel):
    """
    Histogram score bucket for charting candidate score distribution curves.

    Attributes:
      range (str): Score interval label (e.g., '0-49', '50-69', '70-89', '90-100').
      count (int): Number of candidates falling within this score interval.
    """
    range: str = Field(..., description="Score interval bracket (e.g., '70-89').")
    count: int = Field(..., description="Number of sessions in this score bracket.")


class MetricsResponse(BaseModel):
    """
    Comprehensive administrative dashboard KPI response model.

    Attributes:
      total_users (int): Total registered candidate accounts.
      total_sessions (int): Cumulative interview sessions across all states.
      completed_sessions (int): Sessions successfully concluded and evaluated.
      active_sessions (int): Sessions currently ongoing in real time.
      sessions_today (int): Sessions created during the current UTC calendar day.
      avg_session_score (float): Mean overall evaluation score across all completed interviews.
      dsa_sessions (int): Count of DSA coding track interviews.
      behavioral_sessions (int): Count of Behavioral STAR interviews.
      system_design_sessions (int): Count of System Architecture interviews.
      top_languages (List[LanguageDistributionMetric]): Most popular programming languages.
      daily_sessions (List[DailySessionMetric]): Trailing 30-day time-series activity.
      score_distribution (List[ScoreDistributionMetric]): Bell-curve score histogram.
    """
    total_users: int = Field(..., description="Total user accounts on platform.")
    total_sessions: int = Field(..., description="Cumulative interview sessions created.")
    completed_sessions: int = Field(..., description="Sessions completed and evaluated.")
    active_sessions: int = Field(..., description="Sessions currently in progress.")
    sessions_today: int = Field(..., description="Sessions initiated today.")
    avg_session_score: float = Field(..., description="Average composite score across all completed sessions.")
    dsa_sessions: int = Field(..., description="Total DSA track sessions.")
    behavioral_sessions: int = Field(..., description="Total Behavioral track sessions.")
    system_design_sessions: int = Field(..., description="Total System Design track sessions.")
    top_languages: List[LanguageDistributionMetric] = Field(..., description="Programming language breakdown.")
    daily_sessions: List[DailySessionMetric] = Field(..., description="Daily session time-series.")
    score_distribution: List[ScoreDistributionMetric] = Field(..., description="Score bracket histogram.")
