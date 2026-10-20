"""
DevMeet Search Service - REST API Endpoints
===========================================
This module provides high-speed question discovery, full-text multi-match search,
company-targeted problem filtering, and random problem selection for interview generators.

Key Architectural Responsibilities:
1. Multi-Dimensional Problem Discovery:
   - `/questions`: Queries the search engine across keyword queries, track (`interview_type`),
     difficulty tiers ('easy', 'medium', 'hard'), and company tags ('Google', 'Meta', 'Amazon').
2. Inter-Service Session Provisioning:
   - `/questions/random`: Dispatches a randomly sampled problem matching candidate criteria.
     Called by `orchestrator-service` during interview initialization.
3. Problem Inspection & Administration:
   - `/questions/{question_id}`: Retrieves comprehensive problem specifications, constraints, and hints.
   - `POST /questions`: Ingests new problems into the search catalog.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
import uuid
from .models import Question, SearchResponse
from .search_engine import search_engine

# FastAPI router configuration with standard prefix
router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.get("/questions", response_model=SearchResponse)
async def search_questions(
    q: Optional[str] = Query(None, description="Free-text search query string"),
    interview_type: Optional[str] = Query(None, description="Filter by track ('dsa', 'behavioral', 'system_design')"),
    difficulty: Optional[str] = Query(None, description="Filter by difficulty ('easy', 'medium', 'hard')"),
    company: Optional[str] = Query(None, description="Filter by company tag (e.g. 'google', 'meta')"),
    limit: int = Query(10, ge=1, le=100, description="Page size ceiling (1-100)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    Searches the question bank using keyword fuzzy matching and multidimensional filters.
    
    Why this exists:
    Powers the Question Bank Explorer on the frontend, allowing candidates to practice
    specific algorithm types (e.g., Dynamic Programming, Trees) or target company sets.

    Args:
        q (str, optional): Keyword query string.
        interview_type (str, optional): Interview track filter.
        difficulty (str, optional): Difficulty level filter.
        company (str, optional): Company filter.
        limit (int): Maximum records per page.
        offset (int): Pagination offset.

    Returns:
        SearchResponse: Container with ranked question items and total matches.
    """
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
    interview_type: Optional[str] = Query(None, description="Constrain to track ('dsa', 'behavioral', 'system_design')"),
    difficulty: Optional[str] = Query(None, description="Constrain to difficulty ('easy', 'medium', 'hard')"),
):
    """
    Picks a random question matching the requested interview type and difficulty.
    
    Why this exists:
    Called automatically by orchestrator-service when initializing a new interview session.

    Args:
        interview_type (str, optional): Track constraint.
        difficulty (str, optional): Difficulty constraint.

    Returns:
        Question: Selected interview problem schema.

    Raises:
        HTTPException(404): If no questions match criteria.
    """
    q = await search_engine.get_random_question(interview_type, difficulty)
    if not q:
        raise HTTPException(status_code=404, detail="No matching question found")
    return q


@router.get("/questions/{question_id}", response_model=Question)
async def get_question(question_id: str):
    """
    Fetches detailed problem description and test case specifications by unique ID.

    Args:
        question_id (str): Primary question identifier.

    Returns:
        Question: Detailed question model.

    Raises:
        HTTPException(404): If question does not exist.
    """
    q = await search_engine.get_question_by_id(question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return q


@router.post("/questions", response_model=Question)
async def create_question(question: Question):
    """
    Appends a new technical interview problem to the question bank.

    Args:
        question (Question): Question model payload.

    Returns:
        Question: Created question model with verified ID.

    Raises:
        HTTPException(500): If indexing fails.
    """
    # Ensure ID is generated if not provided
    if not question.id:
        question.id = str(uuid.uuid4())
    success = await search_engine.add_question(question.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add question to search database")
    return question
