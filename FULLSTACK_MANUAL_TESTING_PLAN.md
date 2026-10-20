# DevMeet — Full-Stack Manual Testing Plan

**Version:** 1.0  
**Last Updated:** 2026-10-20  
**Environment:** http://localhost:3000 (frontend) / http://localhost:8000 (API gateway)

---

## Prerequisites

Before starting manual tests, verify all services are running:

```powershell
cd "e:\AI INTERVIEW"
docker compose ps
# All 17 containers should show "Up"

powershell -File scripts/e2e-smoke.ps1
# Should show 10/10 PASS
```

---

## Test Suite 1: Registration & Login

### TC-AUTH-001: New User Registration

**Steps:**
1. Open `http://localhost:3000`
2. Click **Sign Up** or navigate to `/register`
3. Fill in: Full Name, Display Name (username), Email, Password (min 8 chars, 1 uppercase, 1 number)
4. Click **Create Account**

**Expected:**
- Form validates all fields inline
- On submit: spinner shows briefly
- Redirect to `/dashboard`
- Welcome banner or toast appears with display name
- JWT tokens stored in localStorage (`access_token`, `refresh_token`)

**Failure indicators:**
- "Too many registration attempts" → clear Redis rate limit keys
- "Email already in use" → use a different email
- 422 validation error → check all required fields are filled

---

### TC-AUTH-002: Login with Existing Account

**Steps:**
1. Navigate to `/login`
2. Enter valid email + password
3. Click **Sign In**

**Expected:**
- Redirect to `/dashboard` within 1 second
- AuthContext shows `isAuthenticated = true`
- No console errors

---

### TC-AUTH-003: Token Refresh

**Steps:**
1. Log in, wait for `expires_in` seconds (or manually expire the token in localStorage)
2. Make any API call (e.g., navigate to `/dashboard`)

**Expected:**
- Silent refresh triggers automatically (401 interceptor in `api.ts`)
- New `access_token` written to localStorage
- Page loads without requiring re-login

---

### TC-AUTH-004: Logout

**Steps:**
1. Click user avatar / profile menu → **Sign Out**

**Expected:**
- localStorage cleared (`access_token`, `refresh_token` removed)
- Redirect to `/login` or home
- Navigating to `/dashboard` requires re-login

---

## Test Suite 2: Dashboard

### TC-DASH-001: Dashboard Data Loading

**Steps:**
1. Log in as a user with at least 1 completed session
2. Navigate to `/dashboard`

**Expected:**
- Stat cards show: Total Sessions, Average Score, Current Streak, Best Score
- Activity heatmap (ConsistencyGrid) renders with correct colors
- "Recent Sessions" table shows session list
- No layout overflow or overlapping cards

---

### TC-DASH-002: Empty State Dashboard

**Steps:**
1. Log in as a brand new user (no sessions yet)
2. Navigate to `/dashboard`

**Expected:**
- Stat cards show zeros
- Empty state message visible in "Recent Sessions" area
- "Start Interview" CTA button prominently shown
- No errors in console

---

## Test Suite 3: Session Creation

### TC-SESS-001: Create a New Interview Session

**Steps:**
1. From dashboard, click **Start Interview** or navigate to `/sessions/new`
2. Select: Interview Type = DSA, Difficulty = Easy, Duration = 30 min
3. Click **Create Session**

**Expected:**
- Loading spinner appears briefly
- Session created in < 2 seconds
- Redirect to `/interview/[session-id]`
- Page shows `InterviewStartScreen` with pre-flight checklist

**Failure indicators:**
- Infinite loading → check orchestrator logs: `docker logs aiinterview-orchestrator-service-1`
- 409 Conflict → user already has an active session (cancel it first)
- 429 Rate limit → quota exceeded for today

---

### TC-SESS-002: Duplicate Session Prevention

**Steps:**
1. Create a session (TC-SESS-001)
2. Without completing it, try to create another session

**Expected:**
- 409 Conflict response
- Error message: "You already have an active interview session"
- Shows link to the existing session

---

## Test Suite 4: Interview Start & Conduct

### TC-INT-001: Pre-flight Device Check

**Steps:**
1. Navigate to `/interview/[id]` with a session in `created` status
2. Browser prompts for camera + microphone permissions → **Allow**

**Expected:**
- Camera preview appears in the video tile
- Microphone level indicator shows activity when speaking
- All pre-flight checks show green checkmarks
- "Start Interview" button becomes enabled

**Failure indicators:**
- Camera shows black → check browser permissions in settings
- "Proctoring unavailable" → acceptable; interview can still start after 4.5s timeout

---

### TC-INT-002: Start the Interview

**Steps:**
1. Complete pre-flight (TC-INT-001)
2. Click **Start Interview**

**Expected:**
- `POST /api/v1/sessions/{id}/start` returns 200
- Session status changes to `in_progress`
- AI interviewer's first question appears (text or audio)
- Timer starts counting down
- Proctoring indicators active (tab-switch detection)

---

### TC-INT-003: Answer a Question

