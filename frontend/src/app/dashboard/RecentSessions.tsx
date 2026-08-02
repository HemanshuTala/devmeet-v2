'use client';

import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, History, Clock, Calendar, Plus, Building2, Download, X, List, Kanban, Play, Sparkles, Target } from "lucide-react";
import { sessionApi } from "@/lib/api";
import SessionBadge from "@/components/SessionBadge";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { toast } from "sonner";
function formatDate(dateStr) {
    try {
        return new Date(dateStr).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
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
function SkeletonRow() {
    return /*#__PURE__*/ _jsxs("div", {
        className: "flex items-center gap-4 p-4 border-b border-blue-50 animate-pulse",
        children: [
            /*#__PURE__*/ _jsx("div", {
                className: "h-5 bg-slate-200 rounded w-24"
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "h-5 bg-slate-200 rounded w-16"
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "h-5 bg-slate-200 rounded w-16"
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "h-5 bg-slate-105 rounded flex-1"
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "h-5 bg-slate-200 rounded w-12"
            })
        ]
    });
}
function exportToCSV(sessions) {
    const headers = [
        "ID",
        "Type",
        "Difficulty",
        "Status",
        "Company",
        "Focus Area",
        "Duration (min)",
        "Created At"
    ];
    const rows = sessions.map((s)=>[
            s.id,
            s.interview_type,
            s.difficulty,
            s.status,
            s.target_company ?? "",
            s.focus_area ?? "",
            String(s.duration_minutes ?? ""),
            s.created_at
        ]);
    const csvContent = [
        headers,
        ...rows
    ].map((row)=>row.map((cell)=>`"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([
        csvContent
    ], {
        type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `devmeet_sessions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
export default function RecentSessions({ sessionsLoading, sessionsError, recentSessions, allSessions, totalSessions, fetchSessions, isPro = false }) {
    const [companyFilter, setCompanyFilter] = useState("");
    const [viewMode, setViewMode] = useState("list");
    const [localSessions, setLocalSessions] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);
    useEffect(()=>{
        setMounted(true);
    }, []);
    useEffect(()=>{
        setLocalSessions(allSessions);
    }, [
        allSessions
    ]);
    // Unique companies for filters
    const companies = useMemo(()=>{
        const set = new Set();
        allSessions.forEach((s)=>{
            if (s.target_company) set.add(s.target_company);
        });
        return Array.from(set).sort();
    }, [
        allSessions
    ]);
    // Filter for List View (Recent 5 only)
    const filteredListSessions = useMemo(()=>{
        const recent = [
            ...localSessions
        ].sort((a, b)=>new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
        if (!companyFilter) return recent;
        return recent.filter((s)=>s.target_company === companyFilter);
    }, [
        localSessions,
        companyFilter
    ]);
    // Filter for Kanban Board (All sessions for complete board visual)
    const filteredAllSessions = useMemo(()=>{
        if (!companyFilter) return localSessions;
        return localSessions.filter((s)=>s.target_company === companyFilter);
    }, [
        localSessions,
        companyFilter
    ]);
    // Drag and Drop End handler
    const handleDragEnd = async (result)=>{
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) {
            return;
        }
        const sessionId = draggableId;
        const newStatus = destination.droppableId;
        const targetSession = localSessions.find((s)=>s.id === sessionId);
        if (!targetSession) return;
        const oldStatus = targetSession.status;
        // Optimistic UI Update
        setLocalSessions((prev)=>prev.map((s)=>s.id === sessionId ? {
                    ...s,
                    status: newStatus
                } : s));
        try {
            if (newStatus === "completed") {
                await sessionApi.complete(sessionId);
                toast.success("Session marked as completed!");
            } else if (newStatus === "cancelled") {
                await sessionApi.cancel(sessionId);
                toast.success("Session moved to cancelled!");
            } else if (newStatus === "in_progress") {
                await sessionApi.resume(sessionId);
                toast.success("Session resumed!");
            } else if (newStatus === "created") {
                await sessionApi.pause(sessionId);
                toast.success("Session paused/drafted!");
            }
            fetchSessions();
        } catch (err) {
            // Rollback
            setLocalSessions((prev)=>prev.map((s)=>s.id === sessionId ? {
                        ...s,
                        status: oldStatus
                    } : s));
            toast.error(`Failed to change session status: ${err.message || "Server error"}`);
        }
    };
    const kanbanColumns = [
        {
            id: "created",
            title: "Planned",
            borderClass: "border-blue-200",
            bgClass: "bg-blue-50/15",
            textClass: "text-blue-700"
        },
        {
            id: "in_progress",
            title: "In Progress",
            borderClass: "border-amber-250",
            bgClass: "bg-amber-50/15",
            textClass: "text-amber-700"
        },
        {
            id: "completed",
            title: "Completed",
            borderClass: "border-green-200",
            bgClass: "bg-green-50/15",
            textClass: "text-green-700"
        },
        {
            id: "cancelled",
            title: "Cancelled",
            borderClass: "border-red-200",
            bgClass: "bg-red-50/15",
            textClass: "text-red-700"
        }
    ];
    return /*#__PURE__*/ _jsxs("section", {
        className: "animate-fade-in-up delay-400",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center justify-between mb-5 flex-wrap gap-4",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("h2", {
                                className: "text-xl font-extrabold text-slate-900 tracking-tight",
                                children: "Interview Sessions"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "text-slate-500 text-xs mt-0.5 font-semibold",
                                children: viewMode === "list" ? "Your last 5 interview sessions" : "Manage your interview lifecycle via drag & drop"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-3 flex-wrap",
                        children: [
                            companies.length > 0 && /*#__PURE__*/ _jsxs("div", {
                                className: "flex items-center gap-1.5 flex-wrap",
                                children: [
                                    /*#__PURE__*/ _jsx(Building2, {
                                        className: "w-3.5 h-3.5 text-slate-400 shrink-0"
                                    }),
                                    companyFilter ? /*#__PURE__*/ _jsxs("button", {
                                        onClick: ()=>setCompanyFilter(""),
                                        className: "flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-105 text-blue-700 text-xs font-bold hover:bg-blue-200 transition-colors",
                                        children: [
                                            companyFilter,
                                            /*#__PURE__*/ _jsx(X, {
                                                className: "w-3.5 h-3.5"
                                            })
                                        ]
                                    }) : companies.slice(0, 3).map((c)=>/*#__PURE__*/ _jsx("button", {
                                            onClick: ()=>setCompanyFilter(c),
                                            className: "px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold hover:bg-blue-100 hover:text-blue-700 transition-colors border border-slate-200/50",
                                            children: c
                                        }, c)),
                                    !companyFilter && companies.length > 3 && /*#__PURE__*/ _jsxs("span", {
                                        className: "text-[10px] text-slate-400 font-bold",
                                        children: [
                                            "+",
                                            companies.length - 3,
                                            " more"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200/55 shadow-inner",
                                children: [
                                    /*#__PURE__*/ _jsxs("button", {
                                        onClick: ()=>setViewMode("list"),
                                        className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`,
                                        children: [
                                            /*#__PURE__*/ _jsx(List, {
                                                className: "w-3.5 h-3.5"
                                            }),
                                            "List"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("button", {
                                        onClick: ()=>setViewMode("kanban"),
                                        className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === "kanban" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`,
                                        children: [
                                            /*#__PURE__*/ _jsx(Kanban, {
                                                className: "w-3.5 h-3.5"
                                            }),
                                            "Kanban Board"
                                        ]
                                    })
                                ]
                            }),
                            isPro ? /*#__PURE__*/ _jsxs("button", {
                                onClick: ()=>exportToCSV(allSessions),
                                disabled: allSessions.length === 0,
                                className: "flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 text-xs font-bold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed",
                                title: "Export all sessions as CSV",
                                id: "export-csv-btn",
                                children: [
                                    /*#__PURE__*/ _jsx(Download, {
                                        className: "w-3.5 h-3.5"
                                    }),
                                    "Export CSV"
                                ]
                            }) : /*#__PURE__*/ _jsxs(Link, {
                                href: "/billing",
                                className: "flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100 border border-amber-200 text-amber-700 text-xs font-bold transition-all shadow-sm",
                                title: "Upgrade to Pro for CSV export",
                                children: [
                                    /*#__PURE__*/ _jsx(Download, {
                                        className: "w-3.5 h-3.5"
                                    }),
                                    "Export CSV",
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "px-1.5 py-0.5 bg-amber-200/60 rounded text-[9px] font-extrabold uppercase tracking-wider",
                                        children: "PRO"
                                    })
                                ]
                            }),
                            totalSessions > 5 && viewMode === "list" && /*#__PURE__*/ _jsxs(Link, {
                                href: "/dashboard/history",
                                className: "btn-ghost flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all border border-slate-200",
                                children: [
                                    /*#__PURE__*/ _jsx(History, {
                                        className: "w-3.5 h-3.5"
                                    }),
                                    "View All"
                                ]
                            })
                        ]
                    })
                ]
            }),
            viewMode === "list" && /*#__PURE__*/ _jsx("div", {
                className: "bg-white border border-slate-100 overflow-hidden shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl",
                children: sessionsLoading ? /*#__PURE__*/ _jsxs("div", {
                    children: [
                        /*#__PURE__*/ _jsx(SkeletonRow, {}),
                        /*#__PURE__*/ _jsx(SkeletonRow, {}),
                        /*#__PURE__*/ _jsx(SkeletonRow, {})
                    ]
                }) : sessionsError ? /*#__PURE__*/ _jsxs("div", {
                    className: "flex flex-col items-center justify-center py-12 px-4 text-center",
                    children: [
                        /*#__PURE__*/ _jsx(AlertCircle, {
                            className: "w-10 h-10 text-red-500 mb-3"
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            className: "text-red-650 font-bold mb-1",
                            children: "Failed to load sessions"
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            className: "text-slate-500 text-sm mb-4",
                            children: sessionsError
                        }),
                        /*#__PURE__*/ _jsxs("button", {
                            onClick: fetchSessions,
                            className: "btn-ghost text-sm flex items-center gap-1.5 hover:bg-slate-100",
                            children: [
                                /*#__PURE__*/ _jsx(Loader2, {
                                    className: "w-4 h-4 animate-spin"
                                }),
                                "Retry"
                            ]
                        })
                    ]
                }) : filteredListSessions.length === 0 ? /*#__PURE__*/ _jsxs("div", {
                    className: "flex flex-col items-center justify-center py-16 px-4 text-center",
                    children: [
                        /*#__PURE__*/ _jsx("div", {
                            className: "w-20 h-20 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center mb-6",
                            children: /*#__PURE__*/ _jsx(Clock, {
                                className: "w-8 h-8 text-blue-600"
                            })
                        }),
                        companyFilter ? /*#__PURE__*/ _jsxs(_Fragment, {
                            children: [
                                /*#__PURE__*/ _jsxs("h3", {
                                    className: "text-slate-900 font-bold text-lg mb-2",
                                    children: [
                                        'No sessions for "',
                                        companyFilter,
                                        '"'
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("button", {
                                    onClick: ()=>setCompanyFilter(""),
                                    className: "btn-ghost text-sm mt-2",
                                    children: "Clear filter"
                                })
                            ]
                        }) : /*#__PURE__*/ _jsxs(_Fragment, {
                            children: [
                                /*#__PURE__*/ _jsx("h3", {
                                    className: "text-slate-900 font-bold text-lg mb-2",
                                    children: "No sessions yet"
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    className: "text-slate-500 text-xs max-w-sm mb-6 font-semibold",
                                    children: "Start your first mock interview session to track your progress and improve your skills."
                                }),
                                /*#__PURE__*/ _jsxs(Link, {
                                    href: "/dashboard/create-session",
                                    className: "btn-primary flex items-center gap-2 px-5 py-2",
                                    children: [
                                        /*#__PURE__*/ _jsx(Plus, {
                                            className: "w-4 h-4"
                                        }),
                                        "Start First Interview"
                                    ]
                                })
                            ]
                        })
                    ]
                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            className: "hidden md:grid grid-cols-[2.5fr_1fr_1fr_1.2fr_1fr_1.2fr_1fr] gap-4 px-5 py-3.5 border-b border-blue-50 text-slate-500 text-xs font-extrabold uppercase tracking-wider",
                            children: [
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Type"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Difficulty"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Status"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Company"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Duration"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Date"
                                }),
                                /*#__PURE__*/ _jsx("span", {
                                    className: "text-right",
                                    children: "Action"
                                })
                            ]
                        }),
                        filteredListSessions.map((session, idx)=>/*#__PURE__*/ _jsxs("div", {
                                className: `
                    group px-5 py-4 transition-colors duration-150 hover:bg-slate-50/50
                    ${idx < filteredListSessions.length - 1 ? "border-b border-blue-50" : ""}
                  `,
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "hidden md:grid grid-cols-[2.5fr_1fr_1fr_1.2fr_1fr_1.2fr_1fr] gap-4 items-center",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "flex flex-col items-start gap-1",
                                                children: [
                                                    /*#__PURE__*/ _jsx(SessionBadge, {
                                                        variant: "type",
                                                        value: session.interview_type
                                                    }),
                                                    session.focus_area && /*#__PURE__*/ _jsx("span", {
                                                        className: "text-slate-400 text-xs truncate max-w-[180px] font-semibold tracking-wide",
                                                        title: session.focus_area,
                                                        children: session.focus_area
                                                    })
                                                ]
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
                                            /*#__PURE__*/ _jsx("div", {
                                                children: /*#__PURE__*/ _jsx("button", {
                                                    onClick: ()=>setCompanyFilter(session.target_company ?? ""),
                                                    className: `text-left text-slate-650 text-sm truncate font-bold hover:text-blue-600 transition-colors ${session.target_company ? "cursor-pointer" : "cursor-default"}`,
                                                    disabled: !session.target_company,
                                                    children: session.target_company ?? "—"
                                                })
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "flex items-center gap-1 text-slate-500 text-sm font-semibold",
                                                children: [
                                                    /*#__PURE__*/ _jsx(Clock, {
                                                        className: "w-3.5 h-3.5 text-slate-400"
                                                    }),
                                                    formatDuration(session.duration_minutes)
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "flex items-center gap-1 text-slate-500 text-sm font-semibold",
                                                children: [
                                                    /*#__PURE__*/ _jsx(Calendar, {
                                                        className: "w-3.5 h-3.5 text-slate-400"
                                                    }),
                                                    formatDate(session.created_at)
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("div", {
                                                className: "text-right",
                                                children: session.status === "completed" ? /*#__PURE__*/ _jsx(Link, {
                                                    href: `/interview/${session.id}/feedback`,
                                                    className: "inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 text-xs font-bold transition-all shadow-sm shadow-blue-500/5",
                                                    children: "View Report"
                                                }) : session.status === "in_progress" || session.status === "created" || session.status === "paused" ? /*#__PURE__*/ _jsx(Link, {
                                                    href: `/interview/${session.id}`,
                                                    className: "inline-flex items-center justify-center px-3.5 py-1.5 rounded-xl border border-emerald-200 text-emerald-600 bg-white hover:bg-emerald-50 text-xs font-bold transition-all shadow-sm animate-pulse",
                                                    children: "Continue"
                                                }) : /*#__PURE__*/ _jsx("span", {
                                                    className: "text-slate-400 text-xs font-bold",
                                                    children: "—"
                                                })
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "md:hidden space-y-3",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "flex items-center justify-between gap-2",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "flex items-center gap-2 flex-wrap",
                                                        children: [
                                                            /*#__PURE__*/ _jsx(SessionBadge, {
                                                                variant: "type",
                                                                value: session.interview_type
                                                            }),
                                                            /*#__PURE__*/ _jsx(SessionBadge, {
                                                                variant: "difficulty",
                                                                value: session.difficulty
                                                            }),
                                                            /*#__PURE__*/ _jsx(SessionBadge, {
                                                                variant: "status",
                                                                value: session.status
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsx("div", {
                                                        children: session.status === "completed" ? /*#__PURE__*/ _jsx(Link, {
                                                            href: `/interview/${session.id}/feedback`,
                                                            className: "text-blue-600 text-xs font-bold",
                                                            children: "Report →"
                                                        }) : session.status === "in_progress" || session.status === "created" || session.status === "paused" ? /*#__PURE__*/ _jsx(Link, {
                                                            href: `/interview/${session.id}`,
                                                            className: "text-green-600 text-xs font-bold",
                                                            children: "Resume →"
                                                        }) : null
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "flex items-center gap-4 text-slate-500 text-xs font-semibold",
                                                children: [
                                                    session.target_company && /*#__PURE__*/ _jsxs("span", {
                                                        className: "flex items-center gap-1",
                                                        children: [
                                                            /*#__PURE__*/ _jsx(Building2, {
                                                                className: "w-3.5 h-3.5 text-slate-400"
                                                            }),
                                                            session.target_company
                                                        ]
                                                    }),
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
            }),
            viewMode === "kanban" && /*#__PURE__*/ _jsx("div", {
                className: "relative",
                children: !mounted ? /*#__PURE__*/ _jsx("div", {
                    className: "bg-white border border-slate-100 rounded-3xl p-10 flex items-center justify-center min-h-[450px]",
                    children: /*#__PURE__*/ _jsx(Loader2, {
                        className: "w-8 h-8 animate-spin text-blue-600"
                    })
                }) : sessionsLoading ? /*#__PURE__*/ _jsx("div", {
                    className: "bg-white border border-slate-100 rounded-3xl p-10 flex items-center justify-center min-h-[450px]",
                    children: /*#__PURE__*/ _jsx(Loader2, {
                        className: "w-8 h-8 animate-spin text-blue-600"
                    })
                }) : filteredAllSessions.length === 0 ? /*#__PURE__*/ _jsxs("div", {
                    className: "flex flex-col items-center justify-center py-16 px-4 bg-white border border-slate-150 rounded-2xl text-center",
                    children: [
                        /*#__PURE__*/ _jsx(Kanban, {
                            className: "w-12 h-12 text-slate-300 mb-4"
                        }),
                        /*#__PURE__*/ _jsx("h3", {
                            className: "text-slate-900 font-bold text-lg",
                            children: "No sessions available"
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            className: "text-slate-500 text-xs mt-1 max-w-xs font-semibold",
                            children: "No matching sessions found. Start a new session from the panel to populate your Kanban board."
                        })
                    ]
                }) : /*#__PURE__*/ _jsx(DragDropContext, {
                    onDragEnd: handleDragEnd,
                    children: /*#__PURE__*/ _jsx("div", {
                        className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start",
                        children: kanbanColumns.map((col)=>{
                            const colSessions = filteredAllSessions.filter((s)=>{
                                if (col.id === "in_progress") {
                                    return s.status === "in_progress" || s.status === "paused";
                                }
                                return s.status === col.id;
                            });
                            return /*#__PURE__*/ _jsxs("div", {
                                className: `rounded-2xl border ${col.borderClass} ${col.bgClass} p-4 flex flex-col gap-3 min-h-[500px] shadow-sm`,
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "flex items-center justify-between border-b border-slate-200/50 pb-2",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: `text-xs font-extrabold uppercase tracking-wider ${col.textClass}`,
                                                children: col.title
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-[10px] font-extrabold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full",
                                                children: colSessions.length
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx(Droppable, {
                                        droppableId: col.id,
                                        children: (provided, snapshot)=>/*#__PURE__*/ _jsxs("div", {
                                                ref: provided.innerRef,
                                                ...provided.droppableProps,
                                                className: `flex-1 flex flex-col gap-3.5 rounded-xl transition-all duration-200 ${snapshot.isDraggingOver ? "bg-blue-500/5 ring-2 ring-blue-500/10 ring-offset-2" : ""} min-h-[420px]`,
                                                children: [
                                                    colSessions.length === 0 && /*#__PURE__*/ _jsx("div", {
                                                        className: "flex-1 border border-dashed border-slate-200/60 rounded-xl flex items-center justify-center py-12 text-center select-none",
                                                        children: /*#__PURE__*/ _jsx("span", {
                                                            className: "text-[10px] text-slate-400 font-bold uppercase tracking-wider",
                                                            children: "Drag here"
                                                        })
                                                    }),
                                                    colSessions.map((session, index)=>/*#__PURE__*/ _jsx(Draggable, {
                                                            draggableId: session.id,
                                                            index: index,
                                                            children: (provided, snapshot)=>/*#__PURE__*/ _jsxs("div", {
                                                                    ref: provided.innerRef,
                                                                    ...provided.draggableProps,
                                                                    ...provided.dragHandleProps,
                                                                    style: provided.draggableProps.style,
                                                                    className: `bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all ${snapshot.isDragging ? "ring-2 ring-blue-600/50 shadow-xl scale-[1.02] rotate-1" : ""}`,
                                                                    children: [
                                                                        /*#__PURE__*/ _jsxs("div", {
                                                                            className: "flex items-start justify-between gap-1.5",
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
                                                                        /*#__PURE__*/ _jsxs("div", {
                                                                            className: "flex flex-col gap-1",
                                                                            children: [
                                                                                /*#__PURE__*/ _jsxs("h4", {
                                                                                    className: "text-slate-850 font-bold text-sm truncate flex items-center gap-1.5",
                                                                                    children: [
                                                                                        /*#__PURE__*/ _jsx(Building2, {
                                                                                            className: "w-3.5 h-3.5 text-slate-400 shrink-0"
                                                                                        }),
                                                                                        session.target_company ?? "General Session"
                                                                                    ]
                                                                                }),
                                                                                session.focus_area && /*#__PURE__*/ _jsxs("p", {
                                                                                    className: "text-slate-500 text-[10px] font-semibold truncate flex items-center gap-1",
                                                                                    children: [
                                                                                        /*#__PURE__*/ _jsx(Target, {
                                                                                            className: "w-3 h-3 text-slate-405 shrink-0"
                                                                                        }),
                                                                                        session.focus_area
                                                                                    ]
                                                                                })
                                                                            ]
                                                                        }),
                                                                        /*#__PURE__*/ _jsxs("div", {
                                                                            className: "flex items-center justify-between text-[10px] font-bold text-slate-500 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100",
                                                                            children: [
                                                                                /*#__PURE__*/ _jsxs("span", {
                                                                                    className: "flex items-center gap-1",
                                                                                    children: [
                                                                                        /*#__PURE__*/ _jsx(Clock, {
                                                                                            className: "w-3.5 h-3.5 text-slate-405"
                                                                                        }),
                                                                                        formatDuration(session.duration_minutes)
                                                                                    ]
                                                                                }),
                                                                                /*#__PURE__*/ _jsxs("span", {
                                                                                    className: "flex items-center gap-1",
                                                                                    children: [
                                                                                        /*#__PURE__*/ _jsx(Calendar, {
                                                                                            className: "w-3.5 h-3.5 text-slate-405"
                                                                                        }),
                                                                                        formatDate(session.created_at)
                                                                                    ]
                                                                                })
                                                                            ]
                                                                        }),
                                                                        /*#__PURE__*/ _jsx("div", {
                                                                            className: "pt-2 border-t border-slate-100 flex items-center justify-end",
                                                                            children: session.status === "completed" ? /*#__PURE__*/ _jsxs(Link, {
                                                                                href: `/interview/${session.id}/feedback`,
                                                                                className: "flex-1 text-center py-1.5 rounded-lg border border-blue-200 text-blue-605 bg-white hover:bg-blue-50 text-[10px] font-extrabold transition-all shadow-sm flex items-center justify-center gap-1",
                                                                                children: [
                                                                                    /*#__PURE__*/ _jsx(Sparkles, {
                                                                                        className: "w-3 h-3 text-blue-500"
                                                                                    }),
                                                                                    "View Report"
                                                                                ]
                                                                            }) : session.status === "in_progress" || session.status === "created" || session.status === "paused" ? /*#__PURE__*/ _jsxs(Link, {
                                                                                href: `/interview/${session.id}`,
                                                                                className: "flex-1 text-center py-1.5 rounded-lg border border-emerald-200 text-emerald-600 bg-white hover:bg-emerald-50 text-[10px] font-extrabold transition-all shadow-sm flex items-center justify-center gap-1",
                                                                                children: [
                                                                                    /*#__PURE__*/ _jsx(Play, {
                                                                                        className: "w-3 h-3 fill-emerald-600/10"
                                                                                    }),
                                                                                    "Continue"
                                                                                ]
                                                                            }) : /*#__PURE__*/ _jsx("span", {
                                                                                className: "text-[10px] text-slate-400 font-bold uppercase tracking-wider",
                                                                                children: "Archived"
                                                                            })
                                                                        })
                                                                    ]
                                                                })
                                                        }, session.id)),
                                                    provided.placeholder
                                                ]
                                            })
                                    })
                                ]
                            }, col.id);
                        })
                    })
                })
            })
        ]
    });
}
