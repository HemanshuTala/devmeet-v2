# DevMeet — Master API Verification & Test Report

**Execution Date:** 2026-10-20 16:43:29 UTC  
**Gateway Target:** `http://localhost:8000`  
**Total Tested Endpoints:** 68  
**Passed:** 68  
**Failed:** 0  
**Pass Rate:** **100.0%**  

---

## API Results by Domain

| Domain | Method | Endpoint | Expected | Actual | Latency | Status |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| Gateway | `GET` | `/health` | `200` | `200` | 33.2ms | ✅ PASS |
| Auth | `POST` | `/api/v1/auth/register` | `201` | `201` | 592.0ms | ✅ PASS |
| Auth | `POST` | `/api/v1/auth/login` | `200` | `200` | 581.1ms | ✅ PASS |
| Auth | `GET` | `/api/v1/auth/me` | `200` | `200` | 8.6ms | ✅ PASS |
| Auth | `POST` | `/api/v1/auth/register` | `201` | `201` | 689.2ms | ✅ PASS |
| Auth/RBAC | `GET` | `/api/v1/auth/verify-admin` | `403` | `403` | 10.8ms | ✅ PASS |
| Auth/RBAC | `GET` | `/api/v1/auth/verify-admin` | `200` | `200` | 10.5ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me` | `200` | `200` | 57.1ms | ✅ PASS |
| Users | `PUT` | `/api/v1/users/me` | `200` | `200` | 42.3ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me/quota` | `200` | `200` | 34.3ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me/plan` | `200` | `200` | 36.0ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/leaderboard` | `200` | `200` | 56.1ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me/export` | `200` | `200` | 44.7ms | ✅ PASS |
| Search | `GET` | `/api/v1/search/questions` | `200` | `200` | 19.1ms | ✅ PASS |
| Search | `GET` | `/api/v1/search/questions/random` | `200` | `200` | 7.7ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions` | `201` | `201` | 135.1ms | ✅ PASS |
| Orchestrator | `GET` | `/api/v1/sessions` | `200` | `200` | 21.1ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions` | `409` | `409` | 124.4ms | ✅ PASS |
| Orchestrator | `GET` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2` | `200` | `200` | 24.0ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/start` | `200` | `200` | 32.5ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/turns` | `201` | `201` | 75.9ms | ✅ PASS |
| Orchestrator | `GET` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/turns` | `200` | `200` | 25.2ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/code` | `200` | `200` | 72.2ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/heartbeat` | `200` | `200` | 26.5ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/consent` | `200` | `200` | 72.3ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/pause` | `200` | `200` | 32.7ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/resume` | `200` | `200` | 39.3ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/complete` | `200` | `200` | 29.0ms | ✅ PASS |
| Video | `GET` | `/api/v1/video/health` | `200` | `200` | 6.3ms | ✅ PASS |
| Video | `GET` | `/api/v1/video` | `200` | `200` | 4.4ms | ✅ PASS |
| Video | `POST` | `/api/v1/video/token` | `200` | `200` | 49.9ms | ✅ PASS |
| Video | `POST` | `/api/v1/video/preflight` | `200` | `200` | 52.1ms | ✅ PASS |
| Video | `POST` | `/api/v1/video/room/create` | `200` | `200` | 50.8ms | ✅ PASS |
| Video | `GET` | `/api/v1/video/room/test_room_9944` | `200` | `200` | 7.8ms | ✅ PASS |
| Video | `GET` | `/api/v1/video/room/test_room_9944/recording/status` | `200` | `200` | 6.9ms | ✅ PASS |
| Video | `DELETE` | `/api/v1/video/room/test_room_9944` | `200` | `200` | 7.9ms | ✅ PASS |
| CodeExecution | `GET` | `/api/v1/execute/languages` | `200` | `200` | 16.6ms | ✅ PASS |
| CodeExecution | `POST` | `/api/v1/execute` | `200` | `200` | 959.7ms | ✅ PASS |
| CodeExecution | `POST` | `/api/v1/execute/scan-safety` | `200` | `200` | 70.9ms | ✅ PASS |
| CodeExecution | `POST` | `/api/v1/execute/run-tests` | `200` | `200` | 1670.7ms | ✅ PASS |
| AIInterviewer | `GET` | `http://localhost:8004/health` | `200` | `200` | 19.0ms | ✅ PASS |
| AIInterviewer | `POST` | `/api/v1/interview/hint` | `[200, 403, 429, 503]` | `403` | 72.9ms | ✅ PASS |
| AIInterviewer | `POST` | `/api/v1/interview/star-analysis` | `[200, 429, 503]` | `200` | 25.6ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/metrics` | `200` | `200` | 70.9ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/daily` | `200` | `200` | 8.5ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/languages` | `200` | `200` | 7.0ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/scores` | `200` | `200` | 7.9ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/funnel` | `200` | `200` | 9.4ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/retention` | `200` | `200` | 6.3ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/realtime` | `200` | `200` | 8.5ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/user/294577d6-9346-4f91-8945-f99ba57c5372/dashboard` | `200` | `200` | 15.6ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/user/294577d6-9346-4f91-8945-f99ba57c5372/sessions` | `200` | `200` | 9.2ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/user/294577d6-9346-4f91-8945-f99ba57c5372/score-trend` | `200` | `200` | 8.0ms | ✅ PASS |
| Feedback | `GET` | `http://localhost:8007/health` | `200` | `200` | 58.7ms | ✅ PASS |
| Feedback | `GET` | `/api/v1/feedback/19a33ae9-6069-4816-b275-28fd26458be2` | `[200, 404]` | `404` | 11.1ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/config` | `200` | `200` | 8.6ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/plans` | `200` | `200` | 5.5ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/subscription` | `200` | `200` | 39.4ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/billing-history` | `200` | `200` | 17.9ms | ✅ PASS |
| Payments | `POST` | `/api/v1/payments/checkout-session` | `200` | `200` | 1777.0ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/stats` | `403` | `403` | 12.2ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/stats` | `200` | `200` | 121.6ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/users` | `200` | `200` | 29.5ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/audit-logs` | `200` | `200` | 33.4ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/sessions` | `200` | `200` | 26.9ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/system/health` | `200` | `200` | 24.4ms | ✅ PASS |
| Files | `GET` | `http://localhost:8011/health` | `200` | `200` | 12.2ms | ✅ PASS |
| Files | `GET` | `/api/v1/files/list` | `200` | `200` | 9.6ms | ✅ PASS |

