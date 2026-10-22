# DevMeet Backend: Next-Level Interview Questions and Answers

This is a separate companion to [INTERVIEW_DEEP_DIVE_QA.md](./INTERVIEW_DEEP_DIVE_QA.md). That guide explains the main product flow; this one prepares for deeper backend questions about consistency, concurrency, retries, security boundaries, and operating the services.

The answers below distinguish what the repository implements from what would be a sensible improvement. When discussing a limitation, frame it as an engineering observation and explain how you would improve it.

## How to use this guide

For each question, give the short answer first, point to the implementation, then discuss the failure case and trade-off. Avoid claiming “exactly once,” “fully secure,” or “highly available” unless the code actually provides those guarantees.

## 1. If interview creation calls multiple services, how do you keep quota and session state consistent?

**Answer:**

The Orchestrator checks quota through User Service, checks for another active interview, fetches an optional seed question, and then creates its own PostgreSQL session. These operations cross service/database boundaries, so they are not one ACID transaction. For example, quota can be consumed before a later session insert fails.

The current create route has a per-user Redis lock, which reduces simultaneous creation attempts when Redis is healthy. A stronger production flow would reserve quota with an idempotent reservation ID, create the session, then commit the reservation; on failure it would release the reservation. This is a small saga/compensation flow, not a distributed database transaction.

**Code references:** [session creation route](services/orchestrator-service/app/routers/sessions.py), [Orchestrator service clients](services/orchestrator-service/app/clients.py), [quota update](services/user-service/app/database.py), [Redis lock](services/orchestrator-service/app/redis_client.py).

## 2. Does the idempotency implementation guarantee that a mutation only runs once?

**Answer:**

It provides useful retry protection for routes that call `check_idempotency()`: it hashes the raw request body, records a key per user, rejects a key reused with a different body, and can return a stored response after completion. But it is not a universal exactly-once guarantee.

The lookup is scoped by key and user, but not by endpoint, even though the endpoint is stored in the row. Also, two first-time requests can both observe no existing row before the upsert and then both proceed with the side effect. A stronger design would scope the idempotency key by user, HTTP method, and route; atomically claim it with a unique insert/conditional update; and commit the idempotency result in the same database transaction as the side effect whenever possible. For calls to another service, use a reservation/saga or an idempotent downstream operation.

**Code references:** [idempotency helper](services/orchestrator-service/app/idempotency.py), [session creation](services/orchestrator-service/app/routers/sessions.py), [session completion](services/orchestrator-service/app/routers/sessions.py).

## 3. What is the difference between validating a state transition and making it concurrency-safe?

**Answer:**

`validate_state_transition()` checks whether a transition is permitted by the finite-state-machine table. That is a useful business rule, but by itself it does not serialize simultaneous requests. A request can read `in_progress`, another request can also read `in_progress`, and both can then attempt different valid transitions.

The current start/completion routes validate a previously read status and later update the database by session ID. For stronger concurrency control, perform a conditional update such as “update only where status is the expected old status” and check whether exactly one row changed, or lock the session row inside a transaction. The Redis lock can also help for selected operations, but its scope and availability must be considered separately.

**Code references:** [state transition rules](services/orchestrator-service/app/models.py), [start and complete routes](services/orchestrator-service/app/routers/sessions.py), [session database methods](services/orchestrator-service/app/database.py).

## 4. What does the Redis lock guarantee, and what happens if a request outlives its lease?

**Answer:**

The lock uses Redis `SET NX` with an expiration and a random ownership token. The Lua release script deletes the lock only if the token still matches, which avoids one request deleting a later request’s lock after the original lease expires.

The lock is still a time-limited lease, not an unlimited critical section. If an operation runs beyond the 10-second default lease, another request may acquire the lock while the first is still running. In addition, Redis failures intentionally fall back to proceeding without the lock. That keeps some requests available but weakens the concurrency guarantee. Critical invariants should therefore also be protected by database constraints or conditional updates; lock duration and operation timeouts should be designed together.

**Code references:** [RedisLock.acquire_lock()](services/orchestrator-service/app/redis_client.py), [session creation route](services/orchestrator-service/app/routers/sessions.py).

## 5. Is the completion outbox exactly-once, and what changes when the Orchestrator has multiple replicas?

**Answer:**

