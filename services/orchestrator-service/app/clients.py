"""
Inter-Service HTTP Client Layer for Orchestrator Service.
=========================================================
This module manages outbound HTTP communications between the Orchestrator
and upstream/downstream microservices (Auth, User, Search).

Performance Optimization:
-------------------------
- Persistent Connection Pooling: Reuses a singleton `httpx.AsyncClient` rather
  than opening and closing TCP/TLS handshakes on every HTTP call.
- Correlation Header Propagation: Automatically attaches `X-Request-ID` to all
  outbound calls so log aggregators maintain an unbroken trace.
- Fail-Safe Timeouts: Employs explicit connection and read timeouts (5s to 10s)
  so slow microservice dependencies do not exhaust the Orchestrator's event loop.
"""

import os
from typing import Optional
import httpx

# Upstream service base URLs resolved from environment or local Docker network
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8002")
SEARCH_SERVICE_URL = os.getenv("SEARCH_SERVICE_URL", "http://localhost:8013")

# Shared HTTP client singleton for TCP socket pooling across concurrent requests
_http_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    """
    Returns the shared asynchronous HTTP client instance, initializing it if needed.
    Configured with standard connection pool limits and timeouts.
    """
    global _http_client
    if _http_client is None:
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
        _http_client = httpx.AsyncClient(timeout=10.0, limits=limits)
    return _http_client


async def close_http_client():
    """Gracefully closes persistent HTTP client connection pool on service shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


_get_http_client = get_http_client


async def fetch_seed_question(
    interview_type: str,
    difficulty: str,
    target_company: Optional[str] = None,
    request_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Retrieves a curated seed problem from the Search Service (`search-service:8013`).

    Parameters:
        interview_type (str): 'dsa', 'behavioral', or 'system_design'.
        difficulty (str): 'easy', 'medium', or 'hard'.
        target_company (Optional[str]): Target company style (e.g. 'Amazon').
        request_id (Optional[str]): Correlation ID for distributed tracing.

    Returns:
        Optional[dict]: Question record containing title, problem description, starter code,
        and test cases, or None if lookup fails or search service is unreachable.
    """
    try:
        headers = {}
        if request_id:
            headers["X-Request-ID"] = request_id
        client = get_http_client()
        params: dict = {"interview_type": interview_type, "difficulty": difficulty}
        if target_company:
            params["company"] = target_company
        
        # 5-second timeout ensures interview creation does not stall indefinitely
        response = await client.get(
            f"{SEARCH_SERVICE_URL}/api/v1/search/questions/random",
            params=params,
            headers=headers,
            timeout=5.0,
        )
        if response.status_code == 200:
            return response.json()
    except Exception:
        # Graceful degradation: If search service fails, interview proceeds with AI-generated question
        pass
    return None


async def verify_token(token: str, request_id: Optional[str] = None) -> Optional[dict]:
    """
    Validates a JWT Bearer token with Auth Service (`auth-service:8001`).

    Parameters:
        token (str): Raw JWT token string from Authorization header.
        request_id (Optional[str]): Correlation ID for distributed tracing.

    Returns:
        Optional[dict]: User profile payload if valid, or None if expired/unauthorized.
    """
    try:
        headers = {"Authorization": f"Bearer {token}"}
        if request_id:
            headers["X-Request-ID"] = request_id
        client = get_http_client()
        response = await client.get(
            f"{AUTH_SERVICE_URL}/api/v1/auth/me",
            headers=headers,
        )
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None


async def check_quota(user_id: str, token: str, request_id: Optional[str] = None) -> bool:
    """
    Checks and consumes 1 interview session credit via User Service (`user-service:8002`).

    Parameters:
        user_id (str): Candidate UUID.
        token (str): JWT Bearer token for authentication.
        request_id (Optional[str]): Correlation ID for distributed tracing.

    Returns:
        bool: True if quota was successfully decremented, False if user exceeded plan limits.
    """
    try:
        headers = {"Authorization": f"Bearer {token}"}
        if request_id:
            headers["X-Request-ID"] = request_id
        client = get_http_client()
        response = await client.post(
            f"{USER_SERVICE_URL}/api/v1/users/me/quota/increment",
            headers=headers,
        )
        return response.status_code == 200
    except Exception:
        return False
