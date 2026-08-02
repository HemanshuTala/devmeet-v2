# DevMeet v2.0

AI-Powered Mock Interview Platform - Distributed Microservices Edition

## Architecture

DevMeet is built as a fully distributed microservices system on Kubernetes with the following services:

- **Auth Service** (FastAPI, Python) - Authentication, JWT, OAuth2, RBAC
- **User Service** (FastAPI, Python) - Profile, preferences, plan management, quota
- **Interview Orchestrator** (FastAPI, Python) - Session lifecycle, state machine
- **AI Interviewer Service** (FastAPI, Python) - Groq API integration, streaming SSE
- **Code Execution Service** (Go) - Sandboxed Docker runner, multi-language judge
- **Video Service** (Node.js + LiveKit) - WebRTC room management
- **Feedback Service** (FastAPI, Python) - AI-generated feedback, PDF generation
- **Notification Service** (Node.js) - Email (SES), in-app push
- **Analytics Service** (FastAPI, Python) - Metrics aggregation, reporting
- **Admin Service** (FastAPI, Python) - User management, audit logs
- **File Service** (FastAPI, Python) - S3 upload/download, PDF export
- **Search Service** (FastAPI + Elasticsearch) - Question bank search

## Tech Stack

- **Backend**: FastAPI (Python), Go, Node.js
- **Frontend**: Next.js
- **Database**: PostgreSQL 16, Redis 7.2
- **Search**: Elasticsearch 8.x
- **Message Queue**: RabbitMQ 3.12, Kafka 3.6
- **AI**: Groq Cloud API (LLaMA 3, Mixtral)
- **Video**: LiveKit WebRTC
- **Infrastructure**: Kubernetes, Istio, Kong
- **Monitoring**: Prometheus, Grafana, Jaeger

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Kubernetes (minikube or cloud K8s)
- Python 3.11+
- Go 1.21+
- Node.js 20+
- PostgreSQL 16
- Redis 7.2

### Local Development

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Run `docker-compose up -d` for local services
4. Start individual services in development mode

### Deployment

See `k8s/` directory for Kubernetes manifests.

## Documentation

- [SRS](./DevMeet_SRS_v2.md) - Software Requirements Specification
- [API Documentation](./docs/API.md) - API contracts
- [Deployment Guide](./docs/DEPLOYMENT.md) - Deployment instructions

## License

Confidential - Internal Use Only