The session update and insertion of the outbox row happen in one PostgreSQL transaction. That prevents the classic failure where the session says “completed” but no event was saved. The worker polls unpublished rows, calls Feedback Service, and marks a row published after a successful response.

That is a retryable, at-least-once style delivery path—not exactly-once processing. If Feedback Service accepts the request and the worker crashes before marking the row published, the event can be delivered again. Also, the polling query does not claim rows with a lock or `SKIP LOCKED`; multiple Orchestrator replicas can select the same unpublished row. Production hardening would add atomic event claiming/leases, bounded retry/backoff and dead-letter handling, plus an idempotent consumer keyed by event ID or session ID.

**Code references:** [transactional completion route](services/orchestrator-service/app/routers/sessions.py), [outbox worker](services/orchestrator-service/app/outbox.py), [Feedback Service report upsert](services/feedback-service/app/database.py).

## 6. What can go wrong between Redis job status and RabbitMQ when code execution is queued?

**Answer:**

The submission path first writes `pending` to Redis, then publishes a persistent message to a durable RabbitMQ queue. A worker processes one message at a time (`prefetch_count=1`), stores the result in Redis, and acknowledges the message.

Those two writes are not atomic. If Redis says `pending` but publishing fails, the client can see a job that will never run. If a worker finishes execution but fails before saving the result, the message may be redelivered and executed again. The publisher also does not show publisher-confirm handling. On worker errors it uses `basic_nack(requeue=False)`; the queue declaration shown does not configure a dead-letter exchange, so a rejected message may be discarded. Improvements include publisher confirms, explicit queue/DLX policy, idempotent job execution/result writes, and reconciliation for jobs that remain pending too long.

There is also a response-shape issue to be aware of: the status endpoint treats every non-`pending` Redis state as `completed`, including a worker-written `error` state. A clearer API would return the stored state directly and define `queued`, `running`, `succeeded`, `failed`, and `timed_out` consistently.

**Code references:** [async job submission and status routes](services/code-execution-service/app/routes.py), [RabbitMQ publisher and worker](services/code-execution-service/app/queue_manager.py).

## 7. How does the session cache affect consistency after an update?

**Answer:**

`get_session_cached()` reads session JSON from Redis first and falls back to PostgreSQL on a cache miss. The session update routes invalidate the cache after writing to PostgreSQL. This reduces repeated database reads, but the cache is not the source of truth.

A race is possible if one request reads an old PostgreSQL value, another request commits a new value and invalidates the cache, and then the first request writes its stale value into Redis. That can leave stale data cached until expiration or another invalidation. A stronger approach can use versioned cache entries, write-through updates, or a compare-and-set invalidation strategy. The database should remain authoritative for ownership checks and state transitions.

**Code references:** [session cache helper](services/orchestrator-service/app/routers/deps.py), [Redis cache operations](services/orchestrator-service/app/redis_client.py), [session lifecycle routes](services/orchestrator-service/app/routers/sessions.py).

## 8. How safe is the interview quota check under concurrent requests?

**Answer:**

User Service creates default plan/quota rows with upserts, checks the plan limit, reads current counters, and then updates the counters. The individual SQL `UPDATE` is atomic, but the overall “read count → compare with limit → increment” sequence is not enclosed in a transaction that locks the quota row.

Two independent requests can read the same remaining quota and both pass the limit check before either update completes. The Orchestrator’s per-user lock reduces this risk for its session-creation path while Redis is healthy, but it is not a substitute for making the quota operation itself atomic. A robust implementation would use a transaction with `SELECT ... FOR UPDATE`, or a conditional `UPDATE ... WHERE count < limit RETURNING ...`, and test simultaneous requests at the final available credit.

**Code references:** [quota increment implementation](services/user-service/app/database.py), [Orchestrator quota client](services/orchestrator-service/app/clients.py), [session creation lock](services/orchestrator-service/app/routers/sessions.py).

## 9. What are the availability and security trade-offs of JWT revocation through Redis?

**Answer:**

Auth Service signs short-lived access tokens and longer-lived refresh tokens. It also uses a Redis token-version value for logout-all/password-change revocation and a blacklist for individual logouts and rotated refresh tokens. Refresh tokens are returned in an HttpOnly cookie.

