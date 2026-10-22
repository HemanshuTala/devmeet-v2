# Auth Service Code Guide (Easy English)

This guide explains the files and functions in `services/auth-service` in plain
English: what the code says and what it does. It covers the application, routes,
database, password/token helpers, GeoIP, models, tests, and deployment files.

It explains related lines together instead of copying every source line. Blank
lines are spacing. Comments and docstrings are notes for developers; executable
statements are the instructions the program runs. Line references refer to the
current source and can move when that source is edited.

## What the Auth Service does

The Auth Service creates accounts, checks passwords, issues and validates login
tokens, supports password changes/resets and MFA, and supplies identity details
to other services. It uses PostgreSQL for persistent account data and optionally
uses Redis for rate limits, temporary codes, token versions, and token blacklists.

Typical login flow:

1. A client sends an email and password to the login endpoint.
2. The service checks rate/lock status and looks up the account.
3. It verifies the password hash.
4. It records login/location information and checks whether MFA is enabled.
5. It either returns an MFA challenge or issues access and refresh tokens.

## File map

| File | Purpose |
|---|---|
| `app/main.py` | Creates the FastAPI application and opens/closes the database. |
| `app/routes.py` | Implements registration, login, tokens, password, email, and MFA endpoints. |
| `app/auth.py` | Hashes passwords and creates/verifies JWTs. |
| `app/database.py` | Runs PostgreSQL operations for users and authentication state. |
| `app/geoip_service.py` | Looks up IP locations and estimates unusual-login risk. |
| `app/models.py` | Validates incoming requests and describes response fields. |
| `app/middleware.py` | Adds request IDs and logs request duration. |
| `app/test_auth.py` | Tests authentication routes and request validation with mocks. |
| `seed_admin.py` | Creates or updates a bootstrap administrator account. |
| `Dockerfile` | Builds and starts the Auth Service container. |
| `requirements.txt` | Lists Python packages the service installs. |
| `README.md` | Gives an architecture and endpoint overview. |

## 1. `app/main.py` — FastAPI application

### Imports and setup

- The module docstring explains the service's role.
- `os` reads configuration such as the frontend URL.
- `asynccontextmanager` supports startup/shutdown code around the app lifetime.
- `FastAPI` creates the web application.
- `CORSMiddleware` configures browser cross-origin access.
- `router` and `db` come from the route and database modules.
- `RequestIDMiddleware` adds tracing IDs to requests.
- `lifespan` is passed to the FastAPI constructor so the app can manage resources.

### `lifespan(app)`

- Runs when the application starts and stops.
- It calls `db.connect()` before serving requests.
- `yield` lets the app serve requests.
- After the app is shutting down, it calls `db.disconnect()`.
- `await` waits for each asynchronous database operation to finish.

### FastAPI application and CORS

- `app = FastAPI(...)` sets the service title, description, version, and lifespan.
- The CORS setup reads `FRONTEND_URL`; it defaults to the local frontend address.
- The configured CORS options determine whether browser requests may include
  credentials and which methods/headers are accepted.
- CORS is a browser policy, not a user identity or permission check.

### Middleware and router

- `app.add_middleware(RequestIDMiddleware)` runs request tracing around requests.
- `app.include_router(router)` registers the authentication routes in the app.

### `health_check()`

- Handles `GET /health`.
- Returns JSON saying the Auth Service is healthy and identifying its service name.
- It is intended for monitoring and does not itself prove that every dependency
  can complete a request.

### `root()`

- Handles `GET /`.
- Returns a simple message confirming that the Auth Service API is available.

### Direct-run entry point

- When the file is run directly, the `__main__` section starts Uvicorn on port
  8001 and listens on all container interfaces (`0.0.0.0`).

## 2. `app/auth.py` — passwords and JWT tokens

### Imports and `AuthManager`

- The imports provide environment settings, time/date handling, bcrypt hashing,
  and JWT signing/verification.
- `AuthManager` groups password and token operations.
- The module creates a shared `auth_manager` object at the end. The class itself
  does not force a single instance; the module-level variable is the shared one.

