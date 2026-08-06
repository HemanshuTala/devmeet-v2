'use client';

import { ApiError } from './api-errors';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';

const NOTIF_WS_URL = process.env.NEXT_PUBLIC_NOTIF_WS_URL || 'ws://localhost:8008';

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

type RequestOptions = RequestInit & {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function getAccessToken() {
  return isBrowser() ? localStorage.getItem('access_token') : null;
}

function getRefreshToken() {
  return isBrowser() ? localStorage.getItem('refresh_token') : null;
}

function storeTokens(tokens: TokenResponse) {
  if (!isBrowser()) return;
  localStorage.setItem('access_token', tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem('refresh_token', tokens.refresh_token);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text() as Promise<T>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retryOnUnauthorized = true, headers, ...init } = options;
  const token = getAccessToken();
  const requestHeaders = new Headers(headers);

  if (!requestHeaders.has('Content-Type') && !(init.body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (auth && token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders,
    credentials: 'include',
  });

  if (response.status === 401 && retryOnUnauthorized && auth) {
    const refreshed = await apiClient.refreshToken().catch(() => null);
    if (refreshed) {
      return request<T>(path, { ...options, retryOnUnauthorized: false });
    }
  }

  if (!response.ok) {
    const payload = await parseResponse<any>(response).catch(() => null);
    let message = payload?.detail || payload?.message || response.statusText;
    if (response.status === 422 && Array.isArray(payload?.detail)) {
      message = payload.detail.map((err: any) => err.msg).join(', ');
    }
    throw new ApiError(response.status, typeof message === 'string' ? message : JSON.stringify(message), payload);
  }

  return parseResponse<T>(response);
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

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
  async refreshToken() {
    const refreshToken = getRefreshToken();
    const tokens = await request<TokenResponse>('/api/v1/auth/refresh', {
      ...json('POST', refreshToken ? { refresh_token: refreshToken } : undefined),
      auth: false,
      retryOnUnauthorized: false,
    });
    storeTokens(tokens);
    return tokens;
  },
  async logout() {
    await request('/api/v1/auth/logout', json('POST')).catch(() => null);
    this.clearTokens();
  },
  getUserProfile() {
    return request<UserProfile>('/api/v1/auth/me');
  },
};

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

export const aiApi = {
  streamQuestionUrl: () => `${API_BASE_URL}/api/v1/interview/question/stream`,
  transcribeAudio: (formData: FormData) => request<any>('/api/v1/interview/transcribe', { method: 'POST', body: formData }),
  getHint: (payload: unknown) => request<any>('/api/v1/interview/hint', json('POST', payload)),
};

export const executionApi = {
  execute: (payload: unknown) => request<any>('/api/v1/execute', json('POST', payload)),
  executeAsync: (payload: unknown) => request<any>('/api/v1/execute/submit-async', json('POST', payload)),
};

export const analyticsApi = {
  track: (event_type: string, user_id?: string, session_id?: string, metadata?: Record<string, unknown>) =>
    request('/api/v1/analytics/event', json('POST', { event_type, user_id, session_id, properties: metadata })).catch(() => null),
  getUserDashboard: (userId: string, days = 90) =>
    request<any>(`/api/v1/analytics/user/${userId}/dashboard?days=${days}`),
  getUserScoreTrend: (userId: string, days = 30) =>
    request<any>(`/api/v1/analytics/user/${userId}/score-trend?days=${days}`),
};

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

export const paymentApi = {
  getConfig: () => request<{ provider: string; razorpay_enabled: boolean; razorpay_key_id?: string; currency: string }>('/api/v1/payments/config'),
  getPlans: () => request<any>('/api/v1/payments/plans'),
  getSubscription: () => request<any>('/api/v1/payments/subscription'),
  getBillingHistory: () => request<any>('/api/v1/payments/billing-history'),
  createCheckoutSession: (plan: string) =>
    request<any>('/api/v1/payments/checkout-session', json('POST', {
      plan,
      success_url: `${window.location.origin}/billing?payment=success`,
      cancel_url: `${window.location.origin}/billing?payment=cancelled`,
    })),
  verifyPayment: (payload: unknown) => request('/api/v1/payments/verify-payment', json('POST', payload)),
  mockWebhook: (user_id: string, plan: string, event_type: string) =>
    request('/api/v1/payments/mock-webhook', json('POST', { user_id, plan, event_type })),
  cancelSubscription: () => request('/api/v1/payments/cancel', json('POST')),
};

export const searchApi = {
  search: (params: Record<string, unknown>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    });
    return request<any>(`/api/v1/search/questions?${qs.toString()}`);
  },
  getRandom: (interview_type?: string, difficulty?: string) => {
    const qs = new URLSearchParams();
    if (interview_type) qs.set('interview_type', interview_type);
    if (difficulty) qs.set('difficulty', difficulty);
    return request<any>(`/api/v1/search/questions/random?${qs.toString()}`);
  },
};

export const videoApi = {
  getToken: (room_name: string, participant_identity: string, participant_name?: string) =>
    request<any>('/api/v1/video/token', json('POST', { room_name, participant_identity, participant_name })),
  preflight: (payload: unknown) => request<any>('/api/v1/video/preflight', json('POST', payload)),
  startRecording: (room_name: string, user_id: string, consent: boolean) =>
    request('/api/v1/video/recording/start', json('POST', { room_name, user_id, consent })),
  stopRecording: (room_name: string, user_id: string) =>
    request('/api/v1/video/recording/stop', json('POST', { room_name, user_id })),
  reportNetworkQuality: (room_name: string, user_id: string, quality: unknown) =>
    request(`/api/v1/video/room/${room_name}/quality`, json('POST', { participant_identity: user_id, metrics: quality })),
};

export const feedbackApi = {
  get: (sessionId: string) => request<any>(`/api/v1/feedback/${sessionId}`),
  generate: (sessionId: string, payload?: Record<string, unknown>) =>
    request<any>('/api/v1/feedback/generate', json('POST', { ...payload, session_id: sessionId })),
  downloadPdf: (sessionId: string) => request<Blob>(`/api/v1/feedback/${sessionId}/pdf`, { headers: { Accept: 'application/pdf' } }),
};

export const notificationApi = {
  getWebSocketUrl: (userId: string) => `${NOTIF_WS_URL}/ws?user_id=${userId}`,
};

