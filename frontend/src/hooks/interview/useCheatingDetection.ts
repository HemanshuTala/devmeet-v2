import { useState, useCallback, useRef } from 'react';
import { sessionApi } from '@/lib/api';

interface CheatingState {
  tabSwitchCount: number;
  pasteCount: number;
  showViolationModal: boolean;
  violationMessage: string;
}

export function useCheatingDetection(
  sessionId: string | undefined,
  opts: {
    elapsedSeconds: number;
    stopTimer: () => void;
    stopHeartbeat: () => void;
    onAutoTerminate?: () => void;
    onSessionUpdate?: (session: any) => void;
  },
) {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pasteCount, setPasteCount] = useState(0);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');
  const showViolationRef = useRef(false);

  const triggerCheatingViolation = useCallback(
    async (type: 'tab_switch' | 'paste', customMessage?: string) => {
      if (type === 'tab_switch' && showViolationRef.current) return;
      if (!sessionId) return;

      try {
        const updated = await sessionApi.reportCheating(sessionId, type);
        opts.onSessionUpdate?.(updated);
        const newTab = updated.tab_switch_count ?? 0;
        const newPaste = updated.paste_count ?? 0;
        setTabSwitchCount(newTab);
        setPasteCount(newPaste);
        const total = newTab + newPaste;

        if (total >= 4) {
          opts.stopTimer();
          opts.stopHeartbeat();
          await sessionApi.complete(sessionId, opts.elapsedSeconds);
          opts.onAutoTerminate?.();
          return;
        }

        const msg =
          customMessage ||
          (type === 'tab_switch'
            ? `Warning: You left the interview window/tab. Tab switching is strictly prohibited during the interview. (Violations: ${total}/3)`
            : `Warning: Copy-pasting is disabled during the interview. Please type your responses. (Violations: ${total}/3)`);
        setViolationMessage(msg);
        setShowViolationModal(true);
        showViolationRef.current = true;
      } catch {
        const nextTab = type === 'tab_switch' ? tabSwitchCount + 1 : tabSwitchCount;
        const nextPaste = type === 'paste' ? pasteCount + 1 : pasteCount;
        setTabSwitchCount(nextTab);
        setPasteCount(nextPaste);
        const total = nextTab + nextPaste;
        if (total >= 4) {
          opts.stopTimer();
          opts.stopHeartbeat();
          opts.onAutoTerminate?.();
          return;
        }
        setViolationMessage(
          customMessage ||
            (type === 'tab_switch'
              ? `Warning: Tab switching is prohibited! (Violations: ${total}/3)`
              : `Warning: Copy-pasting is disabled! (Violations: ${total}/3)`),
        );
        setShowViolationModal(true);
        showViolationRef.current = true;
      }
    },
    [sessionId, opts, tabSwitchCount, pasteCount],
  );

  const dismissViolation = useCallback(() => {
    setShowViolationModal(false);
    showViolationRef.current = false;
  }, []);

  return {
    tabSwitchCount,
    setTabSwitchCount,
    pasteCount,
    setPasteCount,
    showViolationModal,
    violationMessage,
    triggerCheatingViolation,
    dismissViolation,
  };
}