This makes revocation depend on Redis availability. Several Redis error paths fall back permissively: for example, token-version lookup returns zero when Redis is unavailable, and blacklist checks catch broad exceptions. That improves availability but can allow a token that would otherwise be revoked to continue working during a Redis outage. The Auth Manager also has a development fallback signing secret; deployments must ensure a strong secret is supplied rather than relying on that default. A production design should make the fail-open/fail-closed policy explicit, keep secrets in a secret manager, monitor Redis errors, and test refresh-token replay and revocation behavior.

**Code references:** [JWT and password helpers](services/auth-service/app/auth.py), [token validation and refresh routes](services/auth-service/app/routes.py).

## 10. Are the AI rate limit and token budget sufficient to control model costs?

**Answer:**

The AI limiter has a per-user sliding-window request limit, a concurrency slot, and a per-session token-budget check. Redis is used for these counters. The service also has model fallbacks and heuristic/progressive fallback behavior for some provider failures.

The safeguards are not equally strong: the limiter permits requests if Redis is unavailable, and the streaming endpoint checks the token budget but does not call the separate token-recording function that increments cumulative usage. As a result, the streaming path should not be described as enforcing a complete 50,000-token session cap. A robust cost-control design would record provider-reported usage for every streaming completion, make the increment atomic, define behavior when Redis is down, and alert on per-user and per-provider spend.

**Code references:** [AI limiter](services/ai-interviewer-service/app/ai_limiter.py), [streaming question endpoint](services/ai-interviewer-service/app/routes.py), [AI manager token accounting](services/ai-interviewer-service/app/ai_manager.py).

## 11. How should timeouts and retries be designed across the service call chain?

**Answer:**

The Orchestrator uses a shared asynchronous HTTP client and sets timeouts on some calls, such as the seed lookup. The AI service can rotate models or fall back to a progressive question. The NGINX AI route disables response buffering and has a longer read timeout to support streaming.

A timeout does not prove the downstream operation failed: the server may have completed work after the caller stopped waiting. Retrying a non-idempotent mutation can therefore duplicate side effects. Each hop should have a bounded timeout that fits inside the caller’s deadline; retries should be limited to safe/idempotent operations, use backoff and jitter, and preserve a request or operation ID. Streaming also needs cancellation propagation so abandoned browser requests do not unnecessarily continue consuming provider capacity.

**Code references:** [Orchestrator HTTP clients](services/orchestrator-service/app/clients.py), [AI stream endpoint](services/ai-interviewer-service/app/routes.py), [NGINX AI proxy settings](services/api-gateway/nginx.conf), [AI limiter concurrency slot](services/ai-interviewer-service/app/ai_limiter.py).

## 12. What does the current request ID provide, and what is still missing for tracing?

**Answer:**

The Orchestrator middleware preserves an incoming `X-Request-ID` or creates a UUID, puts it on request state, logs the method/path/status/duration, and echoes the ID in the response. Some Orchestrator-to-service calls explicitly pass the ID onward.

This is useful correlation logging, but it is not a full distributed tracing system. A request ID does not automatically capture child spans, queue wait time, database latency, or the relationship between a queued job and its later worker execution. I would propagate trace context through every HTTP and queue message, add structured service/job/session fields, and measure outbox age, queue depth, AI first-token latency, execution duration, and error rates.

**Code references:** [request ID middleware](services/orchestrator-service/app/middleware.py), [Orchestrator clients](services/orchestrator-service/app/clients.py), [execution queue payload](services/code-execution-service/app/queue_manager.py).

## 13. Is the feedback percentile based on real candidate data?

**Answer:**

The Feedback Service can use an LLM evaluation or local heuristic fallback to produce feedback. Percentile calculation, however, uses a static mapping from score bands to percentile values by interview type and difficulty. The returned peer-group size is a fixed value in that mapping; it is not calculated from a live database cohort in this implementation.

I would describe it as a configured benchmark estimate, not an empirically computed ranking of actual candidates. To make it a real cohort percentile, collect appropriately consented and de-identified historical scores, define cohort size and recency rules, and calculate the rank from that data. The UI should label a heuristic estimate clearly so users do not mistake it for measured population statistics.

**Code references:** [percentile lookup](services/feedback-service/app/percentiles.py), [feedback generation flow](services/feedback-service/app/generator.py), [feedback route](services/feedback-service/app/routes.py).

## 14. What does horizontal scaling change for these backend services?

**Answer:**

