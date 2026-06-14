"""Vision Chat API endpoint."""

import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.schemas.vision_chat import (
    VisionChatRequest,
    VisionChatResponse,
    ErrorResponse,
)
from app.services.vision_client import (
    VisionClient,
    VisionClientError,
    VisionTimeoutError,
    VisionRateLimitError,
    VisionServiceError,
    VisionEmptyResponseError,
)
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()
vision_client = VisionClient()

# Status code mapping for known errors
_ERROR_STATUS_MAP = {
    "IMAGE_TOO_LARGE": 400,
    "VISION_MODEL_TIMEOUT": 408,
    "RATE_LIMITED": 429,
    "VISION_SERVICE_UNAVAILABLE": 503,
    "EMPTY_RESPONSE": 500,
    "VISION_API_ERROR": 502,
    "INTERNAL_ERROR": 500,
}


def _error_response(code: str, message: str, request_id: str, status_code: int = 500) -> JSONResponse:
    """Build a unified error JSONResponse."""
    actual_status = _ERROR_STATUS_MAP.get(code, status_code)
    return JSONResponse(
        status_code=actual_status,
        content=ErrorResponse(
            code=code,
            message=message,
            request_id=request_id,
        ).model_dump(),
    )


@router.post(
    "/vision/chat",
    response_model=VisionChatResponse,
    responses={
        200: {"description": "Successful response"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        408: {"model": ErrorResponse, "description": "Request timeout"},
        429: {"model": ErrorResponse, "description": "Rate limited"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
        502: {"model": ErrorResponse, "description": "Upstream vision API error"},
        503: {"model": ErrorResponse, "description": "Service unavailable"},
    },
)
async def vision_chat(request: VisionChatRequest, raw_request: Request):
    """Process a vision-based question with a camera-captured image.

    Validates the question and image, sends them to the vision model,
    and returns the model's answer with metadata.
    """
    request_id = "N/A"

    # --- Request size guard ---
    body_bytes = getattr(raw_request, "_body", None)
    if body_bytes and len(body_bytes) > settings.max_request_bytes:
        logger.warning(
            "vision_chat request_too_large size=%d limit=%d",
            len(body_bytes),
            settings.max_request_bytes,
        )
        return _error_response(
            code="REQUEST_TOO_LARGE",
            message=f"请求体过大（{len(body_bytes)} 字节），最大允许 {settings.max_request_bytes} 字节。",
            request_id=request_id,
            status_code=400,
        )

    # --- Image size guard ---
    image_len = len(request.image)
    # base64 is ~4/3 of raw; max_image_bytes is the raw limit, so allow ~1.4×
    if image_len > settings.max_image_bytes * 1.4:
        logger.warning(
            "vision_chat image_too_large image_bytes=%d limit=%d",
            image_len,
            settings.max_image_bytes,
        )
        return _error_response(
            code="IMAGE_TOO_LARGE",
            message="图片过大，请调整摄像头画面或降低分辨率后重试。",
            request_id=request_id,
            status_code=400,
        )

    # --- History trim ---
    max_messages = settings.max_history_rounds * 2
    history = request.history[-max_messages:] if len(request.history) > max_messages else request.history
    history_dicts = [h.model_dump() for h in history]

    logger.info(
        "vision_chat received question_len=%d image_bytes=%d history_rounds=%d client_metrics=%s",
        len(request.question),
        image_len,
        len(history_dicts) // 2,
        request.client_metrics.model_dump() if request.client_metrics else None,
    )

    # --- Call vision model ---
    try:
        result = vision_client.chat(
            question=request.question.strip(),
            image_base64=request.image,
            history=history_dicts,
        )
    except VisionTimeoutError as e:
        return _error_response(e.code, e.message, e.request_id)
    except VisionRateLimitError as e:
        return _error_response(e.code, e.message, e.request_id)
    except VisionServiceError as e:
        return _error_response(e.code, e.message, e.request_id)
    except VisionEmptyResponseError as e:
        return _error_response(e.code, e.message, e.request_id)
    except VisionClientError as e:
        return _error_response(e.code, e.message, e.request_id)
    except Exception as e:
        logger.exception("vision_chat unhandled_error error=%s", str(e))
        return _error_response(
            code="INTERNAL_ERROR",
            message="服务内部错误，请稍后重试。",
            request_id=request_id,
        )

    request_id = result["request_id"]

    return VisionChatResponse(
        request_id=request_id,
        answer=result["answer"],
        model=result["model"],
        latency_ms=result["latency_ms"],
        history_rounds=len(history_dicts) // 2,
        usage=result["usage"],
    )
