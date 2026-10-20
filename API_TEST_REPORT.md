# DevMeet — Master API Verification & Test Report

**Execution Date:** 2026-10-20 16:31:15 UTC  
**Gateway Target:** `http://localhost:8000`  
**Total Tested Endpoints:** 68  
**Passed:** 68  
**Failed:** 0  
**Pass Rate:** **100.0%**  

---

## API Results by Domain

| Domain | Method | Endpoint | Expected | Actual | Latency | Status |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| Gateway | `GET` | `/health` | `200` | `200` | 26.4ms | ✅ PASS |
| Auth | `POST` | `/api/v1/auth/register` | `201` | `201` | 552.9ms | ✅ PASS |
| Auth | `POST` | `/api/v1/auth/login` | `200` | `200` | 522.1ms | ✅ PASS |
| Auth | `GET` | `/api/v1/auth/me` | `200` | `200` | 8.9ms | ✅ PASS |
| Auth | `POST` | `/api/v1/auth/register` | `201` | `201` | 645.9ms | ✅ PASS |
| Auth/RBAC | `GET` | `/api/v1/auth/verify-admin` | `403` | `403` | 12.5ms | ✅ PASS |
| Auth/RBAC | `GET` | `/api/v1/auth/verify-admin` | `200` | `200` | 10.9ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me` | `200` | `200` | 54.2ms | ✅ PASS |
| Users | `PUT` | `/api/v1/users/me` | `200` | `200` | 51.5ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me/quota` | `200` | `200` | 44.9ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me/plan` | `200` | `200` | 70.6ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/leaderboard` | `200` | `200` | 103.2ms | ✅ PASS |
| Users | `GET` | `/api/v1/users/me/export` | `200` | `200` | 62.3ms | ✅ PASS |
| Search | `GET` | `/api/v1/search/questions` | `200` | `200` | 27.2ms | ✅ PASS |
| Search | `GET` | `/api/v1/search/questions/random` | `200` | `200` | 12.4ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions` | `201` | `201` | 126.8ms | ✅ PASS |
| Orchestrator | `GET` | `/api/v1/sessions` | `200` | `200` | 18.0ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions` | `409` | `409` | 99.0ms | ✅ PASS |
| Orchestrator | `GET` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961` | `200` | `200` | 17.6ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/start` | `200` | `200` | 23.9ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/turns` | `201` | `201` | 69.2ms | ✅ PASS |
| Orchestrator | `GET` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/turns` | `200` | `200` | 20.5ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/code` | `200` | `200` | 69.2ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/heartbeat` | `200` | `200` | 21.5ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/consent` | `200` | `200` | 69.2ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/pause` | `200` | `200` | 20.6ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/resume` | `200` | `200` | 22.0ms | ✅ PASS |
| Orchestrator | `POST` | `/api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/complete` | `200` | `200` | 24.7ms | ✅ PASS |
| Video | `GET` | `/api/v1/video/health` | `200` | `200` | 7.8ms | ✅ PASS |
| Video | `GET` | `/api/v1/video` | `200` | `200` | 5.0ms | ✅ PASS |
| Video | `POST` | `/api/v1/video/token` | `200` | `200` | 51.6ms | ✅ PASS |
| Video | `POST` | `/api/v1/video/preflight` | `200` | `200` | 46.4ms | ✅ PASS |
| Video | `POST` | `/api/v1/video/room/create` | `200` | `200` | 49.1ms | ✅ PASS |
| Video | `GET` | `/api/v1/video/room/test_room_4828` | `200` | `200` | 5.9ms | ✅ PASS |
| Video | `GET` | `/api/v1/video/room/test_room_4828/recording/status` | `200` | `200` | 5.6ms | ✅ PASS |
| Video | `DELETE` | `/api/v1/video/room/test_room_4828` | `200` | `200` | 5.9ms | ✅ PASS |
| CodeExecution | `GET` | `/api/v1/execute/languages` | `200` | `200` | 20.0ms | ✅ PASS |
| CodeExecution | `POST` | `/api/v1/execute` | `200` | `200` | 1541.9ms | ✅ PASS |
| CodeExecution | `POST` | `/api/v1/execute/scan-safety` | `200` | `200` | 58.7ms | ✅ PASS |
| CodeExecution | `POST` | `/api/v1/execute/run-tests` | `200` | `200` | 3441.6ms | ✅ PASS |
| AIInterviewer | `GET` | `http://localhost:8004/health` | `200` | `200` | 21.9ms | ✅ PASS |
| AIInterviewer | `POST` | `/api/v1/interview/hint` | `[200, 403, 429, 503]` | `403` | 188.9ms | ✅ PASS |
| AIInterviewer | `POST` | `/api/v1/interview/star-analysis` | `[200, 429, 503]` | `200` | 86.1ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/metrics` | `200` | `200` | 107.2ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/daily` | `200` | `200` | 10.5ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/languages` | `200` | `200` | 10.3ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/scores` | `200` | `200` | 8.2ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/funnel` | `200` | `200` | 13.4ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/retention` | `200` | `200` | 7.8ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/realtime` | `200` | `200` | 10.1ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/user/13c50067-febf-41c2-98d4-fe2fbfccc442/dashboard` | `200` | `200` | 16.5ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/user/13c50067-febf-41c2-98d4-fe2fbfccc442/sessions` | `200` | `200` | 11.3ms | ✅ PASS |
| Analytics | `GET` | `/api/v1/analytics/user/13c50067-febf-41c2-98d4-fe2fbfccc442/score-trend` | `200` | `200` | 10.7ms | ✅ PASS |
| Feedback | `GET` | `http://localhost:8007/health` | `200` | `200` | 50.2ms | ✅ PASS |
| Feedback | `GET` | `/api/v1/feedback/9c2b2c3f-f5a7-4275-83e1-96b882358961` | `[200, 404]` | `404` | 21.7ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/config` | `200` | `200` | 28.0ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/plans` | `200` | `200` | 8.7ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/subscription` | `200` | `200` | 69.1ms | ✅ PASS |
| Payments | `GET` | `/api/v1/payments/billing-history` | `200` | `200` | 35.4ms | ✅ PASS |
| Payments | `POST` | `/api/v1/payments/checkout-session` | `200` | `200` | 407.1ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/stats` | `403` | `403` | 11.6ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/stats` | `200` | `200` | 158.5ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/users` | `200` | `200` | 41.0ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/audit-logs` | `200` | `200` | 31.4ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/sessions` | `200` | `200` | 28.8ms | ✅ PASS |
| Admin | `GET` | `/api/v1/admin/system/health` | `200` | `200` | 22.1ms | ✅ PASS |
| Files | `GET` | `http://localhost:8011/health` | `200` | `200` | 11.8ms | ✅ PASS |
| Files | `GET` | `/api/v1/files/list` | `200` | `200` | 10.7ms | ✅ PASS |

