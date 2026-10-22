'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Centralized HTTP API Client & Microservice SDK
 * ============================================================================
 * This module is the single authoritative networking client for all frontend API
 * interactions across DevMeet's 10 microservices.
 *
 * Core Capabilities & Architectural Patterns:
 * 1. Automatic JWT Bearer Authentication & Token Storage:
 *    - Automatically injects `Authorization: Bearer <token>` from localStorage.
 * 2. Self-Healing Token Refresh (401 Interceptor):
 *    - On encountering HTTP 401 Unauthorized, automatically triggers a silent refresh
 *      cycle (`/api/v1/auth/refresh`), updates tokens, and retries the original request.
 * 3. Standardized Error Normalization:
 *    - Parses FastAPI validation errors (422) into clean human-readable error messages.
 *    - Throws strongly-typed `ApiError` instances containing status codes and payload details.
 * 4. Microservice Domain Namespaces:
 *    - `apiClient`: Core session, token storage, and authentication.
 *    - `authApi`: Multi-factor auth (MFA/TOTP), email verification, and password resets.
 *    - `userApi`: Profile management, avatar upload, and leaderboard queries.
 *    - `sessionApi`: Interview session state machine, code submissions, and proctoring.
 *    - `aiApi`: Speech-to-text audio transcription and AI hint requests.
 *    - `executionApi`: Code execution sandbox submissions (sync and async).
 *    - `analyticsApi`: User dashboard telemetry and score trend charts.
 *    - `adminApi`: Platform statistics, user moderation, and support impersonation.
 *    - `paymentApi`: Razorpay orders, subscription billing, and webhook simulations.
 *    - `searchApi`: Question bank discovery and random problem dispatch.
 *    - `videoApi`: WebRTC LiveKit tokens, pre-flight device diagnostics, and recordings.
 *    - `feedbackApi`: Session scoring rubrics, radar metrics, and PDF exports.
 * ============================================================================
 */

import { ApiError } from './api-errors';

// Base Gateway URL resolved from environment variables with local fallback and tunnel resilience
const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // In the browser, always use relative paths so requests stay on the current origin
    // (whether accessing via localhost, custom domain, or a Cloudflare tunnel URL).
    // This completely eliminates CORS preflight failures and mixed-content blocking.
    return '';
  }
  return process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api-gateway:8000';
};
const API_BASE_URL = getApiBaseUrl();


// ─── Domain Interface Declarations ───────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

export interface MfaLoginChallenge {
  mfa_required: true;
  mfa_token: string;
  expires_in: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  display_name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  role?: string;
  target_companies?: string[];
  skills?: string[];
  interview_reminder_enabled?: boolean;
  profile_public?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfileUpdate {
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  target_companies?: string[];
  skills?: string[];
  interview_reminder_enabled?: boolean;
  profile_public?: boolean;
}

export interface CreateSessionRequest {
  interview_type: string;
  difficulty: string;
  target_company?: string;
  focus_area?: string;
  duration_minutes: number;
  recording_consent?: boolean;
}

export interface Session {
  id: string;
  user_id: string;
  interview_type: string;
  difficulty: string;
  target_company?: string | null;
  focus_area?: string | null;
  duration_minutes?: number;
  status: string;
  created_at: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  elapsed_seconds?: number;
  tab_switch_count?: number;
  paste_count?: number;
  recording_consent?: boolean;
}

export interface SearchQuestion {
  id?: string;
  title: string;
  description: string;
  interview_type: string;
  difficulty: string;
  tags?: string[];
  company_tags?: string[];
  category?: string;
  seed_question?: string;
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  timeoutMs?: number;
};


// ─── Token & Environment Helpers ─────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getAccessToken(): string | null {
  return isBrowser() ? localStorage.getItem('access_token') : null;
}

function getRefreshToken(): string | null {
  return isBrowser() ? localStorage.getItem('refresh_token') : null;
}

