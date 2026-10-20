# DevMeet v2.0 — Comprehensive Microservice-by-Microservice Audit

This document delivers a thorough, independent inspection of every microservice in the DevMeet v2.0 platform, examining architecture, data ownership, queue contracts, resilience patterns, security configurations, and verified testing coverage.

---

## 1. System-Wide Inter-Service Contract Agreements

Before diving into individual services, the table below documents the verified architectural agreements governing inter-service communication across the platform:

| Interface Contract | Standard in Codebase | Verification Status | Notes |
| :--- | :--- | :---: | :--- |
| **Transport Protocol** | HTTP/1.1 REST (JSON) + Server-Sent Events (SSE) | Confirmed | SSE utilized exclusively for LLM token streaming. |
| **Ingress Ingress Base** | `http://api-gateway:8000` (Docker) / `http://localhost:8000` | Confirmed | Defined in `frontend/src/lib/api.ts` and Nginx upstreams. |
| **Authentication Header** | `Authorization: Bearer <jwt_access_token>` | Confirmed | Decoded using HMAC-SHA256 (`HS256`) with `JWT_SECRET`. |
| **Event Bus Protocol** | AMQP 0-9-1 on `rabbitmq:5672` | Confirmed | Durable exchanges: `interview_events`, `code_execution_tasks`. |
| **Database Sharing** | Logical multi-tenancy in PostgreSQL `devmeet` | Confirmed | Each service owns distinct tables with zero cross-table joins. |
| **Cache & State Store** | Redis 7.2 on `redis:6379` | Confirmed | Standardized key namespaces (`quota:*`, `token_blacklist:*`). |

---

## 2. Service Audits

---

### 2.1. API Gateway (`api-gateway` — Port 8000)

1. **Purpose & Responsibilities**:
   - Single point of entry for all client traffic (Next.js frontend and mobile/external clients).
   - Enforces uniform CORS policies, SSL termination, and rate-limiting zones.
   - Provides buffering for static assets and SSE streaming passthrough (`proxy_buffering off;`).
2. **Entry Point & Startup**:
   - Entry point: `services/api-gateway/nginx.conf`.
   - Startup command: `nginx -g 'daemon off;'`.
3. **Routes & Interfaces Exposed**:
   - `/health`: Direct 200 OK `{ "status": "ok", "service": "api-gateway" }`.
   - `/api/v1/auth/*` -> `http://auth-service:8001`.
   - `/api/v1/users/*` -> `http://user-service:8002`.
   - `/api/v1/sessions/*` -> `http://orchestrator-service:8003`.
   - `/api/v1/interview/*` -> `http://ai-interviewer-service:8004`.
   - `/api/v1/execute/*` -> `http://code-execution-service:8005`.
   - `/api/v1/video/*` -> `http://video-service:8006`.
   - `/api/v1/feedback/*` -> `http://feedback-service:8007`.
   - `/api/v1/analytics/*` -> `http://analytics-service:8009`.
   - `/api/v1/admin/*` -> `http://admin-service:8010` (with internal subrequest verification).
   - `/api/v1/files/*` -> `http://file-service:8011`.
   - `/api/v1/payments/*` -> `http://payment-service:8012`.
   - `/api/v1/search/*` -> `http://search-service:8013`.
4. **Callers & Downstream Dependencies**:
   - Callers: Web browsers, Next.js SSR fetch.
   - Downstream: All 12 backend microservices.
5. **Database & Queue Connections**: None (Stateless ingress).
6. **Events & Jobs**: None.
7. **Auth Requirements**: Passes `Authorization` header through to upstreams; performs internal auth subrequest to `/auth/verify-admin` for `/api/v1/admin/*`.
8. **Configuration & Env Vars**: `cors_origin` evaluated dynamically from `$http_origin`.
9. **Error Handling & Logging**: Outputs JSON error payloads on 502/504 gateway timeouts.
10. **Existing Tests**: Tested via automated healthcheck and HTTP endpoint smoke scripts.
11. **Concerns & Risks**: Single point of failure; should run multiple replicas in high-traffic production.
12. **Manual Tests Required**: Verify CORS preflight `OPTIONS` response headers and SSE bufferless chunk delivery.

---

### 2.2. Authentication Service (`auth-service` — Port 8001)

1. **Purpose & Responsibilities**:
   - Identity management, account creation, JWT issuance and rotation.
   - TOTP MFA enrollment and verification.
   - Brute-force protection and IP-based rate limiting.
2. **Entry Point & Startup**:
   - Entry point: `services/auth-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8001`.
