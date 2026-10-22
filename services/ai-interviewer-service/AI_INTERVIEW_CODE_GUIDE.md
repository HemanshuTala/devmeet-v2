# AI Interviewer Code Guide (Easy English)

This guide explains the files in `services/ai-interviewer-service`: what their
main code, classes, and functions mean, and what they do. It also briefly explains
the tagged `services/admin-service/app/__init__.py` file.

It is written as a readable guide rather than a duplicate copy of every source
line. Blank lines are just spacing. Comments and docstrings are notes for people
reading the code; executable statements are what Python runs.

## What the AI Interviewer Service does

This service provides API endpoints for AI-assisted interviews. It can generate
questions and feedback, evaluate code and system designs, create hints, analyze
behavioral answers, track token use, and transcribe audio. It uses FastAPI for the
web API and Groq models for AI tasks. Supporting modules handle authentication,
rate limits, caching, safety checks, fallback answers, and Vault secrets.

The usual request flow is:

1. A client sends a request to an API endpoint.
2. The endpoint checks the caller's token with the Auth Service.
3. The endpoint applies limits or safety checks when that route uses them.
4. The AI manager or a helper prepares a prompt and calls the AI provider.
5. If the provider is unavailable, some operations return a built-in fallback.
6. FastAPI sends the result back as JSON or as a stream of server-sent events.

## File map

| File | In simple words |
|---|---|
| `services/ai-interviewer-service/app/main.py` | Creates and starts the FastAPI app. |
| `services/ai-interviewer-service/app/routes.py` | Defines API URLs and handles requests. |
| `services/ai-interviewer-service/app/ai_manager.py` | Coordinates AI calls, prompts, scoring, and fallbacks. |
| `services/ai-interviewer-service/app/prompts.py` | Builds interview prompts and provides offline questions. |
| `services/ai-interviewer-service/app/models.py` | Describes and validates request/response data. |
| `services/ai-interviewer-service/app/ai_limiter.py` | Uses Redis for rate, concurrency, and token limits. |
| `services/ai-interviewer-service/app/cache.py` | Keeps recent AI responses in memory. |
| `services/ai-interviewer-service/app/circuit_breaker.py` | Temporarily stops repeated failing AI calls. |
| `services/ai-interviewer-service/app/heuristics.py` | Uses simple rules to score answers and identify STAR parts. |
| `services/ai-interviewer-service/app/key_manager.py` | Loads and rotates API keys and model names. |
| `services/ai-interviewer-service/app/security.py` | Screens prompts, shortens history, and checks AI responses. |
| `services/ai-interviewer-service/app/middleware.py` | Adds request IDs and records request time. |
| `services/ai-interviewer-service/app/vault_service.py` | Reads API keys and other secrets from Vault. |
| `services/ai-interviewer-service/app/test_ai_interviewer.py` | Tests helpers and selected API behavior using fakes. |
| `services/ai-interviewer-service/requirements.txt` | Lists Python packages and their versions. |
| `services/ai-interviewer-service/Dockerfile` | Tells Docker how to build and start the service. |
| `services/ai-interviewer-service/README.md` | Gives the service overview and API/design notes. |
| `services/admin-service/app/__init__.py` | Marks the admin app folder as a Python package. |

## 1. `app/main.py` — starts the web service

### Imports and app settings

- `os` reads settings such as the frontend URL from environment variables.
- `asynccontextmanager` helps define code that runs while the app is open and
  cleanup code that runs when the app closes.
- `FastAPI` creates the API application.
- `CORSMiddleware` configures which browser origins may call it.
- `router` and `close_auth_client` come from the route module.
- `RequestIDMiddleware` adds a trace ID to each request.
- The `lifespan` function is attached to the FastAPI application.
- `app = FastAPI(...)` creates the application and sets its name and description.

### `lifespan(app)`

- Runs for the lifetime of the server.
- `yield` allows the application to serve requests.
- After the server is shutting down, it calls `close_auth_client()` to release the
  shared HTTP client used to contact the Auth Service.

### CORS setup

- `FRONTEND_URL` is the allowed browser origin; localhost is the development
  default.
- The middleware allows credentials, methods, and headers as configured in the
  source. CORS is a browser rule about which sites can call the API; it is not
  the same thing as user authentication.

### Middleware and router setup

- Adding `RequestIDMiddleware` wraps requests so they can be traced.
- `app.include_router(router)` attaches the interview API routes to the app.

### `health_check()`

- Handles `GET /health`.
- Returns a short JSON response saying the service is healthy and identifying it
  as the AI interviewer service.
