/**
 * ============================================================================
 * DevMeet Video Service - Recording & Media Storage Manager (VID-05)
 * ============================================================================
 * Handles interview recording lifecycle:
 * 1. Consent Verification: Enforces explicit user opt-in before recording starts.
 * 2. Media Ingestion: Accepts binary/multipart video uploads from candidate browser.
 * 3. Persistence: Stores video files in local persistent storage and/or AWS S3.
 * 4. Streaming Replay: Serves stored recordings with HTTP 206 Range requests
 *    for smooth seeking in web video players.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// Storage directory for recordings
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || path.join(__dirname, '../recordings');

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// AWS S3 configuration (optional, falls back to local disk storage)
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// In-memory registry tracking recordings: room_name -> recording metadata
const activeRecordings = new Map();

/**
 * Initiates a recording session for a room after verifying explicit consent.
 *
 * @param {Object} params
 * @param {string} params.room_name - Interview room identifier
 * @param {string} params.user_id - Participant user UUID
 * @param {boolean} params.consent - Explicit candidate opt-in
 * @returns {Object} Recording status descriptor
 */
function startRecording({ room_name, user_id, consent }) {
  if (!room_name) {
    throw new Error('room_name is required');
  }

  if (consent !== true) {
    const error = new Error('Explicit recording consent is required (consent: true) before starting recording.');
    error.code = 'CONSENT_REQUIRED';
    throw error;
  }

  if (activeRecordings.has(room_name)) {
    const existing = activeRecordings.get(room_name);
    if (existing.status === 'recording') {
      const error = new Error('Recording already in progress for this room');
      error.code = 'ALREADY_RECORDING';
      throw error;
    }
  }

  const recording = {
    room_name,
    user_id: user_id || 'unknown',
    consent: true,
    consent_timestamp: new Date().toISOString(),
    started_at: new Date().toISOString(),
    stopped_at: null,
    status: 'recording',
    file_name: null,
    file_path: null,
    file_size: 0,
    s3_key: null,
    playback_url: null,
    mime_type: 'video/webm',
  };

  activeRecordings.set(room_name, recording);
  console.log(`[VID-05] Recording started: room=${room_name} user=${recording.user_id}`);
  return recording;
}

/**
 * Signals completion of a recording session and prepares storage references.
 *
 * @param {Object} params
 * @param {string} params.room_name - Interview room identifier
 * @param {string} [params.user_id] - Participant user UUID
 * @returns {Object} Updated recording descriptor
 */
