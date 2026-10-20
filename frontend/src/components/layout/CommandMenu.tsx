/**
 * @file CommandMenu.tsx
 * @description Global Spotlight/Command Palette Component for DevMeet.
 *
 * Responsibilities:
 * 1. Global Keyboard Shortcut:
 *    - Listens for `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) to toggle visibility anywhere in the app.
 * 2. Rapid Fuzzy Navigation (`cmdk`):
 *    - Fuzzy-matches user queries across pages, actions, and settings.
 * 3. Categorized Action Groups:
 *    - Navigation: Dashboard, Create Session, Questions, History, Leaderboard, Analytics.
 *    - Interview Shortcuts: Instant launcher for DSA, System Design, or Behavioral mock interviews.
 *    - Account: Profile, Billing, System Settings, Logout.
 * 4. Keyboard Accessibility:
 *    - Arrow keys navigation, Enter selection, and Escape dismissal with backdrop blur.
 *
 * @module components/layout/CommandMenu
 */

'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search,
  Home,
  Plus,
  History,
  Trophy,
  BarChart2,
  CreditCard,
  User,
  Settings,
  BookOpen,
  Code2,
  Layout,
  MessageSquare,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Props accepted by CommandMenu.
 */
interface CommandMenuProps {
  /** Flag indicating whether the spotlight command palette is open. */
  open: boolean;
  /** State setter to toggle or close the command palette. */
  setOpen: (open: boolean) => void;
}

/**
 * CommandMenu Component.
 *
 * @component
 * @param {CommandMenuProps} props
 * @returns {JSX.Element} Portaled modal command palette.
 */
export function CommandMenu({ open, setOpen }: CommandMenuProps) {
  const router = useRouter();
  const { logout } = useAuth();

  /**
   * Effect registering global keydown listener for Cmd+K and Ctrl+K shortcuts.
   */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, setOpen]);

  /**
   * Closes the command menu and routes to the specified application path.
   *
   * @param {string} path - Target application URL route.
   */
  const navigate = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  /**
   * Closes the command menu and logs the user out via AuthContext.
   */
  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global Command Menu"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 bg-slate-900/20 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div 
        className="w-full max-w-lg bg-white/98 border border-slate-200/80 shadow-2xl rounded-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input header */}
        <div className="flex items-center border-b border-slate-100 px-4">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <Command.Input
            placeholder="Type a page, action, or command..."
            className="w-full h-12 bg-transparent outline-none border-none text-slate-800 placeholder-slate-500 font-semibold text-sm px-3"
          />
        </div>

        {/* Command search results list */}
        <Command.List className="max-h-[350px] overflow-y-auto p-2 scrollbar-none">
          {/* Empty state when no commands match */}
          <Command.Empty className="text-slate-500 text-xs font-semibold p-4 text-center">
            No results found.
          </Command.Empty>

          {/* Navigation Category */}
          <Command.Group heading="Navigation" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2">
            <Command.Item
              onSelect={() => navigate('/dashboard')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <Home className="w-4.5 h-4.5" />
              <span>Dashboard Home</span>
            </Command.Item>
            
            <Command.Item
              onSelect={() => navigate('/dashboard/create-session')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Start New Interview Session</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/dashboard/questions')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <BookOpen className="w-4.5 h-4.5" />
              <span>Browse Question Bank</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/dashboard/history')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <History className="w-4.5 h-4.5" />
              <span>View Interview History</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/dashboard/leaderboard')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <Trophy className="w-4.5 h-4.5" />
              <span>Leaderboard Standings</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/analytics')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <BarChart2 className="w-4.5 h-4.5" />
              <span>Performance Analytics</span>
            </Command.Item>
          </Command.Group>

          {/* Quick Interview Round Launchers */}
          <Command.Group heading="Interview Types" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 mt-2">
            <Command.Item
              onSelect={() => navigate('/dashboard/create-session?type=dsa')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <Code2 className="w-4.5 h-4.5 text-blue-500" />
              <span>Start DSA / Coding Mock Round</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/dashboard/create-session?type=system_design')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <Layout className="w-4.5 h-4.5 text-emerald-500" />
              <span>Start System Design Mock Round</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/dashboard/create-session?type=behavioral')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <MessageSquare className="w-4.5 h-4.5 text-amber-500" />
              <span>Start Behavioral / STAR Mock Round</span>
            </Command.Item>
          </Command.Group>

          {/* User Account & Preference Settings */}
          <Command.Group heading="Account Settings" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 mt-2">
            <Command.Item
              onSelect={() => navigate('/profile')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <User className="w-4.5 h-4.5" />
              <span>My Profile Settings</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/billing')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <CreditCard className="w-4.5 h-4.5" />
              <span>Subscription & Billing</span>
            </Command.Item>

            <Command.Item
              onSelect={() => navigate('/settings')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <Settings className="w-4.5 h-4.5" />
              <span>Configure System Preferences</span>
            </Command.Item>

            <Command.Item
              onSelect={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-rose-50 aria-selected:text-rose-600 transition-colors text-slate-600 text-sm font-semibold outline-none"
            >
              <LogOut className="w-4.5 h-4.5 text-rose-500" />
              <span>Log out of Account</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
