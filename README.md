# DevMeet v2.0 — AI-Powered Technical Interview Platform

An adaptive, microservices-based AI interviewing platform engineered to simulate technical hiring workflows. DevMeet combines real-time LLM token streaming, client-side AI proctoring, sandboxed multi-language code execution, and automated 6-dimensional feedback evaluation.

---

## Technical Highlights

- **Adaptive AI Interviewer**: Real-time response streaming over Server-Sent Events (SSE) using Groq (LLaMA 3.3 70B & Mixtral). Includes automated multi-key rotation and multi-model fallback routines for zero-downtime streaming.
- **Dual Speech Recognition**: Browser-native Web Speech API for instant client-side voice-to-text, paired with a Groq Whisper REST fallback.
- **Edge AI Proctoring**: In-browser computer vision models (MediaPipe + TensorFlow.js) with 0ms camera startup to detect gaze deviation, face count, and device presence without backend GPU overhead.
- **Sandboxed Code Execution**: Executes solutions in Python, JavaScript, C++, Java, Go, and Rust inside ephemeral Docker containers with CPU/RAM quotas, execution timeouts, and network isolation (`--network none`).
- **6D Evaluation & PDF Reports**: Scores candidate performance across Problem Solving, Code Quality, System Architecture, STAR Behavioral Framework, Communication, and Edge Case Handling. Generates downloadable PDF reports stored in AWS S3.
- **Payments & Subscriptions**: Integrated Razorpay checkout workflow for plan management, order creation, and webhooks verification.

---

## Microservices Architecture

DevMeet v2.0 is built on 13 domain microservices orchestrated with Docker Compose on AWS EC2 behind an Nginx Layer 7 API Gateway.

```
Candidate Browser ──► Nginx API Gateway (:80)
                             │
     ┌───────────────────────┼─────────────────────────────────────────┐
     │                       │                                         │
Auth (:8001)           Orchestrator (:8003) ──► AI Interviewer (:8004) ──► Groq Cloud
User (:8002)           Code Execution (:8005, Docker sandbox)
Admin (:8010)          Video (:8006) ───────► LiveKit Cloud
Payment (:8012)        Feedback (:8007) ────► AWS S3 (PDFs)
Notification (:8008)   Analytics (:8009) ───◄ Kafka
File (:8011)           Search (:8013) ──────► Elasticsearch
```

### Microservices Directory

| Service | Port | Tech Stack | Primary Responsibility |
|---|:---:|---|---|
| `api-gateway` | 80 | Nginx | Reverse proxy, path routing, rate limiting, CORS management |
| `auth-service` | 8001 | FastAPI / Python | JWT authentication, RBAC, OAuth, password security |
| `user-service` | 8002 | FastAPI / Python | Profile management, user state, privacy controls, quotas |
| `orchestrator-service` | 8003 | FastAPI / Python | Interview state machine, session lifecycle, message bus events |
| `ai-interviewer-service` | 8004 | FastAPI / Python | Groq LLaMA 3.3 token streaming, key rotation, SSE generator |
| `code-execution-service` | 8005 | FastAPI / Docker | Isolated multi-language sandbox execution engine |
| `video-service` | 8006 | Express / Node.js | LiveKit WebRTC room token allocation & coordination |
| `feedback-service` | 8007 | FastAPI / WeasyPrint | 6D scoring evaluation, PDF report generation, S3 storage |
| `notification-service` | 8008 | Node.js / WebSockets | Live WebSocket notifications & AWS SES email dispatch |
| `analytics-service` | 8009 | FastAPI / Kafka | Candidate score trends, category metrics, telemetry stream |
| `admin-service` | 8010 | FastAPI / Python | System health monitoring, user administration, logs |
| `file-service` | 8011 | FastAPI / boto3 | Image uploads, avatar processing, AWS S3 presigned URLs |
| `payment-service` | 8012 | FastAPI / Razorpay | Subscription plans, Razorpay orders & webhook verification |
| `search-service` | 8013 | FastAPI / Elasticsearch | Question bank fuzzy search & transcript indexing |

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router, TypeScript), Tailwind CSS, Monaco Editor, Zustand, TanStack Query, Framer Motion, Web Speech API, MediaPipe, TensorFlow.js.
- **Backend**: FastAPI (Python 3.11), Express (Node.js 20), Uvicorn, AsyncIO.
- **Database & Cache**: PostgreSQL 16 (shared instance with per-service logical schemas), Redis 7.2.
- **Message Bus & Search**: RabbitMQ 3.12 (task queues), Apache Kafka 3.6 (telemetry log stream), Elasticsearch 8.11 (search).
- **Cloud Infrastructure**: AWS EC2 (`c7i-flex.large`), AWS ECR, AWS S3, AWS SES, Nginx API Gateway.

---

## Repository Layout

```
devmeet-v2/
├── services/                    # 13 Independent Microservices
│   ├── api-gateway/             # Nginx reverse proxy configuration
│   ├── auth-service/            # Authentication & JWT management
│   ├── orchestrator-service/    # Interview state engine
│   ├── ai-interviewer-service/  # Groq SSE token streaming service
│   ├── code-execution-service/  # Isolated Docker sandbox runner
│   ├── feedback-service/        # PDF generation & evaluation service
│   ├── payment-service/         # Razorpay checkout & webhooks
│   └── ...                      # Additional microservices
├── frontend/                    # Next.js 14 Web Application
├── migrations/                  # PostgreSQL schema initialization
├── Design Architecture/         # LLD / HLD System Design Documentation
├── docker-compose.yml           # Core infrastructure stack
├── docker-compose.services.yml  # Microservices stack
└── docker-compose.prod.yml      # Production stack configuration
```

---

## Quick Start (Local Development)

### Prerequisites
- Docker Desktop (v24.0+)
- Node.js (v20+)
- Python (v3.11+)

### Environment Setup & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/HemanshuTala/devmeet-v2.git
   cd devmeet-v2
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Start backend services and infrastructure:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.services.yml up -d
   ```

4. **Start the Next.js frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Access the frontend application at **`http://localhost:3000`**.

---

## Deployment & CI/CD

Production deployment is automated via GitHub Actions (`.github/workflows/ci-cd.yml`):
1. Builds Docker container images for all microservices and the Next.js application.
2. Pushes container images to **AWS ECR** (`eu-north-1`).
3. Connects to **AWS EC2** via SSH to pull updated images and restart containers via Docker Compose.