---

## Detailed Domain Breakdown

### Gateway (1/1 passed)

- **✅ API Gateway Health** (`GET /health`)
  - Status: `200` (Expected: `200`) | Latency: `33.2ms`
  - Response Preview: `{"status": "ok", "service": "api-gateway"}`

### Auth (4/4 passed)

- **✅ Register Candidate** (`POST /api/v1/auth/register`)
  - Status: `201` (Expected: `201`) | Latency: `592.0ms`
  - Response Preview: `{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyOTQ1NzdkNi05MzQ2LTRmOTEtODk0NS1mO`

- **✅ Login Candidate** (`POST /api/v1/auth/login`)
  - Status: `200` (Expected: `200`) | Latency: `581.1ms`
  - Response Preview: `{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyOTQ1NzdkNi05MzQ2LTRmOTEtODk0NS1mO`

- **✅ Current Auth User Profile** (`GET /api/v1/auth/me`)
  - Status: `200` (Expected: `200`) | Latency: `8.6ms`
  - Response Preview: `{"id": "294577d6-9346-4f91-8945-f99ba57c5372", "email": "candidate_1792514599944@example.com", "disp`

- **✅ Register Admin** (`POST /api/v1/auth/register`)
  - Status: `201` (Expected: `201`) | Latency: `689.2ms`
  - Response Preview: `{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0NzFlYWMzMS03MjNiLTQ5MzMtYTE2My1mN`

### Auth/RBAC (2/2 passed)

- **✅ RBAC Guard: Candidate 403** (`GET /api/v1/auth/verify-admin`)
  - Status: `403` (Expected: `403`) | Latency: `10.8ms`
  - Response Preview: `{"detail": "Admin access required"}`

- **✅ RBAC Guard: Admin 200** (`GET /api/v1/auth/verify-admin`)
  - Status: `200` (Expected: `200`) | Latency: `10.5ms`

### Users (6/6 passed)

