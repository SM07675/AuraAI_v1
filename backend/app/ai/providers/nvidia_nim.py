"""
NVIDIA NIM provider adapter.

Uses the NVIDIA NIM API (OpenAI-compatible) via httpx for async streaming.
Primary AI provider for Aura AI 2.0.
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


class NvidiaNimProvider(AIProvider):
    """NVIDIA NIM adapter (OpenAI-compatible API)."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    @property
    def name(self) -> str:
        return "nvidia_nim"

    @property
    def is_configured(self) -> bool:
        return bool(self._settings.nvidia_nim_api_key)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._settings.nvidia_nim_base_url,
                headers={
                    "Authorization": f"Bearer {self._settings.nvidia_nim_api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=httpx.Timeout(60.0, connect=10.0),
            )
        return self._client

    def _build_messages(self, request: AIRequest) -> list[dict]:
        """Build OpenAI-format message list."""
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        if request.messages:
            messages.extend(request.messages)
        else:
            messages.append({"role": "user", "content": request.prompt})
        return messages

    async def generate(self, request: AIRequest) -> AIResponse:
        """Generate a complete response."""
        client = self._get_client()
        payload = {
            "model": self._settings.nvidia_nim_model,
            "messages": self._build_messages(request),
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "stream": False,
        }

        if "nemotron" in self._settings.nvidia_nim_model.lower():
            payload["chat_template_kwargs"] = {"enable_thinking": True}
            payload["reasoning_budget"] = 1024

        try:
            response = await client.post("/chat/completions", json=payload)
            if response.status_code == 429:
                raise AIProviderRateLimitError("NVIDIA NIM rate limit exceeded.")
            response.raise_for_status()
            data = response.json()

            choice = data["choices"][0]
            usage = data.get("usage", {})

            return AIResponse(
                content=choice["message"]["content"],
                provider=self.name,
                model=self._settings.nvidia_nim_model,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                finish_reason=choice.get("finish_reason", "stop"),
            )
        except (AIProviderError, AIProviderRateLimitError):
            raise
        except httpx.TimeoutException as exc:
            raise AIProviderError(f"NVIDIA NIM request timed out: {exc}") from exc
        except Exception as exc:
            raise AIProviderError(f"NVIDIA NIM error: {exc}") from exc

    async def stream(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        """Stream response chunks using Server-Sent Events."""
        client = self._get_client()
        payload = {
            "model": self._settings.nvidia_nim_model,
            "messages": self._build_messages(request),
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "stream": True,
        }

        if "nemotron" in self._settings.nvidia_nim_model.lower():
            payload["chat_template_kwargs"] = {"enable_thinking": True}
            payload["reasoning_budget"] = 1024

        try:
            async with client.stream("POST", "/chat/completions", json=payload) as response:
                if response.status_code == 429:
                    raise AIProviderRateLimitError("NVIDIA NIM rate limit exceeded.")
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:].strip()
                    if data_str == "[DONE]":
                        yield StreamChunk(content="", provider=self.name, is_final=True)
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        finish = data["choices"][0].get("finish_reason")
                        if content:
                            yield StreamChunk(
                                content=content,
                                provider=self.name,
                                is_final=finish is not None,
                                finish_reason=finish,
                            )
                    except (json.JSONDecodeError, KeyError):
                        continue
        except (AIProviderError, AIProviderRateLimitError):
            raise
        except Exception as exc:
            raise AIProviderError(f"NVIDIA NIM stream error: {exc}") from exc

    async def health_check(self) -> dict:
        """Verify API key is configured and endpoint is reachable."""
        if not self.is_configured:
            return {"status": "not_configured", "provider": self.name}
        try:
            client = self._get_client()
            response = await client.get("/models", timeout=5.0)
            return {
                "status": "healthy" if response.status_code == 200 else "degraded",
                "provider": self.name,
                "model": self._settings.nvidia_nim_model,
            }
        except Exception as exc:
            return {"status": "unhealthy", "provider": self.name, "error": str(exc)}
