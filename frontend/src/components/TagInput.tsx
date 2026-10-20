/**
 * @file TagInput.tsx
 * @description Interactive Multi-Tag Pill Input Component for DevMeet.
 *
 * Used in profile skills, target roles, interview topic customizations:
 * - Enter or comma (`,`) commits the currently typed token into the tag array.
 * - Backspace on an empty input removes the most recently added tag.
 * - Clicking the `X` button on any tag pill deletes it.
 * - Enforces uniqueness (prevents duplicate tags).
 * - Commits unsubmitted text on input blur (`onBlur`).
 *
 * @module components/TagInput
 */

'use client';

import React, { useState, useCallback, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/**
 * Props accepted by TagInput.
 */
interface TagInputProps {
  /** Current array of string tags. */
  tags: string[];
  /** Callback fired whenever tags are added or removed. */
  onChange: (tags: string[]) => void;
  /** Placeholder text shown when no tags are present. */
  placeholder: string;
  /** Whether the tag input is disabled for editing. */
  disabled: boolean;
  /** Tailwind CSS class specifying badge color (e.g. 'badge-blue', 'badge-purple'). */
  colorClass: string;
}

/**
 * TagInput Component.
 *
 * @component
 * @param {TagInputProps} props
 * @returns {JSX.Element} Interactive input container with pill tags and inline textfield.
 */
export default function TagInput({ tags, onChange, placeholder, disabled, colorClass }: TagInputProps) {
  // Current text being entered in the active text input
  const [inputValue, setInputValue] = useState('');

  /**
   * Trims and commits a raw text string as a new tag if non-empty and not already present.
   */
  const addTag = useCallback(
    (raw: string) => {
      const value = raw.trim().replace(/,$/, '').trim();
      if (value && !tags.includes(value)) {
        onChange([...tags, value]);
      }
      setInputValue('');
    },
    [tags, onChange],
  );

  /**
   * Removes a tag at a specified index.
   */
  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange],
  );

  /**
   * Keyboard shortcuts:
   * - 'Enter' or ',': Add new tag.
   * - 'Backspace': If input is empty, delete the last tag.
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div
      className={`min-h-[48px] w-full rounded-xl border border-blue-100 bg-white px-3 py-2 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 shadow-sm ${
        disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''
      }`}
    >
      <div className="flex flex-wrap gap-2">
        {/* Render existing tag pills */}
        {tags.map((tag, i) => (
          <span key={i} className={`${colorClass} flex items-center gap-1 text-xs font-semibold`}>
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-0.5 rounded-full hover:bg-black/10 p-0.5 transition-colors"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {/* Inline text entry field for new tags */}
        {!disabled && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => inputValue.trim() && addTag(inputValue)}
            placeholder={tags.length === 0 ? placeholder : 'Add more…'}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none"
          />
        )}
      </div>
    </div>
  );
}
