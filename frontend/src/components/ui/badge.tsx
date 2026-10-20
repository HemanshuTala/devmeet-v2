/**
 * ============================================================================
 * DevMeet Frontend - Semantic Status Badge Component (CVA)
 * ============================================================================
 * Renders small pill badges for session status, problem difficulty tiers,
 * subscription plan labels (Pro/Enterprise), and algorithmic tags.
 *
 * Uses `class-variance-authority` (CVA) to manage semantic visual variants:
 * - `default`: Soft blue theme.
 * - `success`: Emerald green theme (passed tests, completed interviews).
 * - `warning`: Amber theme (medium difficulty, proctor warnings).
 * - `danger`: Rose red theme (hard difficulty, cheating strikes, failed tests).
 * - `muted`: Slate gray theme for neutral algorithmic tags.
 * - `pro`: Blue highlight badge for Pro-tier features.
 * ============================================================================
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Class variance configuration for badge styles.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-blue-200 bg-blue-50 text-blue-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-700',
        danger: 'border-rose-200 bg-rose-50 text-rose-700',
        muted: 'border-slate-200 bg-slate-100 text-slate-600',
        pro: 'border-blue-200 bg-blue-50 text-blue-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge component displaying status labels and tag pills.
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
