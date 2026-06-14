"""OpenAI-compatible vision model client."""

import time
import uuid
import logging
from openai import OpenAI, APIError, APITimeoutError, RateLimitError, APIConnectionError
from app.core.config import settings
from app.services.prompt_builder import SYSTEM_PROMPT, build_user_message

logger = logging.getLogger(__name__)


class VisionClientError(Exception):
    """Base error for vision client failures."""

    def __init__(self, code: str, message: str, request_id: str = ""):
        self.code = code
        self.message = message
        self.request_id = request_id


class VisionTimeoutError(VisionClientError):
    """Timeout waiting for vision model."""

    def __init__(self, request_id: str = ""):
        super().__init__("VISION_MODEL_TIMEOUT", "视觉模型响应超时，请重新提问。", request_id)


class VisionRateLimitError(VisionClientError):
    """Rate limited by the vision service."""

    def __init__(self, request_id: str = ""):
        super().__init__("RATE_LIMITED", "请求过于频繁，请稍等几秒后重试。", request_id)


class VisionServiceError(VisionClientError):
    """The vision service is unavailable."""

    def __init__(self, request_id: str = ""):
        super().__init__(
            "VISION_SERVICE_UNAVAILABLE", "视觉服务暂时不可用，请稍后重试。", request_id
        )


class VisionEmptyResponseError(VisionClientError):
    """Model returned an empty answer."""

    def __init__(self, request_id: str = ""):
        super().__init__(
            "EMPTY_RESPONSE", "这次没有得到有效回答，请重新描述问题。", request_id
        )


class VisionClient:
    """Client for calling vision models via OpenAI-compatible API."""

    def __init__(self):
        self.client: OpenAI | None = None

    def _get_client(self) -> OpenAI:
        if self.client is None:
            api_key = settings.vision_api_key
            if not api_key:
                raise RuntimeError("VISION_API_KEY is not configured")
            self.client = OpenAI(
                api_key=api_key,
                base_url=settings.vision_base_url,
                timeout=float(settings.vision_timeout_seconds),
                max_retries=1,
            )
        return self.client

    def chat(
        self,
        question: str,
        image_base64: str,
        history: list[dict],
    ) -> dict:
        """Send a vision chat request and return the result.

        Args:
            question: The user's question text.
            image_base64: Base64-encoded image with data URI prefix.
            history: List of {role, content} dicts.

        Returns:
            Dict with keys: request_id, answer, model, latency_ms, usage.

        Raises:
            VisionTimeoutError: Model timed out.
            VisionRateLimitError: Rate limited.
            VisionServiceError: Auth or connection failure.
            VisionEmptyResponseError: Model returned no content.
            VisionClientError: Other failures.
        """
        request_id = str(uuid.uuid4())
        client = self._get_client()
        user_message = build_user_message(question)

        # Build messages: system prompt + trimmed history + current question with image
        messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Trim history to configured max rounds
        max_history_messages = settings.max_history_rounds * 2
        trimmed_history = history[-max_history_messages:] if len(history) > max_history_messages else history
        messages.extend(trimmed_history)

        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_message},
                    {"type": "image_url", "image_url": {"url": image_base64}},
                ],
            }
        )

        logger.info(
            "vision_chat request_id=%s model=%s history_rounds=%d image_bytes=%d question_len=%d",
            request_id,
            settings.vision_model,
            len(trimmed_history) // 2,
            len(image_base64),
            len(question),
        )

        start = time.time()
        try:
            response = client.chat.completions.create(
                model=settings.vision_model,
                messages=messages,
                max_tokens=512,
                temperature=0.3,
                timeout=float(settings.vision_timeout_seconds),
            )
        except APITimeoutError:
            latency_ms = int((time.time() - start) * 1000)
            logger.error(
                "vision_chat timeout request_id=%s latency_ms=%d", request_id, latency_ms
            )
            raise VisionTimeoutError(request_id=request_id)
        except RateLimitError:
            latency_ms = int((time.time() - start) * 1000)
            logger.warning(
                "vision_chat rate_limited request_id=%s latency_ms=%d", request_id, latency_ms
            )
            raise VisionRateLimitError(request_id=request_id)
        except APIConnectionError as e:
            latency_ms = int((time.time() - start) * 1000)
            logger.error(
                "vision_chat connection_error request_id=%s latency_ms=%d error=%s",
                request_id,
                latency_ms,
                str(e),
            )
            raise VisionServiceError(request_id=request_id)
        except APIError as e:
            latency_ms = int((time.time() - start) * 1000)
            if e.status_code == 401 or e.status_code == 403:
                logger.error(
                    "vision_chat auth_error request_id=%s status=%d",
                    request_id,
                    e.status_code,
                )
                raise VisionServiceError(request_id=request_id)
            if e.status_code == 429:
                logger.warning("vision_chat rate_limited request_id=%s", request_id)
                raise VisionRateLimitError(request_id=request_id)
            logger.error(
                "vision_chat api_error request_id=%s status=%d error=%s",
                request_id,
                e.status_code or 0,
                str(e),
            )
            raise VisionClientError(
                "VISION_API_ERROR",
                "视觉模型返回错误，请稍后重试。",
                request_id=request_id,
            )
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            logger.error(
                "vision_chat unexpected_error request_id=%s latency_ms=%d error=%s",
                request_id,
                latency_ms,
                str(e),
            )
            raise VisionClientError(
                "INTERNAL_ERROR",
                "服务内部错误，请稍后重试。",
                request_id=request_id,
            )

        latency_ms = int((time.time() - start) * 1000)
        answer = (response.choices[0].message.content or "").strip()

        if not answer:
            logger.warning(
                "vision_chat empty_response request_id=%s latency_ms=%d",
                request_id,
                latency_ms,
            )
            raise VisionEmptyResponseError(request_id=request_id)

        usage = {
            "input_tokens": getattr(response.usage, "prompt_tokens", None) if response.usage else None,
            "output_tokens": getattr(response.usage, "completion_tokens", None) if response.usage else None,
        }

        logger.info(
            "vision_chat success request_id=%s latency_ms=%d tokens_in=%s tokens_out=%s",
            request_id,
            latency_ms,
            usage["input_tokens"],
            usage["output_tokens"],
        )

        return {
            "request_id": request_id,
            "answer": answer,
            "model": settings.vision_model,
            "latency_ms": latency_ms,
            "usage": usage,
        }
