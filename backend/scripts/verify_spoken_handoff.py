"""Exercise actual PCM -> VAD -> Whisper -> AI -> TTS with neutral synthetic speech."""
import asyncio
import io
import json
import time

import av
import edge_tts
import websockets


async def fixture_pcm():
    chunks = []
    async for part in edge_tts.Communicate("Hello Aura. Please tell me your name.", "en-US-AriaNeural").stream():
        if part["type"] == "audio":
            chunks.append(part["data"])
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    pcm = []
    with av.open(io.BytesIO(b"".join(chunks))) as container:
        for frame in container.decode(audio=0):
            pcm.extend(f.to_ndarray().tobytes() for f in resampler.resample(frame))
        pcm.extend(f.to_ndarray().tobytes() for f in resampler.resample(None))
    return bytes(16000) + b"".join(pcm) + bytes(64000)


async def verify(pcm, browser_supported):
    async with websockets.connect("ws://127.0.0.1:8000/api/v1/ws/voice") as ws:
        await ws.send(json.dumps({"type": "session_start", "client_transcription": browser_supported,
                                  "language": "en"}))
        while json.loads(await asyncio.wait_for(ws.recv(), 10))["type"] != "session_ready":
            pass
        start = time.perf_counter()

        async def send_audio():
            for offset in range(0, len(pcm), 960):
                await ws.send(pcm[offset:offset + 960])
                await asyncio.sleep(.03)

        sender = asyncio.create_task(send_audio())
        transcript = ""
        reply = ""
        audio_count = 0
        speech_end = start
        first_text = None
        first_audio = None
        try:
            async with asyncio.timeout(35):
                while True:
                    message = json.loads(await ws.recv())
                    if message["type"] == "user_speech_end":
                        speech_end = time.perf_counter()
                    if message["type"] == "final_transcript":
                        transcript = message["text"]
                    elif message["type"] == "partial_response":
                        first_text = first_text or time.perf_counter()
                        reply += message["text"]
                    elif message["type"] == "audio_chunk":
                        first_audio = first_audio or time.perf_counter()
                        audio_count += 1
                    elif message["type"] == "error":
                        raise RuntimeError(message)
                    elif message["type"] == "turn_completed":
                        break
            assert transcript and reply and audio_count, "Speech did not traverse the whole pipeline"
            print(json.dumps({"browser_supported_without_final": browser_supported, "transcript": transcript,
                              "reply": reply, "audio_phrases": audio_count,
                              "first_text_after_speech_end_ms": round((first_text - speech_end) * 1000),
                              "first_audio_after_speech_end_ms": round((first_audio - speech_end) * 1000),
                              "elapsed_ms": round((time.perf_counter() - start) * 1000)}), flush=True)
        finally:
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)
            await ws.send(json.dumps({"type": "stop_session"}))


async def verify_client_final():
    async with websockets.connect("ws://127.0.0.1:8000/api/v1/ws/voice") as ws:
        await ws.send(json.dumps({"type": "session_start", "client_transcription": True}))
        while json.loads(await asyncio.wait_for(ws.recv(), 10))["type"] != "session_ready":
            pass
        await ws.send(json.dumps({"type": "client_transcript", "text": "Please say hello.", "language": "en"}))
        reply = ""
        audio = 0
        async with asyncio.timeout(25):
            while True:
                message = json.loads(await ws.recv())
                if message["type"] == "partial_response":
                    reply += message["text"]
                elif message["type"] == "audio_chunk":
                    audio += 1
                elif message["type"] == "error":
                    raise RuntimeError(message)
                elif message["type"] == "turn_completed":
                    break
        assert reply and audio
        print(json.dumps({"browser_final_handler": "passed", "reply": reply, "audio_phrases": audio}), flush=True)
        await ws.send(json.dumps({"type": "stop_session"}))


async def main():
    pcm = await fixture_pcm()
    await verify(pcm, True)
    await verify(pcm, False)
    await verify_client_final()


if __name__ == "__main__":
    asyncio.run(main())
