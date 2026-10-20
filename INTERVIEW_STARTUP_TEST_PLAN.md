# DevMeet v2.0 — Interview Startup Test Plan & Verification Procedures

This document provides automated test suites and exact manual step-by-step procedures to verify the interview startup workflow, LiveKit connection, proctoring fallback, and recovery states.

---

## 1. Test Matrix & Automated Verification

| Test ID | Scenario | Verification Method | Expected Behavior | Status |
| :--- | :--- | :--- | :--- | :---: |
| **ST-01** | Session Start Idempotency | HTTP POST `/api/v1/sessions/{id}/start` | Repeated start requests on `in_progress` session return 200 without duplicate creation. | **`Verified`** |
| **ST-02** | LiveKit Token Generation | HTTP POST `/api/v1/video/token` | Generates signed LiveKit JWT with room and participant identity grants. | **`Verified`** |
| **ST-03** | LiveKit WebSocket Handshake | WSS connect `wss://ai-intrerview-ie7jpnau.livekit.cloud` | Successful protocol upgrade and handshake with LiveKit cloud. | **`Verified`** |
| **ST-04** | AI Question Stream | HTTP POST `/api/v1/interview/question/stream` | Streams initial question SSE tokens with fallback on empty prompt. | **`Verified`** |
| **ST-05** | Proctoring Timeout Fallback | Browser unit/integration test | Dynamic ML download times out after 4.5s; unblocks local camera without freezing UI. | **`Verified`** |
| **ST-06** | Fullscreen User Gesture | React click handler | `enterFullscreen()` called synchronously within click event to prevent browser rejection. | **`Verified`** |
| **ST-07** | Non-blocking Studio Entry | Frontend lifecycle state machine | Studio loads within 900ms; question streams inside chat with live typing indicator. | **`Verified`** |
| **ST-08** | Question Generation Recovery | Frontend error boundary | If question stream fails, inline "Generate Question" button allows candidate self-recovery. | **`Verified`** |

---

## 2. Step-by-Step Manual Verification Procedure

### Prerequisite:
Ensure all 17 Docker containers are active:
```bash
docker ps
```
The frontend should be accessible at `http://localhost:3000` and API Gateway at `http://localhost:8000`.

---

### Step 1: Login / Register Candidate Session
1. Navigate to [http://localhost:3000/login](http://localhost:3000/login) (or `/register`).
2. Login with credentials or create a new candidate account:
   - Email: `candidate_test@example.com`
   - Password: `Password123!`
3. You will be redirected to the candidate dashboard (`/dashboard`).

---

### Step 2: Create a Practice Session
1. Click **"New Interview"** or navigate to `/dashboard/create-session`.
2. Select:
   - **Track**: `Data Structures & Algorithms` (or Behavioral / System Design).
   - **Difficulty**: `Medium`.
   - **Target Company**: `Google` (optional).
   - **Duration**: `30 minutes`.
3. Click **"Create Session"**.
4. You will be redirected to `/interview/{session_id}`.

---

### Step 3: Complete Device Check
1. The **Device Check Screen** will verify:
   - Camera access (preview stream live).
   - Microphone sensitivity (meter responds to speech).
   - Network bandwidth.
2. Click **"Proceed to Interview"**.

---

### Step 4: Verify Pre-Interview Room Screen (`InterviewStartScreen`)
1. Observe the redesigned **Interview Room Ready** card:
   - Verify Track, Difficulty, Duration, and Target Company are accurately displayed.
   - Verify the 4 Pre-Flight Verification badges (Anti-Cheat, AI Evaluator, Live Media, Docker Sandbox).
2. Click **"Start Interview"** (or press `Enter ↵`).

---

### Step 5: Verify Non-Blocking Studio Launching
1. The UI will smoothly transition through the **Studio Launching Screen**:
   - Neural pulse icon animates.
   - Progress bar fills smoothly.
   - Within 900ms, the interview studio opens directly into the active layout.
2. **Verify Proctoring & Camera Feed**:
   - The camera preview is NOT blocked by an indefinite black loading overlay.
   - The video feed is displayed live.
3. **Verify AI Interviewer Turn**:
   - The AI avatar indicates thinking/typing.
   - The initial welcome/technical question streams token-by-token into the chat panel.

---

### Step 6: Verify Recovery & Error Handling
1. If network connectivity is interrupted during question generation, the chat panel displays an inline **"Generate Question"** retry button.
2. Clicking it restarts question generation without losing the session or kicking the user out of the interview.
