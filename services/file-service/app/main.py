import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from .routes import router
from .middleware import RequestIDMiddleware

app = FastAPI(title="DevMeet File Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

# Startup event to ensure uploads directory exists and is mounted
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount local uploads directory as static
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Include service router
app.include_router(router)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "file-service",
        "storage_mode": "s3" if os.getenv("AWS_ACCESS_KEY_ID") else "local"
    }

@app.get("/")
def read_root():
    return {"message": "DevMeet File Service API"}
