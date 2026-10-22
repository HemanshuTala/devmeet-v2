# Feedback Service: Easy-English Code Guide

This guide explains the Feedback Service files and their functions in plain
English. It describes what the source code currently does, and points out
where some comments or README statements describe behavior that is not
implemented in the same way.

## What this service does

The Feedback Service takes an interview transcript and produces a score
report. It uses Groq when configured and otherwise uses a simple local
rule-based evaluator. It can save the report in PostgreSQL, create a PDF, and
store that PDF in S3, the File Service, or local disk.

Typical request flow:

1. The Orchestrator sends the completed session details and transcript to
   `POST /api/v1/feedback/generate`.
2. The service evaluates the transcript with Groq or its local fallback.
3. It calculates a percentile using fixed score buckets.
4. It tries to render and store a PDF.
5. It saves or updates the report and returns the scorecard.
6. A client can later retrieve the report or request its PDF.

## Files in this service

### `app/main.py` — create and run the web application

- The opening text describes the intended application responsibilities.
- `os` reads environment variables, and `Path` handles local filesystem paths.
- `uvicorn` runs the application when this module is started directly.
- FastAPI and its middleware imports create the web service and configure
  browser access.
- The local imports provide the routes, database object, and request-ID
  middleware.
- `app = FastAPI(...)` creates the API and sets its title, description, and
  version.
- `app.add_middleware(CORSMiddleware, ...)` allows browser requests from the
  origin in `FRONTEND_URL`. If that variable is missing, the default is
  `http://localhost:3000`. This configuration also allows credentials,
  methods, and headers.
- `app.add_middleware(RequestIDMiddleware)` adds request IDs and request
  timing logs.
- `startup_event()` runs when FastAPI starts and calls `db.connect()` to
  connect to PostgreSQL or select the database helper's memory fallback.
- `shutdown_event()` runs when FastAPI stops and calls `db.disconnect()` to
  close database connections.
- The `uploads_dir` setup creates a local `uploads` folder if needed.
- `app.mount("/uploads", ...)` serves files from that folder at URLs beginning
  with `/uploads`.
- `app.include_router(router)` registers the feedback routes.
- `health_check()` handles `GET /health` and reports service health plus
  whether the database helper considers PostgreSQL connected.
- `root()` handles `GET /` and returns a service-identification message.
- The `if __name__ == "__main__"` block starts Uvicorn on port `8007` with
  automatic reload for local development.

### `app/middleware.py` — track requests

- `uuid`, `logging`, and `time` support request IDs, logs, and timing.
- The FastAPI and Starlette imports provide the HTTP request/response and
  middleware types.
- `logger` creates a named logger for request tracking.
- `RequestIDMiddleware` wraps requests as they pass through the app.
- `dispatch(request, call_next)` does the following:
  1. Reads the incoming `X-Request-ID` header or generates a UUID when none
     was provided.
  2. Saves the ID to `request.state.request_id`.
  3. Records a start time using `time.time()`.
  4. Calls the next middleware or endpoint and waits for the response.
  5. Adds `X-Request-ID` to the response headers.
  6. Calculates elapsed milliseconds and logs the ID, HTTP method, path,
     response status, and duration.
  7. Returns the response.

### `app/models.py` — define and validate API data

These Pydantic models define the information accepted and returned by the
service. FastAPI uses them to validate JSON and format responses.

- `PercentileInfo` describes a percentile number from 0 to 100 and its
  display message.
- `Turn` represents one transcript line. It has a speaker `role` and text
  `content`. The model requires both as strings.
- `ScoreBreakdown` contains required communication and problem-solving scores
  and optional code-quality, time-complexity, and behavioral scores. Scores
  must be between 0 and 100.
- `FeedbackGenerateRequest` describes the generation request:
  - `session_id`, `interview_type`, and `difficulty` are required strings.
  - `language` defaults to `python`.
  - `target_company` can be omitted.
  - `transcript` is a list of `Turn` records.
- `FeedbackReportResponse` describes a report response:
  - It includes the session ID, overall score, detailed score breakdown, and
    detailed feedback dictionary.
  - It can also include a PDF URL and percentile information.
  - The overall score must be from 0 to 100.

