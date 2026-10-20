/**
 * ============================================================================
 * DevMeet Video Service - LiveKit WebRTC Access Token & TURN Gateway
 * ============================================================================
 * This module generates cryptographically signed JWT access tokens for LiveKit
 * WebRTC peer-to-peer and SFU (Selective Forwarding Unit) media rooms.
 *
 * Key Architectural Responsibilities:
 * 1. LiveKit Server SDK Token Generation:
 *    - Ingests `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
 *    - Generates signed JWTs granting audio/video publishing and subscribing rights.
 * 2. NAT Traversal & Relay (STUN/TURN Configuration):
 *    - Supplies Coturn/TURN relay configuration (`turnConfig`) for participants behind
 *      strict symmetric enterprise NATs or restrictive firewalls.
 * 3. Graceful Sandbox Fallback (Mock Mode):
 *    - If LiveKit cloud credentials are not supplied, synthesizes base64-encoded
 *      mock JWTs (`mock_jwt_token_...`), allowing candidate frontend video interfaces
 *      to test camera/mic permissions without external cloud dependencies.
 * ============================================================================
 */

const { AccessToken } = require('livekit-server-sdk');

// LiveKit Cloud / Self-Hosted SFU Credentials
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://devmeet.livekit.cloud';

// VID-03: Coturn TURN Server credentials for NAT/firewall traversal
const TURN_SERVER_URL = process.env.TURN_SERVER_URL || 'turn:devmeet-turn.example.com:3478';
const TURN_USERNAME = process.env.TURN_USERNAME || 'devmeet';
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || 'devmeet_secret';
const TURN_ENABLED = process.env.TURN_ENABLED === 'true';

/**
 * Generates an authorized WebRTC room join token for a candidate or AI agent.
 *
 * @param {Object} params - Token parameters.
 * @param {string} params.room_name - Target interview session room ID.
 * @param {string} params.participant_identity - Unique participant user UUID.
 * @param {string} [params.participant_name] - Candidate display name.
 * @returns {Promise<Object>} Access token, WebSocket URL, and optional TURN ICE configuration.
 */
async function generateToken({ room_name, participant_identity, participant_name }) {
  // If genuine LiveKit credentials exist, issue a signed production JWT
  if (LIVEKIT_API_KEY && LIVEKIT_API_SECRET) {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participant_identity,
      name: participant_name || participant_identity
    });

    // Grant bidirectional media rights (publishing microphone/webcam and subscribing to AI streams)
    at.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: true,
      canSubscribe: true
    });

    // Attach ICE relay servers for symmetric NAT traversal
    let turnConfig = null;
    if (TURN_ENABLED && TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL) {
      turnConfig = {
        urls: [TURN_SERVER_URL],
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL
      };
    }

    const token = await at.toJwt();
    return {
      token,
      livekit_url: LIVEKIT_URL,
      room_name,
      turn_config: turnConfig,
      mock: false
    };
  }

  // Fallback to Mock Token Mode for local offline development and test suites
  const payload = Buffer.from(
    JSON.stringify({ room: room_name, identity: participant_identity })
  ).toString('base64');

  return {
    token: `mock_jwt_token_${payload}_${Date.now()}`,
    livekit_url: 'wss://mock.livekit.cloud',
    room_name,
    mock: true
  };
}

module.exports = {
  generateToken,
  /** Returns true if LiveKit credentials are configured */
  isConfigured: () => !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
  /** Returns true if TURN server traversal is enabled */
  isTurnEnabled: () => TURN_ENABLED,
  /** Returns true if TURN credentials and endpoints are populated */
  isTurnConfigured: () => !!(TURN_SERVER_URL && TURN_USERNAME && TURN_CREDENTIAL)
};
