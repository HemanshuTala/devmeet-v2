from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import uuid
from .models import Question, SearchResponse
from .search_engine import search_engine

router = APIRouter(prefix="/api/v1/search", tags=["search"])

@router.get("/questions", response_model=SearchResponse)
async def search_questions(
    q: Optional[str] = Query(None, description="Search text query"),
    interview_type: Optional[str] = Query(None, description="Filter by type ('dsa', 'behavioral', 'system_design')"),
    difficulty: Optional[str] = Query(None, description="Filter by difficulty ('easy', 'medium', 'hard')"),
    company: Optional[str] = Query(None, description="Filter by company tag"),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    res = await search_engine.search(
        query=q,
        interview_type=interview_type,
        difficulty=difficulty,
        company=company,
        limit=limit,
        offset=offset
    )
    return res

@router.get("/questions/random", response_model=Question)
async def get_random_question(
    interview_type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None)
):
    q = await search_engine.get_random_question(interview_type, difficulty)
    if not q:
        raise HTTPException(status_code=404, detail="No matching question found")
    return q

@router.get("/questions/{question_id}", response_model=Question)
async def get_question(question_id: str):
    q = await search_engine.get_question_by_id(question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return q

@router.post("/questions", response_model=Question)
async def create_question(question: Question):
    # Ensure ID is generated if not provided
    if not question.id:
        question.id = str(uuid.uuid4())
    success = await search_engine.add_question(question.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add question to search database")
    return question
