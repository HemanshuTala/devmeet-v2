# Orchestrator Service: Easy-English Code Guide

This guide explains the Orchestrator Service's files, classes, functions, and
main code blocks in plain English. It is an explanation of the current
implementation, not a promise that every feature described in comments or the
README is fully implemented.

## What this service does

The Orchestrator Service manages an interview session from creation to
completion or cancellation. It stores session details and conversation turns
in PostgreSQL, uses Redis for locks and caches, calls other services when
needed, and sends completion events to the Feedback Service through an
outbox worker.

The main request flow is:

1. FastAPI receives a request under `/api/v1/sessions`.
2. Authentication dependencies ask the Auth Service to verify the user's
   bearer token.
3. A route checks that the session belongs to that user and that the requested
   state change is allowed.
4. The route reads or writes PostgreSQL and may update Redis.
5. When a session is completed, the route writes a completion event in the
   same database transaction as the status update.
6. A background publisher later sends that event to the Feedback Service.

## Files and folders

### `app/main.py` — build and run the FastAPI application

- The opening text describes the service's intended responsibilities.
- `os` reads environment variables such as the frontend URL.
- `FastAPI` creates the HTTP application; `CORSMiddleware` controls browser
  cross-origin requests.
- `asynccontextmanager` lets the `lifespan()` function manage startup and
  shutdown.
- `db`, `router`, `outbox_publisher`, `RequestIDMiddleware`, and
  `close_http_client` are the service components used by the application.
- `FEEDBACK_SERVICE_URL` reads the Feedback Service address from the
  environment. If not configured, the default is `http://localhost:8007`.
- `lifespan(app)` runs when the app starts and stops:
  - Before `yield`, it opens the PostgreSQL connection pool and starts the
    outbox publisher with the Feedback Service URL.
  - At shutdown, it stops the publisher, closes the shared outbound HTTP
    client, and closes the database pool.
- `app = FastAPI(...)` creates the application and connects the lifespan
  handler.
- `app.add_middleware(CORSMiddleware, ...)` allows the configured frontend
  origin. `FRONTEND_URL` overrides the default `http://localhost:3000`.
  Credentials, methods, and headers are allowed by this configuration.
- `app.add_middleware(RequestIDMiddleware)` adds request IDs and timing logs.
- `app.include_router(router)` mounts the session API router and its
  sub-routers.
- `health_check()` handles `GET /health` and returns a healthy status and
  service identifier.
- `root()` handles `GET /` and returns a short service-identification
  message.
- The `if __name__ == "__main__"` block starts a local Uvicorn server on
  port `8003` when this file is run directly.

### `app/routes.py` — combine the sub-routers

- The opening text describes the router modules that make up the API.
- Imports from the database, Redis, S3, idempotency, outbox, clients, models,
  and dependencies are re-exported from this module. This preserves older
  import paths and allows some tests to replace dependencies through
  `app.routes`.
- `sessions_router`, `turns_router`, `proctoring_router`, and
  `snapshots_router` are imported from their individual modules.
- `router = APIRouter()` creates the top-level router.
- Each `router.include_router(...)` adds a group of endpoints. The subrouters
  each use `/api/v1/sessions`, so their routes share that URL prefix.

### `app/models.py` — define the data shapes and rules

- `InterviewType` is a string enum with `dsa`, `behavioral`, and
  `system_design`.
- `Difficulty` is a string enum with `easy`, `medium`, and `hard`.
- `InterviewStatus` is a string enum with `created`, `in_progress`, `paused`,
  `completed`, and `cancelled`.
- `VALID_STATE_TRANSITIONS` records which status changes are allowed:
  - `created` can move to `in_progress` or `cancelled`.
  - `in_progress` can move to `paused`, `completed`, or `cancelled`.
  - `paused` can move to `in_progress`, `completed`, or `cancelled`.
  - `completed` and `cancelled` are terminal states and cannot move onward.
