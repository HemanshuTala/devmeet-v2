# DevMeet Production Configuration & Deployment Guide

This guide details all environment configurations, service-mesh bindings, and third-party integrations required to deploy the **DevMeet v2.0** microservice fleet to a production environment. 

---

## 1. Core Architectural Layout

DevMeet uses a **Unified Nginx API Gateway** on port `80` (production) or `8000` (development/staging) to handle CORS, SSL termination, and reverse-proxying to 13 separate services running in an isolated network namespace.

### Service Route & Port Registry

| Service Path Prefix | Internal Service URL | Internal Port | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth` | `http://auth-service:8001` | `8001` | OAuth2, Multi-Factor Auth, backups |
| `/api/v1/users` | `http://user-service:8002` | `8002` | User Profile, GDPR Erasure/Export |
| `/api/v1/sessions` | `http://orchestrator-service:8003` | `8003` | Session workflow, Redis Locking |
| `/api/v1/interview` | `http://ai-interviewer-service:8004` | `8004` | Llama 3 prompts, injection scanner |
| `/api/v1/execute` | `http://code-execution-service:8005` | `8005` | Sandboxed compiler & AST scanner |
| `/api/v1/video` | `http://video-service:8006` | `8006` | LiveKit JWT token generator |
| `/api/v1/feedback` | `http://feedback-service:8007` | `8007` | WeasyPrint feedback PDF compiler |
| `/api/v1/notifications` | `http://notification-service:8008` | `8008` | WebSocket pushes & AWS SES client |
| `/api/v1/analytics` | `http://analytics-service:8009` | `8009` | Analytics DB schema telemetry |
| `/api/v1/admin` | `http://admin-service:8010` | `8010` | Audit logging, account locks |
| `/api/v1/files` | `http://file-service:8011` | `8011` | Presigned uploads, AWS S3 integrations |
| `/api/v1/payments` | `http://payment-service:8012` | `8012` | Stripe checkout and webhooks |
| `/api/v1/search` | `http://search-service:8013` | `8013` | Elasticsearch question matching |

---

## 2. Infrastructure API Key Catalog

The platform operates self-healing fallback handlers: if an external key is empty, the service uses a mock adapter (e.g. mock S3 local directories, console-printed emails, fake Stripe webhooks, local string-similarity queries).

For a real-world cloud deployment, fill the following environment variables:

### 2.1 AI Interviewer Service (Port 8004)
To maximize rate limits, the service rotates through up to 5 separate Groq Llama 3 API keys:
- `GROQ_API_KEY`: Primary API key from Groq.
- `GROQ_API_KEY_2` to `GROQ_API_KEY_5`: (Optional) Additional keys for key rotation.

### 2.2 Code Execution Sandbox Service (Port 8005)
The sandbox isolates executions locally. No external APIs are required, but it utilizes a shared RabbitMQ node:
- `RABBITMQ_HOST`: `rabbitmq`
- `RABBITMQ_PORT`: `5672`

### 2.3 LiveKit WebRTC Video Service (Port 8006)
Used to provision temporary RTC participant tokens for candidates and AI agents:
- `LIVEKIT_URL`: Production LiveKit instance host (e.g., `wss://livekit.devmeet.com`)
- `LIVEKIT_API_KEY`: LiveKit developer API Key
- `LIVEKIT_API_SECRET`: LiveKit developer Secret

### 2.4 Stripe Payment Service (Port 8012)
Handles subscriptions and premium upgrades:
- `STRIPE_SECRET_KEY`: Production secret key from Stripe dashboard.
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret generated when pointing Stripe hooks to `/api/v1/payments/webhook`.

### 2.5 AWS Integrations (S3 & SES)
Used by **Feedback Service** (8007), **Notification Service** (8008), **Admin Service** (8010), and **File Service** (8011):
- `AWS_ACCESS_KEY_ID`: IAM user credentials.
- `AWS_SECRET_ACCESS_KEY`: IAM user secret credentials.
- `AWS_REGION`: Target region (e.g., `us-east-1`).
- `S3_BUCKET`: Target S3 bucket (e.g. `devmeet-production-files`).
- `SES_FROM_EMAIL`: Verified sender address in AWS SES console (e.g. `noreply@devmeet.com`).

---

## 3. High-Availability Kubernetes Provisioning

Deploy the services to a secure private namespace `devmeet`. In Kubernetes, the client frontend communicates directly with the **Nginx Ingress Controller** which maps request paths onto the gateway service:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devmeet-ingress
  namespace: devmeet
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/enable-cors: "true"
spec:
  rules:
  - host: api.devmeet.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 8000
```

Deploy monitoring using the manifests under `k8s/monitoring/` to automatically monitor service health, memory leaks, and SLO thresholds.
