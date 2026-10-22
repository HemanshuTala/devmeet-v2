# Admin Service Code Guide (Easy English)

This guide explains the files and functions in `services/admin-service` in plain
English. It covers the service's Python code, tests, Docker setup, and dependencies.
Blank lines are only visual spacing; comments and docstrings explain the nearby code.
The line references below point to the source files, so small code edits can move them.

## What this service does

The Admin Service is a private control panel API for platform administrators. It
shows user and interview-session information, changes account status and plans,
records administrative actions, and asks the Auth Service to confirm that a caller
really has an administrator role.

Typical request:

1. A browser sends a request to an admin API route.
2. `require_admin` asks the Auth Service to validate the caller's login token.
3. The route reads or changes data through the database module.
4. Sensitive changes are added to the audit log.
5. FastAPI returns the result as JSON.

## Folder map

| File | What it is for |
|---|---|
| `app/main.py` | Creates the FastAPI application, middleware, startup/shutdown behavior, and public health endpoints. |
| `app/routes.py` | Defines admin API routes and checks admin permissions. |
| `app/database.py` | Reads and changes admin-related data in PostgreSQL, with an in-memory demo fallback. |
| `app/models.py` | Defines the shapes and validation rules for API data. |
| `app/middleware.py` | Adds request IDs and request timing to HTTP traffic. |
| `app/test_admin.py` | Tests the API using fake users and a fake database. |
| `app/__init__.py` | Marks `app` as a Python package. |
| `Dockerfile` | Describes how to build and start the service container. |
| `requirements.txt` | Lists the Python packages the service installs. |
| `README.md` | Existing overview and setup notes for the service. |

## 1. `app/main.py` — service entry point

### Imports and application setup (roughly lines 1–30)

- The opening triple-quoted text is a module docstring: a human-readable summary
  of the service, not code that handles a request.
- `import os` lets the app read environment variables such as the frontend URL.
- `FastAPI` creates the web application.
- `CORSMiddleware` controls which browser origins may call the API.
- `router` and `close_admin_http_client` come from `routes.py`. The router contains
  admin endpoints; the close function releases the shared HTTP client at shutdown.
- `db` is the shared database manager.
- `RequestIDMiddleware` adds request tracing information.
- `app = FastAPI(...)` creates the application and sets its title, description, and
  displayed API version. These values appear in generated API documentation.

### Middleware setup (roughly lines 31–48)

- `app.add_middleware(CORSMiddleware, ...)` enables browser cross-origin requests.
- `FRONTEND_URL` is read from the environment. If it is absent, the local frontend
  address is used for development.
- `allow_credentials=True` permits browser requests that include credentials.
- `allow_methods=["*"]` and `allow_headers=["*"]` allow all methods and headers.
- `app.add_middleware(RequestIDMiddleware)` adds the request-ID middleware so
  incoming requests can be traced in logs and responses.

### `startup_event()` (roughly lines 54–60)

- FastAPI calls this asynchronous function when the service starts.
- `await db.connect()` attempts to create the PostgreSQL connection pool.
- `await` means the function pauses while the network/database operation completes
  without blocking the whole server.
- If the connection cannot be made, the database class currently switches to its
  in-memory fallback mode.

### `shutdown_event()` (roughly lines 63–71)

- FastAPI calls this asynchronous function while the service is stopping.
- `close_admin_http_client()` closes the pooled HTTP connection to the Auth Service.
- `db.disconnect()` closes the database pool when one exists.
- Doing this cleanup prevents open connections from being left behind.

### Router mounting (roughly line 75)

- `app.include_router(router)` attaches the endpoints from `routes.py` to this
  FastAPI application. Their URL prefix is configured in that module.

### `health_check()` (roughly lines 81–92)

- Handles `GET /health`.
- Returns a small JSON object that reports the service name and a healthy status.
- `db.use_db` indicates whether the database manager believes it connected to
  PostgreSQL; the field is a connection-mode indicator, not a complete database
  query test.
- This endpoint has no admin dependency, so monitoring tools can call it without
  signing in.

### `read_root()` (roughly lines 96–100)

- Handles `GET /`.
- Returns a welcome message so a caller can tell the API is present.
- It is a simple discovery endpoint; it does not return admin data.

