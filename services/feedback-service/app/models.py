"""
================================================================================
FEEDBACK SERVICE — PYDANTIC SCHEMAS & DATA TRANSFER OBJECTS (DTOs)
================================================================================
Role & Responsibility:
  This module defines the validation models and API contracts for post-interview
  scoring, percentile comparisons, and comprehensive report generation:
    1. PercentileInfo: Encapsulates population benchmark ranking (e.g., top 15%).
    2. Turn: Models a single dialogue exchange ('ai' or 'user') in the transcript.
    3. ScoreBreakdown: Multi-dimensional score breakdown across communication,
       problem-solving, code quality, time complexity, and behavioral performance (0-100).
    4. FeedbackGenerateRequest: Inbound request schema sent by Orchestrator upon session end.
    5. FeedbackReportResponse: Outbound payload containing aggregated scores, qualitative
       feedback (strengths, weaknesses, recommendations), percentile ranking, and PDF URL.
================================================================================
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class PercentileInfo(BaseModel):
    """
    Candidate benchmark statistics compared against all historical platform interviews.

    Attributes:
      percentile (int): Score rank from 1 to 99 (e.g. 85 means scored better than 85% of candidates).
      message (str): Human-readable summary (e.g., 'Top 15% among Medium DSA candidates').
    """
    percentile: int = Field(
        ...,
        ge=0,
        le=100,
        description="Percentile rank (0-100) relative to historical peer benchmark distribution.",
    )
    message: str = Field(
        ...,
        description="Contextual benchmark message presented on the feedback report dashboard.",
    )


class Turn(BaseModel):
    """
    A single conversational dialogue utterance within the interview transcript.

    Attributes:
      role (str): The speaker role ('ai', 'user', 'system').
      content (str): The text content of the message.
    """
    role: str = Field(
        ...,
        description="Speaker role in dialogue exchange ('ai' or 'user').",
    )
    content: str = Field(
        ...,
        description="Transcript message text content.",
    )


class ScoreBreakdown(BaseModel):
    """
    Multi-dimensional numerical score breakdown evaluated on a 0 to 100 scale.

    Attributes:
      communication_score (int): Clarity, conciseness, and articulation of thought.
      problem_solving_score (int): Algorithmic intuition, edge case handling, and logic.
      code_quality_score (Optional[int]): Clean code practices, naming conventions, and structure.
      time_complexity_score (Optional[int]): Optimality of Big-O time and space tradeoffs.
      behavioral_score (Optional[int]): STAR framework alignment and leadership indicators.
    """
    communication_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Candidate's communication clarity and technical articulation (0-100).",
    )
    problem_solving_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Candidate's analytical ability and solution design (0-100).",
    )
    code_quality_score: Optional[int] = Field(
        None,
        ge=0,
        le=100,
        description="Idiomatic syntax, modularity, and readability of submitted code (0-100).",
    )
    time_complexity_score: Optional[int] = Field(
        None,
        ge=0,
        le=100,
        description="Efficiency of algorithmic approach relative to theoretical optimal (0-100).",
    )
    behavioral_score: Optional[int] = Field(
        None,
        ge=0,
        le=100,
        description="STAR method adherence and cultural/leadership indicators (0-100).",
    )


class FeedbackGenerateRequest(BaseModel):
    """
    Inbound request schema submitted by Orchestrator when a session reaches 'completed' state.

    Attributes:
      session_id (str): Unique identifier of the completed interview session.
      interview_type (str): Domain track ('dsa', 'behavioral', or 'system_design').
      difficulty (str): Seniority difficulty level ('easy', 'medium', 'hard').
      language (Optional[str]): Primary programming language used in code challenges.
      target_company (Optional[str]): Target firm for contextual evaluation benchmarks.
      transcript (List[Turn]): Full chronological list of dialogue turns.
    """
    session_id: str = Field(
        ...,
        description="UUID of the completed interview session.",
    )
    interview_type: str = Field(
        ...,
        description="Interview track ('dsa', 'behavioral', 'system_design').",
    )
    difficulty: str = Field(
        ...,
        description="Seniority benchmark ('easy', 'medium', 'hard').",
    )
    language: Optional[str] = Field(
        default="python",
        description="Programming language used during technical coding questions.",
    )
    target_company: Optional[str] = Field(
        default=None,
        description="Company context to calibrate evaluation standards.",
    )
    transcript: List[Turn] = Field(
        ...,
        description="Full dialogue transcript between AI interviewer and candidate.",
    )


class FeedbackReportResponse(BaseModel):
    """
    Comprehensive evaluation report payload returned to candidate dashboard and admin views.

    Attributes:
      session_id (str): Associated interview session UUID.
      overall_score (int): Weighted aggregate composite score from 0 to 100.
      scores (ScoreBreakdown): Granular metric scores.
      detailed_feedback (Dict[str, Any]): Qualitative lists of strengths, weaknesses,
                                          code improvements, and actionable recommendations.
      pdf_url (Optional[str]): Download URL for generated PDF scorecard artifact.
      percentile (Optional[PercentileInfo]): Benchmark ranking against other candidates.
    """
    session_id: str = Field(
        ...,
        description="Interview session identifier.",
    )
    overall_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Composite overall score across all evaluation dimensions (0-100).",
    )
    scores: ScoreBreakdown = Field(
        ...,
        description="Dimension-by-dimension score breakdown.",
    )
    detailed_feedback: Dict[str, Any] = Field(
        ...,
        description="Qualitative feedback containing strengths, weaknesses, and study recommendations.",
    )
    pdf_url: Optional[str] = Field(
        default=None,
        description="Direct download URL or S3 key for the rendered PDF report.",
    )
    percentile: Optional[PercentileInfo] = Field(
        default=None,
        description="Population percentile ranking compared to platform candidate distributions.",
    )
