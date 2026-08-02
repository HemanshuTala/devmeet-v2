import asyncpg
from typing import Optional
import os


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

    async def get_user_by_id(self, user_id: str) -> Optional[dict]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, display_name, avatar_url, bio, target_companies, skills,
                       interview_reminder_enabled, profile_public, created_at, updated_at
                FROM user_profiles WHERE id = $1
                """,
                user_id
            )
            return dict(row) if row else None

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, display_name, avatar_url, bio, target_companies, skills,
                       interview_reminder_enabled, profile_public, created_at, updated_at
                FROM user_profiles WHERE email = $1
                """,
                email.lower()
            )
            return dict(row) if row else None

    async def update_user_profile(self, user_id: str, updates: dict) -> dict:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Build dynamic update query
                update_fields = []
                values = []
                param_count = 1
                
                for field, value in updates.items():
                    if value is not None:
                        update_fields.append(f"{field} = ${param_count}")
                        values.append(value)
                        param_count += 1
                
                if not update_fields:
                    # No fields to update
                    return await self.get_user_by_id(user_id)
                
                update_fields.append("updated_at = NOW()")
                values.append(user_id)
                
                query = f"""
                    UPDATE user_profiles
                    SET {', '.join(update_fields)}
                    WHERE id = ${param_count}
                    RETURNING id, email, display_name, avatar_url, bio, target_companies, skills,
                             interview_reminder_enabled, profile_public, created_at, updated_at
                """
                
                row = await conn.fetchrow(query, *values)
                return dict(row)

    async def get_user_quota(self, user_id: str) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT uq.interviews_today, uq.interviews_this_month, uq.last_reset_date,
                       up.plan, uq.created_at
                FROM usage_quotas uq
                JOIN user_plans up ON uq.user_id = up.user_id
                WHERE uq.user_id = $1
                """,
                user_id
            )
            return dict(row) if row else None

    async def get_plan_limits(self, plan: str) -> dict:
        """Get interview limits based on plan"""
        # SRS §2.1: Free = 3 interviews/month; Pro = unlimited
        limits = {
            "free": {"daily": 1, "monthly": 3},
            "pro": {"daily": -1, "monthly": -1},
            "enterprise": {"daily": -1, "monthly": -1},
        }
        return limits.get(plan, limits["free"])

    async def increment_quota(self, user_id: str) -> dict:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Check if quota needs reset
                await conn.execute("""
                    UPDATE usage_quotas
                    SET interviews_today = 0,
                        interviews_this_month = 0,
                        last_reset_date = CURRENT_DATE
                    WHERE user_id = $1 AND last_reset_date < CURRENT_DATE
                """, user_id)
                
                # Get current quota
                quota = await self.get_user_quota(user_id)
                if not quota:
                    raise Exception("User quota not found")
                
                # Get plan limits
                limits = await self.get_plan_limits(quota["plan"])
                
                # Check if limit reached
                if limits["daily"] > 0 and quota["interviews_today"] >= limits["daily"]:
                    raise Exception("Daily interview limit reached")
                
                if limits["monthly"] > 0 and quota["interviews_this_month"] >= limits["monthly"]:
                    raise Exception("Monthly interview limit reached")
                
                # Increment quota
                await conn.execute("""
                    UPDATE usage_quotas
                    SET interviews_today = interviews_today + 1,
                        interviews_this_month = interviews_this_month + 1,
                        updated_at = NOW()
                    WHERE user_id = $1
                """, user_id)
                
                return await self.get_user_quota(user_id)

    async def get_user_plan(self, user_id: str) -> dict:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT plan, created_at, updated_at FROM user_plans WHERE user_id = $1",
                user_id
            )
            return dict(row) if row else None

    async def update_user_plan(self, user_id: str, new_plan: str) -> dict:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    UPDATE user_plans
                    SET plan = $1, updated_at = NOW()
                    WHERE user_id = $2
                    RETURNING plan, created_at, updated_at
                    """,
                    new_plan, user_id
                )
                return dict(row)

    async def reset_quota(self, user_id: str) -> None:
        """Reset daily and monthly quota counters to 0 for the given user.
        Called on plan upgrades so the user immediately benefits from
        the higher limits without waiting for the next billing cycle.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE usage_quotas
                SET interviews_today = 0,
                    interviews_this_month = 0,
                    last_reset_date = CURRENT_DATE,
                    updated_at = NOW()
                WHERE user_id = $1
                """,
                user_id
            )

    # ─── USER-04: Soft Delete for GDPR Compliance ─────────────────────────────────

    async def soft_delete_user(self, user_id: str) -> dict:
        """
        USER-04: Soft delete user account for GDPR compliance.
        Anonymizes user data and sets deleted_at timestamp.
        Data is retained for 30 days before permanent deletion.
        """
        import uuid
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                async with conn.transaction():
                    # Anonymize user data
                    anonymized_email = f"deleted_{u_uuid.hex[:16]}@devmeet.local"
                    anonymized_name = "Deleted User"
                    
                    row = await conn.fetchrow(
                        """
                        UPDATE user_profiles
                        SET email = $1,
                            display_name = $2,
                            bio = NULL,
                            avatar_url = NULL,
                            target_companies = ARRAY[]::TEXT[],
                            skills = ARRAY[]::TEXT[],
                            profile_public = FALSE,
                            deleted_at = NOW(),
                            updated_at = NOW()
                        WHERE id = $3
                        RETURNING id, email, display_name, deleted_at
                        """,
                        anonymized_email, anonymized_name, u_uuid
                    )
                    
                    # Cancel active sessions
                    await conn.execute(
                        """
                        UPDATE sessions
                        SET status = 'expired',
                            completed_at = NOW(),
                            updated_at = NOW()
                        WHERE user_id = $1 AND status IN ('created', 'active', 'paused')
                        """,
                        u_uuid
                    )
                    
                    return dict(row) if row else None
        except Exception as e:
            print(f"DB: soft_delete_user error: {e}")
            raise

    async def get_leaderboard(self, limit: int = 25) -> list:
        """USER-06: Public profiles ranked by average feedback score."""
        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT
                        u.id::text AS user_id,
                        u.display_name,
                        u.avatar_url,
                        ROUND(AVG(fr.overall_score)::numeric, 1) AS avg_score,
                        COUNT(fr.id)::int AS sessions_count
                    FROM user_profiles u
                    JOIN sessions s ON s.user_id = u.id
                    JOIN feedback_reports fr ON fr.session_id = s.id
                    WHERE u.profile_public = TRUE
                      AND u.deleted_at IS NULL
                    GROUP BY u.id, u.display_name, u.avatar_url
                    HAVING COUNT(fr.id) >= 1
                    ORDER BY avg_score DESC, sessions_count DESC
                    LIMIT $1
                    """,
                    limit,
                )
                return [
                    {
                        "user_id": row["user_id"],
                        "display_name": row["display_name"],
                        "avatar_url": row["avatar_url"],
                        "avg_score": float(row["avg_score"]),
                        "sessions_count": row["sessions_count"],
                    }
                    for row in rows
                ]
        except Exception as e:
            print(f"DB: get_leaderboard error: {e}")
            return []


db = Database()
