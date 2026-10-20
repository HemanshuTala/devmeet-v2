'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Menu, X } from 'lucide-react';

/**
 * Global header navigation for the DevMeet landing and marketing pages.
 * Responsive with sticky backdrop blur and mobile drawer menu.
 */
export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-200/60 backdrop-blur-xl bg-white/80 shadow-sm transition-all" role="banner">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
            <Brain className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">DevMeet</span>
        </Link>

        {/* Desktop Anchor Navigation */}
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
          <a href="#features" className="hover:text-blue-600 transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-blue-600 transition-colors">
            How it Works
          </a>
          <a href="#pricing" className="hover:text-blue-600 transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-blue-600 transition-colors">
            FAQ
          </a>
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors py-2 px-3"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="btn-primary text-sm px-5 py-2 shadow-sm font-bold rounded-xl"
          >
            Start Practice Free
          </Link>
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
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
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-semibold text-slate-700 py-1"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-semibold text-slate-700 py-1"
            >
              How it Works
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-semibold text-slate-700 py-1"
            >
              Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-semibold text-slate-700 py-1"
            >
              FAQ
            </a>
            <hr className="border-slate-100" />
            <div className="flex items-center gap-3 w-full">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-ghost text-sm py-2 px-4 flex-1 text-center font-bold"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-primary text-sm py-2 px-4 flex-1 text-center font-bold"
              >
                Register
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export default LandingHeader;
