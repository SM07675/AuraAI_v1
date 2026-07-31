import asyncio
from app.ai.builders.prompt_builder import PromptBuilder
from app.ai.builders.context_builder import ContextObject
from app.emotion.base import EmotionContext

async def main():
    pb = PromptBuilder()
    ec = EmotionContext(
        primary_emotion="neutral",
        secondary_emotion=None,
        confidence=1.0,
        stress="low",
        sentiment="neutral",
        intent="casual"
    )
    c = ContextObject(
        user_name="test",
        preferred_language="en",
        communication_style="balanced",
        interests="",
        goals="",
        skills="",
        projects="",
        learning_style="",
        favourite_topics="",
        emotion_context=ec,
        current_time="now",
        session_id=1,
    )
    prompt, msgs = pb.build(c, None, "hello")
    print(f"PROMPT LENGTH: {len(prompt)}")
    print(f"PROMPT PREVIEW: {prompt[:200]}")

if __name__ == "__main__":
    asyncio.run(main())
