'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard, CheckCircle, XCircle, Loader2, Zap, Building2, Sparkles,
  Clock, IndianRupee, Receipt, Crown, Shield, ArrowRight, Star, BadgeCheck, AlertCircle,
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

function PlanCard({ plan, currentPlan, onUpgrade, upgrading }: { plan: any; currentPlan: string; onUpgrade: (id: string) => void; upgrading: string | null }) {
  const isCurrentPlan = plan.plan === currentPlan;
  const isPro = plan.plan === 'pro';
  const isEnterprise = plan.plan === 'enterprise';
  const isFree = plan.plan === 'free';
  const isLoading = upgrading === plan.plan;

  const cardClass = isPro
    ? 'relative bg-blue-600 rounded-2xl p-8 text-white shadow-lg shadow-blue-500/10 border border-blue-500/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200'
    : 'relative bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5 transition-all duration-200';

  return (
    <div className={cardClass}>
      {isPro && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-amber-400 text-slate-900 text-xs font-black px-5 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
            <Star className="w-3.5 h-3.5 fill-current" />
            MOST POPULAR
          </span>
        </div>
      )}
      <div className="mb-6">
        <div className={`inline-flex p-3 rounded-2xl mb-4 ${isPro ? 'bg-white/20' : 'bg-blue-50 border border-blue-100/30'}`}>
          {isFree && <Zap className="w-6 h-6 text-blue-600" />}
          {isPro && <Crown className="w-6 h-6 text-white" />}
          {isEnterprise && <Building2 className="w-6 h-6 text-blue-600" />}
        </div>
        <h3 className={`text-2xl font-bold mb-1 ${isPro ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
        <div className="flex items-end gap-1 mt-3">
          {plan.amount_paise > 0 ? (
            <>
              <span className={`text-4xl font-black ${isPro ? 'text-white' : 'text-slate-900'}`}>
                &#8377;{(plan.amount_paise / 100).toLocaleString('en-IN')}
              </span>
              <span className={`text-sm pb-1 font-medium ${isPro ? 'text-purple-200' : 'text-slate-500'}`}>/month</span>
            </>
          ) : (
            <span className={`text-3xl font-black ${isPro ? 'text-white' : 'text-slate-900'}`}>{plan.price_display}</span>
          )}
        </div>
      </div>

      <ul className="space-y-3 mb-8">
        {plan.features.map((feature: string, i: number) => (
          <li key={i} className="flex items-start gap-2.5">
            <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPro ? 'text-green-300' : 'text-green-500'}`} />
            <span className={`text-sm font-medium ${isPro ? 'text-purple-100' : 'text-slate-600'}`}>{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrentPlan ? (
        <div className={`w-full py-3 rounded-xl text-center text-sm font-bold flex items-center justify-center gap-2 ${isPro ? 'bg-white/20 text-white' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          <BadgeCheck className="w-4 h-4" />
          Current Plan
        </div>
      ) : isEnterprise ? (
        <a href="mailto:sales@devmeet.com" className="w-full py-3 rounded-xl text-center text-sm font-semibold flex items-center justify-center gap-2 border border-blue-200 text-blue-600 hover:bg-blue-50/50 transition-colors">
          <ArrowRight className="w-4 h-4" />
          Contact Sales
        </a>
      ) : !isFree ? (
        <button
          onClick={() => onUpgrade(plan.plan)}
          disabled={isLoading}
          className={`w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
            isPro ? 'bg-white text-blue-600 hover:bg-slate-50 shadow-sm hover:shadow-md' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing&hellip;
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Upgrade to {plan.name.split(' ')[1]}
            </>
          )}
        </button>
      ) : (
        <div className="w-full py-3 rounded-xl text-center text-sm font-medium text-slate-400">Always free</div>
      )}
    </div>
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
          <div key={i} className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm space-y-6">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-10 w-24" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="space-y-3 pt-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
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
          toast.success('Plan upgraded! (Mock mode – no real payment taken)');
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
        name: order.name || 'DevMeet',
        description: order.description || `DevMeet ${planId} Plan`,
        order_id: order.razorpay_order_id,
        prefill: { email: order.prefill_email || user?.email || '' },
        theme: { color: '#7c3aed' },
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
      toast.success('Subscription cancelled. You have been downgraded to the Free plan.');
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
      'payment.captured.mock': 'Payment (Mock)',
      'subscription.activated': 'Subscription Activated',
      'subscription.cancelled': 'Subscription Cancelled',
      'razorpay.order.created': 'Order Created',
      'razorpay.order.created.mock': 'Order Created (Mock)',
    };
    return map[type] || type.replace(/[._]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (authGuardLoading) return <PageLoader label="Checking credentials…" />;

  const currentPlan = subscription?.plan || 'free';

  return (
    <DashboardShell maxWidth="max-w-5xl">
      {loading ? (
        <BillingSkeleton />
      ) : (
        <div className="space-y-10">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 px-4 py-1.5 rounded-full text-xs font-bold mb-2">
              <CreditCard className="w-3.5 h-3.5" />
              Billing &amp; Plans
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
              Choose Your <span className="text-blue-600">Interview Plan</span>
            </h1>
            <p className="text-slate-500 text-base max-w-2xl mx-auto">
              Unlock unlimited AI-powered mock interviews, advanced analytics, and expert feedback. Pay securely with Razorpay — no international card required.
            </p>
          </div>

          {/* Active subscription banner */}
          {currentPlan !== 'free' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-100 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-green-900">Active: {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan</p>
                  <p className="text-sm text-green-700">Status: {subscription?.status || 'active'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-sm font-semibold text-rose-600 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 px-4 py-2 rounded-xl transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          )}

          {/* Cancel confirmation modal */}
          {showCancelConfirm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[3px] z-50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl">
                    <AlertCircle className="w-6 h-6 text-rose-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Cancel Subscription?</h3>
                </div>
                <p className="text-slate-600 mb-6">
                  You&apos;ll be downgraded to the Free plan immediately. You&apos;ll lose access to unlimited interviews, AI feedback reports, and PDF exports.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowCancelConfirm(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
                    Keep My Plan
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Yes, Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Plan cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {plans.map((plan) => (
              <PlanCard key={plan.plan} plan={plan} currentPlan={currentPlan} onUpgrade={handleUpgrade} upgrading={upgrading} />
            ))}
          </div>

          {/* Trust badges */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span>Secured by Razorpay</span>
            </div>
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-blue-500" />
              <span>Pay via UPI, Cards, Net Banking &amp; Wallets</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-violet-500" />
              <span>Cancel anytime, no lock-in</span>
            </div>
          </div>

          {/* Billing history */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md hover:border-slate-200/60 transition-all duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 border border-blue-100/50 rounded-xl">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Billing History</h2>
                <p className="text-sm text-slate-400">Your recent payment events</p>
              </div>
            </div>
            {billingHistory.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No billing events yet</p>
                <p className="text-sm text-slate-400">Your payment history will appear here after your first transaction.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {billingHistory.map((event) => (
                  <div key={event.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${event.event_type.includes('cancelled') || event.event_type.includes('failed') ? 'bg-rose-50' : 'bg-green-50'}`}>
                        {event.event_type.includes('cancelled') || event.event_type.includes('failed') ? (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{formatEventType(event.event_type)}</p>
                        <p className="text-xs text-slate-500 capitalize">
                          {event.plan ? `Plan: ${event.plan}` : ''} {event.razorpay_event_id ? `· ID: ${event.razorpay_event_id.slice(0, 14)}…` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{formatAmount(event.amount, event.currency)}</p>
                      <p className="text-xs text-slate-400">{new Date(event.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-slate-500 space-y-1 pb-6">
            <p>Questions about billing? <a href="mailto:support@devmeet.com" className="text-blue-600 font-semibold hover:underline">support@devmeet.com</a></p>
            <p>For enterprise pricing and team plans, contact <a href="mailto:sales@devmeet.com" className="text-blue-600 font-semibold hover:underline">sales@devmeet.com</a></p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading billing…" />}>
      <BillingPageContent />
    </Suspense>
  );
}
