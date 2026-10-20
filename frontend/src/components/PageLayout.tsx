/**
 * @file PageLayout.tsx
 * @description Standard Application Page Shell Wrapper for DevMeet.
 *
 * Provides a consistent structural container across authenticated views:
 * - Wraps views in a full-viewport background with CSS variable theming (`var(--color-bg-primary)`).
 * - Mounts the global sticky navigation header ([Navbar](file:///e:/AI%20INTERVIEW/frontend/src/components/Navbar.tsx)).
 * - Constrains content width to `max-w-7xl` (configurable via `maxWidth`) with standardized padding.
 *
 * @module components/PageLayout
 */

import React from 'react';
import Navbar from '@/components/Navbar';

/**
 * Props accepted by the PageLayout component.
 */
interface PageLayoutProps {
  /** Page content elements. */
  children: React.ReactNode;
  /** Optional custom CSS classes appended to the `<main>` container. */
  className?: string;
  /** Max width Tailwind constraint class (defaults to 'max-w-7xl'). */
  maxWidth?: string;
}

/**
 * PageLayout Shell Component.
 *
 * @component
 * @param {PageLayoutProps} props
 * @returns {JSX.Element} Full-page layout wrapper with Navbar and centered main content.
 */
export default function PageLayout({
  children,
  className = '',
  maxWidth = 'max-w-7xl',
}: PageLayoutProps) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Universal Top Navigation */}
      <Navbar />
      {/* Centered responsive main content area */}
      <main className={`${maxWidth} mx-auto px-4 py-8 ${className}`}>
        {children}
      </main>
    </div>
  );
}
