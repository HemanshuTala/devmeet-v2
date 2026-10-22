# Video Service Code Guide (Easy English)

This guide explains the files in `services/video-service`: what the code is for,
what its functions do, and how the important settings affect behavior. It uses
easy English and groups related source lines together rather than repeating every
line of code.

Blank lines are only for spacing. Comments explain code for developers. The
instructions that actually run are the JavaScript statements and configuration
values.

## What the Video Service does

The Video Service is a Node.js/Express API that helps the browser connect to
LiveKit, tracks room information in memory, checks device preflight information,
and stores uploaded recordings.

The service does not carry the live camera and microphone stream itself. The
browser uses a LiveKit token from this API and then connects to LiveKit directly.

## Files in this folder

| File | Purpose |
|---|---|
| `src/index.js` | Starts Express and defines the HTTP endpoints. |
| `src/tokenService.js` | Creates LiveKit tokens or development mock tokens. |
| `src/roomManager.js` | Keeps room and network-quality information in memory. |
| `src/recordingService.js` | Stores recording details, saves files, and serves playback. |
| `test_video.js` | Sends basic smoke-test requests through the API Gateway. |
| `package.json` | Defines npm commands and the direct Node dependencies. |
| `package-lock.json` | Locks exact dependency versions for repeatable installs. |
| `Dockerfile` | Builds and runs the Video Service container. |
| `README.md` | Describes architecture, endpoints, and service behavior. |
| `recordings/` | Local folder used for saved recording files. |

`node_modules/` contains installed third-party packages, not this service's own
source code, so it is not explained package by package here.

## 1. `src/index.js` — Express application and API routes

### Imports and server setup

- `express` creates the HTTP server and provides route/request helpers.
- `cors` adds Cross-Origin Resource Sharing behavior for browser clients.
- The local imports bring in token generation, room state, and recording
  operations from the other source files.
- `app = express()` creates the Express application.
- `PORT` reads the port from the environment and uses `8006` if none is set.
- `app.use(cors())` enables CORS middleware.
- JSON and URL-encoded body parsers convert incoming request bodies into
  JavaScript objects. The configured size limit prevents very large bodies from
  these parsers; recording upload has its own stream handling.

### Health endpoints

- `GET /health` and `GET /api/v1/video/health` return service status, configuration
  flags, and the current in-memory room count.
- The status is a lightweight service check. It does not prove the service can
  connect to LiveKit.

### Root/discovery endpoints

- `GET /` and `GET /api/v1/video` return a small message identifying the service.
- They are useful for checking that the API process responds.

### `POST /api/v1/video/token`

- Reads `room_name`, `participant_identity`, and optional `participant_name`
  from the JSON request.
- Returns HTTP 400 when either required value is missing.
- Gets or creates a local room record and adds the participant identity to its
  participant set.
- Resets the room's inactivity timer.
- Calls `tokenService.generateToken()` and returns the resulting token and
  connection information.
- If an error occurs, logs it and returns HTTP 500 with an error response.

### Room registry endpoints

#### `POST /api/v1/video/room/create`

- Requires `room_name`; missing input returns HTTP 400.
- Accepts an optional session ID.
- Gets or creates the local room, resets its inactivity timer, and returns room
  details and participant count.
- Returns HTTP 500 if creation handling throws an error.

#### `GET /api/v1/video/room/:room_name`

- Looks up the room by the URL path parameter.
- Returns HTTP 404 if the room is unknown.
- Otherwise returns its name, session ID, creation time, and participant IDs.

#### `DELETE /api/v1/video/room/:room_name`

- Calls the room manager to remove the local room and associated state.
- Returns HTTP 404 if there was no such room; otherwise returns confirmation.
- This deletes the service's local entry. It does not itself remove participants
  from a real LiveKit room.

### Network quality endpoints

#### `POST /api/v1/video/room/:room_name/quality`

- Reads participant identity and network metrics from the request.
- Returns HTTP 400 when required room/identity/metrics are missing.
- Saves the sample in the room manager and resets the inactivity timer.
- Returns a success message.

#### `GET /api/v1/video/room/:room_name/quality`

- Reads saved samples for the room and returns HTTP 404 if the room has no samples.
- If `participant_identity` is in the query string, filters samples to that
  participant.
- Calculates averages for packet loss, latency, jitter, and bandwidth.
- Returns up to the newest 20 matching records, plus their count and summary.
- If samples exist for the room but none match the optional participant filter,
  the response can be empty with zero averages rather than 404.

