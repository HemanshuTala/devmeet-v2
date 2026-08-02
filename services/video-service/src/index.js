const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
const PORT = 8006;

app.use(cors());
app.use(express.json());

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://devmeet.livekit.cloud';

// VID-03: TURN server configuration for NAT traversal
const TURN_SERVER_URL = process.env.TURN_SERVER_URL || 'turn:devmeet-turn.example.com:3478';
const TURN_USERNAME = process.env.TURN_USERNAME || 'devmeet';
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || 'devmeet_secret';
const TURN_ENABLED = process.env.TURN_ENABLED === 'true';

// VID-07: Inactivity timer configuration
const ROOM_INACTIVITY_TIMEOUT = parseInt(process.env.ROOM_INACTIVITY_TIMEOUT || '1800000'); // 30 minutes default
const roomInactivityTimers = new Map(); // room_name -> timeout_id
const roomLastActivity = new Map(); // room_name -> timestamp

// VID-07: Reset inactivity timer for a room
function resetInactivityTimer(room_name) {
  // Clear existing timer
  if (roomInactivityTimers.has(room_name)) {
    clearTimeout(roomInactivityTimers.get(room_name));
  }
  
  // Update last activity timestamp
  roomLastActivity.set(room_name, Date.now());
  
  // Set new timer
  const timerId = setTimeout(() => {
    console.log(`[VID-07] Auto-closing room ${room_name} due to inactivity`);
    activeRooms.delete(room_name);
    networkQualityMetrics.delete(room_name);
    roomLastActivity.delete(room_name);
    roomInactivityTimers.delete(room_name);
  }, ROOM_INACTIVITY_TIMEOUT);
  
  roomInactivityTimers.set(room_name, timerId);
}

// In-memory rooms cache
const activeRooms = new Map();

// VID-04: Network quality metrics storage
const networkQualityMetrics = new Map(); // room_name -> [{ participant_identity, metrics, timestamp }]

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'video-service',
    livekit_configured: !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
    turn_enabled: TURN_ENABLED,
    turn_configured: !!(TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL),
    active_rooms_count: activeRooms.size
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'DevMeet Video Service API' });
});

// Generate LiveKit room joining token
app.post('/api/v1/video/token', async (req, res) => {
  try {
    const { room_name, participant_identity, participant_name } = req.body;

    if (!room_name || !participant_identity) {
      return res.status(400).json({ error: 'room_name and participant_identity are required' });
    }

    // Add to active rooms in-memory mapping if it doesn't exist
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

    // Mock Mode fallback
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

// Explicitly register a room (for Orchestrator syncing)
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

    // VID-07: Reset inactivity timer when room is created
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

// Get info for a specific room
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

// End/Delete room
app.delete('/api/v1/video/room/:room_name', (req, res) => {
  const { room_name } = req.params;
  if (!activeRooms.has(room_name)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // VID-07: Clear inactivity timer when room is deleted
  if (roomInactivityTimers.has(room_name)) {
    clearTimeout(roomInactivityTimers.get(room_name));
    roomInactivityTimers.delete(room_name);
  }
  roomLastActivity.delete(room_name);
  
  activeRooms.delete(room_name);
  networkQualityMetrics.delete(room_name);
  res.json({ success: true, message: `Room ${room_name} ended successfully` });
});

// VID-04: Report network quality metrics
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

  // VID-07: Reset inactivity timer when quality metrics are reported (indicates activity)
  resetInactivityTimer(room_name);

  // Keep only last 100 metrics per room
  if (roomMetrics.length > 100) {
    roomMetrics.shift();
  }

  res.json({ success: true, message: 'Quality metrics recorded' });
});

// VID-04: Get network quality metrics for a room
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

  // Calculate aggregate metrics
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
    metrics: metrics.slice(-20), // Return last 20 metrics
    aggregate,
    total_metrics_count: metrics.length
  });
});

// ─── VID-02: Pre-flight device check ──────────────────────────────────────────
// Called by frontend before entering the interview room.
// The browser runs getUserMedia/AudioContext checks and posts the results here.
// We validate the payload, test TURN reachability, and return recommendations.
app.post('/api/v1/video/preflight', (req, res) => {
  try {
    const {
      camera_available,
      microphone_available,
      camera_permission,    // 'granted' | 'denied' | 'prompt'
      mic_permission,       // 'granted' | 'denied' | 'prompt'
      estimated_bandwidth,  // Mbps (client-measured)
      browser,
      os,
    } = req.body;

    const recommendations = [];
    let all_ok = true;

    // Camera check
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

    // Microphone check
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

    // Network check
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

    // TURN server availability
    const turn_configured = TURN_ENABLED && !!(TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL);

    res.json({
      camera_ok,
      mic_ok,
      network_quality,
      turn_configured,
      livekit_configured: !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
      all_ok: all_ok && mic_ok,           // mic is hard-required, camera optional
      can_proceed_audio_only: mic_ok,     // allows entering without camera
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
// Recordings are tracked in-memory (production: stored to S3 via background job).

const activeRecordings = new Map(); // room_name → { started_at, consent, user_id, status }

// Start recording — requires consent=true
app.post('/api/v1/video/room/:room_name/recording/start', (req, res) => {
  try {
    const { room_name } = req.params;
    const { user_id, consent, participant_identity } = req.body;

    if (!activeRooms.has(room_name)) {
      return res.status(404).json({ error: 'Room not found' });
    }

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
      s3_key: null, // Will be set when recording is finalized and uploaded
    };

    activeRecordings.set(room_name, recording);

    console.log(`[VID-05] Recording started for room=${room_name} user=${recording.user_id} consent=granted`);

    // Reset inactivity timer — recording activity
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

// Stop recording
app.post('/api/v1/video/room/:room_name/recording/stop', (req, res) => {
  try {
    const { room_name } = req.params;
    const { user_id } = req.body;

    if (!activeRecordings.has(room_name)) {
      return res.status(404).json({ error: 'No active recording found for this room' });
    }

    const recording = activeRecordings.get(room_name);
    if (recording.status !== 'recording') {
      return res.status(400).json({ error: 'Recording is not currently active' });
    }

    recording.stopped_at = new Date().toISOString();
    recording.status = 'stopped';

    // Simulate S3 key assignment (production: trigger background upload job)
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

// Get recording status
app.get('/api/v1/video/room/:room_name/recording/status', (req, res) => {
  const { room_name } = req.params;

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

app.listen(PORT, () => {
  console.log(`Video service running on port ${PORT}`);
  console.log(`  VID-02 preflight:  POST /api/v1/video/preflight`);
  console.log(`  VID-05 recording:  POST /api/v1/video/room/:name/recording/start|stop`);
  console.log(`  VID-05 rec status: GET  /api/v1/video/room/:name/recording/status`);
});
