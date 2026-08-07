'use client';

export default function Loading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--color-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.03em',
            }}
          >
            DevMeet
          </span>
        </div>

        {/* Shimmer skeleton bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 200 }}>
          <div className="skeleton-shimmer" style={{ height: 12, borderRadius: 6 }} />
          <div className="skeleton-shimmer" style={{ height: 12, borderRadius: 6, width: '75%' }} />
          <div className="skeleton-shimmer" style={{ height: 12, borderRadius: 6, width: '55%' }} />
        </div>
      </div>
    </div>
  );
}
