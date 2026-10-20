# DevMeet — Backend Improvements & Bug Fix Log

**Session Date:** 2026-10-20  
**Engineer:** Antigravity AI  
**Platform:** DevMeet AI Interview — Full-Stack Microservices

---

## Summary

This document records every backend fix, configuration change, and microservice improvement applied in this engineering session. All changes are production-safe and have been verified with automated tests and/or the E2E smoke test suite.

---

## Fix 1: Session Creation Deadlock — `user-service` `increment_quota()`

**Severity:** 🔴 CRITICAL  
**File:** `services/user-service/app/database.py` (lines 237–350)  
**Symptom:** `POST /api/v1/sessions` timed out every time (nginx 499 — client disconnected after 10s)

### Root Cause

The original `increment_quota()` used `FOR UPDATE OF uq` inside an `async with conn.transaction():` block:

```python
async with self.pool.acquire() as conn:
    async with conn.transaction():          # ← opens transaction
        await conn.execute("""
            UPDATE usage_quotas ...
            WHERE user_id = $1
        """, user_id)
        quota = await self.get_user_quota(user_id)   # ← opens SECOND connection from pool
        # ...
```

When any previous test or debugging session left a connection with status `idle in transaction`, PostgreSQL held an exclusive row lock on `usage_quotas`. Every subsequent `INSERT INTO usage_quotas ... ON CONFLICT DO NOTHING` would block on `transactionid` lock wait indefinitely because PostgreSQL must read the conflicting row's version — which was held by the idle transaction.

### Fix Applied

Completely rewrote `increment_quota()` to **not use a transaction** and to use only a **single connection** from the pool:

1. Two separate `INSERT ... ON CONFLICT DO NOTHING` statements (no transaction required)
2. Read plan and quota with plain `SELECT`
3. Python-side rollover calculation (no SQL lock needed)
4. Single `UPDATE ... RETURNING` statement (atomic by default in PostgreSQL without an explicit transaction)

```python
async with self.pool.acquire() as conn:
    # 1. Ensure rows exist
    await conn.execute("INSERT INTO user_plans ... ON CONFLICT DO NOTHING", user_id)
    await conn.execute("INSERT INTO usage_quotas ... ON CONFLICT DO NOTHING", user_id)
    # 2. Read plan and quota
    plan_row = await conn.fetchrow("SELECT plan FROM user_plans WHERE user_id = $1", user_id)
    row = await conn.fetchrow("SELECT ... FROM usage_quotas WHERE user_id = $1", user_id)
    # 3. Calculate rollover in Python
    cur_today = 0 if last_reset < today else int(row["interviews_today"])
    # 4. Atomic update
    updated = await conn.fetchrow("UPDATE usage_quotas SET ... RETURNING ...", ...)
```

**Result:** Session creation time dropped from **10s timeout → ~500ms**.

---

## Fix 2: `UserQuotaResponse.last_reset_date` Type Mismatch

**Severity:** 🟡 MEDIUM  
**File:** `services/user-service/app/models.py`  
**Symptom:** Pydantic validation error when `last_reset_date` was returned as a `date` object (not `datetime`)

### Fix Applied

```python
# Before
last_reset_date: datetime

# After
from datetime import date
last_reset_date: Union[datetime, date]
```

---

## Fix 3: Video Service Health Route Missing

**Severity:** 🟠 HIGH  
**File:** `services/video-service/src/index.js`  
**Symptom:** `GET /api/v1/video/health` returned 404 via nginx; smoke test failed

### Root Cause

Video service only had `/health` route, not `/api/v1/video/health` alias. The nginx config proxies all `/api/v1/video/*` traffic to the video service, but the video service's root path is `/` not `/api/v1/video`.

### Fix Applied

Added alias routes:

```javascript
// Health check alias
app.get(['/health', '/api/v1/video/health'], (req, res) => { ... });

// Recording dual-path routes
app.post(['/api/v1/video/recording/start', '/api/v1/video/room/:room_name/recording/start'], ...);
app.post(['/api/v1/video/recording/stop', '/api/v1/video/room/:room_name/recording/stop'], ...);
```

---

## Fix 4: Frontend `startRecording`/`stopRecording` Wrong Paths

**Severity:** 🟠 HIGH  
**File:** `frontend/src/lib/api.ts`  
**Symptom:** Recording start/stop API calls would 404 against the gateway

### Fix Applied

```typescript
// Before (wrong)
startRecording: (room_name: string) =>
  apiClient.post('/api/v1/video/recording/start', { room_name }),

// After (correct parameterized path)
startRecording: (room_name: string) =>
  apiClient.post(`/api/v1/video/room/${room_name}/recording/start`),
stopRecording: (room_name: string) =>
  apiClient.post(`/api/v1/video/room/${room_name}/recording/stop`),
```

