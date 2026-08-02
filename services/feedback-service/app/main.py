import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .database import db
from .middleware import RequestIDMiddleware

app = FastAPI(
    title="Feedback Service",
    description="AI-generated feedback and PDF generation",
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

@app.on_event("startup")
async def startup_event():
    await db.connect()

@app.on_event("shutdown")
async def shutdown_event():
    await db.disconnect()

app.include_router(router)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "feedback-service",
        "postgres_connected": db.use_db
    }

@app.get("/")
async def root():
    return {"message": "Feedback Service API"}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8007, reload=True)