## 2. `app/routes.py` — API routes and permission checks

### Imports and shared settings (roughly lines 1–47)

- The module docstring describes the endpoint categories.
- FastAPI imports provide route creation, request details, query validation,
  dependency injection, and HTTP errors.
- `JSONResponse` and `Body` are imported in this module; they are not needed by
  the route implementations shown here.
- `HTTPBearer` reads a bearer credential from the `Authorization` request header.
- `Optional` means a value may be absent; `List` describes a list of values.
- `datetime` supplies the time returned by the health endpoint.
- The model imports define the response and request data shapes.
- `db` is the database singleton used by the routes.
- `httpx` is used to make asynchronous requests to the Auth Service.
- `os` reads the Auth Service URL from configuration.
- `router = APIRouter(...)` creates a group of endpoints. The prefix means route
  paths such as `/users` become `/api/v1/admin/users`.
- `security = HTTPBearer()` tells FastAPI to extract a bearer token for routes that
  depend on it.
- `AUTH_SERVICE_URL` reads the Auth Service address from the environment; the
  localhost address is the development default.
- `_admin_http_client` starts as `None`; it will hold one shared HTTP client for
  calls to the Auth Service.

### `get_admin_http_client()` (roughly lines 48–57)

- Returns the shared asynchronous HTTP client.
- `global` lets this function read and update the module-level variable.
- If the client does not exist, or has already been closed, it creates a new one.
- The timeout limits how long a request may wait; the connect timeout applies to
  opening the network connection.
- The connection limits reuse a small pool instead of opening a brand-new network
  connection for every admin request.
- The function returns the ready-to-use client.

### `close_admin_http_client()` (roughly lines 59–66)

- Runs during service shutdown.
- If a client exists and is still open, `aclose()` closes its network resources.
- The global reference is then set to `None`, allowing a later startup to create a
  fresh client.

### `require_admin()` (roughly lines 69–117)

- This is a FastAPI dependency used to protect admin endpoints.
- FastAPI supplies `credentials` by reading the bearer credential from the request.
- `credentials.credentials` extracts the token text.
- The function calls the Auth Service's “who am I?” endpoint with that token.
- A non-success response becomes HTTP 401, meaning the token is invalid or expired.
- A successful response is decoded as JSON into the user's profile.
- An `HTTPException` is re-raised unchanged so its intended HTTP status is kept.
- Other errors, such as network failures, become HTTP 503 because the Auth Service
  could not be reached.
- The role is read from the returned profile. A missing role is treated as `"user"`.
- Only `"admin"` and `"super_admin"` pass. Other roles receive HTTP 403.
- The returned profile is then available to the protected route as its `admin`
  argument.

### `get_stats()` (roughly lines 121–140)

- Handles `GET /api/v1/admin/stats`.
- `Depends(require_admin)` makes FastAPI run the admin check first.
- The function asks the database layer to calculate platform totals and returns
  them. `response_model=AdminStats` checks and shapes the JSON response.

### `list_users()` (roughly lines 143–170)

- Handles `GET /api/v1/admin/users`.
- `q` optionally searches by part of a name or email.
- `plan` optionally filters to a subscription tier.
- `is_blocked` optionally selects blocked or unblocked accounts.
- `limit` controls page size and is restricted to 1–200.
- `offset` says how many matching records to skip and cannot be negative.
- The route passes these filters to `db.get_all_users()` and returns the resulting
  list. `UserSummary` validates each row.

### `get_user()` (roughly lines 173–206)

- Handles `GET /api/v1/admin/users/{user_id}`.
- It first looks up the user. If there is no match, it returns HTTP 404.
- It then gets that user's interview sessions.
- The response includes profile details, a default `"free"` plan when none is
  supplied, a default `False` blocked flag, and session counts.
- `len(sessions)` counts all sessions; the `sum(...)` expression counts only
  sessions whose status is `"completed"`.
- `UserDetailResponse` validates the returned fields.

### `block_user()` (roughly lines 209–250)

- Handles `POST /api/v1/admin/users/{user_id}/block`.
- It looks up the account first and returns 404 if it does not exist.
- If it is already blocked, it returns a successful “already blocked” response
  instead of repeating the change.