### `app/routes.py` — expose the HTTP API

#### Setup

- The imports provide FastAPI routing/errors, streamed responses, type hints,
  filesystem paths, environment access, byte streams, and logging.
- `FeedbackGenerateRequest`, `FeedbackReportResponse`, `ScoreBreakdown`, and
  `PercentileInfo` define request/response formats.
- `feedback_generator` performs evaluation, PDF rendering, and upload work.
- `db` saves and retrieves reports.
- `logger` records service errors and optional PDF failures.
- `router = APIRouter(...)` places the API endpoints under
  `/api/v1/feedback`.

#### `generate_feedback(request)` — `POST /api/v1/feedback/generate`

1. Calls `feedback_generator.generate_feedback()` with the validated request
   data.
2. Tries to build session metadata, render a PDF, and upload it. PDF errors
   are logged as optional-export failures and do not by themselves stop report
   generation.
3. Copies the evaluation's detailed feedback. If there is percentile data, it
   adds that data to the copy for database storage.
4. Calls `db.save_report()` to insert or update the report.
5. Converts raw score values into a `ScoreBreakdown` model.
6. Returns a `FeedbackReportResponse` containing the score, feedback, PDF
   URL, and validated percentile.
7. If another error occurs in the outer generation/persistence flow, it
   raises HTTP 500 with a failure message.

The route does not currently send an email or schedule a notification.

#### `feedback_health()` — `GET /api/v1/feedback/health`

Returns service health and the database helper's `use_db` flag. This is a
router-level health endpoint; the application also has `GET /health`.

#### `get_feedback(session_id)` — `GET /api/v1/feedback/{session_id}`

1. Asks the database helper for a report with that session ID.
2. If none is found, raises HTTP 404.
3. Converts the stored score fields to `ScoreBreakdown`.
4. Reads percentile data from the detailed feedback when present.
5. Returns a `FeedbackReportResponse`.

#### `_parse_percentile(raw)`

Converts a dictionary into a validated `PercentileInfo`.

- If the input is missing, not a dictionary, or has no `percentile` key, it
  returns `None`.
- Otherwise it converts the percentile to an integer, chooses the supplied
  message or a default message, and creates a `PercentileInfo`.

#### `download_feedback_pdf(session_id)` — `GET /api/v1/feedback/{session_id}/pdf`

1. Reads the stored report for the session; if missing, raises HTTP 404.
2. Builds session metadata and evaluation data from the report.
3. Looks for a previously generated local file named
   `uploads/report_{session_id}.pdf`.
4. If found, reads and returns those bytes. If reading fails, it logs the
   failure and attempts to render the PDF again.
5. If no local file exists, it renders a PDF and tries to save a local copy.
6. Returns a `StreamingResponse` with PDF content and a download filename.

This endpoint streams a locally cached or newly rendered PDF. It does not
redirect to the report's S3 or File Service URL.

### `app/database.py` — save and retrieve reports

- The imports provide environment access, async PostgreSQL access, JSON
  encoding/decoding, and type hints.
- `FeedbackDatabase.__init__()` initializes the connection pool as empty,
  marks PostgreSQL as unavailable, and creates an empty in-memory report
  dictionary.
- `connect()` creates an asyncpg PostgreSQL pool from environment variables.
  If it succeeds, `use_db` becomes `True`. If it fails, the error is printed
  and the service uses its in-memory report fallback.
- `disconnect()` closes the pool if it exists.
- `save_report(session_id, overall_score, scores, detailed_feedback,
  pdf_url)`:
  1. Converts the session ID to a UUID and extracts each score field.
  2. Converts detailed feedback to JSON.
  3. If PostgreSQL is active, inserts the report into
     `feedback_reports`. If the session ID already exists, updates that
     report instead of inserting another row.
  4. If the database is unavailable or the write fails, stores the report in
     `local_reports`.
  5. Returns `True` after either save path.
- `get_report_by_session(session_id)` first tries PostgreSQL when enabled.
  It builds a dictionary containing the scores, detailed feedback, PDF URL,
  and session ID. If the DB lookup fails or has no row, it checks the local
  memory dictionary and returns the report or `None`.
