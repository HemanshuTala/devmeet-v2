/**
 * ============================================================================
 * DevMeet Video Service - Room & Participant State Manager
 * ============================================================================
 * This module manages active WebRTC interview media rooms, candidate participation,
 * automated idle room pruning, and real-time network quality telemetry (packet loss,
 * latency, and jitter).
 *
 * Key Architectural Responsibilities:
 * 1. In-Memory Session Room Registry:
 *    - Maps interview session identifiers (`room_name`) to participant sets and creation timestamps.
 * 2. Automated Idle Room Pruning (VID-07):
 *    - Implements bounded inactivity timers (`ROOM_INACTIVITY_TIMEOUT`, default 30 mins)
 *      to automatically close abandoned rooms and release server memory.
 * 3. Network Quality Telemetry (QoS Monitoring):
 *    - Records client-reported WebRTC stats (RTT, packet loss, resolution drops)
 *      with a sliding window of the last 100 observations per session room.
 * ============================================================================
 */

// Inactivity timeout threshold (default 30 minutes in milliseconds)
const ROOM_INACTIVITY_TIMEOUT = parseInt(process.env.ROOM_INACTIVITY_TIMEOUT || '1800000', 10);

// In-memory state registries
const roomInactivityTimers = new Map(); // room_name -> NodeJS.Timeout
const roomLastActivity = new Map();     // room_name -> timestamp in ms
const activeRooms = new Map();          // room_name -> { room_name, created_at, participants: Set }
const networkQualityMetrics = new Map();// room_name -> [{ participant_identity, metrics, timestamp }]

/**
 * Resets or arms the inactivity timer for a given video interview room.
 * Invoked whenever a candidate or AI agent joins, leaves, or emits media packets.
 *
 * @param {string} room_name - Unique identifier of the interview session room.
 */
function resetInactivityTimer(room_name) {
  // Clear any existing pending teardown timer
  if (roomInactivityTimers.has(room_name)) {
    clearTimeout(roomInactivityTimers.get(room_name));
  }

  // Update last seen timestamp
  roomLastActivity.set(room_name, Date.now());

  // Arm automated cleanup timer
  const timerId = setTimeout(() => {
    console.log(`[VID-07] Auto-closing room ${room_name} due to inactivity`);
    activeRooms.delete(room_name);
    networkQualityMetrics.delete(room_name);
    roomLastActivity.delete(room_name);
    roomInactivityTimers.delete(room_name);
  }, ROOM_INACTIVITY_TIMEOUT);

  roomInactivityTimers.set(room_name, timerId);
}

/**
 * Retrieves an existing video room record or registers a new room in memory.
 *
 * @param {string} room_name - Unique identifier of the room session.
 * @returns {Object} Room state object containing participant set and creation timestamp.
 */
function getOrCreateRoom(room_name) {
  if (!activeRooms.has(room_name)) {
    activeRooms.set(room_name, {
      room_name,
      created_at: new Date().toISOString(),
      participants: new Set()
    });
  }
  return activeRooms.get(room_name);
}

/**
 * Explicitly tears down a video room, cancels inactivity timers, and purges QoS metrics.
 *
 * @param {string} room_name - Room to be removed.
 * @returns {boolean} True if room existed and was deleted, False otherwise.
 */
function removeRoom(room_name) {
  if (roomInactivityTimers.has(room_name)) {
    clearTimeout(roomInactivityTimers.get(room_name));
    roomInactivityTimers.delete(room_name);
  }
  roomLastActivity.delete(room_name);
  networkQualityMetrics.delete(room_name);
  return activeRooms.delete(room_name);
}

/**
 * Appends WebRTC client network health statistics (RTT, jitter, packet loss) to the room telemetry.
 * Maintains a capped sliding window of the last 100 entries to prevent memory leaks.
 *
 * @param {string} room_name - Target room identifier.
 * @param {string} participant_identity - Unique candidate or interviewer UUID.
 * @param {Object} metrics - Client-side network measurements.
 */
function recordQualityMetrics(room_name, participant_identity, metrics) {
  if (!networkQualityMetrics.has(room_name)) {
    networkQualityMetrics.set(room_name, []);
  }
  const roomMetrics = networkQualityMetrics.get(room_name);
  roomMetrics.push({
    participant_identity,
    metrics,
    timestamp: new Date().toISOString()
  });

  // Keep a maximum bounded history of 100 metrics per room
  if (roomMetrics.length > 100) {
    roomMetrics.shift();
  }
}

/**
 * Retrieves the historical network quality log for a specific room.
 *
 * @param {string} room_name - Room identifier.
 * @returns {Array<Object>} Chronological list of recorded quality metrics.
 */
function getQualityMetrics(room_name) {
  return networkQualityMetrics.get(room_name) || [];
}

module.exports = {
  activeRooms,
  networkQualityMetrics,
  resetInactivityTimer,
  getOrCreateRoom,
  removeRoom,
  recordQualityMetrics,
  getQualityMetrics
};
