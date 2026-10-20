/**
 * ============================================================================
 * DevMeet Frontend - Hybrid Speech-to-Text (STT) Voice Input Hook
 * ============================================================================
 * Enables voice dictation for candidate answers during live interview sessions.
 *
 * Dual-Engine Architectural Strategy:
 * 1. Primary Engine: Browser-Native Web Speech API (`webkitSpeechRecognition`):
 *    - Zero-latency, zero-cost, streaming interim transcript results.
 *    - As the candidate speaks, updates the input buffer in real-time.
 * 2. Secondary Engine: MediaRecorder + Server-Side Whisper AI Fallback:
 *    - If Web Speech API is unsupported (Firefox, older Safari) or errors:
 *      captures microphone audio via `navigator.mediaDevices.getUserMedia()`,
 *      packages audio chunks into a Blob, and posts to `aiApi.transcribeAudio()`.
 *    - Filters common Whisper hallucination tokens ('thanks for watching', 'subtitled by').
 * ============================================================================
 */

import { useState, useCallback, useRef } from 'react';
import { aiApi } from '@/lib/api';
import { speak, stopSpeaking } from '@/lib/speech';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

/**
 * Custom React hook managing microphone recording and dual-engine speech recognition.
 */
export function useSpeechRecognition() {
  // True while microphone is actively recording/listening
  const [isListening, setIsListening] = useState(false);
  // True while server-side audio transcription is processing
  const [isTranscribing, setIsTranscribing] = useState(false);

  // References to active recognition and recorder objects
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  /**
   * Immediately halts active audio recording and releases hardware microphone tracks.
   */
  const stopRecording = useCallback(() => {
    // Halt native WebSpeech engine
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    // Halt MediaRecorder stream
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch {}
      rec.stream.getTracks().forEach((t) => t.stop());
    }
    mediaRecorderRef.current = null;
    setIsListening(false);
    setIsTranscribing(false);
  }, []);

  /**
   * Toggles microphone recording on/off.
   *
   * @param opts.isAiTyping - Boolean flag indicating if AI is currently streaming (prevents interruptions).
   * @param opts.onTranscript - Callback delivering finalized transcribed text.
   * @param opts.onError - Callback reporting error messages.
   */
  const toggleSpeechRecognition = useCallback(
    async (opts: {
      isAiTyping: boolean;
      onTranscript: (text: string) => void;
      onError: (msg: string) => void;
    }) => {
      // Prevent mic activation while transcribing or while AI is speaking/typing
      if (isTranscribing || opts.isAiTyping) return;

      if (isListening) {
        stopRecording();
        return;
      }

      // Silence any AI voice playback when candidate begins speaking
      stopSpeaking();

      // ── Option A: Native Web Speech API (Instant, No API Key, Free) ─────────
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          let baseInputText = '';

          recognition.onstart = () => {
            baseInputText = '';
          };

          recognition.onresult = (event: any) => {
            let finalStr = '';
            let interimStr = '';
            for (let i = 0; i < event.results.length; ++i) {
              const res = event.results[i];
              if (res.isFinal) {
                finalStr += res[0].transcript + ' ';
              } else {
                interimStr += res[0].transcript;
              }
            }
            const speechText = (finalStr + interimStr).trim();
            if (speechText) {
              opts.onTranscript(speechText);
            }
          };

          recognition.onerror = (event: any) => {
            if (event.error === 'not-allowed') {
              opts.onError('Microphone access denied. Please allow microphone permissions in your browser.');
            } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
              // Gracefully fallback to MediaRecorder if native WebSpeech fails
              console.warn('WebSpeech API notice:', event.error);
            }
            setIsListening(false);
          };

          recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
          };

          recognition.start();
          recognitionRef.current = recognition;
          setIsListening(true);
          return;
        } catch (e) {
          console.warn('Native WebSpeech failed, using MediaRecorder fallback:', e);
        }
      }

      // ── Option B: MediaRecorder + Server Endpoint Fallback ───────────────────
      audioChunksRef.current = [];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mimeType = '';
        for (const type of ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = (e) => {
          if (e.data?.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const type = mimeType || 'audio/webm';
          const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
          const blob = new Blob(audioChunksRef.current, { type });
          if (blob.size < 1000) return;

          setIsTranscribing(true);
          try {
            const formData = new FormData();
            formData.append('file', blob, `candidate_speech.${ext}`);
            // Issue request to AI Interviewer transcription endpoint
            const response = await aiApi.transcribeAudio(formData);
            if (response?.text) {
              const text = response.text.trim();
              const lower = text.toLowerCase().replace(/[.,\/#!$%^&*;:{}=\-_`~()]/g, '').trim();
              // Filter known Whisper hallucinations on silent background audio
              const hallucinations = ['thank you', 'thanks for watching', 'subtitled by', 'subscribe', 'you', 'h'];
              if (text && !hallucinations.includes(lower)) {
                opts.onTranscript(text);
              }
            }
          } catch (err: any) {
            opts.onError(`Audio transcription server error: ${err.message || 'Check microphone or API key'}`);
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsListening(true);
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          opts.onError('Microphone access denied. Please allow microphone access in browser settings.');
        } else {
          opts.onError(`Failed to access microphone: ${err.message || 'unknown error'}`);
        }
        setIsListening(false);
      }
    },
    [isListening, isTranscribing, stopRecording],
  );

  return { isListening, isTranscribing, toggleSpeechRecognition, stopRecording, mediaRecorderRef };
}
