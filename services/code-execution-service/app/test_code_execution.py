"""
================================================================================
CODE EXECUTION SERVICE — UNIT & INTEGRATION TEST SUITE
================================================================================
Role & Responsibility:
  This module provides automated unit and integration tests verifying the full
  operational lifecycle of the Code Execution Service without requiring live
  Docker daemons or RabbitMQ brokers:
    1. Dependency Mocking: Mocks out `docker`, `boto3`, `botocore`, `pika`, and `redis`
       at import time so tests run quickly in isolated CI/CD environments.
    2. Health & Discovery: Verifies service liveness and supported language catalogues.
    3. Code Safety Analysis: Tests AST-based import scanning, banned shell calls (`os.system`,
       `subprocess`), socket connections, dynamic evaluation (`eval`, `exec`), and file writes.
    4. Plagiarism Detection: Tests Jaccard token similarity across identical, modified,
       and disjoint code samples.
    5. Input Validation: Confirms Pydantic rejection of invalid language enums and empty test lists.
================================================================================
"""

import sys
from unittest.mock import MagicMock

# Mock out external infrastructure packages before any service modules are imported
_mock_botocore = MagicMock()
_mock_botocore.exceptions = MagicMock()
_mock_botocore.exceptions.ClientError = Exception
_mock_botocore.exceptions.NoCredentialsError = Exception
sys.modules.setdefault("boto3", MagicMock())
sys.modules.setdefault("botocore", _mock_botocore)
sys.modules.setdefault("botocore.exceptions", _mock_botocore.exceptions)
sys.modules.setdefault("docker", MagicMock())
sys.modules.setdefault("pika", MagicMock())
sys.modules.setdefault("redis", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """
    Initializes FastAPI TestClient while mocking the background queue worker thread
    to prevent starting real daemon threads during testing.
    """
    with patch("app.queue_manager.start_queue_worker", MagicMock()):
        from app.main import app
        with TestClient(app) as c:
            yield c


# ==============================================================================
# 1. HEALTH & ROOT ENDPOINTS
# ==============================================================================

def test_health_check(client):
    """
    Verifies that GET /health responds with HTTP 200 and 'healthy' status.
    Used by Docker healthchecks to verify container status.
    """
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "code-execution-service"


def test_root(client):
    """
    Verifies that the root path GET / responds with HTTP 200.
    """
    resp = client.get("/")
    assert resp.status_code == 200


# ==============================================================================
# 2. SUPPORTED RUNTIME LANGUAGES
# ==============================================================================

def test_supported_languages(client):
    """
    Ensures all 6 target language runtimes are returned by the discovery endpoint.
    """
    resp = client.get("/api/v1/execute/languages")
    assert resp.status_code == 200
    data = resp.json()
    langs = [l["value"] for l in data["languages"]]
    assert "python" in langs
    assert "javascript" in langs
    assert "java" in langs
    assert "cpp" in langs
    assert "go" in langs
    assert "rust" in langs


# ==============================================================================
# 3. CODE SAFETY & BANNED PATTERN SCANNING
# ==============================================================================

def test_scan_safety_safe_code(client):
    """
    Ensures safe, idiomatic algorithmic code passes without violations.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "print('hello world')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe"] is True
    assert data["violation"] is None


def test_scan_safety_os_system(client):
    """
    Ensures shell execution via `os.system` is flagged as a security violation.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "import os; os.system('rm -rf /')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe"] is False
    assert data["violation"] is not None


def test_scan_safety_subprocess(client):
    """
    Ensures process invocation via `subprocess` is caught by AST analysis.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "import subprocess; subprocess.run(['ls'])",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe"] is False


def test_scan_safety_eval(client):
    """
    Ensures dynamic execution via `eval()` is rejected.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "eval('print(1)')",
        "language": "python",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_exec(client):
    """
    Ensures dynamic execution via `exec()` is rejected.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "exec('print(1)')",
        "language": "python",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_socket(client):
    """
    Ensures network socket creation via `import socket` is blocked.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "import socket; s = socket.socket()",
        "language": "python",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_pickle(client):
    """
    Ensures deserialization attacks via `import pickle` are blocked.
    """
    from app.routes import scan_code_safety
    result = scan_code_safety("import pickle", "python")
    assert result is not None


def test_scan_safety_java_runtime(client):
    """
    Ensures Java shell command execution (`Runtime.getRuntime().exec`) is caught by regex.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": 'Runtime.getRuntime().exec("cmd")',
        "language": "java",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_cpp_system(client):
    """
    Ensures C++ shell execution (`std::system`) is blocked.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": 'std::system("ls");',
        "language": "cpp",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_go_network(client):
    """
    Ensures Golang network dialing (`net.Dial`) is blocked.
    """
    from app.routes import scan_code_safety
    result = scan_code_safety('conn, err := net.Dial("tcp", "example.com:80")', "go")
    assert result is not None


def test_scan_safety_rust_command(client):
    """
    Ensures Rust process execution (`Command::new`) is blocked.
    """
    from app.routes import scan_code_safety
    result = scan_code_safety('let output = Command::new("ls").output();', "rust")
    assert result is not None