### `AuthManager.__init__()`

- Reads the JWT secret, algorithm, access-token lifetime, and refresh-token
  lifetime from environment settings.
- Defaults include HS256, a short access-token lifetime, and a longer refresh-token
  lifetime.
- The default secret in the code is a placeholder; deployment should provide a
  strong secret rather than relying on a known development default.

### `hash_password(password)`

- Converts the password text into bytes.
- Asks bcrypt to generate a random salt and calculate a one-way hash.
- Returns the hash as text so it can be stored in the database.
- The original password is not stored by this function.

### `verify_password(password, hashed)`

- Converts the submitted password and stored hash into bytes.
- Asks bcrypt to check whether the password matches that hash.
- Returns `True` for a match and `False` otherwise.

### `create_access_token(data)`

- Copies the supplied claims dictionary so the caller's original dictionary is
  not changed.
- Adds an expiration time based on the configured access-token lifetime.
- Marks the token as type `"access"`.
- Signs the claims with the configured secret and algorithm and returns the JWT
  string.

### `create_refresh_token(data)`

- Copies the supplied claims.
- Adds a longer refresh-token expiration and marks the token type as `"refresh"`.
- Signs and returns the JWT.
- Refresh tokens should be used to obtain new access tokens, not as ordinary
  access credentials.

### `decode_token(token)`

- Verifies the token signature using the configured secret and allowed algorithm.
- A valid token's claims are returned.
- JWT errors such as an expired token or invalid signature result in `None`.

### `verify_access_token(token)`

- Decodes and validates the token.
- Returns claims only when the token type is `"access"`.
- Returns `None` for invalid tokens and for refresh tokens used as access tokens.

### Shared manager instance

- `auth_manager = AuthManager()` creates the object that route handlers import.

## 3. `app/routes.py` — authentication API

This file contains most HTTP behavior. Routes are registered under the
`/api/v1/auth` prefix. FastAPI dependencies supply request details and bearer
credentials; the functions then call the database, Redis, AuthManager, or GeoIP
helper.

### Imports, logger, and email-event helpers (roughly lines 1–85)

- FastAPI imports create routes, return HTTP errors/responses, and schedule
  background tasks.
- Security imports parse bearer tokens from the `Authorization` header.
- Request model imports validate registration, login, password reset, refresh,
  MFA, and profile data.
- `db`, `auth_manager`, and `geoip_service` are shared objects from other modules.
- Standard imports support random values, JSON, hashing, email formatting, and
  other utility work.
- `log_auth_email_event(to, template, data)` writes an email-related event and its
  data to application logs. In the inspected code, it does not send an actual
  email.
- `_send_registration_verification_otp(user_id, email, display_name)` creates a
  six-digit code, stores it in Redis for a limited time when Redis is available,
  and logs a verification event. `user_id` and `display_name` provide context for
  that event.
- `router = APIRouter(...)` groups all auth endpoints under `/api/v1/auth`.
- `security` configures bearer-token extraction.
- `redis_client` is the shared Redis client variable, initially empty.
- `MAX_LOGIN_ATTEMPTS`, `LOCK_DURATION_MINUTES`, `REGISTER_RATE_LIMIT`, and
  `LOGIN_RATE_LIMIT` configure failed-login lockout and request-rate limits.

### `get_redis()`

- Creates a Redis client lazily, only when a route first needs it.
- Reads Redis host and port from the environment.
- Returns the reusable client if one exists.
- On connection/setup errors it logs/prints a message and may return `None`.

### `get_token_version(user_id)`

- Looks up the current token-version counter in Redis.
- Converts the stored value to an integer.
- Returns zero if Redis, the value, or a usable connection is unavailable.
- Routes compare this value to a token claim to support invalidating old tokens.

### `build_token_data(user)`

- Creates the dictionary of claims that will be placed in a JWT.
- It includes the user's ID as the subject, the email, and the current token
  version.

