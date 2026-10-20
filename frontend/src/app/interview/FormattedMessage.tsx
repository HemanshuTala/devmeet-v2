'use client';

import React, { useMemo } from 'react';
import { Code2, Sparkles, Terminal, ArrowRight, Lightbulb } from 'lucide-react';

interface FormattedMessageProps {
  content: string;
  isInterviewer: boolean;
}

/**
 * Helper to render inline markdown elements:
 * - `code` -> inline badge
 * - **bold** -> strong tag
 * - *italic* -> em tag
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Regex splitting by code tokens, bold tokens, italic tokens
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const code = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="mx-0.5 px-1.5 py-0.5 rounded-md bg-slate-100/90 text-indigo-700 font-mono text-[11px] font-semibold border border-slate-200/80 shadow-2xs"
        >
          {code}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldText = part.slice(2, -2);
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {boldText}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const italicText = part.slice(1, -1);
      return (
        <em key={idx} className="italic text-slate-700">
          {italicText}
        </em>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

/**
 * Parses and formats interview dialogue with specialized visual cards for:
 * 1. Problem Statements (titles & headers)
 * 2. Example test cases (inputs / outputs)
 * 3. Structured bullet lists
 * 4. Interviewer questions / action prompts callout
 */
export default React.memo(function FormattedMessage({ content, isInterviewer }: FormattedMessageProps) {
  if (!isInterviewer) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>;
  }

  // Parse lines into structured logical blocks
  const blocks = useMemo(() => {
    if (!content) return [];

    const rawParagraphs = content.split(/\n\s*\n/);
    return rawParagraphs.map((para) => para.trim()).filter(Boolean);
  }, [content]);

  return (
    <div className="space-y-3 text-slate-800 text-[13px] leading-relaxed">
      {blocks.map((block, blockIdx) => {
        // 1. Detect Problem Header (e.g. "**Problem: Word Break**" or "Problem: ...")
        const problemMatch = block.match(/^(?:\*\*)?Problem(?:\s*\d+)?:\s*([^*]+)(?:\*\*)?/i);
        if (problemMatch) {
          const problemName = problemMatch[1].trim();
          return (
            <div
              key={blockIdx}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white border border-indigo-200/80 shadow-2xs my-2.5"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Code2 className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-600">
                  Interview Challenge
                </div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {problemName}
                </div>
              </div>
            </div>
          );
        }

        // 2. Detect Examples Block (Lines with "- Input:" or "For example:")
        if (
          block.toLowerCase().includes('for example:') ||
          block.toLowerCase().includes('- input:') ||
          block.toLowerCase().startsWith('input:')
        ) {
          const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
          const hasIntro = lines[0].toLowerCase().includes('example');
          const introLine = hasIntro ? lines[0] : null;
          const exampleLines = hasIntro ? lines.slice(1) : lines;

          return (
            <div key={blockIdx} className="my-2.5 space-y-1.5">
              {introLine && (
                <div className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-400" />
                  <span>{introLine.replace(/:$/, '')}:</span>
                </div>
              )}
              <div className="space-y-1.5">
                {exampleLines.map((line, exIdx) => {
                  const cleaned = line.replace(/^[-*]\s*/, '');
                  return (
                    <div
                      key={exIdx}
                      className="px-3 py-2 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed border border-slate-800 shadow-2xs overflow-x-auto"
                    >
                      {renderInlineFormatting(cleaned)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // 3. Detect Action Prompt / Interviewer Question at the end
        // (starts with "Before jumping", "Can you walk me", "What data structure", "How would you", etc.)
        const isActionPrompt =
          blockIdx === blocks.length - 1 &&
          (block.toLowerCase().includes('before jumping') ||
            block.toLowerCase().includes('walk me through') ||
            block.toLowerCase().includes('what approach') ||
            block.toLowerCase().includes('how would you') ||
            block.toLowerCase().includes('what data structures') ||
            block.endsWith('?'));

        if (isActionPrompt && blocks.length > 1) {
          return (
            <div
              key={blockIdx}
              className="mt-3 p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-blue-50/60 to-white border border-indigo-200/90 shadow-2xs flex gap-3 items-start"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-200/60 flex items-center justify-center shrink-0 mt-0.5 text-indigo-600">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div className="flex-1 text-xs font-medium text-slate-800 leading-relaxed">
                <div className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider mb-0.5">
                  Your Turn to Respond
                </div>
                <div>{renderInlineFormatting(block)}</div>
              </div>
            </div>
          );
        }

        // 4. Detect regular bulleted lists
        if (block.startsWith('- ') || block.startsWith('* ') || block.includes('\n- ')) {
          const listItems = block.split(/\n[-*]\s*/).map((item) => item.trim()).filter(Boolean);
          return (
            <ul key={blockIdx} className="space-y-1.5 my-2 pl-1">
              {listItems.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2 text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                  <span className="flex-1">{renderInlineFormatting(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        // 5. Standard dialogue paragraph
        return (
          <p key={blockIdx} className="leading-relaxed text-slate-700">
            {renderInlineFormatting(block)}
          </p>
        );
      })}
    </div>
  );
});
