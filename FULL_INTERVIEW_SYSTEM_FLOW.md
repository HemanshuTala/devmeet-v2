# DevMeet Interview Backend: Request-by-Request Flow

This guide follows the backend requests in the order they happen: create a
session, start it, ask and save questions, run and submit code, record
violations, finish, and generate feedback. For every step it names the backend
route or function, its file and source line, and what that code does.

No diagram is used. Line numbers point to declarations and can shift after
source edits.

## First: what the Orchestrator does

The Orchestrator is the source of truth for the interview's **session
lifecycle**. It creates the session record, decides whether a status change is
allowed, saves transcript turns and submitted code, tracks supported
proctoring counters, and emits the event that starts feedback generation.

It is **not** a single server that performs every interview operation:

- The AI Interviewer creates AI responses.
- The Code Execution Service checks and runs candidate code.
- The Video Service issues video-room tokens and handles recording operations.
- The Feedback Service evaluates the transcript and stores the report.
- The API Gateway routes each request to the service that owns that endpoint.

The services share a session ID and exchange the data needed for their own
work. Most of these requests are separate HTTP requests; starting a session
does not automatically run AI generation, code execution, or video setup.

## Backend request routes

The API Gateway maps these paths to these backend services:

| Request path | Backend destination |
| --- | --- |
| `/api/v1/sessions...` | Orchestrator, port 8003 |
| `/api/v1/interview...` | AI Interviewer, port 8004 |
| `/api/v1/execute...` | Code Execution, port 8005 |
| `/api/v1/video...` | Video Service, port 8006 |
| `/api/v1/feedback...` | Feedback Service, port 8007 |

The routes are configured in
[`nginx.conf`](./services/api-gateway/nginx.conf): sessions at line 236,
interview at 285, execute at 341, video at 393, and feedback at 445.
For example, the sessions route sets the Orchestrator upstream at line 266;
the interview route sets the AI upstream at line 317.

The Gateway forwards requests based on their URL path. It does not call
Orchestrator first for AI, code execution, or video requests. Those requests
go to their own service routes.

## 1. Backend starts and prepares the Orchestrator

1. **Open database connections and start event processing** —
   [`main.py`](./services/orchestrator-service/app/main.py),
   `lifespan()` (line 44)

   When the Orchestrator starts, it opens the PostgreSQL connection pool and
   starts the outbox publisher. The publisher is a background loop that later
   delivers completed-session events to Feedback. At shutdown, the function
   stops the publisher and closes database and HTTP connections.

2. **Register the session endpoints** —
   [`routes.py`](./services/orchestrator-service/app/routes.py),
   `router.include_router()` (lines 73-76)

   This joins four groups of Orchestrator endpoints: session lifecycle,
   transcript and pause/resume, code/proctoring/consent, and snapshots. Their
   common URL prefix is `/api/v1/sessions`.

3. **Check a request's identity** —
   [`deps.py`](./services/orchestrator-service/app/routers/deps.py),
   `get_current_user()` (line 96), and
   [`clients.py`](./services/orchestrator-service/app/clients.py),
   `verify_token()` (line 96)

   Protected Orchestrator routes use this dependency. It sends the supplied
   token to Auth Service's `/api/v1/auth/me` endpoint and passes the verified
   user record to the route. Missing or invalid identity is rejected before
   that route performs its work.

## 2. Request 1 — create the interview session

The incoming request is `POST /api/v1/sessions`. Its body is validated against
`CreateSessionRequest` in
[`models.py`](./services/orchestrator-service/app/models.py) (line 125):

- `interview_type`: `dsa`, `behavioral`, or `system_design`
- `difficulty`: `easy`, `medium`, or `hard`
- `target_company` and `focus_area`: optional context
- `duration_minutes`: 15 to 120, with 30 as the default
- `recording_consent`: whether recording consent was given

Example request body:

```json
{
  "interview_type": "dsa",
  "difficulty": "medium",
  "target_company": "ExampleCo",
  "focus_area": "Arrays",
  "duration_minutes": 30,
  "recording_consent": false
}
```

The server processes it in this order:

