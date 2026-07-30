"""
Chat API endpoints — SSE streaming and session management.

POST /api/v1/chat/send          — Send text message (SSE streaming)
POST /api/v1/chat/voice         — Send voice message (SSE streaming)
GET  /api/v1/chat/sessions      — List sessions
GET  /api/v1/chat/sessions/{id} — Get session messages
POST /api/v1/chat/sessions/{id}/end — End session
"""

from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user_id, get_db
from app.schemas.chat import EndSessionRequest, SendMessageRequest, VoiceMessageRequest
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/chat", tags=["Chat"])


async def _sse_stream(gen: AsyncIterator) -> AsyncIterator[str]:
    """Wrap an async generator as SSE events."""
    async for event in gen:
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/send", summary="Send text message (streaming SSE)")
async def send_message(
    body: SendMessageRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Send a text message and receive a streaming AI response.

    Returns Server-Sent Events (SSE) stream with event types:
    - session_start: session ID assigned
    - emotion: emotion analysis result
    - start: AI generation beginning
    - chunk: incremental response text
    - done: final response + metadata
    - error: error occurred
    """
    service = ConversationService(db)
    gen = service.process_text_message(
        user_id=user_id,
        content=body.content,
        session_id=body.session_id,
        emotion_payload=body.emotion_data,
    )

    return StreamingResponse(
        _sse_stream(gen),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/voice", summary="Send voice message (streaming SSE)")
async def send_voice(
    body: VoiceMessageRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Send voice audio and receive a streaming AI response.

    The audio is transcribed (STT) before processing.
    """
    # Build audio payload for emotion analysis
    audio_data = {
        "audio_base64": body.audio_base64,
        "sample_rate": body.sample_rate,
        "channels": body.channels,
    }

    service = ConversationService(db)
    gen = service.process_text_message(
        user_id=user_id,
        content="[voice input]",  # Will be replaced after STT
        session_id=body.session_id,
        emotion_payload={"audio_data": audio_data},
    )

    return StreamingResponse(
        _sse_stream(gen),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions", summary="List conversation sessions")
async def list_sessions(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return recent conversation sessions for the current user."""
    service = ConversationService(db)
    sessions = await service.list_sessions(user_id)
    return {
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "status": s.status,
                "summary": s.summary,
                "created_at": s.created_at.isoformat(),
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            }
            for s in sessions
        ]
    }


@router.get("/sessions/{session_id}", summary="Get session messages")
async def get_session(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return all messages in a conversation session."""
    service = ConversationService(db)
    messages = await service.get_session_messages(session_id, user_id)
    return {
        "session_id": session_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "emotion_data": m.emotion_data,
                "ai_provider": m.ai_provider,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.post("/sessions/{session_id}/end", summary="End session and generate summary")
async def end_session(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """End the session, generate an AI summary, and return it."""
    service = ConversationService(db)
    session = await service.end_session(session_id, user_id)
    return {
        "session_id": session.id,
        "status": session.status,
        "summary": session.summary,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
    }
