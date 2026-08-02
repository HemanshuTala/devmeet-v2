const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const app = express();
const PORT = 8008;

app.use(cors());
app.use(express.json());

// AWS SES Client config
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@devmeet.com';

const useSES = !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
let sesClient = null;

if (useSES) {
  sesClient = new SESClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
  });
}

// In-memory WebSocket client registry: Map<userId, Set<WebSocket>>
const clients = new Map();

// HTTP server wrapper
const server = http.createServer(app);

// WebSocket Server attached to HTTP
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('user_id');

  if (!userId) {
    console.log('WS connection rejected: user_id query param missing.');
    ws.close(1008, 'user_id required');
    return;
  }

  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(ws);

  console.log(`WS client connected. user_id=${userId}. Total users online: ${clients.size}`);

  ws.on('close', () => {
    const userSocks = clients.get(userId);
    if (userSocks) {
      userSocks.delete(ws);
      if (userSocks.size === 0) {
        clients.delete(userId);
      }
    }
    console.log(`WS client disconnected. user_id=${userId}. Users online: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error(`WS error for user_id=${userId}:`, err);
  });
});

// Helper templates
const EMAIL_TEMPLATES = {
  welcome: (data) => ({
    subject: 'Welcome to DevMeet!',
    body: `Hello ${data.name || 'Candidate'},\n\nWelcome to DevMeet! Start your first AI-driven technical interview practice session today and conquer your dream company.\n\nBest,\nDevMeet Team`
  }),
  session_complete: (data) => ({
    subject: `DevMeet Interview Complete - ${data.interview_type || 'Session'}`,
    body: `Hello ${data.name || 'Candidate'},\n\nYour interview session has been successfully evaluated!\nOverall Score: ${data.score}/100.\n\nYou can view and download your full technical breakdown report here: ${data.report_url}\n\nBest,\nDevMeet Team`
  }),
  reset_password: (data) => ({
    subject: 'DevMeet Password Reset Request',
    body: `Hello,\n\nYou requested a password reset. Please use the following link to reset it:\n${data.reset_url}\n\nIf you did not request this, you can ignore this email.\n\nBest,\nDevMeet Team`
  }),
  verify_email: (data) => ({
    subject: 'Verify your DevMeet email address',
    body: `Hello ${data.name || 'Candidate'},\n\nYour verification code is: ${data.otp}\n\nThis code will expire in 24 hours.\n\nBest,\nDevMeet Team`
  })
};

// REST API Endpoints
app.get('/health', (req, res) => {
  let activeClientsCount = 0;
  clients.forEach(socks => activeClientsCount += socks.size);

  res.json({
    status: 'healthy',
    service: 'notification-service',
    ses_connected: useSES,
    connected_clients: activeClientsCount,
    users_online: clients.size
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'DevMeet Notification Service API' });
});

// Send email notification (SES or console logging fallback)
app.post('/api/v1/notifications/email', async (req, res) => {
  try {
    const { to, template, data } = req.body;

    if (!to || !template) {
      return res.status(400).json({ error: 'to and template fields are required' });
    }

    const templateFn = EMAIL_TEMPLATES[template];
    if (!templateFn) {
      return res.status(400).json({ error: `Invalid email template: ${template}` });
    }

    const { subject, body } = templateFn(data || {});

    if (useSES && sesClient) {
      const command = new SendEmailCommand({
        Destination: { ToAddresses: [to] },
        Message: {
          Body: {
            Text: { Data: body }
          },
          Subject: { Data: subject }
        },
        Source: SES_FROM_EMAIL
      });

      const response = await sesClient.send(command);
      return res.json({
        message_id: response.MessageId,
        sent: true,
        mock: false
      });
    }

    // Mock Mode fallback
    console.log('--- MOCK EMAIL SENT ---');
    console.log(`From: ${SES_FROM_EMAIL}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    console.log('-----------------------');

    res.json({
      message_id: `mock_msg_id_${Date.now()}`,
      sent: true,
      mock: true
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// Send push notification to a specific user (WS)
app.post('/api/v1/notifications/push', (req, res) => {
  try {
    const { user_id, type, title, message, data } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({ error: 'user_id, title, and message are required' });
    }

    const userSocks = clients.get(user_id);
    let delivered = 0;

    if (userSocks && userSocks.size > 0) {
      const payload = JSON.stringify({
        type: type || 'info',
        title,
        message,
        data: data || {},
        timestamp: new Date().toISOString()
      });

      userSocks.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
          delivered++;
        }
      });
    }

    res.json({ delivered, user_id, status: delivered > 0 ? 'delivered' : 'queued_offline' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send push notification', details: error.message });
  }
});

// Broadcast push to all active users
app.post('/api/v1/notifications/broadcast', (req, res) => {
  try {
    const { type, title, message, data } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const payload = JSON.stringify({
      type: type || 'broadcast',
      title,
      message,
      data: data || {},
      timestamp: new Date().toISOString()
    });

    let delivered = 0;
    clients.forEach(userSocks => {
      userSocks.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
          delivered++;
        }
      });
    });

    res.json({ delivered, status: 'broadcasted' });
  } catch (error) {
    res.status(500).json({ error: 'Broadcast failed', details: error.message });
  }
});

// Get online status counts
app.get('/api/v1/notifications/status', (req, res) => {
  res.json({
    online_users_count: clients.size,
    online_users: Array.from(clients.keys())
  });
});

server.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});
