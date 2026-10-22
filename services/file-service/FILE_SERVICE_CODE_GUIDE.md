# File Service: Easy-English Code Guide

This guide explains the File Service files and functions in plain English. It
describes what the current code does and notes when comments or README claims
do not exactly match the implementation.

## What this service does

The File Service stores uploaded files and provides endpoints to check,
download, list, and delete them. It uses AWS S3 when configured with the
required credentials and bucket. Otherwise it saves files in a local
`uploads` directory.

The service listens on port `8011`. Its main request flow is:

1. FastAPI receives an upload request.
2. The route checks basic request data such as file size and MIME type.
3. The storage manager creates a unique key and writes to S3 or local disk.
4. The route returns a key, URL, and file metadata.

## Files in this service

### `app/main.py` — create the web application

- The opening text describes the service's intended responsibilities.
- `os` reads environment variables; `Path` handles filesystem paths.
- FastAPI and `StaticFiles` create the API and serve local files.
- `CORSMiddleware` configures browser cross-origin access.
- The local imports bring in the file router and request-ID middleware.
- `app = FastAPI(...)` creates the application and gives it a title and
  version.
- `app.add_middleware(CORSMiddleware, ...)` allows requests from the origin
  in `FRONTEND_URL`; if it is not set, the default is
  `http://localhost:3000`. Credentials, methods, and headers are allowed.
- `app.add_middleware(RequestIDMiddleware)` enables request ID and timing
  logs.
- `UPLOAD_DIR = Path("uploads")` names the local storage directory.
- `UPLOAD_DIR.mkdir(...)` creates that directory and any missing parent
  directories.
- `app.mount("/uploads", ...)` serves files in that local directory at URLs
  beginning with `/uploads`.
- `app.include_router(router)` adds the file API endpoints.
- `health_check()` handles `GET /health`. It returns a healthy status,
  service name, and a storage mode chosen by checking whether
  `AWS_ACCESS_KEY_ID` exists. This is a simple environment check; it does
  not verify that S3 is reachable or configured with a bucket.
- `read_root()` handles `GET /` and returns a service-identification message.

### `app/middleware.py` — add request IDs and timing logs

- `uuid`, `logging`, and `time` support request ID generation, log writing,
  and timing.
- The FastAPI and Starlette imports provide request, response, and middleware
  types.
- `logger` creates the named `request_id` logger.
- `RequestIDMiddleware` wraps each request that enters the app.
- `dispatch(request, call_next)`:
  1. Reuses the incoming `X-Request-ID` header or creates a UUID if it is
     missing or empty.
  2. Saves the ID on `request.state.request_id`.
  3. Records a start time using `time.time()`.
  4. Calls the next middleware or endpoint and waits for its response.
  5. Adds the request ID to the response header.
  6. Calculates elapsed milliseconds and logs the ID, method, path, status,
     and duration.
  7. Returns the response.

The module description says it uses a monotonic timer, but the implementation
uses `time.time()`, which is a wall-clock timer.

### `app/routes.py` — handle file API requests

#### Imports and configuration

- FastAPI imports provide route creation, upload/form/query parsing, errors,
  and access to the raw request.
- `FileResponse` and `StreamingResponse` are response helpers. The current
  route implementations use `StreamingResponse`; `FileResponse` is imported
  but not used.
- The type and datetime imports support optional arguments and timestamps.
- `os` and `io` support local file paths and byte streams. The displayed
  `io` import is not used by the routes.
- `storage` is the shared storage manager.
- `router = APIRouter(...)` puts these routes under
  `/api/v1/files`.
- `ALLOWED_CONTENT_TYPES` lists MIME types accepted by the multipart upload
  route, including common images, PDFs, text, JSON, archives, audio, video,
  and generic binary data.
- `MAX_FILE_SIZE_BYTES` sets the multipart route's maximum file size to
  50 MiB.

#### `upload_file(file, purpose, folder)` — `POST /api/v1/files/upload`

1. Reads the uploaded file bytes into memory.
2. Returns HTTP 400 if the file is empty.
3. Returns HTTP 413 if it is larger than 50 MiB.
4. Uses the supplied MIME type, or `application/octet-stream` if absent.
5. Returns HTTP 415 if that MIME type is not in the allow-list.
6. Calls `storage.upload_file()` with the bytes, name, MIME type, and folder.
7. Returns the storage URL and key, filename, size, MIME type, purpose,
   selected backend, and creation timestamp.
8. If storage raises an exception, returns HTTP 500 with an upload error.

The route checks the declared MIME type. It does not inspect the file's
contents or verify its actual file signature.

#### `upload_bytes(request, filename, content_type, folder)` —
`POST /api/v1/files/upload-bytes`

This endpoint accepts a raw HTTP request body rather than multipart form data.
It reads the whole body into memory, rejects an empty body with HTTP 400, and
passes the bytes and query-string metadata to the storage manager. It returns
the resulting key, URL, filename, byte count, MIME type, and backend.
Storage exceptions become HTTP 500.

