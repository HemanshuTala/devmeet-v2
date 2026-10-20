"""
================================================================================
CODE EXECUTION SERVICE — REST API ROUTING & SANDBOX CONTROLLER
================================================================================
Role & Responsibility:
  This module defines the external HTTP endpoints for the Code Execution Service.
  It acts as the primary controller for running code, testing algorithmic submissions,
  scanning for security violations, detecting plagiarism, and queuing heavy jobs.

Key Endpoints & Capabilities:
  1. POST /api/v1/execute: Synchronous code execution inside a hardened Docker sandbox.
     Runs AST/regex safety scans and triggers background S3 snapshot archiving.
  2. POST /api/v1/execute/run-tests: Test suite runner supporting visible and hidden tests,
     returning pass/fail status, actual vs expected output, and execution latency.
  3. POST /api/v1/execute/submit-async: Submits execution tasks to a RabbitMQ queue
     backed by Redis status tracking for non-blocking asynchronous execution.
  4. GET /api/v1/execute/status/{job_id}: Polls async job execution status from Redis.
  5. POST /api/v1/execute/check-plagiarism: Compares code similarity using Jaccard token
     distance, flagging submissions with >80% overlap.
  6. POST /api/v1/execute/scan-safety: Pre-scan endpoint allowing the frontend editor
     to warn candidates about forbidden imports before code is executed.
  7. GET /api/v1/execute/languages: Returns metadata for all supported language runtimes.
================================================================================
"""

import asyncio
import hashlib
import re
import ast as python_ast
from typing import Optional, List
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
import httpx
import os

from .models import ExecutionRequest, ExecutionResponse, Language, TestResult
from .executor import executor
from .submission_runner import test_runner, TestCase

# File service URL for cloud snapshot uploads
FILE_SERVICE_URL = os.getenv("FILE_SERVICE_URL", "http://file-service:8011")


async def persist_code_snapshot(code: str, job_id: str, language: str):
    """
    Persists executed code revisions to file-service (AWS S3) or local disk.

    Parameters:
      code (str): Source code string executed by candidate.
      job_id (str): Unique identifier associated with the execution run.
      language (str): Programming language runtime.

    Flow:
      1. Determines file extension based on language (.py, .js, .java, etc.).
      2. Uploads code bytes to `file-service` for S3 bucket archiving.
      3. If `file-service` is unreachable, writes revision to local disk (`uploads/code-snapshots`).
    """
    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "java": ".java",
        "cpp": ".cpp",
        "go": ".go",
        "rust": ".rs",
    }
    ext = ext_map.get(language.lower(), ".txt")
    filename = f"code_{job_id}{ext}"

    # Try uploading to file-service (handles S3 vs Local fallback)
    try:
        async with httpx.AsyncClient() as client:
            url = f"{FILE_SERVICE_URL}/api/v1/files/upload-bytes"
            params = {
                "filename": filename,
                "content_type": "text/plain",
                "folder": "code-snapshots",
            }
            response = await client.post(url, content=code.encode("utf-8"), params=params, timeout=5.0)
            if response.status_code == 200:
                snapshot_data = response.json()
                print(f"[CODE-09] Code snapshot persisted: {snapshot_data.get('url')} ({snapshot_data.get('storage_backend')})")
                return snapshot_data.get("url")
    except Exception as e:
        print(f"[CODE-09] Failed to upload code snapshot to file-service: {e}. Writing to local disk fallback.")

    # Local filesystem fallback if network storage is offline
    try:
        from pathlib import Path
        local_dir = Path("uploads/code-snapshots")
        local_dir.mkdir(parents=True, exist_ok=True)
        dest = local_dir / filename
        with open(dest, "w", encoding="utf-8") as f:
            f.write(code)
        return f"/uploads/code-snapshots/{filename}"
    except Exception as e:
        print(f"[CODE-09] Local disk fallback failed: {e}")
        return None


# Initialize APIRouter under /api/v1/execute prefix
router = APIRouter(prefix="/api/v1/execute", tags=["execution"])

# In-memory async job queue dictionary (job_id -> result dict)
_pending_jobs: dict = {}


# ==============================================================================
# SECURITY SCANNING: AST & REGEX BANNED PATTERN FILTER
# ==============================================================================

# Disallowed Python standard library modules capable of system compromise
PYTHON_BANNED_IMPORTS = {
    "socket", "subprocess", "os.system", "pty", "multiprocessing",
    "signal", "ctypes", "cffi", "mmap", "fcntl", "termios",
    "http.server", "ftplib", "smtplib", "telnetlib", "xmlrpc",
    "pickle", "marshal",
}

