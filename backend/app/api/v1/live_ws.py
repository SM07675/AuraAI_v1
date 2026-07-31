"""
Live WebSocket API Route.

Dedicated high-frequency channel for full-duplex Live Mode.
Handles audio streaming, VAD events, and continuous state updates.
"""

from __future__ import annotations

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.live.full_duplex import LiveEngine
from app.live.avatar_state import AvatarStateManager, AvatarStateEvent
from app.core.logging_config import get_logger

router = APIRouter(prefix="/ws", tags=["Live WebSocket"])
logger = get_logger(__name__)

@router.websocket("/live")
async def live_websocket(websocket: WebSocket) -> None:
    """Full-duplex real-time voice channel for Live Mode."""
    await websocket.accept()
    logger.info("New Live Mode WebSocket connection established.")
    
    async def on_state_change(event: AvatarStateEvent) -> None:
        try:
            await websocket.send_json({
                "type": "avatar_state",
                "state": event.state.value,
                "timestamp": event.timestamp,
                "metadata": event.metadata
            })
        except Exception as e:
            logger.error(f"Failed to send avatar state: {e}")

    avatar_manager = AvatarStateManager(on_state_change=on_state_change)
    
    def on_utterance_end(audio_data: bytes) -> None:
        logger.info(f"Received completed utterance of {len(audio_data)} bytes.")
        # In a full implementation, this triggers STT -> ConversationEngine
        # For now, we mock the pipeline response to test the state transitions.
        import asyncio
        asyncio.create_task(mock_response_pipeline())
        
    async def mock_response_pipeline() -> None:
        import asyncio
        # Simulate processing time
        await asyncio.sleep(0.5)
        # Simulate TTS playback starting
        live_engine.set_ai_speaking_state(True)
        # Simulate playback time
        await asyncio.sleep(2.0)
        # Done
        live_engine.set_ai_speaking_state(False)

    live_engine = LiveEngine(avatar_manager, on_utterance_end)
    
    try:
        while True:
            # Receive text (control) or bytes (audio)
            message = await websocket.receive()
            
            if "bytes" in message:
                live_engine.process_audio_chunk(message["bytes"])
                
            elif "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")
                
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "partial_transcript":
                    # STT might be done client-side in some setups, or we pipe it back here
                    live_engine.simulate_partial_transcript(data.get("text", ""))
                    
    except WebSocketDisconnect:
        logger.info("Live Mode WebSocket disconnected.")
    except Exception as e:
        logger.error(f"Live Mode WebSocket error: {e}")
        await websocket.close()
