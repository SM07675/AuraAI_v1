"""Exercise multi-turn problem planning through the actual live voice socket.
Uses neutral work-planning messages; microphone/camera acceptance is separate.
"""
import asyncio
import json
import websockets

TURNS = [
    "I am struggling to finish my project by Friday.",
    "I am still struggling with the project deadline.",
    "I tried splitting the work but it didn't help. The blocker is testing. What should I do?",
]

async def main():
    async with websockets.connect("ws://127.0.0.1:8000/api/v1/ws/voice") as ws:
        await ws.send(json.dumps({"type":"session_start", "client_transcription":True, "language":"en"}))
        while json.loads(await asyncio.wait_for(ws.recv(), 15))["type"] != "session_ready":
            pass
        for text in TURNS:
            await ws.send(json.dumps({"type":"client_transcript", "text":text, "language":"en"}))
            reply = []
            audio = 0
            async with asyncio.timeout(45):
                while True:
                    event = json.loads(await ws.recv())
                    if event["type"] == "error":
                        raise RuntimeError(event)
                    if event["type"] == "partial_response":
                        reply.append(event["text"])
                    elif event["type"] == "audio_chunk":
                        audio += 1
                    elif event["type"] == "turn_completed":
                        break
            assert "".join(reply).strip() and audio, "Missing full text/speech output"
            print(json.dumps({"user":text, "reply":"".join(reply), "audio_phrases":audio}), flush=True)
        await ws.send(json.dumps({"type":"stop_session"}))

if __name__ == "__main__":
    asyncio.run(main())