This route does not apply the multipart route's 50 MiB limit or MIME allow
list in the code shown here.

#### `get_presigned_url(key, expires_in)` —
`GET /api/v1/files/presign/{key}`

1. Checks whether the storage manager can find the key.
2. Returns HTTP 404 if it cannot.
3. Requests a URL from the storage manager.
4. Returns the URL, key, requested expiry in seconds, and calculated
   expiration timestamp.

The query value defaults to 604,800 seconds (seven days) and FastAPI requires
it to be between 60 seconds and seven days. In local mode, the storage manager
returns a service download URL rather than an AWS-signed URL.

#### `download_file(key)` — `GET /api/v1/files/download/{key}`

- In S3 mode, the route raises HTTP 302 and puts a presign endpoint in the
  `Location` header. The request does not directly stream S3 bytes.
- In local mode, it joins the storage directory and key, then returns HTTP
  404 if the resulting path does not exist.
- The nested `iterfile()` function opens the file and yields 65,536-byte
  chunks, so a large local file is streamed in pieces.
- The route chooses a response MIME type for `.pdf`, `.png`, and `.json`;
  other extensions use `application/octet-stream`.
- It returns a `StreamingResponse` with an attachment filename header.

#### `file_info(key)` — `GET /api/v1/files/info/{key}`

Checks whether a key exists. If not, it returns HTTP 404. If it exists, it
calls `storage.get_file_info()` and returns the resulting metadata.

#### `delete_file(key)` — `DELETE /api/v1/files/{key}`

Checks that the key exists, then calls the storage manager to delete it.
Missing files return HTTP 404; a reported delete failure returns HTTP 500.
Success returns `{"deleted": true, "key": ...}`.

#### `list_files(folder, limit)` — `GET /api/v1/files/list`

Calls the storage manager's local-file listing helper and returns the results,
the number of returned entries, and the configured backend name. The limit
defaults to 50 and must be between 1 and 200.

The route documentation says this lists local files, and the storage helper
returns an empty list when S3 is active.

### `app/storage.py` — store and inspect file objects

#### Configuration and S3 setup

- `os`, `uuid`, `aiofiles`, datetime/path, and typing imports provide
  environment settings, unique names, asynchronous local writes, dates,
  filesystem paths, and type hints.
- `LOCAL_DIR` reads the local directory from `LOCAL_UPLOAD_DIR`, defaulting
  to `uploads`.
- `BASE_URL` reads the URL used to create local download links, defaulting
  to `http://localhost:8011`.
- `S3_BUCKET`, `AWS_KEY`, `AWS_SECRET`, and `AWS_REGION` read the S3
  configuration.
- `_use_s3` becomes true only when an access key, secret key, and bucket name
  are all present.
- `_s3_client` starts empty. If S3 configuration is complete, the code tries
  to create a boto3 S3 client. If creation fails, it logs the problem and
  switches to local mode.

#### `StorageManager`

- `StorageManager.__init__()` copies the selected backend setting into the
  instance, saves the local path, and creates the local storage directory.
- `_make_key(filename, folder="uploads")` replaces spaces and forward
  slashes in the filename with underscores, adds a random UUID prefix, and
  returns a key under the requested folder.
- `upload_file(content, filename, content_type, folder="uploads")`:
  1. Creates a unique key with `_make_key()`.
  2. If S3 is enabled and a client exists, uploads the bytes to S3 and builds
     a direct S3 URL.
  3. Otherwise it creates the local parent directory, writes the bytes
     asynchronously, and builds a service download URL.
  4. Returns URL, key, original filename, size, MIME type, and backend name.
- `get_presigned_url(key, expires_in=3600)` asks S3 for a signed
  `get_object` URL when S3 is active. In local mode, it returns the File
  Service's download URL.
- `file_exists(key)` checks S3 metadata or the local path. Any exception is
  treated as “does not exist,” so it returns `False`.
- `delete_file(key)` deletes an S3 object or removes the local file if it
  exists. It returns `True` after the operation or `False` if an exception
  happens.
- `get_file_info(key)` returns metadata for an S3 object or local file.
  S3 metadata includes size, MIME type, last-modified time, and backend.
  Local metadata includes size, a generic MIME type, last-modified time,
  backend, and download URL. Missing files or caught S3 errors return an
  empty dictionary.
- `list_local_files(folder=None, limit=50)`:
  1. Returns an empty list immediately when S3 mode is active.
  2. Chooses the storage root or requested subfolder.
  3. Recursively finds files and sorts them newest-first by modification
     time.
  4. Returns each file's relative key, URL, size, name, and modification
     time until it reaches the limit.
- `storage = StorageManager()` creates the shared storage object at import
  time.

The key helper removes `/` from the filename but does not sanitize the
`folder` argument. The listing/download routes also accept path-like keys.
The current code should not be mistaken for a complete authorization or
path-safety policy.

### `app/__init__.py` — package description

This file contains a description of the File Service package and its main
components. It does not define executable functions or classes.

### `app/test_file.py` — automated endpoint tests

