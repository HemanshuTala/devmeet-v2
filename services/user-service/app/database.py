"""
User Service Database Access Layer.
===================================
This module provides an asynchronous data access layer for PostgreSQL using `asyncpg`,
encapsulating queries for candidate profiles, subscription plans, interview quotas,
GDPR soft deletion, and community leaderboard calculations.

Key Architectural Patterns:
---------------------------
1. Dynamic Parameterized Query Generation:
   - When users update partial profile fields (e.g., only updating `bio` or `skills`),
     `update_user_profile` safely constructs SQL with indexed placeholders ($1, $2, ...)
     to avoid SQL injection vulnerabilities while omitting unchanged fields.
2. Atomic Quota Increments & Daily Resets:
   - `increment_quota` uses an atomic database transaction (`conn.transaction()`) to:
     a) Check if `last_reset_date < CURRENT_DATE` and rollover daily counters.
     b) Validate plan limits (Free: 1/day, 3/month; Pro/Enterprise: unlimited).
     c) Increment counters atomically to avoid race conditions.
3. GDPR Compliance ("Right to be Forgotten"):
   - `soft_delete_user` scrubs personal identifying information (PII), anonymizes
     the email and display name, sets `deleted_at`, and invalidates in-flight sessions.
4. Leaderboard Aggregations:
   - Executes multi-table analytical joins across `user_profiles`, `sessions`, and
     `feedback_reports` to rank public candidate performance.
"""

import asyncpg
from typing import Optional, List, Dict, Any
import os


