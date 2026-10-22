# Analytics Service Code Guide (Easy English)

This guide explains the code in `services/analytics-service` in plain English.
It describes what each file, class, and function is for and how the important
parts work. It also explains the service's Docker and dependency files.

This is a reading guide, not a copy of every source line with a note after it.
Blank lines are spacing; comments and docstrings are notes for developers; Python
statements are the instructions the computer runs. Source line references may
move when the code changes.

## What the Analytics Service does

The Analytics Service records events and reports statistics about users,
interview sessions, scores, languages, retention, and activity. It provides a
FastAPI web API, stores data in PostgreSQL when available, and can keep event
records in memory if the database connection is unavailable.

Typical flow:

1. A client sends an event or asks for a metric through an API route.
2. FastAPI validates the request data and calls the route function.
3. The route calls the database helper.
4. The database helper runs a query or uses its available fallback.
5. The route returns JSON or a downloadable CSV response.

## File map

| File | Purpose |
|---|---|
| `app/main.py` | Creates and configures the FastAPI application and its lifecycle. |
| `app/routes.py` | Defines the analytics API endpoints. |
| `app/database.py` | Connects to PostgreSQL, records events, and calculates metrics. |
| `app/models.py` | Describes and validates event and metrics data. |
| `app/middleware.py` | Adds request IDs and logs request timing. |
| `app/test_analytics.py` | Tests the API using mocked database behavior. |
| `app/__init__.py` | Describes the package; makes the directory importable as a package. |
| `Dockerfile` | Describes how Docker builds and runs this service. |
| `requirements.txt` | Lists Python packages needed by the service. |
| `README.md` | Gives a higher-level overview and example API flows. |

## 1. `app/main.py` — application startup and setup

### Imports and app creation

- The module docstring describes the Analytics Service and its intended role.
- `os` reads configuration values from environment variables.
- FastAPI imports create the web application and configure browser access.
- The `router` and `close_analytics_http_client` function come from `routes.py`.
- `db` is the shared analytics database manager.
- `RequestIDMiddleware` adds a trace ID to requests.
- `app = FastAPI(...)` creates the application and sets its name, description,
  version, and startup/shutdown lifecycle handler.

### CORS configuration

- `CORSMiddleware` controls browser cross-origin requests.
- The allowed frontend address comes from `FRONTEND_URL`, with a local frontend
  address as the development default.
- The configured credential, method, and header options tell the browser which
  requests are allowed.
- CORS is a browser policy; it does not authenticate a user or replace API
  permission checks.

### Middleware and routes

- `app.add_middleware(RequestIDMiddleware)` makes request tracing run around
  incoming API requests.
- `app.include_router(router)` attaches the analytics endpoints defined in
  `routes.py` to the main application.

### `startup_event()`

- FastAPI calls this asynchronous function when the server starts.
- It calls `db.connect()` to create the PostgreSQL connection pool if the
  database is available.
- `await` waits for the connection attempt without blocking all other async work.

### `shutdown_event()`

- FastAPI calls this asynchronous function when the server stops.
- It closes the shared analytics HTTP client, if one was created.
- It then disconnects the database pool.
- This cleanup releases network resources before the process exits.

### `health_check()`

- Handles `GET /health`.
- Returns the service's healthy status, its name, and the database manager's
  `use_db` flag.
- The flag indicates the manager's current connection mode; the handler does not
  run a new SQL query to prove the database is responding.

### `read_root()`

- Handles `GET /`.
- Returns a simple welcome message confirming that the API is running.

## 2. `app/routes.py` — HTTP endpoints

### Imports and shared settings

- The module docstring lists the API's intended analytics features.
- CSV and in-memory text helpers build downloadable CSV responses.
- FastAPI helpers define routes, validate query parameters, and access request
  details.
- `StreamingResponse` packages CSV output as a downloadable HTTP response. In the
  current implementation the complete CSV is assembled in memory before the
  response is returned.
- `httpx` is used for optional calls to the Auth Service.
- The model imports validate event requests and shape the metrics response.
- The `db` singleton provides database operations.
- `router = APIRouter(...)` groups routes under `/api/v1/analytics`.
- The bearer security helper is configured not to automatically reject a missing
  credential. This allows the optional-auth helper to receive no credential.
- `AUTH_SERVICE_URL` reads the auth-service base URL from the environment, with a
  localhost development default.
- `_analytics_http_client` is a shared reusable HTTP client, initially empty.

