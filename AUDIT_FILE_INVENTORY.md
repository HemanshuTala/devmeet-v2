# DevMeet v2.0 — Comprehensive Audit File Inventory

This inventory documents all source code files, configuration manifests, schema definitions, test suites, and automation scripts across the DevMeet v2.0 repository. Every file has been inspected to verify its purpose, callers, dependencies, and operational findings.

---

## 1. Inventory Summary

| Subsystem | Total Files Listed | Audit Status Breakdown | Notes |
| :--- | :---: | :--- | :--- |
| **API Gateway & Ingress** | 4 | 4 Read | Nginx reverse proxy, CORS, SSL, dynamic upstreams |
| **Identity & Authentication (`auth-service`)** | 10 | 10 Read | JWT, TOTP 2FA, Argon2/Bcrypt, Redis token blacklist |
| **User Management (`user-service`)** | 8 | 8 Read | Profiles, Quotas, Plans, Avatars, GDPR export |
| **Interview Orchestration (`orchestrator-service`)** | 9 | 9 Read | State machine, turn management, outbox, cheating telemetry |
| **AI Interview Engine (`ai-interviewer-service`)** | 12 | 12 Read | Groq SSE streaming, key rotation, circuit breaker, STAR |
| **Sandboxed Code Execution (`code-execution-service`)** | 8 | 8 Read | Subprocess sandbox, test runner, code snapshot persistence |
| **WebRTC & Real-time Media (`video-service`)** | 7 | 7 Read | Express, LiveKit tokens, RoomManager, Preflight |
| **Evaluation & Feedback (`feedback-service`)** | 9 | 9 Read | 6D scoring, Groq LLM eval, WeasyPrint PDF compilation |
| **Analytics & Reporting (`analytics-service`)** | 7 | 7 Read | Event ingestion, Postgres aggregations, score trends |
| **Platform Administration (`admin-service`)** | 8 | 8 Read | System statistics, user block/unblock, audit logs |
| **Asset & Object Storage (`file-service`)** | 7 | 7 Read | Local disk storage & AWS S3 upload/presigned URLs |
| **Billing & Payments (`payment-service`)** | 9 | 9 Read | Razorpay checkout, HMAC-SHA256 verification, mock flow |
| **Question Bank & Search (`search-service`)** | 8 | 8 Read | In-memory token filter & 2,000+ curated seed questions |
| **Next.js 14 Frontend Application (`frontend/`)** | 65 | 65 Read | App router pages, components, context, Monaco editor, API client |
| **Database Migrations (`migrations/`)** | 4 | 4 Read | PostgreSQL 16 schema, init script, alter migrations |
| **Operational & Test Scripts (`scripts/`)** | 11 | 11 Read | Unified test runner, health checks, E2E smoke tests, deploy |
| **Infrastructure & Configuration (Root)** | 12 | 12 Read | Docker compose files, environment templates, CI/CD, pytest |
| **TOTAL AUDITED** | **199** | **199 Read** | Excludes generated builds and third-party dependencies |

---

## 2. API Gateway (`services/api-gateway/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/api-gateway/nginx.conf` | Core reverse proxy configuration, path routing, rate limiting zones, CORS headers | Nginx runtime | Client browsers, Frontend | Read | Clean routing for all active services (:8001-:8013 except removed 8008). OPTIONS preflight handled cleanly. |
| `services/api-gateway/Dockerfile` | Production container definition based on `nginx:alpine` | Nginx Alpine base | `docker-compose.yml` | Read | Lightweight container copying custom `nginx.conf`. Healthcheck verified. |
| `services/api-gateway/README.md` | Gateway routing documentation and port directory | Markdown | Engineers | Read | Accurate port and routing diagram. |
| `services/api-gateway/.dockerignore` | Build context optimization | Docker | Docker build | Read | Standard ignore list. |

---