- `get_user_details_by_session(session_id)` joins the session and user
  profile records to return the user ID, email, and display name. It returns
  `None` if no database result is available or an error occurs. This helper
  is defined but is not called by the current feedback routes.
- `db = FeedbackDatabase()` creates the shared database helper.

The in-memory fallback lasts only for the lifetime of this Python process. It
is useful in local development or tests, but it is not durable storage.

### `app/generator.py` — evaluate transcripts and create PDF files

#### Module settings and imports

- The imports provide environment access, JSON conversion, asynchronous HTTP
  uploads, typing, file paths, the Groq client, AWS S3, logging, timestamps,
  percentile calculation, and HTML templates.
- The `try` block imports WeasyPrint's `HTML` class. If the package cannot be
  imported, `HTML` is set to `None`, which disables PDF rendering.
- `GROQ_API_KEY` reads the optional Groq API key.
- `FILE_SERVICE_URL` reads the File Service upload endpoint, with a local
  default.

#### `FeedbackGenerator.__init__()`

Creates a Groq client only when an API key is configured, reads the S3
bucket/region settings, initializes an empty S3 client, and calls
`_initialize_s3_client()`.

#### `_initialize_s3_client()`

1. Tries explicit AWS access keys when both are present.
2. Otherwise asks boto3 to use its default credential chain.
3. Checks that the configured S3 bucket is accessible.
4. On missing credentials, bucket/client errors, or other exceptions, logs
   the problem and disables S3 by setting the client to `None`.

#### `_calculate_percentile(score, interview_type, difficulty)`

Calls `calculate_percentile()` from `percentiles.py` and returns its
dictionary. It is asynchronous in declaration, but the calculation itself is
a local synchronous lookup.

#### `generate_feedback(data)`

This is the main evaluation method.

1. Reads transcript, interview type, difficulty, language, and company from
   the input dictionary, using defaults when values are missing.
2. Finds candidate/user messages and counts their words and meaningful
   messages.
3. If there are no candidate messages, fewer than 15 words, or no candidate
   message with at least five words, immediately returns a zero-score report
   with feedback recommending a more complete interview.
4. If a Groq client exists, it tries `_generate_with_groq()`.
5. If the Groq result has no question-score list, it supplies an empty list,
   adds percentile data, and returns the result.
6. If Groq fails, it prints the error and continues with
   `_generate_local_fallback()`.
7. The fallback score is also given percentile data before it is returned.

#### `generate_pdf(feedback_data, session_info)`

1. Calls `render_html_report()` to build the report HTML.
2. If WeasyPrint could not be imported, logs that PDF export is unavailable
   and returns `None`.
3. Otherwise it asks WeasyPrint to convert the HTML to PDF bytes.
4. If PDF rendering fails, it logs a warning and returns `None`.

#### `_generate_question_scores_html(question_scores)`

Delegates to `generate_question_scores_html()` in `report_template.py` and
returns the generated HTML table.

#### `upload_pdf_report(pdf_bytes, session_id)`

Stores a PDF and returns a URL or path:

1. If there are no PDF bytes, returns `None`.
2. If S3 is configured, uploads an encrypted PDF and requests a presigned
   URL valid for seven days. On success, returns the URL.
3. If S3 is unavailable or upload fails, tries a multipart upload to the File
   Service and returns its URL when that service responds with HTTP 200.
4. If the File Service request fails, writes the PDF under `uploads/` and
   returns a relative `/uploads/...` path.

