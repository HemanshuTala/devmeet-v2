"""
================================================================================
CODE EXECUTION SERVICE — AUTOMATED TEST CASE HARNESS & SUBMISSION RUNNER
================================================================================
Role & Responsibility:
  This module implements the automated test harness for candidate code submissions.
  Similar to platforms like LeetCode and HackerRank, problems are evaluated against
  a test suite consisting of:
    1. Visible Test Cases: Displayed in the candidate's browser UI with full inputs
       and expected outputs to facilitate local debugging.
    2. Hidden Test Cases: Secret evaluation tests (e.g. edge cases, large arrays,
       overflow limits, time-complexity stress tests) used exclusively for scoring.
       Inputs and expected outputs are redacted from the response to prevent cheating.

Key Features & Mechanical Value:
  - Input/Output Injection Wrapping: Injects standard input streams (`sys.stdin`,
    `std::cin`, `Scanner`, `os.Stdin`) and wraps stdout/console logging for Python,
    JavaScript, Java, C++, and Go without requiring candidates to write custom file I/O.
  - Whitespace & Formatting Normalization: Compares actual vs expected outputs using
    whitespace-agnostic token comparison, preventing false negatives caused by trailing
    newlines or spaces.
  - Granular Per-Test Timing: Measures individual test execution latency in seconds
    to flag Time Limit Exceeded (TLE) infractions.
================================================================================
"""

import asyncio
import docker
from typing import List, Dict, Any, Optional
import tempfile
import os
import json
import time
import logging
from .executor import CodeExecutor

logger = logging.getLogger("test-runner")


class TestCase:
    """
    Represents a single input/output test case for an algorithmic challenge.

    Attributes:
      input_data (str): Stdin text or function argument string to supply.
      expected_output (str): The correct reference stdout string.
      is_hidden (bool): If True, input and expected output are masked in API responses.
    """

    def __init__(self, input_data: str, expected_output: str, is_hidden: bool = False):
        self.input_data = input_data
        self.expected_output = expected_output
        self.is_hidden = is_hidden

    def to_dict(self) -> dict:
        """Serializes the test case configuration to a plain dictionary."""
        return {
            "input": self.input_data,
            "expected_output": self.expected_output,
            "is_hidden": self.is_hidden,
        }


class TestResult:
    """
    Encapsulates the execution result and pass/fail evaluation of a single test case.

    Attributes:
      test_case (TestCase): The reference test case that was run.
      passed (bool): True if candidate's output matched expected output.
      actual_output (str): Actual stdout emitted by candidate's code.
      execution_time (float): Wall-clock duration in seconds.
      error (Optional[str]): Exception traceback or error message if execution crashed.
    """

    def __init__(
        self,
        test_case: TestCase,
        passed: bool,
        actual_output: str,
        execution_time: float,
        error: str = None,
    ):
        self.test_case = test_case
        self.passed = passed
        self.actual_output = actual_output
        self.execution_time = execution_time
        self.error = error

    def to_dict(self) -> dict:
        """
        Serializes results for API responses.

        Security Note:
          If `test_case.is_hidden` is True, `input` and `expected_output` are omitted
          from the dictionary to prevent candidates from inspecting secret test cases in DevTools.
        """
        result = {
            "passed": self.passed,
            "actual_output": self.actual_output,
            "execution_time": self.execution_time,
            "is_hidden": self.test_case.is_hidden,
        }
        if self.error:
            result["error"] = self.error
        # Redact test details for hidden scoring cases
        if not self.test_case.is_hidden:
            result["input"] = self.test_case.input_data
            result["expected_output"] = self.test_case.expected_output
        return result


