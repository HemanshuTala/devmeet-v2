from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Language(str, Enum):
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    JAVA = "java"
    CPP = "cpp"
    GO = "go"
    RUST = "rust"


class ExecutionRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=10000)
    language: Language
    timeout_seconds: int = Field(default=10, ge=1, le=60)


class ExecutionResponse(BaseModel):
    success: bool
    output: str
    error: Optional[str] = None
    execution_time: float
    memory_used: Optional[int] = None


class TestResult(BaseModel):
    test_name: str
    passed: bool
    output: str
    expected: str
