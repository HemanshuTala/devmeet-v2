import asyncpg
import os
import uuid
from datetime import datetime
from typing import Optional, List


class PaymentDatabase:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self._use_memory = False
        # In-memory fallback stores
        self._subscriptions: dict = {}
        self._billing_events: list = []

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
                command_timeout=30,
            )
            print("[payment-db] Connected to PostgreSQL")
        except Exception as e:
            print(f"[payment-db] PostgreSQL unavailable ({e}), using in-memory fallback")
            self._use_memory = True

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    # ─── Subscriptions ──────────────────────────────────────────────────────────

    async def get_subscription(self, user_id: str) -> Optional[dict]:
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


db = PaymentDatabase()
