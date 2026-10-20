/**
 * @file RecordingConsentModal.tsx
 * @description GDPR-Compliant Video Recording Consent & Paywall Modal for DevMeet.
 *
 * Responsibilities:
 * 1. Plan Verification Gate:
 *    - Restricts interview session recording to 'pro' and 'enterprise' subscribers.
 *    - Displays an upgrade upsell card when a 'free' tier candidate attempts to record.
 * 2. Privacy & Compliance Disclosure:
 *    - Informs the candidate explicitly what is recorded (video, audio, transcript).
 *    - Informs how data is secured (AES-256 S3 server-side encryption).
 *    - Communicates retention policy (automatic deletion after 7 days).
 *    - Explains right to erasure (data deletion on request).
 * 3. Explicit Checkbox Consent:
 *    - Requires positive opt-in checkbox click before enabling the "Start Recording" button.
 * 4. API Dispatch:
 *    - Triggers `videoApi.startRecording(roomName, userId, true)` upon confirmed consent.
 *
 * @module components/interview/RecordingConsentModal
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  Shield,
  Clock,
  HardDrive,
  X,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { videoApi } from '@/lib/api';

/**
 * Props accepted by RecordingConsentModal.
 */
interface RecordingConsentModalProps {
  /** Flag controlling modal visibility. */
  isOpen: boolean;
  /** LiveKit video room identifier. */
  roomName: string;
  /** Authenticated user UUID. */
  userId: string;
  /** Current subscription tier ('free' | 'pro' | 'enterprise'). */
  userPlan: 'free' | 'pro' | 'enterprise';
  /** Callback fired after recording is successfully initialized on the backend. */
  onConsent: () => void;
  /** Callback fired if the user cancels, closes, or skips recording. */
  onDecline: () => void;
}

/**
 * RecordingConsentModal Component.
 *
 * @component
 * @param {RecordingConsentModalProps} props
 * @returns {JSX.Element} Portaled modal overlay.
 */
export default function RecordingConsentModal({
  isOpen,
  roomName,
  userId,
  userPlan,
  onConsent,
  onDecline,
}: RecordingConsentModalProps) {
  // Checkbox consent agreement state
  const [agreed, setAgreed] = useState(false);
  // Async submission state
  const [isStarting, setIsStarting] = useState(false);
  // Error message state
  const [error, setError] = useState<string | null>(null);

  /**
   * Dispatches recording start request to video-service after user provides consent.
   */
  const handleStart = async () => {
    if (!agreed) return;
    setIsStarting(true);
    setError(null);
    try {
      await videoApi.startRecording(roomName, userId, true);
      onConsent();
    } catch (err: any) {
      setError(err?.message || 'Failed to start recording. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  /**
   * Resets local states and notifies parent that user declined recording.
   */
  const handleClose = () => {
    setAgreed(false);
    setError(null);
    onDecline();
  };

  // If user is on the Free tier, render an upgrade promotional modal instead of recording consent
  if (userPlan === 'free') {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-8 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
                <Video className="w-7 h-7 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Pro Feature</h2>
              <p className="text-slate-500 text-sm mb-6">
                Session recording is available on the <strong>Pro</strong> and <strong>Enterprise</strong> plans.
                Upgrade to record and review your interviews later.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
                >
                  Maybe Later
                </button>
                <a
                  href="/billing"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors text-center"
                >
                  Upgrade to Pro
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Render Recording Consent Dialog for Pro/Enterprise users
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
          >
            {/* Header with pulsing recording icon */}
            <div className="px-8 pt-8 pb-5 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-slate-900 font-bold text-lg">Record This Session?</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Review your performance later</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Privacy details list */}
            <div className="px-8 py-6 space-y-4">
              <div className="space-y-3">
                {[
                  {
                    icon: <Video className="w-4 h-4 text-slate-500" />,
                    title: 'What is recorded',
                    detail: 'Your video feed, microphone audio, and the interview conversation transcript.',
                  },
                  {
                    icon: <HardDrive className="w-4 h-4 text-slate-500" />,
                    title: 'How it is stored',
                    detail: 'Encrypted and stored securely on AWS S3. Only you can access the recording.',
                  },
                  {
                    icon: <Clock className="w-4 h-4 text-slate-500" />,
                    title: 'How long it is kept',
                    detail: 'Recordings are retained for 7 days, then automatically deleted.',
                  },
                  {
                    icon: <Shield className="w-4 h-4 text-slate-500" />,
                    title: 'Your rights',
                    detail: 'You can request deletion at any time from your profile settings. Recording is optional.',
                  },
                ].map(({ icon, title, detail }) => (
                  <div key={title} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="mt-0.5 shrink-0">{icon}</div>
                    <div>
                      <p className="text-slate-800 text-sm font-semibold">{title}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Explicit Opt-In Consent Checkbox */}
              <button
                onClick={() => setAgreed((a) => !a)}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left mt-2"
                style={{
                  borderColor: agreed ? '#2563eb' : '#e2e8f0',
                  backgroundColor: agreed ? '#eff6ff' : '#f8fafc',
                }}
              >
                {agreed
                  ? <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  : <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                }
                <p className="text-sm text-slate-700">
                  I understand that this session will be recorded, and I consent to the storage and use of this
                  recording as described above. I can withdraw consent at any time.
                </p>
              </button>

              {/* Error Alert Display */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-red-600 text-xs">{error}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-8 py-5 border-t border-slate-100 flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                Skip Recording
              </button>
              <button
                id="recording-consent-confirm-btn"
                onClick={handleStart}
                disabled={!agreed || isStarting}
                className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${
                  agreed && !isStarting
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/25'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isStarting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Starting…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    Start Recording
                  </span>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
