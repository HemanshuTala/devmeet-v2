import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient, aiApi, sessionApi } from '@/lib/api';
import { speak } from '@/lib/speech';
import { type ChatMessage, extractStreamingQuestion } from '@/app/interview/utils';

export function useAIStreaming(opts: {
  session: any;
  isMuted: boolean;
  onError: (msg: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [hints, setHints] = useState<string[]>([]);

  const generateQuestion = useCallback(
    async (history: ChatMessage[], currentSession?: any) => {
      const activeSession = currentSession || opts.session;
      if (!activeSession) return;

      setIsAiTyping(true);
      opts.onError('');

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

      setMessages((prev) => [...prev, { id: streamId, role: 'interviewer', content: '', timestamp: new Date() }]);

      try {
        const controller = new AbortController();
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

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let accumulatedText = '';
        let finalQuestion = '';
        let finalHints: string[] = [];
        let finalFollowUps: string[] = [];
        let parseErrorCount = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith('data: ')) continue;
            const jsonStr = cleanLine.substring(6).trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.token) {
                accumulatedText += parsed.token;
                const display = extractStreamingQuestion(accumulatedText);
                setMessages((prev) => prev.map((m) => (m.id === streamId ? { ...m, content: display } : m)));
              }
              if (parsed.done) {
                finalQuestion = extractStreamingQuestion(parsed.question || accumulatedText);
                finalHints = parsed.hints || [];
                finalFollowUps = parsed.follow_up_questions || [];
                if (finalQuestion) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamId
                        ? { ...m, content: finalQuestion, hints: finalHints, follow_ups: finalFollowUps }
                        : m,
                    ),
                  );
                }
              }
              parseErrorCount = 0;
            } catch (err) {
              parseErrorCount++;
              if (parseErrorCount >= 10) throw new Error('Too many parse errors in stream.');
            }
          }
        }

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
                    ? { ...m, content: finalQuestion, hints: finalHints, follow_ups: finalFollowUps }
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

        if (!opts.isMuted) speak(finalQuestion);

        const contentToSave =
          finalHints.length > 0 || finalFollowUps.length > 0
            ? JSON.stringify({ question: finalQuestion, hints: finalHints, follow_up_questions: finalFollowUps })
            : finalQuestion;

        sessionApi.saveTurn(activeSession.id, 'interviewer', contentToSave).catch(() => {});

        if (finalHints.length > 0) setHints(finalHints);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Failed to stream AI response.';
        opts.onError(msg);
        setMessages((prev) => {
          const found = prev.find((m) => m.id === streamId);
          return found && !found.content ? prev.filter((m) => m.id !== streamId) : prev;
        });
      } finally {
        setIsAiTyping(false);
      }
    },
    [opts.session, opts.isMuted],
  );

  return { messages, setMessages, isAiTyping, hints, setHints, generateQuestion };
}
