# API Documentation

## Base URLs

- Auth Service: `http://localhost:8001`
- User Service: `http://localhost:8002`
- Interview Orchestrator: `http://localhost:8003`
- AI Interviewer Service: `http://localhost:8004`
- Code Execution Service: `http://localhost:8005`
- Video Service: `http://localhost:8006`
- Feedback Service: `http://localhost:8007`
- Notification Service: `http://localhost:8008`
- Analytics Service: `http://localhost:8009`
- Admin Service: `http://localhost:8010`
- File Service: `http://localhost:8011`
- Search Service: `http://localhost:8012`

## Authentication

All API endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

## Auth Service Endpoints

### POST /api/v1/auth/register
Register a new user account.

### POST /api/v1/auth/login
Authenticate user and receive JWT tokens.

### POST /api/v1/auth/refresh
Refresh access token using refresh token.

### POST /api/v1/auth/logout
Invalidate refresh token.

## User Service Endpoints

### GET /api/v1/users/me
Get current user profile.

### PUT /api/v1/users/me
Update current user profile.

### GET /api/v1/users/me/quota
Get current interview quota.

## Interview Orchestrator Endpoints

### POST /api/v1/sessions
Create a new interview session.

### GET /api/v1/sessions/{session_id}
Get session details.

### PUT /api/v1/sessions/{session_id}/pause
Pause a session.

### PUT /api/v1/sessions/{session_id}/resume
Resume a paused session.

### PUT /api/v1/sessions/{session_id}/end
End a session.

## AI Interviewer Service Endpoints

### GET /api/v1/ai/stream/{session_id}
SSE stream for AI responses.

### POST /api/v1/ai/answer
Submit user answer for evaluation.

## Code Execution Service Endpoints

### POST /api/v1/code/execute
Execute code in sandboxed environment.

### GET /api/v1/code/result/{job_id}
Get code execution result.

## Video Service Endpoints

### POST /api/v1/video/room
Create a new video room.

### POST /api/v1/video/token
Generate LiveKit token for room access.

## Feedback Service Endpoints

### GET /api/v1/feedback/{session_id}
Get feedback report for a session.

### GET /api/v1/feedback/{session_id}/pdf
Download feedback report as PDF.

## Analytics Service Endpoints

### GET /api/v1/analytics/performance
Get performance trends.

### GET /api/v1/analytics/skills
Get skill radar chart data.

## Admin Service Endpoints

### GET /api/v1/admin/users
List all users.

### PUT /api/v1/admin/users/{user_id}/plan
Update user plan.

### GET /api/v1/admin/sessions
List all sessions.

## File Service Endpoints

### POST /api/v1/files/upload
Upload file to S3.

### GET /api/v1/files/{file_id}
Download file from S3.

## Search Service Endpoints

### GET /api/v1/search/questions
Search question bank.

### GET /api/v1/search/questions/{question_id}
Get question details.
