'use client';

/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Code2, BarChart2, CheckCircle, TrendingUp, AlertCircle, Filter, Sparkles } from "lucide-react";
import DashboardShell from "@/components/layout/DashboardShell";
import { PageLoader } from "@/components/feedback/PageLoader";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSessions } from "@/hooks/queries/useSessions";
import { useQuota } from "@/hooks/queries/useUser";
import { useUserScoreTrend, useUserDashboard } from "@/hooks/queries/useAnalytics";
import StatCard from "@/components/StatCard";
const TrendChart = dynamic(() => import("./TrendChart"), { ssr: false, loading: () => _jsx("div", { className: "h-64 w-full animate-pulse bg-slate-100 rounded-2xl" }) });
const SkillRadar = dynamic(() => import("./SkillRadar"), { ssr: false, loading: () => _jsx("div", { className: "h-64 w-full animate-pulse bg-slate-100 rounded-2xl" }) });
import ConsistencyGrid from "./ConsistencyGrid";
import QuickSelect from "./QuickSelect";
import RecentSessions from "./RecentSessions";
import CategoryHeatmap from "./CategoryHeatmap";
function isThisMonth(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function computeStreak(sessions) {
    if (sessions.length === 0) return 0;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const toLocalDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-CA", { timeZone: tz });
    };
    const dates = new Set(sessions.map((s) => toLocalDate(s.created_at)));
    let streak = 0;
    const current = new Date();
    let checkDate = current.toLocaleDateString("en-CA", { timeZone: tz });
    while (dates.has(checkDate)) {
        streak++;
        current.setDate(current.getDate() - 1);
        checkDate = current.toLocaleDateString("en-CA", { timeZone: tz });
    }
    if (streak === 0 && sessions.length > 0) return 1;
    return streak;
}
export default function DashboardPage() {
    const { user, isLoading: authLoading } = useRequireAuth();
    const { data: sessions = [], isLoading: sessionsLoading, error: sessionsError, refetch } = useSessions();
    const { data: quota } = useQuota();
    const [trendDays, setTrendDays] = useState(30);
    const [companyFilter, setCompanyFilter] = useState("all");
    const { data: scoreTrendData } = useUserScoreTrend(trendDays);
    const { data: dashboardData } = useUserDashboard(90);
    const companyOptions = useMemo(()=>{
        const companies = new Set();
        sessions.forEach((s)=>{
            if (s.target_company?.trim()) companies.add(s.target_company.trim());
        });
        return Array.from(companies).sort();
    }, [
        sessions
    ]);
    const filteredSessions = useMemo(()=>{
        if (companyFilter === "all") return sessions;
        return sessions.filter((s)=>s.target_company === companyFilter);
    }, [
        sessions,
        companyFilter
    ]);
    const totalSessions = filteredSessions.length;
    const completedSessions = filteredSessions.filter((s)=>s.status === "completed").length;
    const dsaSessions = filteredSessions.filter((s)=>s.interview_type === "dsa").length;
    const thisMonthSessions = filteredSessions.filter((s)=>isThisMonth(s.created_at)).length;
    const streakDays = useMemo(()=>computeStreak(filteredSessions), [
        filteredSessions
    ]);
    const recentSessions = useMemo(()=>[
            ...filteredSessions
        ].sort((a, b)=>new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5), [
        filteredSessions
    ]);
    const trendData = useMemo(()=>{
        const apiTrend = scoreTrendData?.trend;
        if (apiTrend && apiTrend.length > 0) {
            return apiTrend.map((p)=>({
                    date: new Date(p.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric"
                    }),
                    score: Math.round(p.score)
                }));
        }
        const completed = filteredSessions.filter((s)=>s.status === "completed").sort((a, b)=>new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (completed.length === 0) return [];
        return completed.map((s, i)=>({
                date: new Date(s.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric"
                }),
                score: 65 + i % 5 * 5
            }));
    }, [
        filteredSessions,
        scoreTrendData
    ]);
    // DASH-02: Skill Radar — use real analytics data from analytics-service when available,
    // fall back to local session count heuristic if analytics not yet available.
    const radarScores = useMemo(()=>{
        // Real data path: analytics-service returns type_breakdown and average_score
        if (dashboardData?.type_breakdown && Object.keys(dashboardData.type_breakdown).length > 0) {
            const breakdown = dashboardData.type_breakdown;
            const totalSess = dashboardData.total_sessions || 1;
            // Compute a normalized 0-100 score per type proportional to session count
            const dsaRatio = (breakdown.dsa ?? 0) / totalSess * 100;
            const behavRatio = (breakdown.behavioral ?? 0) / totalSess * 100;
            const sysRatio = (breakdown.system_design ?? 0) / totalSess * 100;
            const baseScore = dashboardData.average_score ?? 70;
            return {
                dsa: Math.min(Math.round(baseScore * 0.9 + dsaRatio * 0.1), 100),
                behavioral: Math.min(Math.round(baseScore * 0.85 + behavRatio * 0.1), 100),
                system_design: Math.min(Math.round(baseScore * 0.8 + sysRatio * 0.1), 100),
                communication: Math.min(Math.round(baseScore * 1.05), 100),
                optimizations: Math.min(Math.round(baseScore * 0.95), 100)
            };
        }
        // Fallback: local heuristic from session list
        if (filteredSessions.length === 0) {
            return {
                dsa: 75,
                behavioral: 80,
                system_design: 60,
                communication: 85,
                optimizations: 70
            };
        }
        return {
            dsa: Math.min(filteredSessions.filter((s)=>s.interview_type === "dsa").length * 15 + 65, 95),
            behavioral: Math.min(filteredSessions.filter((s)=>s.interview_type === "behavioral").length * 15 + 60, 95),
            system_design: Math.min(filteredSessions.filter((s)=>s.interview_type === "system_design").length * 15 + 55, 95),
            communication: 82,
            optimizations: 76
        };
    }, [
        filteredSessions,
        dashboardData
    ]);
    if (authLoading || !user) {
        return /*#__PURE__*/ _jsx(PageLoader, {
            label: "Loading dashboard…"
        });
    }
    const displayName = user.display_name ?? user.email ?? "User";
    return /*#__PURE__*/ _jsxs(DashboardShell, {
        children: [
            quota && quota.remaining_today === 0 && /*#__PURE__*/ _jsxs(motion.div, {
                initial: {
                    opacity: 0,
                    y: -8
                },
                animate: {
                    opacity: 1,
                    y: 0
                },
                className: "bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center justify-between",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-3",
                        children: [
                            /*#__PURE__*/ _jsx(AlertCircle, {
                                className: "w-5 h-5 text-red-600"
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("h4", {
                                        className: "text-sm font-bold text-slate-900",
                                        children: "Daily Limit Reached"
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "text-slate-600 text-xs mt-0.5",
                                        children: [
                                            quota.interviews_today,
                                            "/",
                                            quota.daily_limit,
                                            " interviews today. Upgrade for unlimited access."
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx(Link, {
                        href: "/billing",
                        className: "btn-primary text-xs py-1.5 px-3 shrink-0",
                        children: "Upgrade to Pro"
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs(motion.section, {
                initial: {
                    opacity: 0,
                    y: 12
                },
                animate: {
                    opacity: 1,
                    y: 0
                },
                transition: {
                    duration: 0.35
                },
                className: "flex flex-col md:flex-row md:items-center justify-between gap-4",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsxs("h1", {
                                className: "text-2xl md:text-3xl font-bold tracking-tight",
                                style: {
                                    color: "#111",
                                    letterSpacing: "-0.03em"
                                },
                                children: [
                                    "Welcome back, ",
                                    /*#__PURE__*/ _jsx("span", {
                                        style: {
                                            color: "#4f46e5"
                                        },
                                        children: displayName
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "mt-1.5 text-sm",
                                style: {
                                    color: "#888",
                                    fontWeight: 500
                                },
                                children: "Ready to ace your next technical interview?"
                            })
                        ]
                    }),
                    quota && /*#__PURE__*/ _jsxs("div", {
                        className: "relative overflow-hidden bg-white border border-slate-100 rounded-2xl px-5 py-3.5 shrink-0 flex items-center gap-3.5 shadow-sm group",
                        children: [
                            /*#__PURE__*/ _jsxs("svg", {
                                className: "absolute inset-0 -z-10 h-full w-full stroke-slate-200/10 [mask-image:radial-gradient(100%_100%_at_top_right,white,transparent)] opacity-60",
                                "aria-hidden": "true",
                                children: [
                                    /*#__PURE__*/ _jsx("defs", {
                                        children: /*#__PURE__*/ _jsx("pattern", {
                                            id: "quota-grid",
                                            width: "10",
                                            height: "10",
                                            patternUnits: "userSpaceOnUse",
                                            children: /*#__PURE__*/ _jsx("path", {
                                                d: "M.5 10V.5H10",
                                                fill: "none"
                                            })
                                        })
                                    }),
                                    /*#__PURE__*/ _jsx("rect", {
                                        width: "100%",
                                        height: "100%",
                                        strokeWidth: "0",
                                        fill: "url(#quota-grid)"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "p-2.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/10 flex items-center justify-center shrink-0",
                                children: /*#__PURE__*/ _jsx(Sparkles, {
                                    className: "w-4 h-4 animate-pulse"
                                })
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "text-slate-400 text-[9px] uppercase font-extrabold tracking-widest block leading-none mb-1",
                                        children: "Remaining today"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "text-[15px] font-black text-slate-855 leading-none",
                                        children: quota.daily_limit === -1 ? "Unlimited" : `${quota.remaining_today} / ${quota.daily_limit}`
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }),
            companyOptions.length > 0 && /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center gap-2 flex-wrap",
                children: [
                    /*#__PURE__*/ _jsx(Filter, {
                        className: "w-4 h-4 text-slate-400"
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "text-xs font-bold text-slate-500 uppercase tracking-wider",
                        children: "Company"
                    }),
                    /*#__PURE__*/ _jsxs("select", {
                        value: companyFilter,
                        onChange: (e)=>setCompanyFilter(e.target.value),
                        className: "text-sm border border-blue-100 rounded-lg px-3 py-1.5 bg-white text-slate-700 font-medium",
                        children: [
                            /*#__PURE__*/ _jsx("option", {
                                value: "all",
                                children: "All companies"
                            }),
                            companyOptions.map((c)=>/*#__PURE__*/ _jsx("option", {
                                    value: c,
                                    children: c
                                }, c))
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "grid grid-cols-2 lg:grid-cols-4 gap-5",
                children: [
                    /*#__PURE__*/ _jsx(StatCard, {
                        label: "Total Sessions",
                        value: totalSessions,
                        icon: BarChart2,
                        color: "purple"
                    }),
                    /*#__PURE__*/ _jsx(StatCard, {
                        label: "Completed",
                        value: completedSessions,
                        icon: CheckCircle,
                        color: "green"
                    }),
                    /*#__PURE__*/ _jsx(StatCard, {
                        label: "DSA Sessions",
                        value: dsaSessions,
                        icon: Code2,
                        color: "blue"
                    }),
                    /*#__PURE__*/ _jsx(StatCard, {
                        label: "This Month",
                        value: thisMonthSessions,
                        icon: TrendingUp,
                        color: "orange"
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("section", {
                className: "grid grid-cols-1 lg:grid-cols-3 gap-5",
                children: [
                    /*#__PURE__*/ _jsx(TrendChart, {
                        trendData: trendData,
                        trendDays: trendDays,
                        setTrendDays: setTrendDays
                    }),
                    /*#__PURE__*/ _jsx(SkillRadar, {
                        radarScores: radarScores,
                        totalSessions: totalSessions
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(ConsistencyGrid, {
                sessions: filteredSessions,
                streakDays: streakDays
            }),
            /*#__PURE__*/ _jsx(CategoryHeatmap, {
                sessions: filteredSessions
            }),
            /*#__PURE__*/ _jsx(QuickSelect, {}),
            /*#__PURE__*/ _jsx(RecentSessions, {
                sessionsLoading: sessionsLoading,
                sessionsError: sessionsError?.message ?? null,
                recentSessions: recentSessions,
                allSessions: filteredSessions,
                totalSessions: totalSessions,
                fetchSessions: ()=>refetch(),
                isPro: quota?.plan === "pro" || quota?.daily_limit === -1
            })
        ]
    });
}