### `POST /api/v1/video/preflight`

- Accepts the browser's reported camera, microphone, permission, and bandwidth
  information.
- A camera or microphone is considered usable only when the device is reported
  available and permission is exactly `"granted"`.
- Adds recommendations when camera or microphone checks fail.
- Converts bandwidth to a number. Missing or invalid bandwidth is treated as zero.
- A positive bandwidth below 1 Mbps is labeled poor; 1 Mbps up to (but not
  including) 2 Mbps is labeled fair; other values remain good.
- Returns device results, connection configuration flags, recommendations, and a
  timestamp.
- The response's `can_proceed_audio_only` field is set from the microphone check.
  Despite its name, the server does not ensure camera is optional or actually
  start an audio-only session.
- Errors return HTTP 500.

### Recording start endpoints

- Supports both a room-specific start URL and a shorter compatibility URL.
- Reads the room name from the path or request body and the user ID from
  `user_id` or `participant_identity`.
- Calls `recordingService.startRecording()`.
- Resets the room inactivity timer and returns recording metadata plus a consent
  acknowledgement.
- Maps a missing/false consent error to HTTP 400.
- Maps an already-recording error to HTTP 409.
- Other errors become HTTP 500.

### Recording stop endpoints

- Supports room-specific and compatibility stop URLs.
- Reads the room and user identity, then calls `recordingService.stopRecording()`.
- Returns the status, start/stop timestamps, storage key, and playback path.
- Returns HTTP 404 when no recording exists; other errors return HTTP 500.

### Recording upload endpoints

- Supports room-specific and compatibility upload URLs.
- Gets the room name from the path or query string; returns HTTP 400 if missing.
- Reads the media type from the request header, defaulting to `video/webm`.
- Gets a filename from `X-Filename`, the query string, or a generated default.
- Passes the incoming request stream and metadata to
  `recordingService.saveRecordingFile()`.
- Returns the saved-file details or HTTP 500 on error.
- Filename and content-type safety are delegated to the recording service. The
  route itself does not fully validate them.

### Recording status endpoints

- Supports room-specific and compatibility status URLs.
- Reads the room name from the path or query string; missing room names return
  HTTP 400.
- If no record is found, responds with `not_started` and `is_recording: false`.
- Otherwise returns the saved metadata, file information, playback URL, and
  consent-related fields.

### Recording playback endpoints

- Several URL aliases call the same `recordingService.streamRecording()` helper.
- The helper returns the recording file and supports HTTP byte ranges, which let
  a browser request just part of a video for seeking or playback.
- The route passes along the room name, request, and response objects.

### Server start

- `app.listen(PORT, ...)` starts the Express HTTP server.
- The callback logs the port, LiveKit/TURN configuration state, and recording
  directory after the server begins listening.

## 2. `src/roomManager.js` — in-memory room state

This module stores active rooms and network-quality samples in JavaScript maps.
These maps are not a database: restarting the service clears them.

### Settings and maps

- `ROOM_INACTIVITY_TIMEOUT` reads an environment variable and defaults to
  1,800,000 milliseconds (30 minutes).
- `roomInactivityTimers` maps each room name to its timer handle.
- `roomLastActivity` maps room names to their last-activity time.
- `activeRooms` maps room names to room records.
- `networkQualityMetrics` maps room names to arrays of network samples.

### `resetInactivityTimer(room_name)`

- Clears an existing timer for the room, if one exists.
- Records the current activity time.
- Starts a new timeout for the configured inactivity duration.
- When the timeout fires, logs the cleanup and deletes the room, its quality
  samples, activity timestamp, and timer entry.
- The timeout value is parsed from configuration but is not checked to ensure it
  is a sensible positive number.

### `getOrCreateRoom(room_name, session_id = null)`

- Looks for an existing room.
- If none exists, creates a record with its name, session ID, creation time, and
  an empty participant `Set`.
- If the room exists without a session ID and a new one is provided, fills it in.
- Returns the room record.

### `getRoom(room_name)`

- Looks up and returns the room record.
- If the room does not exist, the map returns `undefined`.

### `removeRoom(room_name)`

- Clears and removes any inactivity timer.
- Deletes the room activity time and network-quality samples.
- Deletes the room record and returns `true` if it existed, otherwise `false`.

