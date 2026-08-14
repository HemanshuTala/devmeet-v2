import asyncpg
from typing import Optional
import os
import uuid
import json


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

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, password_hash, display_name, avatar_url, bio, created_at,
                       email_verified, mfa_enabled, mfa_secret, mfa_backup_codes
                FROM user_profiles WHERE email = $1
                """,
                email.lower(),
            )
            return dict(row) if row else None

    async def get_user_by_id(self, user_id: str) -> Optional[dict]:
        try:
            u_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT id, email, password_hash, display_name, avatar_url, bio, created_at, mfa_secret, mfa_enabled, email_verified FROM user_profiles WHERE id = $1",
                    u_uuid
                )
                return dict(row) if row else None
        except Exception as e:
            print(f"Error in get_user_by_id: {e}")
            return None

    async def create_user(self, email: str, password_hash: str, display_name: str) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO user_profiles (email, password_hash, display_name, email_verified)
                VALUES ($1, $2, $3, false)
                RETURNING id, email, display_name, avatar_url, bio, created_at, email_verified
                """,
                email.lower(), password_hash, display_name,
            )
            return dict(row)

    async def create_user_plan(self, user_id: str):
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO user_plans (user_id, plan) VALUES ($1, 'free')",
                user_id
            )

    async def create_usage_quota(self, user_id: str):
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO usage_quotas (user_id, interviews_today, interviews_this_month, last_reset_date)
                VALUES ($1, 0, 0, CURRENT_DATE)
                """,
                user_id
            )

    async def update_password(self, user_id: str, new_password_hash: str):
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE user_profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2",
                new_password_hash, user_id
            )

    async def increment_failed_login_attempts(self, email: str):
        async with self.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO login_attempts (email, attempt_count, last_attempt_at)
                VALUES ($1, 1, NOW())
                ON CONFLICT (email)
                DO UPDATE SET
                    attempt_count = login_attempts.attempt_count + 1,
                    last_attempt_at = NOW()
            """, email.lower())

    async def get_failed_login_attempts(self, email: str) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT attempt_count, locked_until, last_attempt_at FROM login_attempts WHERE email = $1",
                email.lower()
            )
            return dict(row) if row else {"attempt_count": 0, "locked_until": None, "last_attempt_at": None}

    async def reset_failed_login_attempts(self, email: str):
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE login_attempts SET attempt_count = 0, locked_until = NULL WHERE email = $1",
                email.lower()
            )

    async def lock_account(self, email: str, lock_duration_minutes: int = 30):
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE login_attempts
                SET locked_until = NOW() + INTERVAL '1 minute' * $1
                WHERE email = $2
                """,
                lock_duration_minutes, email.lower()
            )

    async def is_account_locked(self, email: str) -> bool:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT locked_until FROM login_attempts WHERE email = $1",
                email.lower()
            )
            if not row or not row["locked_until"]:
                return False
            return row["locked_until"] > await conn.fetchval("SELECT NOW()")

    async def store_password_reset_token(self, user_id: str, token: str, expires_in_minutes: int = 30):
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO password_resets (user_id, token, expires_at)
                VALUES ($1, $2, NOW() + INTERVAL '1 minute' * $3)
                """,
                user_id, token, expires_in_minutes
            )

    async def get_password_reset_token(self, token: str) -> Optional[dict]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT pr.user_id, pr.expires_at, pr.used, u.email
                FROM password_resets pr
                JOIN user_profiles u ON pr.user_id = u.id
                WHERE pr.token = $1
                """,
                token
            )
            return dict(row) if row else None

    async def mark_password_reset_token_used(self, token: str):
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE password_resets SET used = TRUE WHERE token = $1",
                token
            )

    async def cleanup_expired_tokens(self):
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM password_resets WHERE expires_at < NOW() OR used = TRUE"
            )

    async def mark_email_verified(self, user_id: str) -> None:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE user_profiles SET email_verified = true WHERE id = $1",
                    u_uuid
                )
        except Exception as e:
            print(f"DB: mark_email_verified error: {e}")

    async def enable_mfa(self, user_id: str, totp_secret: str) -> None:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE user_profiles SET mfa_secret = $1, mfa_enabled = true WHERE id = $2",
                    totp_secret, u_uuid
                )
        except Exception as e:
            print(f"DB: enable_mfa error: {e}")

    async def disable_mfa(self, user_id: str) -> None:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE user_profiles SET mfa_secret = NULL, mfa_enabled = false WHERE id = $1",
                    u_uuid
                )
        except Exception as e:
            print(f"DB: disable_mfa error: {e}")

    async def store_backup_codes(self, user_id: str, hashed_codes: list) -> None:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "UPDATE user_profiles SET mfa_backup_codes = $1 WHERE id = $2",
                    json.dumps(hashed_codes), u_uuid
                )
        except Exception as e:
            print(f"DB: store_backup_codes error: {e}")

    async def consume_backup_code(self, user_id: str, hashed_code: str) -> bool:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT mfa_backup_codes FROM user_profiles WHERE id = $1",
                    u_uuid
                )
                if not row or not row["mfa_backup_codes"]:
                    return False
                codes = json.loads(row["mfa_backup_codes"]) if isinstance(row["mfa_backup_codes"], str) else list(row["mfa_backup_codes"])
                if hashed_code not in codes:
                    return False
                codes.remove(hashed_code)
                await conn.execute(
                    "UPDATE user_profiles SET mfa_backup_codes = $1 WHERE id = $2",
                    json.dumps(codes), u_uuid
                )
                return True
        except Exception as e:
            print(f"DB: consume_backup_code error: {e}")
            return False

    async def record_login_history(
        self,
        user_id: str,
        ip_address: str,
        location: dict,
        risk_score: int,
        risk_level: str,
        user_agent: str = None
    ) -> None:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO login_history (user_id, ip_address, location, risk_score, risk_level, user_agent)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    u_uuid, ip_address, json.dumps(location) if location else None, risk_score, risk_level, user_agent
                )
        except Exception as e:
            print(f"DB: record_login_history error: {e}")

    async def get_recent_login_history(self, user_id: str, limit: int = 10) -> list:
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT ip_address, location, risk_score, risk_level, login_time
                    FROM login_history
                    WHERE user_id = $1
                    ORDER BY login_time DESC
                    LIMIT $2
                    """,
                    u_uuid, limit
                )
                history = []
                for row in rows:
                    location = json.loads(row["location"]) if row["location"] else None
                    history.append({
                        "ip_address": row["ip_address"],
                        "location": location,
                        "risk_score": row["risk_score"],
                        "risk_level": row["risk_level"],
                        "login_time": row["login_time"]
                    })
                return history
        except Exception as e:
            print(f"DB: get_recent_login_history error: {e}")
            return []

    async def cleanup_old_login_history(self, days_to_keep: int = 90) -> None:
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM login_history WHERE login_time < NOW() - INTERVAL '1 day' * $1",
                    days_to_keep
                )
        except Exception as e:
            print(f"DB: cleanup_old_login_history error: {e}")


db = Database()
