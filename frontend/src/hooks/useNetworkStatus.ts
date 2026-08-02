import { useState, useEffect, useCallback, useRef } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  offlineSince: number | null;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
    offlineSince: null,
  });
  const offlineSinceRef = useRef<number | null>(null);

  const handleOnline = useCallback(() => {
    offlineSinceRef.current = null;
    setStatus({ isOnline: true, wasOffline: true, offlineSince: null });
  }, []);

  const handleOffline = useCallback(() => {
    const now = Date.now();
    offlineSinceRef.current = now;
    setStatus({ isOnline: false, wasOffline: false, offlineSince: now });
  }, []);

  const clearWasOffline = useCallback(() => {
    setStatus((prev) => ({ ...prev, wasOffline: false }));
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { ...status, clearWasOffline };
}