### `recordQualityMetrics(room_name, participant_identity, metrics)`

- Creates an array for the room if it does not have one yet.
- Adds the participant identity, supplied metric object, and current timestamp.
- Keeps at most 100 records by removing the oldest record when the list grows
  beyond that size.
- It can create a metrics list even if no active room record exists.

### `getQualityMetrics(room_name)`

- Returns the metrics array for the room.
- Returns an empty array if there are no saved metrics.

### Exports

- Exports the maps and helper functions so other modules can read/change room and
  quality state.
- Because the maps are directly exported, other modules could mutate them too.

## 3. `src/tokenService.js` — LiveKit and mock tokens

### Configuration

- Reads LiveKit URL, API key, API secret, and TURN settings from environment
  variables when the module loads.
- The TURN-enabled flag is true only when `TURN_ENABLED` equals the exact string
  `"true"`.
- Changing environment variables after import does not update the stored values.

### `generateToken({ room_name, participant_identity, participant_name })`

- If LiveKit API key and secret are available, creates a signed LiveKit
  `AccessToken`.
- Uses the participant identity and the given name; the identity is used as the
  name if no name is provided.
- Grants permission to join the room, publish media, and subscribe to other
  participants.
- Returns the signed token, LiveKit URL, room name, optional TURN details, and
  `mock: false`.
- TURN settings are included only when TURN is enabled and the URL, username,
  and credential are all present.
- If either required LiveKit credential is missing, returns a development mock
  token built from a base64-encoded room/identity payload and a timestamp.
- The mock token is not a signed LiveKit token and cannot be used as a real
  production access token.

### `isConfigured()`

- Returns whether both LiveKit API key and secret are present.

### `isTurnEnabled()`

- Returns whether the TURN flag was exactly enabled during module initialization.

### `isTurnConfigured()`

- Returns whether the TURN URL, username, and credential are all present.
- This helper does not also check the TURN enabled flag.

### Exports

- Exports token creation and the three configuration-check helpers for the
  Express application.

## 4. `src/recordingService.js` — recording metadata and files

### Imports and settings

- Node's `fs` module reads/writes files and streams.
- Node's `path` module safely combines filesystem paths.
- The recordings directory comes from `RECORDINGS_DIR`, or defaults to a
  `recordings` folder beside the service.
- The module creates the directory if it does not exist.
- Optional S3 settings are read from environment variables.
- A `Map` stores recording metadata by room name in process memory.

### `startRecording({ room_name, user_id, consent })`

- Requires a room name.
- Requires `consent === true`; otherwise throws an error marked
  `CONSENT_REQUIRED`.
- Refuses to start a second active recording for the same room and reports
  `ALREADY_RECORDING`.
- Creates and stores a recording record with start time and user identity.
- Uses `"unknown"` when no user ID is supplied.
- This stores metadata; the browser separately creates and uploads the recorded
  media blob.

### `stopRecording({ room_name, user_id })`

- Requires a room name and a recording record.
- Throws `NOT_FOUND` if no record exists.
- If already stopped, returns the existing record.
- Otherwise marks it stopped, records the stop time, and creates a storage key
  based on the room and start time.
- The `user_id` argument is accepted but not used in the current function.

### `saveRecordingFile(room_name, data, originalFilename, mimeType)`

- Requires a room name.
- Sanitizes the room name for use in a local filename.
- Accepts either a Buffer or a readable stream and writes its bytes into the
  recordings directory.
- Throws an error for payload types it cannot save.
- Updates or creates the room's metadata with ready status, file size, MIME type,
  storage key, playback URL, and upload time.
- When it creates a record because none existed, it sets `consent: true`; this
  default does not verify that consent was actually obtained.
- If S3 configuration is complete, starts an S3 upload in the background without
  waiting for it to finish. The local file remains the immediately saved copy.

### `uploadToS3(filePath, s3Key, mimeType)`

- Dynamically loads the AWS S3 SDK.
- Creates an S3 client from the configured credentials/region.
- Uploads the local file to the configured bucket and key.
- Catches and logs errors. A failed optional upload does not cancel the local
  recording or fail the earlier save result.
- The service's dependency list does not include the S3 SDK, so this optional path
  requires the package to be made available separately.

### `getRecordingStatus(room_name)`

- Returns `null` for an empty room name.
- First checks the in-memory metadata map.
- If no record is cached, scans the recording directory for a filename beginning
  with the sanitized room name.
