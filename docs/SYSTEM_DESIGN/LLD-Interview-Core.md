# DevMeet v2.0 — Low-Level Design: Interview Core Services
**Document Number:** DevMeet-LLD-002  
**Version:** 2.0  
**Date:** 2026-08-01  
**Status:** Approved  
**Classification:** Internal  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Interview Orchestrator Service](#2-interview-orchestrator-service)
3. [AI Interviewer Service](#3-ai-interviewer-service)
4. [Code Execution Service](#4-code-execution-service)
5. [Video Service](#5-video-service)
6. [Feedback Service](#6-feedback-service)
7. [End-to-End Interview Sequence](#7-end-to-end-interview-sequence)

---

## 1. Introduction

This document describes the LLD for the five services that form the **interview pipeline**: Orchestrator, AI Interviewer, Code Execution, Video, and Feedback. Together they manage the complete lifecycle of a mock interview session from creation to scored feedback.

---

## 2. Interview Orchestrator Service

### 2.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8003 |
| Base URL | `/api/v1/sessions` |
| DB Tables | `sessions`, `conversation_turns`, `code_submissions` |
| Publishes | `session.completed` (RabbitMQ) |

### 2.2 Module Structure

```
services/orchestrator-service/app/
├── main.py          # App startup
├── routes.py        # Session CRUD + state transitions
├── models.py        # Pydantic schemas
├── database.py      # All DB operations
├── state_machine.py # Session state transition logic
├── middleware.py    # Auth
└── __init__.py
```

### 2.3 Session State Machine

```
         ┌─────────┐
    ──▶  │ created │
         └────┬────┘
              │ POST /start
              ▼
         ┌───────────┐
         │ in_progress│ ◀──┐
         └────┬───────┘    │ POST /resume
              │            │
     POST /pause           │
              ▼            │
         ┌────────┐        │
         │ paused │────────┘
         └────┬───┘
              │ POST /complete  |  POST /cancel
       ┌──────┴──────┐
       ▼             ▼
  ┌──────────┐  ┌──────────┐
  │completed │  │cancelled │
  └──────────┘  └──────────┘
```

### 2.4 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List user's sessions (paginated) |
| POST | `/` | Create new session |
| GET | `/{id}` | Get session detail |
| POST | `/{id}/start` | Transition to `in_progress` |
| POST | `/{id}/pause` | Transition to `paused` |
| POST | `/{id}/resume` | Transition back to `in_progress` |
| POST | `/{id}/complete` | Transition to `completed` → publish event |
| POST | `/{id}/cancel` | Transition to `cancelled` |
| POST | `/{id}/heartbeat` | Update `last_heartbeat_at` (every 30 s) |
| GET | `/{id}/turns` | Get conversation turns |
| POST | `/{id}/turns` | Append turn (role: ai \| user \| candidate) |
| POST | `/{id}/code` | Save code submission |
| POST | `/{id}/cheating` | Record proctor violation |

### 2.5 Key Functions

```python
class SessionDatabase:
    async def create_session(user_id, interview_type, difficulty,
                              target_company, focus_area, duration_minutes,
                              recording_consent) → Session

    async def transition_state(session_id, new_state,
                                guard: Callable[[Session], bool]) → Session
    # guard validates the transition is allowed per state machine

    async def get_turns(session_id) → List[ConversationTurn]
    async def append_turn(session_id, role, content, turn_number) → Turn
    async def save_code_submission(session_id, language, code) → Submission

async def publish_session_completed(session_id, user_id):
    """Publishes to RabbitMQ exchange 'session.completed'."""
    payload = {
        "session_id": session_id,
        "user_id": user_id,
        "completed_at": datetime.utcnow().isoformat(),
    }
    await rabbitmq.publish("session.completed", payload)
```

### 2.6 Heartbeat & Timeout

- Client sends `POST /{id}/heartbeat` every 30 seconds during an active session
- A background cron (every 5 min) auto-cancels sessions where `last_heartbeat_at < NOW() - 10 min` and status is `in_progress`
- Prevents zombie sessions from accumulating

---

## 3. AI Interviewer Service

### 3.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8004 |
| Base URL | `/api/v1/interview` |
| External | Groq Cloud API (LLaMA 3 70B, Mixtral 8x7B) |
| Streaming | Server-Sent Events (SSE) |

### 3.2 Module Structure

```
services/ai-interviewer-service/app/
├── main.py           # App startup
├── routes.py         # SSE stream, hint, transcribe endpoints
├── models.py         # Pydantic schemas
├── groq_client.py    # Groq API wrapper (streaming + regular)
├── prompt_builder.py # System prompt + conversation context assembly
├── audio.py          # Whisper/Groq transcription
├── middleware.py     # Auth
└── __init__.py
```

### 3.3 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/question/stream` | SSE: stream AI question/response tokens |
| POST | `/hint` | Get a hint for current question (non-streaming) |
| POST | `/transcribe` | Transcribe audio blob → text (Whisper via Groq) |
| POST | `/evaluate` | Evaluate a candidate answer (internal use by Feedback) |

### 3.4 Streaming Architecture

```
Browser                  AI Service               Groq Cloud
   │                         │                         │
   │─GET /question/stream────▶│                         │
   │  ?session_id=…           │─build system prompt     │
   │  ?question_type=…        │─assemble turn history   │
   │                          │─POST /chat/completions──▶│
   │                          │◀─stream chunks ──────────│
   │◀─ data: {"token":"Hello"} │                         │
   │◀─ data: {"token":", "}    │                         │
   │◀─ data: {"token":"here"} │                         │
   │◀─ data: [DONE]           │                         │
```

### 3.5 Prompt Builder Logic

```python
class PromptBuilder:
    def build_system_prompt(
        interview_type: str,       # dsa | behavioral | system_design
        difficulty: str,           # easy | medium | hard
        target_company: str | None,
        focus_area: str | None,
    ) → str:
        """
        Assembles a structured system prompt:
        - Role: "You are an experienced technical interviewer at {company}"
        - Interview type–specific instructions
        - Difficulty calibration
        - Output format constraints (no solution spoilers, ask follow-ups)
        """

    def build_messages(
        system_prompt: str,
        turns: List[ConversationTurn],
        new_user_message: str,
    ) → List[dict]:
        """
        Converts DB conversation_turns to Groq messages format.
        Truncates to last 20 turns to stay within context window.
        Always keeps the system prompt at index 0.
        """
```

### 3.6 Model Selection

| Interview Type | Model | Rationale |
|---------------|-------|-----------|
| DSA (code review) | `llama3-70b-8192` | Best at code reasoning |
| Behavioral | `mixtral-8x7b-32768` | Longer context for STAR responses |
| System Design | `llama3-70b-8192` | Best at architecture discussion |

### 3.7 Audio Transcription

```
POST /transcribe  (multipart/form-data: audio_file)
│
├── Validate file type (webm, mp4, wav, ogg)
├── Send to Groq Whisper endpoint
├── Return { transcript, language, duration_seconds }
└── On failure → return { transcript: "" } (graceful degradation)
```

---

## 4. Code Execution Service

### 4.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Go 1.21 |
| Port | 8005 |
| Base URL | `/api/v1/execute` |
| Runtime | Docker SDK (container-per-execution) |

### 4.2 Module Structure

```
services/code-execution-service/app/
├── main.go            # HTTP server, routes
├── executor.go        # Docker container spawn + I/O
├── sandbox.go         # Security constraints (no-network, ulimits)
├── judge.go           # Test case runner + pass/fail evaluation
├── languages.go       # Supported language configs (image, run cmd)
└── models.go          # Request/response structs
```

### 4.3 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Synchronous execute (blocks up to 15 s) |
| POST | `/async` | Async execute → returns job_id |
| GET | `/result/{job_id}` | Poll async result |
| GET | `/languages` | List supported languages |

### 4.4 Supported Languages

| Language | Docker Image | Run Command |
|----------|-------------|-------------|
| Python 3.11 | `python:3.11-alpine` | `python3 solution.py` |
| JavaScript | `node:20-alpine` | `node solution.js` |
| TypeScript | `node:20-alpine` | `npx ts-node solution.ts` |
| Java 17 | `eclipse-temurin:17-alpine` | `javac Main.java && java Main` |
| C++ 17 | `gcc:13-alpine` | `g++ -O2 -o sol sol.cpp && ./sol` |
| Go 1.21 | `golang:1.21-alpine` | `go run solution.go` |
| Rust | `rust:1.76-alpine` | `rustc sol.rs && ./sol` |

### 4.5 Execution Flow

```
POST /execute
│
├── Validate request (language, code, stdin)
├── Pull/use cached Docker image
├── Create container with:
│   ├── --network none          (no internet access)
│   ├── --memory 256m           (RAM limit)
│   ├── --cpus 0.5              (CPU limit)
│   ├── --pids-limit 64         (fork-bomb protection)
│   ├── --read-only             (immutable filesystem)
│   └── --tmpfs /tmp:size=32m   (writable scratch)
├── Write code to container filesystem
├── Execute with timeout goroutine (10 s)
├── Capture stdout, stderr, exit_code
├── Remove container
└── Return ExecutionResult{
        stdout, stderr, exit_code,
        execution_time_ms, memory_used_kb,
        timed_out, compile_error
    }
```

### 4.6 Judge (Test Case Evaluation)

```go
type TestCase struct {
    Input    string
    Expected string
}

func Judge(result ExecutionResult, cases []TestCase) JudgeResult {
    // Compare result.Stdout lines against expected output
    // Trim whitespace, normalize line endings
    // Return: passed_tests, total_tests, first_failure_detail
}
```

---

## 5. Video Service

### 5.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Node.js 20 / Express |
| Port | 8006 |
| Base URL | `/api/v1/video` |
| External | LiveKit Cloud (WebRTC signalling, TURN) |

### 5.2 Module Structure

```
services/video-service/src/
├── index.js          # Express app
├── routes/
│   ├── token.js      # Room token generation
│   ├── recording.js  # Recording start/stop
│   └── quality.js    # Network quality reporting
├── livekit.js        # LiveKit SDK wrapper
└── middleware/
    └── auth.js       # JWT verification
```

### 5.3 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/token` | Generate LiveKit room access token |
| POST | `/preflight` | WebRTC connectivity preflight check |
| POST | `/recording/start` | Start LiveKit room recording (requires consent) |
| POST | `/recording/stop` | Stop recording |
| POST | `/room/{name}/quality` | Report participant network quality metrics |

### 5.4 Token Generation Logic

```javascript
// POST /token
// { room_name, participant_identity, participant_name }
const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participant_identity,
    name: participant_name,
    ttl: '2h',
});
at.addGrant({
    room: room_name,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
});
return at.toJwt();
```

### 5.5 Recording Policy
- Recording only starts if `recording_consent = true` on the session
- Recording files stored in LiveKit-managed S3 bucket
- Post-processing webhook updates `sessions.s3_snapshot_key`

---

## 6. Feedback Service

### 6.1 Service Overview

| Property | Value |
|----------|-------|
| Language | Python 3.11 / FastAPI |
| Port | 8007 |
| Base URL | `/api/v1/feedback` |
| Consumes | `session.completed` (RabbitMQ) |
| Publishes | `feedback.generated` (RabbitMQ) |
| External | Groq Cloud (LLaMA 3), AWS S3 (PDF), WeasyPrint (PDF gen) |

### 6.2 Module Structure

```
services/feedback-service/app/
├── main.py            # App startup + RabbitMQ consumer thread
├── routes.py          # GET/POST feedback endpoints
├── models.py          # Pydantic schemas
├── database.py        # DB operations (feedback_reports)
├── generator.py       # LLM-based scoring logic
├── pdf_builder.py     # HTML → PDF via WeasyPrint
├── s3_uploader.py     # Upload PDF to S3
└── __init__.py
```

### 6.3 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/{session_id}` | Fetch feedback report |
| POST | `/generate` | Trigger generation (also triggered by MQ event) |
| GET | `/{session_id}/pdf` | Download PDF report |

### 6.4 Scoring Dimensions

| Dimension | Score Range | Evaluated By |
|-----------|------------|-------------|
| `overall_score` | 0–100 | Weighted average of all below |
| `communication_score` | 0–100 | Clarity, structure, articulation of answers |
| `problem_solving_score` | 0–100 | Approach, edge cases, optimisation |
| `code_quality_score` | 0–100 | Correctness, readability, style (DSA only) |
| `time_complexity_score` | 0–100 | Big-O analysis accuracy (DSA only) |
| `behavioral_score` | 0–100 | STAR structure, specificity (behavioral only) |

### 6.5 Generation Flow

```
RabbitMQ: session.completed event
│
├── Fetch session + all conversation_turns from Orchestrator DB
├── Fetch code_submissions (if DSA session)
├── Build evaluation prompt (full transcript + code)
│
├── POST to Groq: "Score this interview across 6 dimensions (JSON output)"
├── Parse LLM JSON response → FeedbackReport
├── INSERT INTO feedback_reports
│
├── Render HTML template (Jinja2) with scores + feedback text
├── Convert HTML → PDF (WeasyPrint)
├── Upload PDF to S3: devmeet-files/feedback/{session_id}/report.pdf
├── UPDATE feedback_reports.pdf_url
│
├── Publish feedback.generated event to RabbitMQ
└── Consumers: Analytics (store score), Notification (email PDF link)
```

### 6.6 Evaluation Prompt Template

```
System: You are an expert technical interviewer evaluating a mock interview.
        Return your evaluation as valid JSON only, no other text.

User: Here is the full interview transcript:
      {transcript}

      {code_block_if_dsa}

      Evaluate the candidate on these dimensions (each 0-100):
      - communication_score: clarity, structure
      - problem_solving_score: approach, edge cases, optimisation
      - code_quality_score: correctness, readability (0 if not DSA)
      - time_complexity_score: Big-O analysis (0 if not DSA)
      - behavioral_score: STAR structure (0 if not behavioral)
      - overall_score: weighted average

      Also provide: strengths (list), improvements (list), summary (2 sentences).

      JSON schema: { communication_score, problem_solving_score, code_quality_score,
                     time_complexity_score, behavioral_score, overall_score,
                     strengths, improvements, summary }
```

---

## 7. End-to-End Interview Sequence

```
Browser   Gateway   Orchestrator   AI Service   Code Exec   Feedback   Analytics
   │          │           │              │            │           │          │
   │─create──▶│──────────▶│              │            │           │          │
   │          │           │─INSERT session            │           │          │
   │◀─session_id──────────│              │            │           │          │
   │          │           │              │            │           │          │
   │─start───▶│──────────▶│              │            │           │          │
   │          │           │─UPDATE status=in_progress │           │          │
   │          │           │              │            │           │          │
   │─stream──▶│──────────────────────────▶│            │           │          │
   │          │           │              │─Groq API   │           │          │
   │◀─SSE tokens──────────────────────────│            │           │          │
   │          │           │─append AI turn            │           │          │
   │          │           │              │            │           │          │
   │─user msg▶│──────────▶│              │            │           │          │
   │          │           │─append user turn          │           │          │
   │          │           │              │            │           │          │
   │─exec code▶│────────────────────────────────────▶│           │          │
   │          │           │              │            │─Docker run │           │
   │◀─result──│────────────────────────────────────────│           │          │
   │          │           │─save submission            │           │          │
   │          │           │              │            │           │          │
   │─complete─▶│──────────▶│              │            │           │          │
   │          │           │─UPDATE status=completed   │           │          │
   │          │           │─publish session.completed─────────────▶│          │
   │          │           │─────────────────────────────────────────────────▶│
   │          │           │              │            │           │─generate  │
   │          │           │              │            │           │─score     │
   │          │           │              │            │           │─PDF upload│
   │          │           │              │            │           │─publish feedback.generated
   │◀─feedback page────────────────────────────────────│           │          │
```

---

*See `docs/SYSTEM_DESIGN/LLD-Supporting-Services.md` for Analytics, Admin, Notification, File, Search, and Payment service LLDs.*
