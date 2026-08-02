import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorAlertProps {
  title?: string;
  message: string;
  className?: string;
  variant?: 'error' | 'warning';
}

export function ErrorAlert({ title, message, className, variant = 'error' }: ErrorAlertProps) {
  const styles =
    variant === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-rose-200 bg-rose-50 text-rose-900';

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-xl border p-4 text-sm', styles, className)}
    >
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
      <div>
        {title && <p className="font-bold mb-0.5">{title}</p>}
        <p className="leading-relaxed opacity-90">{message}</p>
      </div>
    </div>
  );
}
