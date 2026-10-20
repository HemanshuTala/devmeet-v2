# DevMeet v2.0 — Frontend API Integration & Microservice Contract Audit

**Date:** October 2026  
**Status:** Verified via Playwright Network Interception & Microservice Test Harness  

---

## 1. Frontend-to-Backend Endpoints Inventory

| Microservice | Gateway Route Path | HTTP Method | Frontend Caller | Contract Status |
|---|---|---|---|---|
| **API Gateway** | `/health` | GET | Health Probes / Monitor | Verified (`status: "ok"`) |
| **Auth Service** | `/api/v1/auth/login` | POST | `apiClient.login()` | Verified |
| **Auth Service** | `/api/v1/auth/register` | POST | `apiClient.register()` | Verified |
| **Auth Service** | `/api/v1/auth/refresh` | POST | `executeSingleFlightRefresh()` | Hardened (single-flight) |
| **Auth Service** | `/api/v1/auth/me` | GET | `apiClient.getUserProfile()` | Verified |
| **User Service** | `/api/v1/users/quota` | GET | `useQuota()` | Verified (5 free limit aligned) |
| **User Service** | `/api/v1/users/profile` | GET / PUT | `userApi.getProfile()` | Verified |
| **Orchestrator** | `/api/v1/sessions` | POST | `sessionApi.createSession()` | Verified |
| **Orchestrator** | `/api/v1/sessions/{id}` | GET | `useSessionDetail()` | Verified |
| **Search Service** | `/api/v1/search/questions` | GET | `searchApi.search()` | Verified (prefetched, fast) |
| **Search Service** | `/api/v1/search/questions/random` | GET | `searchApi.getRandom()` | Verified |
| **AI Interviewer**| `/api/v1/interview/question/stream` | POST | `useAIStreaming()` | Verified (SSE token stream) |
| **AI Interviewer**| `/api/v1/interview/hint` | POST | `aiApi.getHint()` | Verified |
| **Execution** | `/api/v1/execute` | POST | `executionApi.executeCode()` | Verified (Monaco sandbox) |
| **Payment Service**| `/api/v1/payments/plans` | GET | `paymentApi.getPlans()` | Verified (Free, Pro, Enterprise) |
| **Payment Service**| `/api/v1/payments/subscription` | GET | `paymentApi.getSubscription()` | Verified |
| **Feedback Service**| `/api/v1/feedback/{id}` | GET | `feedbackApi.getReport()` | Verified |

---

## 2. Network Header Standards

All outbound requests routed through `src/lib/api.ts` adhere to:
1. `Content-Type: application/json` (automatically omitted for `FormData` file uploads).
2. `Authorization: Bearer <accessToken>` injected if candidate is authenticated.
3. `X-Request-ID: fe-<timestamp>-<rand>` injected for distributed tracing correlation across Gateway and Python/Node services.
4. `credentials: 'include'` for secure cookie handling.
