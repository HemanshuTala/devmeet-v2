'use client';

/**
 * @file CodeEditorPanel.tsx (Interview Studio Code Editor & DSA Test Suite Runner)
 * @description Advanced Monaco development studio with automated LeetCode-style
 * multi-case test verification, syntax highlighting, theme switching, custom test case
 * editing, proctoring clipboard guards, and real execution telemetry.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Terminal,
  Loader2,
  Code2,
  Maximize2,
  Minimize2,
  X,
  FlaskConical,
  Sun,
  Moon,
  Check,
  Plus,
  Sparkles,
  Edit2,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from './constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveDSAProblem, type DSATestCase } from './dsaProblems';

/**
 * Dynamically import Monaco Editor on client-side only (disabling SSR)
 * to avoid window/document reference errors during Next.js hydration.
 */
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
    </div>
  ),
});

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Execution payload returned from the code-execution microservice.
 */
export interface ExecutionResult {
  /** Standard output stream string */
  stdout: string;
  /** Standard error or compiler diagnostics */
  stderr: string;
  /** Wall-clock execution time in milliseconds */
  executionTime: number;
  /** Overall sandbox exit code success boolean */
  success: boolean;
  /** Granular per-test outcome array when running test suites */
  testResults?: any[];
}

/**
 * Test case input/output definition for automated verification.
 */
export interface TestCase {
  id: number;
  name?: string;
  input: string;
  expected: string;
  description?: string;
  is_hidden?: boolean;
}

/**
 * Evaluated test case outcome comparing actual output vs expected.
 */
export interface TestCaseResult extends TestCase {
  actual: string;
  passed: boolean;
  error?: string;
  timeMs?: number;
}

/**
 * Props passed to CodeEditorPanel from Interview Studio.
 */
interface CodeEditorPanelProps {
  /** Current editor text content */
  code: string;
  /** Programming language identifier key */
  language: string;
  /** True while sandbox execution is processing */
  isRunning: boolean;
  /** True while submitting full code to AI interviewer evaluation */
  isSubmittingCode: boolean;
  /** Execution output received from sandbox */
  executionResult: ExecutionResult | null;
  /** Code change callback */
  onCodeChange: (code: string) => void;
  /** Language switch callback */
  onLanguageChange: (lang: string) => void;
  /** Run test suite callback with active test cases */
  onRunCode: (customTestCases?: TestCase[]) => void;
  /** Submit final code solution callback with active test cases */
  onSubmitCode: (customTestCases?: TestCase[]) => void;
  /** Reset / clear results callback */
  onClearResult: () => void;
  /** Anti-cheating proctoring violation callback */
  triggerCheatingViolation: (type: 'tab_switch' | 'paste') => void;
  /** Focus area / DSA topic name */
  topic?: string;
  /** First question message context to match problem */
  problemContext?: string;
}

/**
 * Checks whether the current editor code is identical to boilerplate template
 * or essentially empty, avoiding false positive test passes on unedited templates.
 */
