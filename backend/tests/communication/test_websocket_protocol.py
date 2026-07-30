import pytest
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect
from app.main import app

client = TestClient(app)

def test_voice_ws_unauthenticated_connection():
    # If settings.voice_ws_require_auth is False (the default for our tests),
    # this should connect successfully and we should receive a session_ready event.
    try:
        with client.websocket_connect("/api/v1/ws/voice") as websocket:
            websocket.send_json({"type": "session_start", "user_id": 0})
            
            # Wait for session_ready
            msg1 = websocket.receive_json()
            assert msg1["type"] == "session_ready"
            assert "session_id" in msg1
            
            # Wait for state change to LISTENING
            msg2 = websocket.receive_json()
            assert msg2["type"] == "state_change"
            assert msg2["state"] == "LISTENING"
            
            # Send stop
            websocket.send_json({"type": "stop_session"})
            msg3 = websocket.receive_json()
            assert msg3["type"] == "state_change"
            assert msg3["state"] == "DISCONNECTED"
    except WebSocketDisconnect:
        pytest.fail("WebSocket disconnected unexpectedly")

def test_voice_ws_ping_pong():
    with client.websocket_connect("/api/v1/ws/voice") as websocket:
        websocket.send_json({"type": "ping"})
        msg = websocket.receive_json()
        assert msg["type"] == "pong"
