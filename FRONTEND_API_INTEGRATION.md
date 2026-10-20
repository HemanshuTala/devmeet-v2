# DevMeet Frontend API Integration Matrix

This document provides a complete map of all client-side API calls in `src/lib/api.ts` and their corresponding backend microservices routing through the API Gateway (`http://localhost:8000`).

---

## 1. Gateway Routing Architecture

All browser client requests target the reverse proxy API Gateway:

```text
Browser Client (Next.js)
        │
        ▼ (http://localhost:8000)
┌──────────────────────────────────────────────┐
│                  API Gateway                 │
│  - JWT Bearer Header Validation              │
│  - Global Rate Limiting                      │
│  - CORS Preflight Options                    │
└──────────────────────┬───────────────────────┘
                       │
       ┌───────────────┼───────────────┬───────────────┐
       ▼               ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│ auth-service ││session-servic││ai-interviewer││code-execution│
│  Port 8001   ││  Port 8002   ││  Port 8003   ││  Port 8004   │
└──────────────┘└──────────────┘└──────────────┘└──────────────┘
       │               │               │               │
       ▼               ▼               ▼               ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│payment-servic││search-service││video-service ││feedback-serv │
│  Port 8005   ││  Port 8006   ││  Port 8007   ││  Port 8008   │
└──────────────┘└──────────────┘└──────────────┘└──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │analytics-serv│
                        │  Port 8009   │
                        └──────────────┘
```

---

## 2. Microservice Endpoint Integration Matrix

### 2.1 Authentication (`authApi` & `apiClient`) — Service: `auth-service` (8001)

| Client Function | HTTP Method | Gateway Route | Purpose | Error Handling |
|---|---|---|---|---|
| `apiClient.login` | `POST` | `/api/v1/auth/login` | Authenticate candidate with email & password | Catches 401 & 422, returns MFA challenge if enabled |
| `apiClient.register` | `POST` | `/api/v1/auth/register` | Create candidate profile & issue JWT | Form validation, duplicate email warning |
| `apiClient.refreshToken` | `POST` | `/api/v1/auth/refresh` | Exchange refresh token for new access token | Automatic background trigger on 401 |
| `apiClient.logout` | `POST` | `/api/v1/auth/logout` | Revoke tokens & clear client storage | Always clears `localStorage` tokens |
| `apiClient.getUserProfile`| `GET` | `/api/v1/auth/me` | Retrieve current authenticated user | Redirects to `/login` if unauthenticated |
| `authApi.changePassword` | `POST` | `/api/v1/auth/change-password` | Update user password | Requires current password verification |
| `authApi.requestPasswordReset` | `POST` | `/api/v1/auth/reset-password-request` | Send recovery email | Rate-limited against abuse |
| `authApi.confirmPasswordReset` | `POST` | `/api/v1/auth/reset-password-confirm` | Set new password with token | Validates token expiration |
| `authApi.enableMfa` | `POST` | `/api/v1/auth/mfa/enable` | Generate TOTP secret & QR URI | Displays setup modal with QR code |
| `authApi.verifyMfaEnrollment` | `POST` | `/api/v1/auth/mfa/verify` | Verify initial 6-digit TOTP code | Confirms MFA activation |

---

### 2.2 User Profiles (`userApi`) — Service: `auth-service` (8001)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `userApi.getProfile` | `GET` | `/api/v1/users/me` | Fetch bio, target companies, skills, reminders |
| `userApi.updateProfile` | `PUT` | `/api/v1/users/me` | Update candidate details |
| `userApi.getQuota` | `GET` | `/api/v1/users/me/quota` | Check remaining daily interview credits |
| `userApi.getPlan` | `GET` | `/api/v1/users/me/plan` | Retrieve current subscription plan tier |
| `userApi.uploadAvatar` | `POST` (FormData) | `/api/v1/users/me/avatar` | Upload profile image to object storage |
| `userApi.exportData` | `GET` | `/api/v1/users/me/export` | Download GDPR JSON archive of user history |
| `userApi.deleteAccount` | `DELETE` | `/api/v1/users/me` | Permanent account removal |
| `userApi.getLeaderboard` | `GET` | `/api/v1/users/leaderboard` | Global candidate rank and score percentiles |

---

