"""
Common Pydantic schemas shared across the API.
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")


class ErrorDetail(BaseModel):
    """Structured error detail."""

    message: str
    code: str
    details: dict[str, Any] = {}


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    error: ErrorDetail


class SuccessResponse(BaseModel, Generic[DataT]):
    """Standard success response envelope."""

    data: DataT
    message: str = "Success"


class PaginatedResponse(BaseModel, Generic[DataT]):
    """Paginated list response."""

    items: list[DataT]
    total: int
    page: int
    page_size: int
    pages: int
