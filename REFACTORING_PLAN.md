# DevMeet v2.0 — Architecture Refactoring & Modularization Plan

## 1. Overview and Objectives

This document outlines the systematic refactoring plan for **DevMeet v2.0**.
The primary objectives are:
1. **Separation of Concerns**: Decompose monolithic files into clean, single-responsibility modules (controllers, services, clients, security, templates).
2. **Backward Compatibility**: Preserve 100% of API endpoints, request/response models, database schemas, and event contracts.
3. **Fix Identified Baseline Regressions**:
   - Resolve `FRONTEND_URL` NameError in `payment-service`.
   - Resolve `check_quota` positional argument mismatch in `orchestrator-service` test fixture.
   - Fix root test collection conflicts caused by identical test file naming and non-test runner file names.
4. **Eliminate Deprecations**: Modernize Pydantic v1 `@validator` decorators and Python `datetime.utcnow()` usage.
5. **Complete Documentation**: Create folder-level READMEs across all microservices and a master `INTERVIEW_GUIDE.md`.

---

## 2. Target File Structure & Module Decomposition

### 2.1 `ai-interviewer-service`
- **Current Issue**: `ai_manager.py` (1,113 lines) contains circuit breaker, caching, key rotation, prompt injection security, prompt builders for 3 interview types, STAR scoring, adaptive difficulty heuristics, Groq API calling, and token streaming.
- **Target Decomposition**:
  ```text
  services/ai-interviewer-service/app/
  ├── circuit_breaker.py   # CircuitBreaker implementation & instance
  ├── cache.py             # ResponseCache for exact-match LLM deduplication
  ├── key_manager.py       # Multi-key rotation pool & HashiCorp Vault dynamic retrieval
  ├── security.py          # Prompt injection detection, input validation & sanitization
  ├── prompts.py           # System prompts for DSA, System Design, Behavioral & STAR
  ├── heuristics.py        # STAR component extraction, adaptive difficulty heuristics
  ├── ai_manager.py        # Core AIManager orchestrating Groq API calls & token streams (imports and re-exports submodules)
  ├── routes.py            # FastAPI route handlers
  ├── models.py            # Pydantic schemas
  └── tests/               # Test suites
  ```
- **Compatibility Risk**: Zero. `ai_manager.py` continues to export all functions (`ai_manager`, `_get_next_key`, `_GROQ_KEYS`, `detect_prompt_injection`, etc.).

---

### 2.2 `orchestrator-service`
- **Current Issue**: `routes.py` (930 lines) directly embeds HTTP calls to Auth, User, AI, and Search services, active session lock handling, turn history, and state transitions.
- **Target Decomposition**:
  ```text
  services/orchestrator-service/app/
  ├── clients.py           # Inter-service HTTP client (auth, quota check, seed question, feedback trigger)
  ├── routes.py            # Cleaned, modular FastAPI route controllers
  ├── database.py          # PostgreSQL session and turn queries
  ├── redis_client.py      # Distributed locking & active session caching
  ├── models.py            # Pydantic models & state machine validators
  ├── outbox.py            # Transactional outbox event emitter
  └── idempotency.py       # API idempotency enforcement
  ```
- **Compatibility Risk**: Low. Route paths and request/response models remain identical.

---

### 2.3 `payment-service`
- **Current Issue**: `routes.py` contains a NameError bug on line 164 (`FRONTEND_URL` is undefined).
- **Target Fix**:
  - Import `FRONTEND_URL` from `.config` in `routes.py`.
  - Verify test suite passes with 100% success.

---

### 2.4 `code-execution-service`
- **Current Issue**:
  - `test_runner.py` is named with `test_` prefix, causing pytest to mistakenly collect it as a test module during root discovery and failing on relative imports.
  - Large file `executor.py` contains compilation, execution, AST parsing, and Docker handling.
- **Target Decomposition**:
  - Rename `test_runner.py` to `submission_runner.py` (and maintain backward compatibility alias).
  - Update `routes.py` import.
  - Pytest root discovery can now execute without collection errors.

---

### 2.5 `feedback-service`
- **Current Issue**: `generator.py` (670 lines) combines Groq prompts, scoring rubrics, percentile calculations, HTML generation, and WeasyPrint PDF compilation.
- **Target Decomposition**:
  ```text
  services/feedback-service/app/
  ├── report_template.py   # Styled HTML/CSS report template builder
  ├── percentiles.py       # Peer percentile distribution tables & calculators
  ├── generator.py         # FeedbackGenerator engine coordinating LLM and PDF output
  └── routes.py            # Endpoint controllers
  ```

---

### 2.6 `auth-service`
- **Current Issue**: `routes.py` (842 lines) houses full MFA TOTP generation, backup codes, email verification tokens, and session handlers in one file.
- **Target Decomposition**:
  - Extract MFA helper methods and email dispatch logic into clean helper modules (`mfa_helper.py`, `email_service.py`).
  - Keep route handlers readable and focused.

---

### 2.7 `video-service` & `notification-service`
- **Target Refactoring**:
  - In `video-service`: Separate room management, token generation, and recording coordination into modular JS files (`roomManager.js`, `tokenService.js`, `recordingService.js`).
  - In `notification-service`: Separate SES email dispatch and WebSocket client connection management.

---

### 2.8 Test Suite Normalization
- Standardize all service tests:
  - Provide distinct test filenames (e.g. `test_admin.py`, `test_ai_interviewer.py`, `test_auth.py`, `test_orchestrator.py`, etc.) so `python -m pytest` at the repository root runs all tests seamlessly in a single unified command.
  - Fix mock argument signature in `orchestrator-service` test.

---

## 3. Execution Sequence & Safety Controls

1. **Step 1: Test & Baseline Fixes**
   - Fix `FRONTEND_URL` in `payment-service`.
   - Fix `check_quota` mock in `orchestrator-service`.
   - Add unified root `pytest.ini` and rename test files uniquely so all tests pass cleanly from root.
2. **Step 2: Microservice Modularization**
   - Refactor `ai-interviewer-service` -> Run test suite -> Verify 44 tests pass.
   - Refactor `orchestrator-service` -> Run test suite -> Verify all tests pass.
   - Refactor `feedback-service` -> Run test suite -> Verify all tests pass.
   - Refactor `code-execution-service` -> Run test suite -> Verify all tests pass.
   - Refactor `video-service` and `notification-service`.
3. **Step 3: Documentation Delivery**
   - Write comprehensive READMEs in all 14 service folders, `frontend`, `migrations`, `services/`, and root.
   - Author `INTERVIEW_GUIDE.md` covering all 16 required sections.
   - Author `REFACTORING_CHANGELOG.md`.
4. **Step 4: Full System Verification**
   - Run root pytest suite across all services.
   - Run frontend TypeScript verification.
   - Verify Docker compose definitions and environment configurations.
