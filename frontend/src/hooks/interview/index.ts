/**
 * ============================================================================
 * DevMeet Frontend - Interview Session Custom Hooks Barrel Export
 * ============================================================================
 * Centralizes exports for interview-specific reactive hooks:
 * - `useSessionTimer`: Stopwatch, countdowns, and warning threshold alerts.
 * - `useCheatingDetection`: Proctoring monitor for tab switches and copy/paste violations.
 * - `useAIStreaming`: Server-Sent Events (SSE) reader for streaming LLM questions.
 * - `useSpeechRecognition`: Web Speech API STT listener for voice-to-text answers.
 * ============================================================================
 */

export { useSessionTimer } from './useSessionTimer';
export { useCheatingDetection } from './useCheatingDetection';
export { useAIStreaming } from './useAIStreaming';
export { useSpeechRecognition } from './useSpeechRecognition';
