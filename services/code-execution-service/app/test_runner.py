"""
CODE-06: Test Case Runner with Hidden/Visible Tests
This module provides test case execution for code submissions with support for
visible (shown to user) and hidden (not shown, used for scoring) test cases.
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
    """Represents a single test case with input, expected output, and visibility."""
    
    def __init__(self, input_data: str, expected_output: str, is_hidden: bool = False):
        self.input_data = input_data
        self.expected_output = expected_output
        self.is_hidden = is_hidden
    
    def to_dict(self) -> dict:
        return {
            "input": self.input_data,
            "expected_output": self.expected_output,
            "is_hidden": self.is_hidden
        }


class TestResult:
    """Represents the result of running a single test case."""
    
    def __init__(self, test_case: TestCase, passed: bool, actual_output: str, execution_time: float, error: str = None):
        self.test_case = test_case
        self.passed = passed
        self.actual_output = actual_output
        self.execution_time = execution_time
        self.error = error
    
    def to_dict(self) -> dict:
        result = {
            "passed": self.passed,
            "actual_output": self.actual_output,
            "execution_time": self.execution_time,
            "is_hidden": self.test_case.is_hidden
        }
        if self.error:
            result["error"] = self.error
        if not self.test_case.is_hidden:
            result["input"] = self.test_case.input_data
            result["expected_output"] = self.test_case.expected_output
        return result


class TestRunner:
    """CODE-06: Test case runner for code submissions."""
    
    def __init__(self):
        self.executor = CodeExecutor()
    
    async def run_test_cases(
        self,
        code: str,
        language: str,
        test_cases: List[TestCase],
        timeout: int = 10
    ) -> Dict[str, Any]:
        """
        Run all test cases against the provided code.
        
        Args:
            code: The code to test
            language: Programming language
            test_cases: List of TestCase objects
            timeout: Timeout per test case in seconds
            
        Returns:
            Test results summary with pass/fail matrix
        """
        results = []
        passed_count = 0
        failed_count = 0
        total_time = 0.0
        
        for test_case in test_cases:
            try:
                # Execute code with test case input
                result = await self._run_single_test(code, language, test_case, timeout)
                results.append(result)
                
                if result.passed:
                    passed_count += 1
                else:
                    failed_count += 1
                
                total_time += result.execution_time
                
            except Exception as e:
                logger.error(f"Test case execution failed: {e}")
                # Create failed result
                results.append(TestResult(
                    test_case=test_case,
                    passed=False,
                    actual_output="",
                    execution_time=0,
                    error=str(e)
                ).to_dict())
                failed_count += 1
        
        return {
            "total_tests": len(test_cases),
            "passed": passed_count,
            "failed": failed_count,
            "pass_rate": (passed_count / len(test_cases)) * 100 if test_cases else 0,
            "total_execution_time": total_time,
            "results": [r.to_dict() if isinstance(r, TestResult) else r for r in results]
        }
    
    async def _run_single_test(
        self,
        code: str,
        language: str,
        test_case: TestCase,
        timeout: int
    ) -> TestResult:
        """
        Run a single test case against the code.
        
        Args:
            code: The code to test
            language: Programming language
            test_case: Single test case
            timeout: Timeout in seconds
            
        Returns:
            TestResult object
        """
        start_time = time.time()
        
        try:
            # Modify code to read from stdin and write to stdout
            modified_code = self._wrap_code_with_io(code, language, test_case.input_data)
            
            # Execute the modified code
            execution_result = await self.executor.execute_code(
                code=modified_code,
                language=language,
                timeout=timeout
            )
            
            execution_time = time.time() - start_time
            
            if not execution_result.get("success"):
                return TestResult(
                    test_case=test_case,
                    passed=False,
                    actual_output=execution_result.get("output", ""),
                    execution_time=execution_time,
                    error=execution_result.get("error", "Execution failed")
                )
            
            actual_output = execution_result.get("output", "").strip()
            expected_output = test_case.expected_output.strip()
            
            # Compare outputs (normalize whitespace)
            passed = self._compare_outputs(actual_output, expected_output)
            
            return TestResult(
                test_case=test_case,
                passed=passed,
                actual_output=actual_output,
                execution_time=execution_time
            )
            
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Single test execution error: {e}")
            return TestResult(
                test_case=test_case,
                passed=False,
                actual_output="",
                execution_time=execution_time,
                error=str(e)
            )
    
    def _wrap_code_with_io(self, code: str, language: str, input_data: str) -> str:
        """
        Wrap code to handle input/output for test cases.
        Injects input data and captures stdout.
        """
        language = language.lower()
        
        if language == "python":
            # Wrap Python code to read from stdin
            return f"""
import sys
import io

# Capture stdout
sys.stdout = io.StringIO()

# Inject input
sys.stdin = io.StringIO({repr(input_data)})

# Original code
{code}

# Get output
output = sys.stdout.getvalue()
print(output, end='')
"""
        elif language == "javascript":
            # Wrap JavaScript code
            return f"""
// Inject input
const input = {repr(input_data)};

// Capture console.log
let output = '';
const originalLog = console.log;
console.log = (...args) => {{
    output += args.join(' ') + '\\n';
}};

// Original code
{code}

// Restore console.log
console.log = originalLog;
console.log(output.trim());
"""
        elif language == "java":
            # Wrap Java code
            return f"""
import java.util.Scanner;

public class Main {{
    public static void main(String[] args) {{
        Scanner scanner = new Scanner({repr(input_data)});
        
        // Original code with input handling
        {code}
        
        scanner.close();
    }}
}}
"""
        elif language == "cpp":
            # Wrap C++ code
            return f"""
#include <iostream>
#include <sstream>
#include <string>

int main() {{
    std::istringstream input({repr(input_data)});
    std::streambuf* orig_cin = std::cin.rdbuf(input.rdbuf());
    
    // Original code
    {code}
    
    std::cin.rdbuf(orig_cin);
    return 0;
}}
"""
        elif language == "go":
            # Wrap Go code
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
    
    // Original code
    {code}
}}
"""
        else:
            # For other languages, return code as-is (may need manual input handling)
            return code
    
    def _compare_outputs(self, actual: str, expected: str) -> bool:
        """
        Compare actual and expected outputs.
        Normalizes whitespace and handles common formatting differences.
        """
        # Normalize whitespace
        actual_normalized = " ".join(actual.split())
        expected_normalized = " ".join(expected.split())
        
        return actual_normalized == expected_normalized
    
    def parse_test_cases_from_json(self, test_cases_json: str) -> List[TestCase]:
        """
        Parse test cases from JSON string.
        
        Expected format:
        [
            {"input": "test input", "expected_output": "expected", "is_hidden": false},
            ...
        ]
        """
        try:
            data = json.loads(test_cases_json)
            test_cases = []
            
            for tc in data:
                test_case = TestCase(
                    input_data=tc.get("input", ""),
                    expected_output=tc.get("expected_output", ""),
                    is_hidden=tc.get("is_hidden", False)
                )
                test_cases.append(test_case)
            
            return test_cases
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse test cases JSON: {e}")
            raise ValueError("Invalid test cases JSON format")


# Global test runner instance
test_runner = TestRunner()