### `health()`

- Returns a short healthy status, the analytics service name, and the database
  connection-mode flag.
- It does not perform a fresh database query.

### `get_analytics_http_client()`

- Creates an asynchronous `httpx` client if one does not exist or has been closed.
- Applies request timeouts and connection-pool limits.
- Returns the reusable client for calls to the Auth Service.

### `close_analytics_http_client()`

- Closes the client if it exists and is still open.
- Resets the shared reference to `None`, so the next call can create a fresh client.

### `get_optional_user(credentials=...)`

- Receives an optional bearer credential from FastAPI.
- If credentials are missing, returns `None`.
- Otherwise asks the Auth Service's current-user endpoint to validate the token.
- Returns the decoded user profile on HTTP 200.
- Other statuses and request errors return `None`.
- This helper is defined, but current route handlers do not use it as a
  dependency. Therefore it does not currently enforce authentication on these
  routes.

### `track_event(event, request)` — `POST /event`

- Receives one validated `AnalyticsEvent` and the HTTP request.
- Reads the source IP from the request when possible.
- Uses the event's own IP if it was provided; otherwise uses the request IP.
- Passes the event type, user/session IDs, properties, and IP to
  `db.save_event()`.
- Returns a confirmation that includes the event type.

### `track_events_batch(events, request)` — `POST /events/batch`

- Receives a list of validated events.
- Reads the request IP as a default for events that do not specify one.
- Loops over the events and saves each event one at a time.
- Returns how many events were processed.
- Despite the route being called “batch,” the current code does sequential saves,
  not one bulk database insert.

### `get_metrics()` — `GET /metrics`

- Asks the database layer for platform-wide metrics.
- Also gets daily session counts, language distribution, and score distribution.
- Combines those results into a `MetricsResponse` model.
- The model checks that the response has the expected fields and types.

### `get_daily_metrics(days=30)` — `GET /metrics/daily`

- Accepts a number of days, defaulting to 30.
- FastAPI restricts it to 1–90.
- Passes the value to `db.get_daily_sessions()` and returns the daily counts.

### `get_languages()` — `GET /metrics/languages`

- Gets and returns the language-use counts from the database layer.

### `get_scores()` — `GET /metrics/scores`

- Gets and returns the score-distribution buckets from the database layer.

### `get_user_dashboard(user_id, days=90)`

- Accepts a user ID and number of days to include, restricted to 7–365.
- Calls `db.get_user_stats()` for that period.
- Adds the requested user ID and period to the returned dashboard data.

### `get_user_sessions_analytics(user_id, limit=50, offset=0)`

- Accepts a user ID and pagination values.
- Limits page size to 1–200 and requires a non-negative offset.
- Gets a page of sessions and returns it with `total=len(sessions)`.
- That total is the number of rows in this returned page, not a separate count of
  every matching session in the database.

### `get_user_score_trend(user_id, days=30)`

- Accepts a user ID and a period restricted to 7–365 days.
- Gets the user's daily score trend from the database layer.
- Returns the trend together with the user ID and period.

### `get_conversion_funnel()`

- Returns the database layer's funnel counts and percentages.
- The underlying database stages include sessions created/started/completed and
  feedback generated.

### `get_retention()`

- Returns the database layer's retention statistics.
- The returned periods are D1, D7, and D30 (one, seven, and thirty days), not only
  a weekly figure.

### `export_sessions_csv(days=30, interview_type=None)`

- Accepts a date range and optional interview type.
- Limits the date range to 1–365 days.
- Fetches session rows from the database layer.
- Uses an in-memory text buffer and CSV writer to create a header and row for each
  selected session.
- Returns the CSV with a download filename in the response headers.
- Although described as a stream, the current route builds the whole CSV before
  returning it.

### `export_events_csv(days=7, event_type=None)`

- Accepts a date range and optional event type.
- Limits the date range to 1–90 days.
- Gets recent event rows, writes selected fields to an in-memory CSV, and returns
  it as a download.
- Like the session export, it creates the full CSV before returning the response.

### `get_realtime_stats()`

- Gets and returns the database layer's current event-per-minute and active-session
  estimates.
- If database metrics are unavailable, the database layer returns zero values.

## 3. `app/database.py` — storage and analytics queries

### Imports and helper

- `os` reads database configuration.
- `asyncpg` connects to PostgreSQL asynchronously.
- `json` converts event properties between Python dictionaries and JSON text.
- `uuid` validates and converts record IDs.
- Typing helpers document lists and optional values.
- Date/time helpers support time filters, UTC timestamps, and reporting windows.

