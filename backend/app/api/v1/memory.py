"""
Memory API endpoints.

GET    /api/v1/memory/        — List long-term memories
DELETE /api/v1/memory/{id}   — Delete a specific memory
GET    /api/v1/memory/search  — Search memories by keyword
POST   /api/v1/memory         — Create a new memory manually
PUT    /api/v1/memory/{id}   — Update an existing memory
GET    /api/v1/memory/stats   — Memory statistics for dashboard
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_current_user_id, get_db
from app.models.memory import LongTermMemory, LongTermMemory as Memory
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memory", tags=["Memory"])


class MemoryCreate(BaseModel):
    type: str
    key: str
    value: str
    importance: float = 0.5


@router.get("", summary="List long-term memories")
async def list_memories(
    memory_type: str | None = Query(None, description="Filter by type: preference, goal, interest, fact, summary"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the user's long-term memories, ordered by importance."""
    try:
        service = MemoryService(db)
        memories = await service.get_long_term_memories(user_id, memory_type=memory_type)
        return {
            "memories": [
                {
                    "id": m.id,
                    "type": m.memory_type,
                    "key": m.key,
                    "value": m.value,
                    "importance": m.importance_score,
                    "created_at": m.created_at.isoformat() if hasattr(m, "created_at") and m.created_at else None,
                }
                for m in memories
            ]
        }
    except Exception:
        return {"memories": []}


@router.delete("/{memory_id}", summary="Delete a memory")
async def delete_memory(
    memory_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a specific long-term memory by ID."""
    try:
        service = MemoryService(db)
        await service.delete_memory(memory_id, user_id)
        return {"message": "Memory deleted", "id": memory_id}
    except Exception as exc:
        return {"message": f"Could not delete memory: {str(exc)}", "id": memory_id}


@router.get("/search", summary="Search memories")
async def search_memories(
    q: str = Query(..., min_length=1, description="Search query"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search long-term memories by keyword."""
    try:
        service = MemoryService(db)
        results = await service.semantic_search(user_id, q)
        return {"results": results, "query": q}
    except Exception:
        return {"results": [], "query": q}


@router.post("", summary="Create a new memory manually")
async def create_memory(
    data: MemoryCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        service = MemoryService(db)
        mem = await service.store_long_term_memory(
            user_id=user_id,
            memory_type=data.type,
            key=data.key,
            value=data.value,
            importance=data.importance
        )
        return {"message": "Memory created", "id": getattr(mem, "id", None)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{memory_id}", summary="Update an existing memory")
async def update_memory(
    memory_id: int,
    data: MemoryCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        stmt = select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id)
        res = await db.execute(stmt)
        mem = res.scalar_one_or_none()
        if not mem:
            raise HTTPException(status_code=404, detail="Memory not found")
        mem.memory_type = data.type
        mem.key = data.key
        mem.value = data.value
        mem.importance_score = data.importance
        await db.commit()
        return {"message": "Memory updated", "id": memory_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/stats", summary="Memory statistics for dashboard")
async def get_memory_stats(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return stats about user's memories."""
    try:
        stmt = select(func.count(Memory.id)).where(Memory.user_id == user_id)
        result = await db.execute(stmt)
        total_memories = result.scalar_one_or_none() or 0
        return {"total": total_memories}
    except Exception:
        return {"total": 0}
