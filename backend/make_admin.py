"""
Utility script to promote an existing user to Admin or create a default Admin account.

Usage:
  python make_admin.py [email]
"""

import asyncio
import sys
from sqlalchemy import select

from app.db.engine import get_session_factory, init_db_schema
from app.models.user import User
from app.core.security import hash_password


async def make_admin(email: str):
    await init_db_schema()
    factory = get_session_factory()
    email = email.lower().strip()

    async with factory() as session:
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            user.is_admin = True
            await session.commit()
            print(f"SUCCESS: User '{email}' (ID {user.id}) has been granted Admin privileges!")
        else:
            # Create dedicated admin user if doesn't exist
            admin_user = User(
                name="Aura Administrator",
                email=email,
                password_hash=hash_password("Admin@12345"),
                auth_provider="email",
                is_admin=True,
            )
            session.add(admin_user)
            await session.commit()
            print(f"SUCCESS: Created new Admin account '{email}' with password 'Admin@12345'. Please change this password after login.")


if __name__ == "__main__":
    target_email = sys.argv[1] if len(sys.argv) > 1 else "atharvpalekar05@gmail.com"
    asyncio.run(make_admin(target_email))
