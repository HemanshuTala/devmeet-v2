'use client';

/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useMemo } from "react";
const INTERVIEW_TYPES = [
    "dsa",
    "behavioral",
    "system_design"
];
const TYPE_LABELS = {
    dsa: "DSA",
    behavioral: "Behavioral",
    system_design: "System Design"
};
const TYPE_COLORS = {
    dsa: "#3b82f6",
    behavioral: "#8b5cf6",
    system_design: "#10b981"
};
const DAYS = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
];
const WEEKS = 24;
function getCellColor(count, type) {
    if (count === 0) return "#f1f5f9"; // slate-100
    const base = TYPE_COLORS[type] ?? "#3b82f6";
    // Interpolate opacity: 1 session → 0.3, 3+ → 1.0
    const opacity = Math.min(0.3 + count / 3 * 0.7, 1).toFixed(2);
    // Convert hex to rgba
    const r = parseInt(base.slice(1, 3), 16);
    const g = parseInt(base.slice(3, 5), 16);
    const b = parseInt(base.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity})`;
}
export default function CategoryHeatmap({ sessions }) {
    // Build a map: { type → { "YYYY-MM-DD" → count } }
    const heatmapData = useMemo(()=>{
        const data = {};
        INTERVIEW_TYPES.forEach((t)=>{
            data[t] = {};
        });
        sessions.forEach((s)=>{
            const type = s.interview_type;
            if (!data[type]) return;
            const dateKey = new Date(s.created_at).toISOString().slice(0, 10);
            data[type][dateKey] = (data[type][dateKey] ?? 0) + 1;
        });
        return data;
    }, [
        sessions
    ]);
    // Build grid: WEEKS columns × 7 rows, from (WEEKS * 7) days ago to today
    const grid = useMemo(()=>{
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cells = [];
        for(let w = WEEKS - 1; w >= 0; w--){
            for(let d = 0; d < 7; d++){
                const date = new Date(today);
                date.setDate(today.getDate() - w * 7 - (6 - d));
                cells.push({
                    dateKey: date.toISOString().slice(0, 10),
                    dayOfWeek: date.getDay(),
                    week: WEEKS - 1 - w
                });
            }
        }
        return cells;
    }, []);
    const totalByType = useMemo(()=>{
        const totals = {};
        INTERVIEW_TYPES.forEach((t)=>{
            totals[t] = Object.values(heatmapData[t]).reduce((a, b)=>a + b, 0);
        });
        return totals;
    }, [
        heatmapData
    ]);
    return /*#__PURE__*/ _jsxs("section", {
        className: "bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-5 animate-fade-in-up",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center justify-between mb-4",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("h2", {
                                className: "text-base font-bold text-slate-900",
                                children: "Category Heatmap"
                            }),
                            /*#__PURE__*/ _jsxs("p", {
                                className: "text-slate-500 text-xs mt-0.5 font-medium",
                                children: [
                                    "Session activity by type — last ",
                                    WEEKS,
                                    " weeks"
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "flex items-center gap-3",
                        children: INTERVIEW_TYPES.map((t)=>/*#__PURE__*/ _jsxs("div", {
                                className: "flex items-center gap-1.5",
                                children: [
                                    /*#__PURE__*/ _jsx("div", {
                                        className: "w-2.5 h-2.5 rounded-sm",
                                        style: {
                                            backgroundColor: TYPE_COLORS[t]
                                        }
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "text-xs text-slate-500 font-semibold",
                                        children: TYPE_LABELS[t]
                                    })
                                ]
                            }, t))
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "flex flex-col gap-4 overflow-x-auto",
                children: [
                    INTERVIEW_TYPES.map((type)=>/*#__PURE__*/ _jsxs("div", {
                            className: "flex items-center gap-3",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "w-20 shrink-0 text-right",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "text-xs font-bold text-slate-600",
                                            children: TYPE_LABELS[type]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "text-[10px] text-slate-400 font-semibold",
                                            children: [
                                                totalByType[type],
                                                " total"
                                            ]
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("div", {
                                    className: "flex flex-col gap-0.5",
                                    children: /*#__PURE__*/ _jsx("div", {
                                        className: "flex gap-0.5",
                                        children: Array.from({
                                            length: WEEKS
                                        }).map((_, w)=>/*#__PURE__*/ _jsx("div", {
                                                className: "flex flex-col gap-0.5",
                                                children: [
                                                    0,
                                                    1,
                                                    2,
                                                    3,
                                                    4,
                                                    5,
                                                    6
                                                ].map((d)=>{
                                                    const cell = grid.find((c)=>c.week === w && c.dayOfWeek === d);
                                                    if (!cell) return /*#__PURE__*/ _jsx("div", {
                                                        className: "w-3.5 h-3.5"
                                                    }, d);
                                                    const count = heatmapData[type][cell.dateKey] ?? 0;
                                                    return /*#__PURE__*/ _jsx("div", {
                                                        className: "w-3.5 h-3.5 rounded-sm transition-all duration-200 hover:ring-1 hover:ring-offset-0 hover:ring-blue-400 cursor-default",
                                                        style: {
                                                            backgroundColor: getCellColor(count, type)
                                                        },
                                                        title: `${cell.dateKey}: ${count} session${count !== 1 ? "s" : ""}`
                                                    }, d);
                                                })
                                            }, w))
                                    })
                                })
                            ]
                        }, type)),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-3 -mt-2",
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                className: "w-20 shrink-0"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "flex gap-0.5",
                                children: Array.from({
                                    length: WEEKS
                                }).map((_, w)=>/*#__PURE__*/ _jsx("div", {
                                        className: "flex flex-col gap-0.5 w-3.5",
                                        children: w % 3 === 0 && /*#__PURE__*/ _jsxs("span", {
                                            className: "text-[9px] text-slate-400 font-semibold whitespace-nowrap",
                                            children: [
                                                "W",
                                                WEEKS - w
                                            ]
                                        })
                                    }, w))
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
