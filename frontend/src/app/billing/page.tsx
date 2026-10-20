'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  ShieldCheck,
  IndianRupee,
  Lock,
  BadgeCheck,
  AlertCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { paymentApi } from '@/lib/api';
import { PageLoader } from '@/components/feedback/PageLoader';
import DashboardShell from '@/components/layout/DashboardShell';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

// Modularized Billing Subcomponents
import PlanCard from '@/components/billing/PlanCard';
import BillingHistoryTable from '@/components/billing/BillingHistoryTable';
import BillingFaq from '@/components/billing/BillingFaq';

declare global {
  interface Window {
    Razorpay: any;
  }
}

/**
 * Loads the external Razorpay Checkout SDK script dynamically.
 */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
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
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);

  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success' || payment === 'mock_success') {
      toast.success('Payment successful! Your plan has been upgraded.');
    } else if (payment === 'cancelled') {
      toast.error('Payment was cancelled.');
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansData, subData, historyData] = await Promise.all([
        paymentApi.getPlans(),
        paymentApi.getSubscription(),
        paymentApi.getBillingHistory().catch(() => ({ events: [], total: 0 })),
      ]);
      setPlans(plansData.plans || []);
      setSubscription(subData);
      setBillingHistory(historyData.events || []);
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
      if (!loaded) {
        toast.error('Failed to load Razorpay SDK.');
        return;
      }

      const options = {
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: order.name || 'DevMeet AI',
        description: order.description || `DevMeet ${planId} Subscription`,
        order_id: order.razorpay_order_id,
        prefill: { email: order.prefill_email || user?.email || '' },
        theme: { color: '#2563eb' },
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

  if (authGuardLoading) return <PageLoader label="Verifying access…" />;

  const currentPlan = subscription?.plan || 'free';

  return (
    <DashboardShell maxWidth="max-w-6xl">
      {loading ? (
        <BillingSkeleton />
      ) : (
        <div className="space-y-12 pb-10">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-xs font-extrabold tracking-wide uppercase">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              Subscription &amp; Plans
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              Simple, Transparent <span className="text-blue-600">Pricing</span>
            </h1>
            <p className="text-slate-500 text-base max-w-2xl mx-auto leading-relaxed font-medium">
              Accelerate your tech career with AI-driven mock interviews, real-time code execution, and STAR behavioral evaluation. Secure instant checkout via Razorpay.
            </p>

            {/* Monthly / Annual Toggle */}
            <div className="pt-4 flex items-center justify-center gap-3">
              <span className={`text-xs font-bold ${!isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>
                Monthly Billed
              </span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                aria-label="Toggle annual billing discount"
                className="w-14 h-7 bg-blue-600 rounded-full p-1 transition-colors relative flex items-center shadow-inner"
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
                    <p className="font-extrabold text-emerald-950 text-base">
                      Active: {currentPlan.toUpperCase()} Subscription
                    </p>
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
                  <p className="text-slate-600 text-sm leading-relaxed mb-6 font-medium">
                    Cancelling will downgrade your account to the Free tier. You will lose access to unlimited sessions, dynamic AI hints, and exportable reports.
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
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 flex flex-wrap items-center justify-around gap-6 text-xs text-slate-600 font-bold shadow-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span>Razorpay 256-Bit SSL Encryption</span>
            </div>
            <div className="flex items-center gap-2.5">
              <IndianRupee className="w-5 h-5 text-blue-500" />
              <span>UPI, Cards, NetBanking &amp; Wallets</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-indigo-500" />
              <span>Instant Activation &amp; Cancel Anytime</span>
            </div>
          </div>

          {/* Billing Transaction History Table */}
          <BillingHistoryTable events={billingHistory} />

          {/* Billing FAQs Section */}
          <BillingFaq />

          {/* Assistance Footer */}
          <div className="text-center text-xs text-slate-400 space-y-1.5 pt-4">
            <p className="font-semibold">Need custom invoices or corporate training packages?</p>
            <p>
              Contact support at{' '}
              <a href="mailto:support@devmeet.com" className="text-blue-600 font-bold hover:underline">
                support@devmeet.com
              </a>{' '}
              or reach sales at{' '}
              <a href="mailto:sales@devmeet.com" className="text-blue-600 font-bold hover:underline">
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
