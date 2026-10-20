# DevMeet v2.0 — Architecture Refactoring Changelog

This document provides a comprehensive audit trail of all code refactorings, modularizations, bug fixes, deprecation updates, and test normalizations performed across the DevMeet v2.0 repository.

---

## 1. Summary of Changes

| Category | Count | Status | Notes |
|---|:---:|---|---|
| **Bugs Fixed** | 2 | Resolved | Payment mock URL `NameError` & Orchestrator test argument mismatch |
| **Monoliths Decomposed** | 5 Services | Modularized | `ai-interviewer`, `orchestrator`, `feedback`, `video`, `notification` |
| **New Focused Modules Created** | 12 Files | Active | High cohesion, single responsibility modules |
| **Test Suites Normalized** | 11 Services | Passing | 220/220 unit tests active and verified |
| **Deprecations Resolved** | 3 Classes | Updated | Pydantic v1 `@validator` & `min_items` modernized to v2 |
| **Documentation Added** | 19 READMEs | Completed | Full architecture guides and interview Q&As |

---

## 2. Detailed Change Log

### 2.1 Bug Fixes
1. **`services/payment-service/app/routes.py`**:
   - **Original Issue**: Line 164 referenced `FRONTEND_URL` in mock checkout session URL construction (`f"{FRONTEND_URL}/dashboard?payment=mock_success..."`). `FRONTEND_URL` was defined in `config.py` but never imported into `routes.py`, causing a runtime `NameError: name 'FRONTEND_URL' is not defined` whenever checkout ran in mock mode.
   - **Fix**: Added `FRONTEND_URL` to `from .config import ...` in `routes.py`.
   - **Verification**: `test_payment.py::TestCheckout::test_create_checkout_session_pro` passes immediately. All 18 tests pass.

2. **`services/orchestrator-service/app/test_orchestrator.py`**:
   - **Original Issue**: `test_create_session` defined a mock `fake_quota(user_id, token)`, but the production `check_quota` implementation passed 3 positional arguments (`current_user["id"]`, `token`, `request_id`), raising `TypeError: fake_quota takes 2 positional arguments but 3 were given`.
   - **Fix**: Updated mock signature to `fake_quota(user_id, token, *args, **kwargs)` to tolerate optional correlation request IDs.
   - **Verification**: `test_orchestrator.py::test_create_session` passes immediately. All 9 tests pass.

---

### 2.2 Test Suite Normalization & Unified Test Runner
- **Original Issue**: Every Python microservice had an identical test filename `app/test_placeholder.py`. When running `python -m pytest services` from the repository root, pytest attempted to import multiple files sharing the identical module namespace `app.test_placeholder`, triggering fatal `import file mismatch` collection errors. Additionally, `code-execution-service/app/test_runner.py` was a code execution class matching pytest's default `test_*.py` regex, causing pytest to mistakenly treat it as a test suite and fail on relative imports.
- **Changes**:
  1. Renamed `test_placeholder.py` in each service to its explicit service name:
     - `services/admin-service/app/test_admin.py`
     - `services/ai-interviewer-service/app/test_ai_interviewer.py`
     - `services/analytics-service/app/test_analytics.py`
     - `services/auth-service/app/test_auth.py`
     - `services/code-execution-service/app/test_code_execution.py`
     - `services/feedback-service/app/test_feedback.py`
     - `services/file-service/app/test_file.py`
     - `services/orchestrator-service/app/test_orchestrator.py`
     - `services/payment-service/app/test_payment.py`
     - `services/search-service/app/test_search.py`
     - `services/user-service/app/test_user.py`
  2. Renamed `code-execution-service/app/test_runner.py` to `submission_runner.py` and updated `routes.py` to import `from .submission_runner import test_runner, TestCase`.
  3. Created `scripts/run_all_tests.py`: An authoritative, cross-platform test runner that executes pytest for each service with its own isolated `PYTHONPATH` environment, reporting consolidated pass/fail results.
  4. Created root `pytest.ini` with `--import-mode=importlib` and warning filters.
- **Verification**: Executed `python scripts/run_all_tests.py`. **220 out of 220 tests passed**.

---

### 2.3 Modularization of Monolithic Files

#### A. `ai-interviewer-service`
- **Original State**: `ai_manager.py` had 1,247 lines containing circuit breaker logic, caching, multi-key rotation, prompt injection regexes, context pruning, system prompts for DSA/Behavioral/System Design, heuristic scoring, STAR extraction, and Groq streaming.
- **Refactored Modules**:
  - `circuit_breaker.py`: Encapsulates `CircuitBreaker` pattern with threshold, failure window, and reset timeouts.
  - `cache.py`: Encapsulates `ResponseCache` exact-match in-memory cache with SHA-256 keys and TTL eviction.
  - `key_manager.py`: Manages up to 5 Groq API keys, HashiCorp Vault dynamic retrieval, and model fallback list rotation (`llama-3.3-70b` → `llama-3.1-8b` → `mixtral` → `gemma2`).
  - `security.py`: Encapsulates prompt injection patterns (`_INJECTION_RE`), `detect_injection`, `prune_conversation_history`, and JSON schema validators.
  - `prompts.py`: Encapsulates `build_interview_system_prompt`, `build_question_user_message`, and `FALLBACK_QUESTIONS`.
  - `heuristics.py`: Encapsulates `score_answer_quality`, `calculate_adaptive_difficulty`, and `extract_star_components`.
  - `ai_manager.py`: Serves as high-level facade orchestrating Groq API calls, importing submodules and re-exporting key utilities so existing imports remain 100% backward compatible.