- `validate_state_transition(current_status, new_status)` returns `True` if
  the transition is listed or if both statuses are already the same.
  Otherwise it returns `False`.
- `validate_pause_window(paused_at, max_pause_minutes=30)` returns `False` if
  there is no pause timestamp. Otherwise it compares the pause time plus the
  allowed minutes with the current local datetime and returns whether the
  pause has not expired.
- `validate_cheating_threshold(tab_switch_count, paste_count,
  max_violations=3)` adds the two counters and returns `True` only if the sum
  is below the threshold. The function exists in the models file; the
  proctoring route shown here does not call it.
- `CreateSessionRequest` validates the incoming session settings. It requires
  an interview type, defaults difficulty to medium and duration to 30 minutes,
  restricts duration to 15–120 minutes, and accepts optional company, focus
  area, and recording consent.
- `SessionResponse` defines the fields returned for a session: identity,
  owner, interview choices, status, timestamps, elapsed time, proctoring
  counters, and recording consent.
- `TurnResponse` defines one transcript entry: its ID, session ID, speaker
  role, content, turn order, and timestamp.
- `CreateTurnRequest` accepts only `interviewer` or `candidate` as role and
  requires message content between 1 and 10,000 characters.
- `CodeSubmission` describes a session ID, language, and source code.

### `app/middleware.py` — attach a request ID

- `uuid`, `logging`, and `time` provide ID creation, log writing, and timing.
- `Request`, `Response`, and the Starlette base middleware classes define the
  HTTP types used in the middleware.
- `logger` creates the `request_id` logger.
- `RequestIDMiddleware` wraps each HTTP request.
- `dispatch(request, call_next)`:
  1. Reuses the incoming `X-Request-ID`, or creates a UUID if it is missing.
  2. Saves the ID to `request.state.request_id`.
  3. Records the start time with `time.time()`.
  4. Runs the next middleware or route and waits for a response.
  5. Adds `X-Request-ID` to the outgoing response.
  6. Calculates duration in milliseconds and logs the ID, method, path,
     status code, and duration.
  7. Returns the response.

### `app/clients.py` — call other services over HTTP

- `AUTH_SERVICE_URL`, `USER_SERVICE_URL`, and `SEARCH_SERVICE_URL` read the
  service URLs from environment variables, with local development defaults.
- `_http_client` stores a shared asynchronous HTTP client or `None`.
- `get_http_client()` creates the shared `httpx.AsyncClient` on its first
  call. It configures connection-pool limits and a default timeout, then
  reuses the same client for later requests.
- `close_http_client()` closes the shared client on application shutdown and
  resets the variable so it is no longer reused.
- `_get_http_client` is an alias for `get_http_client`, kept as an alternate
  import name.
- `fetch_seed_question(interview_type, difficulty, target_company, request_id)`
  asks the Search Service for a random question with the given filters. It
  forwards the request ID when supplied. It returns decoded question JSON on
  HTTP 200; other statuses and caught exceptions result in `None`.
- `verify_token(token, request_id)` calls the Auth Service's `/api/v1/auth/me`
  endpoint with the bearer token and optional request ID. It returns the user
  JSON on HTTP 200, otherwise `None`. Network exceptions also return `None`.
- `check_quota(user_id, token, request_id)` posts to the User Service's
  quota-increment endpoint. It returns `True` only for HTTP 200. The `user_id`
  parameter is accepted but the URL itself uses the authenticated `/me`
  route. Network errors return `False`.

### `app/routers/deps.py` — shared authentication, storage, and guards

- `security = HTTPBearer()` tells FastAPI to expect a bearer token for routes
  that use the security dependency.
- `AI_INTERVIEWER_URL` reads the AI Interviewer address. This file defines
  the setting, but the shown session routes do not use it directly.
- `get_db()` returns the database singleton. If the compatibility module
  `app.routes` exists and has a patched `db`, it returns that instead. This
  helps tests substitute a fake database.