### `is_valid_uuid(val)`

- Returns `False` when the input is empty.
- Tries to parse the value as a UUID.
- Returns `True` if parsing works and `False` for invalid values.
- This avoids sending malformed IDs to PostgreSQL.

### `AnalyticsDatabase` class

This class stores the pool state and groups event storage and reporting queries.

#### `__init__()`

- Starts with no PostgreSQL pool.
- Sets `use_db` to false until connection succeeds.
- Creates an empty `local_events` list for event fallback when PostgreSQL is not
  being used.
- This fallback list is in process memory; it is not durable storage.

#### `connect()`

- Reads database host, port, name, user, password, pool bounds, and query timeout
  from environment variables.
- Calls `asyncpg.create_pool()` to make a reusable PostgreSQL connection pool.
- On success, saves the pool and sets `use_db=True`.
- On error, logs the failure and leaves the service in local-event mode.

#### `disconnect()`

- Closes the PostgreSQL pool if one exists.
- The function does not clear the pool reference or reset `use_db`.

#### `save_event(event_type, user_id, session_id, properties, ip_address)`

- Creates a UTC timestamp for the event.
- Encodes the properties dictionary as JSON text, using an empty dictionary when
  properties are missing.
- If database mode is active, inserts the event into `analytics_events`.
- Optional user and session IDs are handled as nullable values.
- If the database insert succeeds, the method returns.
- If the database is unavailable or the insert fails, it appends the event and its
  details to `local_events`.

#### `get_metrics()`

- In database mode, runs queries to count users and sessions, count completed and
  active sessions, count today's sessions, calculate an average positive score,
  and count sessions by interview type.
- Converts database results into simple numeric values, using zero when counts or
  averages are absent.
- If the database is not available or a query fails, it estimates totals using
  unique user/session IDs in `local_events`.
- In that local fallback, completed and started values count event records, and
  active sessions are estimated as started minus completed, never below zero.
- The fallback cannot calculate today's sessions, scores, or interview-type
  counts, so those values are zero.

#### `get_daily_sessions(days=30)`

- Queries sessions created within the requested number of days.
- Groups them by calendar date, orders dates oldest to newest, and returns date
  and count records.
- If PostgreSQL is unavailable or the query fails, returns an empty list.
- Dates with no sessions are not inserted as zero-count dates.

#### `get_language_distribution()`

- Counts code submissions grouped by language, ignoring missing or blank language
  names.
- Converts language names to lowercase and orders the most frequent first.
- Returns an empty list if no database result is available.

#### `get_score_distribution()`

- Counts feedback scores in five ranges: 0–20, 21–40, 41–60, 61–80, and 81–100.
- The SQL excludes scores of zero and below, so a score of exactly zero is not
  counted in the bucket labelled `0-20`.
- If unavailable or on error, returns the five ranges with zero counts.

#### `get_user_stats(user_id, days=90)`

- Prepares a response filled with zero counts and empty breakdowns.
- If the supplied ID is not a valid UUID, returns that zero response immediately.
- In database mode, queries the user's sessions during the requested date window
  and joins available feedback.
- Calculates total/completed sessions, positive-score averages, session-type
  counts, and score-related data.
- If there are no sessions in the time window, returns the zero response.
- It next groups scored feedback by interview type and orders types by average
  score. The first entry becomes the best type. The worst is only set when at
  least two types are present.
- Another query gets up to 60 distinct UTC dates with completed sessions.
- A loop counts the current consecutive-day streak, accepting today or yesterday
  as the most recent practice date.
- It rounds averages and completion rate and returns the category breakdown.
- If a query fails or there is no database, returns the zero response; it does not
  calculate user-level statistics from `local_events`.
- The code's query uses completed sessions for the streak, despite broader
  wording about active practice.

#### `get_user_sessions(user_id, limit=50, offset=0)`

- Returns an empty list if the user ID is not a valid UUID.
- Otherwise selects that user's sessions and associated feedback, newest first.
- Applies SQL limit and offset for pagination.
- Converts session IDs and dates to strings suitable for JSON.
- If PostgreSQL is unavailable or the query fails, returns an empty list.

#### `get_user_score_trend(user_id, days=30)`

- Returns an empty list for an invalid UUID.
- Joins feedback to sessions and filters by the user, positive scores, and the
  selected time period.