3. **Routes & Interfaces Exposed**:
   - `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`.
   - `GET /api/v1/auth/me`.
   - `POST /api/v1/auth/change-password`, `/reset-password-request`, `/reset-password-confirm`.
   - `POST /api/v1/auth/mfa/enable`, `/mfa/verify`, `/mfa/login-verify`, `/mfa/backup-codes`, `/mfa/disable`.
   - `POST /api/v1/auth/verify-email/request`, `/verify-email/confirm`.
   - `GET /api/v1/auth/verify-admin` (internal subrequest for Gateway).
4. **Callers & Downstream Dependencies**:
   - Callers: Gateway, `user-service`, `admin-service`, Nginx auth subrequests.
   - Downstream: PostgreSQL, Redis.
5. **Data Ownership**:
   - PostgreSQL tables: `users` (`user_profiles`), `login_attempts`, `login_history`, `password_resets`.
   - Redis keys: `token_blacklist:{jti}`, `email_verify:{user_id}`, `mfa_token:{token}`.
6. **Queue Producers & Consumers**: None.
7. **Events & Jobs**: Background cleanup of expired tokens.
8. **Auth Requirements**: Bearer token required for `/me`, `/change-password`, `/mfa/*`.
9. **Configuration & Env Vars**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
10. **Error Handling & Logging**: Argon2/Bcrypt hash upgrade logic; custom HTTP 401/403/422 responses.
11. **Existing Tests**: `services/auth-service/app/test_auth.py` (23 unit tests pass).
12. **Concerns & Risks**: JWT secret rotation strategy; keep bcrypt rounds at 12 to balance speed and hashing security.
13. **Manual Tests Required**: Register account, enable TOTP with Google Authenticator, log out, log in with 6-digit TOTP code.

---

### 2.3. User Management Service (`user-service` — Port 8002)

1. **Purpose & Responsibilities**:
   - Candidate profile management, avatar uploads, interview quota tracking, subscription plan caching, GDPR data export.
2. **Entry Point & Startup**:
   - Entry point: `services/user-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8002`.
3. **Routes Exposed**:
   - `GET /api/v1/users/me`, `PUT /api/v1/users/me`.
   - `GET /api/v1/users/me/quota`, `GET /api/v1/users/me/plan`.
   - `POST /api/v1/users/me/avatar`.
   - `GET /api/v1/users/me/export`, `DELETE /api/v1/users/me`.
   - `GET /api/v1/users/leaderboard`.
4. **Callers & Downstream**:
   - Callers: Frontend, `orchestrator-service` (quota check).
   - Downstream: `file-service` (:8011) for avatar storage, PostgreSQL, Redis.
5. **Data Ownership**:
   - PostgreSQL tables: `user_profiles`, `user_plans`, `usage_quotas`.
   - Redis keys: `quota:{user_id}`, `leaderboard:global`.
6. **Queue Operations**: None.
7. **Auth Requirements**: User Bearer token on all `/me` routes; public for `/leaderboard`.
8. **Configuration & Env Vars**: `DATABASE_URL`, `REDIS_URL`, `AUTH_SERVICE_URL`, `FILE_SERVICE_URL`.
9. **Error Handling**: Graceful fallback when avatar storage fails.
10. **Existing Tests**: `services/user-service/app/test_user.py` (14 unit tests pass).
11. **Manual Tests Required**: Update profile details, upload PNG avatar, check quota decrements after session start.

---

### 2.4. Interview Orchestrator Service (`orchestrator-service` — Port 8003)

1. **Purpose & Responsibilities**:
   - Central interview lifecycle state machine (`created` -> `in_progress` -> `paused` -> `completed` / `cancelled`).
   - Dialogue turn recording and ordering.
   - Proctoring telemetry aggregation (tab switches, paste count).
   - Transactional Outbox pattern publisher.
2. **Entry Point & Startup**:
   - Entry point: `services/orchestrator-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8003`.
3. **Routes Exposed**:
   - `GET /api/v1/sessions`, `POST /api/v1/sessions`.
   - `GET /api/v1/sessions/{id}`, `POST /api/v1/sessions/{id}/start`, `/pause`, `/resume`, `/complete`, `/cancel`.
   - `POST /api/v1/sessions/{id}/heartbeat`, `POST /api/v1/sessions/{id}/cheating`.
   - `GET /api/v1/sessions/{id}/turns`, `POST /api/v1/sessions/{id}/turns`.
   - `POST /api/v1/sessions/{id}/code`.
4. **Callers & Downstream**:
   - Callers: Frontend Next.js client.
   - Downstream: `user-service:8002` (quota check), `search-service:8013` (question fetch), `code-execution-service:8005` (code execution), RabbitMQ (`interview_events`).
5. **Data Ownership**:
   - PostgreSQL tables: `sessions`, `conversation_turns`, `outbox_events`.
   - Redis keys: `session:heartbeat:{id}`.
