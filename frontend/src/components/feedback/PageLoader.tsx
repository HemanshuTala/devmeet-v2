/**
 * @file PageLoader.tsx
 * @description Centered Full-Section Loading Spinner for DevMeet.
 *
 * Used as a loading fallback in Next.js suspense boundaries and asynchronous view renders:
 * - Constrains to a minimum height (`min-h-[400px]`) to prevent layout shifts (CLS).
 * - Mounts the brand [Loader](file:///e:/AI%20INTERVIEW/frontend/src/components/ui/loader.tsx) in 'lg' preset with status label.
 *
 * @module components/feedback/PageLoader
 */

'use client';

import { Loader } from '@/components/ui/loader';
import { cn } from '@/lib/utils';

/**
 * Props accepted by PageLoader.
 */
interface PageLoaderProps {
  /** Optional loading message displayed beneath the animated brain node. Defaults to 'Loading...'. */
  label?: string;
  /** Optional custom CSS classes. */
  className?: string;
}

/**
 * PageLoader Component.
 *
 * @component
 * @param {PageLoaderProps} props
 * @returns {JSX.Element} Vertically and horizontally centered loader container.
 */
export function PageLoader({ label = 'Loading...', className }: PageLoaderProps) {
  return (
    <div className={cn('min-h-[400px] w-full flex flex-col items-center justify-center p-8', className)}>
      <Loader size="lg" text={label} />
    </div>
  );
}
