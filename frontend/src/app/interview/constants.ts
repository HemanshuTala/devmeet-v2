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

export const DIFFICULTY_BADGE: Record<string, string> = {
  easy: 'badge-green',
  medium: 'badge-yellow',
  hard: 'badge-red',
};

export const TYPE_LABEL: Record<string, string> = {
  dsa: 'Data Structures & Algorithms',
  behavioral: 'Behavioral',
  system_design: 'System Design',
};
