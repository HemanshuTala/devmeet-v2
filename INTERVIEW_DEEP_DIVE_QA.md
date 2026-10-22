# 🎯 DevMeet: Senior Full-Stack Technical Interview Master Guide
> **Target Duration**: 45-Minute Deep-Dive Technical Interview  
> **Repository**: `E:\AI INTERVIEW`  
> **Key Architecture**: 12 Microservices (FastAPI / Node.js) + Next.js 14 App Router + Docker Sandbox + SSE/LiveKit WebRTC + Edge AI Proctoring

---

## 📑 Table of Contents
1. [60-Second Elevator Pitch & Architecture Overview](#1-60-second-elevator-pitch--architecture-overview)
2. [Real-Time Protocols: SSE vs. WebSockets vs. WebRTC vs. REST Polling](#2-real-time-protocols-sse-vs-websockets-vs-webrtc-vs-rest-polling)
3. [Sandboxed Code Execution Engine & Security Hardening](#3-sandboxed-code-execution-engine--security-hardening)
4. [AI Interviewer & LLM Streaming Architecture](#4-ai-interviewer--llm-streaming-architecture)
5. [Distributed Orchestration, State Machine & Concurrency](#5-distributed-orchestration-state-machine--concurrency)
6. [Edge AI Proctoring & Computer Vision in Browser](#6-edge-ai-proctoring--computer-vision-in-browser)
7. [Database Architecture, Connection Pooling & Fallback](#7-database-architecture-connection-pooling--fallback)
8. [API Gateway & Microservices Communication Pattern](#8-api-gateway--microservices-communication-pattern)
9. [Frontend Engineering: Next.js 14, Monaco & Audio Synthesis](#9-frontend-engineering-nextjs-14-monaco--audio-synthesis)
10. [Tough "What-If" Failure Scenarios (The Rapid-Fire Closer)](#10-tough-what-if-failure-scenarios-the-rapid-fire-closer)
11. [Additional 45-Minute Deep-Dive Questions](#11-additional-45-minute-deep-dive-questions)
12. [Implementation Facts to State Precisely](#12-implementation-facts-to-state-precisely)

---

## 1. 60-Second Elevator Pitch & Architecture Overview

### 🎙️ The Pitch (Say this when the interviewer asks: *"Tell me about this project"*):
> *"DevMeet is an AI-assisted technical interview platform for coding, behavioral, and system-design practice. It combines an AI interviewer with streamed text, a Docker-based code runner, browser-side proctoring signals, and optional consent-based recording.*
>
> *The backend is split across containerized services behind an NGINX API Gateway. Most APIs use FastAPI; the Video Service uses Node.js/Express to issue LiveKit tokens and handle recording endpoints. The browser streams AI text over an HTTP SSE response, connects directly to LiveKit for media, and uses Next.js 14 with Monaco Editor for the interview workspace. The services use PostgreSQL, Redis, and RabbitMQ for different persistence and background-work needs."*

### 🗺️ System Architecture Diagram
```
                     Candidate Browser (Next.js 14)
                                   │
      ┌────────────────────────────┼───────────────────────────┐
      │ (HTTPS / SSE)              │ (WebRTC Media)            │ (Monaco / WebWorker)
      ▼                            ▼                           ▼
[ NGINX API Gateway :8000 ]   [ LiveKit SFU Server ]     [ Edge AI: MediaPipe / COCO ]
      │ (Reverse Proxy, CORS, Auth Header Forwarding)
      ├──► /api/v1/auth          ──► [ auth-service :8001 ]
      ├──► /api/v1/users         ──► [ user-service :8002 ]
      ├──► /api/v1/sessions      ──► [ orchestrator-service :8003 ] ◄── Redis (Locks/Cache)
      ├──► /api/v1/interview     ──► [ ai-interviewer-service :8004 ] ◄── LLM API / Cache
      ├──► /api/v1/execute       ──► [ code-execution-service :8005 ] ◄── Docker Sandbox
      ├──► /api/v1/video         ──► [ video-service :8006 ] (LiveKit token / recording API)
      ├──► /api/v1/feedback      ──► [ feedback-service :8007 ] (HTTP report API)
      ├──► /api/v1/analytics     ──► [ analytics-service :8009 ]
      ├──► /api/v1/admin         ──► [ admin-service :8010 ]
      ├──► /api/v1/files         ──► [ file-service :8011 ]
      ├──► /api/v1/payments      ──► [ payment-service :8012 ]
      └──► /api/v1/search        ──► [ search-service :8013 ] (Question bank)
```

---

## 2. Real-Time Protocols: SSE vs. WebSockets vs. WebRTC vs. REST Polling

### ❓ Question 1: *"Why did you use Server-Sent Events (SSE) for AI Question Streaming instead of WebSockets or HTTP Polling?"*
> 📁 **Code References**:
> - Frontend Hook: `frontend/src/hooks/interview/useAIStreaming.ts`
> - Backend Route: `services/ai-interviewer-service/app/routes.py` (`POST /api/v1/interview/question/stream`)

#### 🎯 Answer:
1. **Unidirectional Response Stream**:
   - Each candidate answer is sent as a normal HTTP request. For that request, the AI response is **unidirectional** (Server $\rightarrow$ Client): the service streams incremental tokens back to the browser.
   - WebSockets are designed for full-duplex, bidirectional communication (e.g., multiplayer gaming, collaborative canvas). Using WebSockets for LLM token streaming introduces unnecessary protocol overhead: connection state maintenance, custom ping/pong heartbeats, and complex reconnection handshakes.

2. **Ordinary HTTP Transport**:
   - SSE frames are sent in an HTTP response, so this flow does not require a WebSocket upgrade. The project still uses ordinary HTTP APIs for session actions, saving turns, hints, and code execution.
   - Do not promise HTTP/2 multiplexing or universal firewall compatibility; those depend on the deployed browser, proxy, and network configuration.

3. **Fetch Stream Parsing**:
   - In `frontend/src/hooks/interview/useAIStreaming.ts`, the browser uses `fetch()`, a `ReadableStreamDefaultReader`, and `TextDecoder` to parse partial chunks:
   ```typescript
   const reader = response.body.getReader();
   const decoder = new TextDecoder();
   while (true) {
     const { value, done } = await reader.read();
     if (done) break;
     const chunk = decoder.decode(value, { stream: true });
     // Parse SSE data: {...} lines and append tokens to message state
   }
   ```
   - This allows the UI to render text as it arrives. It is not the browser's native `EventSource`; the client opens a POST request with a JSON body and parses the SSE-formatted `data:` lines itself.

---

### ❓ Question 2: *"Why did you use LiveKit SFU (WebRTC) for Audio/Video instead of a Peer-to-Peer Mesh or MCU?"*
> 📁 **Code References**:
> - Video Microservice: `services/video-service/src/tokenService.js`, `src/roomManager.js`
> - Frontend Hook: `frontend/src/app/interview/hooks/useWebRTC.ts`
> - Video Panel: `frontend/src/app/interview/VideoPanel.tsx`

#### 🎯 Answer:
| Architecture | How It Works | Bandwidth on Client | Server Load | Latency | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mesh (P2P)** | Each peer uploads directly to every other peer | $O(N^2)$ — Unusable above 3 participants | Zero | Low | ❌ Fails on weak home WiFi / mobile |
| **MCU (Multipoint Control Unit)** | Server decodes, composites video into 1 stream, re-encodes | $O(1)$ | Extremely high (massive CPU/GPU re-encoding cost) | High (150-300ms) | ❌ Expensive, high delay |
| **SFU (Selective Forwarding Unit - LiveKit)** | Client uploads **1** stream to SFU; SFU selectively routes packets to subscribers | $O(N)$ download, **$O(1)$ upload** | Low (routing UDP packets, no transcoding) | Low relative to server-mixed media | ✅ **Used here** |

These are general architecture trade-offs, not performance measurements from this repository.

**Key Architectural Features We Leveraged**:
1. **Dynacast (Adaptive Bitrate Routing)**: LiveKit automatically pauses high-resolution video layers if the receiver's window is minimized or network throughput drops.
2. **STUN/TURN Fallback**: Handled in `tokenService.js` via Coturn config (`turn:devmeet-turn.example.com:3478`) for users behind strict symmetric enterprise firewalls.
3. **Mock Mode for Local UI Testing**: If cloud credentials are not supplied, `tokenService.js` returns a mock token-shaped value. This lets parts of the UI run in simulation mode; it is not a signed LiveKit JWT and does not establish a real LiveKit connection.

---

### ❓ Question 3: *"Why not use simple REST Polling for the entire interview flow?"*
#### 🎯 Answer:
- Ordinary JSON APIs are used for discrete actions such as starting a session, submitting an answer, saving a turn, and running code.
- For AI text, a single HTTP response can stream chunks as they are generated. Polling would require repeated requests to check whether a result is ready and would add delay and extra traffic.
- A WebSocket would be reasonable if the product needed ongoing two-way messages over one connection. The current AI response is primarily server-to-browser, so the fetch-based SSE stream is simpler.

---

## 3. Sandboxed Code Execution Engine & Security Hardening

### ❓ Question 4: *"How do you safely execute untrusted candidate code without letting them hack the host or consume all CPU/RAM?"*
> 📁 **Code References**:
> - Core Engine: `services/code-execution-service/app/executor.py`
> - API Routes: `services/code-execution-service/app/routes.py`
> - Task Queue: `services/code-execution-service/app/queue_manager.py`

#### 🎯 Answer:
We use layered Docker restrictions in `services/code-execution-service/app/executor.py`. The exact flags depend on whether execution uses the Docker SDK or CLI fallback:

```
                       Untrusted Candidate Code
                                  │
   ┌──────────────────────────────▼──────────────────────────────┐
   │ Docker Isolation Boundary                                  │
   │                                                             │
   │ 1. Resource Limits (cgroups):                               │
   │    • Memory and CPU limits (reduce host resource exhaustion) │
   │    • CPU quota limits the container's CPU usage             │
   │    • Process limit (reduces process-exhaustion risk)         │
   │                                                             │
   │ 2. Network Isolation:                                       │
   │    • --network=none (No candidate container network access) │
   │                                                             │
   │ 3. Filesystem Hardening:                                    │
   │    • Read-only filesystem where the language path permits    │
   │    • Temporary storage with flags that vary by execution path │
   │                                                             │
   │ 4. Kernel Privileges:                                       │
   │    • --security-opt=no-new-privileges:true                  │
   │    • --cap-drop=ALL (Drops all Linux capabilities)          │
   └─────────────────────────────────────────────────────────────┘
```

1. **Process Resource Limits**:
   - A process limit reduces the impact of runaway process creation, while memory, CPU, and timeout controls limit other forms of resource use. Exact values differ between the Docker SDK and CLI paths.

2. **Network Isolation (`--network=none`)**:
   - Blocks the candidate program's container network access. It is one layer of defense, not a substitute for host isolation and secure infrastructure configuration.

3. **Filesystem Restrictions**:
   - The container filesystem is read-only where the language path permits it, with temporary storage for execution or compilation. Compiled-language paths have different requirements and restrictions.

4. **Docker SDK and CLI Paths**:
   - The executor supports the Docker Python SDK and a Docker CLI subprocess fallback. This helps it run in different development environments, but does not guarantee that Docker is available or that every environment behaves identically.

5. **Execution Timeout**:
   - The service applies a timeout while waiting for execution and removes the container afterward. The configured timeout can be supplied by the request; the exact timeout mechanism differs between the SDK and CLI paths.

---

## 4. AI Interviewer & LLM Streaming Architecture

### ❓ Question 5: *"How do you handle LLM latency, structured JSON validation, and anti-leniency scoring?"*
> 📁 **Code References**:
> - Routing & SSE: `services/ai-interviewer-service/app/routes.py`
> - Prompt Templates: `services/ai-interviewer-service/app/prompts.py`
> - Circuit Breaker & Keys: `services/ai-interviewer-service/app/circuit_breaker.py`, `key_manager.py`
> - Heuristics & Difficulty: `services/ai-interviewer-service/app/heuristics.py`

#### 🎯 Answer:
1. **Dynamic Follow-Up Generation (Not Pre-Scripted)**:
   - In `prompts.py`, we inject the session state, interview role (e.g., Senior Backend), difficulty, and the last 5 turns.
   - The prompt instructs the LLM to follow the **Socratic method**: acknowledge the candidate's last answer, probe edge cases (e.g., *"How does your cache handle stampedes?"*), and provide progressive 3-tier hints only when requested.

2. **Anti-Leniency Guard**:
   - Standard LLMs suffer from "positive feedback bias" (giving everyone 9/10).
   - In `prompts.py`, we enforce an **Anti-Leniency Rubric**:
     - *Criterion*: Penalize hand-wavy explanations, missing Big-O analysis, lack of unit test considerations, and unhandled race conditions.
     - Mandates strict distribution: Top 10% get 85+, Average gets 60-75.

3. **Circuit Breaker Pattern**:
   - Implemented in `circuit_breaker.py` around upstream LLM API calls:
     - **Closed**: Requests pass through normally.
     - **Open**: The configured breaker trips after 5 recorded failures within 60 seconds and stays open for 30 seconds.
     - **Recovery**: Requests are allowed again after the timeout; a successful request clears the failure history. Do not describe it as a guaranteed single-canary half-open implementation.

4. **Rate Limit and Token-Budget Caveat**:
   - The AI request rate limit is per user and uses a Redis sliding window. A 50,000-token budget check exists per session, but the streaming route does not call the separate token-recording function; do not claim the cumulative token cap is fully enforced end-to-end.

---

## 5. Distributed Orchestration, State Machine & Concurrency

### ❓ Question 6: *"How does the interview session state transition safely, and how do you prevent race conditions when two events arrive simultaneously?"*
> 📁 **Code References**:
> - Orchestrator Routes: `services/orchestrator-service/app/routes.py`
> - Sessions Router: `services/orchestrator-service/app/routers/sessions.py`
> - Distributed Lock: `services/orchestrator-service/app/redis_client.py`
> - Idempotency: `services/orchestrator-service/app/idempotency.py`
> - Outbox Pattern: `services/orchestrator-service/app/outbox.py`

#### 🎯 Answer:
1. **Strict Finite State Machine (FSM)**:
   ```
   CREATED ──► IN_PROGRESS ◄──► PAUSED
                   │               │
                   ├──► COMPLETED  ├──► COMPLETED
                   └──► CANCELLED  └──► CANCELLED
   CREATED ──► CANCELLED
   ```
   - In `services/orchestrator-service/app/models.py`, `validate_state_transition()` prevents illegal state jumps (e.g., you cannot jump from `CREATED` directly to `COMPLETED`, or resume a `CANCELLED` session).

2. **Redis Lock Scope**:
   - In `services/orchestrator-service/app/redis_client.py`:
   ```python
   async with redis_lock.acquire_lock(current_user["id"]) as lock_acquired:
       # Protects the session-creation flow for this user
   ```
   - This lock protects concurrent session creation. The current `create_turn()` route does not acquire a per-session lock, so do not claim it prevents races in transcript turn numbering.

3. **Transactional Outbox Pattern**:
   - When an interview completes, Feedback Service needs the transcript to generate a report.
   - `outbox.py` inserts the completion event into PostgreSQL in the same transaction as the session update. A worker polls the table and sends an HTTP request to Feedback Service; this completion path does not publish to RabbitMQ.

4. **Idempotency Keys**:
   - Idempotency is opt-in through the `Idempotency-Key` header on routes that call the idempotency helper, such as session creation and completion. The transcript `create_turn()` route does not currently call that helper.

---

## 6. Edge AI Proctoring & Computer Vision in Browser

### ❓ Question 7: *"What signals does browser-side proctoring use, and what are its privacy limits?"*
> 📁 **Code References**:
> - Proctoring Hook: `frontend/src/app/interview/hooks/useProctoring.ts`
> - Cheating Detection: `frontend/src/hooks/interview/useCheatingDetection.ts`
> - Video Overlays: `frontend/src/app/interview/video/ProctorOverlays.tsx`
> - Backend Proctor Router: `services/orchestrator-service/app/routers/proctoring.py`

#### 🎯 Answer:
1. **Client-Side Visual Checks**:
   - Visual checks in `useProctoring.ts` run in the browser and use face/gaze and object-detection logic. This describes where inference runs; it does not mean that no video leaves the device. LiveKit media and the separate consent-based recording flow are distinct data paths.
   - Do not claim legal compliance from the location of inference alone. Explain what is transmitted, stored, retained, and disclosed to candidates.

2. **Graceful Degradation (Low-End Hardware / CDN Slowdown)**:
   - If the candidate's machine lacks GPU acceleration or the TensorFlow weights take too long to load over CDN, `useProctoring.ts` automatically falls back to an internal **HTML5 Canvas pixel-luminance gaze estimator**. The interview is never blocked.

3. **Behavioral Integrity Signals and Limits**:
   - `useCheatingDetection.ts` listens for:
     - `document.visibilitychange` & `window.blur` (detects switching to ChatGPT / LeetCode tabs).
     - `fullscreenchange` (exiting required full-screen mode).
     - Copy/paste event monitoring in the editor.
   - Tab/paste strikes are reported to the Orchestrator, which increments those counters. The frontend currently triggers completion at four strikes; the backend cheating route itself only records the event and does not enforce that threshold. These signals are client-reported and are not tamper-proof evidence.

---

## 7. Database Architecture, Connection Pooling & Fallback

### ❓ Question 8: *"Why did you use direct AsyncPG connection pooling instead of an ORM? What is your resilience strategy?"*
> 📁 **Code References**:
> - Orchestrator DB: `services/orchestrator-service/app/database.py`
> - Feedback DB: `services/feedback-service/app/database.py`

#### 🎯 Answer:
1. **Direct Async PostgreSQL Access**:
   - The Orchestrator uses an `asyncpg` connection pool and parameterized SQL. This keeps the data access path explicit and async; do not claim a measured speed advantage over an ORM unless you have benchmark data.
   - Pool sizes are configurable. Services share PostgreSQL infrastructure in the local Compose setup, so total connection usage across replicas matters.

2. **Service-Specific Fallbacks**:
   - Fallback behavior differs by service. For example, Feedback Service has an in-memory report fallback, while the Orchestrator's session database layer does not provide the same general fallback:
   ```python
   # Feedback Service only: report persistence can fall back to local_reports
   ```
   - Such a fallback is process-local and is lost on restart; it is not durable high availability. Describe it as a local degradation path, not a replacement for PostgreSQL.

---

## 8. API Gateway & Microservices Communication Pattern

### ❓ Question 9: *"Why did you use NGINX as an API Gateway instead of letting frontend call microservices directly?"*
> 📁 **Code References**:
> - NGINX Config: `services/api-gateway/nginx.conf`
> - HTTP Clients: `services/orchestrator-service/app/clients.py`

#### 🎯 Answer:
1. **Single Browser Origin and Routing**:
   - The browser API client uses relative paths, and NGINX routes requests to internal services. This avoids exposing every service as a separate browser origin in the normal frontend flow; NGINX also applies its configured CORS policy.
   - Key current mappings include:
     - `/api/v1/sessions` $\rightarrow$ `orchestrator-service:8003`
     - `/api/v1/interview` $\rightarrow$ `ai-interviewer-service:8004`
     - `/api/v1/execute` $\rightarrow$ `code-execution-service:8005`
     - `/api/v1/video` $\rightarrow$ `video-service:8006`
     - `/api/v1/feedback` $\rightarrow$ `feedback-service:8007`
     - `/api/v1/analytics` $\rightarrow$ `analytics-service:8009`
     - `/api/v1/search` $\rightarrow$ `search-service:8013`

2. **Streaming Response Configuration**:
   - In `nginx.conf`:
   ```nginx
   proxy_buffering off;
   proxy_read_timeout 120s;
   ```
   - These settings apply to the AI streaming route so the proxy does not buffer the response and the stream has an appropriate read timeout.

3. **Defense-in-Depth Rate Limiting**:
   - Per-route rules currently apply limits to authentication, Code Execution, and AI Interviewer. The `api_general` zone is declared, but do not claim that every general API route uses it without checking the active location rules.
     - Authentication: 60 req/s (`limit_req zone=auth_login`)
     - Code Execution: 30 req/s (`limit_req zone=code_exec`)
     - AI Interviewer: 30 req/s (`limit_req zone=ai_interview`)

4. **Connection-Pooled HTTP Clients (`httpx.AsyncClient`)**:
   - In `clients.py`, microservices do not open and close a new TCP connection per request. They maintain a shared singleton `httpx.AsyncClient(timeout=5.0, limits=httpx.Limits(max_keepalive_connections=20))` to reuse existing TCP sockets.

---

## 9. Frontend Engineering: Next.js 14, Monaco & Audio Synthesis

### ❓ Question 10: *"How did you integrate Monaco Editor with Next.js 14 App Router without SSR errors?"*
> 📁 **Code References**:
> - Editor Component: `frontend/src/app/interview/CodeEditorPanel.tsx`
> - Interview Studio: `frontend/src/app/interview/[id]/page.tsx`
> - Speech Synthesis: `frontend/src/lib/speech.ts`

#### 🎯 Answer:
1. **Hydration Mismatch & Dynamic Client Import**:
   - Monaco Editor (`@monaco-editor/react`) depends on browser-only globals: `window`, `document`, `navigator`, and Web Workers.
   - In Next.js 14 App Router, components default to Server Components. Attempting to render Monaco on the server triggers `ReferenceError: window is not defined`.
   - **Solution in `CodeEditorPanel.tsx`**:
   ```typescript
   const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
     ssr: false,
     loading: () => <EditorSkeletonLoader />,
   });
   ```

2. **Web Speech API Text-to-Speech (TTS)**:
   - In `frontend/src/lib/speech.ts`, we utilize the browser's native `window.speechSynthesis`.
   - Once the SSE token stream completes (`parsed.done === true` in `useAIStreaming.ts`), the hook invokes `speak(finalQuestion)` using an English natural pitch voice unless the user toggled the mute button (`isMuted: true`).
   - Avoids paying for third-party ElevenLabs/Amazon Polly API keys during mock interviews.

---

## 10. Tough "What-If" Failure Scenarios (The Rapid-Fire Closer)

Be ready to answer these in 20-30 seconds each during the final minutes of the interview:

### ⚡ Scenario 1: *"What happens if the candidate’s internet disconnects for 15 seconds mid-coding?"*
- **Answer**:
  - The timer hook sends heartbeats every 15 seconds and reports a warning after several misses. The backend also checks whether the last heartbeat is stale.
  - When the page reloads, it can fetch the session and saved transcript. However, the interview page does not show continuous localStorage or 30-second S3 auto-saving of the editor contents, so unsaved code typed just before a disconnect may be lost.
  - Code is saved when the candidate runs/submits it through the execution or session APIs. I would improve recovery by debounced editor autosave with server acknowledgement and by testing reconnect behavior explicitly.

### ⚡ Scenario 2: *"What if the LLM produces invalid JSON or hallucinates unexpected keys?"*
- **Answer**:
  - The streaming route attempts to parse the model's accumulated text as JSON, and then tries to extract a JSON object from surrounding text. If it still cannot parse an object, it can finish with the raw text and empty hint/follow-up lists.
  - The streaming route does not apply strict Pydantic validation to every model field and does not run a JSON repair prompt. A progressive fallback question is used when model streaming fails or produces no usable text.
  - I would add an explicit response schema/validation step and tests for malformed or partial model output.

### ⚡ Scenario 3: *"What if a candidate writes an infinite loop in Python or consumes all container RAM?"*
- **Answer**:
  - The executor waits only up to the request's configured timeout and then force-removes the container. Memory and CPU limits constrain resource use; exact values differ between Docker SDK and CLI paths.
  - The service reports execution failure/timeout, but do not claim every memory kill is classified with a dedicated `MLE` status unless the response handling explicitly does that.

### ⚡ Scenario 4: *"What if two users attempt to upgrade their subscription plan simultaneously?"*
- **Answer**:
  - In `services/payment-service/app/routes.py`, mock checkout sessions are guarded by idempotent database upserts (`ON CONFLICT (user_id) DO UPDATE`).
  - Billing events are recorded sequentially in the audit ledger, and user quotas are refreshed synchronously via `user-service`.

---

## 🏆 Quick Summary Card for Interview Cheat-Sheet

| Topic | Technology Used | Why This Choice? | Key File Reference |
| :--- | :--- | :--- | :--- |
| **Streaming** | Fetch-based SSE response | Streams AI text in one direction over HTTP; candidate actions use normal APIs | `useAIStreaming.ts` / `ai-interviewer-service/app/routes.py` |
| **Media** | LiveKit WebRTC SFU | Browser obtains a token from Video Service, then connects directly to LiveKit | `services/video-service/src/tokenService.js` |
| **Code Sandbox** | Docker restrictions | Resource, network, filesystem, capability, and timeout controls; values vary by execution path | `services/code-execution-service/app/executor.py` |
| **Proctoring** | Browser-side visual checks and event signals | Useful indicators, not tamper-proof evidence; media and recording are separate paths | `useProctoring.ts` / `useCheatingDetection.ts` |
| **State Machine** | Orchestrator FSM + Redis | FSM validates session transitions; Redis supports active-session tracking and selected locks | `services/orchestrator-service/app/models.py` / `redis_client.py` |
| **Reliability** | PostgreSQL outbox + HTTP delivery | Completion event is committed with session update, then sent to Feedback Service | `services/orchestrator-service/app/outbox.py` |
| **Database** | PostgreSQL + asyncpg pools | Explicit async SQL access; fallback behavior differs by service | `services/orchestrator-service/app/database.py` |
| **Gateway** | NGINX reverse proxy | Routes browser API paths, applies configured rate limits, and streams AI responses without buffering | `services/api-gateway/nginx.conf` |
| **Frontend** | Next.js 14 + Dynamic Monaco | SSR-safe Monaco integration, App Router performance | `CodeEditorPanel.tsx` / `[id]/page.tsx` |

---
*Good luck with your interview! Keep your answers focused on trade-offs, architecture decisions, and real file implementations.*

## 11. Additional 45-Minute Deep-Dive Questions

The questions below extend the original questions; they do not replace them. A useful 45-minute interview rhythm is:

- **Minutes 0-5:** Product purpose, architecture, and your role.
- **Minutes 5-15:** Session creation, start, and the full request path.
- **Minutes 15-25:** AI streaming, transcript persistence, and real-time choices.
- **Minutes 25-35:** Code execution, sandboxing, and failure handling.
- **Minutes 35-42:** Video, proctoring, completion, feedback, and data consistency.
- **Minutes 42-45:** Limitations, trade-offs, and what you would improve next.

### Question 11: *"Walk me through one interview from clicking Start to seeing the feedback report."*

**Answer:**

1. The browser creates a session through `sessionApi.create()`. The Orchestrator checks the candidate, checks/consumes quota through User Service, checks for another active session, and asks Search Service for a matching seed. It creates a `created` session record in PostgreSQL and tracks the active session in Redis.
2. On the interview page, the browser loads session details and its transcript. When Start is clicked, the UI starts the local timer and heartbeat, requests the first AI question, and sends the session-start request to the Orchestrator.
3. The browser posts the conversation context to the AI Interviewer. The service streams text frames back; the browser renders them as they arrive. The browser also sends save requests for the candidate's answer and finished interviewer question to the Orchestrator.
4. If the candidate runs code, the browser sends it to Code Execution Service. If they submit a solution for discussion, the browser also saves a code snapshot and sends the solution context to the AI Interviewer.
5. On completion, the Orchestrator updates the session and inserts a `session.completed` outbox event in the same PostgreSQL transaction. The outbox worker later sends the transcript to Feedback Service. The feedback page first tries to retrieve a saved report and can request generation if one is not available yet.

**Code references:** [Interview room page](frontend/src/app/interview/%5Bid%5D/page.tsx), [frontend API client](frontend/src/lib/api.ts), [session routes](services/orchestrator-service/app/routers/sessions.py), [AI routes](services/ai-interviewer-service/app/routes.py), [outbox worker](services/orchestrator-service/app/outbox.py), [feedback page](frontend/src/app/interview/%5Bid%5D/feedback/page.tsx).

### Question 12: *"What exactly happens when a new interview session is created? What can fail?"*

**Answer:**

`create_session()` first checks an optional idempotency key, then takes a Redis lock for the user so two session-creation requests do not proceed together. It runs the quota call, active-session check, and seed-question lookup concurrently. If those checks pass, it inserts a `created` row in PostgreSQL, stores the active-session pointer in Redis, and saves the idempotent response.

Search is best-effort: its client returns `None` if the request fails, so session creation can continue without a seed. The current route uses the seed title and company tags to fill missing session fields; it does not save the complete seed problem into the session row here.

An important trade-off: the quota call consumes a credit before the database insert. If a later step fails, this route does not show a compensating quota refund. A stronger production design would make quota reservation/commit explicit or add a compensating action, and would test failures between each step.

**Code references:** [create_session()](services/orchestrator-service/app/routers/sessions.py), [service clients](services/orchestrator-service/app/clients.py), [idempotency helper](services/orchestrator-service/app/idempotency.py), [session database layer](services/orchestrator-service/app/database.py).

### Question 13: *"Why does the frontend start optimistically instead of waiting for the backend?"*

**Answer:**

`handleStart()` immediately switches the UI to `in_progress`, starts the timer and heartbeat, and begins the first AI question request. In parallel, it asks the Orchestrator to persist the state transition. This makes the studio feel responsive, but it creates a short period where the browser believes the session started before the server confirms it.

If the start request fails, the code shows an error, but it does not fully roll the optimistic UI state back to `created`. I would describe this as a responsiveness-versus-consistency trade-off and improve it by disabling actions until confirmation or by reverting state and stopping the timer/heartbeat on failure.

**Code references:** [handleStart()](frontend/src/app/interview/%5Bid%5D/page.tsx), [start_session()](services/orchestrator-service/app/routers/sessions.py), [session state transitions](services/orchestrator-service/app/models.py).

### Question 14: *"Why use SSE for the AI answer instead of WebSockets or ordinary JSON APIs?"*

**Answer:**

The candidate sends each answer with an ordinary HTTP request. The AI response is different: it may take time to generate, so the service returns a long-lived HTTP response containing SSE-formatted frames. The browser uses `fetch()`, a stream reader, and a UTF-8 decoder to show text progressively rather than waiting for one complete JSON response.

This is **not a WebSocket implementation**: there is no AI WebSocket endpoint or full-duplex AI connection in this flow. HTTP is still used for session actions, saving turns, hints, and code execution. SSE fits the one-way flow of AI tokens to the browser; a WebSocket would become useful if the same connection needed continuous, low-latency messages in both directions. Native `EventSource` is not used because this stream is opened with a `POST` request and a JSON body.

If the external model key is unavailable or streaming fails, the server can produce a progressive fallback question. The reverse proxy also disables response buffering for the AI route so tokens can reach the browser as they are yielded.

**Code references:** [useAIStreaming()](frontend/src/hooks/interview/useAIStreaming.ts), [generate_question_stream()](services/ai-interviewer-service/app/routes.py), [AI gateway route](services/api-gateway/nginx.conf).

### Question 15: *"How do you make sure the transcript is durable and in the right order?"*

**Answer:**

The browser keeps chat messages in React state for the live screen. It separately posts candidate and interviewer turns to the Orchestrator, which checks session ownership and writes the content to PostgreSQL. On reload, the page fetches the saved turns and reconstructs the chat.

Be candid about the current durability gap: the browser does not wait for turn-save requests to succeed. In particular, some saves use `.catch(() => {})`, so a failed request can leave a message visible in the browser but absent from the stored transcript. Turn numbering is currently computed as `existing_turns.length + 1`; the route does not take a per-session lock around that read-and-insert. Two concurrent saves could therefore race unless the database has an additional constraint or protection.

For a stronger design, use an idempotent client-generated turn ID, persist before treating a turn as committed, and allocate sequence numbers atomically in the database.

**Code references:** [handleSend() and turn handlers](frontend/src/app/interview/%5Bid%5D/page.tsx), [useAIStreaming()](frontend/src/hooks/interview/useAIStreaming.ts), [create_turn()](services/orchestrator-service/app/routers/turns.py), [create_conversation_turn()](services/orchestrator-service/app/database.py).

### Question 16: *"What is the difference between Run Code and Submit Code?"*

**Answer:**

**Run Code** is an execution request: the page can send the code to the test-case endpoint or to the asynchronous/synchronous execution endpoint and display output. It is useful for trying an implementation without treating it as a conversational answer.

**Submit Code** saves a code snapshot through the Orchestrator, then adds a candidate message asking the AI to review the approach, complexity, and edge cases. The AI sees the source and a short test summary in the conversation; code execution itself is handled by the separate execution service.

There is a current implementation gap worth knowing: the page defaults `asyncExecution` to `true`, and `executeAsync()` returns a queued job ID. The page then reads that response as if it already contained `output` and `success`. The frontend API wrapper does not expose a matching job-status polling helper, even though the backend has `GET /status/{job_id}`. So the async path needs polling/result handling before its UI can reliably show the completed execution result. The synchronous endpoint is the fallback when queue submission throws, not when it returns a normal queued response.

**Code references:** [handleRunCode() and handleSubmitCode()](frontend/src/app/interview/%5Bid%5D/page.tsx), [execution API wrappers](frontend/src/lib/api.ts), [execution routes](services/code-execution-service/app/routes.py), [queue manager](services/code-execution-service/app/queue_manager.py).

### Question 17: *"How is candidate code isolated, and what are the limits of that protection?"*

**Answer:**

The execution service performs a source pre-scan, then runs supported languages in short-lived Docker containers. The container configuration applies resource and privilege restrictions such as memory/CPU/process limits, disabled networking, dropped Linux capabilities, and a read-only filesystem where the language flow permits it. The service also enforces execution timeouts and removes temporary containers/files afterward.

The source scan is a useful early filter, not the security boundary: source-code scans can miss behavior or reject harmless code. The container boundary and restricted runtime are the important controls. Docker containers still share the host kernel, so for a high-risk public execution platform I would consider a stronger isolation boundary (for example, dedicated worker hosts or microVMs), strict host separation, patched runtime images, and monitoring for resource exhaustion.

When discussing exact numeric limits, check the current [`executor.py`](services/code-execution-service/app/executor.py): the Docker SDK and CLI fallback paths do not necessarily use identical values.

**Code references:** [execution routes](services/code-execution-service/app/routes.py), [executor](services/code-execution-service/app/executor.py), [submission runner](services/code-execution-service/app/submission_runner.py).

### Question 18: *"What happens when the candidate pauses, loses the network, or leaves the page?"*

**Answer:**

Pause and resume are explicit Orchestrator state transitions. The frontend stops or restarts its timer around those API calls. While active, the browser sends periodic heartbeats; the server records them and can cancel a stale session. A paused session that exceeds the grace period can be marked completed. The page also tries to restore the session and transcript after a reload.

The timer is based on wall-clock time rather than relying only on interval ticks, which helps when the browser throttles background tabs. However, the client and server heartbeat intervals/comments are not fully aligned, and recovery should be tested against real disconnects rather than assumed from the UI behavior.

One important edge case: normal `complete_session()` writes the feedback outbox event, but the heartbeat path that auto-completes an overlong paused session only updates the session status in the code shown. It does not emit that same event. A production fix should route every completion path through one shared transactional completion operation so feedback generation cannot be skipped.

**Code references:** [useSessionTimer()](frontend/src/hooks/interview/useSessionTimer.ts), [pause/resume routes](services/orchestrator-service/app/routers/turns.py), [heartbeat and completion routes](services/orchestrator-service/app/routers/sessions.py).

### Question 19: *"What does proctoring actually detect, and how should you explain its trust limits?"*

**Answer:**

The browser listens for events such as leaving the tab/window or pasting text, and the video panel also runs local visual checks such as face/gaze and object detection. The frontend reports certain strikes to the Orchestrator, which increments persisted tab-switch or paste counters. The UI applies a four-strike completion rule.

This is a practice-integrity signal, not proof of cheating. Browser events can be missed or bypassed, and vision models can produce false positives because of lighting, camera placement, disability, or model uncertainty. The server must not treat a client-only claim as a verified fact; high-stakes decisions need transparent policy, consent, appeal/review, and careful retention controls.

Also be precise about privacy: visual inference happens in the browser, but that does **not** mean no video ever leaves the device. When LiveKit is configured, media is published to the LiveKit room, and the separate recording feature can upload a recording after consent. Do not claim legal compliance merely from running a model client-side.

**Code references:** [useCheatingDetection()](frontend/src/hooks/interview/useCheatingDetection.ts), [useProctoring()](frontend/src/app/interview/hooks/useProctoring.ts), [cheating route](services/orchestrator-service/app/routers/proctoring.py), [VideoPanel](frontend/src/app/interview/VideoPanel.tsx), [recording hook](frontend/src/app/interview/hooks/useSessionRecorder.ts).

### Question 20: *"Does the Video Service carry the live camera stream?"*

**Answer:**

No. The Video Service is an HTTP control API: the browser requests a LiveKit room token from it (a signed token when real credentials are configured, otherwise a mock value). The browser then uses the LiveKit client to connect to the LiveKit server and publish media directly when configured. Express does not proxy the live audio/video packets. This keeps the small service focused on token/configuration and recording endpoints, while LiveKit handles real-time media transport.

The service also maintains its own in-memory room/quality information. That registry is process-local and should not be confused with the authoritative LiveKit room state; it would not automatically be shared between multiple Video Service replicas.

**Code references:** [connectToVideoRoom()](frontend/src/app/interview/hooks/useWebRTC.ts), [video token service](services/video-service/src/tokenService.js), [Express routes](services/video-service/src/index.js), [room manager](services/video-service/src/roomManager.js).

### Question 21: *"Why do both AI Interviewer and Feedback Service contain feedback logic?"*

**Answer:**

They have overlapping capabilities, but different API responsibilities. The AI Interviewer exposes a qualitative feedback endpoint that evaluates a conversation and returns scores/strengths/weaknesses. The Feedback Service is the report-oriented path used by the feedback page: it persists a report, can create a PDF, and returns the saved report to the UI.

The distinction is not perfectly clean. The frontend can request report generation itself when it cannot find a saved report, while the completion outbox can also trigger generation. This means both paths can race and run duplicate evaluation work. The Feedback Service upserts by session ID, which protects the stored row from duplicate rows, but it does not prevent duplicate model/PDF work. A cleaner design would define one report-generation owner and have the page poll or retry report retrieval.

**Code references:** [AI feedback endpoint](services/ai-interviewer-service/app/routes.py), [Feedback Service routes](services/feedback-service/app/routes.py), [Feedback Service persistence](services/feedback-service/app/database.py), [outbox worker](services/orchestrator-service/app/outbox.py), [feedback page](frontend/src/app/interview/%5Bid%5D/feedback/page.tsx).

### Question 22: *"Why use an outbox for completion? Is RabbitMQ delivering the feedback event?"*

**Answer:**

The outbox solves a database/network consistency problem. Session completion and insertion of the `session.completed` event happen in the same PostgreSQL transaction. If that transaction commits, a background worker can still see the event after a restart and retry delivery when Feedback Service is unavailable.

In this completion path, the outbox worker polls PostgreSQL and calls Feedback Service over HTTP. It does **not** publish this event to RabbitMQ. RabbitMQ is present elsewhere in the project, including the asynchronous code-execution worker. Because the event is marked published after the HTTP response, delivery is effectively retryable and can be repeated if the worker crashes between the downstream response and marking the row. The consumer should therefore remain idempotent.

**Code references:** [complete_session()](services/orchestrator-service/app/routers/sessions.py), [outbox implementation](services/orchestrator-service/app/outbox.py), [execution queue](services/code-execution-service/app/queue_manager.py).

### Question 23: *"How do authentication and service boundaries work for a session request?"*

**Answer:**

The frontend's API client sends requests through configured API URLs. NGINX routes paths such as `/api/v1/sessions`, `/api/v1/interview`, `/api/v1/execute`, `/api/v1/video`, and `/api/v1/feedback` to different services. The Orchestrator validates the bearer token through the Auth Service, then checks that the requested session belongs to the authenticated user before returning or modifying it.

The Gateway provides routing and cross-origin policy; it is not a replacement for authorization inside the service. Each backend route that accesses a user's session must still enforce identity and ownership. This matters because internal service URLs and gateway paths are configuration, not proof that a request is authorized.

**Code references:** [API client](frontend/src/lib/api.ts), [NGINX configuration](services/api-gateway/nginx.conf), [Orchestrator auth dependency](services/orchestrator-service/app/routers/deps.py), [session routes](services/orchestrator-service/app/routers/sessions.py).

### Question 24: *"Why split this into services, and what are the costs of that choice?"*

**Answer:**

The boundaries align with different jobs and runtime needs: the Orchestrator owns interview sessions and transcripts; the AI service calls language models and streams responses; Code Execution isolates untrusted programs; Video issues LiveKit tokens and accepts recordings; Feedback builds and stores reports. Search, User, Auth, Analytics, Payments, and Admin support the surrounding product.

The benefits are independent APIs and clearer responsibility boundaries. The costs are more deployments, configuration, network failures, authentication between services, and harder cross-service consistency. The local Compose setup still shares infrastructure such as PostgreSQL, Redis, and RabbitMQ; describing the project as fully isolated databases per microservice would be inaccurate. The HTTP call graph and outbox are part of the complexity introduced by the service split.

**Code references:** [Docker Compose](docker-compose.yml), [Orchestrator clients](services/orchestrator-service/app/clients.py), [service route modules](services).

### Question 25: *"What would you improve first if this project had another month?"*

**Answer:**

I would prioritize reliability in the critical interview path:

1. Make turn writes acknowledged and idempotent, and allocate turn numbers atomically.
2. Fix async code execution so the browser polls job status and displays the final result.
3. Route every completion path—including heartbeat auto-completion—through the same transactional outbox operation.
4. Prevent duplicate feedback generation between the outbox and feedback page.
5. Add failure-injection tests for quota, database, Redis, AI-provider, queue, and feedback outages.
6. Add request/session correlation IDs and dashboards for stream start time, completion rate, failed turn saves, execution timeouts, and outbox age.

That answer shows you can identify improvements from the actual code rather than claiming the system already handles every failure.

**Code references:** [turn routes](services/orchestrator-service/app/routers/turns.py), [execution status route](services/code-execution-service/app/routes.py), [heartbeat route](services/orchestrator-service/app/routers/sessions.py), [feedback page](frontend/src/app/interview/%5Bid%5D/feedback/page.tsx), [tests across services](services).

## 12. Implementation Facts to State Precisely

Use these points if the interviewer asks you to prove a claim from the repository:

- **AI streaming:** the UI uses an HTTP `POST` with a fetch stream and SSE-formatted `data:` frames. Do not call this an AI WebSocket.
- **Media:** LiveKit carries real-time media; the Express Video Service issues the access token and handles HTTP tasks. The browser connects to LiveKit directly.
- **Feedback event:** the Orchestrator's PostgreSQL outbox worker sends an HTTP request to Feedback Service. RabbitMQ is used by the code-execution queue, not this feedback outbox path.
- **Code execution:** the backend has both synchronous and queued endpoints. The current UI's queued-result flow needs a status-polling fix before you claim it reliably displays completed async output.
- **Transcript:** messages are held in frontend state and separately persisted. Some frontend save calls do not await or surface a failed save, so do not promise every visible message is guaranteed durable.
- **Proctoring:** client-side signals and vision checks are useful indicators, not tamper-proof evidence. Media transport and optional recording are separate from local inference.
- **Database fallback:** behavior is service-specific. For example, Feedback Service has an in-memory report fallback; do not claim every service automatically falls back to memory.
- **Technical choice rationale:** say what the code demonstrates and label assumptions as assumptions. If the repository does not document why a technology was first selected, do not present an inference as a recorded team decision.
- **Service ports and routes:** check [`docker-compose.yml`](docker-compose.yml) and [`nginx.conf`](services/api-gateway/nginx.conf) before quoting a port or service mapping; older architecture notes can drift.

Be ready to explain not only what works, but also what is best-effort, what is asynchronous, and what you would change. That is usually stronger than describing every feature as production-perfect.