PostgreSQL, Redis, and RabbitMQ can provide shared state across service instances, but not every module uses shared storage for all runtime state. Video Service room records, participant sets, and quality samples are in process memory. A restart loses them, and two replicas can report different in-memory views.

If the feature needs consistent state across replicas, move authoritative room metadata and telemetry to shared storage, or explicitly treat the data as best-effort diagnostics while LiveKit remains authoritative for actual rooms. Also consider worker scaling: multiple outbox consumers need atomic event claiming, while multiple RabbitMQ workers need defined concurrency and resource limits. Scaling replicas without addressing these assumptions can make behavior less predictable rather than more available.

**Code references:** [Video Service room manager](services/video-service/src/roomManager.js), [outbox worker](services/orchestrator-service/app/outbox.py), [execution queue worker](services/code-execution-service/app/queue_manager.py), [Docker Compose services](docker-compose.yml).

## 15. Does an endpoint marked `async` necessarily avoid blocking the server?

**Answer:**

No. `async def` helps when the handler awaits non-blocking I/O, but a synchronous library call inside it still blocks that event loop. For example, the File Service storage adapter uses synchronous boto3 operations for some S3 calls, while its API methods are asynchronous. Large file reads and synchronous S3 operations can therefore occupy a request worker during I/O.

For production workloads, use an async-capable storage client or move blocking calls to a thread pool/worker. For large uploads, stream data in bounded chunks instead of reading the entire request into memory, enforce limits at both the gateway and application, and measure memory use under concurrent upload load.

**Code references:** [File Service storage manager](services/file-service/app/storage.py), [file upload routes](services/file-service/app/routes.py), [NGINX upload limits](services/api-gateway/nginx.conf).

## 16. How would you separate liveness from readiness?

**Answer:**

A liveness check answers “is this process running and able to make progress?” A readiness check answers “should this instance receive work right now?” They should not be conflated. The Orchestrator `/health` handler currently returns a static healthy response; it does not test PostgreSQL, Redis, or Feedback Service.

I would keep liveness lightweight so a temporary database outage does not cause a restart loop, and add readiness checks for dependencies required to serve a particular operation. For optional systems, report degraded capability rather than making the whole service unready. Health endpoints should avoid exposing secrets and should have bounded dependency timeouts.

**Code references:** [Orchestrator health and lifespan](services/orchestrator-service/app/main.py), [database pool](services/orchestrator-service/app/database.py), [Redis client](services/orchestrator-service/app/redis_client.py).

## 17. What is the value of keeping service-owned data separate if the services share PostgreSQL?

**Answer:**

The repository splits behavior into service modules, but local services connect to shared PostgreSQL infrastructure. Service boundaries still help organize ownership and APIs, but they do not automatically provide independent databases or complete data isolation.

At scale, I would document which service owns each table and require other services to use its API or event contract rather than writing directly into its tables. Database/schema permissions can enforce that boundary. The trade-off is that stronger ownership reduces accidental coupling but increases API/event design work and makes cross-service workflows more explicit.

**Code references:** [Docker Compose database and services](docker-compose.yml), [Orchestrator database layer](services/orchestrator-service/app/database.py), [Feedback database layer](services/feedback-service/app/database.py), [Orchestrator service clients](services/orchestrator-service/app/clients.py).

## 18. What should happen when an upstream dependency is unhealthy?

**Answer:**

The answer depends on whether the dependency is essential to the specific operation. If Search Service is unavailable during session creation, the current seed lookup can return no seed and allow the session to continue. If PostgreSQL is unavailable, the Orchestrator cannot durably create or transition a session and should fail that operation clearly. If an LLM provider is unavailable, the AI service can use fallback question generation.

The important design is to make degradation explicit: return a valid alternative only when it preserves the operation’s meaning, otherwise return a clear retryable failure. Avoid returning success-shaped data when a required side effect did not happen. Use bounded timeouts, circuit breakers where appropriate, clear error codes, and tests that simulate each dependency outage.

**Code references:** [seed lookup client](services/orchestrator-service/app/clients.py), [AI fallback path](services/ai-interviewer-service/app/routes.py), [AI circuit breaker](services/ai-interviewer-service/app/circuit_breaker.py), [Orchestrator database connection](services/orchestrator-service/app/database.py).

## 19. How would you test a backend workflow that spans services and queues?

**Answer:**

I would test at several levels:

