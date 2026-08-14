'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, CheckCircle2, XCircle, Loader2, Zap, Building2, Sparkles,
  Clock, IndianRupee, Receipt, Crown, ShieldCheck, ArrowRight, Star,
  BadgeCheck, AlertCircle, HelpCircle, ChevronDown, Check, Download, Lock
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { paymentApi } from '@/lib/api';
import { PageLoader } from '@/components/feedback/PageLoader';
import DashboardShell from '@/components/layout/DashboardShell';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const FAQS = [
  {
    question: 'How do payments work on DevMeet?',
    answer: 'Payments are processed instantly and securely via Razorpay. We support UPI (Google Pay, PhonePe, Paytm), Credit & Debit Cards, Net Banking, and digital wallets. No international credit card is required.'
  },
  {
    question: 'Can I upgrade or downgrade my plan anytime?',
    answer: 'Yes! You can upgrade to Pro at any time to instantly unlock unlimited mock interviews, real-time AI hints, and comprehensive performance feedback. You can also cancel your plan with one click from this dashboard.'
  },
  {
    question: 'What is included in the Pro Plan?',
    answer: 'The Pro plan offers unlimited DSA & Behavioral mock interviews, AI audio streaming, dynamic hints, priority execution runtime, detailed STAR feedback reports, and shareable PDF analytics.'
  },
  {
    question: 'Are payments recurring automatically?',
    answer: 'No hidden charges or automatic lock-ins. Subscriptions are billed per month or annually depending on your selection, and you maintain complete control over renewal directly from your billing dashboard.'
  }
];

