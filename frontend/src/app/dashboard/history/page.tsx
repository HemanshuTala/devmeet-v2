'use client';

/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { History, ChevronLeft, Search, Filter, Clock, Calendar, AlertCircle, ExternalLink } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSessions } from "@/hooks/queries/useSessions";
import DashboardShell from "@/components/layout/DashboardShell";
import { PageLoader } from "@/components/feedback/PageLoader";
import SessionBadge from "@/components/SessionBadge";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
function formatDate(dateStr) {
    try {
        return new Date(dateStr).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch  {
        return "—";
    }
}
function formatDuration(minutes) {
    if (!minutes) return "—";
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
// ─── History Skeleton ──────────────────────────────────────────────────────────
function HistorySkeleton() {
    return /*#__PURE__*/ _jsxs("div", {
        className: "space-y-6",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center gap-4",
                children: [
                    /*#__PURE__*/ _jsx(Skeleton, {
                        className: "h-5 w-32"
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "h-4 w-px bg-slate-200"
                    }),
                    /*#__PURE__*/ _jsx(Skeleton, {
                        className: "h-8 w-48"
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "grid grid-cols-1 sm:grid-cols-4 gap-4",
                        children: [
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-10 w-full"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-10 w-full"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-10 w-full"
                            }),
                            /*#__PURE__*/ _jsx(Skeleton, {
                                className: "h-10 w-full"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "space-y-4",
                        children: Array.from({
                            length: 5
                        }).map((_, i)=>/*#__PURE__*/ _jsxs("div", {
                                className: "flex items-center justify-between p-4 border border-slate-100 rounded-xl",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "flex items-center gap-4",
                                        children: [
                                            /*#__PURE__*/ _jsx(Skeleton, {
                                                className: "h-10 w-10 rounded-xl animate-pulse"
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "space-y-2",
                                                children: [
                                                    /*#__PURE__*/ _jsx(Skeleton, {
                                                        className: "h-5 w-48 animate-pulse"
                                                    }),
                                                    /*#__PURE__*/ _jsx(Skeleton, {
                                                        className: "h-4 w-32 animate-pulse"
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx(Skeleton, {
                                        className: "h-8 w-24 rounded-lg animate-pulse"
                                    })
                                ]
                            }, i))
                    })
                ]
            })
        ]
    });
}
export default function HistoryPage() {
    const router = useRouter();
    const { isLoading: authLoading } = useRequireAuth();
    const { data: sessions = [], isLoading: loading, error, refetch } = useSessions();
    // Filters
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [difficultyFilter, setDifficultyFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState<Date | undefined>();
    const [dateTo, setDateTo] = useState<Date | undefined>();
    const filteredSessions = useMemo(()=>{
        return sessions.filter((session)=>{
            const matchesQuery = !query || session.target_company?.toLowerCase().includes(query.toLowerCase()) || session.focus_area?.toLowerCase().includes(query.toLowerCase());
            const matchesType = typeFilter === "all" || session.interview_type === typeFilter;
            const matchesDifficulty = difficultyFilter === "all" || session.difficulty === difficultyFilter;
            const matchesStatus = statusFilter === "all" || session.status === statusFilter;
            const sessionDate = new Date(session.created_at);
            const fromStart = dateFrom ? new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 0, 0, 0, 0) : null;
            const toEnd = dateTo ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999) : null;
            const matchesFrom = !fromStart || sessionDate >= fromStart;
            const matchesTo = !toEnd || sessionDate <= toEnd;
            return matchesQuery && matchesType && matchesDifficulty && matchesStatus && matchesFrom && matchesTo;
        });
    }, [
        sessions,
        query,
        typeFilter,
        difficultyFilter,
        statusFilter,
        dateFrom,
        dateTo
    ]);
    if (authLoading) {
        return /*#__PURE__*/ _jsx(DashboardShell, {
            maxWidth: "max-w-6xl",
            children: /*#__PURE__*/ _jsx(HistorySkeleton, {})
        });
    }
    return /*#__PURE__*/ _jsx(DashboardShell, {
        maxWidth: "max-w-6xl",
        children: loading ? /*#__PURE__*/ _jsx(HistorySkeleton, {}) : /*#__PURE__*/ _jsxs("div", {
            className: "space-y-6",
            children: [
                /*#__PURE__*/ _jsxs("div", {
                    className: "flex items-center gap-4 animate-fade-in-up",
                    children: [
                        /*#__PURE__*/ _jsxs(Link, {
                            href: "/dashboard",
                            className: "flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors group font-semibold",
                            children: [
                                /*#__PURE__*/ _jsx(ChevronLeft, {
                                    className: "h-4 w-4 transition-transform group-hover:-translate-x-0.5"
                                }),
                                "Back to Dashboard"
                            ]
                        }),
                        /*#__PURE__*/ _jsx("div", {
                            className: "h-4 w-px bg-slate-300"
                        }),
                        /*#__PURE__*/ _jsxs("h1", {
                            className: "gradient-text text-xl font-bold flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ _jsx(History, {
                                    className: "w-4 h-4 text-blue-600"
                                }),
                                "Session History"
                            ]
                        })
                    ]
                }),
                /*#__PURE__*/ _jsxs("div", {
                    className: "glass-card bg-white border-blue-50 p-5 space-y-4 animate-fade-in-up",
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            className: "flex items-center gap-2 text-sm font-semibold text-slate-600",
                            children: [
                                /*#__PURE__*/ _jsx(Filter, {
                                    className: "w-4 h-4 text-blue-500"
                                }),
                                "Filter sessions"
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "relative lg:col-span-1",
                                    children: [
                                        /*#__PURE__*/ _jsx(Search, {
                                            className: "w-4 h-4 text-slate-400 absolute left-3 top-3.5 z-10"
                                        }),
                                        /*#__PURE__*/ _jsx("input", {
                                            type: "text",
                                            placeholder: "Search company or topic...",
                                            value: query,
                                            onChange: (e)=>setQuery(e.target.value),
                                            className: "input-field w-full pl-9"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs(Select, {
                                    value: typeFilter,
                                    onValueChange: setTypeFilter,
                                    children: [
                                        /*#__PURE__*/ _jsx(SelectTrigger, {
                                            children: /*#__PURE__*/ _jsx(SelectValue, {
                                                placeholder: "Interview type"
                                            })
                                        }),
                                        /*#__PURE__*/ _jsxs(SelectContent, {
                                            children: [
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "all",
                                                    children: "All Types"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "dsa",
                                                    children: "DSA"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "behavioral",
                                                    children: "Behavioral"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "system_design",
                                                    children: "System Design"
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs(Select, {
                                    value: difficultyFilter,
                                    onValueChange: setDifficultyFilter,
                                    children: [
                                        /*#__PURE__*/ _jsx(SelectTrigger, {
                                            children: /*#__PURE__*/ _jsx(SelectValue, {
                                                placeholder: "Difficulty"
                                            })
                                        }),
                                        /*#__PURE__*/ _jsxs(SelectContent, {
                                            children: [
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "all",
                                                    children: "All Difficulties"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "easy",
                                                    children: "Easy"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "medium",
                                                    children: "Medium"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "hard",
                                                    children: "Hard"
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs(Select, {
                                    value: statusFilter,
                                    onValueChange: setStatusFilter,
                                    children: [
                                        /*#__PURE__*/ _jsx(SelectTrigger, {
                                            children: /*#__PURE__*/ _jsx(SelectValue, {
                                                placeholder: "Status"
                                            })
                                        }),
                                        /*#__PURE__*/ _jsxs(SelectContent, {
                                            children: [
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "all",
                                                    children: "All Statuses"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "created",
                                                    children: "Created"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "in_progress",
                                                    children: "In Progress"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "completed",
                                                    children: "Completed"
                                                }),
                                                /*#__PURE__*/ _jsx(SelectItem, {
                                                    value: "cancelled",
                                                    children: "Cancelled"
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsx(DatePicker, {
                                    value: dateFrom,
                                    onChange: setDateFrom,
                                    placeholder: "From date"
                                }),
                                /*#__PURE__*/ _jsx(DatePicker, {
                                    value: dateTo,
                                    onChange: setDateTo,
                                    placeholder: "To date"
                                })
                            ]
                        }),
                        (dateFrom || dateTo || query || typeFilter !== "all" || difficultyFilter !== "all" || statusFilter !== "all") && /*#__PURE__*/ _jsxs("div", {
                            className: "flex items-center justify-between pt-1",
                            children: [
                                /*#__PURE__*/ _jsxs("p", {
                                    className: "text-xs text-slate-500 font-medium",
                                    children: [
                                        filteredSessions.length,
                                        " session",
                                        filteredSessions.length !== 1 ? "s" : "",
                                        " found"
                                    ]
                                }),
                                /*#__PURE__*/ _jsx(Button, {
                                    variant: "ghost",
                                    size: "sm",
                                    className: "text-xs text-slate-500",
                                    onClick: ()=>{
                                        setQuery("");
                                        setTypeFilter("all");
                                        setDifficultyFilter("all");
                                        setStatusFilter("all");
                                        setDateFrom(undefined);
                                        setDateTo(undefined);
                                    },
                                    children: "Clear filters"
                                })
                            ]
                        })
                    ]
                }),
                /*#__PURE__*/ _jsx("div", {
                    className: "bg-white border border-slate-100 overflow-hidden shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl animate-fade-in-up delay-100",
                    children: error ? /*#__PURE__*/ _jsxs("div", {
                        className: "flex flex-col items-center justify-center py-16 px-4 text-center",
                        children: [
                            /*#__PURE__*/ _jsx(AlertCircle, {
                                className: "w-12 h-12 text-rose-500 mb-3 animate-pulse"
                            }),
                            /*#__PURE__*/ _jsx("h3", {
                                className: "text-slate-900 font-bold text-lg mb-1",
                                children: "Failed to load history"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "text-slate-500 text-sm max-w-sm mb-6",
                                children: error?.message ?? "Failed to load sessions"
                            }),
                            /*#__PURE__*/ _jsx(Button, {
                                variant: "gradient",
                                onClick: ()=>refetch(),
                                children: "Retry"
                            })
                        ]
                    }) : filteredSessions.length === 0 ? /*#__PURE__*/ _jsxs("div", {
                        className: "flex flex-col items-center justify-center py-16 px-4 text-center",
                        children: [
                            /*#__PURE__*/ _jsx(History, {
                                className: "w-16 h-16 text-slate-200 mb-4"
                            }),
                            /*#__PURE__*/ _jsx("h3", {
                                className: "text-slate-950 font-bold text-lg mb-1",
                                children: "No sessions match filters"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "text-slate-550 text-sm max-w-md",
                                children: "Try loosening your filters or search constraints to inspect your practice history."
                            })
                        ]
                    }) : /*#__PURE__*/ _jsxs(ScrollArea, {
                        className: "max-h-[calc(100vh-22rem)]",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "hidden md:grid grid-cols-[1.5fr_1fr_1fr_1.5fr_1fr_1.5fr_1fr] gap-4 px-6 py-4 border-b border-blue-50 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 bg-white z-10",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "Mode"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "Difficulty"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "Status"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "Company / Focus Area"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "Duration"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        children: "Date & Time"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "text-right",
                                        children: "Link"
                                    })
                                ]
                            }),
                            filteredSessions.map((session, idx)=>/*#__PURE__*/ _jsxs("div", {
                                    className: `px-6 py-4 hover:bg-slate-50/50 transition-all ${idx < filteredSessions.length - 1 ? "border-b border-blue-50" : ""}`,
                                    children: [
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "hidden md:grid grid-cols-[1.5fr_1fr_1fr_1.5fr_1fr_1.5fr_1fr] gap-4 items-center",
                                            children: [
                                                /*#__PURE__*/ _jsx("div", {
                                                    children: /*#__PURE__*/ _jsx(SessionBadge, {
                                                        variant: "type",
                                                        value: session.interview_type
                                                    })
                                                }),
                                                /*#__PURE__*/ _jsx("div", {
                                                    children: /*#__PURE__*/ _jsx(SessionBadge, {
                                                        variant: "difficulty",
                                                        value: session.difficulty
                                                    })
                                                }),
                                                /*#__PURE__*/ _jsx("div", {
                                                    children: /*#__PURE__*/ _jsx(SessionBadge, {
                                                        variant: "status",
                                                        value: session.status
                                                    })
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "min-w-0",
                                                    children: [
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "text-slate-800 text-sm font-bold truncate",
                                                            children: session.target_company ?? "General Practice"
                                                        }),
                                                        session.focus_area && /*#__PURE__*/ _jsx("p", {
                                                            className: "text-slate-500 text-[10px] uppercase font-bold mt-0.5 truncate",
                                                            children: session.focus_area
                                                        })
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center gap-1 text-slate-550 text-sm font-semibold",
                                                    children: [
                                                        /*#__PURE__*/ _jsx(Clock, {
                                                            className: "w-3.5 h-3.5 text-slate-400"
                                                        }),
                                                        formatDuration(session.duration_minutes)
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center gap-1 text-slate-550 text-sm font-semibold",
                                                    children: [
                                                        /*#__PURE__*/ _jsx(Calendar, {
                                                            className: "w-3.5 h-3.5 text-slate-400"
                                                        }),
                                                        formatDate(session.created_at)
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx("div", {
                                                    className: "text-right",
                                                    children: session.status === "completed" ? /*#__PURE__*/ _jsxs(_Fragment, {
                                                        children: [
                                                            /*#__PURE__*/ _jsxs(Link, {
                                                                href: `/interview/${session.id}/feedback`,
                                                                className: "text-blue-600 hover:text-blue-800 text-xs font-bold inline-flex items-center gap-1",
                                                                children: [
                                                                    "Feedback ",
                                                                    /*#__PURE__*/ _jsx(ExternalLink, {
                                                                        className: "w-3 h-3"
                                                                    })
                                                                ]
                                                            }),
                                                            /*#__PURE__*/ _jsx(Link, {
                                                                href: `/interview/${session.id}/replay`,
                                                                className: "block mt-1 text-slate-500 hover:text-slate-700 text-xs font-semibold",
                                                                children: "Replay"
                                                            })
                                                        ]
                                                    }) : session.status === "in_progress" || session.status === "created" ? /*#__PURE__*/ _jsxs(Link, {
                                                        href: `/interview/${session.id}`,
                                                        className: "text-emerald-600 hover:text-emerald-800 text-xs font-bold inline-flex items-center gap-1",
                                                        children: [
                                                            "Resume ",
                                                            /*#__PURE__*/ _jsx(ExternalLink, {
                                                                className: "w-3 h-3"
                                                            })
                                                        ]
                                                    }) : /*#__PURE__*/ _jsx("span", {
                                                        className: "text-slate-400 text-xs font-semibold",
                                                        children: "—"
                                                    })
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "md:hidden space-y-2.5",
                                            children: [
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex justify-between items-center",
                                                    children: [
                                                        /*#__PURE__*/ _jsxs("div", {
                                                            className: "flex flex-wrap items-center gap-1.5",
                                                            children: [
                                                                /*#__PURE__*/ _jsx(SessionBadge, {
                                                                    variant: "type",
                                                                    value: session.interview_type
                                                                }),
                                                                /*#__PURE__*/ _jsx(SessionBadge, {
                                                                    variant: "difficulty",
                                                                    value: session.difficulty
                                                                })
                                                            ]
                                                        }),
                                                        /*#__PURE__*/ _jsx(SessionBadge, {
                                                            variant: "status",
                                                            value: session.status
                                                        })
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-start justify-between gap-4",
                                                    children: [
                                                        /*#__PURE__*/ _jsxs("div", {
                                                            children: [
                                                                /*#__PURE__*/ _jsx("p", {
                                                                    className: "text-slate-800 text-sm font-bold",
                                                                    children: session.target_company ?? "General Practice"
                                                                }),
                                                                session.focus_area && /*#__PURE__*/ _jsx("p", {
                                                                    className: "text-slate-500 text-[10px] uppercase font-bold mt-0.5",
                                                                    children: session.focus_area
                                                                })
                                                            ]
                                                        }),
                                                        /*#__PURE__*/ _jsx("div", {
                                                            children: session.status === "completed" ? /*#__PURE__*/ _jsx(Link, {
                                                                href: `/interview/${session.id}/feedback`,
                                                                className: "text-blue-600 hover:text-blue-800 text-xs font-bold",
                                                                children: "Feedback"
                                                            }) : session.status === "in_progress" || session.status === "created" ? /*#__PURE__*/ _jsx(Link, {
                                                                href: `/interview/${session.id}`,
                                                                className: "text-emerald-600 hover:text-emerald-800 text-xs font-bold",
                                                                children: "Resume"
                                                            }) : null
                                                        })
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center gap-4 text-xs text-slate-500 font-medium pt-1",
                                                    children: [
                                                        /*#__PURE__*/ _jsxs("span", {
                                                            className: "flex items-center gap-1",
                                                            children: [
                                                                /*#__PURE__*/ _jsx(Clock, {
                                                                    className: "w-3.5 h-3.5 text-slate-400"
                                                                }),
                                                                formatDuration(session.duration_minutes)
                                                            ]
                                                        }),
                                                        /*#__PURE__*/ _jsxs("span", {
                                                            className: "flex items-center gap-1",
                                                            children: [
                                                                /*#__PURE__*/ _jsx(Calendar, {
                                                                    className: "w-3.5 h-3.5 text-slate-400"
                                                                }),
                                                                formatDate(session.created_at)
                                                            ]
                                                        })
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                }, session.id))
                        ]
                    })
                })
            ]
        })
    });
}