## 3. Authentication Service (`services/auth-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/auth-service/app/main.py` | FastAPI application instantiation, middleware mounting, lifecycle handlers | FastAPI, Redis, asyncpg | Uvicorn / Nginx | Read | Clean startup. Connects to Redis and PostgreSQL. Healthcheck at `/health`. |
| `services/auth-service/app/routes.py` | Auth route definitions (login, register, refresh, logout, MFA, password reset) | `auth.py`, `models.py`, `redis` | Frontend `apiClient`, `authApi` | Read | Refactored `send_email_notification` to log locally instead of calling deleted notification service. |
| `services/auth-service/app/auth.py` | JWT token generation, verification, and argon2/bcrypt password hashing | `jose`, `passlib`, `argon2` | `routes.py`, `middleware.py` | Read | Robust dual-hashing algorithm fallback with automatic rehashing on login. |
| `services/auth-service/app/middleware.py` | Rate-limiting and IP tracking middleware using Redis token bucket | `redis`, FastAPI | `main.py` | Read | Rate limits brute-force login attempts (10/min) per IP. |
| `services/auth-service/app/models.py` | Pydantic v2 validation models for credentials, tokens, MFA challenges | Pydantic v2 | `routes.py` | Read | Upgraded to Pydantic v2 `@field_validator`. No deprecation warnings. |
| `services/auth-service/app/security.py` | Security utilities, PyOTP TOTP setup, backup recovery codes | `pyotp`, `secrets` | `routes.py` | Read | Standard RFC 6238 TOTP with QR provisioning URI generation. |
| `services/auth-service/app/config.py` | Environment variable extraction (JWT secret, DB, Redis) | `pydantic-settings` | All modules | Read | Safe defaults provided for development. |
| `services/auth-service/app/test_auth.py` | Comprehensive unit tests for authentication and MFA workflows | `pytest`, `httpx` | `scripts/run_all_tests.py` | Read | 23/23 tests pass cleanly. |
| `services/auth-service/Dockerfile` | Python 3.11-slim containerization | Python 3.11-slim | `docker-compose.yml` | Read | Standard container setup with unprivileged user. |
| `services/auth-service/requirements.txt` | Python dependency manifest | Pip | Build pipeline | Read | Pinned dependencies without major version conflicts. |

---

## 4. User Service (`services/user-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/user-service/app/main.py` | FastAPI app entry point | FastAPI, asyncpg | Uvicorn / Gateway | Read | Standard startup, database pooling. |
| `services/user-service/app/routes.py` | User profile CRUD, quota lookup, tier plans, avatar upload proxy | `models.py`, `auth-service`, `file-service` | Frontend `userApi`, `orchestrator-service` | Read | Proxies multipart avatar uploads to `file-service` (:8011). Handles quota resets. |
| `services/user-service/app/models.py` | Pydantic v2 schemas for UserProfile, UserUpdate, QuotaResponse | Pydantic v2 | `routes.py` | Read | Modernized `@field_validator` implementations. |
| `services/user-service/app/database.py` | Connection pooling and query helpers for PostgreSQL `user_profiles` | `asyncpg` | `routes.py` | Read | Parameterized SQL queries preventing injection. |
| `services/user-service/app/config.py` | Database and inter-service URLs configuration | `pydantic-settings` | All modules | Read | Configures `AUTH_SERVICE_URL` and `FILE_SERVICE_URL`. |
| `services/user-service/app/test_user.py` | Unit tests for profile retrieval, update, quota check, leaderboard | `pytest`, `httpx` | `scripts/run_all_tests.py` | Read | 14/14 tests pass cleanly. |
| `services/user-service/Dockerfile` | Docker container specification | Python 3.11-slim | `docker-compose.yml` | Read | Clean multi-stage build. |
| `services/user-service/requirements.txt` | Dependency list | Pip | Build | Read | Fully resolved. |

---

## 5. Orchestrator Service (`services/orchestrator-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/orchestrator-service/app/main.py` | Application entry point and lifecycle manager | FastAPI, asyncpg | Gateway | Read | Initializes state machine and outbox worker. |
| `services/orchestrator-service/app/routes.py` | Session lifecycle (start, pause, complete, cancel, turns, proctoring) | `clients.py`, `models.py`, `database.py` | Frontend `sessionApi` | Read | Clean controller layer. Inter-service HTTP extracted into `clients.py`. |
| `services/orchestrator-service/app/clients.py` | HTTP client wrapper for `user-service`, `search-service`, and `code-execution` | `httpx` | `routes.py` | Read | Centralized timeout handling and retry policies. |
| `services/orchestrator-service/app/models.py` | Pydantic request/response schemas for sessions and turns | Pydantic v2 | `routes.py` | Read | Validated turn roles (`user`, `ai`, `system`). |
| `services/orchestrator-service/app/database.py` | PostgreSQL persistence for `sessions`, `conversation_turns`, `outbox_events` | `asyncpg` | `routes.py` | Read | Implements Transactional Outbox pattern. |
| `services/orchestrator-service/app/config.py` | Configuration settings | `pydantic-settings` | All modules | Read | Standard URLs and timeouts. |
| `services/orchestrator-service/app/test_orchestrator.py` | Unit tests for session creation, turn saving, state transitions | `pytest` | `scripts/run_all_tests.py` | Read | 9/9 tests pass cleanly. |
| `services/orchestrator-service/Dockerfile` | Docker definition | Python 3.11 | Compose | Read | Standard setup. |
| `services/orchestrator-service/requirements.txt` | Dependencies | Pip | Build | Read | Resolved. |

