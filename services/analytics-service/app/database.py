"""
================================================================================
ANALYTICS SERVICE — POSTGRESQL AGGREGATION & DATA ACCESS LAYER
================================================================================
Role & Responsibility:
  This module acts as the analytical query engine and event ingestion store for the
  entire platform. It directly queries primary database entities (sessions,
  feedback_reports, user_profiles, code_submissions) as well as the event log,
  providing:
    1. Event Ingestion (`save_event`): Persistence of platform telemetry into `analytics_events`.
    2. Executive Metrics KPI Compilation: Computes platform-wide metrics (total users,
       completed sessions, active rooms, score averages, language distributions).
    3. Candidate Performance Telemetry: Calculates per-user performance trends,
       consecutive-day interview streaks, track mastery distributions, and score timelines.
    4. Funnel & Retention Analysis: Computes conversion rates across Session Created ->
       Started -> Completed -> Feedback Generated, and real cohort retention metrics.
    5. Clean Zero Baseline: If a candidate has no completed interviews yet, cleanly
       reports true 0-state metrics without injecting fabricated mock or demo data.
================================================================================
"""

import os
import asyncpg
import json
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, date


def is_valid_uuid(val: Any) -> bool:
    """Checks whether the given value is a syntactically valid UUID string."""
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class AnalyticsDatabase:
    """
    Data access and aggregation engine for platform analytics and user progression metrics.
    """

    def __init__(self):
        """Initializes connection pool state and in-memory event fallback buffer."""
        self.pool: Optional[asyncpg.Pool] = None
        self.use_db = False
        self.local_events: List[Dict[str, Any]] = []

    async def connect(self):
        """
        Initializes the asyncpg connection pool using environment credentials.
        """
        try:
            self.pool = await asyncpg.create_pool(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                database=os.getenv("POSTGRES_DB", "devmeet"),
                user=os.getenv("POSTGRES_USER", "devmeet"),
                password=os.getenv("POSTGRES_PASSWORD", "devmeet_password"),
                min_size=int(os.getenv("DB_POOL_MIN", "2")),
                max_size=int(os.getenv("DB_POOL_MAX", "10")),
                command_timeout=float(os.getenv("DB_TIMEOUT", "15.0")),
            )
            self.use_db = True
            print("Analytics DB: Successfully connected to PostgreSQL")
        except Exception as e:
            print(f"Analytics DB: Failed to connect to DB: {e}. Running in memory fallback.")
            self.use_db = False

    async def disconnect(self):
        """Gracefully closes open connection pool sockets during service shutdown."""
        if self.pool:
            await self.pool.close()

    async def save_event(
        self,
        event_type: str,
        user_id: Optional[str],
        session_id: Optional[str],
        properties: Optional[dict],
        ip_address: Optional[str],
    ):
        """
        Records an analytics event into the database.
        """
        event_time = datetime.utcnow()
        props_str = json.dumps(properties or {})

        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO analytics_events (event_type, user_id, session_id, properties, ip_address, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        event_type,
                        str(user_id) if user_id else None,
                        str(session_id) if session_id else None,
                        props_str,
                        ip_address,
                        event_time,
                    )
                return
            except Exception as e:
                print(f"Analytics DB: Failed to save event to DB: {e}. Backing up in memory.")

        # In-memory fallback if database write fails
        self.local_events.append({
            "event_type": event_type,
            "user_id": user_id,
            "session_id": session_id,
            "properties": properties or {},
            "ip_address": ip_address,
            "created_at": event_time,
        })

    async def get_metrics(self) -> dict:
        """
        Aggregates system-wide key performance indicators (KPIs) from real platform tables.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT
                            (SELECT COUNT(*) FROM user_profiles)                                      AS total_users,
                            (SELECT COUNT(*) FROM sessions)                                           AS total_sessions,
                            (SELECT COUNT(*) FROM sessions WHERE status = 'completed')                AS completed_sessions,
                            (SELECT COUNT(*) FROM sessions WHERE status IN ('in_progress', 'active')) AS active_sessions,
                            (SELECT COUNT(*) FROM sessions WHERE created_at >= NOW() - INTERVAL '1 day') AS sessions_today,
                            (SELECT COALESCE(ROUND(AVG(overall_score)::numeric, 1), 0.0)
                             FROM feedback_reports WHERE overall_score > 0)                           AS avg_score,
                            (SELECT COUNT(*) FROM sessions WHERE interview_type = 'dsa')              AS dsa_sessions,
                            (SELECT COUNT(*) FROM sessions WHERE interview_type = 'behavioral')       AS behavioral_sessions,
                            (SELECT COUNT(*) FROM sessions WHERE interview_type = 'system_design')    AS system_design_sessions
                    """)
                    return {
                        "total_users": row["total_users"] or 0,
                        "total_sessions": row["total_sessions"] or 0,
                        "completed_sessions": row["completed_sessions"] or 0,
                        "active_sessions": row["active_sessions"] or 0,
                        "sessions_today": row["sessions_today"] or 0,
                        "avg_session_score": float(row["avg_score"] or 0.0),
                        "dsa_sessions": row["dsa_sessions"] or 0,
                        "behavioral_sessions": row["behavioral_sessions"] or 0,
                        "system_design_sessions": row["system_design_sessions"] or 0,
                    }
            except Exception as e:
                print(f"Analytics DB: Failed to query DB metrics: {e}")

        # Local fallback calculation using in-memory event array
        events = self.local_events
        uids = {e["user_id"] for e in events if e["user_id"]}
        sids = {e["session_id"] for e in events if e["session_id"]}
        completed = sum(1 for e in events if e["event_type"] == "session_completed")
        started = sum(1 for e in events if e["event_type"] == "session_started")
        active = max(0, started - completed)

        return {
            "total_users": len(uids),
            "total_sessions": len(sids),
            "completed_sessions": completed,
            "active_sessions": active,
            "sessions_today": 0,
            "avg_session_score": 0.0,
            "dsa_sessions": 0,
            "behavioral_sessions": 0,
            "system_design_sessions": 0,
        }

    async def get_daily_sessions(self, days: int = 30) -> list:
        """
        Compiles trailing daily interview creation counts from the real sessions table.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date_str, COUNT(*) AS count 
                        FROM sessions 
                        WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
                        GROUP BY date_str
                        ORDER BY date_str ASC
                        """,
                        days,
                    )
                    return [{"date": r["date_str"], "count": r["count"]} for r in rows]
            except Exception as e:
                print(f"Analytics DB: Failed to query daily sessions: {e}")

        return []

    async def get_language_distribution(self) -> list:
        """
        Aggregates frequency of code execution by programming language from code_submissions.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT LOWER(language) AS lang, COUNT(*) AS count
                        FROM code_submissions
                        WHERE language IS NOT NULL AND TRIM(language) != ''
                        GROUP BY lang
                        ORDER BY count DESC
                        """
                    )
                    if rows:
                        return [{"language": r["lang"], "count": r["count"]} for r in rows]
            except Exception as e:
                print(f"Analytics DB: Failed to query language distribution: {e}")

        return []

    async def get_score_distribution(self) -> list:
        """
        Compiles candidate score distribution into 5 histogram brackets from real feedback_reports.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT
                            COUNT(*) FILTER (WHERE overall_score BETWEEN 0 AND 20)   AS r1,
                            COUNT(*) FILTER (WHERE overall_score BETWEEN 21 AND 40)  AS r2,
                            COUNT(*) FILTER (WHERE overall_score BETWEEN 41 AND 60)  AS r3,
                            COUNT(*) FILTER (WHERE overall_score BETWEEN 61 AND 80)  AS r4,
                            COUNT(*) FILTER (WHERE overall_score BETWEEN 81 AND 100) AS r5
                        FROM feedback_reports
                        WHERE overall_score IS NOT NULL AND overall_score > 0
                    """)
                    return [
                        {"range": "0-20", "count": row["r1"] or 0},
                        {"range": "21-40", "count": row["r2"] or 0},
                        {"range": "41-60", "count": row["r3"] or 0},
                        {"range": "61-80", "count": row["r4"] or 0},
                        {"range": "81-100", "count": row["r5"] or 0},
                    ]
            except Exception as e:
                print(f"Analytics DB: Failed to query score distribution: {e}")

        return [
            {"range": "0-20", "count": 0},
            {"range": "21-40", "count": 0},
            {"range": "41-60", "count": 0},
            {"range": "61-80", "count": 0},
            {"range": "81-100", "count": 0},
        ]

    async def get_user_stats(self, user_id: str, days: int = 90) -> dict:
        """
        Compiles personalized performance dashboard metrics for an authenticated user.
        If user has no completed sessions, returns clean zero-state metrics (never fake demo data).
        """
        empty_stats = {
            "total_sessions": 0,
            "completed_sessions": 0,
            "completion_rate": 0.0,
            "avg_score": 0.0,
            "dsa_sessions": 0,
            "behavioral_sessions": 0,
            "system_design_sessions": 0,
            "avg_communication_score": 0.0,
            "avg_problem_solving_score": 0.0,
            "avg_code_quality_score": 0.0,
            "avg_behavioral_score": 0.0,
            "best_interview_type": None,
            "worst_interview_type": None,
            "current_streak_days": 0,
            "type_breakdown": [],
            "data_source": "database",
        }

        if not is_valid_uuid(user_id):
            return empty_stats

        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT
                            COUNT(s.id)                                                    AS total,
                            COUNT(s.id) FILTER (WHERE s.status = 'completed')              AS completed,
                            AVG(fr.overall_score) FILTER (WHERE fr.overall_score IS NOT NULL
                                                           AND fr.overall_score > 0)       AS avg_score,
                            COUNT(s.id) FILTER (WHERE s.interview_type = 'dsa')            AS dsa,
                            COUNT(s.id) FILTER (WHERE s.interview_type = 'behavioral')     AS beh,
                            COUNT(s.id) FILTER (WHERE s.interview_type = 'system_design')  AS sys,
                            MAX(s.created_at)                                              AS last_session_at,
                            AVG(fr.communication_score)  FILTER (WHERE fr.communication_score > 0)  AS avg_comm,
                            AVG(fr.problem_solving_score) FILTER (WHERE fr.problem_solving_score > 0) AS avg_ps,
                            AVG(fr.code_quality_score)   FILTER (WHERE fr.code_quality_score > 0)   AS avg_cq,
                            AVG(fr.behavioral_score)     FILTER (WHERE fr.behavioral_score > 0)      AS avg_beh_score
                        FROM sessions s
                        LEFT JOIN feedback_reports fr ON fr.session_id = s.id
                        WHERE s.user_id = $1::uuid
                          AND s.created_at >= NOW() - ($2 * INTERVAL '1 day')
                    """, user_id, days)

                    total = row["total"] or 0
                    completed = row["completed"] or 0

                    if total == 0:
                        return empty_stats

                    # Compute best/worst interview track
                    type_scores = await conn.fetch("""
                        SELECT s.interview_type,
                               ROUND(AVG(fr.overall_score)::numeric, 1) AS avg_score,
                               COUNT(s.id) AS cnt
                        FROM sessions s
                        JOIN feedback_reports fr ON fr.session_id = s.id
                        WHERE s.user_id = $1::uuid
                          AND fr.overall_score > 0
                          AND s.created_at >= NOW() - ($2 * INTERVAL '1 day')
                        GROUP BY s.interview_type
                        ORDER BY avg_score DESC
                    """, user_id, days)

                    # Consecutive active practice day streak
                    streak_rows = await conn.fetch("""
                        SELECT DISTINCT DATE(s.created_at AT TIME ZONE 'UTC') AS day
                        FROM sessions s
                        WHERE s.user_id = $1::uuid
                          AND s.status = 'completed'
                        ORDER BY day DESC
                        LIMIT 60
                    """, user_id)

                    streak = 0
                    if streak_rows:
                        today = date.today()
                        expected = today
                        for r in streak_rows:
                            if r["day"] == expected or r["day"] == expected - timedelta(days=1):
                                if r["day"] == expected - timedelta(days=1):
                                    expected = r["day"]
                                streak += 1
                                expected = r["day"] - timedelta(days=1)
                            else:
                                break

                    best_type = type_scores[0]["interview_type"] if type_scores else None
                    worst_type = type_scores[-1]["interview_type"] if len(type_scores) > 1 else None

                    return {
                        "total_sessions": total,
                        "completed_sessions": completed,
                        "completion_rate": round(completed / total * 100, 1) if total else 0.0,
                        "avg_score": round(float(row["avg_score"] or 0.0), 1),
                        "dsa_sessions": row["dsa"] or 0,
                        "behavioral_sessions": row["beh"] or 0,
                        "system_design_sessions": row["sys"] or 0,
                        "avg_communication_score": round(float(row["avg_comm"] or 0.0), 1),
                        "avg_problem_solving_score": round(float(row["avg_ps"] or 0.0), 1),
                        "avg_code_quality_score": round(float(row["avg_cq"] or 0.0), 1),
                        "avg_behavioral_score": round(float(row["avg_beh_score"] or 0.0), 1),
                        "best_interview_type": best_type,
                        "worst_interview_type": worst_type,
                        "current_streak_days": streak,
                        "type_breakdown": [
                            {"type": r["interview_type"], "avg_score": float(r["avg_score"]), "count": r["cnt"]}
                            for r in type_scores
                        ],
                        "data_source": "database",
                    }
            except Exception as e:
                print(f"Analytics DB: get_user_stats error: {e}")

        return empty_stats

    async def get_user_sessions(self, user_id: str, limit: int = 50, offset: int = 0) -> list:
        """
        Retrieves paginated historical interview sessions for a candidate directly from sessions table.
        """
        if not is_valid_uuid(user_id):
            return []

        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT
                            s.id AS session_id,
                            s.created_at,
                            s.interview_type,
                            s.difficulty,
                            s.status,
                            s.duration_minutes,
                            s.target_company,
                            fr.overall_score
                        FROM sessions s
                        LEFT JOIN feedback_reports fr ON fr.session_id = s.id
                        WHERE s.user_id = $1::uuid
                        ORDER BY s.created_at DESC
                        LIMIT $2 OFFSET $3
                        """,
                        user_id, limit, offset,
                    )
                    return [
                        {
                            "session_id": str(r["session_id"]),
                            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                            "interview_type": r["interview_type"],
                            "difficulty": r["difficulty"],
                            "status": r["status"],
                            "duration_minutes": r["duration_minutes"],
                            "target_company": r["target_company"],
                            "score": r["overall_score"],
                        }
                        for r in rows
                    ]
            except Exception as e:
                print(f"Analytics DB: get_user_sessions error: {e}")

        return []

    async def get_user_score_trend(self, user_id: str, days: int = 30) -> list:
        """
        Calculates time-series progression of a candidate's average score from real feedback reports.
        Returns empty list if no completed scored sessions exist (never fake random points).
        """
        if not is_valid_uuid(user_id):
            return []

        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT
                            TO_CHAR(fr.created_at, 'YYYY-MM-DD') AS date_str,
                            ROUND(AVG(fr.overall_score)::numeric, 1) AS avg_score
                        FROM feedback_reports fr
                        JOIN sessions s ON s.id = fr.session_id
                        WHERE s.user_id = $1::uuid
                          AND fr.overall_score > 0
                          AND fr.created_at >= NOW() - ($2 * INTERVAL '1 day')
                        GROUP BY date_str
                        ORDER BY date_str ASC
                        """,
                        user_id, days,
                    )
                    return [{"date": r["date_str"], "score": float(r["avg_score"])} for r in rows]
            except Exception as e:
                print(f"Analytics DB: get_user_score_trend error: {e}")

        return []

    async def get_funnel_metrics(self) -> dict:
        """
        Computes platform funnel conversion from real session progression: Created -> Started -> Completed -> Feedback.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT
                            COUNT(*)                                                               AS created,
                            COUNT(*) FILTER (WHERE status IN ('in_progress', 'completed', 'paused')) AS started,
                            COUNT(*) FILTER (WHERE status = 'completed')                           AS completed
                        FROM sessions
                    """)
                    feedback_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM feedback_reports WHERE overall_score IS NOT NULL"
                    ) or 0

                    created = row["created"] or 0
                    started = row["started"] or 0
                    completed = row["completed"] or 0

                    return {
                        "funnel": [
                            {
                                "stage": "Session Created",
                                "count": created,
                                "rate": 100.0 if created > 0 else 0.0,
                            },
                            {
                                "stage": "Session Started",
                                "count": started,
                                "rate": round(started / created * 100, 1) if created > 0 else 0.0,
                            },
                            {
                                "stage": "Session Completed",
                                "count": completed,
                                "rate": round(completed / started * 100, 1) if started > 0 else 0.0,
                            },
                            {
                                "stage": "Feedback Generated",
                                "count": feedback_count,
                                "rate": round(feedback_count / completed * 100, 1) if completed > 0 else 0.0,
                            },
                        ],
                    }
            except Exception as e:
                print(f"Analytics DB: get_funnel_metrics error: {e}")

        return {
            "funnel": [
                {"stage": "Session Created", "count": 0, "rate": 0.0},
                {"stage": "Session Started", "count": 0, "rate": 0.0},
                {"stage": "Session Completed", "count": 0, "rate": 0.0},
                {"stage": "Feedback Generated", "count": 0, "rate": 0.0},
            ]
        }

    async def get_retention_metrics(self) -> dict:
        """
        Computes real cohort retention (D1, D7, D30) from user interview return frequency.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    retention_row = await conn.fetchrow("""
                        WITH user_first_session AS (
                            SELECT user_id, MIN(created_at) AS first_session_at
                            FROM sessions
                            GROUP BY user_id
                        ),
                        retention_counts AS (
                            SELECT
                                COUNT(DISTINCT u.user_id) FILTER (WHERE u.first_session_at <= NOW() - INTERVAL '1 day') AS eligible_d1,
                                COUNT(DISTINCT s.user_id) FILTER (WHERE u.first_session_at <= NOW() - INTERVAL '1 day' AND s.created_at >= u.first_session_at + INTERVAL '1 day') AS retained_d1,
                                COUNT(DISTINCT u.user_id) FILTER (WHERE u.first_session_at <= NOW() - INTERVAL '7 days') AS eligible_d7,
                                COUNT(DISTINCT s.user_id) FILTER (WHERE u.first_session_at <= NOW() - INTERVAL '7 days' AND s.created_at >= u.first_session_at + INTERVAL '7 days') AS retained_d7,
                                COUNT(DISTINCT u.user_id) FILTER (WHERE u.first_session_at <= NOW() - INTERVAL '30 days') AS eligible_d30,
                                COUNT(DISTINCT s.user_id) FILTER (WHERE u.first_session_at <= NOW() - INTERVAL '30 days' AND s.created_at >= u.first_session_at + INTERVAL '30 days') AS retained_d30
                            FROM user_first_session u
                            LEFT JOIN sessions s ON s.user_id = u.user_id
                        )
                        SELECT * FROM retention_counts
                    """)
                    e_d1 = retention_row["eligible_d1"] or 0
                    r_d1 = retention_row["retained_d1"] or 0
                    e_d7 = retention_row["eligible_d7"] or 0
                    r_d7 = retention_row["retained_d7"] or 0
                    e_d30 = retention_row["eligible_d30"] or 0
                    r_d30 = retention_row["retained_d30"] or 0

                    d1_rate = round((r_d1 / e_d1) * 100, 1) if e_d1 > 0 else 0.0
                    d7_rate = round((r_d7 / e_d7) * 100, 1) if e_d7 > 0 else 0.0
                    d30_rate = round((r_d30 / e_d30) * 100, 1) if e_d30 > 0 else 0.0

                    return {
                        "d1_retention": d1_rate,
                        "d7_retention": d7_rate,
                        "d30_retention": d30_rate,
                        "eligible_d1_users": e_d1,
                        "retained_d1_users": r_d1,
                        "data_source": "database",
                    }
            except Exception as e:
                print(f"Analytics DB: get_retention_metrics error: {e}")

        return {
            "d1_retention": 0.0,
            "d7_retention": 0.0,
            "d30_retention": 0.0,
            "data_source": "none",
        }

    async def get_raw_sessions_for_export(self, days: int = 30, interview_type: Optional[str] = None) -> list:
        """
        Exports real session telemetry records for CSV export.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    query = """
                        SELECT
                            s.id AS session_id,
                            s.user_id,
                            s.interview_type,
                            s.difficulty,
                            s.status,
                            COALESCE(fr.overall_score, 0) AS score,
                            s.duration_minutes,
                            s.created_at
                        FROM sessions s
                        LEFT JOIN feedback_reports fr ON fr.session_id = s.id
                        WHERE s.created_at >= NOW() - ($1 * INTERVAL '1 day')
                    """
                    params: list = [days]
                    if interview_type:
                        query += " AND s.interview_type = $2"
                        params.append(interview_type)
                    query += " ORDER BY s.created_at DESC LIMIT 10000"

                    rows = await conn.fetch(query, *params)
                    return [dict(r) for r in rows]
            except Exception as e:
                print(f"Analytics DB: get_raw_sessions_for_export error: {e}")

        return []

    async def get_raw_events_for_export(self, days: int = 7, event_type: Optional[str] = None) -> list:
        """
        Streams raw clickstream event logs as a CSV file.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    if event_type:
                        rows = await conn.fetch(
                            "SELECT id, event_type, user_id, session_id, ip_address, created_at FROM analytics_events WHERE event_type = $1 AND created_at >= NOW() - $2 * INTERVAL '1 day' ORDER BY created_at DESC LIMIT 10000",
                            event_type, days,
                        )
                    else:
                        rows = await conn.fetch(
                            "SELECT id, event_type, user_id, session_id, ip_address, created_at FROM analytics_events WHERE created_at >= NOW() - $1 * INTERVAL '1 day' ORDER BY created_at DESC LIMIT 10000",
                            days,
                        )
                    return [dict(r) for r in rows]
            except Exception as e:
                print(f"Analytics DB: get_raw_events_for_export error: {e}")
        return []

    async def get_realtime_stats(self) -> dict:
        """
        Calculates trailing 60-second event throughput (events/min) and live active rooms.
        """
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    last_min = await conn.fetchval(
                        "SELECT COUNT(*) FROM analytics_events WHERE created_at >= NOW() - INTERVAL '1 minute'"
                    ) or 0
                    active = await conn.fetchval(
                        "SELECT COUNT(*) FROM sessions WHERE status IN ('in_progress', 'active')"
                    ) or 0
                    return {"events_per_minute": last_min, "active_sessions_estimate": active}
            except Exception as e:
                print(f"Analytics DB: get_realtime_stats error: {e}")

        return {"events_per_minute": 0, "active_sessions_estimate": 0}


# Global singleton database instance
db = AnalyticsDatabase()
