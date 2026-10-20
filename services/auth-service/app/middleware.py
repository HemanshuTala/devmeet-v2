"""
================================================================================
DevMeet v2.0 - Request ID & Distributed Tracing Middleware (`middleware.py`)
================================================================================
Responsibility:
    Provides distributed request tracing across the entire microservices architecture.
    Extracts an incoming `X-Request-ID` header from upstream services (such as the
    API Gateway or Frontend) or generates a fresh UUIDv4 identifier if none was provided.

Why this is important in Microservices:
    When a single user action (like "Start Interview") calls the API Gateway, which
    calls the Orchestrator, which calls the AI Interviewer, which calls the Code
    Executor, all related log messages across all services share the exact same
    `request_id`. This allows an engineer to trace a single request's complete path
    through distributed log aggregators in seconds.
================================================================================
"""

import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Dedicated logger instance for request metrics
logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    HTTP Middleware that attaches a unique correlation ID to every incoming request
    and measures end-to-end request latency.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Processes every incoming HTTP request before it reaches endpoint handlers,
        and modifies the HTTP response before returning it to the client.

        Execution Steps:
            1. Read incoming `X-Request-ID` header; if missing, generate a new UUIDv4 string.
            2. Store the ID in `request.state.request_id` for access by downstream handlers.
            3. Record the start timestamp to benchmark endpoint latency.
            4. Execute the next handler in the FastAPI middleware stack (`call_next`).
            5. Attach the `X-Request-ID` to the outgoing response headers so the caller can trace it.
            6. Compute elapsed time in milliseconds and write a structured log entry.

        Args:
            request (Request): The incoming FastAPI HTTP request.
            call_next (RequestResponseEndpoint): The next middleware or route handler.

        Returns:
            Response: The HTTP response with tracing headers and execution time logged.
        """
        # Step 1: Extract or generate correlation ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # Step 2: Store on request state so routes can log or forward it
        request.state.request_id = request_id

        # Step 3: Record start timestamp
        start_time = time.time()
        
        # Step 4: Pass request through the rest of the application
        response = await call_next(request)
        
        # Step 5: Echo correlation ID in the response headers for caller debugging
        response.headers["X-Request-ID"] = request_id

        # Step 6: Calculate latency and log structured telemetry
        duration_ms = round((time.time() - start_time) * 1000, 1)
        logger.info(
            "request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id, request.method, request.url.path,
            response.status_code, duration_ms,
        )
        return response
