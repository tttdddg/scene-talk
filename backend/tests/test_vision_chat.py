"""Test vision chat endpoint validation and error handling.

These tests validate request schemas, error mappings, and API behavior
without calling a real vision model.
"""

import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Minimal valid base64 JPEG data URI for testing
VALID_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA=="


# ---- Validation tests ----


def test_question_empty_rejected():
    """Question must be non-empty."""
    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 422  # Pydantic validation error


def test_question_whitespace_rejected():
    """Question with only whitespace should be rejected."""
    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "   ",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 422


def test_question_too_long_rejected():
    """Question exceeding max length should be rejected."""
    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "A" * 2001,
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 422


def test_image_missing_data_prefix_rejected():
    """Image without data URI prefix should be rejected."""
    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==",  # No data: prefix
            "history": [],
        },
    )
    assert response.status_code == 422


def test_image_missing_base64_marker_rejected():
    """Image without base64 marker should be rejected."""
    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": "data:image/jpeg,not-base64-just-raw",
            "history": [],
        },
    )
    assert response.status_code == 422


def test_history_role_validation():
    """History messages with invalid role should be rejected."""
    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": VALID_IMAGE,
            "history": [{"role": "system", "content": "bad role"}],
        },
    )
    assert response.status_code == 422


# ---- Error mapping tests ----


@patch("app.api.vision_chat.vision_client.chat")
def test_vision_timeout_error(mock_chat):
    """Timeout errors should return 408 with proper error body."""
    from app.services.vision_client import VisionTimeoutError

    mock_chat.side_effect = VisionTimeoutError(request_id="test-123")

    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 408
    data = response.json()
    assert data["code"] == "VISION_MODEL_TIMEOUT"
    assert data["request_id"] == "test-123"
    assert "超时" in data["message"]


@patch("app.api.vision_chat.vision_client.chat")
def test_rate_limit_error(mock_chat):
    """Rate limit errors should return 429 with proper error body."""
    from app.services.vision_client import VisionRateLimitError

    mock_chat.side_effect = VisionRateLimitError(request_id="test-456")

    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 429
    data = response.json()
    assert data["code"] == "RATE_LIMITED"
    assert data["request_id"] == "test-456"


@patch("app.api.vision_chat.vision_client.chat")
def test_service_unavailable_error(mock_chat):
    """Auth/connection errors should return 503."""
    from app.services.vision_client import VisionServiceError

    mock_chat.side_effect = VisionServiceError(request_id="test-789")

    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 503
    data = response.json()
    assert data["code"] == "VISION_SERVICE_UNAVAILABLE"
    assert data["request_id"] == "test-789"


@patch("app.api.vision_chat.vision_client.chat")
def test_empty_response_error(mock_chat):
    """Empty model responses should return 500 with EMPTY_RESPONSE code."""
    from app.services.vision_client import VisionEmptyResponseError

    mock_chat.side_effect = VisionEmptyResponseError(request_id="test-empty")

    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "这是什么？",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 500
    data = response.json()
    assert data["code"] == "EMPTY_RESPONSE"


@patch("app.api.vision_chat.vision_client.chat")
def test_successful_chat(mock_chat):
    """A successful chat returns 200 with the expected response structure."""
    mock_chat.return_value = {
        "request_id": "test-success-001",
        "answer": "我看到一个红色的杯子放在桌面上。",
        "model": "qwen3.5-plus",
        "latency_ms": 1234,
        "usage": {"input_tokens": 500, "output_tokens": 80},
    }

    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "桌上有什么？",
            "image": VALID_IMAGE,
            "history": [],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == "test-success-001"
    assert data["answer"] == "我看到一个红色的杯子放在桌面上。"
    assert data["model"] == "qwen3.5-plus"
    assert data["latency_ms"] == 1234
    assert data["history_rounds"] == 0
    assert data["usage"]["input_tokens"] == 500
    assert data["usage"]["output_tokens"] == 80


@patch("app.api.vision_chat.vision_client.chat")
def test_history_passed_correctly(mock_chat):
    """History is properly passed to the vision client and trimmed."""
    mock_chat.return_value = {
        "request_id": "test-hist-001",
        "answer": "明白了。",
        "model": "qwen3.5-plus",
        "latency_ms": 800,
        "usage": {"input_tokens": 300, "output_tokens": 30},
    }

    history = [
        {"role": "user", "content": "这是什么颜色？"},
        {"role": "assistant", "content": "这是红色的。"},
    ]

    response = client.post(
        "/api/v1/vision/chat",
        json={
            "question": "它是什么形状的？",
            "image": VALID_IMAGE,
            "history": history,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["history_rounds"] == 1  # 2 messages = 1 round
    # Verify the client was called with trimmed history
    call_args = mock_chat.call_args
    assert call_args is not None
    # history argument should have the 2 messages
    assert len(call_args[1]["history"]) == 2
