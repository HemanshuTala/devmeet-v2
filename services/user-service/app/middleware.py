"""
Distributed Request Tracing Middleware.
========================================
This module implements the `RequestIDMiddleware`, which guarantees end-to-end correlation
tracking across microservice boundaries in the DevMeet platform.

Why Correlation IDs Matter in Distributed Microservices:
--------------------------------------------------------
When a candidate initiates an action (such as loading their profile or updating preferences),
the request traverses:
1. Browser Client -> Next.js Frontend
2. Nginx API Gateway (Port 8000)
3. User Service (Port 8002)
4. PostgreSQL Database / Redis Cache

If an error or latency spike occurs, tracing logs without a shared correlation ID
is extremely difficult across multiple microservice logs.
This middleware:
1. Extracts `X-Request-ID` if forwarded by Nginx API Gateway, or generates a new UUID v4.
2. Attaches the ID to `request.state.request_id` for downstream route handlers.
3. Echoes `X-Request-ID` in the HTTP response headers back to the gateway and client.
4. Measures request duration in milliseconds and logs a structured access log line.
"""

import uuid
import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Dedicated logger for HTTP traffic tracing
logger = logging.getLogger("request_id")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware intercepting every inbound HTTP request to attach and echo correlation IDs.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Intercepts incoming HTTP request, times execution, attaches tracking headers,
        and emits structured telemetry.

        Parameters:
            request (Request): Starlette/FastAPI request object.
            call_next (RequestResponseEndpoint): The downstream route handler or next middleware in chain.

        Returns:
            Response: Outgoing HTTP response containing `X-Request-ID` header.
        """
        # 1. Reuse existing trace ID from API Gateway or generate a fresh UUID v4
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        
        # 2. Store on request.state so route handlers can access it for internal logging
        request.state.request_id = request_id

        # 3. High-resolution wall clock timer to measure processing latency
        start_time = time.time()
        
        # 4. Invoke the downstream route handler
        response = await call_next(request)
        
        # 5. Echo correlation ID in response headers so clients can quote it when reporting issues
        response.headers["X-Request-ID"] = request_id

        # 6. Calculate execution latency in milliseconds
        duration_ms = round((time.time() - start_time) * 1000, 1)
        
        # 7. Log structured record for log aggregators (e.g. ELK, CloudWatch, Datadog)
        logger.info(
            "request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
            request_id, request.method, request.url.path,
            response.status_code, duration_ms,
        )
        return response