---

## Detailed Domain Breakdown

### Gateway (1/1 passed)

- **✅ API Gateway Health** (`GET /health`)
  - Status: `200` (Expected: `200`) | Latency: `26.4ms`
  - Response Preview: `{"status": "ok", "service": "api-gateway"}`

### Auth (4/4 passed)

- **✅ Register Candidate** (`POST /api/v1/auth/register`)
  - Status: `201` (Expected: `201`) | Latency: `552.9ms`
  - Response Preview: `{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxM2M1MDA2Ny1mZWJmLTQxYzItOThkNC1mZ`

- **✅ Login Candidate** (`POST /api/v1/auth/login`)
  - Status: `200` (Expected: `200`) | Latency: `522.1ms`
  - Response Preview: `{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxM2M1MDA2Ny1mZWJmLTQxYzItOThkNC1mZ`

- **✅ Current Auth User Profile** (`GET /api/v1/auth/me`)
  - Status: `200` (Expected: `200`) | Latency: `8.9ms`
  - Response Preview: `{"id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "email": "candidate_1792513864828@example.com", "disp`

- **✅ Register Admin** (`POST /api/v1/auth/register`)
  - Status: `201` (Expected: `201`) | Latency: `645.9ms`
  - Response Preview: `{"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmZDNjYTMyNS05OTMyLTRkZGEtYTU4ZC02M`

### Auth/RBAC (2/2 passed)

- **✅ RBAC Guard: Candidate 403** (`GET /api/v1/auth/verify-admin`)
  - Status: `403` (Expected: `403`) | Latency: `12.5ms`
  - Response Preview: `{"detail": "Admin access required"}`