- **✅ Get Candidate Profile** (`GET /api/v1/users/me`)
  - Status: `200` (Expected: `200`) | Latency: `57.1ms`
  - Response Preview: `{"id": "294577d6-9346-4f91-8945-f99ba57c5372", "email": "candidate_1792514599944@example.com", "disp`

- **✅ Update User Profile** (`PUT /api/v1/users/me`)
  - Status: `200` (Expected: `200`) | Latency: `42.3ms`
  - Response Preview: `{"id": "294577d6-9346-4f91-8945-f99ba57c5372", "email": "candidate_1792514599944@example.com", "disp`

- **✅ Get Usage Quota** (`GET /api/v1/users/me/quota`)
  - Status: `200` (Expected: `200`) | Latency: `34.3ms`
  - Response Preview: `{"interviews_today": 0, "interviews_this_month": 0, "last_reset_date": "2026-10-20", "plan": "free",`

- **✅ Get Current Subscription Plan** (`GET /api/v1/users/me/plan`)
  - Status: `200` (Expected: `200`) | Latency: `36.0ms`
  - Response Preview: `{"plan": "free", "created_at": "2026-10-20T16:43:20.522879Z", "updated_at": "2026-10-20T16:43:20.522`

- **✅ Get Leaderboard** (`GET /api/v1/users/leaderboard`)
  - Status: `200` (Expected: `200`) | Latency: `56.1ms`
  - Response Preview: `[]`

- **✅ Export User Account Data** (`GET /api/v1/users/me/export`)
  - Status: `200` (Expected: `200`) | Latency: `44.7ms`
  - Response Preview: `{"data_export_version": "1.0", "exported_at": "2026-10-20T16:43:22.947236", "profile": {"id": "29457`

### Search (2/2 passed)

- **✅ Search Questions Catalog** (`GET /api/v1/search/questions`)
  - Status: `200` (Expected: `200`) | Latency: `19.1ms`
  - Response Preview: `{"questions": [{"id": "dsa-01-two-sum", "title": "Two Sum", "description": "Given an array of intege`

- **✅ Fetch Random Seed Problem** (`GET /api/v1/search/questions/random`)
  - Status: `200` (Expected: `200`) | Latency: `7.7ms`
  - Response Preview: `{"id": "dsa-19-reverse-linked-list", "title": "Reverse Linked List", "description": "Given the head `

### Orchestrator (13/13 passed)

- **✅ Create Interview Session** (`POST /api/v1/sessions`)
  - Status: `201` (Expected: `201`) | Latency: `135.1ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

- **✅ List User Sessions** (`GET /api/v1/sessions`)
  - Status: `200` (Expected: `200`) | Latency: `21.1ms`
  - Response Preview: `[{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "`

- **✅ Concurrent Session Guard (409)** (`POST /api/v1/sessions`)
  - Status: `409` (Expected: `409`) | Latency: `124.4ms`
  - Response Preview: `{"detail": {"code": "CONCURRENT_SESSION", "message": "You already have an active interview session."`

- **✅ Get Session Details** (`GET /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2`)
  - Status: `200` (Expected: `200`) | Latency: `24.0ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

- **✅ Start Session (created -> in_progress)** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/start`)
  - Status: `200` (Expected: `200`) | Latency: `32.5ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

- **✅ Append Dialogue Turn** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/turns`)
  - Status: `201` (Expected: `201`) | Latency: `75.9ms`
  - Response Preview: `{"id": "819662e8-c145-47eb-a39f-6e325eeb5683", "session_id": "19a33ae9-6069-4816-b275-28fd26458be2",`

- **✅ Get Dialogue Turns** (`GET /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/turns`)
  - Status: `200` (Expected: `200`) | Latency: `25.2ms`
  - Response Preview: `[{"id": "819662e8-c145-47eb-a39f-6e325eeb5683", "session_id": "19a33ae9-6069-4816-b275-28fd26458be2"`