### `check_rate_limit(request, key, limit, window_seconds=3600)`

- Uses the request's client IP and a named action key to choose a Redis counter.
- Increments the counter for each request.
- On the first request, sets the counter's expiration to the window length.
- Returns whether the request remains within the allowed count.
- If Redis is unavailable or errors, it allows the operation to continue.
- Although some comments describe a sliding window, this implementation is a
  fixed-expiry counter whose time window starts with the first counted request.

### `assert_token_version(payload)`

- Reads the user's subject (`sub`) from the token claims.
- If the subject is missing, raises HTTP 401.
- Gets the current token version from Redis.
- If the token's version is older than the current value, raises HTTP 401 because
  the token has been invalidated.

### `get_current_user(credentials)`

- FastAPI provides a bearer token through `credentials`.
- Verifies that it is a valid access token.
- Checks its token version and looks for a Redis blacklist entry.
- Loads the account from the database using the token's user ID.
- Returns the user record or raises an HTTP error if validation fails or the user
  is missing.
- There is a noteworthy broad exception-handling issue in the blacklist check:
  the code raises an HTTP exception for a blacklisted token inside a `try`, but a
  broad `except Exception` may catch that deliberate rejection and allow later
  checks to continue. This is current behavior, not an intended security rule.

### `register(user_data, request, background_tasks)` — `POST /register`

- Applies a registration rate limit based on the request.
- Checks whether the email is already in use.
- Hashes the password and creates the user record.
- Creates the user's free plan and usage quota.
- Builds token claims, then creates access and refresh tokens.
- Schedules welcome/verification event work using background tasks.
- Returns token/profile data and stores the refresh token in an HttpOnly cookie.
- In the database implementation, the user creation method sets
  `email_verified=true` even though this route also schedules a verification code.

### `login(user_data, request, background_tasks)` — `POST /login`

- Applies the login request limit.
- Checks if the account is currently locked.
- Looks up the account and checks the submitted password against its hash.
- On a password failure, increments the failed-login counter; after the configured
  threshold, locks the account for the configured time.
- On success, resets failed-login counters and requests GeoIP risk information.
- Records login location/risk history and schedules a security-alert log for
  higher-risk logins.
- If MFA is enabled, creates a short-lived challenge token and stores it in Redis
  when Redis is available.
- Without MFA, creates access and refresh tokens, returns them, and sets a refresh
  cookie. The response can include a risk indicator.
- The route's comments say it checks email verification, but the inspected login
  flow does not perform that check.

### `refresh_token(...)` — `POST /refresh`

- Reads the refresh token from the cookie, with a request-body fallback.
- Decodes it and requires its type to be `"refresh"`.
- Checks token version and blacklist status.
- Loads the user and issues a new access/refresh token pair.
- Sets a replacement refresh cookie and attempts to blacklist the old token.
- The blacklist exception-handling caveat described for `get_current_user` also
  applies here: a deliberate exception raised inside a broad `try` may be caught.

### `logout(credentials)` — `POST /logout`

- Reads the presented bearer token.
- Attempts to add a blacklist entry to Redis that lasts until token expiry.
- Returns a success response even if Redis is unavailable or the blacklist write
  fails, so successful output does not necessarily prove revocation occurred.

### `logout_all(credentials, current_user)` — `POST /logout-all`

- Requires a valid current user.
- Attempts to blacklist the current token.
- Increments the user's token-version value so older tokens can be rejected.
- Gives the version key a finite expiry.
- Redis-related errors are caught, so the response may still succeed if invalidation
  did not complete.

### `generate_impersonate_token(...)` — `POST /impersonate-token`

- Receives a target user ID and administrator profile/credential data.
- Determines admin status using email rules in the current code (an exact
  bootstrap address or a `@devmeet.com` suffix), rather than reading a dedicated
  database role.
- Rejects non-admin callers, self-impersonation, missing targets, and target
  accounts whose email looks administrative.
- Logs the impersonation attempt.
- Creates tokens for the target user and returns the access token, with refresh
  token handling through a cookie/response.
