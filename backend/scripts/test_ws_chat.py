import asyncio
import json
import sys
import io
import websockets

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

async def test_live_chat_ws():
    uri = "ws://127.0.0.1:8000/api/v1/ws/chat"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        print("Connected!")
        # Send user message
        msg = {
            "type": "message",
            "content": "my friend beat me and I feel really hurt and scared",
            "mode": "chat"
        }
        await ws.send(json.dumps(msg))
        print("Sent:", msg)
        
        full_tokens = []
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            print(f"Received event: {data.get('type')}")
            if data.get("type") == "chunk":
                full_tokens.append(data.get("content", ""))
            elif data.get("type") == "emotion":
                print(f"Emotion Data: {data.get('data')}")
            elif data.get("type") == "done":
                print(f"Full response:\n{''.join(full_tokens)}")
                break
            elif data.get("type") == "error":
                print(f"Error event: {data}")
                break

if __name__ == "__main__":
    asyncio.run(test_live_chat_ws())
