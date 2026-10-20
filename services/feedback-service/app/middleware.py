"""
================================================================================
FEEDBACK SERVICE — DISTRIBUTED TRACING & TELEMETRY MIDDLEWARE
================================================================================
Role & Responsibility:
  This middleware implements request correlation tracking and performance profiling
  for all HTTP requests entering the Feedback Service (Port 8007).

Architectural Value:
  - Inter-Service Correlation: Extracts `X-Request-ID` passed from the Orchestrator
    Service (Port 8003) or API Gateway (Port 8000), ensuring end-to-end trace continuity.
  - Automatic UUIDv4 Generation: Generates an RFC 4122 UUID if the header was omitted.
  - Duration Profiling: Accurately benchmarks wall-clock execution time (in milliseconds)
    for heavy operations like LLM feedback synthesis and HTML-to-PDF rendering.
  - Context Propagation: Mounts `request_id` onto `request.state` for route-level logging
    and reflects it in downstream HTTP response headers.
================================================================================
"""

import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    HTTP middleware intercepting every inbound request to bind correlation IDs and log latency metrics.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Processes inbound requests, tracks execution latency, and attaches response headers.

        Parameters:
          request (Request): The incoming FastAPI HTTP request.
          call_next (RequestResponseEndpoint): Downstream route handler in the execution chain.

        Returns:
          Response: The HTTP response containing the 'X-Request-ID' header.

        Flow:
          1. Reads existing 'X-Request-ID' header or creates a new UUIDv4 string.
          2. Attaches the tracking ID to `request.state.request_id`.
          3. Measures execution duration in milliseconds.
          4. Emits a structured telemetry log entry.
          5. Injects 'X-Request-ID' into outbound response headers.
        """
        # Step 1: Read or synthesize correlation identifier
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Step 2: Record request start timestamp
        start_time = time.time()
        
        # Step 3: Dispatch request to route handler
        response = await call_next(request)
        
        # Step 4: Inject tracing header into HTTP response
        response.headers["X-Request-ID"] = request_id

        # Step 5: Calculate wall-clock duration and emit structured access log
        duration_ms = round((time.time() - start_time) * 1000, 1)
        logger.info(
            "request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response
