"""WebSocket message schemas for Live Mode Full-Duplex.

This module defines all message types exchanged between the client and server
during Live Mode sessions. Messages support both JSON text and binary formats
for efficient audio streaming.

Requirements: 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Optional, Literal


# ==============================================================================
# Client → Server Messages
# ==============================================================================


@dataclass
class SessionStartMessage:
    """Client initiates a new Live Mode session.
    
    Requirements: 8.4
    
    Attributes:
        type: Message type identifier ("session_start")
        user_id: User ID for authenticated users, None for anonymous
        mode: Session mode ("live" or "chat")
        restore_session_id: Optional session ID to restore previous session
    """
    
    type: Literal["session_start"] = "session_start"
    user_id: Optional[int] = None
    mode: Literal["live", "chat"] = "live"
    restore_session_id: Optional[str] = None
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "user_id": self.user_id,
            "mode": self.mode,
            "restore_session_id": self.restore_session_id
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SessionStartMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            user_id=data.get("user_id"),
            mode=data.get("mode", "live"),
            restore_session_id=data.get("restore_session_id")
        )


@dataclass
class AudioChunkMessage:
    """Client sends audio chunk (supports both binary and JSON formats).
    
    Requirements: 8.5
    
    Attributes:
        type: Message type identifier ("audio_chunk")
        data: Base64-encoded PCM audio bytes (for JSON format)
        sequence: Sequence number for ordering
        binary_data: Raw PCM bytes (for binary format, not serialized)
    
    Notes:
        - Binary format: Raw PCM audio (16kHz, 16-bit, mono)
        - Chunk size: 160-3200 bytes (10-200ms)
        - JSON fallback: Base64-encoded audio in "data" field
    """
    
    type: Literal["audio_chunk"] = "audio_chunk"
    data: Optional[str] = None  # Base64-encoded for JSON format
    sequence: int = 0
    binary_data: Optional[bytes] = field(default=None, repr=False)  # For binary format
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "data": self.data,
            "sequence": self.sequence
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AudioChunkMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            data=data.get("data"),
            sequence=data.get("sequence", 0)
        )
    
    @classmethod
    def from_binary(cls, audio_bytes: bytes, sequence: int = 0) -> AudioChunkMessage:
        """Create message from raw binary audio data."""
        return cls(
            binary_data=audio_bytes,
            sequence=sequence
        )
    
    def get_audio_bytes(self) -> Optional[bytes]:
        """Get audio bytes regardless of format (binary or base64)."""
        if self.binary_data is not None:
            return self.binary_data
        if self.data is not None:
            return base64.b64decode(self.data)
        return None


@dataclass
class ModeSwitchMessage:
    """Client requests mode switch between Chat and Live modes.
    
    Requirements: 8.6
    
    Attributes:
        type: Message type identifier ("mode_switch")
        target_mode: Target mode to switch to ("chat" or "live")
    """
    
    type: Literal["mode_switch"] = "mode_switch"
    target_mode: Literal["chat", "live"] = "chat"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "target_mode": self.target_mode
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ModeSwitchMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            target_mode=data.get("target_mode", "chat")
        )


@dataclass
class InterruptMessage:
    """Client manually triggers an interrupt (barge-in).
    
    Requirements: 8.7
    
    Attributes:
        type: Message type identifier ("interrupt")
    """
    
    type: Literal["interrupt"] = "interrupt"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {"type": self.type}
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> InterruptMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls()


@dataclass
class StopSessionMessage:
    """Client requests to end the session gracefully.
    
    Requirements: 8.8
    
    Attributes:
        type: Message type identifier ("stop_session")
    """
    
    type: Literal["stop_session"] = "stop_session"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {"type": self.type}
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StopSessionMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls()


@dataclass
class PingMessage:
    """Client keepalive ping message.
    
    Requirements: 8.9
    
    Attributes:
        type: Message type identifier ("ping")
    """
    
    type: Literal["ping"] = "ping"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {"type": self.type}
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PingMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls()


# ==============================================================================
# Server → Client Messages
# ==============================================================================


@dataclass
class SessionReadyMessage:
    """Server confirms session initialization.
    
    Requirements: 8.10
    
    Attributes:
        type: Message type identifier ("session_ready")
        session_id: Unique session identifier (UUID)
        mode: Current session mode ("live" or "chat")
    """
    
    type: Literal["session_ready"] = "session_ready"
    session_id: str = ""
    mode: Literal["live", "chat"] = "live"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "session_id": self.session_id,
            "mode": self.mode
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SessionReadyMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            session_id=data.get("session_id", ""),
            mode=data.get("mode", "live")
        )


@dataclass
class AvatarStateMessage:
    """Server sends avatar state transition event.
    
    Requirements: 8.10
    
    Attributes:
        type: Message type identifier ("avatar_state")
        state: Current avatar state
        timestamp: ISO 8601 timestamp of state change
    """
    
    type: Literal["avatar_state"] = "avatar_state"
    state: str = "idle"
    timestamp: str = ""
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "state": self.state,
            "timestamp": self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AvatarStateMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            state=data.get("state", "idle"),
            timestamp=data.get("timestamp", "")
        )


@dataclass
class PartialTranscriptMessage:
    """Server sends streaming STT partial result.
    
    Requirements: 8.10
    
    Attributes:
        type: Message type identifier ("partial_transcript")
        text: Partial transcript text
        confidence: Confidence score (0.0-1.0)
        is_final: Whether this is a final transcript (always False for partial)
    """
    
    type: Literal["partial_transcript"] = "partial_transcript"
    text: str = ""
    confidence: float = 0.0
    is_final: bool = False
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "text": self.text,
            "confidence": self.confidence,
            "is_final": self.is_final
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PartialTranscriptMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            text=data.get("text", ""),
            confidence=data.get("confidence", 0.0),
            is_final=data.get("is_final", False)
        )


@dataclass
class FinalTranscriptMessage:
    """Server sends complete STT result.
    
    Requirements: 8.10
    
    Attributes:
        type: Message type identifier ("final_transcript")
        text: Final transcript text
        confidence: Confidence score (0.0-1.0)
        is_final: Whether this is a final transcript (always True)
    """
    
    type: Literal["final_transcript"] = "final_transcript"
    text: str = ""
    confidence: float = 0.0
    is_final: bool = True
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "text": self.text,
            "confidence": self.confidence,
            "is_final": self.is_final
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FinalTranscriptMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            text=data.get("text", ""),
            confidence=data.get("confidence", 0.0),
            is_final=data.get("is_final", True)
        )


@dataclass
class EmotionMessage:
    """Server sends fused emotion state update.
    
    Requirements: 8.11
    
    Attributes:
        type: Message type identifier ("emotion")
        primaryEmotion: Primary detected emotion
        confidence: Overall confidence score (0.0-1.0)
        stressLevel: Stress level (0.0-1.0)
        activeSources: List of active emotion sources (text, voice, face)
        conflict: Whether conflicting emotions detected across modalities
        timestamp: ISO 8601 timestamp
    """
    
    type: Literal["emotion"] = "emotion"
    primaryEmotion: str = "neutral"
    confidence: float = 0.0
    stressLevel: float = 0.0
    activeSources: list[str] = field(default_factory=list)
    conflict: bool = False
    timestamp: str = ""
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "primaryEmotion": self.primaryEmotion,
            "confidence": self.confidence,
            "stressLevel": self.stressLevel,
            "activeSources": self.activeSources,
            "conflict": self.conflict,
            "timestamp": self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EmotionMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            primaryEmotion=data.get("primaryEmotion", "neutral"),
            confidence=data.get("confidence", 0.0),
            stressLevel=data.get("stressLevel", 0.0),
            activeSources=data.get("activeSources", []),
            conflict=data.get("conflict", False),
            timestamp=data.get("timestamp", "")
        )


@dataclass
class CrisisMessage:
    """Server sends crisis signal detection event.
    
    Requirements: 8.11
    
    Attributes:
        type: Message type identifier ("crisis")
        severity: Crisis severity level ("low", "medium", "high")
        trigger: What triggered the crisis detection
        partial_text: The text that triggered the detection
        timestamp: ISO 8601 timestamp
        resources: Crisis resources (hotline numbers, etc.)
    """
    
    type: Literal["crisis"] = "crisis"
    severity: str = "low"
    trigger: str = ""
    partial_text: str = ""
    timestamp: str = ""
    resources: dict[str, str] = field(default_factory=dict)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "severity": self.severity,
            "trigger": self.trigger,
            "partial_text": self.partial_text,
            "timestamp": self.timestamp,
            "resources": self.resources
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CrisisMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            severity=data.get("severity", "low"),
            trigger=data.get("trigger", ""),
            partial_text=data.get("partial_text", ""),
            timestamp=data.get("timestamp", ""),
            resources=data.get("resources", {})
        )


@dataclass
class SentenceMessage:
    """Server sends complete sentence chunk text.
    
    Requirements: 8.12
    
    Attributes:
        type: Message type identifier ("sentence")
        text: Complete sentence text
        sequence: Sequence number for ordering
    """
    
    type: Literal["sentence"] = "sentence"
    text: str = ""
    sequence: int = 0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "text": self.text,
            "sequence": self.sequence
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SentenceMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            text=data.get("text", ""),
            sequence=data.get("sequence", 0)
        )


@dataclass
class ServerAudioChunkMessage:
    """Server sends TTS audio chunk.
    
    Requirements: 8.12
    
    Attributes:
        type: Message type identifier ("audio_chunk")
        data: Base64-encoded audio bytes (for JSON format)
        sequence: Sequence number for ordering
        format: Audio format specification
        binary_data: Raw audio bytes (for binary format, not serialized)
    
    Notes:
        - Supports both binary and JSON formats
        - Binary format preferred for efficiency
        - JSON fallback uses base64 encoding
    """
    
    type: Literal["audio_chunk"] = "audio_chunk"
    data: Optional[str] = None  # Base64-encoded for JSON format
    sequence: int = 0
    format: str = "pcm_16khz_16bit_mono"
    binary_data: Optional[bytes] = field(default=None, repr=False)  # For binary format
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "data": self.data,
            "sequence": self.sequence,
            "format": self.format
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ServerAudioChunkMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            data=data.get("data"),
            sequence=data.get("sequence", 0),
            format=data.get("format", "pcm_16khz_16bit_mono")
        )
    
    @classmethod
    def from_binary(cls, audio_bytes: bytes, sequence: int = 0, 
                    audio_format: str = "pcm_16khz_16bit_mono") -> ServerAudioChunkMessage:
        """Create message from raw binary audio data."""
        return cls(
            binary_data=audio_bytes,
            sequence=sequence,
            format=audio_format
        )
    
    def get_audio_bytes(self) -> Optional[bytes]:
        """Get audio bytes regardless of format (binary or base64)."""
        if self.binary_data is not None:
            return self.binary_data
        if self.data is not None:
            return base64.b64decode(self.data)
        return None


@dataclass
class WordBoundaryMessage:
    """Server sends TTS word timing for viseme synchronization.
    
    Requirements: 8.12
    
    Attributes:
        type: Message type identifier ("word_boundary")
        word: The spoken word
        offset_ms: Offset from start of audio in milliseconds
        duration_ms: Duration of word in milliseconds
        pulse_magnitude: Calculated pulse magnitude for animation (0.0-1.0)
    """
    
    type: Literal["word_boundary"] = "word_boundary"
    word: str = ""
    offset_ms: int = 0
    duration_ms: int = 0
    pulse_magnitude: float = 0.0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "word": self.word,
            "offset_ms": self.offset_ms,
            "duration_ms": self.duration_ms,
            "pulse_magnitude": self.pulse_magnitude
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> WordBoundaryMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            word=data.get("word", ""),
            offset_ms=data.get("offset_ms", 0),
            duration_ms=data.get("duration_ms", 0),
            pulse_magnitude=data.get("pulse_magnitude", 0.0)
        )


@dataclass
class CompletedMessage:
    """Server sends turn completion with metrics.
    
    Requirements: 8.12
    
    Attributes:
        type: Message type identifier ("completed")
        turn_id: Turn sequence number
        interrupted: Whether turn was interrupted (barge-in)
        metrics: Performance metrics for the turn
    """
    
    type: Literal["completed"] = "completed"
    turn_id: int = 0
    interrupted: bool = False
    metrics: dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "turn_id": self.turn_id,
            "interrupted": self.interrupted,
            "metrics": self.metrics
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CompletedMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            turn_id=data.get("turn_id", 0),
            interrupted=data.get("interrupted", False),
            metrics=data.get("metrics", {})
        )


@dataclass
class ErrorMessage:
    """Server sends error event.
    
    Requirements: 8.12
    
    Attributes:
        type: Message type identifier ("error")
        code: Error code for programmatic handling
        message: Human-readable error message
        recoverable: Whether the error is recoverable
        component: Component that generated the error
    """
    
    type: Literal["error"] = "error"
    code: str = ""
    message: str = ""
    recoverable: bool = True
    component: str = ""
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {
            "type": self.type,
            "code": self.code,
            "message": self.message,
            "recoverable": self.recoverable,
            "component": self.component
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ErrorMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls(
            code=data.get("code", ""),
            message=data.get("message", ""),
            recoverable=data.get("recoverable", True),
            component=data.get("component", "")
        )


@dataclass
class PongMessage:
    """Server keepalive pong response.
    
    Requirements: 8.12
    
    Attributes:
        type: Message type identifier ("pong")
    """
    
    type: Literal["pong"] = "pong"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert message to dictionary for JSON serialization."""
        return {"type": self.type}
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PongMessage:
        """Create message from dictionary (JSON deserialization)."""
        return cls()


