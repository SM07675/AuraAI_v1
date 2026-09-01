"""
AI Gateway — multi-provider orchestration with automatic fallback.

Tries providers in priority order. If one fails (error, timeout, rate limit),
it automatically falls back to the next configured provider.
Uses a circuit breaker pattern to avoid hammering failed providers.
"""

from __future__ import annotations

import time
from typing import AsyncIterator

from app.ai.base import AIProvider, AIRequest, AIResponse, StreamChunk
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.nvidia_nim import NvidiaNimProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.core.config import get_settings
from app.core.exceptions import AIProviderError, AIProviderUnavailableError
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Circuit breaker: provider is paused for this many seconds after N failures
_CIRCUIT_OPEN_SECONDS = 60
_FAILURE_THRESHOLD = 3


class _CircuitBreaker:
    """Simple per-provider circuit breaker."""

    def __init__(self) -> None:
        self._failures: dict[str, int] = {}
        self._opened_at: dict[str, float] = {}

    def is_open(self, provider_name: str) -> bool:
        """True if the circuit is open (provider paused)."""
        opened = self._opened_at.get(provider_name)
        if opened is None:
            return False
        if time.monotonic() - opened > _CIRCUIT_OPEN_SECONDS:
            # Auto-reset after timeout
            self._failures[provider_name] = 0
            del self._opened_at[provider_name]
            return False
        return True

    def record_failure(self, provider_name: str) -> None:
        self._failures[provider_name] = self._failures.get(provider_name, 0) + 1
        if self._failures[provider_name] >= _FAILURE_THRESHOLD:
            self._opened_at[provider_name] = time.monotonic()
            logger.warning("Circuit breaker opened", provider=provider_name)

    def record_success(self, provider_name: str) -> None:
        self._failures[provider_name] = 0
        self._opened_at.pop(provider_name, None)


_breaker = _CircuitBreaker()

# Provider registry
_PROVIDER_MAP: dict[str, type[AIProvider]] = {
    "nvidia_nim": NvidiaNimProvider,
    "gemini": GeminiProvider,
    "openai": OpenAIProvider,
}


class AIGateway:
    """Orchestrates AI providers with priority-based fallback.

    Usage:
        gateway = AIGateway()
        response = await gateway.generate(request)

        async for chunk in gateway.stream(request):
            print(chunk.content)
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._providers: list[AIProvider] = self._build_providers()

    def _build_providers(self) -> list[AIProvider]:
        """Build ordered list of configured providers."""
        priority = self._settings.ai_provider_priority_list
        providers: list[AIProvider] = []
        for name in priority:
            cls = _PROVIDER_MAP.get(name)
            if cls is None:
                logger.warning("Unknown AI provider in priority list", provider=name)
                continue
            provider = cls()
            if provider.is_configured:
                providers.append(provider)
                logger.info("AI provider registered", provider=name)
            else:
                logger.warning("AI provider not configured (missing API key)", provider=name)
        return providers

    def _available_providers(self) -> list[AIProvider]:
        """Return providers that are configured and not circuit-broken."""
        return [p for p in self._providers if not _breaker.is_open(p.name)]

    async def generate(self, request: AIRequest) -> AIResponse:
        """Generate a response, falling back through providers on error.

        RC-19 compliance: Never returns empty content.
        If provider returns empty, retries once with an explicit hint,
        then emits a safe fallback message.
        """
        available = self._available_providers()
        if not available:
            raise AIProviderUnavailableError("All AI providers are unavailable or circuit-broken.")

        last_error: Exception | None = None
        for provider in available:
            try:
                logger.info("Trying AI provider", provider=provider.name)
                response = await provider.generate(request)

                # ── Empty content guard ───────────────────────────
                if not response.content or not response.content.strip():
                    logger.warning(
                        "Provider returned empty content — retrying with explicit hint",
                        provider=provider.name,
                        finish_reason=response.finish_reason,
                        raw_response=repr(response),
                    )
                    # Retry once: append explicit instruction to the last user message
                    retry_request = AIRequest(
                        system_prompt=request.system_prompt,
                        messages=list(request.messages or []) + [
                            {"role": "user", "content": "Please respond with a helpful message."}
                        ] if request.messages else None,
                        prompt=request.prompt if not request.messages else "",
                        stream=False,
                        temperature=0.7,
                        max_tokens=request.max_tokens,
                    )
                    try:
                        response = await provider.generate(retry_request)
                    except Exception as retry_exc:
                        logger.error("Retry also failed", provider=provider.name, error=str(retry_exc))
                        response = AIResponse(
                            content="I'm here and listening. Could you tell me a bit more?",
                            provider=provider.name,
                            model="fallback",
                        )

                    if not response.content or not response.content.strip():
                        logger.error(
                            "Provider returned empty content on retry — using fallback message",
                            provider=provider.name,
                        )
                        response = AIResponse(
                            content="I'm here and listening. Could you tell me a bit more?",
                            provider=provider.name,
                            model="fallback",
                        )

                _breaker.record_success(provider.name)
                logger.info(
                    "AI generation complete",
                    provider=provider.name,
                    tokens=response.completion_tokens,
                    content_len=len(response.content),
                )
                return response
            except Exception as exc:
                last_error = exc
                _breaker.record_failure(provider.name)
                logger.warning(
                    "AI provider failed, trying next",
                    provider=provider.name,
                    error=str(exc),
                )

        raise AIProviderUnavailableError(
            f"All providers failed. Last error: {last_error}"
        )

    async def stream(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        """Stream a response, falling back through providers on error.

        Note: Once streaming starts from a provider, no fallback is possible.
        Fallback only applies if the provider fails to *start* the stream.
        """
        available = self._available_providers()
        if not available:
            raise AIProviderUnavailableError("All AI providers are unavailable or circuit-broken.")

        last_error: Exception | None = None
        for provider in available:
            try:
                logger.info("Starting stream", provider=provider.name)
                yielded_content = False
                async for chunk in provider.stream(request):
                    if chunk.content:
                        yielded_content = True
                    yield chunk

                if yielded_content:
                    _breaker.record_success(provider.name)
                elif not yielded_content:
                    # Stream completed but no content tokens were emitted
                    logger.warning(
                        "Stream yielded no content tokens — emitting fallback",
                        provider=provider.name,
                    )
                    yield StreamChunk(
                        content="I'm here and listening. Could you tell me a bit more?",
                        provider=provider.name,
                        is_final=True,
                    )
                return  # Completed successfully
            except Exception as exc:
                last_error = exc
                _breaker.record_failure(provider.name)
                logger.warning(
                    "Stream provider failed, trying next",
                    provider=provider.name,
                    error=str(exc),
                )

        raise AIProviderUnavailableError(
            f"All streaming providers failed. Last error: {last_error}"
        )

    async def get_provider_statuses(self) -> list[dict]:
        """Return health status of all registered providers."""
        statuses = []
        for provider in self._providers:
            status = await provider.health_check()
            status["circuit_open"] = _breaker.is_open(provider.name)
            statuses.append(status)
        return statuses
