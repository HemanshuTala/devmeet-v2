'use client';

/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Medal, Crown, Star, TrendingUp, CheckCircle2, ShieldAlert, Loader2, ArrowRight } from "lucide-react";
import DashboardShell from "@/components/layout/DashboardShell";
import { PageLoader } from "@/components/feedback/PageLoader";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/contexts/AuthContext";
import { userApi } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
function PodiumCard({ entry, rank, isMe }) {
    const heights = {
        1: "h-32",
        2: "h-24",
        3: "h-20"
    };
    const colors = {
        1: {
            ring: "ring-amber-400",
            bg: "bg-amber-50",
            text: "text-amber-600",
            badge: "bg-amber-400"
        },
        2: {
            ring: "ring-slate-300",
            bg: "bg-slate-50",
            text: "text-slate-600",
            badge: "bg-slate-500"
        },
        3: {
            ring: "ring-amber-600/85",
            bg: "bg-amber-50/30",
            text: "text-amber-800",
            badge: "bg-amber-650"
        }
    };
    const c = colors[rank];
    return /*#__PURE__*/ _jsxs("div", {
        className: `flex flex-col items-center gap-3 ${rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3"} animate-fade-in-up`,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "relative",
                children: [
                    /*#__PURE__*/ _jsx(Avatar, {
                        className: `h-16 w-16 ring-4 ${c.ring} shadow-md transition-transform duration-300 hover:scale-105 ${isMe ? "ring-offset-2 ring-offset-white" : ""}`,
                        children: /*#__PURE__*/ _jsx(AvatarFallback, {
                            className: `text-base font-bold ${c.bg} ${c.text}`,
                            children: getInitials(entry.display_name)
                        })
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        className: "absolute -top-1.5 -right-1.5 bg-white rounded-full p-1 shadow-sm border border-slate-150 flex items-center justify-center",
                        children: [
                            rank === 1 && /*#__PURE__*/ _jsx(Crown, {
                                className: "w-3.5 h-3.5 text-amber-500 fill-amber-300 animate-pulse"
                            }),
                            rank === 2 && /*#__PURE__*/ _jsx(Medal, {
                                className: "w-3.5 h-3.5 text-slate-500 fill-slate-200"
                            }),
                            rank === 3 && /*#__PURE__*/ _jsx(Medal, {
                                className: "w-3.5 h-3.5 text-amber-700 fill-amber-650/25"
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "text-center",
                children: [
                    /*#__PURE__*/ _jsxs("p", {
                        className: "font-bold text-slate-900 text-sm leading-tight max-w-[90px] truncate",
                        children: [
                            entry.display_name,
                            isMe && /*#__PURE__*/ _jsx("span", {
                                className: "ml-1 text-[9px] text-blue-600 font-extrabold uppercase bg-blue-50 border border-blue-100 px-1 rounded-sm",
                                children: "you"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        className: `text-xl font-black mt-1 ${c.text}`,
                        children: [
                            entry.avg_score,
                            "%"
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        className: "text-[10px] text-slate-400 font-semibold",
                        children: [
                            entry.sessions_count,
                            " sessions"
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                className: `${heights[rank]} w-20 ${c.badge} rounded-t-xl flex items-start justify-center pt-2 shadow-inner`,
                children: /*#__PURE__*/ _jsxs("span", {
                    className: "text-white text-xs font-black",
                    children: [
                        "#",
                        rank
                    ]
                })
            })
        ]
    });
}
// ─── Leaderboard Skeleton ──────────────────────────────────────────────────────
function LeaderboardSkeleton() {
    return /*#__PURE__*/ _jsxs("div", {
        className: "space-y-10",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "space-y-2",
                        children: [
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-5 w-48"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-4 w-72"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx(Skeleton, {
                        className: "h-6 w-12 rounded-full"
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-8 max-w-2xl mx-auto",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "bg-white/50 rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col items-center space-y-4 h-56 md:order-1 justify-end",
                        children: [
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-12 w-12 rounded-full animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-5 w-24 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-4 w-12 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "bg-slate-100 w-full h-16 rounded-xl flex items-center justify-center font-bold text-slate-300 text-lg",
                                children: "2"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "bg-white rounded-2xl p-6 border-2 border-indigo-100 shadow-md flex flex-col items-center space-y-4 h-64 md:order-2 justify-end relative",
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                className: "absolute -top-5 bg-amber-100 text-amber-600 p-2 rounded-full border border-amber-200",
                                children: /*#__PURE__*/ _jsx(Skeleton, {
                                    className: "h-4 w-4 rounded-full"
                                })
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-14 w-14 rounded-full animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-5 w-28 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-4 w-16 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "bg-indigo-500/10 w-full h-20 rounded-xl flex items-center justify-center font-bold text-indigo-500 text-xl",
                                children: "1"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "bg-white/50 rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col items-center space-y-4 h-48 md:order-3 justify-end",
                        children: [
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-10 w-10 rounded-full animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-5 w-20 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-4 w-10 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "bg-slate-100 w-full h-12 rounded-xl flex items-center justify-center font-bold text-slate-300 text-base",
                                children: "3"
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden",
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        className: "p-5 border-b border-slate-100",
                        children: /*#__PURE__*/ _jsx(Skeleton, {
                            className: "h-6 w-32"
                        })
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "divide-y divide-slate-100",
                        children: Array.from({
                            length: 5
                        }).map((_, i)=>/*#__PURE__*/ _jsxs("div", {
                                className: "px-6 py-4 flex items-center justify-between",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "flex items-center gap-4",
                                        children: [
                                            /*#__PURE__*/ _jsx(Skeleton, {
                                                className: "h-5 w-6"
                                            }),
                                            /*#__PURE__*/ _jsx(Skeleton, {
                                                className: "h-9 w-9 rounded-full animate-pulse"
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "space-y-1",
                                                children: [
                                                    /*#__PURE__*/ _jsx(Skeleton, {
                                                        className: "h-4 w-28 animate-pulse"
                                                    }),
                                                    /*#__PURE__*/ _jsx(Skeleton, {
                                                        className: "h-3.5 w-16 animate-pulse"
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx(Skeleton, {
                                        className: "h-5 w-14 animate-pulse"
                                    })
                                ]
                            }, i))
                    })
                ]
            })
        ]
    });
}
export default function LeaderboardPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useRequireAuth();
    const { refreshUser } = useAuth();
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingPublic, setUpdatingPublic] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadLeaderboard = async ()=>{
        try {
            const data = await userApi.getLeaderboard(50);
            setEntries(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load leaderboard");
        } finally{
            setLoading(false);
        }
    };
    useEffect(()=>{
        if (!authLoading && user) {
            loadLeaderboard();
        }
    }, [
        authLoading,
        user
    ]);
    const handleTogglePublic = async ()=>{
        setUpdatingPublic(true);
        try {
            const isCurrentlyPublic = user?.profile_public ?? false;
            await userApi.updateProfile({
                profile_public: !isCurrentlyPublic
            });
            toast.success(!isCurrentlyPublic ? "Your profile is now public on the leaderboard!" : "Your profile is now private.");
            await refreshUser();
            // Reload rankings
            setLoading(true);
            await loadLeaderboard();
        } catch  {
            toast.error("Failed to update your privacy settings.");
        } finally{
            setUpdatingPublic(false);
        }
    };
    if (authLoading || !user) {
        return /*#__PURE__*/ _jsx(PageLoader, {
            label: "Loading leaderboard…"
        });
    }
    const myRank = entries.findIndex((e)=>e.user_id === user.id) + 1;
    const rest = entries.slice(3);
    return /*#__PURE__*/ _jsxs(DashboardShell, {
        maxWidth: "max-w-4xl",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "flex items-center gap-3",
                            children: [
                                /*#__PURE__*/ _jsx("div", {
                                    className: "w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center",
                                    children: /*#__PURE__*/ _jsx(Trophy, {
                                        className: "w-5 h-5 text-amber-500"
                                    })
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    children: [
                                        /*#__PURE__*/ _jsx("h1", {
                                            className: "text-2xl font-bold text-slate-900 tracking-tight",
                                            style: {
                                                color: "#111",
                                                letterSpacing: "-0.025em"
                                            },
                                            children: "Leaderboard"
                                        }),
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "text-xs text-slate-500 mt-0.5 font-medium",
                                            children: "Top performers across the DevMeet community"
                                        })
                                    ]
                                })
                            ]
                        })
                    }),
                    myRank > 0 && /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 shadow-sm self-start sm:self-auto",
                        children: [
                            /*#__PURE__*/ _jsx(Star, {
                                className: "w-4 h-4 text-blue-500 fill-blue-400"
                            }),
                            /*#__PURE__*/ _jsxs("span", {
                                className: "text-sm font-bold text-blue-800",
                                children: [
                                    "Your rank: ",
                                    /*#__PURE__*/ _jsxs("span", {
                                        className: "text-blue-600 font-extrabold",
                                        children: [
                                            "#",
                                            myRank
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: `flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border px-5 py-4 shadow-sm transition-all duration-200 ${user.profile_public ? "bg-emerald-50/30 border-emerald-100/60" : "bg-amber-50/30 border-amber-100/60"}`,
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-start gap-3.5",
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                className: `p-2 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${user.profile_public ? "bg-emerald-100/50 border-emerald-200/35 text-emerald-600" : "bg-amber-100/50 border-amber-200/35 text-amber-600"}`,
                                children: user.profile_public ? /*#__PURE__*/ _jsx(CheckCircle2, {
                                    className: "w-4.5 h-4.5"
                                }) : /*#__PURE__*/ _jsx(ShieldAlert, {
                                    className: "w-4.5 h-4.5"
                                })
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("h4", {
                                        className: "font-bold text-slate-900 text-sm tracking-tight",
                                        children: user.profile_public ? "Leaderboard Participation Active" : "Your profile is currently private"
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        className: "text-xs text-slate-500 mt-1 font-medium leading-normal max-w-2xl",
                                        children: user.profile_public ? "Your mock evaluation scores are visible to other logged-in users on this public leaderboard. You can opt out at any time." : "You are currently hidden from the public leaderboard. Turn on public stats to compete and compare your scores with other developers."
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("button", {
                        onClick: handleTogglePublic,
                        disabled: updatingPublic,
                        className: `px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 flex items-center gap-1.5 justify-center shadow-sm border ${user.profile_public ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-200" : "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-blue-500/10"}`,
                        children: [
                            updatingPublic && /*#__PURE__*/ _jsx(Loader2, {
                                className: "w-3.5 h-3.5 animate-spin"
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: user.profile_public ? "Make Profile Private" : "Join Leaderboard"
                            })
                        ]
                    })
                ]
            }),
            loading ? /*#__PURE__*/ _jsx(LeaderboardSkeleton, {}) : error ? /*#__PURE__*/ _jsx("div", {
                className: "rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800",
                children: error
            }) : entries.length === 0 ? /* Rich empty state container */ /*#__PURE__*/ _jsxs("div", {
                className: "rounded-3xl border border-slate-100 bg-white p-10 md:p-14 text-center shadow-lg max-w-xl mx-auto flex flex-col items-center gap-6 relative overflow-hidden my-6",
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        className: "absolute inset-0 bg-gradient-to-tr from-amber-500/5 via-transparent to-indigo-500/5 pointer-events-none -z-10"
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-sm animate-pulse",
                        children: /*#__PURE__*/ _jsx(Trophy, {
                            className: "w-8 h-8"
                        })
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("h2", {
                                className: "font-extrabold text-slate-900 text-lg tracking-tight",
                                children: "No public profiles yet"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "text-slate-500 text-sm mt-1.5 max-w-md mx-auto leading-relaxed font-medium",
                                children: !user.profile_public ? "Be the first to opt in, complete a mock interview, and claim the top spot on the community leaderboard!" : "You have enabled public stats, but haven't completed an interview yet. Complete your first session to claim the top spot!"
                            })
                        ]
                    }),
                    !user.profile_public ? /*#__PURE__*/ _jsx("button", {
                        onClick: handleTogglePublic,
                        disabled: updatingPublic,
                        className: "btn-primary flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 hover:shadow-lg transition-all active:scale-95 border-none outline-none cursor-pointer",
                        children: updatingPublic ? /*#__PURE__*/ _jsxs(_Fragment, {
                            children: [
                                /*#__PURE__*/ _jsx(Loader2, {
                                    className: "w-4 h-4 animate-spin"
                                }),
                                "Updating..."
                            ]
                        }) : /*#__PURE__*/ _jsxs(_Fragment, {
                            children: [
                                /*#__PURE__*/ _jsx(CheckCircle2, {
                                    className: "w-4 h-4"
                                }),
                                "Opt In to Leaderboard"
                            ]
                        })
                    }) : /*#__PURE__*/ _jsxs("button", {
                        onClick: ()=>router.push("/dashboard/create-session"),
                        className: "btn-primary flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 hover:shadow-lg transition-all active:scale-95 border-none outline-none cursor-pointer",
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                children: "Start First Session"
                            }),
                            /*#__PURE__*/ _jsx(ArrowRight, {
                                className: "w-4 h-4"
                            })
                        ]
                    })
                ]
            }) : /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        className: "bg-white border border-slate-100 hover:border-slate-200/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden",
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "flex items-end justify-center gap-4 pt-6",
                            children: [
                                entries[1] && /*#__PURE__*/ _jsx(PodiumCard, {
                                    entry: entries[1],
                                    rank: 2,
                                    isMe: entries[1].user_id === user.id
                                }),
                                entries[0] && /*#__PURE__*/ _jsx(PodiumCard, {
                                    entry: entries[0],
                                    rank: 1,
                                    isMe: entries[0].user_id === user.id
                                }),
                                entries[2] && /*#__PURE__*/ _jsx(PodiumCard, {
                                    entry: entries[2],
                                    rank: 3,
                                    isMe: entries[2].user_id === user.id
                                })
                            ]
                        })
                    }),
                    rest.length > 0 && /*#__PURE__*/ _jsxs("div", {
                        className: "bg-white border border-slate-100 hover:border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200",
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                className: "px-5 py-3 border-b border-slate-100 flex items-center justify-between",
                                children: /*#__PURE__*/ _jsxs("div", {
                                    className: "flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide",
                                    children: [
                                        /*#__PURE__*/ _jsx(TrendingUp, {
                                            className: "w-3.5 h-3.5 text-slate-400"
                                        }),
                                        "Rankings 4–",
                                        entries.length
                                    ]
                                })
                            }),
                            /*#__PURE__*/ _jsx("ul", {
                                className: "divide-y divide-slate-100",
                                children: rest.map((entry, idx)=>{
                                    const rank = idx + 4;
                                    const isMe = entry.user_id === user.id;
                                    return /*#__PURE__*/ _jsxs("li", {
                                        className: `flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/60 ${isMe ? "bg-blue-50/40" : ""}`,
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "w-8 text-center text-sm font-bold text-slate-400",
                                                children: rank
                                            }),
                                            /*#__PURE__*/ _jsx(Avatar, {
                                                className: "h-9 w-9 shrink-0",
                                                children: /*#__PURE__*/ _jsx(AvatarFallback, {
                                                    className: "text-sm font-bold bg-slate-100 text-slate-655",
                                                    children: getInitials(entry.display_name)
                                                })
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "flex-1 min-w-0",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("p", {
                                                        className: "font-semibold text-slate-900 truncate text-sm",
                                                        children: [
                                                            entry.display_name,
                                                            isMe && /*#__PURE__*/ _jsx("span", {
                                                                className: "ml-2 text-[9px] uppercase font-extrabold text-blue-650 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full",
                                                                children: "You"
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("p", {
                                                        className: "text-xs text-slate-400 mt-0.5 font-medium",
                                                        children: [
                                                            entry.sessions_count,
                                                            " sessions completed"
                                                        ]
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "text-right shrink-0",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("p", {
                                                        className: "text-base font-extrabold text-slate-900",
                                                        children: [
                                                            entry.avg_score,
                                                            "%"
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsx("p", {
                                                        className: "text-[10px] text-slate-400 uppercase font-bold tracking-wide",
                                                        children: "avg score"
                                                    })
                                                ]
                                            })
                                        ]
                                    }, entry.user_id);
                                })
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
