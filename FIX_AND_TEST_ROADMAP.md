# DevMeet v2.0 — Prioritized Fix & Manual Testing Roadmap

This roadmap organizes all outstanding improvements, manual verification milestones, and security enhancements into four prioritized tiers.

---

## 1. Priority Tiers Overview

| Priority Level | Focus Area | Status | Key Deliverables |
| :--- | :--- | :---: | :--- |
| **Tier 1 — Critical** | System Startup, Core Infrastructure & Compilation | **Resolved** | All 13 services live; 220/220 unit tests pass; 0 TypeScript errors. |
| **Tier 2 — High** | Core Integration Paths & Sandbox Security | **In Progress** | Manual verification of live SSE interview, code timeouts, and PDF downloads. |
| **Tier 3 — Medium** | End-to-End Test Automation & Real Credential Setup | **Planned** | Live Razorpay & LiveKit cloud keys testing, E2E browser automation. |
| **Tier 4 — Low** | Documentation Polish & Non-essential Cleanups | **Active** | Developer cheatsheets, interview guide expansions, schema diagrams. |

---

## 2. Roadmap Breakdown

### 2.1. Tier 1: Critical (Completed & Verified)

#### ITEM-CRIT-001: Resolve Payment Service Mock Checkout `NameError`
- **Issue ID**: `BUG-001`
- **Component**: `services/payment-service/app/routes.py`
- **Action Taken**: Imported `FRONTEND_URL` from `.config` into `routes.py`.
- **Verification**: `pytest services/payment-service/app/test_payment.py` (18/18 PASS).

#### ITEM-CRIT-002: Orchestrator Test Mock Argument Signature Mismatch
- **Issue ID**: `BUG-002`
- **Component**: `services/orchestrator-service/app/test_orchestrator.py`
- **Action Taken**: Updated `fake_quota` mock signature to accept `*args, **kwargs`.
- **Verification**: `pytest services/orchestrator-service/app/test_orchestrator.py` (9/9 PASS).

#### ITEM-CRIT-003: Pytest Namespace Collision Normalization
- **Issue ID**: `BUG-003`
- **Component**: All 11 Python microservices and `scripts/run_all_tests.py`
- **Action Taken**: Renamed duplicate `test_placeholder.py` files to distinct names; renamed `test_runner.py` to `submission_runner.py`; authored unified test runner.
- **Verification**: `python scripts/run_all_tests.py` runs all 220 tests (220/220 PASS).

---

### 2.2. Tier 2: High (Immediate Manual Verification Milestones)

#### ITEM-HIGH-001: Live Technical Interview & Real-Time SSE Token Streaming
- **Action**: Perform manual test case `MT-INT-002` in [MANUAL_TESTING_PLAN.md](MANUAL_TESTING_PLAN.md).
- **Prerequisites**: Services running via `docker compose up -d` or `scripts/start-local.ps1`.
- **Recommended Action**:
  1. Log into `http://localhost:3000`.
  2. Launch an interview session at `/interview/prep`.
  3. Enter the live interview room `/interview/[id]`.
  4. Verify that the AI interviewer begins speaking and tokens render smoothly character-by-character.
- **Verification**: Verify browser DevTools EventStream connection and check `conversation_turns` records in PostgreSQL.

#### ITEM-HIGH-002: Sandboxed Code Execution Timeout & Memory Enforcement
- **Action**: Perform manual test case `MT-INT-003` in [MANUAL_TESTING_PLAN.md](MANUAL_TESTING_PLAN.md).
- **Recommended Action**:
  1. In the Monaco editor, run a valid Python function (`def add(a, b): return a + b`).
  2. Verify execution time (< 100ms) and standard output.
  3. Input an infinite loop (`while True: pass`) and click **"Run Code"**.
  4. Verify that the sandbox safely kills the runaway process after exactly 5.0 seconds with status `timeout`.
- **Verification**: Check HTTP response `{ "status": "timeout", "execution_time_ms": 5000 }`.

#### ITEM-HIGH-003: End-to-End Report Generation & PDF Compilation
- **Action**: Perform manual test case `MT-EVAL-001` in [MANUAL_TESTING_PLAN.md](MANUAL_TESTING_PLAN.md).
- **Recommended Action**:
  1. Complete an interview session by clicking **"Finish Interview"**.
  2. Confirm navigation to `/feedback/[id]`.
  3. Verify scorecards display 6 dimensional metrics (0-100) and percentile benchmarks.
  4. Click **"Download PDF Report"** and verify that a formatted PDF binary downloads.
- **Verification**: Confirm downloaded PDF displays executive scorecard and rubric feedback.

---

### 2.3. Tier 3: Medium (Cloud Credentials & Extended Coverage)

#### ITEM-MED-001: LiveKit WebRTC Cloud Credential Configuration
- **Component**: `services/video-service/.env`
- **Dependencies**: LiveKit Cloud account (free tier available).
- **Recommended Action**: Replace dummy credentials in `.env` (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`) with active cloud credentials to enable multi-party WebRTC video streaming.
- **Verification**: Execute `POST /api/v1/video/token` and connect a remote video peer.

#### ITEM-MED-002: Automated End-to-End Browser Smoke Test Automation
- **Component**: `scripts/e2e-smoke.ps1`
- **Dependencies**: Running frontend and gateway containers.
- **Recommended Action**: Execute `powershell -File scripts/e2e-smoke.ps1` to automate candidate registration, session creation, and code execution.
- **Verification**: Script outputs `All 6 E2E smoke tests passed`.

---

### 2.4. Tier 4: Low (Maintenance & Documentation)

#### ITEM-LOW-001: Technical Interview Mentor Q&A Practice
- **Action**: Review [INTERVIEW_GUIDE.md](INTERVIEW_GUIDE.md) sections 1-15.
- **Goal**: Rehearse explaining the 60-second elevator pitch, 3-minute architecture breakdown, Transactional Outbox pattern, and Server-Sent Events vs WebSockets trade-offs.
