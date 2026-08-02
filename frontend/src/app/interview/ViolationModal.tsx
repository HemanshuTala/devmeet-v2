'use client';

import { AlertTriangle } from 'lucide-react';

interface ViolationModalProps {
  message: string;
  onDismiss: () => void;
}

export default function ViolationModal({ message, onDismiss }: ViolationModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md px-4 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl border-2 border-red-500 max-w-md w-full shadow-2xl animate-scale-in text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4 text-red-650 shadow-sm animate-pulse">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-red-750 font-black text-xl mb-3">Security Alert</h2>
        <p className="text-slate-600 text-sm font-semibold mb-6 leading-relaxed">{message}</p>
        <div className="bg-red-50/55 rounded-xl p-3.5 border border-red-100 text-left text-xs mb-6 text-red-900 font-bold space-y-1">
          <p>• Tab switching is strictly monitored during the interview.</p>
          <p>• Copying and pasting code or answers is disabled.</p>
          <p className="text-red-750 font-extrabold">• Warning: 4 violations will result in automatic termination.</p>
        </div>
        <button
          onClick={onDismiss}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/10 transition-all"
        >
          I Understand &amp; Agree
        </button>
      </div>
    </div>
  );
}
