/**
 * @file select.tsx
 * @description Accessible Custom Dropdown Select Component Family for DevMeet.
 *
 * Built on `@radix-ui/react-select`:
 * - Full WAI-ARIA compliant combobox/listbox implementation.
 * - Supports keyboard navigation (Arrow Up/Down, Home/End, Enter/Space, Typeahead search).
 * - Automatic viewport collision detection, positioning ('popper' or 'item-aligned'), and edge scrolling.
 * - Portaled overlay preventing overflow clipping from parent containers.
 * - Animated item check indicators and smooth state transitions.
 *
 * Subcomponents:
 * - `Select`: Root controller managing selection state and open/closed dropdown state.
 * - `SelectGroup`: Groups related options together under a common section.
 * - `SelectValue`: Displays the selected value or placeholder text.
 * - `SelectTrigger`: Interactive button that toggles the dropdown options list.
 * - `SelectContent`: Portaled floating container rendering items and scroll buttons.
 * - `SelectItem`: Selectable option item with checkmark indicator.
 * - `SelectLabel`: Section header label for option groups.
 * - `SelectSeparator`: Visual divider line between item groups.
 *
 * @module components/ui/select
 */

'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Root Select component from Radix UI. Controls dropdown state and value binding.
 */
const Select = SelectPrimitive.Root;

/**
 * SelectGroup component for grouping related options semantically.
 */
const SelectGroup = SelectPrimitive.Group;

/**
 * SelectValue component that displays the currently selected item label or placeholder.
 */
const SelectValue = SelectPrimitive.Value;

/**
 * SelectTrigger Component.
 *
 * Interactive button that opens the dropdown menu and displays the current value.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>} props
 * @param {React.Ref<HTMLButtonElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Styled trigger button with chevron icon.
 */
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900',
      'ring-offset-background placeholder:text-slate-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
      'disabled:cursor-not-allowed disabled:opacity-50',
      '[&>span]:line-clamp-1', // Truncate long labels with ellipsis to maintain height
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/**
 * SelectScrollUpButton Component.
 *
 * Appears when there are more items above the visible dropdown viewport.
 */
const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

/**
 * SelectScrollDownButton Component.
 *
 * Appears when there are more items below the visible dropdown viewport.
 */
const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/**
 * SelectContent Component.
 *
 * Portaled floating list container that renders the selectable options.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>} props
 * @param {'popper' | 'item-aligned'} [props.position='popper'] - Positioning strategy.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Portaled dropdown list with scroll controls and animations.
 */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

/**
 * SelectLabel Component.
 *
 * Displays a non-selectable category title or heading within a select menu.
 */
const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold text-slate-500', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

/**
 * SelectItem Component.
 *
 * An individual option within the select list. Renders an active checkmark indicator when selected.
 *
 * @component
 * @param {React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>} props
 * @param {string} props.value - Unique string value for the option.
 * @param {React.Ref<HTMLDivElement>} ref - Forwarded DOM reference.
 * @returns {JSX.Element} Interactive option row with indicator and label.
 */
const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm font-medium outline-none',
      'focus:bg-blue-50 focus:text-blue-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    {/* Left-aligned checkmark indicator visible only when item is active/selected */}
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-blue-600" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

/**
 * SelectSeparator Component.
 *
 * Visual divider horizontal rule between groups of options.
 */
const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-slate-100', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