- It is intended for monitoring and does not need interview data.

### `root()`

- Handles `GET /`.
- Returns a simple service-identification message.

### Direct-run block

- When this Python file is launched directly, the `__main__` block starts Uvicorn
  on `0.0.0.0:8004`.
- `0.0.0.0` means the server listens on the container's network interfaces, not
  only on localhost.

## 2. `app/routes.py` — API endpoints

### Imports and shared objects

- FastAPI imports provide route declarations, request objects, dependency
  injection, errors, status codes, uploads, and response types.
- `HTTPBearer` reads a bearer token from the `Authorization` header.
- `httpx` makes HTTP requests to the Auth Service and AI provider.
- `asyncio`, JSON, logging, and regular-expression helpers support async streaming,
  parsing, diagnostics, and text processing.
- Request/response classes come from `models.py`.
- `ai_manager` is the shared interview/AI coordinator.
- Limiter helpers check quotas and reserve/release per-user work slots.
- `router = APIRouter(...)` groups endpoints under `/api/v1/interview`.
- `security = HTTPBearer()` tells FastAPI which credential format to extract.
- `AUTH_SERVICE_URL` is configured from the environment, with a local default.
- `_auth_http_client` holds a shared connection-pooled client, initially empty.

### `get_auth_client()`

- Creates the shared `httpx.AsyncClient` if it does not yet exist or has been
  closed.
- Gives calls to the Auth Service connection and response time limits.
- Returns the reusable client.

### `close_auth_client()`

- Closes the shared Auth Service HTTP client if it is open.
- Clears the stored reference so a later startup can make a fresh client.

### `verify_token(token)`

- Sends the supplied token to the Auth Service's current-user endpoint.
- If the Auth Service returns HTTP 200, it returns the JSON user profile.
- A non-200 response or an exception produces `None`, meaning the token could not
  be verified.

### `get_current_user(credentials=Depends(security))`

- FastAPI supplies the bearer credential through `credentials`.
- The function passes the token to `verify_token`.
- If no user profile comes back, it raises HTTP 401, meaning the request is not
  authenticated.
- Otherwise, it returns the profile for the route to use.

### `generate_question(request_data, current_user)` — `POST /question`

- Receives interview settings, conversation history, and the authenticated user.
- Checks the request limit and, when applicable, the session token budget.
- Acquires a per-user AI slot to avoid overlapping work for the same user.
- Uses the request's session ID or the user's ID to identify the interview.
- Chooses a candidate name and asks `ai_manager` to generate the next turn.
- If the manager reports repeated injection violations, raises HTTP 422.
- Records token use through the limiter and returns an `InterviewResponse`.
- A `finally` block releases the per-user slot even if generation raises an error.

### `get_progressive_interview_turn(history, interview_type, difficulty, candidate_name)`

- Produces a scripted interview turn without contacting an AI model.
- Counts non-empty candidate turns.
- On the first turn, it creates an opening and asks an initial question.
- Later turns select a track-specific question: DSA, behavioral, or system design.
- At the end it asks a wrap-up or optimization question.
- This is a fallback for streaming failures. The current implementation does not
  use the `difficulty` argument in its decisions.

### `generate_question_stream(request_data, current_user)` — `POST /question/stream`

- Checks request/token limits and acquires a per-user slot.
- Checks the latest user message for a prompt-injection pattern. If the session has
  reached the violation threshold, it releases the slot and returns an SSE error.
- Builds system/user prompts and prunes old history to fit the context limit.
- Calls the AI provider asynchronously and sends generated text pieces as SSE
  events, so the client can display text before the whole answer is ready.
- It tries available model choices. If there is no key, all attempts fail, or no
  useful text arrives, it streams a scripted fallback word by word.
- At completion, it tries to parse the accumulated response as structured JSON
  and sends a final event with the question, hints, and follow-up questions.
- If the provider's text is not valid JSON, it can be returned as plain question
  text.
- A `finally` block inside the stream generator releases the slot after streaming.

### `generate_feedback(request_data, current_user)` — `POST /feedback`

- Checks the request limit and reserves an AI slot.
- Counts user answers and words before asking the model to evaluate the interview.
- If participation is too small, returns an incomplete/zero-score report instead.
- Otherwise it asks `ai_manager.generate_feedback` for scores, strengths,
  weaknesses, recommendations, and a summary.
- It returns the result in the `FeedbackResponse` shape.
- The slot is released in `finally`.

### `CodeEvalRequest`

- A Pydantic request schema for code evaluation.
- Carries the source code, interview question, programming language, and optional
  session ID and execution output.
