'use client';

import React from 'react';
import { ClipboardList, Download, Loader2 } from 'lucide-react';

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface AdminAuditLogsTableProps {
  logs: AuditLog[];
  loading: boolean;
  onExportCsv: () => void;
}

/**
 * Audit log activity table with chronological events and CSV export button.
 */
export function AdminAuditLogsTable({ logs, loading, onExportCsv }: AdminAuditLogsTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">System Audit Trail</h3>
            <p className="text-[11px] text-slate-500">{logs.length} logged administrative events</p>
          </div>
        </div>
        <button
          onClick={onExportCsv}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400">No audit logs recorded yet.</div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto text-xs">
          {logs.map((log) => {
            const isNegative = log.action.includes('block') || log.action.includes('delete');
            const isAuth = log.action.includes('login') || log.action.includes('auth');
            const isPlan = log.action.includes('plan') || log.action.includes('payment');

            const badgeColor = isNegative
              ? 'text-rose-700 bg-rose-50 border-rose-200'
              : isAuth
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : isPlan
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-blue-700 bg-blue-50 border-blue-200';

            return (
              <div
                key={log.id}
                className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeColor}`}
                  >
                    {log.action}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap text-slate-800 font-semibold">
                      <span>{log.resource_type}</span>
                      {log.resource_id && (
                        <span className="text-[10px] font-mono text-slate-400">
                          {log.resource_id}
                        </span>
                      )}
                    </div>
                    {log.ip_address && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Client IP: {log.ip_address}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminAuditLogsTable;