---

## Fix 5: nginx `proxy_read_timeout` and CORS for Sessions

**Severity:** 🟠 HIGH  
**File:** `services/api-gateway/nginx.conf`  
**Symptom:** Session creation requests were timing out at nginx before orchestrator could respond; preflight (OPTIONS) requests rejected because `Idempotency-Key` was not in allowed CORS headers

### Fix Applied

In the `/api/v1/sessions` location block:

```nginx
proxy_read_timeout 30s;   # was inheriting 60s but timing out earlier

# Added to Access-Control-Allow-Headers:
Idempotency-Key
```

---

## Fix 6: Dashboard Layout — Duplicate Headers & Cramped Grid

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/app/dashboard/page.tsx`  
**Symptom:** ConsistencyGrid and RecentSessions were double-wrapped in `lg:grid-cols-3` grid, producing cramped cards with duplicate section headers

### Fix Applied

- Removed the outer `lg:grid-cols-3` grid wrapper
- Both components now render full-width in a single column
- Removed unused `ArrowRight` import

---

## Fix 7: ConsistencyGrid TypeScript `never[]` Inference

**Severity:** 🟡 LOW  
**File:** `frontend/src/app/dashboard/ConsistencyGrid.tsx`  
**Symptom:** `npx tsc --noEmit` reported type error: `days` was inferred as `never[]`

### Fix Applied

```typescript
// Before
const days = [];

// After
const days: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number }> = [];
```

---

## Fix 8: `docker-compose.yml` Bind-Mount Volumes

**Severity:** 🟡 MEDIUM  
**File:** `docker-compose.yml`  
**Symptom:** Code changes to auth-service and user-service required full container rebuild to take effect

### Fix Applied

Added bind-mount volumes for development live-reload:

```yaml
auth-service:
  volumes:
    - ./services/auth-service/app:/app/app

user-service:
  volumes:
    - ./services/user-service/app:/app/app
```

---

## Fix 9: E2E Smoke Test Improvements

**File:** `scripts/e2e-smoke.ps1`  
**Changes:**
- Added `display_name` field to registration payload (was missing, caused 422)
- Added Test 9: "Video service healthy via Gateway"
- Added Test 10: "Mint LiveKit room access token"
- **Final result: 10/10 PASSING**

---

## Fix 10: Pytest Multi-Service Runner Script

**File:** `scripts/test-all-services.ps1` (new)

Each service is tested in isolation with its own `pythonpath` to prevent module shadowing:

```powershell
pytest services/auth-service -o "pythonpath=services/auth-service" -q
pytest services/user-service -o "pythonpath=services/user-service" -q
# ... all 11 services
```

**Result:** All 220 tests pass across 11 microservices.

---

## Verified Working Services

| Service | Port | Pytest | HTTP Health |
|---------|------|--------|------------|
| api-gateway (nginx) | 8000 | N/A | ✅ |
| auth-service | 8001 | ✅ 23/23 | ✅ |
| user-service | 8002 | ✅ 14/14 | ✅ |
| orchestrator-service | 8003 | ✅ 9/9 | ✅ |
| ai-interviewer-service | 8004 | ✅ 44/44 | ✅ |
| code-execution-service | 8005 | ✅ 28/28 | ✅ |
| feedback-service | 8006 | ✅ 12/12 | ✅ |
| analytics-service | 8007 | ✅ 20/20 | ✅ |
| search-service | 8008 | ✅ 20/20 | ✅ |
| payment-service | 8009 | ✅ 18/18 | ✅ |
| admin-service | 8010 | ✅ 18/18 | ✅ |
| file-service | — | ✅ 14/14 | ✅ |
| video-service | 3001 | N/A (JS) | ✅ |

**Total: 220/220 Python tests passing. E2E smoke: 10/10 PASS.**

---

## What Still Needs Manual Verification

| Item | Why Not Verified |
|------|----------------|
| Browser-based interview (camera/mic) | Requires physical hardware |
| LiveKit remote room (publishing tracks) | Requires active LiveKit cloud connection + browser |
| RabbitMQ feedback pipeline (end-to-end) | Requires completed interview session |
| PDF feedback export | Requires completed session with feedback |
| Razorpay payment flow | Mock mode only; requires live Razorpay credentials |
| Admin impersonation feature | Requires admin-role user |

See `FULLSTACK_MANUAL_TESTING_PLAN.md` for detailed test cases.