- `get_redis_lock()` uses the same compatibility pattern for Redis.
- `get_verify_token_fn()` uses it to select a patched or default token
  verifier.
- `assert_no_active_session(user_id)` first checks Redis for an active
  session. If found, it raises HTTP 409. If Redis has no value, it checks
  PostgreSQL; if an unfinished session exists, it repopulates Redis and raises
  HTTP 409. Otherwise it returns without an error.
- `clear_active_session_for_user(user_id, session_id)` clears the user's
  Redis active-session entry if it points to this session, or if no value is
  currently stored.
- `get_current_user(credentials)` extracts the bearer token and asks the Auth
  Service to validate it. A missing/invalid user result raises HTTP 401;
  otherwise it returns the user data.
- `get_token_from_credentials(credentials)` returns the raw token string from
  the HTTP bearer credentials.
- `get_session_cached(session_id)` tries Redis first. A valid cached JSON
  record has timestamp strings converted back into `datetime` values. On
  cache miss it reads PostgreSQL; if a record exists, it serializes datetime
  values and stores the record in Redis for four hours. It returns the
  session or `None`.

The cache helper catches malformed cache data and serialization/cache errors
and continues to the database or returns the fetched database result.

### `app/routers/sessions.py` — create and manage sessions

#### Setup helpers

- `router` defines the shared `/api/v1/sessions` prefix and `sessions` tag.
- `logger` is used to record session-related errors.
- `get_check_quota_fn()` returns a test-patched quota checker from
  `app.routes` when available, or the normal client function.
- `get_assert_no_active_fn()` selects the patched or normal active-session
  checker.
- `get_fetch_seed_fn()` selects the patched or normal Search Service question
  fetcher.
- `_upload_snapshot_task(session_id, session_data)` imports and calls the
  snapshot uploader. It is used as a background-task target.

#### `create_session(...)` — `POST /api/v1/sessions`

1. Gets the database, Redis lock, and the service functions, including
   compatibility-patched versions used by tests.
2. Calls `check_idempotency()`. If this request was already completed with the
   same key and body, it returns the saved response immediately.
3. Acquires a Redis lock for the user to reduce simultaneous duplicate
   creation. If it cannot acquire it, it returns HTTP 429.
4. Reads the token and request ID, then concurrently checks quota, existing
   active sessions, and a seed question.
5. Re-raises exceptions returned by the gathered calls. If quota is not
   available, it returns HTTP 429.
6. Uses the seed title as a focus area when no focus was supplied. If there is
   no chosen target company and the seed has company tags, it uses the first.
7. Inserts a new `created` record in PostgreSQL.
8. Stores the new active-session ID in Redis.
9. Builds and returns a `SessionResponse`.
10. Saves the response for future idempotent retries.

The calls run concurrently, so the quota call may consume a credit even if
another concurrent check later rejects session creation.

#### `get_sessions(current_user)` — `GET /api/v1/sessions`

Loads the authenticated user's recent sessions from PostgreSQL and converts
each row into a `SessionResponse` list.

#### `get_session(session_id, current_user)` — `GET /api/v1/sessions/{id}`

Loads a session through the cache helper. It returns HTTP 404 if missing,
HTTP 403 if the session belongs to another user, or a `SessionResponse` for
the owner.

#### `start_session(session_id, current_user)` — `POST /{id}/start`

Loads the session, checks existence and ownership, validates a transition to
`in_progress`, updates the database status, invalidates the cached record,
sets the user's active-session key, and returns the updated session. Invalid
transitions return HTTP 400.

#### `complete_session(...)` — `POST /{id}/complete`

1. Checks idempotency, then loads the session and checks ownership.
2. Checks that the transition to `completed` is allowed.
3. Starts a PostgreSQL transaction.
4. Updates the session status and completion timestamp (and elapsed time if
   supplied).
