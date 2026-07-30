"""
AIService — single entry point for AI generation across the application.

All modules use AIService. No module imports provider-specific code.
The gateway handles provider selection, fallback, and error handling.
"""

from __future__ import annotations

from typing import AsyncIterator

from app.ai.base import AIRequest, AIResponse, StreamChunk
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Module-level singleton
_gateway: AIGateway | None = None


def get_ai_service() -> "AIService":
    """Get the AIService singleton instance."""
    return AIService()


class AIService:
    """High-level AI generation service.

    Wraps the AIGateway and provides convenience methods.
    This is the ONLY class other modules should use for AI generation.
    """

    def __init__(self) -> None:
        global _gateway
        if _gateway is None:
            _gateway = AIGateway()
        self._gateway = _gateway

    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        max_tokens: int = 500,
        temperature: float = 0.7,
        messages: list[dict] | None = None,
    ) -> AIResponse:
        """Generate a complete (non-streaming) response.

        Args:
            prompt: User message or final prompt text.
            system_prompt: System instruction (persona, rules).
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative).
            messages: Optional conversation history in message format.

        Returns:
            AIResponse with generated content and metadata.
        """
        request = AIRequest(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages or [],
            stream=False,
        )
        return await self._gateway.generate(request)

    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        max_tokens: int = 500,
        temperature: float = 0.7,
        messages: list[dict] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Stream a response token by token.

        Args:
            prompt: User message or final prompt text.
            system_prompt: System instruction (persona, rules).
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature.
            messages: Optional conversation history.

        Yields:
            StreamChunk objects with incremental content.
        """
        request = AIRequest(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages or [],
            stream=True,
        )
        async for chunk in self._gateway.stream(request):
            yield chunk

    async def get_provider_statuses(self) -> list[dict]:
        """Get health status of all AI providers."""
        return await self._gateway.get_provider_statuses()
