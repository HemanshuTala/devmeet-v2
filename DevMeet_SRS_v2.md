**DevMeet**

AI-Powered Mock Interview Platform

**SOFTWARE REQUIREMENTS SPECIFICATION**

Version 2.0 \| Distributed Microservices Edition

Groq LLM API + FastAPI + Next.js + PostgreSQL + Redis + Kubernetes

  --------------------------------- -----------------------------------------
  **Document Title**                DevMeet SRS

  **Version**                       2.0

  **Author**                        Hemanshu Tala

  **Status**                        Draft --- Internal Review

  **Classification**                **Confidential**

  **AI Provider**                   Groq Cloud API (LLaMA 3, Mixtral)

  **Architecture**                  Distributed Microservices on Kubernetes
  --------------------------------- -----------------------------------------

**1. Introduction**

**1.1 Purpose**

This Software Requirements Specification (SRS) documents all functional requirements, non-functional requirements, architectural decisions, database schemas, API contracts, edge case handling, deployment topology, and operational concerns for DevMeet --- an AI-powered mock interview platform built on a fully distributed microservices architecture.

This document is the authoritative source of truth for developers, architects, QA engineers, DevOps engineers, product stakeholders, and security reviewers contributing to or evaluating DevMeet.

**1.2 Product Overview**

DevMeet enables software engineering candidates to practice technical interviews with an AI interviewer powered by Groq Cloud API (LLaMA 3 / Mixtral models). The platform provides real-time adaptive questioning, a sandboxed code execution environment, WebRTC-based video simulation, structured behavioral practice, system design evaluation, and data-rich performance analytics.

**1.3 Intended Audience**

  -----------------------------------------------------------------------
  **Audience**                        **Relevant Sections**
  ----------------------------------- -----------------------------------
  Backend Engineers                   4, 5, 6, 7, 8, 10

  Frontend Engineers                  4, 5, 9

  DevOps / SRE                        11, 12, 13

  Security Engineers                  8, 11

  QA Engineers                        4, 8, 14

  Product & Stakeholders              1, 2, 3, 15

  Database Administrators             7
  -----------------------------------------------------------------------

**1.4 Scope**

DevMeet v2.0 covers the following capabilities:

-   DSA (Data Structures & Algorithms) interview simulation with Groq AI evaluation

-   Behavioral (STAR-method) interview practice with sentiment scoring

-   System design interview with diagram hints and AI scoring rubrics

-   Real-time sandboxed multi-language code execution (Python, Java, C++, Go, JavaScript)

-   WebRTC video/audio interview room with LiveKit media server

-   AI feedback report generation with exportable PDF

-   Subscription management: Free, Pro, Enterprise tiers

-   Admin console for user management, session monitoring, system health

-   Fully distributed, horizontally scalable Kubernetes deployment

**1.5 Definitions, Acronyms & Abbreviations**

  ------------------------------------------------------------------------------------------
  **Term**           **Definition**
  ------------------ -----------------------------------------------------------------------
  SRS                Software Requirements Specification

  API GW             API Gateway --- single entry point routing to microservices

  Groq API           Groq Cloud LLM inference API (LLaMA 3, Mixtral models)

  LLM                Large Language Model --- AI model generating interview content

  SSE                Server-Sent Events --- unidirectional streaming from server to client

  WebRTC             Web Real-Time Communication --- peer-to-peer audio/video protocol

  JWT                JSON Web Token --- stateless authentication token

  RBAC               Role-Based Access Control

  DLQ                Dead Letter Queue --- queue for failed message processing

  CDC                Change Data Capture --- streaming DB changes to consumers

  HPA                Horizontal Pod Autoscaler --- Kubernetes auto-scaling

  MTTR               Mean Time To Recovery

  MTBF               Mean Time Between Failures

  RTO                Recovery Time Objective

  RPO                Recovery Point Objective

  PII                Personally Identifiable Information

  OWASP              Open Web Application Security Project

  WAF                Web Application Firewall

  mTLS               Mutual TLS --- bidirectional certificate-based encryption

  SLO                Service Level Objective

  SLI                Service Level Indicator
  ------------------------------------------------------------------------------------------

**2. Stakeholders & User Personas**

**2.1 User Roles**

  -----------------------------------------------------------------------------------------------------------
  **Role**          **Permissions**                                                      **Access Level**
  ----------------- -------------------------------------------------------------------- --------------------
  Guest             View landing page, see feature list, register/login                  Public

  Free User         3 interviews/month, basic feedback, no video                         Tier 1

  Pro User          Unlimited interviews, video room, PDF export, all modes              Tier 2

  Enterprise User   Team management, custom question banks, analytics export             Tier 3

  Admin             Full system access, user management, session monitoring, analytics   Internal

  Super Admin       Infrastructure config, billing, role assignment                      Internal
  -----------------------------------------------------------------------------------------------------------

**2.2 Primary User Persona**

Priya, 23 --- Computer Science graduate preparing for FAANG interviews. She uses DevMeet 4-5 times per week to practice LeetCode-style DSA problems, wants detailed feedback on time/space complexity, and needs confidence building via behavioral practice.

**2.3 Secondary User Persona**

Raj, 29 --- Senior Software Engineer targeting Staff-level roles. Uses DevMeet for system design simulations, needs AI to challenge architectural decisions, and wants performance trend analytics over 3 months.

**3. System Architecture**

**3.1 Architecture Overview**

DevMeet is architected as a fully distributed microservices system. Each service owns its bounded context, its data store, and is independently deployable and scalable. Services communicate through a combination of synchronous REST/gRPC calls (via the API Gateway) and asynchronous event-driven messaging (via RabbitMQ / Kafka).

**3.2 Service Catalog**

  --------------------------------------------------------------------------------------------------------------------------------------------
  **Service Name**         **Technology**            **Port**      **Responsibility**                                        **Scales On**
  ------------------------ ------------------------- ------------- --------------------------------------------------------- -----------------
  API Gateway              Kong / Nginx + Lua        443 (HTTPS)   Routing, auth enforcement, rate limiting, WAF             Request rate

  Auth Service             FastAPI (Python)          8001          Registration, login, JWT, OAuth2, RBAC                    CPU

  User Service             FastAPI (Python)          8002          Profile, preferences, subscription, quota management      CPU

  Interview Orchestrator   FastAPI (Python)          8003          Session lifecycle, state machine, question routing        Session count

  AI Interviewer Service   FastAPI (Python)          8004          Groq API integration, prompt engineering, streaming SSE   LLM concurrency

  Code Execution Service   Go                        8005          Sandboxed Docker runner, multi-language judge             Queue depth

  Video Service            Node.js + LiveKit SDK     8006          WebRTC room management, TURN relay                        Video rooms

  Feedback Service         FastAPI (Python)          8007          AI-generated feedback, scoring, PDF generation            Job queue

  Notification Service     Node.js                   8008          Email (SES), in-app push (WebSockets)                     Message queue

  Analytics Service        FastAPI (Python)          8009          Metrics aggregation, trend analysis, reporting            CPU / DB reads

  Admin Service            FastAPI (Python)          8010          User management, audit logs, system monitoring            Low

  File Service             FastAPI (Python)          8011          S3 upload/download, PDF export, audio storage             IO bound

  Payment Service          FastAPI (Python)          8012          Stripe integration, subscription lifecycle, billing       Low

  Search Service           FastAPI + Elasticsearch   8013          Question bank search, semantic question retrieval         Query rate
  --------------------------------------------------------------------------------------------------------------------------------------------

**3.3 Communication Patterns**

**3.3.1 Synchronous (REST over HTTPS)**

-   Client → API Gateway → Target Service (all user-facing requests)

-   Auth validation via JWT introspection at the gateway layer

-   Inter-service calls use internal Kubernetes DNS: http://auth-service:8001

-   All internal communication uses mTLS with service mesh (Istio)

**3.3.2 Asynchronous (Event-Driven)**

-   RabbitMQ for task queues: code execution jobs, feedback generation, notifications

-   Kafka for event streaming: session events, audit logs, analytics pipeline

-   Dead Letter Queues (DLQ) for all consumer failures with retry backoff

-   Event schema versioning using Avro with Schema Registry

**3.4 Data Flow --- Interview Session**

The following describes the complete data flow for a standard AI interview session:

1.  User authenticates → Auth Service issues JWT (access: 15min, refresh: 7 days)

2.  Client calls POST /api/v1/sessions → Interview Orchestrator creates session record, initializes state machine (CREATED state)

3.  Orchestrator fetches first question from Search Service (semantic retrieval from Elasticsearch question bank)

4.  Session state moves to ACTIVE; session metadata cached in Redis with 4-hour TTL

5.  Client opens SSE connection to AI Interviewer Service: GET /api/v1/ai/stream/{session_id}

6.  AI Interviewer Service builds system prompt + conversation history, calls Groq API (streaming mode)

7.  Groq tokens stream back via SSE → client renders AI speech in real time

8.  User submits code → Code Execution Service queues Docker job via RabbitMQ

9.  Code result returned; AI Interviewer evaluates against expected output + complexity

10. Session ends → Orchestrator emits SessionCompleted event to Kafka

11. Feedback Service consumes event → calls Groq API for detailed feedback → stores report → publishes to S3

12. Notification Service sends email with PDF link via SES

