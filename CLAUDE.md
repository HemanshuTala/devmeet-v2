# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DevMeet v2.0 — an AI-powered mock interview platform (DSA, behavioral, system design) with real-time AI feedback via Groq LLM. Microservices architecture with 14 backend services, Nginx API gateway, and Next.js frontend.

## Commands

### Full Stack (Docker)

```powershell
# Start all infrastructure + services
.\scripts\start-docker.ps1

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Infrastructure Only (for local service development)

```powershell
docker compose -f docker-compose.yml up -d
```

### Run a Single Python Service

```bash
cd services/<service-name>
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port <port>
```

### Run a Single Node.js Service (video-service or notification-service)

```bash
cd services/<service-name>
npm install
npm start
```

### Test

```bash
# Python service tests
cd services/<service-name>
pytest --cov=. --cov-report=xml

# Frontend type-check + build verification
cd frontend
npm run build
```

### Lint

```bash
cd frontend
npm run lint
```

### Health Check

```powershell
.\scripts\health-check.ps1
```

## Architecture

### Service Map (all behind API Gateway at :8000)

| Service | Port | Stack | Role |
|---------|------|-------|------|
| api-gateway | 8000 | Nginx | Reverse proxy, single entry point |
| auth-service | 8001 | FastAPI | JWT (15min access/7d refresh), OAuth2 (Google/GitHub), MFA (TOTP), RBAC |
| user-service | 8002 | FastAPI | Profiles, subscription plans, quotas |
| orchestrator-service | 8003 | FastAPI | Interview session state machine (created→in_progress→paused→completed/cancelled) |
| ai-interviewer-service | 8004 | FastAPI | Groq API (LLaMA 3/Mixtral), streaming SSE responses |
| code-execution-service | 8005 | FastAPI | Docker SDK sandboxed code execution |
| video-service | 8006 | Node.js/Express | LiveKit WebRTC room management |
| feedback-service | 8007 | FastAPI | AI-generated interview feedback, PDF export |
| notification-service | 8008 | Node.js/Express | AWS SES email + WebSocket push |
| analytics-service | 8009 | FastAPI | Kafka consumer, metrics aggregation |
| admin-service | 8010 | FastAPI | User management, audit logs |
| file-service | 8011 | FastAPI | AWS S3 upload/download |
| payment-service | 8012 | FastAPI | Razorpay integration |
| search-service | 8013 | FastAPI | Elasticsearch question bank |

### Infrastructure Dependencies

- **PostgreSQL 16** — shared database, schema in `migrations/init_dev_schema.sql`
- **Redis 7.2** — session cache, rate limiting, real-time state
- **Elasticsearch 8.11** — question bank full-text search
- **RabbitMQ 3.12** — inter-service event dispatch (feedback generation, notifications)
- **Kafka 3.6** — analytics event streaming
- **AWS S3** — file storage, PDF exports
- **AWS SES** — transactional email
- **LiveKit** — WebRTC video infrastructure

### Frontend Architecture

- **Next.js 14 App Router** with TypeScript (strict mode)
- **API client** (`src/lib/api.ts`) — custom fetch wrapper pointing to gateway; `next.config.js` rewrites routes to microservices
- **Auth** — `src/contexts/AuthContext.tsx` (React Context), hooks in `src/hooks/`
- **Server state** — TanStack React Query (queries in `src/hooks/queries/`)
- **Client state** — Zustand (`src/stores/uiStore.ts`)
- **UI** — shadcn/ui (Radix primitives) + Tailwind CSS with dark mode; components in `src/components/ui/`
- **Special integrations** — Monaco Editor (Vim bindings), TensorFlow.js (COCO-SSD proctoring), MediaPipe, LiveKit client, Recharts, Framer Motion/GSAP animations

### Key Patterns

- All Python services follow the same structure: `app/main.py` as FastAPI entrypoint, `app/routers/` for route handlers, `app/models/` for Pydantic schemas
- Frontend form validation uses React Hook Form + Zod schemas (in `src/lib/validations/`)
- The orchestrator is the central coordinator — other services react to state transitions it publishes via RabbitMQ
- AI responses stream via Server-Sent Events (SSE) from the ai-interviewer-service

### Deployment

- Docker Compose for local development (`docker-compose.yml` + `docker-compose.services.yml`)
- Kubernetes manifests in `k8s/` with Istio service mesh, HPA autoscaling, HashiCorp Vault
- CI/CD via GitHub Actions (`.github/workflows/ci-cd.yml`): test → build images → push to Docker Hub → deploy to K8s
