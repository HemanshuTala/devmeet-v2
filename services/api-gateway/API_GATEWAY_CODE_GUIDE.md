# API Gateway Code Guide (Easy English)

This guide explains the files in `services/api-gateway` in plain English. It
covers what each configuration section and important directive does, how requests
are routed, and what the Docker and README files mean.

Nginx is configured with directives, not Python-style functions. Repeated CORS
and proxy lines are explained once, then the route sections explain what is
different for each destination. Blank lines are only spacing, and `#` comments
are notes for people reading the configuration.

## What the API Gateway does

The gateway is the public front door for the application. It listens on port
8000, receives browser/API requests, and forwards each request to the matching
internal service. It also handles browser CORS preflight requests, adds request
and security headers, limits some request rates, protects admin routes with an
Auth Service check, and sends non-API paths to the frontend.

The gateway's Nginx configuration is [nginx.conf](./nginx.conf).

## Files in this folder

| File | Easy explanation |
|---|---|
| `nginx.conf` | Nginx rules for listening, CORS, rate limits, security headers, and routing. |
| `Dockerfile` | Instructions for building and starting the Nginx container. |
| `README.md` | A written overview of the gateway's intended design and behavior. |

## 1. `nginx.conf` — Nginx setup, line by line by section

### Main process settings (lines 1–5)

- `user nginx;` runs Nginx worker processes as the less-privileged `nginx` user.
- `worker_processes auto;` asks Nginx to choose a suitable number of worker
  processes based on the machine.
- `error_log ... notice;` writes Nginx operational/error messages to the given
  file, using the `notice` log level.
- `pid ...;` tells Nginx where to store its process ID file.
- The empty line is only visual spacing.

### `events` section (lines 7–9)

- `events { ... }` contains connection-processing settings.
- `worker_connections 1024;` allows each worker process to keep up to 1,024
  connections open, subject to operating-system limits.
- The closing brace ends this section.

### `http` section: general settings (roughly lines 11–36)

- `http { ... }` contains settings shared by HTTP servers and routes.
- `include /etc/nginx/mime.types;` loads known file-extension/content-type pairs
  from the standard Nginx file.
- `default_type application/octet-stream;` uses a generic binary content type
  when no more specific type is known.
- `log_format main ...;` defines the fields in the access log: client address,
  authenticated user if any, time, request, status, response size, referring
  page, browser/user-agent, and forwarded-for value.
- `access_log ... main;` writes requests using that format to the given file.
- `sendfile on;` enables the operating system's efficient file-sending feature.
- `keepalive_timeout 65;` keeps an idle client connection open for up to 65
  seconds so it may be reused.
- `limit_req_zone ...` declares shared memory zones used to count requests per
  client IP. These lines define storage and rates; the `limit_req` lines inside
  locations decide which zones are actually applied.
  - `api_general:10m rate=60r/s` reserves 10 MB and defines a rate of 60 requests
    per second for the general zone.
  - `auth_login:10m rate=60r/s` defines the auth zone at 60 requests per second.
  - `code_exec:10m rate=30r/s` defines the code-execution zone at 30 requests per
    second.
  - `ai_interview:10m rate=30r/s` defines the AI-interview zone at 30 requests per
    second.
  - `$binary_remote_addr` is the client IP in a compact form used as the key.
- `client_max_body_size 10m;` limits normal request bodies to 10 MB unless a
  location sets a different limit.
- `proxy_connect_timeout 10s;` waits at most 10 seconds to connect to an upstream
  service.
- `proxy_read_timeout 60s;` waits at most 60 seconds between reads from an
  upstream by default; some locations override it.
- `proxy_send_timeout 30s;` limits how long Nginx waits while sending request data
  to an upstream.
- `resolver 127.0.0.11 valid=30s;` uses Docker's internal DNS resolver and caches
  its answers for up to 30 seconds. This helps Nginx resolve service names on the
  Docker network.

### CORS origin `map` (roughly lines 39–45)

- `map $http_origin $cors_origin { ... }` checks the browser's incoming Origin
  header and sets a value called `$cors_origin`.
- `default "";` means an origin not matching a rule gets an empty value and is not
  echoed as an allowed origin.
