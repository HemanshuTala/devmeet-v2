'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Crown, Zap, Building2, Check, Star, BadgeCheck, Sparkles, Loader2, ArrowRight } from 'lucide-react';

export interface PlanItem {
  plan: string;
  name: string;
  price_display: string;
  amount_paise?: number;
  features: string[];
}

interface PlanCardProps {
  plan: PlanItem;
  currentPlan: string;
  isAnnual: boolean;
  onUpgrade: (planId: string) => void;
  upgrading: string | null;
}

/**
 * Plan card component showing subscription details, pricing in INR, feature checkmarks, and upgrade CTA.
 */
export function PlanCard({
  plan,
  currentPlan,
  isAnnual,
  onUpgrade,
  upgrading,
}: PlanCardProps) {
  const isCurrentPlan = plan.plan === currentPlan;
  const isPro = plan.plan === 'pro';
  const isEnterprise = plan.plan === 'enterprise';
  const isFree = plan.plan === 'free';
  const isLoading = upgrading === plan.plan;

  // Calculate pricing with annual 20% discount if toggle is active
  const baseMonthlyPaise = plan.amount_paise || 0;
  const displayPaise =
    isAnnual && baseMonthlyPaise > 0 ? Math.round(baseMonthlyPaise * 0.8) : baseMonthlyPaise;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ${
        isPro
          ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white shadow-2xl border-2 border-blue-500/50 transform hover:-translate-y-1'
          : 'bg-white text-slate-800 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-blue-200 transform hover:-translate-y-1'
      }`}
    >
      {isPro && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-[11px] font-black tracking-wider uppercase px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-amber-300">
            <Star className="w-3.5 h-3.5 fill-current" />
            MOST POPULAR CHOICE
          </span>
        </div>
      )}

      <div>
        {/* Header Icon & Plan Badge */}
        <div className="flex items-center justify-between mb-5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${
              isPro
                ? 'bg-indigo-500/20 border border-indigo-400/30'
                : isFree
                ? 'bg-blue-50 border border-blue-100'
                : 'bg-purple-50 border border-purple-100'
            }`}
          >
            {isFree && <Zap className="w-6 h-6 text-blue-600" />}
            {isPro && <Crown className="w-6 h-6 text-amber-300" />}
            {isEnterprise && <Building2 className="w-6 h-6 text-purple-600" />}
          </div>
          {isCurrentPlan && (
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border ${
                isPro
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Plan
            </span>
          )}
        </div>

        {/* Title & Description */}
        <h3 className={`text-2xl font-black ${isPro ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
        <p className={`text-xs mt-1 leading-relaxed ${isPro ? 'text-indigo-200/80' : 'text-slate-500'}`}>
          {isFree
            ? 'Perfect for trying out basic interview sessions'
            : isPro
            ? 'Full access to AI streaming, DSA code execution & hints'
            : 'Tailored solutions for teams, bootcamps & universities'}
        </p>

        {/* Pricing in INR */}
        <div className="my-6 pt-4 border-t border-slate-100 dark:border-white/10 flex items-baseline gap-2">
          {displayPaise > 0 ? (
            <>
              <span className={`text-4xl font-extrabold tracking-tight ${isPro ? 'text-white' : 'text-slate-900'}`}>
                &#8377;{(displayPaise / 100).toLocaleString('en-IN')}
              </span>
              <span className={`text-xs font-semibold ${isPro ? 'text-indigo-300' : 'text-slate-500'}`}>
                / month {isAnnual ? '(billed annually)' : ''}
              </span>
            </>
          ) : (
            <span className={`text-3xl font-black ${isPro ? 'text-white' : 'text-slate-900'}`}>
              {plan.price_display}
            </span>
          )}
        </div>

        {/* Feature List */}
        <div className="space-y-3 mb-8">
          <p className={`text-xs font-bold uppercase tracking-wider ${isPro ? 'text-indigo-300' : 'text-slate-400'}`}>
            What&apos;s Included
          </p>
          <ul className="space-y-2.5">
            {plan.features.map((feature: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5 text-xs font-medium">
                <div
                  className={`p-0.5 rounded-full mt-0.5 shrink-0 ${
                    isPro ? 'bg-indigo-400/20 text-indigo-300' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span className={isPro ? 'text-indigo-100' : 'text-slate-700'}>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* CTA Button */}
      <div>
        {isCurrentPlan ? (
          <div
            className={`w-full py-3.5 rounded-xl text-center text-xs font-extrabold flex items-center justify-center gap-2 border ${
              isPro ? 'bg-white/10 text-white border-white/20' : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <BadgeCheck className="w-4 h-4 text-emerald-500" />
            Current Subscription
          </div>
        ) : isEnterprise ? (
          <a
            href="mailto:sales@devmeet.com"
            className="w-full py-3.5 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Contact Enterprise Sales
          </a>
        ) : !isFree ? (
          <button
            onClick={() => onUpgrade(plan.plan)}
            disabled={isLoading}
            className={`w-full py-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all duration-200 shadow-md ${
              isPro
                ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 hover:from-amber-300 hover:to-amber-400 shadow-amber-500/20'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting up Checkout&hellip;
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Upgrade to {plan.name}
              </>
            )}
          </button>
        ) : (
          <div className="w-full py-3.5 rounded-xl text-center text-xs font-medium text-slate-400 bg-slate-50 border border-slate-100">
            Standard Plan (Free Forever)
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default PlanCard;