- **✅ Submit Candidate Code** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/code`)
  - Status: `200` (Expected: `200`) | Latency: `72.2ms`
  - Response Preview: `{"session_id": "19a33ae9-6069-4816-b275-28fd26458be2", "language": "python", "code": "class Solution`

- **✅ Client Heartbeat Ping** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/heartbeat`)
  - Status: `200` (Expected: `200`) | Latency: `26.5ms`
  - Response Preview: `{"session_id": "19a33ae9-6069-4816-b275-28fd26458be2", "status": "in_progress", "active": true, "hea`

- **✅ Recording Consent Update** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/consent`)
  - Status: `200` (Expected: `200`) | Latency: `72.3ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

- **✅ Pause Session** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/pause`)
  - Status: `200` (Expected: `200`) | Latency: `32.7ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

- **✅ Resume Session** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/resume`)
  - Status: `200` (Expected: `200`) | Latency: `39.3ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

- **✅ Complete Session** (`POST /api/v1/sessions/19a33ae9-6069-4816-b275-28fd26458be2/complete`)
  - Status: `200` (Expected: `200`) | Latency: `29.0ms`
  - Response Preview: `{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "i`

### Video (8/8 passed)

- **✅ Video Health Check** (`GET /api/v1/video/health`)
  - Status: `200` (Expected: `200`) | Latency: `6.3ms`
  - Response Preview: `{"status": "healthy", "service": "video-service", "livekit_configured": true, "turn_enabled": false,`

- **✅ Video Root Info** (`GET /api/v1/video`)
  - Status: `200` (Expected: `200`) | Latency: `4.4ms`
  - Response Preview: `{"message": "DevMeet Video Service API"}`

- **✅ Mint LiveKit Room JWT** (`POST /api/v1/video/token`)
  - Status: `200` (Expected: `200`) | Latency: `49.9ms`
  - Response Preview: `{"token": "eyJhbGciOiJIUzI1NiJ9.eyJuYW1lIjoidXNlcl85OTQ0IiwidmlkZW8iOnsicm9vbUpvaW4iOnRydWUsInJvb20i`

- **✅ Preflight Device Diagnostics** (`POST /api/v1/video/preflight`)
  - Status: `200` (Expected: `200`) | Latency: `52.1ms`
  - Response Preview: `{"camera_ok": false, "mic_ok": false, "network_quality": "good", "turn_configured": false, "livekit_`

- **✅ Create Video Room** (`POST /api/v1/video/room/create`)
  - Status: `200` (Expected: `200`) | Latency: `50.8ms`
  - Response Preview: `{"room_name": "test_room_9944", "created_at": "2026-10-20T16:43:23.876Z", "participants_count": 0}`

- **✅ Get Video Room Details** (`GET /api/v1/video/room/test_room_9944`)
  - Status: `200` (Expected: `200`) | Latency: `7.8ms`
  - Response Preview: `{"room_name": "test_room_9944", "session_id": null, "created_at": "2026-10-20T16:43:23.876Z", "parti`

- **✅ Get Recording Status** (`GET /api/v1/video/room/test_room_9944/recording/status`)
  - Status: `200` (Expected: `200`) | Latency: `6.9ms`
  - Response Preview: `{"room_name": "test_room_9944", "status": "not_started", "is_recording": false}`

- **✅ Cleanup Video Room** (`DELETE /api/v1/video/room/test_room_9944`)
  - Status: `200` (Expected: `200`) | Latency: `7.9ms`
  - Response Preview: `{"success": true, "message": "Room test_room_9944 ended successfully"}`

### CodeExecution (4/4 passed)

- **✅ Get Supported Languages** (`GET /api/v1/execute/languages`)
  - Status: `200` (Expected: `200`) | Latency: `16.6ms`
  - Response Preview: `{"languages": [{"value": "python", "name": "Python 3.11", "extension": ".py"}, {"value": "javascript`

- **✅ Run Python Sandbox Code** (`POST /api/v1/execute`)
  - Status: `200` (Expected: `200`) | Latency: `959.7ms`
  - Response Preview: `{"success": true, "output": "DevMeet Sandbox Execution OK\nResult: 5", "error": null, "execution_tim`

- **✅ AST Safety Scanner** (`POST /api/v1/execute/scan-safety`)
  - Status: `200` (Expected: `200`) | Latency: `70.9ms`
  - Response Preview: `{"safe": true, "violation": null, "language": "python"}`

- **✅ Run Test Cases** (`POST /api/v1/execute/run-tests`)
  - Status: `200` (Expected: `200`) | Latency: `1670.7ms`
  - Response Preview: `{"success": true, "results": [{"passed": false, "actual_output": "", "execution_time": 0.78010296821`

### AIInterviewer (3/3 passed)

- **✅ AI Interviewer Health (Direct)** (`GET http://localhost:8004/health`)
  - Status: `200` (Expected: `200`) | Latency: `19.0ms`
  - Response Preview: `{"status": "healthy", "service": "ai-interviewer-service"}`

- **✅ Request Problem Hint (Pro Tier Gated)** (`POST /api/v1/interview/hint`)
  - Status: `403` (Expected: `[200, 403, 429, 503]`) | Latency: `72.9ms`
  - Response Preview: `{"detail": "Hints are available on Pro and Enterprise plans only. Please upgrade to access this feat`

- **✅ STAR Behavioral Analysis** (`POST /api/v1/interview/star-analysis`)
  - Status: `200` (Expected: `[200, 429, 503]`) | Latency: `25.6ms`
  - Response Preview: `{"session_id": null, "star_components": {"situation": true, "task": false, "action": false, "result"`

### Analytics (10/10 passed)

- **✅ Global Analytics Metrics** (`GET /api/v1/analytics/metrics`)
  - Status: `200` (Expected: `200`) | Latency: `70.9ms`
  - Response Preview: `{"total_users": 1, "total_sessions": 1, "completed_sessions": 1, "active_sessions": 0, "sessions_tod`

- **✅ Daily Session Distribution** (`GET /api/v1/analytics/daily`)
  - Status: `200` (Expected: `200`) | Latency: `8.5ms`
  - Response Preview: `[{"date": "2026-10-20", "count": 1}]`

- **✅ Language Metrics** (`GET /api/v1/analytics/languages`)
  - Status: `200` (Expected: `200`) | Latency: `7.0ms`
  - Response Preview: `[]`

- **✅ Score Distribution** (`GET /api/v1/analytics/scores`)
  - Status: `200` (Expected: `200`) | Latency: `7.9ms`
  - Response Preview: `[{"range": "0-20", "count": 0}, {"range": "21-40", "count": 0}, {"range": "41-60", "count": 0}, {"ra`

- **✅ User Funnel Metrics** (`GET /api/v1/analytics/funnel`)
  - Status: `200` (Expected: `200`) | Latency: `9.4ms`
  - Response Preview: `{"funnel": [{"stage": "Session Started", "count": 0}, {"stage": "Session Completed", "count": 1, "ra`

- **✅ Retention Cohorts** (`GET /api/v1/analytics/retention`)
  - Status: `200` (Expected: `200`) | Latency: `6.3ms`
  - Response Preview: `{"d1_retention": 68.2, "d7_retention": 42.1, "d30_retention": 28.4, "note": "Cohort retention comput`

- **✅ Realtime Platform Telemetry** (`GET /api/v1/analytics/realtime`)
  - Status: `200` (Expected: `200`) | Latency: `8.5ms`
  - Response Preview: `{"events_per_minute": 0, "active_sessions_estimate": 0}`

- **✅ User Analytics Dashboard** (`GET /api/v1/analytics/user/294577d6-9346-4f91-8945-f99ba57c5372/dashboard`)
  - Status: `200` (Expected: `200`) | Latency: `15.6ms`
  - Response Preview: `{"user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "period_days": 90, "total_sessions": 1, "complet`

- **✅ User Session History** (`GET /api/v1/analytics/user/294577d6-9346-4f91-8945-f99ba57c5372/sessions`)
  - Status: `200` (Expected: `200`) | Latency: `9.2ms`
  - Response Preview: `{"user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "sessions": [], "total": 0}`

- **✅ User Score Trend** (`GET /api/v1/analytics/user/294577d6-9346-4f91-8945-f99ba57c5372/score-trend`)
  - Status: `200` (Expected: `200`) | Latency: `8.0ms`
  - Response Preview: `{"user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "trend": [], "period_days": 30}`

### Feedback (2/2 passed)

- **✅ Feedback Health Check (Direct)** (`GET http://localhost:8007/health`)
  - Status: `200` (Expected: `200`) | Latency: `58.7ms`
  - Response Preview: `{"status": "healthy", "service": "feedback-service", "postgres_connected": true}`

- **✅ Get Session Feedback Report** (`GET /api/v1/feedback/19a33ae9-6069-4816-b275-28fd26458be2`)
  - Status: `404` (Expected: `[200, 404]`) | Latency: `11.1ms`
  - Response Preview: `{"detail": "Feedback report not found for this session"}`

### Payments (5/5 passed)

- **✅ Payment Gateway Config** (`GET /api/v1/payments/config`)
  - Status: `200` (Expected: `200`) | Latency: `8.6ms`
  - Response Preview: `{"provider": "razorpay", "razorpay_enabled": true, "razorpay_key_id": "rzp_test_SFzdvgFWIJjzUx", "cu`

- **✅ Available Subscription Plans** (`GET /api/v1/payments/plans`)
  - Status: `200` (Expected: `200`) | Latency: `5.5ms`
  - Response Preview: `{"plans": [{"plan": "free", "name": "DevMeet Free", "amount_paise": 0, "price_display": "Free", "cur`

- **✅ User Subscription Status** (`GET /api/v1/payments/subscription`)
  - Status: `200` (Expected: `200`) | Latency: `39.4ms`
  - Response Preview: `{"user_id": "294577d6-9346-4f91-8945-f99ba57c5372", "plan": "free", "status": "active", "razorpay_cu`

- **✅ User Billing History** (`GET /api/v1/payments/billing-history`)
  - Status: `200` (Expected: `200`) | Latency: `17.9ms`
  - Response Preview: `{"events": [], "total": 0}`

- **✅ Create Checkout Session** (`POST /api/v1/payments/checkout-session`)
  - Status: `200` (Expected: `200`) | Latency: `1777.0ms`
  - Response Preview: `{"session_id": "order_mock_8a781d589fb247af", "checkout_url": "http://localhost:3000/dashboard?payme`

### Admin (6/6 passed)

- **✅ Admin Stats Forbidden for Candidate** (`GET /api/v1/admin/stats`)
  - Status: `403` (Expected: `403`) | Latency: `12.2ms`
  - Response Preview: `<html>
<head><title>403 Forbidden</title></head>
<body>
<center><h1>403 Forbidden</h1></center>
`

- **✅ Admin Stats Allowed for Admin** (`GET /api/v1/admin/stats`)
  - Status: `200` (Expected: `200`) | Latency: `121.6ms`
  - Response Preview: `{"total_users": 34, "new_users_today": 34, "total_sessions": 14, "sessions_today": 14, "completed_se`

- **✅ Admin User Directory** (`GET /api/v1/admin/users`)
  - Status: `200` (Expected: `200`) | Latency: `29.5ms`
  - Response Preview: `[{"id": "471eac31-723b-4933-a163-f79711f879f4", "email": "admin_1792514599944@devmeet.com", "display`

- **✅ Admin Audit Logs** (`GET /api/v1/admin/audit-logs`)
  - Status: `200` (Expected: `200`) | Latency: `33.4ms`
  - Response Preview: `[]`

- **✅ Admin Global Sessions Monitor** (`GET /api/v1/admin/sessions`)
  - Status: `200` (Expected: `200`) | Latency: `26.9ms`
  - Response Preview: `{"sessions": [{"id": "19a33ae9-6069-4816-b275-28fd26458be2", "user_id": "294577d6-9346-4f91-8945-f99`

- **✅ Admin Relational DB Health** (`GET /api/v1/admin/system/health`)
  - Status: `200` (Expected: `200`) | Latency: `24.4ms`
  - Response Preview: `{"admin_service": "healthy", "database": "connected", "checked_at": "2026-10-20T16:43:29.057684"}`

### Files (2/2 passed)

- **✅ File Service Health (Direct)** (`GET http://localhost:8011/health`)
  - Status: `200` (Expected: `200`) | Latency: `12.2ms`
  - Response Preview: `{"status": "healthy", "service": "file-service", "storage_mode": "s3"}`

- **✅ List Files via Gateway** (`GET /api/v1/files/list`)
  - Status: `200` (Expected: `200`) | Latency: `9.6ms`
  - Response Preview: `{"files": [], "total": 0, "storage_backend": "s3"}`