- Groups score results by date and returns ascending date/score points.
- Returns an empty list when no database result is available.

#### `get_funnel_metrics()`

- Counts all sessions as the created stage.
- Counts sessions in selected statuses (`in_progress`, `completed`, or `paused`)
  as started.
- Counts completed sessions separately.
- Counts feedback reports that have a non-null overall score as generated feedback.
- Calculates each stage's percentage while avoiding division by zero.
- On database errors or no database, returns all stages with zero counts and rates.
- The output represents generated feedback, not whether a candidate viewed it.

#### `get_retention_metrics()`

- Uses a SQL common table expression (CTE) to find each user's first session.
- For D1, D7, and D30 it determines which users have had enough time to be eligible
  and which have another session at or after the milestone.
- Calculates retention percentages with zero-denominator protection.
- The SQL returns all three retention rates, but the extra eligible/retained count
  fields are only provided for D1.
- This measures return on or after the milestone threshold, not necessarily on
  exactly that calendar day.
- If no database or a query failure occurs, returns zero rates and marks the data
  source as none.

#### `get_raw_sessions_for_export(days=30, interview_type=None)`

- Fetches recent session fields and a feedback score, substituting zero when no
  score exists.
- Adds an interview-type filter if one was supplied.
- Orders newest first and limits the result to 10,000 rows.
- Returns an empty list if the database is not available or the query fails.

#### `get_raw_events_for_export(days=7, event_type=None)`

- Fetches recent analytics event fields.
- Adds an event-type filter when requested.
- Orders newest first and caps the result at 10,000.
- Returns an empty list if the database is not available or the query fails.

#### `get_realtime_stats()`

- Counts analytics events from the last minute.
- Counts sessions with active/in-progress status as an estimate.
- Returns these as events per minute and estimated active sessions.
- Returns zeros if it cannot query PostgreSQL.

### Shared database object

- `db = AnalyticsDatabase()` creates one database manager when the module loads.
- Routes import and share that object.

## 4. `app/models.py` — validated data structures

- Pydantic's `BaseModel` defines request and response schemas.
- `Field` adds required/default values and documentation.
- `Enum` defines a fixed list of event types.
- Typing helpers describe optional values and lists.

### `EventType`

- Lists the accepted analytics event names, such as session creation, login,
  code execution, and page views.
- Using an enum helps reject misspelled or unsupported event types.

### `AnalyticsEvent`

- Defines a telemetry event received through the API.
- The event type is required.
- User ID, session ID, properties, and IP address are optional or given defaults.
- FastAPI/Pydantic validates the incoming JSON against this shape.

### `DailySessionMetric`

- Describes one day's session count, including the date and number of sessions.

### `LanguageDistributionMetric`

- Describes a programming language and the number of submissions using it.

### `ScoreDistributionMetric`

- Describes one score range/bucket and the number of results in that range.

### `MetricsResponse`

- Describes the combined platform metrics response.
- Contains the totals and grouped counts, as well as lists of daily metrics,
  language distribution, and score distribution.
- FastAPI uses it to check that the returned dashboard data has the expected
  shape and types.

## 5. `app/middleware.py` — tracing requests

### Imports and logger

- `uuid` makes a unique request ID when a request does not already have one.
- `logging` writes request details.
- `time` measures elapsed time.
- FastAPI/Starlette request, response, and middleware types describe the HTTP
  objects this code receives and returns.
- A named logger is used for request logs.

### `RequestIDMiddleware`

- A middleware class that runs around each API request.

#### `dispatch(request, call_next)`

- Reads `X-Request-ID` from the incoming request or generates a UUID.
- Stores the ID on `request.state` so code handling the request can inspect it.
- Records a start time and calls the next handler.
- When the endpoint returns, adds the request ID to the response headers.
- Calculates the total time spent in the downstream request handling and logs
  request ID, method, path, response status, and duration.
- Returns the response to the caller.
- The duration measures the whole downstream request, not only SQL query time.

## 6. `app/test_analytics.py` — automated tests

The tests use a FastAPI `TestClient` and a fake database so they can check API
responses without connecting to a real PostgreSQL server.

### Imports and test data

- `pytest` provides test fixtures and test-running support.
- Mocking helpers replace database methods with predictable responses.
- The test data contains example event and metrics values for assertions.

### `client` fixture

- Creates a mock database and gives its async methods predictable results.
- Temporarily patches the app's database references to use the mock.
- Creates a test client for the FastAPI application and yields it to each test.
- This keeps tests repeatable and avoids using production or local database data.

