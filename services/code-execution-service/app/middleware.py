"""
================================================================================
CODE EXECUTION SERVICE — DISTRIBUTED TRACING & TELEMETRY MIDDLEWARE
================================================================================
Role & Responsibility:
  This middleware implements end-to-end distributed request tracing across the
  microservices ecosystem. When a candidate runs or submits code from the frontend,
  their request journeys through:
    Next.js UI -> API Gateway (Port 8000) -> Code Execution Service (Port 8005) -> Docker Daemon

Architectural Value:
  - Correlation Propagation: Reads `X-Request-ID` from incoming HTTP headers or generates
    a unique RFC 4122 UUIDv4 if omitted.
  - Context Attachment: Stores the tracking identifier in `request.state.request_id`
    so downstream routes, background queue jobs, and error logs can reference it.
  - Duration Profiling: Measures execution latency in milliseconds and outputs structured
    access logs for latency monitoring and auditing.
  - Response Header Reflection: Attaches `X-Request-ID` to all HTTP responses, allowing
    frontend clients to report exact transaction IDs on support tickets.
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
    HTTP middleware intercepting every inbound request to inject correlation IDs and log metrics.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Intercepts incoming requests, profiles execution latency, and injects tracing headers.

        Parameters:
          request (Request): The incoming FastAPI HTTP request.
          call_next (RequestResponseEndpoint): Next middleware or route handler in the chain.

        Returns:
          Response: The HTTP response with 'X-Request-ID' attached.

        Flow:
          1. Extracts existing 'X-Request-ID' header or generates a fresh UUID.
          2. Binds the ID to `request.state.request_id`.
          3. Measures request duration in milliseconds.
          4. Emits structured log line containing request method, path, status, and duration.
          5. Returns response with 'X-Request-ID' header.
        """
        # Step 1: Extract or generate unique correlation ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Step 2: Record start timestamp
        start_time = time.time()
        
        # Step 3: Process downstream route handler
        response = await call_next(request)
        
        # Step 4: Inject correlation ID into response headers
        response.headers["X-Request-ID"] = request_id

        # Step 5: Compute execution duration and emit telemetry log
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
