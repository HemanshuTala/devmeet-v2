import React from 'react';
import Link from 'next/link';
import { Brain, ArrowLeft, Shield, Lock, Eye, Database, Bell } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | DevMeet',
  description: 'Learn how DevMeet collects, uses, and safeguards your personal data, audio, and interview submissions.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
              <Brain className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-slate-900 tracking-tight text-lg">DevMeet</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <Link
              href="/login"
              className="hidden sm:inline-flex text-xs font-bold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 sm:p-12 space-y-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-600 mb-4">
              <Shield className="w-3.5 h-3.5" />
              <span>User Data Protection & Privacy</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-slate-500 mt-2 font-medium">Last updated: October 2026</p>
          </div>

          <div className="prose prose-slate max-w-none text-slate-600 text-sm leading-relaxed space-y-6">
            <p>
              Welcome to <strong>DevMeet</strong> (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We respect your privacy and are committed
              to protecting your personal information. This Privacy Policy explains how your data is collected, processed, stored, and protected
              when you use our AI-powered interview practice platform.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6 not-prose">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex gap-3 items-start">
                <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Encrypted at Rest & Transit</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    All interview telemetry, audio transcripts, and code snippets are encrypted using TLS 1.3 and AES-256.
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex gap-3 items-start">
                <Database className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Strict Consent Control</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Audio recording is strictly optional. You have full granular control over recording consent on session setup.
                  </p>
                </div>
              </div>
            </div>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">1. Information We Collect</h2>
              <p>When you register and conduct interview sessions with DevMeet, we may collect the following:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Account Information:</strong> Name, email address, password hash, and profile details.</li>
                <li><strong>Interview Session Data:</strong> Target job role, selected difficulty, code submissions, console execution output, and architectural diagrams.</li>
                <li><strong>Audio & Speech Data:</strong> Real-time audio streams (transcribed to text for AI analysis) if audio recording consent is granted.</li>
                <li><strong>Anti-Cheating Telemetry:</strong> Anonymized event counts (tab switches, paste events) used strictly for interview scoring and cheat detection.</li>
                <li><strong>Billing Information:</strong> Payment order IDs processed via authorized payment partners (Razorpay). DevMeet does not store sensitive card or bank numbers.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">2. How We Use Your Data</h2>
              <p>We process your information solely for the following legitimate purposes:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Providing the AI interviewer experience and generating structured STAR-method feedback reports.</li>
                <li>Computing analytics, skill radar scores, and comparative leaderboard percentiles.</li>
                <li>Facilitating account security, MFA verification, and transaction receipts.</li>
                <li>Maintaining and improving platform stability, rate-limiting, and error diagnostics.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">3. Third-Party AI Processors</h2>
              <p>
                DevMeet utilizes enterprise AI models (such as Google Gemini, OpenAI, or DeepSeek) to evaluate candidate responses.
                Data provided to these models is transmitted securely via backend API calls under enterprise terms that prohibit the use
                of your submissions to train foundational public models.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">4. Data Retention and Deletion Rights</h2>
              <p>
                You retain complete ownership over your interview recordings and feedback reports. You may delete past sessions
                from your History page or request complete account deletion at any time via your Profile Settings.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">5. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at{' '}
                <a href="mailto:privacy@devmeet.internal" className="text-blue-600 hover:underline font-semibold">
                  privacy@devmeet.internal
                </a>.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 px-6 text-center text-xs text-slate-500 font-medium">
        © {new Date().getFullYear()} DevMeet. All rights reserved.
      </footer>
    </div>
  );
}
