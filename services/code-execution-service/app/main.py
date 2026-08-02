"""
Code Execution Service - Docker sandbox for code execution
Port: 8005
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .middleware import RequestIDMiddleware

app = FastAPI(
    title="Code Execution Service",
    description="Secure code execution using Docker containers",
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


@app.on_event("startup")
async def startup_event():
    from .queue_manager import start_queue_worker
    start_queue_worker()



@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "code-execution-service"}


@app.get("/")
async def root():
    return {"message": "Code Execution Service API"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
