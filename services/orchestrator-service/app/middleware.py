"""
Distributed Request Tracing Middleware for Orchestrator Service.
================================================================
This module implements the `RequestIDMiddleware`, which guarantees that every
interview action (session initiation, question progression, code execution request,
and session termination) maintains a continuous correlation ID.

Why Tracing is Vital for Interview Orchestration:
-------------------------------------------------
An interview session involves complex inter-service choreography:
Frontend -> API Gateway -> Orchestrator -> AI Interviewer (Groq LLM streaming)
                       -> Code Sandbox (Docker execution)
                       -> User Service (Quota check)
                       -> Feedback Service (Outbox completion)

By assigning or preserving an `X-Request-ID`:
1. Devops and engineering can grep a single UUID to trace the entire lifecycle
   of a specific question answer or code run across all service logs.
2. Latency of the orchestrator pipeline is precisely measured (`duration_ms`).
3. Outgoing responses echo the ID back to the frontend for client diagnostics.
"""

import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Logger for correlation tracking and access telemetry
logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that captures or mints `X-Request-ID` correlation identifiers for all requests.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Intercepts incoming HTTP request, times execution, attaches tracking headers,
        and emits structured telemetry.

        Parameters:
            request (Request): Starlette/FastAPI request object.
            call_next (RequestResponseEndpoint): The downstream route handler.

        Returns:
            Response: Outgoing HTTP response containing `X-Request-ID` header.
        """
        # Read incoming correlation header from API Gateway or generate a fresh UUID v4
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # Store in request.state for downstream handler visibility
        request.state.request_id = request_id

        # High-precision timer for duration calculation
        start_time = time.time()

        # Execute downstream request pipeline
        response = await call_next(request)

        # Attach correlation ID to response headers
        response.headers["X-Request-ID"] = request_id

        # Calculate total latency in milliseconds
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
