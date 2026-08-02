import asyncpg
from typing import Optional, List
import os
from datetime import datetime, timezone


class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            database=os.getenv("POSTGRES_DB", "devmeet"),
            user=os.getenv("POSTGRES_USER", "devmeet"),
            password=os.getenv("POSTGRES_PASSWORD", "devmeet_password"),
            min_size=2,
            max_size=10,
            command_timeout=30
        )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

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
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                f"SELECT {self._SESSION_COLUMNS} FROM sessions WHERE id = $1",
                session_id
            )
            return dict(row) if row else None

    async def get_user_active_session(self, user_id: str) -> Optional[dict]:
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
        async with self.pool.acquire() as conn:
            update_fields = ["status = $2", "updated_at = NOW()"]
            params = [session_id, status]
            param_count = 3

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
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE sessions SET s3_snapshot_key = $1 WHERE id = $2",
                    s3_key, session_id
                )
        except Exception as e:
            print(f"DB: record_s3_snapshot error: {e}")

    async def get_s3_snapshot_key(self, session_id: str) -> Optional[str]:
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


db = Database()