function isTemplateCode(code: string, language: string): boolean {
  const template = LANGUAGE_OPTIONS[language]?.defaultCode ?? '';
  const normalize = (s: string) => s.replace(/\s+/g, '').replace(/\/\/.*/g, '').replace(/#.*/g, '');
  return normalize(code) === normalize(template) || code.trim().length < 20;
}

/**
 * Parses raw stdout and stderr from code execution sandbox into individual test case evaluations.
 */
function parseTestResults(
  stdout: string,
  stderr: string,
  testCases: TestCase[],
  executionTime: number,
  rawSuccess: boolean,
  isTemplate: boolean,
): TestCaseResult[] {
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

  const lines = stdout.trim().split('\n').filter(Boolean);

  return testCases.map((tc, i) => {
    const actual = lines[i] ?? '';
    const normActual = actual.trim().toLowerCase();
    const normExpected = tc.expected.trim().toLowerCase();
    const passed = rawSuccess && (normActual === normExpected || normActual.replace(/\s+/g, '') === normExpected.replace(/\s+/g, ''));
    return {
      ...tc,
      actual: actual || stdout || '(no output)',
      passed,
      timeMs: Math.round(executionTime / testCases.length),
    };
  });
}

/**
 * CodeEditorPanel Component.
 * Full-featured development environment with Monaco editor, real DSA test cases, and execution telemetry.
 */
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
  topic,
  problemContext,
}: CodeEditorPanelProps) {
  // Resolve problem definition from catalog
  const problem = useMemo(() => {
    return resolveDSAProblem(topic, problemContext);
  }, [topic, problemContext]);

  // Editor appearance settings
  const [fontSize, setFontSize] = useState(13);
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [tabSize, setTabSize] = useState(4);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Tab and test selection states
  const [activeTestCase, setActiveTestCase] = useState(0);
  const [activeResultTab, setActiveResultTab] = useState<'testcases' | 'output'>('testcases');
  const [testCases, setTestCases] = useState<TestCase[]>(problem.testCases);
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);

  const editorRef = useRef<any>(null);

  // Synchronize test cases and starter code when problem or language changes
  useEffect(() => {
    if (problem) {
      setTestCases(problem.testCases);
      setActiveTestCase(0);
      const starter = (problem.starterCode as any)[language] || problem.starterCode.python;
      if (starter && (isTemplateCode(code, language) || !code.trim())) {
        onCodeChange(starter);
      }
    }
  }, [problem.id, language]);

  // Load persisted editor preferences from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = localStorage.getItem('dm_editor_theme');
    const ts = Number(localStorage.getItem('dm_editor_tab_size'));
    if (t === 'light' || t === 'vs-dark') setTheme(t);
    if (ts === 2 || ts === 4) setTabSize(ts);
  }, []);

  // Compute test case results when new execution output arrives
  useEffect(() => {
    if (!executionResult) {
      setTestResults(null);
      return;
    }

    // High fidelity test runner breakdown from /api/v1/execute/run-tests
    if (executionResult.testResults && executionResult.testResults.length > 0) {
      const parsedResults: TestCaseResult[] = executionResult.testResults.map((r: any, idx: number) => {
        const tc = testCases[idx] || {
          id: idx + 1,
          name: `Case ${idx + 1}`,
          input: r.input || '',
          expected: r.expected_output || '',
        };
        const actualStr = r.actual_output !== undefined ? String(r.actual_output).trim() : '';
        const expectedStr = (tc.expected || '').trim();
        const normActual = actualStr.replace(/\s+/g, '');
        const normExpected = expectedStr.replace(/\s+/g, '');
        let isMatch = normActual !== '' && normActual === normExpected;
        if (!isMatch && normActual.startsWith('[') && normExpected.startsWith('[')) {
          try {
            const aArr = JSON.parse(normActual);
            const eArr = JSON.parse(normExpected);
            if (Array.isArray(aArr) && Array.isArray(eArr) && aArr.length === eArr.length) {
              const aSort = [...aArr].sort();
              const eSort = [...eArr].sort();
              isMatch = JSON.stringify(aSort) === JSON.stringify(eSort);
            }
          } catch (_) {}
        }
        const passed = Boolean(r.passed) || isMatch;
        return {
          ...tc,
          actual: actualStr,
          passed,
          error: r.error,
          timeMs: r.execution_time ? Math.round(r.execution_time * 1000) : undefined,
        };
      });
      setTestResults(parsedResults);
      setActiveResultTab('testcases');
      return;
    }

    // Standard stdout line parser fallback
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

  /**
   * Clipboard paste handler: proctoring guard
   */
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

  /**
   * Resets code back to the problem's starter boilerplate.
   */
  const handleReset = () => {
    const starter = (problem.starterCode as any)[language] || (LANGUAGE_OPTIONS[language]?.defaultCode ?? '');
    onCodeChange(starter);
    onClearResult();
    setTestResults(null);
    setResetConfirm(false);
  };

  /**
   * Updates input data of the currently selected testcase.
   */
  const handleUpdateTestCaseInput = (newInput: string) => {
    setTestCases((prev) => {
      const copy = [...prev];
      if (copy[activeTestCase]) {
        copy[activeTestCase] = { ...copy[activeTestCase], input: newInput };
      }
      return copy;
    });
    setTestResults(null);
  };

  /**
   * Updates expected output of the currently selected testcase.
   */
  const handleUpdateTestCaseExpected = (newExpected: string) => {
    setTestCases((prev) => {
      const copy = [...prev];
      if (copy[activeTestCase]) {
        copy[activeTestCase] = { ...copy[activeTestCase], expected: newExpected };
      }
      return copy;
    });
    setTestResults(null);
  };

  /**
   * Adds a new custom test case to the test suite.
   */
  const handleAddTestCase = () => {
    const nextId = testCases.length + 1;
    const newCase: TestCase = {
      id: nextId,
      name: `Case ${nextId}`,
      input: '',
      expected: '',
      description: 'Custom test case',
      is_hidden: false,
    };
    setTestCases([...testCases, newCase]);
    setActiveTestCase(testCases.length);
    setTestResults(null);
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
      {/* ── Toolbar: Language selector, Font sizing, Theme toggle, Reset, Fullscreen ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#252526] border-b border-[#3c3c3c] shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 text-slate-200 font-bold text-xs">
          <Code2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{problem.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 font-semibold">
            {problem.difficulty}
          </span>
        </div>

        {/* Language select dropdown */}
        <Select
          value={language}
          onValueChange={(v) => {
            onLanguageChange(v);
            setResetConfirm(false);
            setTestResults(null);
          }}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs bg-[#3c3c3c] border-[#555] text-slate-200 hover:bg-[#4c4c4c] ml-auto">
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

        {/* Font size decrement/increment controls */}
        <div className="flex items-center bg-[#3c3c3c] border border-[#555] rounded-md overflow-hidden">
          <button
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-[#4c4c4c] text-[11px] font-bold transition-colors"
          >
            A−
          </button>
          <span className="px-2 text-[10px] text-slate-400 font-mono border-x border-[#555] select-none">
            {fontSize}
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(22, s + 1))}
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-[#4c4c4c] text-[11px] font-bold transition-colors"
          >
            A+
          </button>
        </div>

        {/* Dark/Light theme toggle */}
        <button
          onClick={() => {
            const t = theme === 'vs-dark' ? 'light' : 'vs-dark';
            setTheme(t);
            localStorage.setItem('dm_editor_theme', t);
          }}
          className="px-2 py-1.5 rounded-md bg-[#3c3c3c] border border-[#555] text-slate-400 hover:text-white font-bold transition-colors flex items-center justify-center"
          title="Toggle theme"
        >
          {theme === 'vs-dark' ? <Sun className="w-3 h-3 text-amber-400" /> : <Moon className="w-3 h-3 text-blue-400" />}
        </button>

        {/* Reset starter code button */}
        {resetConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-amber-400 font-bold">Reset?</span>
            <button
              onClick={handleReset}
              className="text-[10px] px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="text-[10px] px-2 py-0.5 bg-[#3c3c3c] text-slate-400 rounded transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setResetConfirm(true)}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[#3c3c3c] border border-[#555] text-slate-400 hover:text-amber-400 hover:border-amber-600 font-bold transition-all"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}

        {/* Load Demo Solution Button */}
        {problem?.solutions && (
          <button
            type="button"
            onClick={() => {
              const sol =
                (problem.solutions as any)?.[language] ||
                problem.solutions?.python ||
                '';
              if (sol) {
                onCodeChange(sol);
                setResetConfirm(false);
              }
            }}
            className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md bg-indigo-950/60 border border-indigo-700/80 text-indigo-300 hover:bg-indigo-900/80 hover:text-white font-bold transition-all shadow-xs cursor-pointer"
            title="Load optimal solution for demo testing"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Load Solution</span>
          </button>
        )}

        {/* Fullscreen toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Monaco Editor Instance ── */}
      <div className="flex-1 overflow-hidden min-h-0" onPasteCapture={handlePaste}>
        <MonacoEditor
          height="100%"
          language={LANGUAGE_OPTIONS[language]?.monacoLang ?? 'python'}
          value={code}
          onChange={(val) => onCodeChange(val ?? '')}
          theme={theme}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
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

      {/* ── Bottom Console Panel: Action buttons, Test Cases & Terminal output ── */}
      <div className="shrink-0 border-t border-[#3c3c3c] bg-[#1e1e1e]" style={{ maxHeight: '290px' }}>
        {/* Execution trigger action bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
          <button
            onClick={() => onRunCode(testCases)}
            disabled={isRunning || isSubmittingCode}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            {isRunning && !isSubmittingCode ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            Run
          </button>

          <button
            onClick={() => onSubmitCode(testCases)}
            disabled={isRunning || isSubmittingCode}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            {isSubmittingCode ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Submit
          </button>

          {/* Test verification status badge */}
          {testResults && (
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {allPassed && (
                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/40 border border-emerald-800/80 px-2 py-0.5 rounded-md text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5" />
                  All {totalCount} Passed
                </span>
              )}
              {anyFailed && (
                <span className="flex items-center gap-1 text-rose-400 bg-rose-950/40 border border-rose-800/80 px-2 py-0.5 rounded-md text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {passedCount}/{totalCount} Passed
                </span>
              )}
            </div>
          )}

          {/* Elapsed execution time indicator */}
          {executionResult && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono">
                {executionResult.executionTime.toFixed(0)}ms
              </span>
              <button
                onClick={() => {
                  onClearResult();
                  setTestResults(null);
                }}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                title="Clear results"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tab switcher: Test Cases vs Raw Output */}
        <div className="flex border-b border-[#3c3c3c]">
          <button
            onClick={() => setActiveResultTab('testcases')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeResultTab === 'testcases' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <FlaskConical className="w-3.5 h-3.5" /> Test Cases
          </button>
          <button
            onClick={() => setActiveResultTab('output')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeResultTab === 'output' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            <Terminal className="w-3.5 h-3.5" /> Output
          </button>
        </div>

        {/* Test Cases Panel Tab */}
        {activeResultTab === 'testcases' && (
          <div className="flex overflow-hidden" style={{ height: '190px' }}>
            {/* Case selector sidebar */}
            <div className="w-36 shrink-0 border-r border-[#3c3c3c] overflow-y-auto">
              {testCases.map((tc, i) => {
                const result = testResults?.[i];
                return (
                  <button
                    key={tc.id}
                    onClick={() => setActiveTestCase(i)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors text-left ${activeTestCase === i ? 'bg-[#2d2d2d] text-white' : 'text-slate-400 hover:bg-[#252525] hover:text-slate-200'}`}
                  >
                    {result ? (
                      result.passed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                    )}
                    <span className="truncate">{tc.name || `Case ${i + 1}`}</span>
                  </button>
                );
              })}
              {/* Add custom test case button */}
              <button
                onClick={handleAddTestCase}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-blue-400 hover:bg-[#252525] hover:text-blue-300 transition-colors border-t border-[#3c3c3c]"
              >
                <Plus className="w-3 h-3" /> Add Case
              </button>
            </div>

            {/* Selected Case Inspection & Editing */}
            <div className="flex-1 overflow-y-auto px-4 py-2.5 space-y-2.5 text-xs font-mono">
              {(() => {
                const tc = testCases[activeTestCase];
                const result = testResults?.[activeTestCase];
                if (!tc) return null;

                return (
                  <>
                    {tc.description && (
                      <p className="text-[11px] text-slate-400 font-sans italic">
                        {tc.description}
                      </p>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">
                          Input
                        </span>
                        <span className="text-[10px] text-slate-500 font-sans">
                          Editable
                        </span>
                      </div>
                      <textarea
                        value={tc.input}
                        onChange={(e) => handleUpdateTestCaseInput(e.target.value)}
                        rows={Math.max(2, tc.input.split('\n').length)}
                        className="w-full bg-[#252526] rounded-md px-2.5 py-1.5 text-slate-200 border border-[#3c3c3c] focus:border-blue-500 focus:outline-hidden font-mono text-xs resize-none"
                        placeholder="e.g. gas = [1,2,3,4,5]&#10;cost = [3,4,5,1,2]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">
                          Expected Output
                        </span>
                      </div>
                      <input
                        type="text"
                        value={tc.expected}
                        onChange={(e) => handleUpdateTestCaseExpected(e.target.value)}
                        className="w-full bg-[#252526] rounded-md px-2.5 py-1.5 text-emerald-300 border border-[#3c3c3c] focus:border-blue-500 focus:outline-hidden font-mono text-xs"
                        placeholder="e.g. 3"
                      />
                    </div>

                    {result && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-semibold">
                            Your Output
                          </span>
                          {result.timeMs !== undefined && (
                            <span className="text-[10px] text-slate-400 font-sans">
                              {result.timeMs}ms
                            </span>
                          )}
                        </div>
                        <div
                          className={`rounded-md px-2.5 py-1.5 border font-mono text-xs ${result.passed ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800' : 'bg-rose-950/40 text-rose-300 border-rose-900'}`}
                        >
                          {result.error || (result.actual && result.actual.startsWith('Runtime error:')) ? (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Runtime Error</span>
                              <span className="text-rose-300 whitespace-pre-wrap">{result.error || result.actual}</span>
                            </div>
                          ) : result.actual !== undefined && result.actual !== '' ? (
                            <span>{result.actual}</span>
                          ) : (
                            <span className="text-slate-600 italic">no output</span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Raw Terminal Output Tab */}
        {activeResultTab === 'output' && (
          <div className="h-[190px] overflow-y-auto px-4 py-3">
            {!executionResult ? (
              <p className="text-slate-600 text-xs font-mono italic">
                Click Run to execute your code against test cases…
              </p>
            ) : (
              <>
                {executionResult.stdout && (
                  <pre className="text-slate-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {executionResult.stdout}
                  </pre>
                )}
                {executionResult.stderr && (
                  <pre className="text-rose-400 text-xs font-mono whitespace-pre-wrap leading-relaxed mt-2">
                    {executionResult.stderr}
                  </pre>
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
