import os
import asyncpg
import json
from typing import Optional, Dict, Any

class FeedbackDatabase:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.use_db = False
        self.local_reports: Dict[str, dict] = {}

    async def connect(self):
        try:
            self.pool = await asyncpg.create_pool(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                database=os.getenv("POSTGRES_DB", "devmeet"),
                user=os.getenv("POSTGRES_USER", "devmeet"),
                password=os.getenv("POSTGRES_PASSWORD", "devmeet_password"),
                min_size=2,
                max_size=10,
                command_timeout=15
            )
            self.use_db = True
            print("Feedback DB: Connected to PostgreSQL successfully")
        except Exception as e:
            print(f"Feedback DB: Failed to connect to DB: {e}. Running in local memory cache.")
            self.use_db = False

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def save_report(
        self,
        session_id: str,
        overall_score: int,
        scores: dict,
        detailed_feedback: dict,
        pdf_url: Optional[str]
    ) -> bool:
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
                    # Upsert on session_id conflict
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

        # In-memory storage fallback
        self.local_reports[session_id] = {
            "session_id": session_id,
            "overall_score": overall_score,
            "scores": {
                "communication_score": comm_score,
                "problem_solving_score": prob_score,
                "code_quality_score": code_score,
                "time_complexity_score": time_score,
                "behavioral_score": beh_score
            },
            "detailed_feedback": detailed_feedback,
            "pdf_url": pdf_url
        }
        return True

    async def get_report_by_session(self, session_id: str) -> Optional[dict]:
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
                        s_uuid
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
                                "behavioral_score": row["behavioral_score"]
                            },
                            "detailed_feedback": json.loads(row["detailed_feedback"]) if isinstance(row["detailed_feedback"], str) else dict(row["detailed_feedback"] or {}),
                            "pdf_url": row["pdf_url"]
                        }
            except Exception as e:
                print(f"Feedback DB: Failed to fetch report from DB: {e}")

        # Local fallback search
        return self.local_reports.get(session_id)

    async def get_user_details_by_session(self, session_id: str) -> Optional[dict]:
        """Fetch user email and display name associated with a session ID."""
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
                        s_uuid
                    )
                    if row:
                        return dict(row)
            except Exception as e:
                print(f"Feedback DB: Failed to fetch user details for session {session_id}: {e}")
        return None

db = FeedbackDatabase()
