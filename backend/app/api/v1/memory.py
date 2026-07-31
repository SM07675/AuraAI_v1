"""
Memory API endpoints.

GET    /api/v1/memory/        — List long-term memories
DELETE /api/v1/memory/{id}   — Delete a specific memory
GET    /api/v1/memory/search  — Search memories by keyword
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user_id, get_db
from app.services.memory_service import MemoryService

router = APIRouter(prefix="/memory", tags=["Memory"])


@router.get("", summary="List long-term memories")
async def list_memories(
    memory_type: str | None = Query(None, description="Filter by type: preference, goal, interest, fact, summary"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the user's long-term memories, ordered by importance."""
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
                "created_at": m.created_at.isoformat(),
            }
            for m in memories
        ]
    }


@router.delete("/{memory_id}", summary="Delete a memory")
async def delete_memory(
    memory_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a specific long-term memory by ID."""
    service = MemoryService(db)
    deleted = await service.delete_memory(memory_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"message": "Memory deleted"}


@router.get("/search", summary="Search memories")
async def search_memories(
    q: str = Query(..., min_length=1, description="Search query"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search long-term memories by keyword (semantic search in future)."""
    service = MemoryService(db)
    results = await service.semantic_search(user_id, q)
    return {"results": results, "query": q}

from pydantic import BaseModel

class MemoryCreate(BaseModel):
    type: str
    key: str
    value: str
    importance: float = 0.5

@router.post("", summary="Create a new memory manually")
async def create_memory(
    data: MemoryCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    service = MemoryService(db)
    await service.store_long_term_memory(
        user_id=user_id,
        memory_type=data.type,
        key=data.key,
        value=data.value,
        importance=data.importance
    )
    return {"message": "Memory created"}

@router.put("/{memory_id}", summary="Update an existing memory")
async def update_memory(
    memory_id: int,
    data: MemoryCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.models.memory import Memory
    from sqlalchemy import select
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
    return {"message": "Memory updated"}


@router.get("/stats", summary="Memory statistics for dashboard")
async def get_memory_stats(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return stats about user's memories."""
    from sqlalchemy import select, func
    from app.models.memory import Memory
    
    stmt = select(func.count(Memory.id)).where(Memory.user_id == user_id)
    result = await db.execute(stmt)
    total_memories = result.scalar_one_or_none() or 0
    
    return {
        "total": total_memories
    }
