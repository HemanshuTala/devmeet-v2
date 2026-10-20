"""
AI Interviewer Service Application Entry Point.
==============================================
Port: 8004
Service Responsibility:
-----------------------
The AI Interviewer Service provides real-time intelligent interviewing capabilities
powered by Groq Cloud LPUs running open-weight LLMs (Llama 3.3 70B Versatile, Mixtral).

Key Architectural Components:
-----------------------------
1. High-Speed Low-Latency Streaming:
   Uses Server-Sent Events (SSE) and chunked HTTP streaming to deliver real-time token
   responses to candidates as the interviewer speaks.
2. Resilience & Circuit Breaking:
   Implements a 3-state Circuit Breaker (CLOSED, OPEN, HALF_OPEN) to prevent cascading
   outages when external AI provider APIs face rate limits or downtime.
3. Multi-Key Rotation:
   Distributes API traffic across a pool of Groq API keys with automatic cooldowns on HTTP 429.
4. Intelligent Heuristic Fallback:
   If external LLM APIs fail completely, deterministic rule-based heuristics generate
   relevant follow-up questions so the candidate's interview is never interrupted.
5. Prompt Engineering & Defense:
   Embeds interview system prompts with prompt-injection defenses (jailbreak mitigation).
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .middleware import RequestIDMiddleware

# Initialize FastAPI application
app = FastAPI(
    title="AI Interviewer Service",
    description="Low-latency AI interview question generation and streaming via Groq LPUs",
    version="1.0.0"
)

# ─── Cross-Origin Resource Sharing (CORS) ─────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Distributed Tracing Middleware ───────────────────────────────────────────
# Injects or propagates X-Request-ID across AI generation requests
app.add_middleware(RequestIDMiddleware)

# Mount all AI generation, streaming, and testing endpoints under /api/v1/ai
app.include_router(router)


@app.get("/health")
async def health_check():
    """
    Standard microservice health check endpoint queried by Docker and the API gateway.
    """
    return {"status": "healthy", "service": "ai-interviewer-service"}


@app.get("/")
async def root():
    """
    Diagnostic root message for service verification.
    """
    return {"message": "AI Interviewer Service API"}


if __name__ == "__main__":
    # Local development server runner
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
