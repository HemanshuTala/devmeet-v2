'use client';

import React, { useState } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

const BILLING_FAQS = [
  {
    question: 'How do payments work on DevMeet?',
    answer:
      'Plans can be upgraded instantly with one click. The platform processes upgrades via our instant payment service sandbox, directly updating your account quota and billing history.',
  },
  {
    question: 'Can I upgrade or downgrade my plan anytime?',
    answer:
      'Yes! You can upgrade to Pro at any time to instantly unlock unlimited mock interviews, real-time AI hints, and comprehensive performance feedback. You can also cancel your plan with one click from this dashboard.',
  },
  {
    question: 'What is included in the Pro Plan?',
    answer:
      'The Pro plan offers unlimited DSA & Behavioral mock interviews, AI audio streaming, dynamic hints, priority execution runtime, detailed STAR feedback reports, and shareable PDF analytics.',
  },
  {
    question: 'Are payments recurring automatically?',
    answer:
      'No hidden charges or automatic lock-ins. Subscriptions are billed per month or annually depending on your selection, and you maintain complete control over renewal directly from your billing dashboard.',
  },
];

/**
 * FAQ accordion component dedicated to billing, payments, and subscription questions.
 */
export function BillingFaq() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-slate-900">Billing Frequently Asked Questions</h3>
      </div>

      <div className="space-y-3">
        {BILLING_FAQS.map((faq, index) => {
          const isOpen = activeFaq === index;
          return (
            <div
              key={index}
              className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs transition-all"
            >
              <button
                onClick={() => setActiveFaq(isOpen ? null : index)}
                className="w-full p-4 sm:p-5 text-left font-bold text-slate-900 text-sm flex items-center justify-between gap-4"
              >
                <span>{faq.question}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isOpen ? 'rotate-180 text-blue-600' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-4 sm:px-5 pb-5 pt-1 text-slate-600 text-xs sm:text-sm leading-relaxed border-t border-slate-100 font-medium">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BillingFaq;
