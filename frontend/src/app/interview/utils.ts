export interface ChatMessage {
  id: string;
  role: 'interviewer' | 'candidate';
  content: string;
  timestamp: Date;
  hints?: string[];
  follow_ups?: string[];
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function turnsToMessages(turns: any[]): ChatMessage[] {
  return turns.map((t) => {
    try {
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
      // not JSON — fall through
    }
    return {
      id: crypto.randomUUID(),
      role: t.role,
      content: t.content,
      timestamp: new Date(t.created_at || new Date()),
    };
  });
}

export function extractStreamingQuestion(jsonStr: string): string {
  const trimmed = jsonStr.trim();
  const braceIdx = trimmed.indexOf('{');
  if (braceIdx === -1) return trimmed;

  const preText = trimmed.substring(0, braceIdx).trim();
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
      if (char === 'n') content += '\n';
      else if (char === 't') content += '\t';
      else content += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      break;
    } else {
      content += char;
    }
  }
  return preText ? `${preText}\n\n${content}` : content;
}
