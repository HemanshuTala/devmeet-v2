# Code Execution Service: Easy-English Code Guide

This guide explains the files, main code sections, classes, and functions in
this service in plain English. It describes what the code currently does,
rather than treating every README statement or source comment as guaranteed
behavior.

## What this service does

The Code Execution Service accepts code written in a supported language,
checks it with a source-text safety scanner, and can run it in Docker. It also
offers endpoints for running test cases, submitting work to a background
queue, checking job status, comparing code text for similarity, and listing
the supported languages.

The service's API listens on port `8005`. Its main components are:

1. FastAPI receives and validates HTTP requests.
2. The routes check requests and call the executor, test runner, or queue.
3. The executor tries to use Docker to run the submitted program.
4. Optional helpers send work through RabbitMQ and Redis or save code snapshots
   through the File Service or S3.

## Files and folders

### `app/main.py` — create and start the API

- The opening text describes the purpose and intended capabilities of the
  service.
- `import os` is used to read the frontend origin from an environment
  variable.
- The FastAPI imports provide the web application and browser CORS support.
- The local imports bring in the API router and request-ID middleware.
- `app = FastAPI(...)` creates the web application and sets its title,
  description, and version.
- `app.add_middleware(CORSMiddleware, ...)` sets the allowed browser origin.
  It reads `FRONTEND_URL`; if that variable is not set, it allows
  `http://localhost:3000`. It also enables credentials and accepts all methods
  and headers.
- `app.add_middleware(RequestIDMiddleware)` makes the request-ID logger run
  for requests and responses.
- `app.include_router(router)` adds the execution endpoints from `routes.py`.
- `startup_event()` runs when FastAPI starts. It imports and calls
  `start_queue_worker()` to start the background RabbitMQ consumer thread.
- `health_check()` handles `GET /health` and returns a simple healthy status
  and service name.
- `root()` handles `GET /` and returns a welcome message.
- `if __name__ == "__main__":` runs the app directly with Uvicorn when this
  Python file itself is started. In that case it listens on port `8005`.

### `app/middleware.py` — add request tracking

- `uuid`, `logging`, and `time` are used to make request IDs, write log
  messages, and measure elapsed time.
- `Request`, `Response`, and the Starlette middleware types describe the HTTP
  request/response and middleware interface.
- `logger` creates the named logger `request_id`.
- `RequestIDMiddleware` is the middleware class installed by `main.py`.
- `dispatch(request, call_next)` handles each HTTP request:
  1. It reads `X-Request-ID` from the incoming request. If there is no value,
     it creates a UUID.
  2. It stores the ID on `request.state.request_id`.
  3. It records the start time.
  4. It calls the next middleware or API endpoint and waits for its response.
  5. It adds `X-Request-ID` to the response headers.
  6. It calculates the duration in milliseconds and logs the ID, method, URL
     path, response status, and duration.
  7. It returns the response.

The timer uses `time.time()`, which is a wall-clock timer. The module
description does not change what the code actually does.

### `app/models.py` — validate API data

This file defines Pydantic models. FastAPI uses them to reject invalid request
data and shape some responses.

- `Language` is a string-valued enum. It accepts these language identifiers:
  `python`, `javascript`, `java`, `cpp`, `go`, and `rust`.
- `ExecutionRequest` describes a basic run request:
  - `code` must be a string with 1 to 10,000 characters.
  - `language` must be one of the `Language` values.
  - `timeout_seconds` defaults to 10 and must be between 1 and 60.
- `ExecutionResponse` describes the basic execution result:
  - `success` says whether execution succeeded.
  - `output` contains standard output.
  - `error` may contain an error message.
  - `execution_time` is the measured run time in seconds.
  - `memory_used` may contain a memory value when measured.
- `TestResult` is a separate response model for a test result. It has a test
  name, pass/fail value, actual output, and expected output. The current
  `/run-tests` route returns dictionaries from the submission runner rather
  than using this model as its response model.

Some comments beside the enum values describe image versions that do not all
match the executor's actual image configuration. See the notes at the end of
this guide.

### `app/routes.py` — expose HTTP endpoints and helpers

#### Imports and shared settings

- The imports provide asynchronous operations, regular expressions, Python AST
  parsing, type hints, FastAPI routing and errors, Pydantic request models,
  HTTP calls to another service, and operating-system environment access.