**Steps:**
1. While interview is in progress
2. Type a text response and click **Submit Answer** or speak into microphone

**Expected:**
- Turn saved to server (`POST /api/v1/sessions/{id}/turns`)
- Next question appears (or AI follow-up)
- Turn history visible in sidebar / transcript area

---

### TC-INT-004: Code Submission (DSA Interview)

**Steps:**
1. In a DSA-type interview, navigate to the code editor tab
2. Write a solution in Python/JavaScript/Java
3. Click **Run Code**

**Expected:**
- `POST /api/v1/execute` returns within 5 seconds
- Stdout / stderr displayed below the editor
- Pass/fail test case results shown

---

### TC-INT-005: Complete the Interview

**Steps:**
1. Click **End Interview** or wait for timer to expire

**Expected:**
- Confirmation dialog appears
- On confirm: `POST /api/v1/sessions/{id}/complete` returns 200
- Session status → `completed`
- Redirect to `/feedback/[id]`

---

## Test Suite 5: LiveKit / WebRTC Connection

### TC-WEB-001: LiveKit Token Validity

**Steps:**
1. Create a session (TC-SESS-001)
2. In browser DevTools → Network tab → find `POST /api/v1/sessions` response
3. Note `livekit_token` and `livekit_url` fields

**Expected:**
- `livekit_url` is `wss://ai-intrerview-ie7jpnau.livekit.cloud`
- `livekit_token` is a non-empty JWT (3 base64 parts separated by `.`)

---

### TC-WEB-002: Camera/Mic Publish

**Steps:**
1. Start interview (TC-INT-002)
2. Check browser DevTools → Console for LiveKit SDK logs

**Expected:**
- No "connection timeout" errors
- `Room connected` log visible
- Local participant tracks published (camera + mic)

---

### TC-WEB-003: Proctoring Graceful Degradation

**Steps:**
1. Start interview but deny camera/mic permission
2. Wait for pre-flight timeout (4.5 seconds)

**Expected:**
- Warning banner: "Proctoring unavailable — camera access denied"
- Interview can still proceed (proctoring is non-blocking)
- Session creates and starts normally

---

## Test Suite 6: Feedback

### TC-FEED-001: View Interview Feedback

**Steps:**
1. Complete an interview (TC-INT-005)
2. On redirect to `/feedback/[id]`, wait for feedback to generate

**Expected:**
- Score breakdown (communication, technical, problem-solving) appears
- Radar chart renders with correct axes
- Strengths / Areas for Improvement listed as bullet points
- Overall percentage score shown prominently

---

### TC-FEED-002: Feedback PDF Export

**Steps:**
1. On `/feedback/[id]`, click **Download Report** / **Export PDF**

**Expected:**
- `GET /api/v1/feedback/{id}/pdf` returns a PDF file
- Browser download dialog opens with `.pdf` extension
- PDF contains all score sections and question transcripts

---

## Test Suite 7: Profile & Settings

### TC-PROF-001: View & Edit Profile

**Steps:**
1. Navigate to `/profile`

**Expected:**
- Display name, bio, skills, target companies shown
- Edit form with Save button
- `PATCH /api/v1/users/me` saves changes successfully
- Success toast after save

---

### TC-PROF-002: Avatar Upload

**Steps:**
1. On `/profile`, click the avatar image
2. Select a JPEG/PNG file < 5MB

**Expected:**
- `POST /api/v1/files/upload` uploads file
- New avatar URL stored in user profile
- Avatar updates without page reload

---

### TC-PROF-003: View Usage Quota

**Steps:**
1. Navigate to `/profile` or `/settings`

**Expected:**
- "Interviews today: X / 5" (free plan)
- "Interviews this month: X / 5" (free plan)
- Upgrade CTA visible

---

## Test Suite 8: Admin Panel

### TC-ADMIN-001: Admin Dashboard Access

**Steps:**
1. Log in as user with `role: admin`
2. Navigate to `/admin`

**Expected:**
- Platform stats: total users, total sessions, daily active
- User list with search and filter
- No 403 errors for admin routes

---

## Regression Checks (Run After Any Code Change)

```powershell
# TypeScript check
cd "e:\AI INTERVIEW\frontend"
npx tsc --noEmit
# Must show 0 errors

# All backend tests
powershell -File "e:\AI INTERVIEW\scripts\test-all-services.ps1"
# Must show all 11 services passing

# E2E smoke test
powershell -File "e:\AI INTERVIEW\scripts\e2e-smoke.ps1"
# Must show 10/10 PASS
```

---

## Known Limitations

| Limitation | Workaround |
|-----------|-----------|
| Razorpay is in mock mode | Use "Mock Payment" button in dev |
| LiveKit room requires internet connection | Ensure outbound WSS to `ai-intrerview-ie7jpnau.livekit.cloud` |
| Rate limits during repeated testing | `docker exec aiinterview-redis-1 redis-cli KEYS "rate_limit:*"` then DEL them |
| AI interviewer requires OpenAI API key | Set `OPENAI_API_KEY` in `.env` |
