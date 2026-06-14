"""Pydantic schemas for Vision Chat API."""

from pydantic import BaseModel, Field, field_validator
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
    image: str = Field(
        ...,
        description="Base64-encoded JPEG image with data URI prefix (data:image/jpeg;base64,...)",
    )
    history: list[HistoryMessage] = Field(default_factory=list, max_length=16)
    client_metrics: Optional[ClientMetrics] = None

    @field_validator("image")
    @classmethod
    def validate_image_format(cls, v: str) -> str:
        """Validate that the image field has the expected data URI format."""
        if not v.startswith("data:image/"):
            raise ValueError(
                "图片格式无效：必须以 data:image/ 开头。"
                "请重新捕获关键帧。"
            )
        if "base64," not in v:
            raise ValueError(
                "图片编码无效：缺少 base64 数据。请重新捕获关键帧。"
            )
        return v

    @field_validator("question")
    @classmethod
    def validate_question_not_empty(cls, v: str) -> str:
        """Ensure question is not just whitespace."""
        if not v.strip():
            raise ValueError("问题不能为空")
        return v


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
