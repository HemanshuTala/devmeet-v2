/**
 * @file page.tsx
 * @description Custom Interview Session Setup Wizard & AI Launcher for DevMeet.
 *
 * Responsibilities:
 * 1. Multi-Step Interview Configuration:
 *    - Step 1 (Interview Type): DSA & Coding, Behavioral (STAR), or System Design.
 *    - Step 2 (Difficulty Level): Easy, Medium (Senior), or Hard (Advanced/Staff).
 *    - Step 3 (Duration): Preset buttons (15m, 30m, 45m, 60m, 90m, 120m) and continuous Slider.
 *    - Step 4 (Targeting & Focus): Company name (e.g. Google, Meta) and topic focus (e.g. Dynamic Programming, Distributed Databases).
 * 2. URL Parameter Pre-population:
 *    - Automatically synchronizes query params (`?type=...&difficulty=...&focus=...&company=...`).
 * 3. Sticky Real-time Summary Card:
 *    - Updates live as candidate toggles configuration options.
 * 4. Concurrent Active Session Safeguard:
 *    - Catches HTTP 409 conflict errors (`CONCURRENT_SESSION`), extracts the UUID, and smoothly resumes existing session.
 * 5. Fullscreen Launch Experience (`LaunchOverlay`):
 *    - Displays progress steps ("Authenticating session", "Spinning up AI interviewer", "Preparing questions", "Launching interview room").
 *
 * @module app/dashboard/create-session/page
 */

'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Code2,
  MessageSquare,
  Layout,
  Play,
  Target,
  Check,
  Timer,
  Building2,
  ShieldCheck,
  Bot,
  ClipboardList,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { useCreateSession } from '@/hooks/queries/useSessions';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import DashboardShell from '@/components/layout/DashboardShell';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';

/** Interview type specifications */
const TYPES = [
  {
    value: 'dsa',
    label: 'Data Structures & Algorithms',
    shortLabel: 'DSA / Coding',
    description: 'Coding problems, algorithmic thinking, and time & space complexity analysis.',
    icon: Code2,
    skills: ['Arrays & Trees', 'DP & Graphs', 'Big O Analysis', 'Optimizations'],
    accent: '#2563eb',
    accentBg: 'bg-blue-50/80',
    accentBorder: 'border-blue-200',
    accentRing: 'ring-blue-500/20',
    accentText: 'text-blue-600',
    badgeBg: 'bg-blue-600 text-white',
  },
  {
    value: 'behavioral',
    label: 'Behavioral Interview',
    shortLabel: 'Behavioral',
    description: 'Leadership stories, soft skills, and STAR-method response techniques.',
    icon: MessageSquare,
    skills: ['STAR Structure', 'Conflict Mgmt', 'Leadership', 'Team Dynamics'],
    accent: '#4f46e5',
    accentBg: 'bg-indigo-50/80',
    accentBorder: 'border-indigo-200',
    accentRing: 'ring-indigo-500/20',
    accentText: 'text-indigo-600',
    badgeBg: 'bg-indigo-600 text-white',
  },
  {
    value: 'system_design',
    label: 'System Design',
    shortLabel: 'System Design',
    description: 'Scalable architectures, distributed systems, and engineering trade-offs.',
    icon: Layout,
    skills: ['Load Balancing', 'Microservices', 'Caching & DBs', 'Scalability'],
    accent: '#0d9488',
    accentBg: 'bg-teal-50/80',
    accentBorder: 'border-teal-200',
    accentRing: 'ring-teal-500/20',
    accentText: 'text-teal-600',
    badgeBg: 'bg-teal-600 text-white',
  },
];

/** Difficulty level specifications */
const DIFFICULTIES = [
  {
    value: 'easy',
    label: 'Easy',
    desc: 'Warm-up & fundamentals',
    activeBg: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/20',
    dotColor: 'bg-emerald-500',
    textActive: 'text-white',
    textMuted: 'text-emerald-100',
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
  },
  {
    value: 'medium',
    label: 'Medium',
    desc: 'Senior developer level',
    activeBg: 'bg-amber-600 text-white border-amber-600 shadow-amber-500/20',
    dotColor: 'bg-amber-500',
    textActive: 'text-white',
    textMuted: 'text-amber-100',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
  },
  {
    value: 'hard',
    label: 'Hard',
    desc: 'Advanced & edge cases',
    activeBg: 'bg-rose-600 text-white border-rose-600 shadow-rose-500/20',
    dotColor: 'bg-rose-500',
    textActive: 'text-white',
    textMuted: 'text-rose-100',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
  },
];

/** Preset session durations in minutes */
const DURATIONS = [15, 30, 45, 60, 90, 120];

/**
 * Formats duration in minutes to user-friendly label.
 */
function fmt(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Root CreateSessionPage component wrapped in Suspense boundary for `useSearchParams`.
 */
export default function CreateSessionPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell maxWidth="max-w-[1140px]">
          <div className="flex flex-col gap-6 animate-pulse">
            <div className="h-10 bg-slate-200/80 rounded-xl w-64" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-44 bg-slate-200/80 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 bg-slate-200/80 rounded-2xl" />
              ))}
            </div>
          </div>
        </DashboardShell>
      }
    >
      <CreateSessionForm />
    </Suspense>
  );
}