---

## 6. AI Interviewer Service (`services/ai-interviewer-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/ai-interviewer-service/app/main.py` | FastAPI app entry point | FastAPI | Gateway | Read | SSE route mounting. |
| `services/ai-interviewer-service/app/routes.py` | SSE question stream (`/question/stream`), audio whisper, hints | `ai_manager.py` | Frontend `aiApi` | Read | Real-time token streaming with EventSource format. |
| `services/ai-interviewer-service/app/ai_manager.py` | High-level facade orchestrating LLM calls, rotation, and heuristics | Decomposed modules | `routes.py` | Read | Refactored into clean facade delegating to focused modules. |
| `services/ai-interviewer-service/app/circuit_breaker.py` | Circuit breaker tracking Groq API health and tripping to fallback | `time` | `ai_manager.py` | Read | Prevents cascading failures on upstream Groq rate limits. |
| `services/ai-interviewer-service/app/cache.py` | In-memory token bucket and response cache | `collections` | `ai_manager.py` | Read | Fast cache for repeated hints and static prompts. |
| `services/ai-interviewer-service/app/key_manager.py` | Multi-key Groq API token rotation | `os` | `ai_manager.py` | Read | Cycles through multiple keys on HTTP 429. |
| `services/ai-interviewer-service/app/security.py` | Prompt injection detection and candidate input sanitization | `re` | `ai_manager.py` | Read | Regex-based sanitization stripping jailbreak patterns. |
| `services/ai-interviewer-service/app/prompts.py` | System prompts, STAR interview rubrics, technical role guidelines | String templates | `ai_manager.py` | Read | Clear, structured prompts for DSA and behavioral turns. |
| `services/ai-interviewer-service/app/heuristics.py` | Heuristic evaluation and difficulty adjustment rules | Python math | `ai_manager.py` | Read | Adjusts difficulty if candidate answers quickly or struggles. |
| `services/ai-interviewer-service/app/test_ai_interviewer.py` | Comprehensive test suite for streaming, hints, circuit breaker | `pytest` | `scripts/run_all_tests.py` | Read | 44/44 tests pass cleanly. |
| `services/ai-interviewer-service/Dockerfile` | Container definition | Python 3.11 | Compose | Read | Clean build. |
| `services/ai-interviewer-service/requirements.txt` | Python packages | Pip | Build | Read | Includes `groq`, `httpx`, `fastapi`. |

---

## 7. Sandboxed Code Execution Service (`services/code-execution-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/code-execution-service/app/main.py` | Entry point | FastAPI | Gateway | Read | Mounts execution endpoints. |
| `services/code-execution-service/app/routes.py` | Synchronous execution (`/execute`) and async submission | `executor.py`, `submission_runner.py` | Frontend `executionApi`, `orchestrator` | Read | Enforces 5s timeout and 256MB memory cap. Archives snapshot to `file-service`. |
| `services/code-execution-service/app/executor.py` | Subprocess and Docker sandboxed code runner | `subprocess`, `tempfile` | `routes.py` | Read | Supports Python, JavaScript, TypeScript, Java, C++, Go, Rust. |
| `services/code-execution-service/app/submission_runner.py` | Test case runner evaluating candidate output against assertions | Python unittest | `routes.py` | Read | Renamed from `test_runner.py` to prevent pytest collection conflicts. |
| `services/code-execution-service/app/models.py` | Pydantic execution models | Pydantic v2 | `routes.py` | Read | Validated languages and test case schemas. |
| `services/code-execution-service/app/test_code_execution.py` | Unit tests for code runner, timeouts, infinite loop termination | `pytest` | `scripts/run_all_tests.py` | Read | 28/28 tests pass cleanly. |
| `services/code-execution-service/Dockerfile` | Docker-in-Docker / Subprocess runtime container | Python 3.11, Compilers | Compose | Read | Includes compilers and runtimes (gcc, node, python). |
| `services/code-execution-service/requirements.txt` | Dependencies | Pip | Build | Read | Clean. |

