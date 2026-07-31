import asyncio
from app.db.engine import async_session_factory
from app.services.conversation_service import ConversationService

async def main():
    async with async_session_factory() as db:
        s = ConversationService(db)
        async for m in s.process_text_message(user_id=1, content="hi doctor"):
            print("STREAM EVENT:", m)

if __name__ == "__main__":
    asyncio.run(main())
