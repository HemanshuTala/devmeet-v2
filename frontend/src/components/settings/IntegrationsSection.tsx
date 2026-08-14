'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Slack,
  Calendar,
  Webhook,
  Link as LinkIcon,
  Zap,
  Check,
  Plus,
  Trash2,
  Play,
  Copy,
  ExternalLink,
  Settings,
  AlertCircle,
  Database,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Integration {
  id: string;
  name: string;
  category: 'ats' | 'collab' | 'calendar';
  description: string;
  logoColor: string;
  connected: boolean;
  fields: Array<{ name: string; label: string; placeholder: string; type: string; value: string }>;
}

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

const INITIAL_INTEGRATIONS: Integration[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    category: 'ats',
    description: 'Sync candidates, export feedback reports, and trigger mock evaluations directly inside Greenhouse.',
    logoColor: 'bg-emerald-600',
    connected: false,
    fields: [
      { name: 'apiKey', label: 'Greenhouse Harvest API Key', placeholder: 'gh_harvest_...', type: 'password', value: '' },
      { name: 'boardId', label: 'Job Board ID', placeholder: 'e.g., devmeet_jobs', type: 'text', value: '' },
    ],
  },
  {
    id: 'lever',
    name: 'Lever',
    category: 'ats',
    description: 'Sync candidate pipelines. Create mock interviews automatically when a candidate reaches a technical stage.',
    logoColor: 'bg-indigo-650',
    connected: false,
    fields: [
      { name: 'clientId', label: 'Lever Client ID', placeholder: 'lv_...', type: 'text', value: '' },
      { name: 'clientSecret', label: 'Lever Client Secret', placeholder: '••••••••••••', type: 'password', value: '' },
    ],
  },
  {
    id: 'ashby',
    name: 'Ashby',
    category: 'ats',
    description: 'Automate candidate interview scheduling and upload structured DSA evaluations to Ashby scorecard.',
    logoColor: 'bg-rose-500',
    connected: false,
    fields: [
      { name: 'apiKey', label: 'Ashby API Key', placeholder: 'ashby_api_...', type: 'password', value: '' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'collab',
    description: 'Send live updates and summary notifications to chosen channels when candidates complete coding sessions.',
    logoColor: 'bg-amber-500',
    connected: false,
    fields: [
      { name: 'webhookUrl', label: 'Slack Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'text', value: '' },
    ],
  },
  {
    id: 'gcal',
    name: 'Google Calendar',
    category: 'calendar',
    description: 'Synchronize interview invitations and block developer schedules when mock practices are confirmed.',
    logoColor: 'bg-blue-600',
    connected: false,
    fields: [],
  },
];

export function IntegrationsSection() {
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Webhook states
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([
    {
      id: 'wh_1',
      url: 'https://api.yourcompany.com/v1/devmeet-webhook',
      events: ['session.completed', 'proctor.violation'],
      secret: 'whsec_8a3f9e8b2d1c6f4a7b5e3d9f0c2a8b7e',
      active: true,
    },
  ]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['session.completed']);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookSuccess, setWebhookSuccess] = useState<string | null>(null);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleConnect = (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;

    if (integration.connected) {
      // Disconnect
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, connected: false } : i))
      );
      setActiveConfigId(null);
    } else {
      // Show config fields if they exist, else connect directly
      if (integration.fields.length > 0) {
        setActiveConfigId(id);
      } else {
        simulateConnection(id);
      }
    }
  };

  const simulateConnection = (id: string) => {
    setConnecting(id);
    setTimeout(() => {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, connected: true } : i))
      );
      setConnecting(null);
      setActiveConfigId(null);
    }, 1500);
  };

  const handleFieldChange = (intId: string, fieldName: string, value: string) => {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.id !== intId) return i;
        return {
          ...i,
          fields: i.fields.map((f) => (f.name === fieldName ? { ...f, value } : f)),
        };
      })
    );
  };

  // Webhooks functions
  const handleAddWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookError(null);
    setWebhookSuccess(null);

    if (!newWebhookUrl.trim()) {
      setWebhookError('Please enter a valid URL.');
      return;
    }
    if (!newWebhookUrl.startsWith('http://') && !newWebhookUrl.startsWith('https://')) {
      setWebhookError('Webhook URL must start with http:// or https://');
      return;
    }

    const randomSecret = 'whsec_' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const newWh: WebhookConfig = {
      id: 'wh_' + Date.now(),
      url: newWebhookUrl.trim(),
      events: [...newWebhookEvents],
      secret: randomSecret,
      active: true,
    };

    setWebhooks((prev) => [...prev, newWh]);
    setNewWebhookUrl('');
    setWebhookSuccess('Webhook registered successfully!');
    setTimeout(() => setWebhookSuccess(null), 3000);
  };

  const handleDeleteWebhook = (id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const handleTestWebhook = (id: string) => {
    setTestingWebhookId(id);
    setTimeout(() => {
      setTestingWebhookId(null);
      setWebhookSuccess('Test event triggered successfully! (Status 200 OK)');
      setTimeout(() => setWebhookSuccess(null), 3000);
    }, 1200);
  };

  const toggleEventSelection = (event: string) => {
    setNewWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <div className="space-y-6">
      {/* Integrations Header */}
      <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-2">
        <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-blue-600" />
          Third-Party Integrations
        </h3>
        <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
          Connect DevMeet to your Applicant Tracking Systems (ATS), workspace communication apps, and calendars to automate coding test evaluations, candidate scoring, and calendar booking.
        </p>
      </div>

      {/* Main Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((int) => {
          const isConfiguring = activeConfigId === int.id;
          const isConnecting = connecting === int.id;

          return (
            <div
              key={int.id}
              className="bg-white border border-slate-150 rounded-2xl p-5 flex flex-col justify-between hover:shadow-md transition-all duration-200"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm ${int.logoColor}`}>
                      {int.id === 'slack' && <Slack className="w-5 h-5" />}
                      {int.id === 'gcal' && <Calendar className="w-5 h-5" />}
                      {(int.id !== 'slack' && int.id !== 'gcal') && <LinkIcon className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-slate-900 font-bold text-sm flex items-center gap-1.5">
                        {int.name}
                        {int.connected && (
                          <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-full font-bold">
                            Connected
                          </span>
                        )}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {int.category === 'ats' ? 'ATS Integration' : int.category === 'collab' ? 'Collaboration' : 'Calendar'}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                  {int.description}
                </p>
              </div>

              {/* Dynamic Field Config Drawer */}
              <AnimatePresence>
                {isConfiguring && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-4 border-t border-slate-100 space-y-3 overflow-hidden"
                  >
                    {int.fields.map((field) => (
                      <div key={field.name}>
                        <label className="text-[11px] font-bold text-slate-650 block mb-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          value={field.value}
                          onChange={(e) => handleFieldChange(int.id, field.name, e.target.value)}
                          placeholder={field.placeholder}
                          className="input-field w-full outline-none py-1.5 px-3 text-xs"
                        />
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Connection Buttons */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-slate-50 justify-end">
                {isConfiguring ? (
                  <>
                    <button
                      onClick={() => setActiveConfigId(null)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => simulateConnection(int.id)}
                      disabled={isConnecting}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Verifying…
                        </>
                      ) : (
                        'Save & Connect'
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleToggleConnect(int.id)}
                    disabled={isConnecting}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      int.connected
                        ? 'border border-red-200 text-red-650 hover:bg-red-50'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isConnecting ? (
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Connecting…
                      </span>
                    ) : int.connected ? (
                      'Disconnect'
                    ) : (
                      'Connect'
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhooks Section */}
      <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-6">
        <div>
          <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
            <Webhook className="w-5 h-5 text-blue-600" />
            Developer Webhooks
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Build custom integrations using outgoing HTTP POST payloads triggered by test/evaluation events.
          </p>
        </div>

        {/* Existing Webhooks List */}
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-slate-350 transition-all duration-200"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-450 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 truncate">{wh.url}</span>
                  <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                    Active
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {wh.events.map((ev) => (
                    <span key={ev} className="text-[9.5px] font-mono font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      {ev}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                  <span>Signing Secret:</span>
                  <code className="bg-slate-200/60 px-1.5 py-0.5 rounded truncate font-mono text-[9px]">
                    {wh.secret.substring(0, 14)}...
                  </code>
                  <button
                    onClick={() => handleCopy(wh.secret, wh.id)}
                    className="text-slate-450 hover:text-slate-700 transition-colors"
                  >
                    {copiedKey === wh.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 shrink-0 items-center">
                <button
                  onClick={() => handleTestWebhook(wh.id)}
                  disabled={testingWebhookId === wh.id}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-650 text-xs font-bold flex items-center gap-1 shadow-sm"
                  title="Trigger a mock test payload"
                >
                  {testingWebhookId === wh.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
                  )}
                  <span>Test URL</span>
                </button>
                <button
                  onClick={() => handleDeleteWebhook(wh.id)}
                  className="p-2 rounded-lg border border-red-100 hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
                  title="Remove Webhook"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {webhooks.length === 0 && (
            <p className="text-slate-400 text-xs py-4 text-center italic">
              No custom webhooks registered yet.
            </p>
          )}
        </div>

        {/* Add New Webhook form */}
        <form onSubmit={handleAddWebhook} className="space-y-4 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add Outgoing Webhook</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-650 block mb-1">
                Payload URL
              </label>
              <input
                type="text"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                placeholder="https://api.yourdomain.com/webhooks"
                className="input-field w-full outline-none py-2 px-3 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-650 block mb-2">
                Trigger Events
              </label>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {[
                  { id: 'session.completed', label: 'Session Completed' },
                  { id: 'proctor.violation', label: 'Proctor Violation' },
                  { id: 'feedback.generated', label: 'Feedback Ready' },
                ].map((ev) => {
                  const isSelected = newWebhookEvents.includes(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => toggleEventSelection(ev.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 text-blue-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {ev.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {webhookError && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2.5 rounded-lg border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{webhookError}</span>
            </div>
          )}

          {webhookSuccess && (
            <div className="flex items-center gap-2 text-emerald-600 text-xs bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
              <Check className="w-4 h-4 shrink-0" />
              <span>{webhookSuccess}</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="outline"
              className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-xs font-bold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Register Webhook
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
