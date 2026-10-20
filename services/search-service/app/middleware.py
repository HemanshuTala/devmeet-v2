"""
DevMeet Search Service - Distributed Tracing & Observability Middleware
=======================================================================
This module intercepts inbound search and query requests to attach correlation
trace identifiers and log execution latency for observability.

Key Architectural Responsibilities:
1. Distributed Correlation (Trace Continuity):
   - Adopts incoming `X-Request-ID` headers propagating from API gateways or frontend clients.
   - Generates a cryptographically random UUIDv4 if no header is present.
   - Injects the resolved ID into `request.state.request_id` for downstream handlers.
2. Latency & Performance Telemetry:
   - Measures end-to-end request duration using monotonic timestamps.
   - Logs structured execution summaries (HTTP method, route path, status code, duration in ms).
3. Egress Header Propagation:
   - Sets the `X-Request-ID` header on all outbound HTTP responses.
"""

import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Structured logger for request lifecycle tracing
logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware ensuring every HTTP interaction is tagged with a trace identifier
    and logged with its wall-clock processing duration.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Intercepts incoming requests, injects tracing identifiers, and records duration.

        Args:
            request (Request): Incoming FastAPI HTTP request.
            call_next (RequestResponseEndpoint): Next middleware or route endpoint handler.

        Returns:
            Response: Outbound HTTP response with attached correlation header.
        """
        # Adopt client correlation ID or generate fresh UUID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Measure request execution time
        start_time = time.time()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        # Compute duration in milliseconds
        duration_ms = round((time.time() - start_time) * 1000, 1)
        logger.info(
            "request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id, request.method, request.url.path,
            response.status_code, duration_ms,
        )
        return response
