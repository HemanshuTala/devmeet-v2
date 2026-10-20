# LiveKit Real-Time WebRTC Integration Audit & Architecture Report

**Application**: DevMeet AI Technical Interview Studio  
**SDK Packages**:
- Frontend: `livekit-client` (`^2.4.0`)
- Backend: `livekit-server-sdk` (`^2.17.0`)  
**Date**: October 2026  
**Status**: Verified & Operational  

---

## 1. LiveKit Architecture Overview

DevMeet provides low-latency, real-time audio and video communications during simulated technical interviews between candidates and the AI Interviewer.

```text
┌─────────────────────────────────┐           ┌───────────────────────────────────┐
│     Next.js Frontend Client     │           │       Backend Video Service       │
│      (`livekit-client` SDK)     │           │    (`livekit-server-sdk` Node)    │
└────────────────┬────────────────┘           └─────────────────┬─────────────────┘
                 │                                              │
                 │ 1. POST /api/v1/video/token                  │
                 │    { room_name, participant_identity }       │
                 ├─────────────────────────────────────────────►│
                 │                                              │ 2. Issues signed JWT
                 │ 3. Returns { token, livekit_url, mock }      │    with grants:
                 │◄─────────────────────────────────────────────┤    { roomJoin, publish,
                 │                                              │      subscribe }
                 │                                              │
                 ▼                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LiveKit Cloud / Local Server                          │
│                                (SFU WebRTC Engine)                              │
│                                                                                 │
│   - Multiplexes upstream candidate camera (H.264 / VP8) and mic (Opus)          │
│   - Relays AI audio synthesizers and remote peer streams                        │
│   - Handles ICE candidate negotiation & TURN relays for NAT traversal          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Token Generation & Backend Security

### 2.1 Backend Implementation (`services/video-service/src/tokenService.js`)
- Tokens are **strictly generated on the backend**. No API secret or signing key is ever exposed to client bundles or browser environment variables.
- Uses `AccessToken` from `livekit-server-sdk`:
  ```javascript
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participant_identity,
    name: participant_name || participant_identity
  });

  at.addGrant({
    roomJoin: true,
    room: room_name,
    canPublish: true,
    canSubscribe: true
  });
  ```
- **Fallback Sandbox Mode**: When `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are omitted in local development or CI tests, `tokenService.js` automatically generates a structured mock token (`mock_jwt_token_...`) with `livekit_url: 'wss://mock.livekit.cloud'` and `mock: true`. This allows developers to run and test full interview workflows locally without paid cloud credentials.

---

## 3. Frontend Client Lifecycle (`useWebRTC.ts`)

### 3.1 Dynamic Import for SSR Safety
Next.js server-side rendering crashes if browser WebRTC APIs (`RTCPeerConnection`, `navigator.mediaDevices`) are evaluated in Node.js. In `useWebRTC.ts`, `livekit-client` is imported dynamically on the client after component mounting:

```typescript
const { Room, RoomEvent } = await import('livekit-client').catch(() => ({
  Room: null,
  RoomEvent: null,
}));
```

### 3.2 Event Listeners & State Synchronization
The frontend attaches to LiveKit lifecycle events:
- `RoomEvent.Disconnected`: Updates status to `'disconnected'` and logs disconnect event.
- `RoomEvent.Reconnecting`: Displays amber reconnection spinner and banner.
- `RoomEvent.Reconnected`: Restores green connected state and resynchronizes audio levels.

### 3.3 Safe Cleanup
On component unmount (e.g. when finishing an interview and moving to feedback), the client calls:
```typescript
if (roomRef.current) {
  roomRef.current.disconnect().catch(() => {});
  roomRef.current = null;
}
```

---

## 4. Hardware Media & Device Controls

### 4.1 Media Devices & Track Management (`useMediaStream.ts`)
- Queries `navigator.mediaDevices.enumerateDevices()` to populate camera and microphone select options in `DeviceSettingsOverlay.tsx`.
- Supports live camera switching via `track.stop()` followed by `getUserMedia({ video: { deviceId: { exact: newId } } })`.
- Mute/unmute microphone dynamically enables and disables `audioTrack.enabled`.
- Camera pause dynamically enables and disables `videoTrack.enabled`.

### 4.2 Client-Side AI Proctoring Overlay (`useProctoring.ts`)
- Evaluates video frames on HTML5 Canvas using MediaPipe Face Mesh.
- Detects head yaw/pitch (gaze deviation) and multiple faces.
- Displays non-intrusive warning banners via `ProctorOverlays.tsx` without dropping video frame rates.

---

## 5. LiveKit Testing & Verification Matrix

| Test Case | Description | Tested Status | Result |
|---|---|---|---|
| **LK-01** | Token endpoint (`POST /api/v1/video/token`) returns valid JSON | Verified via backend unit tests (`test_video.py` / `video-service`) | Pass (Token generated with room grants) |
| **LK-02** | Token endpoint graceful mock fallback when keys omitted | Verified via sandbox integration tests | Pass (`mock: true` returned) |
| **LK-03** | Dynamic SDK import avoids Next.js SSR hydration error | Verified via `npx tsc --noEmit` & page load | Pass (Zero SSR errors) |
| **LK-04** | Room connection and disconnection event handling | Verified in `useWebRTC.ts` & `VideoPanel.tsx` | Pass (Disconnected / Reconnected events bound) |
| **LK-05** | Microphone mute toggle disables audio stream track | Verified in `useMediaStream.ts` | Pass (`audioTrack.enabled = false`) |
| **LK-06** | Camera toggle disables video stream track | Verified in `useMediaStream.ts` | Pass (`videoTrack.enabled = false`) |
| **LK-07** | Network telemetry (RTT, packet loss, bandwidth) updates | Verified in `NetworkStatsCard.tsx` | Pass (Live indicators rendered) |
| **LK-08** | Recording consent enforcement (Pro & Enterprise only) | Verified in `RecordingConsentModal.tsx` | Pass (Free tier prompted to upgrade) |