**3.5 Infrastructure Components**

  ---------------------------------------------------------------------------------------------------------------------
  **Component**             **Technology**                                  **Purpose**
  ------------------------- ----------------------------------------------- -------------------------------------------
  Container Orchestration   Kubernetes (K8s) 1.29+                          Service deployment, scaling, self-healing

  Service Mesh              Istio                                           mTLS, traffic management, observability

  API Gateway               Kong OSS                                        Routing, rate limiting, plugins

  Message Broker            RabbitMQ 3.12 + Kafka 3.6                       Task queues + event streaming

  Schema Registry           Confluent Schema Registry                       Avro schema versioning for Kafka

  Primary Database          PostgreSQL 16 (RDS)                             Transactional data, ACID compliance

  Cache / Sessions          Redis 7.2 Cluster                               Session state, rate limiting, pub/sub

  Search Engine             Elasticsearch 8.x                               Question bank, semantic search

  Object Storage            AWS S3 / MinIO                                  PDFs, audio recordings, code snapshots

  CDN                       CloudFront / Cloudflare                         Static assets, frontend delivery

  Secrets Management        HashiCorp Vault                                 API keys, DB credentials, certs

  Container Registry        AWS ECR / GitHub Container Registry             Docker image storage

  CI/CD                     GitHub Actions + ArgoCD                         Build, test, deploy pipeline

  Monitoring                Prometheus + Grafana + Alertmanager             Metrics, dashboards, alerts

  Distributed Tracing       Jaeger / OpenTelemetry                          Request tracing across services

  Log Aggregation           ELK Stack (Elasticsearch + Logstash + Kibana)   Centralized logging

  Vulnerability Scanning    Trivy + Snyk                                    Container and dependency scanning

  WAF                       AWS WAF / Cloudflare WAF                        OWASP Top 10 protection
  ---------------------------------------------------------------------------------------------------------------------

**4. Functional Requirements**

**4.1 Authentication & Authorization**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**    **Requirement**                                                           **Priority**   **Edge Cases Handled**
  --------- ------------------------------------------------------------------------- -------------- ----------------------------------------------------------
  AUTH-01   Email/password registration with bcrypt hashing (cost factor 12)          Critical       Duplicate email, weak password, email format validation

  AUTH-02   Google OAuth2 login (PKCE flow)                                           High           Account merge if email exists, OAuth token expiry

  AUTH-03   GitHub OAuth2 login                                                       Medium         No public email fallback to private email prompt

  AUTH-04   JWT access token (15 min TTL) + refresh token (7 days, HttpOnly cookie)   Critical       Token rotation on refresh, refresh token reuse detection

  AUTH-05   RBAC enforcement at API Gateway + service level                           Critical       Missing role claim defaults to lowest privilege

  AUTH-06   Email verification on registration (OTP via SES, expires 24h)             High           Resend cooldown 60s, max 5 resends/day

  AUTH-07   Password reset via email token (expires 1h, single use)                   High           Token invalidated after use, rate limit 3/hour

  AUTH-08   Account lockout after 5 failed login attempts (unlock after 15 min)       High           Lockout bypassed by OAuth --- tracked separately

  AUTH-09   Multi-Factor Authentication via TOTP (Google Authenticator)               Medium         Backup codes (8), rate limit OTP attempts

  AUTH-10   Session revocation --- invalidate all refresh tokens on password change   High           Redis token family invalidation

  AUTH-11   Admin impersonation of users for support (audit logged)                   Medium         Immutable audit trail, cannot impersonate other admins

  AUTH-12   IP-based suspicious login detection (new country → notification)          Low            GeoIP lookup with fallback to user confirmation
  -------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.2 User Management**

  -------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**    **Requirement**                                                     **Priority**   **Edge Cases Handled**
  --------- ------------------------------------------------------------------- -------------- ----------------------------------------------------------
  USER-01   User profile: display name, avatar, bio, target companies, skills   High           Avatar: max 5MB, JPEG/PNG only, virus scanned via ClamAV

  USER-02   Subscription tier management (Free → Pro → Enterprise)              Critical       Downgrade at billing cycle end, no mid-cycle downgrade

  USER-03   Interview quota enforcement per tier and per day                    Critical       Quota checked before session creation, not after

  USER-04   Account deletion (soft delete, data anonymized after 30 days)       High           GDPR compliance, cascade cancel active sessions

  USER-05   Data export (GDPR Article 20) --- JSON download within 48h          High           Background job, email link, expires 24h

  USER-06   Profile visibility settings (public/private for leaderboard)        Low            Default private, explicit opt-in required
  -------------------------------------------------------------------------------------------------------------------------------------------------------

**4.3 Interview Session Management**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**    **Requirement**                                                                                          **Priority**   **Edge Cases Handled**
  --------- -------------------------------------------------------------------------------------------------------- -------------- -------------------------------------------------------------------
  SESS-01   Create interview session: mode (DSA/Behavioral/System Design), difficulty (Easy/Medium/Hard), language   Critical       Concurrent session limit per user (1 active), quota check

  SESS-02   Session state machine: CREATED → ACTIVE → PAUSED → COMPLETED → REVIEWED                                  Critical       Invalid transitions rejected with 409 Conflict

  SESS-03   Session persistence in Redis (4h TTL) + PostgreSQL (permanent)                                           Critical       Redis eviction triggers DB reload on next request

  SESS-04   Pause/resume with max 30-minute pause window                                                             High           Auto-expire to COMPLETED on pause timeout

  SESS-05   Graceful session recovery on network disconnect (30s reconnect window)                                   High           WebSocket reconnect with session token, state restored from Redis

  SESS-06   Browser refresh / tab close detection via Page Visibility API + heartbeat                                High           15s heartbeat; 3 missed = warn user; 5 missed = session pause

  SESS-07   Concurrent session prevention --- reject new session if one active                                       Critical       Race condition handled with Redis distributed lock (Redlock)

  SESS-08   Session history with replay capability (view questions + answers)                                        Medium         S3 storage for conversation snapshots
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.4 AI Interviewer Service (Groq API Integration)**

+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **Groq API Provider**                                                                                                                                                                                                                                      |
|                                                                                                                                                                                                                                                            |
| DevMeet uses Groq Cloud API for ultra-low-latency LLM inference. Primary model: llama3-70b-8192. Fallback model: mixtral-8x7b-32768. Groq\'s hardware-accelerated inference achieves \<500ms first token latency, enabling real-time interview simulation. |
+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Requirement**                                                                                                                                **Priority**   **Edge Cases Handled**
  -------- ---------------------------------------------------------------------------------------------------------------------------------------------- -------------- -----------------------------------------------------------------------------------------------
  AI-01    System prompt construction with: role definition, interview mode, difficulty, candidate profile, question bank context, conversation history   Critical       Prompt token limit exceeded → sliding window history (keep last 8 exchanges)

  AI-02    Streaming response via Groq streaming API → SSE to client                                                                                      Critical       Client disconnect mid-stream → server cancels Groq request, cleans up

  AI-03    Adaptive questioning: analyzes previous answer quality (0-10 score) before selecting next question difficulty                                  High           Answer not received in 3min → AI nudges; 5min → marks unanswered

  AI-04    Groq API rate limit handling: exponential backoff (1s, 2s, 4s, 8s), max 3 retries                                                              Critical       All retries exhausted → fallback to Mixtral; if both fail → graceful error with session pause

  AI-05    Groq API key rotation: multiple keys in Vault, round-robin with per-key rate tracking                                                          High           Key exhausted → removed from rotation, Slack alert fired

  AI-06    Prompt injection detection: user input sanitized, deny-listed patterns blocked before sending to Groq                                          Critical       Blocked input → warning to user, incident logged, 3 violations → session terminated

  AI-07    Context window management: llama3-70b supports 8192 tokens; conversation pruned to fit                                                         Critical       Pruning strategy: keep system prompt + last 6 exchanges + current question

  AI-08    AI response validation: structured output parsing, JSON schema validation for scoring responses                                                High           Malformed JSON from Groq → retry with explicit JSON format instruction

  AI-09    DSA hint generation: 3-level hint system (conceptual → approach → pseudocode)                                                                  High           Hint level gated by Pro tier; hint usage tracked for feedback penalty

  AI-10    Behavioral interview: STAR method extraction from user response, sentiment scoring                                                             High           Empty or one-word response → AI prompts for elaboration (max 2 prompts)

  AI-11    System design: AI presents scenario, evaluates components mentioned, probes for scalability reasoning                                          High           No diagram tool in v2.0; text-only evaluation with component checklist

  AI-12    Groq cost tracking: token usage logged per session for billing analytics                                                                       Medium         Anomalous usage (\>100K tokens/session) → alert + session review
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.5 Code Execution Engine**