# Cross-language regex patterns catching shell invocation, file writes, and dynamic execution
UNIVERSAL_BANNED_PATTERNS = [
    r"__import__\s*\(\s*['\"]os['\"]",
    r"eval\s*\(",
    r"exec\s*\(",
    r"open\s*\([^)]*['\"][wWaA]['\"]",   # Unauthorized file writes
    r"import\s+socket",
    r"import\s+subprocess",
    r"Runtime\.getRuntime\(\)",          # Java shell execution
    r"ProcessBuilder",                   # Java process builder
    r"os\.system\s*\(",
    r"os\.popen\s*\(",
    r"net\.Dial\s*\(",                   # Go socket creation
    r"std::system\s*\(",                 # C++ shell command
    r"Command::new\s*\(",                # Rust process spawning
]
UNIVERSAL_RE = [re.compile(p) for p in UNIVERSAL_BANNED_PATTERNS]


def scan_code_safety(code: str, language: str) -> Optional[str]:
    """
    Performs dual-layer security validation against untrusted source code.

    Parameters:
      code (str): Raw candidate source code.
      language (str): Target programming language.

    Returns:
      Optional[str]: Description of security violation if detected, or None if safe.

    How It Works:
      1. Scans code against universal regular expressions for dangerous system calls.
      2. For Python: parses code into an Abstract Syntax Tree (AST) to inspect:
         a. Import statements (`import socket`, `from subprocess import Popen`).
         b. Dynamic code execution functions (`eval`, `exec`, `compile`, `__import__`).
         c. Dangerous method calls (`.system()`, `.popen()`, `.spawn()`).
    """
    # Step 1: Universal regex scan across all languages
    for pattern in UNIVERSAL_RE:
        if pattern.search(code):
            return f"Banned pattern detected: {pattern.pattern}"

    # Step 2: Python-specific Abstract Syntax Tree (AST) analysis
    if language == "python":
        try:
            tree = python_ast.parse(code)
            for node in python_ast.walk(tree):
                # Inspect import and from-import nodes
                if isinstance(node, (python_ast.Import, python_ast.ImportFrom)):
                    names = []
                    if isinstance(node, python_ast.Import):
                        names = [alias.name for alias in node.names]
                    elif isinstance(node, python_ast.ImportFrom):
                        names = [node.module] if node.module else []

                    for name in names:
                        if name and any(name == banned or name.startswith(banned + ".") for banned in PYTHON_BANNED_IMPORTS):
                            return f"Import of banned module '{name}' is not allowed."

                # Inspect function call invocations
                if isinstance(node, python_ast.Call):
                    if isinstance(node.func, python_ast.Name):
                        if node.func.id in ("eval", "exec", "compile", "__import__"):
                            return f"Call to '{node.func.id}' is not allowed."
                    elif isinstance(node.func, python_ast.Attribute):
                        if node.func.attr in ("system", "popen", "spawn"):
                            return f"Call to '.{node.func.attr}()' is not allowed."
        except SyntaxError:
            # Syntax errors will be captured cleanly during container compilation/execution
            pass

    return None  # Code passed all security filters


# ==============================================================================
# PLAGIARISM DETECTION: JACCARD SIMILARITY METRIC
# ==============================================================================

def _tokenize(code: str) -> set:
    """
    Extracts alphanumeric identifier tokens from source code.

    Parameters:
      code (str): Source code string.

    Returns:
      set: Set of lowercase token strings.
    """
    tokens = re.findall(r"\w+", code.lower())
    return set(tokens)


def jaccard_similarity(a: str, b: str) -> float:
    """
    Computes Jaccard Similarity index between two code snippets:
      J(A, B) = |A ∩ B| / |A ∪ B|

    Parameters:
      a (str): Candidate's code submission.
      b (str): Reference solution or peer submission.

    Returns:
      float: Similarity coefficient between 0.0 (completely distinct) and 1.0 (identical).
    """
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ==============================================================================
# REQUEST & RESPONSE MODELS
# ==============================================================================

class TestCaseModel(BaseModel):
    """Test case schema containing input, expected output, and visibility flags."""
    input: str
    expected_output: str
    name: str = "Test Case"
    is_hidden: bool = False  # Hidden test cases used for final evaluation


