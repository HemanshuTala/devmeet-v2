"""
Interview Orchestrator Database Access Layer.
=============================================
This module manages all PostgreSQL operations for interview session records,
conversation dialogue turns, code submissions, proctoring telemetry, heartbeat updates,
and S3 snapshot tracking.

Database Architecture:
----------------------
1. `sessions` table:
   - Primary state entity tracking user_id, difficulty, focus area, status,
     elapsed timer, proctoring violations, and timestamps (started_at, completed_at, paused_at).
2. `conversation_turns` table:
   - Chronological transcript of speech turns alternating between `interviewer` and `candidate`.
3. `code_submissions` table:
   - Versioned history of source code runs during the DSA coding phase.
4. Parameterized SQL:
   - Protects against SQL injection by using `$1, $2, ...` query placeholders exclusively.
"""

import asyncpg
from typing import Optional, List, Dict, Any
import os
from datetime import datetime, timezone


class Database:
    """
    PostgreSQL data access client for interview session orchestration.
    """
    def __init__(self):
        """Initializes unallocated connection pool."""
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """
        Creates an asynchronous connection pool to PostgreSQL via `asyncpg`.
        """
        self.pool = await asyncpg.create_pool(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            database=os.getenv("POSTGRES_DB", "devmeet"),
            user=os.getenv("POSTGRES_USER", "devmeet"),
            password=os.getenv("POSTGRES_PASSWORD", "devmeet_password"),
            min_size=int(os.getenv("DB_POOL_MIN", "2")),
            max_size=int(os.getenv("DB_POOL_MAX", "10")),
            command_timeout=float(os.getenv("DB_TIMEOUT", "30.0"))
        )

    async def disconnect(self):
        """Gracefully closes all open database connections in the pool."""
        if self.pool:
            await self.pool.close()

    # Reusable projection string for complete session record retrieval
    _SESSION_COLUMNS = """
        id, user_id, interview_type, difficulty, target_company,
        focus_area, duration_minutes, status, created_at, updated_at,
        started_at, completed_at, elapsed_seconds, tab_switch_count,
        paste_count, recording_consent
    """

    async def create_session(
        self,
        user_id: str,
        interview_type: str,
        difficulty: str,
        target_company: Optional[str],
        focus_area: Optional[str],
        duration_minutes: int,
        recording_consent: bool = False
    ) -> dict:
        """
        Inserts a new interview session record in `created` status.

        Parameters:
            user_id (str): Candidate UUID.
            interview_type (str): Domain (e.g. 'dsa', 'behavioral', 'system_design').
            difficulty (str): 'easy', 'medium', 'hard'.
            target_company (Optional[str]): Desired company style (e.g. 'Google').
            focus_area (Optional[str]): Technical topic (e.g. 'Dynamic Programming').
            duration_minutes (int): Scheduled session length.
            recording_consent (bool): Candidate audio/video consent flag.

        Returns:
            dict: The newly created session record.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                INSERT INTO sessions (
                    user_id, interview_type, difficulty, target_company,
                    focus_area, duration_minutes, status, recording_consent
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'created', $7)
                RETURNING {self._SESSION_COLUMNS}
                """,
                user_id, interview_type, difficulty, target_company,
                focus_area, duration_minutes, recording_consent
            )
            return dict(row)

    async def get_session(self, session_id: str) -> Optional[dict]:
        """
        Retrieves a session record by its primary key UUID.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                f"SELECT {self._SESSION_COLUMNS} FROM sessions WHERE id = $1",
                session_id
            )
            return dict(row) if row else None

    async def get_user_active_session(self, user_id: str) -> Optional[dict]:
        """
        Finds any unfinished session for a user in 'created', 'in_progress', or 'paused' state.
        
        Used to prevent candidate from creating multiple simultaneous concurrent interviews.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                SELECT {self._SESSION_COLUMNS}
                FROM sessions
                WHERE user_id = $1 AND status IN ('created', 'in_progress', 'paused')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                user_id,
            )
            return dict(row) if row else None

    async def get_user_sessions(self, user_id: str, limit: int = 20) -> List[dict]:
        """
        Retrieves recent interview sessions for a candidate ordered from newest to oldest.
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT {self._SESSION_COLUMNS}
                FROM sessions
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                user_id, limit
            )
            return [dict(row) for row in rows]

    async def update_session_status(self, session_id: str, status: str, elapsed_seconds: Optional[int] = None) -> dict:
        """
        Transitions session to a new state and manages lifecycle timestamps.

        Timestamp Management:
        - When transitioning to 'in_progress': sets `started_at = NOW()`.
        - When transitioning to 'completed': sets `completed_at = NOW()`.
        - Updates `elapsed_seconds` timer state if provided.
        """
        async with self.pool.acquire() as conn:
            update_fields = ["status = $2", "updated_at = NOW()"]
            params = [session_id, status]
            param_count = 3

            # Automatically set lifecycle boundary timestamps
            if status == "in_progress":
                update_fields.append("started_at = NOW()")
            elif status == "completed":
                update_fields.append("completed_at = NOW()")

            if elapsed_seconds is not None:
                update_fields.append(f"elapsed_seconds = ${param_count}")
                params.append(elapsed_seconds)
                param_count += 1

            query = f"""
                UPDATE sessions
                SET {', '.join(update_fields)}
                WHERE id = $1
                RETURNING {self._SESSION_COLUMNS}
            """
            row = await conn.fetchrow(query, *params)
            return dict(row)

    async def update_recording_consent(self, session_id: str, consent: bool) -> dict:
        """
        Updates candidate's recording consent flag.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE sessions
                SET recording_consent = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING {self._SESSION_COLUMNS}
                """,
                consent, session_id
            )
            return dict(row) if row else {}

    async def create_conversation_turn(
        self,
        session_id: str,
        role: str,
        content: str,
        turn_number: int
    ) -> dict:
        """
        Appends an AI question or candidate answer to the dialogue transcript.

        Parameters:
            session_id (str): Associated session UUID.
            role (str): 'interviewer' or 'candidate'.
            content (str): Text of the message/response.
            turn_number (int): Monotonically increasing sequence index.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO conversation_turns (session_id, role, content, turn_number)
                VALUES ($1, $2, $3, $4)
                RETURNING id, session_id, role, content, turn_number, created_at
                """,
                session_id, role, content, turn_number
            )
            return dict(row)

    async def get_conversation_turns(self, session_id: str) -> List[dict]:
        """
        Returns full interview conversation transcript in ascending chronological order.
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_id, role, content, turn_number, created_at
                FROM conversation_turns
                WHERE session_id = $1
                ORDER BY turn_number ASC
                """,
                session_id
            )
            return [dict(row) for row in rows]

    async def create_code_submission(
        self,
        session_id: str,
        language: str,
        code: str
    ) -> dict:
        """
        Records a snapshot of code submitted by candidate for testing.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO code_submissions (session_id, language, code)
                VALUES ($1, $2, $3)
                RETURNING id, session_id, language, code, created_at
                """,
                session_id, language, code
            )
            return dict(row)

    async def get_code_submissions(self, session_id: str) -> List[dict]:
        """
        Retrieves all code revisions executed during the session.
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_id, language, code, created_at
                FROM code_submissions
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session_id
            )
            return [dict(row) for row in rows]

    async def pause_session(self, session_id: str, elapsed_seconds: int = 0) -> dict:
        """
        Marks session as 'paused', sets `paused_at` timestamp, and freezes elapsed seconds.
        """
        now = datetime.now(timezone.utc)
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "UPDATE sessions SET status = 'paused', paused_at = $1, updated_at = $1, elapsed_seconds = $3 WHERE id = $2 RETURNING *",
                    now, session_id, elapsed_seconds
                )
                return dict(row) if row else {}
        except Exception as e:
            print(f"DB: pause_session error: {e}")
            return {"paused_at": now.isoformat(), "elapsed_seconds": elapsed_seconds}

    async def resume_session(self, session_id: str) -> dict:
        """
        Resumes a paused session back to 'in_progress' and clears `paused_at`.
        """
        now = datetime.now(timezone.utc)
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "UPDATE sessions SET status = 'in_progress', paused_at = NULL, updated_at = $1 WHERE id = $2 RETURNING *",
                    now, session_id
                )
                return dict(row) if row else {"updated_at": now.isoformat()}
        except Exception as e:
            print(f"DB: resume_session error: {e}")
            return {"updated_at": now.isoformat()}

    async def increment_cheating_count(self, session_id: str, cheating_type: str) -> dict:
        """
        Increments proctoring counters for either tab switching or clipboard paste events.

        Parameters:
            session_id (str): Target session UUID.
            cheating_type (str): 'tab_switch' or 'paste'.
        """
        async with self.pool.acquire() as conn:
            if cheating_type == "tab_switch":
                row = await conn.fetchrow(
                    "UPDATE sessions SET tab_switch_count = tab_switch_count + 1, updated_at = NOW() WHERE id = $1 RETURNING tab_switch_count, paste_count",
                    session_id
                )
            elif cheating_type == "paste":
                row = await conn.fetchrow(
                    "UPDATE sessions SET paste_count = paste_count + 1, updated_at = NOW() WHERE id = $1 RETURNING tab_switch_count, paste_count",
                    session_id
                )
            else:
                row = await conn.fetchrow(
                    "SELECT tab_switch_count, paste_count FROM sessions WHERE id = $1",
                    session_id
                )
            return dict(row) if row else {"tab_switch_count": 0, "paste_count": 0}

    async def record_heartbeat(self, session_id: str) -> None:
        """
        Updates `last_heartbeat_at` timestamp.
        
        Heartbeats are dispatched by the frontend every 15 seconds to monitor connection liveliness.
        """
        now = datetime.now(timezone.utc)
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE sessions SET last_heartbeat_at = $1 WHERE id = $2",
                    now, session_id
                )
        except Exception as e:
            print(f"DB: record_heartbeat error (non-critical): {e}")

    async def record_s3_snapshot(self, session_id: str, s3_key: str) -> None:
        """
        Records the S3 object storage key where the completed session backup snapshot is stored.
        """
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE sessions SET s3_snapshot_key = $1 WHERE id = $2",
                    s3_key, session_id
                )
        except Exception as e:
            print(f"DB: record_s3_snapshot error: {e}")

    async def get_s3_snapshot_key(self, session_id: str) -> Optional[str]:
        """
        Retrieves the S3 object key for a completed session backup snapshot.
        """
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT s3_snapshot_key FROM sessions WHERE id = $1",
                    session_id
                )
                return row["s3_snapshot_key"] if row else None
        except Exception as e:
            print(f"DB: get_s3_snapshot_key error: {e}")
            return None


# Global singleton instance of database client
db = Database()
