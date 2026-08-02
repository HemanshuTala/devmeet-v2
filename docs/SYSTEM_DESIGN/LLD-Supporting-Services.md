# DevMeet v2.0 — Low-Level Design: Supporting Services
**Document Number:** DevMeet-LLD-003  
**Version:** 2.0  
**Date:** 2026-08-01  
**Status:** Approved  
**Classification:** Internal  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Analytics Service](#2-analytics-service)
3. [Admin Service](#3-admin-service)
4. [Notification Service](#4-notification-service)
5. [File Service](#5-file-service)
6. [Search Service](#6-search-service)
7. [Payment Service](#7-payment-service)
8. [API Gateway](#8-api-gateway)

---

## 1. Introduction

This document covers the LLD for all supporting services in DevMeet v2.0: Analytics, Admin, Notification, File, Search, Payment, and the API Gateway. These services provide cross-cutting capabilities such as observability, file storage, and monetisation.

---

## 2. Analytics Service

### 2.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8009 |
| Base URL | `/api/v1/analytics` |
| DB Tables | `analytics_events`, `sessions`, `feedback_reports` |
| Consumes | `analytics.events` (Kafka) |
| Fallback | In-memory event list when PostgreSQL is unavailable |

### 2.2 Module Structure

```
services/analytics-service/app/
├── main.py        # App startup
├── routes.py      # All analytics endpoints
├── models.py      # Pydantic schemas
├── database.py    # DB queries + in-memory fallback + demo data
└── middleware.py  # Auth (optional — public metrics, auth for user data)
```

### 2.3 API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/event` | Optional | Track single analytics event |
| POST | `/events/batch` | Optional | Track multiple events at once |
| GET | `/metrics` | No | Platform-wide aggregated metrics |
| GET | `/daily` | No | Daily session count (last N days) |
| GET | `/languages` | No | Code submission language distribution |
| GET | `/scores` | No | Score bucket distribution |
| GET | `/user/{id}/dashboard` | Yes | Per-user performance dashboard |
| GET | `/user/{id}/sessions` | Yes | User session list |
| GET | `/user/{id}/score-trend` | Yes | Score over time (last N days) |
| GET | `/funnel` | No | Session conversion funnel |
| GET | `/retention` | No | Cohort retention (D1/D7/D30) |
| GET | `/export/sessions.csv` | Admin | Export sessions as CSV |
| GET | `/export/events.csv` | Admin | Export events as CSV |
| GET | `/realtime` | No | Live counters |

### 2.4 Dashboard Data Model

```python
UserDashboard = {
    "user_id": str,
    "period_days": int,
    "total_sessions": int,
    "completed_sessions": int,
    "completion_rate": float,      # percent
    "avg_score": float,            # 0–100
    "dsa_sessions": int,
    "behavioral_sessions": int,
    "system_design_sessions": int,
    "avg_communication_score": float,
    "avg_problem_solving_score": float,
    "avg_code_quality_score": float,
    "avg_behavioral_score": float,
    "best_interview_type": str | None,   # type with highest avg score
    "worst_interview_type": str | None,  # type with lowest avg score
    "current_streak_days": int,
    "type_breakdown": [
        { "type": str, "avg_score": float, "count": int }
    ],
    "data_source": "live" | "demo"  # demo when no real data
}
```

### 2.5 Fallback Strategy

```
DB available?
├── YES → query sessions + feedback_reports tables
└── NO  → check local_events (in-memory list populated by /event POST calls)
    ├── Events exist for user? → compute stats from events
    └── No events?            → return _demo_user_stats() with data_source="demo"
```

### 2.6 Event Schema

```json
{
  "event_type": "session_completed | session_created | feedback_generated | user_registered | ...",
  "user_id": "uuid-string",
  "session_id": "uuid-string",
  "properties": {
    "interview_type": "dsa",
    "overall_score": 72,
    "duration_minutes": 30
  },
  "ip_address": "x.x.x.x",
  "created_at": "ISO-8601"
}
```

---

## 3. Admin Service

### 3.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8010 |
| Base URL | `/api/v1/admin` |
| Auth | JWT required, `role = admin` or `superadmin` |
| DB Tables | `user_profiles`, `user_plans`, `audit_logs`, `sessions`, `feedback_reports` |

### 3.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Platform summary (total users, sessions, revenue) |
| GET | `/users` | Paginated user list with search |
| GET | `/users/{id}` | Full user detail |
| POST | `/users/{id}/block` | Block user (sets is_blocked = true) |
| POST | `/users/{id}/unblock` | Unblock user |
| PUT | `/users/{id}/plan` | Change subscription plan |
| DELETE | `/users/{id}` | Hard delete user (superadmin only) |
| POST | `/users/{id}/impersonate` | Issue short-lived JWT as that user |
| GET | `/audit-logs` | Paginated audit log (filterable by user, action) |
| GET | `/sessions` | Platform-wide session list |

### 3.3 Impersonation Flow

```python
# POST /admin/users/{id}/impersonate
# Requires: role = superadmin
# Returns: short-lived access token (5 min) with impersonating_admin_id in claims
{
  "sub": target_user_id,
  "role": target_user_role,
  "impersonating_admin": admin_user_id,
  "exp": now + 300   # 5-minute token only
}
# All actions by this token are recorded in audit_logs with impersonating_admin field
```

### 3.4 Audit Log Entry

```python
audit_logs row = {
    "user_id": acting_user_id,
    "action": "user.blocked | plan.changed | session.deleted | ...",
    "resource_type": "user | session | feedback",
    "resource_id": target_uuid,
    "ip_address": request_ip,
    "user_agent": request_user_agent,
    "metadata": { "old_value": ..., "new_value": ... },
    "created_at": now
}
```

---

## 4. Notification Service

### 4.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Node.js 20 / Express |
| Port | 8008 |
| Base URL | `/api/v1/notifications` |
| Transport | WebSocket (in-app), AWS SES (email) |
| Consumes | `user.registered`, `feedback.generated` (RabbitMQ) |
| Real-time | Redis Pub/Sub for cross-pod fan-out |

### 4.2 Module Structure

```
services/notification-service/src/
├── index.js               # Express + WebSocket server
├── routes/
│   └── notifications.js   # REST: history, preferences, mark-read
├── websocket/
│   └── manager.js         # WS connection registry + broadcast
├── email/
│   ├── ses.js             # AWS SES client
│   └── templates/         # HTML email templates (Handlebars)
│       ├── welcome.html
│       ├── feedback-ready.html
│       └── password-reset.html
├── consumers/
│   └── rabbitmq.js        # RabbitMQ event consumer
└── middleware/
    └── auth.js
```

### 4.3 WebSocket Protocol

```
Client connects: ws://localhost:8008/ws?user_id={uuid}

Server verifies JWT in query param or first message.

Message format (server → client):
{
  "type": "notification",
  "id": "uuid",
  "title": "Your feedback is ready!",
  "body": "View your score for today's DSA interview.",
  "link": "/interview/{session_id}/feedback",
  "created_at": "ISO-8601"
}

Client → server:
{
  "type": "ack",
  "notification_id": "uuid"
}
```

### 4.4 Email Templates

| Template | Trigger | Key Variables |
|----------|---------|---------------|
| `welcome.html` | `user.registered` | `display_name`, `email` |
| `feedback-ready.html` | `feedback.generated` | `display_name`, `session_type`, `overall_score`, `feedback_url` |
| `password-reset.html` | `reset-password-request` | `display_name`, `reset_link`, `expiry` |
| `interview-reminder.html` | Scheduled job | `display_name`, `streak_days` |

### 4.5 Cross-Pod Fan-Out

```
Pod A receives feedback.generated → needs to push to WebSocket client on Pod B

Redis Pub/Sub:
  PUBLISH notifications.{user_id} '{"type":"notification",...}'

All pods subscribe to notifications.* pattern
  → Pod B receives the message and pushes to its connected WS client
```

---

## 5. File Service

### 5.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8011 |
| Base URL | `/api/v1/files` |
| Storage | AWS S3 (configured via env: `AWS_BUCKET_NAME`) |

### 5.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload` | Upload file (multipart) → S3 → return URL |
| GET | `/download/{key}` | Generate presigned S3 download URL (15 min) |
| DELETE | `/{key}` | Delete file from S3 |
| POST | `/avatar` | Upload & resize avatar (max 500×500 px) |
| GET | `/feedback/{session_id}/pdf` | Proxy PDF download |

### 5.3 S3 Key Structure

```
devmeet-files/
├── avatars/{user_id}/profile.{ext}
├── feedback/{session_id}/report.pdf
├── uploads/{user_id}/{timestamp}_{filename}
└── exports/{user_id}/data_export.json
```

### 5.4 Upload Flow

```python
POST /upload  (multipart/form-data: file, category)
│
├── Validate file type (whitelist: jpg, png, pdf, webm, txt)
├── Validate file size (max 50 MB)
├── Generate S3 key: {category}/{user_id}/{uuid}.{ext}
├── Upload to S3 with metadata (user_id, content_type)
├── Return { url, key, size_bytes, content_type }
```

---

## 6. Search Service

### 6.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8012 |
| Base URL | `/api/v1/search` |
| Index | Elasticsearch 8.x (`devmeet_questions`) |

### 6.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/questions` | Full-text + filter search |
| GET | `/questions/random` | Random question (filtered) |
| POST | `/questions` | Admin: ingest question into index |
| DELETE | `/questions/{id}` | Admin: remove question |
| GET | `/questions/{id}` | Get question by ID |

### 6.3 Question Document Schema (Elasticsearch)

```json
{
  "id": "uuid",
  "title": "Two Sum",
  "body": "Given an array of integers...",
  "interview_type": "dsa",
  "difficulty": "easy",
  "tags": ["array", "hash-map"],
  "companies": ["Google", "Amazon"],
  "solution_hint": "Use a hash map...",
  "created_at": "ISO-8601"
}
```

### 6.4 Search Query Construction

```python
def build_query(q: str, interview_type: str, difficulty: str, company: str):
    must = []
    if q:
        must.append({"multi_match": {
            "query": q,
            "fields": ["title^3", "body", "tags^2"],
            "type": "best_fields",
            "fuzziness": "AUTO"
        }})
    filters = []
    if interview_type: filters.append({"term": {"interview_type": interview_type}})
    if difficulty:      filters.append({"term": {"difficulty": difficulty}})
    if company:         filters.append({"term": {"companies": company}})
    return {
        "query": {"bool": {"must": must or [{"match_all": {}}], "filter": filters}},
        "size": 20
    }
```

---

## 7. Payment Service

### 7.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8013 |
| Base URL | `/api/v1/payments` |
| Providers | Razorpay (primary), Stripe (configurable via env) |
| DB Tables | `subscriptions`, `billing_events`, `user_plans` |

### 7.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Return payment provider + enabled flags |
| GET | `/plans` | Available plans + pricing |
| GET | `/subscription` | Current user subscription |
| GET | `/billing-history` | Past payments |
| POST | `/checkout-session` | Create Razorpay/Stripe checkout |
| POST | `/verify-payment` | Verify payment signature + activate plan |
| POST | `/webhook` | Provider webhook (signature-verified) |
| POST | `/cancel` | Cancel subscription |

### 7.3 Plan Definitions

| Plan | Price/mo (INR) | Interviews/day | Interviews/mo | Features |
|------|---------------|----------------|---------------|---------|
| `free` | 0 | 2 | 10 | Basic DSA, Behavioral |
| `pro` | ₹499 | 10 | 100 | All types, PDF reports, video |
| `enterprise` | ₹1999 | Unlimited | Unlimited | All + admin panel, analytics export |

### 7.4 Payment Verification (Razorpay)

```python
POST /verify-payment
{ razorpay_order_id, razorpay_payment_id, razorpay_signature, plan }

# Verify HMAC:
expected = hmac_sha256(
    key=RAZORPAY_KEY_SECRET,
    message=f"{order_id}|{payment_id}"
)
if expected != razorpay_signature:
    raise HTTPException(400, "Invalid payment signature")

# Activate plan:
UPDATE user_plans SET plan = $plan WHERE user_id = $user_id
INSERT INTO billing_events (user_id, event_type, plan, amount, ...)
PUBLISH payment.completed → Kafka (analytics event)
```

---

## 8. API Gateway

### 8.1 Overview

The API Gateway (NGINX + Kong) is the single entry point for all external traffic.

| Property | Value |
|----------|-------|
| Technology | NGINX 1.25 + Kong 3.x |
| Port | 8000 (HTTP), 8443 (HTTPS) |
| Config | `services/api-gateway/nginx.conf` |

### 8.2 Routing Rules

| Path Prefix | Upstream Service | Notes |
|-------------|-----------------|-------|
| `/api/v1/auth/` | `auth-service:8001` | No auth check at gateway |
| `/api/v1/users/` | `user-service:8002` | JWT required |
| `/api/v1/sessions/` | `orchestrator-service:8003` | JWT required |
| `/api/v1/interview/` | `ai-interviewer-service:8004` | JWT required, SSE passthrough |
| `/api/v1/execute/` | `code-execution-service:8005` | JWT required |
| `/api/v1/video/` | `video-service:8006` | JWT required |
| `/api/v1/feedback/` | `feedback-service:8007` | JWT required |
| `/api/v1/notifications/` | `notification-service:8008` | JWT required, WS upgrade |
| `/api/v1/analytics/` | `analytics-service:8009` | Public metrics, JWT for user routes |
| `/api/v1/admin/` | `admin-service:8010` | JWT + admin role |
| `/api/v1/files/` | `file-service:8011` | JWT required |
| `/api/v1/search/` | `search-service:8012` | Optional JWT |
| `/api/v1/payments/` | `payment-service:8013` | JWT required |

### 8.3 Gateway Middleware Chain

```
Request → SSL termination → Rate limit (Kong) → JWT verify (Kong plugin)
       → Request-ID inject → Route to upstream → Response compress → Client
```

### 8.4 Rate Limit Tiers

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 30 req/min | sliding |
| Authenticated (free) | 300 req/min | sliding |
| Authenticated (pro/enterprise) | 1000 req/min | sliding |
| Admin | 5000 req/min | sliding |

---

*This document is part of the DevMeet System Design documentation suite. See the [README](README.md) for the full index.*
