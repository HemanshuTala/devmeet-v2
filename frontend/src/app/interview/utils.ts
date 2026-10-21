/**
 * @file utils.ts (Interview Studio Shared Utilities)
 * @description Core utility types and helper functions shared across all Interview Studio components.
 * Includes the ChatMessage data model, elapsed time formatter, conversation history hydrator,
 * and a streaming JSON question extractor for incremental AI response processing.
 */

/**
 * Represents a single conversational turn in the interview chat panel.
 */
export interface ChatMessage {
  /** Unique stable ID for React key prop and de-duplication */
  id: string;
  /** Sender role — the AI interviewer or the human candidate */
  role: 'interviewer' | 'candidate';
  /** Rendered text content of the message */
  content: string;
  /** Wall-clock timestamp of when the message was created */
  timestamp: Date;
  /** Optional progressive hints for DSA/coding problems */
  hints?: string[];
  /** Optional follow-up prompts from the AI for deeper probing */
  follow_ups?: string[];
}

/**
 * Formats total elapsed seconds into human-readable HH:MM:SS or MM:SS timer string.
 *
 * @param seconds - Total elapsed time in seconds
 * @returns Formatted duration string (e.g., "01:45" or "1:02:30")
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Converts raw conversation turns from the backend API into typed ChatMessage objects
 * suitable for rendering in the ChatPanel.
 * Handles two content formats:
 * 1. JSON payload containing a `question` key with optional hints and follow-up arrays
 * 2. Plain text string (direct question content)
 *
 * @param turns - Array of raw turn objects from the orchestrator API
 * @returns Array of typed ChatMessage objects
 */
export function turnsToMessages(turns: any[]): ChatMessage[] {
  return turns.map((t) => {
    try {
      // Attempt to parse JSON-wrapped AI response (structured evaluation format)
      const parsed = JSON.parse(t.content);
      if (parsed && typeof parsed === 'object' && parsed.question) {
        return {
          id: crypto.randomUUID(),
          role: t.role,
          content: parsed.question,
          timestamp: new Date(t.created_at || new Date()),
          hints: parsed.hints || [],
          follow_ups: parsed.follow_up_questions || [],
        };
      }
    } catch {
      // Not JSON — fall through to plain text handling
    }
    return {
      id: crypto.randomUUID(),
      role: t.role,
      content: t.content,
      timestamp: new Date(t.created_at || new Date()),
    };
  });
}

/**
 * Extracts displayable question text from a partially-streamed JSON string.
 * Used during SSE streaming so text renders incrementally as tokens arrive,
 * rather than waiting for the full JSON payload to close.
 *
 * Algorithm:
 * 1. If no JSON object is found, return the raw text as-is.
 * 2. Locate the "question" key and traverse to its string value.
 * 3. Walk character-by-character processing escape sequences until the closing quote.
 * 4. Prepend any pre-JSON preamble text if present.
 *
 * @param jsonStr - Partial or complete JSON string from a streaming AI response
 * @returns Rendered question string extracted from the stream
 */
export function extractStreamingQuestion(jsonStr: string): string {
  let trimmed = jsonStr.trim();
  // Strip opening markdown code fence if present
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '');
  const braceIdx = trimmed.indexOf('{');
  if (braceIdx === -1) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  let preText = trimmed.substring(0, braceIdx).trim();
  // Clean preText - if it's code fence characters or markdown wrapper, drop it
  preText = preText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const jsonPart = trimmed.substring(braceIdx);
  const questionKeyIdx = jsonPart.indexOf('"question"');
  if (questionKeyIdx === -1) return preText;

  const colonIdx = jsonPart.indexOf(':', questionKeyIdx);
  if (colonIdx === -1) return preText;
  const quoteIdx = jsonPart.indexOf('"', colonIdx);
  if (quoteIdx === -1) return preText;

  let content = '';
  let escaped = false;
  for (let i = quoteIdx + 1; i < jsonPart.length; i++) {
    const char = jsonPart[i];
    if (escaped) {
      // Handle common JSON escape sequences
      if (char === 'n') content += '\n';
      else if (char === 't') content += '\t';
      else content += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      // End of string value reached
      break;
    } else {
      content += char;
    }
  }
  content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return preText ? `${preText}\n\n${content}` : content;
}
