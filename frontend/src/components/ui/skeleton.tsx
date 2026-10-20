/**
 * @file skeleton.tsx
 * @description Skeleton Placeholder Components for Loading States in DevMeet.
 *
 * Provides animated shimmer placeholders that mimic content layout during asynchronous data fetching:
 * - `Skeleton`: Generic rectangular placeholder with rounded corners.
 * - `SkeletonText`: Line of simulated text with predefined height (`h-4`).
 * - `SkeletonAvatar`: Circular placeholder (`rounded-full`) for user profile avatars.
 * - `SkeletonCard`: Large rounded card container placeholder (`rounded-xl`).
 *
 * Uses the `.skeleton-shimmer` CSS animation class defined in global Tailwind styles for a gradient sweep effect.
 *
 * @module components/ui/skeleton
 */

import { cn } from '@/lib/utils';

/**
 * Generic rectangular skeleton placeholder.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div attributes.
 * @returns {JSX.Element} Shimmering rectangular block.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-lg', className)}
      {...props}
    />
  );
}

/**
 * Skeleton placeholder specialized for simulated text lines.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div attributes.
 * @returns {JSX.Element} Shimmering bar with default height of 1rem (`h-4`).
 */
function SkeletonText({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md h-4', className)}
      {...props}
    />
  );
}

/**
 * Skeleton placeholder specialized for circular avatars.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div attributes.
 * @returns {JSX.Element} Fully circular (`rounded-full`) shimmering container.
 */
function SkeletonAvatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-full', className)}
      {...props}
    />
  );
}

/**
 * Skeleton placeholder specialized for card containers.
 *
 * @component
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Standard HTML div attributes.
 * @returns {JSX.Element} Rounded card container (`rounded-xl`) with shimmer effect.
 */
function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-xl', className)}
      {...props}
    />
  );
}

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard };
