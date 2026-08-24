"""
NVIDIA NIM provider adapter.

Uses the NVIDIA NIM API (OpenAI-compatible) via httpx for async streaming.
Primary AI provider for Aura AI 2.0.
"""

from __future__ import annotations

import json
import re
from typing import AsyncIterator

import httpx

from app.ai.base import AIProvider, AIRequest, AIResponse, StreamChunk
from app.core.config import get_settings
from app.core.exceptions import AIProviderError, AIProviderRateLimitError
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Phrases and words that warrant instant, fast responses without deep thinking overhead
_FAST_RESPONSE_PATTERNS = {
    "hello", "hi", "hey", "hola", "howdy", "sup", "yo", "good morning",
    "good afternoon", "good evening", "good night", "goodnight", "bye", "goodbye",
    "see you", "see ya", "thanks", "thank you", "thx", "ok", "okay", "k",
    "yes", "no", "yep", "nope", "sure", "cool", "great", "nice", "got it",
    "how are you", "who are you", "what is your name", "what's up", "how are you doing",
    "what can you do", "nice to meet you", "how's it going", "tell me a joke",
    "are you there", "can you hear me", "ping", "test"
}

_COMPLEX_TRIGGER_KEYWORDS = {
    "why", "how should i", "help me understand", "explain", "depressed",
    "depression", "anxious", "anxiety", "panic", "suicide", "grief",
    "breakup", "relationship", "career", "advice", "strategy", "plan",
    "solve", "analyze", "evaluate", "compare", "diagnose", "recommend",
    "trauma", "overwhelmed", "hopeless", "confused", "decision", "struggling"
}


class NvidiaNimProvider(AIProvider):
    """NVIDIA NIM adapter (OpenAI-compatible API) with dynamic thinking mode."""

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

    def _is_thinking_supported(self, model_name: str) -> bool:
        """Check if model supports chat_template_kwargs enable_thinking."""
        m = model_name.lower()
        return "gemma-4" in m or "gemma" in m or "nemotron" in m or "r1" in m or "qwq" in m

    def _determine_thinking_mode(self, request: AIRequest) -> bool:
        """Dynamically determine whether thinking mode should be enabled.
        
        Rules:
        1. If explicitly requested in request.enable_thinking, respect it.
        2. If in real-time mode ('face_to_face', 'voice', 'live', 'realtime'), disable thinking
           to ensure sub-second low-latency voice and video interaction.
        3. If the user message is a short greeting, casual acknowledgement, or quick check-in
           (< 12 words without complex emotional/cognitive triggers), disable thinking for fast responses.
        4. If the message is a complex question, deep emotional query, or long paragraph,
           enable thinking mode for deep reasoning.
        """
        # 1. Explicit request override
        if request.enable_thinking is not None:
            return request.enable_thinking

        # 2. Mode-based rule: Face-to-Face and Voice require ultra-low latency
        if request.mode in ("face_to_face", "voice", "live", "realtime"):
            logger.debug("Thinking mode DISABLED for real-time mode", mode=request.mode)
            return False

        # Extract the user's latest text
        user_text = ""
        if request.messages:
            for m in reversed(request.messages):
                if m.get("role") == "user":
                    content = m.get("content", "")
                    if isinstance(content, str):
                        user_text = content
                    elif isinstance(content, list):
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                user_text += item.get("text", "") + " "
                    break
        if not user_text:
            user_text = request.prompt or ""

        clean_text = user_text.strip().lower()
        clean_no_punct = re.sub(r"[^\w\s]", "", clean_text).strip()

        # Fast Response for casual greetings & common pleasantries
        if clean_no_punct in _FAST_RESPONSE_PATTERNS or clean_text in _FAST_RESPONSE_PATTERNS:
            logger.debug("Thinking mode DISABLED for casual greeting/chit-chat", user_text=user_text[:50])
            return False

        words = clean_text.split()
        has_complex_trigger = any(kw in clean_text for kw in _COMPLEX_TRIGGER_KEYWORDS)

        # Fast response for brief utterances under 10 words without complex triggers
        if len(words) <= 10 and not has_complex_trigger:
            logger.debug("Thinking mode DISABLED for short quick query", word_count=len(words))
            return False

        logger.debug("Thinking mode ENABLED for complex/deep query", word_count=len(words), has_trigger=has_complex_trigger)
        return True

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
        enable_thinking = self._determine_thinking_mode(request)
        model_name = self._settings.nvidia_nim_model

        # Token allocation: up to 16384 for deep thinking, lower for fast responses
        max_tokens = 16384 if enable_thinking else (request.max_tokens or 1024)

        payload: dict = {
            "model": model_name,
            "messages": self._build_messages(request),
            "max_tokens": max_tokens,
            "temperature": request.temperature or (1.0 if enable_thinking else 0.7),
            "top_p": request.top_p or 0.95,
            "stream": False,
        }

        if self._is_thinking_supported(model_name):
            payload["chat_template_kwargs"] = {"enable_thinking": enable_thinking}

        if request.extra_params:
            payload.update(request.extra_params)

        try:
            response = await client.post("/chat/completions", json=payload)
            if response.status_code == 429:
                raise AIProviderRateLimitError("NVIDIA NIM rate limit exceeded.")
            response.raise_for_status()
            data = response.json()

            choice = data["choices"][0]
            usage = data.get("usage", {})
            raw_content = choice["message"]["content"] or ""

            # Clean any internal <think>...</think> tags from output text
            clean_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()
            if not clean_content and raw_content:
                clean_content = raw_content.strip()

            return AIResponse(
                content=clean_content,
                provider=self.name,
                model=model_name,
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
        enable_thinking = self._determine_thinking_mode(request)
        model_name = self._settings.nvidia_nim_model

        max_tokens = 16384 if enable_thinking else (request.max_tokens or 1024)

        payload: dict = {
            "model": model_name,
            "messages": self._build_messages(request),
            "max_tokens": max_tokens,
            "temperature": request.temperature or (1.0 if enable_thinking else 0.7),
            "top_p": request.top_p or 0.95,
            "stream": True,
        }

        if self._is_thinking_supported(model_name):
            payload["chat_template_kwargs"] = {"enable_thinking": enable_thinking}

        if request.extra_params:
            payload.update(request.extra_params)

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
                        content = delta.get("content") or ""
                        finish = data["choices"][0].get("finish_reason")
                        if content or finish is not None:
                            yield StreamChunk(
                                content=content,
                                provider=self.name,
                                is_final=finish is not None,
                                finish_reason=finish,
                            )
                    except (json.JSONDecodeError, KeyError, IndexError):
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

