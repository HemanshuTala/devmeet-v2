'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Brain, LayoutDashboard, BarChart2, Settings, User, LogOut, Menu, X, CreditCard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navLinks = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/analytics',  label: 'Analytics',  icon: BarChart2 },
  { href: '/billing',    label: 'Billing',    icon: CreditCard },
  { href: '/profile',    label: 'Profile',    icon: User },
  { href: '/settings',   label: 'Settings',   icon: Settings },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <nav className="sticky top-0 z-50 glass-card border-b border-white/30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg gradient-text">DevMeet</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname === href
                  ? 'bg-blue-500/10 text-blue-600'
                  : 'text-slate-600 hover:bg-blue-500/5 hover:text-blue-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* User + Logout */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
            <div className="w-7 h-7 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold">
              {user?.display_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="text-sm font-medium text-slate-700">{user?.display_name}</span>
          </div>
          <button onClick={handleLogout} className="btn-ghost px-3 py-2 text-sm">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden btn-ghost p-2" onClick={() => setOpen(!open)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden mt-2 pb-3 border-t border-white/20 pt-3 flex flex-col gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                pathname === href ? 'bg-blue-500/10 text-blue-600' : 'text-slate-600'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          ))}
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-500">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