- **✅ RBAC Guard: Admin 200** (`GET /api/v1/auth/verify-admin`)
  - Status: `200` (Expected: `200`) | Latency: `10.9ms`

### Users (6/6 passed)

- **✅ Get Candidate Profile** (`GET /api/v1/users/me`)
  - Status: `200` (Expected: `200`) | Latency: `54.2ms`
  - Response Preview: `{"id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "email": "candidate_1792513864828@example.com", "disp`

- **✅ Update User Profile** (`PUT /api/v1/users/me`)
  - Status: `200` (Expected: `200`) | Latency: `51.5ms`
  - Response Preview: `{"id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "email": "candidate_1792513864828@example.com", "disp`

- **✅ Get Usage Quota** (`GET /api/v1/users/me/quota`)
  - Status: `200` (Expected: `200`) | Latency: `44.9ms`
  - Response Preview: `{"interviews_today": 0, "interviews_this_month": 0, "last_reset_date": "2026-10-20", "plan": "free",`

- **✅ Get Current Subscription Plan** (`GET /api/v1/users/me/plan`)
  - Status: `200` (Expected: `200`) | Latency: `70.6ms`
  - Response Preview: `{"plan": "free", "created_at": "2026-10-20T16:31:05.361823Z", "updated_at": "2026-10-20T16:31:05.361`

- **✅ Get Leaderboard** (`GET /api/v1/users/leaderboard`)
  - Status: `200` (Expected: `200`) | Latency: `103.2ms`
  - Response Preview: `[]`

- **✅ Export User Account Data** (`GET /api/v1/users/me/export`)
  - Status: `200` (Expected: `200`) | Latency: `62.3ms`
  - Response Preview: `{"data_export_version": "1.0", "exported_at": "2026-10-20T16:31:07.973141", "profile": {"id": "13c50`

### Search (2/2 passed)

- **✅ Search Questions Catalog** (`GET /api/v1/search/questions`)
  - Status: `200` (Expected: `200`) | Latency: `27.2ms`
  - Response Preview: `{"questions": [{"id": "dsa-01-two-sum", "title": "Two Sum", "description": "Given an array of intege`

- **✅ Fetch Random Seed Problem** (`GET /api/v1/search/questions/random`)
  - Status: `200` (Expected: `200`) | Latency: `12.4ms`
  - Response Preview: `{"id": "dsa-18-best-time-buy-sell", "title": "Best Time to Buy and Sell Stock", "description": "You `

### Orchestrator (13/13 passed)

- **✅ Create Interview Session** (`POST /api/v1/sessions`)
  - Status: `201` (Expected: `201`) | Latency: `126.8ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

- **✅ List User Sessions** (`GET /api/v1/sessions`)
  - Status: `200` (Expected: `200`) | Latency: `18.0ms`
  - Response Preview: `[{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "`

- **✅ Concurrent Session Guard (409)** (`POST /api/v1/sessions`)
  - Status: `409` (Expected: `409`) | Latency: `99.0ms`
  - Response Preview: `{"detail": {"code": "CONCURRENT_SESSION", "message": "You already have an active interview session."`

- **✅ Get Session Details** (`GET /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961`)
  - Status: `200` (Expected: `200`) | Latency: `17.6ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

- **✅ Start Session (created -> in_progress)** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/start`)
  - Status: `200` (Expected: `200`) | Latency: `23.9ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

- **✅ Append Dialogue Turn** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/turns`)
  - Status: `201` (Expected: `201`) | Latency: `69.2ms`
  - Response Preview: `{"id": "1100161a-51fe-4a11-bc80-db85cc453b59", "session_id": "9c2b2c3f-f5a7-4275-83e1-96b882358961",`

- **✅ Get Dialogue Turns** (`GET /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/turns`)
  - Status: `200` (Expected: `200`) | Latency: `20.5ms`
  - Response Preview: `[{"id": "1100161a-51fe-4a11-bc80-db85cc453b59", "session_id": "9c2b2c3f-f5a7-4275-83e1-96b882358961"`

