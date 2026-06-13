"""Pydantic schemas for Vision Chat API."""

from pydantic import BaseModel, Field
from typing import Optional


class HistoryMessage(BaseModel):
    """A single message in conversation history."""
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ClientMetrics(BaseModel):
    """Metrics reported by the frontend client."""
    original_bytes: int = Field(ge=0)
    compressed_bytes: int = Field(ge=0)
    capture_duration_ms: int = Field(ge=0)


class VisionChatRequest(BaseModel):
    """Request body for the vision chat endpoint."""
    question: str = Field(..., min_length=1, max_length=2000)
    image: str = Field(..., description="Base64-encoded JPEG image with data URI prefix")
    history: list[HistoryMessage] = Field(default_factory=list, max_length=16)
    client_metrics: Optional[ClientMetrics] = None


class VisionChatResponse(BaseModel):
    """Successful response from the vision chat endpoint."""
    request_id: str
    answer: str
    model: str
    latency_ms: int
    history_rounds: int
    usage: dict = Field(default_factory=lambda: {"input_tokens": None, "output_tokens": None})


class ErrorResponse(BaseModel):
    """Error response."""
    code: str
    message: str
    request_id: str
