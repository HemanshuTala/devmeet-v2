/**
 * @file ToggleSwitch.tsx
 * @description Accessible Toggle Switch Option Card Component for DevMeet.
 *
 * Used in preferences, settings, and proctoring configuration cards:
 * - Full card click surface bound via HTML `htmlFor` label linkage.
 * - Screen-reader accessible hidden checkbox input (`sr-only`).
 * - Smooth CSS transition between inactive slate track and active blue track.
 * - Sliding knob translation (`translate-x-5`) with drop shadow.
 * - Icon, title, and detailed descriptive helper text layout.
 *
 * @module components/ToggleSwitch
 */

import React from 'react';

/**
 * Props accepted by ToggleSwitch.
 */
interface ToggleSwitchProps {
  /** Unique element ID for accessibility and label association. */
  id: string;
  /** Current boolean toggle state. */
  checked: boolean;
  /** Callback fired when state changes. */
  onChange: (v: boolean) => void;
  /** Primary title label for the setting. */
  label: string;
  /** Optional secondary explanatory text. */
  description?: string;
  /** Leading icon representing the option category. */
  icon: React.ReactNode;
  /** Whether the switch is disabled from user interactions. */
  disabled?: boolean;
}

/**
 * ToggleSwitch Component.
 *
 * @component
 * @param {ToggleSwitchProps} props
 * @returns {JSX.Element} Interactive option card with toggle pill.
 */
export default function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  description,
  icon,
  disabled,
}: ToggleSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-4 cursor-pointer rounded-xl border border-blue-100 bg-white p-4 transition-colors hover:bg-blue-50/40 shadow-sm ${
        disabled ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      {/* Category Icon */}
      <div className="mt-0.5 text-blue-500">{icon}</div>

      {/* Label and Explanatory Description */}
      <div className="flex-1">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 font-medium">{description}</p>
        )}
      </div>

      {/* Accessible Toggle Track & Sliding Knob */}
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {/* Toggle Track (slate when off, blue when on) */}
        <div className={`h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-slate-200'}`} />
        {/* Sliding Knob (translates right by 20px when checked) */}
        <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </label>
  );
}
