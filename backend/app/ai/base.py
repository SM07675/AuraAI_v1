"""
Abstract AI provider base classes.

All provider adapters implement AIProvider. The gateway uses this
interface exclusively — no provider-specific code elsewhere.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class AIRequest:
    """Unified AI request."""

    prompt: str = ""
    system_prompt: str = ""
    max_tokens: int = 500
    temperature: float = 0.7
    top_p: float = 0.9
    stream: bool = True
    # Optional conversation history in OpenAI message format
    messages: list[dict] = field(default_factory=list)
    # Mode of interaction (e.g., 'face_to_face', 'voice', 'chat')
    mode: str | None = None
    # Thinking mode flag (None = dynamically determined by provider based on mode & intent)
    enable_thinking: bool | None = None
    # Additional provider-specific parameters
    extra_params: dict = field(default_factory=dict)


@dataclass
class AIResponse:
    """Unified AI response (non-streaming)."""

    content: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    finish_reason: str = "stop"


@dataclass
class StreamChunk:
    """A single chunk from a streaming AI response."""

    content: str
    provider: str
    is_final: bool = False
    finish_reason: str | None = None


class AIProvider(ABC):
    """Abstract base for all AI provider adapters."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g., 'nvidia_nim', 'gemini', 'openai')."""
        ...

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """True if the provider has the required API key/config."""
        ...

    @abstractmethod
    async def generate(self, request: AIRequest) -> AIResponse:
        """Generate a complete (non-streaming) response."""
        ...

    @abstractmethod
    async def stream(self, request: AIRequest) -> AsyncIterator[StreamChunk]:
        """Generate a streaming response, yielding chunks."""
        ...

    @abstractmethod
    async def health_check(self) -> dict:
        """Check provider availability. Returns status dict."""
        ...