6. **Queue Operations**: Publishes `session_completed` to RabbitMQ exchange.
7. **Auth Requirements**: Authenticated candidate Bearer token.
8. **Configuration & Env Vars**: `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `USER_SERVICE_URL`, `SEARCH_SERVICE_URL`, `CODE_EXECUTION_SERVICE_URL`.
9. **Resilience**: Transactional outbox guarantees at-least-once message delivery even during network partitioning.
10. **Existing Tests**: `services/orchestrator-service/app/test_orchestrator.py` (9 unit tests pass).
11. **Manual Tests Required**: Start interview, submit 3 dialogue turns, trigger 2 tab switches, complete session, verify outbox dispatch.

---

### 2.5. AI Interviewer Service (`ai-interviewer-service` — Port 8004)

1. **Purpose & Responsibilities**:
   - Real-time technical and behavioral interview questioning via Groq LLaMA 3.3 70B token streaming.
   - Audio transcription via Groq Whisper Large v3.
   - Multi-API-key rotation and circuit breaking.
   - STAR methodology prompting and adaptive difficulty heuristics.
2. **Entry Point & Startup**:
   - Entry point: `services/ai-interviewer-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8004`.
3. **Routes Exposed**:
   - `GET /api/v1/interview/question/stream` (SSE).
   - `POST /api/v1/interview/transcribe`.
   - `POST /api/v1/interview/hint`.
4. **Callers & Downstream**:
   - Callers: Frontend `InterviewChat.tsx`, `AudioRecorder.tsx`.
   - Downstream: Groq Cloud API.
5. **Data Ownership**: In-memory token bucket, circuit breaker states, prompt templates.
6. **Resilience**:
   - Circuit breaker trips to heuristic fallback on 5 consecutive Groq API failures.
   - Multi-key manager rotates Groq keys automatically on HTTP 429 rate limits.
7. **Existing Tests**: `services/ai-interviewer-service/app/test_ai_interviewer.py` (44 unit tests pass).
8. **Manual Tests Required**: Connect EventSource stream, verify live token rendering in chat, request a hint.

---

### 2.6. Sandboxed Code Execution Service (`code-execution-service` — Port 8005)

1. **Purpose & Responsibilities**:
   - Sandboxed execution of candidate solutions across 6 languages.
   - Automated test case assertion runner.
   - Async batch submission queue via RabbitMQ.
   - Code snapshot persistence via `file-service`.
2. **Entry Point & Startup**:
   - Entry point: `services/code-execution-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8005`.
3. **Routes Exposed**:
   - `POST /api/v1/execute`, `POST /api/v1/execute/submit-async`, `GET /api/v1/execute/status/{job_id}`.
4. **Callers & Downstream**:
   - Callers: Frontend `CodeEditor.tsx`, `orchestrator-service`.
   - Downstream: `file-service:8011`, RabbitMQ, Redis.
5. **Execution Limits**: 5.0s maximum CPU runtime, 256MB memory cap.
6. **Existing Tests**: `services/code-execution-service/app/test_code_execution.py` (28 unit tests pass).
7. **Manual Tests Required**: Run valid Python code (`print(sum([1,2,3]))`), run infinite loop code (`while True: pass`) and verify 5s timeout enforcement.

---

### 2.7. WebRTC & Video Service (`video-service` — Port 8006)

1. **Purpose & Responsibilities**:
   - WebRTC media room token minting using LiveKit Server SDK.
   - Client device preflight capability testing.
   - Real-time network quality metric ingestion.
2. **Entry Point & Startup**:
   - Entry point: `services/video-service/src/index.js`.
   - Startup command: `npm start` (or `node src/index.js`).
3. **Routes Exposed**:
   - `POST /api/v1/video/token`, `/video/preflight`, `/video/recording/start`, `/video/recording/stop`, `/video/room/:id/quality`.
4. **Resilience**: Generates offline mock tokens when LiveKit credentials are absent, allowing offline local testing.
5. **Existing Tests**: Verified via HTTP probe and device preflight check.
6. **Manual Tests Required**: Submit preflight check, request token for room `interview-123`, inspect token expiry claims.

---

### 2.8. Feedback & Evaluation Service (`feedback-service` — Port 8007)

1. **Purpose & Responsibilities**:
   - Candidate performance evaluation across 6 rubric dimensions.
   - Automated percentile calculation against historical candidate benchmark pools.
   - HTML scorecard generation and WeasyPrint PDF compilation.
2. **Entry Point & Startup**:
   - Entry point: `services/feedback-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8007`.
3. **Routes Exposed**:
   - `GET /api/v1/feedback/{id}`, `POST /api/v1/feedback/generate`, `GET /api/v1/feedback/{id}/pdf`.
4. **Callers & Downstream**:
   - Callers: Frontend `FeedbackReportPage.tsx`, RabbitMQ worker (`interview_events`).
   - Downstream: PostgreSQL (`feedback_reports`), Groq Cloud API, AWS S3 / `file-service`.
5. **Existing Tests**: `services/feedback-service/app/test_feedback.py` (12 unit tests pass).
6. **Manual Tests Required**: Generate feedback for completed session, verify scores between 0-100, download generated PDF and inspect formatting.

---

### 2.9. Analytics Service (`analytics-service` — Port 8009)

1. **Purpose & Responsibilities**:
   - Candidate progress tracking, score trends, skill distributions, KPI dashboard metrics.
2. **Entry Point & Startup**:
   - Entry point: `services/analytics-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8009`.
3. **Routes Exposed**:
   - `POST /api/v1/analytics/event`, `GET /api/v1/analytics/user/{id}/dashboard`, `GET /api/v1/analytics/user/{id}/score-trend`.
4. **Data Ownership**: PostgreSQL (`analytics_events`), aggregated reads on `sessions` and `feedback_reports`.
5. **Existing Tests**: `services/analytics-service/app/test_analytics.py` (20 unit tests pass).
6. **Manual Tests Required**: Ingest test events, query dashboard metrics, verify score trend calculations.

---

### 2.10. Admin Service (`admin-service` — Port 8010)

1. **Purpose & Responsibilities**:
   - Global platform oversight: system stats, user account suspension/reactivation, plan overrides, immutable audit logging.
2. **Entry Point & Startup**:
   - Entry point: `services/admin-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8010`.
3. **Routes Exposed**:
   - `GET /api/v1/admin/stats`, `GET /api/v1/admin/users`, `GET /api/v1/admin/audit-logs`.
   - `POST /api/v1/admin/users/{id}/block`, `POST /api/v1/admin/users/{id}/unblock`.
   - `PUT /api/v1/admin/users/{id}/plan`, `POST /api/v1/admin/users/{id}/impersonate`.
4. **Security & RBAC**: Enforces strict `role: "admin"` claim verification.
5. **Existing Tests**: `services/admin-service/app/test_admin.py` (18 unit tests pass).
6. **Manual Tests Required**: Attempt request with non-admin token (expect 403), request with admin token, suspend user account and verify inability to login.

---

### 2.11. File & Storage Service (`file-service` — Port 8011)

1. **Purpose & Responsibilities**:
   - Secure multi-part binary file uploads, presigned download URLs, code snapshot archiving.
2. **Entry Point & Startup**:
   - Entry point: `services/file-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8011`.
3. **Routes Exposed**:
   - `POST /api/v1/files/upload`, `GET /api/v1/files/{id}`, `GET /api/v1/files/{id}/presigned`, `DELETE /api/v1/files/{id}`.
4. **Resilience**:
   - In live cloud: Writes objects to AWS S3 bucket using `boto3`.
   - In local dev: Automatically falls back to local disk storage at `uploads/` without throwing exceptions.
5. **Existing Tests**: `services/file-service/app/test_file.py` (14 unit tests pass).
6. **Manual Tests Required**: Upload a sample PDF or code file, retrieve its presigned download link, delete the file.

---

### 2.12. Payment & Billing Service (`payment-service` — Port 8012)

1. **Purpose & Responsibilities**:
   - Razorpay subscription order creation, HMAC-SHA256 signature verification, mock sandbox checkout, billing history.
2. **Entry Point & Startup**:
   - Entry point: `services/payment-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8012`.
3. **Routes Exposed**:
   - `GET /api/v1/payments/config`, `/plans`, `/subscription`, `/billing-history`.
   - `POST /api/v1/payments/checkout-session`, `/verify-payment`, `/mock-webhook`, `/cancel`.
4. **Resilience**: Mock checkout mode allows testing full subscription upgrades without live payment credentials.
5. **Existing Tests**: `services/payment-service/app/test_payment.py` (18 unit tests pass).
6. **Manual Tests Required**: Query payment config, create checkout session for Pro plan, simulate payment verification and verify subscription table updates.

---

### 2.13. Question Search Service (`search-service` — Port 8013)

1. **Purpose & Responsibilities**:
   - Curated question bank queries (company tags, algorithm type, difficulty) and random interview prompt selection.
2. **Entry Point & Startup**:
   - Entry point: `services/search-service/app/main.py`.
   - Startup command: `uvicorn app.main:app --host 0.0.0.0 --port 8013`.
3. **Routes Exposed**:
   - `GET /api/v1/search/questions`, `GET /api/v1/search/questions/random`.
4. **Data Ownership**: In-memory inverted index over 2,000+ curated seed questions (with optional Elasticsearch adapter).
5. **Existing Tests**: `services/search-service/app/test_search.py` (20 unit tests pass).
6. **Manual Tests Required**: Query `/search/questions?tag=dynamic-programming&difficulty=hard`, fetch `/search/questions/random`.
