"""
DevMeet Search Service - Data Models & Schema Definitions
=========================================================
This module defines the Pydantic data schemas used for full-text search requests,
question bank card models, company-targeted filters, and paginated search response envelopes.

Key Architectural Responsibilities:
1. Strongly-Typed Question Representation:
   - `Question`: Represents an interview problem card with metadata (track, difficulty,
     algorithmic tags, FAANG company tags, and progressive hints).
2. Query Parameter Modeling:
   - `SearchRequest`: Validates client search filters including keyword strings,
     interview track ('dsa', 'system_design', 'behavioral'), difficulty levels, and target companies.
3. Pagination & Result Envelopes:
   - `SearchResponse`: Standardized JSON response envelope delivering matching questions,
     total match count, and original query echo.
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class Question(BaseModel):
    """
    Complete representation of an interview question in the platform question bank.
    """
    id: str = Field(..., description="Unique question identifier string")
    title: str = Field(..., description="Problem title (e.g. 'Two Sum', 'Design TinyURL')")
    description: str = Field(..., description="Detailed problem statement and constraints")
    interview_type: str = Field(..., description="Interview track ('dsa', 'behavioral', 'system_design')")
    difficulty: str = Field(..., description="Difficulty level ('easy', 'medium', 'hard')")
    tags: List[str] = Field(default=[], description="Algorithmic or topic tags (e.g. 'arrays', 'hashmap')")
    company_tags: List[str] = Field(default=[], description="Companies known to ask this question (e.g. 'Google', 'Amazon')")
    hints: List[str] = Field(default=[], description="Progressive hints available to the candidate during the session")


class SearchRequest(BaseModel):
    """
    Search filter criteria submitted by clients to discover interview questions.
    """
    query: Optional[str] = Field(None, description="Free-text search query string")
    interview_type: Optional[str] = Field(None, description="Filter by interview track")
    difficulty: Optional[str] = Field(None, description="Filter by difficulty level ('easy', 'medium', 'hard')")
    company: Optional[str] = Field(None, description="Filter by target hiring company")
    limit: int = Field(default=10, ge=1, le=100, description="Page size ceiling")
    offset: int = Field(default=0, ge=0, description="Zero-based record offset")


class SearchResponse(BaseModel):
    """
    Paginated search results container returned to client applications.
    """
    questions: List[Question] = Field(..., description="List of matching questions ranked by relevance")
    total: int = Field(..., description="Total count of questions matching criteria")
    query: Optional[str] = Field(None, description="Original query text echoed back")
