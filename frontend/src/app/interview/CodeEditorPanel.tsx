'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Code2, Play, CheckCircle, X, Terminal, ChevronDown,
  RotateCcw, Settings2, Maximize2, Minimize2, Clock,
  FlaskConical, AlertCircle, Loader2,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from './constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
    </div>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExecutionResult {
  stdout: string;
  stderr: string;
  executionTime: number;
  success: boolean;
}

interface TestCase {
  id: number;
  input: string;
  expected: string;
  description?: string;
}

interface TestCaseResult extends TestCase {
  actual: string;
  passed: boolean;
  error?: string;
  timeMs?: number;
}

interface CodeEditorPanelProps {
  code: string;
  language: string;
  isRunning: boolean;
  isSubmittingCode: boolean;
  executionResult: ExecutionResult | null;
  onCodeChange: (code: string) => void;
  onLanguageChange: (lang: string) => void;
  onRunCode: () => void;
  onSubmitCode: () => void;
  onClearResult: () => void;
  triggerCheatingViolation: (type: 'tab_switch' | 'paste') => void;
}

// ─── Default test cases per language (sample, no spoilers) ───────────────────

const DEFAULT_TEST_CASES: TestCase[] = [
  { id: 1, input: 'Example Input 1', expected: 'Expected Output 1', description: 'Basic case' },
  { id: 2, input: 'Example Input 2', expected: 'Expected Output 2', description: 'Edge case' },
  { id: 3, input: 'Example Input 3', expected: 'Expected Output 3', description: 'Corner case' },
];