5. Inserts a `session.completed` outbox event in that same transaction. If
   either database action fails, it returns HTTP 500 and the transaction does
   not partially commit.
6. Invalidates the Redis session cache and clears the user's active-session
   key.
7. If S3 is available, schedules a session snapshot upload in the background.
8. Builds the response, stores it for idempotent retries, and returns it.

#### `session_heartbeat(session_id, current_user)` — `POST /{id}/heartbeat`

Checks that the session exists and belongs to the user. If the session has
been paused for more than 30 minutes, it changes the status to completed and
returns an auto-completed message. If the session is already terminal, it
returns that status with `active: false`. If its last heartbeat is older than
90 seconds, it changes the status to cancelled. Otherwise it records a new
heartbeat and returns the current status and heartbeat time.

The auto-completion branch here updates status directly; it does not insert
the `session.completed` outbox event or schedule a snapshot like
`complete_session()` does.

#### `cancel_session(session_id, current_user)` — `POST /{id}/cancel`

Loads the session directly from PostgreSQL, checks existence and ownership,
and rejects sessions already completed or cancelled. Otherwise it sets status
to cancelled, invalidates the cache, clears the active-session key, and
returns a cancellation message.

### `app/routers/turns.py` — transcript and pause/resume endpoints

- `router` defines routes under `/api/v1/sessions`.
- `get_turns(session_id, current_user)` checks session existence and
  ownership, loads turns in chronological order, and converts them into
  `TurnResponse` objects.
- `create_turn(session_id, turn_data, current_user)` checks session
  existence and ownership, loads existing turns, chooses the next number as
  `len(existing_turns) + 1`, saves the new role/content, and returns it.
- `pause_session(session_id, elapsed_seconds, current_user)` checks existence,
  ownership, and whether the transition to paused is permitted. It saves
  paused status, timestamp, and elapsed time, invalidates the session cache,
  and returns the updated session.
- `resume_session(session_id, current_user)` checks existence, ownership, and
  the transition to in-progress. If a pause timestamp exists, it checks the
  30-minute pause window and returns HTTP 410 if expired. Otherwise it resumes
  the session, invalidates the cache, and returns the updated session.

### `app/routers/proctoring.py` — code, violation, and consent endpoints

- `CheatingReportRequest` is a request body with a `type` field intended to
  say `tab_switch` or `paste`. Pydantic does not constrain it to those strings;
  the route checks it manually.
- `RecordingConsentRequest` contains a boolean consent value.
- `router` defines the session URL prefix.
- `submit_code(session_id, request, code_data, current_user)` checks
  idempotency, session existence, and ownership. It stores the code and
  language in PostgreSQL, returns a `CodeSubmission`, and saves the response
  for duplicate requests.
- `report_cheating(session_id, payload, current_user)` verifies session
  ownership and that the type is `tab_switch` or `paste`. It increments the
  corresponding database counter, invalidates cached session data, reloads
  the session, and returns the updated counts and metadata.
- `update_recording_consent(session_id, payload, current_user)` checks the
  session and owner, updates the consent flag, and returns session metadata.

### `app/routers/snapshots.py` — S3 snapshot endpoints

- `router` defines the session URL prefix.
- `logger` records snapshot-upload failures.
- `_upload_session_snapshot_to_s3(session_id, session_data)` runs in the
  background. It reads the transcript and code submissions, asks the S3
  helper to save them with session metadata, and records the resulting S3
  object key in PostgreSQL if upload succeeded. Exceptions are logged.
- `list_session_snapshots(session_id, current_user)` checks that the session
  exists and belongs to the user, checks S3 availability, and returns snapshot
  metadata and a count. Unavailable S3 returns HTTP 503.
- `restore_session_from_snapshot(session_id, snapshot_key, current_user)`
  applies the same existence, ownership, and availability checks. It
  downloads the requested or latest snapshot and returns it, or HTTP 404 if
  none is found.
