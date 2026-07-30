"""
Google Gemini provider adapter.

Uses the Gemini REST API via httpx for async streaming.
Acts as secondary AI provider with automatic fallback.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from app.ai.base import AIProvider, AIRequest, AIResponse, StreamChunk
from app.core.config import get_settings
from app.core.exceptions import AIProviderError, AIProviderRateLimitError
from app.core.logging_config import get_logger

logger = get_logger(__name__)

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiProvider(AIProvider):
    """Google Gemini adapter."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def is_configured(self) -> bool:
        return bool(self._settings.gemini_api_key)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=_GEMINI_BASE,
                timeout=httpx.Timeout(60.0, connect=10.0),
            )
        return self._client

    def _build_contents(self, request: AIRequest) -> list[dict]:
        """Build Gemini-format contents list."""
        contents = []
        if request.messages:
            for msg in request.messages:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        else:
            contents.append({"role": "user", "parts": [{"text": request.prompt}]})
        return contents

    def _build_system(self, request: AIRequest) -> dict | None:
        if request.system_prompt:
            return {"parts": [{"text": request.system_prompt}]}
        return None

    async def generate(self, request: AIRequest) -> AIResponse:
        """Generate a complete response."""
        client = self._get_client()
        model = self._settings.gemini_model
        url = f"/models/{model}:generateContent"
        params = {"key": self._settings.gemini_api_key}

        body: dict = {
            "contents": self._build_contents(request),
            "generationConfig": {
                "maxOutputTokens": request.max_tokens,
                "temperature": request.temperature,
                "topP": request.top_p,
            },
        }
        sys_inst = self._build_system(request)
        if sys_inst:
            body["systemInstruction"] = sys_inst

        try:
            response = await client.post(url, params=params, json=body)
            if response.status_code == 429:
                raise AIProviderRateLimitError("Gemini rate limit exceeded.")
            response.raise_for_status()
            data = response.json()

            content = data["candidates"][0]["content"]["parts"][0]["text"]
            usage = data.get("usageMetadata", {})

            return AIResponse(
                content=content,
                provider=self.name,
                model=model,
                prompt_tokens=usage.get("promptTokenCount", 0),
                completion_tokens=usage.get("candidatesTokenCount", 0),
            )
        except (AIProviderError, AIProviderRateLimitError):
            raise
        except Exception as exc:
            raise AIProviderError(f"Gemini error: {exc}") from exc

    async def stream(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        """Stream response using Gemini streaming endpoint."""
        client = self._get_client()
        model = self._settings.gemini_model
        url = f"/models/{model}:streamGenerateContent"
        params = {"key": self._settings.gemini_api_key, "alt": "sse"}

        body: dict = {
            "contents": self._build_contents(request),
            "generationConfig": {
                "maxOutputTokens": request.max_tokens,
                "temperature": request.temperature,
                "topP": request.top_p,
            },
        }
        sys_inst = self._build_system(request)
        if sys_inst:
            body["systemInstruction"] = sys_inst

        try:
            async with client.stream("POST", url, params=params, json=body) as response:
                if response.status_code == 429:
                    raise AIProviderRateLimitError("Gemini rate limit exceeded.")
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if not data_str:
                        continue
                    try:
                        data = json.loads(data_str)
                        candidates = data.get("candidates", [])
                        if not candidates:
                            continue
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            text = part.get("text", "")
                            if text:
                                finish = candidates[0].get("finishReason")
                                yield StreamChunk(
                                    content=text,
                                    provider=self.name,
                                    is_final=finish is not None and finish != "STOP",
                                    finish_reason=finish,
                                )
                    except (json.JSONDecodeError, KeyError):
                        continue

            yield StreamChunk(content="", provider=self.name, is_final=True)
        except (AIProviderError, AIProviderRateLimitError):
            raise
        except Exception as exc:
            raise AIProviderError(f"Gemini stream error: {exc}") from exc

    async def health_check(self) -> dict:
        if not self.is_configured:
            return {"status": "not_configured", "provider": self.name}
        try:
            client = self._get_client()
            url = f"/models/{self._settings.gemini_model}"
            response = await client.get(url, params={"key": self._settings.gemini_api_key}, timeout=5.0)
            return {
                "status": "healthy" if response.status_code == 200 else "degraded",
                "provider": self.name,
                "model": self._settings.gemini_model,
            }
        except Exception as exc:
            return {"status": "unhealthy", "provider": self.name, "error": str(exc)}
