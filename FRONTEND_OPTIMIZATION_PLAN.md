# DevMeet v2.0 — Frontend Optimization Plan & Execution Matrix

**Objective:** Modernize frontend performance, eliminate perceived navigation stalls, harden authentication and API token lifecycle, and automate Playwright verification.

---

## 1. Workstreams & Phases

### Workstream 1: Perceived Navigation Performance (User Reported)
- [x] Create `src/app/dashboard/questions/loading.tsx` to provide immediate feedback on route transitions.
- [x] Create `src/app/dashboard/create-session/loading.tsx`.
- [x] Create `src/app/dashboard/history/loading.tsx`.
- [x] Create `src/app/dashboard/leaderboard/loading.tsx`.
- [x] Configure `prefetch={true}` on high-priority navigation links (`NavLink`, `QuickSelect`, Hero CTAs).
- [x] Add background prefetching for Question Bank in `DashboardPage` via TanStack Query.
- [x] Add `placeholderData: (prev) => prev` to `useQuestionSearch` so filtering and search changes do not drop the UI into an empty loading state.

### Workstream 2: Networking, API Client & Token Resilience
- [x] Implement single-flight refresh token mutex (`executeSingleFlightRefresh()`) in `src/lib/api.ts` to prevent race conditions on simultaneous 401s.
- [x] Add automated `X-Request-ID` propagation across all frontend HTTP requests.
- [x] Add optional client-side `timeoutMs` support via `AbortController`.
- [x] Normalize FastAPI 422 Unprocessable Entity error arrays into clean error messages.

### Workstream 3: Streaming, AI & Studio Memory Management
- [x] Store `AbortController` in `abortControllerRef` inside `useAIStreaming.ts`.
- [x] Add component unmount cleanup effect to abort active SSE reader streams.
- [x] Prevent overlapping streaming turns by aborting prior streams when new prompts or retries are submitted.

### Workstream 4: Playwright End-to-End Test Automation
- [x] Build shared authenticated test helper (`frontend/e2e/test-helpers.ts`) seeding localStorage tokens and mocking identity/billing endpoints.
- [x] Implement `frontend/e2e/dashboard-and-questions.spec.ts` (testing fast navigation, search filtering, and practice routing).
- [x] Implement `frontend/e2e/api-contracts.spec.ts` (testing schema validation, headers, and gateway health probes).
- [x] Implement `frontend/e2e/code-editor.spec.ts` (testing session creation wizard and billing plans).
- [x] Verify all 20 Playwright tests pass cleanly.