1. **Check for a safe retry** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `create_session()` (line 70), calls
   [`idempotency.py`](./services/orchestrator-service/app/idempotency.py),
   `check_idempotency()` (line 118).

   If an `Idempotency-Key` was supplied and already completed for the same
   user and same request body, the Orchestrator returns the saved response
   without repeating the work. Reusing a key with a different body is
   rejected.

2. **Lock session creation for this user** —
   [`redis_client.py`](./services/orchestrator-service/app/redis_client.py),
   `RedisLock.acquire_lock()` (line 75).

   The lock prevents two simultaneous create requests for the same user from
   both passing the active-session check. It has a timeout so a crashed request
   cannot hold the lock forever.

3. **Run three prerequisites in parallel** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `create_session()` (line 70).

   It uses `asyncio.gather()` for the quota request, active-session check,
   and seed-question lookup. The request is rejected if quota is unavailable,
   another active session exists, or a prerequisite raises an error.

   - **Quota:** [`clients.py`](./services/orchestrator-service/app/clients.py),
     `check_quota()` (line 123) calls the User Service's
     `/api/v1/users/me/quota/increment`.
   - **Active session:** [`deps.py`](./services/orchestrator-service/app/routers/deps.py),
     `assert_no_active_session()` (line 47) checks Redis first, then
     PostgreSQL for `created`, `in_progress`, or `paused` sessions.
   - **Question lookup:** [`clients.py`](./services/orchestrator-service/app/clients.py),
     `fetch_seed_question()` (line 53) calls Search Service's
     `/api/v1/search/questions/random` with interview type, difficulty, and
     optional company. It has a five-second timeout. If Search is unreachable,
     it returns no seed and session creation can continue without one.

4. **Use the seed only to fill missing session context** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `create_session()` (line 70).

   If the candidate did not specify a focus area, the seed title can fill it.
   If no company was specified, the first company tag can fill that field.
   This code does not save the full seed question or its test cases as part of
   the session record.

5. **Insert the session in PostgreSQL** —
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.create_session()` (line 63).

   It inserts the user ID, selected settings, duration, and consent flag into
   the `sessions` table with status `created`. PostgreSQL is the durable
   session record.

6. **Remember the active session and return its ID** —
   [`redis_client.py`](./services/orchestrator-service/app/redis_client.py),
   `set_user_active_session()` (line 170), called from
   `create_session()`.

   Redis keeps a short-lived pointer from the user to the active session. The
   Orchestrator returns session metadata and stores the successful response
   for idempotent retry when an idempotency key was supplied.

At this point, the session exists, but it is only `created`. No AI question
has been generated and no video room is created by this request.

## 3. Request 2 — start the session

The start request is `POST /api/v1/sessions/{session_id}/start`.

1. **Check whether the status change is legal** —
   [`models.py`](./services/orchestrator-service/app/models.py),
   `validate_state_transition()` (line 70).

   The state machine permits `created -> in_progress`,
   `in_progress -> paused/completed/cancelled`, and
   `paused -> in_progress/completed/cancelled`. `completed` and `cancelled`
   are terminal statuses.

2. **Check owner and update session state** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `start_session()` (line 257).

   It loads the session, rejects a missing session or a different owner,
   validates the transition, and calls the database update. Then it
   invalidates cached session metadata and sets the user's active-session
   pointer again.

3. **Write status and timestamps** —
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.update_session_status()` (line 150).

   It updates status and `updated_at` in PostgreSQL. For `in_progress`, it
   also stamps `started_at`.

**Important boundary:** `start_session()` does not call AI, Code Execution,
or Video. Each of those is a separate service request described below.

## 4. AI request — generate the interviewer response

The AI request is `POST /api/v1/interview/question/stream`, routed directly
to the AI Interviewer Service. The request body is validated as
`InterviewRequest` in
[`models.py`](./services/ai-interviewer-service/app/models.py) (line 37).
It contains the session ID, interview type, difficulty, company/focus context,
and a list of prior messages (`role` and `content`).

Example request body for the first question (history is initially empty):

```json
{
  "session_id": "session-uuid",
  "interview_type": "dsa",
  "difficulty": "medium",
  "target_company": "ExampleCo",
  "focus_area": "Arrays",
  "conversation_history": []
}
```

For a later question, the caller sends previous messages in
`conversation_history`; the AI service uses that list as context. The AI
service does not retrieve the transcript from PostgreSQL by itself.

Here is what happens inside the AI service:

