"""
Interview Orchestrator Service - Session management, coordination
Port: 8003
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import db
from .routes import router
from .outbox import outbox_publisher
from .middleware import RequestIDMiddleware

FEEDBACK_SERVICE_URL = os.getenv("FEEDBACK_SERVICE_URL", "http://localhost:8007")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db.connect()
    await outbox_publisher.start(FEEDBACK_SERVICE_URL)
    yield
    # Shutdown
    await outbox_publisher.stop()
    await db.disconnect()

app = FastAPI(
    title="Interview Orchestrator Service",
    description="Manages interview sessions and coordinates services",
    version="1.0.0",
    lifespan=lifespan
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
    return {"status": "healthy", "service": "orchestrator-service"}


@app.get("/")
async def root():
    return {"message": "Interview Orchestrator Service API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
