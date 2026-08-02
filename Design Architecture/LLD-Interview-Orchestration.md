# LLD — Interview Orchestration & Pipeline Diagram
**File:** `LLD-Interview-Orchestration.drawio`  
**Document Number:** DevMeet-LLD-002  
**Diagram Type:** UML State Machine (top) + UML Sequence Diagram (bottom)  
**How to open:** [draw.io](https://app.diagrams.net) → File → Open → select the `.drawio` file.

---

## What This Diagram Shows

Everything that happens during a mock interview — from the moment the user creates a session to the moment they receive their scored feedback. The diagram has two sections:

- **Top half** — the session state machine (all possible states a session can be in)
- **Bottom half** — the full step-by-step message flow across all 10 services involved

---

## Section 1 — Session State Machine

### How to Read a UML State Machine

| Symbol | Meaning |
|--------|---------|
| ● (filled circle) | Initial pseudostate — where every session starts |
| Rounded rectangle | A state the session can be in |
| Arrow with label | A transition triggered by an event (usually an API call) |
| ◉ (double circle) | Final pseudostate — session lifecycle is over |
| Dashed arrow | Automatic/timeout transition (no user action needed) |

### States

| State | What it means |
|-------|--------------|
| `created` | Session record exists in the database. The AI has fetched the first question but the timer has not started. The user is on the start screen. |
| `in_progress` | The user clicked Start. Timer is running. AI is asking questions. Code execution is available. |
| `paused` | User clicked Pause. Timer is frozen. The session can be resumed (max 2 pauses allowed). |
| `completed` | User clicked End Interview OR timer ran out. Feedback pipeline is triggered automatically. |
| `cancelled` | User aborted the session, admin cancelled it, or the session had no heartbeat for 10 minutes while paused. No feedback is generated. |

### Transitions (what triggers each state change)

| From | To | Trigger |
|------|-----|--------|
| *(start)* | `created` | `POST /sessions` — creates the session record |
| `created` | `in_progress` | `POST /sessions/{id}/start` |
| `in_progress` | `paused` | `POST /sessions/{id}/pause` |
| `paused` | `in_progress` | `POST /sessions/{id}/resume` |
| `in_progress` | `completed` | `POST /sessions/{id}/complete` |
| `in_progress` | `cancelled` | `POST /sessions/{id}/cancel` |
| `paused` | `cancelled` | Automatic — no heartbeat received for 10 minutes (dashed arrow) |

---

## Section 2 — End-to-End Pipeline Sequence

### Participants (Lifelines)

| Lifeline | Service | Port |
|----------|---------|------|
| `:Browser` | Next.js frontend | — |
| `:Gateway` | Kong/NGINX | 8000 |
| `:Orchestrator` | Interview Orchestrator | 8003 |
| `:AI Interviewer` | AI Interviewer Service | 8004 |
| `:Code Execution` | Code Execution Service | 8005 (Go) |
| `:Feedback Svc` | Feedback Service | 8007 |
| `:Analytics Svc` | Analytics Service | 8009 |
| `:Notification Svc` | Notification Service | 8008 |
| `:PostgreSQL` | Database | 5432 |
| `:RabbitMQ` | Message broker | 5672 |

---

### Step-by-Step Message Flow

#### Phase 1 — Session Creation

| Step | Message | What happens |
|------|---------|-------------|
| 1 | `POST /sessions {type, difficulty, duration}` | Browser sends session config through the gateway to Orchestrator |
| 2 | `INSERT sessions` | Orchestrator writes a new row to PostgreSQL; gets back a `session_id` |
| ↩ | `session_id` returned | Browser receives the session ID and navigates to the interview screen |

#### Phase 2 — Interview in Progress

| Step | Message | What happens |
|------|---------|-------------|
| 3 | `POST /sessions/{id}/start` | Orchestrator sets `status = in_progress`, records `started_at` |
| 4 | `GET /interview/question/stream` (SSE) | Browser opens a Server-Sent Events connection. AI service builds a prompt from the session context, calls Groq Cloud, and **streams tokens back word-by-word** |
| ↩ | SSE token stream | Each token arrives at the browser and is appended to the chat — gives a "typing" effect |
| 5 | `POST /sessions/{id}/turns {role:user, content}` | User's answer is saved as a conversation turn in PostgreSQL |
| 5b | `INSERT conversation_turns` | Turn row written to DB |

#### Phase 3 — Code Execution (DSA sessions)

| Step | Message | What happens |
|------|---------|-------------|
| 6 | `POST /execute {language, code}` | Browser submits code to the Code Execution service |
| | Docker sandbox | Go service spawns a Docker container with `--network none`, `--memory 256m`, 10-second timeout. Code runs in complete isolation. |
| ↩ | `{stdout, stderr, exit_code, time_ms}` | Execution result returned to browser; pass/fail shown in the editor |

#### Phase 4 — Session Completion

| Step | Message | What happens |
|------|---------|-------------|
| 7 | `POST /sessions/{id}/complete` | Browser tells Orchestrator the session is done |
| 7b | `UPDATE status=completed` | PostgreSQL row updated with `completed_at = NOW()` |
| 8 | `publish session.completed` → RabbitMQ | Orchestrator publishes a message to RabbitMQ. This triggers the entire post-session pipeline asynchronously — the browser doesn't wait |
| 8b | `publish analytics event` → Kafka | Session completion event also sent to Kafka for analytics tracking |

#### Phase 5 — Feedback Generation (async, triggered by RabbitMQ)

| Step | Message | What happens |
|------|---------|-------------|
| 9 | `consume session.completed` | Feedback Service picks up the message from RabbitMQ |
| | Score with Groq | Fetches all conversation turns + code submissions from PostgreSQL. Sends the full transcript to Groq LLM with a scoring prompt. Gets back 6 dimension scores (0–100 each). |
| | Generate PDF | Renders an HTML report template (Jinja2) → converts to PDF (WeasyPrint) → uploads to AWS S3 |
| | `INSERT feedback_reports` | Saves scores and PDF URL to PostgreSQL |
| 9b | `publish feedback.generated` → RabbitMQ | Notifies other services that feedback is ready |

#### Phase 6 — Notification & Feedback Viewing

| Step | Message | What happens |
|------|---------|-------------|
| 10 | `consume feedback.generated` | Notification Service sends email ("Your feedback is ready") + WebSocket push to browser |
| 11 | `GET /feedback/{session_id}` | Browser fetches the full feedback report |
| ↩ | `{scores, detailed_feedback, pdf_url}` | Scores, strengths, improvements, and PDF download link shown to user |

---

## The 6 Feedback Dimensions

Every completed interview is scored on:

| Dimension | What it measures | Relevant for |
|-----------|-----------------|-------------|
| `overall_score` | Weighted average of all below | All types |
| `communication_score` | Clarity, structure, how well ideas are explained | All types |
| `problem_solving_score` | Approach taken, edge cases considered, optimisation | All types |
| `code_quality_score` | Correctness, readability, naming conventions | DSA only |
| `time_complexity_score` | Accuracy of Big-O analysis | DSA only |
| `behavioral_score` | Use of STAR framework, specificity of examples | Behavioral only |

---

## Code Execution Sandbox Security

The Go service applies these Docker constraints on every execution:

| Constraint | Value | Purpose |
|-----------|-------|---------|
| `--network none` | No internet access | Prevents data exfiltration or network calls |
| `--memory 256m` | 256 MB RAM cap | Prevents memory exhaustion attacks |
| `--cpus 0.5` | Half a CPU core | Fair resource sharing |
| `--pids-limit 64` | Max 64 processes | Prevents fork bombs |
| `--read-only` | Immutable filesystem | Prevents writing persistent files |
| `--tmpfs /tmp:32m` | 32 MB writable scratch | Code can write temp files only here |
| Timeout goroutine | 10 seconds | Prevents infinite loops from blocking |