+-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **Security Model**                                                                                                                                                                                                          |
|                                                                                                                                                                                                                             |
| Each code execution runs in an isolated Docker container with: no network access, read-only filesystem, 256MB memory cap, 1 CPU cap, 10s execution timeout, non-root user. Container destroyed immediately after execution. |
+-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**    **Requirement**                                                                                         **Priority**   **Edge Cases Handled**
  --------- ------------------------------------------------------------------------------------------------------- -------------- -----------------------------------------------------------------------
  CODE-01   Monaco Editor integration: syntax highlighting, IntelliSense, vim/emacs keybindings                     High           Large file paste (\>50KB) → truncated with warning

  CODE-02   Supported languages: Python 3.11, Java 17, C++ 17, Go 1.21, JavaScript (Node 20), TypeScript            Critical       Unknown language → 400 with supported language list

  CODE-03   Docker-sandboxed execution: nsjail + seccomp syscall filtering                                          Critical       Fork bomb, infinite loop, memory exhaustion --- all capped by cgroups

  CODE-04   Execution timeout: 10 seconds hard limit (SIGKILL on breach)                                            Critical       Timeout message returned with partial stdout if available

  CODE-05   Resource limits: 256MB RAM, 1 CPU, no network, no filesystem write outside /tmp                         Critical       OOM kill detected → specific error: \'Memory limit exceeded\'

  CODE-06   Test case runner: hidden test cases (0-10), visible test cases (2-3)                                    High           Test case timeout each 5s, total execution timeout 30s

  CODE-07   Code submission queue via RabbitMQ: max queue depth 1000, backpressure on overflow                      High           Queue full → 503 with retry-after header, client shows estimated wait

  CODE-08   Code execution result: stdout, stderr, exit code, execution time (ms), memory used (KB)                 High           Binary output truncated at 64KB, binary detection prevents display

  CODE-09   Code snapshot persistence: all submitted code saved to S3 for session replay and plagiarism detection   Medium         S3 upload failure → retry 3x, non-blocking to user

  CODE-10   Anti-cheat: code similarity detection across sessions using Jaccard similarity (flag if \>80%)          Low            False positive appeals handled by admin review
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.6 Video Interview Service**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Requirement**                                                                      **Priority**   **Edge Cases Handled**
  -------- ------------------------------------------------------------------------------------ -------------- ----------------------------------------------------------------------
  VID-01   LiveKit-managed WebRTC rooms: 1:1 video (user + AI avatar or recording)              High           Room creation fails → retry 3x, fallback to audio-only mode

  VID-02   Camera/microphone permission check before room join (explicit user grant)            High           Permission denied → guided instructions per browser/OS

  VID-03   TURN server relay for users behind strict NAT (Coturn self-hosted)                   High           TURN failure → STUN fallback, connectivity test result shown to user

  VID-04   Network quality indicator: packet loss %, latency, bandwidth displayed to user       Medium         Poor connection (\<1Mbps) → suggest audio-only mode

  VID-05   Recording toggle: user can opt-in to record session video to S3 (consent required)   Medium         Recording limited to Pro tier; consent stored with session record

  VID-06   Background blur using TFLite model in-browser (no server processing)                 Low            Low-end device fallback: disable background blur automatically

  VID-07   Video room auto-close on session COMPLETED or 5-minute inactivity                    High           Tracks participants; room closed when all leave or timeout
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.7 Feedback & Reporting Service**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**    **Requirement**                                                                                                      **Priority**   **Edge Cases Handled**
  --------- -------------------------------------------------------------------------------------------------------------------- -------------- -----------------------------------------------------------------
  FEED-01   AI-generated feedback report: scores for communication, problem-solving, code quality, time complexity, behavioral   Critical       Groq API failure → retry queue, partial feedback if timeout

  FEED-02   Scoring rubric per mode: DSA (0-100), Behavioral (0-100), System Design (0-100)                                      Critical       Score normalization across difficulty levels

  FEED-03   Detailed question-by-question breakdown with AI commentary                                                           High           No answer provided → score 0, AI note: \'Question unanswered\'

  FEED-04   PDF report generation using WeasyPrint: branded template, charts, code snippets                                      High           PDF generation timeout (30s) → background job, email when ready

  FEED-05   PDF stored in S3 with pre-signed URL (expires 7 days)                                                                High           URL expired → regenerate on demand, rate limit 10/day

  FEED-06   Feedback available within 60 seconds of session completion (SLO)                                                     High           SLO breach → alert, Groq priority queue escalation

  FEED-07   Comparative feedback: percentile rank against anonymized peer scores                                                 Medium         Insufficient sample (\<100 sessions) → skip percentile display
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.8 Analytics & Dashboard**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **ID**    **Requirement**                                                              **Priority**   **Edge Cases Handled**
  --------- ---------------------------------------------------------------------------- -------------- ----------------------------------------------------------------------------
  DASH-01   Performance trend chart: scores over last 30/90 days                         High           No sessions in period → empty state with CTA

  DASH-02   Skill radar chart: per-category scores across all sessions                   High           Single session → radar shows but note: \'More sessions needed for trends\'

  DASH-03   Streaks and consistency tracking: daily/weekly interview frequency           Medium         Timezone-aware; streak calculated in user\'s local timezone

  DASH-04   Company-specific preparation: filter sessions by target company tags         Medium         Tag synonyms handled (e.g. \'Google\' = \'Alphabet\')

  DASH-05   Problem category heatmap: performance by topic (trees, DP, graphs, etc.)     Medium         Topics auto-tagged by AI Interviewer; fallback to keyword extraction

  DASH-06   Analytics export (CSV) for Pro users                                         Low            Rate limited: 1 export/hour, max 6 months of data

  DASH-07   Admin analytics: DAU, MAU, session success rate, Groq API cost per session   High           Aggregated from Kafka events via analytics service
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**5. Non-Functional Requirements**

**5.1 Performance SLOs**

  ------------------------------------------------------------------------------------------------------------
  **Metric**                           **Target**      **Measurement Method**            **Alert Threshold**
  ------------------------------------ --------------- --------------------------------- ---------------------
  API Gateway P50 Latency              \< 50ms         Prometheus histogram              \> 100ms

  API Gateway P99 Latency              \< 300ms        Prometheus histogram              \> 500ms

  Groq First Token Latency             \< 500ms        Custom SSE metric                 \> 1s

  Code Execution Latency               \< 5s (P90)     RabbitMQ job timer                \> 8s

  Session Creation Time                \< 200ms        Service trace span                \> 400ms

  Feedback Generation Time             \< 60s (SLO)    Kafka event timestamp delta       \> 90s

  PDF Export Time                      \< 30s          Background job timer              \> 45s

  Frontend Time to Interactive (TTI)   \< 2.5s on 4G   Lighthouse CI in GitHub Actions   \> 4s

  WebRTC Room Join Time                \< 3s           Client-side SDK metric            \> 5s
  ------------------------------------------------------------------------------------------------------------

**5.2 Reliability & Availability**

  -----------------------------------------------------------------------------------------------------------------------
  **Requirement**                  **Target**                     **Mechanism**
  -------------------------------- ------------------------------ -------------------------------------------------------
  System Uptime                    99.5% monthly                  Multi-AZ Kubernetes, automated failover

  Auth Service Uptime              99.9% monthly                  3 replicas minimum, priority HPA

  RTO (Recovery Time Objective)    \< 15 minutes                  Automated K8s pod restart, runbook automation

  RPO (Recovery Point Objective)   \< 1 hour                      Continuous WAL streaming to S3, hourly RDS snapshots

  Groq API Availability Fallback   Mixtral on Groq as secondary   Automatic failover, no manual intervention

  Database Failover                \< 30s                         RDS Multi-AZ with automatic promotion

  Redis Failover                   \< 10s                         Redis Sentinel / Cluster mode with automatic failover

  Message Queue Durability         No message loss                RabbitMQ durable queues + Kafka replication factor 3
  -----------------------------------------------------------------------------------------------------------------------

**5.3 Scalability**

-   Stateless services scale horizontally --- HPA triggers on CPU \> 70% or custom metrics

-   Minimum replicas per service: Auth=3, Interview Orchestrator=2, AI Interviewer=5, Code Execution=5

-   Code Execution Service: 50 concurrent Docker containers per pod, 10 pods max = 500 concurrent executions

-   Groq API concurrency: Groq supports high throughput; key rotation distributes load across 5 API keys

-   Database read replicas: 2 PostgreSQL read replicas for analytics queries

-   Redis Cluster: 6 nodes (3 primary + 3 replica) for horizontal cache scaling

-   Kafka: 3 brokers, 6 partitions per topic, replication factor 3

-   Target: 500 concurrent active interview sessions without performance degradation

**5.4 Security Requirements**

  ------------------------------------------------------------------------------------------------------------------------
  **Area**                  **Requirement**
  ------------------------- ----------------------------------------------------------------------------------------------
  Transport Security        TLS 1.3 enforced on all external endpoints; mTLS between internal services via Istio

  Authentication            JWT RS256 signing, public key rotation every 90 days via Vault

  Authorization             RBAC enforced at gateway AND service level (defense in depth)

  Data Encryption at Rest   PostgreSQL: AWS RDS encryption (AES-256); S3: SSE-S3; Redis: in-transit + encryption-at-rest

  Secrets Management        All secrets in HashiCorp Vault; no secrets in environment variables or code

  Input Validation          All inputs validated with Pydantic (backend) and Zod (frontend); reject on first failure

  SQL Injection             SQLAlchemy ORM with parameterized queries only; no raw SQL construction

  XSS Prevention            Content-Security-Policy headers; React auto-escaping; DOMPurify for any innerHTML

  CSRF Protection           SameSite=Strict cookies + CSRF token for state-changing requests

  Rate Limiting             Per-IP and per-user limits at API Gateway (Kong rate-limit plugin)

  Container Security        Non-root containers; read-only root filesystem; no privileged mode; Trivy scan in CI

  OWASP Compliance          OWASP Top 10 mitigations reviewed quarterly

  PII Handling              PII encrypted in DB; masked in logs; not sent to Groq API

  Audit Logging             All admin actions, auth events, payment events immutably logged to Kafka + S3

  Penetration Testing       Annual third-party pentest; quarterly internal security review
  ------------------------------------------------------------------------------------------------------------------------

**5.5 Maintainability & Observability**

-   OpenTelemetry instrumentation on all services: traces, metrics, logs

-   Structured JSON logging (no unstructured logs) --- log level configurable via env

-   Distributed trace propagation: W3C TraceContext headers across all services

-   Per-service Grafana dashboards: RED metrics (Rate, Errors, Duration)

-   Alertmanager routes: PagerDuty for P0/P1, Slack for P2/P3

-   Runbook automation: Kubernetes Job-based auto-remediation for common failures

-   API versioning: /api/v1/ prefix; backward-compatible changes only within a version

-   Deprecation policy: 6 months notice before removing any API endpoint

**6. Frontend Architecture**

**6.1 Technology Stack**

  --------------------------------------------------------------------------------------------------------------------------
  **Layer**          **Technology**                        **Version**         **Purpose**
  ------------------ ------------------------------------- ------------------- ---------------------------------------------
  Framework          Next.js                               14.x (App Router)   SSR/SSG, file-based routing, RSC

  Language           TypeScript                            5.x                 Type safety across frontend codebase

  UI Components      Shadcn/ui + Radix UI                  Latest              Accessible, composable component primitives

  Styling            Tailwind CSS                          3.x                 Utility-first CSS, zero runtime

  State Management   Zustand                               4.x                 Lightweight global state (auth, session)

  Server State       TanStack Query                        5.x                 Data fetching, caching, optimistic updates

  Forms              React Hook Form + Zod                 Latest              Performant forms with schema validation

  Code Editor        Monaco Editor                         0.45+               VS Code-grade editor in browser

  Charts             Recharts                              2.x                 Analytics dashboards

  Animation          Framer Motion                         11.x                UI micro-interactions

  SSE Client         eventsource-parser                    Latest              Streaming AI response rendering

  WebRTC             LiveKit Client SDK                    1.x                 Video room integration

  Testing            Jest + Testing Library + Playwright   Latest              Unit, integration, E2E

  Linting            ESLint + Prettier + Husky             Latest              Code quality enforcement on commit

  Bundle Analysis    Next.js Bundle Analyzer               Latest              Detect bloat in production builds
  --------------------------------------------------------------------------------------------------------------------------

**6.2 Application Structure**

The Next.js application uses the App Router with the following top-level route groups:

-   (public)/ --- Landing, pricing, login, register, blog (SSG)

-   (auth)/ --- Email verification, OAuth callback, password reset (server-side)

-   (app)/ --- Protected routes: dashboard, interview room, analytics, profile (SSR + RSC)

-   (admin)/ --- Admin console (server-side auth check + RBAC guard)

-   api/ --- Next.js API routes for BFF layer (token refresh, webhook proxies)

**6.3 Performance Requirements**

-   Core Web Vitals targets: LCP \< 2.5s, CLS \< 0.1, FID \< 100ms

-   Code splitting per route; lazy load Monaco Editor, LiveKit SDK, Recharts

-   Image optimization via next/image with WebP/AVIF conversion

-   Font: next/font with subset loading (Latin only)

-   Service Worker for offline detection and graceful degradation

-   Lighthouse CI minimum score: Performance 85, Accessibility 95, Best Practices 90, SEO 90

**6.4 Error Boundary Strategy**

-   Root error boundary: catches unhandled errors, shows friendly page with session recovery option

-   Route-level error boundaries: per-page fallback UI

-   AI stream error: SSE error event triggers retry with user notification

-   Code editor error: Monaco errors surfaced inline, never block submission

-   WebRTC error: connection quality monitor triggers user guidance modal

**7. Database Design**

**7.1 Database Technology**

Primary data store: PostgreSQL 16 (AWS RDS Multi-AZ). Each microservice that owns persistent data has its own isolated database/schema (Database-per-Service pattern). Cross-service queries are avoided; data needed across services is replicated via events.

**7.2 Schema --- Auth Service DB**

**Table: users**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------
  **Column**           **Type**                                                          **Constraints**                 **Notes**
  -------------------- ----------------------------------------------------------------- ------------------------------- ------------------------------------
  id                   UUID                                                              PK, DEFAULT gen_random_uuid()   User\'s unique identifier

  email                VARCHAR(320)                                                      UNIQUE, NOT NULL                Normalized to lowercase on insert

  email_verified       BOOLEAN                                                           NOT NULL, DEFAULT false         Must be true before login

  password_hash        TEXT                                                              NULLABLE                        NULL for OAuth-only accounts

  google_id            VARCHAR(255)                                                      UNIQUE, NULLABLE                Google OAuth subject

  github_id            VARCHAR(255)                                                      UNIQUE, NULLABLE                GitHub OAuth subject

  role                 ENUM(\'free\',\'pro\',\'enterprise\',\'admin\',\'super_admin\')   NOT NULL, DEFAULT \'free\'      RBAC role

  totp_secret          TEXT                                                              NULLABLE, ENCRYPTED             MFA secret, encrypted at app layer

  totp_enabled         BOOLEAN                                                           NOT NULL, DEFAULT false         

  failed_login_count   SMALLINT                                                          NOT NULL, DEFAULT 0             Reset on successful login

  locked_until         TIMESTAMPTZ                                                       NULLABLE                        Account lockout expiry

  last_login_at        TIMESTAMPTZ                                                       NULLABLE                        

  last_login_ip        INET                                                              NULLABLE                        For geo-anomaly detection

  deleted_at           TIMESTAMPTZ                                                       NULLABLE                        Soft delete; NULL = active

  created_at           TIMESTAMPTZ                                                       NOT NULL, DEFAULT NOW()         

  updated_at           TIMESTAMPTZ                                                       NOT NULL, DEFAULT NOW()         Trigger-maintained
  -----------------------------------------------------------------------------------------------------------------------------------------------------------

**Table: refresh_tokens**

  ----------------------------------------------------------------------------------------------------------------
  **Column**      **Type**            **Constraints**                  **Notes**
  --------------- ------------------- -------------------------------- -------------------------------------------
  id              UUID                PK                               

  user_id         UUID                FK users(id) ON DELETE CASCADE   

  token_hash      TEXT                NOT NULL, UNIQUE                 SHA-256 hash of the token

  family_id       UUID                NOT NULL                         Token rotation family for reuse detection

  expires_at      TIMESTAMPTZ         NOT NULL                         7 days from issuance

  revoked         BOOLEAN             NOT NULL, DEFAULT false          

  created_at      TIMESTAMPTZ         NOT NULL, DEFAULT NOW()          
  ----------------------------------------------------------------------------------------------------------------

**Table: audit_logs**

  -------------------------------------------------------------------------------------------------------
  **Column**      **Type**         **Constraints**           **Notes**
  --------------- ---------------- ------------------------- --------------------------------------------
  id              BIGSERIAL        PK                        High-volume insert optimized

  user_id         UUID             NULLABLE, FK users(id)    NULL for system events

  action          VARCHAR(100)     NOT NULL                  e.g. \'LOGIN_SUCCESS\', \'PASSWORD_RESET\'

  resource        VARCHAR(100)     NULLABLE                  e.g. \'session\', \'user\'

  resource_id     UUID             NULLABLE                  

  metadata        JSONB            NULLABLE                  Extra context (IP, user-agent, etc.)

  created_at      TIMESTAMPTZ      NOT NULL, DEFAULT NOW()   Indexed
  -------------------------------------------------------------------------------------------------------

**7.3 Schema --- User Service DB**

**Table: user_profiles**

  --------------------------------------------------------------------------------------------------------------------
  **Column**                   **Type**         **Constraints**             **Notes**
  ---------------------------- ---------------- --------------------------- ------------------------------------------
  user_id                      UUID             PK, FK(auth.users.id)       1:1 with users

  display_name                 VARCHAR(100)     NOT NULL                    

  avatar_url                   TEXT             NULLABLE                    S3 pre-signed URL

  bio                          TEXT             NULLABLE, MAX 500 chars     

  target_companies             TEXT\[\]         NULLABLE                    e.g. {Google, Amazon, Meta}

  skills                       TEXT\[\]         NULLABLE                    e.g. {Python, Algorithms, System Design}

  timezone                     VARCHAR(50)      NOT NULL, DEFAULT \'UTC\'   IANA timezone string

  interview_reminder_enabled   BOOLEAN          NOT NULL, DEFAULT true      

  profile_public               BOOLEAN          NOT NULL, DEFAULT false     

  created_at                   TIMESTAMPTZ      NOT NULL, DEFAULT NOW()     

  updated_at                   TIMESTAMPTZ      NOT NULL, DEFAULT NOW()     
  --------------------------------------------------------------------------------------------------------------------

**Table: user_plans**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------
  **Column**               **Type**                                                   **Constraints**                      **Notes**
  ------------------------ ---------------------------------------------------------- ------------------------------------ ----------------------------------
  user_id                  UUID                                                       PK, FK user_profiles                 One plan per user

  plan                     ENUM(\'free\',\'pro\',\'enterprise\')                      NOT NULL, DEFAULT \'free\'           

  created_at               TIMESTAMPTZ                                                NOT NULL, DEFAULT NOW()              

  updated_at               TIMESTAMPTZ                                                NOT NULL, DEFAULT NOW()              
  -----------------------------------------------------------------------------------------------------------------------------------------------------------

**Table: usage_quotas**

  -------------------------------------------------------------------------------------------------------
  **Column**              **Type**         **Constraints**                  **Notes**
  ----------------------- ---------------- -------------------------------- -----------------------------
  user_id                 UUID             PK, FK user_profiles             

  interviews_today        SMALLINT         NOT NULL, DEFAULT 0              Reset daily at midnight UTC

  interviews_this_month   SMALLINT         NOT NULL, DEFAULT 0              Reset monthly

  ai_tokens_this_month    BIGINT           NOT NULL, DEFAULT 0              Groq token usage

  last_reset_daily        DATE             NOT NULL, DEFAULT CURRENT_DATE   

  last_reset_monthly      DATE             NOT NULL, DEFAULT CURRENT_DATE   
  -------------------------------------------------------------------------------------------------------

**7.4 Schema --- Interview Orchestrator DB**

**Table: sessions**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Column**               **Type**                                                                         **Constraints**                 **Notes**
  ------------------------ -------------------------------------------------------------------------------- ------------------------------- -----------------------------------------
  id                       UUID                                                                             PK, DEFAULT gen_random_uuid()   

  user_id                  UUID                                                                             NOT NULL, INDEXED               FK to auth service user

  mode                     ENUM(\'dsa\',\'behavioral\',\'system_design\')                                   NOT NULL                        

  difficulty               ENUM(\'easy\',\'medium\',\'hard\')                                               NOT NULL                        

  language                 VARCHAR(30)                                                                      NULLABLE                        Code language for DSA sessions

  status                   ENUM(\'created\',\'active\',\'paused\',\'completed\',\'reviewed\',\'expired\')   NOT NULL, DEFAULT \'created\'   State machine

  question_ids             UUID\[\]                                                                         NOT NULL, DEFAULT \'{}\'        Ordered list of question IDs in session

  current_question_index   SMALLINT                                                                         NOT NULL, DEFAULT 0             

  pause_count              SMALLINT                                                                         NOT NULL, DEFAULT 0             Max 3 pauses allowed

  paused_at                TIMESTAMPTZ                                                                      NULLABLE                        

  started_at               TIMESTAMPTZ                                                                      NULLABLE                        

  completed_at             TIMESTAMPTZ                                                                      NULLABLE                        

  expires_at               TIMESTAMPTZ                                                                      NOT NULL                        Session hard deadline (4h from start)

  metadata                 JSONB                                                                            NOT NULL, DEFAULT \'{}\'        Flexible: hint count, flags, etc.

  created_at               TIMESTAMPTZ                                                                      NOT NULL, DEFAULT NOW()         

  updated_at               TIMESTAMPTZ                                                                      NOT NULL, DEFAULT NOW()         
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table: session_events**

  -----------------------------------------------------------------------------------------------------------------------------
  **Column**      **Type**        **Constraints**             **Notes**
  --------------- --------------- --------------------------- -----------------------------------------------------------------
  id              BIGSERIAL       PK                          

  session_id      UUID            NOT NULL, FK sessions(id)   

  event_type      VARCHAR(50)     NOT NULL                    e.g. \'QUESTION_ASKED\', \'CODE_SUBMITTED\', \'HINT_REQUESTED\'

  payload         JSONB           NOT NULL, DEFAULT \'{}\'    Event-specific data

  created_at      TIMESTAMPTZ     NOT NULL, DEFAULT NOW()     
  -----------------------------------------------------------------------------------------------------------------------------

**Table: conversation_turns**

  -------------------------------------------------------------------------------------------------------------------------------
  **Column**      **Type**                                  **Constraints**                      **Notes**
  --------------- ----------------------------------------- ------------------------------------ --------------------------------
  id              UUID                                      PK                                   

  session_id      UUID                                      NOT NULL, INDEXED, FK sessions(id)   

  turn_index      SMALLINT                                  NOT NULL                             Order of conversation exchange

  role            ENUM(\'system\',\'assistant\',\'user\')   NOT NULL                             Maps to Groq API message roles

  content         TEXT                                      NOT NULL                             Full message content

  token_count     SMALLINT                                  NULLABLE                             Groq reported token count

  groq_model      VARCHAR(100)                              NULLABLE                             Model used for this turn

  latency_ms      INTEGER                                   NULLABLE                             Time to first token from Groq

  created_at      TIMESTAMPTZ                               NOT NULL, DEFAULT NOW()              
  -------------------------------------------------------------------------------------------------------------------------------

**7.5 Schema --- Feedback Service DB**

**Table: feedback_reports**

  --------------------------------------------------------------------------------------------------------------
  **Column**              **Type**       **Constraints**           **Notes**
  ----------------------- -------------- ------------------------- ---------------------------------------------
  id                      UUID           PK                        

  session_id              UUID           UNIQUE, NOT NULL          1:1 with sessions

  overall_score           NUMERIC(5,2)   NOT NULL                  0.00 - 100.00

  communication_score     NUMERIC(5,2)   NULLABLE                  

  problem_solving_score   NUMERIC(5,2)   NULLABLE                  

  code_quality_score      NUMERIC(5,2)   NULLABLE                  

  time_complexity_score   NUMERIC(5,2)   NULLABLE                  

  behavioral_score        NUMERIC(5,2)   NULLABLE                  

  question_scores         JSONB          NOT NULL                  Array: \[{question_id, score, commentary}\]

  ai_summary              TEXT           NOT NULL                  3-paragraph executive summary from Groq

  strengths               TEXT\[\]       NOT NULL                  AI-identified strengths

  improvements            TEXT\[\]       NOT NULL                  AI-identified improvement areas

  recommended_resources   JSONB          NULLABLE                  Links to LeetCode problems, articles

  pdf_s3_key              TEXT           NULLABLE                  S3 object key for PDF report

  pdf_expires_at          TIMESTAMPTZ    NULLABLE                  Pre-signed URL expiry

  generation_model        VARCHAR(100)   NOT NULL                  Groq model used for feedback

  generation_latency_ms   INTEGER        NULLABLE                  

  created_at              TIMESTAMPTZ    NOT NULL, DEFAULT NOW()   
  --------------------------------------------------------------------------------------------------------------

**7.6 Database Indexes**

  ----------------------------------------------------------------------------------------------------------------------
  **Table**            **Index**                     **Type**                           **Reason**
  -------------------- ----------------------------- ---------------------------------- --------------------------------
  users                idx_users_email               BTREE UNIQUE                       Login lookup

  users                idx_users_google_id           BTREE UNIQUE                       OAuth lookup

  sessions             idx_sessions_user_id_status   BTREE (user_id, status)            Active session check

  sessions             idx_sessions_expires_at       BTREE                              Expired session cleanup job

  conversation_turns   idx_turns_session_id_index    BTREE (session_id, turn_index)     Conversation history retrieval

  session_events       idx_events_session_id         BTREE                              Session event replay

  audit_logs           idx_audit_user_created        BTREE (user_id, created_at DESC)   User activity lookup

  feedback_reports     idx_feedback_session_id       BTREE UNIQUE                       Feedback lookup by session
  ----------------------------------------------------------------------------------------------------------------------

**7.7 Redis Data Structures**

  --------------------------------------------------------------------------------------------------------------------------------------
  **Key Pattern**                      **Type**           **TTL**              **Purpose**
  ------------------------------------ ------------------ -------------------- ---------------------------------------------------------
  session:{session_id}:state           Hash               4 hours              Full session state cache: status, current_q, turn_count

  session:{session_id}:context         List               4 hours              Last 8 conversation turns for Groq context

  user:{user_id}:quota                 Hash               Until midnight UTC   Daily interview count, token usage

  user:{user_id}:active_session        String             4 hours              Active session ID (prevents concurrent sessions)

  ratelimit:{user_id}:{endpoint}       String (counter)   Per window           Sliding window rate limit

  ratelimit:{ip}:{endpoint}            String (counter)   Per window           IP-level rate limit

  email_verify:{token_hash}            String             24 hours             Email verification OTP mapping

  pw_reset:{token_hash}                String             1 hour               Password reset token → user_id

  refresh_family:{family_id}:revoked   Boolean            7 days               Token family revocation flag

  groq_key:{key_id}:requests           String (counter)   1 minute             Per-key request count for rotation

  code_exec:job:{job_id}               Hash               30 minutes           Code execution job status and result
  --------------------------------------------------------------------------------------------------------------------------------------

**8. API Specification**

**8.1 API Design Principles**

-   Base URL: https://api.devmeet.io/api/v1/

-   Authentication: Bearer JWT in Authorization header for all protected endpoints

-   Content-Type: application/json for all request/response bodies

-   Error format: { error: { code: string, message: string, details?: any } }

-   Pagination: cursor-based with next_cursor and limit params (max 100)

-   Idempotency: POST endpoints accept Idempotency-Key header (UUID)

-   Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

**8.2 Auth Service Endpoints**

  -----------------------------------------------------------------------------------------------------------------------------
  **Method**   **Endpoint**            **Auth**   **Description**                                              **Rate Limit**
  ------------ ----------------------- ---------- ------------------------------------------------------------ ----------------
  POST         /auth/register          None       Register with email/password; sends verification email       5/min/IP

  POST         /auth/login             None       Login; returns access_token + sets HttpOnly refresh cookie   10/min/IP

  POST         /auth/logout            Bearer     Revoke current refresh token                                 100/min

  POST         /auth/refresh           Cookie     Rotate refresh token; returns new access token               30/min

  POST         /auth/verify-email      None       Verify email with OTP token                                  5/min/IP

  POST         /auth/forgot-password   None       Send password reset email                                    3/hour/email

  POST         /auth/reset-password    None       Reset password with token                                    5/min/IP

  POST         /auth/mfa/enable        Bearer     Enable TOTP MFA; returns QR code + backup codes              10/min

  POST         /auth/mfa/verify        Bearer     Verify TOTP code during login                                5/min

  GET          /auth/oauth/google      None       Initiate Google OAuth2 PKCE flow                             20/min/IP

  GET          /auth/oauth/github      None       Initiate GitHub OAuth2 flow                                  20/min/IP
  -----------------------------------------------------------------------------------------------------------------------------

**8.3 Session Endpoints**

  -----------------------------------------------------------------------------------------------------------------------------------------------------
  **Method**   **Endpoint**                **Auth**   **Description**                                                 **Rate Limit**
  ------------ --------------------------- ---------- --------------------------------------------------------------- ---------------------------------
  POST         /sessions                   Bearer     Create interview session; body: {mode, difficulty, language?}   10/hour (Free), unlimited (Pro)

  GET          /sessions/{id}              Bearer     Get session state and metadata                                  100/min

  PATCH        /sessions/{id}/status       Bearer     Transition session status (e.g. pause, complete)                20/min

  GET          /sessions/{id}/transcript   Bearer     Get full conversation transcript                                20/min

  GET          /sessions                   Bearer     List user sessions with cursor pagination                       30/min

  DELETE       /sessions/{id}              Bearer     Abandon session (moves to EXPIRED)                              10/min

  GET          /sessions/{id}/events       Bearer     Get session events for replay                                   20/min
  -----------------------------------------------------------------------------------------------------------------------------------------------------

**8.4 AI Interviewer Endpoints**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Method**   **Endpoint**               **Auth**   **Description**                                                 **Notes**
  ------------ -------------------------- ---------- --------------------------------------------------------------- ---------------------------------------------------
  GET          /ai/stream/{session_id}    Bearer     SSE stream: AI interviewer responses                            Keep-alive 30s ping; client must handle reconnect

  POST         /ai/respond/{session_id}   Bearer     Submit user answer; body: {content, type: \'text\'\|\'code\'}   Triggers AI evaluation turn

  POST         /ai/hint/{session_id}      Bearer     Request hint; body: {level: 1\|2\|3}                            Pro only; deducts from hint quota

  POST         /ai/skip/{session_id}      Bearer     Skip current question (penalty applied to score)                Max 2 skips per session
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

**8.5 Code Execution Endpoints**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Method**   **Endpoint**                   **Auth**   **Description**                                                  **Notes**
  ------------ ------------------------------ ---------- ---------------------------------------------------------------- ------------------------------------
  POST         /code/execute                  Bearer     Submit code for execution; body: {code, language, test_cases?}   Async; returns job_id

  GET          /code/result/{job_id}          Bearer     Poll execution result                                            Also available via WebSocket event

  GET          /code/languages                None       List supported languages and versions                            Cached, no auth needed

  POST         /code/run-tests/{session_id}   Bearer     Run against all session test cases                               Returns pass/fail matrix
  ------------------------------------------------------------------------------------------------------------------------------------------------------------

**8.6 Feedback Endpoints**

  ---------------------------------------------------------------------------------------------------------------------------------------------
  **Method**   **Endpoint**                        **Auth**         **Description**                           **Notes**
  ------------ ----------------------------------- ---------------- ----------------------------------------- ---------------------------------
  GET          /feedback/{session_id}              Bearer           Get feedback report (polls until ready)   Returns 202 if still generating

  GET          /feedback/{session_id}/pdf          Bearer           Get pre-signed S3 URL for PDF download    URL expires 7 days

  POST         /feedback/{session_id}/regenerate   Bearer + Admin   Re-generate feedback (admin only)         Overwrites existing
  ---------------------------------------------------------------------------------------------------------------------------------------------

**8.7 HTTP Error Codes**

  ----------------------------------------------------------------------------------------------------------
  **HTTP Status**           **Code**                **Meaning & When Used**
  ------------------------- ----------------------- --------------------------------------------------------
  400 Bad Request           VALIDATION_ERROR        Request body fails Pydantic/Zod schema validation

  400 Bad Request           INVALID_TRANSITION      Session state transition not allowed by state machine

  401 Unauthorized          TOKEN_EXPIRED           JWT access token has expired --- client should refresh

  401 Unauthorized          TOKEN_INVALID           JWT signature invalid or tampered

  403 Forbidden             INSUFFICIENT_ROLE       User\'s role doesn\'t permit this action (RBAC)

  403 Forbidden             QUOTA_EXCEEDED          Free tier interview quota exhausted for the day/month

  404 Not Found             RESOURCE_NOT_FOUND      Session, user, or feedback report doesn\'t exist

  409 Conflict              CONCURRENT_SESSION      User already has an active session

  409 Conflict              DUPLICATE_REQUEST       Idempotency key already used (same request replayed)

  422 Unprocessable         PROMPT_INJECTION        User input contains detected prompt injection pattern

  429 Too Many Requests     RATE_LIMITED            Rate limit exceeded; check Retry-After header

  503 Service Unavailable   GROQ_UNAVAILABLE        Groq API down or all retries exhausted

  503 Service Unavailable   EXECUTION_QUEUE_FULL    Code execution queue at capacity; check Retry-After
  ----------------------------------------------------------------------------------------------------------

**9. Groq API Integration**

**9.1 Model Selection**

  -----------------------------------------------------------------------------------------------------------------------------------------------
  **Model**                        **Context Window**   **Use Case**                                                      **Fallback Priority**
  -------------------------------- -------------------- ----------------------------------------------------------------- -----------------------
  llama3-70b-8192 (Primary)        8,192 tokens         DSA evaluation, behavioral interviews, system design              Primary

  mixtral-8x7b-32768 (Secondary)   32,768 tokens        Long system design sessions, feedback generation (long context)   Fallback #1

  llama3-8b-8192 (Emergency)       8,192 tokens         Cost-optimized fallback when primary overloaded                   Fallback #2
  -----------------------------------------------------------------------------------------------------------------------------------------------

**9.2 Prompt Architecture**

**DSA Interview System Prompt Structure:**

-   Role definition: AI acts as a Google-level senior engineer conducting a technical screen

-   Persona: professional, encouraging, probing --- never gives away answers directly

-   Question context: problem statement, constraints, expected approach, hidden test cases

-   Evaluation criteria: correctness, time/space complexity, code clarity, edge case handling

-   Candidate context: difficulty level selected, hints used, time elapsed

-   Format instructions: respond in JSON when evaluating code; prose when questioning

**9.3 Streaming Implementation**

The AI Interviewer Service uses Groq\'s streaming API (stream=True) to enable real-time token delivery to the client:

-   FastAPI endpoint opens async generator consuming Groq stream

-   Each token chunk forwarded as SSE event: data: {delta: token}

-   End of stream signaled: data: {done: true, usage: {prompt_tokens, completion_tokens}}

-   Client reconnect: SSE Last-Event-ID used to resume from last received token

-   Server-side: if client disconnects, Groq stream cancelled via aiohttp session close

**9.4 API Key Management**

-   5 Groq API keys stored in HashiCorp Vault, fetched at service startup

-   Round-robin selection with per-key rate tracking in Redis

-   Key marked as \'cooldown\' for 60s when 429 received

-   Key health checked every 30s via lightweight ping to /v1/models

-   Alertmanager fires PagerDuty alert if fewer than 2 healthy keys remain

-   Keys rotated every 30 days via automated Vault dynamic secrets workflow

**9.5 Cost Control**

-   Max tokens per AI turn: 800 (response) + \~1500 (prompt) = \~2300 tokens/turn

-   Max turns per session: 20 turns → max \~46,000 tokens per session

-   Token usage logged per session in usage_quotas table

-   Monthly Groq spend budget alert at 80% threshold via Grafana

-   Anomaly detection: session \>10,000 tokens/turn triggers review and possible session pause

**10. Event Architecture**

**10.1 Kafka Topics**

  ------------------------------------------------------------------------------------------------------------------------------------------------
  **Topic Name**              **Producers**            **Consumers**                                **Purpose**                    **Retention**
  --------------------------- ------------------------ -------------------------------------------- ------------------------------ ---------------
  session.lifecycle           Interview Orchestrator   Analytics, Feedback, Notification Services   Session state changes          7 days

  session.completed           Interview Orchestrator   Feedback Service (primary consumer)          Triggers feedback generation   7 days

  code.execution.submitted    Interview Orchestrator   Code Execution Service                       Code run request               1 day

  code.execution.completed    Code Execution Service   Interview Orchestrator, Analytics            Execution result               1 day

  feedback.generated          Feedback Service         Notification Service, Analytics              Feedback ready event           7 days

  user.subscription.changed   Payment Service          User Service, Analytics                      Plan tier change               30 days

  audit.events                All Services             Audit Log Service (S3 sink)                  Compliance audit trail         90 days

  analytics.metrics           All Services             Analytics Service                            Custom business metrics        30 days
  ------------------------------------------------------------------------------------------------------------------------------------------------

**10.2 RabbitMQ Queues**

  -----------------------------------------------------------------------------------------------
  **Queue**                  **Exchange**   **DLQ**                   **Purpose**
  -------------------------- -------------- ------------------------- ---------------------------
  code.execution.jobs        direct         code.execution.dlq        Sandboxed Docker run jobs

  feedback.generation.jobs   direct         feedback.generation.dlq   Groq feedback API calls

  email.notifications        direct         email.notifications.dlq   SES email delivery

  pdf.generation.jobs        direct         pdf.generation.dlq        WeasyPrint PDF rendering

  report.export.jobs         direct         report.export.dlq         Analytics CSV exports
  -----------------------------------------------------------------------------------------------

**10.3 Dead Letter Queue Strategy**

-   All DLQs are persistent, durable queues monitored by Prometheus consumer lag alerts

-   DLQ consumers retry with exponential backoff: 1s, 5s, 30s, 5min --- after 5 failures, message moved to dead-dead queue and alert fired

-   DLQ messages include: original payload, error reason, retry count, first failure timestamp

-   Admin console shows DLQ depths with one-click re-queue capability

-   Critical queues (feedback.generation, email.notifications) --- DLQ alert fires on any message

**11. Deployment & Infrastructure**

**11.1 Kubernetes Cluster Design**

  -----------------------------------------------------------------------------------------------------------------
  **Node Pool**         **Instance Type**            **Count**      **Workloads**
  --------------------- ---------------------------- -------------- -----------------------------------------------
  System Pool           t3.medium (AWS)              3 (Multi-AZ)   Kube-system, Istio, monitoring

  API Services Pool     c5.xlarge (4 vCPU, 8GB)      3-10 (HPA)     Auth, User, Orchestrator, Feedback, Analytics

  AI Service Pool       c5.2xlarge (8 vCPU, 16GB)    2-8 (HPA)      AI Interviewer Service (CPU-heavy LLM I/O)

  Code Execution Pool   c5.4xlarge (16 vCPU, 32GB)   2-5 (HPA)      Code Execution Service (Docker-in-Docker)

  Video Pool            c5.xlarge                    2-4 (HPA)      Video Service + LiveKit media server

  Data Pool             r5.xlarge (4 vCPU, 32GB)     3 (fixed)      PostgreSQL, Redis, Elasticsearch, Kafka
  -----------------------------------------------------------------------------------------------------------------

**11.2 Kubernetes Resource Specifications**

  ----------------------------------------------------------------------------------------------------------------------------------------
  **Service**              **CPU Request**   **CPU Limit**   **Memory Request**   **Memory Limit**   **Min Replicas**   **Max Replicas**
  ------------------------ ----------------- --------------- -------------------- ------------------ ------------------ ------------------
  Auth Service             250m              500m            256Mi                512Mi              3                  10

  Interview Orchestrator   500m              1000m           512Mi                1Gi                2                  10

  AI Interviewer Service   1000m             2000m           1Gi                  2Gi                3                  15

  Code Execution Service   2000m             4000m           2Gi                  4Gi                3                  10

  Feedback Service         500m              1000m           512Mi                1Gi                2                  8

  Video Service            500m              1000m           512Mi                1Gi                2                  6

  Notification Service     250m              500m            256Mi                512Mi              2                  5

  Analytics Service        500m              1000m           512Mi                2Gi                1                  4
  ----------------------------------------------------------------------------------------------------------------------------------------

**11.3 CI/CD Pipeline**

**GitHub Actions Workflow (per service):**

13. Trigger: push to main or pull request

14. Lint: ESLint (TS) / Ruff (Python) / golangci-lint (Go)

15. Type Check: mypy (Python) / tsc \--noEmit (TypeScript)

16. Unit Tests: pytest / Jest --- fail pipeline if coverage \< 80%

17. Integration Tests: Docker Compose test environment

18. Security Scan: Trivy (container) + Snyk (dependencies)

19. Build: Docker image with multi-stage build, push to ECR with SHA tag

20. SAST: Semgrep scan on source code

21. E2E Tests (main branch only): Playwright against staging environment

22. ArgoCD Sync: updates Helm chart values in GitOps repo, ArgoCD auto-deploys to staging

23. Manual Approval Gate for production promotion

24. Production Deploy: ArgoCD progressive delivery (20% → 50% → 100% traffic via Istio VirtualService)

25. Post-deploy: smoke tests via k6, Grafana annotation created

**11.4 Environment Strategy**

  -------------------------------------------------------------------------------------------------------------------------------------------------------
  **Environment**   **Purpose**                                      **Data**                                  **Groq API**               **Traffic**
  ----------------- ------------------------------------------------ ----------------------------------------- -------------------------- ---------------
  Local (dev)       Developer testing                                Seed data in Docker Compose               Real key with low quota    None

  CI                Automated testing in GitHub Actions              Ephemeral test fixtures                   Mocked / test key          None

  Staging           Integration + E2E testing, preview deployments   Anonymized production snapshot (weekly)   Real key, separate quota   Internal only

  Production        Live user traffic                                Live production data                      Real keys, full quota      100% live
  -------------------------------------------------------------------------------------------------------------------------------------------------------

**11.5 Disaster Recovery**

  ------------------------------------------------------------------------------------------------------------------------------------------
  **Scenario**              **Detection**                       **Response**                         **RTO**      **RPO**
  ------------------------- ----------------------------------- ------------------------------------ ------------ --------------------------
  Pod crash                 K8s liveness probe fails            Auto-restart by kubelet              \< 30s       0 (stateless)

  Node failure              K8s node not-ready condition        Pods rescheduled to healthy nodes    \< 2 min     0 (stateless)

  PostgreSQL primary fail   RDS Multi-AZ health check           Automatic failover to standby        \< 30s       \< 5s (WAL streaming)

  Redis cluster node fail   Redis Sentinel                      Automatic replica promotion          \< 10s       \< 1s

  Kafka broker fail         Kafka controller election           Partition leadership re-election     \< 30s       0 (replication factor 3)

  Entire AZ outage          AWS health dashboard + Prometheus   Traffic shifts to remaining AZs      \< 5 min     \< 5 min

  Groq API outage           Health check every 30s              Automatic failover to Mixtral        \< 1 min     N/A

  Data corruption           Checksums + monitoring alerts       PITR restore from RDS snapshot       \< 1 hour    \< 1 hour

  Accidental mass delete    Soft delete + 30-day retention      Restore from soft delete or backup   \< 2 hours   \< 1 hour
  ------------------------------------------------------------------------------------------------------------------------------------------

**12. Edge Cases & Failure Modes**

**12.1 AI Service Edge Cases**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Scenario**                                   **Detection**                                   **Handling**
  ---------------------------------------------- ----------------------------------------------- --------------------------------------------------------------
  Groq returns empty response                    Response content check                          Retry once; if empty again --- send generic follow-up prompt

  Groq response truncated mid-stream             SSE stream closes without done:true             Client detects, shows warning, requests AI to continue

  AI generates code answer (should not)          Response contains code block in non-code mode   Filtered server-side before sending to client

  User pastes full solution from web             Code similarity \>90% to known solutions        Flag for review; does not block user but noted in feedback

  Context window overflow (\>8192 tokens)        Token count estimation pre-request              Prune oldest conversation turns until within budget

  Groq returns NSFW or off-topic content         Content classification post-response            Response blocked; AI re-prompted with stronger guardrails

  User language not matching selected language   Language detection on first 3 responses         AI gently redirects to selected interview language

  Interview question repeated                    Question ID deduplication in session            Orchestrator skips already-asked question IDs

  User is AFK (no response for 3 minutes)        Server-side timer on SSE connection             AI sends check-in message; 5 min → session paused
  -------------------------------------------------------------------------------------------------------------------------------------------------------------

**12.2 Code Execution Edge Cases**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Scenario**                                 **Detection**                                **Handling**
  -------------------------------------------- -------------------------------------------- -----------------------------------------------------------------------------
  Infinite loop                                10s execution timeout (SIGKILL)              Return: \'Execution timed out after 10 seconds. Check for infinite loops.\'

  Fork bomb / process explosion                cgroups process count limit (50 max)         Container killed; return: \'Process limit exceeded\'

  Memory exhaustion (\>256MB)                  cgroups memory limit                         OOM kill; return: \'Memory limit exceeded (256MB)\'

  Malicious file system write                  Read-only rootfs, /tmp writable (64MB max)   Write fails silently in container; /tmp cleared post-execution

  Network access attempt                       No network namespace in container            Connection refused; Python: socket.error returned to user code

  Code uses banned libraries                   Pre-execution AST analysis (Python)          Block with specific message listing banned imports

  Compilation error (C++/Java)                 Non-zero exit code + stderr check            Return full compiler error with line numbers

  Binary output / non-UTF8 stdout              Charset detection on stdout                  Truncate at 64KB, note: \'\[Binary output detected\]\'

  Code execution queue timeout (\>5min wait)   Queue depth + wait time estimation           Return 503 with estimated wait time; suggest retry

  Docker daemon crash                          Pod liveness probe                           Pod restart; in-flight jobs returned to queue via visibility timeout

  Test case with large input (\>1MB)           Input size validation before queuing         Reject with 413 and max input size guidance
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

**12.3 Session & Network Edge Cases**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Scenario**                                       **Detection**                             **Handling**
  -------------------------------------------------- ----------------------------------------- ----------------------------------------------------------------------
  Browser tab closed mid-interview                   Page Visibility API + heartbeat stops     Heartbeat timeout → pause session, allow 30-min recovery window

  Network switch (WiFi → mobile)                     WebSocket reconnection event              Restore session from Redis cache; SSE reconnects with Last-Event-ID

  Simultaneous login from two devices                Refresh token family tracking             Both devices work; session state is server-side, conflict impossible

  Race condition: two simultaneous session creates   Redis SETNX distributed lock on user_id   Second request blocked with 409 CONCURRENT_SESSION

  Redis eviction during active session               Cache miss on session state read          Reload from PostgreSQL; continue session (slight latency spike)

  SSE connection limit per user                      Connection count tracked in Redis         Max 2 concurrent SSE connections per user; 3rd rejected with 429

  Very slow typing (session appears idle)            Last activity timestamp in Redis          No action until hard timeout; activity = any message received

  Clock skew between services                        NTP sync on all nodes                     All timestamps in UTC; JWT exp validated server-side

  Expired JWT with valid refresh cookie              401 on API call                           Client middleware auto-calls /auth/refresh, retries original request
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------

**12.4 Security Edge Cases**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------
  **Scenario**                                **Detection**                                 **Handling**
  ------------------------------------------- --------------------------------------------- ----------------------------------------------------------------
  Refresh token reuse (token theft)           Token family ID already revoked               Revoke entire family, force re-login, security alert to user

  SSRF via code execution network             No network in container namespace             Connection impossible; any attempt returns network unreachable

  Prompt injection via user input             Regex + ML classifier on all user inputs      Block, log, warn user; 3rd attempt terminates session

  Brute force OTP (TOTP)                      Rate limit: 5 attempts/5 min                  After 5 failures: MFA locked for 10 min, email notification

  Admin endpoint accessed by non-admin        RBAC check at gateway AND service             403 returned; access attempt logged to audit trail

  XSS via AI response (if rendered as HTML)   AI response rendered as markdown, sanitized   DOMPurify strips all event handlers and script tags

  SQL injection via API                       SQLAlchemy parameterized queries              Input treated as data, never concatenated into SQL

  JWT algorithm confusion (alg:none)          RS256 explicitly enforced in JWT validator    Any token with non-RS256 alg rejected with 401

  Large payload DoS                           Request body size limit: 1MB at gateway       413 returned before body reaches service

  Kubernetes API access from container        No RBAC bindings for app service accounts     Service accounts have no K8s permissions by default
  ----------------------------------------------------------------------------------------------------------------------------------------------------------

**13. Monitoring, Observability & Alerting**

**13.1 Metrics**

-   Prometheus scrapes all services via /metrics endpoint every 15s

-   Custom business metrics: sessions_created_total, groq_requests_total, groq_errors_total, code_executions_total, feedback_generated_total

-   Infrastructure metrics: CPU/memory per pod, node resource usage, PVC usage

-   Groq metrics: requests/min per key, token usage/min, error rate, latency p50/p99

-   Queue metrics: RabbitMQ queue depth, consumer count, message age; Kafka consumer lag

**13.2 Alert Rules**

  -----------------------------------------------------------------------------------------------------------------------------
  **Alert Name**               **Condition**                             **Severity**   **Action**
  ---------------------------- ----------------------------------------- -------------- ---------------------------------------
  GroqHighErrorRate            groq_errors_total rate \> 5% over 5m      P1             PagerDuty + Slack #incidents

  GroqAllKeysUnhealthy         Healthy Groq keys \< 2                    P0             PagerDuty immediate

  CodeExecQueueFull            Queue depth \> 800 for 2m                 P1             PagerDuty + scale Code Execution pods

  SessionCreationLatencyHigh   p99 \> 500ms over 5m                      P2             Slack #alerts

  FeedbackSLOBreach            generation_time \> 90s for 10% sessions   P2             Slack #alerts

  PodCrashLooping              Restart count \> 5 in 10m                 P1             PagerDuty

  DiskUsageHigh                PVC usage \> 85%                          P2             Slack #infra

  GroqCostOverBudget           Monthly token spend \> 80% budget         P2             Slack #cost

  DBConnectionPoolExhausted    Available connections \< 5                P1             PagerDuty

  KafkaConsumerLagHigh         Consumer lag \> 10000 for 5m              P2             Slack #alerts
  -----------------------------------------------------------------------------------------------------------------------------

**13.3 Dashboards**

-   Service Overview: request rate, error rate, latency per service (RED metrics)

-   AI Interviewer: Groq API latency, token usage, key rotation events, error breakdown

-   Code Execution: queue depth, execution time distribution, language breakdown, OOM/timeout rates

-   Business Metrics: DAU/MAU, sessions by mode, completion rate

-   Infrastructure: node CPU/memory, pod count per service, PVC usage, K8s events

-   Security: auth failures/min, rate limit hits, prompt injection attempts, suspicious IPs

**14. Testing Strategy**

**14.1 Test Pyramid**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Level**           **Tool**                                     **Coverage Target**                    **Scope**
  ------------------- -------------------------------------------- -------------------------------------- -----------------------------------------------------
  Unit Tests          pytest (Python) / Jest (TS) / testing (Go)   ≥ 80% line coverage                    Business logic, utils, parsers, validators

  Integration Tests   pytest + Docker Compose                      Key service interactions               DB queries, Redis ops, RabbitMQ publish/consume

  Contract Tests      Pact                                         All service-to-service API contracts   Ensures API changes don\'t break consumers

  E2E Tests           Playwright                                   Critical user journeys (10 flows)      Register → Interview → Feedback → PDF download

  Load Tests          k6                                           500 concurrent sessions                Performance regression detection on every release

  Chaos Tests         Chaos Monkey / Chaos Toolkit                 Monthly in staging                     Pod kill, network partition, DB failover simulation

  Security Tests      OWASP ZAP + manual pentest                   Annual + on major releases             OWASP Top 10, auth bypass, injection
  -------------------------------------------------------------------------------------------------------------------------------------------------------------

**14.2 Groq API Testing**

-   Unit tests mock Groq API responses (no real API calls in unit tests)

-   Integration tests use a test Groq key with usage limits

-   Golden tests: 20 canonical question-answer pairs with expected score ranges

-   Regression suite: runs weekly against latest Groq model to detect prompt drift

-   Latency benchmarks: first-token latency tracked per model version

**14.3 Code Execution Testing**

-   Unit: test Docker container spawn, resource limit enforcement, timeout

-   Security: attempt known container escape techniques --- all must fail

-   Language matrix: 20 programs per language covering edge cases (empty input, large output, unicode)

-   Load: 200 concurrent execution jobs --- verify queue handling and result ordering

**15. Development Roadmap**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Phase**                       **Duration**   **Deliverables**                                                                                                                                                           **Key Risk**
  ------------------------------- -------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- ------------------------------
  Phase 1: Foundation             Weeks 1-4      Auth Service (all AUTH-xx), User Service, API Gateway setup, CI/CD pipeline, K8s cluster provisioning, Vault setup                                                         K8s setup complexity

  Phase 2: AI Core                Weeks 5-8      AI Interviewer Service + Groq integration + SSE streaming, Interview Orchestrator + session state machine, DSA question bank seed (200 questions), Redis session caching   Groq API rate limits in dev

  Phase 3: Code Execution         Weeks 9-11     Code Execution Service + Docker sandbox, Monaco Editor frontend, RabbitMQ integration, 6-language support + test runner                                                    Container security hardening

  Phase 4: Feedback & Video       Weeks 12-14    Feedback Service + PDF generation, Behavioral + System Design interview modes, WebRTC Video Service + LiveKit, Notification Service (email)                                LiveKit TURN server setup

  Phase 5: Analytics & Admin      Weeks 15-17    Analytics dashboard + trend charts, Admin console, Quota enforcement, File Service (S3)

  Phase 6: Hardening              Weeks 18-20    Load testing (500 concurrent), Security audit + OWASP ZAP scan, E2E test coverage, Chaos engineering in staging, Performance optimization                                  Unforeseen bottlenecks

  Phase 7: Launch                 Weeks 21-22    Production deployment, DNS + CDN setup, Monitoring + alerting fully configured, Runbooks written, Beta user onboarding (100 users)                                         Production traffic surprises
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**16. Risks & Mitigation**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Risk**                                           **Probability**   **Impact**   **Mitigation Strategy**
  -------------------------------------------------- ----------------- ------------ -------------------------------------------------------------------------------------------------------------
  Groq API downtime or rate limiting                 Medium            Critical     Multi-key rotation, Mixtral fallback, graceful session pause, offline-capable hint cache

  Container escape from code execution sandbox       Low               Critical     nsjail + seccomp + AppArmor + read-only fs + no network + non-root + resource limits + regular CVE scanning

  PostgreSQL data loss                               Very Low          Critical     RDS Multi-AZ + continuous WAL to S3 + daily snapshots + tested restore procedure quarterly

  DDOS attack on API gateway                         Medium            High         Cloudflare WAF + AWS WAF + Kong rate limiting + IP reputation blocking

  Groq model prompt drift (quality degradation)      Medium            High         Weekly regression test suite + model version pinning + human QA spot checks

  Kubernetes misconfiguration causing outage         Low               High         GitOps with PR reviews + staging validation + progressive delivery (canary)

  PII data breach                                    Low               Critical     Encryption at rest + mTLS in transit + column-level encryption for sensitive fields + annual pentest

  Stripe webhook processing failure                  Medium            High         Idempotency keys + DLQ + manual reconciliation job + subscription state audit daily

  LiveKit media server overload                      Low               Medium       Horizontal pod scaling + TURN server capacity planning + load testing

  Elasticsearch index corruption                     Low               Medium       Replica shards + daily snapshots + re-index capability from source of truth (PostgreSQL)

  Developer accidentally commits secrets             Medium            High         git-secrets pre-commit hook + Vault for all secrets + GitHub secret scanning + PR reviews

  Groq API pricing change affecting unit economics   Medium            Medium       Token usage tracking per session + cost analytics + contract negotiation + model switching capability
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**17. Compliance & Privacy**

**17.1 GDPR Compliance**

-   Lawful basis for processing: Legitimate Interest (interview analytics) + Contract (service delivery)

-   Data minimization: only collect data necessary for platform function

-   Right to access (Article 15): /api/v1/users/me/export within 48h

-   Right to erasure (Article 17): soft delete → anonymize after 30 days (email, name → hashed placeholder)

-   Data portability (Article 20): JSON export of all user data

-   Privacy by design: PII not logged, not sent to Groq API, not in error messages

-   DPA (Data Processing Agreement) required for all sub-processors (Groq, AWS, Stripe)

-   Data retention: interview transcripts 2 years, audit logs 5 years, billing records 7 years

**17.2 Data Sent to Groq API**

+---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| **Privacy Notice**                                                                                                                                                                                                                                |
|                                                                                                                                                                                                                                                   |
| User conversations (text responses) are sent to Groq Cloud API for LLM inference. PII (name, email, company) is NOT included in Groq prompts. Users must accept this in Terms of Service. Groq\'s data processing agreement covers this use case. |
+---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

**17.3 Security Certifications (Roadmap)**

-   SOC 2 Type II --- Target: 12 months post-launch

-   ISO 27001 --- Target: 18 months post-launch

-   VAPT (Vulnerability Assessment & Penetration Testing) --- Annual from launch

**18. Open Questions & Future Scope**

**18.1 Open Questions (Require Decision Before Phase 2)**

26. Should Groq prompt templates be stored in Vault (dynamic) or Git (versioned)? Trade-off: agility vs auditability.

27. Interview session time limit: 60 minutes hard cap or user-configurable (30/45/60/90)?

28. Should code execution support Jupyter-style multi-cell execution, or single-file only?

29. Team/Enterprise accounts: should team admins be able to see member session transcripts?

30. Question bank: curated by Hemanshu only, or community-submitted with moderation?

**18.2 Future Scope (Post v2.0)**

-   Voice interview mode: speech-to-text (Whisper API) + text-to-speech for AI responses

-   Pair programming sessions: two users in same WebRTC room + shared editor

-   Company-sponsored interview prep: FAANG companies sponsor DevMeet access for candidates

-   AI-generated personalized study plan based on weak areas from analytics

-   LeetCode / NeetCode problem import integration

-   Interview recording and AI-powered video analysis (facial expressions, filler words)

-   Resume parsing: AI suggests relevant interview topics based on candidate\'s resume

-   Referral program with subscription credits

-   Mobile app (React Native) for behavioral interview practice on the go

-   Multi-language UI: Hindi, Spanish, Mandarin support

**Appendix A --- Subscription Tier Feature Matrix**

  -----------------------------------------------------------------------------------------------------------------
  **Feature**                 **Free**             **Pro**                            **Enterprise**
  --------------------------- -------------------- ---------------------------------- -----------------------------
  Interviews per month        3                    Unlimited                          Unlimited

  Interview modes             DSA only             DSA + Behavioral + System Design   All modes

  AI difficulty               Easy / Medium        All difficulties                   All difficulties

  Code execution              Yes                  Yes                                Yes

  Video interview room        No                   Yes                                Yes

  AI hints                    No                   3 per session                      Unlimited

  Feedback report             Basic (score only)   Full report with commentary        Full report + custom rubric

  PDF export                  No                   Yes                                Yes

  Analytics dashboard         Last 7 days          Last 90 days                       Full history + export

  Custom question bank        No                   No                                 Yes

  Team management             No                   No                                 Yes (up to 50 seats)

  Priority support            Community forum      Email (48h SLA)                    Dedicated Slack + 4h SLA

  API access                  No                   No                                 Yes (v1 read-only)

  Data retention              30 days              1 year                             Unlimited

  Price (monthly)             Free                 \$19/month                         Contact sales
  -----------------------------------------------------------------------------------------------------------------

**Appendix B --- Groq API Rate Limits Reference**

  ----------------------------------------------------------------------------
  **Model**              **Requests/min**   **Tokens/min**   **Tokens/day**
  ---------------------- ------------------ ---------------- -----------------
  llama3-70b-8192        30                 6,000            500,000

  mixtral-8x7b-32768     30                 5,000            500,000

  llama3-8b-8192         30                 30,000           500,000
  ----------------------------------------------------------------------------

Note: Limits above are approximate Groq free/dev tier limits. Production keys may have higher limits via Groq enterprise agreement. Always implement retry logic and key rotation regardless of tier.

**Appendix C --- Revision History**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Version**   **Date**        **Author**       **Changes**
  ------------- --------------- ---------------- -------------------------------------------------------------------------------------------------------------------------------------
  1.0           Initial draft   Hemanshu Tala    Original lightweight SRS

  2.0           Current         Hemanshu Tala    Full rewrite: distributed microservices, Groq API integration, complete database schemas, API spec, edge cases, DR plan, compliance
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

*--- End of Document ---*