- The regular-expression rules allow HTTP or HTTPS origins from:
  - `localhost`, with an optional port.
  - `127.0.0.1`, with an optional port.
  - The specific address `16.192.160.85`, with an optional port.
  - Any subdomain ending in `.trycloudflare.com`, with an optional port.
- When an origin matches, `$http_origin` is returned as the allowed origin.
- This is an allowlist, not an unrestricted `*` origin rule. The CORS response
  headers are repeated in route locations below.

### `server` section and listening port (roughly lines 47–56)

- `server { ... }` defines the virtual server and its request paths.
- `listen 8000;` makes the gateway accept HTTP requests on port 8000.
- `server_name localhost;` gives this server the name `localhost`.
- Four `add_header ... always;` directives add browser security headers to
  responses, including error responses:
  - `X-Content-Type-Options nosniff` tells browsers not to guess a different
    content type.
  - `X-Frame-Options DENY` prevents the site from being displayed inside a frame.
  - `X-XSS-Protection` asks older browsers to enable their legacy XSS filter.
  - `Referrer-Policy strict-origin-when-cross-origin` limits how much referrer
    URL information is sent to another site.
- There is no TLS/HTTPS `listen` configuration in this file; HTTPS termination
  would have to happen elsewhere if required.

### Exact gateway health route (lines 58–62)

- `location = /health` matches only the exact `/health` path.
- `access_log off;` keeps frequent health probes out of the access log.
- `return 200 ...;` responds directly with a small JSON message rather than
  contacting a backend service.
- `add_header Content-Type application/json;` identifies the response as JSON.

### Internal admin-auth route (roughly lines 65–74)

- `location = /auth/verify-admin` matches the exact path.
- `internal;` prevents a browser/client from calling this path directly. Nginx
  may use it internally for an authentication subrequest.
- `set $upstream_verify ...;` stores the Auth Service URL in a variable.
- `proxy_pass $upstream_verify;` sends the internal check to Auth Service.
- `proxy_pass_request_body off;` does not send the original request body to the
  authentication check.
- `proxy_set_header Content-Length "";` removes the request-body length header,
  consistent with not sending a body.
- `X-Original-URI` and `X-Original-Method` tell Auth Service which original
  request is being checked.
- `Authorization $http_authorization` forwards the caller's Authorization
  header so Auth Service can validate the credential.

### Repeated CORS preflight block

Most API locations contain an `if ($request_method = 'OPTIONS')` block:

- `OPTIONS` is the browser's CORS preflight method. The browser asks permission
  before sending some cross-origin requests.
- The block returns HTTP 204 without proxying the request to the backend.
- It echoes the allowed origin from `$cors_origin`.
- It allows credentials and lists allowed methods and headers.
- `Access-Control-Max-Age 1728000` tells the browser it may cache the preflight
  decision for 1,728,000 seconds (20 days).
- `always` asks Nginx to add the header regardless of response status.
- A location may have a slightly different preflight header list; those
  differences are called out below.

For normal non-preflight responses, locations also add allowed-origin,
credentials, methods, and headers. Some locations use `proxy_hide_header` to
remove selected CORS headers from the backend so the gateway's own policy is
used. The CORS headers are duplicated in the configuration rather than included
from one shared snippet.

### Repeated reverse-proxy headers

Most backend locations use these directives:

- `set $upstream_<name> http://<service>:<port>;` saves a Docker service address
  in a variable.
- `proxy_pass $upstream_<name>;` forwards the request to that service. Because no
  replacement path is supplied, the original URI and query string are generally
  passed through.
