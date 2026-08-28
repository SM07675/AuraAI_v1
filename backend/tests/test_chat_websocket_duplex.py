"""Protocol tests for low-latency interruption and stale-generation blocking."""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager

import pytest
from fastapi import WebSocketDisconnect

from app.api.v1 import ws as ws_module


class FakeWebSocket:
    def __init__(self) -> None:
        self.query_params: dict[str, str] = {}
        self.incoming: asyncio.Queue[str] = asyncio.Queue()
        self.sent: list[tuple[float, dict]] = []
        self.started_at = time.perf_counter()

    async def accept(self) -> None:
        return None

    async def receive_text(self) -> str:
        item = await self.incoming.get()
        if item == "__DISCONNECT__":
            raise WebSocketDisconnect()
        return item

    async def send_text(self, raw: str) -> None:
        self.sent.append((time.perf_counter(), json.loads(raw)))


@asynccontextmanager
async def fake_session_factory():
    yield object()


async def wait_for_event(websocket: FakeWebSocket, event_type: str, timeout: float = 0.5) -> dict:
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        for _, event in websocket.sent:
            if event.get("type") == event_type:
                return event
        await asyncio.sleep(0.005)
    raise AssertionError(f"Timed out waiting for {event_type}: {websocket.sent}")


@pytest.mark.asyncio
async def test_interrupt_is_received_while_response_is_streaming(monkeypatch):
    class SlowService:
        def __init__(self, db) -> None:
            pass

        async def process_text_message(self, **kwargs):
            yield {"type": "start"}
            for index in range(10):
                await asyncio.sleep(0.05)
                yield {"type": "chunk", "content": str(index)}
            yield {"type": "done", "response": "complete"}

    monkeypatch.setattr(ws_module, "ConversationService", SlowService)
    monkeypatch.setattr(ws_module, "async_session_factory", fake_session_factory)
    websocket = FakeWebSocket()
    handler = asyncio.create_task(ws_module.websocket_chat(websocket))

    await websocket.incoming.put(json.dumps({"type": "message", "content": "hello"}))
    await asyncio.sleep(0.04)
    interrupt_requested_at = time.perf_counter()
    await websocket.incoming.put(json.dumps({"type": "interrupt"}))
    interrupted = await wait_for_event(websocket, "interrupted")
    interrupt_latency = time.perf_counter() - interrupt_requested_at

    await websocket.incoming.put("__DISCONNECT__")
    await asyncio.wait_for(handler, timeout=0.5)

    events = [event for _, event in websocket.sent]
    assert interrupt_latency < 0.15
    assert interrupted["reason"] == "user_barge_in"
    assert not any(event.get("type") == "done" for event in events)
    assert sum(event.get("type") == "chunk" for event in events) <= 1


@pytest.mark.asyncio
async def test_new_turn_cancels_old_generation_and_blocks_late_chunks(monkeypatch):
    class SupersededService:
        def __init__(self, db) -> None:
            pass

        async def process_text_message(self, **kwargs):
            content = kwargs["content"]
            yield {"type": "start"}
            if content == "first":
                await asyncio.sleep(0.15)
                yield {"type": "chunk", "content": "STALE_FIRST"}
            else:
                yield {"type": "chunk", "content": "FRESH_SECOND"}
            yield {"type": "done", "response": content}

    monkeypatch.setattr(ws_module, "ConversationService", SupersededService)
    monkeypatch.setattr(ws_module, "async_session_factory", fake_session_factory)
    websocket = FakeWebSocket()
    handler = asyncio.create_task(ws_module.websocket_chat(websocket))

    await websocket.incoming.put(json.dumps({"type": "message", "content": "first"}))
    await asyncio.sleep(0.02)
    await websocket.incoming.put(json.dumps({"type": "message", "content": "second"}))
    await wait_for_event(websocket, "done")
    await websocket.incoming.put("__DISCONNECT__")
    await asyncio.wait_for(handler, timeout=0.5)

    events = [event for _, event in websocket.sent]
    chunks = [event.get("content") for event in events if event.get("type") == "chunk"]
    assert "STALE_FIRST" not in chunks
    assert "FRESH_SECOND" in chunks
    assert any(
        event.get("type") == "interrupted"
        and event.get("reason") == "superseded_by_new_turn"
        for event in events
    )
    generation_ids = [
        event["generation_id"]
        for event in events
        if event.get("type") in {"start", "chunk", "done"}
    ]
    assert generation_ids == sorted(generation_ids)
    assert len(set(generation_ids)) == 2
