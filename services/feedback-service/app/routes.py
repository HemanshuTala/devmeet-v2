"""
================================================================================
FEEDBACK SERVICE — REST API ROUTING & EVALUATION CONTROLLER
================================================================================
Role & Responsibility:
  This module defines the external HTTP endpoints for the Feedback Service (Port 8007).
  It acts as the primary evaluation controller handling:
    1. Report Generation (`POST /api/v1/feedback/generate`): Synthesizes comprehensive
       multi-dimensional scores, renders branded PDF scorecards, and persists records to
       PostgreSQL.
    2. Feedback Retrieval (`GET /api/v1/feedback/{session_id}`): Serves saved evaluation
       metrics, strengths, weaknesses, code improvements, and percentile benchmarks
       to the candidate's dashboard UI.
    3. Direct PDF Download (`GET /api/v1/feedback/{session_id}/pdf`): Dynamically compiles
       and streams downloadable A4 PDF scorecard binaries directly to the browser.
================================================================================
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
from pathlib import Path
import os
import io
import logging

from .models import FeedbackGenerateRequest, FeedbackReportResponse, ScoreBreakdown, PercentileInfo
from .generator import feedback_generator
from .database import db

logger = logging.getLogger("feedback-service")

# Initialize router with standard prefix
router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


# ==============================================================================
# ROUTE 1: GENERATE POST-INTERVIEW FEEDBACK REPORT
# ==============================================================================

@router.post("/generate", response_model=FeedbackReportResponse)
async def generate_feedback(request: FeedbackGenerateRequest):
    """
    Generates AI-driven evaluation, computes percentile rankings, and compiles a PDF report.

    Parameters:
      request (FeedbackGenerateRequest): Session ID, interview track, seniority, transcript.

    Returns:
      FeedbackReportResponse: Composite score, dimension breakdown, strengths/weaknesses, and PDF link.

    Flow:
      1. Generates scores and qualitative feedback via Groq LLM (or heuristic fallback).
      2. Renders print-ready HTML and compiles binary PDF scorecard via WeasyPrint.
      3. Uploads PDF to AWS S3 (generating a 7-day presigned URL) or local storage.
      4. Persists evaluation report to PostgreSQL database (`feedback_reports` table).
    """
    try:
        # Step 1: Analyze transcript and compute multi-dimensional scores
        evaluation = await feedback_generator.generate_feedback(request.model_dump())

        # Step 2: Render and upload PDF report (graceful fallback if WeasyPrint or S3 is unavailable)
        pdf_url = None
        try:
            session_info = {
                "session_id": request.session_id,
                "interview_type": request.interview_type,
                "difficulty": request.difficulty,
                "language": request.language,
                "target_company": request.target_company,
            }
            pdf_bytes = await feedback_generator.generate_pdf(evaluation, session_info)
            if pdf_bytes:
                pdf_url = await feedback_generator.upload_pdf_report(pdf_bytes, request.session_id)
        except Exception as pdf_err:
            logger.warning("PDF compilation skipped (optional export component): %s", pdf_err)
            pdf_url = None

        # Step 3: Persist evaluation to PostgreSQL database
        detailed = dict(evaluation["detailed_feedback"])
        if evaluation.get("percentile"):
            detailed["percentile"] = evaluation["percentile"]

        await db.save_report(
            session_id=request.session_id,
            overall_score=evaluation["overall_score"],
            scores=evaluation["scores"],
            detailed_feedback=detailed,
            pdf_url=pdf_url,
        )

        # Step 4: Format response DTO
        raw_scores = evaluation["scores"]
        scores_breakdown = ScoreBreakdown(
            communication_score=raw_scores["communication_score"],
            problem_solving_score=raw_scores["problem_solving_score"],
            code_quality_score=raw_scores.get("code_quality_score"),
            time_complexity_score=raw_scores.get("time_complexity_score"),
            behavioral_score=raw_scores.get("behavioral_score"),
        )

        return FeedbackReportResponse(
            session_id=request.session_id,
            overall_score=evaluation["overall_score"],
            scores=scores_breakdown,
            detailed_feedback=evaluation["detailed_feedback"],
            pdf_url=pdf_url,
            percentile=_parse_percentile(evaluation.get("percentile")),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate feedback: {str(e)}")


# ==============================================================================
# ROUTE 2: HEALTH PROBE
# ==============================================================================

@router.get("/health")
async def feedback_health():
    """Returns feedback service health and database connection status."""
    return {
        "status": "healthy",
        "service": "feedback-service",
        "postgres_connected": db.use_db,
    }


# ==============================================================================
# ROUTE 3: RETRIEVE EXISTING FEEDBACK REPORT
# ==============================================================================

@router.get("/{session_id}", response_model=FeedbackReportResponse)
async def get_feedback(session_id: str):
    """
    Retrieves a pre-generated feedback report and score analysis for an interview session.

    Parameters:
      session_id (str): UUID string of the target interview session.

    Returns:
      FeedbackReportResponse: Report containing scores, strengths, weaknesses, and PDF URL.

    Raises:
      HTTPException (404 Not Found): If feedback has not been generated for the session.
    """
    report = await db.get_report_by_session(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Feedback report not found for this session")

    raw_scores = report["scores"]
    scores_breakdown = ScoreBreakdown(
        communication_score=raw_scores["communication_score"],
        problem_solving_score=raw_scores["problem_solving_score"],
        code_quality_score=raw_scores.get("code_quality_score"),
        time_complexity_score=raw_scores.get("time_complexity_score"),
        behavioral_score=raw_scores.get("behavioral_score"),
    )

    return FeedbackReportResponse(
        session_id=report["session_id"],
        overall_score=report["overall_score"],
        scores=scores_breakdown,
        detailed_feedback=report["detailed_feedback"],
        pdf_url=report["pdf_url"],
        percentile=_parse_percentile(
            report["detailed_feedback"].get("percentile")
            if isinstance(report["detailed_feedback"], dict)
            else None
        ),
    )


def _parse_percentile(raw) -> Optional[PercentileInfo]:
    """
    Extracts and validates cohort percentile ranking from a dictionary payload.

    Parameters:
      raw (Any): Raw dictionary or None.

    Returns:
      Optional[PercentileInfo]: Validated PercentileInfo model instance or None.
    """
    if not raw or not isinstance(raw, dict):
        return None
    if "percentile" not in raw:
        return None
    return PercentileInfo(
        percentile=int(raw["percentile"]),
        message=str(raw.get("message", f"You performed better than {raw['percentile']}% of peers.")),
    )


# ==============================================================================
# ROUTE 3: DIRECT PDF REPORT STREAMING DOWNLOAD
# ==============================================================================

@router.get("/{session_id}/pdf")
async def download_feedback_pdf(session_id: str):
    """
    Streams the branded PDF interview evaluation report directly to the client browser.

    Parameters:
      session_id (str): UUID of the interview session.

    Returns:
      StreamingResponse: Binary stream (`application/pdf`) with attachment download header.

    Raises:
      HTTPException (404 Not Found): If session report does not exist.
    """
    report = await db.get_report_by_session(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Feedback report not found for this session")

    session_info = {
        "session_id": session_id,
        "interview_type": (
            report["detailed_feedback"].get("interview_type", "dsa")
            if isinstance(report["detailed_feedback"], dict)
            else "dsa"
        ),
        "difficulty": (
            report["detailed_feedback"].get("difficulty", "medium")
            if isinstance(report["detailed_feedback"], dict)
            else "medium"
        ),
    }
    evaluation = {
        "overall_score": report["overall_score"],
        "scores": report["scores"],
        "detailed_feedback": report["detailed_feedback"],
    }
    
    local_pdf = Path("uploads") / f"report_{session_id}.pdf"
    if local_pdf.exists():
        try:
            with open(local_pdf, "rb") as f:
                pdf_bytes = f.read()
        except Exception as e:
            logger.warning(f"Failed reading existing local PDF, regenerating: {e}")
            pdf_bytes = await feedback_generator.generate_pdf(evaluation, session_info)
    else:
        pdf_bytes = await feedback_generator.generate_pdf(evaluation, session_info)
        try:
            local_pdf.parent.mkdir(parents=True, exist_ok=True)
            with open(local_pdf, "wb") as f:
                f.write(pdf_bytes)
        except Exception as e:
            logger.warning(f"Failed saving generated PDF cache: {e}")

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="devmeet_report_{session_id[:8]}.pdf"'},
    )
