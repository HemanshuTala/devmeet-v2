'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Code2,
  MessageSquare,
  Layout,
  Zap,
  Users,
  TrendingUp,
  CheckCircle,
  ChevronRight,
  Sparkles,
  Mic,
  Video,
  MoreHorizontal,
  PhoneOff,
  MicOff,
  Search,
  Bell,
  Calendar,
  Layers,
  Menu,
  X,
  Star,
  Shield,
  Target,
  BarChart2,
  Clock,
  ArrowRight,
  PlayCircle,
  Cpu,
  Award,
  FileText,
  Eye,
  Volume2,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Journey3D from '@/components/landing/Journey3D';

// ─── Framer Motion Variants ────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } },
};
const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── Section Wrapper with useInView ────────────────────────────────────────
function RevealSection({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Floating background elements ────────────────────────────────────────────
function FloatingCodeBlock({
  className,
  lines,
  style,
  index,
  registerRef,
}: {
  className?: string;
  lines: string[];
  style?: React.CSSProperties;
  index: number;
  registerRef: (el: HTMLDivElement | null, idx: number) => void;
}) {
  return (
    <div
      ref={(el) => registerRef(el, index)}
      className={`absolute glass-card rounded-2xl p-4 text-[10px] sm:text-xs font-mono pointer-events-none select-none border-blue-100/50 bg-white/70 shadow-lg backdrop-blur-md z-0 ${className ?? ''}`}
      style={style}
    >
      {lines.map((line, i) => (
        <div key={i} className="leading-5 whitespace-nowrap">
          {line.startsWith('//') ? (
            <span className="text-slate-400 font-medium">{line}</span>
          ) : line.includes('function') || line.includes('const') || line.includes('return') ? (
            <span className="text-blue-600 font-semibold">{line}</span>
          ) : line.includes('=>') || line.includes('(') ? (
            <span className="text-sky-500 font-semibold">{line}</span>
          ) : (
            <span className="text-slate-700">{line}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── FEATURES DATA ──────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Code2,
    badgeText: 'Coding & DSA',
    title: 'Technical Code Sandbox',
    description:
      'Practice DSA problems with our integrated editor. Get instant feedback on logic, time complexity, and syntax optimizations from a virtual FAANG lead.',
    highlights: ['Live compilation', 'Complexity assessment', '500+ standard problems'],
    gradient: 'bg-blue-600/5',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-500/10',
  },
  {
    icon: MessageSquare,
    badgeText: 'Behavioral & Core',
    title: 'STAR Method Simulator',
    description:
      'Nail behavioral interview templates. Get coached on tone, communication structure, and response length to form high-impact stories from your experience.',
    highlights: ['STAR technique evaluator', 'Confidence and tone checks', 'Custom job profiles'],
    gradient: 'bg-blue-600/5',
    iconColor: 'text-sky-600',
    iconBg: 'bg-sky-500/10',
  },
  {
    icon: Layout,
    badgeText: 'Architecture',
    title: 'System Design Sessions',
    description:
      'Practice architectural diagrams and system design questions. Discuss scaling bottlenecks, network trade-offs, and database designs with expert AI leads.',
    highlights: ['Architecture walkthroughs', 'Trade-off analysis', 'Database modeling guides'],
    gradient: 'bg-blue-600/5',
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-500/10',
  },
  {
    icon: Eye,
    badgeText: 'Multi-Modal',
    title: 'Eye Contact & Presence',
    description:
      'Real-time gaze calibration and posture analysis. Our vision model tracks your camera engagement just like a real interviewer would.',
    highlights: ['Gaze tracking via webcam', 'Posture presence scoring', 'Non-verbal feedback report'],
    gradient: 'bg-blue-600/5',
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-500/10',
  },
  {
    icon: Cpu,
    badgeText: 'Adaptive AI',
    title: 'Adaptive Difficulty Engine',
    description:
      'Questions dynamically re-calibrate based on your real-time performance signals — harder when you excel, targeted when you struggle.',
    highlights: ['Live difficulty adjustment', 'Weak-spot targeting', 'Performance-weighted pool'],
    gradient: 'bg-blue-600/5',
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-500/10',
  },
  {
    icon: BarChart2,
    badgeText: 'Analytics',
    title: 'Scorecard & Growth Tracker',
    description:
      'Session-by-session scorecards with spider-chart visualizations across technical, behavioral, and communication axes.',
    highlights: ['Spider-chart radar reports', 'Percentile benchmarking', 'Interview streak tracking'],
    gradient: 'bg-blue-600/5',
    iconColor: 'text-amber-650',
    iconBg: 'bg-amber-500/10',
  },
];

// ─── HOW IT WORKS ──────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: '01',
    icon: FileText,
    title: 'Upload Resume & Set Target',
    description:
      'Upload your resume and pick your target role and company. DevMeet builds a personalized question bank tailored to your background.',
    color: 'bg-blue-600',
  },
  {
    step: '02',
    icon: Mic,
    title: 'Start Your AI Session',
    description:
      'Engage with a voice-first AI interviewer — answer coding challenges, discuss system design, and respond to behavioral questions in real time.',
    color: 'bg-blue-600',
  },
  {
    step: '03',
    icon: BarChart2,
    title: 'Get Actionable Scorecards',
    description:
      'Receive a comprehensive feedback report: radar chart, transcript with timestamps, filler-word analysis, and a personalized improvement roadmap.',
    color: 'bg-blue-600',
  },
];

// ─── TESTIMONIALS ──────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: 'Ananya Krishnan',
    role: 'SWE at Google',
    avatar: 'AK',
    avatarFrom: '#4f46e5',
    avatarTo: '#2563eb',
    stars: 5,
    text: 'DevMeet\'s adaptive engine is the real deal. It caught exactly the gaps I had in system design and kept pushing with follow-ups until I nailed it. Got my Google offer within 6 weeks of practicing here.',
  },
  {
    name: 'Marcus Chen',
    role: 'Frontend Engineer at Stripe',
    avatar: 'MC',
    avatarFrom: '#7c3aed',
    avatarTo: '#9333ea',
    stars: 5,
    text: 'The STAR method simulator flagged my tendency to overexplain and gave me a confidence score after each answer. It\'s like having an ex-FAANG recruiter on demand, at 2AM before my final round.',
  },
  {
    name: 'Priya Mehta',
    role: 'Staff Eng at Shopify',
    avatar: 'PM',
    avatarFrom: '#06b6d4',
    avatarTo: '#0284c7',
    stars: 5,
    text: 'The scorecard radar chart showed me exactly where I was weak. Communication was my blind spot — two weeks of targeted practice and I landed a Staff Eng role with a 40% salary jump.',
  },
];

// ─── PRICING PLANS ────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Standard',
    price: '$0',
    period: 'forever',
    description: 'Perfect for initial practice',
    features: [
      '3 complete sessions per month',
      'Standard grading metrics',
      'DSA code execution sandbox',
      'Access to core questions list',
    ],
    cta: 'Start practicing free',
    href: '/register',
    highlight: false,
    badge: null,
  },
  {
    name: 'Professional',
    price: '$29',
    period: 'per month',
    description: 'For active job seekers',
    features: [
      'Unlimited mock interviews',
      'Advanced behavioral coaching',
      'Full architectural whiteboard mode',
      'Priority AI response speeds',
      'Audio/Video performance grading',
      'Comprehensive progress tracker',
    ],
    cta: 'Unlock Pro Trial',
    href: '/register?plan=pro',
    highlight: true,
    badge: 'Highly Recommended',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'yearly pricing',
    description: 'For universities and agencies',
    features: [
      'Everything in Professional',
      'Collaborative dashboards',
      'Custom question bank uploads',
      'White-labeled portal access',
      'SLA-backed uptime guarantees',
      'Dedicated partner success leads',
    ],
    cta: 'Connect with Sales',
    href: '/contact',
    highlight: false,
    badge: null,
  },
];

const COMPANIES = ['Google', 'Meta', 'Stripe', 'Airbnb', 'Netflix', 'Shopify', 'Uber', 'DeepMind', 'OpenAI', 'Figma'];

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // GSAP/Floating animation refs
  const floatingRefs = useRef<(HTMLDivElement | null)[]>([]);
  const registerFloatingRef = (el: HTMLDivElement | null, idx: number) => {
    floatingRefs.current[idx] = el;
  };

  const [activeTab, setActiveTab] = useState<'questions' | 'timeline' | 'clips'>('questions');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  const handleHeroMouseMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user || isLoading) return;

    let ctx: any;

    async function initGsap() {
      const { default: gsap } = await import('gsap');
      ctx = gsap.context(() => {
        // Continuous Floating Animations for Code Snippets
        floatingRefs.current.forEach((ref, idx) => {
          if (!ref) return;
          gsap.to(ref, {
            y: 'random(-18, 18)',
            x: 'random(-12, 12)',
            rotation: 'random(-6, 6)',
            duration: 'random(4.5, 6.5)',
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: idx * 0.4,
          });
        });
      });
    }

    initGsap();

    return () => {
      if (ctx) ctx.revert();
    };
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div 
        style={{
          minHeight: '100vh',
          backgroundColor: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '20px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div 
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '3px solid rgba(59, 130, 246, 0.1)',
              borderTopColor: '#3b82f6',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
          <p style={{ color: '#64748b', fontSize: '14px', fontWeight: 600, margin: 0 }}>
            Loading DevMeet...
          </p>
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden antialiased">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-blue-100/30 backdrop-blur-xl bg-white/80 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Brain className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold text-blue-600">
              DevMeet
            </span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-5">
            <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors py-2 px-1">
              Sign In
            </Link>
            <Link href="/register" className="btn-primary text-sm px-5 py-2 shadow-sm">
              Start Practice
            </Link>
          </div>

          {/* Mobile Menu Icon */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-100 bg-white/95 px-6 py-4 flex flex-col gap-4 shadow-lg"
            >
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-700 py-1">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-700 py-1">How it Works</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-slate-700 py-1">Pricing</a>
              <hr className="border-slate-100" />
              <div className="flex items-center gap-3 w-full">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-sm py-2 px-4 flex-1 text-center">Sign In</Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="btn-primary text-sm py-2 px-4 flex-1 text-center">Register</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        className="relative min-h-screen flex flex-col items-center justify-start pt-32 pb-24 px-6 overflow-hidden bg-slate-50"
      >
        {/* Glow Blobs */}
        <div className="absolute top-1/6 left-1/5 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-1/5 right-1/5 w-[450px] h-[450px] bg-sky-500/5 rounded-full blur-[110px] pointer-events-none" />

        {/* Dynamic Interactive Mesh Glow (follows cursor in light blue) */}
        <div 
          className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-40 -z-10"
          style={{
            background: 'radial-gradient(800px circle at var(--mx) var(--my), rgba(59, 130, 246, 0.05), transparent 80%)'
          }}
        />

        {/* Background Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 -z-10" />

        {/* Floating Code Snippets */}
        <FloatingCodeBlock
          index={0}
          registerRef={registerFloatingRef}
          className="hidden xl:block"
          style={{ top: '28%', left: '5%' }}
          lines={[
            '// Technical Coding',
            'function bubbleSort(arr) {',
            '  let swapped;',
            '  do {',
            '    swapped = false;',
            '    for (let i = 0; i < arr.length-1; i++) {',
            '      if (arr[i] > arr[i+1]) {',
            '        [arr[i], arr[i+1]] = [arr[i+1], arr[i]];',
            '        swapped = true;',
            '      }',
            '    }',
            '  } while (swapped);',
            '}',
          ]}
        />

        <FloatingCodeBlock
          index={1}
          registerRef={registerFloatingRef}
          className="hidden xl:block"
          style={{ top: '32%', right: '5%' }}
          lines={[
            '// System Design Spec',
            'const config = {',
            '  loadBalancer: "RoundRobin",',
            '  replicationFactor: 3,',
            '  readPreference: "PrimaryPreferred",',
            '  cacheStrategy: "WriteThrough",',
            '};',
          ]}
        />

        <FloatingCodeBlock
          index={2}
          registerRef={registerFloatingRef}
          className="hidden xl:block"
          style={{ bottom: '25%', left: '7%' }}
          lines={[
            '// STAR Response',
            'const response = {',
            '  situation: "Scale outage",',
            '  task: "Isolate network bug",',
            '  action: "Refactored balancer",',
            '  result: "Downtime reduced 80%",',
            '};',
          ]}
        />

        {/* Main Hero Header */}
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/50 text-xs font-bold text-blue-600 mb-8 animate-pulse">
            <Zap className="w-3.5 h-3.5 fill-blue-600/10" />
            <span>Interactive Interview Studio v2.0</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight mb-6 text-slate-900">
            Nail Your Next
            <span className="text-blue-600 block mt-1.5">
              Technical Interview
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Practice with an AI interviewer that listens, evaluates code execution, and analyzes
            architectural designs. Gain instant actionable feedback to land your dream position.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/register"
              className="btn-primary group flex items-center gap-2 px-6 py-3 text-sm sm:text-base font-bold w-full sm:w-auto"
            >
              Get Started Free
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </Link>
            <Link
              href="#features"
              className="btn-ghost flex items-center justify-center gap-2 px-6 py-3 text-sm sm:text-base font-bold border-slate-200 text-slate-700 w-full sm:w-auto hover:bg-white"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* ─── HIREBYTE-Inspired Interactive Interview UI Mockup ──────────────── */}
        <div className="w-full max-w-5xl bg-slate-100/40 rounded-3xl p-1.5 sm:p-3 shadow-2xl border border-blue-100/20 backdrop-blur-sm z-10 overflow-hidden">
          {/* Inner frame wrapper mimicking browser/client window */}
          <div className="bg-[#f3f6fc] rounded-2xl border border-white shadow-inner overflow-hidden flex flex-col">
            
            {/* Header bar mimicking HIREBYTE */}
            <div className="bg-white border-b border-slate-200/60 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <span className="font-extrabold text-sm tracking-tight text-slate-800">DevMeet Studio</span>
              </div>

              {/* Navigation Items */}
              <div className="hidden sm:flex items-center gap-6 bg-slate-100 rounded-lg p-1 text-[11px] font-bold text-slate-600">
                <span className="bg-white text-slate-800 px-3 py-1 rounded-md shadow-sm">Overview</span>
                <span className="px-3 py-1 hover:text-slate-900 cursor-pointer">Interviewing</span>
                <span className="px-3 py-1 hover:text-slate-900 cursor-pointer">Question Bank</span>
                <span className="px-3 py-1 hover:text-slate-900 cursor-pointer">Reports</span>
              </div>

              {/* Search and Action area */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search sessions..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] focus:outline-none w-36 sm:w-44 focus:bg-white focus:border-blue-300"
                    disabled
                  />
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center relative">
                  <Bell className="w-3.5 h-3.5 text-slate-600" />
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-600 border border-white" />
                </div>
              </div>
            </div>

            {/* Subheader bar */}
            <div className="bg-slate-50/50 border-b border-slate-200/30 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  Hiring - Frontend Developer
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  Summary of candidate video feed, performance timeline, and evaluation markers.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 shadow-sm flex items-center gap-1.5 hover:bg-slate-50">
                  <MicOff className="w-3 h-3 text-slate-500" />
                  Mute Mic
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold shadow-sm shadow-red-500/10 flex items-center gap-1.5 hover:bg-red-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  Live Interview
                </button>
              </div>
            </div>

            {/* Main Content Area (Two Columns) */}
            <div className="p-4 grid grid-cols-1 lg:grid-cols-10 gap-4">
              
              {/* Left Column: Video Feed & Summary (7 Columns) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                
                {/* Large Video Frame */}
                <div className="relative aspect-[16/9] w-full rounded-xl bg-slate-950 overflow-hidden shadow-md group border border-slate-800">
                  {/* Candidate Feed Mock Background */}
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 to-slate-950">
                    <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full border-2 border-indigo-500/30 bg-slate-800/80 flex items-center justify-center shadow-2xl">
                      <Users className="w-10 h-10 text-slate-500" />
                      <div className="absolute inset-0 rounded-full border-t border-indigo-400 animate-pulse" />
                      <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-indigo-400/80" />
                      <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-indigo-400/80" />
                      <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-indigo-400/80" />
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-indigo-400/80" />
                    </div>

                    {/* Real-time HUD stats overlay */}
                    <div className="absolute bottom-16 left-6 font-mono text-[8px] sm:text-[9px] text-slate-400 flex flex-col gap-1 bg-slate-950/65 backdrop-blur-sm p-2 rounded-lg border border-white/5">
                      <div>GAZE STATE: <span className="text-emerald-400">CALIBRATED</span></div>
                      <div>SPEECH HZ: <span className="text-indigo-400">145 HZ (STABLE)</span></div>
                      <div>PROCTORING: <span className="text-emerald-400">SECURE</span></div>
                    </div>
                  </div>

                  {/* Main Candidate Info Overlay */}
                  <div className="absolute top-4 left-4 bg-slate-900/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-[10px] text-white font-bold">
                      TS
                    </div>
                    <span className="text-[10px] text-white font-bold">Mrs. Tania Shahira (Candidate)</span>
                  </div>

                  {/* Mini Interviewer Overlay Feed */}
                  <div className="absolute top-4 right-4 w-28 sm:w-36 aspect-[4/3] rounded-lg bg-slate-900 border border-white/20 shadow-lg overflow-hidden z-25">
                    <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
                      <Brain className="w-6 h-6 text-slate-800" />
                    </div>
                    <div className="absolute bottom-2 left-2 bg-slate-900/60 backdrop-blur-md px-2 py-0.5 rounded border border-white/5 flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 rounded-full bg-blue-600 flex items-center justify-center text-[8px] text-white font-bold">
                        RT
                      </div>
                      <span className="text-[8px] text-white font-bold">Regina Tanya</span>
                    </div>
                  </div>

                  {/* Audio Status indicator */}
                  <div className="absolute top-4 right-36 sm:right-44 bg-blue-600 px-2.5 py-1.5 rounded-lg border border-blue-400 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping mr-1.5" />
                    <span className="text-[8px] text-white font-bold">AI Listening</span>
                  </div>

                  {/* Waveform indicator */}
                  <div className="absolute bottom-16 right-6 flex items-end gap-[3px] h-8">
                    {[1, 2, 3, 4, 5, 6].map((bar) => (
                      <div
                        key={bar}
                        className={`w-1 rounded-full bg-gradient-to-t from-blue-600 to-sky-400 waveform-bar-${(bar % 5) + 1}`}
                        style={{ height: '100%', transformOrigin: 'bottom' }}
                      />
                    ))}
                  </div>

                  {/* Bottom Camera Settings Bar */}
                  <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                    <div className="bg-slate-900/75 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                      <button className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-800 transition-colors shadow shadow-black/20">
                        <Mic className="w-3.5 h-3.5" />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-800 transition-colors shadow shadow-black/20">
                        <Video className="w-3.5 h-3.5" />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-800 transition-colors shadow shadow-black/20">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-5 bg-white/20 mx-1" />
                      <button className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors shadow shadow-red-500/10">
                        <PhoneOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Key Meeting Notes & AI Summary */}
                <div className="bg-white rounded-xl border border-slate-200/70 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3.5">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Key Meeting Notes
                    </h4>
                    <button className="w-6 h-6 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4 text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Jul 10, 2026
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                      <Layers className="w-3 h-3 text-slate-400" />
                      Hiring
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                      <Users className="w-3 h-3 text-slate-400" />
                      Tania Shahira, Regina Tanya
                    </span>
                  </div>

                  {/* AI summary block */}
                  <div className="rounded-xl bg-blue-50/30 border border-blue-100/60 p-4 relative overflow-hidden">
                    <div className="absolute top-2 right-2 text-blue-500">
                      <Sparkles className="w-4 h-4 animate-pulse fill-blue-500/10" />
                    </div>
                    <h5 className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3 h-3" />
                      AI Summary of Meeting
                    </h5>
                    <p className="text-[11px] text-slate-700 leading-relaxed font-semibold">
                      Candidate Mrs. Tania Shahira demonstrated exceptional structural mastery during the performance optimization segment, resolving recursive bottleneck cycles efficiently. Communications scoring reports denote robust clarity under pressure, though follow-ups on cache strategies required guidance.
                    </p>
                  </div>
                </div>

              </div>

              {/* Right Column: Question Panel (3 Columns) */}
              <div className="lg:col-span-3 flex flex-col gap-4">
                
                {/* Card Wrapper */}
                <div className="bg-white rounded-xl border border-slate-200/70 p-4 flex-1 flex flex-col shadow-sm">
                  
                  {/* Category Tabs */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 rounded-lg p-1 text-[9px] font-bold text-slate-500 mb-4">
                    <button
                      onClick={() => setActiveTab('questions')}
                      className={`py-1.5 rounded transition-all ${activeTab === 'questions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-505 hover:text-slate-900'}`}
                    >
                      Question List
                    </button>
                    <button
                      onClick={() => setActiveTab('timeline')}
                      className={`py-1.5 rounded transition-all ${activeTab === 'timeline' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-505 hover:text-slate-900'}`}
                    >
                      Timeline
                    </button>
                    <button
                      onClick={() => setActiveTab('clips')}
                      className={`py-1.5 rounded transition-all ${activeTab === 'clips' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-505 hover:text-slate-900'}`}
                    >
                      Highlights
                    </button>
                  </div>

                  {/* List of Questions */}
                  <div className="flex flex-col gap-3 overflow-y-auto max-h-[460px] pr-1 scrollbar-none">
                    
                    {/* Question 01 */}
                    <div className="rounded-xl border border-slate-150 bg-slate-50/30 p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="w-5 h-5 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center text-[9px] font-extrabold text-blue-600">
                          01
                        </span>
                        <span className="flex items-center gap-1 text-[8px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/50">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Optimal Solution
                        </span>
                      </div>
                      <h5 className="text-[11px] font-bold text-slate-800 leading-snug">
                        How would you optimize a React app for performance?
                      </h5>
                      <p className="text-[10px] text-slate-500 font-semibold line-clamp-2 leading-relaxed">
                        Evaluated hook structures, memoized heavy callbacks, and implemented dynamic imports for localized assets.
                      </p>
                    </div>

                    {/* Question 02 */}
                    <div className="rounded-xl border border-slate-150 bg-slate-50/30 p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="w-5 h-5 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center text-[9px] font-extrabold text-blue-600">
                          02
                        </span>
                        <span className="flex items-center gap-1 text-[8px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/50">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Optimal Solution
                        </span>
                      </div>
                      <h5 className="text-[11px] font-bold text-slate-800 leading-snug">
                        Describe your experience with Tailwind CSS.
                      </h5>
                      <p className="text-[10px] text-slate-500 font-semibold line-clamp-2 leading-relaxed">
                        Demonstrated familiarity with custom configuration tokens, layout utilities, and media-query break points.
                      </p>
                    </div>

                    {/* Question 03 (Active) */}
                    <div className="rounded-xl border border-blue-200 bg-blue-50/20 p-3 flex flex-col gap-2 shadow-sm ring-1 ring-blue-100/50">
                      <div className="flex items-center justify-between">
                        <span className="w-5 h-5 rounded-md bg-blue-650 flex items-center justify-center text-[9px] font-extrabold text-white" style={{ backgroundColor: '#2563eb' }}>
                          03
                        </span>
                        <span className="flex items-center gap-1 text-[8px] font-bold text-blue-600 bg-blue-100/50 px-1.5 py-0.5 rounded border border-blue-200/50">
                          <Sparkles className="w-2.5 h-2.5" />
                          AI Evaluating
                        </span>
                      </div>
                      <h5 className="text-[11px] font-bold text-slate-900 leading-snug">
                        Can you explain how you structure components to keep code clean and maintainable?
                      </h5>
                      <p className="text-[10px] text-slate-600 font-semibold leading-relaxed">
                        Candidate is answering: "I follow atomic design principles, isolating hooks from presentation layers..."
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/10 p-3 opacity-50 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="w-5 h-5 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-400">
                          04
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/50">
                          Unopened
                        </span>
                      </div>
                      <h5 className="text-[11px] font-bold text-slate-800 leading-snug">
                        How do you handle API errors on the frontend?
                      </h5>
                    </div>

                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Company Marquee Ticker ────────────────────────────────────────── */}
      <div className="w-full max-w-5xl mx-auto mt-16 mb-20 text-center z-10 px-6">
        <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-6">
          Trusted by candidates preparing for interviews at
        </p>
        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]">
          <div className="flex gap-16 py-3 items-center whitespace-nowrap animate-marquee">
            {COMPANIES.map((comp, idx) => (
              <span key={idx} className="text-sm font-extrabold tracking-tight text-slate-400 hover:text-slate-650 transition-colors">
                {comp}
              </span>
            ))}
            {/* Duplicate for infinite loop */}
            {COMPANIES.map((comp, idx) => (
              <span key={`dup-${idx}`} className="text-sm font-extrabold tracking-tight text-slate-400 hover:text-slate-650 transition-colors">
                {comp}
              </span>
            ))}
          </div>
        </div>
        <style>{`
          @keyframes marquee {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }
          .animate-marquee {
            display: inline-flex;
            animation: marquee 25s linear infinite;
            width: max-content;
          }
        `}</style>
      </div>

      {/* ── 3D Product Journey Storytelling ── */}
      <Journey3D />

      {/* ── Stats Bar ─────────────────────────────────────────────────────── */}
      <section className="py-12 border-y border-blue-100/30 backdrop-blur-sm bg-blue-50/20 z-10 relative">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: Users, label: 'Active Users', value: '15,000+' },
              { icon: Brain, label: 'Sessions Run', value: '75,000+' },
              { icon: Zap, label: 'Average Evaluation Speed', value: '<600ms' },
              { icon: TrendingUp, label: 'Success Velocity', value: '96.4%' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-2">
                  <Icon className="w-4.5 h-4.5 text-blue-600" />
                  <span className="text-2xl font-black text-blue-600">
                    {value}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features List ─────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 relative bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Section title */}
          <RevealSection className="text-center mb-16">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
              Interactive Tools
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mt-4 text-slate-900">
              Complete Interview Workspace, <span className="text-blue-600">All In One</span>
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto mt-4 text-sm font-semibold">
              DevMeet replicates competitive, high-stakes interview criteria. Refine your code,
              verbal phrasing, and system diagrams under mock pressure.
            </p>
          </RevealSection>

          {/* Stagger grid */}
          <motion.div 
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={scaleIn}
                  whileHover={{ y: -4 }}
                  className="glass-card bg-white hover:bg-white border border-blue-100 rounded-2xl p-6 flex flex-col gap-5 relative overflow-hidden group hover:shadow-xl transition-all duration-300"
                >
                  {/* Hover background color flow */}
                  <div
                    className={`absolute inset-0 ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
                  />

                  {/* Icon */}
                  <div className={`relative w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center shadow-sm`}>
                    <Icon className={`w-6 h-6 ${feature.iconColor}`} strokeWidth={2} />
                  </div>

                  {/* Title & Desc */}
                  <div className="relative">
                    <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {feature.badgeText}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mb-2 mt-3 tracking-tight">{feature.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">{feature.description}</p>
                  </div>

                  {/* Check list */}
                  <ul className="relative mt-auto flex flex-col gap-2 pt-4 border-t border-slate-100">
                    {feature.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── How it Works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 bg-[#f3f6fc] relative">
        <div className="max-w-5xl mx-auto relative z-10">
          <RevealSection className="text-center mb-16">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700 border border-sky-200">
              Simplistic Steps
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mt-4 text-slate-900">
              Get Started In Under <span className="text-blue-600">60 Seconds</span>
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto mt-4 text-sm font-semibold">
              Select your track, connect your capture inputs, and start practicing with an expert-level AI evaluator immediately.
            </p>
          </RevealSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="relative"
          >
            {/* Connection line */}
            <div className="absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-0.5 bg-blue-500 hidden md:block opacity-30" />

            <div className="grid md:grid-cols-3 gap-8">
              {HOW_IT_WORKS.map((step) => {
                const Icon = step.icon;
                return (
                  <motion.div 
                    key={step.step} 
                    variants={fadeUp}
                    className="flex flex-col items-center text-center gap-4 group"
                  >
                    <div className="relative w-20 h-20 rounded-2xl bg-blue-600 p-0.5 flex-shrink-0 shadow-lg">
                      <div className="w-full h-full rounded-2xl bg-white flex items-center justify-center">
                        <Icon className="w-7 h-7 text-blue-600" />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 mb-1.5 tracking-tight">{step.title}</h3>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">{step.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Testimonials Section ─────────────────────────────────────────── */}
      <section className="py-24 px-6 relative bg-white">
        <div className="max-w-6xl mx-auto relative z-10">
          <RevealSection className="text-center mb-16">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700 border border-violet-200">
              User Stories
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mt-4 text-slate-900">
              Loved by Engineers <span className="text-blue-605">Who Got The Offer</span>
            </h2>
          </RevealSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-3 gap-6"
          >
            {TESTIMONIALS.map((t) => (
              <motion.div
                key={t.name}
                variants={scaleIn}
                whileHover={{ y: -4 }}
                className="glass-card bg-slate-50/50 hover:bg-white border border-slate-200/80 rounded-3xl p-6 flex flex-col gap-5 transition-all duration-300"
              >
                {/* Stars */}
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-sm text-slate-600 leading-relaxed flex-1 italic font-medium">
                  &ldquo;{t.text}&rdquo;
                </p>

                {/* Author Info */}
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div 
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: `linear-gradient(135deg, ${t.avatarFrom}, ${t.avatarTo})` }}
                  >
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{t.name}</div>
                    <div className="text-[11px] font-bold text-slate-400">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Pricing Section ───────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 relative bg-[#f3f6fc]">
        <div className="max-w-6xl mx-auto">
          <RevealSection className="text-center mb-16">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 border border-green-200">
              Pricing Options
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mt-4 text-slate-900">
              Clear Pricing, <span className="text-blue-600">Zero Surprises</span>
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto mt-4 text-sm font-semibold">
              Gain confidence with 3 free interviews every month. Upgrade as your interview roadmap expands.
            </p>
          </RevealSection>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-3 gap-8 items-stretch"
          >
            {PLANS.map((plan) => (
              <motion.div
                key={plan.name}
                variants={scaleIn}
                className={`relative rounded-3xl p-6 flex flex-col gap-6 bg-white border transition-all duration-300 hover:shadow-xl ${
                  plan.highlight
                    ? 'border-blue-500 shadow-xl shadow-blue-500/5 ring-1 ring-blue-400/30 md:scale-[1.03]'
                    : 'border-slate-200 shadow-md'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full text-[9px] font-extrabold bg-blue-600 text-white shadow-md uppercase tracking-wider">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1 tracking-tight">{plan.name}</h3>
                  <p className="text-xs text-slate-500 font-semibold">{plan.description}</p>
                </div>

                <div className="flex items-end gap-1 border-b border-slate-100 pb-4">
                  <span className="text-4xl font-black text-blue-600">
                    {plan.price}
                  </span>
                  <span className="text-slate-400 text-xs mb-1 font-bold">/ {plan.period}</span>
                </div>

                <ul className="flex flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`mt-auto text-center py-3 rounded-xl font-bold text-xs transition-all duration-200 ${
                    plan.highlight
                      ? 'btn-primary shadow-md shadow-blue-500/10'
                      : 'btn-ghost border-slate-200 text-slate-700 hover:bg-slate-100 bg-slate-50'
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden bg-slate-50">
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="relative rounded-3xl overflow-hidden bg-white border border-indigo-100/40 p-8 sm:p-12 md:p-16 shadow-[0_30px_70px_rgba(79,70,229,0.05)]">
            {/* Glowing Backdrop Mesh */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-sky-500/5 to-purple-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 text-center flex flex-col items-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-650 mb-6 shadow-lg shadow-blue-500/20" style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }}>
                <Brain className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-3xl md:text-4.5xl font-black text-slate-900 mb-4 tracking-tight">
                Ready to secure your next role?
              </h2>
              <p className="text-slate-500 max-w-lg mx-auto mb-8 text-sm font-semibold leading-relaxed">
                Join thousands of candidates who build interviewing skills with DevMeet. Start with 3 free credits. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
                <Link
                  href="/register"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold px-8 py-4 shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  Start Practicing Free
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </Link>
                <Link
                  href="/login"
                  className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl font-bold px-8 py-4 shadow-sm transition-all hover:scale-[1.02] w-full sm:w-auto text-center"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200/60 bg-white py-16 px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Column 1: Brand Info */}
            <div className="space-y-4 md:col-span-2">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/10">
                  <Brain className="w-4.5 h-4.5 text-white" />
                </div>
                <span className="font-extrabold text-slate-900 tracking-tight">DevMeet</span>
              </Link>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed font-semibold">
                An intelligent agentic platform that conducts realistic voice, coding, and architecture interviews. Get comprehensive feedback and rank against real hiring standards.
              </p>
            </div>

            {/* Column 2: Navigation Links */}
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Platform</h4>
              <ul className="space-y-2.5 text-xs font-bold text-slate-550">
                <li><a href="#features" className="hover:text-blue-600 transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-blue-600 transition-colors">How it Works</a></li>
                <li><a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a></li>
              </ul>
            </div>

            {/* Column 3: Legal & Status */}
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">System</h4>
              <ul className="space-y-2.5 text-xs font-bold text-slate-550">
                <li><span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> All Systems Nominal</span></li>
                <li><Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-400 font-semibold">
            <p>© {new Date().getFullYear()} DevMeet. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-slate-600 cursor-pointer">Twitter</span>
              <span className="hover:text-slate-600 cursor-pointer">GitHub</span>
              <span className="hover:text-slate-600 cursor-pointer">LinkedIn</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
