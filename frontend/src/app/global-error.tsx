/**
 * @file global-error.tsx
 * @description Next.js App Router Global Catch-All Error Boundary for DevMeet.
 *
 * Special Next.js Convention:
 * - Catches fatal errors thrown inside the root `app/layout.tsx` or top-level providers.
 * - Because it replaces the root layout when an error occurs, it MUST define its own `<html>` and `<body>` tags.
 * - Logs fatal exceptions for error reporting and telemetry.
 * - Provides a "Try again" action (`reset()`) to attempt re-rendering the root segment without a full page reload.
 *
 * @module app/global-error
 */

'use client';

import { useEffect } from 'react';

/**
 * GlobalError Component.
 *
 * @component
 * @param {Object} props
 * @param {Error & { digest?: string }} props.error - Fatal error instance with optional Next.js digest hash.
 * @param {() => void} props.reset - Next.js router function to re-attempt rendering the failed segment.
 * @returns {JSX.Element} Minimal standalone HTML document with fatal error UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log fatal unhandled exceptions to console or telemetry services
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: '#0a0f1e', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '4rem', height: '4rem', borderRadius: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>{error.message || 'An unexpected error occurred.'}</p>
            {/* Re-render recovery button */}
            <button
              onClick={reset}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 2rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
