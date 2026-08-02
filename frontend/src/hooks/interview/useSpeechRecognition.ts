import { useState, useCallback, useRef } from 'react';
import { aiApi } from '@/lib/api';
import { speak, stopSpeaking } from '@/lib/speech';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    }
    mediaRecorderRef.current = null;
    setIsListening(false);
  }, []);

  const toggleSpeechRecognition = useCallback(
    async (opts: {
      isAiTyping: boolean;
      onTranscript: (text: string) => void;
      onError: (msg: string) => void;
    }) => {
      if (isTranscribing || opts.isAiTyping) return;

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        stopRecording();
        return;
      }

      audioChunksRef.current = [];

      try {
        stopSpeaking();
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
            const response = await aiApi.transcribeAudio(formData);
            if (response?.text) {
              const text = response.text.trim();
              const lower = text.toLowerCase().replace(/[.,\/#!$%^&*;:{}=\-_`~()]/g, '').trim();
              const hallucinations = ['thank you', 'thanks for watching', 'subtitled by', 'subscribe', 'you', 'h'];
              if (text && !hallucinations.includes(lower)) {
                opts.onTranscript(text);
              }
            }
          } catch (err: any) {
            opts.onError(`Audio transcription failed: ${err.message || 'Server error'}`);
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsListening(true);
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          opts.onError('Microphone access denied. Please allow microphone access in your browser settings.');
        } else {
          opts.onError(`Failed to access microphone: ${err.message || 'unknown error'}`);
        }
        setIsListening(false);
      }
    },
    [isTranscribing, stopRecording],
  );

  return { isListening, isTranscribing, toggleSpeechRecognition, stopRecording, mediaRecorderRef };
}
