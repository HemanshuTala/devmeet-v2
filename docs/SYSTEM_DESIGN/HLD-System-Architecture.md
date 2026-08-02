# DevMeet v2.0 — High-Level Design (HLD)
**Document Number:** DevMeet-HLD-001  
**Version:** 2.0  
**Date:** 2026-08-01  
**Status:** Approved  
**Classification:** Internal  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Architectural Goals & Constraints](#3-architectural-goals--constraints)
4. [System Context Diagram](#4-system-context-diagram)
5. [High-Level Architecture](#5-high-level-architecture)
6. [Service Inventory](#6-service-inventory)
7. [Inter-Service Communication](#7-inter-service-communication)
8. [Data Architecture](#8-data-architecture)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Security Architecture](#10-security-architecture)
11. [Observability](#11-observability)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Key Design Decisions](#13-key-design-decisions)
14. [Risks & Mitigations](#14-risks--mitigations)

---

## 1. Introduction

### 1.1 Purpose
This document provides the High-Level Design (HLD) for **DevMeet v2.0**, an AI-powered mock interview platform built on a fully distributed microservices architecture. It is intended for architects, senior engineers, and technical leads who need to understand the overall system structure, component responsibilities, and cross-cutting concerns.

### 1.2 Scope
The HLD covers:
- All 12 backend microservices and the API Gateway
- The Next.js frontend application
- Data stores (PostgreSQL, Redis, Elasticsearch, S3)
- Message broker infrastructure (RabbitMQ, Kafka)
- Kubernetes deployment topology
- Observability stack (Prometheus, Grafana, Jaeger)

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|-----------|
| HLD | High-Level Design |
| LLD | Low-Level Design |
| SSE | Server-Sent Events |
| JWT | JSON Web Token |
| RBAC | Role-Based Access Control |
| SLA | Service-Level Agreement |
| DAU | Daily Active Users |
| MQ | Message Queue |

### 1.4 References

| Document | Location |
|----------|----------|
| Software Requirements Specification v2 | `DevMeet_SRS_v2.md` |
| LLD — Auth & User Services | `docs/SYSTEM_DESIGN/LLD-Auth-User.md` |
| LLD — Interview Core Services | `docs/SYSTEM_DESIGN/LLD-Interview-Core.md` |
| LLD — Supporting Services | `docs/SYSTEM_DESIGN/LLD-Supporting-Services.md` |
| Database Schema Diagram | `docs/SYSTEM_DESIGN/DB-Schema-Diagram.md` |
| API Contract | `docs/API.md` |
| Deployment Guide | `docs/DEPLOYMENT.md` |

---

## 2. System Overview

### 2.1 Product Description
DevMeet is an AI-powered mock interview platform that enables software engineers to practise technical interviews with a real-time AI interviewer. The platform supports:
- **DSA (Data Structures & Algorithms)** interviews with sandboxed code execution
- **Behavioral** interviews with structured STAR-format guidance
- **System Design** interviews with diagramming support

### 2.2 Key Capabilities

| Capability | Description |
|-----------|-------------|
| AI Interview | LLM-driven adaptive questioning via Groq Cloud (LLaMA 3 / Mixtral) |
| Code Execution | Multi-language sandboxed Docker runner with test-case judging |
| Video Interview | WebRTC peer-to-peer video/audio via LiveKit |
| Feedback Engine | AI-generated scored feedback reports with PDF export |
| Analytics | Per-user and platform-wide performance tracking |
| Authentication | JWT + OAuth2 (Google, GitHub), MFA (TOTP), RBAC |
| Notifications | Email (AWS SES) and in-app real-time WebSocket push |
| Admin Panel | User management, audit logs, impersonation |
| Search | Elasticsearch-backed question bank full-text search |
| Payments | Razorpay / Stripe subscription management |

---

## 3. Architectural Goals & Constraints

### 3.1 Quality Attributes (IEEE 42010)

| Attribute | Target |
|-----------|--------|
| **Availability** | 99.9% uptime (excluding planned maintenance) |
| **Scalability** | Horizontal pod auto-scaling; each service scales independently |
| **Latency** | API gateway P95 < 200 ms; AI streaming first token < 1 s |
| **Security** | Zero-trust between services; mTLS via Istio; JWT auth on all user-facing routes |
| **Maintainability** | Domain-oriented service ownership; OpenAPI contracts; CI/CD per service |
| **Observability** | Distributed tracing (Jaeger), metrics (Prometheus), structured logging |

### 3.2 Constraints

- All services deployed on Kubernetes (minikube locally, cloud K8s in production)
- Python/FastAPI for data-intensive services; Go for code execution; Node.js for real-time I/O
- AI inference offloaded to Groq Cloud — no self-hosted LLM
- GDPR-aligned: user data deletable on request; audit logs retained 90 days

---

## 4. System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL ACTORS                                    │
│                                                                                 │
│  [End User / Browser]   [Admin User]   [Groq Cloud API]   [AWS SES / S3]       │
│         │                   │                 │                   │             │
└─────────┼───────────────────┼─────────────────┼───────────────────┼─────────────┘
          │ HTTPS/WSS         │ HTTPS           │ HTTPS REST        │ AWS SDK
          ▼                   ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DEVMEET PLATFORM BOUNDARY                               │
│                                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐                │
│   │  Next.js     │    │  Kong API    │    │  LiveKit WebRTC  │                │
│   │  Frontend    │───▶│  Gateway     │    │  Server          │                │
│   │  (port 3000) │    │  (port 8000) │    │  (port 7880)     │                │
│   └──────────────┘    └──────┬───────┘    └──────────────────┘                │
│                              │                                                  │
│              ┌───────────────┼──────────────────────────┐                      │
│              │               │                          │                      │
│              ▼               ▼                          ▼                      │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    MICROSERVICES LAYER                                  │  │
│   │  Auth  User  Orchestrator  AI-Interviewer  Code-Exec  Video  Feedback  │  │
│   │  Notification  Analytics  Admin  File  Search  Payment                 │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                                  │
│              ┌───────────────┼──────────────────────────┐                      │
│              ▼               ▼                          ▼                      │
│   ┌──────────────┐   ┌──────────────┐         ┌────────────────┐              │
│   │  PostgreSQL  │   │  Redis 7.2   │         │  Elasticsearch │              │
│   │  (Primary DB)│   │  (Cache/PubS)│         │  (Search)      │              │
│   └──────────────┘   └──────────────┘         └────────────────┘              │
│                                                                                 │
│   ┌──────────────┐   ┌──────────────┐                                         │
│   │  RabbitMQ    │   │  Kafka 3.6   │                                         │
│   │  (Task Queue)│   │  (Event Bus) │                                         │
│   └──────────────┘   └──────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. High-Level Architecture

### 5.1 Layered View

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  Next.js 14 (App Router) — React, TailwindCSS, Zustand     │
│  Deployed as Vercel edge or standalone Docker container     │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / WebSocket
┌───────────────────────────▼─────────────────────────────────┐
│  GATEWAY LAYER                                              │
│  Kong API Gateway — Rate limiting, JWT verify, routing,     │
│  SSL termination, CORS, request logging                     │
│  NGINX (fallback config in api-gateway service)             │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/2, gRPC (internal)
┌───────────────────────────▼─────────────────────────────────┐
│  SERVICE MESH (Istio)                                       │
│  mTLS between all pods, traffic management, circuit breaker │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  APPLICATION SERVICES LAYER                                 │
│                                                             │
│  ┌──────────┐ ┌─────────┐ ┌──────────────────────────────┐ │
│  │  Auth    │ │  User   │ │   Interview Orchestrator      │ │
│  │  :8001   │ │  :8002  │ │   :8003                       │ │
│  └──────────┘ └─────────┘ └──────────────────────────────┘ │
│                                                             │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐  │
│  │ AI Interviewer│ │ Code Execution │ │  Video Service   │  │
│  │ :8004 (SSE)  │ │ :8005 (Go)     │ │  :8006 (Node.js) │  │
│  └──────────────┘ └────────────────┘ └──────────────────┘  │
│                                                             │
│  ┌──────────┐ ┌──────────────┐ ┌─────────┐ ┌──────────┐   │
│  │ Feedback │ │ Notification │ │Analytics│ │  Admin   │   │
│  │  :8007   │ │  :8008       │ │  :8009  │ │  :8010   │   │
│  └──────────┘ └──────────────┘ └─────────┘ └──────────┘   │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐                 │
│  │   File   │ │  Search  │ │   Payment   │                 │
│  │  :8011   │ │  :8012   │ │   :8013     │                 │
│  └──────────┘ └──────────┘ └─────────────┘                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  DATA LAYER                                                 │
│  PostgreSQL 16 · Redis 7.2 · Elasticsearch 8.x              │
│  AWS S3 (files/PDFs) · RabbitMQ 3.12 · Kafka 3.6           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Request Flow — Typical Interview Session

```
Browser ──HTTPS──▶ Kong Gateway ──▶ Auth Service (JWT verify)
                        │
                        ▼
               Orchestrator Service  ←──creates session in PostgreSQL
                        │
               ┌────────┴────────┐
               ▼                 ▼
        AI Interviewer     Code Execution
        Service (SSE       Service (Go,
        streaming to       Docker sandbox)
        browser)                │
               │                ▼
               └──── Feedback Service (async via RabbitMQ)
                          │
                          ▼
                   Analytics Service ← event tracking
                          │
                          ▼
                  Notification Service (email / WebSocket push)
```

---

## 6. Service Inventory

| # | Service | Language | Port | Responsibility |
|---|---------|----------|------|----------------|
| 1 | **Auth Service** | Python/FastAPI | 8001 | JWT issue/refresh, OAuth2 (Google, GitHub), MFA (TOTP), RBAC, login history |
| 2 | **User Service** | Python/FastAPI | 8002 | Profile CRUD, preferences, plan management, quota enforcement, leaderboard |
| 3 | **Interview Orchestrator** | Python/FastAPI | 8003 | Session state machine (created → in_progress → paused → completed), turn management, heartbeat |
| 4 | **AI Interviewer Service** | Python/FastAPI | 8004 | Groq Cloud integration, adaptive question generation, SSE streaming, hint generation, audio transcription |
| 5 | **Code Execution Service** | Go | 8005 | Multi-language Docker sandbox, stdin/stdout judging, time & memory limits, async execution |
| 6 | **Video Service** | Node.js | 8006 | LiveKit room/token management, WebRTC signalling, recording consent, network quality reporting |
| 7 | **Feedback Service** | Python/FastAPI | 8007 | AI-generated scored feedback (6 dimensions), PDF generation, S3 upload |
| 8 | **Notification Service** | Node.js | 8008 | Email via AWS SES, in-app WebSocket push, notification preferences |
| 9 | **Analytics Service** | Python/FastAPI | 8009 | Event ingestion, per-user dashboard, platform metrics, score trends, CSV export |
| 10 | **Admin Service** | Python/FastAPI | 8010 | User management, audit log, plan changes, user impersonation, system stats |
| 11 | **File Service** | Python/FastAPI | 8011 | S3 upload/download, PDF storage, avatar management, presigned URLs |
| 12 | **Search Service** | Python/FastAPI | 8012 | Elasticsearch question bank, full-text + filter search, question ingestion |
| 13 | **Payment Service** | Python/FastAPI | 8013 | Razorpay/Stripe subscriptions, billing history, webhook handling |
| 14 | **API Gateway** | NGINX/Kong | 8000 | Routing, SSL, rate limiting, CORS, JWT validation at edge |

---

## 7. Inter-Service Communication

### 7.1 Synchronous (HTTP/REST)
Used for request/response flows where the caller needs an immediate result.

| Pattern | Usage |
|---------|-------|
| `GET /api/v1/{service}/...` | Standard REST reads routed through gateway |
| `POST /api/v1/{service}/...` | Mutations (session create, auth login, etc.) |
| `GET /api/v1/interview/question/stream` | SSE — AI streams tokens to browser |
| Internal service-to-service | Direct HTTP to `http://{service-name}:{port}` within cluster |

### 7.2 Asynchronous (Message Broker)

| Broker | Topic / Queue | Publisher | Consumer | Purpose |
|--------|--------------|-----------|----------|---------|
| RabbitMQ | `session.completed` | Orchestrator | Feedback, Analytics, Notification | Trigger post-session pipeline |
| RabbitMQ | `feedback.generated` | Feedback | Analytics, Notification | Score stored + notify user |
| RabbitMQ | `user.registered` | Auth | Notification, Analytics | Welcome email + onboarding event |
| Kafka | `analytics.events` | All services | Analytics | High-throughput event stream |
| Kafka | `audit.actions` | All services | Admin | Audit trail stream |
| Redis Pub/Sub | `notifications.{user_id}` | Any service | Notification WS | Real-time in-app push |

### 7.3 WebSocket
- **Notification Service** (port 8008): persistent WebSocket connection per authenticated user for in-app notifications
- **Video Service** (port 8006): WebRTC signalling over LiveKit's WebSocket protocol

---

## 8. Data Architecture

### 8.1 Primary Database — PostgreSQL 16

Single shared PostgreSQL instance (logically separated by schema, physically co-located in dev, replicated in prod).

**Core tables:**

| Table | Owner Service | Description |
|-------|--------------|-------------|
| `user_profiles` | Auth / User | Account credentials, profile, MFA |
| `user_plans` | User / Payment | Subscription plan per user |
| `usage_quotas` | User | Daily / monthly interview quota |
| `sessions` | Orchestrator | Interview session lifecycle |
| `conversation_turns` | Orchestrator / AI | Message history |
| `code_submissions` | Code Execution | Submitted code + results |
| `feedback_reports` | Feedback | AI-scored reports (6 dimensions) |
| `analytics_events` | Analytics | All platform event stream |
| `audit_logs` | Admin | Security & compliance audit trail |
| `subscriptions` | Payment | Razorpay/Stripe subscription state |
| `billing_events` | Payment | Payment history |
| `outbox_events` | All | Transactional outbox for reliable messaging |

### 8.2 Cache — Redis 7.2

| Usage | Key Pattern | TTL |
|-------|------------|-----|
| JWT refresh token store | `refresh:{token_hash}` | 7 days |
| Rate limiting counters | `rl:{ip}:{endpoint}` | 60 s |
| Session state cache | `session:{id}` | 30 min |
| Pub/Sub notifications | `notifications.{user_id}` | N/A |
| Distributed lock | `lock:{resource}` | 30 s |

### 8.3 Search — Elasticsearch 8.x

- Index: `devmeet_questions`
- Fields: `title`, `body`, `tags`, `interview_type`, `difficulty`, `company`
- Used by Search Service for full-text question bank queries

### 8.4 Object Storage — AWS S3

| Bucket Path | Content |
|-------------|---------|
| `devmeet-files/avatars/{user_id}/` | Profile pictures |
| `devmeet-files/feedback/{session_id}/` | PDF feedback reports |
| `devmeet-files/uploads/` | General user uploads |

---

## 9. Infrastructure & Deployment

### 9.1 Kubernetes Topology

```
Kubernetes Cluster
├── Namespace: devmeet
│   ├── Deployments (one per service, HPA-enabled)
│   ├── Services (ClusterIP internal, LoadBalancer for gateway)
│   ├── ConfigMaps (non-secret config per service)
│   └── Secrets (DB passwords, API keys, JWT secret)
├── Namespace: monitoring
│   ├── Prometheus (metrics scrape)
│   ├── Grafana (dashboards)
│   └── Jaeger (distributed tracing)
└── Namespace: infra
    ├── PostgreSQL StatefulSet (PVC-backed)
    ├── Redis StatefulSet
    ├── Elasticsearch StatefulSet
    ├── RabbitMQ StatefulSet
    └── Kafka StatefulSet (KRaft mode)
```

### 9.2 Horizontal Pod Autoscaling (HPA)

| Service | Min Pods | Max Pods | Scale Metric |
|---------|----------|----------|-------------|
| Auth Service | 2 | 8 | CPU > 70% |
| AI Interviewer | 2 | 12 | CPU > 60% |
| Code Execution | 3 | 20 | CPU > 50% |
| Orchestrator | 2 | 10 | CPU > 70% |
| All others | 1 | 5 | CPU > 70% |

### 9.3 Local Development
- `docker-compose.yml` — starts all infrastructure (PostgreSQL, Redis, Elasticsearch, RabbitMQ, Kafka)
- `docker-compose.services.yml` — starts all application services as containers
- Each service can also be run directly: `uvicorn app.main:app --reload`

---

## 10. Security Architecture

### 10.1 Authentication & Authorisation
- All user-facing routes require a JWT Bearer token (RS256 or HS256 with rotating secret)
- JWT validated at the API Gateway before forwarding to services
- Services also independently validate tokens for defence-in-depth
- RBAC roles: `user`, `pro`, `enterprise`, `admin`, `superadmin`
- OAuth2 social login: Google, GitHub
- MFA: TOTP (TOTP secret stored encrypted), backup codes (hashed)

### 10.2 Network Security
- Istio service mesh provides mTLS between all pods
- Kong Gateway enforces rate limits (100 req/min per IP by default, 1000 for authenticated users)
- All external traffic over TLS 1.2+
- Internal cluster network not exposed outside K8s

### 10.3 Data Security
- Passwords hashed with bcrypt (cost factor 12)
- Secrets stored in Kubernetes Secrets (base64, encrypted at rest)
- S3 buckets with SSE-S3 encryption
- PII fields marked in schema; GDPR delete propagates to all services via `user.deleted` event

### 10.4 Code Execution Sandbox
- Each code execution runs in an isolated Docker container
- No network access inside sandbox
- CPU time limit: 10 s, memory limit: 256 MB
- Container killed after execution; filesystem is ephemeral

---

## 11. Observability

### 11.1 Metrics — Prometheus + Grafana
- All FastAPI services expose `/metrics` (Prometheus format via `prometheus-fastapi-instrumentator`)
- Key metrics: request rate, error rate, latency histograms, DB pool utilisation
- Grafana dashboards: SLO overview, per-service latency, DB query performance

### 11.2 Distributed Tracing — Jaeger
- OpenTelemetry SDK instrumented in all services
- Trace context propagated via `traceparent` header
- Traces stored in Jaeger for 7 days

### 11.3 Structured Logging
- JSON-formatted logs from all services
- Log levels: DEBUG (dev), INFO (staging), WARNING/ERROR (prod)
- Aggregated via Kubernetes log collection (Fluentd → Elasticsearch or CloudWatch)

### 11.4 Alerting
- Alert rules defined in `k8s/monitoring/prometheus-rules.yaml`
- Alerts: service down, error rate > 5%, latency P99 > 2 s, pod restart loop

---

## 12. Non-Functional Requirements

| NFR | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | Uptime monitoring via Prometheus |
| Response Time (API) | P95 < 200 ms | Prometheus histogram |
| Response Time (AI stream, first token) | < 1 s | Custom metric in AI service |
| Throughput | 500 concurrent interviews | Load test with k6 |
| Code execution latency | < 5 s (P95) | Execution service metric |
| Data retention | 90 days analytics events | Scheduled cleanup job |
| RTO (Recovery Time Objective) | < 30 min | Runbook + K8s self-healing |
| RPO (Recovery Point Objective) | < 1 hour | PostgreSQL WAL streaming replica |

---

## 13. Key Design Decisions

### 13.1 Why Microservices?
Each domain (auth, interview, code execution, video, analytics) has distinct scaling requirements and technology choices. Microservices allow independent deployment, language choice, and team ownership.

### 13.2 Why Groq Cloud for AI?
Groq provides the fastest LLM inference available (LLaMA 3 70B at ~800 tokens/s), enabling real-time streaming responses. Self-hosting LLMs would require expensive GPU infrastructure and operational complexity.

### 13.3 Why Go for Code Execution?
Code execution requires low-latency Docker container orchestration and tight resource control. Go's goroutines and native Docker SDK provide the performance and concurrency model needed.

### 13.4 Why RabbitMQ + Kafka?
- **RabbitMQ**: reliable task queues for session pipeline (completed → feedback → notify). Strong delivery guarantees, dead-letter queues, per-message TTL.
- **Kafka**: high-throughput event streaming for analytics. Allows replay, fan-out to multiple consumers, and retention for event sourcing.

### 13.5 Why Single PostgreSQL?
In v2.0, a single multi-schema PostgreSQL instance reduces operational overhead. Service-owned tables are clearly delineated. Migration to per-service databases is possible if write throughput demands it in v3.0.

### 13.6 Transactional Outbox Pattern
To avoid dual-write problems (DB write + MQ publish), all services write events to the `outbox_events` table in the same DB transaction, and a background relay polls and publishes them to the broker. This guarantees at-least-once event delivery without distributed transactions.

---

## 14. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Groq API outage | Medium | High | Fallback to OpenAI API; circuit breaker in AI service |
| PostgreSQL single point of failure | Low | Critical | WAL streaming replica + automated failover (Patroni in prod) |
| Code execution container escape | Low | Critical | Seccomp + AppArmor profiles; no network in sandbox; regular CVE scanning |
| Redis cache invalidation bug | Medium | Medium | Cache-aside pattern; TTLs on all keys; graceful DB fallback |
| Kafka consumer lag | Low | Medium | Consumer group lag alerts; auto-scaling consumers |
| JWT secret compromise | Very Low | Critical | Short-lived tokens (15 min); refresh token rotation; revocation list in Redis |
| Cost overrun (Groq API) | Medium | Medium | Token usage tracking per user; hard quota enforcement |

---

*Document maintained by the DevMeet Engineering Team. For changes, submit a PR to the `docs/SYSTEM_DESIGN/` directory.*
