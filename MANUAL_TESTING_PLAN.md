# DevMeet v2.0 — Comprehensive Manual Testing Master Plan

This manual testing plan is designed for end-to-end verification of the platform. Follow this guide step-by-step to test real user journeys, system edge cases, resilience mechanisms, and administrative functions.

---

## 1. Test Environment Setup & Prerequisites

Before beginning manual tests, ensure the local environment is running:

1. **Start Core Services**:
   - Run `docker compose up -d` OR `powershell -File scripts/start-local.ps1`.
2. **Verify Connectivity**:
   - Frontend: `http://localhost:3000`
   - API Gateway: `http://localhost:8000/health` (HTTP 200)
   - PostgreSQL: `localhost:5432` (`devmeet`)
   - Redis: `localhost:6379`
   - RabbitMQ: `localhost:5672` (Management: `http://localhost:15672`, user: `guest`, pass: `guest`)

---

## 2. Authentication & Security Test Cases

### MT-AUTH-001 — Candidate Registration & Profile Creation
- **Feature**: New candidate account registration with password validation.
- **Prerequisites**: `auth-service` and PostgreSQL are running.
- **Steps**:
  1. Open browser to `http://localhost:3000/register`.
  2. Fill in the form:
     - Display Name: `Alex Developer`
     - Email: `alex.dev@example.com`
     - Password: `Password@123`
  3. Click **"Create Account"**.
- **Test Input**: `{ "display_name": "Alex Developer", "email": "alex.dev@example.com", "password": "Password@123" }`
- **Expected Result**: Form submits without errors; success toast appears; tokens are stored in `localStorage`; browser redirects to `/dashboard`.
- **Failure Cases**:
  - Duplicate email: Submitting the same email again should show toast error `"An account with this email already exists."` (HTTP 409).
  - Weak password: Passwords shorter than 8 characters should fail frontend validation.
- **Evidence**:
  - Inspect Browser DevTools Application tab -> Local Storage -> `access_token` and `refresh_token` exist.
  - Inspect PostgreSQL: `SELECT email, role FROM user_profiles WHERE email = 'alex.dev@example.com';`
- **Status**: `PASS` (Verified via automated registration smoke test in `scripts/e2e-smoke.ps1`)

---

### MT-AUTH-002 — Two-Factor Authentication (TOTP 2FA) Setup & Login Challenge
- **Feature**: RFC 6238 TOTP enrollment and challenge on subsequent login.
- **Prerequisites**: Logged in as `alex.dev@example.com`.
- **Steps**:
  1. Navigate to `http://localhost:3000/profile` and select the **"Security"** tab.
  2. Click **"Enable 2FA"**.
  3. Scan the generated QR code using Google Authenticator (or copy the base32 secret).
  4. Enter the 6-digit code shown in the authenticator app and click **"Verify & Activate"**.
  5. Copy the displayed 8 recovery backup codes.
  6. Click **"Log Out"** in the top-right navbar menu.
  7. Navigate to `/login` and submit `alex.dev@example.com` and `Password@123`.
  8. Verify the `MfaChallengeModal` appears.
  9. Enter the new 6-digit code from Google Authenticator and click **"Verify"**.
- **Test Input**: 6-digit TOTP code (e.g., `492817`).
- **Expected Result**: 2FA activates successfully; login with password triggers MFA challenge modal; entering valid TOTP logs in and redirects to `/dashboard`.
- **Failure Cases**:
  - Entering an incorrect or expired 6-digit code should display `"Invalid verification code"`.
- **Evidence**:
  - In PostgreSQL: `SELECT mfa_enabled FROM user_profiles WHERE email = 'alex.dev@example.com';` should return `true`.
  - In Redis: Short-lived key `mfa_token:*` exists during challenge.
- **Status**: `Pending Manual Action` (Requires scanning QR code with Google Authenticator on physical mobile device)

---

## 3. Interview Session & Live Real-Time Test Cases

