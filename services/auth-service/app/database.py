"""
Database Access Layer for Auth Service.
=======================================
This module manages all PostgreSQL operations for authentication, user credentials,
brute-force defense tracking, password reset tokens, MFA settings, and login audit logs.

Key Responsibilities:
---------------------
1. Connection Pooling: Uses `asyncpg` to maintain an efficient, non-blocking pool
   of database connections configured with min/max bounds and command timeouts.
2. SQL Injection Prevention: Exclusively uses parameterized queries ($1, $2, etc.)
   rather than string interpolation or raw SQL formatting.
3. Security-Critical State: Stores password hashes (never plain text), TOTP secrets,
   hashed MFA backup recovery codes, and brute-force attempt counters with lockouts.
"""

import asyncpg
from typing import Optional, Dict, Any, List
import os
import uuid
import json


class Database:
    """
    Asynchronous PostgreSQL database client for authentication operations.
    
    Encapsulates connection pool management and query execution using `asyncpg`,
    providing low-latency, binary-protocol communication with PostgreSQL.
    """
    def __init__(self):
        """Initializes the database client with an unallocated pool."""
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """
        Creates an asynchronous connection pool to the PostgreSQL instance.
        
        Configuration parameters are read from environment variables with sensible defaults:
        - min_size=2: Keeps 2 warm connections alive to eliminate handshake latency.
        - max_size=10: Prevents connection exhaustion on the shared database cluster.
        - command_timeout=30: Automatically aborts runaway queries exceeding 30 seconds.
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
        """
        Gracefully closes all connections in the pool during application shutdown.
        
        Ensures existing in-flight queries complete or abort cleanly before the process exits.
        """
        if self.pool:
            await self.pool.close()

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        """
        Retrieves user authentication credentials and profile metadata by email address.

        Parameters:
            email (str): The login email address (case-insensitive lookup via lower()).

        Returns:
            Optional[dict]: A dictionary containing user ID, password hash, MFA secrets,
            and verification status, or None if no record matches.
        """
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
        """
        Retrieves user profile and authentication metadata by primary key UUID.

        Parameters:
            user_id (str): UUID string representing the user record.

        Returns:
            Optional[dict]: User profile dictionary or None if user does not exist or UUID is invalid.
        """
        try:
            # Cast string to UUID object to ensure compatibility with PostgreSQL UUID column type
            u_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT id, email, password_hash, display_name, avatar_url, bio,
                           created_at, mfa_secret, mfa_enabled, email_verified
                    FROM user_profiles WHERE id = $1
                    """,
                    u_uuid
                )
                return dict(row) if row else None
        except Exception as e:
            print(f"Error in get_user_by_id: {e}")
            return None

    async def create_user(self, email: str, password_hash: str, display_name: str) -> dict:
        """
        Inserts a new user record into the `user_profiles` table upon signup.

        Parameters:
            email (str): Validated user email (stored in lower-case).
            password_hash (str): Securely salted Bcrypt hash of user's chosen password.
            display_name (str): Sanitized public display name.

        Returns:
            dict: The newly created user record including the auto-generated UUID primary key.
        """
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
        """
        Initializes the default subscription plan for a newly registered user.

        Parameters:
            user_id (str): UUID of the newly registered user.
            Default tier is set to 'free'.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO user_plans (user_id, plan) VALUES ($1, 'free')",
                user_id
            )

    async def create_usage_quota(self, user_id: str):
        """
        Initializes daily and monthly usage counters for interview sessions.

        Parameters:
            user_id (str): UUID of the user. Sets counters to 0 with today's reset date.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO usage_quotas (user_id, interviews_today, interviews_this_month, last_reset_date)
                VALUES ($1, 0, 0, CURRENT_DATE)
                """,
                user_id
            )

    async def update_password(self, user_id: str, new_password_hash: str):
        """
        Updates the user's password hash and marks the update timestamp.

        Parameters:
            user_id (str): User UUID.
            new_password_hash (str): Newly generated Bcrypt password hash.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE user_profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2",
                new_password_hash, user_id
            )

    async def increment_failed_login_attempts(self, email: str):
        """
        Increments the failed authentication counter for an email address.
        
        Uses PostgreSQL UPSERT (`ON CONFLICT (email) DO UPDATE`) to insert an initial
        record on first failure or increment existing attempt count atomically.
        """
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
        """
        Retrieves the current failed attempt tally and temporary lock timestamp for an account.

        Parameters:
            email (str): The email address to inspect.

        Returns:
            dict: Contains attempt_count, locked_until timestamp, and last_attempt_at.
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT attempt_count, locked_until, last_attempt_at FROM login_attempts WHERE email = $1",
                email.lower()
            )
            return dict(row) if row else {"attempt_count": 0, "locked_until": None, "last_attempt_at": None}

    async def reset_failed_login_attempts(self, email: str):
        """
        Resets the failed login counter to 0 and lifts lockouts upon successful authentication.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE login_attempts SET attempt_count = 0, locked_until = NULL WHERE email = $1",
                email.lower()
            )

    async def lock_account(self, email: str, lock_duration_minutes: int = 30):
        """
        Imposes a temporary security lock on an account after excessive failed password attempts.

        Parameters:
            email (str): Target email address.
            lock_duration_minutes (int): Minutes until the lock automatically expires (default: 30 min).
        """
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
        """
        Checks whether an account is currently blocked by an active security lockout.

        Returns:
            bool: True if `locked_until` exists and is greater than PostgreSQL server NOW().
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT locked_until FROM login_attempts WHERE email = $1",
                email.lower()
            )
            if not row or not row["locked_until"]:
                return False
            # Check against current database clock to avoid local system clock drift
            return row["locked_until"] > await conn.fetchval("SELECT NOW()")

    async def store_password_reset_token(self, user_id: str, token: str, expires_in_minutes: int = 30):
        """
        Persists a cryptographically secure password reset token with an expiration timestamp.

        Parameters:
            user_id (str): User UUID requesting the password reset.
            token (str): Random hex or URL-safe token.
            expires_in_minutes (int): Token lifetime (default 30 minutes).
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO password_resets (user_id, token, expires_at)
                VALUES ($1, $2, NOW() + INTERVAL '1 minute' * $3)
                """,
                user_id, token, expires_in_minutes
            )

    async def get_password_reset_token(self, token: str) -> Optional[dict]:
        """
        Finds a password reset record and the associated user email by token value.

        Returns:
            Optional[dict]: Reset record with user_id, expires_at, used flag, and email.
        """
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
        """
        Flags a password reset token as consumed, preventing replay attacks.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE password_resets SET used = TRUE WHERE token = $1",
                token
            )

    async def cleanup_expired_tokens(self):
        """
        Purges expired or already-used password reset tokens to conserve table storage.
        """
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM password_resets WHERE expires_at < NOW() OR used = TRUE"
            )

    async def mark_email_verified(self, user_id: str) -> None:
        """
        Sets the `email_verified` boolean to true for a confirmed user account.
        """
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
        """
        Activates Multi-Factor Authentication (TOTP) and records the base32 shared secret.

        Parameters:
            user_id (str): User UUID.
            totp_secret (str): Base32 secret key shared with the authenticator app.
        """
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
        """
        Deactivates Multi-Factor Authentication and clears the TOTP secret key.
        """
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
        """
        Saves a JSON-encoded array of SHA-256 hashed one-time MFA backup recovery codes.

        Parameters:
            user_id (str): User UUID.
            hashed_codes (list): List of hashed recovery code strings.
        """
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
        """
        Verifies and single-use consumes an MFA backup recovery code.

        If the submitted hashed code is present in the user's stored list:
        1. It is removed from the array to prevent reuse.
        2. The updated array is persisted back to PostgreSQL.
        3. Returns True.
        Otherwise returns False.
        """
        try:
            u_uuid = uuid.UUID(user_id)
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT mfa_backup_codes FROM user_profiles WHERE id = $1",
                    u_uuid
                )
                if not row or not row["mfa_backup_codes"]:
                    return False
                
                # Parse JSON array of codes
                codes = json.loads(row["mfa_backup_codes"]) if isinstance(row["mfa_backup_codes"], str) else list(row["mfa_backup_codes"])
                if hashed_code not in codes:
                    return False
                
                # Single-use consumption: remove the used code
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
        """
        Appends an entry to the login audit log for security telemetry and impossible travel detection.

        Parameters:
            user_id (str): User UUID.
            ip_address (str): Remote client IP address.
            location (dict): Geolocation dictionary resolved from GeoIP database.
            risk_score (int): Calculated anomaly score (0-100).
            risk_level (str): 'low', 'medium', or 'high'.
            user_agent (str): Browser User-Agent header string.
        """
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
        """
        Retrieves the most recent N login history entries for a given user.

        Used by `GeoIPService` to perform impossible travel analysis against previous coordinates.
        """
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
        """
        Purges login history rows older than the specified retention window (default 90 days)
        to manage table storage size and adhere to data privacy retention standards.
        """
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM login_history WHERE login_time < NOW() - INTERVAL '1 day' * $1",
                    days_to_keep
                )
        except Exception as e:
            print(f"DB: cleanup_old_login_history error: {e}")


# Singleton instance of the Database access layer
db = Database()
