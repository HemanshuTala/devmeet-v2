/**
 * ============================================================================
 * DevMeet Frontend - Next.js Framework Configuration & Reverse Proxy Routing
 * ============================================================================
 * This configuration manages:
 * 1. Docker Production Build Mode:
 *    - `output: 'standalone'`: Bundles Node.js server dependencies into `.next/standalone`
 *      for minimal Docker container footprints.
 * 2. Reverse Proxy Rewrites:
 *    - Next.js acts as the primary reverse proxy during development, rewriting client
 *      API calls (`/api/v1/*`) to the designated backend microservices.
 * 3. Environment Ingestion:
 *    - Injects backend service endpoints into `NEXT_PUBLIC_*` client variables.
 * 4. Image Domain Security:
 *    - Grants remote image loading from secure HTTPS CDNs and S3 buckets.
 * ============================================================================
 * @type {import('next').NextConfig}
 */

// Default API Gateway root URL
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost';

const nextConfig = {
  // Enforce React strict mode for highlighting potential side-effects and hydration bugs
  reactStrictMode: true,
  // Disable automatic font optimization when running in air-gapped or offline containers
  optimizeFonts: false,
  // Required for Docker deployment: compiles a self-contained runtime into .next/standalone
  output: 'standalone',
  // Skip compiler type checks during rapid CI image builds (handled in separate test step)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Public client-side runtime environment variables
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
    NEXT_PUBLIC_ANALYTICS_URL: process.env.NEXT_PUBLIC_ANALYTICS_URL || GATEWAY_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL || GATEWAY_URL,
    NEXT_PUBLIC_FILE_URL: process.env.NEXT_PUBLIC_FILE_URL || GATEWAY_URL,
    NEXT_PUBLIC_PAYMENT_URL: process.env.NEXT_PUBLIC_PAYMENT_URL || GATEWAY_URL,
    NEXT_PUBLIC_SEARCH_URL: process.env.NEXT_PUBLIC_SEARCH_URL || GATEWAY_URL,
  },

  /**
   * Defines reverse-proxy path rewrites mapping frontend API calls directly
   * to corresponding backend microservices.
   *
   * @returns {Promise<Array<Object>>} List of Next.js URL rewrite rules.
   */
  async rewrites() {
    const AI_SVC       = process.env.NEXT_PUBLIC_AI_URL       || 'http://localhost:8004';
    const AUTH_SVC     = process.env.NEXT_PUBLIC_AUTH_URL     || 'http://localhost:8001';
    const USER_SVC     = process.env.NEXT_PUBLIC_USER_URL     || 'http://localhost:8002';
    const ORCH_SVC     = process.env.NEXT_PUBLIC_ORCH_URL     || 'http://localhost:8003';
    const EXEC_SVC     = process.env.NEXT_PUBLIC_EXEC_URL     || 'http://localhost:8005';
    const VIDEO_SVC    = process.env.NEXT_PUBLIC_VIDEO_URL    || 'http://localhost:8006';
    const FEEDBACK_SVC = process.env.NEXT_PUBLIC_FEEDBACK_URL || 'http://localhost:8007';
    const ANALYTICS_SVC= process.env.NEXT_PUBLIC_ANALYTICS_URL|| 'http://localhost:8009';
    const ADMIN_SVC    = process.env.NEXT_PUBLIC_ADMIN_URL    || 'http://localhost:8010';
    const FILE_SVC     = process.env.NEXT_PUBLIC_FILE_URL     || 'http://localhost:8011';
    const PAYMENT_SVC  = process.env.NEXT_PUBLIC_PAYMENT_URL  || 'http://localhost:8012';
    const SEARCH_SVC   = process.env.NEXT_PUBLIC_SEARCH_URL   || 'http://localhost:8013';

    return [
      // AI Interviewer Service (LLM streaming, speech recognition, hint generator)
      { source: '/api/v1/interview/:path*',     destination: `${AI_SVC}/api/v1/interview/:path*` },
      // Auth Service (JWT tokens, OAuth, login, registration)
      { source: '/api/v1/auth/:path*',          destination: `${AUTH_SVC}/api/v1/auth/:path*` },
      // User Service (candidate profiles, experience, skills, avatar)
      { source: '/api/v1/users/:path*',         destination: `${USER_SVC}/api/v1/users/:path*` },
      // Orchestrator Service (session lifecycle, state machine, question dispatch)
      { source: '/api/v1/sessions/:path*',      destination: `${ORCH_SVC}/api/v1/sessions/:path*` },
      // Code Execution Service (Docker sandbox runner, test cases)
      { source: '/api/v1/execute/:path*',       destination: `${EXEC_SVC}/api/v1/execute/:path*` },
      // Video Service (WebRTC room tokens, QoS, preflight check)
      { source: '/api/v1/video/:path*',         destination: `${VIDEO_SVC}/api/v1/video/:path*` },
      // Feedback Service (rubric evaluation, radar chart scores, PDF export)
      { source: '/api/v1/feedback/:path*',      destination: `${FEEDBACK_SVC}/api/v1/feedback/:path*` },
      // Analytics Service (streak calendars, score heatmaps, pass rates)
      { source: '/api/v1/analytics/:path*',     destination: `${ANALYTICS_SVC}/api/v1/analytics/:path*` },
      // Admin Service (candidate oversight, account suspension, audit trail)
      { source: '/api/v1/admin/:path*',         destination: `${ADMIN_SVC}/api/v1/admin/:path*` },
      // File Service (resume uploads, presigned S3 URLs)
      { source: '/api/v1/files/:path*',         destination: `${FILE_SVC}/api/v1/files/:path*` },
      // Payment Service (Razorpay orders, subscription billing, verify payment)
      { source: '/api/v1/payments/:path*',      destination: `${PAYMENT_SVC}/api/v1/payments/:path*` },
      // Search Service (question bank discovery, full-text queries)
      { source: '/api/v1/search/:path*',        destination: `${SEARCH_SVC}/api/v1/search/:path*` },
      // Fallback route forwarding unmapped endpoints to main API Gateway
      { source: '/api/v1/:path*',               destination: `${GATEWAY_URL}/api/v1/:path*` },
    ];
  },

  // Remote image optimization security patterns
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