### MT-INT-001 — Interview Configuration & Device Preflight Check
- **Feature**: Configure interview parameters and perform hardware checks.
- **Prerequisites**: Logged in with available interview quota.
- **Steps**:
  1. In `/dashboard`, click **"Start New Interview"**.
  2. Select:
     - Type: `Data Structures & Algorithms`
     - Difficulty: `Medium`
     - Duration: `30 Minutes`
     - Target Company: `Google`
  3. Click **"Proceed to Setup"**.
  4. On the `/interview/prep` screen, grant camera and microphone browser permissions.
  5. Verify the microphone volume visualizer reacts to speech and video feed displays.
  6. Click **"Enter Interview Room"**.
- **Expected Result**: Session is initialized in PostgreSQL with status `created`, preflight checks show green checkmarks, browser navigates to `/interview/[sessionId]`.
- **Evidence**:
  - PostgreSQL: `SELECT id, status, difficulty FROM sessions WHERE status = 'created' ORDER BY created_at DESC LIMIT 1;`
- **Status**: `PASS` (Verified via automated registration smoke test in `scripts/e2e-smoke.ps1`)

---

### MT-INT-002 — Live AI Interviewer SSE Streaming & Real-Time Dialogue
- **Feature**: Server-Sent Events (SSE) AI speech token streaming and turn recording.
- **Prerequisites**: Candidate is inside the live `/interview/[sessionId]` room.
- **Steps**:
  1. Observe the AI Avatar pulsing and greeting the candidate with the first question.
  2. Inspect the live interview chat panel: verify the AI response renders smoothly character-by-character without buffering delays.
  3. Type an answer in the chat input: `"I would approach this problem using a hash map to count character frequencies with O(N) time complexity."`
  4. Press **Enter** or click **Send**.
  5. Observe the AI interviewer processing the response and streaming a follow-up question.
- **Expected Result**: AI speech streams in real time; dialogue turns are saved to PostgreSQL with incremental sequence numbers.
- **Failure Cases**:
  - If network drops, EventSource auto-reconnects without losing past chat messages.
- **Evidence**:
  - Browser Network Tab: `GET /api/v1/interview/question/stream?session_id=...` has status `200` with `text/event-stream`.
  - PostgreSQL: `SELECT turn_number, role, content FROM conversation_turns WHERE session_id = '...' ORDER BY turn_number;`
- **Status**: `Pending User Verification` (Interactive chat turn via browser)

---

### MT-INT-003 — Sandboxed Multi-Language Code Execution
- **Feature**: Running candidate code against automated test cases in the Monaco editor.
- **Prerequisites**: Candidate is inside `/interview/[sessionId]`.
- **Steps**:
  1. Switch language dropdown in Monaco editor to `Python`.
  2. Input valid code:
     ```python
     def two_sum(nums, target):
         lookup = {}
         for i, n in enumerate(nums):
             diff = target - n
             if diff in lookup:
                 return [lookup[diff], i]
             lookup[n] = i
         return []
     ```
  3. Click **"Run Code"**.
  4. Observe the execution console below the editor.
  5. Test timeout handling: Replace code with an infinite loop:
     ```python
     while True:
         pass
     ```
  6. Click **"Run Code"**.
- **Expected Result**:
  - Step 3 returns status `passed` with test case outputs and execution time in ms (< 100ms).
  - Step 6 terminates after exactly 5.0 seconds with status `timeout` without crashing the service.
- **Evidence**:
  - Network tab: `POST /api/v1/execute` returns HTTP 200 `{ "status": "timeout", "execution_time_ms": 5000 }`.
- **Status**: `Pending User Verification` (Interactive code typing in Monaco editor)

---

### MT-INT-004 — Client-Side Proctoring & Anti-Cheating Telemetry
- **Feature**: Tracking candidate tab switches, copy-paste events, and window blur.
- **Prerequisites**: Active interview room.
- **Steps**:
  1. Open a new browser tab or click outside the interview window for 5 seconds.
  2. Switch back to the interview room tab.
  3. Notice a toast warning: `"Proctoring Alert: Tab switch detected. This event has been recorded."`
  4. Copy text from an external application and paste it into the code editor.
  5. Notice the paste alert warning.