- **✅ Submit Candidate Code** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/code`)
  - Status: `200` (Expected: `200`) | Latency: `69.2ms`
  - Response Preview: `{"session_id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "language": "python", "code": "class Solution`

- **✅ Client Heartbeat Ping** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/heartbeat`)
  - Status: `200` (Expected: `200`) | Latency: `21.5ms`
  - Response Preview: `{"session_id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "status": "in_progress", "active": true, "hea`

- **✅ Recording Consent Update** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/consent`)
  - Status: `200` (Expected: `200`) | Latency: `69.2ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

- **✅ Pause Session** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/pause`)
  - Status: `200` (Expected: `200`) | Latency: `20.6ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

- **✅ Resume Session** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/resume`)
  - Status: `200` (Expected: `200`) | Latency: `22.0ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

- **✅ Complete Session** (`POST /api/v1/sessions/9c2b2c3f-f5a7-4275-83e1-96b882358961/complete`)
  - Status: `200` (Expected: `200`) | Latency: `24.7ms`
  - Response Preview: `{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "i`

### Video (8/8 passed)

- **✅ Video Health Check** (`GET /api/v1/video/health`)
  - Status: `200` (Expected: `200`) | Latency: `7.8ms`
  - Response Preview: `{"status": "healthy", "service": "video-service", "livekit_configured": true, "turn_enabled": false,`

- **✅ Video Root Info** (`GET /api/v1/video`)
  - Status: `200` (Expected: `200`) | Latency: `5.0ms`
  - Response Preview: `{"message": "DevMeet Video Service API"}`

- **✅ Mint LiveKit Room JWT** (`POST /api/v1/video/token`)
  - Status: `200` (Expected: `200`) | Latency: `51.6ms`
  - Response Preview: `{"token": "eyJhbGciOiJIUzI1NiJ9.eyJuYW1lIjoidXNlcl80ODI4IiwidmlkZW8iOnsicm9vbUpvaW4iOnRydWUsInJvb20i`

- **✅ Preflight Device Diagnostics** (`POST /api/v1/video/preflight`)
  - Status: `200` (Expected: `200`) | Latency: `46.4ms`
  - Response Preview: `{"camera_ok": false, "mic_ok": false, "network_quality": "good", "turn_configured": false, "livekit_`

- **✅ Create Video Room** (`POST /api/v1/video/room/create`)
  - Status: `200` (Expected: `200`) | Latency: `49.1ms`
  - Response Preview: `{"room_name": "test_room_4828", "created_at": "2026-10-20T16:31:08.797Z", "participants_count": 0}`

- **✅ Get Video Room Details** (`GET /api/v1/video/room/test_room_4828`)
  - Status: `200` (Expected: `200`) | Latency: `5.9ms`
  - Response Preview: `{"room_name": "test_room_4828", "session_id": null, "created_at": "2026-10-20T16:31:08.797Z", "parti`

- **✅ Get Recording Status** (`GET /api/v1/video/room/test_room_4828/recording/status`)
  - Status: `200` (Expected: `200`) | Latency: `5.6ms`
  - Response Preview: `{"room_name": "test_room_4828", "status": "not_started", "is_recording": false}`

- **✅ Cleanup Video Room** (`DELETE /api/v1/video/room/test_room_4828`)
  - Status: `200` (Expected: `200`) | Latency: `5.9ms`
  - Response Preview: `{"success": true, "message": "Room test_room_4828 ended successfully"}`

### CodeExecution (4/4 passed)

- **✅ Get Supported Languages** (`GET /api/v1/execute/languages`)
  - Status: `200` (Expected: `200`) | Latency: `20.0ms`
  - Response Preview: `{"languages": [{"value": "python", "name": "Python 3.11", "extension": ".py"}, {"value": "javascript`

- **✅ Run Python Sandbox Code** (`POST /api/v1/execute`)
  - Status: `200` (Expected: `200`) | Latency: `1541.9ms`
  - Response Preview: `{"success": true, "output": "DevMeet Sandbox Execution OK\nResult: 5", "error": null, "execution_tim`

- **✅ AST Safety Scanner** (`POST /api/v1/execute/scan-safety`)
  - Status: `200` (Expected: `200`) | Latency: `58.7ms`
  - Response Preview: `{"safe": true, "violation": null, "language": "python"}`

