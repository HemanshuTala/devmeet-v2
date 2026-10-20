'use client';

import React from 'react';
import { Server, BarChart2, Globe, Database, Activity, Terminal } from 'lucide-react';
import { AdminStats } from './AdminStatCards';

interface AdminSystemHealthProps {
  stats: AdminStats | null;
}

/**
 * System health, microservice ports, and quick link monitoring cards for the admin console.
 */
export function AdminSystemHealth({ stats }: AdminSystemHealthProps) {
  const services = [
    { name: 'API Gateway', port: '8000', ok: true },
    { name: 'Auth Service', port: '8001', ok: true },
    { name: 'Session Service', port: '8002', ok: true },
    { name: 'AI Interviewer', port: '8003', ok: true },
    { name: 'Code Execution', port: '8004', ok: true },
    { name: 'Payment Service', port: '8005', ok: true },
    { name: 'Search Service', port: '8006', ok: true },
    { name: 'Video LiveKit Service', port: '8007', ok: true },
    { name: 'Feedback Evaluation', port: '8008', ok: true },
    { name: 'Analytics Service', port: '8009', ok: true },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Service Health */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Server className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Microservice Topology Status</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/50"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-slate-700">{svc.name}</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">:{svc.port}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <BarChart2 className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">Subscription Tier Distribution</h3>
        </div>
        {stats && (
          <div className="space-y-4">
            {[
              { label: 'Free Tier', count: stats.free_users, color: 'bg-slate-300' },
              { label: 'Pro Tier', count: stats.pro_users, color: 'bg-blue-600' },
              { label: 'Enterprise', count: stats.enterprise_users, color: 'bg-purple-600' },
            ].map((item) => {
              const pct = stats.total_users > 0 ? Math.round((item.count / stats.total_users) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{item.label}</span>
                    <span>
                      {item.count}{' '}
                      <span className="text-slate-400 font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${item.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Telemetry Links */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 md:col-span-2">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Globe className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Infrastructure Dashboards</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'RabbitMQ Broker', url: 'http://localhost:15672', icon: Database, color: 'text-orange-600 bg-orange-50 border-orange-100' },
            { label: 'Prometheus Metrics', url: 'http://localhost:9090', icon: Activity, color: 'text-rose-600 bg-rose-50 border-rose-100' },
            { label: 'Grafana Telemetry', url: 'http://localhost:3001', icon: BarChart2, color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'API Gateway Docs', url: 'http://localhost:8000/docs', icon: Terminal, color: 'text-blue-600 bg-blue-50 border-blue-100' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2.5 p-3 rounded-xl border font-bold text-xs hover:opacity-85 transition-opacity ${link.color}`}
            >
              <link.icon className="w-4 h-4 shrink-0" />
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminSystemHealth;
