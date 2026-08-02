"""
Code Execution Service — Production Routes
- Full language support (Python, JS, Java, C++, Go, Rust)
- AST-based banned pattern scanning for Python code
- Async queue (in-memory thread pool; RabbitMQ integration ready)
- Test case runner endpoint
- Plagiarism similarity check
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
from .test_runner import test_runner, TestCase

FILE_SERVICE_URL = os.getenv("FILE_SERVICE_URL", "http://file-service:8011")

async def persist_code_snapshot(code: str, job_id: str, language: str):
    """
    CODE-09: Code snapshot persistence (AWS S3 or local disk fallback via file-service).
    Saves all executed/queued code submissions for session replay and plagiarism checking.
    """
    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "java": ".java",
        "cpp": ".cpp",
        "go": ".go",
        "rust": ".rs"
    }
    ext = ext_map.get(language.lower(), ".txt")
    filename = f"code_{job_id}{ext}"
    
    # Try uploading to file-service (which handles S3 vs Local fallback)
    try:
        async with httpx.AsyncClient() as client:
            url = f"{FILE_SERVICE_URL}/api/v1/files/upload-bytes"
            params = {
                "filename": filename,
                "content_type": "text/plain",
                "folder": "code-snapshots"
            }
            # Post raw code as bytes in request body
            response = await client.post(url, content=code.encode("utf-8"), params=params, timeout=5.0)
            if response.status_code == 200:
                snapshot_data = response.json()
                print(f"[CODE-09] Code snapshot persisted: {snapshot_data.get('url')} ({snapshot_data.get('storage_backend')})")
                return snapshot_data.get("url")
    except Exception as e:
        print(f"[CODE-09] Failed to upload code snapshot to file-service: {e}. Writing to local disk fallback.")
        
    # Local fallback
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

router = APIRouter(prefix="/api/v1/execute", tags=["execution"])

# ─── In-memory async job queue ────────────────────────────────────────────────
_pending_jobs: dict = {}  # job_id → result dict or None


# ─── Banned Patterns (AST + regex) ───────────────────────────────────────────

PYTHON_BANNED_IMPORTS = {
    "socket", "subprocess", "os.system", "pty", "multiprocessing",
    "signal", "ctypes", "cffi", "mmap", "fcntl", "termios",
    "http.server", "ftplib", "smtplib", "telnetlib", "xmlrpc",
    "pickle", "marshal",
}

UNIVERSAL_BANNED_PATTERNS = [
    r"__import__\s*\(\s*['\"]os['\"]",
    r"eval\s*\(",
    r"exec\s*\(",
    r"open\s*\([^)]*['\"][wWaA]['\"]",   # file write
    r"import\s+socket",
    r"import\s+subprocess",
    r"Runtime\.getRuntime\(\)",          # Java shell exec
    r"ProcessBuilder",                   # Java
    r"os\.system\s*\(",
    r"os\.popen\s*\(",
    r"net\.Dial\s*\(",                   # Go network
    r"std::system\s*\(",                 # C++
    r"Command::new\s*\(",                # Rust shell
]
UNIVERSAL_RE = [re.compile(p) for p in UNIVERSAL_BANNED_PATTERNS]


def scan_code_safety(code: str, language: str) -> Optional[str]:
    """
    Returns a violation message if banned patterns are detected, else None.
    For Python also performs AST import analysis.
    """
    # Universal regex scan across all languages
    for pattern in UNIVERSAL_RE:
        if pattern.search(code):
            return f"Banned pattern detected: {pattern.pattern}"

    # Python-specific AST analysis
    if language == "python":
        try:
            tree = python_ast.parse(code)
            for node in python_ast.walk(tree):
                if isinstance(node, (python_ast.Import, python_ast.ImportFrom)):
                    names = []
                    if isinstance(node, python_ast.Import):
                        names = [alias.name for alias in node.names]
                    elif isinstance(node, python_ast.ImportFrom):
                        names = [node.module] if node.module else []

                    for name in names:
                        if name and any(name == banned or name.startswith(banned + ".") for banned in PYTHON_BANNED_IMPORTS):
                            return f"Import of banned module '{name}' is not allowed."

                # Block dangerous builtins
                if isinstance(node, python_ast.Call):
                    if isinstance(node.func, python_ast.Name):
                        if node.func.id in ("eval", "exec", "compile", "__import__"):
                            return f"Call to '{node.func.id}' is not allowed."
                    elif isinstance(node.func, python_ast.Attribute):
                        if node.func.attr in ("system", "popen", "spawn"):
                            return f"Call to '.{node.func.attr}()' is not allowed."
        except SyntaxError as e:
            # SyntaxError in AST parse is fine — executor will catch it anyway
            pass

    return None  # Safe


# ─── Plagiarism: Jaccard Similarity ──────────────────────────────────────────

def _tokenize(code: str) -> set:
    tokens = re.findall(r'\w+', code.lower())
    return set(tokens)


def jaccard_similarity(a: str, b: str) -> float:
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ─── Models ───────────────────────────────────────────────────────────────────

class TestCase(BaseModel):
    input: str
    expected_output: str
    name: str = "Test Case"
    is_hidden: bool = False  # CODE-06: Support hidden test cases


class RunWithTestsRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=20000)
    language: Language
    test_cases: List[TestCase] = Field(..., min_items=1, max_items=20)
    timeout_seconds: int = Field(default=15, ge=1, le=60)


class PlagiarismRequest(BaseModel):
    code_a: str
    code_b: str


class AsyncJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("", response_model=ExecutionResponse)
async def execute_code(request: ExecutionRequest, background_tasks: BackgroundTasks):
    """
    Execute code synchronously in a sandboxed Docker container.
    Performs AST/regex safety scan before execution.
    """
    violation = scan_code_safety(request.code, request.language.value)
    if violation:
        return ExecutionResponse(
            success=False,
            output="",
            error=f"Security violation: {violation}",
            execution_time=0.0,
        )

    # CODE-09: Persist code snapshot asynchronously (S3/local storage)
    import uuid
    job_id = f"sync_{uuid.uuid4().hex[:12]}"
    background_tasks.add_task(persist_code_snapshot, request.code, job_id, request.language.value)

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


@router.post("/run-tests")
async def run_with_test_cases(request: RunWithTestsRequest):
    """
    CODE-06: Run code against multiple test cases with hidden/visible support.
    Returns pass/fail matrix with execution times.
    """
    violation = scan_code_safety(request.code, request.language.value)
    if violation:
        return {
            "success": False,
            "error": f"Security violation: {violation}",
            "results": [],
            "passed": 0,
            "total": len(request.test_cases),
        }

    # Convert request test cases to test_runner TestCase objects
    test_case_objects = []
    for tc in request.test_cases:
        test_case = TestCase(
            input_data=tc.input,
            expected_output=tc.expected_output,
            is_hidden=tc.is_hidden
        )
        test_case_objects.append(test_case)

    # Run test cases using the test runner
    try:
        test_results = await test_runner.run_test_cases(
            code=request.code,
            language=request.language.value,
            test_cases=test_case_objects,
            timeout=request.timeout_seconds
        )
        
        return {
            "success": True,
            "results": test_results["results"],
            "passed": test_results["passed"],
            "failed": test_results["failed"],
            "total": test_results["total_tests"],
            "pass_rate": test_results["pass_rate"],
            "total_execution_time": test_results["total_execution_time"],
            "all_passed": test_results["passed"] == test_results["total_tests"]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Test execution failed: {str(e)}"
        )


@router.post("/submit-async", response_model=AsyncJobResponse)
async def submit_async(request: ExecutionRequest, background_tasks: BackgroundTasks):
    """
    CODE-07: Submit a code execution job asynchronously.
    Publishes the task to RabbitMQ for processing by background queue worker.
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
                    "timed_out": False
                }
            })
        )
        return AsyncJobResponse(job_id=job_id, status="failed", message="Security violation detected")

    # CODE-09: Persist code snapshot asynchronously (S3/local storage)
    background_tasks.add_task(persist_code_snapshot, request.code, job_id, request.language.value)

    # Publish task to RabbitMQ queue
    try:
        publish_execution_task(
            job_id=job_id,
            code=request.code,
            language=request.language.value,
            timeout=request.timeout_seconds
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue job: {str(e)}"
        )

    return AsyncJobResponse(job_id=job_id, status="queued", message="Job submitted. Poll /status/{job_id}")


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """CODE-07: Poll for the result of an async execution job from Redis."""
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



