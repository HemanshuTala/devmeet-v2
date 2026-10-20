/**
 * ============================================================================
 * DevMeet Frontend - Client Network Status & Reconnection Hook
 * ============================================================================
 * Tracks browser connectivity state using HTML5 `navigator.onLine` and window
 * 'online' / 'offline' event listeners.
 *
 * Why this exists:
 * - Alerts candidates immediately during live coding or audio interviews if their
 *   internet connection drops, preventing loss of code progress or unanswered questions.
 * - Records reconnection events (`wasOffline: true`) to display reassuring "Reconnected"
 *   toast banners and trigger query invalidation.
 * ============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * State object representing the client's connectivity status.
 */
interface NetworkStatus {
  /** True if browser currently has active internet connectivity */
  isOnline: boolean;
  /** True if client recently recovered from an offline state */
  wasOffline: boolean;
  /** Unix timestamp in ms when connection was lost, or null */
  offlineSince: number | null;
}

/**
 * Custom React hook monitoring browser online/offline lifecycle events.
 *
 * @returns NetworkStatus state object plus `clearWasOffline` reset action.
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
    offlineSince: null,
  });
  const offlineSinceRef = useRef<number | null>(null);

  /**
   * Event handler triggered when browser detects network connectivity restoration.
   */
  const handleOnline = useCallback(() => {
    offlineSinceRef.current = null;
    setStatus({ isOnline: true, wasOffline: true, offlineSince: null });
  }, []);

  /**
   * Event handler triggered when browser drops offline.
   */
  const handleOffline = useCallback(() => {
    const now = Date.now();
    offlineSinceRef.current = now;
    setStatus({ isOnline: false, wasOffline: false, offlineSince: now });
  }, []);

  /**
   * Resets the `wasOffline` notification flag once the UI has displayed a reconnection alert.
   */
  const clearWasOffline = useCallback(() => {
    setStatus((prev) => ({ ...prev, wasOffline: false }));
  }, []);

  useEffect(() => {
    // Attach browser window event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { ...status, clearWasOffline };
}