function stopRecording({ room_name, user_id }) {
  if (!room_name) {
    throw new Error('room_name is required');
  }

  if (!activeRecordings.has(room_name)) {
    const error = new Error('No active recording found for this room');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const recording = activeRecordings.get(room_name);
  if (recording.status !== 'recording') {
    // If already stopped or ready, return existing record
    return recording;
  }

  recording.stopped_at = new Date().toISOString();
  recording.status = 'stopped';

  // Canonical S3 key identifier
  const safeTimestamp = recording.started_at.replace(/[:.]/g, '-');
  recording.s3_key = `recordings/${room_name}/${safeTimestamp}.webm`;

  activeRecordings.set(room_name, recording);
  console.log(`[VID-05] Recording stopped: room=${room_name} s3_key=${recording.s3_key}`);
  return recording;
}

/**
 * Persists an uploaded video buffer or file stream to storage.
 *
 * @param {string} room_name - Interview room identifier
 * @param {Buffer|stream.Readable} data - Video binary payload
 * @param {string} [originalFilename] - Original client filename
 * @param {string} [mimeType='video/webm'] - Media MIME type
 * @returns {Promise<Object>} Finalized recording record with playback URL
 */
async function saveRecordingFile(room_name, data, originalFilename, mimeType = 'video/webm') {
  if (!room_name) {
    throw new Error('room_name is required');
  }

  // Sanitize filename to avoid directory traversal
  const safeRoom = room_name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = path.extname(originalFilename || '') || '.webm';
  const fileName = `${safeRoom}_${Date.now()}${ext}`;
  const filePath = path.join(RECORDINGS_DIR, fileName);

  if (Buffer.isBuffer(data)) {
    await fs.promises.writeFile(filePath, data);
  } else if (typeof data?.pipe === 'function') {
    // Stream pipe
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      data.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  } else {
    throw new Error('Invalid video payload: expected Buffer or Readable stream');
  }

  const stats = await fs.promises.stat(filePath);

  let recording = activeRecordings.get(room_name);
  if (!recording) {
    recording = {
      room_name,
      user_id: 'unknown',
      consent: true,
      consent_timestamp: new Date().toISOString(),
      started_at: new Date().toISOString(),
      stopped_at: new Date().toISOString(),
      status: 'ready',
    };
  }

  recording.status = 'ready';
  recording.file_name = fileName;
  recording.file_path = filePath;
  recording.file_size = stats.size;
  recording.mime_type = mimeType;
  recording.s3_key = recording.s3_key || `recordings/${room_name}/${fileName}`;
  recording.playback_url = `/api/v1/video/room/${encodeURIComponent(room_name)}/recording/play`;
  recording.uploaded_at = new Date().toISOString();

  activeRecordings.set(room_name, recording);
  console.log(`[VID-05] Saved recording file: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB) for room=${room_name}`);

  // Optional S3 background persistence if configured
  if (S3_BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    uploadToS3(filePath, recording.s3_key, mimeType).catch((err) => {
      console.warn(`[VID-05] Background S3 upload warning: ${err.message}`);
    });
  }

  return recording;
}

/**
 * Optional background upload to AWS S3 bucket.
 */
async function uploadToS3(filePath, s3Key, mimeType) {
  try {
    // Dynamic import to avoid hard dependency on @aws-sdk if not installed
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    const fileStream = fs.createReadStream(filePath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileStream,
        ContentType: mimeType,
      })
    );
    console.log(`[VID-05] S3 persistence succeeded for ${s3Key}`);
  } catch (err) {
    console.log(`[VID-05] AWS S3 SDK not installed or unconfigured. Retaining video on local persistent volume.`);
  }
}

/**
 * Retrieves recording metadata for a room.
 * Looks in active memory first, then checks local disk for matching persisted files.
 *
 * @param {string} room_name - Interview room identifier
 * @returns {Object|null}
 */
function getRecordingStatus(room_name) {
  if (!room_name) return null;

  if (activeRecordings.has(room_name)) {
    return activeRecordings.get(room_name);
  }

  // Scan disk for existing recording if service restarted
  const safeRoom = room_name.replace(/[^a-zA-Z0-9_-]/g, '_');
  try {
    const files = fs.readdirSync(RECORDINGS_DIR);
    const match = files.find((f) => f.startsWith(safeRoom));
    if (match) {
      const filePath = path.join(RECORDINGS_DIR, match);
      const stats = fs.statSync(filePath);
      const record = {
        room_name,
        user_id: 'unknown',
        consent: true,
        started_at: stats.birthtime.toISOString(),
        stopped_at: stats.mtime.toISOString(),
        status: 'ready',
        file_name: match,
        file_path: filePath,
        file_size: stats.size,
        mime_type: match.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
        s3_key: `recordings/${room_name}/${match}`,
        playback_url: `/api/v1/video/room/${encodeURIComponent(room_name)}/recording/play`,
      };
      activeRecordings.set(room_name, record);
      return record;
    }
  } catch (err) {
    // Ignore read errors
  }

  return null;
}

/**
 * Streams the recorded video with HTTP 206 Partial Content support for web video players.
 *
 * @param {string} room_name - Room name
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function streamRecording(room_name, req, res) {
  const recording = getRecordingStatus(room_name);
  if (!recording || !recording.file_path || !fs.existsSync(recording.file_path)) {
    return res.status(404).json({ error: 'Recording video file not found for this room' });
  }

  const filePath = recording.file_path;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = recording.mime_type || 'video/webm';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send(`Requested range not satisfiable\n${start} >= ${fileSize}`);
      return;
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = {
  startRecording,
  stopRecording,
  saveRecordingFile,
  getRecordingStatus,
  streamRecording,
  activeRecordings,
  RECORDINGS_DIR,
};