@router.post("/check-plagiarism")
async def check_plagiarism(request: PlagiarismRequest):
    """
    CODE-10: Compute Jaccard similarity between two code submissions.
    Flags submissions with similarity > 80% as potential plagiarism.
    """
    similarity = jaccard_similarity(request.code_a, request.code_b)
    flagged = similarity > 0.80
    return {
        "similarity": round(similarity, 4),
        "flagged": flagged,
        "message": "High similarity detected — possible plagiarism" if flagged else "Similarity within acceptable range",
    }


@router.post("/scan-safety")
async def scan_safety(request: ExecutionRequest):
    """Pre-scan code for banned patterns without executing. Returns violation message or clear."""
    violation = scan_code_safety(request.code, request.language.value)
    return {
        "safe": violation is None,
        "violation": violation,
        "language": request.language.value,
    }


@router.get("/languages")
async def get_supported_languages():
    """Return all supported programming languages."""
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


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _inject_stdin(code: str, language: str, stdin_data: str) -> str:
    """Wrap code to inject stdin data via input() override or equivalent."""
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
        # For Node.js, pre-set process.stdin mock
        return f"""
const _lines = {repr(stdin_data)}.split('\\n');
let _idx = 0;
const readline = () => _lines[_idx++] || '';
{code}"""
    # For compiled languages, the executor will pipe stdin — return code unchanged
    return code