- `ExecutionRequest`, `ExecutionResponse`, `Language`, and `TestResult` are
  imported data models. `TestResult` is imported but is not used in the
  displayed routes.
- `executor` is the shared code execution engine.
- `test_runner` and `TestCase` provide the multi-test execution path.
- `FILE_SERVICE_URL` reads the File Service address from the environment. If
  it is not set, the default is `http://file-service:8011`.

#### `persist_code_snapshot(code, job_id, language)`

Saves submitted source code using the File Service, with a local-file fallback.

1. It maps known language names to file extensions and builds a filename
   containing the job ID.
2. It sends the code bytes to the File Service's `/api/v1/files/upload-bytes`
   endpoint in the `code-snapshots` folder.
3. If that service returns HTTP 200, it returns the URL from the response.
4. If the upload raises an exception or does not return HTTP 200, it tries to
   create `uploads/code-snapshots` and write the code to a local file.
5. If the local write succeeds, it returns the local URL-like path. If local
   saving also fails, it logs the error and returns `None`.

This helper is scheduled in the background by the synchronous and queued
execution routes. It does not return an API response to the caller.

#### Router and shared jobs

- `router = APIRouter(...)` groups the routes under
  `/api/v1/execute`.
- `_pending_jobs` is an in-memory dictionary described as a job map. The
  current routes shown in this file do not use it; asynchronous status is
  stored in Redis by the queue manager.

#### `scan_code_safety(code, language)`

Checks source text for configured patterns before execution. It returns a
human-readable violation string when a check matches, or `None` when no check
matches.

- First, it tests the source text against the configured regular expressions
  for all languages.
- For Python, it also parses the text into an Abstract Syntax Tree (AST) and
  inspects import statements and function calls.
- A Python syntax error is ignored by this scanner; compilation or execution
  later reports it.
- This is a text/AST filter, not a proof that code is safe. Passing this
  function only means that these particular checks did not find a configured
  match.

#### `_tokenize(code)`

Finds word-like tokens in a code string, changes them to lowercase, and
returns a set. Repeated tokens are kept only once. This set is used by the
similarity calculation.

#### `jaccard_similarity(a, b)`

Compares two token sets. It divides the number of tokens they share by the
number of unique tokens in either set. If either code sample has no tokens, it
returns `0.0`. The result is between 0 and 1.

#### Request models declared in this file

- `TestCaseModel` describes one test's input, expected output, display name,
  and whether it is hidden.
- `RunWithTestsRequest` describes a test-suite request. Code is limited to
  1–20,000 characters; it requires a supported language and 1–20 test cases;
  its timeout defaults to 15 seconds and must be between 1 and 60.
- `PlagiarismRequest` holds the two code strings to compare.
- `AsyncJobResponse` describes the job ID, current status, and explanatory
  message returned when submitting a job.

#### `execute_code(request, background_tasks)`

Handles `POST /api/v1/execute`.

1. It scans the code with `scan_code_safety()`.
2. If a violation is found, it returns a failed `ExecutionResponse` with an
   explanatory error and zero execution time. This branch returns a normal
   response model rather than raising an HTTP error.
3. If the scan passes, it creates a temporary job ID and schedules
   `persist_code_snapshot()` as a FastAPI background task.
4. It calls `executor.execute_code()` with the code, language, and requested
   timeout.
5. It converts the returned dictionary into an `ExecutionResponse`.
6. If the executor call raises an exception, it raises HTTP 500 with an
   execution error message.

#### `run_with_test_cases(request)`

Handles `POST /api/v1/execute/run-tests`.

1. It scans the submitted code. If a violation is found, it returns a
   failure-shaped JSON object and does not run the tests.
2. It converts each incoming test model into a `TestCase` object understood
   by `submission_runner.py`.
3. It calls `test_runner.run_test_cases()` with the code, language, tests, and
   timeout.
4. It returns the per-test results, pass/fail counts, pass rate, total
   duration, and whether every test passed.
5. If the runner raises, the route returns HTTP 500 with a test-execution
   error message.

#### `submit_async(request, background_tasks)`

Handles `POST /api/v1/execute/submit-async`.

1. It generates a UUID for the job.
2. It scans the code before queueing.
3. If the scan finds a violation, it stores a completed failure result in
   Redis and returns a response whose status is `failed`.
