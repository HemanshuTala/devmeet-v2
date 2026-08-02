import React from 'react';

interface ReadonlyFieldProps {
  value: string;
  icon?: React.ReactNode;
}

export default function ReadonlyField({ value, icon }: ReadonlyFieldProps) {
  return (
    <div className="flex items-start gap-2 min-h-[40px] rounded-xl border border-blue-50 bg-slate-50 px-3 py-2.5">
      {icon && <span className="mt-0.5 text-slate-400 flex-shrink-0">{icon}</span>}
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{value}</p>
    </div>
  );
}
