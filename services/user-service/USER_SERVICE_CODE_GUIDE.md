# User Service Code Guide (Easy English)

This guide explains the files and functions in `services/user-service` in plain
English. It describes what the code is for, what important statements mean, and
what they do when the service runs.

Related lines are explained together rather than copied one by one. Blank lines
are only spacing, and comments/docstrings are notes for people reading the code.
The executable statements are what Python runs. Line numbers in source files may
change as the code is edited.

## What the User Service does

The User Service stores and returns user profile information, plan and quota
details, avatar links, account-export data, account-anonymization requests, and
leaderboard results. It uses FastAPI for its HTTP API and PostgreSQL for
persistent data. Most personal routes ask the Auth Service to confirm the user's
bearer token first.

Typical request:

1. A client sends a request to a User Service route.
2. FastAPI validates its path, query, or JSON fields.
3. Protected routes send the caller's token to the Auth Service.
4. A route calls the database layer to read or change user data.
5. The route returns JSON, or an HTTP error if a required operation fails.

## File map

| File | Purpose |
|---|---|
| `app/main.py` | Creates the FastAPI app and manages database startup/shutdown. |
| `app/routes.py` | Defines profile, quota, plan, avatar, export, delete, and leaderboard endpoints. |
| `app/database.py` | Connects to PostgreSQL and performs profile, quota, plan, and leaderboard queries. |
| `app/models.py` | Defines allowed plan values and validates request/response data. |
| `app/middleware.py` | Adds request IDs and logs request duration. |
| `app/test_user.py` | Tests endpoints using a mocked database and test clients. |
| `Dockerfile` | Describes how to build and start the service container. |
| `requirements.txt` | Lists Python packages the service needs. |
| `README.md` | Describes the intended responsibilities, API, and test command. |

## 1. `app/main.py` — FastAPI application

### Imports and app setup

- The module docstring describes the User Service.
- `os` reads environment settings such as the frontend URL.
- FastAPI imports create the app and configure CORS.
- `asynccontextmanager` is used to run setup and cleanup around the app lifetime.
- `router` contains the user endpoints.
- `db` is the shared database manager.
- `RequestIDMiddleware` adds trace IDs to requests.
- `app = FastAPI(...)` creates the application and sets its title, description,
  version, and lifespan manager.

### `lifespan(app)`

- Runs when the application starts and stops.
- Calls `db.connect()` before serving requests.
- `yield` allows the application to run.
- After shutdown begins, calls `db.disconnect()` to close the database pool.
- `await` lets these asynchronous connection operations finish without blocking
  the entire server.

### CORS configuration

- `FRONTEND_URL` sets the browser origin allowed to call the API; a local frontend
  URL is used as the development default.
- The options control whether browser credentials, methods, and headers are
  allowed.
- CORS controls browser cross-origin access; it does not authenticate users.

### Middleware and routes

- `app.add_middleware(RequestIDMiddleware)` wraps incoming requests with request
  ID and timing behavior.
- `app.include_router(router)` attaches the API endpoints defined in `routes.py`.

### `health_check()`

- Handles `GET /health`.
- Returns a basic healthy status for monitoring.
- It is a lightweight liveness response, not necessarily a fresh database query.

### `root()`

- Handles `GET /`.
- Returns a short message identifying the User Service.

### Direct-run entry point

- If the Python file is run directly, it starts Uvicorn on port 8002 and listens
  on all container network interfaces (`0.0.0.0`).

## 2. `app/routes.py` — HTTP API

### Imports and shared configuration

- FastAPI imports define routes, dependencies, query validation, requests, and
  HTTP errors.
- `HTTPBearer` reads a bearer credential from an Authorization header.
- `httpx` sends requests to the Auth Service and File Service.
- Model classes validate profile and response data.
- The shared `db` object performs database work.
- `AUTH_SERVICE_URL` and `FILE_SERVICE_URL` come from environment variables, with
  local service URLs as development defaults.
- `router = APIRouter(...)` groups endpoints under `/api/v1/users`.
- `security` extracts an Authorization bearer token.

### `verify_token(token)`

- Sends the token to the Auth Service's current-user endpoint.
- Returns the decoded user profile when Auth Service responds successfully.
- Returns `None` when Auth Service rejects the token or the HTTP call fails.