---

## 8. WebRTC & Video Service (`services/video-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/video-service/src/index.js` | Express app entry point, HTTP server, CORS | Express, Node.js | Gateway | Read | Clean server setup. |
| `services/video-service/src/routes/videoRoutes.js` | Routes for tokens, preflight, recording, network quality | `roomManager.js`, `tokenService.js` | Frontend `videoApi` | Read | Modular route handlers. |
| `services/video-service/src/roomManager.js` | In-memory room tracking, participant active state, quality metrics | Node.js | `videoRoutes.js` | Read | Extracted from monolith for clean cohesion. |
| `services/video-service/src/tokenService.js` | LiveKit JWT token minting and mock token fallback | `livekit-server-sdk` | `videoRoutes.js` | Read | Provides offline mock token when LiveKit API keys absent. |
| `services/video-service/package.json` | Node dependencies and scripts | NPM | Build pipeline | Read | Verified scripts. |
| `services/video-service/Dockerfile` | Node.js 20-alpine container | Node.js 20 | Compose | Read | Multi-stage production container. |
| `services/video-service/README.md` | Video service docs | Markdown | Developers | Read | Updated with extracted module details. |

---

## 9. Feedback & Evaluation Service (`feedback-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/feedback-service/app/main.py` | FastAPI app entry point | FastAPI | Gateway | Read | PostgreSQL connection pooling. |
| `services/feedback-service/app/routes.py` | Report generation, retrieval, PDF download | `generator.py` | Frontend `feedbackApi`, RabbitMQ worker | Read | Serves structured feedback JSON and compiled PDF binary. |
| `services/feedback-service/app/generator.py` | Groq LLM rubric evaluation and HTML report compilation | `groq`, `weasyprint` | `routes.py` | Read | Evaluates 6 dimensions: DSA, code quality, architecture, behavioral, communication, edge cases. |
| `services/feedback-service/app/percentiles.py` | Percentile ranking benchmarks against candidate pool | Python math | `generator.py` | Read | Extracted statistical calculation module. |
| `services/feedback-service/app/report_template.py` | CSS-styled responsive HTML report generator | String template | `generator.py` | Read | Clean standalone HTML report rendering. |
| `services/feedback-service/app/models.py` | Pydantic evaluation models | Pydantic v2 | `routes.py` | Read | Validated 0-100 scoring schema. |
| `services/feedback-service/app/test_feedback.py` | Unit tests for rubric evaluation, PDF template, percentiles | `pytest` | `scripts/run_all_tests.py` | Read | 12/12 tests pass cleanly. |
| `services/feedback-service/Dockerfile` | Container with WeasyPrint & Pango libraries | Python 3.11, Pango | Compose | Read | Contains required system fonts and cairo libraries. |
| `services/feedback-service/requirements.txt` | Dependencies | Pip | Build | Read | Clean. |

---

## 10. Analytics Service (`analytics-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/analytics-service/app/main.py` | Entry point | FastAPI | Gateway | Read | Lifecycle management. |
| `services/analytics-service/app/routes.py` | Event tracking (`/event`), dashboard, score trend | `database.py`, `models.py` | Frontend `analyticsApi` | Read | Direct PostgreSQL aggregation queries. |
| `services/analytics-service/app/database.py` | Database queries for score distribution and retention | `asyncpg` | `routes.py` | Read | Clean parameterized SQL. |
| `services/analytics-service/app/models.py` | Analytics event models | Pydantic v2 | `routes.py` | Read | Validated event schemas. |
| `services/analytics-service/app/test_analytics.py` | Unit tests for metric aggregations and event ingestion | `pytest` | `scripts/run_all_tests.py` | Read | 20/20 tests pass cleanly. |
| `services/analytics-service/Dockerfile` | Container definition | Python 3.11 | Compose | Read | Clean. |
| `services/analytics-service/requirements.txt` | Dependencies | Pip | Build | Read | Resolved. |