function storeTokens(tokens: TokenResponse): void {
  if (!isBrowser()) return;
  localStorage.setItem('access_token', tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem('refresh_token', tokens.refresh_token);
  }
}

// ─── Single-Flight Refresh Synchronization ────────────────────────────────────
// Prevents multiple concurrent 401s from triggering competing refresh cycles.
let refreshPromise: Promise<TokenResponse | null> | null = null;

async function executeSingleFlightRefresh(): Promise<TokenResponse | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        return null;
      }
      const tokens = await request<TokenResponse>('/api/v1/auth/refresh', {
        ...json('POST', { refresh_token: refreshToken }),
        auth: false,
        retryOnUnauthorized: false,
      });
      storeTokens(tokens);
      return tokens;
    } catch (err) {
      // Clear invalid credentials on definitive auth failure
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        if (isBrowser()) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (
    contentType.includes('application/pdf') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('text/csv')
  ) {
    return response.blob() as Promise<T>;
  }
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text() as Promise<T>;
}


// ─── Core Request Dispatcher ─────────────────────────────────────────────────

/**
 * Core HTTP dispatcher that executes requests against the API Gateway with
 * automated authentication injection, retry handling, and error formatting.
 *
 * @param path - API endpoint route path (e.g. `/api/v1/auth/login`).
 * @param options - Request options including authorization, timeout, and retry flags.
 * @returns Parsed JSON response body.
 * @throws ApiError on non-2xx status code.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retryOnUnauthorized = true, timeoutMs, headers, signal, ...init } = options;
  const token = getAccessToken();
  const requestHeaders = new Headers(headers);

  // Set default JSON content type unless sending binary multipart form data
  if (!requestHeaders.has('Content-Type') && !(init.body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  // Inject Bearer JWT authorization header
  if (auth && token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  // Propagate trace correlation ID if available
  if (!requestHeaders.has('X-Request-ID') && isBrowser()) {
    const traceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `fe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    requestHeaders.set('X-Request-ID', traceId);
  }

  // Optional client-side request timeout controller
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let effectiveSignal = signal;

  if (timeoutMs && !signal && typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    effectiveSignal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: requestHeaders,
      credentials: 'include',
      signal: effectiveSignal,
    });

    // Handle token expiration via single-flight silent refresh
    if (response.status === 401 && retryOnUnauthorized && auth) {
      const refreshed = await executeSingleFlightRefresh();
      if (refreshed) {
        // Retry original request once with fresh access token
        return request<T>(path, { ...options, retryOnUnauthorized: false });
      }
    }

    // Handle HTTP error responses
    if (!response.ok) {
      const payload = await parseResponse<any>(response).catch(() => null);
      let message = payload?.detail || payload?.message || response.statusText;
      
      // Normalize FastAPI 422 Unprocessable Entity array payloads
      if (response.status === 422 && Array.isArray(payload?.detail)) {
        message = payload.detail.map((err: any) => err.msg).join(', ');
      }
      throw new ApiError(
        response.status,
        typeof message === 'string' ? message : JSON.stringify(message),
        payload
      );
    }

    return parseResponse<T>(response);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}


// ─── Domain API Modules ──────────────────────────────────────────────────────

/**
 * Core Authentication and Session Identity Client
 */
