'use client';

import React from 'react';
import { Receipt, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface BillingEvent {
  id: string;
  created_at: string;
  event_type: string;
  amount: number;
  plan: string;
  status?: string;
  invoice_id?: string;
}

interface BillingHistoryTableProps {
  events: BillingEvent[];
}

function formatAmount(amount: number) {
  if (!amount) return '—';
  return `₹${(amount / 100).toLocaleString('en-IN')}`;
}

function formatEventType(type: string) {
  const map: Record<string, string> = {
    'payment.captured': 'Payment Received',
    'subscription.activated': 'Plan Activated',
    'subscription.cancelled': 'Plan Cancelled',
    'subscription.renewed': 'Plan Renewed',
  };
  return map[type] || type;
}

/**
 * Renders the table of past Razorpay billing transactions, tax receipts, and order statuses.
 */
export function BillingHistoryTable({ events }: BillingHistoryTableProps) {
  if (!events || events.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center">
        <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h4 className="text-sm font-bold text-slate-800">No Billing History</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Past payment receipts and order invoices will appear here once you purchase or upgrade credits.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-blue-600" />
          <h4 className="text-sm font-bold text-slate-900">Payment & Invoice History</h4>
        </div>
        <span className="text-xs font-semibold text-slate-500">{events.length} records</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
            <tr>
              <th className="py-3 px-6">Date</th>
              <th className="py-3 px-6">Description</th>
              <th className="py-3 px-6">Plan</th>
              <th className="py-3 px-6">Amount</th>
              <th className="py-3 px-6">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3.5 px-6 text-slate-500 whitespace-nowrap">
                  {new Date(event.created_at).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="py-3.5 px-6 font-semibold text-slate-900">
                  {formatEventType(event.event_type)}
                </td>
                <td className="py-3.5 px-6 uppercase text-[10px] font-bold text-slate-600">
                  {event.plan}
                </td>
                <td className="py-3.5 px-6 font-bold text-slate-900 whitespace-nowrap">
                  {formatAmount(event.amount)}
                </td>
                <td className="py-3.5 px-6 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    Success
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BillingHistoryTable;
