# LLD — Database Schema Diagram
**File:** `LLD-DB-Schema.drawio`  
**Document Number:** DevMeet-DB-001  
**Diagram Type:** UML Class Diagram (Entity-Relationship, Crow's Foot notation)  
**How to open:** [draw.io](https://app.diagrams.net) → File → Open → select the `.drawio` file.

---

## What This Diagram Shows

The complete PostgreSQL 16 database schema for DevMeet — every table, every column, every foreign key relationship. It is the single source of truth for what data is stored and how tables relate to each other.

The authoritative SQL DDL is in `migrations/init_dev_schema.sql`.

---

## How to Read This Diagram

### Table boxes
Each table is drawn as a two-part box:
- **Header (coloured)** — table name
- **Body (white)** — columns listed one per line

### Column annotations

| Prefix | Meaning |
|--------|---------|
| `PK` | Primary Key — uniquely identifies each row |
| `FK` | Foreign Key — references the primary key of another table |
| `UQ` | Unique Constraint — value must not duplicate any other row |
| `PK FK` | This column is both the PK of this table AND a FK to another |
| `UQ FK` | Unique Foreign Key — a 1:1 relationship |
| *(no prefix)* | Regular column |

### Relationship arrows (Crow's Foot notation)

| Arrow | Cardinality | Meaning |
|-------|-------------|---------|
| `──|──` (single bar) | Mandatory one | Exactly one row on this side |
| `──o{──` (crow's foot) | Zero or many | Zero or more rows on this side |
| `──|o──` | Zero or one | Optional single row |
| Dashed line | `ON DELETE SET NULL` | When parent is deleted, FK becomes NULL instead of cascade |

---

## Tables — Domain Groups

### Group 1 — Users & Auth (blue headers)

#### `user_profiles`
The central user table. Every other user-related table references this.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated with `gen_random_uuid()` |
| `email` | VARCHAR(320) UQ | Login email — must be unique |
| `password_hash` | TEXT | bcrypt hash. NULL for OAuth-only accounts |
| `display_name` | VARCHAR(100) | Public name shown in the UI |
| `avatar_url` | VARCHAR(500) | S3 URL of profile picture |
| `skills` | TEXT[] | Array of skill tags e.g. `{Python, React}` |
| `mfa_enabled` | BOOLEAN | Whether TOTP is active |
| `google_id` / `github_id` | VARCHAR(255) UQ | OAuth2 provider subject IDs |
| `is_blocked` | BOOLEAN | Admin can block accounts |
| `deleted_at` | TIMESTAMPTZ | Soft-delete timestamp (NULL = active) |

#### `user_plans`
One row per user — their current subscription tier.

| Column | Notes |
|--------|-------|
| `user_id` PK FK | Points to `user_profiles.id`. 1:1 relationship |
| `plan` | `free` / `pro` / `enterprise` |

#### `usage_quotas`
Tracks how many interviews a user has done today and this month.

| Column | Notes |
|--------|-------|
| `user_id` PK FK | 1:1 with `user_profiles` |
| `interviews_today` | Reset to 0 at midnight |
| `interviews_this_month` | Reset to 0 on the 1st |
| `last_reset_date` | Used to detect when a reset is needed |

---

### Group 2 — Auth Support (yellow headers)

#### `login_history`
A log of every successful login — used for security audit and anomaly detection.

| Column | Notes |
|--------|-------|
| `id` | SERIAL auto-increment |
| `user_id` FK | References `user_profiles` |
| `ip_address` | Where the login came from |
| `risk_score` | 0–100 anomaly score (unusual location, new device etc.) |
| `risk_level` | `low` / `medium` / `high` |

#### `password_resets`
One-time tokens for the "Forgot Password" flow.

| Column | Notes |
|--------|-------|
| `token` UQ | SHA-256 of the reset link token |
| `expires_at` | 1 hour from creation |
| `used` | Set to true once consumed — cannot be reused |

---

### Group 3 — Sessions & Interview Data (green headers)

#### `sessions`
The core interview session record. One row = one interview attempt.

| Column | Notes |
|--------|-------|
| `user_id` FK | Who this session belongs to |
| `interview_type` | `dsa` / `behavioral` / `system_design` |
| `difficulty` | `easy` / `medium` / `hard` |
| `status` | The state machine value — see Orchestration diagram |
| `elapsed_seconds` | How much of the timer has been used (survives pauses) |
| `tab_switch_count` | Proctoring: how many times user left the tab |
| `paste_count` | Proctoring: how many times user pasted code |
| `recording_consent` | Whether user agreed to video recording |
| `last_heartbeat_at` | Updated every 30 s — used to detect abandoned sessions |
| `s3_snapshot_key` | S3 path to the video recording file |

#### `conversation_turns`
Every message exchanged during a session — both AI and user sides.

| Column | Notes |
|--------|-------|
| `session_id` FK | Which session this turn belongs to |
| `role` | `ai` (AI question/comment) or `user` (candidate answer) |
| `content` | The full message text |
| `turn_number` | Sequential order within the session |

#### `code_submissions`
Code submitted for execution during DSA sessions.

| Column | Notes |
|--------|-------|
| `session_id` FK | Which session |
| `language` | e.g. `python`, `javascript`, `java` |
| `code` | The full source code text |

---

### Group 4 — Feedback (red/pink headers)

#### `feedback_reports`
AI-generated scored report for each completed session. One report per session (1:1).

| Column | Notes |
|--------|-------|
| `session_id` UQ FK | Links to `sessions` — unique constraint enforces 1:1 |
| `overall_score` | 0–100 weighted average |
| `communication_score` | 0–100 |
| `problem_solving_score` | 0–100 |
| `code_quality_score` | 0–100 (DSA only, else 0) |
| `time_complexity_score` | 0–100 (DSA only, else 0) |
| `behavioral_score` | 0–100 (behavioral only, else 0) |
| `detailed_feedback` | JSONB: `{strengths[], improvements[], summary}` |
| `pdf_url` | S3 URL to the generated PDF report |

---

### Group 5 — Analytics & Audit (orange headers)

#### `analytics_events`
Every trackable event on the platform — high-volume append-only log.

| Column | Notes |
|--------|-------|
| `event_type` | e.g. `session_created`, `feedback_generated`, `user_login` |
| `user_id` | String (not UUID FK) — allows anonymous events |
| `properties` | JSONB — flexible event metadata (e.g. `{overall_score: 72}`) |

Has a **GIN index** on `properties` for fast JSONB queries.

#### `audit_logs`
Security and compliance log of all admin actions.

| Column | Notes |
|--------|-------|
| `user_id` FK (SET NULL) | Dashed arrow — if user is hard-deleted, log is kept but `user_id` becomes NULL |
| `action` | e.g. `user.blocked`, `plan.changed`, `user.impersonated` |
| `resource_type` | What was affected: `user`, `session`, `plan` |
| `metadata` | JSONB — old/new values |

---

### Group 6 — Payments (purple headers)

#### `subscriptions`
Current subscription state per user (1:1 with `user_profiles`).

| Column | Notes |
|--------|-------|
| `user_id` UQ FK | One subscription per user |
| `plan` | `free` / `pro` / `enterprise` |
| `provider_customer_id` | Razorpay/Stripe customer ID |
| `status` | `active` / `cancelled` / `past_due` / `expired` |

#### `billing_events`
Immutable payment history — never deleted (legal requirement).

| Column | Notes |
|--------|-------|
| `user_id` | No FK CASCADE — retained even if user is deleted |
| `event_type` | e.g. `payment.success`, `subscription.cancelled` |
| `amount` | In paise (INR) or cents (USD) |

---

### Group 7 — Infrastructure (grey headers)

#### `outbox_events`
Transactional outbox pattern — events written to DB in the same transaction as the data change, then relayed to RabbitMQ/Kafka by a background worker. Guarantees no lost messages.

#### `login_attempts`
Brute-force protection. Tracks failed login count per email. Account locked after 5 failures (configurable).

---

## Relationships Summary

| Parent Table | Child Table | Type | On Delete |
|-------------|-------------|------|-----------|
| `user_profiles` | `user_plans` | 1:1 | CASCADE |
| `user_profiles` | `usage_quotas` | 1:1 | CASCADE |
| `user_profiles` | `sessions` | 1:N | CASCADE |
| `user_profiles` | `login_history` | 1:N | CASCADE |
| `user_profiles` | `password_resets` | 1:N | CASCADE |
| `user_profiles` | `subscriptions` | 1:1 | CASCADE |
| `user_profiles` | `audit_logs` | 1:N | SET NULL |
| `sessions` | `conversation_turns` | 1:N | CASCADE |
| `sessions` | `code_submissions` | 1:N | CASCADE |
| `sessions` | `feedback_reports` | 1:1 | — |

**CASCADE** = when parent row is deleted, all child rows are also deleted.  
**SET NULL** = when parent row is deleted, the FK column becomes NULL (audit logs are kept).
