'use client';

/* __next_internal_client_entry_do_not_use__ SecuritySection auto */ import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Shield, Mail, Smartphone, Loader2, CheckCircle, Copy } from "lucide-react";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
export function SecuritySection() {
    const [emailOtp, setEmailOtp] = useState("");
    const [emailSending, setEmailSending] = useState(false);
    const [emailVerifying, setEmailVerifying] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const [mfaEnrolling, setMfaEnrolling] = useState(false);
    const [mfaUri, setMfaUri] = useState(null);
    const [mfaSecret, setMfaSecret] = useState(null);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [mfaVerifying, setMfaVerifying] = useState(false);
    const [backupCodes, setBackupCodes] = useState(null);
    const [disableCode, setDisableCode] = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    useEffect(()=>{
        if (resendCooldown <= 0) return;
        const t = setInterval(()=>setResendCooldown((c)=>Math.max(0, c - 1)), 1000);
        return ()=>clearInterval(t);
    }, [
        resendCooldown
    ]);
    const handleSendVerification = async ()=>{
        if (resendCooldown > 0) return;
        setEmailSending(true);
        try {
            const res = await authApi.requestEmailVerification();
            toast.success(res.message);
            setResendCooldown(60);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to send verification email";
            toast.error(msg);
            const match = msg.match(/wait (\d+) seconds/i);
            if (match) setResendCooldown(parseInt(match[1], 10));
        } finally{
            setEmailSending(false);
        }
    };
    const handleConfirmEmail = async ()=>{
        if (!emailOtp.trim()) return;
        setEmailVerifying(true);
        try {
            await authApi.confirmEmailVerification(emailOtp.trim());
            setEmailVerified(true);
            toast.success("Email verified successfully");
            setEmailOtp("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Invalid verification code");
        } finally{
            setEmailVerifying(false);
        }
    };
    const handleEnableMfa = async ()=>{
        setMfaEnrolling(true);
        try {
            const res = await authApi.enableMfa();
            setMfaUri(res.provisioning_uri);
            setMfaSecret(res.secret);
            toast.info("Scan the QR URI in your authenticator app, then enter the 6-digit code.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "MFA enrollment failed");
        } finally{
            setMfaEnrolling(false);
        }
    };
    const handleConfirmMfa = async ()=>{
        if (!mfaCode.trim()) return;
        setMfaVerifying(true);
        try {
            await authApi.verifyMfaEnrollment(mfaCode.trim());
            setMfaEnabled(true);
            setMfaUri(null);
            setMfaCode("");
            const codes = await authApi.getMfaBackupCodes();
            setBackupCodes(codes.backup_codes);
            toast.success("Two-factor authentication enabled");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Invalid authenticator code");
        } finally{
            setMfaVerifying(false);
        }
    };
    const handleDisableMfa = async ()=>{
        if (!disableCode.trim()) return;
        try {
            await authApi.disableMfa(disableCode.trim());
            setMfaEnabled(false);
            setBackupCodes(null);
            setDisableCode("");
            toast.success("Two-factor authentication disabled");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to disable MFA");
        }
    };
    return /*#__PURE__*/ _jsxs("div", {
        className: "bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-6",
        children: [
            /*#__PURE__*/ _jsxs("h3", {
                className: "text-slate-900 font-bold text-base flex items-center gap-2",
                children: [
                    /*#__PURE__*/ _jsx(Shield, {
                        className: "w-4 h-4 text-blue-600"
                    }),
                    "Security (AUTH-06, AUTH-09)"
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "space-y-3 pb-6 border-b border-slate-100",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-2 text-sm font-semibold text-slate-700",
                        children: [
                            /*#__PURE__*/ _jsx(Mail, {
                                className: "w-4 h-4 text-blue-500"
                            }),
                            "Email Verification",
                            emailVerified && /*#__PURE__*/ _jsxs("span", {
                                className: "inline-flex items-center gap-1 text-xs text-emerald-600 font-bold",
                                children: [
                                    /*#__PURE__*/ _jsx(CheckCircle, {
                                        className: "w-3.5 h-3.5"
                                    }),
                                    " Verified"
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "text-xs text-slate-500",
                        children: "Receive a 6-digit OTP valid for 24 hours (AUTH-06)."
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "flex flex-wrap gap-2",
                        children: /*#__PURE__*/ _jsxs(Button, {
                            variant: "outline",
                            size: "default",
                            className: "px-5 h-10 rounded-xl text-sm font-semibold border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu",
                            onClick: handleSendVerification,
                            disabled: emailSending || resendCooldown > 0,
                            children: [
                                emailSending ? /*#__PURE__*/ _jsx(Loader2, {
                                    className: "w-4 h-4 animate-spin mr-1"
                                }) : null,
                                resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send Verification Code"
                            ]
                        })
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex gap-2 max-w-sm",
                        children: [
                            /*#__PURE__*/ _jsx(Input, {
                                placeholder: "Enter 6-digit OTP",
                                value: emailOtp,
                                onChange: (e)=>setEmailOtp(e.target.value),
                                maxLength: 6,
                                className: "h-10 rounded-xl"
                            }),
                            /*#__PURE__*/ _jsx(Button, {
                                size: "default",
                                variant: "gradient",
                                className: "px-5 h-10 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu",
                                onClick: handleConfirmEmail,
                                disabled: emailVerifying,
                                children: emailVerifying ? /*#__PURE__*/ _jsx(Loader2, {
                                    className: "w-4 h-4 animate-spin mr-1"
                                }) : "Verify"
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "space-y-3",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-2 text-sm font-semibold text-slate-700",
                        children: [
                            /*#__PURE__*/ _jsx(Smartphone, {
                                className: "w-4 h-4 text-blue-500"
                            }),
                            "Two-Factor Authentication (TOTP)",
                            mfaEnabled && /*#__PURE__*/ _jsxs("span", {
                                className: "inline-flex items-center gap-1 text-xs text-emerald-600 font-bold",
                                children: [
                                    /*#__PURE__*/ _jsx(CheckCircle, {
                                        className: "w-3.5 h-3.5"
                                    }),
                                    " Enabled"
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "text-xs text-slate-500",
                        children: "Use Google Authenticator or similar app (AUTH-09)."
                    }),
                    !mfaEnabled && !mfaUri && /*#__PURE__*/ _jsxs(Button, {
                        variant: "outline",
                        size: "default",
                        className: "px-5 h-10 rounded-xl text-sm font-semibold border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu",
                        onClick: handleEnableMfa,
                        disabled: mfaEnrolling,
                        children: [
                            mfaEnrolling ? /*#__PURE__*/ _jsx(Loader2, {
                                className: "w-4 h-4 animate-spin mr-1"
                            }) : null,
                            "Enable 2FA"
                        ]
                    }),
                    mfaUri && /*#__PURE__*/ _jsxs("div", {
                        className: "space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4",
                        children: [
                            /*#__PURE__*/ _jsx(Label, {
                                className: "text-xs font-semibold text-slate-600",
                                children: "Provisioning URI (paste in authenticator)"
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex gap-2",
                                children: [
                                    /*#__PURE__*/ _jsx(Input, {
                                        readOnly: true,
                                        value: mfaUri,
                                        className: "text-xs font-mono h-10 rounded-xl"
                                    }),
                                    /*#__PURE__*/ _jsx(Button, {
                                        type: "button",
                                        variant: "outline",
                                        size: "icon",
                                        className: "h-10 w-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300 transition-all duration-200",
                                        onClick: ()=>{
                                            navigator.clipboard.writeText(mfaUri);
                                            toast.success("URI copied");
                                        },
                                        children: /*#__PURE__*/ _jsx(Copy, {
                                            className: "w-4 h-4"
                                        })
                                    })
                                ]
                            }),
                            mfaSecret && /*#__PURE__*/ _jsxs("p", {
                                className: "text-xs text-slate-500",
                                children: [
                                    "Manual secret: ",
                                    /*#__PURE__*/ _jsx("code", {
                                        className: "font-mono bg-white px-1 rounded",
                                        children: mfaSecret
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex gap-2 max-w-xs",
                                children: [
                                    /*#__PURE__*/ _jsx(Input, {
                                        placeholder: "6-digit code",
                                        value: mfaCode,
                                        onChange: (e)=>setMfaCode(e.target.value),
                                        maxLength: 6,
                                        className: "h-10 rounded-xl"
                                    }),
                                    /*#__PURE__*/ _jsx(Button, {
                                        size: "default",
                                        variant: "gradient",
                                        className: "px-5 h-10 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu",
                                        onClick: handleConfirmMfa,
                                        disabled: mfaVerifying,
                                        children: mfaVerifying ? /*#__PURE__*/ _jsx(Loader2, {
                                            className: "w-4 h-4 animate-spin mr-1"
                                        }) : "Confirm"
                                    })
                                ]
                            })
                        ]
                    }),
                    backupCodes && /*#__PURE__*/ _jsxs("div", {
                        className: "rounded-xl border border-amber-200 bg-amber-50/50 p-4",
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "text-xs font-bold text-amber-800 mb-2",
                                children: "Save these backup codes — shown once:"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "grid grid-cols-2 gap-1 font-mono text-xs text-amber-900",
                                children: backupCodes.map((c)=>/*#__PURE__*/ _jsx("span", {
                                        children: c
                                    }, c))
                            })
                        ]
                    }),
                    mfaEnabled && /*#__PURE__*/ _jsxs("div", {
                        className: "flex gap-2 max-w-xs pt-2",
                        children: [
                            /*#__PURE__*/ _jsx(Input, {
                                placeholder: "Code to disable 2FA",
                                value: disableCode,
                                onChange: (e)=>setDisableCode(e.target.value),
                                className: "h-10 rounded-xl"
                            }),
                            /*#__PURE__*/ _jsx(Button, {
                                variant: "outline",
                                size: "default",
                                className: "px-5 h-10 rounded-xl text-sm font-semibold border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu",
                                onClick: handleDisableMfa,
                                children: "Disable"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
