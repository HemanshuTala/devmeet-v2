# 🚀 DevMeet: Advanced Backend & System Design Master Questions (Part 2)

> **Companion Guide To**: [`INTERVIEW_DEEP_DIVE_QA.md`](./INTERVIEW_DEEP_DIVE_QA.md) and [`BACKEND_SYSTEM_DESIGN_DEEP_DIVE.md`](./BACKEND_SYSTEM_DESIGN_DEEP_DIVE.md)  
> **Audience**: Senior / Staff / Principal Backend & Distributed Systems Interview Panel  
> **Repository**: `E:\AI INTERVIEW`

---

## 🎯 How to Ace Staff/Senior Backend Questions

Staff and Principal interviewers don't just ask *"how does it work?"* They ask:
1. **"What breaks under 10x or 100x load?"**
2. **"What are the silent failure modes (starvation, stampedes, poison pills)?"**
3. **"What are the security boundaries and escape vectors?"**
4. **"What is the exact durability and consistency boundary between PostgreSQL, Redis, and RabbitMQ?"**

Below are 15 brand-new, elite backend and distributed systems questions that dig into the internals of the DevMeet codebase.

---

## 21. Database Connection Pool Starvation & AsyncPG Behavior Under High Concurrency

### ❓ Question:
> *"Each microservice configures an AsyncPG pool with `min_size=2, max_size=10`. What happens when 1,000 concurrent requests hit FastAPI, and how do you prevent cascading event loop starvation?"*

### 💡 Staff-Level Answer:
- **The Failure Mode**:
  - FastAPI is an asynchronous event-driven server. When 1,000 concurrent coroutines enter handlers that call `await pool.acquire()`, only 10 can execute SQL queries concurrently on PostgreSQL.
  - The remaining 990 coroutines are queued in memory waiting for a free connection.
  - If handlers perform slow external HTTP calls (e.g., calling Groq LLM or Search Service) while holding an acquired connection, connection hold time spikes from 5ms to 2,000ms.
  - This exhausts the pool, causing all new HTTP requests to hang until client timeouts occur.

- **Current Repository Code**:
  - In `services/orchestrator-service/app/database.py` and `services/payment-service/app/database.py`, `asyncpg.create_pool` is initialized with default connection timeouts.

- **Production Solution**:
  1. **Strict Connection Scope**: Never hold a database connection across external HTTP or LLM network boundaries. Acquire connections only for the immediate query execution and release them instantly:
     ```python
     # Antipattern:
     async with pool.acquire() as conn:
         await call_external_llm() # Holds DB socket for seconds!
         await conn.execute(...)

     # Correct Pattern:
     result = await call_external_llm()
     async with pool.acquire() as conn:
         await conn.execute(..., result)
     ```
  2. **Bounded `acquire_timeout`**: Configure `pool.acquire(timeout=2.0)`. If a connection cannot be acquired within 2 seconds, immediately fail fast with HTTP 503 rather than queuing indefinitely.
  3. **Connection Multiplexing via PgBouncer**: Deploy PgBouncer in front of PostgreSQL in **Transaction Pooling Mode**. 10,000 client connections multiplex down to 50 physical backend PostgreSQL connections.

**Code References**: [Orchestrator Database](services/orchestrator-service/app/database.py), [Payment Database](services/payment-service/app/database.py).

---

## 22. Docker-in-Docker vs Docker-out-of-Docker Security Risks & Escape Mitigations

### ❓ Question:
> *"The code execution service mounts `/var/run/docker.sock` to spin up runner containers. What is the fundamental security flaw with this pattern, and how would you build a truly hardened multi-tenant execution sandbox?"*

### 💡 Staff-Level Answer:
- **The Security Flaw (DooD - Docker out of Docker)**:
  - Mounting `/var/run/docker.sock` grants the containerized `code-execution-service` direct communication with the host machine's Docker daemon.
  - The Docker daemon runs as **root on the host**. Anyone who compromises the `code-execution-service` can issue `docker run -v /:/host_root alpine rm -rf /host_root`, completely owning or destroying the host operating system.