1. **Authenticate independently** —
   [`routes.py`](./services/ai-interviewer-service/app/routes.py),
   `get_current_user()` (line 111).

   The AI service also checks the bearer token through Auth Service. Session
   ownership is checked by Orchestrator session routes; this AI route's code
   authenticates the user but does not load the session from Orchestrator to
   verify that the supplied session ID belongs to that user.

2. **Apply AI request limits** —
   [`routes.py`](./services/ai-interviewer-service/app/routes.py),
   `generate_question_stream()` (line 376), calls functions in
   [`ai_limiter.py`](./services/ai-interviewer-service/app/ai_limiter.py):
   `check_ai_rate_limit()` (line 100),
   `check_token_budget()` (line 223), and
   `acquire_ai_slot()` (line 161).

   Redis tracks the request rate, the current in-flight generation, and the
   session token counter. The route releases the in-flight slot in the
   streaming generator's `finally` block.

   **Current-code detail:** the streaming route checks the token budget but
   does not call `record_tokens_used()`. The non-streaming `/question` route
   does record tokens, so the stream path does not advance that Redis counter.

3. **Check the most recent candidate message** —
   [`ai_manager.py`](./services/ai-interviewer-service/app/ai_manager.py),
   `AIManager.check_and_record_injection()` (line 177), called by
   `generate_question_stream()`.

   It checks the latest user message. After three detected attempts in that
   AI service process, the stream returns an error event rather than a normal
   answer. This counter is in service memory: it is not an Orchestrator
   violation count or a persisted transcript event.

4. **Build model input** —
   [`routes.py`](./services/ai-interviewer-service/app/routes.py),
   `generate_question_stream()` (line 376), calls prompt-building methods
   from `AIManager` in
   [`ai_manager.py`](./services/ai-interviewer-service/app/ai_manager.py):
   `_build_interview_system_prompt()` (line 230),
   `_build_question_user_message()` (line 247), and
   `prune_conversation_history()` (imported by the route).

   The service combines instructions based on interview type, difficulty,
   company/focus context, and candidate identity with the supplied prior
   messages. It trims old history to fit the model context.

5. **Call the model and stream response data** —
   [`routes.py`](./services/ai-interviewer-service/app/routes.py),
   `generate_question_stream()` (line 376) and its inner
   `event_generator()` (line 435).

   The generator tries the configured model and then model alternatives. It
   sends token chunks as SSE messages. If no model key exists or all attempts
   fail, it streams a built-in progressive interview response. The final SSE
   event carries the completed question and optional hints/follow-ups.

