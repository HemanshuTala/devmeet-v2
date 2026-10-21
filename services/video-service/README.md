# Video Service

The Video Service is an Express API on port `8006`. It issues LiveKit room
tokens, evaluates device preflight results, keeps an in-memory room/quality
registry, and accepts browser-recorded video uploads for local playback.

Live audio/video does **not** pass through this Express service. The browser
uses the token returned by this API to connect directly to the LiveKit server
with `livekit-client`.

## Request flow

```text
Browser
  -> API Gateway :8000 (/api/v1/video)
  -> Video Service :8006
       ├─ tokenService.js -> signed LiveKit access token
       ├─ roomManager.js -> in-memory room and quality state
       └─ recordingService.js -> local recording file and playback stream
Browser live media
  -> LiveKit server (direct WebRTC connection; not proxied by this service)
```

## Main endpoints

| Method and path | Purpose |
|---|---|
| `GET /health` or `/api/v1/video/health` | Returns service/configuration flags and in-memory room count. It does not test an actual LiveKit connection. |
| `POST /api/v1/video/token` | Registers a participant in local room state and returns a LiveKit token, or a mock token if LiveKit credentials are absent. |
| `POST /api/v1/video/preflight` | Evaluates browser-reported camera, microphone, and estimated-bandwidth results. |
| `POST /api/v1/video/room/:room_name/quality` | Stores a browser-reported quality sample in memory. |
| `GET /api/v1/video/room/:room_name/quality` | Returns recent samples and simple averages. |
| `POST /api/v1/video/room/:room_name/recording/start` | Starts backend recording metadata after `consent: true`. |
| `POST /api/v1/video/room/:room_name/recording/upload` | Accepts a browser MediaRecorder blob and saves it to the recordings directory. |
| `POST /api/v1/video/room/:room_name/recording/stop` | Marks backend recording metadata stopped. |
| `GET /api/v1/video/room/:room_name/recording/status` | Returns recording metadata or `not_started`. |
| `GET /api/v1/video/room/:room_name/recording/play` | Streams the local file and supports HTTP byte ranges. |
| `POST /api/v1/video/room/create`, `GET /room/:room_name`, `DELETE /room/:room_name` | Create, inspect, or remove local room-registry entries. These do not create/close a LiveKit room or evict its participants. |

## Recording storage in the current Compose setup

The browser's `MediaRecorder` creates a blob from the candidate's local
camera/microphone stream and uploads it to this service. In Docker Compose,
the default storage path `/app/recordings` is mounted to
`services/video-service/recordings` on the host, so the file survives
container recreation while that host folder remains.

Although `recordingService.js` contains an optional S3 upload branch, the
Video Service Compose definition does not supply its S3 settings, and
`@aws-sdk/client-s3` is not listed in this service's dependencies. Treat local
disk as the configured storage path. The code does not implement the
advertised seven-day deletion policy.

## Configuration

- `PORT`: HTTP port; defaults to `8006`.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: used for real signed
  LiveKit tokens. Missing key/secret enables mock-token mode.
- `TURN_ENABLED`, `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`: token
  response can include TURN configuration only when TURN is enabled and these
  values are available.
- `RECORDINGS_DIR`: overrides the default local recordings folder.
- `S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`:
  optional code path for S3 upload; see the caveats above.

## Run the service

From `services/video-service`:

```powershell
npm start
```

Build and start only this Docker Compose service from the repository root:

```powershell
docker compose up --build video-service
```

`npm test` runs `test_video.js`, a manual integration script that calls the
Gateway and uploads synthetic video bytes. It is not a unit-test suite and does
not prove that real camera media was captured or that a browser connected to
LiveKit.