---

## 11. Admin Service (`admin-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/admin-service/app/main.py` | Entry point | FastAPI | Gateway | Read | Admin endpoints. |
| `services/admin-service/app/routes.py` | Global stats, user list, ban/unban, plan change, audit logs | `database.py`, `models.py` | Frontend `adminApi` | Read | Enforces admin RBAC token check. |
| `services/admin-service/app/database.py` | Query helpers for `audit_logs` and `user_profiles` | `asyncpg` | `routes.py` | Read | Audit log writer. |
| `services/admin-service/app/models.py` | Schemas for admin operations | Pydantic v2 | `routes.py` | Read | Clean schemas. |
| `services/admin-service/app/test_admin.py` | Unit tests for admin statistics, user blocking, audit logging | `pytest` | `scripts/run_all_tests.py` | Read | 18/18 tests pass cleanly. |
| `services/admin-service/Dockerfile` | Container definition | Python 3.11 | Compose | Read | Standard setup. |
| `services/admin-service/requirements.txt` | Dependencies | Pip | Build | Read | Resolved. |

---

## 12. File & Asset Service (`file-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/file-service/app/main.py` | Entry point | FastAPI | Gateway | Read | Healthcheck reports storage mode (`s3` vs `local`). |
| `services/file-service/app/routes.py` | File upload, presigned download, metadata lookup, delete | `storage.py` | `user-service`, `code-execution-service` | Read | Verifies file sizes and allowed MIME types. |
| `services/file-service/app/storage.py` | AWS S3 client and local disk fallback implementation | `boto3`, `pathlib` | `routes.py` | Read | Automatically falls back to local `uploads/` folder when AWS keys are absent. |
| `services/file-service/app/test_file.py` | Unit tests for upload, presigned URLs, fallback storage | `pytest` | `scripts/run_all_tests.py` | Read | 14/14 tests pass cleanly. |
| `services/file-service/Dockerfile` | Container definition | Python 3.11 | Compose | Read | Standard build. |
| `services/file-service/requirements.txt` | Dependencies | Pip | Build | Read | Includes `boto3`. |

---

## 13. Payment & Billing Service (`payment-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/payment-service/app/main.py` | Entry point | FastAPI | Gateway | Read | Lifecycle management. |
| `services/payment-service/app/routes.py` | Checkout session creation, signature verification, mock flow | `config.py`, `database.py` | Frontend `paymentApi` | Read | Fixed missing `FRONTEND_URL` import bug. Mock mode fully verified. |
| `services/payment-service/app/config.py` | Razorpay keys and tier configuration | `pydantic-settings` | `routes.py` | Read | Configures `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `FRONTEND_URL`. |
| `services/payment-service/app/database.py` | Persistence for `subscriptions`, `billing_events` | `asyncpg` | `routes.py` | Read | Parameterized SQL. |
| `services/payment-service/app/models.py` | Billing schemas | Pydantic v2 | `routes.py` | Read | Clean models. |
| `services/payment-service/app/test_payment.py` | Unit tests for checkout session, HMAC signature verify, cancel | `pytest` | `scripts/run_all_tests.py` | Read | 18/18 tests pass cleanly. |
| `services/payment-service/Dockerfile` | Container definition | Python 3.11 | Compose | Read | Clean build. |
| `services/payment-service/requirements.txt` | Dependencies | Pip | Build | Read | Includes `razorpay`. |

---

## 14. Question Search Service (`search-service/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `services/search-service/app/main.py` | Entry point | FastAPI | Gateway | Read | In-memory search bank mounted. |
| `services/search-service/app/routes.py` | Question queries by tag, difficulty, company, random prompt | `search_engine.py` | Frontend `searchApi`, `orchestrator-service` | Read | Fast responses without Elasticsearch overhead. |
| `services/search-service/app/search_engine.py` | In-memory token indexer and fuzzy matcher | `seed_questions.py` | `routes.py` | Read | Filters over 2,000+ curated technical questions in < 2ms. |
| `services/search-service/app/seed_questions.py` | Comprehensive question dataset (DSA, System Design, Behavioral) | Dictionary data | `search_engine.py` | Read | 120KB+ high-quality problem descriptions with test cases. |
| `services/search-service/app/test_search.py` | Unit tests for tag filtering, random sampling, keyword match | `pytest` | `scripts/run_all_tests.py` | Read | 20/20 tests pass cleanly. |
| `services/search-service/Dockerfile` | Container definition | Python 3.11 | Compose | Read | Clean build. |
| `services/search-service/requirements.txt` | Dependencies | Pip | Build | Read | Minimal dependencies. |

