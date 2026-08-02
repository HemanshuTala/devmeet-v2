from pydantic import BaseModel
from typing import Optional, List

class Question(BaseModel):
    id: str
    title: str
    description: str
    interview_type: str  # 'dsa', 'behavioral', 'system_design'
    difficulty: str  # 'easy', 'medium', 'hard'
    tags: List[str] = []
    company_tags: List[str] = []
    hints: List[str] = []

class SearchRequest(BaseModel):
    query: Optional[str] = None
    interview_type: Optional[str] = None
    difficulty: Optional[str] = None
    company: Optional[str] = None
    limit: int = 10
    offset: int = 0

class SearchResponse(BaseModel):
    questions: List[Question]
    total: int
    query: Optional[str]