- Otherwise it asks the database layer to set the blocked flag.
- A failed update becomes HTTP 500.
- It reads the caller's IP address from the request when available.
- It writes an audit record containing the admin ID, action name, target user,
  IP address, and target email.
- Finally it returns a confirmation object.

### `unblock_user()` (roughly lines 253–293)

- Handles `POST /api/v1/admin/users/{user_id}/unblock`.
- It returns 404 for an unknown user.
- If the user is already unblocked, it returns a “not currently blocked” message.
- Otherwise it clears the blocked flag and returns HTTP 500 if that update fails.
- It records the action and caller IP in the audit log, then returns confirmation.

### `change_user_plan()` (roughly lines 296–335)

- Handles `PUT /api/v1/admin/users/{user_id}/plan`.
- `payload` contains the requested plan and is validated by `PlanUpdateRequest`.
- It returns 404 if the target account does not exist.
- It asks the database layer to update the plan; a failed change becomes HTTP 500.
- It records the admin, target user, IP, email, and new plan in the audit log.
- It returns the new plan in a confirmation object.

### `delete_user()` (roughly lines 338–375)

- Handles `DELETE /api/v1/admin/users/{user_id}`.
- It looks up the target and returns 404 if missing.
- `db.delete_user()` anonymizes identifying fields rather than deleting related
  interview records, preserving those records' references.
- A failed anonymization becomes HTTP 500.
- The route writes an audit entry with the previous email and returns a deletion
  confirmation. This operation changes account data and should be treated as
  irreversible.

### `impersonate_user()` (roughly lines 378–438)

- Handles `POST /api/v1/admin/users/{user_id}/impersonate`.
- It requires both the validated admin profile and the original bearer credential.
- It first confirms that the target user exists; otherwise it returns 404.
- It forwards the administrator's credential to the Auth Service's token-creation
  endpoint for the target user.
- The shared HTTP client is reused for this request.
- If the Auth Service responds with a non-success status, the route tries to use
  its JSON `detail` message; otherwise it uses a general failure message.
- The returned token data is passed back to the caller.
- It logs the impersonation, including the target and administrator identities.
- Network or other unexpected failures become HTTP 503.
- Note: the current broad exception handler also catches raised HTTP exceptions
  from the non-success response path, so some Auth Service statuses may be reported
  as 503 rather than forwarded. This describes current behavior, not a recommendation.

### `list_sessions()` (roughly lines 443–465)

- Handles `GET /api/v1/admin/sessions`.
- Optional query fields filter by user ID and session status.
- Page size is bounded from 1 to 200; offset cannot be negative.
- It asks the database layer for the matching rows.
- The response includes the rows and `len(sessions)`, which is the count returned
  for this page, not necessarily the count of every matching record in the database.

### `cancel_session()` (roughly lines 468–502)

- Handles `DELETE /api/v1/admin/sessions/{session_id}`.
- It asks the database layer to mark an eligible session as cancelled.
- If no session changed, it returns HTTP 404; this includes a missing session or
  one already in a terminal state.
- On success, it records the admin, session, IP address, and action in the audit
  log, then returns confirmation.

### `list_audit_logs()` (roughly lines 506–530)

- Handles `GET /api/v1/admin/audit-logs`.
- Optional filters select an actor ID and/or action name.
- The page size is restricted to 1–500, and offset cannot be negative.
- The database layer returns newest-first matching entries.
- `AuditLog` validates the response structure.

### `system_health()` (roughly lines 533–548)

- Handles `GET /api/v1/admin/system/health` and requires an administrator.
- It reads the database manager's connection-mode flag. A compatibility fallback
  checks `_use_memory` if `use_db` is unavailable.
- It returns the admin service status, a database mode label, and the current UTC
  time in ISO format.
- This checks the configured connection mode; it does not run a fresh SQL query.

## 3. `app/database.py` — data access and fallback data

### Imports and `AdminDatabase` setup (roughly lines 1–99)

