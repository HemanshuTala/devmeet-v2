"""
================================================================================
FEEDBACK SERVICE — POSTGRESQL DATA ACCESS LAYER & PERSISTENCE
================================================================================
Role & Responsibility:
  This module manages database interactions for post-interview evaluation reports.
  It encapsulates:
    1. Connection Pooling: Initializes an asynchronous connection pool via `asyncpg`
       with bounded capacity (min 2, max 10 connections) and 15-second command timeouts.
    2. Idempotent Upsert Logic: Writes feedback reports using PostgreSQL's
       `ON CONFLICT (session_id) DO UPDATE SET ...`, allowing evaluators to re-run
       scoring passes without creating duplicate rows.
    3. In-Memory Fallback Cache: If PostgreSQL is temporarily offline during testing
       or local development, stores reports in a process-level memory dictionary
       (`self.local_reports`) so evaluation flows do not crash.
    4. Cross-Service User Joins: Joins `sessions` with `user_profiles` to fetch candidate
       display names and email addresses for personalized report headers and email dispatches.
================================================================================
"""

import os
import asyncpg
import json
from typing import Optional, Dict, Any


class FeedbackDatabase:
    """
    Data access class managing persistence and retrieval of feedback evaluations.

    Attributes:
      pool (Optional[asyncpg.Pool]): Active PostgreSQL connection pool.
      use_db (bool): True if connection to PostgreSQL succeeded; False if falling back to memory.
      local_reports (Dict[str, dict]): Ephemeral in-memory fallback dictionary.
    """

    def __init__(self):
        """Initializes database state and local in-memory fallback structure."""
        self.pool: Optional[asyncpg.Pool] = None
        self.use_db = False
        self.local_reports: Dict[str, dict] = {}

    async def connect(self):
        """
        Creates an asynchronous PostgreSQL connection pool using environment variables.

        Configuration:
          - Host / Port: Defaults to localhost:5432.
          - Pool Size: Min 2, Max 10 concurrent connections.
          - Command Timeout: 15s prevents hung transactions from blocking worker threads.
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
                command_timeout=float(os.getenv("DB_TIMEOUT", "15.0"))
            )
            self.use_db = True
            print("Feedback DB: Connected to PostgreSQL successfully")
        except Exception as e:
            print(f"Feedback DB: Failed to connect to DB: {e}. Running in local memory cache.")
            self.use_db = False

    async def disconnect(self):
        """
        Gracefully terminates the connection pool during application shutdown.
        """
        if self.pool:
            await self.pool.close()

    async def save_report(
        self,
        session_id: str,
        overall_score: int,
        scores: dict,
        detailed_feedback: dict,
        pdf_url: Optional[str],
    ) -> bool:
        """
        Persists or updates an evaluation report for an interview session.

        Parameters:
          session_id (str): UUID string of the completed session.
          overall_score (int): Weighted composite score (0-100).
          scores (dict): Dictionary of dimension scores (communication, problem solving, code quality).
          detailed_feedback (dict): Qualitative feedback payload (strengths, weaknesses, suggestions).
          pdf_url (Optional[str]): Download URL for generated PDF artifact.

        Returns:
          bool: True if save succeeded.

        Database Query (Idempotent Upsert):
          Uses `INSERT INTO feedback_reports (...) ON CONFLICT (session_id) DO UPDATE ...`
          to update existing records if feedback generation is re-triggered.
        """
        import uuid
        s_uuid = uuid.UUID(session_id)
        comm_score = scores.get("communication_score")
        prob_score = scores.get("problem_solving_score")
        code_score = scores.get("code_quality_score")
        time_score = scores.get("time_complexity_score")
        beh_score = scores.get("behavioral_score")
        detailed_json = json.dumps(detailed_feedback)

        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO feedback_reports (
                            session_id, overall_score, communication_score, problem_solving_score, 
                            code_quality_score, time_complexity_score, behavioral_score, detailed_feedback, pdf_url
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (session_id) DO UPDATE SET
                            overall_score = EXCLUDED.overall_score,
                            communication_score = EXCLUDED.communication_score,
                            problem_solving_score = EXCLUDED.problem_solving_score,
                            code_quality_score = EXCLUDED.code_quality_score,
                            time_complexity_score = EXCLUDED.time_complexity_score,
                            behavioral_score = EXCLUDED.behavioral_score,
                            detailed_feedback = EXCLUDED.detailed_feedback,
                            pdf_url = EXCLUDED.pdf_url,
                            updated_at = NOW()
                        """,
                        s_uuid, overall_score, comm_score, prob_score, code_score, time_score, beh_score, detailed_json, pdf_url
                    )
                return True
            except Exception as e:
                print(f"Feedback DB: Failed to save report to DB: {e}. Backing up in memory.")

        # In-memory storage fallback if PostgreSQL write fails
        self.local_reports[session_id] = {
            "session_id": session_id,
            "overall_score": overall_score,
            "scores": {
                "communication_score": comm_score,
                "problem_solving_score": prob_score,
                "code_quality_score": code_score,
                "time_complexity_score": time_score,
                "behavioral_score": beh_score,
            },
            "detailed_feedback": detailed_feedback,
            "pdf_url": pdf_url,
        }
        return True

    async def get_report_by_session(self, session_id: str) -> Optional[dict]:
        """
        Retrieves a stored evaluation report by its session UUID.

        Parameters:
          session_id (str): Target interview session identifier.

        Returns:
          Optional[dict]: Full feedback record if found, or None.
        """
        if self.use_db and self.pool:
            try:
                import uuid
                s_uuid = uuid.UUID(session_id)
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow(
                        """
                        SELECT session_id, overall_score, communication_score, problem_solving_score,
                               code_quality_score, time_complexity_score, behavioral_score, detailed_feedback, pdf_url
                        FROM feedback_reports
                        WHERE session_id = $1
                        """,
                        s_uuid,
                    )
                    if row:
                        return {
                            "session_id": str(row["session_id"]),
                            "overall_score": row["overall_score"],
                            "scores": {
                                "communication_score": row["communication_score"],
                                "problem_solving_score": row["problem_solving_score"],
                                "code_quality_score": row["code_quality_score"],
                                "time_complexity_score": row["time_complexity_score"],
                                "behavioral_score": row["behavioral_score"],
                            },
                            "detailed_feedback": json.loads(row["detailed_feedback"]) if isinstance(row["detailed_feedback"], str) else dict(row["detailed_feedback"] or {}),
                            "pdf_url": row["pdf_url"],
                        }
            except Exception as e:
                print(f"Feedback DB: Failed to fetch report from DB: {e}")

        # In-memory dictionary fallback lookup
        return self.local_reports.get(session_id)

    async def get_user_details_by_session(self, session_id: str) -> Optional[dict]:
        """
        Retrieves user account details (email, display name) associated with an interview session.

        Parameters:
          session_id (str): Interview session UUID.

        Returns:
          Optional[dict]: Dictionary with 'user_id', 'email', and 'display_name' or None.
        """
        if self.use_db and self.pool:
            try:
                import uuid
                s_uuid = uuid.UUID(session_id)
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow(
                        """
                        SELECT u.id as user_id, u.email, u.display_name
                        FROM sessions s
                        JOIN user_profiles u ON s.user_id = u.id
                        WHERE s.id = $1
                        """,
                        s_uuid,
                    )
                    if row:
                        return dict(row)
            except Exception as e:
                print(f"Feedback DB: Failed to fetch user details for session {session_id}: {e}")
        return None


# Global singleton instance
db = FeedbackDatabase()