6. **Save the AI response as transcript data** —
   [`turns.py`](./services/orchestrator-service/app/routers/turns.py),
   `create_turn()` (line 63), then
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.create_conversation_turn()` (line 200).

   This is a separate request after generation. The Orchestrator checks
   session ownership, assigns the next turn number, and inserts the supplied
   role and text into `conversation_turns`. It does not call the AI.

7. **Save candidate answers the same way** —
   `create_turn()` at line 63 and `Database.create_conversation_turn()` at
   line 200 handle candidate turns too. On a later AI request, the caller
   supplies those saved messages in `conversation_history`; the AI service
   does not fetch them from the Orchestrator itself.

So the backend sequence for one exchange is: AI request with current history;
AI response stream; a separate transcript-save request for the AI response;
then, when an answer is ready, save that candidate turn and send updated
history in the next AI request.

The transcript-save request uses `POST
/api/v1/sessions/{session_id}/turns`. Its body looks like:

```json
{
  "role": "candidate",
  "content": "I would use a hash map to look up the complement."
}
```

The same route saves an AI question with `role: "interviewer"`. The backend
validates `role` and `content` through `CreateTurnRequest` in
[`models.py`](./services/orchestrator-service/app/models.py) (line 171).

## 5. Code request — run code and tests

The Code Execution Service has its own request paths and database/session
ownership is not automatically enforced by the Orchestrator routes:

1. **Receive and validate code** —
   [`models.py`](./services/code-execution-service/app/models.py),
   `ExecutionRequest` (line 38), or `RunWithTestsRequest` in
   [`routes.py`](./services/code-execution-service/app/routes.py) (line 242).

   A normal run accepts source text, a supported language, and a timeout from
   1 to 60 seconds. A test run accepts 1 to 20 cases, each with input,
   expected output, a name, and a hidden/visible flag.

   Example test request:

   ```json
   {
     "code": "print(input())",
     "language": "python",
     "test_cases": [
       {"input": "hello", "expected_output": "hello", "name": "case 1"}
     ],
     "timeout_seconds": 10
   }
   ```

2. **Safety scan** —
   [`routes.py`](./services/code-execution-service/app/routes.py),
   `scan_code_safety()` (line 139).

   It checks code for blocked patterns and, for Python, parses the code to
   inspect imports and dangerous operations. Execution and test routes call
   this before running code. A blocked pattern returns a failed execution
   result; it is not recorded as a tab-switch/paste violation.

3. **Run one program in the sandbox** —
   [`routes.py`](./services/code-execution-service/app/routes.py),
   `execute_code()` (line 268), calls
   [`executor.py`](./services/code-execution-service/app/executor.py),
   `CodeExecutor.execute_code()` (line 335).

   The executor tries its Docker SDK connection first and uses the Docker CLI
   fallback if configured. It chooses a runtime image for the requested
   language, starts an isolated container, waits only up to the requested
   timeout, collects output/error/exit status, and removes temporary files
   and the container. The SDK path disables networking, limits memory/CPU and
   process count, drops Linux capabilities, and uses a read-only filesystem
   with temporary storage. If Docker is unavailable, it returns a
   sandbox-unavailable error. The endpoint may also schedule a code snapshot
   upload.

4. **Run test cases one at a time** —
   [`routes.py`](./services/code-execution-service/app/routes.py),
   `run_with_test_cases()` (line 319), calls
   [`submission_runner.py`](./services/code-execution-service/app/submission_runner.py),
   `TestRunner.run_test_cases()` (line 125).

   The runner loops through the supplied cases. `_wrap_code_with_io()` in
   `submission_runner.py` (line 252) adds the input/output handling needed
   for the language; `_run_single_test()` (line 184) executes that wrapped
   code through the sandbox; `_compare_outputs()` (line 420) compares actual
   and expected output. The service returns pass counts and per-test results.
   Hidden test input and expected output are omitted from serialized results.

5. **Queue a longer execution job** —
   [`routes.py`](./services/code-execution-service/app/routes.py),
   `submit_async()` (line 378), and `get_job_status()` (line 436).

   The first route screens and queues code, returning a job ID. The status
   route uses that ID to return the worker result when requested.

6. **Persist an interview code submission** —
   [`proctoring.py`](./services/orchestrator-service/app/routers/proctoring.py),
   `submit_code()` (line 35), calls
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.create_code_submission()` (line 243).

   This is a separate Orchestrator request: it checks session ownership and
   saves language and source code to `code_submissions`. It does not run the
   submitted code. Running code and saving a final submission are distinct
   operations.

The normal run response contains `success`, `output`, `error`, and
`execution_time`. Test execution returns a result for each case plus aggregate
passed/failed totals. Code execution results do not automatically become
transcript turns; saving a code submission and saving any code-related
conversation text are distinct Orchestrator operations.

## 6. Video and recording requests

1. **Issue room access** —
   [`index.js`](./services/video-service/src/index.js),
   `POST /api/v1/video/token` (line 63), calls
   [`tokenService.js`](./services/video-service/src/tokenService.js),
   `generateToken()` (line 44).

   The Video Service registers the participant and creates a LiveKit token
   for the named room. This does not change the Orchestrator session status
   or send the video stream to the AI Interviewer.

