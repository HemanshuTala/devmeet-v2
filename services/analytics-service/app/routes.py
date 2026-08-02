"""
Analytics Service — Full Production Routes
- Platform-wide metrics aggregation
- Per-user performance dashboard
- CSV export
- Event tracking (page views, session events, feature flags)
- Score trend analysis
"""
import csv
import io
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
import httpx
import os

from .models import (
    AnalyticsEvent, MetricsResponse,
    DailySessionMetric, LanguageDistributionMetric, ScoreDistributionMetric
)
from .database import db

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])
security = HTTPBearer(auto_error=False)

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")


async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{AUTH_SERVICE_URL}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {credentials.credentials}"}
            )
            return r.json() if r.status_code == 200 else None
    except Exception:
        return None


# ─── Event Tracking ────────────────────────────────────────────────────────────

@router.post("/event")
async def track_event(event: AnalyticsEvent, request: Request):
    """
    Track a platform analytics event (page view, session start, feature click, etc.)
    """
    ip = request.client.host if request.client else None
    if not event.ip_address:
        event.ip_address = ip

    await db.save_event(
        event_type=event.event_type,
        user_id=event.user_id,
        session_id=event.session_id,
        properties=event.properties or {},
        ip_address=event.ip_address,
    )
    return {"tracked": True, "event_type": event.event_type}


@router.post("/events/batch")
async def track_events_batch(events: List[AnalyticsEvent], request: Request):
    """Batch track multiple analytics events at once."""
    ip = request.client.host if request.client else None
    for event in events:
        if not event.ip_address:
            event.ip_address = ip
        await db.save_event(
            event_type=event.event_type,
            user_id=event.user_id,
            session_id=event.session_id,
            properties=event.properties or {},
            ip_address=event.ip_address,
        )
    return {"tracked": len(events), "status": "ok"}


# ─── Platform-Wide Metrics ────────────────────────────────────────────────────

@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Return aggregated platform metrics: DAU, session counts, score distributions."""
    summary = await db.get_metrics()
    daily = await db.get_daily_sessions()
    languages = await db.get_language_distribution()
    scores = await db.get_score_distribution()

    return MetricsResponse(
        total_users=summary["total_users"],
        total_sessions=summary["total_sessions"],
        completed_sessions=summary["completed_sessions"],
        active_sessions=summary["active_sessions"],
        sessions_today=summary["sessions_today"],
        avg_session_score=summary["avg_session_score"],
        dsa_sessions=summary["dsa_sessions"],
        behavioral_sessions=summary["behavioral_sessions"],
        system_design_sessions=summary["system_design_sessions"],
        top_languages=languages,
        daily_sessions=daily,
        score_distribution=scores,
    )


@router.get("/daily", response_model=List[DailySessionMetric])
async def get_daily_metrics(days: int = Query(30, ge=1, le=90)):
    """Return daily session count trend for the past N days."""
    return await db.get_daily_sessions(days)


@router.get("/languages", response_model=List[LanguageDistributionMetric])
async def get_languages():
    """Return code submission language distribution."""
    return await db.get_language_distribution()


@router.get("/scores", response_model=List[ScoreDistributionMetric])
async def get_scores():
    """Return score bucket distribution across all completed sessions."""
    return await db.get_score_distribution()


# ─── Per-User Analytics Dashboard ─────────────────────────────────────────────

@router.get("/user/{user_id}/dashboard")
async def get_user_dashboard(
    user_id: str,
    days: int = Query(90, ge=7, le=365),
):
    """
    Return a complete performance dashboard for one user:
    - Sessions over time
    - Score trend
    - Interview type breakdown
    - Average scores by type
    - Strongest / weakest areas
    """
    stats = await db.get_user_stats(user_id=user_id, days=days)
    return {
        "user_id": user_id,
        "period_days": days,
        **stats,
    }


@router.get("/user/{user_id}/sessions")
async def get_user_sessions_analytics(
    user_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Return all session analytics entries for a specific user."""
    sessions = await db.get_user_sessions(user_id=user_id, limit=limit, offset=offset)
    return {"user_id": user_id, "sessions": sessions, "total": len(sessions)}


@router.get("/user/{user_id}/score-trend")
async def get_user_score_trend(
    user_id: str,
    days: int = Query(30, ge=7, le=365),
):
    """Return the user's interview score over time as a list of (date, score) points."""
    trend = await db.get_user_score_trend(user_id=user_id, days=days)
    return {"user_id": user_id, "trend": trend, "period_days": days}


# ─── Completion Rate & Funnel ──────────────────────────────────────────────────

@router.get("/funnel")
async def get_conversion_funnel():
    """Return the interview funnel: Started → Completed → Feedback Viewed."""
    funnel = await db.get_funnel_metrics()
    return funnel


@router.get("/retention")
async def get_retention():
    """Return weekly cohort retention rates (D1, D7, D30)."""
    retention = await db.get_retention_metrics()
    return retention


# ─── CSV Export ───────────────────────────────────────────────────────────────

@router.get("/export/sessions.csv")
async def export_sessions_csv(
    days: int = Query(30, ge=1, le=365),
    interview_type: Optional[str] = Query(None),
):
    """
    Export raw session analytics as a CSV file.
    """
    sessions = await db.get_raw_sessions_for_export(days=days, interview_type=interview_type)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "session_id", "user_id", "interview_type", "difficulty",
        "status", "score", "duration_minutes", "created_at",
    ])
    writer.writeheader()
    for s in sessions:
        writer.writerow({
            "session_id": s.get("session_id", ""),
            "user_id": s.get("user_id", ""),
            "interview_type": s.get("interview_type", ""),
            "difficulty": s.get("difficulty", ""),
            "status": s.get("status", ""),
            "score": s.get("score", ""),
            "duration_minutes": s.get("duration_minutes", ""),
            "created_at": str(s.get("created_at", "")),
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=devmeet_sessions_{days}d.csv"},
    )


@router.get("/export/events.csv")
async def export_events_csv(
    days: int = Query(7, ge=1, le=90),
    event_type: Optional[str] = Query(None),
):
    """Export raw analytics events as a CSV file."""
    events = await db.get_raw_events_for_export(days=days, event_type=event_type)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "event_type", "user_id", "session_id", "ip_address", "created_at"])
    writer.writeheader()
    for e in events:
        writer.writerow({
            "id": str(e.get("id", "")),
            "event_type": e.get("event_type", ""),
            "user_id": str(e.get("user_id", "")),
            "session_id": str(e.get("session_id", "")),
            "ip_address": str(e.get("ip_address", "")),
            "created_at": str(e.get("created_at", "")),
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=devmeet_events_{days}d.csv"},
    )


# ─── Real-Time Counters ────────────────────────────────────────────────────────

@router.get("/realtime")
async def get_realtime_stats():
    """Return live counters: active sessions, events per minute, etc."""
    rt = await db.get_realtime_stats()
    return rt
