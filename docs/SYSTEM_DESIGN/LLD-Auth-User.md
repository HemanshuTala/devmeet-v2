# DevMeet v2.0 — Low-Level Design: Auth & User Services
**Document Number:** DevMeet-LLD-001  
**Version:** 2.0  
**Date:** 2026-08-01  
**Status:** Approved  
**Classification:** Internal  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Auth Service — LLD](#2-auth-service--lld)
3. [User Service — LLD](#3-user-service--lld)
4. [Shared Security Patterns](#4-shared-security-patterns)
5. [Error Handling](#5-error-handling)
6. [Sequence Diagrams](#6-sequence-diagrams)

---

## 1. Introduction

### 1.1 Purpose
This document provides the Low-Level Design (LLD) for the **Auth Service** and **User Service** of DevMeet v2.0. It covers internal module structure, class/function responsibilities, API contracts, data flows, and security considerations for each service.

### 1.2 References
- HLD: `docs/SYSTEM_DESIGN/HLD-System-Architecture.md`
- DB Schema: `docs/SYSTEM_DESIGN/DB-Schema-Diagram.md`
- SRS: `DevMeet_SRS_v2.md`

---

## 2. Auth Service — LLD

### 2.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 |
| Framework | FastAPI |
| Port | 8001 |
| Base URL | `/api/v1/auth` |
| Database | PostgreSQL (tables: `user_profiles`, `login_attempts`, `login_history`, `password_resets`) |
| Cache | Redis (refresh tokens, rate-limit counters, MFA sessions) |

### 2.2 Module Structure

```
services/auth-service/app/
├── main.py              # FastAPI app bootstrap, CORS, startup hooks
├── routes.py            # All auth endpoints (router)
├── models.py            # Pydantic request/response schemas
├── database.py          # asyncpg pool, all DB queries
├── security.py          # JWT creation/verification, bcrypt, TOTP
├── oauth.py             # Google & GitHub OAuth2 flow
├── middleware.py        # RequestID injection, rate-limit middleware
└── __init__.py
```

### 2.3 API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| POST | `/register` | No | Create account (email + password) |
| POST | `/login` | No | Email/password login → JWT pair or MFA challenge |
| POST | `/refresh` | No (refresh token) | Rotate access + refresh tokens |
| POST | `/logout` | Yes | Revoke refresh token |
| GET | `/me` | Yes | Return current user profile |
| POST | `/change-password` | Yes | Change password (requires current) |
| POST | `/reset-password-request` | No | Send reset email |
| POST | `/reset-password-confirm` | No | Consume reset token + set new password |
| POST | `/verify-email/request` | Yes | Send verification email |
| POST | `/verify-email/confirm` | No | Mark email as verified |
| GET | `/oauth/google` | No | Google OAuth2 redirect |
| GET | `/oauth/google/callback` | No | Google OAuth2 callback |
| GET | `/oauth/github` | No | GitHub OAuth2 redirect |
| GET | `/oauth/github/callback` | No | GitHub OAuth2 callback |
| POST | `/mfa/enable` | Yes | Generate TOTP secret + QR URI |
| POST | `/mfa/verify` | Yes | Confirm enrollment |
| POST | `/mfa/login-verify` | No (mfa_token) | Verify TOTP during login |
| POST | `/mfa/disable` | Yes | Disable MFA |
| POST | `/mfa/backup-codes` | Yes | Generate fresh backup codes |

### 2.4 Key Classes & Functions

#### `security.py`

```python
class JWTHandler:
    """
    Manages JWT lifecycle.
    - create_access_token(user_id, role, expires_delta) → str
    - create_refresh_token(user_id) → str
    - verify_token(token) → dict  # raises HTTPException on invalid
    - revoke_refresh_token(token) → None  # deletes from Redis
    """

class PasswordHandler:
    """
    - hash_password(plain: str) → str   # bcrypt cost 12
    - verify_password(plain, hashed) → bool
    """

class TOTPHandler:
    """
    - generate_secret() → (secret, provisioning_uri)
    - verify_totp(secret, code) → bool
    - generate_backup_codes(n=8) → List[str]  # SHA-256 hashed before storage
    """
```

#### `database.py` — Key Queries

| Function | SQL Operation | Notes |
|----------|--------------|-------|
| `get_user_by_email(email)` | `SELECT … FROM user_profiles WHERE email = $1` | Used at login |
| `create_user(email, hash, name)` | `INSERT INTO user_profiles …` | Returns UUID |
| `update_last_login(user_id)` | `UPDATE user_profiles SET updated_at = NOW()` | |
| `record_login_attempt(email, success)` | Upsert `login_attempts` | Locks account after 5 failures |
| `store_refresh_token(user_id, token_hash, ttl)` | Redis `SETEX` | 7-day TTL |
| `verify_refresh_token(token_hash)` | Redis `GET` | Returns user_id or None |
| `create_password_reset(user_id, token)` | `INSERT INTO password_resets` | 1-hour TTL |
| `consume_password_reset(token)` | `UPDATE password_resets SET used = true` | Transactional |

### 2.5 JWT Token Design

```
Access Token (HS256, 15 min TTL):
{
  "sub": "<user_uuid>",
  "role": "user|admin",
  "email": "user@example.com",
  "jti": "<unique_id>",
  "iat": <issued_at>,
  "exp": <expiry>
}

Refresh Token (opaque, 7 days):
- Random 64-byte hex string
- SHA-256 hash stored in Redis as: refresh:{hash} → user_id
- Rotated on every use (sliding window)
```

### 2.6 Login Flow

```
POST /login
│
├── Validate email/password format (Pydantic)
├── Check login_attempts: if locked → 429 Too Many Requests
├── Fetch user by email
│   └── Not found → increment attempt, return 401 (generic message)
├── verify_password(plain, hash)
│   └── Fail → increment attempt, return 401
├── Check is_blocked → 403
├── MFA enabled?
│   ├── YES → generate mfa_token (short-lived Redis key), return 202 + mfa_token
│   └── NO  → generate access_token + refresh_token
├── record_login_attempt(success=True)
├── Insert login_history row (IP, user-agent)
└── Return { access_token, refresh_token, token_type, expires_in }
```

### 2.7 OAuth2 Flow (Google / GitHub)

```
GET /oauth/google
└── Redirect to Google with state=<csrf_token> stored in Redis (5 min)

GET /oauth/google/callback?code=…&state=…
├── Verify state against Redis (CSRF protection)
├── Exchange code for Google access token
├── Fetch Google user profile (email, name, avatar)
├── Upsert user_profiles (create or update google_id)
├── Generate JWT pair
└── Redirect to frontend with tokens in query param (short-lived)
```

---

## 3. User Service — LLD

### 3.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 |
| Framework | FastAPI |
| Port | 8002 |
| Base URL | `/api/v1/users` |
| Database | PostgreSQL (tables: `user_profiles`, `user_plans`, `usage_quotas`) |
| Cache | Redis (quota cache, leaderboard cache) |

### 3.2 Module Structure

```
services/user-service/app/
├── main.py        # App bootstrap
├── routes.py      # All user endpoints
├── models.py      # Pydantic schemas
├── database.py    # DB queries (profiles, plans, quotas)
├── middleware.py  # Auth verification (calls auth service /me)
└── __init__.py
```

### 3.3 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me` | Yes | Return current user full profile |
| PUT | `/me` | Yes | Update profile (display_name, bio, skills, etc.) |
| DELETE | `/me` | Yes | GDPR account deletion |
| POST | `/me/avatar` | Yes | Upload avatar (multipart → File Service) |
| GET | `/me/quota` | Yes | Return current daily/monthly quota usage |
| GET | `/me/plan` | Yes | Return subscription plan |
| GET | `/me/export` | Yes | GDPR data export (JSON) |
| GET | `/leaderboard` | Optional | Top users by completed session count |
| GET | `/{user_id}/public` | No | Public profile (if profile_public = true) |

### 3.4 Key Classes & Functions

#### `database.py`

```python
class UserDatabase:
    async def get_profile(user_id: UUID) → UserProfile
    async def update_profile(user_id: UUID, updates: dict) → UserProfile
    async def delete_user(user_id: UUID) → None          # soft-delete: sets deleted_at
    async def get_quota(user_id: UUID) → UsageQuota
    async def increment_quota(user_id: UUID) → None       # called after session.create
    async def reset_quota_if_needed(user_id: UUID) → None # daily/monthly reset check
    async def get_plan(user_id: UUID) → UserPlan
    async def get_leaderboard(limit: int) → List[LeaderboardEntry]
```

#### Quota Enforcement Logic

```
On session create:
1. Fetch quota row (with SELECT FOR UPDATE)
2. reset_quota_if_needed (if last_reset_date < today, reset interviews_today = 0)
3. Check plan limits:
   - free:       2 interviews/day,  10/month
   - pro:        10 interviews/day, 100/month
   - enterprise: unlimited
4. If limit exceeded → raise 429 { "detail": "Daily interview limit reached" }
5. Else → increment interviews_today and interviews_this_month
```

### 3.5 Leaderboard Design

```sql
-- Cached in Redis for 5 minutes (key: leaderboard:top25)
SELECT
    up.id, up.display_name, up.avatar_url,
    COUNT(s.id) FILTER (WHERE s.status = 'completed') AS completed_sessions,
    ROUND(AVG(fr.overall_score) FILTER (WHERE fr.overall_score > 0), 1) AS avg_score
FROM user_profiles up
LEFT JOIN sessions s ON s.user_id = up.id
LEFT JOIN feedback_reports fr ON fr.session_id = s.id
WHERE up.profile_public = true AND up.deleted_at IS NULL
GROUP BY up.id
ORDER BY completed_sessions DESC, avg_score DESC
LIMIT 25;
```

### 3.6 GDPR Delete Flow

```
DELETE /me
├── Soft-delete: user_profiles.deleted_at = NOW()
├── Publish user.deleted event to Kafka
│   └── Consumers: Analytics (anonymise events), Notification (unsub), File (delete files)
├── Revoke all refresh tokens (Redis DELETE pattern: refresh:* where sub = user_id)
├── Schedule hard-delete job after 30 days (configurable)
└── Return 204 No Content
```

---

## 4. Shared Security Patterns

### 4.1 Auth Middleware (Used by All Services)

Every service except Auth validates incoming requests by calling Auth Service `/me` or locally verifying the JWT:

```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserContext:
    """
    1. Extract Bearer token from Authorization header
    2. Decode JWT locally (fast path — no network call)
    3. Verify signature, expiry, not-revoked
    4. Return UserContext(user_id, role, email)
    """
```

### 4.2 Rate Limiting

| Endpoint Class | Limit | Window | Storage |
|---------------|-------|--------|---------|
| `POST /login` | 10 | 1 min | Redis |
| `POST /register` | 5 | 1 min | Redis |
| `POST /reset-password-request` | 3 | 1 hour | Redis |
| All other auth | 100 | 1 min | Redis |
| All other APIs | 300 | 1 min | Redis |

---

## 5. Error Handling

All services return consistent error envelopes:

```json
{
  "detail": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "request_id": "uuid"
}
```

| HTTP Status | Scenario |
|-------------|---------|
| 400 | Validation error (Pydantic) |
| 401 | Missing or expired JWT |
| 403 | Insufficient role / account blocked |
| 404 | Resource not found |
| 409 | Conflict (email already registered) |
| 422 | Request body schema violation |
| 429 | Rate limit or quota exceeded |
| 500 | Unexpected server error (logged, not exposed) |

---

## 6. Sequence Diagrams

### 6.1 Registration Flow

```
Browser          API Gateway      Auth Service      PostgreSQL       Notification
   │                  │                │                 │                │
   │─POST /register──▶│                │                 │                │
   │                  │─forward───────▶│                 │                │
   │                  │                │─validate input  │                │
   │                  │                │─check email────▶│                │
   │                  │                │◀─not found──────│                │
   │                  │                │─hash password   │                │
   │                  │                │─INSERT user────▶│                │
   │                  │                │◀─user_id────────│                │
   │                  │                │─create JWT pair │                │
   │                  │                │─publish user.registered ────────▶│
   │                  │◀─200 + tokens──│                 │                │
   │◀─tokens──────────│                │                 │                │
```

### 6.2 JWT Refresh Flow

```
Browser          API Gateway        Auth Service       Redis
   │                  │                   │               │
   │─POST /refresh────▶│                   │               │
   │  (refresh_token) │──────────────────▶│               │
   │                  │                   │─SHA256(token) │
   │                  │                   │─GET refresh:──▶│
   │                  │                   │◀─user_id───────│
   │                  │                   │─DEL old token─▶│  (rotation)
   │                  │                   │─new tokens    │
   │                  │                   │─SET new token─▶│
   │                  │◀─new tokens───────│               │
   │◀─new tokens──────│                   │               │
```

---

*For service interaction diagrams covering the full interview pipeline, see `docs/SYSTEM_DESIGN/LLD-Interview-Core.md`.*
