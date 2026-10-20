/**
 * @file popover.tsx
 * @description Accessible Floating Popover Component for DevMeet.
 *
 * Built on `@radix-ui/react-popover`:
 * - Portaled rendering: Popover content mounts in a portal at `document.body` to avoid clipping by `overflow: hidden` parent containers.
 * - Dynamic positioning & collisions: Radix handles alignment, collision detection with viewport boundaries, and side flipping automatically.
 * - Keyboard & focus management: Trap focus when opened and restore focus to trigger upon dismissal (Escape or click outside).
 * - Smooth CSS keyframe transitions: Fade and zoom animations responding to `data-[state=open|closed]`.
 *
 * @module components/ui/popover
 */

'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

/**
 * Root popover state container managing open/closed states.
 */
const Popover = PopoverPrimitive.Root;

/**
 * Interactive button or element that toggles the popover display.
 */
const PopoverTrigger = PopoverPrimitive.Trigger;

/**
 * Optional anchor element to position popover content relative to a specific node instead of trigger.
 */
const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * Portaled popover content panel.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>} props - Radix popover content props.
 * @param {'start' | 'center' | 'end'} [props.align='center'] - Alignment relative to trigger anchor.
 * @param {number} [props.sideOffset=4] - Distance in pixels from the anchor element.
 * @param {string} [props.className] - Optional custom CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference to the popover panel.
 * @returns {JSX.Element} Radix Popover Portal with styled Content panel.
 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  // Mount in a portal to prevent parent overflow/stacking context clipping
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // High z-index, fixed width, border and backdrop styling
        'z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg outline-none',
        // Directional slide & zoom animations synchronized with Radix state attributes
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));

PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
