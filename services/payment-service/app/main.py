import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routes import router
from .database import db
from .middleware import RequestIDMiddleware
from .config import razorpay_enabled, RAZORPAY_KEY_ID

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(
    title="DevMeet Payment Service",
    version="1.0.0",
    description="Razorpay billing, subscription lifecycle, and plan management",
    lifespan=lifespan,
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
async def health():
    return {
        "status": "healthy",
        "service": "payment-service",
        "db_connected": not db._use_memory,
        "razorpay_configured": razorpay_enabled(),
        "razorpay_key_prefix": RAZORPAY_KEY_ID[:12] + "..." if RAZORPAY_KEY_ID else None,
    }


@app.get("/")
def root():
    return {"message": "DevMeet Payment Service", "port": 8012}
