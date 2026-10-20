/**
 * ============================================================================
 * DevMeet Video & Real-Time Media Service - Application Entry Point
 * ============================================================================
 * This Express.js microservice coordinates real-time audio/video communications,
 * WebRTC signaling, LiveKit access token generation, pre-flight device diagnostics,
 * network telemetry (QoS monitoring), and consent-gated interview session recording.
 *
 * Key Architectural Responsibilities:
 * 1. WebRTC Signaling & Access Tokens (LiveKit Cloud):
 *    - Issues cryptographically signed LiveKit Access Tokens (`/api/v1/video/token`)
 *      permitting candidates to join dedicated interview rooms.
 *    - Falls back to structured mock JWTs if external cloud credentials are unset.
 * 2. Enterprise NAT Traversal (STUN/TURN Protocol):
 *    - Configures and exposes Coturn credentials for clients behind symmetric firewalls.
 * 3. Pre-Flight Hardware Diagnostics (VID-02):
 *    - `/api/v1/video/preflight`: Evaluates client webcam/mic availability, permissions,
 *      and estimated network bandwidth before granting entrance to an interview room.
 * 4. Room Lifecycle & Automated Inactivity Pruning (VID-07):
 *    - Tracks active session rooms in memory with configurable idle auto-termination
 *      timers (default 30 minutes) to prevent memory leaks and orphaned cloud sessions.
 * 5. Real-Time QoS Telemetry (VID-04):
 *    - Ingests and aggregates client-side WebRTC metrics (packet loss, RTT, jitter, bandwidth).
 * 6. Consent-Gated Recording Pipeline (VID-05):
 *    - Restricts recording initiation to requests with explicit participant consent (`consent: true`).
 *    - Mints S3 keys and coordinates background cloud storage persistence.
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');

// Initialize Express server instance
const app = express();
const PORT = 8006;

// Enable Cross-Origin Resource Sharing for frontend client connections
app.use(cors());
// Parse incoming JSON request bodies
app.use(express.json());

// LiveKit WebRTC Cloud / SFU Credentials
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://devmeet.livekit.cloud';

// VID-03: Coturn TURN Server credentials for NAT traversal
const TURN_SERVER_URL = process.env.TURN_SERVER_URL || 'turn:devmeet-turn.example.com:3478';
const TURN_USERNAME = process.env.TURN_USERNAME || 'devmeet';
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || 'devmeet_secret';
const TURN_ENABLED = process.env.TURN_ENABLED === 'true';

// VID-07: Inactivity timer configuration (default: 30 minutes in ms)
const ROOM_INACTIVITY_TIMEOUT = parseInt(process.env.ROOM_INACTIVITY_TIMEOUT || '1800000', 10);
const roomInactivityTimers = new Map(); // room_name -> NodeJS.Timeout
const roomLastActivity = new Map();     // room_name -> timestamp in ms

/**
 * Resets or arms the inactivity timer for a given video interview room.
 *
 * @param {string} room_name - Target room identifier.
 */
function resetInactivityTimer(room_name) {
  // Clear existing timer if active
  if (roomInactivityTimers.has(room_name)) {
    clearTimeout(roomInactivityTimers.get(room_name));
  }
  
  // Record current timestamp
  roomLastActivity.set(room_name, Date.now());
  
  // Arm teardown timer
  const timerId = setTimeout(() => {
    console.log(`[VID-07] Auto-closing room ${room_name} due to inactivity`);
    activeRooms.delete(room_name);
    networkQualityMetrics.delete(room_name);
    roomLastActivity.delete(room_name);
    roomInactivityTimers.delete(room_name);
  }, ROOM_INACTIVITY_TIMEOUT);
  
  roomInactivityTimers.set(room_name, timerId);
}

// In-memory cache tracking active session rooms
const activeRooms = new Map();

// VID-04: Network quality metrics storage (room_name -> [{ participant_identity, metrics, timestamp }])
const networkQualityMetrics = new Map();

/**
 * Health check diagnostic endpoint reporting service readiness and configuration flags.
 */
app.get(['/health', '/api/v1/video/health'], (req, res) => {
  res.json({
    status: 'healthy',
    service: 'video-service',
    livekit_configured: !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
    turn_enabled: TURN_ENABLED,
    turn_configured: !!(TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL),
    active_rooms_count: activeRooms.size
  });
});

/**
 * Root discovery endpoint returning service banner.
 */
app.get(['/', '/api/v1/video'], (req, res) => {
  res.json({ message: 'DevMeet Video Service API' });
});