- Pydantic checks incoming JSON types before the endpoint uses them.

### `evaluate_code(request_data, current_user)` — `POST /evaluate-code`

- Checks the user's rate limit.
- If a session ID is supplied, checks that session's token budget.
- Reserves an AI slot and passes code, question, language, and optional execution
  output to `ai_manager.evaluate_code_answer`.
- Returns the evaluation and releases the slot when done.

### `HintRequest`

- A Pydantic schema describing a hint request.
- Includes the question and interview type, with optional code and session ID.

### `get_hint(request_data, current_user)` — `POST /hint`

- Checks the caller's plan; the current handler allows Pro and Enterprise plans.
- Checks the question for injection patterns.
- Applies rate and optional session token checks, then reserves an AI slot.
- Makes a one-off provider request for a hint. If there is no API key or the call
  fails, it returns a simple fallback hint.
- Releases the slot in `finally`.
- This route currently makes its own AI request instead of calling the manager's
  multi-level `generate_hint` method.

### `STARAnalysisRequest`

- A Pydantic schema with the answer text and an optional session ID for STAR
  analysis.

### `analyze_star(request_data, current_user)` — `POST /star-analysis`

- Uses the heuristic helper to check for Situation, Task, Action, and Result
  signals in the answer.
- Returns the component flags, score/completeness, missing parts, and feedback.
- This handler uses local rules rather than an AI model.

### `get_adaptive_difficulty(session_id, base_difficulty, current_user)`

- Looks up the recent answer scores kept for the session.
- Uses the heuristic helper to choose an adaptive level.
- Returns the chosen and base levels, recent average score, number of scores, and
  whether the level changed.

### `get_violation_count(session_id, current_user)`

- Reads the session's recorded injection-violation count from the AI manager.
- Returns the count and whether it reached the three-strike threshold.

### `get_token_usage(session_id, current_user)`

- Reads prompt, completion, and total token counters for the session.
- Calculates an approximate cost using the fixed rates in the route.
- Returns the counts and estimated cost. It is an estimate, not a provider invoice.

### `transcribe_audio(file, current_user)` — `POST /transcribe`

- Reads the uploaded audio bytes.
- Passes the bytes and filename to `ai_manager.transcribe_audio`.
- Returns the transcription result.
- If transcription raises an error, the route converts it to an HTTP 500 response.

## 3. `app/ai_manager.py` — AI orchestration

### Imports and module state

- Standard imports support environment settings, JSON parsing, async work,
  logging, and typed collections.
- Groq client classes communicate with Groq models.
- Other local modules provide the circuit breaker, cache, API-key/model rotation,
  injection checks, prompt building, and answer heuristics.
- The module logger records AI events.
- `ai_manager = AIManager()` at the end makes one shared manager for the routes.

### `AIManager` class

This class keeps per-session state and groups operations that call or prepare the
AI provider.

#### `__init__()`

- Creates dictionaries for injection violation counts, token totals, and answer
  quality history.
- The session ID is used as the key, so different interviews have separate state.

#### `_get_client()`

- Asks the key manager for the next available API key.
- Returns a Groq client when a key is available, or `None` when there are no keys.

#### `transcribe_audio(audio_file_bytes, filename)`

- Chooses an audio content type from the filename extension.
- Tries the Groq transcription model with configured API keys.
- It can try a second transcription model when the preferred one is unavailable.
- Authentication errors move to another key; other failures are logged and also
  allow another attempt.
- If no attempt works, it raises `ValueError` rather than returning a made-up
  transcript.

#### `check_and_record_injection(session_id, text)`

- Runs the security module's injection detector on the text.
- If it matches a suspicious pattern, increments the session's strike count and
  logs a short preview.
- Returns `True` when the count reaches three or more, signalling termination.
- Ordinary text returns `False`.

#### `record_token_usage(session_id, prompt_tokens, completion_tokens)`

- Creates counters for a new session if necessary.
- Adds prompt and completion token counts and updates the total.
- Logs the accumulated token use.

#### `get_token_usage(session_id)`

- Returns stored prompt/completion/total counters.
- Returns zero counts if the session has never been recorded.

#### `_build_interview_system_prompt(...)`

- Passes interview type, difficulty, company, focus area, and candidate name to the
  prompt builder.
- Returns the resulting system instruction for the model.

#### `_build_question_user_message(conversation_history)`

- Passes the conversation to the prompt module to create the next user instruction.

#### `score_answer_quality(answer, interview_type)`

- Delegates to the heuristic module to assign a simple answer-quality score.

