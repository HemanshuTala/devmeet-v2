# Database Schema

## Tables

### user_profiles
User account information and profile data.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt |
| display_name | VARCHAR(100) | NOT NULL | |
| avatar_url | VARCHAR(500) | NULLABLE | S3 URL |
| bio | TEXT | NULLABLE | |
| target_companies | TEXT[] | NULLABLE | Array of company names |
| skills | TEXT[] | NULLABLE | Array of skills |
| interview_reminder_enabled | BOOLEAN | NOT NULL, DEFAULT true | |
| profile_public | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### user_plans
User subscription plan (manual assignment, no payment).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| user_id | UUID | PK, FK user_profiles | One plan per user |
| plan | ENUM('free','pro','enterprise') | NOT NULL, DEFAULT 'free' | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### usage_quotas
Interview quota tracking per user.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| user_id | UUID | PK, FK user_profiles | |
| interviews_today | SMALLINT | NOT NULL, DEFAULT 0 | Reset daily |
| interviews_this_month | SMALLINT | NOT NULL, DEFAULT 0 | Reset monthly |
| last_reset_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### sessions
Interview session records.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| user_id | UUID | NOT NULL, FK user_profiles | |
| mode | ENUM('dsa','behavioral','system_design') | NOT NULL | |
| difficulty | ENUM('easy','medium','hard') | NOT NULL | |
| language | VARCHAR(50) | NOT NULL | |
| status | ENUM('created','active','paused','completed','reviewed') | NOT NULL, DEFAULT 'created' | |
| started_at | TIMESTAMPTZ | NULLABLE | |
| ended_at | TIMESTAMPTZ | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### conversation_turns
AI conversation history.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| session_id | UUID | NOT NULL, FK sessions | |
| turn_index | INTEGER | NOT NULL | |
| role | ENUM('ai','user') | NOT NULL | |
| content | TEXT | NOT NULL | |
| tokens_used | INTEGER | NULLABLE | Groq token count |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### code_submissions
Code execution records.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| session_id | UUID | NOT NULL, FK sessions | |
| turn_id | UUID | NOT NULL, FK conversation_turns | |
| language | VARCHAR(50) | NOT NULL | |
| code | TEXT | NOT NULL | |
| stdout | TEXT | NULLABLE | |
| stderr | TEXT | NULLABLE | |
| exit_code | INTEGER | NULLABLE | |
| execution_time_ms | INTEGER | NULLABLE | |
| memory_used_kb | INTEGER | NULLABLE | |
| passed_tests | INTEGER | NULLABLE | |
| total_tests | INTEGER | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### feedback_reports
AI-generated feedback reports.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| session_id | UUID | UNIQUE, NOT NULL, FK sessions | |
| overall_score | INTEGER | NOT NULL | 0-100 |
| communication_score | INTEGER | NULLABLE | 0-100 |
| problem_solving_score | INTEGER | NULLABLE | 0-100 |
| code_quality_score | INTEGER | NULLABLE | 0-100 |
| time_complexity_score | INTEGER | NULLABLE | 0-100 |
| behavioral_score | INTEGER | NULLABLE | 0-100 |
| detailed_feedback | JSONB | NULLABLE | |
| pdf_url | VARCHAR(500) | NULLABLE | S3 URL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### audit_logs
System audit trail.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| user_id | UUID | NULLABLE, FK user_profiles | |
| action | VARCHAR(100) | NOT NULL | |
| resource_type | VARCHAR(50) | NOT NULL | |
| resource_id | UUID | NULLABLE | |
| ip_address | INET | NULLABLE | |
| user_agent | VARCHAR(500) | NULLABLE | |
| metadata | JSONB | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

## Indexes

- `user_profiles`: idx_email (email)
- `sessions`: idx_sessions_user_id (user_id), idx_sessions_status (status), idx_sessions_expires_at (ended_at)
- `conversation_turns`: idx_turns_session_id (session_id), idx_turns_session_id_index (session_id, turn_index)
- `session_events`: idx_events_session_id (session_id)
- `audit_logs`: idx_audit_user_created (user_id, created_at DESC)
- `feedback_reports`: idx_feedback_session_id (session_id)