- `get_snapshot_download_url(session_id, snapshot_key, current_user)` checks
  ownership and S3 availability, creates a URL valid for one hour, and
  returns that URL. Failures to create it return HTTP 500.

### `app/database.py` — PostgreSQL operations

- `Database.__init__()` initializes `pool` to `None`.
- `Database.connect()` creates an asyncpg connection pool using PostgreSQL
  environment settings, with local development defaults and configurable pool
  sizes/timeouts.
- `Database.disconnect()` closes the pool if one was created.
- `_SESSION_COLUMNS` is a reusable SQL column list for session queries.
- `create_session(...)` inserts a session with `created` status and returns
  the new row.
- `get_session(session_id)` looks up a session by ID and returns a dictionary
  or `None`.
- `get_user_active_session(user_id)` returns the newest session in
  `created`, `in_progress`, or `paused` status, or `None`.
- `get_user_sessions(user_id, limit=20)` returns recent sessions newest first.
- `update_session_status(session_id, status, elapsed_seconds=None)` updates
  status and `updated_at`; it also sets start/completion timestamps for those
  specific statuses. It updates elapsed seconds when provided, then returns
  the changed row.
- `update_recording_consent(session_id, consent)` updates the consent flag and
  timestamp, returning the row or an empty dictionary.
- `create_conversation_turn(...)` inserts a transcript entry and returns it.
- `get_conversation_turns(session_id)` returns the session transcript in turn
  number order.
- `create_code_submission(session_id, language, code)` inserts a code snapshot
  and returns it.
- `get_code_submissions(session_id)` returns code submissions oldest first.
- `pause_session(session_id, elapsed_seconds=0)` sets paused status, timestamp,
  and elapsed time. If a database error happens, it logs to the console and
  returns a fallback dictionary containing timestamp information.
- `resume_session(session_id)` sets the status back to in-progress and clears
  `paused_at`. On database errors, it logs and returns a fallback timestamp
  dictionary.
- `increment_cheating_count(session_id, cheating_type)` increments the tab
  switch or paste counter. For other values it only selects the current
  counts. If no row is found, it returns zero counts.
- `record_heartbeat(session_id)` updates the last-heartbeat time. It catches
  and prints database errors rather than raising them.
- `record_s3_snapshot(session_id, s3_key)` stores the snapshot object key;
  database errors are printed.
- `get_s3_snapshot_key(session_id)` reads the snapshot key, returning `None`
  if unavailable or if an error occurs.
- `db = Database()` creates the shared database access object.

The database functions use SQL parameters for user-provided values rather
than inserting those values into SQL text.

### `app/redis_client.py` — locks, caches, and active-session keys

- `REDIS_HOST` and `REDIS_PORT` read Redis connection settings from the
  environment.
- `RedisLock.__init__()` tries to create an asynchronous Redis client with
  short connection timeouts. It sets `active` depending on whether client
  setup succeeds.
- `acquire_lock(lock_name, acquire_timeout=3, lock_timeout=10)` is an async
  context manager:
  - If Redis is unavailable, it yields `True` so the route can continue
    without a distributed lock.
  - Otherwise it creates a random ownership token and repeatedly tries
    Redis `SET NX` with an expiry until acquired or the wait time expires.
  - It yields `False` if the lock was not acquired.
  - After a successful lock, it yields `True`; when the route exits, it runs a
    Lua script that deletes the lock only if the token still belongs to this
    request.
- `get_cache(key)` returns a cached string, or `None` when Redis is inactive
  or an error occurs.
- `set_cache(key, value, expire_seconds=14400)` saves a string with an
  expiration. If Redis is unavailable or errors, it logs and returns.
- `invalidate_cache(key)` deletes the key when possible.
- `set_user_active_session(user_id, session_id, ttl_seconds=14400)` stores
  the user's active session ID for up to four hours by default.
