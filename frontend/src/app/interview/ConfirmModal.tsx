import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export default function ConfirmModal({ onConfirm, onCancel, isLoading }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-white border border-rose-250 p-6 rounded-2xl shadow-xl max-w-md w-full mx-4 animate-scale-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-slate-900 font-bold text-lg">End Interview?</h2>
            <p className="text-slate-500 text-sm font-medium">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
          Are you sure you want to end this interview session? Your conversation history will be
          saved and you'll be redirected to the dashboard.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="btn-ghost flex-1 py-2.5 rounded-xl text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white border border-red-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <X className="w-4 h-4" />
                End Interview
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

