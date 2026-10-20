/**
 * ============================================================================
 * DevMeet Frontend - Content Container Card Primitive
 * ============================================================================
 * Foundational container component used across candidate dashboards, interview panels,
 * metrics summaries, and score report breakdowns.
 *
 * Components:
 * - `Card`: Rounded elevated surface (`rounded-2xl`).
 * - `CardHeader`: Flex container for title and descriptive metadata.
 * - `CardTitle`: Bold heading tag (H3).
 * - `CardDescription`: Muted secondary subtitle text.
 * - `CardContent`: Main padded inner content area.
 * ============================================================================
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Root card container component.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-2xl border border-blue-100/80 bg-white text-slate-900 shadow-sm', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

/**
 * Header section of a card containing title and subtitle.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6 pb-4', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

/**
 * Primary title text of a card.
 */
const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-lg font-bold tracking-tight text-slate-900', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

/**
 * Subtitle text explaining the purpose of the card.
 */
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-slate-500', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

/**
 * Body content area of a card.
 */
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
