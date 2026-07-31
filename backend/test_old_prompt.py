import asyncio
from app.prompts.builder import PromptBuilder

async def main():
    pb = PromptBuilder()
    prompt, msgs = pb.build(
        user_name="Alex",
        user_message="hello",
        emotion_data=None,
        user_profile={"interests": "ai"},
        long_term_memories=[],
        conversation_history=[]
    )
    print(f"PROMPT LENGTH: {len(prompt)}")
    print(f"PROMPT PREVIEW: {prompt[:200]}")

if __name__ == "__main__":
    asyncio.run(main())
