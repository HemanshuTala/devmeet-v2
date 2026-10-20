'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'How realistic is the AI interviewer compared to human interviewers?',
    a: 'DevMeet uses advanced LLMs specifically fine-tuned on interview evaluations from Google, Meta, and Amazon. The AI interrupts, asks clarifying follow-up questions, evaluates edge cases in code, and scores your response using actual hiring bar rubrics.',
  },
  {
    q: 'Does DevMeet store or share my webcam video or microphone audio?',
    a: 'No. Raw camera video is never transmitted to our servers — all gaze tracking and presence detection models run entirely on your device via client-side WebAssembly. Audio is transcribed to text over an encrypted TLS connection and is not used to train public models.',
  },
  {
    q: 'What languages does the code execution sandbox support?',
    a: 'The embedded Monaco code editor supports Python 3, JavaScript (Node.js), TypeScript, Java, C++, Go, and Rust. Code runs inside isolated, time-limited Docker containers with memory limits and security safeguards.',
  },
  {
    q: 'What is the STAR framework used in behavioral evaluations?',
    a: 'STAR stands for Situation, Task, Action, and Result. DevMeet automatically breaks down your verbal answers into these four pillars, giving you actionable suggestions on how to quantify results and highlight ownership.',
  },
  {
    q: 'Can I cancel my Pro subscription at any time?',
    a: 'Yes, absolutely. You can manage or cancel your subscription at any time with one click from your Billing dashboard. You will retain Pro access until the end of your billing cycle.',
  },
];

/**
 * Interactive FAQ accordion component for candidate inquiries.
 */
export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 px-6 max-w-4xl mx-auto">
      <div className="text-center mb-14">
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Frequently Asked Questions
        </h2>
        <p className="text-sm text-slate-500 mt-2 font-medium">
          Have questions about the studio, proctoring, or payments? We have answers.
        </p>
      </div>

      <div className="space-y-3.5">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-xs transition-all"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full p-5 text-left font-bold text-slate-900 text-sm flex items-center justify-between gap-4"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isOpen ? 'rotate-180 text-blue-600' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-slate-600 text-xs sm:text-sm leading-relaxed border-t border-slate-100 font-medium">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FaqSection;
