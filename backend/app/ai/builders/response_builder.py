"""
Response Builder

Validates and improves the raw AI response before returning it to the user.
Integrates with the ResponseValidator service for comprehensive validation.

For voice streaming: acts as a lightweight token filter to prevent latency regression.
For text chat: can perform a full LLM refinement pass + validation.
"""

from __future__ import annotations

import re

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.models.user import User
from app.services.response_validator import ResponseValidator

logger = get_logger(__name__)

# Patterns to remove from streaming tokens
_STREAM_ARTIFACTS = [
    "As an AI language model, ",
    "As an AI, ",
    "As a large language model, ",
    "I don't have personal experiences, but ",
    "I'm just an AI, ",
    "I cannot feel emotions, but ",
]

# Special token patterns
_SPECIAL_TOKEN_RE = re.compile(r"<\|.*?\|>")
_INSTRUCTION_TOKEN_RE = re.compile(r"\[INST\]|\[/INST\]|<<SYS>>|<</SYS>>")


class ResponseBuilder:
    """Validates and optionally refines AI responses.

    Args:
        gateway: AI gateway for LLM-based refinement (text chat only).
    """

    def __init__(self, gateway: AIGateway) -> None:
        self._gateway = gateway
        self._validator = ResponseValidator()
        self._system_prompt = (
            "You are a Response Refinement Engine.\n"
            "Your job is to take the raw AI response and improve it.\n"
            "1. Remove any repetitive phrases.\n"
            "2. Ensure tone consistency based on the user's communication style.\n"
            "3. Fix any grammatical errors.\n"
            "4. Remove any self-referential AI phrases.\n"
            "Return ONLY the refined response text. Do not add any conversational filler "
            "like 'Here is the improved version'."
        )

    async def refine_text(
        self,
        raw_response: str,
        user: User,
        recent_history: list[dict[str, str]] | None = None,
        emotion_context: dict | None = None,
    ) -> str:
        """Validate and optionally refine a complete text response.

        Args:
            raw_response: The raw AI-generated response.
            user: Current user for style matching.
            recent_history: Recent conversation for repetition check.
            emotion_context: Current emotion state for tone check.

        Returns:
            Validated (and possibly refined) response text.
        """
        # Step 1: Validate
        validation = self._validator.validate(
            response=raw_response,
            recent_history=recent_history,
            emotion_context=emotion_context,
        )

        if not validation.is_valid and validation.severity == "error":
            # Hard failure — return fallback
            logger.warning(
                "Response validation hard failure",
                issues=validation.issues,
            )
            return self._validator.get_fallback_response()

        # Step 2: If response is too short, skip refinement
        if len(raw_response.strip()) < 30:
            return raw_response

        # Step 3: LLM refinement for text chat
        prompt = (
            f"User Communication Style: {user.communication_style or 'balanced'}\n\n"
            f"Raw Response:\n{raw_response}"
        )

        req = AIRequest(
            system_prompt=self._system_prompt,
            prompt=prompt,
            stream=False,
            temperature=0.3,
        )

        try:
            logger.info("Refining raw AI response: %s", raw_response)
            resp = await self._gateway.generate(req)
            refined = resp.content.strip()
            
            if not refined or refined == "[]" or refined == "{}":
                logger.warning("AI refinement returned empty or empty JSON. Falling back to original.")
                return raw_response if len(raw_response.strip()) > 0 else "I'm having trouble generating a response right now. Please try again."
                
            logger.info("Refined response generated successfully")
            return refined
        except Exception as e:
            logger.error("ResponseBuilder failed to refine text: %s", str(e))
            return raw_response

    def validate_response(
        self,
        response: str,
        recent_history: list[dict[str, str]] | None = None,
        emotion_context: dict | None = None,
    ) -> tuple[bool, str]:
        """Validate a response without refinement.

        Returns:
            Tuple of (is_valid, response_or_fallback).
        """
        validation = self._validator.validate(
            response=response,
            recent_history=recent_history,
            emotion_context=emotion_context,
        )

        if not validation.is_valid and validation.severity == "error":
            return False, self._validator.get_fallback_response()

        return True, response

    def filter_stream_token(self, token: str) -> str:
        """Lightweight token-level filter for voice streaming.

        Removes common LLM artifacts without adding latency.
        Cannot wait for the full response — operates per-token.
        """
        if not token:
            return token

        # Remove self-referential phrases
        for artifact in _STREAM_ARTIFACTS:
            token = token.replace(artifact, "")

        # Remove special tokens
        token = _SPECIAL_TOKEN_RE.sub("", token)
        token = _INSTRUCTION_TOKEN_RE.sub("", token)

        return token


class ThinkingStreamFilter:
    """Stateful stream filter that strips out internal model thinking blocks,
    <think>...</think> tags, and self-reasoning preambles before sending chunks to the user.
    """

    def __init__(self) -> None:
        self._in_think_tag: bool = False
        self._buffer: str = ""
        self._passthrough: bool = False

    def process_chunk(self, chunk: str) -> str:
        if not chunk:
            return ""

        if self._passthrough:
            return chunk

        self._buffer += chunk

        # Check for <think> tags
        if "<think>" in self._buffer:
            self._in_think_tag = True

        if self._in_think_tag:
            if "</think>" in self._buffer:
                self._buffer = self._buffer.split("</think>", 1)[1].lstrip()
                self._in_think_tag = False
                self._passthrough = True
                out = self._buffer
                self._buffer = ""
                return out
            return ""

        # Check for reasoning preamble keywords
        reasoning_keywords = ["We are at the", "According to the", "Let's craft", "Steps:", "Let's check:", "Let's go with:"]
        if any(kw in self._buffer[:300] for kw in reasoning_keywords):
            if "\n\n" in self._buffer or 'Let\'s go with: "' in self._buffer:
                parts = re.split(r'\n\n|Let\'s go with: "', self._buffer)
                final_part = parts[-1].strip().strip('"')
                if final_part and not any(kw in final_part for kw in reasoning_keywords):
                    self._passthrough = True
                    self._buffer = ""
                    return final_part
            return ""

        # No thinking detected — pass through
        if len(self._buffer) > 20 or "\n" in self._buffer or " " in self._buffer:
            self._passthrough = True
            out = self._buffer
            self._buffer = ""
            return out

        return ""

    def flush(self) -> str:
        if self._in_think_tag:
            return ""
        if not self._buffer:
            return ""
        out = self._buffer
        self._buffer = ""
        reasoning_keywords = ["We are at the", "According to the", "Let's craft", "Steps:", "Let's check:", "Let's go with:"]
        if any(kw in out for kw in reasoning_keywords):
            matches = re.findall(r'"([^"]+)"', out)
            if matches:
                return matches[-1]
            lines = [l.strip() for l in out.split("\n") if l.strip()]
            return lines[-1] if lines else ""
        return out