2. **Persist consent with the interview session** —
   [`proctoring.py`](./services/orchestrator-service/app/routers/proctoring.py),
   `update_recording_consent()` (line 126), calls
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.update_recording_consent()` (line 184).

   This saves the consent flag in the Orchestrator session record.

3. **Start recording** —
   [`index.js`](./services/video-service/src/index.js),
   `POST /api/v1/video/room/:room_name/recording/start` (line 307), calls
   [`recordingService.js`](./services/video-service/src/recordingService.js),
   `startRecording()` (line 43).

   The Video Service checks the consent value and rejects a start request
   without consent. Recording state belongs to the Video Service, not the
   Orchestrator.

4. **Upload and stop recording** —
   [`index.js`](./services/video-service/src/index.js),
   recording upload route (line 374) and stop route (line 342).

   Upload sends media bytes to the Video Service for storage. Stop marks the
   recording stopped and returns its status and playback metadata. These
   operations are independent from marking the interview completed.

## 7. Proctoring violations — what is actually recorded

1. **Accept a supported violation** —
   [`proctoring.py`](./services/orchestrator-service/app/routers/proctoring.py),
   `report_cheating()` (line 80).

   The request body contains a type. The route accepts only `tab_switch` or
   `paste`, checks that the session belongs to the user, and rejects other
   types.

2. **Increment the stored counter** —
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.increment_cheating_count()` (line 311).

   It increments `tab_switch_count` or `paste_count` in the PostgreSQL
   `sessions` row. The route invalidates the cached session and returns the
   latest counters.

3. **Threshold is not enforced by the report route** —
   [`models.py`](./services/orchestrator-service/app/models.py),
   `validate_cheating_threshold()` (line 109).

   This helper says whether combined tab-switch and paste counts are below
   three. `report_cheating()` does not call it; three events do not
   automatically terminate or penalize the session in this backend path.

4. **Other claimed violation types are not handled here.**

   The Orchestrator request model and route implement tab switches and
   pastes. Face absence, multiple faces, gaze detection, and automatic
   termination are not implemented by this route. Do not treat service
   comments or UI labels as proof that the Orchestrator enforces those
   checks.

## 8. Keepalive, pause, resume, and cancel requests

