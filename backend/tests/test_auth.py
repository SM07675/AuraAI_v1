"""Tests for authentication endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient) -> None:
    """Test successful user registration."""
    response = await client.post("/api/v1/auth/register", json={
        "name": "Alex Test",
        "email": "alex@test.com",
        "password": "TestPass123",
    })
    assert response.status_code == 201
    data = response.json()
    assert "tokens" in data
    assert "user" in data
    assert data["user"]["email"] == "alex@test.com"
    assert "access_token" in data["tokens"]
    assert "refresh_token" in data["tokens"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    """Test that duplicate email registration returns 409."""
    await client.post("/api/v1/auth/register", json={
        "name": "Alex Test",
        "email": "duplicate@test.com",
        "password": "TestPass123",
    })
    response = await client.post("/api/v1/auth/register", json={
        "name": "Other User",
        "email": "duplicate@test.com",
        "password": "OtherPass123",
    })
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient) -> None:
    """Test successful login."""
    await client.post("/api/v1/auth/register", json={
        "name": "Login User",
        "email": "loginuser@test.com",
        "password": "TestPass123",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "loginuser@test.com",
        "password": "TestPass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "tokens" in data
    assert "access_token" in data["tokens"]


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient) -> None:
    """Test that wrong password returns 401."""
    await client.post("/api/v1/auth/register", json={
        "name": "Wrong Pass User",
        "email": "wrongpass@test.com",
        "password": "CorrectPass123",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "wrongpass@test.com",
        "password": "WrongPass123",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient) -> None:
    """Test /auth/me returns current user."""
    reg = await client.post("/api/v1/auth/register", json={
        "name": "Me User",
        "email": "meuser@test.com",
        "password": "TestPass123",
    })
    token = reg.json()["tokens"]["access_token"]

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "meuser@test.com"
    assert data["name"] == "Me User"


@pytest.mark.asyncio
async def test_get_me_no_token(client: AsyncClient) -> None:
    """Test /auth/me requires authentication."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    """Test health endpoint returns healthy."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