#### `get_adaptive_difficulty(session_id, base_difficulty)`

- Loads the session's recent score list and asks the heuristic module to recommend
  the difficulty.

#### `extract_star_components(answer)`

- Delegates to the heuristic helper that looks for Situation, Task, Action, and
  Result components.

#### `generate_interview_question(...)`

- Checks user messages in the conversation for injection attempts.
- On the strike threshold, returns a termination result instead of a new question.
- Scores the latest answer and stores its score for difficulty adaptation.
- Builds prompts and prunes old conversation messages to fit the context budget.
- If there is no provider client or the circuit breaker is open, returns a static
  question from `FALLBACK_QUESTIONS`.
- Otherwise, makes up to three AI chat-completion attempts and requests JSON.
- Parses the response, including trying to extract a JSON object if the model
  surrounds it with extra text.
- Validates that the question response has the expected shape.
- Records provider token counts when supplied and marks the circuit breaker
  successful on a good response.
- Invalid output is logged and retried; provider exceptions mark a failure, rotate
  to another client/model, and may stop if no client is available.
- Retries wait briefly with increasing, capped delay.
- If all attempts fail, it returns the static question fallback.

#### `generate_feedback(conversation_history, interview_type, user_answers)`

- First checks whether the interview contains enough candidate participation.
- If there are too few answers or too few words, returns an incomplete report with
  a zero score.
- Otherwise builds an evaluation prompt and asks the model for scores, strengths,
  weaknesses, recommendations, and summary.
- If no AI client is available, returns a built-in fallback report.
- Checks the response cache before making a new provider request.
- Parses and validates model JSON, supplies default values for missing score or
  summary fields, records available token usage, and caches valid feedback.
- Retries provider errors with model rotation and returns fallback feedback after
  attempts are exhausted.
- `user_answers` is accepted but the current prompt is built from
  `conversation_history`.

#### `evaluate_code_answer(code, question, language, execution_output=None)`

- Builds a prompt asking the model to score code, correctness, complexity, and
  possible improvements.
- Adds execution output when the caller provided it.
- Tries the AI provider and parses a response with a numeric score.
- If no client or no valid response is available, returns an “unevaluated” result.
- It rotates models on exceptions. This method does not use the response cache or
  the manager's token-usage recording.

#### `generate_hint(question, hint_level, interview_type, conversation_history)`

- Accepts only hint levels 1, 2, or 3; other values raise `ValueError`.
- Adds recent conversation context to the prompt when supplied.
- Requests a JSON hint and retries with model rotation on failures.
- Returns a valid string hint from the model, or a fixed fallback hint if no model
  response is usable.

#### `_fallback_hint(hint_level, interview_type)`

- Selects a prepared hint for the requested interview type and level.
- Uses a generic DSA hint if the type or level has no specific entry.

#### `analyze_sentiment(answer, question, interview_type="behavioral")`

- Asks the model to assess sentiment, confidence, emotional signals, strengths,
  and suggestions.
- Accepts a parsed response with a numeric sentiment score.
- Rotates models after errors.
- Returns `_fallback_sentiment_analysis()` if it cannot get a usable result.
- The current prompt does not use the `interview_type` argument.

#### `_fallback_sentiment_analysis()`

- Returns a fixed neutral-style sentiment result with preset scores and feedback.
- It is used when AI sentiment analysis is unavailable.

#### `evaluate_system_design(design_description, question, scale_requirements=None)`

- Builds a prompt to evaluate coverage of system-design components.
- Adds scaling requirements to the prompt when provided.
- Parses results that contain a numeric overall score.
- Retries with model rotation after provider errors.
- Returns a prepared fallback evaluation when no valid model result is available.

#### `_fallback_system_design_evaluation()`

- Creates a result with zero scores and marks design components as not covered.
- Explains that the real evaluation could not be completed.

#### `_fallback_question(interview_type)`

- Selects a prepared opening/question payload for the requested track.
- Uses the DSA question if the requested track is unknown.

#### `_fallback_feedback()`

- Returns a zero-score feedback structure with an unavailable-service explanation
  and recommendations to retry.

## 4. `app/prompts.py` — instructions given to the model

### Imports

- `Optional`, `List`, and `Dict` are type hints describing values that may be
  absent or collections of values.

### `build_interview_system_prompt(...)`

- Creates the long system instruction that tells the model how to act as an
  interviewer.
- Maps interview types such as DSA, behavioral, and system design to explanations.
- Maps easy, medium, and hard difficulty to suitable expectations.
- Adds company and focus-area details when provided.
- On the opening turn, tells the model to greet the candidate and start with a
  suitable question.
