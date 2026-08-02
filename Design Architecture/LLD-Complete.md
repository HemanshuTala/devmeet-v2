# LLD — Complete Service Interaction Diagram
**File:** `LLD-Complete.drawio`  
**Document Number:** DevMeet-LLD-003  
**Diagram Type:** UML Component Diagram  
**How to open:** [draw.io](https://app.diagrams.net) → File → Open → select the `.drawio` file.

---

## What This Diagram Shows

A **bird's-eye view of all 14 microservices** running inside the DevMeet platform — what each service does, what APIs it exposes, and how every service connects to every other service and data store. This is the reference diagram when you want to understand *"which service talks to which?"*

---

## How to Read a UML Component Diagram

| Symbol | Meaning |
|--------|---------|
| Solid rectangle with `«component»` | A deployable service (runs as a Kubernetes pod) |
| Cylinder with `«database»` / `«cache»` / `«broker»` | A data store or message broker |
| Dashed rectangle with `«subsystem»` | A logical grouping of related services |
| Solid arrow `———>` | Synchronous REST/HTTP call |
| Dashed arrow `- - ->` | Asynchronous message (RabbitMQ/Kafka) or streaming (SSE/WebSocket) |

---

## System Boundary

Everything inside the outer box labelled `«system» DevMeet Platform` runs in a **Kubernetes cluster** in the `devmeet` namespace. All pod-to-pod traffic is encrypted with **mTLS enforced by Istio**.

---

## API Gateway (entry point)

```
«component» API Gateway  Kong/NGINX :8000
```

Every request from a browser first hits the gateway. It handles:
- SSL/TLS termination
- Rate limiting (30 req/min anonymous, up to 1000 req/min for paid users)
- JWT token verification (rejects unauthenticated requests before they reach services)
- Request routing to the correct service
- Istio sidecar for service mesh

---

## Subsystem 1 — Identity & Admin

Services that manage who users are and what they can do.

### Auth Service `:8001`  FastAPI · Python
Handles everything authentication-related.

| API | What it does |
|-----|-------------|
| `POST /auth/register` | Create a new account |
| `POST /auth/login` | Login with email + password, returns JWT pair |
| `POST /auth/refresh` | Exchange refresh token for new access token |
| `GET /auth/oauth/*` | Google and GitHub OAuth2 login |
| `POST /auth/mfa/*` | Enable, verify, and login with TOTP MFA |

Reads/writes: **PostgreSQL** (users, login history) · **Redis** (refresh tokens, MFA state, rate limits)

---

### User Service `:8002`  FastAPI · Python
Manages user profile data and quota enforcement.

| API | What it does |
|-----|-------------|
| `GET/PUT /users/me` | Get or update own profile |
| `GET /users/me/quota` | Check how many interviews remain today/this month |
| `GET /users/leaderboard` | Top users by completed sessions and average score |

Reads/writes: **PostgreSQL** (user_profiles, user_plans, usage_quotas)

---

### Admin Service `:8010`  FastAPI · Python
Only accessible to users with `role = admin`. Manages the platform.

| API | What it does |
|-----|-------------|
| `GET /admin/users` | List all users with search/filter |
| `POST /admin/users/{id}/block` | Block a user account |
| `POST /admin/users/{id}/impersonate` | Issue a short-lived token acting as that user |
| `GET /admin/audit-logs` | View the security audit trail |

Reads/writes: **PostgreSQL** (user_profiles, audit_logs)

---

### Payment Service `:8013`  FastAPI · Python · Razorpay
Handles subscriptions and billing.

| API | What it does |
|-----|-------------|
| `GET /payments/plans` | Return available plans with pricing |
| `POST /payments/checkout-session` | Create a Razorpay checkout order |
| `POST /payments/verify-payment` | Verify HMAC signature and activate plan |
| `POST /payments/webhook` | Receive Razorpay/Stripe webhook events |

Reads/writes: **PostgreSQL** (subscriptions, billing_events, user_plans)

---

### Notification Service `:8008`  Node.js · Express · WebSocket
Sends real-time notifications to users.

| Channel | How it works |
|---------|-------------|
| WebSocket `/ws?user_id=…` | Persistent connection per user. Pushes JSON notifications instantly. Uses **Redis Pub/Sub** so notifications work even if the user is connected to a different pod. |
| Email (AWS SES) | Triggered by RabbitMQ events: `user.registered` (welcome), `feedback.generated` (feedback ready) |

---

## Subsystem 2 — Interview Pipeline

Services that power the actual interview experience.

### Orchestrator `:8003`  FastAPI · Python
The brain of the interview. Manages session state and persists all data.

| API | What it does |
|-----|-------------|
| `POST /sessions` | Create a new session |
| `POST /sessions/{id}/start` | Begin the interview timer |
| `POST /sessions/{id}/pause` / `/resume` | Freeze/unfreeze the timer |
| `POST /sessions/{id}/complete` | End the session, trigger feedback pipeline |
| `POST /sessions/{id}/heartbeat` | Keep-alive ping every 30 s — sessions without heartbeat for 10 min are auto-cancelled |
| `POST /sessions/{id}/turns` | Save a conversation message |
| `POST /sessions/{id}/code` | Save a code submission |

Publishes: `session.completed` → **RabbitMQ**, analytics event → **Kafka**  
Reads/writes: **PostgreSQL**

---

### AI Interviewer `:8004`  FastAPI · Python · Groq Cloud
Generates interview questions and evaluates answers using LLMs.

| API | What it does |
|-----|-------------|
| `GET /interview/question/stream` | Opens an SSE connection. Fetches conversation history from DB, builds a prompt, calls Groq Cloud (LLaMA 3 70B for DSA, Mixtral 8x7B for behavioral), streams tokens back to the browser in real time |
| `POST /interview/hint` | Returns a hint for the current question without revealing the answer |
| `POST /interview/transcribe` | Accepts an audio file, sends to Groq Whisper, returns transcript text |

Calls: **Groq Cloud API** (external)

---

### Code Execution `:8005`  Go 1.21 · Docker SDK
Runs user code safely in an isolated container.

| API | What it does |
|-----|-------------|
| `POST /execute` | Synchronous execution — wait up to 15 s for result |
| `POST /execute/async` | Start execution in background, returns `job_id` |
| `GET /result/{id}` | Poll for async result |
| `GET /languages` | List supported languages: `python`, `javascript`, `typescript`, `java`, `cpp`, `go`, `rust` |

Security: Docker container runs with `--network none`, `--memory 256m`, `--cpus 0.5`, `--pids-limit 64`, `--read-only`, 10-second timeout.

---

### Feedback Service `:8007`  FastAPI · Python · WeasyPrint
Generates scored feedback after a session ends.

| API | What it does |
|-----|-------------|
| `GET /feedback/{session_id}` | Fetch the completed feedback report |
| `POST /feedback/generate` | Manually trigger generation (also triggered automatically via RabbitMQ) |
| `GET /feedback/{id}/pdf` | Download the PDF report |

**Triggered by:** `session.completed` from RabbitMQ  
**Process:** fetch turns + code → Groq LLM scoring prompt → parse 6 scores → Jinja2 HTML → WeasyPrint PDF → S3 upload → `INSERT feedback_reports`  
**Publishes:** `feedback.generated` → RabbitMQ (triggers notifications)  
Reads/writes: **PostgreSQL** · **AWS S3**

---

### Analytics Service `:8009`  FastAPI · Python
Tracks all platform activity and provides dashboards.

| API | What it does |
|-----|-------------|
| `POST /analytics/event` | Track a single event (session start, page view, etc.) |
| `POST /analytics/events/batch` | Track multiple events at once |
| `GET /analytics/user/{id}/dashboard` | Per-user performance summary (sessions, avg score, streak, best/worst type) |
| `GET /analytics/user/{id}/score-trend` | Score over time as chart data |
| `GET /analytics/metrics` | Platform-wide stats |
| `GET /analytics/funnel` | Interview completion funnel |
| `GET /analytics/export/sessions.csv` | Download raw data as CSV |

**Consumes:** `analytics.events` stream from **Kafka**  
Reads: **PostgreSQL** (sessions + feedback_reports for real stats)

---

## Subsystem 3 — Supporting Services

### Video Service `:8006`  Node.js · LiveKit SDK

| API | What it does |
|-----|-------------|
| `POST /video/token` | Generates a LiveKit JWT room token so the user can join the WebRTC room |
| `POST /video/recording/start` | Starts recording the room (only if `recording_consent = true`) |
| `POST /video/room/{name}/quality` | Reports network quality metrics (used for monitoring) |

Calls: **LiveKit Cloud API** (external)

---

### File Service `:8011`  FastAPI · Python · AWS S3

| API | What it does |
|-----|-------------|
| `POST /files/upload` | Upload any file → S3, returns URL |
| `GET /files/download/{key}` | Generate a 15-minute presigned S3 download URL |
| `POST /files/avatar` | Upload and resize a profile picture (max 500×500px) |
| `DELETE /files/{key}` | Delete a file from S3 |

Reads/writes: **AWS S3**

---

### Search Service `:8012`  FastAPI · Python · Elasticsearch

| API | What it does |
|-----|-------------|
| `GET /search/questions?q=…` | Full-text + filter search over the question bank |
| `GET /search/questions/random` | Get a random question (optionally filtered by type/difficulty) |
| `POST /search/questions` | Admin: add a question to the index |

Index: `devmeet_questions` in Elasticsearch — fields: `title`, `body`, `tags`, `interview_type`, `difficulty`, `companies`  
Reads/writes: **Elasticsearch**

---

## Data Stores

| Store | Stereotype | Used by |
|-------|-----------|---------|
| PostgreSQL 16 :5432 | `«database»` | Auth, User, Orchestrator, Feedback, Analytics, Admin, Payment |
| Redis 7.2 :6379 | `«cache»` | Auth (JWT/rate-limit), Notification (Pub/Sub), User (quota cache) |
| Elasticsearch 8 :9200 | `«search»` | Search Service |
| AWS S3 | `«storage»` | File Service, Feedback Service |
| RabbitMQ 3.12 :5672 | `«broker»` | Orchestrator → Feedback, Notification |
| Kafka 3.6 :9092 | `«event stream»` | Orchestrator → Analytics |

---

## Complete Message Flow Summary

```
Browser
  │── HTTPS ──► API Gateway :8000
                    │── REST ──► Auth :8001 ──► PostgreSQL + Redis
                    │── REST ──► User :8002 ──► PostgreSQL
                    │── REST ──► Orchestrator :8003 ──► PostgreSQL
                    │                │── publishes ──► RabbitMQ
                    │                │── publishes ──► Kafka ──► Analytics :8009
                    │── SSE  ──► AI Interviewer :8004 ──► Groq Cloud
                    │── REST ──► Code Execution :8005 ──► Docker sandbox
                    │── REST ──► Video :8006 ──► LiveKit Cloud
                    │── REST ──► Feedback :8007 ◄── RabbitMQ
                    │                └── writes ──► PostgreSQL + S3
                    │── WS   ──► Notification :8008 ◄── RabbitMQ + Redis Pub/Sub
                    │── REST ──► Analytics :8009 ──► PostgreSQL
                    │── REST ──► Admin :8010 ──► PostgreSQL
                    │── REST ──► File :8011 ──► S3
                    │── REST ──► Search :8012 ──► Elasticsearch
                    └── REST ──► Payment :8013 ──► PostgreSQL + Razorpay
```