- The module docstring describes PostgreSQL use and the mock-data fallback.
- `os` reads database settings from environment variables.
- `asyncpg` provides asynchronous PostgreSQL connections.
- `json` converts audit metadata between Python values and JSON text.
- `Optional`, `List`, `Dict`, and `Any` describe the kinds of values used.
- `datetime` and `timedelta` create timestamps for the sample data.
- `AdminDatabase` groups database operations and mock data in one object.

### `AdminDatabase.__init__()` (roughly lines 36–99)

- Starts with no connection pool and `use_db=False`.
- Creates three example users in `mock_users`. They let the service return sample
  data when no live database is available.
- Each mock user has an ID, email, display name, plan, signup time, session count,
  and blocked status.
- The dates are calculated relative to the current UTC time.
- Creates two example audit entries in `mock_audit_logs`.
- The mock entries show the same basic fields as stored audit rows.
- These are demonstration/fallback data, not live production records.

### `connect()` (roughly lines 101–122)

- Tries to create an asynchronous PostgreSQL connection pool.
- Reads host, port, database name, username, password, pool sizes, and command
  timeout from environment variables; defaults are for local development.
- `min_size` and `max_size` set the smallest and largest number of pooled
  connections.
- On success, stores the pool and sets `use_db=True`.
- If anything fails, it prints an error and sets `use_db=False`, allowing methods
  to use the mock data instead.

### `disconnect()` (roughly lines 125–129)

- Checks whether a pool exists.
- If present, closes it so PostgreSQL connections are returned and released.

### `get_all_users()` (roughly lines 132–212)

- Returns a page of users, optionally filtered by search text, plan, and blocked
  status.
- In database mode, builds SQL conditions and uses numbered parameters such as
  `$1` instead of inserting user-provided values directly into SQL.
- Search checks email and display name. A missing search uses a pattern that
  matches all users.
- Optional plan and blocked filters add more conditions and parameters.
- The query joins profile, plan, and session tables. `LEFT JOIN` keeps users even
  when they have no plan/session row; `COALESCE` uses `"free"` when no plan exists.
- `COUNT(s.id)` counts sessions. `GROUP BY` supports that count, and newest users
  are ordered first.
- `LIMIT` and `OFFSET` implement pagination.
- Database rows are converted into ordinary dictionaries, with UUIDs and timestamps
  converted to strings.
- If querying the database fails, it prints an error and continues with mock users.
- In mock mode it filters the list in Python, then returns only the requested slice.

### `get_user_by_id()` (roughly lines 215–259)

- Finds one user by ID.
- In database mode, converts the incoming text ID to a UUID and queries profile,
  plan, and session-count information.
- If a row exists, it converts the result to a dictionary; if not, it returns
  `None`.
- If the database lookup errors, it prints the error and tries the mock list.
- In mock mode, it searches `mock_users` and returns the matching dictionary or
  `None`.

### `block_user()` (roughly lines 262–285)

- In database mode, converts the user ID to a UUID and sets `is_blocked` to true.
- If the query succeeds, it returns `True`; if the query raises an error, it prints
  a message and returns `False`.
- In mock mode, it changes the matching mock user's flag and returns `True`.
- It returns `False` when no matching mock user exists.

### `unblock_user()` (roughly lines 289–312)

- Mirrors `block_user()`, but sets the blocked flag to false.
- It returns whether it found and changed a matching account.

### `delete_user()` (roughly lines 316–354)

- Builds a replacement email based on the user's ID and uses `"Anonymized User"`
  as the replacement display name.
- In database mode, it converts the ID to a UUID and replaces personal fields such
  as email, name, password hash, biography, avatar, target companies, and skills.
- It keeps the database row and its ID so related historical records can still
  refer to it.
- On an error it prints a message and returns `False`.
- In mock mode it replaces the mock user's email and name. The mock fallback does
  not change all the same fields as the database path.
- Returns `False` if the user is not found.

### `update_user_plan()` (roughly lines 358–385)

- Updates the user's plan in PostgreSQL or the matching mock record.
- The database path updates `user_plans.plan` and the update timestamp.
- The mock path changes the `plan` field in memory.
- Returns `True` after a successful match/update and `False` on failure or no match.

### `get_user_sessions()` (roughly lines 389–409)

