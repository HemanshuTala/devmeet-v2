'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Zap, Crown, Building2, ChevronRight } from 'lucide-react';

const PLANS = [
  {
    name: 'Free Starter',
    icon: <Zap className="w-5 h-5 text-blue-600" />,
    price: '$0',
    period: '/ month',
    description: 'Essential mock interviews for students and early-career candidates.',
    features: [
      '3 complete mock interviews / month',
      'Standard DSA & algorithm questions',
      'Browser Web Speech recognition',
      'Basic STAR feedback summaries',
    ],
    cta: 'Start Free',
    href: '/register',
    popular: false,
  },
  {
    name: 'DevMeet Pro',
    icon: <Crown className="w-5 h-5 text-amber-500" />,
    price: '$19',
    period: '/ month',
    description: 'For active job seekers who want unlimited practice and deep analytical reports.',
    features: [
      'Unlimited mock interviews (DSA & System Design)',
      'LiveKit WebRTC video streaming & audio visualizer',
      'Automated STAR scorecards & radar metrics',
      'Sharable pre-signed PDF analytical reports',
      'Dynamic real-time hints when stuck',
    ],
    cta: 'Upgrade to Pro',
    href: '/register',
    popular: true,
  },
  {
    name: 'Enterprise',
    icon: <Building2 className="w-5 h-5 text-purple-600" />,
    price: 'Custom',
    period: '',
    description: 'Custom solutions for universities, engineering teams, and coding bootcamps.',
    features: [
      'Team & cohort management dashboard',
      'Custom corporate interview rubrics',
      'Dedicated LiveKit TURN infrastructure',
      'Role-based admin API access & SSO',
    ],
    cta: 'Contact Sales',
    href: 'mailto:sales@devmeet.com',
    popular: false,
  },
];

/**
 * Pricing comparison table on the landing page matching the platform's active billing plans.
 */
export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-600 mb-4">
          <span>Simple, Transparent Pricing</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Invest in Your Next Career Move
        </h2>
        <p className="text-base text-slate-600 mt-4 font-medium">
          Start for free with starter credits. Upgrade to Pro when you are actively interviewing.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {PLANS.map((plan, i) => (
          <div
            key={i}
            className={`rounded-2xl p-8 flex flex-col justify-between transition-all duration-300 relative ${
              plan.popular
                ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white shadow-2xl border-2 border-blue-500/50'
                : 'bg-white text-slate-900 border border-slate-200/80 shadow-sm hover:shadow-lg'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                <span className="bg-blue-600 text-white text-[11px] font-extrabold tracking-wider uppercase px-3 py-1 rounded-full shadow-md">
                  Most Popular
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    plan.popular ? 'bg-white/10' : 'bg-slate-100'
                  }`}
                >
                  {plan.icon}
                </div>
                <h3 className="font-bold text-lg">{plan.name}</h3>
              </div>

              <div className="flex items-baseline gap-1 my-4">
                <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                {plan.period && (
                  <span
                    className={`text-xs font-semibold ${
                      plan.popular ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {plan.period}
                  </span>
                )}
              </div>

              <p
                className={`text-xs leading-relaxed mb-6 font-medium ${
                  plan.popular ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {plan.description}
              </p>

              <div className="w-full h-px bg-slate-200/30 mb-6" />

              <ul className="space-y-3 mb-8">
                {plan.features.map((f, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs font-medium">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        plan.popular ? 'text-blue-400' : 'text-emerald-500'
                      }`}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href={plan.href}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all text-center ${
                plan.popular
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
              }`}
            >
              {plan.cta}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export default PricingSection;
