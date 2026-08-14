# DevMeet v2.0 — AI-Powered Mock Interview Platform

> Practice technical interviews with an AI interviewer, get scored feedback, execute code live, and track your progress over time.

**Live:** `http://<YOUR_SERVER_IP>` · **Frontend:** `http://<YOUR_SERVER_IP>:3000`  
**Repo:** `github.com/HemanshuTala/devmeet-v2` · **Region:** AWS eu-north-1

---

## Features

- **AI Interviewer** — Streams questions in real-time using Groq LLaMA 3 70B / Mixtral 8x7B via SSE
- **Live Code Execution** — Runs Python, JavaScript, Java, C++, Go, Rust in isolated Docker sandboxes
- **Video Interviews** — WebRTC video/audio rooms powered by LiveKit
- **AI Feedback Reports** — Scores 6 dimensions after each session, generates PDF reports stored in S3
- **Analytics Dashboard** — Score trends, category heatmaps, streak tracking
- **Payments** — Razorpay subscription billing
- **AI Proctoring** — TensorFlow.js face detection + tab-switch monitoring

---

## Architecture

13 microservices + Next.js frontend, running as Docker containers on AWS EC2.

```
Browser → NGINX API Gateway :80
               │
    ┌──────────┼──────────────────────────────────────┐
    │          │                                       │
Auth:8001  Orchestrator:8003 ──► AI Interviewer:8004 ──► Groq Cloud
User:8002  Code Execution:8005 (Docker sandbox)
Admin:8010 Video:8006 ──► LiveKit Cloud
Payment:8012 Feedback:8007 ──► S3 (PDFs)
Notification:8008 ──► AWS SES
Analytics:8009 ◄── Kafka
Search:8013 ──► Elasticsearch
File:8011 ──► S3
               │
    ┌──────────┼──────────┐
    │          │          │
PostgreSQL   Redis    RabbitMQ  Kafka  Elasticsearch
```

---

## Tech Stack

### Backend (13 Microservices)
| Service | Port | Runtime | Key Libraries |
|---------|------|---------|--------------|
| auth-service | 8001 | Python 3.11 / FastAPI | PyJWT, passlib, authlib, pyotp |
| user-service | 8002 | Python 3.11 / FastAPI | asyncpg, redis |
| orchestrator-service | 8003 | Python 3.11 / FastAPI | pika (RabbitMQ), aiokafka |
| ai-interviewer-service | 8004 | Python 3.11 / FastAPI | groq, SSE streaming |
| code-execution-service | 8005 | Python 3.11 / FastAPI | docker SDK, boto3 |
| video-service | 8006 | Node.js 20 | livekit-server-sdk |
| feedback-service | 8007 | Python 3.11 / FastAPI | weasyprint, groq, boto3 |
| notification-service | 8008 | Node.js 20 | ws, aws-sdk (SES) |
| analytics-service | 8009 | Python 3.11 / FastAPI | aiokafka, asyncpg |
| admin-service | 8010 | Python 3.11 / FastAPI | asyncpg |
| file-service | 8011 | Python 3.11 / FastAPI | boto3, Pillow |
| payment-service | 8012 | Python 3.11 / FastAPI | razorpay |
| search-service | 8013 | Python 3.11 / FastAPI | elasticsearch-py |

### Frontend
| Technology | Purpose |
|-----------|---------|
| Next.js 14 (TypeScript) | App framework, routing, SSR |
| TailwindCSS + Radix UI | Styling and components |
| Zustand | Global state management |
| TanStack Query | Server state + caching |
| Monaco Editor | VS Code editor in browser (code interviews) |
| LiveKit Client SDK | WebRTC video/audio |
| TensorFlow.js + MediaPipe | AI proctoring (face detection) |
| Recharts | Analytics charts |
| Framer Motion + GSAP | Animations |

### Infrastructure
| Component | Technology |
|-----------|-----------|
| API Gateway | NGINX (rate limiting, CORS, routing) |
| Primary Database | PostgreSQL 16 |
| Cache + Pub/Sub | Redis 7.2 |
| Task Queue | RabbitMQ 3.12 |
| Event Stream | Kafka 3.6 + Zookeeper |
| Search | Elasticsearch 8.11 |
| File Storage | AWS S3 (`<YOUR_S3_BUCKET_NAME>`, eu-north-1) |
| Email | AWS SES (eu-north-1) |
| Container Registry | AWS ECR (14 repos, eu-north-1) |
| Compute | AWS EC2 `c7i-flex.large` (eu-north-1) |
| CI/CD | GitHub Actions → ECR → EC2 SSH deploy |

---

## Project Structure

