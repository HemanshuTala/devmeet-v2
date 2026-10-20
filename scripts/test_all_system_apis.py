#!/usr/bin/env python3
"""
Comprehensive End-to-End API Test Suite for DevMeet
Tests all available APIs across API Gateway and microservices.
"""

import sys
import os
import json
import time
import subprocess
import requests

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")

def run_cmd(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
    except Exception as e:
        return ""

def clear_redis_rate_limits():
    """Clear rate limit keys in Redis to prevent 429 during automated testing."""
    try:
        cmd = 'docker exec aiinterview-redis-1 redis-cli --raw KEYS "rate_limit:*"'
        out = run_cmd(cmd)
        keys = [k.strip() for k in out.splitlines() if k.strip()]
        if keys:
            del_cmd = f'docker exec aiinterview-redis-1 redis-cli DEL {" ".join(keys)}'
            run_cmd(del_cmd)
            print(f"[Setup] Cleared {len(keys)} rate limit keys from Redis.")
    except Exception as e:
        print(f"[Setup Warning] Could not clear redis keys: {e}")

def mark_email_verified(email):
    """Mark user as email_verified in database so login endpoints work immediately."""
    try:
        cmd = f'docker exec aiinterview-postgres-1 psql -U devmeet -d devmeet -c "UPDATE user_profiles SET email_verified = true WHERE email = \'{email}\';"'
        run_cmd(cmd)
    except Exception:
        pass

class ApiTestSuite:
    def __init__(self, base_url):
        self.base_url = base_url
        self.results = []
        self.session = requests.Session()
        self.candidate_token = None
        self.candidate_refresh_token = None
        self.candidate_user_id = None
        self.candidate_email = None
        self.admin_token = None
        self.admin_refresh_token = None
        self.admin_user_id = None
        self.admin_email = None
        self.test_session_id = None

    def record(self, domain, name, method, endpoint, expected_status, resp, duration_ms, note=""):
        status = resp.status_code if resp is not None else 0
        success = False
        if isinstance(expected_status, list):
            success = status in expected_status
        else:
            success = status == expected_status

        preview = ""
        if resp is not None:
            try:
                data = resp.json()
                preview = json.dumps(data)[:120]
            except Exception:
                preview = resp.text[:120].strip()

        res_item = {
            "domain": domain,
            "name": name,
            "method": method,
            "endpoint": endpoint,
            "expected": expected_status,
            "actual": status,
            "latency_ms": round(duration_ms, 1),
            "success": success,
            "preview": preview,
            "note": note
        }
        self.results.append(res_item)
        mark = "PASS" if success else "FAIL"
        print(f"[{mark}] {domain:<15} | {method:<6} {endpoint:<42} -> {status} ({round(duration_ms, 1)}ms)")
        if not success:
            print(f"       Expected: {expected_status}, Response: {preview}")
        return res_item

    def req(self, method, path, token=None, json_body=None, params=None, expected_status=200, domain="General", name=""):
        url = f"{self.base_url}{path}" if path.startswith("/") else path
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        
        start = time.perf_counter()
        resp = None
        try:
            resp = self.session.request(
                method=method,
                url=url,
                headers=headers,
                json=json_body,
                params=params,
                timeout=15
            )
            elapsed = (time.perf_counter() - start) * 1000
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            print(f"[ERR] Request failed {method} {url}: {e}")
            return self.record(domain, name, method, path, expected_status, None, elapsed, str(e))

        return self.record(domain, name, method, path, expected_status, resp, elapsed)

    def run_all(self):
        print("=" * 82)
        print("          DevMeet Full-Stack System API Test Runner")
        print("=" * 82)

        # ── 1. Gateway & Health ──
        self.req("GET", "/health", expected_status=200, domain="Gateway", name="API Gateway Health")

        # ── 2. Auth Service ──
        ts = int(time.time() * 1000)
        self.candidate_email = f"candidate_{ts}@example.com"
        cand_payload = {
            "email": self.candidate_email,
            "password": "Password123!",
            "display_name": f"Candidate_{ts % 10000}"
        }
        # Register Candidate
        url = f"{self.base_url}/api/v1/auth/register"
        t0 = time.perf_counter()
        resp = self.session.post(url, json=cand_payload, timeout=10)
        el = (time.perf_counter() - t0) * 1000
        r_cand = self.record("Auth", "Register Candidate", "POST", "/api/v1/auth/register", 201, resp, el)
        if resp.status_code == 201:
            data = resp.json()
            self.candidate_token = data.get("access_token")
            self.candidate_refresh_token = data.get("refresh_token")
        
        # Verify email in database so login test passes
        mark_email_verified(self.candidate_email)

        # Login Candidate
        self.req("POST", "/api/v1/auth/login", json_body={
            "email": self.candidate_email,
            "password": "Password123!"
        }, expected_status=200, domain="Auth", name="Login Candidate")

        # Get Current User Profile via Auth Service
        r_me = self.req("GET", "/api/v1/auth/me", token=self.candidate_token, expected_status=200, domain="Auth", name="Current Auth User Profile")
        if r_me["success"]:
            try:
                me_resp = self.session.get(f"{self.base_url}/api/v1/auth/me", headers={"Authorization": f"Bearer {self.candidate_token}"}).json()
                self.candidate_user_id = me_resp.get("id")
            except Exception:
                pass

        # Refresh Token Endpoint
        if self.candidate_refresh_token:
            self.req("POST", "/api/v1/auth/refresh", json_body={"refresh_token": self.candidate_refresh_token}, expected_status=200, domain="Auth", name="Rotate Refresh Token")

        # Register Admin User (ends with @devmeet.com for automatic admin role assignment)
        self.admin_email = f"admin_{ts}@devmeet.com"
        admin_payload = {
            "email": self.admin_email,
            "password": "AdminPassword123!",
            "display_name": f"Admin_{ts % 10000}"
        }
        t0 = time.perf_counter()
        resp_adm = self.session.post(f"{self.base_url}/api/v1/auth/register", json=admin_payload, timeout=10)
        el_adm = (time.perf_counter() - t0) * 1000
        self.record("Auth", "Register Admin", "POST", "/api/v1/auth/register", 201, resp_adm, el_adm)
        if resp_adm.status_code == 201:
            data_adm = resp_adm.json()
            self.admin_token = data_adm.get("access_token")
            self.admin_refresh_token = data_adm.get("refresh_token")
        
        mark_email_verified(self.admin_email)

        # Verify Admin RBAC Guard directly on Auth Service
        self.req("GET", "/api/v1/auth/verify-admin", token=self.candidate_token, expected_status=403, domain="Auth/RBAC", name="RBAC Guard: Candidate 403")
        self.req("GET", "/api/v1/auth/verify-admin", token=self.admin_token, expected_status=200, domain="Auth/RBAC", name="RBAC Guard: Admin 200")

        # ── 3. User Service ──
        self.req("GET", "/api/v1/users/me", token=self.candidate_token, expected_status=200, domain="Users", name="Get Candidate Profile")
        self.req("PUT", "/api/v1/users/me", token=self.candidate_token, json_body={
            "bio": "Senior Software Engineer specializing in distributed architectures.",
            "target_companies": ["Google", "Amazon", "Meta"],
            "skills": ["Python", "TypeScript", "PostgreSQL", "Docker"]
        }, expected_status=200, domain="Users", name="Update User Profile")
        self.req("GET", "/api/v1/users/me/quota", token=self.candidate_token, expected_status=200, domain="Users", name="Get Usage Quota")
        self.req("GET", "/api/v1/users/me/plan", token=self.candidate_token, expected_status=200, domain="Users", name="Get Current Subscription Plan")
        self.req("GET", "/api/v1/users/leaderboard", token=self.candidate_token, expected_status=200, domain="Users", name="Get Leaderboard")
        self.req("GET", "/api/v1/users/me/export", token=self.candidate_token, expected_status=200, domain="Users", name="Export User Account Data")

        # ── 4. Search Service ──
        self.req("GET", "/api/v1/search/questions", params={"limit": 5}, expected_status=200, domain="Search", name="Search Questions Catalog")
        self.req("GET", "/api/v1/search/questions/random", params={"interview_type": "dsa", "difficulty": "easy"}, expected_status=200, domain="Search", name="Fetch Random Seed Problem")

        # ── 5. Orchestrator Service (Session Lifecycle) ──
        sess_create_resp = self.req("POST", "/api/v1/sessions", token=self.candidate_token, json_body={
            "interview_type": "dsa",
            "difficulty": "easy",
            "duration_minutes": 30
        }, expected_status=201, domain="Orchestrator", name="Create Interview Session")

        if sess_create_resp["success"]:
            try:
                sess_raw = self.session.get(f"{self.base_url}/api/v1/sessions", headers={"Authorization": f"Bearer {self.candidate_token}"}).json()
                if isinstance(sess_raw, list) and len(sess_raw) > 0:
                    self.test_session_id = sess_raw[0]["id"]
            except Exception:
                pass

        # List Sessions
        self.req("GET", "/api/v1/sessions", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="List User Sessions")

        # Concurrency / Duplicate Session Guard
        self.req("POST", "/api/v1/sessions", token=self.candidate_token, json_body={
            "interview_type": "dsa",
            "difficulty": "easy",
            "duration_minutes": 30
        }, expected_status=409, domain="Orchestrator", name="Concurrent Session Guard (409)")

        if self.test_session_id:
            sid = self.test_session_id
            self.req("GET", f"/api/v1/sessions/{sid}", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Get Session Details")
            self.req("POST", f"/api/v1/sessions/{sid}/start", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Start Session (created -> in_progress)")
            self.req("POST", f"/api/v1/sessions/{sid}/turns", token=self.candidate_token, json_body={
                "role": "candidate",
                "content": "I understand the problem. I will use a two-pointer approach to reverse the linked list in O(N) time."
            }, expected_status=201, domain="Orchestrator", name="Append Dialogue Turn")
            self.req("GET", f"/api/v1/sessions/{sid}/turns", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Get Dialogue Turns")
            self.req("POST", f"/api/v1/sessions/{sid}/code", token=self.candidate_token, json_body={
                "session_id": sid,
                "language": "python",
                "code": "class Solution:\n    def reverseList(self, head):\n        prev = None\n        curr = head\n        while curr:\n            nxt = curr.next\n            curr.next = prev\n            prev = curr\n            curr = nxt\n        return prev"
            }, expected_status=200, domain="Orchestrator", name="Submit Candidate Code")
            self.req("POST", f"/api/v1/sessions/{sid}/heartbeat", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Client Heartbeat Ping")
            self.req("POST", f"/api/v1/sessions/{sid}/consent", token=self.candidate_token, json_body={"consent": True}, expected_status=200, domain="Orchestrator", name="Recording Consent Update")
            self.req("POST", f"/api/v1/sessions/{sid}/pause", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Pause Session")
            self.req("POST", f"/api/v1/sessions/{sid}/resume", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Resume Session")
            self.req("POST", f"/api/v1/sessions/{sid}/complete", token=self.candidate_token, expected_status=200, domain="Orchestrator", name="Complete Session")

        # ── 6. Video Service & LiveKit ──
        self.req("GET", "/api/v1/video/health", expected_status=200, domain="Video", name="Video Health Check")
        self.req("GET", "/api/v1/video", expected_status=200, domain="Video", name="Video Root Info")
        test_room = f"test_room_{ts % 10000}"
        self.req("POST", "/api/v1/video/token", json_body={
            "room_name": test_room,
            "participant_identity": f"user_{ts % 10000}"
        }, expected_status=200, domain="Video", name="Mint LiveKit Room JWT")
        self.req("POST", "/api/v1/video/preflight", json_body={
            "browser": "Chrome",
            "has_camera": True,
            "has_mic": True
        }, expected_status=200, domain="Video", name="Preflight Device Diagnostics")
        self.req("POST", "/api/v1/video/room/create", json_body={"room_name": test_room}, expected_status=200, domain="Video", name="Create Video Room")
        self.req("GET", f"/api/v1/video/room/{test_room}", expected_status=200, domain="Video", name="Get Video Room Details")
        self.req("GET", f"/api/v1/video/room/{test_room}/recording/status", expected_status=200, domain="Video", name="Get Recording Status")
        self.req("DELETE", f"/api/v1/video/room/{test_room}", expected_status=200, domain="Video", name="Cleanup Video Room")

        # ── 7. Code Execution Service ──
        self.req("GET", "/api/v1/execute/languages", expected_status=200, domain="CodeExecution", name="Get Supported Languages")
        self.req("POST", "/api/v1/execute", json_body={
            "language": "python",
            "code": "print('DevMeet Sandbox Execution OK')\nresult = 2 + 3\nprint(f'Result: {result}')"
        }, expected_status=200, domain="CodeExecution", name="Run Python Sandbox Code")
        self.req("POST", "/api/v1/execute/scan-safety", json_body={
            "language": "python",
            "code": "import sys\nprint('safe code')"
        }, expected_status=200, domain="CodeExecution", name="AST Safety Scanner")
        self.req("POST", "/api/v1/execute/run-tests", json_body={
            "language": "python",
            "code": "def solution(a, b):\n    return a + b",
            "test_cases": [
                {"input": "1 2\n", "expected_output": "3"},
                {"input": "10 20\n", "expected_output": "30"}
            ]
        }, expected_status=200, domain="CodeExecution", name="Run Test Cases")

        # ── 8. AI Interviewer Service ──
        self.req("GET", "http://localhost:8004/health", expected_status=200, domain="AIInterviewer", name="AI Interviewer Health (Direct)")
        self.req("POST", "/api/v1/interview/hint", token=self.candidate_token, json_body={
            "question": "Reverse a Linked List",
            "interview_type": "dsa",
            "code_so_far": "def reverse(head): pass"
        }, expected_status=[200, 403, 429, 503], domain="AIInterviewer", name="Request Problem Hint (Pro Tier Gated)")
        self.req("POST", "/api/v1/interview/star-analysis", token=self.candidate_token, json_body={
            "answer": "In my previous project, we faced a major caching latency spike. I profiled Redis queries, identified missing indices, and refactored the key schema, which reduced p99 latency by 60%."
        }, expected_status=[200, 429, 503], domain="AIInterviewer", name="STAR Behavioral Analysis")

        # ── 9. Analytics Service ──
        self.req("GET", "/api/v1/analytics/metrics", expected_status=200, domain="Analytics", name="Global Analytics Metrics")
        self.req("GET", "/api/v1/analytics/daily", expected_status=200, domain="Analytics", name="Daily Session Distribution")
        self.req("GET", "/api/v1/analytics/languages", expected_status=200, domain="Analytics", name="Language Metrics")
        self.req("GET", "/api/v1/analytics/scores", expected_status=200, domain="Analytics", name="Score Distribution")
        self.req("GET", "/api/v1/analytics/funnel", expected_status=200, domain="Analytics", name="User Funnel Metrics")
        self.req("GET", "/api/v1/analytics/retention", expected_status=200, domain="Analytics", name="Retention Cohorts")
        self.req("GET", "/api/v1/analytics/realtime", expected_status=200, domain="Analytics", name="Realtime Platform Telemetry")
        if self.candidate_user_id:
            uid = self.candidate_user_id
            self.req("GET", f"/api/v1/analytics/user/{uid}/dashboard", expected_status=200, domain="Analytics", name="User Analytics Dashboard")
            self.req("GET", f"/api/v1/analytics/user/{uid}/sessions", expected_status=200, domain="Analytics", name="User Session History")
            self.req("GET", f"/api/v1/analytics/user/{uid}/score-trend", expected_status=200, domain="Analytics", name="User Score Trend")

        # ── 10. Feedback Service ──
        self.req("GET", "http://localhost:8007/health", expected_status=200, domain="Feedback", name="Feedback Health Check (Direct)")
        if self.test_session_id:
            self.req("GET", f"/api/v1/feedback/{self.test_session_id}", expected_status=[200, 404], domain="Feedback", name="Get Session Feedback Report")

        # ── 11. Payment Service ──
        self.req("GET", "/api/v1/payments/config", expected_status=200, domain="Payments", name="Payment Gateway Config")
        self.req("GET", "/api/v1/payments/plans", expected_status=200, domain="Payments", name="Available Subscription Plans")
        self.req("GET", "/api/v1/payments/subscription", token=self.candidate_token, expected_status=200, domain="Payments", name="User Subscription Status")
        self.req("GET", "/api/v1/payments/billing-history", token=self.candidate_token, expected_status=200, domain="Payments", name="User Billing History")
        self.req("POST", "/api/v1/payments/checkout-session", token=self.candidate_token, json_body={"plan": "pro"}, expected_status=200, domain="Payments", name="Create Checkout Session")

        # ── 12. Admin Service (Guarded by RBAC via Nginx) ──
        self.req("GET", "/api/v1/admin/stats", token=self.candidate_token, expected_status=403, domain="Admin", name="Admin Stats Forbidden for Candidate")
        self.req("GET", "/api/v1/admin/stats", token=self.admin_token, expected_status=200, domain="Admin", name="Admin Stats Allowed for Admin")
        self.req("GET", "/api/v1/admin/users", token=self.admin_token, expected_status=200, domain="Admin", name="Admin User Directory")
        self.req("GET", "/api/v1/admin/audit-logs", token=self.admin_token, expected_status=200, domain="Admin", name="Admin Audit Logs")
        self.req("GET", "/api/v1/admin/sessions", token=self.admin_token, expected_status=200, domain="Admin", name="Admin Global Sessions Monitor")
        self.req("GET", "/api/v1/admin/system/health", token=self.admin_token, expected_status=200, domain="Admin", name="Admin Relational DB Health")

        # ── 13. File Service ──
        self.req("GET", "http://localhost:8011/health", expected_status=200, domain="Files", name="File Service Health (Direct)")
        self.req("GET", "/api/v1/files/list", token=self.candidate_token, expected_status=200, domain="Files", name="List Files via Gateway")

        # ── Summary ──
        total = len(self.results)
        passed = sum(1 for r in self.results if r["success"])
        failed = total - passed
        print("=" * 82)
        print(f"Total API Endpoints Tested: {total}")
        print(f"Passed: {passed} | Failed: {failed}")
        print(f"Overall Success Rate: {round(passed / total * 100, 1)}%")
        print("=" * 82)

        self.generate_markdown_report(total, passed, failed)
        return total, passed, failed

    def generate_markdown_report(self, total, passed, failed):
        md = []
        md.append("# DevMeet — Master API Verification & Test Report\n")
        md.append(f"**Execution Date:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}  ")
        md.append(f"**Gateway Target:** `{self.base_url}`  ")
        md.append(f"**Total Tested Endpoints:** {total}  ")
        md.append(f"**Passed:** {passed}  ")
        md.append(f"**Failed:** {failed}  ")
        md.append(f"**Pass Rate:** **{round(passed / total * 100, 1)}%**  \n")
        md.append("---\n")
        md.append("## API Results by Domain\n")
        md.append("| Domain | Method | Endpoint | Expected | Actual | Latency | Status |")
        md.append("|:---|:---|:---|:---:|:---:|:---:|:---:|")

        for r in self.results:
            status_badge = "✅ PASS" if r["success"] else "❌ FAIL"
            exp = str(r["expected"])
            md.append(f"| {r['domain']} | `{r['method']}` | `{r['endpoint']}` | `{exp}` | `{r['actual']}` | {r['latency_ms']}ms | {status_badge} |")

        md.append("\n---\n")
        md.append("## Detailed Domain Breakdown\n")

        domains = {}
        for r in self.results:
            domains.setdefault(r["domain"], []).append(r)

        for dom, items in domains.items():
            d_pass = sum(1 for i in items if i["success"])
            d_tot = len(items)
            md.append(f"### {dom} ({d_pass}/{d_tot} passed)\n")
            for it in items:
                mark = "✅" if it["success"] else "❌"
                md.append(f"- **{mark} {it['name']}** (`{it['method']} {it['endpoint']}`)")
                md.append(f"  - Status: `{it['actual']}` (Expected: `{it['expected']}`) | Latency: `{it['latency_ms']}ms`")
                if it["preview"]:
                    md.append(f"  - Response Preview: `{it['preview'][:100]}`")
                md.append("")

        report_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "API_TEST_REPORT.md")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(md))
        print(f"[Report] Generated master API report at: {report_path}")

if __name__ == "__main__":
    clear_redis_rate_limits()
    suite = ApiTestSuite(GATEWAY_URL)
    tot, p, f = suite.run_all()
    sys.exit(0 if f == 0 else 1)
