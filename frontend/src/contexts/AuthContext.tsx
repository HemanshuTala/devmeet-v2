'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient, notificationApi, UserProfile, LoginCredentials, RegisterData, TokenResponse, MfaLoginChallenge, authApi } from '@/lib/api';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<TokenResponse | MfaLoginChallenge>;
  verifyMfaLogin: (data: { mfa_token: string; totp_code?: string; backup_code?: string }) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      let tokens = null;
      try {
        tokens = apiClient.getTokens();
      } catch (tokenErr) {
        console.error('Failed to retrieve stored tokens:', tokenErr);
      }

      if (!tokens || !tokens.accessToken) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Set a maximum 4-second timeout for initial auth verification to prevent browser hanging
        const profilePromise = apiClient.getUserProfile();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timed out')), 4000)
        );
        
        const profile = await Promise.race([profilePromise, timeoutPromise]);
        setUser(profile);
      } catch (profileErr) {
        console.error('Profile fetch failed or timed out:', profileErr);
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

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // WebSocket push notifications
  useEffect(() => {
    if (!user) return;

    const userId = user.id;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    function connect() {
      try {
        const wsUrl = notificationApi.getWebSocketUrl(userId);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          reconnectDelay = 1000;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            toast(data.title, {
              description: data.message,
              ...(data.type === 'error' ? { type: 'error' as const } : {}),
            });
          } catch (err) {
            console.error('Failed to parse WS notification:', err);
          }
        };

        ws.onclose = (e) => {
          if (e.code === 1000 || e.code === 1001) return;
          reconnectTimeout = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 30000);
            connect();
          }, reconnectDelay);
        };
      } catch (err) {
        console.error('Failed to initialize Notification WS:', err);
      }
    }

    connect();

    return () => {
      ws?.close(1000, 'User logged out or context unmounted');
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [user]);

  const login = async (credentials: LoginCredentials) => {
    const result = await apiClient.login(credentials);
    if ('mfa_required' in result && result.mfa_required) {
      return result;
    }
    const profile = await apiClient.getUserProfile();
    setUser(profile);
    return result;
  };

  const verifyMfaLogin = async (data: {
    mfa_token: string;
    totp_code?: string;
    backup_code?: string;
  }) => {
    await authApi.verifyMfaLogin(data);
    const profile = await apiClient.getUserProfile();
    setUser(profile);
  };

  const register = async (data: RegisterData) => {
    await apiClient.register(data);
    const profile = await apiClient.getUserProfile();
    setUser(profile);
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
    toast.success('Signed out');
  };

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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
