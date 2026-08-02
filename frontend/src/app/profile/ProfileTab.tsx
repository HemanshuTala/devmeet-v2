import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { User, Edit2, X, Save } from "lucide-react";
import TagInput from "@/components/TagInput";
import ReadonlyField from "@/components/ReadonlyField";
export default function ProfileTab({ isEditing, displayName, setDisplayName, bio, setBio, skills, setSkills, targetCompanies, setTargetCompanies, isSaving, handleSaveProfile, handleCancelEdit, setIsEditing }) {
    return /*#__PURE__*/ _jsxs("div", {
        className: "bg-white border border-blue-100 p-6 rounded-2xl shadow-sm animate-fade-in-up",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center justify-between mb-6",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                className: "text-lg font-bold text-slate-900",
                                children: "Personal Information"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "text-sm text-slate-500 mt-0.5 font-medium",
                                children: isEditing ? "Make your changes below and save" : "View and edit your profile details"
                            })
                        ]
                    }),
                    !isEditing ? /*#__PURE__*/ _jsxs("button", {
                        onClick: ()=>setIsEditing(true),
                        className: "btn-ghost flex items-center gap-2 text-sm font-bold",
                        children: [
                            /*#__PURE__*/ _jsx(Edit2, {
                                className: "h-4 w-4"
                            }),
                            "Edit Profile"
                        ]
                    }) : /*#__PURE__*/ _jsxs("div", {
                        className: "flex gap-2",
                        children: [
                            /*#__PURE__*/ _jsxs("button", {
                                onClick: handleCancelEdit,
                                className: "btn-ghost flex items-center gap-1.5 text-sm font-bold",
                                disabled: isSaving,
                                children: [
                                    /*#__PURE__*/ _jsx(X, {
                                        className: "h-4 w-4"
                                    }),
                                    "Cancel"
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                onClick: handleSaveProfile,
                                className: "btn-primary flex items-center gap-1.5 text-sm font-bold",
                                disabled: isSaving,
                                children: isSaving ? /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
                                        }),
                                        "Saving…"
                                    ]
                                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx(Save, {
                                            className: "h-4 w-4"
                                        }),
                                        "Save"
                                    ]
                                })
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "space-y-5",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("label", {
                                className: "form-label font-bold text-slate-700",
                                htmlFor: "displayName",
                                children: "Display Name"
                            }),
                            isEditing ? /*#__PURE__*/ _jsx("input", {
                                id: "displayName",
                                type: "text",
                                value: displayName,
                                onChange: (e)=>setDisplayName(e.target.value),
                                className: "input-field w-full",
                                placeholder: "Your display name",
                                maxLength: 64
                            }) : /*#__PURE__*/ _jsx(ReadonlyField, {
                                value: displayName || "—",
                                icon: /*#__PURE__*/ _jsx(User, {
                                    className: "h-4 w-4"
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("label", {
                                className: "form-label font-bold text-slate-700",
                                htmlFor: "bio",
                                children: "Bio"
                            }),
                            isEditing ? /*#__PURE__*/ _jsx("textarea", {
                                id: "bio",
                                rows: 3,
                                value: bio,
                                onChange: (e)=>setBio(e.target.value),
                                className: "input-field w-full resize-none",
                                placeholder: "Tell the community a bit about yourself…",
                                maxLength: 300
                            }) : /*#__PURE__*/ _jsx(ReadonlyField, {
                                value: bio || "No bio added yet."
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsxs("label", {
                                className: "form-label font-bold text-slate-700",
                                children: [
                                    "Skills",
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "ml-1 text-slate-400 font-normal text-xs",
                                        children: "(press Enter or , to add)"
                                    })
                                ]
                            }),
                            isEditing ? /*#__PURE__*/ _jsx(TagInput, {
                                tags: skills,
                                onChange: setSkills,
                                placeholder: "e.g. React, Python, System Design…",
                                disabled: false,
                                colorClass: "badge-cyan"
                            }) : /*#__PURE__*/ _jsx("div", {
                                className: "flex flex-wrap gap-2 min-h-[36px]",
                                children: skills.length > 0 ? skills.map((s)=>/*#__PURE__*/ _jsx("span", {
                                        className: "badge-cyan text-xs",
                                        children: s
                                    }, s)) : /*#__PURE__*/ _jsx("span", {
                                    className: "text-sm text-slate-400 italic font-medium",
                                    children: "No skills added yet."
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsxs("label", {
                                className: "form-label font-bold text-slate-700",
                                children: [
                                    "Target Companies",
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "ml-1 text-slate-400 font-normal text-xs",
                                        children: "(press Enter or , to add)"
                                    })
                                ]
                            }),
                            isEditing ? /*#__PURE__*/ _jsx(TagInput, {
                                tags: targetCompanies,
                                onChange: setTargetCompanies,
                                placeholder: "e.g. Google, Meta, Stripe…",
                                disabled: false,
                                colorClass: "badge-indigo"
                            }) : /*#__PURE__*/ _jsx("div", {
                                className: "flex flex-wrap gap-2 min-h-[36px]",
                                children: targetCompanies.length > 0 ? targetCompanies.map((c)=>/*#__PURE__*/ _jsx("span", {
                                        className: "badge-indigo text-xs",
                                        children: c
                                    }, c)) : /*#__PURE__*/ _jsx("span", {
                                    className: "text-sm text-slate-400 italic font-medium",
                                    children: "No target companies added yet."
                                })
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
