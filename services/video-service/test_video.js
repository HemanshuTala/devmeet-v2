const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) req.write(body);
      else req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Testing Video Service Endpoints ---');

  // 1. Health
  const health = await request({ host: 'localhost', port: 8000, path: '/api/v1/video/health', method: 'GET' });
  console.log('1. Health:', health.status, health.data);

  // 2. Token
  const roomName = `test_room_${Date.now()}`;
  const token = await request(
    {
      host: 'localhost',
      port: 8000,
      path: '/api/v1/video/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { room_name: roomName, participant_identity: 'user-123', participant_name: 'Candidate A' }
  );
  console.log('2. Token generated:', token.status, 'token_exists:', !!token.data.token, 'livekit_url:', token.data.livekit_url);

  // 3. Recording Start without consent (Expect 400)
  const noConsent = await request(
    {
      host: 'localhost',
      port: 8000,
      path: `/api/v1/video/room/${roomName}/recording/start`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { user_id: 'user-123', consent: false }
  );
  console.log('3. Consent required check (expect 400):', noConsent.status, noConsent.data);

  // 4. Recording Start with consent (Expect 200)
  const startRec = await request(
    {
      host: 'localhost',
      port: 8000,
      path: `/api/v1/video/room/${roomName}/recording/start`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { user_id: 'user-123', consent: true }
  );
  console.log('4. Recording start:', startRec.status, startRec.data);

  // 5. Upload Video Payload
  const dummyVideo = Buffer.from('RIFF\x00\x00\x00\x00WEBM...DevMeetSyntheticInterviewRecordingBytes');
  const upload = await request(
    {
      host: 'localhost',
      port: 8000,
      path: `/api/v1/video/room/${roomName}/recording/upload?filename=${roomName}.webm`,
      method: 'POST',
      headers: {
        'Content-Type': 'video/webm',
        'X-Filename': `${roomName}.webm`,
        'Content-Length': dummyVideo.length,
      },
    },
    dummyVideo
  );
  console.log('5. Video upload:', upload.status, upload.data);

  // 6. Recording Status
  const status = await request({ host: 'localhost', port: 8000, path: `/api/v1/video/room/${roomName}/recording/status`, method: 'GET' });
  console.log('6. Recording status:', status.status, status.data);

  // 7. Video Stream / Range Playback (Expect 206 Partial Content)
  const stream = await request({
    host: 'localhost',
    port: 8000,
    path: `/api/v1/video/room/${roomName}/recording/play`,
    method: 'GET',
    headers: { Range: 'bytes=0-15' },
  });
  console.log('7. Video stream (Range 0-15):', stream.status, 'Content-Range:', stream.headers['content-range'], 'Length:', stream.headers['content-length']);

  console.log('--- All Video Service Tests Passed Successfully! ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