- `get_user_active_session(user_id)` returns that value or `None`.
- `clear_user_active_session(user_id)` deletes the active-session key.
- `redis_lock = RedisLock()` creates the shared Redis helper.

The implementation deliberately proceeds without a lock when Redis is
unavailable, so the lock is not guaranteed in that fallback situation.

### `app/idempotency.py` — avoid repeating a request's side effects

- `IdempotencyResult` stores whether a previous response was found, its HTTP
  code and body, and internal data used to update the database row.
- `IdempotencyResult.store(response_code, response_body)` marks the matching
  record completed and saves the response JSON. If there is no key or a
  database error occurs, it returns without raising.
- `IdempotencyResult.mark_failed()` marks the record failed after an
  unsuccessful handler. It also logs rather than raising database errors.
- `_hash_body(body)` calculates a SHA-256 fingerprint of the raw request body.
- `check_idempotency(request, user_id)`:
  1. Reads the optional `Idempotency-Key` header. If missing, returns an
     empty result and does not deduplicate.
  2. Reads and hashes the request body and builds a method/path label.
  3. Looks up an unexpired row for that key and user.
  4. If the body hash differs, raises HTTP 422.
  5. If the record is completed with a response, returns that cached response.
  6. If it is processing, raises HTTP 409.
  7. If it was failed, resets it to processing with a new 24-hour expiry.
  8. If no unexpired record exists, inserts or upserts a processing record.
  9. Returns an `IdempotencyResult` that routes can later store as complete.

The helper uses the database pool directly and expects it to have been
connected. The docstring's 24-hour behavior is implemented with database
expiry timestamps.

### `app/ai_limiter.py` — regulate AI requests and token use

- The constants set the intended limits: 30 requests per minute, one active
  generation per user, a 50,000 token session budget, and a 120-second
  concurrency-lock expiry.
- `check_ai_rate_limit(user_id, redis)` uses a Redis sorted set and pipeline
  to remove old request timestamps, count current requests, add the new
  request, and refresh expiry. If the earlier count is at or above the limit,
  it calculates a retry delay and raises HTTP 429.
- `acquire_ai_slot(user_id, redis)` atomically tries to create a Redis key
  only if it does not already exist, with a TTL. It returns whether the slot
  was acquired.
- `release_ai_slot(user_id, redis)` deletes that concurrency key.
- `check_token_budget(session_id, tokens_used, redis)` reads the stored token
  count, adds the proposed usage, and raises HTTP 429 if the total would
  exceed the configured budget. It does not itself add the tokens.
- `record_tokens_used(session_id, tokens, redis, ttl=86400)` increments the
  count atomically, sets its expiry, and returns the new total.

These helpers are defined in this service but are not called by the session
routes inspected for this guide.

### `app/outbox.py` — deliver completion events reliably

- The imports provide async task handling, JSON, logging, UUID generation,
  HTTP requests, and the database object.
- `FEEDBACK_SERVICE_URL` is set when the publisher starts.
- `emit_event(conn, event_type, aggregate_type, aggregate_id, payload)`
  inserts an event into `outbox_events` using the caller's database connection.
  It returns a new event ID. The caller can call it inside the same database
  transaction as a session update.
- `OutboxPublisher.__init__(poll_interval=5, batch_size=20)` sets how often
  to poll, how many events to read at once, and initial task/running state.
- `start(feedback_service_url)` saves the destination URL, marks the worker
  running, and creates its asyncio polling task.
- `stop()` stops and cancels that task, waiting for cancellation to finish.
- `_poll_loop()` repeatedly processes a batch, logs unexpected errors, and
  sleeps between polls while the worker is running.
- `_process_batch()` selects the oldest unpublished rows, dispatches them one
  by one, and marks successfully handled events as published in PostgreSQL.
- `_dispatch_event(row)` parses the event payload and chooses a handler.
  `session.completed` goes to `_handle_session_completed()`. Unknown event
  types are marked handled so they do not retry forever. Exceptions are
  logged and return `False`, which leaves the event for another attempt.
