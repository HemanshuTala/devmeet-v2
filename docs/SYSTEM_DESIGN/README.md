# DevMeet v2.0 — System Design Documentation

This directory contains the complete system design documentation for **DevMeet v2.0**, an AI-powered mock interview platform built on a distributed microservices architecture.

All documents follow **IEEE standards** for software design documentation.

---

## Document Index

| Document | Number | Description |
|----------|--------|-------------|
| [HLD — System Architecture](./HLD-System-Architecture.md) | DevMeet-HLD-001 | High-Level Design covering all services, architecture layers, security, NFRs, ADRs |
| [LLD — Auth & User Services](./LLD-Auth-User.md) | DevMeet-LLD-001 | Auth (JWT, OAuth2, MFA) and User (profiles, quotas, leaderboard) service LLD |
| [LLD — Interview Core Services](./LLD-Interview-Core.md) | DevMeet-LLD-002 | Orchestrator, AI Interviewer, Code Execution, Video, Feedback service LLD |
| [LLD — Supporting Services](./LLD-Supporting-Services.md) | DevMeet-LLD-003 | Analytics, Admin, Notification, File, Search, Payment, API Gateway LLD |
| [Database Schema Diagram](./DB-Schema-Diagram.md) | DevMeet-DB-001 | All 14 tables, ERD, indexes, FK relationships, data retention policy |

---

## Architecture at a Glance

```
Browser / Mobile
       │
       ▼
 Kong API Gateway (port 8000)
       │
       ├──▶ Auth Service         :8001   Python/FastAPI
       ├──▶ User Service         :8002   Python/FastAPI
       ├──▶ Orchestrator         :8003   Python/FastAPI
       ├──▶ AI Interviewer       :8004   Python/FastAPI + Groq SSE
       ├──▶ Code Execution       :8005   Go + Docker
       ├──▶ Video Service        :8006   Node.js + LiveKit
       ├──▶ Feedback Service     :8007   Python/FastAPI
       ├──▶ Notification Service :8008   Node.js + WebSocket
       ├──▶ Analytics Service    :8009   Python/FastAPI
       ├──▶ Admin Service        :8010   Python/FastAPI
       ├──▶ File Service         :8011   Python/FastAPI + S3
       ├──▶ Search Service       :8012   Python/FastAPI + Elasticsearch
       └──▶ Payment Service      :8013   Python/FastAPI
```

**Data stores:** PostgreSQL 16 · Redis 7.2 · Elasticsearch 8.x · AWS S3  
**Message brokers:** RabbitMQ 3.12 · Kafka 3.6  
**Infrastructure:** Kubernetes · Istio · Prometheus · Grafana · Jaeger

---

## Reading Order

1. Start with the **[HLD](./HLD-System-Architecture.md)** for overall system context, architectural decisions, and non-functional requirements.
2. Read **[LLD-Auth-User](./LLD-Auth-User.md)** to understand authentication, JWT flows, and user management.
3. Read **[LLD-Interview-Core](./LLD-Interview-Core.md)** to understand the interview session pipeline from creation to feedback.
4. Read **[LLD-Supporting-Services](./LLD-Supporting-Services.md)** for analytics, notifications, search, payments, and the gateway.
5. Use **[DB-Schema-Diagram](./DB-Schema-Diagram.md)** as a reference whenever you need to understand data models or write queries.

---

## Related Documentation

| Document | Location |
|----------|----------|
| Software Requirements Specification | `DevMeet_SRS_v2.md` |
| API Contracts | `docs/API.md` |
| Deployment Guide | `docs/DEPLOYMENT.md` |
| Production Config Guide | `docs/production_config_guide.md` |
| Kubernetes Manifests | `k8s/` |
| Database Migrations | `migrations/` |
| Monitoring Config | `monitoring/` |
| Draw.io Architecture Diagrams | `Design Architecture/` |

---

## Design Architecture Diagrams (Draw.io)

Visual diagrams are in `Design Architecture/`:

| File | Contents |
|------|---------|
| `HLD-System-Architecture.drawio` | All 14 services in 6 layers: Actors → Frontend → Gateway → Microservices → Data Stores → Infra/Observability |
| `LLD-Auth-Flow.drawio` | 5 flows: Register, Login, MFA (TOTP), OAuth2 (Google/GitHub), Token Refresh/Logout. RBAC matrix + JWT design |
| `LLD-Interview-Orchestration.drawio` | Session state machine + E2E pipeline sequence + Code Exec sandbox detail + Feedback generation detail |
| `LLD-DB-Schema.drawio` | Full ER diagram: all 16 tables with columns, types, constraints, PK/FK, cardinality relationships |
| `LLD-Complete.drawio` | All 14 services with API endpoints, all data stores, all REST/SSE/MQ/WS flows, Kubernetes deployment context |

Open these with [draw.io](https://draw.io) or the VS Code draw.io extension.

---

*Maintained by the DevMeet Engineering Team. Update this index whenever a new design document is added.*