- The email-based role rule means any matching email address is treated as admin
  by this logic.

### `get_current_user_profile(current_user)` — `GET /me`

- Receives the authenticated user through `get_current_user`.
- Returns profile fields such as ID, email, display name, avatar, bio, and creation
  time.
- Derives the role using the email-based admin rule.

### `verify_admin(credentials)` — `GET /verify-admin`

- Reads the bearer token and verifies that it is an access token.
- Checks the token version and finds the user.
- Applies the service's email-based admin rule.
- Returns an authorization response and headers containing user ID and role for
  the API Gateway's admin subrequest.

### `change_password(password_data, current_user)` — `POST /change-password`

- Requires the current authenticated user.
- Verifies the current password.
- Rejects a new password if it matches the existing password.
- Hashes and stores the new password.
- Attempts to increment the user's token version in Redis so old sessions can be
  invalidated.

### `reset_password_request(...)` — `POST /reset-password-request`

- Applies a limit to reset requests from one IP address.
- Returns a general response whether or not an account exists, helping avoid
  exposing which emails are registered.
- For an existing user, creates a random reset token and stores it with an expiry.
- Builds the frontend reset URL and schedules an email-event log.
- In the inspected implementation, logging the event is not the same as sending a
  real email.

### `reset_password_confirm(confirm_data)` — `POST /reset-password-confirm`

- Looks up the supplied reset token.
- Rejects missing, already-used, or expired tokens.
- Hashes and saves the new password.
- Marks the reset token as used and clears failed-login state.
- Unlike `change_password`, this route does not increment the token-version value
  in the inspected code, so existing tokens may remain usable until another
  invalidation/expiry mechanism rejects them.

### `verify_email_request(...)` — `POST /verify-email/request`

- Requires an authenticated user.
- Checks a Redis resend cooldown.
- Creates a six-digit code, stores it with an expiry, and sets the cooldown.
- Schedules a verification event.

### `verify_email_confirm(token, current_user)` — `POST /verify-email/confirm`

- Requires an authenticated user.
- If Redis is available, compares the submitted code with the stored code and
  deletes it after successful use.
- Marks the account as email-verified in the database.
- In the current code, when Redis is unavailable the route can proceed to mark
  the email verified without a successful code comparison.

### MFA enrollment: `mfa_enable(current_user)`

- Requires an authenticated user and TOTP support.
- Creates a secret and a provisioning URI that an authenticator app can use.
- Stores the pending secret temporarily in Redis when Redis is available.
- Returns the secret/URI so the user can configure the authenticator app.

### MFA enrollment: first `mfa_verify(totp_code, current_user)`

- Reads the pending TOTP secret from Redis.
- Checks the submitted code with a small time tolerance.
- Saves the secret and enables MFA in the database when valid.
- Deletes the temporary Redis secret after success.

### MFA removal: first `mfa_disable(totp_code, current_user)`

- Loads the current user's MFA secret.
- Checks the supplied TOTP code.
- Disables MFA only when the code is valid.

### `mfa_backup_codes(current_user)`

- Requires MFA to be enabled.
- Generates a set of one-time recovery codes.
- Hashes the codes before saving them in the database.
- Returns the plain versions so the user can save them; they should be displayed
  only once.

### `mfa_use_backup_code(backup_code, current_user)`

- Hashes the submitted backup code.
- Asks the database to find and consume that hash.
- Rejects a code that is absent or already used.

### `_issue_auth_tokens(user)`

- Creates an access token and refresh token for a user.
- Builds a JSON response containing token information.
- Sets the refresh token in an HttpOnly cookie.
- Cookie security options vary according to whether the service is in production.

### `mfa_login_verify(body)` — `POST /mfa/login-verify`

- Receives the temporary MFA challenge and either a TOTP code or backup code.
- Checks the challenge in Redis and looks up the user.
- Verifies the TOTP code or consumes a one-time backup code.
- Deletes the challenge after successful verification.
- Issues normal authentication tokens on success.
- A failed challenge generally remains in Redis until its expiration.