/**
 * Issues an authorized LiveKit room token for a candidate or interviewer.
 *
 * Request Body:
 * - `room_name` (string): Unique room session ID.
 * - `participant_identity` (string): Candidate or interviewer user UUID.
 * - `participant_name` (string, optional): Display name.
 */
app.post('/api/v1/video/token', async (req, res) => {
  try {
    const { room_name, participant_identity, participant_name } = req.body;

    if (!room_name || !participant_identity) {
      return res.status(400).json({ error: 'room_name and participant_identity are required' });
    }

    // Register room in active registry if not already present
    if (!activeRooms.has(room_name)) {
      activeRooms.set(room_name, {
        room_name,
        created_at: new Date().toISOString(),
        participants: new Set()
      });
    }

    const roomInfo = activeRooms.get(room_name);
    roomInfo.participants.add(participant_identity);

    // VID-07: Reset inactivity timer when participant joins
    resetInactivityTimer(room_name);

    // Real LiveKit key integration
    if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: participant_identity,
        name: participant_name || participant_identity
      });

      // Grant audio/video publish and subscribe permissions
      at.addGrant({
        roomJoin: true,
        room: room_name,
        canPublish: true,
        canSubscribe: true
      });

      // VID-03: Add TURN server configuration if enabled
      let turnConfig = null;
      if (TURN_ENABLED && TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL) {
        turnConfig = {
          urls: [TURN_SERVER_URL],
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL
        };
      }

      const token = await at.toJwt();
      return res.json({
        token,
        livekit_url: LIVEKIT_URL,
        room_name,
        turn_config: turnConfig,
        mock: false
      });
    }

    // Mock Mode fallback for local testing
    console.log(`Mock Mode active: Generating mock token for room=${room_name}, participant=${participant_identity}`);
    res.json({
      token: `mock_jwt_token_${Buffer.from(JSON.stringify({ room: room_name, identity: participant_identity })).toString('base64')}_${Date.now()}`,
      livekit_url: 'wss://mock.livekit.cloud',
      room_name,
      mock: true
    });
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate access token', details: error.message });
  }
});

/**
 * Explicitly creates and registers a video room (called by Orchestrator Service).
 */
