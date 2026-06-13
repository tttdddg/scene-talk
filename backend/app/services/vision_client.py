"""OpenAI-compatible vision model client."""

import time
import uuid
from openai import OpenAI
from app.core.config import settings
from app.services.prompt_builder import SYSTEM_PROMPT, build_user_message


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
        """
        request_id = str(uuid.uuid4())
        client = self._get_client()
        user_message = build_user_message(question)

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.extend(history)
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {"url": image_base64}},
            ],
        })

        start = time.time()
        response = client.chat.completions.create(
            model=settings.vision_model,
            messages=messages,
            max_tokens=512,
            temperature=0.3,
            timeout=settings.vision_timeout_seconds,
        )
        latency_ms = int((time.time() - start) * 1000)

        answer = response.choices[0].message.content or ""
        usage = {
            "input_tokens": getattr(response.usage, "prompt_tokens", None) if response.usage else None,
            "output_tokens": getattr(response.usage, "completion_tokens", None) if response.usage else None,
        }

        return {
            "request_id": request_id,
            "answer": answer,
            "model": settings.vision_model,
            "latency_ms": latency_ms,
            "usage": usage,
        }