- **Current Repository Mitigations**:
  - In `services/code-execution-service/app/executor.py`, user code does not run directly in the service container. It spawns ephemeral child containers with:
    - `--network=none` (no outbound/inbound networking)
    - `--pids-limit=64` (fork-bomb neutralization)
    - `--read-only` root filesystem with small RAM-backed `--tmpfs /tmp`
    - `--security-opt=no-new-privileges:true` and `--cap-drop=ALL`

- **Staff-Level Cloud Hardening**:
  1. **gVisor (`runsc` OCI Runtime)**: Replace the standard `runc` runtime with Google gVisor. gVisor runs a user-space kernel written in Go that intercepts all 300+ Linux syscalls. Even zero-day Linux kernel privilege escalations cannot escape to the host kernel.
  2. **MicroVMs (AWS Firecracker)**: Spin up lightweight KVM-based virtual machines in under 5ms with dedicated guest kernels, guaranteeing hardware-level CPU virtualization isolation per candidate.
  3. **Rootless Docker / Podman**: Run the execution daemon entirely without root privileges.

**Code References**: [Code Execution Engine](services/code-execution-service/app/executor.py), [Docker Compose](docker-compose.yml).

---

## 23. Cache Stampede (Dog-Piling) Prevention on Shared Question Banks & Caches

### ❓ Question:
> *"When a high-traffic cache entry (like a trending interview question or system settings) expires in Redis, 500 concurrent requests all miss the cache simultaneously. How do you prevent a Cache Stampede from crushing PostgreSQL?"*

### 💡 Staff-Level Answer:
- **The Problem**:
  - The moment TTL hits 0, all incoming requests see `cache_hit = False`.
  - All 500 workers execute the same heavy SQL join or embedding search simultaneously, causing database CPU spikes, thread contention, and connection pool exhaustion.

- **Current Repository Code**:
  - `services/search-service/app/routes.py` and `services/ai-interviewer-service/app/cache.py` use basic key-value caching with fixed TTL expirations.

- **Staff-Level Mitigations**:
  1. **Mutex Lock (Distributed Single-Flight)**:
     - The first worker that encounters a cache miss acquires a short-lived Redis lock (`SET lock:seed_123 NX PX 3000`).
     - Only that worker queries PostgreSQL and updates the cache.
     - The other 499 requests either wait 50ms and read the refreshed cache or return stale data gracefully.
  2. **Probabilistic Early Expiration (XFetch Algorithm)**:
     - Instead of waiting for TTL to reach 0, workers calculate early expiration using:
       $$\Delta - \beta \cdot \ln(\text{random}()) \times \text{computation\_time} > \text{TTL}$$
     - As TTL nears expiration, the probability of an early background refresh increases smoothly, guaranteeing the cache is refreshed *before* it expires.

**Code References**: [Search Routes](services/search-service/app/routes.py), [AI Cache](services/ai-interviewer-service/app/cache.py).

---

## 24. Handling Poison Pill Messages & Backpressure in RabbitMQ

### ❓ Question:
> *"In an event-driven architecture using RabbitMQ, what is a 'Poison Pill' message? How do you prevent a crashing feedback job from entering an infinite retry loop?"*

### 💡 Staff-Level Answer:
- **The Failure Mode**:
  - A candidate completes an interview, and an event is published to RabbitMQ to generate the feedback report (`feedback-service`).
  - Due to an unexpected edge case (e.g., candidate submitted empty strings for all answers or a zero division in score calculation), the worker throws an unhandled exception.
  - If the consumer fails and issues `basic_nack(requeue=True)` or crashes without an ack, RabbitMQ immediately places the message back at the head of the queue.
  - The worker picks it up again, crashes again, and the queue enters an **infinite crash loop**, consuming 100% CPU and blocking all other candidates' reports.

- **Current Repository Code**:
  - `services/feedback-service/app/routes.py` and `services/code-execution-service/app/queue_manager.py` handle task queues.

