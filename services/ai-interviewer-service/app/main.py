"""
AI Interviewer Service - Groq integration for AI-powered interviews
Port: 8004
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .middleware import RequestIDMiddleware

app = FastAPI(
    title="AI Interviewer Service",
    description="AI-powered interview questions and feedback using Groq",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-interviewer-service"}


@app.get("/")
async def root():
    return {"message": "AI Interviewer Service API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