- On later turns, tells it how to respond to the candidate's latest answer.
- Adds track-specific guidance: use STAR for behavioral answers, requirements and
  architecture for system design, or algorithms, complexity, and edge cases for
  DSA.
- Requests raw JSON containing a question, hints, and follow-up questions.
- Unknown type/difficulty values use generic wording rather than failing.

### `build_question_user_message(conversation_history)`

- Builds the user-level instruction for the next model response.
- With no history, asks the model to greet the candidate and ask an opening
  question.
- Otherwise searches backward for the latest candidate message and counts its
  words.
- A short answer (under 15 words) is treated as vague and should receive a follow-up
  on the same subject.
- A longer answer should be acknowledged before a follow-up or new question.
- The expected JSON fields are included in the instruction.

### `FALLBACK_QUESTIONS`

- A dictionary of ready-made question payloads for DSA, behavioral, and system
  design interviews.
- Each track includes a question, hints, and follow-up questions.
- The manager uses these payloads when an AI response cannot be generated.

## 5. `app/models.py` — API data validation

- `BaseModel` creates the Pydantic schemas used by FastAPI.
- `Field` describes required/default values.
- `Optional` means a field may be missing or `None`; `List` means a list.
- `datetime` is imported but is not used by the shown schema fields.

### `ConversationMessage`

- Represents one conversation item.
- Requires a role (for example, user or assistant) and text content.
- Its custom `dict()` method returns only those two fields in dictionary form.

### `InterviewRequest`

- Describes the data needed to generate an interview turn.
- Requires interview type and difficulty.
- Allows optional session ID, company, and focus area.
- Conversation history defaults to an empty list.

### `InterviewResponse`

- Describes a generated question.
- The question is required; hints and follow-up questions default to empty lists.

### `FeedbackRequest`

- Describes a request to evaluate an interview.
- Includes required conversation history and interview type.
- Session ID is optional; user answers default to an empty list.

### `FeedbackResponse`

- Describes the feedback returned to the client.
- Overall, technical, and communication scores are required.
- Problem-solving score defaults to zero.
- Strengths, weaknesses, recommendations, and summary have safe empty defaults.

## 6. `app/ai_limiter.py` — rate and usage guards

### Imports and settings

- `os` reads limit settings from the environment.
- `time` creates timestamps for sliding windows.
- `logging` records Redis errors.
- FastAPI's `HTTPException` and `status` return HTTP rate-limit errors.
- Defaults include 30 requests per 60 seconds, one concurrent request per user,
  and a 50,000-token session budget. The concurrency lock expires after 120 seconds.
- Redis connection state is cached in module variables.

### `_get_redis()`

- Imports the asynchronous Redis client when first needed.
- Connects using the configured Redis host and port, then tests the connection with
  `ping()`.
- Reuses the client on later calls.
- If Redis is unavailable, logs the problem and returns `None`.

### `check_ai_rate_limit(user_id)`

- Uses a Redis sorted set as a sliding-window request counter for one user.
- Removes old request entries, counts requests in the current window, records the
  new one, and refreshes the key's expiry.
- If the limit was reached, raises HTTP 429 and provides retry timing.
- If Redis errors, it logs the problem and generally allows the request to continue.

### `acquire_ai_slot(user_id)`

- Attempts to create a lock key for the user that expires after the configured
  lock time.
- Redis `NX` means “only create this key if it does not already exist.”
- If another request holds the slot, raises HTTP 429.
- If Redis is unavailable, it allows the request through.

### `release_ai_slot(user_id)`

- Deletes that user's concurrency lock after work completes.
- Missing Redis or deletion errors do not stop the route.

### `check_token_budget(session_id)`

- Reads the session's token counter from Redis.
- Raises HTTP 429 if it has reached the configured limit.
- Redis errors are logged and do not block the request.

### `record_tokens_used(session_id, tokens)`

- Adds token use to the session counter.
- Sets the counter to expire after 24 hours.
- Returns the updated total, or `None` if Redis is unavailable or the update fails.

## 7. `app/cache.py` — repeated-response cache

### `ResponseCache`

Stores recent responses in memory so the exact same prompt/model request can reuse
the previous result.

#### `__init__(max_size=200, ttl_seconds=300.0)`

- Sets the maximum number of cached records and how long each can stay valid.
- Creates the internal dictionary.

#### `_make_key(messages, model)`

- Converts messages into stable JSON text with sorted keys.
- Adds the model name and calculates a SHA-256 digest.
- The digest is used as a compact key for looking up an exact request.