- **Staff-Level Solution**:
  1. **Dead Letter Exchange (DLX)**:
     - Configure the RabbitMQ queue with `x-dead-letter-exchange` and `x-dead-letter-routing-key`.
  2. **Retry Counter in Headers**:
     - Increment an `x-retry-count` header on failure.
     - If `retry_count < 3`, requeue with exponential backoff delay.
     - If `retry_count >= 3`, issue `basic_reject(requeue=False)`, routing the poisoned message directly to `feedback.dlq` for developer inspection without stopping production.
  3. **Fair Dispatch (`basic_qos(prefetch_count=1)`)**:
     - Prevents one fast worker from buffering 100 messages into memory while other workers sit idle.

**Code References**: [Feedback Worker](services/feedback-service/app/routes.py), [Execution Queue Manager](services/code-execution-service/app/queue_manager.py).

---

## 25. NGINX Buffer Bloat, Large File Uploads & Reverse Proxy Memory Management

### ❓ Question:
> *"Candidates upload 100MB+ WebM video recordings, while other users are streaming real-time SSE tokens through the same NGINX API Gateway. How do you configure NGINX to prevent memory bloat and streaming delays?"*

### 💡 Staff-Level Answer:
- **The Conflict Between Streaming and File Uploads**:
  - By default, NGINX buffers backend responses in RAM (`proxy_buffering on`).
  - For **Server-Sent Events (SSE)**, buffering destroys the real-time experience: NGINX holds LLM tokens in its internal 4KB buffer until full before sending them to the client.
  - For **Large Video Uploads**, buffering the entire request body in RAM exhausts server memory if multiple candidates upload simultaneously.

- **Implementation in `services/api-gateway/nginx.conf`**:
  ```nginx
  # 1. Disable Buffering for SSE & Long-Lived Streams
  proxy_buffering off;
  proxy_set_header X-Accel-Buffering "no";
  proxy_read_timeout 86400s; # Prevents gateway from terminating 45-min interview streams

  # 2. Disk Spooling for Large Uploads
  client_max_body_size 100M;
  client_body_buffer_size 128k;       # Only first 128KB in RAM
  client_body_temp_path /var/cache/nginx/client_temp 1 2; # Spools rest to disk
  ```

- **Architectural Trade-Off**:
  - While disk spooling protects RAM, disk I/O on the API Gateway is still a bottleneck.
  - The superior cloud architecture is bypassing NGINX entirely for large videos using **Direct S3 Pre-Signed URLs** (see Question 30).

**Code References**: [NGINX Gateway Configuration](services/api-gateway/nginx.conf), [Video Recording Service](services/video-service/src/recordingService.js).

---

## 26. Distributed Deadlocks & Strict Two-Phase Row-Lock Ordering

### ❓ Question:
> *"Suppose two concurrent transactions update both `users` and `subscriptions` tables. How do distributed deadlocks occur in PostgreSQL, and how do you design queries to mathematically prevent them?"*

### 💡 Staff-Level Answer:
- **How Deadlocks Happen**:
  - **Transaction 1 (Plan Upgrade)**:
    1. Locks User row (`id = 'usr_123'`) via `UPDATE users SET quota = ...`
    2. Attempts to update Subscription row (`id = 'sub_456'`)
  - **Transaction 2 (Admin Subscription Reset)**:
    1. Locks Subscription row (`id = 'sub_456'`) via `UPDATE subscriptions ...`
    2. Attempts to update User row (`id = 'usr_123'`)
  - Both transactions block each other indefinitely. PostgreSQL detects this after `deadlock_timeout` (default 1 second) and forcibly cancels one transaction with error `40P01: deadlock detected`.

- **Mathematical Prevention**:
  1. **Strict Global Lock Ordering**: Always acquire locks in the exact same deterministic order across the entire codebase (e.g., always lock `users` before `subscriptions`, or lock rows sorted by primary key UUID: `WHERE id IN ('A', 'B') ORDER BY id FOR UPDATE`).
  2. **Non-Blocking Lock Acquisition**:
     ```sql
     SELECT * FROM users WHERE id = $1 FOR UPDATE NOWAIT;
     ```
     If the row is already locked by another worker, it immediately fails fast with an exception instead of blocking, allowing the application to retry with exponential backoff and jitter.

