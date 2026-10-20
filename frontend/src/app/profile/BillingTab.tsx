import React from 'react';
import Link from 'next/link';
import { Sparkles, CheckCircle, Zap, CreditCard, ArrowRight } from 'lucide-react';

/**
 * @file BillingTab.tsx (Candidate Profile Billing & Subscription Tier Card)
 * @description Embedded profile tab showing the user's current subscription level (Free, Pro, Enterprise),
 * active benefits summary, comparison tier cards, and quick link to Stripe checkout.
 */

/**
 * Props passed to BillingTab.
 */
interface BillingTabProps {
  /** Active user subscription tier */
  plan: 'free' | 'pro' | 'enterprise';
  /** Toast alert trigger callback */
  showToast: (type: 'success' | 'error', message: string) => void;
}

/**
 * BillingTab Component.
 */
export default function BillingTab({
  plan,
  showToast,
}: BillingTabProps) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* ── Active Plan Status Banner ── */}
      <div className="bg-white border border-blue-200 border-l-4 border-l-blue-600 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5 mb-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h3 className="text-slate-900 font-bold">Active Plan: {plan.toUpperCase()}</h3>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed font-medium">
          {plan === 'pro'
            ? 'You have unlocked unlimited daily interviews, premium Groq audio-video simulations, detailed metric reports, and high-fidelity PDF downloads.'
            : 'You are on the Free Tier with 5 free mock interviews. Upgrade below to unlock unlimited sessions, standard audio/video and detailed metrics reports.'}
        </p>
      </div>

      {/* ── Tier Comparison Grid (Free, Pro, Enterprise) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Free Starter Tier */}
        <div
          className={`bg-white p-5 rounded-2xl flex flex-col gap-4 border transition-all duration-300 shadow-sm ${
            plan === 'free' ? 'border-blue-300 shadow-blue-100' : 'border-blue-100'
          }`}
        >
          <div>
            <h4 className="text-slate-700 font-bold">Free Starter</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 select-none tracking-wider">
              Basic Practice
            </p>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-slate-900">$0</span>
            <span className="text-slate-400 text-xs font-semibold">/ month</span>
          </div>
          <ul className="space-y-2 mt-4 text-xs text-slate-500 flex-1">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />5 Free Mock Interviews
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />DSA algorithmic review
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />Conceptual ratings
            </li>
          </ul>
          <button
            className="btn-ghost w-full py-2 text-xs font-bold border border-slate-200"
            disabled={true}
          >
            {plan === 'free' ? 'Active Plan' : 'Standard'}
          </button>
        </div>

        {/* Pro Candidate Tier */}
        <div
          className={`bg-white p-5 rounded-2xl flex flex-col gap-4 border transition-all duration-300 relative overflow-hidden shadow-sm ${
            plan === 'pro' ? 'border-blue-400 shadow-blue-100' : 'border-blue-200'
          }`}
        >
          <div className="absolute top-2 right-2 bg-blue-100 border border-blue-200 text-[9px] font-extrabold text-blue-700 px-2 py-0.5 rounded-full select-none uppercase">
            Popular
          </div>
          <div>
            <h4 className="text-slate-900 font-bold flex items-center gap-1.5">
              DevMeet Pro
              <Zap className="w-4 h-4 text-blue-500 shrink-0" />
            </h4>
            <p className="text-[10px] text-blue-600 font-bold uppercase mt-1 select-none tracking-wider">
              Best for Candidates
            </p>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-slate-900">$19</span>
            <span className="text-slate-400 text-xs font-semibold">/ month</span>
          </div>
          <ul className="space-y-2 mt-4 text-xs text-slate-600 flex-1">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <strong>Unlimited</strong> daily interviews
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />Camera / mic audio-video rooms
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />Exportable pre-signed PDFs
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />Advanced performance radar
            </li>
          </ul>
          {plan === 'pro' ? (
            <button
              className="btn-ghost w-full py-2 text-xs font-bold border border-blue-200 text-blue-600 cursor-default"
              disabled
            >
              Active Plan
            </button>
          ) : (
            <Link
              href="/billing"
              className="btn-primary w-full py-2 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Upgrade to Pro
              <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          )}
        </div>

        {/* Enterprise Organization Tier */}
        <div
          className={`bg-white p-5 rounded-2xl flex flex-col gap-4 border transition-all duration-300 shadow-sm ${
            plan === 'enterprise' ? 'border-amber-300 shadow-amber-100' : 'border-blue-100'
          }`}
        >
          <div>
            <h4 className="text-slate-700 font-bold">Enterprise</h4>
            <p className="text-[10px] text-amber-600 font-bold uppercase mt-1 select-none tracking-wider">
              For Recruiters & Teams
            </p>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-slate-900">Custom</span>
          </div>
          <ul className="space-y-2 mt-4 text-xs text-slate-500 flex-1">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />Team management dashboards
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />Custom corporate templates
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />Admin analytics API access
            </li>
          </ul>
          <button
            className="btn-ghost w-full py-2 text-xs font-bold border border-amber-200 text-amber-700 hover:bg-amber-50 cursor-pointer"
            onClick={() => showToast('success', 'Corporate sales inquiry registered!')}
          >
            Contact Sales
          </button>
        </div>
      </div>
    </div>
  );
}
