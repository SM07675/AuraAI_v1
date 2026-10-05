"""
Voice WebSocket Manager.

Handles the full WebSocket message protocol for a voice session.
Decouples the WebSocket transport layer from the pipeline logic.

Client → Server messages
------------------------
session_start   : {"type": "session_start", "user_id": null}
audio_chunk     : binary frame (raw 16kHz PCM) or
                  {"type": "audio_chunk", "data": "<base64>"}
interrupt       : {"type": "interrupt"}
stop_session    : {"type": "stop_session"}
ping            : {"type": "ping"}

Server → Client messages
------------------------
session_ready    : {"type": "session_ready", "session_id": "..."}
state_change     : {"type": "state_change", "state": "LISTENING"}
partial_transcript: {"type": "partial_transcript", "text": "...", "confidence": 0.9}
final_transcript : {"type": "final_transcript", "text": "...", "confidence": 0.95}
thinking         : {"type": "thinking"}
partial_response : {"type": "partial_response", "text": "..."}
audio_chunk      : {"type": "audio_chunk", "data": "<base64>", "sequence": 1}
speaking         : {"type": "speaking"}
interrupted      : {"type": "interrupted"}
completed        : {"type": "completed", "chars": 120, "interrupted": false}
metrics          : {"type": "metrics", "data": {...}}
error            : {"type": "error", "code": "...", "message": "..."}
pong             : {"type": "pong"}
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.communication.interrupt_manager import InterruptManager
from app.communication.session_manager import SessionRegistry, VoiceSession
from app.communication.speech_to_text import TranscriptResult
from app.communication.state_machine import CommunicationState
from app.communication.voice_activity import VADEvent, VoiceActivityDetector
from app.core.logging_config import get_logger
from app.db.engine import async_session_factory

logger = get_logger(__name__)

# Keepalive interval in seconds
_PING_INTERVAL_S = 30


async def _analyze_voice_emotion(audio_bytes: bytes, timeout_s: float = 0.4) -> dict:
    """Run voice emotion analysis on raw PCM bytes with timeout protection.

    Returns a result dict or an empty neutral dict on timeout or failure.
    Ensures voice emotion analysis never delays the conversational turn.
    """
    try:
        from app.services.emotion.voice_emotion import VoiceEmotionService
        svc = VoiceEmotionService.get_instance()
        return await asyncio.wait_for(svc.analyze(audio_bytes, sample_rate=16_000), timeout=timeout_s)
    except Exception as exc:
        logger.debug("Voice emotion analysis fast fallback", error=str(exc))
        return {
            "modality": "voice",
            "primary_emotion": "neutral",
            "confidence": 0.0,
            "scores": {},
            "acoustic_features": {},
        }


class VoiceWebSocketManager:
    """Manages a single voice WebSocket connection end-to-end.

    Usage (from the API route)::

        manager = VoiceWebSocketManager()
        await manager.handle(websocket)
    """

    def __init__(self) -> None:
        self._registry = SessionRegistry.get()

    # ── Entry point ───────────────────────────────────────────────

    async def handle(self, websocket: WebSocket) -> None:
        """Accept and drive a voice WebSocket connection.

        Runs until the client disconnects or an unrecoverable error occurs.
        """
        await websocket.accept()
        logger.info("Voice WebSocket accepted")

        session: VoiceSession | None = None

        try:
            async with async_session_factory() as db:
                while True:
                    try:
                        message = await asyncio.wait_for(
                            websocket.receive(), timeout=_PING_INTERVAL_S
                        )
                    except asyncio.TimeoutError:
                        # Send keepalive
                        await self._send(websocket, {"type": "ping"})
                        continue
                    except WebSocketDisconnect:
                        break

                    # Check for disconnect message from raw receive
                    msg_type = message.get("type", "")
                    if msg_type == "websocket.disconnect":
                        break

                    # Dispatch based on message type
                    if message.get("bytes"):
                        # Binary frame = raw PCM audio
                        if session:
                            pcm = message["bytes"]
                            await session.audio_handler.feed(bytes(len(pcm)) if self._is_input_blocked(session) else pcm)
                        continue

                    # JSON text message
                    raw = message.get("text", "")
                    if not raw:
                        continue

                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        await self._send(websocket, {
                            "type": "error",
                            "code": "INVALID_JSON",
                            "message": "Message must be valid JSON",
                        })
                        continue

                    msg_type = msg.get("type", "")
                    session = await self._dispatch(
                        websocket=websocket,
                        msg=msg,
                        msg_type=msg_type,
                        session=session,
                        db=db,
                    )

                    if msg_type == "stop_session" or (session and session.state == CommunicationState.DISCONNECTED):
                        break

        except WebSocketDisconnect:
            logger.info("Voice WebSocket disconnected")
        except Exception as exc:
            logger.error("Voice WebSocket error", error=str(exc), error_type=type(exc).__name__)
            try:
                await self._send(websocket, {
                    "type": "error",
                    "code": "SERVER_ERROR",
                    "message": "An internal server error occurred",
                })
            except Exception:
                pass
        finally:
            if session:
                await self._registry.destroy_session(session.session_id)
            logger.info("Voice WebSocket handler exiting")

    # ── Dispatcher ────────────────────────────────────────────────

    async def _dispatch(
        self,
        websocket: WebSocket,
        msg: dict,
        msg_type: str,
        session: VoiceSession | None,
        db,
    ) -> VoiceSession | None:
        """Route a JSON message to the appropriate handler."""

        if msg_type == "ping":
            await self._send(websocket, {"type": "pong"})
            return session

        if msg_type == "session_start":
            if session:
                await self._registry.destroy_session(session.session_id)
            session = await self._handle_session_start(websocket, msg, db)
            return session

        if msg_type == "playback_state":
            if session:
                session.speaker_playback_active = msg.get("active") is True
                if not session.speaker_playback_active:
                    session.input_resume_at = (0.0 if msg.get("user_interruption") is True
                                               else time.monotonic() + 1.2)
            return session

        if msg_type == "audio_chunk":
            # Base64-encoded audio in JSON (fallback for environments without binary WS)
            if session:
                b64 = msg.get("data", "")
                if b64:
                    try:
                        pcm = base64.b64decode(b64)
                        await session.audio_handler.feed(bytes(len(pcm)) if self._is_input_blocked(session) else pcm)
                    except Exception as exc:
                        logger.warning("Audio decode error", error=str(exc))
            return session

        if msg_type in ("face_emotion", "camera_emotion", "face_state"):
            if session:
                face_data = msg.get("data") or msg.get("emotion") or msg
                session.conversation.set_latest_face_emotion(face_data)
            return session

        if msg_type == "set_transcription_mode":
            if session:
                session.client_transcription = msg.get("client_transcription") is True
            return session

        if msg_type in ("set_language", "language_change"):
            if session:
                lang_raw = (msg.get("language") or msg.get("code") or "en").strip().lower()
                iso_lang = "hi" if lang_raw.startswith("hi") else "en"
                session.stt.set_language(iso_lang)
                logger.info("Language synced from client", session_id=session.session_id, language=iso_lang)
            return session

        if msg_type in ("client_transcript", "fast_transcript"):
            if session and self._is_input_blocked(session):
                return session
            # High-accuracy sub-100ms transcript from client Web Speech API
            if session:
                transcript_text = (msg.get("text") or msg.get("transcript") or "").strip()
                if transcript_text:
                    session.transcript_revision += 1
                    session.pending_utterance_audio = b""
                    if session.transcription_task and not session.transcription_task.done():
                        session.transcription_task.cancel()
                    confidence = float(msg.get("confidence") or 0.95)
                    raw_audio_bytes = bytes(session.stt._buffer)
                    session.stt.clear_buffer()

                    lang_raw = str(msg.get("language") or session.stt.language).strip().lower()
                    iso_lang = "hi" if lang_raw.startswith("hi") else "en"
                    session.stt.set_language(iso_lang)

                    transcript = TranscriptResult(
                        text=transcript_text,
                        confidence=confidence,
                        language=iso_lang,
                        is_final=True,
                        duration_ms=float(msg.get("duration_ms") or 0.0),
                    )

                    # Cancel any active turn before starting new turn
                    await session.conversation.cancel_active_turn()
                    try:
                        await session.state_machine.transition(CommunicationState.THINKING)
                    except ValueError:
                        pass

                    # Run voice emotion concurrently if audio is available
                    if raw_audio_bytes:
                        try:
                            voice_emotion = await _analyze_voice_emotion(raw_audio_bytes)
                            transcript.voice_emotion = voice_emotion
                        except Exception:
                            pass

                    session.conversation._active_turn_task = asyncio.create_task(
                        self._run_conversation_turn(websocket, session, transcript),
                        name=f"hybrid-turn-{session.session_id}",
                    )
            return session

        if msg_type == "text_message":
            # Typed text messages flow through the same AI+TTS pipeline as voice
            if session:
                text_content = msg.get("content", "").strip() or msg.get("text", "").strip()
                if text_content:
                    transcript = TranscriptResult(
                        text=text_content,
                        confidence=1.0,
                        language=msg.get("language", "en"),
                        is_final=True,
                        duration_ms=0,
                    )
                    # Cancel any running generation before starting new turn
                    await session.conversation.cancel_active_turn()
                    session.stt.clear_buffer()
                    try:
                        await session.state_machine.transition(CommunicationState.THINKING)
                    except ValueError:
                        pass
                    session.conversation._active_turn_task = asyncio.create_task(
                        self._run_conversation_turn(websocket, session, transcript),
                        name=f"text-turn-{session.session_id}",
                    )
            return session

        if msg_type == "interrupt":
            if session:
                await self._handle_interrupt(websocket, session)
            return session

        if msg_type == "stop_session":
            if session:
                await self._registry.destroy_session(session.session_id)
                await self._send(websocket, {"type": "state_change", "state": "DISCONNECTED"})
                return None
            return session

        logger.debug("Unknown message type", msg_type=msg_type)
        return session

    # ── Session Start ─────────────────────────────────────────────

    async def _handle_session_start(
        self, websocket: WebSocket, msg: dict, db
    ) -> VoiceSession:
        """Create a new voice session and wire up all callbacks."""
        # Identity comes from a validated token, never a browser-supplied user ID.
        user_id = 0
        token = websocket.query_params.get("token")
        if token:
            from app.core.security import decode_token, is_token_blacklisted
            from app.core.deps import get_redis
            payload = decode_token(token)
            if payload.get("type") != "access":
                raise ValueError("An access token is required")
            if await is_token_blacklisted(await get_redis(), token):
                raise ValueError("Token is no longer valid")
            user_id = int(payload["sub"])

        session = await self._registry.create_session(user_id=user_id, db=db)
        session.client_transcription = msg.get("client_transcription") is True
        if msg.get("language"):
            lang_raw = str(msg["language"]).strip().lower()
            iso_lang = "hi" if lang_raw.startswith("hi") else "en"
            session.stt.set_language(iso_lang)

        # ── State change callback → send state_change events ──────
        async def on_state_change(from_state, to_state):
            snapshot = session.state_machine.snapshot()
            await self._send(websocket, {
                "type": "state_change",
                **snapshot,
            })

        session.state_machine.on_state_change(on_state_change)

        # ── Conversation callbacks → send text/audio events ───────
        async def on_text_token(token: str) -> None:
            await self._send(websocket, {
                "type": "partial_response",
                "session_id": session.session_id,
                "turn_id": session.state_machine.turn_id,
                "generation_id": session.state_machine.active_generation_id,
                "text": token,
            })

        async def on_audio_chunk(audio_bytes: bytes, sequence: int, turn_id: int = 0, gen_id: int = 0) -> None:
            session.metrics.record_first_audio()
            self._send_audio_chunk(websocket, audio_bytes, sequence)

        async def on_event(event_name: str, data: dict) -> None:
            await self._send(websocket, {"type": event_name, **data})
            if event_name == "completed" or event_name == "turn_completed":
                # Send metrics snapshot after each turn
                await self._send(websocket, {
                    "type": "metrics",
                    "data": session.metrics.snapshot(),
                })

        session.conversation.on_text_token(on_text_token)
        session.conversation.on_audio_chunk(on_audio_chunk)
        session.conversation.on_event(on_event)

        # ── TTS audio callback ────────────────────────────────────
        async def on_tts_chunk(audio_bytes: bytes, seq: int, turn_id: int = 0, gen_id: int = 0) -> None:
            session.metrics.record_first_audio()
            await self._send(websocket, {
                "type": "audio_chunk",
                "session_id": session.session_id,
                "turn_id": turn_id or session.state_machine.turn_id,
                "generation_id": gen_id or session.state_machine.active_generation_id,
                "sequence_number": seq,
                "sequence": seq,
                "data": base64.b64encode(audio_bytes).decode("ascii"),
            })

        async def on_tts_event(event_name: str) -> None:
            if event_name == "speaking_started":
                await self._send(websocket, {
                    "type": "assistant_speech_start",
                    "turn_id": session.state_machine.turn_id,
                    "generation_id": session.state_machine.active_generation_id,
                })
            elif event_name == "tts_error":
                await self._send(websocket, {"type": "error", "code": "TTS_UNAVAILABLE",
                                            "message": "Voice is temporarily unavailable. Your reply is shown as text."})
            elif event_name in ("speaking_done", "interrupted"):
                pass  # handled by state machine transitions

        session.tts.on_audio_chunk(on_tts_chunk)
        session.tts.on_event(on_tts_event)

        # ── Start VAD background loop ──────────────────────────────
        vad_task = asyncio.create_task(
            self._run_vad_loop(websocket, session),
            name=f"vad-{session.session_id}",
        )
        session.set_vad_task(vad_task)

        await self._send(websocket, {
            "type": "session_ready",
            "session_id": session.session_id,
        })
        # Explicitly synchronise initial state snapshot
        await self._send(websocket, {
            "type": "state_change",
            **session.state_machine.snapshot(),
        })

        logger.info("Voice session ready", session_id=session.session_id)
        return session

    @staticmethod
    def _is_input_blocked(session) -> bool:
        return (session.state_machine.state == CommunicationState.SPEAKING
                or getattr(session, "speaker_playback_active", False)
                or time.monotonic() < getattr(session, "input_resume_at", 0.0))

    @staticmethod
    def _should_barge_in(result, client_transcription: bool) -> bool:
        # Browser transcription performs echo-aware attribution. Server VAD
        # must not treat an existing noise/speech segment as a new interruption.
        return (
            not client_transcription
            and result.event == VADEvent.SPEECH_STARTED
            and result.is_speech
            and result.rms > 110.0
            and result.snr_db >= 10.0
        )

    # ── VAD Loop ──────────────────────────────────────────────────

    async def _run_vad_loop(
        self, websocket: WebSocket, session: VoiceSession
    ) -> None:
        """Background task: runs VAD on audio frames and drives STT.

        Runs as a persistent Task for the lifetime of the session.
        """
        logger.info("VAD loop started", session_id=session.session_id)
        in_speech = False

        try:
            async for result in session.vad.process(session.audio_handler.frames()):
                current_state = session.state_machine.state

                # Send real-time VAD telemetry to client for diagnostics
                if result.event in (VADEvent.SPEECH_STARTED, VADEvent.SPEAKING, VADEvent.POSSIBLE_END, VADEvent.SPEECH_ENDED):
                    await self._send(websocket, {
                        "type": "vad_state",
                        "turn_id": session.state_machine.turn_id,
                        "state": result.state.value if hasattr(result.state, "value") else str(result.state),
                        "event": result.event.value if hasattr(result.event, "value") else str(result.event),
                        "rms": result.rms,
                        "snr_db": result.snr_db,
                    })

                # Speaker playback is protected until the browser drains its
                # queue. Only an explicit interrupt action stops this turn.
                if self._is_input_blocked(session):
                    session.stt.clear_buffer()
                    in_speech = False
                    continue

                if current_state == CommunicationState.DISCONNECTED:
                    break

                if result.event == VADEvent.SPEECH_STARTED:
                    in_speech = True
                    carry_audio = session.pending_utterance_audio
                    if session.transcription_task and not session.transcription_task.done():
                        session.transcription_task.cancel()
                    session.pending_utterance_audio = b""
                    session.stt.clear_buffer()
                    if carry_audio:
                        session.stt.accumulate(carry_audio)
                    # Add pre-speech padding frames before the trigger frame
                    for pad in result.padding_frames:
                        session.stt.accumulate(pad)
                    session.stt.accumulate(result.frame)
                    session.metrics.start_stt()
                    try:
                        await session.state_machine.transition(CommunicationState.USER_SPEAKING)
                    except ValueError:
                        pass
                    await self._send(websocket, {
                        "type": "user_speech_start",
                        "turn_id": session.state_machine.turn_id,
                    })
                    await self._send(websocket, {
                        "type": "listening",
                        "active": True,
                    })

                elif result.is_speech and in_speech:
                    # Keep every VAD-confirmed speech frame for STT
                    session.stt.accumulate(result.frame)

                elif result.event == VADEvent.SPEECH_ENDED and in_speech:
                    in_speech = False
                    await self._send(websocket, {
                        "type": "user_speech_end",
                        "turn_id": session.state_machine.turn_id,
                    })
                    await self._send(websocket, {
                        "type": "listening",
                        "active": False,
                    })

                    try:
                        await session.state_machine.transition(CommunicationState.THINKING)
                    except ValueError:
                        continue

                    # Browser final results are preferred, but their absence must
                    # never disable server transcription indefinitely. Snapshot audio
                    # before the next utterance can modify the shared STT buffer.
                    raw_audio_bytes = bytes(session.stt._buffer)
                    session.pending_utterance_audio = raw_audio_bytes
                    session.stt.clear_buffer()
                    if session.transcription_task and not session.transcription_task.done():
                        session.transcription_task.cancel()
                    session.transcription_task = asyncio.create_task(
                        self._transcribe_utterance(websocket, session, raw_audio_bytes,
                                                  session.transcript_revision),
                        name=f"stt-handoff-{session.session_id}",
                    )

        except asyncio.CancelledError:
            logger.info("VAD loop cancelled", session_id=session.session_id)
        except Exception as exc:
            logger.error("VAD loop error", session_id=session.session_id, error=str(exc))

    async def _run_conversation_turn(self, websocket, session, transcript) -> None:
        """Surface failed background turns instead of leaving a silent THINKING state."""
        try:
            await session.conversation.process_transcript(transcript)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Spoken conversation turn failed", session_id=session.session_id, error=str(exc))
            if session.state_machine.state != CommunicationState.DISCONNECTED:
                await self._send(websocket, {"type": "error", "code": "VOICE_TURN_FAILED",
                    "message": "I could not finish that reply. Please try again."})
                await session.state_machine.transition(CommunicationState.LISTENING)

    async def _transcribe_utterance(self, websocket, session, audio: bytes, revision: int) -> None:
        """Bounded browser-to-Whisper handoff, independent of the PCM receive loop."""
        try:
            await asyncio.sleep(1.2 if session.client_transcription else 0.25)
            if revision != session.transcript_revision:
                return
            transcript, voice_emotion = await asyncio.wait_for(asyncio.gather(
                session.stt._provider.transcribe(audio_bytes=audio, sample_rate=16000,
                                                language=session.stt.language),
                _analyze_voice_emotion(audio),
            ), timeout=15.0)
            if revision != session.transcript_revision:
                return
            session.metrics.end_stt()
            if not transcript.text.strip():
                await self._send(websocket, {"type": "error", "code": "NO_TRANSCRIPT",
                    "message": "I could not make out that audio. Please try speaking again."})
                await session.state_machine.transition(CommunicationState.LISTENING)
                return
            session.transcript_revision += 1
            session.pending_utterance_audio = b""
            transcript.voice_emotion = voice_emotion
            await session.conversation.cancel_active_turn()
            session.conversation._active_turn_task = asyncio.create_task(
                self._run_conversation_turn(websocket, session, transcript),
                name=f"spoken-turn-{session.session_id}",
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Speech handoff failed", session_id=session.session_id, error=str(exc))
            await self._send(websocket, {"type": "error", "code": "STT_UNAVAILABLE",
                "message": "Speech transcription failed. Please try again or type your message."})
            if session.state_machine.state == CommunicationState.THINKING:
                await session.state_machine.transition(CommunicationState.LISTENING)

    # ── Interrupt ─────────────────────────────────────────────────

    async def _handle_interrupt(
        self, websocket: WebSocket, session: VoiceSession
    ) -> None:
        """Handle client-initiated barge-in."""
        old_turn_id = session.state_machine.turn_id
        interrupted = await session.interrupt.trigger_interrupt()
        if interrupted:
            session.stt.clear_buffer()
            session.vad.reset()
            await self._send(websocket, {
                "type": "interruption",
                "interrupted_turn_id": old_turn_id,
                "new_turn_id": session.state_machine.turn_id,
                "generation_id": session.state_machine.active_generation_id,
                "reason": "client",
            })
            await self._send(websocket, {
                "type": "generation_cancelled",
                "generation_id": session.state_machine.active_generation_id,
                "turn_id": old_turn_id,
            })
            await self._send(websocket, {
                "type": "tts_cancelled",
                "tts_id": session.state_machine.active_tts_id,
                "turn_id": old_turn_id,
            })
            try:
                await session.state_machine.transition(CommunicationState.USER_SPEAKING)
            except ValueError:
                pass

    # ── Transport helpers ─────────────────────────────────────────

    @staticmethod
    async def _send(websocket: WebSocket, data: dict[str, Any]) -> None:
        """Send a JSON message, silently ignoring closed-connection errors."""
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            pass

    @staticmethod
    def _send_audio_chunk(
        websocket: WebSocket, audio_bytes: bytes, sequence: int
    ) -> None:
        """Schedule an audio chunk send as a fire-and-forget task."""
        asyncio.create_task(
            VoiceWebSocketManager._send(
                websocket,
                {
                    "type": "audio_chunk",
                    "data": base64.b64encode(audio_bytes).decode(),
                    "sequence": sequence,
                },
            )
        )