**Code References**: [User Database](services/user-service/app/database.py), [Payment Database](services/payment-service/app/database.py).

---

## 27. Zero-Downtime Database Schema Migrations (Expand and Contract Pattern)

### ❓ Question:
> *"You need to rename column `total_score` to `composite_score` across 12 microservices running in production. How do you execute this without 500 errors during rolling deployments?"*

### 💡 Staff-Level Answer:
- **The Problem with Direct `ALTER TABLE RENAME COLUMN`**:
  - During a rolling deployment, old service pods (running version $N$) expect `total_score`, while new service pods (running version $N+1$) expect `composite_score`.
  - Renaming the column immediately causes old pods to crash with `ColumnDoesNotExist` errors.

- **The 4-Phase Expand and Contract (Parallel Run) Pattern**:
  ```
  Phase 1 (Expand):    Add new column `composite_score` as NULLABLE.
                       Both columns exist in PostgreSQL.
  
  Phase 2 (Dual-Write): Application Version N+1 writes to BOTH columns.
                       Reads continue from `total_score`.
  
  Phase 3 (Backfill):  Run an asynchronous background script:
                       UPDATE sessions SET composite_score = total_score 
                       WHERE composite_score IS NULL;
  
  Phase 4 (Contract):  Switch application reads to `composite_score`.
                       Drop the deprecated `total_score` column.
  ```

**Code References**: [Orchestrator Models](services/orchestrator-service/app/models.py), [Feedback Models](services/feedback-service/app/models.py).

---

## 28. Redis Sliding Window Rate Limiting vs. Token Bucket: Memory vs. Accuracy

### ❓ Question:
> *"The AI service enforces a rate limit of 30 req/min per session. What data structures can you use in Redis, and what is the memory vs. accuracy trade-off?"*

### 💡 Staff-Level Answer:
- **Comparison of Algorithms**:

| Algorithm | Redis Implementation | Accuracy | Memory per User | Vulnerability |
| :--- | :--- | :--- | :--- | :--- |
| **Fixed Window** | `INCR key` + `EXPIRE 60` | Low | $O(1)$ (~32 bytes) | Boundary burst: Can send 30 req at 0:59 and 30 req at 1:00 (60 req in 2 seconds!) |
| **Sliding Window Log** | `ZADD key timestamp timestamp` | 100% exact | $O(N)$ (stores every timestamp) | Memory bloat under millions of active users |
| **Sliding Window Counter** | Weighted sum of previous & current window counters | ~99% accurate | $O(1)$ (~64 bytes) | Slight approximation, but best for production |

- **Current Repository Code**:
  - `services/ai-interviewer-service/app/ai_limiter.py` uses Redis atomic keys to enforce single-slot concurrency and request counting.

- **Production Atomic Lua Script**:
  - To prevent race conditions between checking the count and incrementing it, use an atomic Redis Lua script (`EVALSHA`):
  ```lua
  local current = redis.call('incr', KEYS[1])
  if current == 1 then
      redis.call('expire', KEYS[1], ARGV[1])
  end
  return current
  ```

**Code References**: [AI Limiter](services/ai-interviewer-service/app/ai_limiter.py).

---

## 29. CPU-Bound AI Whisper Speech-to-Text vs. Async Event Loop Starvation

### ❓ Question:
> *"In `POST /api/v1/interview/transcribe`, the service runs OpenAI Whisper audio transcription. Why does executing Whisper synchronously inside an `async def` handler freeze the entire microservice, and how do you fix it?"*

### 💡 Staff-Level Answer:
- **The Event Loop Starvation Trap**:
  - Python's `asyncio` is single-threaded cooperative multitasking.
  - Whisper involves heavy matrix multiplication and deep neural network CPU/GPU inference.
  - If you call `model.transcribe(audio_file)` directly inside `async def transcribe(...)`, Python does not yield control to the event loop.
  - For the next 3 to 8 seconds, **the entire service stops responding**: health checks fail, incoming HTTP requests queue up, and SSE token streams stall.

