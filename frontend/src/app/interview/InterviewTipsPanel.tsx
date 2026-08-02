import React from 'react';
import { Lightbulb, AlertTriangle } from 'lucide-react';

interface InterviewTipsPanelProps {
  type: string;
}

export default function InterviewTipsPanel({ type }: InterviewTipsPanelProps) {
  const tips =
    type === 'behavioral'
      ? [
          { title: 'Use STAR Method', desc: 'Situation → Task → Action → Result for every story.' },
          { title: 'Be Specific', desc: 'Quantify impact where possible. Use real numbers.' },
          { title: 'Stay Positive', desc: 'Even for failures, focus on lessons learned.' },
          { title: 'Listen Carefully', desc: 'Answer the exact question asked, not a nearby one.' },
          { title: 'Pause & Think', desc: "It's okay to take 5–10 seconds before answering." },
        ]
      : [
          { title: 'Clarify Requirements', desc: 'Ask about scale, users, consistency before designing.' },
          { title: 'Start High-Level', desc: 'Draw overall architecture first, then deep-dive.' },
          { title: 'Discuss Trade-offs', desc: 'Show you understand CAP theorem, latency vs consistency.' },
          { title: 'Think About Scale', desc: 'Estimate QPS, storage, bandwidth requirements.' },
          { title: 'Iterate', desc: 'Start simple and progressively add complexity.' },
        ];

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="w-5 h-5 text-amber-500" />
        <h3 className="text-slate-800 font-bold text-sm">
          {type === 'behavioral' ? 'Behavioral Interview Tips' : 'System Design Tips'}
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {tips.map((tip, i) => (
          <div
            key={i}
            className="bg-white border border-blue-50/80 hover:border-blue-200 p-3 rounded-xl shadow-sm transition-all duration-200"
          >
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                {i + 1}
              </span>
              <div>
                <p className="text-slate-800 text-xs font-bold">{tip.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">{tip.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border border-amber-250 bg-amber-50/60 p-3 rounded-xl mt-2 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-amber-800 text-xs leading-relaxed font-medium">
            {type === 'behavioral'
              ? 'Avoid generic answers. Interviewers can spot rehearsed stories instantly.'
              : 'Never jump to solutions. Gathering requirements is worth 20% of your score.'}
          </p>
        </div>
      </div>
    </div>
  );
}