### `get_current_user(credentials)`

- FastAPI supplies the bearer credential.
- The function calls `verify_token()` with that token.
- If no user profile comes back, raises HTTP 401 (unauthorized).
- Otherwise returns the user profile for the protected route to use.
- Most `/me` endpoints include this as a dependency.

### `get_profile(current_user)` — `GET /me`

- Reads the authenticated user's ID.
- Asks the database for that profile.
- Returns HTTP 404 if there is no matching profile.
- Otherwise FastAPI validates and returns the profile as `UserProfileResponse`.

### `update_profile(...)` — `PUT /me`

- Receives the authenticated user and a validated `UserProfileUpdate`.
- Builds a dictionary of fields to change, omitting fields whose value is `None`.
- Calls the database update method and returns the updated profile.
- A field sent as `None` is not used to clear a stored value through this route.
- If no changes are supplied, the database method returns the existing profile.

### `get_quota(current_user)` — `GET /me/quota`

- Gets the user's current quota and plan.
- Looks up plan limits and calculates remaining daily/monthly use.
- Remaining counts are clamped at zero so usage above a limit does not produce a
  negative number.
- A zero or negative plan limit is represented as `-1` remaining by this route,
  meaning the route treats it as unlimited.
- Returns HTTP 404 if quota data could not be found.
- Returns the result as `UserQuotaResponse`.

### `get_plan(current_user)` — `GET /me/plan`

- Asks the database for the user's plan and subscription timestamps.
- Returns HTTP 404 if there is no plan record.
- Otherwise returns the validated `UserPlanResponse`.

### `PlanUpgradeRequest`

- A Pydantic request model containing the requested plan name.
- Its description/comment lists plan values, but the route also performs its own
  lowercase and allowed-value checks.

### `upgrade_plan(...)` — `PUT /me/plan`

- Gets the requested plan and converts it to lowercase.
- Rejects values other than `free`, `pro`, and `enterprise`.
- Gets the current plan and rejects a request that does not change it.
- Compares plan ranks to classify whether the change is an upgrade or downgrade.
- Updates the user's plan in the database.
- On an upgrade, attempts to reset quota counters; errors from that reset are
  ignored.
- Returns plan and quota information. `quota_reset` reflects whether the change
  was classified as an upgrade, not whether the reset actually succeeded.
- The database update changes an existing plan row; it does not create one if
  missing.

### `increment_quota(current_user)` — `POST /me/quota/increment`

- Calls the database method that checks plan limits and increments usage.
- If the raised error text includes `"limit reached"`, returns HTTP 429
  (rate/quota limit reached).
- Other exceptions become HTTP 500 with a generic failure message.
- The database function performs separate reads and writes rather than a single
  atomic transaction, so concurrent increments may race.

### `upload_avatar(...)` — `POST /me/avatar`

- Accepts an uploaded image for the authenticated user.
- Allows JPEG, PNG, GIF, or WebP based on the reported MIME type.
- Reads the uploaded file into memory, then rejects it if it is larger than
  5 MiB.
- Sends the file bytes to the File Service with avatar purpose and virus-scan
  settings.
- If the File Service responds successfully with a URL, saves that URL to the
  user's profile and returns it.
- Network errors become HTTP 503; other service-call errors become HTTP 500.
- The entire file is read before the size check, so the size limit does not avoid
  reading an oversized upload into memory first.

### `update_user_plan_internal(user_id, body)` — `PUT /{user_id}/plan`

- Reads a plan from the JSON body, defaulting to `free`.
- Checks the value against the allowed plan names.
- Calls the database to update the target user's plan.
- Returns the result or an HTTP error when the update fails.
- This route does not include `get_current_user` as a dependency. Its docstring
  describes protection at an internal/network layer; the route itself does not
  authenticate the caller.

### `export_my_data(current_user)` — `GET /me/export`

- Requires an authenticated user and looks up their profile/quota/plan data.
- Returns a JSON object with profile attributes, current plan, usage counts, and
  an export timestamp.
- The response itself says other services hold interview transcripts and feedback.
- Despite broader README wording about complete cross-service portability, this
  route does not fetch all other services' records or create a downloadable
  archive in the inspected implementation.

