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

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])

async def send_completion_notification(session_id: str, overall_score: int, interview_type: str, pdf_url: str):
    """Fetch user details and trigger email and push notifications via Notification Service."""
    user_details = await db.get_user_details_by_session(session_id)
    if not user_details:
        return
        
    user_id = str(user_details["user_id"])
    email = user_details["email"]
    name = user_details["display_name"]
    
    notification_url = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8008")
    
    # Send email
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{notification_url}/api/v1/notifications/email",
                json={
                    "to": email,
                    "template": "session_complete",
                    "data": {
                        "name": name,
                        "interview_type": interview_type.upper(),
                        "score": overall_score,
                        "report_url": pdf_url or f"/interview/{session_id}/feedback"
                    }
                },
                timeout=5.0
            )
    except Exception as e:
        logger.error("Failed to send session complete email: %s", e)
        
    # Send push notification
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{notification_url}/api/v1/notifications/push",
                json={
                    "user_id": user_id,
                    "type": "success",
                    "title": "Interview Evaluated",
                    "message": f"Your {interview_type.upper()} interview feedback is ready! Score: {overall_score}/100.",
                    "data": {"session_id": session_id}
                },
                timeout=5.0
            )
    except Exception as e:
        logger.error("Failed to send push notification: %s", e)

@router.post("/generate", response_model=FeedbackReportResponse)
async def generate_feedback(request: FeedbackGenerateRequest, background_tasks: BackgroundTasks):
    try:
        # 1. Analyze and generate scores/feedback
        evaluation = await feedback_generator.generate_feedback(request.model_dump())
        
        # 2. Render and upload PDF report
        session_info = {
            "session_id": request.session_id,
            "interview_type": request.interview_type,
            "difficulty": request.difficulty,
            "language": request.language,
            "target_company": request.target_company
        }
        pdf_bytes = await feedback_generator.generate_pdf(evaluation, session_info)
        pdf_url = await feedback_generator.upload_pdf_report(pdf_bytes, request.session_id)
        
        # 3. Persist to database
        detailed = dict(evaluation["detailed_feedback"])
        if evaluation.get("percentile"):
            detailed["percentile"] = evaluation["percentile"]
        await db.save_report(
            session_id=request.session_id,
            overall_score=evaluation["overall_score"],
            scores=evaluation["scores"],
            detailed_feedback=detailed,
            pdf_url=pdf_url
        )
        
        # 4. Schedule asynchronous notifications (Email + Push)
        background_tasks.add_task(
            send_completion_notification,
            session_id=request.session_id,
            overall_score=evaluation["overall_score"],
            interview_type=request.interview_type,
            pdf_url=pdf_url
        )
        
        # Build response breakdown
        raw_scores = evaluation["scores"]
        scores_breakdown = ScoreBreakdown(
            communication_score=raw_scores["communication_score"],
            problem_solving_score=raw_scores["problem_solving_score"],
            code_quality_score=raw_scores.get("code_quality_score"),
            time_complexity_score=raw_scores.get("time_complexity_score"),
            behavioral_score=raw_scores.get("behavioral_score")
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

@router.get("/{session_id}", response_model=FeedbackReportResponse)
async def get_feedback(session_id: str):
    report = await db.get_report_by_session(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Feedback report not found for this session")
        
    raw_scores = report["scores"]
    scores_breakdown = ScoreBreakdown(
        communication_score=raw_scores["communication_score"],
        problem_solving_score=raw_scores["problem_solving_score"],
        code_quality_score=raw_scores.get("code_quality_score"),
        time_complexity_score=raw_scores.get("time_complexity_score"),
        behavioral_score=raw_scores.get("behavioral_score")
    )
    
    return FeedbackReportResponse(
        session_id=report["session_id"],
        overall_score=report["overall_score"],
        scores=scores_breakdown,
        detailed_feedback=report["detailed_feedback"],
        pdf_url=report["pdf_url"],
        percentile=_parse_percentile(report["detailed_feedback"].get("percentile") if isinstance(report["detailed_feedback"], dict) else None),
    )


def _parse_percentile(raw) -> Optional[PercentileInfo]:
    if not raw or not isinstance(raw, dict):
        return None
    if "percentile" not in raw:
        return None
    return PercentileInfo(
        percentile=int(raw["percentile"]),
        message=str(raw.get("message", f"You performed better than {raw['percentile']}% of peers.")),
    )


@router.get("/{session_id}/pdf")
async def download_feedback_pdf(session_id: str):
    """FEED-04/05: Stream PDF report bytes for download."""
    report = await db.get_report_by_session(session_id)
    if not report:
        raise HTTPException(status_code=404, detail="Feedback report not found for this session")

    session_info = {
        "session_id": session_id,
        "interview_type": report["detailed_feedback"].get("interview_type", "dsa") if isinstance(report["detailed_feedback"], dict) else "dsa",
        "difficulty": report["detailed_feedback"].get("difficulty", "medium") if isinstance(report["detailed_feedback"], dict) else "medium",
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