- **Current Repository Code**:
  - In `services/ai-interviewer-service/app/routes.py`, audio transcription routes are integrated with FastAPI.

- **The Staff-Level Fix**:
  1. **Threadpool Offloading**:
     ```python
     # Offloads blocking CPU computation to worker threads outside the asyncio event loop:
     transcription = await asyncio.to_thread(whisper_model.transcribe, audio_path)
     ```
  2. **Dedicated GPU Worker Architecture**:
     - For production scale, audio transcription should not run in the web gateway pod at all.
     - The web service writes the audio to S3, publishes an `audio.transcribe` event to RabbitMQ, and a dedicated pool of GPU-equipped Celery/Ray worker nodes processes the audio asynchronously.

**Code References**: [AI Interviewer Routes](services/ai-interviewer-service/app/routes.py).

---

## 30. Direct S3 Pre-Signed URLs vs. Gateway Media Ingestion

### ❓ Question:
> *"When candidate video recordings or resume files are uploaded, why is passing multipart form-data through the API Gateway and backend services considered an architectural antipattern?"*

### 💡 Staff-Level Answer:
- **The Antipattern**:
  - Candidate Browser $\rightarrow$ NGINX Gateway $\rightarrow$ `video-service` / `file-service` $\rightarrow$ AWS S3.
  - A 200MB video recording traverses your backend network twice.
  - NGINX must buffer the stream, Node.js/Python microservices consume hundreds of megabytes of RAM handling multipart byte parsing, and application worker threads are tied up for minutes on slow client uplinks.

- **The Modern Cloud Pattern: Pre-Signed S3 URLs**:
  ```
  Candidate Browser              API Gateway / File Service               AWS S3 / Cloudflare R2
         │                                   │                                      │
         ├─── 1. Request Upload URL ────────►│                                      │
         │    (POST /api/v1/files/upload-url)│                                      │
         │                                   ├─── 2. Generate Pre-Signed URL ──────►│
         │                                   │    (boto3 s3.generate_presigned_url) │
         │◄── 3. Return Pre-Signed S3 URL ───┤                                      │
         │    (Valid for 15 minutes)         │                                      │
         │                                                                          │
         └─────── 4. Stream Binary Directly to Cloud Storage via HTTP PUT ─────────►│
  ```
  - **Benefits**:
    - Zero backend server CPU, RAM, or network bandwidth spent on media ingestion.
    - S3 handles high-throughput multipart streaming and encryption automatically.

**Code References**: [Video Recording Service](services/video-service/src/recordingService.js), [File Storage Adapter](services/file-service/app/storage.py), [S3 Client](services/orchestrator-service/app/s3_service.py).

---

## 31. Microservices Zero-Trust Security: Mutual TLS (mTLS) & Network Segmentation

### ❓ Question:
> *"All 12 microservices run on a single Docker bridge network. If an attacker achieves code execution inside the `code-execution-service`, what can they access, and how do you implement Zero-Trust segmentation?"*

### 💡 Staff-Level Answer:
- **The Threat Landscape**:
  - On a standard flat Docker bridge network (`docker-compose.yml`), every container can resolve and ping every other container's internal DNS name.
  - If a candidate escapes the code runner, they can issue HTTP requests directly to:
    - `http://auth-service:8001` (attempting token forgery or user enumeration)
    - `http://payment-service:8010` (manipulating subscription records)
    - `postgres:5432` (attempting password brute-force or dictionary attacks)