export const apiClient = {
  getTokens() {
    return {
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
    };
  },
  clearTokens() {
    if (!isBrowser()) return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  async login(credentials: LoginCredentials) {
    const result = await request<TokenResponse | MfaLoginChallenge>('/api/v1/auth/login', {
      ...json('POST', credentials),
      auth: false,
    });
    if ('access_token' in result) storeTokens(result);
    return result;
  },
  async register(data: RegisterData) {
    const tokens = await request<TokenResponse>('/api/v1/auth/register', {
      ...json('POST', data),
      auth: false,
    });
    storeTokens(tokens);
    return tokens;
  },
  async refreshToken(): Promise<TokenResponse | null> {
    return executeSingleFlightRefresh();
  },
  async logout() {
    await request('/api/v1/auth/logout', json('POST')).catch(() => null);
    this.clearTokens();
  },
  getUserProfile() {
    return request<UserProfile>('/api/v1/auth/me');
  },
};

/**
 * Security, MFA, and Credential Recovery Endpoints
 */
export const authApi = {
  changePassword: (current_password: string, new_password: string) =>
    request('/api/v1/auth/change-password', json('POST', { current_password, new_password })),
  requestPasswordReset: (email: string) =>
    request('/api/v1/auth/reset-password-request', { ...json('POST', { email }), auth: false }),
  confirmPasswordReset: (token: string, new_password: string) =>
    request('/api/v1/auth/reset-password-confirm', { ...json('POST', { token, new_password }), auth: false }),
  requestEmailVerification: () => request<{ message: string }>('/api/v1/auth/verify-email/request', json('POST')),
  confirmEmailVerification: (token: string) =>
    request(`/api/v1/auth/verify-email/confirm?token=${encodeURIComponent(token)}`, json('POST')),
  enableMfa: () => request<{ secret: string; provisioning_uri: string }>('/api/v1/auth/mfa/enable', json('POST')),
  verifyMfaEnrollment: (totp_code: string) =>
    request(`/api/v1/auth/mfa/verify?totp_code=${encodeURIComponent(totp_code)}`, json('POST')),
  getMfaBackupCodes: () => request<{ backup_codes: string[] }>('/api/v1/auth/mfa/backup-codes', json('POST')),
  disableMfa: (totp_code: string) =>
    request(`/api/v1/auth/mfa/disable?totp_code=${encodeURIComponent(totp_code)}`, json('POST')),
  async verifyMfaLogin(data: { mfa_token: string; totp_code?: string; backup_code?: string }) {
    const tokens = await request<TokenResponse>('/api/v1/auth/mfa/login-verify', {
      ...json('POST', data),
      auth: false,
    });
    storeTokens(tokens);
    return tokens;
  },
};

/**
 * Candidate Profile and Entitlement Endpoints
 */
export const userApi = {
  getProfile: () => request<UserProfile>('/api/v1/users/me'),
  updateProfile: (updates: UserProfileUpdate) => request<UserProfile>('/api/v1/users/me', json('PUT', updates)),
  getQuota: () => request<any>('/api/v1/users/me/quota'),
  getPlan: () => request<any>('/api/v1/users/me/plan'),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ avatar_url: string }>('/api/v1/users/me/avatar', { method: 'POST', body: formData });
  },
  exportData: () => request<Blob>('/api/v1/users/me/export', { headers: { Accept: 'application/json' } }),
  deleteAccount: () => request('/api/v1/users/me', { method: 'DELETE' }),
  getLeaderboard: (limit = 25) => request<any[]>(`/api/v1/users/leaderboard?limit=${limit}`),
};

/**
 * Interview Session Lifecycle and Execution Operations
 */
export const sessionApi = {
  list: () => request<any[]>('/api/v1/sessions'),
  get: (id: string) => request<any>(`/api/v1/sessions/${id}`),
  create: (data: CreateSessionRequest) => request<any>('/api/v1/sessions', json('POST', data)),
  start: (id: string) => request<any>(`/api/v1/sessions/${id}/start`, json('POST')),
  complete: (id: string, elapsed_seconds?: number) =>
    request<any>(`/api/v1/sessions/${id}/complete${elapsed_seconds != null ? `?elapsed_seconds=${elapsed_seconds}` : ''}`, json('POST')),
  pause: (id: string, elapsed_seconds = 0) =>
    request<any>(`/api/v1/sessions/${id}/pause?elapsed_seconds=${elapsed_seconds}`, json('POST')),
  resume: (id: string) => request<any>(`/api/v1/sessions/${id}/resume`, json('POST')),
  cancel: (id: string) => request<any>(`/api/v1/sessions/${id}/cancel`, json('POST')),
  heartbeat: (id: string) => request<any>(`/api/v1/sessions/${id}/heartbeat`, json('POST')),
  reportCheating: (id: string, type: string) => request<any>(`/api/v1/sessions/${id}/cheating`, json('POST', { type })),
  getTurns: (id: string) => request<any[]>(`/api/v1/sessions/${id}/turns`),
  saveTurn: (id: string, role: string, content: string) =>
    request<any>(`/api/v1/sessions/${id}/turns`, json('POST', { role, content })),
  submitCode: (id: string, language: string, code: string) =>
    request<any>(`/api/v1/sessions/${id}/code`, json('POST', { session_id: id, language, code })),
};