### Duplicate MFA endpoints and helpers

- Later in `routes.py`, the file defines another `mfa_verify`, `mfa_disable`,
  `mfa_backup_codes`, `mfa_use_backup_code`, `_issue_auth_tokens`, and
  `mfa_login_verify`.
- These repeat the same endpoint paths and substantially similar logic.
- FastAPI registers routes when decorators run; redefining a Python function name
  later does not remove the earlier route registration. Duplicate endpoint paths
  can therefore make the active behavior depend on registration order.
- This guide documents both groups as duplicate definitions; they are not one
  combined implementation.

## 4. `app/database.py` — persistent authentication data

### Imports and `Database`

- `asyncpg` supplies asynchronous PostgreSQL connections.
- `uuid` converts string identifiers to UUID values for database queries.
- `json` encodes/decodes MFA backup codes and login-location information.
- `Database` groups connection-pool lifecycle and SQL operations.
- `db = Database()` creates the shared object used by routes.

### `Database.__init__()`

- Starts with the connection pool set to `None`.

### `connect()`

- Reads PostgreSQL connection settings and pool limits from environment variables.
- Creates an async connection pool.
- Raises/propagates connection failures according to the database method's
  implementation; this class does not define an in-memory user database.

### `disconnect()`

- Closes the pool if one has been created.

### `get_user_by_email(email)`

- Lowercases the incoming email and searches for a matching account.
- Returns selected profile, password, and MFA fields or `None`.
- The SQL compares the stored email directly to the lowercased input. It does not
  lowercase the database column in the query.

### `get_user_by_id(user_id)`

- Converts the text ID to a UUID.
- Fetches profile and authentication fields for that user.
- Returns the data as a dictionary or `None`.
- A broad exception handler prints an error and returns `None`, so callers may not
  be able to distinguish a database error from a user that does not exist.

### `create_user(email, password_hash, display_name)`

- Inserts a new profile using a lowercased email.
- Stores the already-hashed password, not the plaintext password.
- Returns the new user's basic profile data.
- The current SQL sets `email_verified` to true when creating the account.

### `create_user_plan(user_id)`

- Adds the user's initial `"free"` subscription plan.

### `create_usage_quota(user_id)`

- Creates usage counters initialized to zero.
- Sets the quota reset date to the current date.

### `update_password(user_id, new_password_hash)`

- Updates the stored password hash and account's update timestamp.

### `increment_failed_login_attempts(email)`

- Stores a first failed attempt or increments an existing count with an UPSERT.
- Lowercases the email used as the counter key.

### `get_failed_login_attempts(email)`

- Returns the number of failed attempts and related lock/last-attempt timestamps.
- Returns zero attempts and `None` timestamps when no row exists.

### `reset_failed_login_attempts(email)`

- Sets the failure count to zero and clears its lock timestamp.

### `lock_account(email, lock_duration_minutes=30)`

- Sets `locked_until` to database time plus the requested number of minutes.

### `is_account_locked(email)`

- Reads the lock expiry and compares it with PostgreSQL's current time.
- Returns whether the account has an active lock.

### Password reset methods

#### `store_password_reset_token(user_id, token, expires_in_minutes=30)`

- Inserts a reset token and calculates its expiration in the database.
- Stores the supplied token value as-is; it does not hash it in this method.

#### `get_password_reset_token(token)`

- Looks up the token and joins the account email.
- Returns token owner, expiry, used state, and email, or `None`.

#### `mark_password_reset_token_used(token)`

- Marks the matching reset record as used.

#### `cleanup_expired_tokens()`

- Deletes expired or already-used reset records.
- Defining this helper does not schedule it; another caller must invoke it.

### Email and MFA database methods

#### `mark_email_verified(user_id)`

- Converts the ID to UUID and sets the verification flag to true.
- The current method catches and prints errors without reporting success/failure
  to its caller.

#### `enable_mfa(user_id, totp_secret)`

