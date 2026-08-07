'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Code2, MessageSquare, Layout, Play, Target, Check, Timer, Building2, ShieldCheck, Bot, ClipboardList, Rocket } from 'lucide-react';
import { useCreateSession } from '@/hooks/queries/useSessions';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import DashboardShell from '@/components/layout/DashboardShell';
import { toast } from 'sonner';
import { Slider } from '@/components/ui/slider';

const TYPES = [
  {
    value: 'dsa',
    label: 'Data Structures & Algorithms',
    shortLabel: 'DSA / Coding',
    description: 'Coding problems, algorithmic thinking, and time & space complexity analysis.',
    icon: Code2,
    skills: ['Arrays & Trees', 'DP & Graphs', 'Big O Analysis', 'Optimizations'],
    accent: '#4f46e5',
    accentBg: '#eef2ff',
    accentBorder: '#c7d2fe',
  },
  {
    value: 'behavioral',
    label: 'Behavioral Interview',
    shortLabel: 'Behavioral',
    description: 'Leadership stories, soft skills, and STAR-method response techniques.',
    icon: MessageSquare,
    skills: ['STAR Structure', 'Conflict Mgmt', 'Leadership', 'Team Dynamics'],
    accent: '#0891b2',
    accentBg: '#ecfeff',
    accentBorder: '#a5f3fc',
  },
  {
    value: 'system_design',
    label: 'System Design',
    shortLabel: 'System Design',
    description: 'Scalable architectures, distributed systems, and engineering trade-offs.',
    icon: Layout,
    skills: ['Load Balancing', 'Microservices', 'Caching & DBs', 'Scalability'],
    accent: '#7c3aed',
    accentBg: '#f5f3ff',
    accentBorder: '#ddd6fe',
  },
];

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy', desc: 'Warm-up & fundamentals', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', textColor: '#14532d' },
  { value: 'medium', label: 'Medium', desc: 'Senior developer level', color: '#d97706', bg: '#fffbeb', border: '#fde68a', textColor: '#78350f' },
  { value: 'hard', label: 'Hard', desc: 'Advanced & edge cases', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', textColor: '#7f1d1d' },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

function fmt(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function CreateSessionPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '24px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Title skeleton */}
            <div className="skeleton-shimmer" style={{ height: 32, width: 220, borderRadius: 8 }} />
            {/* Step 1 — interview type cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton-shimmer" style={{ height: 120, borderRadius: 12 }} />
              ))}
            </div>
            {/* Step 2 — difficulty + duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="skeleton-shimmer" style={{ height: 56, borderRadius: 10 }} />
              <div className="skeleton-shimmer" style={{ height: 56, borderRadius: 10 }} />
            </div>
            {/* Step 3 — text inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="skeleton-shimmer" style={{ height: 44, borderRadius: 8 }} />
              <div className="skeleton-shimmer" style={{ height: 44, borderRadius: 8 }} />
            </div>
            {/* Launch button */}
            <div className="skeleton-shimmer" style={{ height: 48, borderRadius: 12 }} />
          </div>
        </div>
      }
    >
      <CreateSessionForm />
    </Suspense>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        border: '2.5px solid #e5e5e5',
        borderTopColor: '#4f46e5',
        borderRadius: '50%',
        animation: 'spin 0.75s linear infinite',
      }}
    />
  );
}

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#4f46e5',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: '#999', margin: 0, paddingLeft: 30, fontWeight: 400 }}>{sub}</p>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {icon}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{value}</div>
      </div>
    </div>
  );
}

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
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid #e5e5e5',
        fontSize: 13,
        color: '#333',
        outline: 'none',
        fontFamily: 'inherit',
        transition: 'border 0.15s',
      }}
    />
  );
}

const TYPE_LABELS: Record<string, string> = { dsa: 'DSA & Coding', behavioral: 'Behavioral', system_design: 'System Design' };
const LAUNCH_STEP_ICONS = [ShieldCheck, Bot, ClipboardList, Rocket];
const LAUNCH_STEPS = [
  { label: 'Authenticating your session' },
  { label: 'Spinning up your AI interviewer' },
  { label: 'Preparing your questions' },
  { label: 'Launching interview room' },
];