### Test groups

#### Health and root tests

- Check that the health and root endpoints return successful responses and
  expected service fields.

#### Event tracking tests

- Check that a valid event can be recorded.
- Check that an event with minimal valid fields is accepted.
- Check that an invalid or missing event type is rejected by validation.
- Check that a batch of events is accepted and reports the processed count.

#### Platform metrics tests

- Check the combined metrics response.
- Check the daily-session endpoint and validation of its `days` range.
- Check language distribution and score distribution responses.

#### User dashboard tests

- Check user dashboard metrics and time-range validation.
- Check a user's paginated session results.
- Check the user's score-trend response.

#### Advanced metrics tests

- Check conversion funnel, retention, and real-time metrics endpoints.
- Some tests in this group check only that the response status is 200; that does
  not prove the detailed calculations or database queries are correct.

### Limits of the tests

- The fixture mocks database operations, so the tests do not verify the SQL against
  a live PostgreSQL schema.
- The inspected tests do not cover the CSV export endpoints, despite the README's
  broad testing claim.

## 7. `app/__init__.py`

- The triple-quoted text is a package docstring describing the analytics package.
- It mentions platform analytics responsibilities such as telemetry, score
  tracking, percentiles, and exports.
- It does not declare a class or function or perform database work.
- Having `__init__.py` marks the folder as a Python package so its modules can be
  imported.

## 8. `Dockerfile` — container setup

Each non-empty Docker instruction tells the image builder or container what to do:

1. `FROM python:3.11-slim` starts from a small Linux image with Python 3.11.
2. `WORKDIR /app` sets the working folder inside the container.
3. `COPY requirements.txt .` copies the package list into that folder.
4. `RUN pip install ...` installs the Python dependencies without keeping pip's
   package-download cache in the image.
5. `COPY . .` copies the service source into the image.
6. `EXPOSE 8009` documents the port used by the service.
7. `CMD [...]` starts Uvicorn and serves `app.main:app` on all container interfaces
   at port 8009.

## 9. `requirements.txt` — Python dependencies

Each entry names a library the service needs. The version pins make installs more
repeatable.

- `fastapi` provides API routes and request/response handling.
- `uvicorn[standard]` runs the FastAPI application.
- `pydantic[email]` validates structured data and includes email-related support.
- `pydantic-settings` supports typed configuration from settings/environment.
- `email-validator` validates email addresses.
- `sqlalchemy` is a database toolkit available to the service.
- `asyncpg` provides asynchronous PostgreSQL connections.
- `redis` provides a Redis client library.
- `python-dotenv` can load settings from a `.env` file.
- `httpx` makes asynchronous HTTP calls such as optional Auth Service requests.

The test file uses `pytest`; it is used in the documented test command but is not
listed in this service's `requirements.txt`, so the test runner must be available
in the environment separately.

## 10. `README.md` — service overview

The README explains the service's intended responsibilities, request flow, API
examples, architecture, and test command. It is a high-level guide. Prefer the
actual code behavior described above where README text differs from implementation.

Some differences visible in this repository:

- The README diagram says the batch endpoint returns HTTP 201, while the test
  expects HTTP 200.
- The README says the tests cover exports, but the inspected test file has no CSV
  export tests.
- README descriptions mention metrics such as active rooms and DAU/MAU ratios;
  the inspected route/database implementation does not calculate those metrics.
- The CSV export handlers build their output in memory before returning it, rather
  than sending database rows incrementally.
- The optional auth helper exists, but current analytics routes do not declare it
  as a dependency.

## Useful technical words

| Word | Easy meaning |
|---|---|
| API endpoint | A URL and HTTP method that performs one operation. |
| Async / `await` | Waits for network/database work without stopping all other requests. |
| Connection pool | Reusable database connections kept ready for queries. |
| CTE | A named temporary result inside a SQL query, written with `WITH`. |
| Fallback | A backup behavior used when the normal database path is unavailable. |
| FastAPI | The Python framework that receives HTTP requests and returns responses. |
| JSON | A text format for sending structured data. |
| Middleware | Code that wraps a request before and after its route handler. |
| PostgreSQL | The relational database used for persistent analytics records. |
| Pydantic | A library that checks data fields and types. |
| Query parameter | A value included in a URL after `?`, such as `?days=30`. |
| UUID | A unique identifier commonly used for database records. |
