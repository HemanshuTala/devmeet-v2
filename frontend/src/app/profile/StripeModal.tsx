import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { X, CreditCard, CheckCircle, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
export default function StripeModal({ showStripeModal, setShowStripeModal, stripeLoading, stripeSuccess, handleSimulateStripePay }) {
    if (!showStripeModal) return null;
    return /*#__PURE__*/ _jsx("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm",
        children: /*#__PURE__*/ _jsxs("div", {
            className: "w-full max-w-md bg-white border border-blue-200 p-6 rounded-2xl shadow-2xl relative animate-fade-in-up",
            children: [
                /*#__PURE__*/ _jsx("button", {
                    onClick: ()=>!stripeLoading && setShowStripeModal(false),
                    className: "absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors",
                    disabled: stripeLoading,
                    children: /*#__PURE__*/ _jsx(X, {
                        className: "w-5 h-5"
                    })
                }),
                /*#__PURE__*/ _jsxs("div", {
                    className: "flex items-center gap-2 mb-2",
                    children: [
                        /*#__PURE__*/ _jsx(CreditCard, {
                            className: "w-6 h-6 text-blue-500"
                        }),
                        /*#__PURE__*/ _jsx("h3", {
                            className: "text-lg font-bold text-slate-900",
                            children: "Upgrade to Pro"
                        })
                    ]
                }),
                /*#__PURE__*/ _jsx("p", {
                    className: "text-xs text-slate-500 font-medium mb-6",
                    children: "Secure checkout powered by Stripe — no card details stored on our servers."
                }),
                stripeSuccess ? /*#__PURE__*/ _jsxs("div", {
                    className: "flex flex-col items-center justify-center py-8 text-center",
                    children: [
                        /*#__PURE__*/ _jsx(CheckCircle, {
                            className: "w-16 h-16 text-emerald-500 mb-4"
                        }),
                        /*#__PURE__*/ _jsx("h4", {
                            className: "text-lg font-bold text-slate-900",
                            children: "Redirecting to Stripe…"
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            className: "text-slate-500 text-xs mt-1 font-medium",
                            children: "You will be redirected to the Stripe Checkout page momentarily."
                        })
                    ]
                }) : /*#__PURE__*/ _jsxs("form", {
                    onSubmit: handleSimulateStripePay,
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            className: "bg-blue-50 border border-blue-200 rounded-xl p-4 flex justify-between items-center text-sm text-blue-700 font-semibold",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    children: [
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "font-bold text-slate-800",
                                            children: "DevMeet Pro"
                                        }),
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "text-xs text-slate-500 font-medium mt-0.5",
                                            children: "Monthly subscription — cancel anytime"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "font-bold text-lg text-slate-900",
                                    children: [
                                        "$19",
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "text-xs text-slate-500 font-semibold",
                                            children: "/mo"
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsx("ul", {
                            className: "space-y-2 text-sm text-slate-700",
                            children: [
                                "Unlimited daily interviews",
                                "AI-powered adaptive questioning",
                                "DSA hints with feedback scoring",
                                "Full PDF feedback reports",
                                "Priority AI response speed"
                            ].map((feat)=>/*#__PURE__*/ _jsxs("li", {
                                    className: "flex items-center gap-2 font-medium",
                                    children: [
                                        /*#__PURE__*/ _jsx(CheckCircle, {
                                            className: "w-4 h-4 text-emerald-500 shrink-0"
                                        }),
                                        feat
                                    ]
                                }, feat))
                        }),
                        /*#__PURE__*/ _jsxs("div", {
                            className: "flex items-center gap-2 text-[11px] text-slate-400 font-medium pt-1",
                            children: [
                                /*#__PURE__*/ _jsx(ShieldCheck, {
                                    className: "w-3.5 h-3.5 shrink-0"
                                }),
                                "256-bit SSL encrypted \xb7 PCI DSS compliant \xb7 Powered by Stripe"
                            ]
                        }),
                        /*#__PURE__*/ _jsx("button", {
                            type: "submit",
                            className: "btn-primary w-full mt-2 flex items-center justify-center gap-2 py-3",
                            disabled: stripeLoading,
                            id: "stripe-checkout-btn",
                            children: stripeLoading ? /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsx(Loader2, {
                                        className: "w-4 h-4 animate-spin"
                                    }),
                                    "Opening Stripe Checkout…"
                                ]
                            }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsx(ExternalLink, {
                                        className: "w-4 h-4"
                                    }),
                                    "Continue to Stripe Checkout"
                                ]
                            })
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            className: "text-center text-[10px] text-slate-400 font-medium",
                            children: "You will be redirected to Stripe's secure checkout page."
                        })
                    ]
                })
            ]
        })
    });
}