#### `get(messages, model)`

- Builds the request key and checks for a saved response.
- Returns `None` if there is no entry.
- Deletes and returns `None` for an expired entry.
- Otherwise returns the cached response.

#### `put(messages, model, response)`

- If the cache is full, removes the entry with the oldest timestamp.
- Stores the response and the current time under the request key.

### `default_response_cache`

- A shared cache with a limit of 200 entries and a five-minute lifetime.

## 8. `app/circuit_breaker.py` — pauses calls after failures

### `CircuitBreaker(threshold=5, window=60.0, reset_timeout=30.0)`

- Stores the number/times of recent failures and the time at which calls may resume.
- The defaults mean five failures within a 60-second period open the circuit for
  30 seconds.

### `record_failure()`

- Removes failure timestamps that are older than the window.
- Adds the current failure time.
- If the threshold is reached, sets an open-until time and logs the event.

### `record_success()`

- Clears recent failures and resets the open-until time.

### `is_open`

- Returns `True` while the current time is earlier than the open-until time.
- Returns `False` once the timeout has passed.
- There is no separate half-open state or coordinated test request in this class.

### `default_circuit_breaker`

- A shared breaker using the default failure threshold and timings.

## 9. `app/heuristics.py` — simple local scoring

### `score_answer_quality(answer, interview_type)`

- Starts with a middle score.
- Adds points for longer answers.
- Subtracts a point for very short answers.
- Looks for words related to the interview type and adds points for matches.
- Keeps the final score in the 0–10 range.
- This is a simple keyword/length estimate, not a deep evaluation of correctness.

### `calculate_adaptive_difficulty(recent_scores, base_difficulty)`

- If there are fewer than two scores, keeps the starting difficulty.
- Otherwise averages up to the latest three scores.
- A high average raises difficulty by one level; a low average lowers it by one.
- Other averages preserve the base level.
- Unknown base difficulty names are left unchanged.

### `extract_star_components(answer)`

- Converts the answer to lowercase and looks for words/phrases associated with
  Situation, Task, Action, and Result.
- Returns a boolean for each component, completeness, missing component names, and
  an integer score.
- This checks for language clues; it does not prove that the answer is factually
  complete.

## 10. `app/key_manager.py` — keys and model rotation

### Module-level key loading

- Imports environment settings and the shared Vault service.
- Creates a list for Groq API keys.
- If Vault is available, asks it for keys and adds them.
- Then checks `GROQ_API_KEY` and numbered alternatives up to `_5`.
- Duplicate keys are not added again.
- If none are found, the module prints a warning.

### `_get_next_key()`

- Returns `None` if the key pool is empty.
- Otherwise returns the next key and advances an index so later calls rotate
  through the pool.

### `_MODEL_FALLBACKS` and `_model_index`

- Store the configured/default model and alternate model names.
- `GROQ_MODEL` can choose the first model; the code uses its configured fallback
  names for later attempts.

### `_get_next_model()`

- Returns the next model in the list and advances the model index.
- When it reaches the end, rotation cycles back through the list.

## 11. `app/security.py` — screening and response checks

### Injection patterns

- `_INJECTION_PATTERNS` contains regular expressions for known instruction
  overrides, jailbreak language, delimiter tricks, and attempts to reveal hidden
  instructions.
- `_INJECTION_RE` compiles the expressions once so repeated checks are faster.

### `detect_injection(text)`

- Tests the text against the compiled patterns.
- Returns `True` when a pattern matches and `False` otherwise.
- Pattern matching is a guard for known phrases, not a guarantee that every
  malicious or unusual prompt will be detected.

### Context limits

- `MAX_CONTEXT_TURNS` limits how many messages are kept initially.
- `APPROX_CHARS_PER_TOKEN` estimates tokens from character count.
- `MAX_CONTEXT_CHARS` sets the approximate total character allowance.

### `prune_conversation_history(history, system_prompt, current_question="")`

- Returns an empty list when there is no history.
- Starts with the newest portion of the conversation.
- Counts the system prompt and current question toward the context allowance.
- If the content is still too long, removes the oldest messages in pairs until it
  fits or no history is left.
- This limits prompt size and keeps newer conversation context.

### `validate_question_response(data)`

- Checks that a response has a string `question` longer than five characters.
- Returns whether the basic question structure is acceptable.

### `validate_feedback_response(data)`

- Checks that the overall score is numeric and within 0–100.
- Also requires `strengths` and `weaknesses` to be lists.
- Returns whether the response passes these basic shape checks.

## 12. `app/middleware.py` — request IDs and timing

### Imports and logger

