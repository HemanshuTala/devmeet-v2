/**
 * @file tooltip.tsx
 * @description Accessible Floating Tooltip Component Family for DevMeet.
 *
 * Built on `@radix-ui/react-tooltip`:
 * - Accessible hover & focus tooltips providing auxiliary context on icon buttons and controls.
 * - Delay and warm-up handling via `TooltipProvider`.
 * - Automatic positioning, flip, and arrow/offset alignment.
 * - Direction-aware CSS entry and exit keyframe animations.
 *
 * @module components/ui/tooltip
 */

'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * Global provider configuring tooltip delays and skip-delays across grouped triggers.
 */
const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Root state controller for an individual tooltip instance.
 */
const Tooltip = TooltipPrimitive.Root;

/**
 * Trigger wrapper component attached to the target interactive element.
 */
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * TooltipContent Component.
 *
 * Floating bubble displaying the informative hint text.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>} props
 * @param {number} [props.sideOffset=4] - Distance in pixels from the trigger.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Floating tooltip pill with shadow and entrance animations.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md',
      'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