### `delete_my_account(current_user)` — `DELETE /me`

- Requires an authenticated user and calls the database's soft-delete function.
- The database anonymizes profile fields and changes some session states rather
  than physically erasing every connected record.
- Returns a confirmation and deletion time.
- Returns HTTP 404 if the user was not found; other errors become HTTP 500.
- The route's docstring mentions a future purge/queue, but the inspected database
  code does not schedule permanent deletion.

### `get_leaderboard(limit, current_user)` — `GET /leaderboard`

- Requires an authenticated user even though overview text calls the leaderboard
  public.
- Clamps the requested limit to the range 1–100.
- Requests ranked entries from the database and returns them as
  `LeaderboardEntry` values.
- The database query ranks profile averages based on feedback rows and does not
  itself filter to completed sessions.

## 3. `app/database.py` — PostgreSQL operations

### Imports and `Database` class

- `asyncpg` provides asynchronous PostgreSQL connections and queries.
- `os` reads database settings from environment variables.
- `uuid` converts user IDs to UUID values for database queries.
- `json` supports data stored in JSON form.
- Typing and date helpers describe results and calculate quota periods.
- `Database` groups connection-pool management and SQL operations.
- `db = Database()` creates the shared instance used by the routes.

### `Database.__init__()`

- Sets the connection pool to `None` until the app starts and connects.

### `connect()`

- Reads database host, port, database name, user, password, pool sizes, and
  command timeout from environment settings.
- Creates an asynchronous PostgreSQL connection pool.
- A pool lets requests reuse a limited number of database connections.

### `disconnect()`

- Closes the pool if one exists.
- The app calls it during shutdown.

### `get_user_by_id(user_id)`

- Selects profile information for the supplied ID.
- Returns the row as a dictionary when found, otherwise `None`.

### `get_user_by_email(email)`

- Lowercases the supplied email and uses it in a SQL lookup.
- Returns the matching user data or `None`.
- The SQL compares against the stored email exactly; it does not lowercase the
  database column, so matching depends on stored addresses being normalized.

### `update_user_profile(user_id, updates)`

- Removes fields whose values are `None`.
- If no updates remain, reads and returns the current profile.
- Otherwise builds an SQL `UPDATE`, parameterizes field values, sets
  `updated_at` to the current database time, and returns the updated row.
- If no user row matches, the implementation attempts to convert a missing row
  into a dictionary; callers may receive an error rather than a clean `None`.
- Values are parameterized, but column names are interpolated into the SQL string.

### `get_user_quota(user_id)`

- Ensures a default free-plan row exists, inserting it only if missing.
- Ensures a quota row exists with `INSERT ... ON CONFLICT DO NOTHING`.
- Joins plan and quota records and returns current usage, plan, and reset date.
- Returns `None` if the final lookup has no row.

### `get_plan_limits(plan)`

- Returns configured daily and monthly limits for the given plan.
- Unknown plan names fall back to free-plan limits.
- Route logic treats non-positive limits as unlimited.
- Important: the implementation values differ from some documentation/README
  numbers; see the current-code notes below.

### `_get_user_quota_conn(conn, user_id)`

- Performs the same default plan/quota initialization and joined lookup as
  `get_user_quota()`.
- Uses an already-open connection supplied by the caller rather than acquiring a
  second one from the pool.
- Returns the quota/plan values for that user.

### `increment_quota(user_id)`

- Acquires a connection and ensures the plan/quota rows exist.
- Reads the user's plan limits and current counters.
- Resets the daily count if the last reset date is before today.
- Resets monthly use if the stored year/month is older than the current year/month.
- If a positive daily or monthly cap has already been reached, raises an error
  containing a limit-reached message.
- Otherwise increments the counters, updates the reset date and timestamp, and
  returns the new counts and plan.
- If no plan row is found, it uses free-plan limits; if quota lookup fails, it
  raises an error.
- Although comments call this atomic/race-safe, the current read-check-write flow
  is not wrapped in a transaction/row lock, so simultaneous requests can race.

### `get_user_plan(user_id)`

- Selects the user's plan and related subscription dates.
- Returns a dictionary or `None` when no plan exists.

### `update_user_plan(user_id, new_plan)`