- `uuid` creates IDs, `time` measures duration, and `logging` writes request logs.
- FastAPI/Starlette request, response, and middleware types describe the HTTP flow.
- A named logger is used for request ID messages.

### `RequestIDMiddleware`

- A middleware class that runs before and after the API route.

#### `dispatch(request, call_next)`

- Reads `X-Request-ID` from the incoming request or creates a UUID if missing.
- Stores it in `request.state` for application code.
- Records a start time and waits for the route to produce a response.
- Adds the same ID to the outgoing response header.
- Logs the request ID, method, path, status, and elapsed milliseconds.
- Returns the response to the client.

## 13. `app/vault_service.py` — secret storage client

### `VaultService`

This class wraps HashiCorp Vault operations so other modules can request secrets
without repeating the connection logic.

#### `__init__()`

- Reads Vault address, token, role, and secret path from environment settings.
- Starts with no client and calls `_initialize_client()`.

#### `_initialize_client()`

- Does nothing if no Vault token is configured.
- Otherwise creates an HVAC Vault client and checks whether the token is
  authenticated.
- Logs problems and leaves the client unavailable if initialization fails.

#### `is_available()`

- Returns whether a client exists and currently reports itself as authenticated.

#### `get_secret(path=None)`

- Returns `None` if Vault is unavailable.
- Otherwise reads the requested path or configured default KV-v2 secret.
- Unwraps Vault's response to return the inner key/value dictionary.
- Missing values and errors are logged/returned as `None`.

#### `get_groq_api_keys()`

- Reads the configured Vault secret.
- Collects non-empty Groq key fields, including numbered key fields.
- Returns the keys as a list.

#### `get_dynamic_secret(path)`

- Derives a Vault role name from the final part of the requested path.
- Requests dynamic credentials from Vault.
- Returns the credential data, or `None` if unavailable or unsuccessful.

#### `renew_lease(lease_id, increment=3600)`

- Requests renewal of a Vault lease for the supplied number of seconds.
- Returns `True` if renewal worked and `False` if Vault is unavailable or errors.

### `vault_service`

- A shared `VaultService` instance created when the module is imported.

## 14. `app/test_ai_interviewer.py` — test cases

### Test setup and fixtures

- The tests mock the Vault dependency before importing the app so they do not need
  a live Vault server.
- `mock_user` supplies a fake signed-in Pro user.
- `client(mock_user)` patches token verification, creates a FastAPI `TestClient`,
  and yields it for endpoint tests.
- Mocks make tests repeatable and avoid real provider/network calls where needed.

### Health and root tests

- `test_health_check` checks the health JSON and service name.
- `test_root` checks that the root endpoint succeeds.

### Injection detector tests

- `test_detect_injection_classic` checks common override/jailbreak examples.
- `test_detect_injection_safe` checks normal interview text is not flagged.
- `test_detect_injection_data_exfiltration` checks requests to reveal internal
  instructions are flagged.

### Context-pruning tests

- `test_prune_empty_history` checks that empty input stays empty.
- `test_prune_short_history` checks short exchanges are preserved.
- `test_prune_long_history` checks old messages are removed when the history is too
  long.

### Response-validation tests

- `test_validate_question_response_valid` and
  `test_validate_question_response_invalid` check acceptable and rejected question
  shapes.
- `test_validate_feedback_response_valid` and
  `test_validate_feedback_response_invalid` check feedback shape and score limits.

### STAR tests

- `test_star_extraction_complete` checks an answer with all STAR clues.
- `test_star_extraction_partial` checks missing components.
- `test_star_extraction_empty` checks an empty answer.

### Difficulty and answer-score tests

- `test_adaptive_difficulty_upgrade` checks a high average raises difficulty.
- `test_adaptive_difficulty_downgrade` checks a low average lowers difficulty.
- `test_adaptive_difficulty_no_change` checks a middle average preserves it.
- `test_adaptive_difficulty_insufficient_data` checks too few scores do not change
  the level.
- `test_score_answer_quality_detailed` compares a longer keyword-rich answer with
  a weak short answer.
- `test_score_answer_quality_behavioral` checks a behavioral/STAR-style answer.

### Token and injection-count tests

- `test_token_usage_tracking` checks token counts accumulate.
- `test_token_usage_unknown_session` checks an unknown session returns zeros.
- `test_violation_counting` checks strikes are counted up to the termination level.
- `test_violation_safe_input` checks safe text does not add a strike.

### Fallback tests

- `test_fallback_question_dsa`, `test_fallback_question_behavioral`, and
  `test_fallback_question_system_design` check the question fallback for each track.
