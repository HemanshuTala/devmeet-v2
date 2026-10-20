'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Popover Date Picker Component
 * ============================================================================
 * Composes a Radix Popover and DayPicker Calendar to provide an interactive,
 * accessible single-date selection dialog.
 *
 * Features:
 * 1. Popover Positioning: Opens calendar overlay aligned to input button.
 * 2. Formatted Date Display: Formats selected date via `date-fns` (e.g. "Oct 15, 2024").
 * 3. Quick Clear Button: Optional 'X' button allowing one-click date reset.
 * ============================================================================
 */

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Props for the DatePicker component.
 */
interface DatePickerProps {
  /** Currently selected Date object */
  value?: Date;
  /** Callback fired when a date is selected or cleared */
  onChange: (date: Date | undefined) => void;
  /** Placeholder text displayed when value is unset */
  placeholder?: string;
  /** Additional custom class names */
  className?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to show a clear button when a value exists */
  clearable?: boolean;
}

/**
 * DatePicker input component.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
  disabled,
  clearable = true,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-medium h-10 border-slate-200 hover:bg-slate-50',
            !value && 'text-slate-400',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
          {value ? format(value, 'MMM d, yyyy') : <span>{placeholder}</span>}
          {clearable && value && (
            <X
              className="ml-auto h-4 w-4 text-slate-400 hover:text-slate-600"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