- Looks up the sessions belonging to one user, ordered newest first.
- Converts the user ID to a UUID and fetches session ID, status, type, and time.
- Returns a list of simplified session dictionaries.
- If the query fails, it prints the error and returns an empty list.
- There is no in-memory session list, so mock mode also returns an empty list.

### `get_all_sessions()` (roughly lines 413–452)

- Returns a page of sessions, optionally filtered by user ID and status.
- Builds parameterized SQL conditions so filter values are supplied separately
  from the SQL text.
- Adds limit and offset for paging, sorts newest first, and selects basic session
  details.
- Converts IDs and timestamps to strings before returning dictionaries.
- On a database error it prints a message; because there is no session mock
  collection, the fallback result is an empty list.

### `cancel_session()` (roughly lines 456–478)

- Converts the session ID to a UUID.
- Updates the session to `"cancelled"` only if its status is not already
  `"completed"` or `"cancelled"`.
- `UPDATE 0` means no row changed, so the function returns `False`; other update
  results return `True`.
- Errors are printed and return `False`.
- This operation has no mock-session fallback.

### `create_audit_log()` (roughly lines 482–533)

- Captures the current UTC time.
- In database mode, optional actor and resource IDs are converted to UUIDs.
- `json.dumps` converts metadata to JSON text.
- An `INSERT` writes the action, target, IP, metadata, and timestamp into
  `audit_logs`.
- If writing fails, an error is printed and the function continues to the mock
  audit list.
- The fallback appends a dictionary to `mock_audit_logs`.
- Returns `True` after either the database insert or mock append.

### `get_audit_logs()` (roughly lines 537–599)

- Returns the newest audit records, optionally filtered by actor and action.
- It builds SQL conditions and numbered parameters only for filters that were
  provided.
- Limit and offset are added after the filters.
- Returned UUIDs/timestamps are converted to strings.
- Metadata is decoded from JSON text when needed, or converted from an existing
  mapping into a dictionary.
- If the SQL query errors, it prints the error and uses the mock log list.
- The mock path filters by actor/action and returns the requested page.

### `get_admin_stats()` (roughly lines 603–675)

- Calculates the counts displayed on the admin dashboard.
- In database mode, one SQL query uses three `WITH` sections (CTEs):
  - `user_stats` counts users, blocked accounts, and recent signups.
  - `plan_stats` counts users on each plan.
  - `session_stats` counts total, recent, completed, and active sessions.
- The final query combines those one-row summaries.
- Missing database counts are treated as zero using `or 0`.
- Estimated monthly revenue is calculated as `$19` per Pro account plus `$199` per
  Enterprise account.
- If the database query fails or the service is in mock mode, it counts plans and
  blocked users in the mock list and fills the other dashboard values with sample
  numbers.

### Shared database object (last line)

- `db = AdminDatabase()` creates one shared instance when this module is imported.
- Routes and the application use this same object for database calls.

## 4. `app/models.py` — request and response shapes

This file uses Pydantic `BaseModel` classes. FastAPI uses these classes to check
data and to describe API responses. `Field(...)` means a value is required; a
default of `None` means it is optional.

### Imports (roughly lines 1–21)

- `BaseModel` creates data-validation classes.
- `Field` adds required/default values and documentation descriptions.
- `Optional`, `List`, `Dict`, and `Any` describe flexible data types.
- `datetime` represents a parsed date and time.
- `Enum` creates a fixed set of allowed named values.

### `Plan` (roughly lines 25–31)

- A string enum containing the supported values `"free"`, `"pro"`, and
  `"enterprise"`.
- Using a fixed list reduces accidental spelling differences in code.

### `UserSummary` (roughly lines 34–53)

- Defines the short user record for a user list.
- Required fields are ID, email, display name, plan, creation time, session count,
  and blocked status.
- `Field(..., description=...)` means the field is required and provides readable
  API documentation.

### `UserDetailResponse` (roughly lines 56–79)

- Defines the larger user detail response.
- Includes account timestamps as `datetime` values and session totals.
- The completed-session field is separate from the total-session field.

### `PlanUpdateRequest` (roughly lines 82–92)

- Defines the JSON body for a plan update.
- `pattern` only accepts `"free"`, `"pro"`, or `"enterprise"`.
- Invalid input is rejected by Pydantic before the route updates the database.

