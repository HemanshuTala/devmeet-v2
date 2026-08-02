'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, ChevronDown, ChevronUp, Bot, User, TrendingUp } from 'lucide-react';

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

interface Turn {
  id?: string;
  role: string;
  content: string;
}

interface TranscriptViewerProps {
  turns: Turn[];
  interviewType: string;
}

export default function TranscriptViewer({ turns, interviewType }: TranscriptViewerProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'interviewer' | 'candidate'>('all');
  const [openTurnIndex, setOpenTurnIndex] = useState<number | null>(null);

  const filteredTurns = useMemo(() => {
    return turns
      .map((t, i) => ({ ...t, originalIndex: i }))
      .filter((t) => {
        const roleMatch =
          filter === 'all' ||
          (filter === 'interviewer' && t.role === 'interviewer') ||
          (filter === 'candidate' && t.role === 'candidate');
        const textMatch = !search || t.content.toLowerCase().includes(search.toLowerCase());
        return roleMatch && textMatch;
      });
  }, [turns, search, filter]);

  return (
    <section className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <h3 className="text-slate-800 font-bold flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-500" />
          Interview Transcript
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full ml-1">
            {turns.length} turns
          </span>
        </h3>

        <div className="flex gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transcript…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none transition-all w-44 font-medium"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
            <Filter className="w-3 h-3 text-slate-400 ml-1.5" />
            {(['all', 'interviewer', 'candidate'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  filter === f ? 'bg-white text-blue-700 shadow-sm border border-blue-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'interviewer' ? 'AI' : 'You'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-blue-50 max-h-[500px] overflow-y-auto">
        {filteredTurns.map((turn) => {
          const isOpen = openTurnIndex === turn.originalIndex;
          const isInterviewer = turn.role === 'interviewer';

          return (
            <div key={turn.id || turn.originalIndex} className="bg-white hover:bg-slate-50/50 transition-colors">
              <button
                onClick={() => setOpenTurnIndex(isOpen ? null : turn.originalIndex)}
                className="w-full px-4 py-3 flex items-center justify-between text-left gap-4 bg-white/60 rounded-t-xl"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 flex-shrink-0 ${
                      isInterviewer ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {isInterviewer ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {isInterviewer ? 'Interviewer' : 'Candidate'}
                  </span>
                  <p className="text-slate-700 text-xs font-semibold truncate">
                    {turn.content.slice(0, 120)}
                    {turn.content.length > 120 ? '…' : ''}
                  </p>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-2 border-t border-blue-100">
                  <div className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed font-sans">
                    {renderWithCodeBlocks(turn.content)}
                  </div>
                  {!isInterviewer && interviewType === 'dsa' && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                      <TrendingUp className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        <span className="font-bold block mb-0.5">Complexity Assessment:</span>
                        Response demonstrates active reasoning. Keep variable scoping strict and review recursive structures for safety.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredTurns.length > 0 && filteredTurns.length < turns.length && (
        <p className="text-xs text-slate-400 text-center font-medium py-3">
          Showing {filteredTurns.length} of {turns.length} turns
          {search && ` matching "${search}"`}
        </p>
      )}
    </section>
  );
}