- `proxy_set_header Host $host;` forwards the requested host.
- `proxy_set_header X-Real-IP $remote_addr;` sends the address Nginx sees as the
  client address.
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` appends the
  client address to the forwarded-for chain.
- `proxy_set_header X-Forwarded-Proto $scheme;` tells the backend whether the
  incoming connection to Nginx used HTTP or HTTPS.
- These headers let the backend understand the original request context while
  Nginx acts as the intermediary.

### Auth Service route — `/api/v1/auth` (roughly lines 81–107)

- For `OPTIONS`, returns 204 with CORS headers, including a preflight cache time
  and a plain-text/zero-length response.
- For normal requests, adds CORS response headers.
- `limit_req zone=auth_login burst=50 nodelay;` applies the auth rate zone. The
  configured zone rate is 60 requests per second; up to 50 excess requests may
  burst immediately without being delayed.
- `proxy_hide_header` removes selected CORS headers from Auth Service responses.
- The upstream is `auth-service:8001`.
- The standard host, client IP, forwarded-for, and protocol headers are sent.

### User Service route — `/api/v1/users` (roughly lines 110–131)

- Handles CORS preflight and regular CORS response headers.
- The preflight block returns 204 and includes the maximum-age header.
- It removes selected backend CORS headers.
- Forwards the path to `user-service:8002` with standard proxy headers.
- No request-rate zone is applied in this location.

### Orchestrator route — `/api/v1/sessions` (roughly lines 134–157)

- Handles CORS preflight, including `Idempotency-Key` in the allowed request
  headers so clients may send that header.
- Removes selected backend CORS headers.
- Forwards to `orchestrator-service:8003`.
- `proxy_read_timeout 30s;` allows up to 30 seconds between upstream reads for
  session creation and related work.

### AI Interviewer route — `/api/v1/interview` (roughly lines 160–186)

- Handles CORS preflight and regular CORS headers.
- `limit_req zone=ai_interview burst=5 nodelay;` applies the AI zone, which is
  configured for 30 requests per second, with an immediate burst of five requests.
- Forwards to `ai-interviewer-service:8004`.
- Standard proxy headers forward host and client/network information.
- `proxy_buffering off;` sends upstream chunks to the client without waiting for
  Nginx to fill a response buffer. This is important for streaming responses.
- `proxy_cache off;` prevents this location's responses from being served from a
  proxy cache.
- `proxy_read_timeout 120s;` allows a longer wait between AI stream data.
- `chunked_transfer_encoding off;` disables Nginx's chunked transfer encoding for
  this proxy response; upstream/HTTP version behavior determines the final
  streaming transport.

### Code Execution route — `/api/v1/execute` (roughly lines 189–213)

- Handles CORS preflight and normal CORS headers.
- `limit_req zone=code_exec burst=5 nodelay;` applies the code-execution zone,
  configured for 30 requests per second with an immediate burst of five.
- `client_max_body_size 1m;` sets a smaller request-body limit of 1 MB for code
  execution.
- Forwards requests to `code-execution-service:8005`.
- `proxy_read_timeout 90s;` gives code execution more time to return a result.

### Video route — `/api/v1/video` (roughly lines 216–240)

- `client_max_body_size 100m;` permits video requests up to 100 MB, overriding
  the general 10 MB limit.
- `proxy_request_buffering off;` sends uploaded request data to the backend as it
  arrives instead of first buffering the full upload at Nginx.
- `proxy_read_timeout 180s;` allows a longer wait for video-related processing.
- Handles CORS preflight and normal response headers.
- Forwards the request to `video-service:8006`.

### Feedback Service route — `/api/v1/feedback` (roughly lines 243–263)

- Handles CORS preflight and normal CORS headers.
- Removes selected CORS headers from the backend response.
- Forwards to `feedback-service:8007`.
- Standard proxy headers preserve host and client-address context.

### Feedback PDF/static upload route — `/uploads/` (roughly lines 267–290)

- Matches paths beginning with `/uploads/`, used for feedback-service PDF files.
- Handles preflight with only `GET`, `HEAD`, and `OPTIONS` allowed.
- Normal responses also list those methods.
- Removes selected backend CORS headers.
- Forwards the request to `feedback-service:8007`, preserving the upload path.
- `proxy_read_timeout 60s;` sets the response-read timeout for this location.

### Analytics route — `/api/v1/analytics` (roughly lines 293–313)

- Handles CORS preflight and regular CORS headers.
- Removes selected CORS headers from the backend response.
- Forwards to `analytics-service:8009`.
- Uses the standard proxy headers.

### Admin Service route — `/api/v1/admin` (roughly lines 317–343)

- Handles CORS preflight first, returning 204 for `OPTIONS`.
- Adds regular CORS headers for other requests.
- `auth_request /auth/verify-admin;` makes an internal subrequest to the protected
  verification location. A failed check prevents the admin request from being
  forwarded.
- `auth_request_set $user_id ...;` captures the user-ID response header from the
  auth subrequest.
- `auth_request_set $user_role ...;` captures the role response header.
- Removes selected backend CORS headers.
- Sends the captured user ID and role to the Admin Service as `X-User-Id` and
  `X-User-Role`.
- Forwards the main request to `admin-service:8010` and sends standard proxy
  headers.
- This gateway check is an extra edge check. Whether the Admin Service also
  performs its own authentication depends on that service's code/configuration.

### File Service route — `/api/v1/files` (roughly lines 346–366)

- Handles CORS preflight and regular CORS headers.
- Removes selected backend CORS headers.
- Forwards requests to `file-service:8011`.
- Uses the standard proxy headers.

### Payment Service route — `/api/v1/payments` (roughly lines 370–390)

- Handles CORS preflight and regular CORS headers.
- Removes selected backend CORS headers.
- Forwards requests to `payment-service:8012`.
- Uses the standard proxy headers.

### Search Service route — `/api/v1/search` (roughly lines 394–414)

- Handles CORS preflight and regular CORS headers.
- Removes selected backend CORS headers.
- Forwards requests to `search-service:8013`.
- Uses the standard proxy headers.

### Frontend fallback route — `/` (roughly lines 418–438)

- `location /` is the catch-all route for paths not matched by a more specific
  location above.
- Handles CORS `OPTIONS` requests and adds origin/credential headers.
- Sets the frontend address to `frontend:3000`.
- Forwards ordinary page requests to the Next.js frontend.
- `proxy_http_version 1.1;` uses HTTP/1.1 for the upstream connection.
- `Upgrade` and `Connection` headers support WebSocket/upgrade requests, which
  frontend development features may need.
- Host, client IP, forwarded-for, and protocol headers preserve request context.

### Closing braces (lines 439–441)

- The closing brace after the root route ends the `server` section.
- The final closing brace ends the `http` section.
- Nginx uses braces to group directives; a missing brace can make the
  configuration invalid.

## 2. Important differences between README and actual configuration

The README explains the intended design, but some of its values do not match the
current `nginx.conf`:

- README says the general limit is 30 requests per second; the configuration
  declares `api_general` as 60 requests per second and does not apply that zone
  to any location shown here.
- README says auth is 5 requests per minute; the configuration declares 60
  requests per second and applies a burst of 50 to the auth route.
- README says code execution is 10 requests per minute; the configuration
  declares 30 requests per second and applies a burst of 5.
- README says AI interview is 20 requests per minute; the configuration declares
  30 requests per second and applies a burst of 5.
- The README's SSE example says to enable chunked transfer encoding, but this
  configuration explicitly sets `chunked_transfer_encoding off` for the AI
  location.
- The README discusses HTTPS/TLS termination as a gateway responsibility, but
  this Nginx server block only listens on port 8000 and contains no TLS listener.

These notes are descriptions of the current files, not recommendations to change
limits or routing behavior.

## 3. `Dockerfile` — build and start the gateway container

Each non-empty line is a Docker instruction:

1. `FROM nginx:alpine` starts with the small Alpine-based official Nginx image.
2. `COPY nginx.conf /etc/nginx/nginx.conf` replaces the container's default
   configuration with this project's configuration.
3. `EXPOSE 8000` documents the port the Nginx service listens on.
4. `CMD ["nginx", "-g", "daemon off;"]` runs Nginx in the foreground. Keeping it
   in the foreground lets Docker track it as the container's main process.

## 4. `README.md` — human-readable overview

The README introduces the gateway, shows a service-routing diagram, summarizes
rate limits, and explains CORS and SSE design. It has no executable functions.
When a value in the README conflicts with `nginx.conf`, the configuration file is
what Nginx actually loads; the differences are listed above.

## Useful terms

| Term | Easy meaning |
|---|---|
| API Gateway | The front door that receives requests and directs them to services. |
| CORS | A browser rule controlling which websites may call an API. |
| Docker service name | A hostname Docker DNS uses to find another container on the network. |
| HTTP preflight | An `OPTIONS` request a browser sends to check cross-origin permissions. |
| Nginx directive | A configuration instruction ending with a semicolon. |
| Reverse proxy | A server that forwards client requests to another server. |
| SSE | Server-Sent Events; a long HTTP response that sends updates progressively. |
| Upstream | The backend service to which Nginx forwards a request. |
| Rate limit zone | Shared counters Nginx uses to limit requests, commonly per client IP. |
