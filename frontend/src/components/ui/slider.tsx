/**
 * @file slider.tsx
 * @description Accessible Range Slider Input Component for DevMeet.
 *
 * Built on `@radix-ui/react-slider`:
 * - Supports keyboard navigation (Arrow Left/Right/Up/Down, Page Up/Down, Home/End).
 * - Multi-touch and pointer gesture support with automatic coordinate normalization.
 * - Visual track with filled progress range bar and elevated draggable thumb.
 * - Used in settings panels (e.g., volume control, speech rate, interview duration sliders).
 *
 * @module components/ui/slider
 */

'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

/**
 * Slider Component.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>} props - Radix Slider root props.
 * @param {string} [props.className] - Optional custom CSS classes.
 * @param {React.Ref<HTMLSpanElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Interactive range slider with track, range highlight, and thumb.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    {/* Background track */}
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
      {/* Active colored range segment */}
      <SliderPrimitive.Range className="absolute h-full bg-blue-600" />
    </SliderPrimitive.Track>
    {/* Interactive circular thumb handler */}
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-blue-600 bg-white shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