class RunWithTestsRequest(BaseModel):
    """Payload for executing code against an automated test suite."""
    code: str = Field(..., min_length=1, max_length=20000)
    language: Language
    test_cases: List[TestCaseModel] = Field(..., min_length=1, max_length=20)
    timeout_seconds: int = Field(default=15, ge=1, le=60)


class PlagiarismRequest(BaseModel):
    """Payload containing two code snippets to evaluate for similarity."""
    code_a: str
    code_b: str


class AsyncJobResponse(BaseModel):
    """Response returned when a code execution job is enqueued."""
    job_id: str
    status: str
    message: str


# ==============================================================================
# ENDPOINT 1: SYNCHRONOUS CODE EXECUTION
# ==============================================================================

@router.post("", response_model=ExecutionResponse)
async def execute_code(request: ExecutionRequest, background_tasks: BackgroundTasks):
    """
    Executes source code synchronously inside a secure Docker container sandbox.

    Flow:
      1. Performs AST and regex security scanning; blocks unsafe operations with 200 OK + error.
      2. Schedules asynchronous code snapshot persistence to S3/disk via `BackgroundTasks`.
      3. Invokes `executor.execute_code` with strict CPU, RAM, and network limits.
      4. Returns stdout, stderr, execution duration, and peak memory usage.
    """
    # Step 1: Pre-execution security check
    violation = scan_code_safety(request.code, request.language.value)
    if violation:
        return ExecutionResponse(
            success=False,
            output="",
            error=f"Security violation: {violation}",
            execution_time=0.0,
        )

    # Step 2: Queue background snapshot archiving
    import uuid
    job_id = f"sync_{uuid.uuid4().hex[:12]}"
    background_tasks.add_task(persist_code_snapshot, request.code, job_id, request.language.value)

    # Step 3: Run sandboxed execution
    try:
        result = await executor.execute_code(
            code=request.code,
            language=request.language.value,
            timeout=request.timeout_seconds,
        )
        return ExecutionResponse(
            success=result["success"],
            output=result["output"],
            error=result.get("error"),
            execution_time=result["execution_time"],
            memory_used=result.get("memory_used"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Execution engine error: {str(e)}",
        )


# ==============================================================================
# ENDPOINT 2: AUTOMATED TEST CASE RUNNER
# ==============================================================================

@router.post("/run-tests")
async def run_with_test_cases(request: RunWithTestsRequest):
    """
    Executes candidate code across multiple test cases (visible and hidden).

    Returns:
      dict: Pass rate percentage, pass/fail counts, total execution time, and test breakdowns.
    """
    # Security pre-scan
    violation = scan_code_safety(request.code, request.language.value)
    if violation:
        return {
            "success": False,
            "error": f"Security violation: {violation}",
            "results": [],
            "passed": 0,
            "total": len(request.test_cases),
        }

    # Convert request test cases into test runner domain objects
    test_case_objects = []
    for tc in request.test_cases:
        test_case = TestCase(
            input_data=tc.input,
            expected_output=tc.expected_output,
            is_hidden=tc.is_hidden,
        )
        test_case_objects.append(test_case)

    # Execute test cases in sandbox
    try:
        test_results = await test_runner.run_test_cases(
            code=request.code,
            language=request.language.value,
            test_cases=test_case_objects,
            timeout=request.timeout_seconds,
        )

        return {
            "success": True,
            "results": test_results["results"],
            "passed": test_results["passed"],
            "failed": test_results["failed"],
            "total": test_results["total_tests"],
            "pass_rate": test_results["pass_rate"],
            "total_execution_time": test_results["total_execution_time"],
            "all_passed": test_results["passed"] == test_results["total_tests"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Test execution failed: {str(e)}",
        )


# ==============================================================================
# ENDPOINT 3: ASYNCHRONOUS JOB SUBMISSION (RABBITMQ + REDIS)
# ==============================================================================

@router.post("/submit-async", response_model=AsyncJobResponse)
async def submit_async(request: ExecutionRequest, background_tasks: BackgroundTasks):
    """
    Submits a heavy code execution job to the RabbitMQ queue for asynchronous worker processing.

    Returns:
      AsyncJobResponse: Job UUID and polling instructions.
    """
    import uuid
    import json
    from .queue_manager import get_redis_client, publish_execution_task

    job_id = str(uuid.uuid4())

    # Pre-scan safety checks before queuing
    violation = scan_code_safety(request.code, request.language.value)
    if violation:
        r = get_redis_client()
        r.setex(
            f"execution_job:{job_id}",
            3600,
            json.dumps({
                "status": "completed",
                "result": {
                    "success": False,
                    "output": "",
                    "error": f"Security violation: {violation}",
                    "execution_time": 0.0,
                    "timed_out": False,
                },
            }),
        )
        return AsyncJobResponse(job_id=job_id, status="failed", message="Security violation detected")

    # Persist code revision asynchronously
    background_tasks.add_task(persist_code_snapshot, request.code, job_id, request.language.value)

    # Publish task to RabbitMQ broker
    try:
        publish_execution_task(
            job_id=job_id,
            code=request.code,
            language=request.language.value,
            timeout=request.timeout_seconds,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue job: {str(e)}",
        )

    return AsyncJobResponse(job_id=job_id, status="queued", message="Job submitted. Poll /status/{job_id}")


# ==============================================================================
# ENDPOINT 4: ASYNC JOB STATUS POLLING
# ==============================================================================

@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """
    Polls the execution status or final output of an asynchronous job from Redis.

    Parameters:
      job_id (str): UUID of the enqueued job.

    Returns:
      dict: Status ('pending' or 'completed') and execution results if ready.
    """
    import json
    from .queue_manager import get_redis_client

    r = get_redis_client()
    raw = r.get(f"execution_job:{job_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")

    data = json.loads(raw)
    if data["status"] == "pending":
        return {"job_id": job_id, "status": "pending"}

    return {"job_id": job_id, "status": "completed", "result": data["result"]}


# ==============================================================================
# ENDPOINT 5: PLAGIARISM & SIMILARITY CHECKER
# ==============================================================================

@router.post("/check-plagiarism")
async def check_plagiarism(request: PlagiarismRequest):
    """
    Calculates Jaccard token similarity between two source code submissions.
    Flags submissions with similarity exceeding 80% as potential plagiarism.
    """
    similarity = jaccard_similarity(request.code_a, request.code_b)
    flagged = similarity > 0.80
    return {
        "similarity": round(similarity, 4),
        "flagged": flagged,
        "message": "High similarity detected — possible plagiarism" if flagged else "Similarity within acceptable range",
    }


# ==============================================================================
# ENDPOINT 6: PRE-EXECUTION SAFETY SCANNER
# ==============================================================================

@router.post("/scan-safety")
async def scan_safety(request: ExecutionRequest):
    """
    Validates code safety without running it. Used by frontend IDE to display live warnings.
    """
    violation = scan_code_safety(request.code, request.language.value)
    return {
        "safe": violation is None,
        "violation": violation,
        "language": request.language.value,
    }


# ==============================================================================
# ENDPOINT 7: SUPPORTED LANGUAGES DIRECTORY
# ==============================================================================

@router.get("/languages")
async def get_supported_languages():
    """
    Returns metadata and file extension mappings for all supported runtime sandboxes.
    """
    return {
        "languages": [
            {"value": "python",     "name": "Python 3.11",          "extension": ".py"},
            {"value": "javascript", "name": "JavaScript (Node 20)",  "extension": ".js"},
            {"value": "java",       "name": "Java 21 (OpenJDK)",     "extension": ".java"},
            {"value": "cpp",        "name": "C++ 17 (GCC 13)",       "extension": ".cpp"},
            {"value": "go",         "name": "Go 1.21",               "extension": ".go"},
            {"value": "rust",       "name": "Rust 1.75",             "extension": ".rs"},
        ]
    }


# ==============================================================================
# HELPER UTILITIES
# ==============================================================================

def _inject_stdin(code: str, language: str, stdin_data: str) -> str:
    """
    Wraps candidate source code with standard input mock overrides.

    Parameters:
      code (str): Original source code.
      language (str): Target runtime.
      stdin_data (str): Text data to simulate on stdin.

    Returns:
      str: Modified code string with mock input stream injected.
    """
    if language == "python":
        lines = repr(stdin_data)
        return f"""import sys
_input_data = {lines}.split('\\n')
_input_idx = 0
def input(prompt=''):
    global _input_idx
    val = _input_data[_input_idx] if _input_idx < len(_input_data) else ''
    _input_idx += 1
    return val

{code}"""
    elif language == "javascript":
        return f"""
const _lines = {repr(stdin_data)}.split('\\n');
let _idx = 0;
const readline = () => _lines[_idx++] || '';
{code}"""
    return code