/**
 * Miniature circular spinner for pending states.
 */
function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  );
}

/**
 * StepHeader Component.
 */
function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="mb-3.5">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs">
          {n}
        </span>
        <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
      </div>
      <p className="text-xs text-slate-500 font-medium pl-8.5">{sub}</p>
    </div>
  );
}

/**
 * SummaryRow Component.
 */
function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">
          {label}
        </div>
        <div className="text-xs font-bold text-slate-800 truncate">{value}</div>
      </div>
    </div>
  );
}

/**
 * Styled text input for company and focus area fields.
 */
function StyledInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
    />
  );
}

const LAUNCH_STEP_ICONS = [ShieldCheck, Bot, ClipboardList, Rocket];
const LAUNCH_STEPS = [
  { label: 'Authenticating your session' },
  { label: 'Spinning up your AI interviewer' },
  { label: 'Preparing your questions' },
  { label: 'Launching interview room' },
];

/**
 * LaunchOverlay Component.
 * Fullscreen animated loading sequence presented while orchestrator service allocates resources.
 */
function LaunchOverlay({ step, type, difficulty }: { step: number; type: string; difficulty: string }) {
  const progress = ((step + 1) / (LAUNCH_STEPS.length + 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-8 max-w-md w-full flex flex-col items-center text-center">
        {/* Animated Icon */}
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200/60 flex items-center justify-center mb-6 shadow-sm">
          <Target className="w-8 h-8 text-blue-600 animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1.5">
          Launching Interview Room
        </h2>
        <p className="text-xs text-slate-500 font-medium mb-6">
          Allocating container runtime & connecting AI engine...
        </p>

        {/* Step List */}
        <div className="w-full flex flex-col gap-3 text-left">
          {LAUNCH_STEPS.map((s, idx) => {
            const Icon = LAUNCH_STEP_ICONS[idx];
            const done = idx < step;
            const active = idx === step;
            return (
              <div
                key={s.label}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  active
                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                    : done
                    ? 'bg-emerald-50/50 border-emerald-200/60 text-emerald-800'
                    : 'bg-slate-50/50 border-slate-100 text-slate-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? 'bg-blue-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {done ? <Check className="w-4 h-4 stroke-[3]" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className="text-xs font-bold flex-1">{s.label}</span>
                {active && (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-6 overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * CreateSessionForm Component.
 */
function CreateSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useRequireAuth();
  const createSession = useCreateSession();

  // Wizard state inputs
  const [selectedType, setSelectedType] = useState('dsa');
  const [selectedDiff, setSelectedDiff] = useState('medium');
  const [company, setCompany] = useState('');
  const [focus, setFocus] = useState('');
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);
  const stepTimers = useRef<number[]>([]);

  // Prepopulate form state from URL query parameters
  useEffect(() => {
    const t = searchParams.get('type');
    if (t && ['dsa', 'behavioral', 'system_design'].includes(t)) setSelectedType(t);
    const d = searchParams.get('difficulty');
    if (d && ['easy', 'medium', 'hard'].includes(d)) setSelectedDiff(d);
    const f = searchParams.get('focus');
    if (f) setFocus(f);
    const c = searchParams.get('company');
    if (c) setCompany(c);
  }, [searchParams]);

  /**
   * Dispatches createSession mutation to orchestrator service and manages launch animation.
   */
  const handleStart = useCallback(async () => {
    setError(null);
    setLaunching(true);
    setLaunchStep(0);

    const stepTimer = window.setTimeout(() => setLaunchStep(1), 150);
    stepTimers.current.push(stepTimer);

    try {
      setLaunchStep(2);
      const session = await createSession.mutateAsync({
        interview_type: selectedType,
        difficulty: selectedDiff,
        duration_minutes: duration,
        ...(company.trim() ? { target_company: company.trim() } : {}),
        ...(focus.trim() ? { focus_area: focus.trim() } : {}),
      });
      setLaunchStep(4);
      router.push(`/interview/${session.id}`);
    } catch (err: any) {
      setLaunching(false);
      stepTimers.current.forEach(clearTimeout);

      // Handle active concurrent session conflict
      const msg = err?.message ?? '';
      if (err?.code === 'CONCURRENT_SESSION' || msg.includes('active interview session')) {
        const match = msg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (match) {
          toast.info('Resuming your existing in-progress session.');
          router.push(`/interview/${match[0]}`);
          return;
        }
      }

      const userMsg = err?.message || 'Failed to create session. Please try again.';
      setError(userMsg);
      toast.error(userMsg);
    }
  }, [selectedType, selectedDiff, duration, company, focus, createSession, router]);

  useEffect(() => () => { stepTimers.current.forEach(clearTimeout); }, []);

  const typeData = TYPES.find((t) => t.value === selectedType) || TYPES[0];
  const diffData = DIFFICULTIES.find((d) => d.value === selectedDiff) || DIFFICULTIES[1];

  return (
    <>
      {launching && <LaunchOverlay step={launchStep} type={selectedType} difficulty={selectedDiff} />}

      <DashboardShell maxWidth="max-w-[1140px]">
        {/* Page Title */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-600 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interactive Setup Wizard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            New Interview Session
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Customize track, difficulty, duration, and target company to launch your personalized mock interview.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
          {/* Left Column: Form Steps */}
          <div className="flex flex-col gap-8">
            {/* Step 1: Interview Track Type */}
            <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
              <StepHeader n={1} title="Interview Type" sub="Choose the focus domain for this interview simulation" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
                {TYPES.map((type) => {
                  const Icon = type.icon;
                  const sel = selectedType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setSelectedType(type.value)}
                      className={`relative text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                        sel
                          ? `${type.accentBg} ${type.accentBorder} shadow-sm ring-2 ${type.accentRing}`
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      {sel && (
                        <div
                          className={`absolute top-3.5 right-3.5 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-xs ${type.badgeBg}`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                      <div>
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3.5 transition-all shadow-xs ${
                            sel ? `${type.badgeBg}` : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900 tracking-tight mb-1">
                          {type.label}
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium mb-4">
                          {type.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-auto pt-2">
                        {type.skills.map((s) => (
                          <span
                            key={s}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              sel
                                ? `${type.accentBorder} ${type.accentText} bg-white/80`
                                : 'border-slate-100 text-slate-400 bg-slate-50'
                            }`}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 2: Difficulty Level */}
            <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
              <StepHeader n={2} title="Difficulty Level" sub="Pick a level that matches your career benchmark" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4">
                {DIFFICULTIES.map((opt) => {
                  const sel = selectedDiff === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedDiff(opt.value)}
                      className={`text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                        sel
                          ? `${opt.activeBg} shadow-sm`
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              sel ? 'bg-white' : opt.dotColor
                            }`}
                          />
                          <span className={`text-sm font-extrabold ${sel ? 'text-white' : 'text-slate-900'}`}>
                            {opt.label}
                          </span>
                        </div>
                        {sel && <Check className="w-4 h-4 stroke-[3] text-white" />}
                      </div>
                      <p className={`text-xs font-medium pl-4 ${sel ? opt.textMuted : 'text-slate-500'}`}>
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 3 & 4: Duration & Targeting */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Duration with Slider */}
              <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <StepHeader n={3} title="Session Duration" sub="Select target interview time window" />
                  <div className="grid grid-cols-3 gap-2 mt-4 mb-5">
                    {DURATIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDuration(m)}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          duration === m
                            ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100'
                        }`}
                      >
                        {fmt(m)}
                      </button>
                    ))}
                  </div>
                  <Slider
                    min={15}
                    max={120}
                    step={15}
                    value={[duration]}
                    onValueChange={(v) => setDuration(v[0])}
                    aria-label="Duration"
                  />
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mt-2">
                    <span>15 min</span>
                    <span>2 hours</span>
                  </div>
                </div>
              </section>

              {/* Optional Settings */}
              <section className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
                <StepHeader n={4} title="Targeting & Focus" sub="Tailor prompts to target company rubrics" />
                <div className="flex flex-col gap-4 mt-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      Target Company
                    </label>
                    <StyledInput
                      value={company}
                      onChange={setCompany}
                      placeholder="e.g. Google, Meta, Stripe"
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                      <Target className="w-3.5 h-3.5 text-slate-400" />
                      Focus Area / Topic
                    </label>
                    <StyledInput
                      value={focus}
                      onChange={setFocus}
                      placeholder="e.g. Graphs, High Concurrency"
                      maxLength={120}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Right Column: Sticky Summary Card */}
          <div className="sticky top-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs space-y-5 p-6">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                  Session Preview
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  {typeData.shortLabel}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  {typeData.description}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-4 flex flex-col gap-3.5">
                <SummaryRow
                  icon={
                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center shrink-0">
                      <typeData.icon className="w-4 h-4 text-blue-600" />
                    </div>
                  }
                  label="Track"
                  value={typeData.shortLabel}
                />
                <SummaryRow
                  icon={
                    <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center shrink-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${diffData.dotColor}`} />
                    </div>
                  }
                  label="Difficulty"
                  value={<span className="font-extrabold">{diffData.label}</span>}
                />
                <SummaryRow
                  icon={
                    <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center shrink-0">
                      <Timer className="w-4 h-4 text-slate-500" />
                    </div>
                  }
                  label="Duration"
                  value={fmt(duration)}
                />
                {company && (
                  <SummaryRow
                    icon={
                      <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-slate-500" />
                      </div>
                    }
                    label="Target Company"
                    value={company}
                  />
                )}
                {focus && (
                  <SummaryRow
                    icon={
                      <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center shrink-0">
                        <Target className="w-4 h-4 text-slate-500" />
                      </div>
                    }
                    label="Focus Area"
                    value={focus}
                  />
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                  Rubric Topics
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {typeData.skills.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={createSession.isPending}
                  className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {createSession.isPending ? (
                    <>
                      <Spinner />
                      <span>Allocating Room...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Start Interview</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-2.5 font-medium">
                  Instant AI allocation · Zero setup required
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    </>
  );
}
