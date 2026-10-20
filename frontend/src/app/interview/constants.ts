/**
 * @file constants.ts (Interview Studio Shared Constants)
 * @description Centralized constant definitions shared across all Interview Studio components.
 * Contains language configuration for the Monaco Code Editor, CSS badge class mappings
 * for difficulty levels, and human-readable labels for interview type identifiers.
 */

/**
 * Language configuration map for the Monaco Code Editor panel.
 * Each entry provides:
 * - `label`: Human-readable display name used in dropdowns
 * - `monacoLang`: Monaco Editor language identifier for syntax highlighting and IntelliSense
 * - `defaultCode`: Starter boilerplate template inserted when language is selected or editor is reset
 */
export const LANGUAGE_OPTIONS: Record<string, { label: string; monacoLang: string; defaultCode: string }> = {
  python: {
    label: 'Python',
    monacoLang: 'python',
    defaultCode: '# Write your solution here\ndef solution():\n    pass\n',
  },
  java: {
    label: 'Java',
    monacoLang: 'java',
    defaultCode: 'public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
  },
  cpp: {
    label: 'C++',
    monacoLang: 'cpp',
    defaultCode: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  },
  go: {
    label: 'Go',
    monacoLang: 'go',
    defaultCode: 'package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n    fmt.Println("Hello")\n}\n',
  },
  javascript: {
    label: 'JavaScript',
    monacoLang: 'javascript',
    defaultCode: '// Write your solution here\nfunction solution() {\n\n}\n',
  },
  typescript: {
    label: 'TypeScript',
    monacoLang: 'typescript',
    defaultCode: '// Write your solution here\nfunction solution(): void {\n\n}\n',
  },
};

/**
 * CSS badge class names mapped to difficulty levels.
 * Applied to visual badges across session cards and headers.
 */
export const DIFFICULTY_BADGE: Record<string, string> = {
  easy: 'badge-green',
  medium: 'badge-yellow',
  hard: 'badge-red',
};

/**
 * Human-readable interview category labels mapped from API type identifiers.
 * Used in the header, start screen, and history table.
 */
export const TYPE_LABEL: Record<string, string> = {
  dsa: 'Data Structures & Algorithms',
  behavioral: 'Behavioral',
  system_design: 'System Design',
};
