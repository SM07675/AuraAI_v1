"""Test NVIDIA LLM end-to-end through the AI Gateway."""
import asyncio
import sys
import os

# Ensure imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

async def test_nvidia_llm():
    from app.ai.base import AIRequest
    from app.ai.gateway import AIGateway

    gw = AIGateway()
    
    # Test 1: Non-streaming generate
    print("=" * 60)
    print("TEST 1: Non-streaming generate (Hi)")
    print("=" * 60)
    try:
        req = AIRequest(
            system_prompt="You are Aura, a friendly AI companion. Be warm and brief.",
            prompt="Hi",
            stream=False,
            temperature=0.7,
            max_tokens=256,
        )
        resp = await gw.generate(req)
        print(f"Provider: {resp.provider}")
        print(f"Model: {resp.model}")
        print(f"Content: {resp.content}")
        print(f"Tokens: prompt={resp.prompt_tokens}, completion={resp.completion_tokens}")
        assert resp.content.strip(), "EMPTY RESPONSE!"
        print("[PASS] Non-streaming generate works\n")
    except Exception as e:
        print(f"[FAIL] {e}\n")
    
    # Test 2: Streaming
    print("=" * 60)
    print("TEST 2: Streaming (How are you?)")
    print("=" * 60)
    try:
        req2 = AIRequest(
            system_prompt="You are Aura, a friendly AI companion. Be warm and brief.",
            prompt="How are you?",
            messages=[{"role": "user", "content": "How are you?"}],
            stream=True,
            temperature=0.7,
            max_tokens=256,
        )
        full = ""
        chunk_count = 0
        async for chunk in gw.stream(req2):
            if chunk.content:
                full += chunk.content
                chunk_count += 1
        print(f"Chunks received: {chunk_count}")
        print(f"Full text: {full}")
        assert full.strip(), "EMPTY STREAMING RESPONSE!"
        print("[PASS] Streaming works\n")
    except Exception as e:
        print(f"[FAIL] {e}\n")

    # Test 3: ThinkingStreamFilter
    print("=" * 60)
    print("TEST 3: ThinkingStreamFilter")
    print("=" * 60)
    from app.ai.builders.response_builder import ThinkingStreamFilter
    f = ThinkingStreamFilter()
    
    # Simulate chunks with think tags
    test_chunks = ["<think>", "reasoning here", "</think>", "Hello! How can I help?"]
    output = ""
    for c in test_chunks:
        result = f.process_chunk(c)
        output += result
    output += f.flush()
    print(f"Input chunks: {test_chunks}")
    print(f"Filtered output: '{output}'")
    assert "Hello" in output, f"ThinkingStreamFilter failed! Got: '{output}'"
    print("[PASS] ThinkingStreamFilter works\n")

asyncio.run(test_nvidia_llm())