function LaunchOverlay({ step, type, difficulty }: { step: number; type: string; difficulty: string }) {
  const progress = ((step + 1) / (LAUNCH_STEPS.length + 1)) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
        animation: 'launchFadeIn 0.3s ease',
      }}
    >
      <style>{`
        @keyframes launchFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes launchSpin { to { transform: rotate(360deg) } }
        @keyframes launchStepIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes launchCheckScale { 0% { transform: scale(0); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes launchPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes launchProgressGlow { 0%, 100% { box-shadow: 0 0 8px rgba(79,70,229,0.3); } 50% { box-shadow: 0 0 16px rgba(79,70,229,0.5); } }
      `}</style>

      {/* Spinner */}
      <div style={{ marginBottom: 32, position: 'relative' }}>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ animation: 'launchSpin 1.2s linear infinite' }}>
          <circle cx="28" cy="28" r="24" fill="none" stroke="#e5e5e5" strokeWidth="3" />
          <circle cx="28" cy="28" r="24" fill="none" stroke="#4f46e5" strokeWidth="3"
            strokeDasharray="120 150" strokeLinecap="round" />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Target style={{ width: 20, height: 20, color: '#4f46e5' }} />
        </div>
      </div>

      {/* Title */}
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.02em',
        margin: '0 0 4px', textAlign: 'center',
      }}>
        Launching Your Interview
      </h2>
      <p style={{ fontSize: 13, color: '#999', fontWeight: 500, margin: '0 0 36px' }}>
        {TYPE_LABELS[type] || type} &middot; {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
      </p>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: 300 }}>
        {LAUNCH_STEPS.map((s, i) => {
          const done = step > i;
          const active = step === i;
          const StepIcon = LAUNCH_STEP_ICONS[i];
          const isLast = i === LAUNCH_STEPS.length - 1;

          return (
            <div key={i}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  opacity: done || active ? 1 : 0.4,
                  transition: 'opacity 0.3s ease',
                  animation: (done || active) ? `launchStepIn 0.3s ease ${i * 0.08}s both` : 'none',
                }}
              >
                {/* Step indicator */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#f0fdf4' : active ? '#eef2ff' : '#f5f5f5',
                  border: done ? '1.5px solid #bbf7d0' : active ? '1.5px solid #c7d2fe' : '1.5px solid #e5e5e5',
                  transition: 'all 0.3s ease',
                  animation: done ? 'launchCheckScale 0.35s ease' : 'none',
                }}>
                  {done
                    ? <Check style={{ width: 14, height: 14, color: '#16a34a' }} />
                    : <StepIcon style={{ width: 14, height: 14, color: active ? '#4f46e5' : '#999' }} />
                  }
                </div>

                {/* Label */}
                <div style={{ flex: 1 }}>
                  <span style={{
                    fontSize: 13.5, fontWeight: 600,
                    color: done ? '#16a34a' : active ? '#111' : '#999',
                    transition: 'color 0.3s',
                  }}>
                    {s.label}
                  </span>
                  {active && (
                    <span style={{
                      display: 'block', fontSize: 11, color: '#4f46e5', fontWeight: 500, marginTop: 1,
                      animation: 'launchPulse 1.5s ease infinite',
                    }}>
                      In progress…
                    </span>
                  )}
                </div>

                {/* Status dot */}
                {done && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />}
                {active && <div style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#4f46e5',
                  animation: 'launchPulse 1s ease infinite',
                }} />}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{ marginLeft: 15.5, width: 1, height: 8, background: done ? '#bbf7d0' : '#e5e5e5', transition: 'background 0.3s' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{
        width: 300, height: 3, background: '#e5e5e5', borderRadius: 4, marginTop: 32, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: '#4f46e5',
          borderRadius: 4,
          transition: 'width 0.5s ease',
          animation: 'launchProgressGlow 2s ease infinite',
        }} />
      </div>
    </div>
  );
}

function CreateSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useRequireAuth();
  const createSession = useCreateSession();

  const [selectedType, setSelectedType] = useState('dsa');
  const [selectedDiff, setSelectedDiff] = useState('medium');
  const [company, setCompany] = useState('');
  const [focus, setFocus] = useState('');
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(0);
  const stepTimers = useRef<number[]>([]);

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

  const handleStart = useCallback(async () => {
    setError(null);
    setLaunching(true);
    setLaunchStep(0);

    // Progress steps tied to actual work, not artificial timers
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
    } catch (err) {
      stepTimers.current.forEach(clearTimeout);
      stepTimers.current = [];
      setLaunching(false);
      setLaunchStep(0);

      const msg = err instanceof Error ? err.message : 'Failed to create session.';
      if (msg.includes('CONCURRENT_SESSION') || msg.includes('active interview session')) {
        const match = msg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (match) {
          toast.info('Resuming active session…');
          setLaunching(true);
          router.push(`/interview/${match[0]}`);
          return;
        }
        const m = 'You have an active session. Resume it from History.';
        setError(m);
        toast.error(m);
      } else {
        setError(msg);
        toast.error(msg);
      }
    }
  }, [selectedType, selectedDiff, duration, company, focus, router, createSession]);

  const typeData = TYPES.find((t) => t.value === selectedType)!;
  const diffData = DIFFICULTIES.find((d) => d.value === selectedDiff)!;

  return (
    <>
      {launching && <LaunchOverlay step={launchStep} type={selectedType} difficulty={selectedDiff} />}
      <DashboardShell maxWidth="max-w-[1100px]">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.025em', margin: 0 }}>New Interview Session</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '5px 0 0', fontWeight: 400 }}>Configure your interview and click Start when ready.</p>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
          {/* Left column - form steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Step 1: Interview Type */}
            <section>
              <StepHeader n={1} title="Interview Type" sub="Choose the focus area for your session" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {TYPES.map((type) => {
                  const Icon = type.icon;
                  const sel = selectedType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setSelectedType(type.value)}
                      style={{
                        background: sel ? type.accentBg : '#fff',
                        border: sel ? `1.5px solid ${type.accent}` : '1px solid #e8e8e8',
                        borderRadius: 12,
                        padding: '18px 16px 16px',
                        textAlign: 'left' as const,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                        position: 'relative' as const,
                        boxShadow: sel ? `0 0 0 3px ${type.accent}18` : 'none',
                      }}
                    >
                      {sel && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: type.accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Check style={{ width: 10, height: 10, color: '#fff', strokeWidth: 3 }} />
                        </div>
                      )}
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 9,
                          background: sel ? type.accent : '#f0f0f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 14,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Icon style={{ width: 18, height: 18, color: sel ? '#fff' : '#999' }} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111', letterSpacing: '-0.015em', marginBottom: 5 }}>{type.label}</div>
                      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.55, marginBottom: 14, fontWeight: 400 }}>{type.description}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                        {type.skills.map((s) => (
                          <span
                            key={s}
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              borderRadius: 5,
                              padding: '2px 7px',
                              background: sel ? type.accentBg : '#f5f5f5',
                              color: sel ? type.accent : '#999',
                              border: `1px solid ${sel ? type.accentBorder : '#ebebeb'}`,
                            }}
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

            {/* Step 2: Difficulty */}
            <section>
              <StepHeader n={2} title="Difficulty Level" sub="Pick a level that matches your experience" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {DIFFICULTIES.map((opt) => {
                  const sel = selectedDiff === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedDiff(opt.value)}
                      style={{
                        background: sel ? opt.color : '#fff',
                        border: sel ? `1.5px solid ${opt.color}` : '1px solid #e8e8e8',
                        borderRadius: 10,
                        padding: '14px 16px',
                        textAlign: 'left' as const,
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                        boxShadow: sel ? `0 2px 12px ${opt.color}30` : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sel ? 'rgba(255,255,255,0.8)' : opt.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: sel ? '#fff' : '#111' }}>{opt.label}</span>
                        {sel && <Check style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.9)', marginLeft: 'auto', strokeWidth: 3 }} />}
                      </div>
                      <p style={{ fontSize: 12, color: sel ? 'rgba(255,255,255,0.75)' : '#888', margin: '0 0 0 14px', fontWeight: 400 }}>{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 3 & 4: Duration + Optional */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <section>
                <StepHeader n={3} title="Session Duration" sub="How long is this session?" />
                <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '18px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
                    {DURATIONS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setDuration(m)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: 8,
                          border: duration === m ? '1.5px solid #4f46e5' : '1px solid #e8e8e8',
                          background: duration === m ? '#eef2ff' : '#fafafa',
                          color: duration === m ? '#4f46e5' : '#666',
                          fontSize: 12,
                          fontWeight: duration === m ? 700 : 500,
                          cursor: 'pointer',
                          outline: 'none',
                          transition: 'all 0.12s',
                          fontFamily: 'inherit',
                        }}
                      >
                        {fmt(m)}
                      </button>
                    ))}
                  </div>
                  <Slider min={15} max={120} step={15} value={[duration]} onValueChange={(v) => setDuration(v[0])} aria-label="Duration" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: '#bbb', fontWeight: 500 }}>15 min</span>
                    <span style={{ fontSize: 10, color: '#bbb', fontWeight: 500 }}>2 hrs</span>
                  </div>
                </div>
              </section>

              <section>
                <StepHeader n={4} title="Optional Settings" sub="Target company or specific focus area" />
                <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <Building2 style={{ width: 13, height: 13, color: '#888' }} />
                      Target Company
                    </label>
                    <StyledInput value={company} onChange={setCompany} placeholder="e.g. Google, Meta, Amazon" maxLength={80} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <Target style={{ width: 13, height: 13, color: '#888' }} />
                      Focus Area
                    </label>
                    <StyledInput value={focus} onChange={setFocus} placeholder="e.g. Arrays, Distributed systems" maxLength={120} />
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Right column - summary sidebar */}
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 6 }}>
                  Session Summary
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>{typeData.shortLabel}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 3, fontWeight: 400 }}>{typeData.description}</div>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SummaryRow
                  icon={
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: typeData.accentBg, border: `1px solid ${typeData.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <typeData.icon style={{ width: 13, height: 13, color: typeData.accent }} />
                    </div>
                  }
                  label="Type"
                  value={typeData.shortLabel}
                />
                <SummaryRow
                  icon={
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: diffData.bg, border: `1px solid ${diffData.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: diffData.color, display: 'block' }} />
                    </div>
                  }
                  label="Difficulty"
                  value={<span style={{ color: diffData.color, fontWeight: 700 }}>{diffData.label}</span>}
                />
                <SummaryRow
                  icon={
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: '#f5f5f5', border: '1px solid #ebebeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Timer style={{ width: 13, height: 13, color: '#888' }} />
                    </div>
                  }
                  label="Duration"
                  value={fmt(duration)}
                />
                {company && (
                  <SummaryRow
                    icon={
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: '#f5f5f5', border: '1px solid #ebebeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 style={{ width: 13, height: 13, color: '#888' }} />
                      </div>
                    }
                    label="Company"
                    value={company}
                  />
                )}
                {focus && (
                  <SummaryRow
                    icon={
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: '#f5f5f5', border: '1px solid #ebebeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Target style={{ width: 13, height: 13, color: '#888' }} />
                      </div>
                    }
                    label="Focus"
                    value={focus}
                  />
                )}
              </div>

              <div style={{ padding: '0 20px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 8 }}>
                  Topics Covered
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                  {typeData.skills.map((s) => (
                    <span
                      key={s}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 5,
                        background: typeData.accentBg,
                        color: typeData.accent,
                        border: `1px solid ${typeData.accentBorder}`,
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ padding: '0 20px 20px' }}>
                <button
                  onClick={handleStart}
                  disabled={createSession.isPending}
                  className="hover:bg-[#3730a3]"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '13px 20px',
                    borderRadius: 10,
                    background: '#4f46e5',
                    color: '#fff',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: createSession.isPending ? 'not-allowed' : 'pointer',
                    opacity: createSession.isPending ? 0.7 : 1,
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                    letterSpacing: '-0.01em',
                    boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                  }}
                >
                  {createSession.isPending ? (
                    <>
                      <Spinner />
                      <span>Creating session&hellip;</span>
                    </>
                  ) : (
                    <>
                      <Play style={{ width: 15, height: 15, fill: 'currentColor' }} />
                      <span>Start Interview</span>
                    </>
                  )}
                </button>
                <p style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 10, fontWeight: 400 }}>
                  Your AI interviewer will be ready instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    </>
  );
}