- Stores a TOTP secret and enables MFA for the account.
- The current method catches and prints database errors.

#### `disable_mfa(user_id)`

- Clears the TOTP secret and disables MFA.
- The current method catches and prints errors.

#### `store_backup_codes(user_id, hashed_codes)`

- JSON-encodes and stores the supplied backup-code hashes.
- The current method catches and prints errors.

#### `consume_backup_code(user_id, hashed_code)`

- Reads the account's stored code list.
- Finds the matching hash, removes one occurrence, and saves the updated list.
- Returns true when a code is consumed and false for missing codes/errors.
- Reading and updating are separate operations, not one atomic transaction.

### Login-history methods

#### `record_login_history(...)`

- Converts the user ID to UUID.
- Inserts IP address, location JSON, risk score/level, and user-agent details.
- Database errors are caught and printed.

#### `get_recent_login_history(user_id, limit=10)`

- Fetches the newest login records for one user.
- Decodes stored location JSON and returns a list of dictionaries.
- On error, returns an empty list.

#### `cleanup_old_login_history(days_to_keep=90)`

- Deletes login-history rows older than the configured retention period.
- Errors are caught and printed.

### Database error behavior

- Many methods catch database exceptions and return `None`, `False`, an empty
  list, or no explicit status.
- This can make a failed database operation look like a normal "not found" or
  "nothing happened" result to route code.
- Query values are passed using PostgreSQL placeholders rather than concatenated
  into SQL text.

## 5. `app/geoip_service.py` — approximate location and login risk

### Imports and `GeoIPService`

- The module uses environment settings, logging, IP address parsing, math, and
  MaxMind's GeoIP database reader.
- `GeoIPService` loads a local GeoLite2 City database if one exists.
- `geoip_service` is a shared instance created when this module is imported.

### `GeoIPService.__init__()`

- Reads the database file path from `GEOIP_DB_PATH`.
- Uses a standard GeoLite2 path by default.
- Calls `_load_database()` to prepare the reader.

### `_load_database()`

- Checks/opens the configured MaxMind database file.
- If it is missing or cannot be opened, logs the issue and leaves lookups
  unavailable rather than stopping the whole service.

### `get_ip_location(ip_address)`

- Uses the GeoIP reader to look up a public IP address.
- Returns location details such as country, city, subdivision, coordinates, and
  EU status.
- Returns `None` when there is no reader, the address is not found, or lookup
  fails.

### `is_suspicious_location(current_location, previous_location, time_diff_hours)`

- Returns false if either location is missing.
- Treats a country change as suspicious.
- For the same country, checks whether distance and time imply unusually rapid
  travel; the current threshold is 500 km in under 24 hours.
- Uses the Haversine formula to estimate distance between coordinates.
- The implementation can treat a coordinate equal to zero as missing, even
  though zero is a valid latitude/longitude value.
- Any country change is marked suspicious, not only a country change within a
  short time.

### `get_risk_score(ip_address, user_id, recent_history)`

- Attempts to look up the current IP location.
- Starts the risk score at zero.
- Adds risk points and a reason when the location is unknown.
- Compares a known location to the newest history record and adds risk for
  suspicious travel.
- Converts the score into low/medium/high labels using the configured thresholds.
- Returns the score, label, reasons, and location information.

## 6. `app/models.py` — validated request/response schemas

Pydantic models describe the expected JSON fields. Invalid values can be rejected
before a route handler runs.

### `UserRegister`

- Requires a valid email, a password within the configured length range, and a
  display name within its allowed length.
- Its password validator requires uppercase, lowercase, a digit, and an allowed
  special character.
- Its display-name validator trims whitespace and rejects values containing HTML
  tags.
- A docstring says tags are stripped/sanitized, but the implementation rejects
  names containing them instead.

### `UserLogin`

- Holds the email and password fields submitted for login.

### `ChangePassword`

- Holds the current and new passwords.
- Applies the new-password length and complexity requirements.

### `ResetPasswordRequest`

