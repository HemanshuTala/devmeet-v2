"""
================================================================================
ANALYTICS SERVICE — DISTRIBUTED TRACING & TELEMETRY MIDDLEWARE
================================================================================
Role & Responsibility:
  This middleware implements correlation tracking and latency monitoring for all
  inbound HTTP requests to the Analytics Service (Port 8008).

Architectural Value:
  - Distributed Correlation: Extracts or synthesizes `X-Request-ID` to link analytics
    dashboard lookups back to upstream gateway calls.
  - Context Attachment: Stores `request_id` on `request.state` for application logging.
  - Duration Profiling: Accurately times query execution durations for complex SQL
    aggregation operations (cohort percentiles, time-series metrics).
  - Response Header Reflection: Echoes `X-Request-ID` in outgoing HTTP response headers.
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
        Intercepts incoming requests, measures execution duration, and attaches correlation headers.

        Parameters:
          request (Request): Inbound FastAPI HTTP request.
          call_next (RequestResponseEndpoint): Downstream route handler in the middleware chain.

        Returns:
          Response: The HTTP response with 'X-Request-ID' attached.

        Flow:
          1. Reads existing 'X-Request-ID' header or creates a new UUIDv4 string.
          2. Mounts the ID to `request.state.request_id`.
          3. Measures execution duration in milliseconds.
          4. Emits structured access log.
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
