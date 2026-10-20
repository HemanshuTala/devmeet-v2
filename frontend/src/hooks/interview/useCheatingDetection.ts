/**
 * ============================================================================
 * DevMeet Frontend - Proctoring & Anti-Cheating Violation Monitor
 * ============================================================================
 * Enforces academic and assessment integrity during live technical interviews:
 * 1. Monitored Proctoring Events:
 *    - `tab_switch`: Triggered when document visibility changes (`document.hidden`)
 *      or the browser window loses focus (`window.onblur`).
 *    - `paste`: Triggered when clipboard paste operations occur in code or text inputs.
 * 2. Progressive Disciplinary Policy:
 *    - Violations 1 to 3: Displays an inescapable warning modal dialog with current penalty count.
 *    - 4th Violation: Automatically terminates the interview immediately (`total >= 4`),
 *      forces session completion, and navigates candidate to the feedback report with zero score.
 * 3. Server-Side Audit Synchronization:
 *    - Posts violation events immediately to `POST /api/v1/sessions/:id/cheating`
 *      to ensure the cheating record is persisted on the backend database even if the candidate
 *      attempts to kill the browser process.
 * ============================================================================
 */

import { useState, useCallback, useRef } from 'react';
import { sessionApi } from '@/lib/api';

/**
 * State container for cheating violation counts and warning dialogs.
 */
interface CheatingState {
  tabSwitchCount: number;
  pasteCount: number;
  showViolationModal: boolean;
  violationMessage: string;
}

/**
 * Custom React hook monitoring candidate proctoring violations and enforcing threshold bans.
 *
 * @param sessionId - Active interview session UUID string.
 * @param opts - Lifecycle callbacks and timer controls.
 */
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
  // Ref preventing duplicate dialog triggers while modal is already active
  const showViolationRef = useRef(false);

  /**
   * Reports a proctoring violation to backend and displays modal warning.
   *
   * @param type - Violation type ('tab_switch' | 'paste').
   * @param customMessage - Optional descriptive warning text.
   */
  const triggerCheatingViolation = useCallback(
    async (type: 'tab_switch' | 'paste', customMessage?: string) => {
      // Ignore redundant tab switch alerts if modal is already open
      if (type === 'tab_switch' && showViolationRef.current) return;
      if (!sessionId) return;

      try {
        // Sync violation to orchestrator backend
        const updated = await sessionApi.reportCheating(sessionId, type);
        opts.onSessionUpdate?.(updated);
        const newTab = updated.tab_switch_count ?? 0;
        const newPaste = updated.paste_count ?? 0;
        setTabSwitchCount(newTab);
        setPasteCount(newPaste);
        const total = newTab + newPaste;

        // Auto-terminate session on 4th strike
        if (total >= 4) {
          opts.stopTimer();
          opts.stopHeartbeat();
          await sessionApi.complete(sessionId, opts.elapsedSeconds);
          opts.onAutoTerminate?.();
          return;
        }

        // Display warning modal for strikes 1-3
        const msg =
          customMessage ||
          (type === 'tab_switch'
            ? `Warning: You left the interview window/tab. Tab switching is strictly prohibited during the interview. (Violations: ${total}/3)`
            : `Warning: Copy-pasting is disabled during the interview. Please type your responses. (Violations: ${total}/3)`);
        setViolationMessage(msg);
        setShowViolationModal(true);
        showViolationRef.current = true;
      } catch {
        // Fallback optimistic increment if backend network call fails
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

  /**
   * Dismisses the active violation warning modal dialog.
   */
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