4. If the scan passes, it schedules a code snapshot and calls
   `publish_execution_task()` to publish the work to RabbitMQ.
5. If publishing fails, it raises HTTP 500. Otherwise it returns the job ID
   and status `queued`.

#### `get_job_status(job_id)`

Handles `GET /api/v1/execute/status/{job_id}`.

1. It reads `execution_job:{job_id}` from Redis.
2. If no value exists, it raises HTTP 404 with `Job not found`.
3. It parses the stored JSON.
4. If the stored status is `pending`, it returns that status.
5. Otherwise it returns a `completed` status and the stored result.

The route treats every non-pending stored status as `completed`, including
statuses such as `error`.

#### `check_plagiarism(request)`

Handles `POST /api/v1/execute/check-plagiarism`. It calls
`jaccard_similarity()` on the two code strings, flags the result when it is
above `0.80`, rounds the score to four decimal places, and returns a message.
This is a basic token-overlap comparison, not a full plagiarism determination.

#### `scan_safety(request)`

Handles `POST /api/v1/execute/scan-safety`. It runs the same configured
scanner used before execution and returns whether a pattern was found, the
violation text, and the selected language. It does not execute the code.

#### `get_supported_languages()`

Handles `GET /api/v1/execute/languages`. It returns a list of language IDs,
display names, and file extensions. Its displayed version labels are
documentation strings; they are not used to select the runtime images.

#### `_inject_stdin(code, language, stdin_data)`

Builds a modified source string for Python or JavaScript by inserting a
simple input helper before the submitted code. For other language values, it
returns the original code unchanged. This helper is defined in this file but
is not called by the current route functions shown here; the submission runner
has its own language-specific wrapping method.

### `app/executor.py` — start Docker containers and collect results

#### Imports, logger, and Docker SDK detection

- The imports provide subprocess and asynchronous process management,
  temporary files, platform checks, JSON handling, timing, logging, and
  optional types.
- `s3_code_service` is the helper for optional S3 snapshots.
- The `try` block imports the Docker Python SDK. If it is missing, the module
  records that the SDK is unavailable and logs a warning.

#### `CodeExecutor.__init__()`

Sets initial executor state and chooses the Docker connection strategy.

1. It sets a default timeout of 10 seconds and records whether the host is
   Linux.
2. It initializes the Docker client and diagnostic fields.
3. If the Docker SDK is installed, it calls `_create_docker_client()`.
4. If that does not create a client, it checks whether the Docker CLI can
   contact a daemon using `_cli_available()`.
5. If neither route works, code execution will return an unavailable error.

#### `_create_docker_client()`

Tries multiple ways to connect the Docker SDK to the Docker daemon: the
`DOCKER_HOST` setting, the SDK's environment defaults, known Unix socket
paths, and configured local TCP addresses. It pings the daemon before
accepting a connection. If all attempts fail, it raises `RuntimeError`
containing diagnostics for the attempted connections.

#### `_cli_available()`

Runs `docker info` with a five-second timeout. It returns `True` only if the
command exits successfully; command errors and timeouts return `False`.

#### `_execute_via_cli(code, language, timeout, session_id=None)`

Runs code by starting Docker through the command-line interface.

- It looks up the image and execution settings for the chosen language. An
  unsupported language produces a failure result.
- For Python and JavaScript, it passes the code to the container's runtime
  command.
- For Java, C++, Go, and Rust, it writes the code to a temporary file and
  mounts the directory in the container.
- It starts the container with resource and isolation options configured in
  this function, waits for output, and stops waiting when the configured
  timeout plus a small allowance is reached.
- It decodes standard output and error, determines success from the exit code
  and timeout state, and returns a result dictionary.
- If a session ID is supplied and S3 is available, it attempts to upload a
  snapshot.
- If an unexpected exception occurs, it returns a failed result with the
  exception text.
- In a `finally` block, it removes the temporary host directory when one was
  created.

The CLI configurations in this method are separate from those in the SDK
execution method. Their image versions and runtime commands are not identical.

#### `execute_code(code, language, timeout=10, session_id=None)`

This is the main execution method called by the routes and queue worker.

1. If there is no SDK client, it uses `_execute_via_cli()` when the CLI
   fallback was detected. If neither Docker option is available, it returns a
   failed result explaining that the sandbox cannot be reached.
2. It selects a runtime image and command for the language. Unsupported
   languages return a failed result.