- Holds the email address for requesting a password reset.

### `ResetPasswordConfirm`

- Holds the reset token and replacement password.
- Applies the password complexity checks to the replacement password.

### `TokenResponse`

- Describes access token, optional refresh token, bearer token type, and expiry
  information returned by token-issuing routes.

### `MfaLoginChallengeResponse`

- Describes an MFA-required response, the temporary challenge token, and its
  default expiry duration.

### `MfaLoginVerify`

- Holds the MFA challenge token and optional TOTP or backup-code fields.

### `TokenRefresh`

- Describes a refresh token supplied in a JSON request body.

### `UserProfile`

- Describes public account information returned to clients, such as ID, email,
  display name, avatar, bio, role, and creation time.

## 7. `app/middleware.py` — request tracing

### Imports and logger

- `uuid` creates a new request ID when needed.
- `logging` records request information.
- `time` measures duration.
- FastAPI/Starlette types describe the request, response, and next handler.
- A named logger writes the request trace messages.

### `RequestIDMiddleware`

- Middleware wraps each HTTP request before and after its endpoint.

#### `dispatch(request, call_next)`

- Reads `X-Request-ID` from the incoming request or creates a UUID.
- Stores it in `request.state.request_id`.
- Records the start time and awaits the next route/middleware.
- Adds the same ID to the outgoing response header.
- Logs request ID, HTTP method, path, status, and elapsed milliseconds.
- Returns the response to the client.

## 8. `app/test_auth.py` — automated tests

The test file uses mocks and FastAPI's test client so it can check routes without
using a live PostgreSQL server or real authentication provider.

### Test setup and `client` fixture

- Inserts mock modules for optional/external dependencies before importing the app.
- `client` creates mock asynchronous database methods and sets predictable return
  values.
- It patches the app's database references to use the mock.
- It constructs a FastAPI `TestClient` and yields it, with the mock database, to
  each test.

### Health test

- `test_health_check` checks that `/health` returns HTTP 200 and the expected
  service fields.

### Registration tests

- `test_register_success` checks successful account creation and response fields.
- `test_register_duplicate_email` checks the duplicate-account response.
- Weak-password tests check missing uppercase, insufficient length, or missing
  special characters.
- `test_register_xss_in_display_name` checks that HTML-like names are rejected.
- `test_register_invalid_email` checks email validation.

### Login tests

- `test_login_success` checks a valid login and token response.
- `test_login_wrong_password` checks incorrect credentials.
- `test_login_nonexistent_user` checks an email that is not registered.
- `test_login_account_locked` checks lockout behavior.
- `test_login_unverified_email` checks the expected verification behavior, but its
  assertion accepts either HTTP 200 or 403, so it does not prove one consistent
  policy.

### Refresh/protected-route tests

- `test_refresh_no_token` checks that a refresh request without a token is
  rejected.
- `test_me_no_auth` checks that `/me` rejects an unauthenticated request.
- `test_logout_no_auth` checks that logout rejects a request without credentials.

### Password reset tests

- Request tests check both unknown and existing emails and verify that the API
  does not disclose reset tokens in the response.
- Confirmation tests check invalid, expired, and already-used tokens.

### Password model validation tests

- `test_password_validation_no_digit` checks that a password without a digit is
  rejected.
- `test_password_validation_valid` checks a valid registration payload.

### Limits of the tests

- Mocked database methods mean a passing test does not prove the real SQL works
  against the deployed schema.
- The test called “unverified email” accepts multiple outcomes, so it does not
  define a strict contract for that case.

## 9. `seed_admin.py` — bootstrap admin account

### Imports and `main()`

- Imports asynchronous PostgreSQL access and reads connection settings from the
  environment.
- `main()` connects to the configured database.
- It checks whether the bootstrap administrator account already exists.
- If the account exists, it updates its administrative/bootstrap details.
- If it does not exist, it inserts the account and creates or updates its
  Enterprise plan.
- It closes the database connection when its work finishes.

### Script entry point

