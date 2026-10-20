/**
 * ============================================================================
 * DevMeet Frontend - Real-Time AI Question Streaming & SSE Hook
 * ============================================================================
 * Coordinates real-time Server-Sent Events (SSE) token streaming from the
 * AI Interviewer microservice, dynamic typing indicators, voice synthesis (TTS),
 * and turn persistence.
 *
 * Key Architectural Responsibilities:
 * 1. Server-Sent Events (SSE) Stream Processing:
 *    - Issues `POST /api/v1/interview/question/stream` with active session context
 *      and formatted conversation dialogue history.
 *    - Reads raw byte chunks using `ReadableStreamDefaultReader` and `TextDecoder`.
 *    - Buffers partial lines, parses `data: {...}` JSON packets, and extracts streaming tokens.
 * 2. Progressive UI Rendering:
 *    - Appends incoming tokens to the active message in real-time, giving candidates
 *      an interactive, lifelike interviewer experience.
 * 3. Text-to-Speech Integration:
 *    - Once the question stream completes (`parsed.done: true`), speaks the final question
 *      aloud using `speak()` unless the candidate has muted the session (`isMuted: true`).
 * 4. Asynchronous Turn Persistence:
 *    - Saves the completed question, hints, and follow-ups to the database
 *      via `sessionApi.saveTurn()`.
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient, aiApi, sessionApi } from '@/lib/api';
import { speak } from '@/lib/speech';
import { type ChatMessage, extractStreamingQuestion } from '@/app/interview/utils';

/**
 * Custom React hook managing streaming question generation from the AI Interviewer service.
 *
 * @param opts.session - Active interview session entity.
 * @param opts.isMuted - Boolean flag indicating whether voice audio is muted.
 * @param opts.onError - Callback delivering human-readable error messages.
 */
export function useAIStreaming(opts: {
  session: any;
  isMuted: boolean;
  onError: (msg: string) => void;
}) {
  // Ordered conversation chat messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // True while tokens are streaming from the LLM
  const [isAiTyping, setIsAiTyping] = useState(false);
  // Extracted progressive hints for the current question
  const [hints, setHints] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any active streaming connection when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  /**
   * Initiates question generation and streams tokens directly into chat messages.
   *
   * @param history - Previous chat messages to maintain context.
   * @param currentSession - Optional session entity override.
   */
  const generateQuestion = useCallback(
    async (history: ChatMessage[], currentSession?: any) => {
      const activeSession = currentSession || opts.session;
      if (!activeSession) return;

      // Abort any prior in-flight stream to prevent overlapping responses
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      setIsAiTyping(true);
      opts.onError('');

      // Normalize message roles for LLM chat format (interviewer -> assistant, candidate -> user)
      const conversationHistory = history.map((m) => ({
        role: m.role === 'interviewer' ? 'assistant' : 'user',
        content: m.content,
      }));

      const payload = {
        session_id: activeSession.id,
        interview_type: activeSession.interview_type,
        difficulty: activeSession.difficulty,
        target_company: activeSession.target_company,
        focus_area: activeSession.focus_area,
        conversation_history: conversationHistory,
      };

      const { accessToken } = apiClient.getTokens();
      const streamUrl = aiApi.streamQuestionUrl();
      const streamId = crypto.randomUUID();

      // Placeholder bubble for streaming response
      setMessages((prev) => [
        ...prev,
        { id: streamId, role: 'interviewer', content: '', timestamp: new Date() },
      ]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Enforce a 60-second fetch timeout
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(streamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.detail || `HTTP ${response.status}`);
        }
        if (!response.body) throw new Error('No response body stream available.');

        // Stream reader and UTF-8 decoder
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let accumulatedText = '';
        let finalQuestion = '';
        let finalHints: string[] = [];
        let finalFollowUps: string[] = [];
        let parseErrorCount = 0;

        // Process incoming binary chunks
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Retain incomplete trailing line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith('data: ')) continue;
            const jsonStr = cleanLine.substring(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) {
                opts.onError(parsed.error);
                return;
              }
              // Progressively append token to message bubble
              if (parsed.token) {
                accumulatedText += parsed.token;
                const display = extractStreamingQuestion(accumulatedText);
                setMessages((prev) =>
                  prev.map((m) => (m.id === streamId ? { ...m, content: display } : m)),
                );
              }
              // Stream completion packet
              if (parsed.done) {
                finalQuestion = extractStreamingQuestion(parsed.question || accumulatedText);
                finalHints = parsed.hints || [];
                finalFollowUps = parsed.follow_up_questions || [];
                if (finalQuestion) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamId
                        ? {
                            ...m,
                            content: finalQuestion,
                            hints: finalHints,
                            follow_ups: finalFollowUps,
                          }
                        : m,
                    ),
                  );
                }
              }
              parseErrorCount = 0;
            } catch (err) {
              if (jsonStr.startsWith('{') && !jsonStr.endsWith('}')) {
                parseErrorCount++;
                if (parseErrorCount >= 15) throw new Error('Streaming connection dropped unexpectedly.');
              }
            }
          }
        }

        // Process any trailing bytes remaining in buffer
        if (buffer?.trim().startsWith('data: ')) {
          try {
            const parsed = JSON.parse(buffer.trim().substring(6).trim());
            if (parsed.token) {
              accumulatedText += parsed.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId ? { ...m, content: extractStreamingQuestion(accumulatedText) } : m,
                ),
              );
            }
            if (parsed.done) {
              finalQuestion = extractStreamingQuestion(parsed.question || accumulatedText);
              finalHints = parsed.hints || [];
              finalFollowUps = parsed.follow_up_questions || [];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        content: finalQuestion,
                        hints: finalHints,
                        follow_ups: finalFollowUps,
                      }
                    : m,
                ),
              );
            }
          } catch {}
        }

        if (!finalQuestion) {
          setMessages((prev) => {
            const msg = prev.find((m) => m.id === streamId);
            if (msg) finalQuestion = extractStreamingQuestion(msg.content);
            return prev;
          });
        }

        if (!finalQuestion || finalQuestion.trim().length < 10) {
          throw new Error('Received invalid or empty question from AI service.');
        }

        // Speak question via browser TTS unless candidate has muted audio
        if (!opts.isMuted) speak(finalQuestion);

        // Persist turn in backend database asynchronously
        const contentToSave =
          finalHints.length > 0 || finalFollowUps.length > 0
            ? JSON.stringify({ question: finalQuestion, hints: finalHints, follow_up_questions: finalFollowUps })
            : finalQuestion;

        sessionApi.saveTurn(activeSession.id, 'interviewer', contentToSave).catch(() => {});

        if (finalHints.length > 0) setHints(finalHints);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Failed to stream AI response.';
        opts.onError(msg);
        // Remove empty placeholder message bubble on error
        setMessages((prev) => {
          const found = prev.find((m) => m.id === streamId);
          return found && !found.content ? prev.filter((m) => m.id !== streamId) : prev;
        });
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsAiTyping(false);
      }
    },
    [opts.session, opts.isMuted],
  );

  return { messages, setMessages, isAiTyping, hints, setHints, generateQuestion };
}