3. It writes the code to a temporary file.
4. For languages configured for a separate compilation stage, it attempts
   compilation in a container. A compilation error returns a failed result.
5. It starts a container with the isolation/resource settings configured in
   the method. Some compiled languages use a temporary writable area.
6. It waits for completion up to the requested timeout, then reads container
   logs and tries to collect memory statistics.
7. It removes the temporary container and host file in the `finally` block.
8. It returns success, output, errors, timing, memory, exit code, and timeout
   information.
9. If `session_id` is supplied and S3 is available, it attempts to save the
   result snapshot.

The method catches execution errors and returns them as failed-result
dictionaries. Some cleanup and memory-stat collection errors are intentionally
ignored so they do not hide the main execution result.

#### Shared object

`executor = CodeExecutor()` creates the shared executor when this module is
imported. This also means Docker availability is checked as part of module
initialization.

### `app/submission_runner.py` — run a code sample against multiple tests

#### Imports and logger

The module imports asynchronous support, Docker, type hints, temporary-file
utilities, JSON and regular-expression helpers, Python parsing, timing,
logging, and `CodeExecutor`. The actual sandbox work is delegated to a
`CodeExecutor` instance.

#### `TestCase`

- `TestCase.__init__(input_data, expected_output, is_hidden=False)` stores one
  test's input, expected answer, and hidden flag.
- `TestCase.to_dict()` returns those three values as a dictionary.

#### `TestResult`

- `TestResult.__init__(...)` stores the test, whether it passed, actual output,
  execution duration, and any error.
- `TestResult.to_dict()` creates the result dictionary. For a visible test it
  includes the input and expected output. For a hidden test it leaves those
  values out. It includes an error only when one exists.

#### `TestRunner`

- `TestRunner.__init__()` creates a `CodeExecutor` used by this test runner.
- `run_test_cases(code, language, test_cases, timeout=10)` runs each test in
  order using `_run_single_test()`. It counts passed and failed tests,
  accumulates execution time, and returns a summary with the per-test results
  and pass percentage. If a test raises an unexpected exception, it records a
  failed result for that test and continues.
- `_run_single_test(code, language, test_case, timeout)` prepares a wrapped
  program with `_wrap_code_with_io()`, executes it, and compares the output to
  the expected answer using `_compare_outputs()`. If execution fails or
  raises, it returns a failed `TestResult` with the available error details.
- `_wrap_code_with_io(code, language, input_data)` creates language-specific
  wrapper code to provide the test input and capture or display output. The
  implementation has special branches for Python, JavaScript, Java, C++, and
  Go; languages without a branch run the submitted code unchanged.
- `_compare_outputs(actual, expected)` tries several ways of comparing
  results: stripped exact text, whitespace-insensitive text, normalized
  booleans, parsed JSON/Python literals, order-independent list comparison,
  approximate numeric equality, and finally whitespace-collapsed text.
- `parse_test_cases_from_json(test_cases_json)` parses a JSON array into
  `TestCase` objects. Missing input, expected output, or hidden fields receive
  defaults. If the text is not valid JSON, it logs the parse error and raises
  `ValueError`.

`test_runner = TestRunner()` creates the shared runner at module import. It
owns its own `CodeExecutor` instance rather than using the route module's
shared `executor` object.

### `app/queue_manager.py` — queue work using RabbitMQ and Redis

#### Connection settings

The module reads RabbitMQ and Redis host, port, and credential settings from
environment variables. Defaults are intended for local development. The
queue is named `code_execution_tasks`.

- `get_redis_client()` creates a Redis client configured to return strings
  instead of bytes.
- `get_rabbitmq_channel()` connects to RabbitMQ, creates a channel, declares
  the task queue as durable, and returns both the connection and channel.
- `publish_execution_task(job_id, code, language, timeout)` first stores a
  `pending` job status in Redis with a one-hour expiry. It then publishes the
  task as a persistent RabbitMQ message and closes the broker connection.

#### `_run_worker()`

Runs as the background queue consumer.

1. It creates a Redis client and tries to connect to RabbitMQ, retrying a
   limited number of times with a delay between attempts.
