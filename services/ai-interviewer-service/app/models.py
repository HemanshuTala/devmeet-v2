"""
Data Schemas and Request/Response Models for AI Interviewer Service.
===================================================================
This module defines Pydantic models for LLM prompt generation, conversational history,
and evaluation scoring.

Models:
-------
- `ConversationMessage`: A single turn formatted for OpenAI/Groq chat completions API (`role`, `content`).
- `InterviewRequest`: Payload from Orchestrator requesting question generation.
- `InterviewResponse`: Structured output containing the question, progressive hints, and follow-ups.
- `FeedbackRequest` & `FeedbackResponse`: Granular technical scoring schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ConversationMessage(BaseModel):
    """
    Standard chat completion message representation compatible with OpenAI/Groq schema.
    
    Roles:
    - 'user': The candidate's response or question.
    - 'assistant': The AI interviewer's prompt or hint.
    - 'system': Behavioral guardrails and system instructions.
    """
    role: str  # "user" or "assistant" or "system"
    content: str

    def dict(self, **kwargs):
        """Serialization helper returning clean dictionary representation."""
        return {"role": self.role, "content": self.content}


class InterviewRequest(BaseModel):
    """
    Request payload sent by Orchestrator to generate the next interview question or follow-up.
    """
    session_id: Optional[str] = Field(None, description="Active session UUID")
    interview_type: str = Field(..., description="Domain: dsa, behavioral, system_design")
    difficulty: str = Field(..., description="Tier: easy, medium, hard")
    target_company: Optional[str] = Field(None, description="Optional target company style (e.g. Google, Stripe)")
    focus_area: Optional[str] = Field(None, description="Specific topic focus (e.g. Trees, Distributed Systems)")
    conversation_history: List[ConversationMessage] = Field(default_factory=list, description="Prior turns in the dialogue")


class InterviewResponse(BaseModel):
    """
    Structured response returned after LLM parsing.
    
    Contains the main question text, progressive hint ladder, and anticipated follow-ups.
    """
    question: str
    hints: List[str] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)


class FeedbackRequest(BaseModel):
    """
    Payload for generating intermediate performance evaluations.
    """
    session_id: Optional[str] = None
    conversation_history: List[ConversationMessage]
    interview_type: str
    user_answers: List[str] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    """
    Numerical breakdown of candidate competencies evaluated against standardized rubrics.
    """
    overall_score: float = Field(..., description="Normalized 0-100 overall score")
    technical_score: float = Field(..., description="Algorithmic / engineering correctness score")
    communication_score: float = Field(..., description="Clarity, structure, and articulation score")
    problem_solving_score: float = Field(default=0.0, description="Handling edge cases and trade-offs")
    strengths: List[str] = Field(default_factory=list, description="Key candidate competencies demonstrated")
    weaknesses: List[str] = Field(default_factory=list, description="Constructive areas for improvement")
    recommendations: List[str] = Field(default_factory=list, description="Actionable study recommendations")
    summary: str = Field(default="", description="Executive feedback summary")
