# DevMeet v2.0 — System Definition Diagram
**File:** `DevMeet-System-Definition.drawio`
**Document Number:** DevMeet-SDD-001
**Version:** 2.1
**Date:** 2026-08-02
**How to open:** [app.diagrams.net](https://app.diagrams.net) → File → Open from Device → select this file. Or install the draw.io VS Code extension and click the file directly.

---

## What This Diagram Defines

This is **the single diagram that defines the entire DevMeet system** — what it is, what users do in it, every component that makes it work, and how they are all connected. Read this before any other diagram.

The canvas is A1 landscape (2400 × 1650 px) to fit all 7 layers without clutter. Use Ctrl+Shift+H in draw.io to fit the view.

---

## The 7 Layers (top to bottom)

---

### Layer 1 — User Journey (top bar)

Shows the 8 steps a candidate goes through from first visit to upgrading their plan.

| Step | Screen | What happens |
|------|--------|-------------|
| ① | Register / Login | Create account with email+password, or sign in with Google/GitHub. MFA (TOTP) supported. |
| ② | Dashboard | See past sessions, score trends, heatmaps, leaderboard rankings. |
| ③ | Create Session | Pick interview type (DSA / Behavioral / System Design), difficulty, target company. |
| ④ | Interview | AI asks questions via chat. Video panel optional. Monaco code editor for DSA. |
| ⑤ | Submit Code | Write code → runs in Docker sandbox (Go service) → pass/fail result instantly. |
| ⑥ | End Interview | Click "End" → AI scores the full transcript across 6 dimensions. |
| ⑦ | View Feedback | Read scores, strengths, improvements. Download PDF report. |
| ⑧ | Upgrade Plan | Optional: upgrade from free → pro → enterprise via Razorpay or Stripe. |

---

### Layer 2 — Presentation (Next.js 14 Frontend, port 3000)

The web application running in the browser.

| Component | Purpose |
|-----------|---------|
| Pages | `/login`, `/register`, `/dashboard`, `/interview/[id]`, `/analytics`, `/billing`, `/admin`, `/profile` |
| Monaco Editor | VS Code's editor embedded in the browser — used for writing code during DSA interviews |
| LiveKit WebRTC SDK | Connects browser to LiveKit Cloud for real-time video and audio |
| AI Proctoring | TensorFlow.js running locally — detects tab-switching and face absence |
| State Management | Zustand for global UI state; TanStack Query for server-side data caching |
| WebSocket Client | Maintains a persistent `/ws` connection for real-time notification push |
| SSE Client | Receives streamed AI question tokens during the interview session |

---

### Layer 3 — API Gateway (Kong/NGINX + Istio Ingress, port 8000)

All browser requests pass through this single entry point.

| Function | Detail |
|----------|--------|
| SSL Termination | Decrypts HTTPS → forwards HTTP internally |
| JWT Verification | Rejects unauthenticated requests before they reach services |
| Rate Limiting | Anonymous: 30/min · Free: 300/min · Pro: 1000/min |
| Request Routing | `/auth/*` → Auth, `/sessions/*` → Orchestrator, `/interview/*` → AI Interviewer, etc. |
| Istio mTLS Sidecar | Envoy proxy enforces mutual TLS on every pod-to-pod connection |
| CORS / Headers | Security response headers, CORS policy enforcement |
| WebSocket Upgrade | `/ws` connections are passed through for Notification Service |

---

### Layer 4 — Microservices (14 services, Kubernetes namespace: `devmeet`)

Each box is an independent Kubernetes pod with HPA auto-scaling. All traffic between pods is encrypted by Istio mTLS.

#### Identity & Admin Group

| Service | Port | Stack | What it does |
|---------|------|-------|-------------|
| **Auth Service** | 8001 | FastAPI/Python | JWT HS256 (15 min access + 7 d refresh), Google/GitHub OAuth2 (OIDC), TOTP MFA, RBAC roles, bcrypt cost=12 |
| **User Service** | 8002 | FastAPI/Python | Read/update profiles and preferences, enforce daily/monthly interview quotas per plan, leaderboard |
| **Admin Service** | 8010 | FastAPI/Python | List/block/delete users, change plans, view audit logs, impersonate users (superadmin only) |
| **Payment Service** | 8013 | FastAPI/Python | Razorpay + Stripe checkout, HMAC signature verification, webhook handling, plan activation (calls User Service) |
| **Notification Service** | 8008 | Node.js | AWS SES email (welcome, feedback-ready), WebSocket push `/ws`, Redis Pub/Sub fan-out across pods |

#### Interview Pipeline Group

| Service | Port | Stack | What it does |
|---------|------|-------|-------------|
| **Orchestrator** | 8003 | FastAPI/Python | Session state machine: `created → in_progress → paused → completed/cancelled`. Saves turns and code submissions to PostgreSQL. Publishes `session.completed` to RabbitMQ and `analytics.events` to Kafka. Auto-cancels sessions with no heartbeat for 10 min. |
| **AI Interviewer** | 8004 | FastAPI/Python | Calls Groq Cloud with LLaMA 3-70B (DSA/system design) or Mixtral 8x7B (behavioral). Reads conversation history from PostgreSQL. Streams tokens to browser via SSE. Audio transcription via Groq Whisper. |
| **Code Execution** | 8005 | Go 1.21 | Spawns Docker container per submission: `--network none`, `--memory 256m`, `--cpus 0.5`, `--pids-limit 64`, `--read-only`, 10 s timeout. Supports Python, JavaScript, TypeScript, Java, C++, Go, Rust. |
| **Feedback Service** | 8007 | FastAPI/Python | Triggered by RabbitMQ `session.completed`. Fetches transcript + code, calls Groq for 6-dimension scoring, generates HTML→PDF via WeasyPrint, uploads PDF to S3, publishes `feedback.generated` back to RabbitMQ. |
| **Analytics Service** | 8009 | FastAPI/Python | Consumes `analytics.events` from Kafka. Provides per-user dashboards (streak, avg score, session counts), score-trend chart data, platform-wide funnel metrics, CSV exports. |
| **Video Service** | 8006 | Node.js | Generates LiveKit JWT room tokens for WebRTC session join. Manages recording start/stop (consent-gated). Reports per-room network quality metrics. |

#### Supporting Services Group

| Service | Port | Stack | What it does |
|---------|------|-------|-------------|
| **File Service** | 8011 | FastAPI/Python | Upload/download files to/from S3. Resizes avatars (max 500×500 px). Generates presigned download URLs (15 min expiry). |
| **Search Service** | 8012 | FastAPI/Python | Full-text + tag/difficulty/company filter search over the Elasticsearch `devmeet_questions` index. Returns random questions for session seeding. |

---

### Layer 5 — Data Stores

| Store | Type | Port | Used for |
|-------|------|------|---------|
| **PostgreSQL 16** | Relational DB | 5432 | All persistent data — 14 tables: users, sessions, conversation turns, code submissions, feedback reports, analytics events, audit logs, subscriptions |
| **Redis 7.2** | Cache + Pub/Sub | 6379 | JWT refresh tokens, rate-limit counters, MFA temp tokens, session quota cache (User Service), WebSocket Pub/Sub fan-out (Notification Service) |
| **Elasticsearch 8** | Search index | 9200 | `devmeet_questions` index — full-text search with tags, difficulty, company, interview type filters |
| **AWS S3** | Object storage | — | Profile avatars, PDF feedback reports, user file uploads |
| **RabbitMQ 3.12** | Message broker | 5672 | Reliable task queues: `session.completed` (triggers Feedback + Notification), `feedback.generated` (triggers Notification), `user.registered` (welcome email) |
| **Kafka 3.6** | Event stream | 9092 | High-throughput replayable stream: `analytics.events`, `audit.actions` consumed by Analytics Service |

---

### Layer 6 — External Systems (right column)

Systems outside the DevMeet platform boundary that services depend on.

| System | Used by | For |
|--------|---------|-----|
| **Groq Cloud** | AI Interviewer | LLM inference — LLaMA 3-70B, Mixtral 8x7B, Whisper; REST + SSE |
| **AWS (S3 + SES)** | File Service, Notification Service | Object storage + transactional email |
| **LiveKit Cloud** | Video Service | WebRTC TURN/STUN relay servers, room management |
| **Razorpay** | Payment Service | Payment gateway (India market), webhooks, subscription billing |
| **Stripe** | Payment Service | Payment gateway (global market), webhooks, subscription billing |
| **Google / GitHub** | Auth Service | OAuth2 / OIDC social login |
| **Docker Engine** | Code Execution Service | Ephemeral sandbox containers spawned per code submission |

---

### Layer 7 — Infrastructure & Observability (bottom bar)

| Component | What it does |
|-----------|-------------|
| **Kubernetes 1.28+** | Runs all 14 services as pods in the `devmeet` namespace. HPA scales pods by CPU/memory. Rolling deploys, ConfigMaps, Secrets. |
| **Istio Service Mesh** | Envoy sidecars injected into every pod. Enforces mTLS on all pod-to-pod traffic. Traffic policies and circuit breakers. |
| **Prometheus :9090** | Scrapes `/metrics` from all services and the gateway. Alertmanager rules for SLO breaches. |
| **Grafana :3001** | Connects to Prometheus as datasource. Service dashboards, SLO/SLA boards, alert routing to Slack/PagerDuty. |
| **Jaeger :16686** | Collects OpenTelemetry distributed traces from all services. Latency analysis, dependency maps. |
| **HashiCorp Vault** | Secrets management — database credentials, API keys, TLS certs. Automatic key rotation. |
| **GitHub Actions CI/CD** | Build → test → push Docker image → rolling deploy to Kubernetes. Slack notifications on failure. |

---

## Key Data Flows (critical paths)

| # | Flow | Arrow type |
|---|------|-----------|
| 1 | Browser → Gateway → **Orchestrator** → PostgreSQL | Solid (sync REST) |
| 2 | Gateway → **AI Interviewer** → Groq Cloud → Browser | Dashed (SSE stream) |
| 3 | **Orchestrator** → RabbitMQ → **Feedback Service** → PostgreSQL + S3 | Dashed (async MQ) |
| 4 | **Feedback Service** → RabbitMQ → **Notification Service** → AWS SES | Dashed (async MQ) |
| 5 | **Orchestrator** → Kafka → **Analytics Service** → PostgreSQL | Dashed (event stream) |
| 6 | **Auth Service** ↔ Redis | Solid (JWT/rate-limit cache) |
| 7 | **Notification Service** ↔ Redis Pub/Sub → WebSocket → Browser | Dashed (fan-out push) |
| 8 | **Payment Service** → Razorpay/Stripe → **User Service** (plan activate) | Dashed then Solid |
| 9 | **Code Execution** → Docker Engine (ephemeral) | Solid (spawn) |
| 10 | Prometheus → all services `/metrics` (scrape) | Red dashed (monitoring) |

---

## Arrow Legend

| Style | Meaning |
|-------|---------|
| Solid `———>` | Synchronous REST/HTTP — caller waits for response |
| Dashed `- - ->` | Asynchronous: MQ publish/consume, SSE stream, WebSocket push |
| Red dashed `- - ->` | Monitoring scrape / OpenTelemetry trace collection |

---

## Gaps Fixed in v2.1 (vs previous version)

| # | Gap | Fixed |
|---|-----|-------|
| 1 | Infra/Observability layer missing | Added Layer 7 with K8s, Istio, Prometheus, Grafana, Jaeger, Vault, CI/CD |
| 2 | Stripe not shown as external system | Added Stripe alongside Razorpay |
| 3 | Payment → User Service plan activation arrow missing | Added `c-pay-user` connector |
| 4 | Kafka → Analytics arrow missing | Added `c-kafka-anal` connector |
| 5 | Feedback → RabbitMQ publish missing | Added `c-feed-rmq` connector |
| 6 | Notification → Redis Pub/Sub missing | Added `c-notif-redis` connector |
| 7 | Admin Service had no data-store connector | Added `c-admin-pg` connector |
| 8 | User Service → Redis quota cache missing | Added `c-user-redis` connector |
| 9 | AI Interviewer → PostgreSQL (history reads) missing | Added `c-ai-pg` connector |
| 10 | Canvas too small (A4) | Expanded to 2400 × 1650 px (A1 landscape) |
| 11 | WebSocket client not shown in frontend | Added WS Client and SSE Client boxes in Layer 2 |
| 12 | Docker runtime not shown | Added Docker Engine in External Systems |

---

## Cross-References

| Need more detail on… | See |
|----------------------|-----|
| Auth flows (register, login, MFA, OAuth2, token refresh) | `LLD-Auth-Flow.drawio` / `LLD-Auth-Flow.md` |
| Interview session state machine and E2E pipeline | `LLD-Interview-Orchestration.drawio` / `LLD-Interview-Orchestration.md` |
| All 14 tables, columns, FK relationships | `LLD-DB-Schema.drawio` / `LLD-DB-Schema.md` |
| Every service's API endpoints in one view | `LLD-Complete.drawio` / `LLD-Complete.md` |
| Full HLD with NFRs, ADRs, security architecture | `HLD-System-Architecture.drawio` / `HLD-System-Architecture.md` |
| Kubernetes manifests | `k8s/` |
| Prometheus / Grafana config | `monitoring/` |
| Database migrations (DDL) | `migrations/init_dev_schema.sql` |