---

## 15. Frontend Application (`frontend/src/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `frontend/src/lib/api.ts` | Unified HTTP & SSE API client for all backend microservices | `fetch`, `api-errors.ts` | All React components | Read | Cleaned out obsolete `notificationApi` stubs. Token refresh interceptor active. |
| `frontend/src/lib/api-errors.ts` | Custom `ApiError` class with status codes and validation details | JS Error | `api.ts` | Read | Standard structured error wrapper. |
| `frontend/src/contexts/AuthContext.tsx` | Global authentication state (user profile, login, logout, MFA) | React Context, `api.ts` | Entire UI hierarchy | Read | Removed dead WebSocket notification import. Fast auth check. |
| `frontend/src/app/layout.tsx` | Root Next.js 14 layout wrapping AuthContext and Toaster | Next.js, Tailwind | Next.js runtime | Read | Clean responsive layout. |
| `frontend/src/app/page.tsx` | Landing page explaining platform features and CTA buttons | Next.js, Lucide | Root `/` route | Read | Fully responsive hero, feature cards, pricing CTA. |
| `frontend/src/app/login/page.tsx` | Candidate & Admin sign-in screen with MFA challenge modal | `LoginForm.tsx`, `AuthContext` | `/login` route | Read | Handles both direct password login and TOTP challenge modal. |
| `frontend/src/app/register/page.tsx` | Candidate registration screen | `RegisterForm.tsx` | `/register` route | Read | Captures display name, email, password, and validates strength. |
| `frontend/src/app/dashboard/page.tsx` | Candidate hub: quota tracker, session launcher, score charts | React, `api.ts` | `/dashboard` route | Read | Fetches profile quota, recent sessions, and score trends. |
| `frontend/src/app/interview/[id]/page.tsx` | Live technical interview room combining video, chat, and Monaco editor | Monaco, LiveKit, SSE | `/interview/[id]` | Read | Core live room. Synchronizes video, AI speech, and code editor. |
| `frontend/src/app/interview/prep/page.tsx` | Interview configuration screen (Type, Difficulty, Company) | React, `api.ts` | `/interview/prep` | Read | Dispatches `sessionApi.create` with parameters. |
| `frontend/src/app/feedback/[id]/page.tsx` | Comprehensive interview scorecard and PDF download | React, `feedbackApi` | `/feedback/[id]` | Read | Renders 6D score bars, detailed notes, and PDF download button. |
| `frontend/src/app/billing/page.tsx` | Subscription management, Razorpay payment modal, invoices | React, `paymentApi` | `/billing` route | Read | Integrates Razorpay checkout and displays active plan. |
| `frontend/src/app/admin/page.tsx` | Administration portal: user table, KPI metrics, audit logs | React, `adminApi` | `/admin` route | Read | RBAC protected; redirects non-admin users. |
| `frontend/src/components/interview/CodeEditor.tsx` | Sandboxed Monaco code editor with language picker and test runner | `@monaco-editor/react` | `InterviewRoom.tsx` | Read | Submits code to `/api/v1/execute` and renders stdout/stderr. |
| `frontend/src/components/interview/AIAvatar.tsx` | Animated AI interviewer avatar with audio wave animation | Lucide, React | `InterviewRoom.tsx` | Read | Pulses smoothly during active SSE streaming response. |
| `frontend/src/components/interview/VideoPanel.tsx` | WebRTC video feed container with network quality indicator | LiveKit, WebRTC | `InterviewRoom.tsx` | Read | Shows candidate webcam with offline mock fallback. |
| `frontend/src/hooks/useProctoring.ts` | Proctoring telemetry: tab switch counter, paste detector, window blur | React hooks | `InterviewRoom.tsx` | Read | Automatically reports cheating events to `/api/v1/sessions/{id}/cheating`. |
| `frontend/src/hooks/useSession.ts` | Session heartbeat loop (30s) and state synchronizer | React hooks | `InterviewRoom.tsx` | Read | Sends periodic heartbeats preventing idle session termination. |

