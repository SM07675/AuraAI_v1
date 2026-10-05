"""
Google OAuth 2.0 authentication endpoints.

GET /api/v1/auth/google          — Initiates Google OAuth consent flow
GET /api/v1/auth/google/callback — Handles callback from Google, creates/logs in user, returns JWTs
"""

from __future__ import annotations

import urllib.parse
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_db
from app.core.logging_config import get_logger
from app.models.user import User
from app.services.auth_service import AuthService

logger = get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/auth/google", tags=["Google OAuth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("", summary="Initiate Google OAuth login")
async def google_login():
    """Redirects the client to Google's OAuth consent screen."""
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth is not configured on this server (GOOGLE_CLIENT_ID missing)."
        )

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=url)


@router.get("/callback", summary="Google OAuth callback")
async def google_callback(
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Processes Google OAuth authorization code and redirects with JWT tokens."""
    frontend_base = "http://localhost:3000"
    for origin in settings.cors_origins_list:
        if "3000" in origin:
            frontend_base = origin
            break

    if error or not code:
        logger.warning("Google OAuth error or missing code", error=error)
        err_msg = urllib.parse.quote(error or "Authentication cancelled")
        return RedirectResponse(url=f"{frontend_base}/?auth_error={err_msg}")

    try:
        # Exchange code for tokens
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_payload = {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.google_redirect_uri,
            }
            token_res = await client.post(GOOGLE_TOKEN_URL, data=token_payload)
            if token_res.status_code != 200:
                logger.error("Failed to exchange Google OAuth code", response=token_res.text)
                return RedirectResponse(url=f"{frontend_base}/?auth_error=Failed+to+exchange+authorization+code")

            tokens_data = token_res.json()
            google_access_token = tokens_data.get("access_token")

            # Fetch verified user info
            userinfo_res = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {google_access_token}"}
            )
            if userinfo_res.status_code != 200:
                logger.error("Failed to fetch Google userinfo", response=userinfo_res.text)
                return RedirectResponse(url=f"{frontend_base}/?auth_error=Failed+to+fetch+user+profile")

            user_info = userinfo_res.json()

        google_sub = str(user_info.get("sub") or "")
        email = user_info.get("email", "").lower().strip()
        name = user_info.get("name") or email.split("@")[0] or "Aura User"
        avatar_url = user_info.get("picture")

        if not email:
            return RedirectResponse(url=f"{frontend_base}/?auth_error=Email+not+provided+by+Google")

        # Look up existing user by google_sub or email
        stmt = select(User).where((User.google_sub == google_sub) | (User.email == email))
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # Check if existing user has ever configured their interests/profile
            is_new_user = not bool(user.interests and user.interests.strip())
            # Update oauth attributes if needed
            if not user.google_sub:
                user.google_sub = google_sub
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url
            if user.auth_provider != "google" and not user.password_hash:
                user.auth_provider = "google"
            await db.commit()
            await db.refresh(user)
        else:
            # Create new user authenticated via Google
            is_new_user = True
            # Note: password_hash set to placeholder to satisfy NOT NULL constraints on existing DB schemas
            user = User(
                name=name,
                email=email,
                password_hash="oauth_google_account",
                auth_provider="google",
                google_sub=google_sub,
                avatar_url=avatar_url,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        # Issue Aura JWT tokens
        auth_service = AuthService(db)
        jwt_tokens = auth_service._generate_tokens(user)

        # Redirect to frontend with tokens
        params = {
            "access_token": jwt_tokens.access_token,
            "refresh_token": jwt_tokens.refresh_token,
            "user_id": str(user.id),
            "name": user.name,
            "email": user.email,
            "is_admin": "true" if user.is_admin else "false",
            "avatar_url": user.avatar_url or "",
            "auth_provider": "google",
            "is_new_user": "true" if is_new_user else "false",
        }
        redirect_url = f"{frontend_base}/?{urllib.parse.urlencode(params)}"
        logger.info("Google OAuth login successful", user_id=user.id, email=user.email, is_new_user=is_new_user)
        return RedirectResponse(url=redirect_url)

    except Exception as exc:
        import traceback
        logger.error("OAuth callback exception", error=str(exc), traceback=traceback.format_exc())
        return RedirectResponse(url=f"{frontend_base}/?auth_error={urllib.parse.quote(str(exc))}")

