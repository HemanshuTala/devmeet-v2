# HLD — System Architecture Diagram
**File:** `HLD-System-Architecture.drawio`  
**Document Number:** DevMeet-HLD-001  
**Diagram Type:** C4 Container Diagram (UML Component Notation)  
**How to open:** [draw.io](https://app.diagrams.net) → File → Open → select the `.drawio` file, OR install the **draw.io** extension in VS Code and open directly.

---

## What This Diagram Shows

This is the **top-level architecture** of DevMeet v2.0. It answers: *"What are all the pieces of the system and how do they fit together?"*

It is organised into **6 horizontal layers**, reading from top to bottom in the order a request travels through the system.

---

## Layer-by-Layer Explanation

### Layer 1 — External Actors
The people and external systems that interact with DevMeet from outside the platform boundary.

| Element | What it is |
|---------|-----------|
| `«actor» End User` | A software engineer using DevMeet in their browser to practise interviews |
| `«actor» Admin` | A DevMeet staff member managing users and content via the admin panel |
| `«external system» Groq Cloud` | Third-party LLM API (LLaMA 3 70B, Mixtral 8x7B) — provides AI question generation and scoring |
| `«external system» AWS S3 + SES` | Amazon Web Services — S3 stores files (avatars, PDF reports), SES sends emails |
| `«external system» LiveKit Cloud` | Provides WebRTC TURN/STUN servers for video interview connectivity |
| `«external system» Razorpay` | Payment gateway for subscription billing |

---

### Layer 2 — Presentation
The Next.js frontend application running in the user's browser.

| Element | What it is |
|---------|-----------|
| `Next.js 14 Frontend` | Main React app (TypeScript, TailwindCSS, Zustand state, TanStack Query for data fetching). Port 3000 |
| `Monaco Editor` | VS Code's editor embedded in the browser — users write code here during DSA interviews |
| `LiveKit SDK` | JavaScript library that connects the browser to LiveKit's WebRTC servers for video/audio |
| `AI Proctoring` | TensorFlow.js running in the browser — detects face presence and tab switches |

---

### Layer 3 — API Gateway
Single entry point for all HTTP traffic into the backend.

| Element | What it is |
|---------|-----------|
| `Kong / NGINX :8000` | Receives every request from the browser. Does: SSL termination, rate limiting (30–1000 req/min by tier), JWT token verification, request routing to the correct microservice, Istio mTLS sidecar injection |

---

### Layer 4 — Microservices (14 services)
Each box is an independent deployable service running as a Kubernetes pod.

**Row A — Core interview services:**

| Service | Port | Language | Responsibility |
|---------|------|----------|---------------|
| Auth Service | 8001 | Python/FastAPI | Login, register, JWT tokens, OAuth2 (Google/GitHub), MFA (TOTP), RBAC |
| User Service | 8002 | Python/FastAPI | User profiles, subscription plans, daily/monthly quotas, leaderboard |
| Orchestrator | 8003 | Python/FastAPI | Interview session lifecycle — the state machine (created → in_progress → completed) |
| AI Interviewer | 8004 | Python/FastAPI | Streams AI questions to browser via SSE using Groq Cloud (LLaMA 3 / Mixtral) |
| Code Execution | 8005 | Go | Runs user code in an isolated Docker container with no network access |
| Video Service | 8006 | Node.js | Generates LiveKit room tokens for WebRTC video sessions |
| Feedback Service | 8007 | Python/FastAPI | After a session ends, scores it across 6 dimensions and generates a PDF report |

**Row B — Supporting services:**

| Service | Port | Language | Responsibility |
|---------|------|----------|---------------|
| Notification | 8008 | Node.js | Sends emails (AWS SES) and real-time in-app WebSocket notifications |
| Analytics | 8009 | Python/FastAPI | Tracks all platform events; provides per-user dashboards and score trends |
| Admin | 8010 | Python/FastAPI | Admin panel — manage users, view audit logs, change plans, impersonate |
| File Service | 8011 | Python/FastAPI | Uploads/downloads files to/from AWS S3; handles avatar resizing |
| Search Service | 8012 | Python/FastAPI | Full-text search over the question bank using Elasticsearch |
| Payment | 8013 | Python/FastAPI | Handles Razorpay/Stripe subscriptions and billing webhooks |

---

### Layer 5 — Data Stores

| Store | Port | Used for |
|-------|------|---------|
| `«database» PostgreSQL 16` | 5432 | Main relational database — all 14 tables (users, sessions, feedback, etc.) |
| `«cache» Redis 7.2` | 6379 | JWT refresh token storage, rate-limit counters, session cache, WebSocket Pub/Sub |
| `«search» Elasticsearch 8.x` | 9200 | Question bank index — full-text and filter search |
| `«storage» AWS S3` | — | Object storage for avatars, PDF feedback reports, file uploads |
| `«broker» RabbitMQ 3.12` | 5672 | Task queues — triggers feedback generation and notifications after session ends |
| `«event stream» Kafka 3.6` | 9092 | High-throughput event streaming for analytics and audit logs |

---

### Layer 6 — Observability

| Tool | What it does |
|------|-------------|
| `Prometheus` | Scrapes metrics from all services every 15 s; fires alerts on high error rate or latency |
| `Grafana` | Displays dashboards: SLO overview, per-service latency, DB pool utilisation |
| `Jaeger (OTel)` | Distributed tracing — shows the full path of a request across services |
| `Istio` | Service mesh — enforces mTLS (encrypted traffic) between every pod in the cluster |

---

## How to Read the Arrows

| Arrow style | Meaning |
|-------------|---------|
| Solid line `———>` | Synchronous HTTP/REST call |
| Dashed line `- - ->` | Asynchronous message (MQ) or streaming (SSE/WebSocket) |

---

## Key Flows Shown

1. **User → Frontend → Gateway → Auth → PostgreSQL** — login flow
2. **Frontend → Gateway → Orchestrator → AI Interviewer → Groq Cloud** — SSE streaming interview question
3. **Orchestrator → RabbitMQ → Feedback Service → S3** — post-session feedback pipeline
4. **Orchestrator → Kafka → Analytics** — event tracking
5. **Frontend → Notification Service (WebSocket)** — real-time in-app push