# ==============================================================================
# Message Type Registry
# ==============================================================================

# Client → Server message types
CLIENT_MESSAGE_TYPES = {
    "session_start": SessionStartMessage,
    "audio_chunk": AudioChunkMessage,
    "mode_switch": ModeSwitchMessage,
    "interrupt": InterruptMessage,
    "stop_session": StopSessionMessage,
    "ping": PingMessage,
}

# Server → Client message types
SERVER_MESSAGE_TYPES = {
    "session_ready": SessionReadyMessage,
    "avatar_state": AvatarStateMessage,
    "partial_transcript": PartialTranscriptMessage,
    "final_transcript": FinalTranscriptMessage,
    "emotion": EmotionMessage,
    "crisis": CrisisMessage,
    "sentence": SentenceMessage,
    "audio_chunk": ServerAudioChunkMessage,
    "word_boundary": WordBoundaryMessage,
    "completed": CompletedMessage,
    "error": ErrorMessage,
    "pong": PongMessage,
}


def parse_client_message(data: dict[str, Any]) -> Any:
    """Parse a client message from JSON data.
    
    Args:
        data: Parsed JSON data with "type" field
        
    Returns:
        Appropriate message instance
        
    Raises:
        ValueError: If message type is unknown
    """
    msg_type = data.get("type")
    if msg_type not in CLIENT_MESSAGE_TYPES:
        raise ValueError(f"Unknown client message type: {msg_type}")
    
    message_class = CLIENT_MESSAGE_TYPES[msg_type]
    return message_class.from_dict(data)


def parse_server_message(data: dict[str, Any]) -> Any:
    """Parse a server message from JSON data.
    
    Args:
        data: Parsed JSON data with "type" field
        
    Returns:
        Appropriate message instance
        
    Raises:
        ValueError: If message type is unknown
    """
    msg_type = data.get("type")
    if msg_type not in SERVER_MESSAGE_TYPES:
        raise ValueError(f"Unknown server message type: {msg_type}")
    
    message_class = SERVER_MESSAGE_TYPES[msg_type]
    return message_class.from_dict(data)
