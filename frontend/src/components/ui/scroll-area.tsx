/**
 * @file scroll-area.tsx
 * @description Custom Cross-Browser Styled Scroll Area Component for DevMeet.
 *
 * Built on `@radix-ui/react-scroll-area`:
 * - Replaces native, clunky browser scrollbars with sleek, themeable custom scrollbars.
 * - Supports native scroll physics (kinetic touch scrolling, mouse wheel, trackpad gestures) while maintaining clean visual aesthetics.
 * - Auto-hides scrollbars when idle, revealing them on hover or active scroll.
 * - Fully accessible with keyboard navigation and ARIA attributes for screen readers.
 *
 * @module components/ui/scroll-area
 */

'use client';

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

/**
 * ScrollArea Container Component.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>} props - Radix ScrollArea root props.
 * @param {string} [props.className] - Optional custom CSS classes.
 * @param {React.ReactNode} props.children - Scrollable child elements.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference to root element.
 * @returns {JSX.Element} Fully styled custom scrollable viewport container.
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    {/* Internal viewport that scrolls content while maintaining outer container geometry */}
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    {/* Custom themeable scrollbar track and thumb */}
    <ScrollBar />
    {/* Optional bottom-right corner when both vertical and horizontal scrollbars are present */}
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

/**
 * ScrollBar Component.
 *
 * Renders the interactive vertical or horizontal track with an animated thumb indicator.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>} props - Radix Scrollbar props.
 * @param {'vertical' | 'horizontal'} [props.orientation='vertical'] - Scrollbar direction.
 * @param {string} [props.className] - Optional custom CSS classes.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference to scrollbar track.
 * @returns {JSX.Element} Scrollbar track and draggable thumb.
 */
const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className
    )}
    {...props}
  >
    {/* Draggable thumb pill */}
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-slate-300/80 hover:bg-slate-400/80" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