class TestRunner:
    """
    Orchestrator responsible for wrapping candidate code, invoking sandboxed execution,
    and compiling aggregate pass/fail scorecards.
    """

    def __init__(self):
        """Initializes the underlying Docker/subprocess CodeExecutor instance."""
        self.executor = CodeExecutor()

    async def run_test_cases(
        self,
        code: str,
        language: str,
        test_cases: List[TestCase],
        timeout: int = 10,
    ) -> Dict[str, Any]:
        """
        Executes an entire suite of test cases against the candidate's source code.

        Parameters:
          code (str): The raw code submitted by the candidate.
          language (str): Target runtime (e.g., 'python', 'javascript', 'cpp').
          test_cases (List[TestCase]): Array of test cases (visible and hidden).
          timeout (int): Per-test timeout ceiling in seconds.

        Returns:
          Dict[str, Any]: Aggregate report containing 'total_tests', 'passed', 'failed',
                          'pass_rate', 'total_execution_time', and per-test result breakdowns.
        """
        results = []
        passed_count = 0
        failed_count = 0
        total_time = 0.0

        for test_case in test_cases:
            try:
                # Execute individual test case with injected stdin
                result = await self._run_single_test(code, language, test_case, timeout)
                results.append(result)

                if result.passed:
                    passed_count += 1
                else:
                    failed_count += 1

                total_time += result.execution_time

            except Exception as e:
                logger.error(f"Test case execution failed: {e}")
                # Create synthetic failed result if sandbox failed unexpectedly
                results.append(TestResult(
                    test_case=test_case,
                    passed=False,
                    actual_output="",
                    execution_time=0,
                    error=str(e),
                ).to_dict())
                failed_count += 1

        return {
            "total_tests": len(test_cases),
            "passed": passed_count,
            "failed": failed_count,
            "pass_rate": (passed_count / len(test_cases)) * 100 if test_cases else 0,
            "total_execution_time": total_time,
            "results": [r.to_dict() if isinstance(r, TestResult) else r for r in results],
        }

    async def _run_single_test(
        self,
        code: str,
        language: str,
        test_case: TestCase,
        timeout: int,
    ) -> TestResult:
        """
        Executes a single test case by wrapping source code with stdin simulation.

        Parameters:
          code (str): Raw candidate source code.
          language (str): Programming language.
          test_case (TestCase): The specific test case to evaluate.
          timeout (int): Per-test timeout limit.

        Returns:
          TestResult: Outcome object with passed status and execution duration.
        """
        start_time = time.time()

        try:
            # Inject input stream and capture stdout
            modified_code = self._wrap_code_with_io(code, language, test_case.input_data)

            # Run in sandbox
            execution_result = await self.executor.execute_code(
                code=modified_code,
                language=language,
                timeout=timeout,
            )

            execution_time = time.time() - start_time

            # If runtime or syntax error occurred, mark test as failed
            if not execution_result.get("success"):
                return TestResult(
                    test_case=test_case,
                    passed=False,
                    actual_output=execution_result.get("output", ""),
                    execution_time=execution_time,
                    error=execution_result.get("error", "Execution failed"),
                )

            actual_output = execution_result.get("output", "").strip()
            expected_output = test_case.expected_output.strip()

            # Compare outputs with normalized whitespace
            passed = self._compare_outputs(actual_output, expected_output)

            return TestResult(
                test_case=test_case,
                passed=passed,
                actual_output=actual_output,
                execution_time=execution_time,
            )

        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Single test execution error: {e}")
            return TestResult(
                test_case=test_case,
                passed=False,
                actual_output="",
                execution_time=execution_time,
                error=str(e),
            )

    def _wrap_code_with_io(self, code: str, language: str, input_data: str) -> str:
        """
        Synthesizes language-specific wrapper code to inject `input_data` into stdin
        and intercept standard output.

        Supported Language Wrappers:
          - Python: Intercepts `sys.stdin` and `sys.stdout` via `io.StringIO`.
          - JavaScript: Injects `input` variable and wraps `console.log`.
          - Java: Injects `Scanner scanner = new Scanner(...)` around class Main.
          - C++: Redirects `std::cin` buffer via `std::istringstream`.
          - Go: Overwrites `os.Stdin` with `strings.NewReader(input)`.
        """
        language = language.lower()

        if language == "python":
            return f"""
import sys
import io
import ast
import inspect

# Capture stdout
_captured_stdout = io.StringIO()
sys.stdout = _captured_stdout

# Inject test input into stdin
_raw_stdin = {repr(input_data)}
sys.stdin = io.StringIO(_raw_stdin)

# Original candidate code
{code}

# Auto-invoke defined solution function if stdout was not printed explicitly
_stdout_content = _captured_stdout.getvalue()
if not _stdout_content.strip():
    _user_callables = [
        v for k, v in list(locals().items())
        if callable(v) and not k.startswith('_') and k not in ('sys', 'io', 'ast', 'inspect')
    ]
    if _user_callables:
        _target_fn = _user_callables[-1]
        _parsed_args = []
        for _line in _raw_stdin.strip().splitlines():
            _line = _line.strip()
            if not _line:
                continue
            _val_str = _line.split('=', 1)[1].strip() if ('=' in _line and not _line.startswith('{{')) else _line
            try:
                _parsed_args.append(ast.literal_eval(_val_str))
            except Exception:
                _parsed_args.append(_val_str)
        try:
            _sig = inspect.signature(_target_fn)
            _param_count = len(_sig.parameters)
            if _param_count == len(_parsed_args):
                _res = _target_fn(*_parsed_args)
            elif _param_count == 1 and len(_parsed_args) > 1:
                _res = _target_fn(_parsed_args)
            else:
                _res = _target_fn(*_parsed_args)
            if _res is not None:
                if isinstance(_res, bool):
                    _stdout_content = "true" if _res else "false"
                else:
                    _stdout_content = str(_res)
        except Exception as _call_err:
            _stdout_content = f"Runtime error: {{_call_err}}"

sys.stdout = sys.__stdout__
print(_stdout_content, end='')
"""
        elif language == "javascript":
            return f"""
// Inject test input
const input = {repr(input_data)};

// Capture console.log
let output = '';
const originalLog = console.log;
console.log = (...args) => {{
    output += args.join(' ') + '\\n';
}};

// Original candidate code
{code}

// Auto-invoke candidate function if console.log was not called explicitly
if (!output.trim()) {{
    try {{
        const lines = input.trim().split('\\n').filter(Boolean);
        const args = lines.map(line => {{
            const val = line.includes('=') && !line.trim().startsWith('{{') ? line.split('=')[1].trim() : line.trim();
            try {{ return JSON.parse(val); }} catch (e) {{ return val; }}
        }});
        const fn = typeof canCompleteCircuit === 'function' ? canCompleteCircuit :
                   typeof solution === 'function' ? solution :
                   typeof twoSum === 'function' ? twoSum :
                   typeof lengthOfLongestSubstring === 'function' ? lengthOfLongestSubstring :
                   typeof isValid === 'function' ? isValid :
                   typeof wordBreak === 'function' ? wordBreak : null;
        if (fn) {{
            const res = fn(...args);
            if (res !== undefined) output = (Array.isArray(res) || (res !== null && typeof res === 'object')) ? JSON.stringify(res) : String(res);
        }}
    }} catch (e) {{
        // ignore fallback errors
    }}
}}

// Restore console.log and flush
console.log = originalLog;
console.log(output.trim());
"""
        elif language == "java":
            return f"""
import java.util.Scanner;

public class Main {{
    public static void main(String[] args) {{
        Scanner scanner = new Scanner({repr(input_data)});
        
        // Original candidate code
        {code}
        
        scanner.close();
    }}
}}
"""
        elif language == "cpp":
            return f"""
#include <iostream>
#include <sstream>
#include <string>

int main() {{
    std::istringstream input({repr(input_data)});
    std::streambuf* orig_cin = std::cin.rdbuf(input.rdbuf());
    
    // Original candidate code
    {code}
    
    std::cin.rdbuf(orig_cin);
    return 0;
}}
"""
        elif language == "go":
            return f"""
package main

import (
    "os"
    "strings"
)

func main() {{
    // Inject input
    input := {repr(input_data)}
    r := strings.NewReader(input)
    os.Stdin = r
    
    // Original candidate code
    {code}
}}
"""
        else:
            # Fallback: Run code as-is for unsupported wrapper languages
            return code

    def _compare_outputs(self, actual: str, expected: str) -> bool:
        """
        Compares candidate output with expected reference output.

        Whitespace & Boolean Normalization:
          Splits on all consecutive whitespace and joins with a single space.
          Normalizes booleans ('true' vs 'True').
        """
        def normalize(s: str) -> str:
            norm = " ".join(s.split()).strip()
            if norm.lower() == "true":
                return "true"
            if norm.lower() == "false":
                return "false"
            return norm

        return normalize(actual) == normalize(expected)

    def parse_test_cases_from_json(self, test_cases_json: str) -> List[TestCase]:
        """
        Parses a JSON array string into a list of TestCase model objects.

        Expected JSON Format:
          [
            {"input": "3 5", "expected_output": "8", "is_hidden": false},
            {"input": "100 200", "expected_output": "300", "is_hidden": true}
          ]
        """
        try:
            data = json.loads(test_cases_json)
            test_cases = []

            for tc in data:
                test_case = TestCase(
                    input_data=tc.get("input", ""),
                    expected_output=tc.get("expected_output", ""),
                    is_hidden=tc.get("is_hidden", False),
                )
                test_cases.append(test_case)

            return test_cases

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse test cases JSON: {e}")
            raise ValueError("Invalid test cases JSON format")


# Singleton test runner instance
test_runner = TestRunner()