// Check if code is basically the unmodified template
function isTemplateCode(code: string, language: string): boolean {
  const template = LANGUAGE_OPTIONS[language]?.defaultCode ?? '';
  const normalize = (s: string) => s.replace(/\s+/g, '').replace(/\/\/.*/g, '').replace(/#.*/g, '');
  return normalize(code) === normalize(template) || code.trim().length < 20;
}

// Parse stdout into test case results
function parseTestResults(
  stdout: string,
  stderr: string,
  testCases: TestCase[],
  executionTime: number,
  rawSuccess: boolean,
  isTemplate: boolean,
): TestCaseResult[] {
  // If template / empty code — all fail
  if (isTemplate) {
    return testCases.map((tc) => ({
      ...tc,
      actual: '',
      passed: false,
      error: 'No output — write your solution first',
      timeMs: 0,
    }));
  }

  if (stderr && !stdout) {
    return testCases.map((tc) => ({
      ...tc,
      actual: '',
      passed: false,
      error: stderr.split('\n').slice(-3).join('\n'),
      timeMs: 0,
    }));
  }

  // Try to split stdout by newlines to match test cases
  const lines = stdout.trim().split('\n').filter(Boolean);

  return testCases.map((tc, i) => {
    const actual = lines[i] ?? '';
    const passed = rawSuccess && actual.trim() === tc.expected.trim();
    return {
      ...tc,
      actual: actual || stdout || '(no output)',
      passed,
      timeMs: Math.round(executionTime / testCases.length),
    };
  });
}


// ─── Component ────────────────────────────────────────────────────────────────

export default function CodeEditorPanel({
  code,
  language,
  isRunning,
  isSubmittingCode,
  executionResult,
  onCodeChange,
  onLanguageChange,
  onRunCode,
  onSubmitCode,
  onClearResult,
  triggerCheatingViolation,
}: CodeEditorPanelProps) {
  const [fontSize, setFontSize] = useState(13);
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [tabSize, setTabSize] = useState(4);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTestCase, setActiveTestCase] = useState(0);
  const [activeResultTab, setActiveResultTab] = useState<'testcases' | 'output'>('testcases');
  const [testCases] = useState<TestCase[]>(DEFAULT_TEST_CASES);
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);
  const editorRef = useRef<any>(null);

  // Load persisted settings
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('dm_editor_theme');
    const ts = Number(localStorage.getItem('dm_editor_tab_size'));
    if (t === 'light' || t === 'vs-dark') setTheme(t);
    if (ts === 2 || ts === 4) setTabSize(ts);
  }, []);

  // Parse execution result into test case results
  useEffect(() => {
    if (!executionResult) { setTestResults(null); return; }
    const isTemplate = isTemplateCode(code, language);
    const results = parseTestResults(
      executionResult.stdout,
      executionResult.stderr,
      testCases,
      executionResult.executionTime,
      executionResult.success,
      isTemplate,
    );
    setTestResults(results);
    setActiveResultTab('testcases');
  }, [executionResult, code, language, testCases]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData.getData('text') || '';
      const limit = 50 * 1024;
      const pastedText = text.length > limit ? text.substring(0, limit) : text;
      const editor = editorRef.current;
      if (editor) {
        const sel = editor.getSelection();
        if (sel) {
          editor.executeEdits('paste', [{ range: sel, text: pastedText, forceMoveMarkers: true }]);
        } else {
          onCodeChange(code + pastedText);
        }
      } else {
        onCodeChange(code + pastedText);
      }
      triggerCheatingViolation('paste');
    },
    [code, onCodeChange, triggerCheatingViolation],
  );

  const handleReset = () => {
    onCodeChange(LANGUAGE_OPTIONS[language]?.defaultCode ?? '');
    onClearResult();
    setTestResults(null);
    setResetConfirm(false);
  };

  const passedCount = testResults?.filter((r) => r.passed).length ?? 0;
  const totalCount = testResults?.length ?? testCases.length;
  const allPassed = testResults !== null && passedCount === totalCount;
  const anyFailed = testResults !== null && passedCount < totalCount;


  return (
    <section
      className={`flex flex-col bg-[#1e1e1e] border-l border-slate-800 transition-all duration-200 ${expanded ? 'fixed inset-0 z-50' : ''}`}
      style={expanded ? {} : { width: '45%' }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#252526] border-b border-[#3c3c3c] shrink-0 flex-wrap">
        <Code2 className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-slate-300 text-xs font-bold">Code Editor</span>

        {/* Language */}
        <Select value={language} onValueChange={(v) => { onLanguageChange(v); setResetConfirm(false); setTestResults(null); }}>
          <SelectTrigger className="h-7 w-[130px] text-xs bg-[#3c3c3c] border-[#555] text-slate-200 hover:bg-[#4c4c4c]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#252526] border-[#3c3c3c] text-slate-200">
            {Object.keys(LANGUAGE_OPTIONS).map((lang) => (
              <SelectItem key={lang} value={lang} className="text-xs hover:bg-[#3c3c3c] focus:bg-[#3c3c3c]">
                {LANGUAGE_OPTIONS[lang].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Font size */}
        <div className="flex items-center bg-[#3c3c3c] border border-[#555] rounded-md overflow-hidden">
          <button onClick={() => setFontSize((s) => Math.max(10, s - 1))} className="px-2 py-1 text-slate-400 hover:text-white hover:bg-[#4c4c4c] text-[11px] font-bold transition-colors">A−</button>
          <span className="px-2 text-[10px] text-slate-400 font-mono border-x border-[#555] select-none">{fontSize}</span>
          <button onClick={() => setFontSize((s) => Math.min(22, s + 1))} className="px-2 py-1 text-slate-400 hover:text-white hover:bg-[#4c4c4c] text-[11px] font-bold transition-colors">A+</button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => { const t = theme === 'vs-dark' ? 'light' : 'vs-dark'; setTheme(t); localStorage.setItem('dm_editor_theme', t); }}
          className="px-2 py-1 rounded-md bg-[#3c3c3c] border border-[#555] text-[10px] text-slate-400 hover:text-white font-bold transition-colors"
          title="Toggle theme"
        >
          {theme === 'vs-dark' ? '☀' : '🌙'}
        </button>

        {/* Reset */}
        {resetConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-amber-400 font-bold">Reset?</span>
            <button onClick={handleReset} className="text-[10px] px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded transition-colors">Yes</button>
            <button onClick={() => setResetConfirm(false)} className="text-[10px] px-2 py-0.5 bg-[#3c3c3c] text-slate-400 rounded transition-colors">No</button>
          </div>
        ) : (
          <button onClick={() => setResetConfirm(true)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[#3c3c3c] border border-[#555] text-slate-400 hover:text-amber-400 hover:border-amber-600 font-bold transition-all">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 font-mono">{code.split('\n').length}L</span>
          <button onClick={() => setExpanded((e) => !e)} className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors" title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Monaco Editor ── */}
      <div className="flex-1 overflow-hidden min-h-0" onPasteCapture={handlePaste}>
        <MonacoEditor
          height="100%"
          language={LANGUAGE_OPTIONS[language]?.monacoLang ?? 'python'}
          value={code}
          onChange={(val) => onCodeChange(val ?? '')}
          theme={theme}
          onMount={(editor) => { editorRef.current = editor; }}
          options={{
            fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'gutter',
            padding: { top: 12, bottom: 12 },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            tabSize,
            automaticLayout: true,
            suggest: { showKeywords: true },
            scrollbar: { vertical: 'auto', horizontal: 'auto' },
          }}
        />
      </div>

      {/* ── Bottom Panel ── */}
      <div className="shrink-0 border-t border-[#3c3c3c] bg-[#1e1e1e]" style={{ maxHeight: '280px' }}>
        {/* Run / Submit bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
          <button
            onClick={onRunCode}
            disabled={isRunning || isSubmittingCode}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
          >
            {isRunning && !isSubmittingCode
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Play className="w-3.5 h-3.5" />}
            {isRunning && !isSubmittingCode ? 'Running…' : 'Run'}
          </button>
          <button
            onClick={onSubmitCode}
            disabled={isRunning || isSubmittingCode}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
          >
            {isSubmittingCode
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle className="w-3.5 h-3.5" />}
            {isSubmittingCode ? 'Submitting…' : 'Submit'}
          </button>

          {testResults && (
            <div className={`ml-2 flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${allPassed ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700' : 'bg-rose-900/50 text-rose-400 border border-rose-800'}`}>
              {allPassed ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {passedCount}/{totalCount} Passed
            </div>
          )}

          {executionResult && (
            <div className="ml-auto flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] text-slate-500 font-mono">{executionResult.executionTime.toFixed(0)}ms</span>
              <button onClick={() => { onClearResult(); setTestResults(null); }} className="p-1 text-slate-600 hover:text-slate-300 transition-colors" title="Clear results">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Test Cases / Output Tabs */}
        <div className="flex border-b border-[#3c3c3c]">
          <button
            onClick={() => setActiveResultTab('testcases')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeResultTab === 'testcases' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <FlaskConical className="w-3.5 h-3.5" /> Test Cases
          </button>
          <button
            onClick={() => setActiveResultTab('output')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeResultTab === 'output' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <Terminal className="w-3.5 h-3.5" /> Output
          </button>
        </div>

        {/* Test Cases Panel */}
        {activeResultTab === 'testcases' && (
          <div className="flex overflow-hidden" style={{ height: '180px' }}>
            {/* Case list */}
            <div className="w-32 shrink-0 border-r border-[#3c3c3c] overflow-y-auto">
              {testCases.map((tc, i) => {
                const result = testResults?.[i];
                return (
                  <button
                    key={tc.id}
                    onClick={() => setActiveTestCase(i)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors text-left ${activeTestCase === i ? 'bg-[#2d2d2d] text-white' : 'text-slate-400 hover:bg-[#252525] hover:text-slate-200'}`}
                  >
                    {result ? (
                      result.passed
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        : <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                    )}
                    Case {i + 1}
                  </button>
                );
              })}
            </div>

            {/* Case detail */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs font-mono">
              {(() => {
                const tc = testCases[activeTestCase];
                const result = testResults?.[activeTestCase];
                return (
                  <>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-wider font-sans mb-1">Input</p>
                      <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-slate-300 border border-[#3c3c3c]">{tc.input}</div>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[10px] uppercase tracking-wider font-sans mb-1">Expected Output</p>
                      <div className="bg-[#2d2d2d] rounded-lg px-3 py-2 text-emerald-300 border border-[#3c3c3c]">{tc.expected}</div>
                    </div>
                    {result && (
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider font-sans mb-1">Your Output</p>
                        <div className={`rounded-lg px-3 py-2 border ${result.passed ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800' : 'bg-rose-950/40 text-rose-300 border-rose-900'}`}>
                          {result.error
                            ? <span className="text-rose-400">{result.error}</span>
                            : result.actual || <span className="text-slate-600 italic">no output</span>}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Raw Output Panel */}
        {activeResultTab === 'output' && (
          <div className="h-[180px] overflow-y-auto px-4 py-3">
            {!executionResult ? (
              <p className="text-slate-600 text-xs font-mono italic">Run your code to see output…</p>
            ) : (
              <>
                {executionResult.stdout && (
                  <pre className="text-slate-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">{executionResult.stdout}</pre>
                )}
                {executionResult.stderr && (
                  <pre className="text-rose-400 text-xs font-mono whitespace-pre-wrap leading-relaxed mt-2">{executionResult.stderr}</pre>
                )}
                {!executionResult.stdout && !executionResult.stderr && (
                  <p className="text-slate-600 text-xs font-mono italic">No output produced.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