- The `if __name__ == "__main__"` block runs the asynchronous `main()` function
  when this script is invoked directly.

### Important credential note

- The script contains a hard-coded bootstrap password. It should not be treated
  as a production secret or reused as a shared credential.

## 10. `Dockerfile` — service container

Each non-empty instruction is used when building or running the Docker image:

1. `FROM python:3.11-slim` starts from a smaller Python 3.11 Linux image.
2. `WORKDIR /app` sets the working directory inside the container.
3. `COPY requirements.txt .` copies the dependency list into that directory.
4. `RUN pip install ...` installs those packages without retaining pip's download
   cache.
5. `COPY . .` copies the Auth Service files into the image.
6. `EXPOSE 8001` documents the port used by the service.
7. `CMD [...]` starts Uvicorn and serves `app.main:app` on port 8001.
- This Dockerfile does not itself download or copy a GeoIP database file.

## 11. `requirements.txt` — installed libraries

Each line names a Python package and usually pins its version:

- `fastapi` creates API routes and handles HTTP requests.
- `uvicorn[standard]` runs the ASGI application.
- `pydantic[email]` validates typed data and adds email support.
- `pydantic-settings` supports typed environment/settings configuration.
- `email-validator` checks email syntax.
- `python-jose[cryptography]` provides JWT/JWS features.
- `passlib[bcrypt]` provides password-hashing helpers.
- `python-multipart` supports form/file upload parsing.
- `asyncpg` connects asynchronously to PostgreSQL.
- `redis` is the Redis client library.
- `bcrypt` calculates and verifies password hashes.
- `PyJWT` creates and validates JWT tokens used by `auth.py`.
- `python-dotenv` can load environment variables from a `.env` file.
- `pyotp` creates and checks time-based one-time passwords for MFA.
- `qrcode[pil]` creates QR codes for authenticator setup.
- `httpx` makes asynchronous HTTP requests.
- `geoip2` and `maxminddb` read MaxMind GeoIP databases.
- `authlib` provides authentication/security protocol helpers.
- `starlette` supplies the ASGI foundation under FastAPI.
- `itsdangerous` provides signed-data utilities.

## 12. `README.md` — overview of the service

The README describes the intended login/token lifecycle, password rules, RBAC,
MFA, GeoIP, endpoints, and a test command. It is an architectural overview;
implementation details above describe what the source currently does.

## Current-code notes worth knowing

- Login code does not enforce email verification, although comments/documentation
  describe such a check.
- New database accounts are created with `email_verified=true` even though a
  verification code is also scheduled.
- Email-related helper code logs event details rather than actually sending
  email. OTPs/reset information can therefore appear in application logs.
- Redis outages often cause rate limiting or token-version checks to fail open.
- Email verification can be marked complete when Redis is unavailable because a
  code cannot be checked in that case.
- Password reset confirmation does not increment the token version in the
  inspected implementation; changing a password does attempt to do so.
- Token responses differ: registration puts the refresh token in a cookie, while
  other routes may include it in the JSON response as well.
- Admin/impersonation role decisions are based on email patterns in this code,
  rather than a centrally queried role value.
- The MFA routes and some helper functions are defined twice in `routes.py`.
- Several database update helpers catch and print failures instead of reporting
  a failure value; a caller may not know a change did not persist.

## Useful words

| Word | Easy meaning |
|---|---|
| Authentication | Checking who a caller is. |
| Authorization | Checking what an authenticated caller is allowed to do. |
| Access token | Short-lived signed credential sent with normal API calls. |
| Refresh token | Longer-lived credential used to request new login tokens. |
| JWT | A signed text token containing claims such as user ID and expiry. |
| Hash | A one-way result used to verify a password without storing the password itself. |
| MFA/TOTP | A second login check using a time-based code from an authenticator app. |
| Redis | A fast data store used here for temporary counters, codes, and token state. |
| GeoIP | An estimate of geographic location based on an IP address. |
| HttpOnly cookie | A browser cookie that normal page JavaScript cannot read. |
