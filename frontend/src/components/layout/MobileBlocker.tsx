'use client';

import { Monitor, Laptop, Brain } from 'lucide-react';

const DEVICES = [
  { icon: Laptop, label: 'Laptop' },
  { icon: Monitor, label: 'Desktop' },
];

export function MobileBlocker() {
  return (
    <div
      id="mobile-blocker"
      aria-hidden="true"
      style={{
        display: 'none', // overridden by CSS on small screens
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
      {/* Subtle background pattern */}
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

      {/* Card */}
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
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#4f46e5',
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

        {/* Icon badge */}
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 18,
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Monitor style={{ width: 30, height: 30, color: '#4f46e5' }} />
        </div>

        {/* Heading */}
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

        {/* Device badges */}
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

        {/* Footer hint */}
        <p
          style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Already on a large screen?{' '}
          <span style={{ color: '#4f46e5', fontWeight: 600 }}>
            Try rotating to landscape
          </span>{' '}
          or zooming out your browser.
        </p>
      </div>
    </div>
  );
}