### `AuditLog` (roughly lines 96–117)

- Defines one audit log entry.
- The action and resource type are required.
- The admin/user ID, resource ID, IP address, and metadata may be absent.
- `Dict[str, Any]` means metadata is a dictionary with string keys and values of
  any JSON-compatible shape.

### `AdminStats` (roughly lines 120–129)

- Defines all required numbers returned by the dashboard.
- Counts are integers; estimated revenue is a floating-point number.
- FastAPI checks that the statistics result has all fields with compatible types.

## 5. `app/middleware.py` — request tracing

### Imports and logger (roughly lines 1–28)

- The docstring explains the purpose of the middleware.
- `uuid` creates a unique request ID if the caller did not send one.
- `logging` writes structured request details.
- `time` measures elapsed time.
- `Request` and `Response` describe Starlette/FastAPI HTTP objects.
- `BaseHTTPMiddleware` is the base class for middleware.
- `RequestResponseEndpoint` describes the next handler in the chain.
- `logger` creates a named logger for request-ID messages.

### `RequestIDMiddleware` (roughly lines 30–66)

- Defines middleware that runs around each HTTP request.

#### `dispatch()` (roughly lines 35–66)

- Receives the incoming request and the `call_next` function that continues
  processing it.
- It reads `X-Request-ID` from the request. If there is none, it creates a UUID.
- `request.state.request_id` stores the value for other request handling code.
- It records the start time, then awaits the next handler.
- Once the response comes back, it places the same ID in the response header.
- It calculates elapsed milliseconds and writes a log containing ID, method, URL
  path, response status, and duration.
- It returns the response to the caller.

## 6. `app/test_admin.py` — automated tests

These tests use FastAPI's `TestClient` and mocked database/Auth dependencies. They
check how the API behaves without changing a real database.

### Imports and mock data (roughly lines 1–86)

- The module docstring lists the behaviors covered.
- `sys` and `MagicMock` are used to fake `asyncpg` before application imports.
- `pytest` provides test and fixture helpers.
- `AsyncMock` represents asynchronous functions; `patch` temporarily substitutes
  imported objects.
- `TestClient` sends test HTTP requests directly to the FastAPI app.
- `datetime` supplies timestamp values for user responses.
- `MOCK_ADMIN_USER` represents a signed-in admin.
- `MOCK_REGULAR_USER` represents an ordinary user.
- `MOCK_STATS` is a predictable dashboard result.
- `MOCK_USERS_LIST` is a predictable user directory result.
- These constants make test results stable and independent of production data.

### `admin_client` fixture (roughly lines 88–139)

- Creates a fake database object and configures its async methods to return known
  values.
- Patches the database singleton in the database, routes, and main modules so each
  part of the app sees the same fake.
- Imports the FastAPI app and replaces `require_admin` with a function that returns
  the mock administrator.
- Creates a `TestClient`, then yields the client and mock database to a test.
- After a test, it clears dependency overrides.
- The fixture also lets tests change a mocked database response when needed.

### `unauthenticated_client` fixture (roughly lines 142–160)

- Creates a fake database, but does not override the admin check.
- Clears old dependency overrides so the request has no simulated admin identity.
- Yields a client for tests that verify requests without credentials are denied.

### `non_admin_client` fixture (roughly lines 163–190)

- Creates a fake database and overrides `require_admin` with a function that raises
  HTTP 403.
- Yields a client that behaves like a regular user attempting admin actions.
- Clears the override after use.

### `TestHealthAndRoot` (roughly lines 193–219)

- `test_health_check` requests `/health` and checks status 200 and the service
  identifier.
- `test_root_endpoint` requests `/` and checks for a welcome message containing
  `"Admin"`.
- `test_health_no_auth_required` checks that `/health` works without authentication.

### `TestStats` (roughly lines 222–251)

- `test_get_stats_as_admin` checks that an admin receives dashboard numbers from
  the mock result.
- `test_get_stats_unauthorized` checks that a request with no admin access is
  rejected with 401 or 403.
- `test_get_stats_forbidden_for_regular_user` checks that an ordinary user receives
  403.

### `TestUserListing` (roughly lines 254–323)

