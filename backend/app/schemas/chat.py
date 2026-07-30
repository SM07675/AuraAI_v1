"""
Chat / conversation Pydantic schemas.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    """Request to send a text message."""

    session_id: Optional[int] = Field(None, description="Existing session ID; omit to start a new session")
    content: str = Field(..., min_length=1, max_length=4096, description="User message text")
    emotion_data: Optional[dict[str, Any]] = Field(None, description="Optional emotion payload from client")


class VoiceMessageRequest(BaseModel):
    """Request to send a voice message."""

    session_id: Optional[int] = Field(None, description="Existing session ID; omit to start a new session")
    audio_base64: str = Field(..., description="Base64-encoded audio bytes")
    sample_rate: int = Field(16000, description="Audio sample rate in Hz")
    channels: int = Field(1, description="Number of audio channels")
    duration_sec: Optional[float] = Field(None, description="Audio duration in seconds")


class MessageResponse(BaseModel):
    """A single message in a conversation."""

    id: int
    session_id: int
    role: str
    content: str
    message_type: str
    emotion_data: Optional[dict[str, Any]] = None
    ai_provider: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    """A conversation session."""

    id: int
    title: Optional[str] = None
    status: str
    summary: Optional[str] = None
    created_at: str
    ended_at: Optional[str] = None
    message_count: int = 0

    model_config = {"from_attributes": True}


class EndSessionRequest(BaseModel):
    """Request to end a session and generate a summary."""

    session_id: int