- The initial imports and `sys.modules` entries provide mock versions of
  filesystem and AWS packages before the app is loaded.
- `MOCK_FILE_INFO` and `MOCK_FILE_LIST` are sample metadata used by route
  tests.
- The `client()` fixture creates a mocked storage manager. It configures
  upload, presign, existence, info, delete, and listing return values, patches
  the storage object used by routes, and yields a FastAPI test client and the
  mock.
- `TestHealthAndRoot`:
  - `test_health_check()` checks the service identity and storage mode field.
  - `test_root_endpoint()` checks the root response.
- `TestFileUpload`:
  - `test_upload_file_success()` checks a multipart PDF upload.
  - `test_upload_file_with_purpose()` checks custom purpose and folder form
    fields.
  - `test_upload_no_file()` checks that a missing multipart file is rejected.
  - `test_upload_file_too_large()` is intended to cover oversized uploads,
    but it configures the mock to fail and sends only 1 KiB. Its broad
    accepted-status assertion does not prove the real 50 MiB check.
- `TestFileListing`:
  - `test_list_files()` checks a successful listing response.
  - `test_list_files_with_limit()` checks use of the limit query parameter.
- `TestFileInfo`:
  - `test_get_file_info_exists()` checks metadata for an existing file.
  - `test_get_file_info_not_found()` checks a missing-file response, but
    allows either HTTP 200 or 404.
- `TestPresignedURL`:
  - `test_get_presigned_url()` checks that a successful response has a URL.
  - `test_presigned_url_custom_expiry()` checks a custom expiry value.
- `TestFileDelete`:
  - `test_delete_file()` checks the successful delete route.
  - `test_delete_file_not_found()` checks missing-file handling, but allows
    either HTTP 200 or 404.

Tests patch the storage backend, so they check route behavior rather than
proving real S3 or local disk integrations work.

### `requirements.txt` — Python dependencies

- FastAPI and Uvicorn provide the web framework and server.
- Pydantic, its settings package, and email-validator support model and
  settings validation.
- `python-multipart` parses multipart file uploads.
- `boto3` connects to AWS S3.
- `python-dotenv` can load environment variables from a dotenv file.
- `aiofiles` provides asynchronous file writing in local mode.

### `Dockerfile` — build and start the service container

- `FROM python:3.11-slim` chooses the Python base image.
- `WORKDIR /app` sets the container working directory.
- `COPY requirements.txt .` copies the package list into the image.
- `RUN pip install ...` installs the Python dependencies.
- `COPY . .` copies the service files into the image.
- `EXPOSE 8011` documents the File Service port.
- `CMD [...]` starts Uvicorn with `app.main:app` on all container interfaces
  at port 8011.

### `uploads/` — local storage directory

This directory holds uploaded files when local mode is active. The app mounts
it at `/uploads`; the storage manager may also generate API download URLs.

### `README.md` — overview and run instructions

The README describes the expected storage modes, endpoints, architecture,
and test command. It is documentation rather than executable code. Some
differences from the actual routes are listed below.

## API endpoint summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Identifies the service. |
| `GET` | `/health` | Reports service identity and a simple environment-based storage mode. |
| `POST` | `/api/v1/files/upload` | Validates and stores a multipart file. |
| `POST` | `/api/v1/files/upload-bytes` | Stores the raw request body using filename and folder query parameters. |
| `GET` | `/api/v1/files/presign/{key}` | Checks for a file and returns an S3 signed URL or local download URL. |
| `GET` | `/api/v1/files/download/{key}` | Redirects in S3 mode or streams a local file. |
| `GET` | `/api/v1/files/info/{key}` | Returns file metadata. |
| `DELETE` | `/api/v1/files/{key}` | Deletes a stored file. |
| `GET` | `/api/v1/files/list` | Lists local files, or returns an empty list in S3 mode. |
| `GET` | `/uploads/{file}` | Serves files directly from the local uploads directory. |

## Important implementation notes

- The README describes the presign endpoint as a one-hour default; the route
  currently defaults to seven days, with allowed values from one minute to
  seven days.
- The multipart upload route enforces a 50 MiB limit and MIME allow-list.
  The raw `/upload-bytes` route does not apply those checks in the shown code.
- MIME type validation uses the request's declared content type; it does not
  inspect file signatures.
- The health response checks whether `AWS_ACCESS_KEY_ID` exists. The storage
  manager needs credentials and a bucket name to enable S3, and successful
  client initialization is a separate condition.
- The upload response builds a direct S3 URL, while the presign endpoint
  creates a time-limited URL. Do not assume every returned S3 URL is a
  presigned URL.
- No authentication dependency is declared on these routes. The code shown
  here does not enforce per-user file ownership.
- Caught errors in storage existence checks are reported as “not found,” and
  local listing/deletion behavior should be considered alongside the actual
  storage path and folder values supplied by callers.

## Run the tests

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "E:\AI INTERVIEW\services\file-service"
python -m pytest services\file-service\app\test_file.py -v
```

The tests mock the storage object and third-party packages, so passing tests
do not verify live S3 configuration.