1. Unit-test the state transition rules, idempotency fingerprinting, limiter behavior, and message/result serialization.
2. Route-test authorization, validation, duplicate requests, and error responses with service clients mocked.
3. Integration-test PostgreSQL transactions, Redis locks/cache, RabbitMQ acknowledgements, and outbox retry behavior using real test dependencies.
4. Add failure-injection tests: crash after publishing but before acknowledging, timeout after downstream success, Redis unavailable, duplicate outbox delivery, and concurrent quota attempts at the limit.
5. Add end-to-end assertions that a completed session eventually gets one stored report and that a queued execution reaches a terminal status.

The key is to test observable guarantees and failure windows, not merely whether each endpoint returns HTTP 200.

**Code references:** [Orchestrator tests](services/orchestrator-service/app/test_orchestrator.py), [AI tests](services/ai-interviewer-service/app/test_ai_interviewer.py), [execution tests](services/code-execution-service/app/test_code_execution.py), [Feedback tests](services/feedback-service/app/test_feedback.py).

## 20. What would you fix first after this backend review?

**Answer:**

I would start with correctness at asynchronous boundaries:

1. Make quota check-and-increment atomic, and make session creation compensate for downstream failures.
2. Scope and claim idempotency keys atomically.
3. Protect session transitions and transcript sequencing with database-level concurrency controls.
4. Claim outbox events safely across replicas and make the Feedback consumer idempotent.
5. Add RabbitMQ publisher confirms, dead-letter handling, and consistent terminal job states.
6. Record actual streamed-token usage and define whether limits fail open or closed.
7. Add readiness checks and metrics for queue depth, pending outbox age, cache errors, and dependency latency.

I would ship these in small steps with regression tests, because changing consistency semantics can affect existing clients and stored data.

**Code references:** [quota update](services/user-service/app/database.py), [idempotency helper](services/orchestrator-service/app/idempotency.py), [turn route](services/orchestrator-service/app/routers/turns.py), [outbox worker](services/orchestrator-service/app/outbox.py), [execution queue](services/code-execution-service/app/queue_manager.py), [AI token limiter](services/ai-interviewer-service/app/ai_limiter.py).

## 21. What happens when AsyncPG connection pools are exhausted under 1,000 concurrent requests?

**Answer:**

Each service configures `asyncpg.create_pool(min_size=2, max_size=10)`. When 1,000 concurrent coroutines hit FastAPI, only 10 can execute SQL queries concurrently. The remaining 990 are queued in memory waiting for a free connection. If any handler holds a connection across an external HTTP call (e.g. calling the LLM or Search Service), connection hold time spikes, leading to cascading connection timeouts and memory bloat.

To prevent this:
1. Never hold a database connection across external I/O boundaries; acquire only for immediate SQL execution and release immediately.
2. Set a bounded `acquire_timeout=2.0s` so the server fails fast with HTTP 503 rather than queuing indefinitely.
3. Deploy PgBouncer in transaction pooling mode to multiplex thousands of incoming coroutines down to 50 physical backend PostgreSQL connections.

**Code references:** [Orchestrator database pool](services/orchestrator-service/app/database.py), [Payment database pool](services/payment-service/app/database.py).

## 22. What are the security risks of mounting `/var/run/docker.sock` in code execution, and how would you isolate it?

**Answer:**

Mounting `/var/run/docker.sock` in `code-execution-service` allows it to spawn sibling runner containers directly on the host Docker daemon. Because the Docker daemon runs as root on the host, any process that can communicate with the Docker socket effectively has root access to the entire host system (Docker-out-of-Docker vulnerability).

While our runner applies strict cgroups (`--memory=512m`, `--pids-limit=64`, `--network=none`, `--read-only`), a kernel exploit or container escape could still compromise the host. For true multi-tenant cloud hardening, I would:
1. Replace `runc` with Google gVisor (`runsc`), which implements an application kernel in user space that intercepts all Linux syscalls.
2. Use microVMs (AWS Firecracker) that spin up in under 5ms with dedicated guest kernels, providing hardware-level hypervisor virtualization.
3. Run the Docker daemon in rootless mode so escapes cannot compromise host root privileges.

**Code references:** [Code executor](services/code-execution-service/app/executor.py), [Docker Compose](docker-compose.yml).

## 23. How do you prevent a Cache Stampede (Dog-Piling) on shared question seeds or system caches?

