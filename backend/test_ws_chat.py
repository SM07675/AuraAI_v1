"""Test the full WebSocket chat pipeline end-to-end."""
import asyncio
import json
import websockets

async def test_chat_hi():
    uri = "ws://localhost:8000/api/v1/ws/chat"
    print("=" * 60)
    print("TEST: Sending 'Hi' via WebSocket")
    print("=" * 60)
    
    try:
        async with websockets.connect(uri, ping_timeout=30) as ws:
            # Send a message
            msg = json.dumps({"type": "message", "content": "Hi", "mode": "chat"})
            await ws.send(msg)
            print(f"Sent: {msg}")
            
            full_response = ""
            session_id = None
            events_received = []
            
            for _ in range(30):  # max 30 messages
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=15.0)
                    data = json.loads(raw)
                    event_type = data.get("type")
                    events_received.append(event_type)
                    
                    if event_type == "session_start":
                        session_id = data.get("session_id")
                        print(f"  [session_start] session_id={session_id}")
                    elif event_type == "emotion":
                        print(f"  [emotion] {data.get('data', {})}")
                    elif event_type == "start":
                        print(f"  [start] AI generation beginning...")
                    elif event_type == "chunk":
                        content = data.get("content", "")
                        full_response += content
                        print(f"  [chunk] '{content}'", end="", flush=True)
                    elif event_type == "done":
                        print(f"\n  [done] Full response: '{data.get('response', '')[:100]}'")
                        break
                    elif event_type == "error":
                        print(f"  [ERROR] {data}")
                        break
                    elif event_type in ("ping", "pong"):
                        pass
                    elif event_type == "debug":
                        print(f"  [debug] cache_hit={data.get('data', {}).get('cache_hit')}")
                    else:
                        print(f"  [OTHER: {event_type}] {str(data)[:80]}")
                        
                except asyncio.TimeoutError:
                    print(f"\n  TIMEOUT waiting for response after {len(events_received)} events")
                    break
            
            print(f"\nEvents received: {events_received}")
            print(f"Full response text: '{full_response}'")
            
            if full_response.strip():
                print("\n[PASS] Chat pipeline working end-to-end!")
            else:
                print("\n[FAIL] Empty or no response received!")
                
    except Exception as e:
        print(f"[FAIL] WebSocket error: {e}")

asyncio.run(test_chat_hi())