- Updates an existing plan row inside a database transaction.
- Returns the updated row, or `None` if no row matched.
- It does not insert a plan record if one is missing.

### `reset_quota(user_id)`

- Sets daily and monthly counters to zero and sets the reset date to the current
  database date.
- Updates the modification timestamp.
- Does not report whether any row was actually changed.

### `soft_delete_user(user_id)`

- Parses the user ID as a UUID.
- Runs the profile change inside a transaction.
- Replaces the email/name with deletion placeholders and clears profile data such
  as bio, avatar, skills, or target companies.
- Makes the profile private and records deletion/update timestamps.
- Marks selected user-session states (`created`, `active`, or `paused`) as
  `expired`, and updates their completion/update timestamps.
- Returns the anonymized identity fields, or `None` when no profile matched.
- Prints an error and re-raises exceptions.
- This is anonymization/soft deletion, not a scheduled permanent purge.

### `get_leaderboard(limit=25)`

- Joins profiles, sessions, and feedback records.
- Includes public, non-deleted profiles with feedback records.
- Groups records by user, calculates an average feedback score, and counts
  feedback rows.
- Sorts by average score and then number of feedback rows, highest first.
- Applies the requested limit.
- The query counts feedback rows, not necessarily unique sessions, and does not
  filter sessions by completed status.
- On an exception, prints an error and returns an empty list.

### Shared database object

- `db = Database()` creates one database manager at module import time.
- Routes import this singleton and use it for database operations.

## 4. `app/models.py` — request and response schemas

Pydantic models check data types and constraints and also describe API response
fields.

### `Plan`

- A string enum listing `free`, `pro`, and `enterprise`.
- Gives the application named constants for the supported plan names.
- Its descriptive comments list limit values that conflict with the database
  limits and test fixture values.

### `UserProfileUpdate`

- Describes optional fields a user may update, such as display name, biography,
  target companies, or skills.
- Length constraints keep text fields within allowed ranges.
- Optional fields allow partial updates: the caller can send only the fields it
  wants to change.

#### `validate_display_name(cls, v)`

- Checks the display name for HTML-like tags.
- Rejects text that matches the tag pattern rather than stripping the tags.
- Trims whitespace from accepted names.

#### `validate_arrays(cls, v)`

- Runs validation on list values such as skills and target companies.
- Trims spaces from each item and removes empty items.

### `UserProfileResponse`

- Describes profile data returned by the service, such as ID, email, name, bio,
  skills, target companies, avatar, privacy setting, and timestamps.

### `UserQuotaResponse`

- Describes today's and monthly usage, plan name, limits, remaining amounts, and
  reset date.

### `UserPlanResponse`

- Describes the user's plan and subscription timestamps.

### `LeaderboardEntry`

- Describes a ranked user result, including profile identity, average score, and
  session/feedback count information.

### Imports

- `BaseModel` and `Field` come from Pydantic.
- Typing imports describe optional and list-valued fields.
- Date/time imports represent timestamps.
- `Enum` provides the plan choices.
- A regex helper checks for HTML-like text.
- `EmailStr` is imported but unused in the inspected file.

## 5. `app/middleware.py` — request tracing

### Imports and logger

- `uuid` creates a new request ID if a caller did not supply one.
- `logging` writes request details.
- `time` measures elapsed duration.
- FastAPI/Starlette types describe requests, responses, and the next handler.
- A named logger is used for request trace messages.

### `RequestIDMiddleware`

- Middleware wraps a request before and after its endpoint runs.

#### `dispatch(request, call_next)`

- Reads the `X-Request-ID` header or creates a UUID.
- Stores the value on `request.state` so application code can access it.
- Records the start time and calls the next handler.
- Adds the request ID to the response header.
- Logs the request ID, method, path, status, and elapsed milliseconds.
- Returns the response to the client.

## 6. `app/test_user.py` — automated tests

The tests use mocked database methods and FastAPI's test client. They check API
responses without requiring a live database.

### Test constants and fixtures

- Mock user/profile data provides predictable IDs and profile fields.
- The `client` fixture patches the database used by routes, configures mock
  responses, and yields an authenticated test client.
- The `unauthenticated_client` fixture yields a client without a simulated user
  so authorization behavior can be checked.

### `TestHealthAndRoot`

