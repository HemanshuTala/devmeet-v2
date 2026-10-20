# DevMeet Frontend Manual & Automated Testing Plan

This document outlines the testing strategy, smoke test verification checklist, cross-browser scenarios, and end-to-end integration flows across the DevMeet frontend.

---

## 1. Automated Verification Checks

### 1.1 TypeScript Type Checking
Run the static compiler in the `frontend` workspace:
```bash
cd frontend
npx tsc --noEmit
```
**Expected Outcome**: Exits with code 0 and zero type errors.

### 1.2 Production Next.js Build
Verify that all pages, static paths, and dynamic client routes build cleanly:
```bash
cd frontend
npm run build
```
**Expected Outcome**: All routes compile to static/dynamic artifacts without compilation errors.

---

## 2. End-to-End Smoke Test Scenarios

### Scenario 1: Authentication & Social Redirects
1. **Flow**:
   - Navigate to `/login`.
   - Test email/password submission with invalid credentials (verify error alert renders).
   - Test valid credentials (verify token is stored under `localStorage.getItem('access_token')`).
   - Confirm router transitions to `/dashboard`.
   - Test Social Login redirect (`/login?access_token=VALID_JWT`) to verify automatic session hydration.
2. **Edge Cases**:
   - MFA-enabled account receives TOTP prompt; verify 6-digit input and backup code toggle.
   - Password reset flow: verify `/forgot-password` dispatches reset email, and `/reset-password?token=...` accepts new password.

### Scenario 2: Session Setup & Pre-flight Device Check
1. **Flow**:
   - Navigate to `/dashboard/create-session`.
   - Select track: **DSA**, difficulty: **Medium**, duration: **45m**.
   - Check recording consent box.
   - Click "Start Interview Session".
   - Verify redirection to `/interview/[id]`.
   - Verify pre-flight device check screen renders and validates camera and microphone permissions.
   - Click "Join Interview" -> verify fullscreen request triggers.

### Scenario 3: In-Session Anti-Cheating & Auto-Pause
1. **Flow**:
   - While in active interview, press `Alt+Tab` or switch browser tabs.
   - **Verification**:
     - Session automatically pauses.
     - Cheating detection counter increments `tab_switch_count`.
     - Timer pauses.
   - Return focus to tab:
     - Verify session calls `/resume` and unpauses.
     - Warning modal indicates tab-switch detected.

### Scenario 4: Code Sandbox Execution
1. **Flow**:
   - In Code Editor, select **Python 3**.
   - Write standard solution (e.g. `def two_sum(nums, target): ...`).
   - Click **Run Code**.
   - Verify stdout and test case results stream back into execution console.
   - Click **Submit Solution**.
   - Verify code is saved via `sessionApi.submitCode()`.

### Scenario 5: End Interview & STAR Feedback Report
1. **Flow**:
   - Click **End Interview**.
   - Verify `ConfirmModal` displays warning.
   - Click confirm:
     - Fullscreen exits safely.
     - Session status updates to `completed`.
     - Router navigates to `/interview/[id]/feedback`.
   - Verify STAR scorecard loads (Situation, Task, Action, Result).
   - Click "Download PDF" -> verify blob downloads properly.

### Scenario 6: Razorpay Billing & Upgrade
1. **Flow**:
   - Navigate to `/billing`.
   - Toggle Annual / Monthly pricing switches.
   - Click "Upgrade to Pro".
   - Verify Razorpay checkout modal opens with order ID and amount in INR (₹).
   - After payment simulation, verify invoice row appears in Billing History.

---

## 3. Responsive Breakpoint Matrix

| Screen Size | Target Viewport | Key Verification Items |
|---|---|---|
| **Mobile S / M** | 375px - 414px | No horizontal overflow; hamburger menu works; forms single-column; code editor wrapped cleanly. |
| **Tablet** | 768px - 834px | Dashboard cards 2x2 grid; sidebar collapses to drawer; modal dialogs stay within viewport margins. |
| **Desktop** | 1280px - 1440px | Side-by-side Code Editor and AI Interviewer panels; persistent left navigation. |
| **Ultra-Wide** | 1920px+ | Layout respects `max-w-7xl` containers; elements do not stretch awkwardly. |

---

## 4. Accessibility (a11y) Standards

- **Keyboard Navigation**: All interactive elements (buttons, inputs, dropdowns, tabs) accessible via `Tab` and `Shift+Tab`.
- **Focus Rings**: Distinct 2px focus outlines (`focus-visible:ring-2 focus-visible:ring-blue-500`).
- **Screen Reader Tags**: All icon buttons include explicit `aria-label` attributes (e.g., eye toggle, dismiss toast, close modal).
- **Color Contrast**: All text elements meet WCAG AA standards (minimum 4.5:1 ratio against backgrounds).