- **Zero-Trust Hardening**:
  1. **Docker Network Segmentation**:
     - Split the single network into isolated sub-networks:
       - `dmz-network`: API Gateway + Frontend.
       - `internal-services`: Orchestrator, AI Interviewer, User, Feedback.
       - `isolated-sandbox`: Code execution runner has **zero network interfaces** (`--network=none`).
     - The `code-execution-service` has no physical route to the PostgreSQL or Auth Service network.
  2. **Mutual TLS (mTLS) via Service Mesh (Istio / Envoy)**:
     - Every service possesses a cryptographic X.509 certificate issued by a private CA (e.g., HashiCorp Vault or SPIFFE/SPIRE).
     - Every inter-service HTTP call is encrypted with TLS 1.3 and requires bi-directional certificate verification, guaranteeing that only the Orchestrator is authorized to call the AI Interviewer.

**Code References**: [Docker Compose Networks](docker-compose.yml), [NGINX Gateway](services/api-gateway/nginx.conf).

---

## 32. Canonical JSON Serialization for Deterministic Idempotency Keys

### ❓ Question:
> *"The idempotency middleware hashes request bodies with SHA-256. What happens if a client sends `{ "a": 1, "b": 2 }` in request 1, and `{ "b": 2, "a": 1 }` with whitespace in request 2? How do you guarantee deterministic hashing?"*

### 💡 Staff-Level Answer:
- **The Subtle Bug**:
  - Raw JSON strings depend on client serializer formatting, key ordering, and whitespace.
  - Standard SHA-256 hashing of the raw request payload produces two completely different hashes for semantically identical JSON payloads:
    - `sha256('{"a":1,"b":2}')` $\neq$ `sha256('{"b": 2, "a": 1}')`
  - The second request bypasses idempotency protection and executes duplicate side-effects.

- **Current Repository Code**:
  - `services/orchestrator-service/app/idempotency.py` parses and fingerprints request payloads.

- **The Canonical Solution**:
  - Parse the raw body into an AST/dictionary, sort keys recursively, and serialize with strict canonical delimiters:
  ```python
  import json
  import hashlib

  def compute_canonical_hash(payload: dict) -> str:
      canonical_bytes = json.dumps(
          payload,
          sort_keys=True,
          separators=(',', ':'), # Eliminates all whitespace
          ensure_ascii=True
      ).encode('utf-8')
      return hashlib.sha256(canonical_bytes).hexdigest()
  ```

**Code References**: [Idempotency Middleware](services/orchestrator-service/app/idempotency.py).

---

## 33. Graceful Process Shutdown & In-Flight Connection Draining

### ❓ Question:
> *"When deploying a new version of the Orchestrator service to Kubernetes or Docker Swarm, what happens to active 45-minute SSE streams and database transactions when `SIGTERM` is sent?"*

### 💡 Staff-Level Answer:
- **The Failure Mode**:
  - Without graceful shutdown, the process terminates immediately.
  - Candidates in the middle of answering a question experience connection drops (`ECONNRESET`).
  - Active PostgreSQL transactions are aborted, leaving uncommitted state or orphaned lock keys in Redis.

- **Current Repository Code**:
  - `services/orchestrator-service/app/main.py` uses FastAPI's `lifespan` context manager.

- **The Graceful Shutdown Flow**:
  1. **Stop Health Checks**: The readiness probe immediately reports `503 Service Unavailable`, prompting the load balancer to stop routing new traffic to this pod.
  2. **Draining Window**: The server waits a configured grace period (e.g., 30 seconds) allowing in-flight turns and short-lived HTTP queries to finish.
  3. **Notify Long-Lived Streams**: For long-lived SSE connections, yield a graceful reconnect control event:
     `data: {"type": "RECONNECT_PENDING"}\n\n`
     The frontend hook catches this and reconnects to a fresh healthy replica.
  4. **Flush Resources**: Close the AsyncPG pool gracefully (`await db.pool.close()`) and release Redis connections.

**Code References**: [Orchestrator Lifespan](services/orchestrator-service/app/main.py), [Video Service Entry](services/video-service/src/index.js).

---

## 34. Write-Ahead Logging (WAL) vs. Redis Persistence (RDB/AOF) Durability Guarantees

### ❓ Question:
> *"If the cloud server suffers an unexpected hardware crash or power outage, what data survives, what is lost, and why did you divide responsibilities between PostgreSQL and Redis?"*