2. If it cannot connect, it logs the failure and returns.
3. It defines an inner `callback(...)` for each message:
   - It parses the message and reads the job ID, code, language, and timeout.
   - It creates an asyncio event loop in the worker thread and calls
     `executor.execute_code()`.
   - It stores a completed result in Redis for one hour and acknowledges the
     queue message.
   - If processing fails, it tries to store an error result and rejects the
     message without re-queueing it.
4. It sets prefetch to one message at a time and starts consuming.
5. If consumption raises, it logs the connection failure and attempts to
   close the connection.

#### `start_queue_worker()`

Creates a daemon thread that runs `_run_worker()`. It returns after starting
the thread; it does not wait for the worker to finish. `main.py` calls this
function during application startup.

### `app/s3_service.py` — optional S3 code snapshots

- The imports provide environment-variable access, JSON conversion, logging,
  typing, timestamps, the AWS SDK, and AWS error types.
- `S3CodeSnapshotService.__init__()` reads the bucket name and AWS region,
  initializes the client field, and calls `_initialize_client()`.
- `_initialize_client()` creates an S3 client using explicit AWS keys when
  configured, or the default AWS credential chain otherwise. It checks that
  the configured bucket is reachable. On missing credentials or a reported
  client/bucket error it logs the problem and disables the S3 client.
- `is_available()` returns whether an S3 client is currently configured.
- `upload_code_snapshot(session_id, language, code, execution_result)` builds
  a JSON record with the session, language, code, result, timestamp, and
  version. It uploads that record to S3 with server-side encryption and
  returns the object key. If S3 is unavailable or the upload fails, it returns
  `None`.
- `download_code_snapshot(s3_key)` fetches an S3 object, reads and parses its
  JSON, and returns the data. Missing objects and other failures are logged
  and return `None`.
- `list_session_snapshots(session_id)` lists S3 objects in that session's
  snapshot folder and returns key, modification time, and size, sorted newest
  first. If S3 is unavailable or listing fails, it returns an empty list.
- `s3_code_service = S3CodeSnapshotService()` creates the shared S3 helper
  when the module is loaded.

The API route's `persist_code_snapshot()` helper uploads through the File
Service and falls back to local disk. The executor also has a separate
optional direct S3 snapshot path, used when it is called with a session ID.

### `app/test_code_execution.py` — automated tests

- The initial imports and `sys.modules` assignments install mock versions of
  Docker, AWS, RabbitMQ, and Redis packages before service modules are loaded.
  This allows unit tests to run without connecting to those external systems.
- The `client` fixture patches the queue worker startup, creates a FastAPI
  `TestClient`, and yields it for endpoint tests.
- Health and root tests:
  - `test_health_check()` checks the health status and service name.
  - `test_root()` checks that the root endpoint returns HTTP 200.
- Language discovery:
  - `test_supported_languages()` checks that all six language identifiers
    appear in the languages endpoint.
- Safety checks:
  - `test_scan_safety_safe_code()` checks an ordinary code sample.
  - `test_scan_safety_os_system()` and `test_scan_safety_subprocess()` check
    that configured process-related patterns are reported.
  - `test_scan_safety_eval()` and `test_scan_safety_exec()` check dynamic
    evaluation patterns.
  - `test_scan_safety_socket()` and `test_scan_safety_pickle()` check
    configured Python imports.
  - `test_scan_safety_java_runtime()`, `test_scan_safety_cpp_system()`,
    `test_scan_safety_go_network()`, and `test_scan_safety_rust_command()`
    check language-specific pattern examples.
  - `test_scan_safety_file_write()` and
    `test_scan_safety_dunder_import()` check other configured patterns.
  - `test_scan_code_safety_python_ast()` tests the Python AST checks directly.
  - `test_scan_code_safety_safe_imports()` checks imports that are allowed by
    the current checks.
  - `test_scan_code_safety_syntax_error()` checks how scanner parsing behaves
    on invalid Python syntax.
- Similarity checks:
  - `test_plagiarism_identical()`, `test_plagiarism_different()`,
    `test_plagiarism_empty()`, and `test_plagiarism_similar()` exercise the
    endpoint with different pairs of code samples.
  - `test_jaccard_similarity()` checks the similarity helper directly.
- Execution endpoint checks:
  - `test_execute_blocked_code()` checks that a detected violation prevents
    execution.
  - `test_execute_safe_code_validation()` checks request validation for a
    normal execution request.
  - `test_execute_invalid_language()` checks rejection of a language outside
    the enum.
  - `test_run_tests_empty_tests()` checks rejection of a test request with no
    test cases.