1. **Heartbeat / abandoned session check** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `session_heartbeat()` (line 441), calls
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.record_heartbeat()` (line 337).

   A successful heartbeat writes `last_heartbeat_at`. When this route sees
   that the previous heartbeat is more than 90 seconds old, it changes the
   session to `cancelled`. This check runs when a heartbeat request arrives;
   there is no separate timer worker shown here.

2. **Pause** —
   [`turns.py`](./services/orchestrator-service/app/routers/turns.py),
   `pause_session()` (line 107), calls
   [`database.py`](./services/orchestrator-service/app/database.py),
   `Database.pause_session()` (line 279).

   It validates ownership and status, then saves `paused`, `paused_at`, and
   elapsed seconds.

3. **Resume** —
   `resume_session()` in `turns.py` (line 164) checks the pause expiry using
   `validate_pause_window()` in
   [`models.py`](./services/orchestrator-service/app/models.py) (line 86),
   then calls `Database.resume_session()` in
   [`database.py`](./services/orchestrator-service/app/database.py) (line 295).

   If the 30-minute window has expired, resume returns an error. Otherwise
   the session returns to `in_progress`.

4. **Auto-complete after a long pause** —
   `session_heartbeat()` at line 441 marks a session `completed` when it
   observes a pause longer than 30 minutes.

   **Important:** this branch only updates the session status and cache. It
   does not write a `session.completed` outbox event, clear all active-session
   data through the normal completion flow, or trigger Feedback.

5. **Cancel explicitly** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `cancel_session()` (line 511).

   It marks a non-terminal session `cancelled`, invalidates the cache, and
   clears the user's active-session pointer. It does not create a completion
   event and does not generate a feedback report.

## 9. Finish normally — exact feedback hand-off

This is the normal completion chain. The important point is that feedback is
not generated inside the session-completion database transaction.

1. **Receive completion request** —
   [`sessions.py`](./services/orchestrator-service/app/routers/sessions.py),
   `complete_session()` (line 316).

   It checks idempotency, loads the session, checks ownership, and validates
   the transition to `completed`. Invalid or terminal transitions are
   rejected.

2. **Atomically save completed status and event** —
   `complete_session()` at line 316 opens one PostgreSQL transaction. It
   updates status, completion time, and optional elapsed seconds, then calls
   `emit_event()` before the transaction commits.

   [`outbox.py`](./services/orchestrator-service/app/outbox.py),
   `emit_event()` (line 50) inserts `session.completed` and its payload into
   `outbox_events` using that same transaction. If the transaction rolls
   back, both the status update and event roll back. This avoids completing a
   session but losing the notification to Feedback.

3. **Clear cache and active-session pointer** —
   `complete_session()` invalidates the Redis session cache and calls
   `clear_active_session_for_user()` in
   [`deps.py`](./services/orchestrator-service/app/routers/deps.py)
   (line 86). If S3 snapshot storage is available, it also schedules a
   background snapshot task.

4. **Poll the outbox** —
   [`outbox.py`](./services/orchestrator-service/app/outbox.py),
   `OutboxPublisher._poll_loop()` (line 125) calls
   `_process_batch()` (line 136).

   At startup, `lifespan()` starts this background worker. It polls every
   five seconds, selects up to 20 unpublished events, and dispatches them.
   A failed HTTP delivery leaves the event unpublished for a later retry.

5. **Load the final transcript and call Feedback** —
   [`outbox.py`](./services/orchestrator-service/app/outbox.py),
   `OutboxPublisher._handle_session_completed()` (line 190).

   This reads `conversation_turns` from PostgreSQL, ordered by
   `turn_number`, and sends session ID, interview type, difficulty, language,
   company, and transcript to `POST /api/v1/feedback/generate`. A successful
   200/201/202 response lets `_process_batch()` mark the event published.

6. **Generate score and written evaluation** —
   [`routes.py`](./services/feedback-service/app/routes.py),
   `generate_feedback()` (line 42), calls
   [`generator.py`](./services/feedback-service/app/generator.py),
   `FeedbackGenerator.generate_feedback()` (line 120).

   The generator checks transcript participation. If there are no meaningful
   answers, it returns a zero-score insufficient-data report. Otherwise it
   uses the configured model and falls back to local heuristic scoring when
   model evaluation fails.

7. **Make an optional PDF** —
   `generate_feedback()` in `routes.py` calls `generate_pdf()` in
   [`generator.py`](./services/feedback-service/app/generator.py) (line 197)
   and `upload_pdf_report()` (line 227).

   The service attempts to build the PDF and upload it. PDF failure is
   treated as optional; the scores can still be stored without a PDF link.

8. **Save the report** —
   [`database.py`](./services/feedback-service/app/database.py),
   `save_report()` (line 76).

   It saves the scores, detailed feedback, and PDF URL to
   `feedback_reports`, updating the existing report if one already exists for
   that session. The Feedback Service then returns report data to its caller.

## 10. Data records involved

| PostgreSQL record | Written/read by | What it stores |
| --- | --- | --- |
| `sessions` | Orchestrator `Database` | Settings, status, timestamps, elapsed time, consent, tab/paste counts |
| `conversation_turns` | Orchestrator `Database` | Ordered interviewer and candidate transcript |
| `code_submissions` | Orchestrator `Database` | Submitted source code and language |
| `outbox_events` | Orchestrator `emit_event()` and publisher | Durable completion work awaiting Feedback delivery |
| `feedback_reports` | Feedback `Database.save_report()` | Scores, detailed report, optional PDF URL |

The table definitions are in
[`init_dev_schema.sql`](./migrations/init_dev_schema.sql): sessions line 61,
conversation turns line 84, code submissions line 93, feedback reports line
105, and outbox events line 281.

## 11. Exact completion and violation caveats

- Only the normal `complete_session()` route writes the
  `session.completed` outbox event. The long-pause auto-complete branch does
  not; therefore it does not start this outbox feedback flow.
- Explicit cancellation and heartbeat-timeout cancellation do not generate
  feedback.
- The Orchestrator counts `tab_switch` and `paste`; its three-event threshold
  helper is not wired into the violation route.
- The AI streaming route and transcript-save route are separate. The AI
  service receives conversation history in its request; it does not fetch
  turns from Orchestrator automatically.
- Code execution returns test results. Saving a code submission is a
  separate Orchestrator request.
- Video token/recording operations do not complete or pause the interview.
- The AI stream checks the Redis token budget, but the streaming code path
  does not increment that counter with `record_tokens_used()`.

## Short version of the backend chain

`POST /sessions` validates and saves a `created` session. `POST
/sessions/{id}/start` marks it `in_progress`. Separate AI requests generate
questions; separate Orchestrator requests save each transcript turn. Separate
Code Execution and Video requests handle code and media. Supported tab-switch
and paste requests update session counters. Normal completion atomically saves
`completed` plus an outbox event. The outbox worker reads the transcript and
calls Feedback, which scores it, saves the report, and optionally stores a
PDF.
