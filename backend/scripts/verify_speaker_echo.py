"""Neutral live-provider check for speaker protection and explicit interruption."""
import asyncio
import json

import websockets


async def main():
    async with websockets.connect("ws://127.0.0.1:8000/api/v1/ws/voice") as ws:
        await ws.send(json.dumps({"type": "session_start", "client_transcription": True}))
        while json.loads(await ws.recv())["type"] != "session_ready":
            pass
        await ws.send(json.dumps({"type": "client_transcript", "text": "Please say hello."}))
        transcripts = 0
        audio = 0
        injected = False
        async with asyncio.timeout(30):
            while True:
                msg = json.loads(await ws.recv())
                kind = msg["type"]
                if kind == "final_transcript":
                    transcripts += 1
                elif kind == "assistant_speech_start" and not injected:
                    injected = True
                    await ws.send(json.dumps({"type": "playback_state", "active": True}))
                    await ws.send(json.dumps({"type": "client_transcript", "text": "Hello welcome back please stop."}))
                    for _ in range(30):
                        await ws.send(b"\xff\x3f" * 480)
                elif kind == "audio_chunk":
                    audio += 1
                elif kind in ("interrupted", "interruption", "error"):
                    raise AssertionError(msg)
                elif kind == "turn_completed":
                    break
        assert transcripts == 1 and audio > 0 and injected
        # Generation has ended, but the browser still has audio queued.
        await ws.send(json.dumps({"type": "client_transcript", "text": "Late speaker echo."}))
        await ws.send(json.dumps({"type": "ping"}))
        async with asyncio.timeout(5):
            while True:
                msg = json.loads(await ws.recv())
                assert msg["type"] not in ("final_transcript", "turn_started", "interruption", "interrupted")
                if msg["type"] == "pong":
                    break
        await ws.send(json.dumps({"type": "playback_state", "active": False}))
        await asyncio.sleep(1.3)
        await ws.send(json.dumps({"type": "client_transcript", "text": "Please greet me again."}))
        interrupted = False
        interrupt_sent = False
        async with asyncio.timeout(30):
            while True:
                msg = json.loads(await ws.recv())
                if msg["type"] == "audio_chunk" and not interrupt_sent:
                    interrupt_sent = True
                    await ws.send(json.dumps({"type": "interrupt"}))
                elif msg["type"] in ("interrupted", "interruption"):
                    interrupted = True
                    break
                elif msg["type"] == "error":
                    raise AssertionError(msg)
        assert interrupted
        await ws.send(json.dumps({"type": "playback_state", "active": False, "user_interruption": True}))
        await ws.send(json.dumps({"type": "client_transcript", "text": "Hello again."}))
        async with asyncio.timeout(5):
            while True:
                msg = json.loads(await ws.recv())
                if msg["type"] == "final_transcript":
                    assert msg["text"] == "Hello again."
                    break
                if msg["type"] == "error":
                    raise AssertionError(msg)
        await ws.send(json.dumps({"type": "stop_session"}))
        print(json.dumps({"speaker_echo": "blocked", "original_turn_audio_phrases": audio,
                          "late_playback_echo": "blocked", "explicit_interrupt": "passed",
                          "immediate_user_transcript_after_interrupt": "passed"}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
