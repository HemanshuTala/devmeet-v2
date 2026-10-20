'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Browser Text-to-Speech (TTS) Voice Synthesizer
 * ============================================================================
 * Coordinates client-side voice synthesis for the AI interviewer using the native
 * HTML5 Web Speech API (`window.speechSynthesis`).
 *
 * Key Architectural Responsibilities:
 * 1. Autoplay Policy Bypassing (`unlockAudio`):
 *    - Modern browsers (Chrome, Safari) restrict audio playback before user gestures.
 *    - Synthesizes a 0-volume silent utterance on first user click to unlock AudioContext.
 * 2. Voice Selection Heuristics:
 *    - Queries available client voices via `getVoices()`.
 *    - Prioritizes modern "Natural" or "Neural" high-fidelity English voices over mechanical fallbacks.
 * 3. Graceful Degradation:
 *    - Safely checks for SSR/Node environments (`typeof window !== 'undefined'`).
 *    - Catches synthesis errors to guarantee voice failures never crash the interview session.
 * ============================================================================
 */

// ─── Module State ────────────────────────────────────────────────────────────

let _utterance: SpeechSynthesisUtterance | null = null;
let _audioUnlocked = false;

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Checks whether the browser runtime supports Web Speech API synthesis.
 *
 * @returns True if running in browser with speechSynthesis support.
 */
function isSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined'
  );
}

/**
 * Unlocks the browser audio context to permit subsequent programmatic speech synthesis.
 * Must be triggered inside a trusted user event (e.g. "Start Interview" button click).
 */
export function unlockAudio(): void {
  if (!isSpeechAvailable() || _audioUnlocked) return;

  try {
    // Speak an empty string silently — satisfies browser user gesture requirement
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
    _audioUnlocked = true;
  } catch {
    // Ignore non-fatal audio context initialization failures
  }
}

/**
 * Immediately cancels any active or queued speech utterance.
 * Used when the candidate interrupts the AI or clicks "Next Question".
 */
export function stopSpeaking(): void {
  if (!isSpeechAvailable()) return;

  try {
    window.speechSynthesis.cancel();
    _utterance = null;
  } catch {
    // Ignore cancellation errors
  }
}

/**
 * Synthesizes and reads text aloud using the best available browser voice.
 * Cancels any existing playback before starting.
 *
 * @param text - Plain text message for the AI interviewer to speak.
 * @param options - Optional speech rate, pitch, volume, and BCP-47 language tag.
 */
export function speak(
  text: string,
  options?: {
    rate?: number;   // Speed: 0.1 to 10 (default 1)
    pitch?: number;  // Pitch: 0 to 2 (default 1)
    volume?: number; // Volume: 0 to 1 (default 1)
    lang?: string;   // Language code (default 'en-US')
  }
): void {
  if (!isSpeechAvailable()) return;
  if (!text || !text.trim()) return;

  try {
    // Cancel any ongoing speech first
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = options?.rate   ?? 1;
    utterance.pitch  = options?.pitch  ?? 1;
    utterance.volume = options?.volume ?? 1;
    utterance.lang   = options?.lang   ?? 'en-US';

    // Query installed voices and select optimal natural voice
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prefer an English voice with "Natural" or "Neural" in the title
      const preferred =
        voices.find((v) => v.lang.startsWith('en') && /natural|neural/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith('en')) ??
        voices[0];
      utterance.voice = preferred;
    }

    utterance.onerror = () => {
      _utterance = null;
    };
    utterance.onend = () => {
      _utterance = null;
    };

    _utterance = utterance;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Non-critical — TTS failure should never crash the interview
    _utterance = null;
  }
}
