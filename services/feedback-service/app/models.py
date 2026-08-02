from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class PercentileInfo(BaseModel):
    percentile: int
    message: str

class Turn(BaseModel):
    role: str  # 'ai' or 'user'
    content: str

class ScoreBreakdown(BaseModel):
    communication_score: int = Field(..., ge=0, le=100)
    problem_solving_score: int = Field(..., ge=0, le=100)
    code_quality_score: Optional[int] = Field(None, ge=0, le=100)
    time_complexity_score: Optional[int] = Field(None, ge=0, le=100)
    behavioral_score: Optional[int] = Field(None, ge=0, le=100)

class FeedbackGenerateRequest(BaseModel):
    session_id: str
    interview_type: str  # 'dsa', 'behavioral', 'system_design'
    difficulty: str
    language: Optional[str] = "python"
    target_company: Optional[str] = None
    transcript: List[Turn]

class FeedbackReportResponse(BaseModel):
    session_id: str
    overall_score: int
    scores: ScoreBreakdown
    detailed_feedback: Dict[str, Any]  # strengths, weaknesses, code_improvements, recommendations
    pdf_url: Optional[str] = None
    percentile: Optional[PercentileInfo] = None
