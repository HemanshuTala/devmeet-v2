import React from 'react';

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

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
      <div className="mt-0.5 text-blue-500">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 font-medium">{description}</p>
        )}
      </div>
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className={`h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-slate-200'}`} />
        <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </label>
  );
}