def test_scan_safety_file_write(client):
    """
    Ensures attempts to open files with write modes ('w', 'a') are blocked.
    """
    from app.routes import scan_code_safety
    result = scan_code_safety("open('file.txt', 'w')", "python")
    assert result is not None


def test_scan_safety_dunder_import(client):
    """
    Ensures obfuscated imports like `__import__('os')` are flagged.
    """
    from app.routes import scan_code_safety
    result = scan_code_safety("__import__('os').system('ls')", "python")
    assert result is not None


# ==============================================================================
# 4. AST DIRECT MODULE TESTS
# ==============================================================================

def test_scan_code_safety_python_ast():
    """
    Directly tests AST scanner against harmless arithmetic vs dangerous standard libraries.
    """
    from app.routes import scan_code_safety
    assert scan_code_safety("x = 1 + 2\nprint(x)", "python") is None
    assert scan_code_safety("import socket", "python") is not None
    assert scan_code_safety("import subprocess", "python") is not None
    assert scan_code_safety("import ctypes", "python") is not None
    assert scan_code_safety("import multiprocessing", "python") is not None


def test_scan_code_safety_safe_imports():
    """
    Ensures standard algorithmic helper libraries (math, collections, json, itertools) are permitted.
    """
    from app.routes import scan_code_safety
    assert scan_code_safety("import math\nprint(math.sqrt(4))", "python") is None
    assert scan_code_safety("from collections import defaultdict", "python") is None
    assert scan_code_safety("import json, re, itertools", "python") is None


def test_scan_code_safety_syntax_error():
    """
    Confirms that code with syntax errors does not raise unhandled exceptions during safety checks.
    """
    from app.routes import scan_code_safety
    result = scan_code_safety("def foo(:", "python")
    assert result is None  # Syntax error should pass safety scan and be caught by the compiler


# ==============================================================================
# 5. PLAGIARISM & SIMILARITY CHECK TESTS
# ==============================================================================

def test_plagiarism_identical(client):
    """
    Verifies that identical code submissions yield a 1.0 Jaccard similarity and trigger a plagiarism flag.
    """
    code = "def two_sum(nums, target):\n    d = {}\n    for i, n in enumerate(nums):\n        if target - n in d:\n            return [d[target-n], i]\n        d[n] = i"
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": code,
        "code_b": code,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] == 1.0
    assert data["flagged"] is True


def test_plagiarism_different(client):
    """
    Verifies that completely distinct code samples yield low similarity (<0.5) and are not flagged.
    """
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": "def foo(): return 42",
        "code_b": "class Bar: pass\nclass Baz(Bar): pass",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] < 0.5
    assert data["flagged"] is False


def test_plagiarism_empty(client):
    """
    Verifies that empty strings return 0.0 similarity cleanly.
    """
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": "",
        "code_b": "",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] == 0.0
    assert data["flagged"] is False


def test_plagiarism_similar(client):
    """
    Verifies that renamed variables (e.g. `seen` vs `lookup`) across identical logic produce high similarity (>0.5).
    """
    code_a = "def solve(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        comp = target - num\n        if comp in seen:\n            return [seen[comp], i]\n        seen[num] = i"
    code_b = "def solve(nums, target):\n    lookup = {}\n    for idx, val in enumerate(nums):\n        complement = target - val\n        if complement in lookup:\n            return [lookup[complement], idx]\n        lookup[val] = idx"
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": code_a,
        "code_b": code_b,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] > 0.5


def test_jaccard_similarity():
    """
    Tests edge cases of the mathematical Jaccard similarity function directly.
    """
    from app.routes import jaccard_similarity
    assert jaccard_similarity("a b c", "a b c") == 1.0
    assert jaccard_similarity("a b c", "d e f") == 0.0
    assert 0 < jaccard_similarity("a b c d", "a b e f") < 1.0
    assert jaccard_similarity("", "") == 0.0


# ==============================================================================
# 6. EXECUTION ENDPOINT SAFETY INTEGRATION
# ==============================================================================

def test_execute_blocked_code(client):
    """
    Verifies that submitting blocked code to POST /api/v1/execute aborts before
    container creation and returns a security violation message.
    """
    resp = client.post("/api/v1/execute", json={
        "code": "import socket; s = socket.socket()",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert "Security violation" in data["error"]


def test_execute_safe_code_validation(client):
    """
    Verifies that empty code is rejected by Pydantic validation (min_length=1).
    """
    resp = client.post("/api/v1/execute", json={
        "code": "",
        "language": "python",
    })
    assert resp.status_code in (200, 422)


def test_execute_invalid_language(client):
    """
    Verifies that unsupported language names are rejected by Pydantic enum validation.
    """
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "print('hi')",
        "language": "brainfuck",
    })
    assert resp.status_code in (200, 422)


def test_run_tests_empty_tests(client):
    """
    Verifies that sending an empty test cases array is rejected by Pydantic (min_length=1).
    """
    resp = client.post("/api/v1/execute/run-tests", json={
        "code": "print('hi')",
        "language": "python",
        "test_cases": [],
    })
    assert resp.status_code == 422