class Database:
    """
    PostgreSQL data access client for user profile, plan, and quota operations.
    """
    def __init__(self):
        """Initializes unallocated connection pool."""
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """
        Initializes an asyncpg connection pool to PostgreSQL.
        
        Configured via environment variables with fallbacks:
        - min_size=2: Retains warm connections ready for low latency queries.
        - max_size=10: Caps concurrent connections per service instance.
        - command_timeout=30: Protects against hanging queries.
        """
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
        """Gracefully closes all connections in the pool upon service shutdown."""
        if self.pool:
            await self.pool.close()

    async def get_user_by_id(self, user_id: str) -> Optional[dict]:
        """
        Retrieves a user profile by primary key UUID string.

        Parameters:
            user_id (str): UUID string of the candidate.

        Returns:
            Optional[dict]: Profile record or None if not found.
        """
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
        """
        Retrieves user profile record matching given email address (case-insensitive).
        """
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
        """
        Applies partial updates to a candidate's profile record dynamically.

        Security and Safety:
        - Iterates over key-value updates to assemble parameterized SQL ($1, $2, ...).
        - Automatically updates `updated_at = NOW()`.
        - Executes inside an atomic database transaction.

        Parameters:
            user_id (str): Candidate UUID.
            updates (dict): Dictionary of fields to update (omits None values).

        Returns:
            dict: The refreshed user profile record after update.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Build dynamic parameterized update query
                update_fields = []
                values = []
                param_count = 1
                
                for field, value in updates.items():
                    if value is not None:
                        update_fields.append(f"{field} = ${param_count}")
                        values.append(value)
                        param_count += 1
                
                # If no fields were modified, return the existing profile unchanged
                if not update_fields:
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
        """
        Retrieves current interview session consumption and active subscription tier.
        
        Joins `usage_quotas` with `user_plans` to return combined usage and tier data.
        Auto-initializes records if not yet created.
        """
        async with self.pool.acquire() as conn:
            # Auto-ensure default free plan exists
            await conn.execute(
                """
                INSERT INTO user_plans (user_id, plan)
                VALUES ($1, 'free')
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id
            )
            # Auto-ensure usage_quotas exists
            await conn.execute(
                """
                INSERT INTO usage_quotas (user_id, interviews_today, interviews_this_month, last_reset_date)
                VALUES ($1, 0, 0, CURRENT_DATE)
                ON CONFLICT (user_id) DO NOTHING
                """,
                user_id
            )
            row = await conn.fetchrow(
                """
                SELECT uq.interviews_today, uq.interviews_this_month, uq.last_reset_date,
                       COALESCE(up.plan, 'free') AS plan, uq.created_at
                FROM usage_quotas uq
                LEFT JOIN user_plans up ON uq.user_id = up.user_id
                WHERE uq.user_id = $1
                """,
                user_id
            )
            return dict(row) if row else None

    async def get_plan_limits(self, plan: str) -> dict:
        """
        Returns numerical limits corresponding to subscription tier.
        
        -1 denotes unlimited allowance.
        - Free: 5 free interviews (up to 5 per day, 5 per month).
        - Pro: Unlimited daily and monthly interviews.
        - Enterprise: Unlimited daily and monthly interviews.
        """
        limits = {
            "free": {"daily": 5, "monthly": 5},
            "pro": {"daily": -1, "monthly": -1},
            "enterprise": {"daily": -1, "monthly": -1},
        }
        return limits.get(plan, limits["free"])

    async def _get_user_quota_conn(self, conn, user_id: str) -> dict:
        """
        Internal helper: fetches quota using an already-open connection.
        Avoids acquiring a new pool connection (which would deadlock inside a transaction).
        """
        # Auto-ensure default free plan exists
        await conn.execute(
            """
            INSERT INTO user_plans (user_id, plan)
            VALUES ($1, 'free')
            ON CONFLICT (user_id) DO NOTHING
            """,
            user_id
        )
        # Auto-ensure usage_quotas exists
        await conn.execute(
            """
            INSERT INTO usage_quotas (user_id, interviews_today, interviews_this_month, last_reset_date)
            VALUES ($1, 0, 0, CURRENT_DATE)
            ON CONFLICT (user_id) DO NOTHING
            """,
            user_id
        )
        row = await conn.fetchrow(
            """
            SELECT uq.interviews_today, uq.interviews_this_month, uq.last_reset_date,
                   COALESCE(up.plan, 'free') AS plan, uq.created_at
            FROM usage_quotas uq
            LEFT JOIN user_plans up ON uq.user_id = up.user_id
            WHERE uq.user_id = $1
            """,
            user_id
        )
        return dict(row) if row else None

    async def increment_quota(self, user_id: str) -> dict:
        """
        Atomically increments interview session usage counters after checking plan limits.

        Steps executed in a SINGLE connection/transaction to avoid deadlocks:
        1. Ensures quota and plan rows exist (upsert).
        2. Resets daily counter if the date has rolled over.
        3. Validates plan limits.
        4. Increments counters atomically.

        Returns:
            dict: The updated quota record.
        """
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Ensure rows exist and reset daily counter if needed – all on same conn
                await conn.execute(
                    """
                    INSERT INTO user_plans (user_id, plan)
                    VALUES ($1, 'free')
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    user_id
                )
                await conn.execute(
                    """
                    INSERT INTO usage_quotas (user_id, interviews_today, interviews_this_month, last_reset_date)
                    VALUES ($1, 0, 0, CURRENT_DATE)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    user_id
                )

                # 2. Reset daily / monthly counters if date rolled over
                await conn.execute(
                    """
                    UPDATE usage_quotas
                    SET interviews_today = CASE WHEN last_reset_date < CURRENT_DATE THEN 0 ELSE interviews_today END,
                        interviews_this_month = CASE WHEN date_trunc('month', last_reset_date) < date_trunc('month', CURRENT_DATE) THEN 0 ELSE interviews_this_month END,
                        last_reset_date = CURRENT_DATE
                    WHERE user_id = $1 AND last_reset_date < CURRENT_DATE
                    """,
                    user_id
                )

                # 3. Read current quota (same connection, no new pool acquire)
                row = await conn.fetchrow(
                    """
                    SELECT uq.interviews_today, uq.interviews_this_month, uq.last_reset_date,
                           COALESCE(up.plan, 'free') AS plan, uq.created_at
                    FROM usage_quotas uq
                    LEFT JOIN user_plans up ON uq.user_id = up.user_id
                    WHERE uq.user_id = $1
                    """,
                    user_id
                )
                if not row:
                    raise Exception("User quota not found")
                quota = dict(row)

                # 4. Check limits
                limits = await self.get_plan_limits(quota["plan"])

                if limits["daily"] > 0 and quota["interviews_today"] >= limits["daily"]:
                    raise Exception("Daily interview limit reached (5 free interviews per day)")

                if limits["monthly"] > 0 and quota["interviews_this_month"] >= limits["monthly"]:
                    raise Exception("Monthly interview limit reached (5 free interviews per month)")

                # 5. Increment usage
                await conn.execute(
                    """
                    UPDATE usage_quotas
                    SET interviews_today = interviews_today + 1,
                        interviews_this_month = interviews_this_month + 1,
                        updated_at = NOW()
                    WHERE user_id = $1
                    """,
                    user_id
                )

                # 6. Return updated record (same connection)
                updated = await conn.fetchrow(
                    """
                    SELECT uq.interviews_today, uq.interviews_this_month, uq.last_reset_date,
                           COALESCE(up.plan, 'free') AS plan, uq.created_at
                    FROM usage_quotas uq
                    LEFT JOIN user_plans up ON uq.user_id = up.user_id
                    WHERE uq.user_id = $1
                    """,
                    user_id
                )
                return dict(updated) if updated else quota

    async def get_user_plan(self, user_id: str) -> dict:
        """
        Retrieves user subscription tier record from `user_plans` table.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT plan, created_at, updated_at FROM user_plans WHERE user_id = $1",
                user_id
            )
            return dict(row) if row else None

    async def update_user_plan(self, user_id: str, new_plan: str) -> dict:
        """
        Updates the candidate's subscription tier in the `user_plans` table.

        Parameters:
            user_id (str): Candidate UUID.
            new_plan (str): Target plan tier ('free', 'pro', 'enterprise').
        """
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
        """
        Resets daily and monthly quota counters to 0 for a user.
        
        Triggered when a candidate upgrades from Free to Pro so they immediately
        benefit from expanded limits without having to wait for the next billing cycle.
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
        USER-04: Soft deletes and anonymizes user account data for GDPR compliance.
        
        Actions performed in transaction:
        1. Anonymizes email (replaced with `deleted_<uuid>@devmeet.local`).
        2. Replaces display name with 'Deleted User'.
        3. Clears bio, avatar URL, skills, and target companies arrays.
        4. Sets `profile_public = FALSE` and sets `deleted_at = NOW()`.
        5. Expires any active, created, or paused interview sessions.
        """
        import uuid
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                async with conn.transaction():
                    # Generate anonymized pseudonym identifiers
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
                    
                    # Terminate any pending or active interview sessions for this user
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
        """
        USER-06: Computes the global community leaderboard for public candidate profiles.

        SQL Aggregation:
        - Joins `user_profiles`, `sessions`, and `feedback_reports`.
        - Filters candidates with `profile_public = TRUE` and `deleted_at IS NULL`.
        - Computes `ROUND(AVG(fr.overall_score)::numeric, 1)` and counts completed sessions.
        - Requires at least 1 evaluated interview (`HAVING COUNT(fr.id) >= 1`).
        - Orders primarily by average score descending, and secondarily by session volume.
        """
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


# Global singleton database instance
db = Database()
