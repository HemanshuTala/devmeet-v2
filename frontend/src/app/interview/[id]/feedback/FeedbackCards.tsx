'use client';

import React from 'react';
import { CheckCircle2, XCircle, BookOpen } from 'lucide-react';

function renderWithCodeBlocks(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="bg-slate-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono font-bold">
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface FeedbackCardsProps {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export default function FeedbackCards({ strengths, weaknesses, recommendations }: FeedbackCardsProps) {
  return (
    <>
      {/* Strengths & Weaknesses */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50/60 border border-emerald-200 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="text-slate-800 font-bold">Key Strengths</h3>
            <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
              {strengths.length} identified
            </span>
          </div>
          {strengths.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {strengths.map((str, idx) => (
                <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-slate-700 bg-white/70 p-3 rounded-xl border border-emerald-100/60">
                  <span className="text-emerald-600 font-black select-none mt-0.5 text-base leading-none">&#10003;</span>
                  <span>{renderWithCodeBlocks(str)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-slate-200" />
              <p className="text-xs text-slate-400 italic leading-relaxed max-w-[200px]">
                No strengths identified — complete a full interview session for detailed analysis.
              </p>
            </div>
          )}
        </div>

        <div className="bg-rose-50/60 border border-rose-200 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-rose-600" />
            <h3 className="text-slate-800 font-bold">Areas for Improvement</h3>
            <span className="ml-auto text-[10px] font-bold text-rose-600 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
              {weaknesses.length} found
            </span>
          </div>
          {weaknesses.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {weaknesses.map((weak, idx) => (
                <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-slate-700 bg-white/70 p-3 rounded-xl border border-rose-100/60">
                  <span className="text-rose-500 font-black select-none mt-0.5 text-base leading-none">&minus;</span>
                  <span>{renderWithCodeBlocks(weak)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic leading-relaxed py-2">No areas for improvement identified.</p>
          )}
        </div>
      </section>

      {/* Recommendations */}
      <section className="bg-white border border-blue-100 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-slate-800 font-bold">Actionable Recommendations</h3>
          <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            {recommendations.length} steps
          </span>
        </div>
        {recommendations.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="bg-gradient-to-br from-blue-50/60 to-indigo-50/30 border border-blue-100 p-4 rounded-xl hover:border-blue-300 hover:shadow-md transition-all flex items-start gap-3 group"
              >
                <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm group-hover:scale-110 transition-transform">
                  {idx + 1}
                </span>
                <p className="text-sm leading-relaxed text-slate-700 font-medium">{renderWithCodeBlocks(rec)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">No recommendations available.</p>
        )}
      </section>
    </>
  );
}
