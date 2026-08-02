/** @type {import('next').NextConfig} */
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  optimizeFonts: false,
  // Required for Docker: produces a self-contained server.js in .next/standalone
  output: 'standalone',
  env: {
    NEXT_PUBLIC_GATEWAY_URL: GATEWAY_URL,
    NEXT_PUBLIC_API_URL: GATEWAY_URL,
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL || GATEWAY_URL,
    NEXT_PUBLIC_USER_URL: process.env.NEXT_PUBLIC_USER_URL || GATEWAY_URL,
    NEXT_PUBLIC_ORCH_URL: process.env.NEXT_PUBLIC_ORCH_URL || GATEWAY_URL,
    NEXT_PUBLIC_AI_URL: process.env.NEXT_PUBLIC_AI_URL || GATEWAY_URL,
    NEXT_PUBLIC_EXEC_URL: process.env.NEXT_PUBLIC_EXEC_URL || GATEWAY_URL,
    NEXT_PUBLIC_VIDEO_URL: process.env.NEXT_PUBLIC_VIDEO_URL || GATEWAY_URL,
    NEXT_PUBLIC_FEEDBACK_URL: process.env.NEXT_PUBLIC_FEEDBACK_URL || GATEWAY_URL,
    NEXT_PUBLIC_NOTIF_URL: process.env.NEXT_PUBLIC_NOTIF_URL || GATEWAY_URL,
    NEXT_PUBLIC_ANALYTICS_URL: process.env.NEXT_PUBLIC_ANALYTICS_URL || GATEWAY_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL || GATEWAY_URL,
    NEXT_PUBLIC_FILE_URL: process.env.NEXT_PUBLIC_FILE_URL || GATEWAY_URL,
    NEXT_PUBLIC_PAYMENT_URL: process.env.NEXT_PUBLIC_PAYMENT_URL || GATEWAY_URL,
    NEXT_PUBLIC_SEARCH_URL: process.env.NEXT_PUBLIC_SEARCH_URL || GATEWAY_URL,
    // WebSocket connects directly to notification service (not proxied by gateway)
    NEXT_PUBLIC_NOTIF_WS_URL: process.env.NEXT_PUBLIC_NOTIF_WS_URL || 'ws://localhost:8008',
  },
  async rewrites() {
    const AI_SVC      = process.env.NEXT_PUBLIC_AI_URL      || 'http://localhost:8004';
    const AUTH_SVC    = process.env.NEXT_PUBLIC_AUTH_URL    || 'http://localhost:8001';
    const USER_SVC    = process.env.NEXT_PUBLIC_USER_URL    || 'http://localhost:8002';
    const ORCH_SVC    = process.env.NEXT_PUBLIC_ORCH_URL    || 'http://localhost:8003';
    const EXEC_SVC    = process.env.NEXT_PUBLIC_EXEC_URL    || 'http://localhost:8005';
    const VIDEO_SVC   = process.env.NEXT_PUBLIC_VIDEO_URL   || 'http://localhost:8006';
    const FEEDBACK_SVC= process.env.NEXT_PUBLIC_FEEDBACK_URL|| 'http://localhost:8007';
    const NOTIF_SVC   = process.env.NEXT_PUBLIC_NOTIF_URL   || 'http://localhost:8008';
    const ANALYTICS_SVC=process.env.NEXT_PUBLIC_ANALYTICS_URL||'http://localhost:8009';
    const ADMIN_SVC   = process.env.NEXT_PUBLIC_ADMIN_URL   || 'http://localhost:8010';
    const FILE_SVC    = process.env.NEXT_PUBLIC_FILE_URL    || 'http://localhost:8011';
    const PAYMENT_SVC = process.env.NEXT_PUBLIC_PAYMENT_URL || 'http://localhost:8012';
    const SEARCH_SVC  = process.env.NEXT_PUBLIC_SEARCH_URL  || 'http://localhost:8013';

    return [
      // AI Interviewer Service (interview, transcribe, hint, feedback)
      { source: '/api/v1/interview/:path*',     destination: `${AI_SVC}/api/v1/interview/:path*` },
      // Auth Service
      { source: '/api/v1/auth/:path*',          destination: `${AUTH_SVC}/api/v1/auth/:path*` },
      // User Service
      { source: '/api/v1/users/:path*',         destination: `${USER_SVC}/api/v1/users/:path*` },
      // Orchestrator Service (sessions)
      { source: '/api/v1/sessions/:path*',      destination: `${ORCH_SVC}/api/v1/sessions/:path*` },
      // Code Execution Service
      { source: '/api/v1/execute/:path*',       destination: `${EXEC_SVC}/api/v1/execute/:path*` },
      // Video Service
      { source: '/api/v1/video/:path*',         destination: `${VIDEO_SVC}/api/v1/video/:path*` },
      // Feedback Service
      { source: '/api/v1/feedback/:path*',      destination: `${FEEDBACK_SVC}/api/v1/feedback/:path*` },
      // Notification Service
      { source: '/api/v1/notifications/:path*', destination: `${NOTIF_SVC}/api/v1/notifications/:path*` },
      // Analytics Service
      { source: '/api/v1/analytics/:path*',     destination: `${ANALYTICS_SVC}/api/v1/analytics/:path*` },
      // Admin Service
      { source: '/api/v1/admin/:path*',         destination: `${ADMIN_SVC}/api/v1/admin/:path*` },
      // File Service
      { source: '/api/v1/files/:path*',         destination: `${FILE_SVC}/api/v1/files/:path*` },
      // Payment Service
      { source: '/api/v1/payments/:path*',      destination: `${PAYMENT_SVC}/api/v1/payments/:path*` },
      // Search Service
      { source: '/api/v1/search/:path*',        destination: `${SEARCH_SVC}/api/v1/search/:path*` },
      // Fallback to gateway for anything not matched above
      { source: '/api/v1/:path*',               destination: `${GATEWAY_URL}/api/v1/:path*` },
    ];
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
