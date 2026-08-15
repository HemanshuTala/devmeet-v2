'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Plus,
  History,
  User,
  Settings,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  BookOpen,
  CreditCard,
  Trophy,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { CommandMenu } from './CommandMenu';
import { useUIStore } from '@/stores/uiStore';
import { useQuota } from '@/hooks/queries/useUser';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import TopLoadingBar from './TopLoadingBar';
import PageTransition from './PageTransition';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: Home, exact: true },
  { href: '/dashboard/create-session', label: 'New Interview', icon: Plus },
  { href: '/dashboard/questions', label: 'Question Bank', icon: BookOpen },
  { href: '/dashboard/history', label: 'History', icon: History },
  { href: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: typeof NAV_ITEMS[0];
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const content = (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 select-none',
        isActive
          ? 'bg-slate-900 text-white shadow-sm font-semibold'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
        collapsed && 'justify-center px-0 w-10 h-10 mx-auto'
      )}
    >
      <Icon
        className={cn(
          'w-4 h-4 flex-shrink-0 transition-colors',
          isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-900'
        )}
      />
      {!collapsed && (
        <span className="truncate tracking-tight">{item.label}</span>
      )}
      {isActive && !collapsed && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute right-2 w-1.5 h-1.5 rounded-full bg-indigo-400"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="bg-slate-900 text-white border-none text-xs font-semibold px-2.5 py-1">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

export default function DashboardShell({
  children,
  maxWidth = 'max-w-7xl',
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const [commandOpen, setCommandOpen] = useState(false);
  const { data: quota } = useQuota();
  const { isAdmin } = useIsAdmin();

  const userProfileItem = NAV_ITEMS.find((item) => item.href === '/profile');
  const displayName = user?.name || user?.email || 'User';

  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Dashboard Overview';
    if (pathname.includes('/create-session')) return 'Setup AI Interview';
    if (pathname.includes('/questions')) return 'Practice Question Bank';
    if (pathname.includes('/history')) return 'Interview History';
    if (pathname.includes('/leaderboard')) return 'Community Leaderboard';
    if (pathname.includes('/analytics')) return 'Performance Analytics';
    if (pathname.includes('/billing')) return 'Subscription & Plans';
    if (pathname.includes('/profile')) return 'My Profile';
    if (pathname.includes('/settings')) return 'Account Settings';
    if (pathname.includes('/admin')) return 'Admin Control Center';
    return 'DevMeet v2';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased">
      <TopLoadingBar />

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-slate-200/80 bg-white shadow-xs z-30 transition-all duration-300 select-none',
          sidebarCollapsed ? 'w-[68px]' : 'w-[240px]'
        )}
      >
        {/* Brand Logo Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-slate-900 text-decoration-none">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
              <Zap className="w-4.5 h-4.5 text-white fill-white" />
            </div>
            {!sidebarCollapsed && (
              <span className="font-bold tracking-tight text-base text-slate-900 font-display">
                Dev<span className="text-indigo-600">Meet</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-7 h-7 rounded-lg border border-slate-200/70 text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.filter((i) => i.href !== '/profile' && i.href !== '/settings').map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return <NavLink key={item.href} item={item} isActive={isActive} collapsed={sidebarCollapsed} />;
          })}
        </nav>

        {/* Tier Quota Widget */}
        {quota && !sidebarCollapsed && (
          <div className="mx-3 mb-3 p-3.5 rounded-xl bg-slate-900 text-white shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Free Tier</span>
              <span className="font-semibold text-indigo-300">
                {quota.interviewCount ?? 0} / {quota.limit ?? 5} Interviews
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(((quota.interviewCount ?? 0) / (quota.limit ?? 5)) * 100, 100)}%` }}
              />
            </div>
            <Link
              href="/billing"
              className="block text-center text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 pt-0.5"
            >
              Upgrade to Pro →
            </Link>
          </div>
        )}

        {/* Admin Link if Admin */}
        {isAdmin && (
          <div className="mx-3 mb-2">
            {!sidebarCollapsed ? (
              <Link
                href="/admin"
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors"
              >
                <span>ADMIN PANEL</span>
                <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Manage</span>
              </Link>
            ) : (
              <Link
                href="/admin"
                className="w-9 h-9 mx-auto flex items-center justify-center rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xs"
                title="Admin Panel"
              >
                A
              </Link>
            )}
          </div>
        )}

        {/* Bottom User Bar */}
        <div className="p-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Avatar className="w-8 h-8 rounded-lg flex-shrink-0">
              <AvatarFallback className="bg-indigo-600 text-white text-xs font-bold">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-900 truncate">{displayName}</span>
                <span className="text-[11px] text-slate-500 truncate">{user?.email}</span>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => logout()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex-shrink-0 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between z-20">
          <AnimatePresence mode="popLayout">
            <motion.h1
              key={pathname}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.15 }}
              className="text-base font-semibold text-slate-900 tracking-tight"
            >
              {getPageTitle()}
            </motion.h1>
          </AnimatePresence>

          <div className="flex items-center gap-3">
            {/* Quick Search Shortcut */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-2 bg-slate-100/80 border border-slate-200/80 hover:bg-white hover:border-slate-300 px-3 py-1.5 rounded-xl text-xs text-slate-500 transition-all cursor-pointer w-48 justify-between"
            >
              <div className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>Search...</span>
              </div>
              <kbd className="text-[10px] font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-400">
                ⌘K
              </kbd>
            </button>

            {/* Quick User Profile Shortcut */}
            <Link href="/profile">
              <Avatar className="w-7 h-7 hover:opacity-80 transition-opacity cursor-pointer">
                <AvatarFallback className="bg-indigo-600 text-white text-[11px] font-bold">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
            </Link>

            <div className="w-px h-5 bg-slate-200" />

            <button
              type="button"
              onClick={() => logout()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/50 pb-12">
          <div className={cn(maxWidth, 'mx-auto px-6 md:px-8 py-6 space-y-6')}>
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>

      <CommandMenu open={commandOpen} setOpen={setCommandOpen} />
    </div>
  );
}