**Answer:**

When a popular seed question or configuration item expires in Redis, multiple concurrent requests can encounter a cache miss at the exact same millisecond. All requests then hit PostgreSQL with identical heavy queries simultaneously, causing CPU spikes and connection pool starvation.

To mitigate this:
1. **Distributed Mutex Lock**: The first worker to encounter a cache miss acquires a short-lived Redis lock (`SET lock:seed_id NX PX 3000`). Only that worker queries the database and populates the cache; all other workers await the updated cache or return a stale cached value.
2. **Probabilistic Early Expiration (XFetch Algorithm)**: Calculate early expiration probabilistically based on read frequency and computation time, ensuring the cache is refreshed in the background before reaching TTL zero.

**Code references:** [Search routes](services/search-service/app/routes.py), [AI cache](services/ai-interviewer-service/app/cache.py).

## 24. How do you handle Poison Pill messages and backpressure in RabbitMQ?

**Answer:**

A poison pill message is a payload that causes the consumer worker to crash every time it is processed (for example, malformed data triggering an unhandled exception). If the worker crashes or executes `basic_nack(requeue=True)`, RabbitMQ immediately requeues the message, triggering an infinite crash loop that blocks all subsequent messages.

The production pattern:
1. Track retry attempts via an `x-retry-count` message header.
2. If retries exceed a threshold (e.g., 3 attempts), issue `basic_reject(requeue=False)` and route the payload to a Dead Letter Exchange (DLX) that forwards to `feedback.dlq` for developer debugging.
3. Enforce `basic_qos(prefetch_count=1)` on all consumers so workers pull one message at a time, preventing uneven backlog distribution and worker memory saturation.

**Code references:** [Feedback routes](services/feedback-service/app/routes.py), [Execution queue manager](services/code-execution-service/app/queue_manager.py).

## 25. How does NGINX reverse-proxy buffering affect real-time SSE streams and large video uploads?

**Answer:**

By default, NGINX buffers responses in memory (`proxy_buffering on`). For Server-Sent Events (SSE), buffering destroys the real-time experience because NGINX holds LLM tokens until its internal 4KB buffer is filled before flushing them to the client. Conversely, for large WebM video uploads (100MB+), buffering the entire request body in RAM can exhaust server memory under concurrent load.

In `services/api-gateway/nginx.conf`:
1. We set `proxy_buffering off` and `proxy_set_header X-Accel-Buffering "no"` on streaming endpoints to pass tokens immediately to the client.
2. For large media uploads, we set `client_body_buffer_size 128k` and configure `client_body_temp_path` to spool excess bytes to disk rather than keeping them in RAM.
3. For long-running interview streams, `proxy_read_timeout 86400s` prevents NGINX from prematurely dropping connections.

**Code references:** [NGINX config](services/api-gateway/nginx.conf), [Video recording service](services/video-service/src/recordingService.js).

## 26. How do distributed deadlocks occur across database tables, and how do you design queries to prevent them?

**Answer:**

Deadlocks occur when two concurrent transactions attempt to lock the same resources in opposite orders:
- Transaction 1: Locks `users` row A $\rightarrow$ waits to lock `subscriptions` row B.
- Transaction 2: Locks `subscriptions` row B $\rightarrow$ waits to lock `users` row A.
PostgreSQL detects this circular dependency after `deadlock_timeout` (default 1 second) and forcibly terminates one transaction with error `40P01`.

Prevention strategies:
1. **Strict Global Lock Ordering**: Always acquire locks in the exact same order across all codebase services (e.g., always update `users` before `subscriptions`, or lock rows sorted by primary key).
2. **Fail-Fast with NOWAIT**: Use `SELECT ... FOR UPDATE NOWAIT` or `SKIP LOCKED` so queries fail immediately rather than waiting and forming a deadlock chain, allowing the client to retry with exponential backoff and jitter.

**Code references:** [User database](services/user-service/app/database.py), [Payment database](services/payment-service/app/database.py).

## 27. How do you execute zero-downtime database schema migrations across 12 microservices?

**Answer:**

A direct `ALTER TABLE RENAME COLUMN` breaks rolling deployments because old application pods still query the old column name while new pods query the new one.

