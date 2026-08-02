import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .middleware import RequestIDMiddleware

app = FastAPI(title="DevMeet Search Service", version="1.0.0")

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
def health_check():
    from .search_engine import search_engine
    return {
        "status": "healthy",
        "service": "search-service",
        "elasticsearch_connected": search_engine.use_es
    }

@app.get("/")
def read_root():
    return {"message": "DevMeet Search Service API"}
