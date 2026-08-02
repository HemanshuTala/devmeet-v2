"""
Code Execution Service — comprehensive unit tests.
Tests: health check, code safety scanning, plagiarism detection,
language support, banned pattern detection, async job submission.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before any app imports
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
    with patch("app.queue_manager.start_queue_worker", MagicMock()):
        from app.main import app
        with TestClient(app) as c:
            yield c


# ─── Health & Root ────────────────────────────────────────────────────────────

def test_health_check(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "code-execution-service"


def test_root(client):
    resp = client.get("/")
    assert resp.status_code == 200


# ─── Supported Languages ─────────────────────────────────────────────────────

def test_supported_languages(client):
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


# ─── Code Safety Scanner ─────────────────────────────────────────────────────

def test_scan_safety_safe_code(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "print('hello world')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe"] is True
    assert data["violation"] is None


def test_scan_safety_os_system(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "import os; os.system('rm -rf /')",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe"] is False
    assert data["violation"] is not None


def test_scan_safety_subprocess(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "import subprocess; subprocess.run(['ls'])",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["safe"] is False


def test_scan_safety_eval(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "eval('print(1)')",
        "language": "python",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_exec(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "exec('print(1)')",
        "language": "python",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_socket(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "import socket; s = socket.socket()",
        "language": "python",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_pickle(client):
    from app.routes import scan_code_safety
    result = scan_code_safety("import pickle", "python")
    assert result is not None


def test_scan_safety_java_runtime(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": 'Runtime.getRuntime().exec("cmd")',
        "language": "java",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_cpp_system(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": 'std::system("ls");',
        "language": "cpp",
    })
    assert resp.status_code == 200
    assert resp.json()["safe"] is False


def test_scan_safety_go_network(client):
    from app.routes import scan_code_safety
    result = scan_code_safety('conn, err := net.Dial("tcp", "example.com:80")', "go")
    assert result is not None


def test_scan_safety_rust_command(client):
    from app.routes import scan_code_safety
    result = scan_code_safety('let output = Command::new("ls").output();', "rust")
    assert result is not None


def test_scan_safety_file_write(client):
    from app.routes import scan_code_safety
    result = scan_code_safety("open('file.txt', 'w')", "python")
    assert result is not None


def test_scan_safety_dunder_import(client):
    from app.routes import scan_code_safety
    result = scan_code_safety("__import__('os').system('ls')", "python")
    assert result is not None


# ─── Scan Code Safety Function Directly ──────────────────────────────────────

def test_scan_code_safety_python_ast():
    from app.routes import scan_code_safety
    assert scan_code_safety("x = 1 + 2\nprint(x)", "python") is None
    assert scan_code_safety("import socket", "python") is not None
    assert scan_code_safety("import subprocess", "python") is not None
    assert scan_code_safety("import ctypes", "python") is not None
    assert scan_code_safety("import multiprocessing", "python") is not None


def test_scan_code_safety_safe_imports():
    from app.routes import scan_code_safety
    assert scan_code_safety("import math\nprint(math.sqrt(4))", "python") is None
    assert scan_code_safety("from collections import defaultdict", "python") is None
    assert scan_code_safety("import json, re, itertools", "python") is None


def test_scan_code_safety_syntax_error():
    from app.routes import scan_code_safety
    result = scan_code_safety("def foo(:", "python")
    assert result is None  # SyntaxError in AST should not flag as unsafe


# ─── Plagiarism Detection ────────────────────────────────────────────────────

def test_plagiarism_identical(client):
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
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": "def foo(): return 42",
        "code_b": "class Bar: pass\nclass Baz(Bar): pass",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] < 0.5
    assert data["flagged"] is False


def test_plagiarism_empty(client):
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": "",
        "code_b": "",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] == 0.0
    assert data["flagged"] is False


def test_plagiarism_similar(client):
    code_a = "def solve(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        comp = target - num\n        if comp in seen:\n            return [seen[comp], i]\n        seen[num] = i"
    code_b = "def solve(nums, target):\n    lookup = {}\n    for idx, val in enumerate(nums):\n        complement = target - val\n        if complement in lookup:\n            return [lookup[complement], idx]\n        lookup[val] = idx"
    resp = client.post("/api/v1/execute/check-plagiarism", json={
        "code_a": code_a,
        "code_b": code_b,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["similarity"] > 0.5


# ─── Jaccard Similarity Function ─────────────────────────────────────────────

def test_jaccard_similarity():
    from app.routes import jaccard_similarity
    assert jaccard_similarity("a b c", "a b c") == 1.0
    assert jaccard_similarity("a b c", "d e f") == 0.0
    assert 0 < jaccard_similarity("a b c d", "a b e f") < 1.0
    assert jaccard_similarity("", "") == 0.0


# ─── Code Execution with Safety Violation ─────────────────────────────────────

def test_execute_blocked_code(client):
    resp = client.post("/api/v1/execute", json={
        "code": "import socket; s = socket.socket()",
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert "Security violation" in data["error"]


def test_execute_safe_code_validation(client):
    resp = client.post("/api/v1/execute", json={
        "code": "",
        "language": "python",
    })
    assert resp.status_code in (200, 422)


# ─── Input Validation ────────────────────────────────────────────────────────

def test_execute_invalid_language(client):
    resp = client.post("/api/v1/execute/scan-safety", json={
        "code": "print('hi')",
        "language": "brainfuck",
    })
    assert resp.status_code in (200, 422)


def test_run_tests_empty_tests(client):
    resp = client.post("/api/v1/execute/run-tests", json={
        "code": "print('hi')",
        "language": "python",
        "test_cases": [],
    })
    assert resp.status_code == 422