These tests focus on validation, route behavior, and the safety scanner. The
external services are mocked; the tests do not prove that a real Docker
daemon, RabbitMQ broker, Redis server, or S3 bucket is available.

### `requirements.txt` — Python dependencies

This file lists fixed or bounded package versions for the service:

- FastAPI and Uvicorn provide the HTTP application and server.
- Pydantic and `pydantic-settings` provide schema validation and settings
  helpers; `email-validator` is an optional validation dependency.
- `urllib3` and `requests` are pinned/bounded for HTTP and Docker SDK
  compatibility.
- `docker` provides the Docker Python SDK.
- `python-dotenv` can load environment variables from a dotenv file.
- `pika` and `redis` connect to RabbitMQ and Redis.
- `boto3` connects to AWS S3.
- `httpx` makes the asynchronous upload request to the File Service.

### `Dockerfile` — build the service image

- `FROM python:3.11-slim` selects the base Python image.
- `WORKDIR /app` sets the working directory in the image.
- The first `RUN` block installs system tools and the Docker CLI, adding the
  Docker package repository and cleaning downloaded package lists afterward.
- `COPY requirements.txt .` copies the Python dependency list.
- The next `RUN` installs the selected `urllib3` and `requests` versions,
  then installs the service requirements.
- `COPY . .` copies the service files into the image.
- `EXPOSE 8005` documents the port the application listens on.
- `CMD [...]` starts Uvicorn and serves `app.main:app` on port 8005.

The Docker CLI being present in this image does not by itself guarantee the
service can reach a Docker daemon. A daemon connection must also be available
at runtime for execution to work.

### `uploads/` — local snapshot fallback

This service-level directory is where `persist_code_snapshot()` creates
`uploads/code-snapshots` if the File Service upload does not work. It stores
code snapshot files on the service's local filesystem; those files are not
automatically shared with other service instances.

### `README.md` — human-readable service overview

The README describes the intended architecture, request flow, supported
languages, and test command. It is documentation, not executable code. Its
claims about limits, images, network/filesystem isolation, and worker
behavior should be compared with the implementation. Differences worth
knowing are listed below.

## API endpoint summary

All execution routes use the `/api/v1/execute` prefix.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Returns a simple health status. |
| `GET` | `/` | Returns a service welcome message. |
| `POST` | `/api/v1/execute` | Checks and synchronously runs code. |
| `POST` | `/api/v1/execute/run-tests` | Runs code against one or more test cases. |
| `POST` | `/api/v1/execute/submit-async` | Checks and queues code for background execution. |
| `GET` | `/api/v1/execute/status/{job_id}` | Reads the stored state/result for a queued job. |
| `POST` | `/api/v1/execute/check-plagiarism` | Calculates token-set similarity for two code strings. |
| `POST` | `/api/v1/execute/scan-safety` | Runs the source scanner without executing code. |
| `GET` | `/api/v1/execute/languages` | Lists supported language identifiers and display information. |

## Differences between comments and implementation

- The README says Docker limits include 128 MB memory and 0.5 CPU. The CLI
  executor configures 512 MB memory; the Docker SDK executor configures
  256 MB. Both configure a half CPU. Limits therefore depend on which
  execution path is used.
- The README describes a non-root container user. The shown executor
  configuration does not set a user explicitly.
- README and model comments list language image versions that do not all
  match the executor's actual image map. The executor map is what selects the
  runtime images.
- `ExecutionResponse` names its memory field `memory_used`, while the
  executor returns `memory_used_mb`. The route reads `memory_used`; therefore
  the response model may not receive a measured value from that dictionary.
- The synchronous route stores snapshots through the File Service with a
  local-disk fallback. The executor has a separate direct S3 snapshot feature
  that is only used when a session ID is passed.
- The queue manager stores worker failures with status `error`, but the status
  route returns every non-`pending` status as `completed`.
- The scanner checks only its configured source patterns and Python AST
  cases. It should not be described as a guarantee that arbitrary submitted
  code is safe.

## Run the tests

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "E:\AI INTERVIEW\services\code-execution-service"
python -m pytest services\code-execution-service\app\test_code_execution.py -v
```

The suite mocks external infrastructure, so it does not require a live
Docker daemon, RabbitMQ, Redis, or S3 connection.