We use the **Expand and Contract (Parallel Run)** migration pattern:
1. **Expand**: Add the new column as `NULLABLE`. Both columns now exist in the database.
2. **Dual-Write**: Deploy version $N+1$ of the application to write to both the old and new columns simultaneously while reading from the old column.
3. **Backfill**: Run an asynchronous background batch job to copy historical data from the old column to the new column.
4. **Contract**: Deploy version $N+2$ to read from the new column, and finally drop the old column in a subsequent migration once all replicas have transitioned.

**Code references:** [Orchestrator models](services/orchestrator-service/app/models.py), [Feedback models](services/feedback-service/app/models.py).

## 28. What are the memory and accuracy trade-offs between Redis rate limiting algorithms?

**Answer:**

The AI service limits requests to 30 req/min per session to control model inference costs.
1. **Fixed Window**: Uses `INCR` + `EXPIRE`. Memory is $O(1)$ (~32 bytes), but vulnerable to boundary bursts where a user can send 30 requests at second 59 and 30 requests at second 61 (60 requests in 2 seconds).
2. **Sliding Window Log**: Uses Redis `ZSET` storing each request timestamp. Provides 100% precision, but memory scales as $O(N)$ with request volume, causing memory bloat under high throughput.
3. **Sliding Window Counter**: Estimates current usage by taking a weighted sum of the previous and current window counters. Memory is $O(1)$ (~64 bytes) with ~99% accuracy, making it the ideal production compromise.

To prevent race conditions during window checks, the increment and expiry must be executed atomically using a Redis Lua script (`EVALSHA`).

**Code references:** [AI Limiter](services/ai-interviewer-service/app/ai_limiter.py).

## 29. Why does synchronous Whisper STT inference freeze an asynchronous Python web service?

**Answer:**

FastAPI runs on a single-threaded `asyncio` event loop. Speech-to-text models like OpenAI Whisper are CPU-bound and execute heavy matrix multiplications. If `model.transcribe()` is called synchronously inside an `async def` route handler, it blocks the entire event loop thread for 3 to 8 seconds.

During this block, the server cannot process any other incoming HTTP requests, health checks fail, and active SSE token streams stall.

Solutions:
1. Offload the synchronous model call to an async threadpool: `await asyncio.to_thread(whisper.transcribe, audio)`.
2. In production, decouple audio transcription completely: upload audio to S3, publish a task to RabbitMQ, and let dedicated GPU worker nodes execute Whisper asynchronously.

**Code references:** [AI Interviewer routes](services/ai-interviewer-service/app/routes.py).

## 30. Why is passing large media files through the API Gateway an antipattern, and how do Pre-Signed S3 URLs solve it?

**Answer:**

Allowing candidate video recordings (100MB+) to upload through NGINX and Node.js/Python microservices forces the server to buffer and parse multipart binaries in memory, consuming backend CPU, RAM, and network bandwidth twice (client $\rightarrow$ server $\rightarrow$ S3).

The cloud pattern is **Direct-to-S3 Pre-Signed URLs**:
1. Client requests an upload ticket: `POST /api/v1/files/upload-url`.
2. Backend validates auth and quota, and generates an ephemeral cryptographic Pre-Signed URL using AWS S3 SDK (`generate_presigned_url('put_object')`, valid for 15 minutes).
3. Client browser streams the video blob directly to S3 via HTTP `PUT`.
This offloads 100% of the media transfer bandwidth and storage I/O from backend application servers.

**Code references:** [Video recording service](services/video-service/src/recordingService.js), [File storage manager](services/file-service/app/storage.py).

## 31. How do you implement Zero-Trust network segmentation across containerized microservices?

**Answer:**

By default, Docker Compose places all containers on a flat bridge network where any container can reach any other container's open ports. If a candidate escapes a code-runner sandbox, they could reach `auth-service:8001` or `postgres:5432` directly.

Zero-Trust hardening:
1. **Network Segmentation**: Define isolated sub-networks. The `code-execution-service` runner container must have `--network=none` with no route to the internal database or auth network.
2. **Mutual TLS (mTLS)**: In Kubernetes, deploy a service mesh (Istio/Envoy) where every inter-service call requires bidirectional X.509 certificate authentication, preventing unauthorized lateral movement even if an attacker gains internal container access.

**Code references:** [Docker Compose](docker-compose.yml), [NGINX Gateway](services/api-gateway/nginx.conf).

