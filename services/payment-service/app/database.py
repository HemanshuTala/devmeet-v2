"""
DevMeet Payment Service - Database Persistence Layer
====================================================
This module provides asynchronous data persistence for candidate subscription plans,
external payment gateway references (Razorpay/Stripe IDs), and immutable billing event history.

Key Architectural Responsibilities:
1. Resilient Connection Management:
   - Uses `asyncpg` to interface directly with PostgreSQL via high-efficiency binary protocol.
   - Automatically degrades to an in-memory dictionary cache if PostgreSQL is unreachable,
     allowing local testing, demo sandboxes, and offline CI pipelines.
2. Idempotent Subscription Lifecycle Management:
   - Tracks active, cancelled, or past-due subscriptions per user.
   - Employs `ON CONFLICT (user_id) DO UPDATE` to guarantee exactly-once plan updates.
   - Updates plan state down to 'free' upon subscription cancellation.
3. Billing Audit Trail & Ledger:
   - Logs webhook and checkout billing events (invoice payments, charges, failures)
     with gateway transaction identifiers (`provider_event_id`).
   - Provides paginated, reverse-chronological transaction statements for candidate billing history.
"""

import asyncpg
import os
import uuid
from datetime import datetime
from typing import Optional, List


class PaymentDatabase:
    """
    Manages persistence of subscription entitlements and financial audit records.
    Supports asynchronous PostgreSQL connection pooling with seamless in-memory fallback.
    """

    def __init__(self):
        """
        Initializes database connection handles and in-memory fallback data structures.
        """
        # asyncpg connection pool instance
        self.pool: Optional[asyncpg.Pool] = None
        # Flag indicating whether database operations run in mock mode
        self._use_memory = False

        # In-memory fallback dictionaries when PostgreSQL is disconnected
        self._subscriptions: dict = {}
        self._billing_events: list = []

    async def connect(self):
        """
        Establishes the asyncpg connection pool using environment credentials.
        Falls back to in-memory mode if connection fails or times out.
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
                command_timeout=float(os.getenv("DB_TIMEOUT", "30.0")),
            )
            print("[payment-db] Connected to PostgreSQL")
        except Exception as e:
            # Fall back to in-memory mode so the payment microservice can still boot
            print(f"[payment-db] PostgreSQL unavailable ({e}), using in-memory fallback")
            self._use_memory = True

    async def disconnect(self):
        """
        Closes all active pooled connections during application shutdown.
        """
        if self.pool:
            await self.pool.close()

    # ─── Subscriptions ──────────────────────────────────────────────────────────

    async def get_subscription(self, user_id: str) -> Optional[dict]:
        """
        Fetches the active subscription details and plan tier for a user.

        Args:
            user_id (str): Candidate or user identifier string.

        Returns:
            Optional[dict]: Subscription row dictionary if found, else None.
        """
        if self._use_memory:
            return self._subscriptions.get(user_id)

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM subscriptions WHERE user_id = $1", user_id
            )
            return dict(row) if row else None

    async def upsert_subscription(
        self,
        user_id: str,
        plan: str,
        status: str = "active",
        provider_customer_id: Optional[str] = None,
        provider_subscription_id: Optional[str] = None,
    ) -> dict:
        """
        Creates or updates a user's subscription record atomically.
        Uses PostgreSQL `ON CONFLICT (user_id)` to ensure single active record per user.

        Args:
            user_id (str): Target user identifier.
            plan (str): Subscription tier ('free', 'pro', 'enterprise').
            status (str): Subscription state (e.g., 'active', 'past_due', 'cancelled').
            provider_customer_id (str, optional): Razorpay customer ID ('cust_...').
            provider_subscription_id (str, optional): Gateway subscription/order ID ('sub_...' or 'order_...').

        Returns:
            dict: Updated subscription record.
        """
        if self._use_memory:
            existing = self._subscriptions.get(user_id)
            now = datetime.utcnow()
            record = {
                "id": existing["id"] if existing else str(uuid.uuid4()),
                "user_id": user_id,
                "plan": plan,
                "status": status,
                "provider_customer_id": provider_customer_id or (existing or {}).get("provider_customer_id"),
                "provider_subscription_id": provider_subscription_id or (existing or {}).get("provider_subscription_id"),
                "created_at": existing["created_at"] if existing else now,
                "updated_at": now,
            }
            self._subscriptions[user_id] = record
            return record

        async with self.pool.acquire() as conn:
            # Atomic UPSERT preserving original provider identifiers via COALESCE
            row = await conn.fetchrow("""
                INSERT INTO subscriptions (user_id, plan, status, provider_customer_id, provider_subscription_id)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id) DO UPDATE
                SET plan = EXCLUDED.plan,
                    status = EXCLUDED.status,
                    provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscriptions.provider_customer_id),
                    provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
                    updated_at = NOW()
                RETURNING *
            """, user_id, plan, status, provider_customer_id, provider_subscription_id)
            return dict(row)

    async def cancel_subscription(self, user_id: str) -> Optional[dict]:
        """
        Cancels an active subscription by reverting the candidate's plan tier back to 'free'
        and setting status to 'cancelled'.

        Args:
            user_id (str): Target user identifier.

        Returns:
            Optional[dict]: Updated subscription record, or None if user had no active record.
        """
        if self._use_memory:
            rec = self._subscriptions.get(user_id)
            if rec:
                rec["plan"] = "free"
                rec["status"] = "cancelled"
                rec["updated_at"] = datetime.utcnow()
            return rec

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                UPDATE subscriptions
                SET plan = 'free', status = 'cancelled', updated_at = NOW()
                WHERE user_id = $1
                RETURNING *
            """, user_id)
            return dict(row) if row else None

    # ─── Billing Events ─────────────────────────────────────────────────────────

    async def log_billing_event(
        self,
        user_id: str,
        event_type: str,
        plan: Optional[str] = None,
        amount: Optional[int] = None,
        currency: str = "usd",
        provider_event_id: Optional[str] = None,
    ) -> dict:
        """
        Appends an immutable financial transaction or webhook audit entry to the billing ledger.

        Args:
            user_id (str): User identifier associated with the billing transaction.
            event_type (str): Event name (e.g. 'order_created', 'payment.authorized', 'payment.captured').
            plan (str, optional): Target plan ('pro', 'enterprise').
            amount (int, optional): Transaction amount in the smallest currency unit (e.g. cents/paise).
            currency (str): Three-letter ISO currency code (default: 'usd').
            provider_event_id (str, optional): Gateway webhook or charge reference ID.

        Returns:
            dict: The created billing event ledger record.
        """
        if self._use_memory:
            record = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "event_type": event_type,
                "plan": plan,
                "amount": amount,
                "currency": currency,
                "provider_event_id": provider_event_id,
                "created_at": datetime.utcnow(),
            }
            self._billing_events.append(record)
            return record

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO billing_events (user_id, event_type, plan, amount, currency, provider_event_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            """, user_id, event_type, plan, amount, currency, provider_event_id)
            return dict(row)

    async def get_billing_history(self, user_id: str, limit: int = 50) -> List[dict]:
        """
        Retrieves paginated billing ledger history for an individual user, sorted newest first.

        Args:
            user_id (str): User identifier.
            limit (int): Maximum records to fetch (default: 50).

        Returns:
            List[dict]: Chronological list of billing transaction dictionaries.
        """
        if self._use_memory:
            events = [e for e in self._billing_events if e["user_id"] == user_id]
            return sorted(events, key=lambda x: x["created_at"], reverse=True)[:limit]

        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM billing_events
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            """, user_id, limit)
            return [dict(r) for r in rows]


# Global singleton instance of the payment database repository
db = PaymentDatabase()
