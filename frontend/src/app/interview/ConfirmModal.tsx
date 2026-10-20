import React from 'react';
import { AlertTriangle, Award, X } from 'lucide-react';

/**
 * @file ConfirmModal.tsx (Interview Early Termination & Submission Dialog)
 * @description Modal dialog prompting the candidate to confirm when ending or submitting an interview.
 * Warns that ending will trigger LLM evaluation across conversation history, code submissions,
 * and behavioural metrics to produce the final performance scorecard.
 */

/**
 * Props for ConfirmModal component.
 */
interface ConfirmModalProps {
  /** Callback to trigger submission and grading workflow */
  onConfirm: () => void;
  /** Callback to dismiss modal and resume the active session */
  onCancel: () => void;
  /** Loading state flag while session completion is finalizing */
  isLoading: boolean;
}

/**
 * ConfirmModal Component.
 */
export default function ConfirmModal({ onConfirm, onCancel, isLoading }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-white border border-slate-200/90 p-6 md:p-7 rounded-3xl shadow-2xl max-w-md w-full mx-4 animate-scale-in">
        {/* Warning header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-slate-900 font-bold text-lg tracking-tight">Conclude Interview?</h2>
            <p className="text-slate-500 text-xs font-semibold">Generate AI evaluation & performance scorecard</p>
          </div>
        </div>

        {/* Informative description */}
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
          Are you ready to submit your interview? Your complete conversation, code solution, and responses will be evaluated to generate your comprehensive feedback report.
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Continue Interview
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Award className="w-4 h-4" />
                <span>Submit & View Report</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