### 💡 Staff-Level Answer:
- **PostgreSQL Durability (ACID Guarantees)**:
  - Every committed transaction writes to the **Write-Ahead Log (WAL)** on non-volatile disk before acknowledging success to the client.
  - On restart, PostgreSQL performs crash recovery by replaying WAL records.
  - **Verdict**: Zero data loss for completed interview turns, session states, and payment audit logs.

- **Redis Persistence (In-Memory Speed vs. Durability Trade-off)**:
  - By default, Redis uses snapshotting (**RDB**) every few minutes or Append-Only File (**AOF**) with `appendfsync everysec`.
  - In a sudden power outage, Redis can lose up to **1 second of writes**.
  - **Architectural Decision in DevMeet**:
    - We intentionally place only ephemeral, rebuildable, or soft-state data in Redis: distributed locks with auto-expirations, sliding-window rate limit counters, and temporary session caches.
    - We never rely on Redis as the sole durable source of truth for business data.

**Code References**: [Orchestrator Database](services/orchestrator-service/app/database.py), [Redis Client](services/orchestrator-service/app/redis_client.py), [Payment Database](services/payment-service/app/database.py).

---

## 35. Database Sharding & Partitioning for Massive Transcript Growth

### ❓ Question:
> *"After conducting 10,000,000 interviews, the `interview_turns` table contains 200,000,000 rows, making B-tree indexes huge and analytical queries slow. How do you partition this table in PostgreSQL?"*

### 💡 Staff-Level Answer:
- **The Performance Problem at Scale**:
  - Once a table exceeds available RAM, B-tree index lookups require physical disk I/O.
  - Autovacuum workers take hours to scan the entire 200M row table, causing write amplification and table bloat.

- **PostgreSQL Declarative Partitioning Strategy**:
  1. **Range Partitioning by Month**:
     ```sql
     CREATE TABLE interview_turns (
         id UUID NOT NULL,
         session_id UUID NOT NULL,
         role VARCHAR(32) NOT NULL,
         content TEXT NOT NULL,
         created_at TIMESTAMPTZ NOT NULL,
         PRIMARY KEY (id, created_at)
     ) PARTITION BY RANGE (created_at);

     -- Monthly Child Tables:
     CREATE TABLE interview_turns_2026_10 PARTITION OF interview_turns
         FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
     ```
  2. **Partition Pruning**:
     - When the Orchestrator queries turns for an active session (`WHERE created_at >= NOW() - INTERVAL '2 hours'`), PostgreSQL automatically excludes all other partitions from disk scans.
  3. **Zero-Impact Archival**:
     - To purge or archive 2-year-old turns, instead of running a massive `DELETE FROM interview_turns WHERE created_at < ...` (which locks tables and generates millions of WAL entries), simply execute:
       `ALTER TABLE interview_turns DETACH PARTITION interview_turns_2024_10;`
       followed by dropping or exporting that single partition in milliseconds!

**Code References**: [Orchestrator Models](services/orchestrator-service/app/models.py), [Session Routers](services/orchestrator-service/app/routers/turns.py).

---

## 🧭 Interview Master Index

| Part | Document | Primary Focus |
| :---: | :--- | :--- |
| **1** | [`INTERVIEW_DEEP_DIVE_QA.md`](./INTERVIEW_DEEP_DIVE_QA.md) | Full-stack project pitch, SSE vs. WebSockets, Docker Sandboxing, LiveKit SFU, Edge AI Proctoring |
| **2** | [`BACKEND_SYSTEM_DESIGN_DEEP_DIVE.md`](./BACKEND_SYSTEM_DESIGN_DEEP_DIVE.md) | Core backend consistency, Sagas, FSM state machines, Redis locks, Outbox pattern, Idempotency |
| **3** | [`ADVANCED_BACKEND_SYSTEM_DESIGN_QA.md`](./ADVANCED_BACKEND_SYSTEM_DESIGN_QA.md) | Staff-level edge cases: Pool starvation, gVisor sandboxing, cache stampedes, poison pills, deadlocks, partitioning |
