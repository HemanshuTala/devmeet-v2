'use client';

import React from 'react';
import Link from 'next/link';
import { Brain } from 'lucide-react';

/**
 * Global footer for landing and marketing pages.
 * Includes legal compliance links (`/privacy`, `/terms`), status indicator, and brand attribution.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200/60 bg-white py-16 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Column 1: Brand Info */}
          <div className="space-y-4 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/10 text-white">
                <Brain className="w-4.5 h-4.5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight text-lg">DevMeet</span>
            </Link>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed font-semibold">
              An intelligent agentic platform that conducts realistic voice, coding, and architecture interviews. Get comprehensive feedback and rank against real hiring standards.
            </p>
          </div>

          {/* Column 2: Platform Links */}
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">
              Platform
            </h4>
            <ul className="space-y-2.5 text-xs font-bold text-slate-600">
              <li>
                <a href="#features" className="hover:text-blue-600 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-blue-600 transition-colors">
                  How it Works
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-blue-600 transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-blue-600 transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: System Status & Legal */}
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">
              System
            </h4>
            <ul className="space-y-2.5 text-xs font-bold text-slate-600">
              <li>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  All Systems Operational
                </span>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-blue-600 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-blue-600 transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-400 font-semibold">
          <p>© {new Date().getFullYear()} DevMeet. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-slate-600 cursor-pointer">Twitter</span>
            <span className="hover:text-slate-600 cursor-pointer">GitHub</span>
            <span className="hover:text-slate-600 cursor-pointer">LinkedIn</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default LandingFooter;
