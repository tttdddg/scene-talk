"""Vision Chat API endpoint."""

import time
from fastapi import APIRouter, HTTPException
from app.schemas.vision_chat import (
    VisionChatRequest,
    VisionChatResponse,
    ErrorResponse,
)
from app.services.vision_client import VisionClient
from app.core.config import settings

router = APIRouter()
vision_client = VisionClient()


@router.post(
    "/vision/chat",
    response_model=VisionChatResponse,
    responses={
        200: {"description": "Successful response"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        408: {"model": ErrorResponse, "description": "Request timeout"},
        429: {"model": ErrorResponse, "description": "Rate limited"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
        503: {"model": ErrorResponse, "description": "Service unavailable"},
    },
)
async def vision_chat(request: VisionChatRequest):
    """Process a vision-based question with an image from the camera."""
    # Check image size
    if len(request.image) > settings.max_image_bytes * 1.4:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "IMAGE_TOO_LARGE",
                "message": "图片过大，请调整画面后重试。",
                "request_id": "N/A",
            },
        )

    # Convert history to dict format
    history_dicts = [h.model_dump() for h in request.history]

    try:
        result = vision_client.chat(
            question=request.question,
            image_base64=request.image,
            history=history_dicts,
        )
    except TimeoutError:
        raise HTTPException(
            status_code=408,
            detail={
                "code": "VISION_MODEL_TIMEOUT",
                "message": "视觉分析等待时间过长，请重新提问。",
                "request_id": "N/A",
            },
        )
    except Exception as e:
        error_msg = str(e)
        if "rate" in error_msg.lower() or "limit" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMITED",
                    "message": "当前请求较多，请稍等几秒后重试。",
                    "request_id": "N/A",
                },
            )
        if "auth" in error_msg.lower() or "api_key" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "VISION_SERVICE_UNAVAILABLE",
                    "message": "视觉服务暂时不可用，请稍后重试。",
                    "request_id": "N/A",
                },
            )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "服务内部错误，请稍后重试。",
                "request_id": "N/A",
            },
        )

    if not result["answer"]:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "EMPTY_RESPONSE",
                "message": "这次没有得到有效回答，请重新描述问题。",
                "request_id": result["request_id"],
            },
        )

    return VisionChatResponse(
        request_id=result["request_id"],
        answer=result["answer"],
        model=result["model"],
        latency_ms=result["latency_ms"],
        history_rounds=len(request.history) // 2,
        usage=result["usage"],
    )
