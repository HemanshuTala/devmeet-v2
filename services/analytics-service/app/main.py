import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .database import db
from .middleware import RequestIDMiddleware

app = FastAPI(title="DevMeet Analytics Service", version="1.0.0")

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
def health_check():
    return {
        "status": "healthy",
        "service": "analytics-service",
        "postgres_connected": db.use_db
    }

@app.get("/")
def read_root():
    return {"message": "DevMeet Analytics Service API"}