/**
 * AI Interviewer Audio and Question Generation
 */
export const aiApi = {
  streamQuestionUrl: () => `${API_BASE_URL}/api/v1/interview/question/stream`,
  transcribeAudio: (formData: FormData) => request<any>('/api/v1/interview/transcribe', { method: 'POST', body: formData }),
  getHint: (payload: unknown) => request<any>('/api/v1/interview/hint', json('POST', payload)),
};

/**
 * Remote Code Execution Sandbox Runner
 */
export const executionApi = {
  execute: (payload: unknown) => request<any>('/api/v1/execute', json('POST', payload)),
  runTests: (payload: {
    code: string;
    language: string;
    test_cases: { input: string; expected_output: string; name?: string; is_hidden?: boolean }[];
    timeout_seconds?: number;
  }) => request<any>('/api/v1/execute/run-tests', json('POST', payload)),
  executeAsync: (payload: unknown) => request<any>('/api/v1/execute/submit-async', json('POST', payload)),
};

/**
 * Performance Analytics and Telemetry
 */
export const analyticsApi = {
  track: (event_type: string, user_id?: string, session_id?: string, metadata?: Record<string, unknown>) =>
    request('/api/v1/analytics/event', json('POST', { event_type, user_id, session_id, properties: metadata })).catch(() => null),
  getUserDashboard: (userId: string, days = 90) =>
    request<any>(`/api/v1/analytics/user/${userId}/dashboard?days=${days}`),
  getUserScoreTrend: (userId: string, days = 30) =>
    request<any>(`/api/v1/analytics/user/${userId}/score-trend?days=${days}`),
  exportSessionsCsv: async (days = 30, interviewType?: string) => {
    const query = new URLSearchParams({ days: String(days) });
    if (interviewType) query.set('interview_type', interviewType);
    return request<Blob>(`/api/v1/analytics/export/sessions.csv?${query.toString()}`, {
      headers: { Accept: 'text/csv' },
    });
  },
  exportEventsCsv: async (days = 7, eventType?: string) => {
    const query = new URLSearchParams({ days: String(days) });
    if (eventType) query.set('event_type', eventType);
    return request<Blob>(`/api/v1/analytics/export/events.csv?${query.toString()}`, {
      headers: { Accept: 'text/csv' },
    });
  },
};

/**
 * Administrative Platform Management
 */
