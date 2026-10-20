/**
 * ============================================================================
 * DevMeet Frontend - Core UI Utility & Formatting Functions
 * ============================================================================
 * Provides shared helper functions for styling, string manipulation, date/time
 * representations, badge metadata mappings, and UI avatar initials.
 *
 * Key Capabilities:
 * 1. Tailwind Class Merging (`cn`): Combines `clsx` and `twMerge` to handle conditional
 *    CSS classes and resolve conflicting utility declarations cleanly.
 * 2. DateTime & Stopwatches (`formatDate`, `formatTimer`): Formats timestamps and mm:ss interview timers.
 * 3. Domain Metadata Mappings (`interviewTypeLabel`, `difficultyMeta`, `statusMeta`):
 *    Translates raw backend enum strings into localized display labels and badge CSS styles.
 * 4. Avatar Initials (`getInitials`): Extracts candidate initials for fallback avatars.
 * ============================================================================
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines conditional class names and resolves conflicting Tailwind CSS rules.
 *
 * @param inputs - Array of class values, booleans, or objects.
 * @returns Clean, deduplicated CSS class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a Date object or ISO timestamp string into a concise human-readable date.
 * Example: "15 Oct 2024"
 *
 * @param date - Date instance or ISO 8601 string.
 * @returns Formatted localized date string.
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Formats elapsed or remaining time in seconds into a digital timer clock format (mm:ss).
 * Example: 75 -> "01:15"
 *
 * @param seconds - Elapsed time in seconds.
 * @returns Padded "mm:ss" timer string.
 */
export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Maps raw backend interview mode strings to human-friendly display labels.
 *
 * @param type - Raw mode string ('dsa', 'behavioral', 'system_design').
 * @returns Capitalized display label.
 */
export function interviewTypeLabel(type: string): string {
  return { dsa: 'DSA', behavioral: 'Behavioral', system_design: 'System Design' }[type] ?? type;
}

/**
 * Maps problem difficulty levels to display titles and semantic CSS color classes.
 *
 * @param difficulty - Difficulty tier string ('easy', 'medium', 'hard').
 * @returns Object with display label and Tailwind badge CSS class.
 */
export function difficultyMeta(difficulty: string): { label: string; badgeClass: string } {
  return {
    easy:   { label: 'Easy',   badgeClass: 'badge-green' },
    medium: { label: 'Medium', badgeClass: 'badge-yellow' },
    hard:   { label: 'Hard',   badgeClass: 'badge-red' },
  }[difficulty] ?? { label: difficulty, badgeClass: 'badge-blue' };
}

/**
 * Maps interview session lifecycle state to user-facing status badges.
 *
 * @param status - Backend session status ('created', 'in_progress', 'completed', 'cancelled').
 * @returns Object with localized label and badge class.
 */
export function statusMeta(status: string): { label: string; badgeClass: string } {
  return {
    created:     { label: 'Scheduled', badgeClass: 'badge-blue' },
    in_progress: { label: 'In Progress', badgeClass: 'badge-yellow' },
    completed:   { label: 'Completed', badgeClass: 'badge-green' },
    cancelled:   { label: 'Cancelled', badgeClass: 'badge-red' },
  }[status] ?? { label: status, badgeClass: 'badge-blue' };
}

/**
 * Extracts the first two initials from a candidate or user's display name.
 * Example: "Alex Morgan" -> "AM"
 *
 * @param name - Full display name string.
 * @returns Uppercase 1-2 character initials.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
