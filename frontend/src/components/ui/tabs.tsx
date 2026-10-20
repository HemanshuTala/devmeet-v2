/**
 * @file tabs.tsx
 * @description Accessible Tabbed Interface Component Family for DevMeet.
 *
 * Built on `@radix-ui/react-tabs`:
 * - Implements WAI-ARIA Tabs pattern (`role="tablist"`, `role="tab"`, `role="tabpanel"`).
 * - Automatic keyboard navigation (Arrow Left/Right to change or focus tabs).
 * - State management: Syncs selected tab with `value` and toggles active styling based on `data-[state=active]`.
 * - Subcomponents:
 *   - `Tabs`: Root tabs container.
 *   - `TabsList`: Pill/segment container housing tab buttons.
 *   - `TabsTrigger`: Interactive tab button.
 *   - `TabsContent`: Panel container shown when corresponding tab is selected.
 *
 * @module components/ui/tabs
 */

'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

/**
 * Root Tabs component from Radix UI. Controls active tab selection.
 */
const Tabs = TabsPrimitive.Root;

/**
 * TabsList Component.
 *
 * Styled container for tab trigger buttons with muted background pill styling.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>} props
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Pill container for tab triggers.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * TabsTrigger Component.
 *
 * Individual tab toggle button that activates the associated content panel.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>} props
 * @param {string} props.value - Unique identifier matching the corresponding `TabsContent`.
 * @param {React.Ref<HTMLButtonElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Styled tab button with active state shadow.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold ring-offset-background transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/**
 * TabsContent Component.
 *
 * Content panel revealed when the associated tab trigger is selected.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>} props
 * @param {string} props.value - Identifier matching the corresponding `TabsTrigger`.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Visible tab panel.
 */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
