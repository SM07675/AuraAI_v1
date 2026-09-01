"""
Debug API — real-time pipeline debug and observability endpoint for Aura AI 2.0.

Provides:
  GET  /api/v1/debug/status   – Comprehensive system, memory, graph, provider, & latency snapshot
  GET  /api/v1/debug/graph    – Knowledge Graph entities & relationships
  GET  /api/v1/debug/latency  – Real P50/P95/P99 latency traces and TTFT metrics
  WS   /api/v1/debug/ws       – Real-time debug event and pipeline telemetry stream
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gateway import AIGateway
from app.communication.session_manager import SessionRegistry
from app.core.config import get_settings
from app.core.deps import get_db
from app.core.logging_config import get_logger
from app.models.graph import GraphEntity, GraphRelationship
from app.models.latency_metric import LatencyMetric
from app.models.memory import LongTermMemory
from app.models.session import Session
from app.services.knowledge_graph_service import KnowledgeGraphService

router = APIRouter(prefix="/debug", tags=["debug"])
logger = get_logger(__name__)
settings = get_settings()

# Registry of connected debug websockets
_debug_ws_clients: list[WebSocket] = []


def _require_debug_mode() -> None:
    """Block debug endpoints in production if explicitly configured."""
    if settings.environment == "production" and not settings.debug:
        raise HTTPException(
            status_code=403,
            detail="Debug endpoints are disabled in production.",
        )


@router.get("/status")
async def get_debug_status(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return real comprehensive snapshot of system, memory, graph, and latency metrics."""
    _require_debug_mode()

    registry = SessionRegistry.get()

    # Active voice sessions
    sessions_info = []
    for sid, s in registry._sessions.items():
        sessions_info.append({
            "session_id": sid,
            "user_id": s.user_id,
            "state": s.state.value,
            "created_at": s.created_at.isoformat(),
            "tts_speaking": s.tts.is_speaking,
            "vad_in_speech": s.vad.is_in_speech,
            "metrics": s.metrics.snapshot(),
        })

    # AI Gateway status
    gateway = AIGateway()
    provider_statuses = await gateway.get_provider_statuses()
    gateway_status = {
        "providers": provider_statuses,
        "active_primary": settings.nvidia_nim_model if settings.nvidia_nim_api_key else "fallback",
        "available_providers": [
            item["provider"]
            for item in provider_statuses
            if item.get("status") == "healthy" and not item.get("circuit_open")
        ],
    }

    # Real DB Counts (Knowledge Graph, Memories, Sessions)
    kg_entities_count = 0
    kg_relationships_count = 0
    ltm_count = 0
    try:
        res_e = await db.execute(select(func.count(GraphEntity.id)))
        kg_entities_count = res_e.scalar() or 0
        res_r = await db.execute(select(func.count(GraphRelationship.id)))
        kg_relationships_count = res_r.scalar() or 0
        res_m = await db.execute(select(func.count(LongTermMemory.id)))
        ltm_count = res_m.scalar() or 0
    except Exception:
        pass

    # Latency Percentiles from real recorded traces
    latency_summary = {"p50_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0, "ttft_avg_ms": 0.0, "sample_count": 0}
    try:
        stmt = select(LatencyMetric).order_by(LatencyMetric.created_at.desc()).limit(100)
        res_l = await db.execute(stmt)
        traces = res_l.scalars().all()
        if traces:
            totals = [t.total_turn_latency_ms for t in traces if t.total_turn_latency_ms > 0]
            ttfts = [t.llm_ttft_ms for t in traces if t.llm_ttft_ms > 0]
            if totals:
                latency_summary = {
                    "p50_ms": round(float(np.percentile(totals, 50)), 1),
                    "p95_ms": round(float(np.percentile(totals, 95)), 1),
                    "p99_ms": round(float(np.percentile(totals, 99)), 1),
                    "ttft_avg_ms": round(float(np.mean(ttfts)), 1) if ttfts else 0.0,
                    "sample_count": len(totals),
                }
    except Exception:
        pass

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.environment,
        "version": settings.app_version,
        "active_sessions": sessions_info,
        "active_session_count": registry.active_count,
        "gateway": gateway_status,
        "knowledge_graph": {
            "entities_count": kg_entities_count,
            "relationships_count": kg_relationships_count,
        },
        "long_term_memories_count": ltm_count,
        "latency_metrics": latency_summary,
        "providers_configured": {
            "nvidia_nim": bool(settings.nvidia_nim_api_key),
            "gemini": bool(settings.gemini_api_key),
            "openai": bool(settings.openai_api_key),
            "tts": settings.tts_provider,
            "stt": settings.stt_provider,
        },
    }


@router.get("/graph")
async def get_debug_graph(
    user_id: int = 1,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return all Knowledge Graph entities and relationships for visualization."""
    _require_debug_mode()
    kg_svc = KnowledgeGraphService(db)
    entities = await kg_svc.get_all_entities(user_id=user_id)
    relationships = await kg_svc.get_all_relationships(user_id=user_id)

    return {
        "user_id": user_id,
        "entities": [e.to_dict() for e in entities],
        "relationships": relationships,
    }


@router.get("/latency")
async def get_debug_latency(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return recent latency traces and distribution metrics."""
    _require_debug_mode()
    stmt = select(LatencyMetric).order_by(LatencyMetric.created_at.desc()).limit(limit)
    res = await db.execute(stmt)
    traces = res.scalars().all()
    trace_dicts = [t.to_dict() for t in traces]

    totals = [t.total_turn_latency_ms for t in traces if t.total_turn_latency_ms > 0]
    ttfts = [t.llm_ttft_ms for t in traces if t.llm_ttft_ms > 0]

    p50 = round(float(np.percentile(totals, 50)), 1) if totals else 0.0
    p95 = round(float(np.percentile(totals, 95)), 1) if totals else 0.0
    p99 = round(float(np.percentile(totals, 99)), 1) if totals else 0.0
    avg_ttft = round(float(np.mean(ttfts)), 1) if ttfts else 0.0

    return {
        "count": len(trace_dicts),
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "ttft_avg_ms": avg_ttft,
        "traces": trace_dicts,
    }


@router.websocket("/ws")
async def debug_websocket(websocket: WebSocket) -> None:
    """Real-time debug telemetry WebSocket."""
    await websocket.accept()
    _debug_ws_clients.append(websocket)
    logger.info("Debug WebSocket connected", total_clients=len(_debug_ws_clients))

    try:
        registry = SessionRegistry.get()
        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "active_sessions": registry.active_count,
            "environment": settings.environment,
        })

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
                msg = json.loads(data)
                if msg.get("command") == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                await websocket.send_json({
                    "type": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "active_sessions": registry.active_count,
                })
            except WebSocketDisconnect:
                break
    except Exception as exc:
        logger.warning("Debug WS error", error=str(exc))
    finally:
        if websocket in _debug_ws_clients:
            _debug_ws_clients.remove(websocket)
        logger.info("Debug WebSocket disconnected", remaining=len(_debug_ws_clients))


async def broadcast_debug_event(event_type: str, data: dict) -> None:
    """Broadcast real-time pipeline event to all connected debug inspectors."""
    if not _debug_ws_clients:
        return

    payload = {
        "type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **data,
    }

    dead = []
    for ws in _debug_ws_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)

    for ws in dead:
        if ws in _debug_ws_clients:
            _debug_ws_clients.remove(ws)
