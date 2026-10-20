'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Global Authentication Context & Session Provider
 * ============================================================================
 * Coordinates application-wide candidate identity, JWT session initialization,
 * MFA challenge flows, login/registration mutations, and profile state synchronization.
 *
 * Key Architectural Responsibilities:
 * 1. Boot-Time Session Hydration (`checkAuth`):
 *    - On mount, inspects localStorage for existing access/refresh tokens.
 *    - Executes a bounded 4-second race against `/api/v1/auth/me` to hydrate the user profile
 *      without hanging browser initial render if the auth service is restarting.
 * 2. Multi-Factor Authentication (MFA) Support:
 *    - Intercepts `mfa_required` challenges during login and defers session completion
 *      until TOTP or backup code verification via `verifyMfaLogin`.
 * 3. Session Synchronization:
 *    - Exposes `refreshUser()` so profile updates (avatar changes, plan upgrades)
 *      immediately propagate to header navigation badges without requiring full page reloads.
 * 4. Context Hook (`useAuth`):
 *    - Type-safe hook exposing user profile, loading state, and auth lifecycle actions.
 * ============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  apiClient,
  UserProfile,
  LoginCredentials,
  RegisterData,
  TokenResponse,
  MfaLoginChallenge,
  authApi,
} from '@/lib/api';

/**
 * Interface defining the reactive authentication context methods and state attributes.
 */
interface AuthContextType {
  /** Authenticated user profile entity or null if guest */
  user: UserProfile | null;
  /** True during initial session bootstrap or profile verification */
  isLoading: boolean;
  /** Convenience boolean indicating active user session */
  isAuthenticated: boolean;
  /** Authenticates credentials, returning tokens or MFA challenge */
  login: (credentials: LoginCredentials) => Promise<TokenResponse | MfaLoginChallenge>;
  /** Completes 2FA/TOTP login challenge */
  verifyMfaLogin: (data: { mfa_token: string; totp_code?: string; backup_code?: string }) => Promise<void>;
  /** Registers a new candidate and immediately establishes session */
  register: (data: RegisterData) => Promise<void>;
  /** Revokes tokens and resets session state */
  logout: () => Promise<void>;
  /** Re-queries current user profile from server to sync mutations */
  refreshUser: () => Promise<void>;
}

// React context instance
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Higher-order provider component wrapping the application to supply authentication state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Boot-time check verifying whether stored tokens correspond to an active session.
   */
  const checkAuth = useCallback(async () => {
    try {
      let tokens: { accessToken: string | null; refreshToken?: string | null } | null = null;
      try {
        tokens = apiClient.getTokens();
      } catch (tokenErr) {
        console.error('Failed to retrieve stored tokens:', tokenErr);
      }

      // If no token exists in localStorage, user is a guest
      if (!tokens || !tokens.accessToken) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Enforce a strict 4-second timeout to prevent UI hanging if auth-service is cold-starting
        const profilePromise = apiClient.getUserProfile();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timed out')), 4000)
        );
        
        // Race between network fetch and timeout
        const profile = await Promise.race([profilePromise, timeoutPromise]);
        setUser(profile);
      } catch (profileErr) {
        console.error('Profile fetch failed or timed out:', profileErr);
        // Clear stale or expired tokens on network or authentication failure
        try {
          apiClient.clearTokens();
        } catch (clearErr) {
          console.error('Failed to clear stored tokens:', clearErr);
        }
      }
    } catch (error) {
      console.error('Auth check main loop failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Execute session check on initial component mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /**
   * Performs credential login, evaluating MFA challenge requirements.
   */
  const login = async (credentials: LoginCredentials) => {
    const result = await apiClient.login(credentials);
    // If MFA is required, halt here and return challenge payload to login dialog
    if ('mfa_required' in result && result.mfa_required) {
      return result;
    }
    // Fetch and store user profile on successful authentication
    const profile = await apiClient.getUserProfile();
    setUser(profile);
    return result;
  };

  /**
   * Completes secondary MFA verification step.
   */
  const verifyMfaLogin = async (data: {
    mfa_token: string;
    totp_code?: string;
    backup_code?: string;
  }) => {
    await authApi.verifyMfaLogin(data);
    const profile = await apiClient.getUserProfile();
    setUser(profile);
  };

  /**
   * Registers a new candidate account and auto-signs in.
   */
  const register = async (data: RegisterData) => {
    await apiClient.register(data);
    const profile = await apiClient.getUserProfile();
    setUser(profile);
  };

  /**
   * Terminates active session, clears storage tokens, and alerts user.
   */
  const logout = async () => {
    await apiClient.logout();
    setUser(null);
    toast.success('Signed out');
  };

  /**
   * Re-fetches user profile from backend to update client badges and permissions.
   */
  const refreshUser = async () => {
    const profile = await apiClient.getUserProfile();
    setUser(profile);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        verifyMfaLogin,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Custom React hook for accessing the active authentication context.
 *
 * @throws Error if called outside of `<AuthProvider>`.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
