'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Crown, Star, TrendingUp, CheckCircle2, ShieldAlert, Loader2, ArrowRight, Sparkles, Users } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/contexts/AuthContext';
import { userApi } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avg_score: number;
  sessions_count: number;
}

function PodiumCard({ entry, rank, isMe }: { entry: LeaderboardEntry; rank: number; isMe: boolean }) {
  const heights: Record<number, string> = {
    1: 'h-36',
    2: 'h-28',
    3: 'h-24',
  };

  const colors: Record<number, { ring: string; bg: string; text: string; pedestal: string; shadow: string }> = {
    1: {
      ring: 'ring-amber-400',
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      pedestal: 'bg-gradient-to-t from-amber-500 to-amber-400',
      shadow: 'shadow-amber-500/20',
    },
    2: {
      ring: 'ring-slate-300',
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      pedestal: 'bg-gradient-to-t from-slate-400 to-slate-300',
      shadow: 'shadow-slate-400/20',
    },
    3: {
      ring: 'ring-amber-700/60',
      bg: 'bg-amber-50/50',
      text: 'text-amber-800',
      pedestal: 'bg-gradient-to-t from-amber-700 to-amber-600',
      shadow: 'shadow-amber-700/20',
    },
  };

  const c = colors[rank] || colors[2];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rank * 0.1 }}
      className={`flex flex-col items-center gap-3 ${rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3'}`}
    >
      <div className="relative">
        <Avatar className={`h-16 w-16 ring-4 ${c.ring} shadow-md transition-transform duration-300 hover:scale-105 ${isMe ? 'ring-offset-2 ring-offset-white' : ''}`}>
          <AvatarFallback className={`text-base font-bold ${c.bg} ${c.text}`}>
            {getInitials(entry.display_name)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-slate-100 flex items-center justify-center">
          {rank === 1 && <Crown className="w-4 h-4 text-amber-500 fill-amber-300" />}
          {rank === 2 && <Medal className="w-4 h-4 text-slate-400 fill-slate-200" />}
          {rank === 3 && <Medal className="w-4 h-4 text-amber-700 fill-amber-300" />}
        </span>
      </div>

      <div className="text-center">
        <p className="font-bold text-slate-900 text-sm leading-tight max-w-[100px] truncate">
          {entry.display_name}
          {isMe && <span className="ml-1 text-[9px] text-indigo-600 font-black uppercase bg-indigo-50 border border-indigo-100 px-1 rounded-sm">YOU</span>}
        </p>
        <p className={`text-2xl font-black mt-0.5 tracking-tight ${c.text}`}>{entry.avg_score}%</p>
        <p className="text-[10px] text-slate-400 font-semibold">{entry.sessions_count} sessions</p>
      </div>

      <div className={`${heights[rank]} w-24 ${c.pedestal} ${c.shadow} rounded-t-2xl flex items-start justify-center pt-2.5 shadow-lg`}>
        <span className="text-white text-sm font-black drop-shadow-sm">#{rank}</span>
      </div>
    </motion.div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-6 items-end pt-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center space-y-4 h-56 justify-end">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <div className="bg-slate-100 w-full h-16 rounded-t-2xl" />
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center space-y-4 h-64 justify-end">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <div className="bg-amber-100 w-full h-20 rounded-t-2xl" />
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col items-center space-y-4 h-48 justify-end">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <div className="bg-slate-100 w-full h-12 rounded-t-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useRequireAuth();
  const { refreshUser } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPublic, setUpdatingPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;

  const loadLeaderboard = useCallback(async () => {
    try {
      const data = await userApi.getLeaderboard(50);
      setEntries(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && userId) {
      loadLeaderboard();
    }
  }, [authLoading, userId, loadLeaderboard]);

  const handleTogglePublic = async () => {
    if (!user) return;
    setUpdatingPublic(true);
    try {
      const isCurrentlyPublic = user.profile_public ?? false;
      await userApi.updateProfile({ profile_public: !isCurrentlyPublic });
      toast.success(!isCurrentlyPublic ? 'Your profile is now public on the leaderboard!' : 'Your profile is now private.');
      await refreshUser();
      // Reload rankings smoothly without full skeleton flash
      const data = await userApi.getLeaderboard(50);
      setEntries(data || []);
    } catch {
      toast.error('Failed to update your privacy settings.');
    } finally {
      setUpdatingPublic(false);
    }
  };

  if (authLoading || !user) {
    return (
      <DashboardShell maxWidth="max-w-4xl">
        <LeaderboardSkeleton />
      </DashboardShell>
    );
  }

  const myRank = entries.findIndex((e) => e.user_id === user.id) + 1;
  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <DashboardShell maxWidth="max-w-4xl">
      <div className="space-y-8 pb-10">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center shadow-sm">
              <Trophy className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Leaderboard</h1>
              <p className="text-xs text-slate-500 font-medium">Top performers &amp; rankings across the DevMeet community</p>
            </div>
          </div>

          {myRank > 0 && (
            <div className="flex items-center gap-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-2.5 shadow-sm self-start sm:self-auto">
              <Star className="w-4 h-4 text-indigo-600 fill-indigo-400" />
              <span className="text-xs font-bold text-indigo-900">
                Your Rank: <span className="text-indigo-600 font-extrabold text-sm">#{myRank}</span>
              </span>
            </div>
          )}
        </div>

        {/* Opt-in Privacy Banner */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border p-6 shadow-sm transition-all duration-200 ${
            user.profile_public ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/40 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3.5">
            <div
              className={`p-2.5 rounded-2xl border flex items-center justify-center shrink-0 mt-0.5 ${
                user.profile_public ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}
            >
              {user.profile_public ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">
                {user.profile_public ? 'Leaderboard Participation Active' : 'Your Profile is Currently Private'}
              </h4>
              <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed max-w-2xl">
                {user.profile_public
                  ? 'Your interview scores are public on the leaderboard. You can opt out at any time.'
                  : 'You are hidden from the community leaderboard. Turn on public stats to compete and rank with other developers.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleTogglePublic}
            disabled={updatingPublic}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all shrink-0 flex items-center gap-2 justify-center shadow-sm border ${
              user.profile_public
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-indigo-500/20'
            }`}
          >
            {updatingPublic ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Updating&hellip;
              </>
            ) : (
              <span>{user.profile_public ? 'Make Profile Private' : 'Join Leaderboard'}</span>
            )}
          </button>
        </div>

        {/* Content Section */}
        {loading ? (
          <LeaderboardSkeleton />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800 font-bold">{error}</div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-10 md:p-14 text-center shadow-sm max-w-xl mx-auto flex flex-col items-center gap-6 my-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shadow-sm">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-lg">No Public Profiles Yet</h2>
              <p className="text-slate-500 text-xs mt-1.5 max-w-md mx-auto leading-relaxed font-medium">
                {!user.profile_public
                  ? 'Be the first developer to opt in, complete a mock interview, and claim the top spot on the community leaderboard!'
                  : 'You have enabled public stats! Complete your first mock interview session to claim the top spot.'}
              </p>
            </div>

            {!user.profile_public ? (
              <button
                onClick={handleTogglePublic}
                disabled={updatingPublic}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
              >
                {updatingPublic ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Opt In to Leaderboard
              </button>
            ) : (
              <button
                onClick={() => router.push('/dashboard/create-session')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 px-6 py-3 rounded-xl font-extrabold text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
              >
                Start First Session
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top 3 Podium Card */}
            {topThree.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-sm">
                <div className="flex items-end justify-center gap-6 pt-4">
                  {topThree[1] && <PodiumCard entry={topThree[1]} rank={2} isMe={topThree[1].user_id === user.id} />}
                  {topThree[0] && <PodiumCard entry={topThree[0]} rank={1} isMe={topThree[0].user_id === user.id} />}
                  {topThree[2] && <PodiumCard entry={topThree[2]} rank={3} isMe={topThree[2].user_id === user.id} />}
                </div>
              </div>
            )}

            {/* Rankings List (Rank 4+) */}
            {rest.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-wider">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    Rankings 4 – {entries.length}
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {rest.map((entry, idx) => {
                    const rank = idx + 4;
                    const isMe = entry.user_id === user.id;
                    return (
                      <li
                        key={entry.user_id}
                        className={`flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50 ${
                          isMe ? 'bg-indigo-50/50' : ''
                        }`}
                      >
                        <span className="w-8 text-center text-xs font-black text-slate-400">#{rank}</span>
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="text-xs font-bold bg-slate-100 text-slate-700">
                            {getInitials(entry.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate text-sm">
                            {entry.display_name}
                            {isMe && (
                              <span className="ml-2 text-[9px] uppercase font-black text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 font-medium">{entry.sessions_count} sessions completed</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-slate-900">{entry.avg_score}%</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">avg score</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
