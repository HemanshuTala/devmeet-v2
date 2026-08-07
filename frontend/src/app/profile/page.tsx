'use client';

/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { Mail, Calendar, User, Shield, X, Camera, Loader2, Settings, CreditCard } from "lucide-react";
import { authApi, paymentApi, userApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, usePlan, useUpdateProfile } from "@/hooks/queries/useUser";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageLoader } from "@/components/feedback/PageLoader";
import { toast as sonnerToast } from "sonner";
import DashboardShell from "@/components/layout/DashboardShell";
import ProfileTab from "./ProfileTab";
import PreferencesTab from "./PreferencesTab";
import BillingTab from "./BillingTab";
import StripeModal from "./StripeModal";
function getInitials(name) {
    if (!name) return "?";
    return name.trim().charAt(0).toUpperCase();
}
function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}
export default function ProfilePage() {
    const { user, isLoading: authLoading, refreshUser } = useAuth();
    // ── State ──────────────────────────────────────────────────────────────────
    const [profile, setProfile] = useState(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);
    const [activeTab, setActiveTab] = useState("profile");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const { data: planData } = usePlan();
    const updateProfileMutation = useUpdateProfile();
    const [showStripeModal, setShowStripeModal] = useState(false);
    const [stripeLoading, setStripeLoading] = useState(false);
    const [stripeSuccess, setStripeSuccess] = useState(false);
    const [cardNumber, setCardNumber] = useState("");
    const [cardExpiry, setCardExpiry] = useState("");
    const [cardCVC, setCardCVC] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [bio, setBio] = useState("");
    const [skills, setSkills] = useState([]);
    const [targetCompanies, setTargetCompanies] = useState([]);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [profilePublic, setProfilePublic] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState("");
    const [avatarUploading, setAvatarUploading] = useState(false);
    // ── Effects ────────────────────────────────────────────────────────────────
    useRequireAuth();
    const populateForm = useCallback((p)=>{
        setDisplayName(p.display_name ?? "");
        setBio(p.bio ?? "");
        setSkills(p.skills ?? []);
        setTargetCompanies(p.target_companies ?? []);
        setReminderEnabled(p.interview_reminder_enabled ?? false);
        setProfilePublic(p.profile_public ?? false);
    }, []);
    const showToast = useCallback((type, message)=>{
        setToast({
            type,
            message
        });
    }, []);
    const { data: profileData, isLoading: profileQueryLoading } = useProfile();
    useEffect(()=>{
        if (profileData) {
            setProfile(profileData);
            populateForm(profileData);
            setIsLoadingProfile(false);
        }
    }, [
        profileData,
        populateForm
    ]);
    useEffect(()=>{
        if (!toast) return;
        const t = setTimeout(()=>setToast(null), 4000);
        return ()=>clearTimeout(t);
    }, [
        toast
    ]);
    // ── Helpers ────────────────────────────────────────────────────────────────
    function handleCancelEdit() {
        if (profile) populateForm(profile);
        setIsEditing(false);
    }
    async function handleSaveProfile() {
        if (!displayName.trim()) {
            showToast("error", "Display name cannot be empty.");
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                display_name: displayName.trim(),
                bio: bio.trim() || undefined,
                skills,
                target_companies: targetCompanies,
                interview_reminder_enabled: reminderEnabled,
                profile_public: profilePublic
            };
            const updated = await updateProfileMutation.mutateAsync(payload);
            setProfile(updated);
            setIsEditing(false);
            sonnerToast.success("Profile updated!");
        } catch  {
            showToast("error", "Failed to save profile. Please try again.");
        } finally{
            setIsSaving(false);
        }
    }
    async function handlePreferenceSave(patch) {
        try {
            const updated = await updateProfileMutation.mutateAsync(patch);
            setProfile(updated);
            sonnerToast.success("Preferences saved!");
        } catch  {
            showToast("error", "Failed to save preferences.");
        }
    }
    async function handleAvatarUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (![
            "image/jpeg",
            "image/png",
            "image/webp"
        ].includes(file.type)) {
            showToast("error", "Please upload a JPEG or PNG image (max 5MB).");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast("error", "Image must be under 5MB.");
            return;
        }
        setAvatarUploading(true);
        try {
            const { avatar_url } = await userApi.uploadAvatar(file);
            setProfile((p)=>p ? {
                    ...p,
                    avatar_url
                } : p);
            await refreshUser();
            sonnerToast.success("Avatar updated");
        } catch (err) {
            showToast("error", err instanceof Error ? err.message : "Avatar upload failed");
        } finally{
            setAvatarUploading(false);
            e.target.value = "";
        }
    }
    async function handleChangePassword(e) {
        e.preventDefault();
        setPasswordError("");
        setPasswordSuccess("");
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError("New passwords do not match.");
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            setPasswordError("New password must be at least 8 characters.");
            return;
        }
        try {
            await authApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
            setPasswordSuccess("Password changed successfully!");
            setPasswordForm({
                currentPassword: "",
                newPassword: "",
                confirmPassword: ""
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to change password.";
            setPasswordError(msg);
        }
    }
    // PAY-01: Stripe checkout via payment-service
    const handleSimulateStripePay = async (e)=>{
        e.preventDefault();
        setStripeLoading(true);
        try {
            const data = await paymentApi.createCheckoutSession("pro");
            const checkoutUrl = data.checkout_url;
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                setStripeSuccess(true);
                showToast("success", "Checkout session created.");
                setTimeout(()=>{
                    setShowStripeModal(false);
                    setStripeSuccess(false);
                }, 2000);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Payment unavailable. Please try again.";
            showToast("error", msg);
        } finally{
            setStripeLoading(false);
        }
    };
    // ── Loading guard ──────────────────────────────────────────────────────────
    const currentPlan = planData?.plan ?? "free";
    if (authLoading || isLoadingProfile || profileQueryLoading) {
        return /*#__PURE__*/ _jsx(DashboardShell, {
            maxWidth: "max-w-6xl",
            children: /*#__PURE__*/ _jsxs("div", {
                className: "flex flex-col gap-6 animate-fade-in",
                children: [
                    // Header
                    /*#__PURE__*/ _jsxs("div", {
                        className: "rounded-2xl p-8 border flex flex-col sm:flex-row items-start sm:items-center gap-6",
                        style: { background: "var(--color-bg-card)", borderColor: "var(--color-border)", boxShadow: "var(--shadow-sm)" },
                        children: [
                            /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer w-20 h-20 rounded-full flex-shrink-0" }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex-1 flex flex-col gap-2",
                                children: [
                                    /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-6 w-48 rounded-md" }),
                                    /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-4 w-60 rounded-md" }),
                                    /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-3 w-36 rounded-md" })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-9 w-28 rounded-lg flex-shrink-0" })
                        ]
                    }),
                    // Tabs
                    /*#__PURE__*/ _jsx("div", {
                        className: "flex gap-2",
                        children: [24, 28, 28].map((w, i) =>
                            /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-9 rounded-lg", style: { width: w * 4 } }, i)
                        )
                    }),
                    // Content grid
                    /*#__PURE__*/ _jsx("div", {
                        className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                        children: [0, 1].map((j) =>
                            /*#__PURE__*/ _jsxs("div", {
                                className: "rounded-2xl p-6 border flex flex-col gap-4",
                                style: { background: "var(--color-bg-card)", borderColor: "var(--color-border)", boxShadow: "var(--shadow-sm)" },
                                children: [
                                    /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-5 w-36 rounded-md" }),
                                    ...[0, 1, 2, 3].map((k) =>
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "flex items-center justify-between py-1",
                                            children: [
                                                /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-4 w-28 rounded-md" }),
                                                /*#__PURE__*/ _jsx("div", { className: "skeleton-shimmer h-4 w-44 rounded-md" })
                                            ]
                                        }, k)
                                    )
                                ]
                            }, j)
                        )
                    })
                ]
            })
        });
    }
    if (!user || !profile) return null;
    const memberSince = formatDate(profile.created_at);
    const displayPlanLabel = currentPlan.toUpperCase() + " PLAN";
    return /*#__PURE__*/ _jsxs(DashboardShell, {
        maxWidth: "max-w-6xl",
        children: [
            toast && /*#__PURE__*/ _jsxs("div", {
                className: `fixed top-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-5 py-3 shadow-2xl backdrop-blur-md animate-fade-in-up font-semibold text-sm
            ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`,
                children: [
                    toast.type === "success" ? /*#__PURE__*/ _jsx(Shield, {
                        className: "h-4 w-4 flex-shrink-0 text-emerald-600"
                    }) : /*#__PURE__*/ _jsx(X, {
                        className: "h-4 w-4 flex-shrink-0 text-rose-600"
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        children: toast.message
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        onClick: ()=>setToast(null),
                        className: "ml-2 opacity-60 hover:opacity-100 transition-opacity",
                        "aria-label": "Dismiss",
                        children: /*#__PURE__*/ _jsx(X, {
                            className: "h-3.5 w-3.5"
                        })
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(StripeModal, {
                showStripeModal: showStripeModal,
                setShowStripeModal: setShowStripeModal,
                stripeLoading: stripeLoading,
                stripeSuccess: stripeSuccess,
                cardNumber: cardNumber,
                setCardNumber: setCardNumber,
                cardExpiry: cardExpiry,
                setCardExpiry: setCardExpiry,
                cardCVC: cardCVC,
                setCardCVC: setCardCVC,
                handleSimulateStripePay: handleSimulateStripePay
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "mb-2",
                children: [
                    /*#__PURE__*/ _jsx("h1", {
                        className: "text-3xl font-bold gradient-text",
                        children: "My Profile"
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "text-slate-500 text-sm mt-1 font-medium",
                        children: "Manage your identity, preferences, and subscription."
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "grid grid-cols-1 gap-6 lg:grid-cols-3",
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        className: "lg:col-span-1 animate-fade-in-up delay-100",
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "bg-white border border-blue-100 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center gap-4",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "relative group",
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "h-24 w-24 rounded-full bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-200/50 ring-4 ring-blue-50 overflow-hidden",
                                            children: profile.avatar_url ? /*#__PURE__*/ _jsx("img", {
                                                src: profile.avatar_url,
                                                alt: profile.display_name ?? "Avatar",
                                                className: "h-full w-full rounded-full object-cover"
                                            }) : /*#__PURE__*/ _jsx("span", {
                                                className: "text-4xl font-extrabold text-white select-none",
                                                children: getInitials(profile.display_name)
                                            })
                                        }),
                                        /*#__PURE__*/ _jsx("label", {
                                            htmlFor: "avatar-upload",
                                            className: "absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
                                            children: avatarUploading ? /*#__PURE__*/ _jsx(Loader2, {
                                                className: "w-6 h-6 text-white animate-spin"
                                            }) : /*#__PURE__*/ _jsx(Camera, {
                                                className: "w-6 h-6 text-white"
                                            })
                                        }),
                                        /*#__PURE__*/ _jsx("input", {
                                            id: "avatar-upload",
                                            type: "file",
                                            accept: "image/jpeg,image/png,image/webp",
                                            className: "sr-only",
                                            disabled: avatarUploading,
                                            onChange: handleAvatarUpload
                                        }),
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-white shadow"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    children: [
                                        /*#__PURE__*/ _jsx("h2", {
                                            className: "text-xl font-bold text-slate-900",
                                            children: profile.display_name ?? "Anonymous"
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500 font-medium",
                                            children: [
                                                /*#__PURE__*/ _jsx(Mail, {
                                                    className: "h-3.5 w-3.5"
                                                }),
                                                /*#__PURE__*/ _jsx("span", {
                                                    children: profile.email
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("span", {
                                    className: `text-xs font-bold px-3 py-1 rounded-full border ${currentPlan === "pro" ? "bg-blue-50 text-blue-700 border-blue-200" : currentPlan === "enterprise" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`,
                                    children: [
                                        "✦ ",
                                        displayPlanLabel
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("div", {
                                    className: "w-full h-px bg-blue-50"
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "w-full grid grid-cols-2 gap-3",
                                    children: [
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "rounded-xl border border-blue-50 bg-slate-50 p-3",
                                            children: [
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center justify-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1 select-none",
                                                    children: [
                                                        /*#__PURE__*/ _jsx(Calendar, {
                                                            className: "h-3.5 w-3.5 text-blue-400"
                                                        }),
                                                        "Member"
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "text-sm font-bold text-slate-800 leading-tight",
                                                    children: memberSince
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "rounded-xl border border-blue-50 bg-slate-50 p-3",
                                            children: [
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center justify-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1 select-none",
                                                    children: [
                                                        /*#__PURE__*/ _jsx(User, {
                                                            className: "h-3.5 w-3.5 text-sky-400"
                                                        }),
                                                        "Status"
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "text-sm font-bold text-emerald-600",
                                                    children: "Active"
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                profile.bio && /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "w-full h-px bg-blue-50"
                                        }),
                                        /*#__PURE__*/ _jsxs("p", {
                                            className: "text-sm text-slate-500 italic leading-relaxed",
                                            children: [
                                                '"',
                                                profile.bio,
                                                '"'
                                            ]
                                        })
                                    ]
                                }),
                                (profile.skills ?? []).length > 0 && /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "w-full h-px bg-blue-50"
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "w-full flex flex-wrap gap-1.5 justify-center",
                                            children: [
                                                (profile.skills ?? []).slice(0, 6).map((s)=>/*#__PURE__*/ _jsx("span", {
                                                        className: "badge-cyan text-xs",
                                                        children: s
                                                    }, s)),
                                                (profile.skills ?? []).length > 6 && /*#__PURE__*/ _jsxs("span", {
                                                    className: "badge-indigo text-xs",
                                                    children: [
                                                        "+",
                                                        (profile.skills ?? []).length - 6,
                                                        " more"
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        })
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "lg:col-span-2 animate-fade-in-up delay-200",
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                className: "flex gap-1 rounded-xl border border-blue-100 bg-white p-1 mb-5 shadow-sm",
                                children: [
                                    {
                                        id: "profile",
                                        label: "Profile",
                                        icon: /*#__PURE__*/ _jsx(User, {
                                            className: "w-4 h-4"
                                        })
                                    },
                                    {
                                        id: "preferences",
                                        label: "Preferences",
                                        icon: /*#__PURE__*/ _jsx(Settings, {
                                            className: "w-4 h-4"
                                        })
                                    },
                                    {
                                        id: "billing",
                                        label: "Billing",
                                        icon: /*#__PURE__*/ _jsx(CreditCard, {
                                            className: "w-4 h-4"
                                        })
                                    }
                                ].map((tab)=>/*#__PURE__*/ _jsxs("button", {
                                        onClick: ()=>{
                                            setActiveTab(tab.id);
                                            if (isEditing) handleCancelEdit();
                                        },
                                        className: `flex-1 rounded-lg py-2 text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${activeTab === tab.id ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`,
                                        children: [
                                            tab.icon,
                                            /*#__PURE__*/ _jsx("span", {
                                                children: tab.label
                                            })
                                        ]
                                    }, tab.id))
                            }),
                            activeTab === "profile" && /*#__PURE__*/ _jsx(ProfileTab, {
                                isEditing: isEditing,
                                displayName: displayName,
                                setDisplayName: setDisplayName,
                                bio: bio,
                                setBio: setBio,
                                skills: skills,
                                setSkills: setSkills,
                                targetCompanies: targetCompanies,
                                setTargetCompanies: setTargetCompanies,
                                isSaving: isSaving,
                                handleSaveProfile: handleSaveProfile,
                                handleCancelEdit: handleCancelEdit,
                                setIsEditing: setIsEditing
                            }),
                            activeTab === "preferences" && /*#__PURE__*/ _jsx(PreferencesTab, {
                                reminderEnabled: reminderEnabled,
                                setReminderEnabled: setReminderEnabled,
                                profilePublic: profilePublic,
                                setProfilePublic: setProfilePublic,
                                handlePreferenceSave: handlePreferenceSave,
                                passwordForm: passwordForm,
                                setPasswordForm: setPasswordForm,
                                passwordError: passwordError,
                                passwordSuccess: passwordSuccess,
                                handleChangePassword: handleChangePassword
                            }),
                            activeTab === "billing" && /*#__PURE__*/ _jsx(BillingTab, {
                                plan: currentPlan,
                                setShowStripeModal: setShowStripeModal,
                                showToast: showToast
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
