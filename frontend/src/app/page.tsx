/**
 * @file page.tsx
 * @description Main Public Landing Page Component for DevMeet v2.0.
 *
 * Responsibilities:
 * 1. Authentication Redirect:
 *    - Automatically redirects authenticated candidates (`user != null`) directly to `/dashboard`.
 *    - Displays a spinner during initial auth state rehydration (`authLoading`).
 * 2. Hero Section & Parallax Canvas:
 *    - Computes real-time mouse coordinates (`--mx`, `--my`) to project radial lighting and depth parallax onto floating code cards.
 * 3. Modular Section Composition:
 *    - [LandingHeader](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/LandingHeader.tsx): Top navigation bar.
 *    - [FloatingCodeBlock](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/FloatingCodeBlock.tsx): Parallax floating code cards (DSA, System Design, STAR).
 *    - [InterviewStudioMockup](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/InterviewStudioMockup.tsx): Interactive studio interface preview.
 *    - [InterviewModesSection](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/InterviewModesSection.tsx): Track deep-dives.
 *    - [ProctoringShowcaseSection](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/ProctoringShowcaseSection.tsx): Anti-cheating & proctoring tech.
 *    - [PricingSection](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/PricingSection.tsx): Free / Pro / Enterprise tier comparison.
 *    - [FaqSection](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/FaqSection.tsx): Candidate FAQ accordion.
 *    - [LandingFooter](file:///e:/AI%20INTERVIEW/frontend/src/components/landing/LandingFooter.tsx): Brand footer and links.
 *
 * @module app/page
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Modular Landing Subcomponents
import LandingHeader from '@/components/landing/LandingHeader';
import FloatingCodeBlock from '@/components/landing/FloatingCodeBlock';
import InterviewStudioMockup from '@/components/landing/InterviewStudioMockup';
import InterviewModesSection from '@/components/landing/InterviewModesSection';
import ProctoringShowcaseSection from '@/components/landing/ProctoringShowcaseSection';
import PricingSection from '@/components/landing/PricingSection';
import FaqSection from '@/components/landing/FaqSection';
import LandingFooter from '@/components/landing/LandingFooter';

/**
 * Main Landing Page Component.
 *
 * @component
 * @returns {JSX.Element | null} Landing page or null during dashboard redirect.
 */
export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // References for parallax hero calculations
  const heroRef = useRef<HTMLDivElement>(null);
  const floatingCardsRef = useRef<(HTMLDivElement | null)[]>([]);

  /**
   * Registers a floating card element ref into the cards array.
   */
  const registerFloatingRef = (el: HTMLDivElement | null, idx: number) => {
    floatingCardsRef.current[idx] = el;
  };

  /**
   * Tracks mouse movement within the hero container to drive parallax depth shifts on floating code snippets.
   *
   * @param {React.MouseEvent<HTMLDivElement>} e - Mouse move event.
   */
  const handleHeroMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Set CSS custom properties for radial spotlight gradient
    heroRef.current.style.setProperty('--mx', `${x}px`);
    heroRef.current.style.setProperty('--my', `${y}px`);

    // Translate each floating card based on its index depth coefficient
    floatingCardsRef.current.forEach((card, index) => {
      if (!card) return;
      const depth = (index + 1) * 0.012;
      const moveX = (x - rect.width / 2) * depth;
      const moveY = (y - rect.height / 2) * depth;
      card.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
  };

  /**
   * Auto-redirects authenticated candidates directly to the dashboard overview.
   */
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  // Render centered spinner while checking authentication token in localStorage
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-500">Loading DevMeet...</p>
        </div>
      </div>
    );
  }

  // Prevent flash of landing page if candidate is logged in and redirect is executing
  if (user) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden antialiased selection:bg-blue-600 selection:text-white">
      {/* ── Top Navigation Header ────────────────────────────────────────── */}
      <LandingHeader />

      <main id="main-content">
        {/* ── Hero Section ─────────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          className="relative min-h-screen flex flex-col items-center justify-start pt-32 pb-24 px-6 overflow-hidden bg-slate-50"
        >
        {/* Decorative Background Mesh with interactive radial spotlight */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-40 -z-10"
          style={{
            background:
              'radial-gradient(800px circle at var(--mx, 50%) var(--my, 50%), rgba(59, 130, 246, 0.06), transparent 80%)',
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 -z-10" />

        {/* Floating Interactive Code Cards with parallax depth */}
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

        {/* Main Hero Headline & Copy */}
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/50 text-xs font-bold text-blue-600 mb-8 animate-pulse">
            <Zap className="w-3.5 h-3.5 fill-blue-600/10" />
            <span>Interactive Interview Studio v2.0</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight mb-6 text-slate-900">
            Nail Your Next
            <span className="text-blue-600 block mt-1.5">Technical Interview</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
            Practice with an AI interviewer that listens, evaluates live code execution, and analyzes
            architectural designs. Gain instant actionable feedback to land your dream position.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/register"
              className="btn-primary group flex items-center justify-center gap-2 px-7 py-3.5 text-base font-bold w-full sm:w-auto rounded-xl shadow-lg shadow-blue-500/20"
            >
              Get Started Free
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </Link>
            <a
              href="#features"
              className="btn-ghost flex items-center justify-center gap-2 px-7 py-3.5 text-base font-bold border-slate-200 text-slate-700 w-full sm:w-auto hover:bg-white rounded-xl shadow-xs"
            >
              Explore Features
            </a>
          </div>
        </div>

        {/* ── Studio Interactive Mockup Preview ──────────────────────────── */}
        <InterviewStudioMockup />
      </section>

      {/* ── Three Dedicated Interview Tracks ──────────────────────────────── */}
      <InterviewModesSection />

      {/* ── Edge AI & Proctoring Technology ─────────────────────────────────── */}
      <ProctoringShowcaseSection />

      {/* ── Pricing Comparison ──────────────────────────────────────────────── */}
      <PricingSection />

      {/* ── Candidate FAQ ───────────────────────────────────────────────────── */}
      <FaqSection />
      </main>

      {/* ── Global Footer ───────────────────────────────────────────────────── */}
      <LandingFooter />
    </div>
  );
}
