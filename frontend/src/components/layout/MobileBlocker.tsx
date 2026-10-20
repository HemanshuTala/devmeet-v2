/**
 * @file MobileBlocker.tsx
 * @description Viewport Constraint Guard Screen for Small Devices in DevMeet.
 *
 * DevMeet's interview room requires a minimum screen width (>=1024px) because
 * the Monaco code editor, LiveKit video streams, proctoring HUD, and real-time AI chat
 * require concurrent multi-pane desktop layouts.
 *
 * Behavior:
 * - Hidden by default (`display: 'none'`).
 * - Activated via global CSS media query rules (`@media (max-width: 1023px) { #mobile-blocker { display: flex !important; } }`).
 * - Displays a polite advisory card requesting the user switch to a Laptop or Desktop or rotate orientation.
 *
 * @module components/layout/MobileBlocker
 */

'use client';

import { Monitor, Laptop, Brain } from 'lucide-react';

/** Device badges shown as recommended hardware platforms */
const DEVICES = [
  { icon: Laptop, label: 'Laptop' },
  { icon: Monitor, label: 'Desktop' },
];

/**
 * MobileBlocker Component.
 *
 * @component
 * @returns {JSX.Element} Full-viewport overlay activated on narrow mobile/tablet screens.
 */
export function MobileBlocker() {
  return (
    <div
      id="mobile-blocker"
      aria-hidden="true"
      style={{
        display: 'none', // Overridden by media query in global CSS on small screens (< 1024px)
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '28px',
        padding: '32px 24px',
        background: '#fafafa',
        textAlign: 'center',
        overflowY: 'auto',
        touchAction: 'none',
      }}
    >
      {/* Subtle radial dot grid pattern */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(79,70,229,0.06) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }}
      />

      {/* Advisory Card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          background: '#ffffff',
          border: '1px solid #e0e7ff',
          borderRadius: '20px',
          padding: '40px 32px',
          maxWidth: '360px',
          width: '100%',
          boxShadow:
            '0 4px 6px rgba(79,70,229,0.04), 0 10px 30px rgba(79,70,229,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* Brand Logo Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Brain style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#111111',
              letterSpacing: '-0.025em',
            }}
          >
            DevMeet
          </span>
        </div>

        {/* Monitor Icon Badge */}
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 18,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Monitor style={{ width: 30, height: 30, color: '#2563eb' }} />
        </div>

        {/* Informational Message */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h1
            style={{
              fontSize: '1.375rem',
              fontWeight: 800,
              color: '#111111',
              letterSpacing: '-0.025em',
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            Open on a larger screen
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            DevMeet needs a laptop or desktop (1024&nbsp;px+) — the code
            editor, live video feed, and AI chat panel all require the full
            screen width.
          </p>
        </div>

        {/* Supported Platform Badges */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {DEVICES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9999px',
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#5b21b6',
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {label}
            </div>
          ))}
        </div>

        {/* Orientation / Zoom Tip */}
        <p
          style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Already on a large screen?{' '}
          <span style={{ color: '#2563eb', fontWeight: 600 }}>
            Try rotating to landscape
          </span>{' '}
          or zooming out your browser.
        </p>
      </div>
    </div>
  );
}
