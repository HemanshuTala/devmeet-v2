"""
Distributed Request Tracing Middleware for AI Interviewer Service.
==================================================================
This module provides the `RequestIDMiddleware` ensuring end-to-end trace correlation
across LLM prompt generation and token streaming sessions.

Correlation Tracking during LLM Generation:
-------------------------------------------
AI requests can involve multiple internal hops:
Client -> Orchestrator -> AI Interviewer -> Groq Cloud API
When a generation takes several seconds or encounters a rate limit, the `X-Request-ID`
allows engineers to tie LLM token latency to specific candidate turns.
"""

import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Dedicated logger for request ID tracing
logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that propagates or generates `X-Request-ID` correlation identifiers.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Intercepts incoming HTTP request, times execution, attaches tracking headers,
        and emits structured telemetry.
        """
        # Read existing correlation header from Orchestrator or generate fresh UUID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        start_time = time.time()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        duration_ms = round((time.time() - start_time) * 1000, 1)
        logger.info(
            "request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id, request.method, request.url.path,
            response.status_code, duration_ms,
        )
        return response
