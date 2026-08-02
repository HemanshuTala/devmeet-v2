'use client';

import React, { useState, useCallback, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  disabled: boolean;
  colorClass: string;
}

export default function TagInput({ tags, onChange, placeholder, disabled, colorClass }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

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

  const removeTag = useCallback(
    (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
    },
    [tags, onChange],
  );

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