- `_handle_session_completed(payload)` validates the required session/type/
  difficulty fields, loads the session transcript, and posts session details
  and transcript to the Feedback Service's `/api/v1/feedback/generate`
  endpoint. HTTP 200, 201, and 202 count as success; non-success responses,
  timeouts, and exceptions return `False` so the publisher retries.
- `outbox_publisher = OutboxPublisher()` creates the shared worker object.

### `app/s3_service.py` — archive and restore session snapshots

- The imports provide environment settings, JSON serialization, logging,
  typing, timestamps, the AWS SDK, and AWS error classes.
- `S3Service.__init__()` reads the bucket and region and calls
  `_initialize_client()`.
- `_initialize_client()` creates an S3 client using explicit environment
  credentials or the default AWS credentials. It checks access to the bucket.
  Missing credentials or client errors disable the S3 feature by setting the
  client to `None`.
- `is_available()` returns whether the S3 client was initialized.
- `upload_session_snapshot(session_id, session_data, conversation_turns,
  code_submissions)` builds a JSON archive with session metadata, transcript,
  code submissions, a timestamp, and version. It uploads the archive with
  server-side AES-256 encryption and returns its key. If unavailable or
  upload fails, it returns `None`.
- `download_session_snapshot(session_id, snapshot_key=None)` chooses the
  supplied key or asks `_get_latest_snapshot_key()` for the newest one, then
  downloads and parses the JSON. Missing data or errors return `None`.
- `_get_latest_snapshot_key(session_id)` lists objects under the session
  prefix and returns the key with the latest modification time, or `None`.
- `list_session_snapshots(session_id)` returns each snapshot's key, timestamp,
  and size, newest first. Errors or unavailable S3 return an empty list.
- `delete_snapshot(snapshot_key)` deletes one object and returns success or
  failure as a boolean.
- `generate_presigned_url(snapshot_key, expiration_seconds=3600)` asks AWS
  for a time-limited download URL. It returns the URL, or `None` if S3 is
  unavailable or URL creation fails.
- `s3_service = S3Service()` creates the shared S3 helper.

### `app/routers/__init__.py` — describe the router package

This file contains package documentation describing the router modules. It
does not define API functions or executable classes.

### `app/test_orchestrator.py` — test the service

- Before application imports, the module installs mock database and AWS
  libraries so tests can run without real infrastructure.
- `client()` is a pytest fixture. It creates mock database and Redis
  operations, replaces the service dependencies, patches lock acquisition to
  always succeed, starts a FastAPI test client, and yields both client and
  mock database.
- `_mock_jwt(monkeypatch)` replaces token verification with a fixed example
  user for authenticated endpoint tests.
- `test_health_check()` checks the `/health` service name.
- `test_root()` checks that `/` responds successfully.
- `test_create_session()` checks a successful creation using mocked quota,
  active-session, seed question, and database calls.
- `test_create_session_invalid_type()` checks rejection of an unsupported
  interview type.
- `test_get_session()` checks that a user can retrieve their session.
- `test_start_session()` checks a transition from created to in-progress.
- `test_cancel_session()` checks cancellation of an unfinished session.
- `test_cancel_completed_session_fails()` checks that terminal sessions
  cannot be cancelled again.
- `test_get_session_not_found()` checks the missing-session response.
- The suite uses mocks for infrastructure, so it checks service logic and
  HTTP behavior rather than live PostgreSQL, Redis, AWS, or upstream services.

### `requirements.txt` — Python dependencies

- `fastapi` and `uvicorn` provide the API framework and server.
- `pydantic[email]`, `pydantic-settings`, and `email-validator` provide
  schemas, configuration helpers, and email validation support.
- `asyncpg` connects asynchronously to PostgreSQL.
- `httpx` makes asynchronous requests to other services.
- `python-dotenv` can load environment variables from dotenv files.
- `redis` provides the Redis client.
- `boto3` provides the AWS S3 client.