- **✅ Run Test Cases** (`POST /api/v1/execute/run-tests`)
  - Status: `200` (Expected: `200`) | Latency: `3441.6ms`
  - Response Preview: `{"success": true, "results": [{"passed": false, "actual_output": "", "execution_time": 1.64945197105`

### AIInterviewer (3/3 passed)

- **✅ AI Interviewer Health (Direct)** (`GET http://localhost:8004/health`)
  - Status: `200` (Expected: `200`) | Latency: `21.9ms`
  - Response Preview: `{"status": "healthy", "service": "ai-interviewer-service"}`

- **✅ Request Problem Hint (Pro Tier Gated)** (`POST /api/v1/interview/hint`)
  - Status: `403` (Expected: `[200, 403, 429, 503]`) | Latency: `188.9ms`
  - Response Preview: `{"detail": "Hints are available on Pro and Enterprise plans only. Please upgrade to access this feat`

- **✅ STAR Behavioral Analysis** (`POST /api/v1/interview/star-analysis`)
  - Status: `200` (Expected: `[200, 429, 503]`) | Latency: `86.1ms`
  - Response Preview: `{"session_id": null, "star_components": {"situation": true, "task": false, "action": false, "result"`

### Analytics (10/10 passed)

- **✅ Global Analytics Metrics** (`GET /api/v1/analytics/metrics`)
  - Status: `200` (Expected: `200`) | Latency: `107.2ms`
  - Response Preview: `{"total_users": 1, "total_sessions": 1, "completed_sessions": 1, "active_sessions": 0, "sessions_tod`

- **✅ Daily Session Distribution** (`GET /api/v1/analytics/daily`)
  - Status: `200` (Expected: `200`) | Latency: `10.5ms`
  - Response Preview: `[{"date": "2026-10-20", "count": 1}]`

- **✅ Language Metrics** (`GET /api/v1/analytics/languages`)
  - Status: `200` (Expected: `200`) | Latency: `10.3ms`
  - Response Preview: `[]`

- **✅ Score Distribution** (`GET /api/v1/analytics/scores`)
  - Status: `200` (Expected: `200`) | Latency: `8.2ms`
  - Response Preview: `[{"range": "0-20", "count": 0}, {"range": "21-40", "count": 0}, {"range": "41-60", "count": 0}, {"ra`

- **✅ User Funnel Metrics** (`GET /api/v1/analytics/funnel`)
  - Status: `200` (Expected: `200`) | Latency: `13.4ms`
  - Response Preview: `{"funnel": [{"stage": "Session Started", "count": 0}, {"stage": "Session Completed", "count": 1, "ra`

- **✅ Retention Cohorts** (`GET /api/v1/analytics/retention`)
  - Status: `200` (Expected: `200`) | Latency: `7.8ms`
  - Response Preview: `{"d1_retention": 68.2, "d7_retention": 42.1, "d30_retention": 28.4, "note": "Cohort retention comput`

- **✅ Realtime Platform Telemetry** (`GET /api/v1/analytics/realtime`)
  - Status: `200` (Expected: `200`) | Latency: `10.1ms`
  - Response Preview: `{"events_per_minute": 0, "active_sessions_estimate": 0}`

- **✅ User Analytics Dashboard** (`GET /api/v1/analytics/user/13c50067-febf-41c2-98d4-fe2fbfccc442/dashboard`)
  - Status: `200` (Expected: `200`) | Latency: `16.5ms`
  - Response Preview: `{"user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "period_days": 90, "total_sessions": 1, "complet`

- **✅ User Session History** (`GET /api/v1/analytics/user/13c50067-febf-41c2-98d4-fe2fbfccc442/sessions`)
  - Status: `200` (Expected: `200`) | Latency: `11.3ms`
  - Response Preview: `{"user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "sessions": [], "total": 0}`

- **✅ User Score Trend** (`GET /api/v1/analytics/user/13c50067-febf-41c2-98d4-fe2fbfccc442/score-trend`)
  - Status: `200` (Expected: `200`) | Latency: `10.7ms`
  - Response Preview: `{"user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "trend": [], "period_days": 30}`

### Feedback (2/2 passed)

- **✅ Feedback Health Check (Direct)** (`GET http://localhost:8007/health`)
  - Status: `200` (Expected: `200`) | Latency: `50.2ms`
  - Response Preview: `{"status": "healthy", "service": "feedback-service", "postgres_connected": true}`