- If a file is found, reads its details, creates a ready metadata record, caches
  it, and returns it.
- Returns `null` if there is no matching file.
- The directory scan uses a prefix match, so similarly named rooms may match the
  same first file unexpectedly.

### `streamRecording(room_name, req, res)`

- Gets the recording metadata and checks that the local file exists.
- Returns HTTP 404 when either is missing.
- If the request contains a `Range` header, calculates a byte interval and
  streams only that section with HTTP 206 Partial Content.
- If the requested starting byte is outside the file, responds with HTTP 416.
- Without a range header, streams the whole file with HTTP 200.
- The current range parsing does not comprehensively validate every malformed
  range or an end position beyond the file length.

### Exports

- Exports start/stop, save/upload, status and playback helpers.
- Also exports the in-memory recording map and the recordings directory path.

## 5. `test_video.js` — manual smoke-test script

### `request(options, body = null)`

- Uses Node's `http` module to send a request to the provided host, port, path,
  method, and headers.
- Collects response chunks and joins them when the response ends.
- Tries to parse the response as JSON.
- If parsing fails, returns the raw response text instead.
- Writes the request body as bytes, as a string, or as JSON depending on its type.
- Rejects the Promise if the HTTP request itself reports a network error.

### `run()`

- Prints a test heading.
- Calls the Gateway's health endpoint.
- Creates a unique room name and asks for a participant token.
- Tries to start recording without consent, expecting a 400 response.
- Starts recording with consent.
- Uploads a small synthetic WebM-like byte string.
- Requests recording status.
- Requests the first 16 bytes of playback and prints the range response details.
- Prints a final success message if requests complete without throwing.

### Error handling and script start

- `run().catch(...)` logs a request/script error and exits Node with status 1.
- The script is an HTTP smoke test, not a full unit-test suite.
- Comments saying “Expect 400” or “Expect 206” are not assertions. Unexpected HTTP
  statuses do not by themselves fail this script; only thrown/network errors do.
- The synthetic bytes do not prove that a browser camera recording or a real
  LiveKit connection works.

## 6. `package.json` and `package-lock.json`

### `package.json`

- `name`, `version`, and `description` identify the npm package.
- `main` points to the application entry module, `src/index.js`.
- `start` runs the server with Node.
- `dev` runs it with Nodemon, which restarts the process after source changes.
- `test` runs `test_video.js`.
- `dependencies` lists runtime libraries: Express, CORS, LiveKit SDK, WebSocket
  support, UUID, JSON Web Token, and dotenv.
- `devDependencies` lists Nodemon for development.

### `package-lock.json`

- Records the exact resolved versions and dependency tree selected by npm.
- It helps make installs consistent across machines and containers.
- It is generated package metadata, not application logic with functions.

## 7. `Dockerfile` — container instructions

Each non-empty instruction tells Docker how to build or start the container:

1. `FROM node:20-alpine` starts from a small Node.js 20 image.
2. `WORKDIR /app` sets the working directory inside the container.
3. `COPY package*.json ./` copies the package manifest and lock file.
4. `RUN npm install` installs the Node dependencies.
5. `COPY . .` copies the service source and other folder contents into the image.
6. `EXPOSE 8006` documents the port used by the service.
7. `CMD ["npm", "start"]` starts the server when the container runs.

## 8. `README.md` — service overview

The README describes the browser-to-Gateway-to-Video-Service flow, direct
browser-to-LiveKit media connection, endpoint list, recording storage, environment
settings, and run/test commands. It is a high-level overview; the sections above
explain the actual functions and their behavior.

## Useful terms

| Term | Easy meaning |
|---|---|
| API route | A URL and HTTP method that handles one kind of request. |
| CORS | A browser rule controlling which websites may call the API. |
| Express | A Node.js library for building HTTP servers and routes. |
| In-memory | Stored in the running program's RAM; lost when it restarts. |
| LiveKit | The separate server used to carry real-time audio/video. |
| Mock token | A development placeholder, not a real signed LiveKit credential. |
| Middleware | Code that runs around incoming HTTP requests. |
| Room | A named meeting/session space for participants. |
| Stream | Data processed progressively rather than loaded all at once. |
| HTTP byte range | A request for part of a file, useful for video seeking. |
| HTTP 206 | Response meaning only part of the requested file is being returned. |
| TURN | A relay service that can help peers connect through restrictive networks. |