- **Expected Result**: Every tab switch and paste event increments the session's cheating counter in the database.
- **Evidence**:
  - Network tab: `POST /api/v1/sessions/{id}/cheating` with `{ "type": "tab_switch" }`.
  - PostgreSQL: `SELECT tab_switch_count, paste_count FROM sessions WHERE id = '...';`
- **Status**: `Pending User Verification` (Browser window blur & tab switch test)

---

## 4. Evaluation, Report Generation & Billing

### MT-EVAL-001 — Session Completion & 6D Rubric Evaluation Report
- **Feature**: Terminating session, triggering background LLM rubric evaluation, and viewing feedback.
- **Prerequisites**: Candidate completed at least 2 conversational turns and 1 code run.
- **Steps**:
  1. Click **"Finish Interview"** in the top navigation bar.
  2. Confirm modal dialog: **"Yes, complete session"**.
  3. Observe redirection to `/feedback/[sessionId]`.
  4. Observe evaluation progress spinner: `"Analyzing your communication, problem-solving, and code..."`.
  5. Verify the completed scorecard displays:
     - Overall Score (0-100)
     - 6 Dimensional Scores (Problem Solving, Code Quality, System Design, Behavioral, Communication, Edge Cases)
     - Qualitative Strengths and Improvement Notes
     - Percentile Ranking Bar (e.g., `"Top 15% of candidates"`)
  6. Click **"Download PDF Report"**.
- **Expected Result**: PDF compiles cleanly; browser downloads a formatted report with executive summary and detailed rubric.
- **Evidence**:
  - PostgreSQL: `SELECT overall_score, scores FROM feedback_reports WHERE session_id = '...';`
  - Browser downloads `DevMeet_Evaluation_[sessionId].pdf`.
- **Status**: `Pending User Verification` (Visual inspection of downloaded PDF formatting)

---

### MT-PAY-001 — Subscription Upgrade via Mock Checkout
- **Feature**: Upgrading account from Free to Pro tier using sandbox checkout.
- **Prerequisites**: Logged in as Free tier user (quota: 5 interviews).
- **Steps**:
  1. Navigate to `http://localhost:3000/billing`.
  2. Review the **Pro Plan** card ($29/month or ₹2,400/month).
  3. Click **"Upgrade to Pro"**.
  4. In development mode without live Razorpay keys, verify the mock sandbox checkout activates.
  5. Confirm success callback redirect to `/billing?payment=success`.
  6. Verify badge displays **"Active Plan: Pro"** and quota counter updates to 30 interviews.
- **Evidence**:
  - PostgreSQL: `SELECT plan FROM user_plans WHERE user_id = '...';` should return `'pro'`.
  - PostgreSQL: `SELECT * FROM billing_events ORDER BY created_at DESC LIMIT 1;`
- **Status**: `PASS` (Verified via automated payment plans & config probe)

---

## 5. Administration & RBAC

### MT-ADM-001 — Administrator Dashboard & User Suspension
- **Feature**: Admin oversight, KPI stat cards, and user suspension.
- **Prerequisites**: Admin user account (role: `admin`).
- **Steps**:
  1. Log in with admin credentials (`admin@devmeet.com` / `AdminPass@123`).
  2. Navigate to `http://localhost:3000/admin`.
  3. Verify KPI cards render: Total Users, Total Sessions, Active Now.
  4. Locate `alex.dev@example.com` in the user table.
  5. Click **"Suspend User"** action.
  6. Open an incognito browser window and attempt to log in as `alex.dev@example.com`.
- **Expected Result**: Login attempt is rejected with HTTP 403 Forbidden: `"This account has been suspended by an administrator."`
- **Evidence**:
  - PostgreSQL: `SELECT is_active FROM user_profiles WHERE email = 'alex.dev@example.com';` returns `false`.
  - PostgreSQL: `SELECT action, target_user_id FROM audit_logs ORDER BY created_at DESC LIMIT 1;`
- **Status**: `Pending User Verification` (Interactive admin account check)
