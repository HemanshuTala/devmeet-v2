'use client';

/**
 * speech.ts — Browser Text-to-Speech (TTS) utilities
 *
 * Uses the Web Speech API (SpeechSynthesis) which is available in all
 * modern browsers. Falls back gracefully when the API is unavailable
 * (e.g., SSR, older browsers, automated tests).
 */

// ─── Internal state ──────────────────────────────────────────────────────────

let _utterance: SpeechSynthesisUtterance | null = null;
let _audioUnlocked = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined'
  );
}

/**
 * unlockAudio
 * Must be called inside a user-gesture handler (click / keydown) before the
 * first call to speak(), to satisfy browser autoplay policies.
 */
export function unlockAudio(): void {
  if (!isSpeechAvailable() || _audioUnlocked) return;

  try {
    // Speak an empty string silently — wakes up the audio context.
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
    _audioUnlocked = true;
  } catch {
    // Ignore — not critical
  }
}

/**
 * stopSpeaking
 * Cancels any currently playing TTS utterance immediately.
 */
export function stopSpeaking(): void {
  if (!isSpeechAvailable()) return;

  try {
    window.speechSynthesis.cancel();
    _utterance = null;
  } catch {
    // Ignore
  }
}

/**
 * speak
 * Reads the given text aloud using TTS.
 * Cancels any in-progress utterance before starting a new one.
 *
 * @param text     - The text to speak.
 * @param options  - Optional overrides for voice properties.
 */
export function speak(
  text: string,
  options?: {
    rate?: number;   // 0.1 – 10,  default 1
    pitch?: number;  // 0   – 2,   default 1
    volume?: number; // 0   – 1,   default 1
    lang?: string;   // BCP 47 language tag, default 'en-US'
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

    // Pick a natural-sounding voice when available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prefer an English voice with "Natural" or "Neural" in the name
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
