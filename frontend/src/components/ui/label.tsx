/**
 * @file label.tsx
 * @description Accessible Form Label Component for DevMeet.
 *
 * Built on top of Radix UI's Primitive Label component:
 * - Enhances accessibility by automatically wiring with form controls (input, select, textarea).
 * - Clicking the label triggers focus and click events on the associated form field without manual wiring.
 * - Handles `peer-disabled` visual states so when the associated input peer is disabled, the label automatically dims.
 *
 * @module components/ui/label
 */

'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/**
 * Accessible Label component wrapped with forwardRef.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>} props - Radix UI Label root props.
 * @param {string} [props.className] - Optional custom CSS classes merged via `cn()`.
 * @param {React.Ref<HTMLLabelElement>} ref - Forwarded DOM reference to the label element.
 * @returns {JSX.Element} Radix UI Label root element styled with typography and interaction utilities.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    // Typography: crisp semibold slate text with leading-none.
    // Peer state: automatically dims and changes cursor when an adjacent peer input is disabled.
    className={cn(
      'text-sm font-semibold text-slate-700 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
));

// Retain Radix display name for debugging in React DevTools.
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