- `test_health_check` checks the health endpoint's status and response data.
- `test_root_endpoint` checks the root discovery endpoint.

### `TestProfile`

- `test_get_profile_success` checks a signed-in user's profile response.
- `test_get_profile_unauthorized` checks that a missing login is rejected.
- `test_update_profile_success` checks profile updates.
- `test_update_profile_empty_body` checks a request with no actual changes.

### `TestQuota`

- `test_get_quota` checks the quota endpoint response.
- `test_increment_quota` checks that quota use can be incremented.

### `TestPlan`

- `test_get_plan` checks retrieval of current plan information.
- `test_upgrade_plan` checks the plan-change endpoint response.

### `TestGDPR`

- `test_export_data` checks the account data export response.
- `test_delete_account` checks the account deletion/anonymization response.

### `TestLeaderboard`

- `test_get_leaderboard` checks leaderboard results.
- `test_leaderboard_unauthorized` checks that a caller without authentication is
  rejected.

### Test limitations

- The fixture replaces database methods, so these tests do not verify real SQL
  against PostgreSQL.
- The inspected tests mostly check route responses and do not directly test all
  model validators, quota races, or cross-service export behavior.

## 7. `Dockerfile` — service container

Each non-empty Docker instruction controls the container build/start process:

1. `FROM python:3.11-slim` starts from a smaller Linux image with Python 3.11.
2. `WORKDIR /app` sets the working folder inside the container.
3. `COPY requirements.txt .` copies the package list into the image.
4. `RUN pip install ...` installs the listed Python packages without keeping pip's
   download cache.
5. `COPY . .` copies the User Service source into the image.
6. `EXPOSE 8002` documents the API port.
7. `CMD [...]` starts Uvicorn and serves `app.main:app` on port 8002.

## 8. `requirements.txt` — installed Python packages

Each entry names a package the service uses:

- `fastapi` provides API routing and HTTP request/response handling.
- `uvicorn[standard]` runs the ASGI application.
- `pydantic[email]` validates data and adds email-related support.
- `pydantic-settings` supports configuration from environment/settings.
- `email-validator` validates email addresses.
- `asyncpg` connects asynchronously to PostgreSQL.
- `httpx` makes asynchronous requests to Auth and File services.
- `python-dotenv` can load environment variables from a `.env` file.
- `redis` provides a Redis client library.
- `aiofiles` provides asynchronous file operations.
- `python-multipart` supports uploaded files and form data.

The tests use `pytest`; it is used by the README's test command but is not listed
in this service's requirements file, so it must be installed in the test
environment separately.

## 9. `README.md` — high-level service overview

The README explains the intended profile, quota, GDPR, leaderboard, API, and
testing features. It is useful context, but some details differ from the current
implementation:

- README says Free has 3 interviews per month and paid tiers are unlimited.
  `get_plan_limits()` in `database.py` uses different values, while model comments
  and test mocks give still other values. The reviewed files do not establish one
  authoritative set of limits.
- The README describes quota increments as safe and atomic, but the current
  read/check/update implementation does not use a transaction or row lock around
  the whole operation.
- The README calls data export complete and cross-service. The route returns
  profile/current plan/usage JSON and explicitly directs users to other services
  for transcripts and feedback.
- The README describes a complete deletion/purge process. The inspected code
  anonymizes the profile and expires selected sessions but does not schedule a
  permanent purge.
- The README describes the leaderboard as public, while the endpoint requires an
  authenticated user.
- The plan-upgrade route can report that quota was reset even if the quota-reset
  operation raised an error, because that error is ignored.

## Useful terms

| Term | Easy meaning |
|---|---|
| API endpoint | A URL and HTTP method that performs one operation. |
| Async / `await` | Waits for database or network work without freezing other requests. |
| Bearer token | A login credential sent in an HTTP Authorization header. |
| CORS | A browser rule that controls which websites can call an API. |
| Database pool | Reusable database connections kept ready for requests. |
| GDPR export | A copy of a person's stored data that can be provided to them. |
| Soft delete | Hides/anonymizes a record while keeping its database row. |
| Pydantic model | A definition that checks request/response fields and types. |
| Quota | A limit on how often a feature can be used. |
| UUID | A unique identifier commonly used for database records. |
