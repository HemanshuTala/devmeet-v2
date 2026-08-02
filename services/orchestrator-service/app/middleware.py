"""
X-Request-ID middleware for distributed request tracing.

Every inbound request gets a unique ID (from the X-Request-ID header if provided,
otherwise a generated UUID). The ID is:
  - Stored on request.state.request_id for downstream use
  - Included in all structured log output
  - Returned in the response X-Request-ID header

Services should forward this header when making outgoing HTTP calls
so the same request can be traced across the service mesh.
"""
import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that propagates or generates X-Request-ID on every request.

    Usage in main.py:
        from .middleware import RequestIDMiddleware
        app.add_middleware(RequestIDMiddleware)
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Read existing header or generate a new one
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        start_time = time.time()

        response = await call_next(request)

        # Attach to response
        response.headers["X-Request-ID"] = request_id

        # Structured access log
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