- `test_fallback_feedback` checks the fallback feedback shape.
- `test_fallback_hints_all_levels` checks the three levels across interview types.
- `test_key_rotation` checks empty and populated API key pools.

### Circuit breaker tests

- `test_circuit_breaker_opens` checks that enough failures open the breaker.
- `test_circuit_breaker_success_resets` checks a success clears failure state.

### Prompt tests

- `test_system_prompt_dsa` checks the DSA system prompt and candidate name.
- `test_system_prompt_with_company` checks company and focus-area details are added.
- `test_user_message_empty_history` checks the first-turn instruction.
- `test_user_message_short_answer` checks short answers are probed.
- `test_user_message_detailed_answer` checks detailed answers are acknowledged and
  followed up appropriately.

### Endpoint tests

- `test_star_analysis_endpoint` checks the STAR route result.
- `test_adaptive_difficulty_endpoint` checks the adaptive-difficulty route.
- `test_violations_endpoint` checks the injection counter endpoint.
- `test_token_usage_endpoint` checks counts and approximate cost.
- `test_feedback_incomplete_interview` checks the incomplete-answer feedback path.
- `test_hint_free_plan_rejected` checks that a Free plan cannot request a hint.

## 15. Root files for this service

### `requirements.txt`

Each line pins a Python library to a version:

- `fastapi` defines the API.
- `uvicorn[standard]` runs the ASGI web application.
- `pydantic` validates request and response data.
- `pydantic-settings` supports configuration from environment/settings.
- `httpx` makes asynchronous HTTP requests.
- `groq` provides the Groq AI client.
- `python-dotenv` can load environment values from a `.env` file.
- `hvac` is the HashiCorp Vault Python client.
- `python-multipart` supports uploaded files such as audio.
- `redis` provides the Redis client used by the limiter.

### `Dockerfile`

1. `FROM python:3.11-slim` chooses a small Python 3.11 base image.
2. `WORKDIR /app` sets the container's working folder.
3. `COPY requirements.txt .` copies the dependency list into the image.
4. `RUN pip install ...` installs the dependencies without retaining pip's cache.
5. `COPY . .` copies the service source into the image.
6. `EXPOSE 8004` documents the port used by the API.
7. `CMD [...]` starts Uvicorn, loading `app.main:app` on port 8004.

### `README.md`

The README describes the service architecture, request flow, module layout, API
examples, tests, and design/interview notes. Treat it as the overview; this guide
explains how the actual modules and functions fit together.

## 16. Tagged `services/admin-service/app/__init__.py`

- This file contains a short package docstring: `admin-service`.
- Its presence marks the admin `app` directory as a Python package so Python can
  import modules from it.
- It does not define a function or execute admin-service operations.

## Important terms

| Term | Easy meaning |
|---|---|
| API endpoint | A URL and method that performs a particular operation. |
| Async / `await` | Waits for network or database work without freezing other requests. |
| Bearer token | A login credential sent in the HTTP Authorization header. |
| Circuit breaker | A temporary pause after repeated failures to avoid piling up more failing calls. |
| CORS | A browser rule controlling which websites may call an API. |
| Fallback | A prepared response used when the normal AI or database path is unavailable. |
| Heuristic | A simple rule or clue used to estimate an answer's quality. |
| Middleware | Code that wraps requests before and after an endpoint runs. |
| Pydantic schema | A definition used to check incoming or outgoing data fields and types. |
| Redis | A fast shared store used here for counters and short-lived locks. |
| SSE | Server-Sent Events: a response that sends updates progressively over one HTTP connection. |
| STAR | Situation, Task, Action, Result: a structure for behavioral interview answers. |
| Token | A piece of text counted by an AI model when it reads or generates content. |
| Vault | A service for securely storing and retrieving secrets such as API keys. |

## Behavior notes visible in the current code

- The regular question endpoint checks all user messages for injection, while the
  streaming endpoint checks only the latest user message.
- The feedback route and AI manager use different minimum-answer/word thresholds.
  A request may pass the route's first check and still receive the manager's
  incomplete-interview response.
- The streaming question handler does not use all of the normal manager path's
  features, such as its circuit-breaker/schema-validation/token-recording flow.
- The `/hint` route makes its own provider request instead of using the manager's
  progressive hint implementation.
- The AI manager's sentiment method accepts an interview type, but its current
  prompt does not include that value.
- The circuit breaker has a timeout-based open/closed check, but no explicit
  half-open probe state.

These notes describe current implementation behavior; they are not claims that
every design choice is ideal.
