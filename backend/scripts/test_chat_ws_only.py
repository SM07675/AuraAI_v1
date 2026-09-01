import asyncio
import json
import websockets

async def test():
    print("Connecting to ws://localhost:8000/api/v1/ws/chat...")
    async with websockets.connect("ws://localhost:8000/api/v1/ws/chat", open_timeout=5) as ws:
        print("Connected! Sending message...")
        await ws.send(json.dumps({
            "type": "message",
            "content": "Hi, I am feeling a bit stressed about placement preparation.",
            "mode": "chat"
        }))
        
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=12.0)
            data = json.loads(raw)
            print("Received event:", data.get("type"), "| content:", repr(data.get("content", data.get("response", ""))[:40]))
            if data.get("type") in ("done", "error"):
                break
        print("\nChat test complete!")

asyncio.run(test())
