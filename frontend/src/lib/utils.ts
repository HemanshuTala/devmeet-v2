import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date or ISO string as a short human-readable label */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format seconds into mm:ss */
export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Map interview type to display label */
export function interviewTypeLabel(type: string): string {
  return { dsa: 'DSA', behavioral: 'Behavioral', system_design: 'System Design' }[type] ?? type;
}

/** Map difficulty to display label + colour class */
export function difficultyMeta(difficulty: string): { label: string; badgeClass: string } {
  return {
    easy:   { label: 'Easy',   badgeClass: 'badge-green' },
    medium: { label: 'Medium', badgeClass: 'badge-yellow' },
    hard:   { label: 'Hard',   badgeClass: 'badge-red' },
  }[difficulty] ?? { label: difficulty, badgeClass: 'badge-indigo' };
}

/** Map session status to badge class */
export function statusMeta(status: string): { label: string; badgeClass: string } {
  return {
    created:     { label: 'Scheduled', badgeClass: 'badge-indigo' },
    in_progress: { label: 'In Progress', badgeClass: 'badge-yellow' },
    completed:   { label: 'Completed', badgeClass: 'badge-green' },
    cancelled:   { label: 'Cancelled', badgeClass: 'badge-red' },
  }[status] ?? { label: status, badgeClass: 'badge-indigo' };
}

/** Get user initials for avatar */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