#### `_generate_with_groq(transcript, interview_type, difficulty, language,
company)`

1. Converts transcript entries into a readable `ROLE: message` text.
2. Selects a weighting rubric based on interview type, with DSA as the
   default.
3. Builds a prompt that tells the model how to evaluate answers and return a
   particular JSON structure.
4. Sends the prompt and transcript to Groq using the configured model (or a
   default model), low temperature, and JSON response mode.
5. Reads the returned message text, parses it as JSON, and returns the
   resulting dictionary.

The Groq call is written inside an `async def`, but the SDK call shown here is
synchronous.

#### `_generate_local_fallback(transcript, interview_type, difficulty,
language, company)`

Produces a rough report without an LLM:

1. Separates candidate messages from interviewer/AI messages.
2. Counts candidate words, average words per answer, and the ratio of answers
   to AI prompts.
3. Searches candidate text for terms about complexity, edge cases, code
   blocks, and trade-offs.
4. Starts communication and problem-solving scores at low baseline values,
   then adjusts them using answer length, coverage, keywords, and transcript
   size.
5. For DSA and system-design interviews, creates code-quality and
   time-complexity scores and adds topic-appropriate feedback.
6. For behavioral interviews, creates a behavioral score and checks for
   STAR-related terms.
7. Calculates an overall score as the simple average of the available
   dimension scores.
8. Pairs interviewer prompts with candidate messages in order to create
   question-level feedback. Extra unmatched turns are not included in these
   pairs.
9. Uses a second fixed score bucket table to estimate a percentile and maps
   the overall score to a hiring recommendation.
10. Returns overall score, dimension scores, detailed feedback,
    question-level scores, percentile estimate, and recommendation.

This fallback uses simple word counts and keyword presence. It is not an
understanding of the technical correctness of an answer.

#### Shared generator

`feedback_generator = FeedbackGenerator()` creates the shared evaluator when
the module is imported. It initializes configured Groq and S3 clients at that
time.

### `app/percentiles.py` — map scores to percentile messages

- `PERCENTILE_RANGES` is a fixed table of score ranges and percentile values
  for each interview type and difficulty level.
- `calculate_percentile(score, interview_type, difficulty)`:
  1. Selects the table for the requested interview type. Unknown types fall
     back to DSA.
  2. Selects the difficulty table. Unknown difficulties fall back to medium.
  3. Finds the score range containing the score. If none matches, it keeps a
     default of 50.
  4. Returns the percentile, a fixed peer-group size of 1,000, the input
     category names, and a descriptive message.

These are preset estimates, not calculations from live candidate records.

### `app/report_template.py` — build the HTML scorecard

- `datetime`, `timezone`, and typing imports support date text and type hints.
- `generate_question_scores_html(question_scores)`:
  - Returns an empty string if there are no question scores.
  - For each score, selects green, red, or amber text based on its value and
    builds a row with the turn number, question summary, score, and feedback.
  - Wraps the rows in a titled HTML table and returns that HTML string.
- `render_html_report(feedback_data, session_info)`:
  1. Reads dimension scores and qualitative feedback from the evaluation.
  2. Builds the main score cards for overall, communication, and
     problem-solving scores.
  3. Adds code quality, time complexity, and behavioral cards only when those
     scores are not `None`.
  4. Turns strengths, weaknesses, code improvements, and recommendations
     into HTML list items.
  5. Formats the current UTC date for the report.
  6. Builds a full HTML document containing CSS for A4 printing, page
     numbering, score cards, session metadata, feedback lists, and optional
     question-by-question scores.
  7. Returns the finished HTML string for WeasyPrint.

### `app/test_feedback.py` — automated checks

- The module first inserts mock versions of asyncpg, WeasyPrint, Groq, boto3,
  and botocore so importing the app does not require live external services.
- `MOCK_FEEDBACK_REPORT` is sample report data shared by tests.
- The `client()` fixture creates a mock database, sets up common return
  values, patches the database references used by the app, and yields a
  FastAPI `TestClient` and the mock.
- `TestHealthAndRoot`:
  - `test_health_check()` checks the health response and service name.
  - `test_root_endpoint()` checks the root message.
- `TestGetFeedback`:
  - `test_get_feedback_success()` checks a saved report response.
  - `test_get_feedback_not_found()` checks HTTP 404 when no report exists.
  - `test_get_feedback_has_detailed_feedback()` checks strengths and
    weaknesses are included.
  - `test_get_feedback_has_percentile()` checks percentile data.
- `TestGenerateFeedback`:
  - `test_generate_feedback_success()` mocks evaluation, PDF rendering, and
    PDF upload, then checks a successful generation response.
  - `test_generate_feedback_missing_fields()` checks required-field
    validation.
  - `test_generate_feedback_empty_transcript()` checks the endpoint does not
    fail with an unhandled error for an empty transcript; it allows several
    statuses.
  - `test_generate_feedback_invalid_json()` checks invalid JSON is rejected.
- `TestPDFDownload`:
  - `test_pdf_download_not_found()` checks HTTP 404 if there is no report.
  - `test_pdf_download_success()` checks the download endpoint's response for
    a mocked PDF. Its assertion allows several statuses, so it is not a strict
    check that the result is always HTTP 200.

The fixture mocks services, so a passing test suite does not verify live
PostgreSQL, Groq, S3, File Service, or WeasyPrint system-library integration.

### `requirements.txt` — Python libraries

- FastAPI and Uvicorn run the HTTP API.
- Pydantic, its settings package, and email-validator support validation and
  configuration.
- `httpx` makes asynchronous requests to the File Service.
- `groq` provides the LLM client.
- SQLAlchemy and asyncpg are listed for database-related support; the current
  `database.py` uses asyncpg directly.
- Redis and pika are listed as dependencies but are not imported by the
  Feedback Service source files covered here.
- `python-dotenv` can load environment variables from a dotenv file.
- WeasyPrint and pydyf generate PDF files.
- boto3 connects to AWS S3.

### `Dockerfile` — build and start the container

- `FROM python:3.11-slim` selects the base Python image.
- `WORKDIR /app` sets the container working directory.
- The `RUN apt-get ...` block installs native libraries needed by
  WeasyPrint, then removes package-list cache files.
- `COPY requirements.txt .` copies the Python package list.
- `RUN pip install ...` installs Python dependencies.
- `COPY . .` copies the service source into the image.
- `EXPOSE 8007` documents the port used by the service.
- `CMD [...]` starts Uvicorn with `app.main:app` on port 8007.

### `uploads/` — local PDF storage

The `uploads` folder is created/mounted by `main.py` and used by
`upload_pdf_report()` when S3 and File Service storage are unavailable. The
app also serves files in this directory under `/uploads`.

### `README.md` — service overview

The README explains the service flow, configuration, API endpoints, storage
fallbacks, and test command. It is documentation rather than executable code.
Some statements differ from the source; see the notes below.

## API endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Identifies the service. |
| `GET` | `/health` | Reports service and PostgreSQL connection state. |
| `GET` | `/api/v1/feedback/health` | Reports feedback-router health and PostgreSQL state. |
| `POST` | `/api/v1/feedback/generate` | Evaluates a transcript, optionally creates a PDF, saves a report, and returns it. |
| `GET` | `/api/v1/feedback/{session_id}` | Retrieves a saved report, or returns 404. |
| `GET` | `/api/v1/feedback/{session_id}/pdf` | Streams a local cached or regenerated PDF. |
| `GET` | `/uploads/{file}` | Serves files from the local uploads directory. |

## Important implementation notes

- The README says the generation endpoint schedules notifications. The
  current route code does not schedule an email or notification.
- The README says the report page may request generation if a report is
  missing. That behavior is outside this service's routes; this service's
  report retrieval route returns 404 when the report is missing.
- The feedback routes do not declare authentication dependencies. Do not
  assume a session ID alone provides access control.
- Percentile values are selected from fixed tables, not measured against live
  candidate history. `peer_group_size` is a constant.
- If PostgreSQL is unavailable, reports are kept in process memory and will
  not survive a process restart.
- PDF upload follows S3, then File Service, then local disk. A returned URL
  depends on which storage option works.
- `download_feedback_pdf()` reads or creates a local PDF, not the S3 object or
  the stored `pdf_url`.
- Groq evaluation can fall back to local heuristics. The fallback checks
  answer length, participation, and keywords; it does not judge code or
  answers with the same capability as a model.
- The README calls the health probe `/health`; the application has that route
  and the feedback router also adds `/api/v1/feedback/health`.

## Run the tests

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "E:\AI INTERVIEW\services\feedback-service"
python -m pytest services\feedback-service\app\test_feedback.py -v
```

The tests mock database and third-party integrations, so they do not
guarantee those services are configured or reachable.
