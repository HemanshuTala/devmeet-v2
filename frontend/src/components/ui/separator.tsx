/**
 * @file separator.tsx
 * @description Accessible Horizontal and Vertical Visual Divider for DevMeet.
 *
 * Built on `@radix-ui/react-separator`:
 * - Automatically provides appropriate ARIA role (`separator` when semantic, or `none`/`presentation` when decorative).
 * - Adapts dimensions and layout based on `orientation` ('horizontal' for `h-[1px] w-full`, 'vertical' for `h-full w-[1px]`).
 * - Supports flex shrinking prevention (`shrink-0`) to maintain crisp 1px lines across dynamic layouts.
 *
 * @module components/ui/separator
 */

'use client';

import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

/**
 * Separator Component.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>} props - Radix separator props.
 * @param {'horizontal' | 'vertical'} [props.orientation='horizontal'] - Orientation direction of the divider.
 * @param {boolean} [props.decorative=true] - Whether the divider is purely decorative or represents a semantic section break.
 * @param {string} [props.className] - Optional custom CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Radix Separator element styled with 1px slate color.
 */
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-slate-200',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