```
devmeet-v2/
├── services/                    # 13 microservices
│   ├── auth-service/
│   ├── user-service/
│   ├── orchestrator-service/
│   ├── ai-interviewer-service/
│   ├── code-execution-service/
│   ├── video-service/
│   ├── feedback-service/
│   ├── notification-service/
│   ├── analytics-service/
│   ├── admin-service/
│   ├── file-service/
│   ├── payment-service/
│   ├── search-service/
│   └── api-gateway/             # NGINX config
├── frontend/                    # Next.js 14 app
├── migrations/                  # PostgreSQL schema
├── monitoring/                  # Prometheus config
├── scripts/                     # Deployment scripts
├── Design Architecture/         # System design documentation
├── docker-compose.yml           # Local infra (postgres, redis, etc.)
├── docker-compose.services.yml  # Local services
├── docker-compose.prod.yml      # Production (pulls from ECR)
└── .github/workflows/ci-cd.yml  # CI/CD pipeline
```

---

## Running Locally

### Prerequisites
- Docker Desktop (Windows: move disk image to E: if C: is tight)
- Node.js 20+
- Python 3.11+

### Quick Start

```powershell
# 1. Copy env file and fill in your keys
copy .env.example .env

# 2. Start everything with Docker
docker compose -f docker-compose.yml -f docker-compose.services.yml up -d

# 3. Start frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### Service URLs (local)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:8000 |
| Auth | http://localhost:8001 |
| User | http://localhost:8002 |
| Orchestrator | http://localhost:8003 |
| AI Interviewer | http://localhost:8004 |
| Code Execution | http://localhost:8005 |
| Video | http://localhost:8006 |
| Feedback | http://localhost:8007 |
| Notifications | ws://localhost:8008 |
| Analytics | http://localhost:8009 |
| Admin | http://localhost:8010 |
| Files | http://localhost:8011 |
| Payments | http://localhost:8012 |
| Search | http://localhost:8013 |
| RabbitMQ UI | http://localhost:15672 (guest/guest) |

### Required API Keys (`.env`)

```env
GROQ_API_KEY=           # https://console.groq.com
LIVEKIT_URL=            # https://cloud.livekit.io
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
RAZORPAY_KEY_ID=        # https://dashboard.razorpay.com
RAZORPAY_KEY_SECRET=
GOOGLE_CLIENT_ID=       # https://console.cloud.google.com
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=       # https://github.com/settings/developers
GITHUB_CLIENT_SECRET=
AWS_ACCESS_KEY_ID=      # For S3 and SES
AWS_SECRET_ACCESS_KEY=
```

---

## AWS Deployment

### Production Stack
- **EC2:** `c7i-flex.large` (2 vCPU, 4 GB) — IP `<YOUR_SERVER_IP>`
- **ECR:** 14 Docker image repositories in `eu-north-1`
- **S3:** `<YOUR_S3_BUCKET_NAME>` — avatars, PDF reports, code snapshots
- **SES:** Transactional email from `support@example.com`

### Deploy manually

```bash
# 1. Create ECR repos (once)
bash scripts/setup-ecr.sh

# 2. Build and push images
AWS_REGION=eu-north-1 bash scripts/push-images-ecr.sh

# 3. On EC2 — start the stack
cd /opt/devmeet
export AWS_ACCOUNT_ID=<YOUR_AWS_ACCOUNT_ID>
export IMAGE_TAG=latest
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### Auto-deploy via CI/CD

Every `git push` to `main` automatically:
1. Tests all 13 Python services + 2 Node services + frontend build
2. Builds 15 Docker images and pushes to ECR
3. SSHes into EC2 and restarts the stack with new images

**Required GitHub Secrets:**

| Secret | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | ECR push |
| `AWS_SECRET_ACCESS_KEY` | ECR push |
| `AWS_ACCOUNT_ID` | ECR registry URL |
| `EC2_HOST` | SSH deploy target |
| `EC2_SSH_KEY` | SSH private key |

---

## Interview Types

- **DSA** — Data structures & algorithms with live code execution
- **Behavioral** — STAR-format questions with AI evaluation
- **System Design** — Architecture questions with diagram discussion

---

## Code Execution Sandbox

- Supports 7 languages: Python, JavaScript, TypeScript, Java, C++, Go, Rust
- Isolated Docker container per execution: no network, memory capped at 512 MB, 10s timeout
- Results uploaded to S3 as code snapshots

---

## AI Feedback (6 Dimensions)

After each session, Groq LLM scores:
1. Technical Accuracy
2. Problem Solving Approach
3. Code Quality
4. Communication Clarity
5. Time Management
6. Overall Performance

PDF report generated via WeasyPrint and stored in S3.

---

## Security

- JWT authentication (HS256, 60 min access / 7 day refresh)
- TOTP MFA support
- Rate limiting at NGINX: 30 req/s general, 5 req/min auth, 10 req/min code exec
- RBAC (user / admin roles)
- bcrypt password hashing (cost 12)

---

## Health Checks

```bash
# API Gateway
curl http://<YOUR_SERVER_IP>/health

# All services (run on EC2)
for port in 8001 8002 8003 8004 8005 8007 8009 8010 8011 8012 8013; do
  echo -n "Port $port: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health
  echo ""
done
```

---

## License

Private — DevMeet v2.0 © 2026 HemanshuTala