### 2.3 Interview Sessions (`sessionApi`) — Service: `session-service` (8002)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `sessionApi.list` | `GET` | `/api/v1/sessions` | Retrieve all past user interview sessions |
| `sessionApi.get` | `GET` | `/api/v1/sessions/:id` | Get details, questions, status of a session |
| `sessionApi.create` | `POST` | `/api/v1/sessions` | Initialize new interview session |
| `sessionApi.start` | `POST` | `/api/v1/sessions/:id/start` | Transition status to `in_progress` |
| `sessionApi.complete` | `POST` | `/api/v1/sessions/:id/complete` | Conclude session and trigger feedback generation |
| `sessionApi.pause` | `POST` | `/api/v1/sessions/:id/pause` | Pause timer when tab switches |
| `sessionApi.resume` | `POST` | `/api/v1/sessions/:id/resume` | Resume session upon window focus |
| `sessionApi.cancel` | `POST` | `/api/v1/sessions/:id/cancel` | Abort an abandoned session |
| `sessionApi.heartbeat` | `POST` | `/api/v1/sessions/:id/heartbeat` | Keep-alive check every 30s |
| `sessionApi.reportCheating`| `POST` | `/api/v1/sessions/:id/cheating` | Log tab switch or paste violation |
| `sessionApi.getTurns` | `GET` | `/api/v1/sessions/:id/turns` | Load transcript turns for replay |
| `sessionApi.saveTurn` | `POST` | `/api/v1/sessions/:id/turns` | Persist chat utterance to database |
| `sessionApi.submitCode` | `POST` | `/api/v1/sessions/:id/code` | Submit candidate's code submission |

---

### 2.4 Code Execution (`executionApi`) — Service: `code-execution` (8004)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `executionApi.execute` | `POST` | `/api/v1/execute` | Synchronous isolated Docker sandbox execution |
| `executionApi.executeAsync` | `POST` | `/api/v1/execute/submit-async` | Asynchronous execution via RabbitMQ/Celery worker |

---

### 2.5 Feedback & Evaluation (`feedbackApi`) — Service: `feedback-service` (8008)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `feedbackApi.get` | `GET` | `/api/v1/feedback/:sessionId` | Retrieve STAR scorecards and evaluation |
| `feedbackApi.generate` | `POST` | `/api/v1/feedback/generate` | Trigger LLM evaluation prompt |
| `feedbackApi.downloadPdf` | `GET` | `/api/v1/feedback/:sessionId/pdf`| Stream rendered PDF analytical report |

---

### 2.6 Payments & Billing (`paymentApi`) — Service: `payment-service` (8005)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `paymentApi.getConfig` | `GET` | `/api/v1/payments/config` | Retrieve Razorpay public key ID & currency |
| `paymentApi.getPlans` | `GET` | `/api/v1/payments/plans` | Fetch active tiers (Free, Pro, Enterprise) |
| `paymentApi.getSubscription`| `GET` | `/api/v1/payments/subscription` | Current subscription status & expiry date |
| `paymentApi.getBillingHistory`| `GET` | `/api/v1/payments/billing-history`| List of past invoices and order receipts |
| `paymentApi.createCheckoutSession`| `POST` | `/api/v1/payments/checkout-session`| Create Razorpay order ID |
| `paymentApi.verifyPayment` | `POST` | `/api/v1/payments/verify-payment` | Verify Razorpay HMAC signature |
| `paymentApi.cancelSubscription`| `POST`| `/api/v1/payments/cancel` | Cancel renewal of current paid plan |

---

### 2.7 Search & Questions (`searchApi`) — Service: `search-service` (8006)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `searchApi.search` | `GET` | `/api/v1/search/questions` | Query question bank with category filters |
| `searchApi.getRandom` | `GET` | `/api/v1/search/questions/random` | Pick a random question matching criteria |

---

### 2.8 Analytics & Telemetry (`analyticsApi`) — Service: `analytics-service` (8009)

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `analyticsApi.track` | `POST` | `/api/v1/analytics/event` | Log client interaction telemetry |
| `analyticsApi.getUserDashboard`| `GET` | `/api/v1/analytics/user/:id/dashboard` | 90-day streak, completion rate, averages |
| `analyticsApi.getUserScoreTrend`| `GET` | `/api/v1/analytics/user/:id/score-trend`| 30-day score trendline data points |

---

### 2.9 Admin Panel (`adminApi`) — Service: `auth-service` / `api-gateway`

| Client Function | HTTP Method | Gateway Route | Purpose |
|---|---|---|---|
| `adminApi.getStats` | `GET` | `/api/v1/admin/stats` | Aggregated user, session, and revenue counts |
| `adminApi.listUsers` | `GET` | `/api/v1/admin/users` | Searchable table of registered candidates |
| `adminApi.getAuditLogs` | `GET` | `/api/v1/admin/audit-logs` | Immutable audit trail of administrative actions |
| `adminApi.blockUser` | `POST` | `/api/v1/admin/users/:id/block` | Restrict user account access |
| `adminApi.unblockUser` | `POST` | `/api/v1/admin/users/:id/unblock` | Restore user account access |
| `adminApi.changePlan` | `PUT` | `/api/v1/admin/users/:id/plan` | Manually elevate or downgrade user tier |
| `adminApi.deleteUser` | `DELETE` | `/api/v1/admin/users/:id` | Anonymize user record |
| `adminApi.impersonateUser` | `POST` | `/api/v1/admin/users/:id/impersonate`| Generate delegate session for support |
