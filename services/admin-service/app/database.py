import os
import asyncpg
import json
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

class AdminDatabase:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.use_db = False
        # Mock database cache fallback
        self.mock_users: List[dict] = [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "email": "user@example.com",
                "display_name": "John Doe",
                "plan": "pro",
                "created_at": (datetime.utcnow() - timedelta(days=10)).isoformat(),
                "total_sessions": 8,
                "is_blocked": False
            },
            {
                "id": "22222222-2222-2222-2222-222222222222",
                "email": "admin@devmeet.com",
                "display_name": "DevMeet Admin",
                "plan": "enterprise",
                "created_at": (datetime.utcnow() - timedelta(days=20)).isoformat(),
                "total_sessions": 24,
                "is_blocked": False
            },
            {
                "id": "33333333-3333-3333-3333-333333333333",
                "email": "badactor@spammer.org",
                "display_name": "Spam User",
                "plan": "free",
                "created_at": (datetime.utcnow() - timedelta(days=1)).isoformat(),
                "total_sessions": 1,
                "is_blocked": True
            }
        ]
        self.mock_audit_logs: List[dict] = [
            {
                "id": "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1",
                "user_id": "11111111-1111-1111-1111-111111111111",
                "action": "user.login",
                "resource_type": "user",
                "resource_id": "11111111-1111-1111-1111-111111111111",
                "ip_address": "127.0.0.1",
                "metadata": {"browser": "Chrome"},
                "created_at": (datetime.utcnow() - timedelta(hours=2)).isoformat()
            },
            {
                "id": "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2",
                "user_id": "22222222-2222-2222-2222-222222222222",
                "action": "user.block",
                "resource_type": "user",
                "resource_id": "33333333-3333-3333-3333-333333333333",
                "ip_address": "127.0.0.1",
                "metadata": {"reason": "Abuse"},
                "created_at": (datetime.utcnow() - timedelta(hours=1)).isoformat()
            }
        ]

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
            print("Admin DB: Successfully connected to PostgreSQL")
        except Exception as e:
            print(f"Admin DB: Failed to connect: {e}. Running in mock mode.")
            self.use_db = False

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def get_all_users(
        self,
        search: str = None,
        plan: str = None,
        is_blocked: bool = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[dict]:
        if self.use_db and self.pool:
            try:
                search_pattern = f"%{search}%" if search else "%"
                filters = ["(u.email LIKE $1 OR u.display_name LIKE $1)"]
                params = [search_pattern]
                idx = 2
                if plan:
                    filters.append(f"p.plan = ${idx}")
                    params.append(plan)
                    idx += 1
                if is_blocked is not None:
                    filters.append(f"u.is_blocked = ${idx}")
                    params.append(is_blocked)
                    idx += 1
                where = " AND ".join(filters)
                params.extend([limit, offset])
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        f"""
                        SELECT u.id, u.email, u.display_name, COALESCE(p.plan, 'free') as plan,
                               u.created_at, u.is_blocked, COUNT(s.id) as total_sessions
                        FROM user_profiles u
                        LEFT JOIN user_plans p ON u.id = p.user_id
                        LEFT JOIN sessions s ON u.id = s.user_id
                        WHERE {where}
                        GROUP BY u.id, p.plan
                        ORDER BY u.created_at DESC
                        LIMIT ${idx} OFFSET ${idx+1}
                        """,
                        *params
                    )
                    return [
                        {
                            "id": str(r["id"]),
                            "email": r["email"],
                            "display_name": r["display_name"],
                            "plan": r["plan"],
                            "created_at": r["created_at"].isoformat(),
                            "total_sessions": r["total_sessions"],
                            "is_blocked": r["is_blocked"]
                        } for r in rows
                    ]
            except Exception as e:
                print(f"Admin DB: Failed to query users: {e}. Falling back to mocks.")

        # Mock fallback
        filtered = list(self.mock_users)
        if search:
            s_lower = search.lower()
            filtered = [u for u in filtered if s_lower in u["email"].lower() or s_lower in u["display_name"].lower()]
        if plan:
            filtered = [u for u in filtered if u.get("plan") == plan]
        if is_blocked is not None:
            filtered = [u for u in filtered if u.get("is_blocked") == is_blocked]
        return filtered[offset: offset + limit]

    async def get_user_by_id(self, user_id: str) -> Optional[dict]:
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id)
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow(
                        """
                        SELECT u.id, u.email, u.display_name, COALESCE(p.plan, 'free') as plan, 
                               u.created_at, u.is_blocked, COUNT(s.id) as total_sessions
                        FROM user_profiles u
                        LEFT JOIN user_plans p ON u.id = p.user_id
                        LEFT JOIN sessions s ON u.id = s.user_id
                        WHERE u.id = $1
                        GROUP BY u.id, p.plan
                        """,
                        u_uuid
                    )
                    if row:
                        return {
                            "id": str(row["id"]),
                            "email": row["email"],
                            "display_name": row["display_name"],
                            "plan": row["plan"],
                            "created_at": row["created_at"].isoformat(),
                            "total_sessions": row["total_sessions"],
                            "is_blocked": row["is_blocked"]
                        }
                    return None
            except Exception as e:
                print(f"Admin DB: get_user_by_id error: {e}")

        for u in self.mock_users:
            if u["id"] == user_id:
                return u
        return None

    async def block_user(self, user_id: str) -> bool:
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id)
                async with self.pool.acquire() as conn:
                    await conn.execute("UPDATE user_profiles SET is_blocked = true WHERE id = $1", u_uuid)
                return True
            except Exception as e:
                print(f"Admin DB: Failed to block user: {e}")
                return False
        
        for u in self.mock_users:
            if u["id"] == user_id:
                u["is_blocked"] = True
                return True
        return False

    async def unblock_user(self, user_id: str) -> bool:
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id)
                async with self.pool.acquire() as conn:
                    await conn.execute("UPDATE user_profiles SET is_blocked = false WHERE id = $1", u_uuid)
                return True
            except Exception as e:
                print(f"Admin DB: Failed to unblock user: {e}")
                return False

        for u in self.mock_users:
            if u["id"] == user_id:
                u["is_blocked"] = False
                return True
        return False

    async def delete_user(self, user_id: str) -> bool:
        """Soft delete via anonymization for GDPR"""
        anon_email = f"anon_{user_id[:8]}@devmeet.anon"
        anon_name = "Anonymized User"
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id)
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE user_profiles
                        SET email = $1, display_name = $2, password_hash = 'GDPR_DELETED', bio = NULL,
                            avatar_url = NULL, target_companies = NULL, skills = NULL
                        WHERE id = $3
                        """,
                        anon_email, anon_name, u_uuid
                    )
                return True
            except Exception as e:
                print(f"Admin DB: Failed soft delete user: {e}")
                return False

        for u in self.mock_users:
            if u["id"] == user_id:
                u["email"] = anon_email
                u["display_name"] = anon_name
                return True
        return False

    async def update_user_plan(self, user_id: str, new_plan: str) -> bool:
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id)
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE user_plans SET plan = $1, updated_at = NOW() WHERE user_id = $2",
                        new_plan, u_uuid
                    )
                return True
            except Exception as e:
                print(f"Admin DB: update_user_plan error: {e}")
                return False
        for u in self.mock_users:
            if u["id"] == user_id:
                u["plan"] = new_plan
                return True
        return False

    async def get_user_sessions(self, user_id: str) -> List[dict]:
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id)
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        "SELECT id, status, interview_type, created_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC",
                        u_uuid
                    )
                    return [{"id": str(r["id"]), "status": r["status"], "interview_type": r["interview_type"]} for r in rows]
            except Exception as e:
                print(f"Admin DB: get_user_sessions error: {e}")
        return []

    async def get_all_sessions(
        self,
        user_id: str = None,
        status: str = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[dict]:
        if self.use_db and self.pool:
            try:
                filters, params, idx = [], [], 1
                if user_id:
                    import uuid
                    filters.append(f"user_id = ${idx}")
                    params.append(uuid.UUID(user_id))
                    idx += 1
                if status:
                    filters.append(f"status = ${idx}")
                    params.append(status)
                    idx += 1
                where = ("WHERE " + " AND ".join(filters)) if filters else ""
                params.extend([limit, offset])
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        f"SELECT id, user_id, interview_type, difficulty, status, created_at FROM sessions {where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx+1}",
                        *params
                    )
                    return [{"id": str(r["id"]), "user_id": str(r["user_id"]), "interview_type": r["interview_type"], "difficulty": r["difficulty"], "status": r["status"], "created_at": r["created_at"].isoformat()} for r in rows]
            except Exception as e:
                print(f"Admin DB: get_all_sessions error: {e}")
        return []

    async def cancel_session(self, session_id: str) -> bool:
        if self.use_db and self.pool:
            try:
                import uuid
                s_uuid = uuid.UUID(session_id)
                async with self.pool.acquire() as conn:
                    result = await conn.execute(
                        "UPDATE sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status NOT IN ('completed','cancelled')",
                        s_uuid
                    )
                    return result != "UPDATE 0"
            except Exception as e:
                print(f"Admin DB: cancel_session error: {e}")
        return False

    async def create_audit_log(
        self,
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: Optional[str],
        ip_address: Optional[str],
        metadata: Optional[dict]
    ) -> bool:
        created_at = datetime.utcnow()
        if self.use_db and self.pool:
            try:
                import uuid
                u_uuid = uuid.UUID(user_id) if user_id else None
                r_uuid = uuid.UUID(resource_id) if resource_id else None
                meta_json = json.dumps(metadata or {})
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, metadata, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        """,
                        u_uuid, action, resource_type, r_uuid, ip_address, meta_json, created_at
                    )
                return True
            except Exception as e:
                print(f"Admin DB: Failed to create audit log: {e}")

        # Mock fallback
        self.mock_audit_logs.append({
            "id": str(datetime.utcnow().timestamp()),
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": ip_address,
            "metadata": metadata or {},
            "created_at": created_at.isoformat()
        })
        return True

    async def get_audit_logs(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[str] = None,
        action: Optional[str] = None,
    ) -> List[dict]:
        if self.use_db and self.pool:
            try:
                filters, params, idx = [], [], 1
                if user_id:
                    import uuid
                    filters.append(f"user_id = ${idx}")
                    params.append(uuid.UUID(user_id))
                    idx += 1
                if action:
                    filters.append(f"action = ${idx}")
                    params.append(action)
                    idx += 1
                where = ("WHERE " + " AND ".join(filters)) if filters else ""
                params.extend([limit, offset])
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        f"""
                        SELECT id, user_id, action, resource_type, resource_id, ip_address, metadata, created_at
                        FROM audit_logs {where}
                        ORDER BY created_at DESC
                        LIMIT ${idx} OFFSET ${idx+1}
                        """,
                        *params
                    )
                    return [
                        {
                            "id": str(r["id"]),
                            "user_id": str(r["user_id"]) if r["user_id"] else None,
                            "action": r["action"],
                            "resource_type": r["resource_type"],
                            "resource_id": str(r["resource_id"]) if r["resource_id"] else None,
                            "ip_address": str(r["ip_address"]) if r["ip_address"] else None,
                            "metadata": json.loads(r["metadata"]) if isinstance(r["metadata"], str) else dict(r["metadata"] or {}),
                            "created_at": r["created_at"].isoformat()
                        } for r in rows
                    ]
            except Exception as e:
                print(f"Admin DB: get_audit_logs error: {e}")

        # Mock fallback
        logs = self.mock_audit_logs
        if user_id:
            logs = [l for l in logs if l["user_id"] == user_id]
        if action:
            logs = [l for l in logs if l["action"] == action]
        return logs[offset: offset + limit]

    async def get_admin_stats(self) -> dict:
        if self.use_db and self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        WITH user_stats AS (
                            SELECT
                                COUNT(*) as total_users,
                                COUNT(*) FILTER (WHERE is_blocked) as blocked_users,
                                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as new_users
                            FROM user_profiles
                        ),
                        plan_stats AS (
                            SELECT
                                COUNT(*) FILTER (WHERE plan = 'pro') as pro_users,
                                COUNT(*) FILTER (WHERE plan = 'enterprise') as ent_users,
                                COUNT(*) FILTER (WHERE plan = 'free') as free_users
                            FROM user_plans
                        ),
                        session_stats AS (
                            SELECT
                                COUNT(*) as total_sessions,
                                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as sessions_today,
                                COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
                                COUNT(*) FILTER (WHERE status = 'in_progress') as active_sessions
                            FROM sessions
                        )
                        SELECT * FROM user_stats, plan_stats, session_stats
                    """)
                    pro = row['pro_users'] or 0
                    ent = row['ent_users'] or 0
                    return {
                        "total_users": row['total_users'] or 0,
                        "new_users_today": row['new_users'] or 0,
                        "total_sessions": row['total_sessions'] or 0,
                        "sessions_today": row['sessions_today'] or 0,
                        "completed_sessions": row['completed_sessions'] or 0,
                        "active_sessions": row['active_sessions'] or 0,
                        "revenue_estimate": (pro * 19.0) + (ent * 199.0),
                        "pro_users": pro,
                        "enterprise_users": ent,
                        "free_users": row['free_users'] or 0,
                        "blocked_users": row['blocked_users'] or 0,
                    }
            except Exception as e:
                print(f"Admin DB: get_admin_stats error: {e}")

        # Mock fallback stats
        pro_count = sum(1 for u in self.mock_users if u["plan"] == "pro")
        ent_count = sum(1 for u in self.mock_users if u["plan"] == "enterprise")
        free_count = sum(1 for u in self.mock_users if u["plan"] == "free")
        blocked_count = sum(1 for u in self.mock_users if u.get("is_blocked"))
        return {
            "total_users": len(self.mock_users),
            "new_users_today": 1,
            "total_sessions": sum(u["total_sessions"] for u in self.mock_users),
            "sessions_today": 2,
            "completed_sessions": 15,
            "active_sessions": 1,
            "revenue_estimate": pro_count * 19.0 + ent_count * 199.0,
            "pro_users": pro_count,
            "enterprise_users": ent_count,
            "free_users": free_count,
            "blocked_users": blocked_count,
        }

db = AdminDatabase()