function PlanCard({
  plan,
  currentPlan,
  isAnnual,
  onUpgrade,
  upgrading
}: {
  plan: any;
  currentPlan: string;
  isAnnual: boolean;
  onUpgrade: (id: string) => void;
  upgrading: string | null;
}) {
  const isCurrentPlan = plan.plan === currentPlan;
  const isPro = plan.plan === 'pro';
  const isEnterprise = plan.plan === 'enterprise';
  const isFree = plan.plan === 'free';
  const isLoading = upgrading === plan.plan;

  // Calculate pricing with annual discount display if applicable
  const baseMonthlyPaise = plan.amount_paise || 0;
  const displayPaise = isAnnual && baseMonthlyPaise > 0 ? Math.round(baseMonthlyPaise * 0.8) : baseMonthlyPaise;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ${
        isPro
          ? 'bg-gradient-to-b from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-2xl shadow-indigo-500/20 border-2 border-indigo-400/40 transform hover:-translate-y-1'
          : 'bg-white text-slate-800 border border-slate-200/80 shadow-md hover:shadow-xl hover:border-indigo-200 transform hover:-translate-y-1'
      }`}
    >
      {isPro && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-[11px] font-black tracking-wider uppercase px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-amber-300">
            <Star className="w-3.5 h-3.5 fill-current" />
            MOST POPULAR CHOICE
          </span>
        </div>
      )}

      <div>
        {/* Header & Icon */}
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
            <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border ${
              isPro ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
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

        {/* Pricing */}
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
            <span className={`text-3xl font-black ${isPro ? 'text-white' : 'text-slate-900'}`}>{plan.price_display}</span>
          )}
        </div>

        {/* Feature List */}
        <div className="space-y-3 mb-8">
          <p className={`text-xs font-bold uppercase tracking-wider ${isPro ? 'text-indigo-300' : 'text-slate-400'}`}>What's Included</p>
          <ul className="space-y-2.5">
            {plan.features.map((feature: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5 text-xs font-medium">
                <div className={`p-0.5 rounded-full mt-0.5 shrink-0 ${isPro ? 'bg-indigo-400/20 text-indigo-300' : 'bg-emerald-100 text-emerald-700'}`}>
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
          <div className={`w-full py-3.5 rounded-xl text-center text-xs font-extrabold flex items-center justify-center gap-2 border ${
            isPro ? 'bg-white/10 text-white border-white/20' : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}>
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
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
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

function BillingSkeleton() {
  return (
    <div className="space-y-10">
      <div className="text-center space-y-3">
        <Skeleton className="h-6 w-32 mx-auto rounded-full" />
        <Skeleton className="h-10 w-64 mx-auto" />
        <Skeleton className="h-4 w-[450px] max-w-full mx-auto" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-6">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-10 w-24" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingPageContent() {
  const { user } = useAuth();
  const { isLoading: authGuardLoading } = useRequireAuth();
  const searchParams = useSearchParams();

  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<{ provider: string; razorpay_enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success' || payment === 'mock_success') toast.success('Payment successful! Your plan has been upgraded.');
    else if (payment === 'cancelled') toast.error('Payment was cancelled.');
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansData, subData, historyData, configData] = await Promise.all([
        paymentApi.getPlans(),
        paymentApi.getSubscription(),
        paymentApi.getBillingHistory().catch(() => ({ events: [], total: 0 })),
        paymentApi.getConfig().catch(() => ({ provider: 'mock', razorpay_enabled: false, currency: 'INR' })),
      ]);
      setPlans(plansData.plans || []);
      setSubscription(subData);
      setBillingHistory(historyData.events || []);
      setPaymentConfig(configData);
    } catch {
      toast.error('Failed to load billing information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authGuardLoading) fetchData();
  }, [authGuardLoading, fetchData]);

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      const order = await paymentApi.createCheckoutSession(planId);
      if (order.mode === 'mock') {
        if (user?.id) {
          await paymentApi.mockWebhook(user.id, planId, 'payment.captured');
          toast.success('Plan upgraded! (Mock mode – payment processed)');
          await fetchData();
        }
        return;
      }
      const loaded = await loadRazorpayScript();
      if (!loaded) { toast.error('Failed to load Razorpay SDK.'); return; }

      const options = {
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: order.name || 'DevMeet AI',
        description: order.description || `DevMeet ${planId} Subscription`,
        order_id: order.razorpay_order_id,
        prefill: { email: order.prefill_email || user?.email || '' },
        theme: { color: '#4f46e5' },
        handler: async (response: any) => {
          try {
            await paymentApi.verifyPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              plan: planId,
            });
            toast.success('Payment verified! Your plan has been upgraded.');
            await fetchData();
          } catch {
            toast.error('Payment verification failed. Please contact support.');
          }
        },
        modal: { ondismiss: () => setUpgrading(null) },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to initiate payment.');
    } finally {
      if (!window.Razorpay) setUpgrading(null);
      else setTimeout(() => setUpgrading(null), 500);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await paymentApi.cancelSubscription();
      toast.success('Subscription cancelled. You have been placed on the Free plan.');
      setShowCancelConfirm(false);
      await fetchData();
    } catch {
      toast.error('Failed to cancel subscription. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const formatAmount = (amount: number, currency = 'INR') => {
    if (!amount) return '—';
    if (currency === 'INR') return `₹${(amount / 100).toLocaleString('en-IN')}`;
    return `$${(amount / 100).toFixed(2)}`;
  };

  const formatEventType = (type: string) => {
    const map: Record<string, string> = {
      'payment.captured': 'Payment Received',
      'payment.captured.mock': 'Payment Processed (Mock)',
      'subscription.activated': 'Subscription Activated',
      'subscription.cancelled': 'Subscription Cancelled',
      'razorpay.order.created': 'Checkout Initialized',
      'razorpay.order.created.mock': 'Checkout Initialized (Mock)',
    };
    return map[type] || type.replace(/[._]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (authGuardLoading) return <PageLoader label="Verifying access…" />;

  const currentPlan = subscription?.plan || 'free';

  return (
    <DashboardShell maxWidth="max-w-6xl">
      {loading ? (
        <BillingSkeleton />
      ) : (
        <div className="space-y-12 pb-10">
          {/* Hero Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-extrabold tracking-wide uppercase">
              <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
              Subscription &amp; Plans
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              Simple, Transparent <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Pricing</span>
            </h1>
            <p className="text-slate-500 text-base max-w-2xl mx-auto leading-relaxed font-medium">
              Accelerate your tech career with AI-driven mock interviews, real-time code execution, and STAR behavioral evaluation. Secure instant checkout via Razorpay.
            </p>

            {/* Monthly / Annual Toggle */}
            <div className="pt-4 flex items-center justify-center gap-3">
              <span className={`text-xs font-bold ${!isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>Monthly Billed</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className="w-14 h-7 bg-indigo-600 rounded-full p-1 transition-colors relative flex items-center shadow-inner"
              >
                <motion.div
                  animate={{ x: isAnnual ? 28 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="w-5 h-5 bg-white rounded-full shadow-md"
                />
              </button>
              <span className={`text-xs font-bold flex items-center gap-1.5 ${isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>
                Annual Billed
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                  SAVE 20%
                </span>
              </span>
            </div>
          </div>

          {/* Active Subscription Notice */}
          {currentPlan !== 'free' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-sm">
                  <BadgeCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-extrabold text-emerald-950 text-base">Active: {currentPlan.toUpperCase()} Subscription</p>
                    <span className="bg-emerald-200/60 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                      {subscription?.status || 'Active'}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Your account has full access to all Pro interview modules and evaluation reports.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-xs font-extrabold text-rose-600 hover:text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 px-4 py-2.5 rounded-xl transition-all shadow-sm"
              >
                Cancel Subscription
              </button>
            </motion.div>
          )}

          {/* Cancel Confirmation Modal */}
          <AnimatePresence>
            {showCancelConfirm && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl"
                >
                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-900">Cancel Plan?</h3>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed mb-6">
                    Cancelling will downgrade your account to the Free tier. You will lose access to unlimited sessions, AI hints, and exportable reports.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                    >
                      Keep Subscription
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-colors flex items-center justify-center gap-2 shadow-md shadow-rose-500/20"
                    >
                      {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Confirm Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Plan Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {plans.map((plan) => (
              <PlanCard
                key={plan.plan}
                plan={plan}
                currentPlan={currentPlan}
                isAnnual={isAnnual}
                onUpgrade={handleUpgrade}
                upgrading={upgrading}
              />
            ))}
          </div>

          {/* Payment Trust Banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 flex flex-wrap items-center justify-around gap-6 text-xs text-slate-600 font-bold shadow-sm">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span>Razorpay 256-Bit SSL Encryption</span>
            </div>
            <div className="flex items-center gap-2.5">
              <IndianRupee className="w-5 h-5 text-indigo-500" />
              <span>UPI, Cards, NetBanking &amp; Wallets</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-purple-500" />
              <span>Instant Activation &amp; Cancel Anytime</span>
            </div>
          </div>

          {/* Billing History */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">Billing History</h2>
                  <p className="text-xs text-slate-400 font-medium">Recent transactions and subscription events</p>
                </div>
              </div>
              {billingHistory.length > 0 && (
                <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">
                  {billingHistory.length} Events Logged
                </span>
              )}
            </div>

            {billingHistory.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 font-bold text-sm">No transaction records found</p>
                <p className="text-xs text-slate-400 mt-1">Your payment activity and receipt history will display here after your first transaction.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto">
                {billingHistory.map((event) => (
                  <div key={event.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`p-2.5 rounded-2xl shrink-0 ${
                          event.event_type.includes('cancelled') || event.event_type.includes('failed')
                            ? 'bg-rose-50 text-rose-500'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {event.event_type.includes('cancelled') || event.event_type.includes('failed') ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{formatEventType(event.event_type)}</p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {event.plan ? `Plan: ${event.plan.toUpperCase()}` : ''}{' '}
                          {event.razorpay_event_id ? `· Txn ID: ${event.razorpay_event_id.slice(0, 16)}…` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-extrabold text-slate-900">{formatAmount(event.amount, event.currency)}</p>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                        {new Date(event.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FAQs Section */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-2xl text-amber-600">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Frequently Asked Questions</h2>
                <p className="text-xs text-slate-400 font-medium">Everything you need to know about payments &amp; plan access</p>
              </div>
            </div>

            <div className="space-y-4">
              {FAQS.map((faq, index) => {
                const isOpen = activeFaq === index;
                return (
                  <div
                    key={index}
                    className="border border-slate-200/70 rounded-2xl overflow-hidden transition-colors"
                  >
                    <button
                      onClick={() => setActiveFaq(isOpen ? null : index)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left bg-slate-50/50 hover:bg-slate-50 font-bold text-xs text-slate-800 transition-colors"
                    >
                      <span>{faq.question}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden bg-white px-6 py-4 text-xs text-slate-600 leading-relaxed border-t border-slate-100 font-medium"
                        >
                          {faq.answer}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Assistance */}
          <div className="text-center text-xs text-slate-400 space-y-1.5 pt-4">
            <p className="font-semibold">Need custom invoices or help with your order?</p>
            <p>
              Contact support at{' '}
              <a href="mailto:support@devmeet.com" className="text-indigo-600 font-bold hover:underline">
                support@devmeet.com
              </a>{' '}
              or reach sales at{' '}
              <a href="mailto:sales@devmeet.com" className="text-indigo-600 font-bold hover:underline">
                sales@devmeet.com
              </a>
            </p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading billing..." />}>
      <BillingPageContent />
    </Suspense>
  );
}
