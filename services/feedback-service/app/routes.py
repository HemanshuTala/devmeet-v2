"""
================================================================================
FEEDBACK SERVICE — REST API ROUTING & EVALUATION CONTROLLER
================================================================================
Role & Responsibility:
  This module defines the external HTTP endpoints for the Feedback Service (Port 8007).
  It acts as the primary evaluation controller handling:
    1. Report Generation (`POST /api/v1/feedback/generate`): Synthesizes comprehensive
       multi-dimensional scores, renders branded PDF scorecards, persists records to
       PostgreSQL, and schedules asynchronous candidate completion notifications.
    2. Feedback Retrieval (`GET /api/v1/feedback/{session_id}`): Serves saved evaluation
       metrics, strengths, weaknesses, code improvements, and percentile benchmarks
       to the candidate's dashboard UI.
    3. Direct PDF Download (`GET /api/v1/feedback/{session_id}/pdf`): Dynamically compiles
       and streams downloadable A4 PDF scorecard binaries directly to the browser.
    4. Out-of-Band Candidate Notifications: Dispatches transactional completion emails
       and in-app push alerts when evaluation completes.
================================================================================
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import Optional
import os
import io
import logging
import httpx

from .models import FeedbackGenerateRequest, FeedbackReportResponse, ScoreBreakdown, PercentileInfo
from .generator import feedback_generator
from .database import db

logger = logging.getLogger("feedback-service")

# Initialize router with standard prefix
router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])

_feedback_http_client: Optional[httpx.AsyncClient] = None


def get_feedback_http_client() -> httpx.AsyncClient:
    """Returns or initializes a pooled HTTP client for feedback inter-service calls."""
    global _feedback_http_client
    if _feedback_http_client is None or _feedback_http_client.is_closed:
        _feedback_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=3.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=50)
        )
    return _feedback_http_client


async def close_feedback_http_client():
    """Gracefully closes the pooled feedback HTTP client on service shutdown."""
    global _feedback_http_client
    if _feedback_http_client and not _feedback_http_client.is_closed:
        await _feedback_http_client.aclose()
        _feedback_http_client = None


# ==============================================================================
# ASYNCHRONOUS CANDIDATE NOTIFICATION WORKER
# ==============================================================================

async def send_completion_notification(
    session_id: str,
    overall_score: int,
    interview_type: str,
    pdf_url: str,
):
    """
    Dispatches asynchronous email and push notifications when an interview evaluation finishes.

    Parameters:
      session_id (str): UUID of the completed interview session.
      overall_score (int): Composite candidate score (0-100).
      interview_type (str): Domain track ('dsa', 'behavioral', 'system_design').
      pdf_url (str): Download link or S3 presigned URL for the PDF report.

    Fault Tolerance:
      Runs in a FastAPI `BackgroundTasks` thread. If the notification service is offline,
      the exception is caught and logged, ensuring the candidate's feedback report is
      never delayed or rolled back.
    """
    user_details = await db.get_user_details_by_session(session_id)
    if not user_details:
        return

    user_id = str(user_details["user_id"])
    email = user_details["email"]
    name = user_details["display_name"]

    notification_url = os.getenv("NOTIFICATION_SERVICE_URL", "")
    if not notification_url:
        return

    client = get_feedback_http_client()

    # Step 1: Send transactional completion email
    try:
        await client.post(
            f"{notification_url}/api/v1/notifications/email",
            json={
                "to": email,
                "template": "session_complete",
                "data": {
                    "name": name,
                    "interview_type": interview_type.upper(),
                    "score": overall_score,
                    "report_url": pdf_url or f"/interview/{session_id}/feedback",
                },
            },
            timeout=5.0,
        )
    except Exception as e:
        logger.error("Failed to send session complete email: %s", e)

    # Step 2: Send real-time in-app push notification
    try:
        await client.post(
            f"{notification_url}/api/v1/notifications/push",
            json={
                "user_id": user_id,
                "type": "success",
                "title": "Interview Evaluated",
                "message": f"Your {interview_type.upper()} interview feedback is ready! Score: {overall_score}/100.",
                "data": {"session_id": session_id},
            },
            timeout=5.0,
        )
    except Exception as e:
        logger.error("Failed to send push notification: %s", e)


# ==============================================================================
# ROUTE 1: GENERATE POST-INTERVIEW FEEDBACK REPORT
# ==============================================================================

@router.post("/generate", response_model=FeedbackReportResponse)
async def generate_feedback(
    request: FeedbackGenerateRequest,
    background_tasks: BackgroundTasks,
):
    """
    Generates AI-driven evaluation, computes percentile rankings, and compiles a PDF report.

    Parameters:
      request (FeedbackGenerateRequest): Session ID, interview track, seniority, transcript.
      background_tasks (BackgroundTasks): In-process task queue for notifications.

    Returns:
      FeedbackReportResponse: Composite score, dimension breakdown, strengths/weaknesses, and PDF link.

    Flow:
      1. Generates scores and qualitative feedback via Groq LLM (or heuristic fallback).
      2. Renders print-ready HTML and compiles binary PDF scorecard via WeasyPrint.
      3. Uploads PDF to AWS S3 (generating a 7-day presigned URL) or local storage.
      4. Persists evaluation report to PostgreSQL database (`feedback_reports` table).
      5. Enqueues background notification task to alert candidate via email and push.
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

        # Step 4: Schedule background notification tasks
        background_tasks.add_task(
            send_completion_notification,
            session_id=request.session_id,
            overall_score=evaluation["overall_score"],
            interview_type=request.interview_type,
            pdf_url=pdf_url,
        )

        # Step 5: Format response DTO
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
# ROUTE 2: RETRIEVE EXISTING FEEDBACK REPORT
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
    pdf_bytes = await feedback_generator.generate_pdf(evaluation, session_info)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="devmeet_report_{session_id[:8]}.pdf"'},
    )