### `Dockerfile` — build and run the container

- `FROM python:3.11-slim` chooses the base Python image.
- `WORKDIR /app` sets the container's working directory.
- `COPY requirements.txt .` copies the dependency list.
- `RUN pip install ...` installs the listed dependencies.
- `COPY . .` copies the service code into the image.
- `EXPOSE 8003` documents the service port.
- `CMD [...]` starts Uvicorn with `app.main:app` on all container interfaces
  at port 8003.

### `README.md` — overview and examples

The README explains the intended architecture, state machine, endpoint
examples, testing command, and design concepts. It is not executable code.
Some high-level statements do not precisely match the current source; see the
notes below.

## API endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Returns service health. |
| `GET` | `/` | Identifies the service. |
| `POST` | `/api/v1/sessions` | Creates a session, checks quota and active-session rules, and may use a seed question. |
| `GET` | `/api/v1/sessions` | Lists the authenticated user's sessions. |
| `GET` | `/api/v1/sessions/{id}` | Retrieves one owned session. |
| `POST` | `/api/v1/sessions/{id}/start` | Starts a session. |
| `POST` | `/api/v1/sessions/{id}/complete` | Completes a session and writes a feedback outbox event. |
| `POST` | `/api/v1/sessions/{id}/cancel` | Cancels an unfinished session. |
| `POST` | `/api/v1/sessions/{id}/heartbeat` | Updates liveness or applies stale-session rules. |
| `GET` | `/api/v1/sessions/{id}/turns` | Lists transcript entries. |
| `POST` | `/api/v1/sessions/{id}/turns` | Adds a transcript entry. |
| `POST` | `/api/v1/sessions/{id}/pause` | Pauses a session. |
| `POST` | `/api/v1/sessions/{id}/resume` | Resumes a session within the pause window. |
| `POST` | `/api/v1/sessions/{id}/code` | Stores a code submission. |
| `POST` | `/api/v1/sessions/{id}/cheating` | Increments a tab-switch or paste counter. |
| `POST` | `/api/v1/sessions/{id}/consent` | Updates recording consent. |
| `GET` | `/api/v1/sessions/{id}/snapshots` | Lists S3 snapshots. |
| `POST` | `/api/v1/sessions/{id}/restore` | Retrieves a stored S3 snapshot. |
| `GET` | `/api/v1/sessions/{id}/snapshots/{key}/download-url` | Creates a one-hour download URL. |

## Important implementation notes

- The README says route groups include session dialogue, code, cheating,
  snapshots, and lifecycle. Those endpoints are split across the `routers`
  package and combined by `app/routes.py`.
- Comments describe a state diagram and features such as automatic recovery.
  The route and helper implementations are the authoritative behavior.
- Completion through `complete_session()` writes a transactional outbox row.
  Heartbeat-based auto-completion currently updates status directly and does
  not create that event.
- Redis caching and locking gracefully fall back when Redis is unavailable.
  These fallbacks improve availability but mean distributed locking and cache
  behavior are not guaranteed while Redis is down.
- `validate_cheating_threshold()` exists, but the proctoring endpoint only
  increments counters; it does not currently enforce that threshold.
- The AI limiter functions exist in `ai_limiter.py` but are not wired into the
  session routes inspected here.
- The heartbeat route checks for a stale previous heartbeat before recording
  the new one. A client that waits longer than its threshold may therefore
  trigger automatic cancellation.
- `validate_pause_window()` compares its timestamp with `datetime.now()`,
  which is timezone-naive. If it receives a timezone-aware timestamp, Python
  can raise a timezone comparison error; the pause/resume route should use
  compatible timestamp types.

## Run the tests

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "E:\AI INTERVIEW\services\orchestrator-service"
python -m pytest services\orchestrator-service\app\test_orchestrator.py -v
```