- `test_list_users` checks that the user endpoint returns a list with the expected
  sample account.
- `test_list_users_with_search` configures one matching mock result, sends a search
  query, and checks that one row is returned.
- `test_list_users_with_plan_filter` sends a plan filter and checks for success.
- `test_list_users_pagination` sends limit and offset values and checks for success.
- `test_get_single_user` checks user details and verifies total/completed session
  counts derived from the mocked sessions.
- `test_get_user_not_found` makes the database return `None` and checks for HTTP 404.

### `TestBlockUnblock` (roughly lines 326–355)

- `test_block_user` checks that an admin can call the block endpoint successfully.
- `test_unblock_user` checks that an admin can call the unblock endpoint.
- `test_block_user_forbidden_for_non_admin` checks that a non-admin cannot block
  an account and receives HTTP 403.

### `TestAuditLogs` (roughly lines 358–381)

- `test_get_audit_logs_empty` checks that the audit endpoint succeeds and returns
  a list, including an empty list.
- `test_get_audit_logs_with_filter` sends an action filter and checks that the
  endpoint accepts it successfully.

### `TestSystemHealth` (roughly lines 384–end)

- `test_system_health` requests the admin health route, expects HTTP 200, and checks
  that the service reports itself as healthy.

## 7. `app/__init__.py`

- The file contains a short package docstring.
- It marks the `app` directory as an importable Python package, allowing imports
  such as `from app.main import app`.
- It does not define a function or perform service work.

## 8. `Dockerfile` — container instructions

Each non-empty instruction is read by Docker when building/running the image:

1. `FROM python:3.11-slim` starts from a smaller Python 3.11 Linux image.
2. `WORKDIR /app` sets the working directory inside the container.
3. `COPY requirements.txt .` copies the dependency list into that directory.
4. `RUN pip install ...` installs the listed packages without keeping pip's
   download cache in the image.
5. `COPY . .` copies the service files into the container.
6. `EXPOSE 8010` documents the port the API listens on.
7. `CMD [...]` starts Uvicorn and serves `app.main:app` on all container network
   interfaces at port 8010.

## 9. `requirements.txt` — installed packages

Each line pins a package (or a package extra) to a version:

- `fastapi` provides HTTP routing and request/response handling.
- `uvicorn[standard]` runs the ASGI application and includes common performance
  and protocol extras.
- `pydantic[email]` validates typed data and includes email-related support.
- `pydantic-settings` supports settings loaded from configuration/environment.
- `email-validator` validates email addresses.
- `sqlalchemy` is a database toolkit available to the service.
- `asyncpg` is the asynchronous PostgreSQL driver used by `database.py`.
- `redis` is the Redis client library available to the service.
- `python-dotenv` can load environment variables from a `.env` file.
- `boto3` is the AWS SDK for Python.
- `httpx` makes asynchronous HTTP calls, including calls to the Auth Service.

## 10. Existing `README.md`

The existing README gives a service overview, a request/RBAC diagram, a folder
summary, a short endpoint overview, a test command, and an interview question. It is
an overview rather than a line-by-line code explanation; this guide adds the
function-level explanations above.

## Important words in simple English

| Term | Easy meaning |
|---|---|
| API route/endpoint | A URL and HTTP method that the service responds to. |
| Admin dependency | A check FastAPI runs before allowing an admin route to execute. |
| Await / async | A way to wait for network or database work without freezing other requests. |
| Connection pool | Reusable database or HTTP connections kept ready for requests. |
| Fallback/mock data | Sample data used when the live database is not connected. |
| HTTP 401 | The request is not authenticated with a valid login credential. |
| HTTP 403 | The caller is known, but does not have permission. |
| HTTP 404 | The requested user/session was not found. |
| HTTP 500 | The server could not complete the requested operation. |
| HTTP 503 | A required service, such as the Auth Service, is unavailable. |
| Middleware | Code that runs around requests before/after the endpoint. |
| Pydantic model | A definition that checks the fields and types of API data. |
| Parameterized SQL | SQL that supplies values separately from query text, reducing injection risk. |
| UUID | A long unique identifier used to distinguish records. |
| Audit log | A record of who performed an important action, what they changed, and when. |
