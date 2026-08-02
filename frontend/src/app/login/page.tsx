'use client';

import Link from 'next/link';
import { Brain, Code2, Zap } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';

const STATS = [
  { icon: <Zap className="w-4 h-4 text-yellow-300" />, label: '98% Success Rate' },
  { icon: <Brain className="w-4 h-4 text-purple-300" />, label: 'AI-Powered' },
  { icon: <Code2 className="w-4 h-4 text-cyan-300" />, label: '10K+ Users' },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-blue-600 flex-col justify-between p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        <Link href="/" className="relative z-10 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">DevMeet</span>
        </Link>

        <div className="relative z-10 space-y-6">
          <blockquote className="text-4xl font-bold text-white leading-tight">
            Ace every{' '}
            <span className="text-sky-200 font-extrabold">
              technical interview
            </span>{' '}
            with AI as your co-pilot.
          </blockquote>
          <p className="text-blue-100 text-lg max-w-sm leading-relaxed">
            Practice with realistic mock interviews, get instant AI feedback, and land your dream role.
          </p>
          <div className="flex flex-col gap-3 pt-4">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 px-4 py-3 w-fit rounded-xl border border-white/30 bg-white/20 backdrop-blur-md"
              >
                {stat.icon}
                <span className="text-white text-sm font-medium">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-blue-200/60 text-xs">
          © {new Date().getFullYear()} DevMeet. All rights reserved.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-10">
          <Brain className="w-6 h-6 text-blue-600" />
          <span className="text-2xl font-bold gradient-text">DevMeet</span>
        </Link>

        <div className="w-full max-w-md bg-white border border-blue-100/80 shadow-2xl shadow-blue-500/5 rounded-2xl p-8 md:p-10">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