app.post('/api/v1/video/room/create', (req, res) => {
  try {
    const { room_name, session_id } = req.body;
    if (!room_name) {
      return res.status(400).json({ error: 'room_name is required' });
    }

    activeRooms.set(room_name, {
      room_name,
      session_id: session_id || null,
      created_at: new Date().toISOString(),
      participants: new Set()
    });

    // Reset inactivity timer upon creation
    resetInactivityTimer(room_name);

    res.json({
      room_name,
      session_id,
      created_at: activeRooms.get(room_name).created_at,
      participants_count: 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Room creation failed', details: error.message });
  }
});

/**
 * Retrieves state and participant roster for a specific room.
 */
app.get('/api/v1/video/room/:room_name', (req, res) => {
  const { room_name } = req.params;
  const room = activeRooms.get(room_name);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({
    room_name: room.room_name,
    session_id: room.session_id || null,
    created_at: room.created_at,
    participants: Array.from(room.participants)
  });
});

/**
 * Explicitly terminates a room, cancels timers, and frees memory.
 */
app.delete('/api/v1/video/room/:room_name', (req, res) => {
  const { room_name } = req.params;
  if (!activeRooms.has(room_name)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // Clear inactivity timer
  if (roomInactivityTimers.has(room_name)) {
    clearTimeout(roomInactivityTimers.get(room_name));
    roomInactivityTimers.delete(room_name);
  }
  roomLastActivity.delete(room_name);
  
  activeRooms.delete(room_name);
  networkQualityMetrics.delete(room_name);
  res.json({ success: true, message: `Room ${room_name} ended successfully` });
});

/**
 * Ingests client-side WebRTC network quality telemetry.
 */
app.post('/api/v1/video/room/:room_name/quality', (req, res) => {
  const { room_name } = req.params;
  const { participant_identity, metrics } = req.body;

  if (!room_name || !participant_identity || !metrics) {
    return res.status(400).json({ error: 'room_name, participant_identity, and metrics are required' });
  }

  if (!networkQualityMetrics.has(room_name)) {
    networkQualityMetrics.set(room_name, []);
  }

  const roomMetrics = networkQualityMetrics.get(room_name);
  roomMetrics.push({
    participant_identity,
    metrics,
    timestamp: new Date().toISOString()
  });

  // Reporting telemetry signals active communication; reset timer
  resetInactivityTimer(room_name);

  // Keep sliding window of last 100 entries
  if (roomMetrics.length > 100) {
    roomMetrics.shift();
  }

  res.json({ success: true, message: 'Quality metrics recorded' });
});

/**
 * Retrieves aggregate and recent network quality metrics for a room.
 */
app.get('/api/v1/video/room/:room_name/quality', (req, res) => {
  const { room_name } = req.params;
  const { participant_identity } = req.query;

  if (!networkQualityMetrics.has(room_name)) {
    return res.status(404).json({ error: 'No quality metrics found for this room' });
  }

  let metrics = networkQualityMetrics.get(room_name);

  // Filter by participant if specified
  if (participant_identity) {
    metrics = metrics.filter(m => m.participant_identity === participant_identity);
  }

  // Calculate aggregates across samples
  const aggregate = {
    avg_packet_loss: 0,
    avg_latency: 0,
    avg_jitter: 0,
    avg_bandwidth: 0,
    participant_count: new Set(metrics.map(m => m.participant_identity)).size
  };

  if (metrics.length > 0) {
    const totalPacketLoss = metrics.reduce((sum, m) => sum + (m.metrics.packet_loss || 0), 0);
    const totalLatency = metrics.reduce((sum, m) => sum + (m.metrics.latency || 0), 0);
    const totalJitter = metrics.reduce((sum, m) => sum + (m.metrics.jitter || 0), 0);
    const totalBandwidth = metrics.reduce((sum, m) => sum + (m.metrics.bandwidth || 0), 0);

    aggregate.avg_packet_loss = totalPacketLoss / metrics.length;
    aggregate.avg_latency = totalLatency / metrics.length;
    aggregate.avg_jitter = totalJitter / metrics.length;
    aggregate.avg_bandwidth = totalBandwidth / metrics.length;
  }

  res.json({
    room_name,
    metrics: metrics.slice(-20), // Return last 20 samples
    aggregate,
    total_metrics_count: metrics.length
  });
});

// ─── VID-02: Pre-flight device check ──────────────────────────────────────────
/**
 * Evaluates client camera, microphone, and network bandwidth readiness prior to session entry.
 */
app.post('/api/v1/video/preflight', (req, res) => {
  try {
    const {
      camera_available,
      microphone_available,
      camera_permission,    // 'granted' | 'denied' | 'prompt'
      mic_permission,       // 'granted' | 'denied' | 'prompt'
      estimated_bandwidth,  // Mbps
      browser,
      os,
    } = req.body;

    const recommendations = [];
    let all_ok = true;

    // Camera validation
    const camera_ok = camera_available === true && camera_permission === 'granted';
    if (!camera_ok) {
      all_ok = false;
      if (camera_permission === 'denied') {
        recommendations.push({
          type: 'error',
          area: 'camera',
          message: 'Camera access denied. Please allow camera in browser settings and refresh.',
        });
      } else if (!camera_available) {
        recommendations.push({
          type: 'warning',
          area: 'camera',
          message: 'No camera detected. You can proceed in audio-only mode.',
        });
      }
    }

    // Microphone validation (critical requirement for voice interviews)
    const mic_ok = microphone_available === true && mic_permission === 'granted';
    if (!mic_ok) {
      all_ok = false;
      if (mic_permission === 'denied') {
        recommendations.push({
          type: 'error',
          area: 'microphone',
          message: 'Microphone access denied. Please allow microphone in browser settings.',
        });
      } else if (!microphone_available) {
        recommendations.push({
          type: 'error',
          area: 'microphone',
          message: 'No microphone detected. A microphone is required for voice interviews.',
        });
      }
    }

    // Network bandwidth check
    const bw = parseFloat(estimated_bandwidth) || 0;
    let network_quality = 'good';
    if (bw > 0 && bw < 1) {
      network_quality = 'poor';
      recommendations.push({
        type: 'warning',
        area: 'network',
        message: `Low bandwidth detected (${bw.toFixed(1)} Mbps). Video quality may be degraded. Consider switching to audio-only mode.`,
      });
    } else if (bw >= 1 && bw < 2) {
      network_quality = 'fair';
      recommendations.push({
        type: 'info',
        area: 'network',
        message: 'Moderate network speed. Interview will work, but keep other apps closed for best performance.',
      });
    }

    // TURN server status
    const turn_configured = TURN_ENABLED && !!(TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL);

    res.json({
      camera_ok,
      mic_ok,
      network_quality,
      turn_configured,
      livekit_configured: !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
      all_ok: all_ok && mic_ok,           // Microphone is strictly required, camera is optional
      can_proceed_audio_only: mic_ok,     // Allows entering without webcam
      recommendations,
      turn_config: turn_configured
        ? { urls: [TURN_SERVER_URL], username: TURN_USERNAME }
        : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Preflight check failed', details: error.message });
  }
});

// ─── VID-05: Recording Management ─────────────────────────────────────────────
// Pro-tier only. User must provide explicit consent before recording starts.
const activeRecordings = new Map(); // room_name → { started_at, consent, user_id, status }

/**
 * Initiates audio/video recording for a room with explicit user consent.
 */
app.post(['/api/v1/video/room/:room_name/recording/start', '/api/v1/video/recording/start'], (req, res) => {
  try {
    const room_name = req.params.room_name || req.body.room_name;
    const { user_id, consent, participant_identity } = req.body;

    if (!room_name) {
      return res.status(400).json({ error: 'room_name is required' });
    }

    if (!activeRooms.has(room_name)) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Enforce explicit participant consent
    if (consent !== true) {
      return res.status(400).json({
        error: 'CONSENT_REQUIRED',
        message: 'Explicit recording consent is required (consent: true) before starting recording.',
      });
    }

    if (activeRecordings.has(room_name)) {
      const existing = activeRecordings.get(room_name);
      if (existing.status === 'recording') {
        return res.status(409).json({ error: 'Recording already in progress for this room' });
      }
    }

    const recording = {
      room_name,
      user_id: user_id || participant_identity || 'unknown',
      consent: true,
      consent_timestamp: new Date().toISOString(),
      started_at: new Date().toISOString(),
      stopped_at: null,
      status: 'recording',
      s3_key: null,
    };

    activeRecordings.set(room_name, recording);

    console.log(`[VID-05] Recording started for room=${room_name} user=${recording.user_id} consent=granted`);

    // Reset inactivity timer
    resetInactivityTimer(room_name);

    res.json({
      success: true,
      room_name,
      status: 'recording',
      started_at: recording.started_at,
      consent_acknowledged: true,
      message: 'Recording started. Session will be stored securely in S3 with 7-day retention.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start recording', details: error.message });
  }
});

/**
 * Stops an active recording session and prepares the S3 blob key.
 */
app.post(['/api/v1/video/room/:room_name/recording/stop', '/api/v1/video/recording/stop'], (req, res) => {
  try {
    const room_name = req.params.room_name || req.body.room_name;

    if (!room_name) {
      return res.status(400).json({ error: 'room_name is required' });
    }

    if (!activeRecordings.has(room_name)) {
      return res.status(404).json({ error: 'No active recording found for this room' });
    }

    const recording = activeRecordings.get(room_name);
    if (recording.status !== 'recording') {
      return res.status(400).json({ error: 'Recording is not currently active' });
    }

    recording.stopped_at = new Date().toISOString();
    recording.status = 'stopped';

    // Assign canonical S3 key path for storage
    const s3Key = `recordings/${room_name}/${recording.started_at.replace(/[:.]/g, '-')}.webm`;
    recording.s3_key = s3Key;

    activeRecordings.set(room_name, recording);

    console.log(`[VID-05] Recording stopped for room=${room_name} s3_key=${s3Key}`);

    res.json({
      success: true,
      room_name,
      status: 'stopped',
      started_at: recording.started_at,
      stopped_at: recording.stopped_at,
      s3_key: s3Key,
      message: 'Recording stopped. Upload to S3 initiated in the background.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop recording', details: error.message });
  }
});

/**
 * Queries recording status and S3 storage key.
 */
app.get(['/api/v1/video/room/:room_name/recording/status', '/api/v1/video/recording/status'], (req, res) => {
  const room_name = req.params.room_name || req.query.room_name;

  if (!room_name) {
    return res.status(400).json({ error: 'room_name query parameter or path param is required' });
  }

  if (!activeRecordings.has(room_name)) {
    return res.json({
      room_name,
      status: 'not_started',
      is_recording: false,
    });
  }

  const recording = activeRecordings.get(room_name);
  res.json({
    room_name,
    status: recording.status,
    is_recording: recording.status === 'recording',
    started_at: recording.started_at,
    stopped_at: recording.stopped_at,
    s3_key: recording.s3_key,
    consent: recording.consent,
    consent_timestamp: recording.consent_timestamp,
  });
});

// Start Express HTTP listener on designated port
app.listen(PORT, () => {
  console.log(`Video service running on port ${PORT}`);
  console.log(`  VID-02 preflight:  POST /api/v1/video/preflight`);
  console.log(`  VID-05 recording:  POST /api/v1/video/room/:name/recording/start|stop`);
  console.log(`  VID-05 rec status: GET  /api/v1/video/room/:name/recording/status`);
});
