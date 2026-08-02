# DevMeet v2.0 — Database Schema Diagram
**Document Number:** DevMeet-DB-001  
**Version:** 2.0  
**Date:** 2026-08-01  
**Status:** Approved  
**Classification:** Internal  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Entity Relationship Overview](#2-entity-relationship-overview)
3. [Schema: Users & Auth](#3-schema-users--auth)
4. [Schema: Sessions & Interview Data](#4-schema-sessions--interview-data)
5. [Schema: Feedback](#5-schema-feedback)
6. [Schema: Analytics & Audit](#6-schema-analytics--audit)
7. [Schema: Payments & Billing](#7-schema-payments--billing)
8. [Schema: Infrastructure Tables](#8-schema-infrastructure-tables)
9. [Indexes](#9-indexes)
10. [Relationships Summary](#10-relationships-summary)
11. [Data Retention & Archival Policy](#11-data-retention--archival-policy)

---

## 1. Introduction

### 1.1 Purpose
This document provides the complete database schema diagram for DevMeet v2.0 in IEEE format. It covers all tables, columns, data types, constraints, indexes, and entity relationships for the shared PostgreSQL 16 database.

### 1.2 Scope
All tables in the `devmeet` database used by the 12 microservices. The authoritative DDL is in `migrations/init_dev_schema.sql`.

### 1.3 Notation
- **PK** — Primary Key  
- **FK** — Foreign Key  
- **UQ** — Unique Constraint  
- **NN** — NOT NULL  
- **DEF** — Default value  
- `→` in relationship column means "references"

---

## 2. Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEVMEET DATABASE ERD (Simplified)                    │
│                                                                             │
│  ┌───────────────┐        ┌─────────────┐       ┌──────────────────┐      │
│  │ user_profiles │──1:1──▶│  user_plans │       │  usage_quotas    │      │
│  │     (core)    │──1:1──▶│             │       │                  │      │
│  │               │──1:1──▶└─────────────┘       └──────────────────┘      │
│  │               │                                                         │
│  │               │──1:N──▶┌─────────────┐                                 │
│  │               │        │  sessions   │──1:N──▶┌────────────────────┐  │
│  │               │        │             │        │ conversation_turns  │  │
│  │               │        │             │──1:N──▶├────────────────────┤  │
│  │               │        │             │        │  code_submissions   │  │
│  │               │        │             │──1:1──▶├────────────────────┤  │
│  │               │        └─────────────┘        │  feedback_reports  │  │
│  │               │                               └────────────────────┘  │
│  │               │──1:N──▶┌─────────────────┐                            │
│  │               │        │  analytics_events│                            │
│  │               │──1:N──▶├─────────────────┤                            │
│  │               │        │   audit_logs     │                            │
│  │               │──1:1──▶├─────────────────┤                            │
│  │               │        │  subscriptions   │──1:N──▶┌──────────────┐  │
│  │               │        └─────────────────┘         │billing_events│  │
│  │               │                                     └──────────────┘  │
│  │               │──1:N──▶┌─────────────┐                                │
│  │               │        │login_history│                                 │
│  └───────────────┘        └─────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Schema: Users & Auth

### 3.1 Table: `user_profiles`
**Owner Service:** Auth Service, User Service  
**Description:** Central user account table. All other user-related tables reference this via FK.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Unique user identifier |
| `email` | VARCHAR(320) | UQ, NN | — | Login email address |
| `password_hash` | TEXT | NULLABLE | — | bcrypt hash (null for OAuth-only users) |
| `display_name` | VARCHAR(100) | NN | — | Public display name |
| `avatar_url` | VARCHAR(500) | NULLABLE | — | S3 URL for profile picture |
| `bio` | TEXT | NULLABLE | — | User bio / about me |
| `target_companies` | TEXT[] | NN | `'{}'` | Array of target company names |
| `skills` | TEXT[] | NN | `'{}'` | Array of skill tags |
| `interview_reminder_enabled` | BOOLEAN | NN | `true` | Email reminder opt-in |
| `profile_public` | BOOLEAN | NN | `false` | Leaderboard visibility |
| `email_verified` | BOOLEAN | NN | `false` | Email verification status |
| `mfa_secret` | TEXT | NULLABLE | — | TOTP secret (encrypted at rest) |
| `mfa_enabled` | BOOLEAN | NN | `false` | MFA active flag |
| `mfa_backup_codes` | JSONB | NULLABLE | — | Hashed backup codes array |
| `google_id` | VARCHAR(255) | UQ, NULLABLE | — | Google OAuth2 subject ID |
| `github_id` | VARCHAR(255) | UQ, NULLABLE | — | GitHub OAuth2 user ID |
| `is_blocked` | BOOLEAN | NN | `false` | Admin block flag |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | — | Soft-delete timestamp |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Account creation time |
| `updated_at` | TIMESTAMPTZ | NN | `NOW()` | Last profile update |

**Indexes:** `idx_user_profiles_email`, `idx_user_profiles_google_id`, `idx_user_profiles_github_id`, `idx_user_profiles_created_at`, `idx_user_profiles_is_blocked`

---

### 3.2 Table: `user_plans`
**Owner Service:** User Service, Payment Service  
**Description:** One row per user, records current subscription plan.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `user_id` | UUID | PK, FK → `user_profiles.id` ON DELETE CASCADE | — | User reference |
| `plan` | VARCHAR(20) | NN, CHECK IN ('free','pro','enterprise') | `'free'` | Current plan |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Plan assignment time |
| `updated_at` | TIMESTAMPTZ | NN | `NOW()` | Last plan change |

---

### 3.3 Table: `usage_quotas`
**Owner Service:** User Service  
**Description:** Tracks daily and monthly interview usage per user.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `user_id` | UUID | PK, FK → `user_profiles.id` ON DELETE CASCADE | — | User reference |
| `interviews_today` | SMALLINT | NN | `0` | Count reset daily |
| `interviews_this_month` | SMALLINT | NN | `0` | Count reset monthly |
| `last_reset_date` | DATE | NN | `CURRENT_DATE` | Date of last daily reset |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Row creation |
| `updated_at` | TIMESTAMPTZ | NN | `NOW()` | Last increment |

---

### 3.4 Table: `login_attempts`
**Owner Service:** Auth Service  
**Description:** Brute-force protection — tracks failed login attempts per email.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PK | — | Auto-increment ID |
| `email` | VARCHAR(255) | NN, UQ | — | Email being attempted |
| `attempt_count` | INTEGER | — | `0` | Cumulative failed attempts |
| `locked_until` | TIMESTAMPTZ | NULLABLE | — | Lock expiry (null = not locked) |
| `last_attempt_at` | TIMESTAMPTZ | — | `NOW()` | Timestamp of last attempt |

**Index:** `idx_login_attempts_email`

---

### 3.5 Table: `login_history`
**Owner Service:** Auth Service  
**Description:** Successful login record for security audit and anomaly detection.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PK | — | Auto-increment ID |
| `user_id` | UUID | NN, FK → `user_profiles.id` ON DELETE CASCADE | — | User |
| `ip_address` | VARCHAR(45) | NN | — | Source IP (IPv4 or IPv6) |
| `location` | JSONB | NULLABLE | — | Geo data: `{city, country, lat, lng}` |
| `risk_score` | INTEGER | — | `0` | 0–100 anomaly score |
| `risk_level` | VARCHAR(20) | — | `'low'` | `low / medium / high` |
| `user_agent` | TEXT | NULLABLE | — | Browser / client user-agent |
| `login_time` | TIMESTAMPTZ | — | `NOW()` | Login timestamp |

**Index:** `idx_login_history_user`

---

### 3.6 Table: `password_resets`
**Owner Service:** Auth Service  
**Description:** One-time password reset tokens with expiry.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PK | — | Auto-increment ID |
| `user_id` | UUID | NN, FK → `user_profiles.id` ON DELETE CASCADE | — | User |
| `token` | VARCHAR(255) | UQ, NN | — | Secure random token (SHA-256 stored) |
| `expires_at` | TIMESTAMPTZ | NN | — | Token expiry (1 hour from creation) |
| `used` | BOOLEAN | — | `false` | Consumed flag |
| `created_at` | TIMESTAMPTZ | — | `NOW()` | Token creation time |

**Indexes:** `idx_password_resets_token`, `idx_password_resets_user`


---

## 4. Schema: Sessions & Interview Data

### 4.1 Table: `sessions`
**Owner Service:** Interview Orchestrator  
**Description:** Core interview session record. Tracks lifecycle from creation to completion.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Session identifier |
| `user_id` | UUID | NN, FK → `user_profiles.id` ON DELETE CASCADE | — | Session owner |
| `interview_type` | VARCHAR(30) | NN, CHECK IN ('dsa','behavioral','system_design') | — | Interview category |
| `difficulty` | VARCHAR(10) | NN, CHECK IN ('easy','medium','hard') | — | Difficulty level |
| `target_company` | VARCHAR(100) | NULLABLE | — | Optional company focus |
| `focus_area` | VARCHAR(200) | NULLABLE | — | Optional topic focus |
| `duration_minutes` | INTEGER | NN | `30` | Planned session duration |
| `status` | VARCHAR(20) | NN, CHECK IN ('created','in_progress','paused','completed','cancelled') | `'created'` | State machine status |
| `elapsed_seconds` | INTEGER | NN | `0` | Tracked time in session |
| `tab_switch_count` | INTEGER | NN | `0` | Proctor: tab switch violations |
| `paste_count` | INTEGER | NN | `0` | Proctor: paste violations |
| `recording_consent` | BOOLEAN | NN | `false` | User consented to video recording |
| `started_at` | TIMESTAMPTZ | NULLABLE | — | Timestamp of first start |
| `completed_at` | TIMESTAMPTZ | NULLABLE | — | Timestamp of completion |
| `paused_at` | TIMESTAMPTZ | NULLABLE | — | Timestamp of last pause |
| `last_heartbeat_at` | TIMESTAMPTZ | NULLABLE | — | Last client heartbeat |
| `s3_snapshot_key` | TEXT | NULLABLE | — | S3 key for video recording |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NN | `NOW()` | Last state change |

**Indexes:** `idx_sessions_user_id`, `idx_sessions_status`, `idx_sessions_user_status`, `idx_sessions_created_at`

---

### 4.2 Table: `conversation_turns`
**Owner Service:** Interview Orchestrator, AI Interviewer  
**Description:** Full message history for each session (AI + candidate turns).

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Turn identifier |
| `session_id` | UUID | NN, FK → `sessions.id` ON DELETE CASCADE | — | Parent session |
| `role` | VARCHAR(20) | NN, CHECK IN ('interviewer','candidate','ai','user') | — | Who spoke |
| `content` | TEXT | NN | — | Message text |
| `turn_number` | INTEGER | NN | — | Sequential turn index within session |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Turn timestamp |

**Indexes:** `idx_turns_session`, `idx_turns_session_number`

---

### 4.3 Table: `code_submissions`
**Owner Service:** Code Execution Service, Interview Orchestrator  
**Description:** Code submitted during a DSA interview with execution results.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Submission identifier |
| `session_id` | UUID | NN, FK → `sessions.id` ON DELETE CASCADE | — | Parent session |
| `language` | VARCHAR(50) | NN | — | Programming language |
| `code` | TEXT | NN | — | Submitted source code |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Submission timestamp |

**Index:** `idx_code_submissions_session`

---

## 5. Schema: Feedback

### 5.1 Table: `feedback_reports`
**Owner Service:** Feedback Service  
**Description:** AI-generated scored feedback for completed sessions. One report per session.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Report identifier |
| `session_id` | UUID | UQ, NN | — | Parent session (1:1) |
| `overall_score` | INTEGER | NN | — | Weighted score 0–100 |
| `communication_score` | INTEGER | NULLABLE | — | Clarity & articulation (0–100) |
| `problem_solving_score` | INTEGER | NULLABLE | — | Approach & edge cases (0–100) |
| `code_quality_score` | INTEGER | NULLABLE | — | Correctness & style (0–100, DSA only) |
| `time_complexity_score` | INTEGER | NULLABLE | — | Big-O analysis (0–100, DSA only) |
| `behavioral_score` | INTEGER | NULLABLE | — | STAR structure (0–100, behavioral only) |
| `detailed_feedback` | JSONB | NULLABLE | — | `{strengths[], improvements[], summary}` |
| `pdf_url` | VARCHAR(500) | NULLABLE | — | S3 URL to PDF report |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Report generation time |
| `updated_at` | TIMESTAMPTZ | NN | `NOW()` | Last update |

**Index:** `idx_feedback_session_id`

---

## 6. Schema: Analytics & Audit

### 6.1 Table: `analytics_events`
**Owner Service:** Analytics Service  
**Description:** High-volume event stream for all platform activity. Used for dashboards, funnels, and exports.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | SERIAL | PK | — | Auto-increment event ID |
| `event_type` | VARCHAR(50) | NN | — | e.g. `session_created`, `feedback_generated` |
| `user_id` | VARCHAR(100) | NULLABLE | — | User UUID as string (nullable for anon events) |
| `session_id` | VARCHAR(100) | NULLABLE | — | Session UUID as string |
| `properties` | JSONB | NULLABLE | — | Arbitrary event metadata |
| `ip_address` | VARCHAR(45) | NULLABLE | — | Client IP |
| `created_at` | TIMESTAMPTZ | — | `NOW()` | Event timestamp |

**Indexes:** `idx_analytics_event_type`, `idx_analytics_created_at`, `idx_analytics_user_id`, `idx_analytics_session_id`, `idx_analytics_user_type`, `idx_analytics_properties` (GIN)

**Common `event_type` values:**

| Event Type | Trigger | Key Properties |
|-----------|---------|---------------|
| `session_created` | New session | `interview_type`, `difficulty` |
| `session_started` | Session start | |
| `session_completed` | Session end | `duration_minutes` |
| `session_cancelled` | User cancelled | |
| `feedback_generated` | AI feedback ready | `overall_score` |
| `user_registered` | New account | |
| `user_login` | Login success | |
| `code_executed` | Code run | `language`, `exit_code` |
| `page_view` | Frontend navigation | `path` |

---

### 6.2 Table: `audit_logs`
**Owner Service:** Admin Service  
**Description:** Security and compliance audit trail for all administrative and sensitive actions.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Log entry ID |
| `user_id` | UUID | NULLABLE, FK → `user_profiles.id` ON DELETE SET NULL | — | Actor (null for system actions) |
| `action` | VARCHAR(100) | NN | — | Action code e.g. `user.blocked`, `plan.changed` |
| `resource_type` | VARCHAR(50) | NN | — | `user`, `session`, `feedback`, `plan` |
| `resource_id` | UUID | NULLABLE | — | Target resource UUID |
| `ip_address` | INET | NULLABLE | — | Actor's IP address |
| `user_agent` | VARCHAR(500) | NULLABLE | — | Actor's browser/client |
| `metadata` | JSONB | NULLABLE | — | `{old_value, new_value, reason}` |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Action timestamp |

**Indexes:** `idx_audit_user_created`, `idx_audit_action`


---

## 7. Schema: Payments & Billing

### 7.1 Table: `subscriptions`
**Owner Service:** Payment Service  
**Description:** Active subscription record per user, linked to payment provider.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Subscription ID |
| `user_id` | UUID | NN, UQ | — | One subscription per user |
| `plan` | VARCHAR(20) | NN | `'free'` | `free / pro / enterprise` |
| `provider_customer_id` | VARCHAR(200) | NULLABLE | — | Razorpay/Stripe customer ID |
| `provider_subscription_id` | VARCHAR(200) | NULLABLE | — | Provider subscription ID |
| `status` | VARCHAR(30) | NN | `'active'` | `active / cancelled / past_due / expired` |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Subscription start |
| `updated_at` | TIMESTAMPTZ | NN | `NOW()` | Last status change |

**Index:** `idx_subscriptions_user`

---

### 7.2 Table: `billing_events`
**Owner Service:** Payment Service  
**Description:** Immutable payment history log.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Event ID |
| `user_id` | UUID | NN | — | User (no FK delete cascade — retain for audit) |
| `event_type` | VARCHAR(100) | NN | — | `payment.success`, `subscription.cancelled`, etc. |
| `plan` | VARCHAR(20) | NULLABLE | — | Plan at time of event |
| `amount` | INTEGER | NULLABLE | — | Amount in smallest currency unit (paise/cents) |
| `currency` | VARCHAR(10) | — | `'inr'` | ISO currency code |
| `provider_event_id` | VARCHAR(200) | NULLABLE | — | Provider webhook event ID |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Event timestamp |

**Index:** `idx_billing_events_user`

---

## 8. Schema: Infrastructure Tables

### 8.1 Table: `idempotency_records`
**Owner Service:** All services  
**Description:** Prevents duplicate processing of retried requests (idempotency keys).

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `key` | VARCHAR(255) | PK (composite with user_id) | — | Client-supplied idempotency key |
| `user_id` | UUID | PK (composite with key) | — | User scope |
| `endpoint` | VARCHAR(200) | NN | — | Request endpoint path |
| `request_hash` | VARCHAR(64) | NN | — | SHA-256 of request body |
| `status` | VARCHAR(20) | NN, CHECK IN ('processing','completed','failed') | `'processing'` | Processing state |
| `response_code` | INTEGER | NULLABLE | — | HTTP status of original response |
| `response_body` | JSONB | NULLABLE | — | Cached response body |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Key creation |
| `expires_at` | TIMESTAMPTZ | NN | `NOW() + 24h` | Key expiry (auto-cleaned) |

**Index:** `idx_idempotency_expires`

---

### 8.2 Table: `outbox_events`
**Owner Service:** All services (transactional outbox pattern)  
**Description:** Events written atomically with DB mutations, relayed to message broker by background worker.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | UUID | PK, NN | `gen_random_uuid()` | Outbox event ID |
| `event_type` | VARCHAR(100) | NN | — | Target broker event type |
| `aggregate_type` | VARCHAR(50) | NN | — | `session`, `user`, `feedback`, etc. |
| `aggregate_id` | UUID | NN | — | ID of the aggregate being changed |
| `payload` | JSONB | NN | — | Full event payload |
| `published` | BOOLEAN | NN | `false` | Relay status |
| `published_at` | TIMESTAMPTZ | NULLABLE | — | Relay timestamp |
| `created_at` | TIMESTAMPTZ | NN | `NOW()` | Write time |

---

## 9. Indexes

### 9.1 Full Index Inventory

| Index Name | Table | Column(s) | Type | Purpose |
|-----------|-------|-----------|------|---------|
| `idx_user_profiles_email` | `user_profiles` | `email` | BTREE | Login lookup |
| `idx_user_profiles_google_id` | `user_profiles` | `google_id` WHERE NOT NULL | BTREE | OAuth lookup |
| `idx_user_profiles_github_id` | `user_profiles` | `github_id` WHERE NOT NULL | BTREE | OAuth lookup |
| `idx_user_profiles_created_at` | `user_profiles` | `created_at` | BTREE | Admin user list sorting |
| `idx_user_profiles_is_blocked` | `user_profiles` | `is_blocked` WHERE true | BTREE | Partial — blocked user check |
| `idx_sessions_user_id` | `sessions` | `user_id` | BTREE | Per-user session list |
| `idx_sessions_status` | `sessions` | `status` | BTREE | Status filter queries |
| `idx_sessions_user_status` | `sessions` | `(user_id, status)` | BTREE | Composite — active session check |
| `idx_sessions_created_at` | `sessions` | `created_at` | BTREE | Date range queries |
| `idx_turns_session` | `conversation_turns` | `session_id` | BTREE | Fetch turns for session |
| `idx_turns_session_number` | `conversation_turns` | `(session_id, turn_number)` | BTREE | Ordered turn fetch |
| `idx_code_submissions_session` | `code_submissions` | `session_id` | BTREE | Submissions per session |
| `idx_feedback_session_id` | `feedback_reports` | `session_id` | BTREE | Feedback lookup by session |
| `idx_analytics_event_type` | `analytics_events` | `event_type` | BTREE | Filter by event type |
| `idx_analytics_created_at` | `analytics_events` | `created_at` | BTREE | Time-range analytics queries |
| `idx_analytics_user_id` | `analytics_events` | `user_id` | BTREE | Per-user event lookup |
| `idx_analytics_session_id` | `analytics_events` | `session_id` | BTREE | Per-session events |
| `idx_analytics_user_type` | `analytics_events` | `(user_id, event_type)` | BTREE | Composite — user funnel queries |
| `idx_analytics_properties` | `analytics_events` | `properties` | GIN | JSONB key/value search |
| `idx_audit_user_created` | `audit_logs` | `(user_id, created_at DESC)` | BTREE | Audit log by user + time |
| `idx_audit_action` | `audit_logs` | `action` | BTREE | Filter by action type |
| `idx_billing_events_user` | `billing_events` | `user_id` | BTREE | Billing history per user |
| `idx_subscriptions_user` | `subscriptions` | `user_id` | BTREE | Subscription lookup |
| `idx_login_attempts_email` | `login_attempts` | `email` | BTREE | Brute-force check |
| `idx_login_history_user` | `login_history` | `(user_id, login_time DESC)` | BTREE | Login history lookup |
| `idx_password_resets_token` | `password_resets` | `token` | BTREE | Token validation |
| `idx_password_resets_user` | `password_resets` | `user_id` | BTREE | Per-user reset lookup |
| `idx_idempotency_expires` | `idempotency_records` | `expires_at` | BTREE | Scheduled cleanup |

---

## 10. Relationships Summary

```
user_profiles  ──1:1──▶  user_plans           (ON DELETE CASCADE)
user_profiles  ──1:1──▶  usage_quotas         (ON DELETE CASCADE)
user_profiles  ──1:N──▶  sessions             (ON DELETE CASCADE)
user_profiles  ──1:N──▶  login_history        (ON DELETE CASCADE)
user_profiles  ──1:N──▶  password_resets      (ON DELETE CASCADE)
user_profiles  ──1:N──▶  audit_logs           (ON DELETE SET NULL)
user_profiles  ──1:1──▶  subscriptions        (user_id UQ)

sessions       ──1:N──▶  conversation_turns   (ON DELETE CASCADE)
sessions       ──1:N──▶  code_submissions     (ON DELETE CASCADE)
sessions       ──1:1──▶  feedback_reports     (session_id UQ)
```

### Cardinality Table

| Parent | Child | Cardinality | Cascade |
|--------|-------|------------|---------|
| `user_profiles` | `sessions` | 1 : N | DELETE CASCADE |
| `user_profiles` | `user_plans` | 1 : 1 | DELETE CASCADE |
| `user_profiles` | `usage_quotas` | 1 : 1 | DELETE CASCADE |
| `user_profiles` | `login_history` | 1 : N | DELETE CASCADE |
| `user_profiles` | `password_resets` | 1 : N | DELETE CASCADE |
| `user_profiles` | `audit_logs` | 1 : N | SET NULL |
| `sessions` | `conversation_turns` | 1 : N | DELETE CASCADE |
| `sessions` | `code_submissions` | 1 : N | DELETE CASCADE |
| `sessions` | `feedback_reports` | 1 : 1 | No FK (session_id only) |

---

## 11. Data Retention & Archival Policy

| Table | Retention | Action |
|-------|-----------|--------|
| `analytics_events` | 90 days | Scheduled DELETE WHERE created_at < NOW() - 90 days |
| `login_history` | 12 months | Scheduled DELETE WHERE login_time < NOW() - 1 year |
| `audit_logs` | 12 months | Scheduled DELETE WHERE created_at < NOW() - 1 year |
| `password_resets` | 7 days (used), 1 hour (unused, auto-expired) | Scheduled DELETE WHERE expires_at < NOW() |
| `idempotency_records` | 24 hours | Scheduled DELETE WHERE expires_at < NOW() |
| `outbox_events` | 7 days (published) | Scheduled DELETE WHERE published = true AND published_at < NOW() - 7 days |
| `billing_events` | 7 years | Never deleted (legal/tax requirement) |
| `user_profiles` | On account delete | Soft-delete (deleted_at), hard-delete after 30 days |
| `sessions`, `conversation_turns`, `feedback_reports` | Lifetime of account | Cascade-deleted on hard user delete |

---

*Authoritative DDL: `migrations/init_dev_schema.sql`. This document is generated from that file and must be kept in sync on schema changes.*
