from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ConversationMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

    def dict(self, **kwargs):
        return {"role": self.role, "content": self.content}


class InterviewRequest(BaseModel):
    session_id: Optional[str] = None
    interview_type: str  # "dsa", "behavioral", "system_design"
    difficulty: str      # "easy", "medium", "hard"
    target_company: Optional[str] = None
    focus_area: Optional[str] = None
    conversation_history: List[ConversationMessage] = Field(default_factory=list)


class InterviewResponse(BaseModel):
    question: str
    hints: List[str] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)


class FeedbackRequest(BaseModel):
    session_id: Optional[str] = None
    conversation_history: List[ConversationMessage]
    interview_type: str
    user_answers: List[str] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    overall_score: float
    technical_score: float
    communication_score: float
    problem_solving_score: float = 0.0
    strengths: List[str]
    weaknesses: List[str]
    recommendations: List[str]
    summary: str = ""