## 32. How do you ensure request body hashes are deterministic for idempotency keys?

**Answer:**

Hashing raw request bodies with SHA-256 is fragile: if two clients send `{ "a": 1, "b": 2 }` and `{ "b": 2, "a": 1 }`, or include different whitespace, standard string hashing yields different digests, allowing duplicate operations to bypass the idempotency check.

We ensure deterministic hashing via **Canonical JSON Serialization**:
Parse the incoming request body into an object, sort all keys alphabetically, and serialize with strict delimiters without whitespace:
`json.dumps(obj, sort_keys=True, separators=(',', ':'))`
The resulting canonical byte array is hashed with SHA-256, guaranteeing identical fingerprints regardless of key order or formatting.

**Code references:** [Idempotency middleware](services/orchestrator-service/app/idempotency.py).

## 33. How does graceful shutdown protect in-flight interview sessions during deployments?

**Answer:**

When Docker or Kubernetes terminates a pod during rolling deployments, it sends `SIGTERM`. Without graceful handling, the process exits immediately, severing in-flight SSE streams, interrupting active database transactions, and dropping unacknowledged RabbitMQ messages.

The graceful shutdown protocol:
1. The readiness probe immediately returns `503`, directing the load balancer to route new traffic to healthy replicas.
2. The server enters a draining period (e.g., 15–30 seconds) to allow in-flight turns and short HTTP requests to finish.
3. For long-lived SSE connections, the server emits a disconnect notification: `data: {"type": "RECONNECT_PENDING"}\n\n`, allowing the frontend client to reconnect cleanly to another replica.
4. Database pools and message broker channels are closed cleanly (`await pool.close()`).

**Code references:** [Orchestrator lifespan](services/orchestrator-service/app/main.py), [Video service shutdown](services/video-service/src/index.js).

## 34. What are the durability trade-offs between PostgreSQL WAL and Redis persistence?

**Answer:**

- **PostgreSQL**: Writes transactions to the Write-Ahead Log (WAL) on disk before committing (`fsync=on`). In a sudden power outage, PostgreSQL replays WAL logs and guarantees full ACID durability with zero committed data loss.
- **Redis**: By default, snapshots periodically (RDB) or writes to an Append-Only File (AOF) with `appendfsync everysec`. In a power failure, Redis can lose up to 1 second of writes.

In DevMeet, we partition responsibilities based on these durability guarantees:
- PostgreSQL is the authoritative source of truth for durable entities: user accounts, sessions, turns, and billing audit ledgers.
- Redis is strictly used for ephemeral, disposable, or soft-state data: distributed locks with auto-leases, sliding-window rate counters, and token revocation blacklists.

**Code references:** [Orchestrator database](services/orchestrator-service/app/database.py), [Redis client](services/orchestrator-service/app/redis_client.py), [Payment database](services/payment-service/app/database.py).

## 35. How would you partition the `interview_turns` table to scale to 100,000,000 records?

**Answer:**

At scale, an unpartitioned `interview_turns` table creates massive B-tree indexes that exceed available RAM, causing slow queries and long `VACUUM` locks.

We apply **PostgreSQL Declarative Range Partitioning** by `created_at`:
```sql
CREATE TABLE interview_turns (
    id UUID NOT NULL,
    session_id UUID NOT NULL,
    role VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE interview_turns_2026_10 PARTITION OF interview_turns
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
```
Benefits:
1. **Partition Pruning**: Queries filtering by recent sessions only scan the active monthly partition.
2. **Instant Archival**: Rather than running slow, locking `DELETE` operations on old data, an old monthly partition can be detached and dropped or exported in milliseconds: `ALTER TABLE interview_turns DETACH PARTITION interview_turns_2024_10;`.

**Code references:** [Orchestrator models](services/orchestrator-service/app/models.py), [Turn routes](services/orchestrator-service/app/routers/turns.py).

---

## Final interview reminder

For a deep backend interview, describe the guarantee in layers:

1. **What is durable?** PostgreSQL rows, Redis entries, or in-memory state?
2. **What is atomic?** One SQL statement, one database transaction, or multiple services?
3. **What can be repeated?** HTTP retries, queue redelivery, outbox polling, or user actions?
4. **What fails open?** Redis-based locks, rate limits, token revocation, and optional providers may have different policies.
5. **What would you change?** State one specific improvement and the test that would prove it.