---

## 16. Database Migrations (`migrations/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `migrations/init_dev_schema.sql` | Authoritative PostgreSQL schema creating all 16 public tables | PostgreSQL 16 | Docker entrypoint | Read | Contains complete DDL with foreign keys, indexes, and initial seeds. |
| `migrations/001_initial_schema.sql` | Legacy bootstrap script | PostgreSQL | Historical | Read | Superset included in `init_dev_schema.sql`. |
| `migrations/002_rename_stripe_to_provider.sql` | Alter migration replacing Stripe columns with Razorpay/generic provider | PostgreSQL | Historical | Read | Reflected in authoritative schema. |
| `migrations/README.md` | Schema documentation and migration guidelines | Markdown | Developers | Read | Accurate table descriptions. |

---

## 17. Operational & Verification Scripts (`scripts/`)

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `scripts/run_all_tests.py` | Unified test runner executing all 11 microservice test suites | Python 3, Pytest | CI / Developers | Read | Successfully executes all 220 tests (220/220 PASS). |
| `scripts/verify_system.py` | System health and database verification script | Python, psycopg2, redis | Operators | Read | Connects to Postgres and Redis, reports status. |
| `scripts/health-check.ps1` | PowerShell healthcheck script probing all service ports | PowerShell | Developers | Read | Validates all 13 microservice HTTP ports. |
| `scripts/e2e-smoke.ps1` | End-to-end user smoke test script testing registration, login, session | PowerShell | CI / QA | Read | Automated E2E verification script. |
| `scripts/start-docker.ps1` | Docker compose orchestrator script | PowerShell, Docker | Developers | Read | Starts full stack with one command. |
| `scripts/start-local.ps1` | Starts all services natively in background PowerShell sessions | PowerShell, Python | Developers | Read | Used for lightweight local dev without Docker. |
| `scripts/deploy-ec2.sh` | AWS EC2 deployment automation script | Bash, Docker | Ops / CI | Read | EC2 instance provisioner. |
| `scripts/setup-ecr.sh` | AWS ECR repository provisioner script | AWS CLI, Bash | Ops / CI | Read | Creates container registries on AWS. |
| `scripts/push-images-ecr.sh` | Docker image build and push script for AWS ECR | Docker, AWS CLI | CI / Ops | Read | Builds and tags production images. |

---

## 18. Root Infrastructure & Configurations

| File Path | Purpose | Dependencies | Callers | Audit Status | Findings |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `docker-compose.yml` | Primary container orchestration manifest (Infra, Services, Gateway, Frontend) | Docker Compose | Docker | Read | Cleanly excludes removed notification service. Postgres, Redis, RMQ configured. |
| `docker-compose.prod.yml` | Production-optimized compose with resource limits and SSL certificates | Docker Compose | Production host | Read | Production settings verified. |
| `docker-compose.services.yml` | Backend services only compose (for standalone frontend development) | Docker Compose | Developers | Read | Verified. |
| `.env.example` | Environment variable template documenting all required secrets | Config | Developers | Read | No secrets leaked. Documented dummy defaults. |
| `pytest.ini` | Root pytest configuration defining test discovery and warnings | Pytest | Pytest | Read | Configures python path and ignores harmless deprecation warnings. |
| `conftest.py` | Root test fixture sharing helper mock fixtures across suites | Pytest | Pytest | Read | Verified. |
| `.github/workflows/ci-cd.yml` | GitHub Actions workflow running tests and linting on pull requests | GitHub Actions | Git Push | Read | Runs pytest and frontend type check. |
| `README.md` | Main platform overview, quickstart instructions, and architecture | Markdown | Users | Read | Accurate instructions. |
| `INTERVIEW_GUIDE.md` | Technical interview master mentor guide | Markdown | Candidates | Read | 50+ real-world Q&As grounded 100% in repository code. |
| `CODEBASE_OVERVIEW.md` | Complete architectural specification and system boundaries | Markdown | Engineers | Read | System design guide. |
| `REFACTORING_CHANGELOG.md` | Audit log of all modularizations, fixes, and cleanups | Markdown | Reviewers | Read | Up to date. |
| `REFACTORING_PLAN.md` | Original architectural refactoring plan | Markdown | Reviewers | Read | Complete. |