- **✅ Get Session Feedback Report** (`GET /api/v1/feedback/9c2b2c3f-f5a7-4275-83e1-96b882358961`)
  - Status: `404` (Expected: `[200, 404]`) | Latency: `21.7ms`
  - Response Preview: `{"detail": "Feedback report not found for this session"}`

### Payments (5/5 passed)

- **✅ Payment Gateway Config** (`GET /api/v1/payments/config`)
  - Status: `200` (Expected: `200`) | Latency: `28.0ms`
  - Response Preview: `{"provider": "razorpay", "razorpay_enabled": true, "razorpay_key_id": "rzp_test_SFzdvgFWIJjzUx", "cu`

- **✅ Available Subscription Plans** (`GET /api/v1/payments/plans`)
  - Status: `200` (Expected: `200`) | Latency: `8.7ms`
  - Response Preview: `{"plans": [{"plan": "free", "name": "DevMeet Free", "amount_paise": 0, "price_display": "Free", "cur`

- **✅ User Subscription Status** (`GET /api/v1/payments/subscription`)
  - Status: `200` (Expected: `200`) | Latency: `69.1ms`
  - Response Preview: `{"user_id": "13c50067-febf-41c2-98d4-fe2fbfccc442", "plan": "free", "status": "active", "razorpay_cu`

- **✅ User Billing History** (`GET /api/v1/payments/billing-history`)
  - Status: `200` (Expected: `200`) | Latency: `35.4ms`
  - Response Preview: `{"events": [], "total": 0}`

- **✅ Create Checkout Session** (`POST /api/v1/payments/checkout-session`)
  - Status: `200` (Expected: `200`) | Latency: `407.1ms`
  - Response Preview: `{"session_id": "order_mock_9f255b2fda5d4ab7", "checkout_url": "http://localhost:3000/dashboard?payme`

### Admin (6/6 passed)

- **✅ Admin Stats Forbidden for Candidate** (`GET /api/v1/admin/stats`)
  - Status: `403` (Expected: `403`) | Latency: `11.6ms`
  - Response Preview: `<html>
<head><title>403 Forbidden</title></head>
<body>
<center><h1>403 Forbidden</h1></center>
`

- **✅ Admin Stats Allowed for Admin** (`GET /api/v1/admin/stats`)
  - Status: `200` (Expected: `200`) | Latency: `158.5ms`
  - Response Preview: `{"total_users": 29, "new_users_today": 29, "total_sessions": 10, "sessions_today": 10, "completed_se`

- **✅ Admin User Directory** (`GET /api/v1/admin/users`)
  - Status: `200` (Expected: `200`) | Latency: `41.0ms`
  - Response Preview: `[{"id": "fd3ca325-9932-4dda-a58d-60b9e363c2a6", "email": "admin_1792513864828@devmeet.com", "display`

- **✅ Admin Audit Logs** (`GET /api/v1/admin/audit-logs`)
  - Status: `200` (Expected: `200`) | Latency: `31.4ms`
  - Response Preview: `[]`

- **✅ Admin Global Sessions Monitor** (`GET /api/v1/admin/sessions`)
  - Status: `200` (Expected: `200`) | Latency: `28.8ms`
  - Response Preview: `{"sessions": [{"id": "9c2b2c3f-f5a7-4275-83e1-96b882358961", "user_id": "13c50067-febf-41c2-98d4-fe2`

- **✅ Admin Relational DB Health** (`GET /api/v1/admin/system/health`)
  - Status: `200` (Expected: `200`) | Latency: `22.1ms`
  - Response Preview: `{"admin_service": "healthy", "database": "connected", "checked_at": "2026-10-20T16:31:15.298843"}`

### Files (2/2 passed)

- **✅ File Service Health (Direct)** (`GET http://localhost:8011/health`)
  - Status: `200` (Expected: `200`) | Latency: `11.8ms`
  - Response Preview: `{"status": "healthy", "service": "file-service", "storage_mode": "s3"}`

- **✅ List Files via Gateway** (`GET /api/v1/files/list`)
  - Status: `200` (Expected: `200`) | Latency: `10.7ms`
  - Response Preview: `{"files": [], "total": 0, "storage_backend": "s3"}`