export const adminApi = {
  getStats: () => request<any>('/api/v1/admin/stats'),
  listUsers: (q?: string, limit = 50, offset = 0) =>
    request<any>(`/api/v1/admin/users?limit=${limit}&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  getAuditLogs: (userId?: string, limit = 30, offset = 0) =>
    request<any>(`/api/v1/admin/audit-logs?limit=${limit}&offset=${offset}${userId ? `&user_id=${userId}` : ''}`),
  blockUser: (id: string) => request(`/api/v1/admin/users/${id}/block`, json('POST')),
  unblockUser: (id: string) => request(`/api/v1/admin/users/${id}/unblock`, json('POST')),
  changePlan: (id: string, plan: string) => request(`/api/v1/admin/users/${id}/plan`, json('PUT', { plan })),
  deleteUser: (id: string) => request(`/api/v1/admin/users/${id}`, { method: 'DELETE' }),
  impersonateUser: (id: string) => request<TokenResponse>(`/api/v1/admin/users/${id}/impersonate`, json('POST')),
};

/**
 * Subscription Checkout and Billing Gateway
 */
export const paymentApi = {
  getConfig: () => request<{ provider: string; mode: string; currency: string; razorpay_enabled?: boolean }>('/api/v1/payments/config'),
  getPlans: () => request<any>('/api/v1/payments/plans'),
  getSubscription: () => request<any>('/api/v1/payments/subscription'),
  getBillingHistory: () => request<any>('/api/v1/payments/billing-history'),
  createCheckoutSession: (plan: string) =>
    request<any>('/api/v1/payments/checkout-session', json('POST', {
      plan,
      success_url: typeof window !== 'undefined' ? `${window.location.origin}/billing?payment=success` : '',
      cancel_url: typeof window !== 'undefined' ? `${window.location.origin}/billing?payment=cancelled` : '',
    })),
  upgradePlan: (plan: string) => request('/api/v1/payments/upgrade', json('POST', { plan })),
  verifyPayment: (payload: unknown) => request('/api/v1/payments/verify-payment', json('POST', payload)),
  mockWebhook: (user_id: string, plan: string, event_type: string) =>
    request('/api/v1/payments/mock-webhook', json('POST', { user_id, plan, event_type })),
  cancelSubscription: () => request('/api/v1/payments/cancel', json('POST')),
};

/**
 * Question Bank Search and Problem Discovery
 */
export const searchApi = {
  search: (params: Record<string, unknown>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    });
    return request<any>(`/api/v1/search/questions?${qs.toString()}`);
  },
  getRandom: (interview_type?: string, difficulty?: string, company?: string) => {
    const qs = new URLSearchParams();
    if (interview_type) qs.set('interview_type', interview_type);
    if (difficulty) qs.set('difficulty', difficulty);
    if (company) qs.set('company', company);
    return request<any>(`/api/v1/search/questions/random?${qs.toString()}`);
  },
};

/**
 * WebRTC Video, Audio Diagnostics, and Session Recording
 */
export const videoApi = {
  getToken: (room_name: string, participant_identity: string, participant_name?: string) =>
    request<any>('/api/v1/video/token', json('POST', { room_name, participant_identity, participant_name })),
  preflight: (payload: unknown) => request<any>('/api/v1/video/preflight', json('POST', payload)),
  startRecording: (room_name: string, user_id: string, consent: boolean) =>
    request(`/api/v1/video/room/${room_name}/recording/start`, json('POST', { room_name, user_id, consent })),
  stopRecording: (room_name: string, user_id: string) =>
    request(`/api/v1/video/room/${room_name}/recording/stop`, json('POST', { room_name, user_id })),
  uploadRecording: (room_name: string, videoBlob: Blob, filename?: string) =>
    request<any>(`/api/v1/video/room/${room_name}/recording/upload`, {
      method: 'POST',
      body: videoBlob,
      headers: {
        'Content-Type': videoBlob.type || 'video/webm',
        'X-Filename': filename || `recording_${room_name}.webm`,
      },
    }),
  getRecordingStatus: (room_name: string) =>
    request<any>(`/api/v1/video/room/${room_name}/recording/status`),
  getRecordingPlayUrl: (room_name: string) =>
    `/api/v1/video/room/${encodeURIComponent(room_name)}/recording/play`,
  reportNetworkQuality: (room_name: string, user_id: string, quality: unknown) =>
    request(`/api/v1/video/room/${room_name}/quality`, json('POST', { participant_identity: user_id, metrics: quality })),
};

/**
 * AI Feedback Evaluation and Scorecard Export
 */
export const feedbackApi = {
  get: (sessionId: string) => request<any>(`/api/v1/feedback/${sessionId}`),
  generate: (sessionId: string, payload?: Record<string, unknown>) =>
    request<any>('/api/v1/feedback/generate', json('POST', { session_id: sessionId, ...payload })),
  downloadPdf: (sessionId: string) => request<Blob>(`/api/v1/feedback/${sessionId}/pdf`, { headers: { Accept: 'application/pdf' } }),
};
