'use client';

/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Plus, History, User, Settings, BarChart2, ChevronLeft, ChevronRight, LogOut, BookOpen, CreditCard, Trophy, Search, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { CommandMenu } from "./CommandMenu";
import { useUIStore } from "@/stores/uiStore";
import { useQuota } from "@/hooks/queries/useUser";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import TopLoadingBar from "./TopLoadingBar";
import PageTransition from "./PageTransition";
const NAV_ITEMS = [
    {
        href: "/dashboard",
        label: "Dashboard",
        icon: Home,
        exact: true
    },
    {
        href: "/dashboard/create-session",
        label: "New Interview",
        icon: Plus
    },
    {
        href: "/dashboard/questions",
        label: "Question Bank",
        icon: BookOpen
    },
    {
        href: "/dashboard/history",
        label: "History",
        icon: History
    },
    {
        href: "/dashboard/leaderboard",
        label: "Leaderboard",
        icon: Trophy
    },
    {
        href: "/analytics",
        label: "Analytics",
        icon: BarChart2
    },
    {
        href: "/billing",
        label: "Billing",
        icon: CreditCard
    },
    {
        href: "/profile",
        label: "Profile",
        icon: User
    }
];
function NavItem({ href, label, icon: Icon, collapsed, exact }) {
    const pathname = usePathname();
    const router = useRouter();
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    const link = /*#__PURE__*/ _jsxs(Link, {
        href: href,
        onMouseEnter: ()=>router.prefetch(href),
        className: cn("group relative flex items-center rounded-md text-sm transition-all duration-150 outline-none select-none", collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-2.5 px-3 py-2 w-full", active ? "bg-[#f0f0ff] text-indigo-700 font-semibold" : "text-[#555] hover:bg-[#f5f5f5] hover:text-[#111] font-medium"),
        children: [
            active && /*#__PURE__*/ _jsx(motion.div, {
                layoutId: "nav-pill",
                className: "absolute inset-0 rounded-md bg-[#eef2ff] border border-[#c7d2fe] pointer-events-none",
                style: {
                    zIndex: 0
                },
                transition: {
                    type: "spring",
                    stiffness: 400,
                    damping: 38
                }
            }),
            /*#__PURE__*/ _jsx(Icon, {
                className: cn("w-4 h-4 shrink-0 relative z-10 transition-colors duration-150", active ? "text-indigo-600" : "text-[#999] group-hover:text-[#555]")
            }),
            !collapsed && /*#__PURE__*/ _jsx("span", {
                className: "relative z-10 text-[13.5px]",
                children: label
            })
        ]
    });
    if (collapsed) {
        return /*#__PURE__*/ _jsxs(Tooltip, {
            children: [
                /*#__PURE__*/ _jsx(TooltipTrigger, {
                    asChild: true,
                    children: link
                }),
                /*#__PURE__*/ _jsx(TooltipContent, {
                    side: "right",
                    className: "bg-[#111] text-white border-none text-xs font-medium",
                    children: label
                })
            ]
        });
    }
    return link;
}
export default function DashboardShell({ children, maxWidth = "max-w-7xl" }) {
    const { user, logout } = useAuth();
    const { data: quota } = useQuota();
    const isAdmin = useIsAdmin();
    const { sidebarCollapsed, toggleSidebar } = useUIStore();
    const pathname = usePathname();
    const [commandOpen, setCommandOpen] = useState(false);
    const displayName = user?.display_name ?? user?.email ?? "User";
    const plan = quota?.plan ?? "free";
    const mainNav = NAV_ITEMS.filter((i)=>i.href !== "/profile");
    const userProfileItem = NAV_ITEMS.find((i)=>i.href === "/profile");
    const getPageTitle = ()=>{
        if (pathname === "/dashboard") return "Dashboard";
        if (pathname === "/dashboard/create-session") return "New Interview";
        if (pathname === "/dashboard/questions") return "Question Bank";
        if (pathname === "/dashboard/history") return "History";
        if (pathname === "/dashboard/leaderboard") return "Leaderboard";
        if (pathname === "/analytics") return "Analytics";
        if (pathname === "/billing") return "Billing";
        if (pathname === "/profile") return "Profile";
        if (pathname === "/settings") return "Settings";
        if (pathname.includes("/interview/")) return "Interview Room";
        return "Dashboard";
    };
    return /*#__PURE__*/ _jsxs("div", {
        className: "h-screen w-screen max-w-full flex overflow-hidden font-sans",
        style: {
            background: "#fafafa",
            color: "#111"
        },
        children: [
            /*#__PURE__*/ _jsx(TopLoadingBar, {}),
            /*#__PURE__*/ _jsxs(motion.aside, {
                animate: {
                    width: sidebarCollapsed ? 64 : 228
                },
                transition: {
                    type: "spring",
                    stiffness: 320,
                    damping: 32
                },
                style: {
                    background: "#fff",
                    borderRight: "1px solid #e5e5e5",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    overflow: "hidden"
                },
                className: "hidden md:flex",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        style: {
                            padding: sidebarCollapsed ? "18px 0" : "18px 16px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: sidebarCollapsed ? "center" : "space-between",
                            borderBottom: "1px solid #f0f0f0"
                        },
                        children: [
                            !sidebarCollapsed && /*#__PURE__*/ _jsxs(Link, {
                                href: "/dashboard",
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    textDecoration: "none"
                                },
                                children: [
                                    /*#__PURE__*/ _jsx("div", {
                                        style: {
                                            width: 28,
                                            height: 28,
                                            borderRadius: 7,
                                            background: "#4f46e5",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexShrink: 0
                                        },
                                        children: /*#__PURE__*/ _jsxs("svg", {
                                            width: "14",
                                            height: "14",
                                            viewBox: "0 0 24 24",
                                            fill: "none",
                                            stroke: "white",
                                            strokeWidth: "2.5",
                                            strokeLinecap: "round",
                                            strokeLinejoin: "round",
                                            children: [
                                                /*#__PURE__*/ _jsx("polyline", {
                                                    points: "16 18 22 12 16 6"
                                                }),
                                                /*#__PURE__*/ _jsx("polyline", {
                                                    points: "8 6 2 12 8 18"
                                                })
                                            ]
                                        })
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        style: {
                                            fontSize: 15,
                                            fontWeight: 700,
                                            color: "#111",
                                            letterSpacing: "-0.02em"
                                        },
                                        children: "DevMeet"
                                    })
                                ]
                            }),
                            sidebarCollapsed && /*#__PURE__*/ _jsx(Link, {
                                href: "/dashboard",
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textDecoration: "none"
                                },
                                children: /*#__PURE__*/ _jsx("div", {
                                    style: {
                                        width: 28,
                                        height: 28,
                                        borderRadius: 7,
                                        background: "#4f46e5",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center"
                                    },
                                    children: /*#__PURE__*/ _jsxs("svg", {
                                        width: "14",
                                        height: "14",
                                        viewBox: "0 0 24 24",
                                        fill: "none",
                                        stroke: "white",
                                        strokeWidth: "2.5",
                                        strokeLinecap: "round",
                                        strokeLinejoin: "round",
                                        children: [
                                            /*#__PURE__*/ _jsx("polyline", {
                                                points: "16 18 22 12 16 6"
                                            }),
                                            /*#__PURE__*/ _jsx("polyline", {
                                                points: "8 6 2 12 8 18"
                                            })
                                        ]
                                    })
                                })
                            }),
                            !sidebarCollapsed && /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                onClick: toggleSidebar,
                                style: {
                                    width: 24,
                                    height: 24,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px solid #e5e5e5",
                                    borderRadius: 6,
                                    background: "transparent",
                                    cursor: "pointer",
                                    color: "#999",
                                    flexShrink: 0
                                },
                                "aria-label": "Collapse sidebar",
                                children: /*#__PURE__*/ _jsx(ChevronLeft, {
                                    style: {
                                        width: 13,
                                        height: 13
                                    }
                                })
                            })
                        ]
                    }),
                    sidebarCollapsed && /*#__PURE__*/ _jsx("div", {
                        style: {
                            display: "flex",
                            justifyContent: "center",
                            padding: "8px 0"
                        },
                        children: /*#__PURE__*/ _jsx("button", {
                            type: "button",
                            onClick: toggleSidebar,
                            style: {
                                width: 24,
                                height: 24,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                border: "1px solid #e5e5e5",
                                borderRadius: 6,
                                background: "transparent",
                                cursor: "pointer",
                                color: "#999"
                            },
                            "aria-label": "Expand sidebar",
                            children: /*#__PURE__*/ _jsx(ChevronRight, {
                                style: {
                                    width: 13,
                                    height: 13
                                }
                            })
                        })
                    }),
                    /*#__PURE__*/ _jsx(AnimatePresence, {
                        children: !sidebarCollapsed && /*#__PURE__*/ _jsx(motion.div, {
                            initial: {
                                opacity: 0
                            },
                            animate: {
                                opacity: 1
                            },
                            exit: {
                                opacity: 0
                            },
                            transition: {
                                duration: 0.15
                            },
                            style: {
                                padding: "10px 12px"
                            },
                            children: /*#__PURE__*/ _jsxs("div", {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 9,
                                    padding: "9px 10px",
                                    background: "#f5f5f5",
                                    borderRadius: 8,
                                    border: "1px solid #ebebeb"
                                },
                                children: [
                                    /*#__PURE__*/ _jsx(Avatar, {
                                        className: "h-7 w-7 shrink-0",
                                        children: /*#__PURE__*/ _jsx(AvatarFallback, {
                                            className: "text-[11px] font-bold",
                                            style: {
                                                background: "#4f46e5",
                                                color: "#fff"
                                            },
                                            children: getInitials(displayName)
                                        })
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        style: {
                                            minWidth: 0
                                        },
                                        children: [
                                            /*#__PURE__*/ _jsx("div", {
                                                style: {
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: "#111",
                                                    letterSpacing: "-0.01em",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap"
                                                },
                                                children: displayName
                                            }),
                                            /*#__PURE__*/ _jsxs("div", {
                                                style: {
                                                    fontSize: 11,
                                                    color: "#999",
                                                    textTransform: "capitalize",
                                                    marginTop: 1
                                                },
                                                children: [
                                                    plan,
                                                    " plan"
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        })
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        style: {
                            flex: 1,
                            overflowY: "auto",
                            padding: sidebarCollapsed ? "8px 10px" : "8px 10px",
                            scrollbarWidth: "none"
                        },
                        children: /*#__PURE__*/ _jsxs("nav", {
                            style: {
                                display: "flex",
                                flexDirection: "column",
                                gap: 2
                            },
                            children: [
                                !sidebarCollapsed && /*#__PURE__*/ _jsx("div", {
                                    style: {
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: "#bbb",
                                        letterSpacing: "0.07em",
                                        textTransform: "uppercase",
                                        padding: "8px 4px 6px",
                                        marginBottom: 2
                                    },
                                    children: "Menu"
                                }),
                                mainNav.map((item)=>/*#__PURE__*/ _jsx(NavItem, {
                                        ...item,
                                        collapsed: sidebarCollapsed,
                                        exact: "exact" in item ? item.exact : false
                                    }, item.href)),
                                !sidebarCollapsed && /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            style: {
                                                fontSize: 10,
                                                fontWeight: 700,
                                                color: "#bbb",
                                                letterSpacing: "0.07em",
                                                textTransform: "uppercase",
                                                padding: "16px 4px 6px"
                                            },
                                            children: "Quick Start"
                                        }),
                                        [
                                            {
                                                href: "/dashboard/create-session?type=dsa",
                                                label: "DSA / Coding",
                                                dot: "#4f46e5"
                                            },
                                            {
                                                href: "/dashboard/create-session?type=system_design",
                                                label: "System Design",
                                                dot: "#059669"
                                            },
                                            {
                                                href: "/dashboard/create-session?type=behavioral",
                                                label: "Behavioral",
                                                dot: "#d97706"
                                            }
                                        ].map((d)=>/*#__PURE__*/ _jsxs(Link, {
                                                href: d.href,
                                                style: {
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    padding: "6px 8px",
                                                    borderRadius: 6,
                                                    fontSize: 13,
                                                    fontWeight: 500,
                                                    color: "#555",
                                                    textDecoration: "none",
                                                    transition: "all 0.1s"
                                                },
                                                className: "hover:bg-[#f5f5f5] hover:text-[#111]",
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        style: {
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: "50%",
                                                            background: d.dot,
                                                            flexShrink: 0
                                                        }
                                                    }),
                                                    d.label
                                                ]
                                            }, d.href))
                                    ]
                                }),
                                !sidebarCollapsed && /*#__PURE__*/ _jsx("div", {
                                    style: {
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: "#bbb",
                                        letterSpacing: "0.07em",
                                        textTransform: "uppercase",
                                        padding: "16px 4px 6px"
                                    },
                                    children: "Support"
                                }),
                                /*#__PURE__*/ _jsx(NavItem, {
                                    href: "/settings",
                                    label: "Settings",
                                    icon: Settings,
                                    collapsed: sidebarCollapsed
                                }),
                                /*#__PURE__*/ _jsx(NavItem, {
                                    href: "mailto:support@devmeet.com",
                                    label: "Help",
                                    icon: HelpCircle,
                                    collapsed: sidebarCollapsed
                                })
                            ]
                        })
                    }),
                    isAdmin && /*#__PURE__*/ _jsx("div", {
                        style: { margin: "0 12px 12px" },
                        children: sidebarCollapsed
                            ? /*#__PURE__*/ _jsx(Tooltip, {
                                children: [
                                    /*#__PURE__*/ _jsx(TooltipTrigger, {
                                        asChild: true,
                                        children: /*#__PURE__*/ _jsx(Link, {
                                            href: "/admin",
                                            style: {
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                width: 36,
                                                height: 36,
                                                margin: "0 auto",
                                                background: "#dc2626",
                                                borderRadius: 8,
                                                color: "#fff",
                                                fontWeight: 700,
                                                fontSize: 13,
                                                textDecoration: "none"
                                            },
                                            children: "A"
                                        })
                                    }),
                                    /*#__PURE__*/ _jsx(TooltipContent, {
                                        side: "right",
                                        className: "bg-[#111] text-white border-none text-xs font-medium",
                                        children: "Admin Panel"
                                    })
                                ]
                            })
                            : /*#__PURE__*/ _jsxs("div", {
                                style: {
                                    padding: "10px 12px",
                                    background: "#fff5f5",
                                    border: "1px solid #fecaca",
                                    borderRadius: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between"
                                },
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        style: {
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: "#b91c1c",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em"
                                        },
                                        children: "Admin"
                                    }),
                                    /*#__PURE__*/ _jsx(Link, {
                                        href: "/admin",
                                        style: {
                                            fontSize: 11,
                                            background: "#dc2626",
                                            color: "#fff",
                                            fontWeight: 600,
                                            padding: "3px 8px",
                                            borderRadius: 5,
                                            textDecoration: "none"
                                        },
                                        children: "Manage"
                                    })
                                ]
                            })
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                style: {
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    overflow: "hidden"
                },
                children: [
                    /*#__PURE__*/ _jsxs("header", {
                        style: {
                            height: 56,
                            flexShrink: 0,
                            borderBottom: "1px solid #e5e5e5",
                            background: "#fff",
                            padding: "0 24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        },
                        children: [
                            /*#__PURE__*/ _jsx(AnimatePresence, {
                                mode: "popLayout",
                                children: /*#__PURE__*/ _jsx(motion.h1, {
                                    initial: {
                                        opacity: 0,
                                        y: 3
                                    },
                                    animate: {
                                        opacity: 1,
                                        y: 0
                                    },
                                    exit: {
                                        opacity: 0,
                                        y: -3
                                    },
                                    transition: {
                                        duration: 0.15
                                    },
                                    style: {
                                        fontSize: 15,
                                        fontWeight: 600,
                                        color: "#111",
                                        letterSpacing: "-0.02em",
                                        margin: 0
                                    },
                                    children: getPageTitle()
                                }, pathname)
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12
                                },
                                children: [
                                    /*#__PURE__*/ _jsxs("button", {
                                        type: "button",
                                        onClick: ()=>setCommandOpen(true),
                                        style: {
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            background: "#f5f5f5",
                                            border: "1px solid #e5e5e5",
                                            borderRadius: 8,
                                            padding: "6px 12px",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            color: "#888",
                                            fontWeight: 400,
                                            width: 180,
                                            justifyContent: "space-between",
                                            transition: "all 0.15s"
                                        },
                                        className: "hover:border-[#d0d0d0] hover:bg-white",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                style: {
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6
                                                },
                                                children: [
                                                    /*#__PURE__*/ _jsx(Search, {
                                                        style: {
                                                            width: 13,
                                                            height: 13
                                                        }
                                                    }),
                                                    /*#__PURE__*/ _jsx("span", {
                                                        children: "Search..."
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("kbd", {
                                                style: {
                                                    fontSize: 10,
                                                    color: "#bbb",
                                                    background: "#ebebeb",
                                                    border: "1px solid #ddd",
                                                    borderRadius: 4,
                                                    padding: "1px 5px",
                                                    fontFamily: "inherit",
                                                    fontWeight: 600
                                                },
                                                children: "⌘K"
                                            })
                                        ]
                                    }),
                                    userProfileItem && /*#__PURE__*/ _jsx(Link, {
                                        href: userProfileItem.href,
                                        style: {
                                            textDecoration: "none"
                                        },
                                        children: /*#__PURE__*/ _jsx(Avatar, {
                                            className: "h-7 w-7 hover:opacity-80 transition-opacity cursor-pointer",
                                            children: /*#__PURE__*/ _jsx(AvatarFallback, {
                                                className: "text-[11px] font-bold",
                                                style: {
                                                    background: "#4f46e5",
                                                    color: "#fff"
                                                },
                                                children: getInitials(displayName)
                                            })
                                        })
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        style: {
                                            width: 1,
                                            height: 20,
                                            background: "#e5e5e5"
                                        }
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        onClick: ()=>logout(),
                                        style: {
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: 30,
                                            height: 30,
                                            borderRadius: 7,
                                            border: "none",
                                            background: "transparent",
                                            cursor: "pointer",
                                            color: "#999",
                                            transition: "all 0.15s"
                                        },
                                        className: "hover:bg-[#f5f5f5] hover:text-[#555]",
                                        title: "Sign out",
                                        children: /*#__PURE__*/ _jsx(LogOut, {
                                            style: {
                                                width: 15,
                                                height: 15
                                            }
                                        })
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("main", {
                        style: {
                            flex: 1,
                            overflowY: "auto",
                            overflowX: "hidden",
                            background: "#fafafa",
                            paddingBottom: 48
                        },
                        children: /*#__PURE__*/ _jsx("div", {
                            className: cn(maxWidth, "mx-auto px-6 md:px-8 py-6 space-y-6"),
                            children: /*#__PURE__*/ _jsx(PageTransition, {
                                children: children
                            })
                        })
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(CommandMenu, {
                open: commandOpen,
                setOpen: setCommandOpen
            })
        ]
    });
}
