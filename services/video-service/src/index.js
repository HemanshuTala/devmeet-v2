/**
 * ============================================================================
 * DevMeet Video & Real-Time Media Service - Application Entry Point
 * ============================================================================
 * Coordinates real-time audio/video communications, WebRTC signaling, LiveKit
 * access token generation, pre-flight device diagnostics, network QoS telemetry,
 * and consent-gated interview session recording with persistent video storage.
 *
 * Architecture Modules:
 * - tokenService.js: LiveKit server SDK token minting & Coturn TURN relay config
 * - roomManager.js: Active WebRTC room registry, inactivity pruning & QoS metrics
 * - recordingService.js: Consent-gated recording, video blob ingestion & streaming replay
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');

const tokenService = require('./tokenService');
const roomManager = require('./roomManager');
const recordingService = require('./recordingService');

// Initialize Express server instance
const app = express();
const PORT = process.env.PORT || 8006;

// Enable Cross-Origin Resource Sharing for frontend client connections
app.use(cors());

// Parse incoming JSON request bodies (up to 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Health check diagnostic endpoint reporting service readiness and configuration flags.
 */
app.get(['/health', '/api/v1/video/health'], (req, res) => {
  res.json({
    status: 'healthy',
    service: 'video-service',
    livekit_configured: tokenService.isConfigured(),
    turn_enabled: tokenService.isTurnEnabled(),
    turn_configured: tokenService.isTurnConfigured(),
    active_rooms_count: roomManager.activeRooms.size,
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

    // Register room in active registry
    const roomInfo = roomManager.getOrCreateRoom(room_name);
    roomInfo.participants.add(participant_identity);

    // Reset inactivity timer when participant joins
    roomManager.resetInactivityTimer(room_name);

    // Delegate token minting to tokenService
    const tokenResult = await tokenService.generateToken({
      room_name,
      participant_identity,
      participant_name,
    });

    res.json(tokenResult);
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

    const room = roomManager.getOrCreateRoom(room_name, session_id);
    roomManager.resetInactivityTimer(room_name);

    res.json({
      room_name: room.room_name,
      session_id: room.session_id,
      created_at: room.created_at,
      participants_count: room.participants.size,
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
  const room = roomManager.getRoom(room_name);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({
    room_name: room.room_name,
    session_id: room.session_id || null,
    created_at: room.created_at,
    participants: Array.from(room.participants),
  });
});

/**
 * Explicitly terminates a room, cancels timers, and frees memory.
 */
app.delete('/api/v1/video/room/:room_name', (req, res) => {
  const { room_name } = req.params;
  const removed = roomManager.removeRoom(room_name);
  if (!removed) {
    return res.status(404).json({ error: 'Room not found' });
  }

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

  roomManager.recordQualityMetrics(room_name, participant_identity, metrics);
  roomManager.resetInactivityTimer(room_name);

  res.json({ success: true, message: 'Quality metrics recorded' });
});

/**
 * Retrieves aggregate and recent network quality metrics for a room.
 */
app.get('/api/v1/video/room/:room_name/quality', (req, res) => {
  const { room_name } = req.params;
  const { participant_identity } = req.query;

  let metrics = roomManager.getQualityMetrics(room_name);
  if (!metrics || metrics.length === 0) {
    return res.status(404).json({ error: 'No quality metrics found for this room' });
  }

  if (participant_identity) {
    metrics = metrics.filter((m) => m.participant_identity === participant_identity);
  }

  const aggregate = {
    avg_packet_loss: 0,
    avg_latency: 0,
    avg_jitter: 0,
    avg_bandwidth: 0,
    participant_count: new Set(metrics.map((m) => m.participant_identity)).size,
  };

  if (metrics.length > 0) {
    const totalPacketLoss = metrics.reduce((sum, m) => sum + (m.metrics?.packet_loss || 0), 0);
    const totalLatency = metrics.reduce((sum, m) => sum + (m.metrics?.latency || 0), 0);
    const totalJitter = metrics.reduce((sum, m) => sum + (m.metrics?.jitter || 0), 0);
    const totalBandwidth = metrics.reduce((sum, m) => sum + (m.metrics?.bandwidth || 0), 0);

    aggregate.avg_packet_loss = totalPacketLoss / metrics.length;
    aggregate.avg_latency = totalLatency / metrics.length;
    aggregate.avg_jitter = totalJitter / metrics.length;
    aggregate.avg_bandwidth = totalBandwidth / metrics.length;
  }

  res.json({
    room_name,
    metrics: metrics.slice(-20),
    aggregate,
    total_metrics_count: metrics.length,
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
      camera_permission,
      mic_permission,
      estimated_bandwidth,
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

    const turn_configured = tokenService.isTurnConfigured();

    res.json({
      camera_ok,
      mic_ok,
      network_quality,
      turn_configured,
      livekit_configured: tokenService.isConfigured(),
      all_ok: all_ok && mic_ok,
      can_proceed_audio_only: mic_ok,
      recommendations,
      turn_config: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Preflight check failed', details: error.message });
  }
});

// ─── VID-05: Recording Management ─────────────────────────────────────────────
/**
 * Initiates audio/video recording for a room with explicit user consent.
 */
app.post(['/api/v1/video/room/:room_name/recording/start', '/api/v1/video/recording/start'], (req, res) => {
  try {
    const room_name = req.params.room_name || req.body.room_name;
    const { user_id, consent, participant_identity } = req.body;

    const recording = recordingService.startRecording({
      room_name,
      user_id: user_id || participant_identity,
      consent,
    });

    roomManager.resetInactivityTimer(room_name);

    res.json({
      success: true,
      room_name,
      status: recording.status,
      started_at: recording.started_at,
      consent_acknowledged: true,
      message: 'Recording started. Session will be stored securely with 7-day retention.',
    });
  } catch (error) {
    if (error.code === 'CONSENT_REQUIRED') {
      return res.status(400).json({ error: error.code, message: error.message });
    }
    if (error.code === 'ALREADY_RECORDING') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to start recording', details: error.message });
  }
});

/**
 * Stops an active recording session and prepares the S3 blob key.
 */
app.post(['/api/v1/video/room/:room_name/recording/stop', '/api/v1/video/recording/stop'], (req, res) => {
  try {
    const room_name = req.params.room_name || req.body.room_name;
    const { user_id, participant_identity } = req.body;

    const recording = recordingService.stopRecording({
      room_name,
      user_id: user_id || participant_identity,
    });

    res.json({
      success: true,
      room_name,
      status: recording.status,
      started_at: recording.started_at,
      stopped_at: recording.stopped_at,
      s3_key: recording.s3_key,
      playback_url: recording.playback_url,
      message: 'Recording stopped. Upload to storage finalized.',
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to stop recording', details: error.message });
  }
});

/**
 * Ingests recorded video data from the candidate browser (stream/blob).
 * Accepts raw video payloads or application/octet-stream.
 */
app.post(['/api/v1/video/room/:room_name/recording/upload', '/api/v1/video/recording/upload'], async (req, res) => {
  try {
    const room_name = req.params.room_name || req.query.room_name;
    if (!room_name) {
      return res.status(400).json({ error: 'room_name is required' });
    }

    const contentType = req.headers['content-type']?.split(';')[0] || 'video/webm';
    const originalFilename = req.headers['x-filename'] || req.query.filename || `interview_${room_name}.webm`;

    const recording = await recordingService.saveRecordingFile(room_name, req, originalFilename, contentType);

    res.json({
      success: true,
      room_name,
      status: recording.status,
      file_name: recording.file_name,
      file_size: recording.file_size,
      playback_url: recording.playback_url,
      s3_key: recording.s3_key,
      message: 'Video recording saved successfully.',
    });
  } catch (error) {
    console.error('Error saving recording upload:', error);
    res.status(500).json({ error: 'Failed to save recording upload', details: error.message });
  }
});

/**
 * Queries recording status, metadata, and playback URL.
 */
app.get(['/api/v1/video/room/:room_name/recording/status', '/api/v1/video/recording/status'], (req, res) => {
  const room_name = req.params.room_name || req.query.room_name;

  if (!room_name) {
    return res.status(400).json({ error: 'room_name query parameter or path param is required' });
  }

  const recording = recordingService.getRecordingStatus(room_name);
  if (!recording) {
    return res.json({
      room_name,
      status: 'not_started',
      is_recording: false,
    });
  }

  res.json({
    room_name,
    status: recording.status,
    is_recording: recording.status === 'recording',
    started_at: recording.started_at,
    stopped_at: recording.stopped_at,
    s3_key: recording.s3_key,
    file_name: recording.file_name,
    file_size: recording.file_size,
    playback_url: recording.playback_url,
    consent: recording.consent,
    consent_timestamp: recording.consent_timestamp,
  });
});

/**
 * Streams stored recording video with HTTP 206 Partial Content (range seeking support).
 */
app.get([
  '/api/v1/video/room/:room_name/recording/play',
  '/api/v1/video/recordings/:room_name/play',
  '/api/v1/video/recording/:room_name/play',
], (req, res) => {
  const { room_name } = req.params;
  recordingService.streamRecording(room_name, req, res);
});

// Start Express HTTP listener on designated port
app.listen(PORT, () => {
  console.log(`Video service running on port ${PORT}`);
  console.log(`  LiveKit configured: ${tokenService.isConfigured()}`);
  console.log(`  TURN enabled:       ${tokenService.isTurnEnabled()}`);
  console.log(`  Recordings dir:     ${recordingService.RECORDINGS_DIR}`);
});
