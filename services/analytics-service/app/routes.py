"""
================================================================================
ANALYTICS SERVICE — REST API ROUTING & TELEMETRY CONTROLLER
================================================================================
Role & Responsibility:
  This module defines the external HTTP API routing surface for the Analytics Service (Port 8009).
  It acts as the primary telemetry collection and business intelligence engine for DevMeet:
    1. Event Ingestion (`POST /api/v1/analytics/event` & `/events/batch`):
       Captures real-time user events, route changes, sandbox runs, and interview milestones.
    2. Executive Metrics Aggregation (`GET /api/v1/analytics/metrics`):
       Computes DAU/MAU ratios, active rooms, average scores, and language distributions.
    3. Trailing Daily Activity (`GET /api/v1/analytics/daily`):
       Returns time-series buckets for dashboard activity graphs.
    4. Per-User Performance Hub (`GET /api/v1/analytics/user/{user_id}/dashboard`):
       Computes candidate score progression, active streaks, and track strengths/weaknesses.
    5. Conversion Funnel & Cohort Retention (`/funnel`, `/retention`):
       Tracks platform milestone drop-offs and D1/D7/D30 user return rates.
    6. CSV Compliance & Business Intelligence Exports (`/export/sessions.csv`, `/export/events.csv`):
       Streams tabular data for offline business intelligence tools.
    7. Real-Time Operations Telemetry (`GET /api/v1/analytics/realtime`):
       Monitors live event velocity (events/min) and active interview rooms.
================================================================================
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
    AnalyticsEvent,
    MetricsResponse,
    DailySessionMetric,
    LanguageDistributionMetric,
    ScoreDistributionMetric,
)
from .database import db

# Initialize APIRouter under /api/v1/analytics prefix
router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])
security = HTTPBearer(auto_error=False)


@router.get("/health")
async def health():
    """Liveness probe under standard API prefix."""
    return {"status": "healthy", "service": "analytics-service", "postgres_connected": db.use_db}


AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")

_analytics_http_client: Optional[httpx.AsyncClient] = None


def get_analytics_http_client() -> httpx.AsyncClient:
    """Returns or initializes a connection-pooled HTTP client for analytics inter-service calls."""
    global _analytics_http_client
    if _analytics_http_client is None or _analytics_http_client.is_closed:
        _analytics_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=3.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=50)
        )
    return _analytics_http_client


async def close_analytics_http_client():
    """Gracefully closes the pooled analytics HTTP client on service shutdown."""
    global _analytics_http_client
    if _analytics_http_client and not _analytics_http_client.is_closed:
        await _analytics_http_client.aclose()
        _analytics_http_client = None


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """
    Validates optional Bearer JWT against auth-service using a pooled HTTP client.

    Parameters:
      credentials (Optional[HTTPAuthorizationCredentials]): Bearer token if provided.

    Returns:
      Optional[dict]: Authenticated user dictionary or None if unauthenticated.
    """
    if not credentials:
        return None
    try:
        client = get_analytics_http_client()
        r = await client.get(
            f"{AUTH_SERVICE_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {credentials.credentials}"},
        )
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


# ==============================================================================
# 1. EVENT INGESTION ENDPOINTS
# ==============================================================================

@router.post("/event")
async def track_event(event: AnalyticsEvent, request: Request):
    """
    Records a single platform telemetry event (page view, session start, code submission).

    Parameters:
      event (AnalyticsEvent): Event payload containing event_type, user_id, properties.
      request (Request): Inbound FastAPI request (used to inspect client IP).

    Returns:
      dict: `{"tracked": True, "event_type": str}` confirmation.
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
    """
    Batches multiple telemetry events into a single HTTP round-trip.

    Parameters:
      events (List[AnalyticsEvent]): List of event objects.
      request (Request): Inbound request context.

    Returns:
      dict: Count of tracked events and status confirmation.
    """
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


# ==============================================================================
# 2. PLATFORM-WIDE KPI METRICS
# ==============================================================================

@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """
    Aggregates executive dashboard metrics: total registered users, session counts,
    active rooms, average candidate scores, and language distributions.
    """
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
    """
    Returns daily session creation time-series for the trailing N days (default: 30).
    """
    return await db.get_daily_sessions(days)


@router.get("/languages", response_model=List[LanguageDistributionMetric])
async def get_languages():
    """
    Returns programming language utilization distribution across code executions.
    """
    return await db.get_language_distribution()


@router.get("/scores", response_model=List[ScoreDistributionMetric])
async def get_scores():
    """
    Returns score histogram bracket distribution across all completed interviews.
    """
    return await db.get_score_distribution()


# ==============================================================================
# 3. PER-USER PERFORMANCE DASHBOARD
# ==============================================================================

@router.get("/user/{user_id}/dashboard")
async def get_user_dashboard(
    user_id: str,
    days: int = Query(90, ge=7, le=365),
):
    """
    Compiles candidate-specific performance intelligence:
      - Total completed interviews and completion rate percentage.
      - Average scores across communication, problem solving, and code quality.
      - Strongest and weakest technical interview domains.
      - Consecutive active practice day streak.
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
    """
    Retrieves paginated historical interview session telemetry for a specific candidate.
    """
    sessions = await db.get_user_sessions(user_id=user_id, limit=limit, offset=offset)
    return {"user_id": user_id, "sessions": sessions, "total": len(sessions)}


@router.get("/user/{user_id}/score-trend")
async def get_user_score_trend(
    user_id: str,
    days: int = Query(30, ge=7, le=365),
):
    """
    Retrieves candidate score trajectory and progression over time for trend line charts.
    """
    trend = await db.get_user_score_trend(user_id=user_id, days=days)
    return {"user_id": user_id, "trend": trend, "period_days": days}


# ==============================================================================
# 4. FUNNEL & RETENTION METRICS
# ==============================================================================

@router.get("/funnel")
async def get_conversion_funnel():
    """
    Calculates milestone conversion: Started -> Completed -> Feedback Viewed.
    """
    funnel = await db.get_funnel_metrics()
    return funnel


@router.get("/retention")
async def get_retention():
    """
    Returns platform weekly candidate cohort retention rates (D1, D7, D30).
    """
    retention = await db.get_retention_metrics()
    return retention


# ==============================================================================
# 5. CSV EXPORTS FOR DATA WAREHOUSE & COMPLIANCE
# ==============================================================================

@router.get("/export/sessions.csv")
async def export_sessions_csv(
    days: int = Query(30, ge=1, le=365),
    interview_type: Optional[str] = Query(None),
):
    """
    Streams raw interview session records (duration, scores, difficulty) as a CSV file.
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
    """
    Streams raw clickstream event logs as a CSV file for compliance auditing.
    """
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


# ==============================================================================
# 6. REAL-TIME PLATFORM COUNTERS
# ==============================================================================

@router.get("/realtime")
async def get_realtime_stats():
    """
    Provides real-time event throughput per minute and estimated active interview rooms.
    """
    rt = await db.get_realtime_stats()
    return rt
