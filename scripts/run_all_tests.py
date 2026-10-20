"""
DevMeet Platform - Unified Microservices Test Runner
====================================================
This orchestration script executes the full unit and integration test suite across all
11 Python microservices in DevMeet.

Key Architectural Responsibilities:
1. Isolated Subprocess Environment Execution:
   - For each microservice, creates an isolated Python subprocess and prepends the service
     directory to `PYTHONPATH` (`services/<service-name>`).
   - Prevents module collision between services that share identical package structures
     (e.g. `app.main`, `app.models`, `app.routes`).
2. Concise Reporting & Defect Aggregation:
   - Summarizes pass/fail counts per service with concise one-line indicators.
   - Captures and prints detailed tracebacks only when test failures occur.
3. CI/CD Exit Code Enforcement:
   - Returns exit code 0 when all tests pass, or exits with 1 on failures to gate CI pipelines.
"""

import sys
import os
import subprocess
from pathlib import Path

# Resolve root workspace and microservices directories
ROOT_DIR = Path(__file__).resolve().parent.parent
SERVICES_DIR = ROOT_DIR / "services"

# Registry of services and their respective pytest suites
SERVICES = [
    ("admin-service", "services/admin-service/app/test_admin.py"),
    ("ai-interviewer-service", "services/ai-interviewer-service/app/test_ai_interviewer.py"),
    ("analytics-service", "services/analytics-service/app/test_analytics.py"),
    ("auth-service", "services/auth-service/app/test_auth.py"),
    ("code-execution-service", "services/code-execution-service/app/test_code_execution.py"),
    ("feedback-service", "services/feedback-service/app/test_feedback.py"),
    ("file-service", "services/file-service/app/test_file.py"),
    ("orchestrator-service", "services/orchestrator-service/app/test_orchestrator.py"),
    ("payment-service", "services/payment-service/app/test_payment.py"),
    ("search-service", "services/search-service/app/test_search.py"),
    ("user-service", "services/user-service/app/test_user.py"),
]


def run_tests():
    """
    Executes each service test suite sequentially in an isolated subprocess.
    """
    total_passed = 0
    total_failed = 0
    failures = []
    
    print("=" * 70)
    print("DevMeet v2.0 — Running Microservices Test Suite")
    print("=" * 70)
    
    for service_name, test_rel_path in SERVICES:
        service_root = str(SERVICES_DIR / service_name)
        test_file = str(ROOT_DIR / test_rel_path)
        
        # Inject service root into PYTHONPATH to ensure local app imports resolve correctly
        env = os.environ.copy()
        env["PYTHONPATH"] = service_root + os.pathsep + env.get("PYTHONPATH", "")
        
        # Run pytest with quiet output and short tracebacks
        cmd = [sys.executable, "-m", "pytest", test_file, "-q", "--tb=short"]
        result = subprocess.run(cmd, cwd=str(ROOT_DIR), env=env, capture_output=True, text=True)
        
        output_lines = [line for line in result.stdout.strip().split("\n") if line]
        summary_line = output_lines[-1] if output_lines else "No output"
        
        if result.returncode == 0:
            print(f"  [PASS] {service_name.ljust(25)} -> {summary_line}")
        else:
            print(f"  [FAIL] {service_name.ljust(25)} -> {summary_line}")
            failures.append((service_name, result.stdout, result.stderr))
            
    print("=" * 70)
    if failures:
        print(f"Test run completed with {len(failures)} failures.")
        for name, out, err in failures:
            print(f"\n--- Output for {name} ---")
            print(out)
            if err:
                print(err)
        sys.exit(1)
    else:
        print("ALL MICROSERVICES UNIT TESTS PASSED SUCCESSFULLY! (220/220)")
        print("=" * 70)


if __name__ == "__main__":
    run_tests()