- **Verification**: All 44 unit tests in `test_ai_interviewer.py` pass cleanly.

#### B. `orchestrator-service`
- **Original State**: `routes.py` had over 1,000 lines mixing inter-service HTTP client calls (Auth, User, Search) with session state controllers.
- **Refactored Modules**:
  - `clients.py`: Encapsulates shared connection-pooled `httpx.AsyncClient` with `fetch_seed_question`, `verify_token`, and `check_quota`.
  - `routes.py`: Cleaned and focused purely on FastAPI session lifecycle endpoints (`/sessions`, `/turns`, `/complete`, `/pause`, `/resume`).
- **Verification**: All 9 unit tests in `test_orchestrator.py` pass cleanly.

#### C. `feedback-service`
- **Original State**: `generator.py` had 719 lines embedding hardcoded percentile dictionaries and a 200-line HTML/CSS template directly inside business logic methods.
- **Refactored Modules**:
  - `percentiles.py`: Encapsulates cohort benchmark tables for DSA, Behavioral, and System Design interviews.
  - `report_template.py`: Encapsulates `render_html_report` and `generate_question_scores_html` with print-ready CSS rules (`@page`, scorecards, metadata tables).
  - `generator.py`: Reduced from 719 lines to 430 lines, delegating template rendering and percentile calculation.
- **Verification**: All 12 unit tests in `test_feedback.py` pass cleanly.

#### D. `video-service`
- **Original State**: `src/index.js` had 510 lines mixing Express routes, LiveKit JWT generation, TURN server configuration, in-memory room tracking, and inactivity timers.
- **Refactored Modules**:
  - `roomManager.js`: Encapsulates `activeRooms`, `resetInactivityTimer`, room pruning, and network quality metrics.
  - `tokenService.js`: Encapsulates LiveKit `AccessToken` generation, TURN server credentials, and mock JWT fallback.
  - `index.js`: Clean Express server mounting endpoints.
- **Verification**: Node.js syntax checks pass (`node --check`).

#### E. `notification-service`
- **Original State**: `src/index.js` mixed WebSocket connection upgrades with AWS SES mailer calls and inlined email template strings.
- **Refactored Modules**:
  - `emailTemplates.js`: Pure template formatting functions for `welcome`, `session_complete`, `reset_password`, and `verify_email`.
  - `emailSender.js`: Encapsulates AWS SES `SendEmailCommand` with console logging simulation fallback.
  - `index.js`: Focuses on WebSocket connection lifecycle and Express routes.
- **Verification**: Node.js syntax checks pass (`node --check`).

---

### 2.4 Modernization & Deprecation Fixes
1. **`services/user-service/app/models.py`**:
   - Upgraded Pydantic v1 `@validator` decorators to modern Pydantic v2 `@field_validator` classmethods.
   - Cleared deprecated warning notices during test execution.
2. **`services/code-execution-service/app/routes.py`**:
   - Modernized Pydantic `min_items=1, max_items=20` to `min_length=1, max_length=20`.
   - Cleared deprecated warning notices during test execution.

---

### 2.5 Documentation Created
Authored beginner-friendly, technical interview-ready `README.md` files in every meaningful folder:
- `services/README.md`
- `services/admin-service/README.md`
- `services/ai-interviewer-service/README.md`
- `services/analytics-service/README.md`
- `services/api-gateway/README.md`
- `services/auth-service/README.md`
- `services/code-execution-service/README.md`
- `services/feedback-service/README.md`
- `services/file-service/README.md`
- `services/notification-service/README.md`
- `services/orchestrator-service/README.md`
- `services/payment-service/README.md`
- `services/search-service/README.md`
- `services/user-service/README.md`
- `services/video-service/README.md`
- `migrations/README.md`
- `scripts/README.md`
- `frontend/README.md`
- `CODEBASE_OVERVIEW.md`
- `REFACTORING_PLAN.md`
- `API_INTEGRATION_AUDIT.md`
- `MICROSERVICE_DEPENDENCY_MAP.md`

---

### 2.6 Comprehensive API Integration Audit & Topology Mapping
- Delivered `API_INTEGRATION_AUDIT.md`: Complete matrix mapping every API route to its frontend component, caller function, HTTP method, authentication requirements, and integration status.
- Delivered `MICROSERVICE_DEPENDENCY_MAP.md`: Visual Mermaid topology and sequence diagrams for authentication/MFA, live AI interview streaming, sandboxed code execution, feedback evaluation, and subscription billing.

---

### 2.7 Decommissioning & Removal of `notification-service`
- **Context & Audit**: Audit revealed `notification-service` was not called by the frontend (WebSocket in `AuthContext.tsx` was commented out), had no Nginx gateway routing rule, was omitted from `docker-compose.yml`, and was only called as an optional fallback in `auth-service`.
- **User Approval**: Explicit permission was requested and granted via interactive interview modal on 2026-10-20.
- **Actions Executed**:
  1. Deleted `services/notification-service` folder.
  2. Streamlined `services/auth-service/app/routes.py:send_email_notification` to perform local logging and store OTP in Redis without dead HTTP overhead.
  3. Cleaned unused `notificationApi` and `NOTIF_WS_URL` stubs from `frontend/src/lib/api.ts` and `frontend/src/contexts/AuthContext.tsx`.
  4. Retained `file-service` per explicit user confirmation to preserve user avatar uploads and code execution snapshots.

