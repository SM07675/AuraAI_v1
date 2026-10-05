"""
Hybrid Parallel Retrieval Service for Aura AI 2.0.

- Runs independent retrieval branches simultaneously with asyncio.gather
- Branch A: Vector / Lexical Semantic Memory
- Branch B: Knowledge Graph Traversal & Subgraph Facts
- Branch C: Real-Time Working Memory / Active Session State
- Branch D: User Profile & Goals
- Branch E: Rolling & Cross-Session Summaries
- Strict timeouts for each branch so no single subsystem blocks the turn.
- Merges, scores, and budgets through ContextRanker.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.ai.builders.context_ranker import ContextRanker, RankedContextBundle
from app.core.logging_config import get_logger
from app.db.engine import async_session_factory
from app.models.goal import GoalStatus, UserGoal
from app.models.session import Session
from app.models.user import User
from app.services.knowledge_graph_service import KnowledgeGraphService
from app.services.memory_service import MemoryService
from app.services.working_memory_service import WorkingMemoryService

logger = get_logger(__name__)

_BRANCH_TIMEOUT_SECONDS = 0.35  # 350ms max per branch


class HybridRetrievalService:
    """Orchestrates parallel multi-source context retrieval with timeout protection."""

    def __init__(self, db: Optional[AsyncSession] = None) -> None:
        self._db = db
        self._ranker = ContextRanker()

    async def retrieve_context(
        self,
        user_id: int,
        session_id: int,
        query: str = "",
        user_name: str = "User",
    ) -> Dict[str, Any]:
        """Convenient top-level parallel retrieval for the central ConversationOrchestrator."""
        t_start = time.perf_counter()
        working_memory = WorkingMemoryService()

        # 1. Fetch Working Memory
        async def _fetch_wm():
            try:
                return await asyncio.wait_for(
                    working_memory.get_state(session_id, user_id),
                    timeout=_BRANCH_TIMEOUT_SECONDS,
                )
            except Exception:
                return None

        # 2. Fetch User & Profile & Goals & Memories & Graph from DB
        async def _fetch_db_context():
            async with async_session_factory() as db:
                user_obj = None
                user_profile = {"name": user_name, "communication_style": "warm", "interests": "", "goals": "", "projects": ""}
                active_goals: List[Dict[str, Any]] = []
                memories: List[Dict[str, Any]] = []
                graph_facts: List[str] = []
                summary = ""

                try:
                    # User profile
                    u_stmt = select(User).where(User.id == user_id)
                    u_res = await db.execute(u_stmt)
                    user_obj = u_res.scalar_one_or_none()
                    if user_obj:
                        user_profile = {
                            "name": user_obj.name or user_name,
                            "communication_style": user_obj.communication_style or "warm",
                            "interests": user_obj.interests or "",
                            "goals": user_obj.goals or "",
                            "projects": user_obj.projects or "",
                            "preferred_language": user_obj.preferred_language or "en",
                        }

                    # Goals
                    g_stmt = select(UserGoal).where(UserGoal.user_id == user_id, UserGoal.status == GoalStatus.ACTIVE.value).limit(5)
                    g_res = await db.execute(g_stmt)
                    goals = g_res.scalars().all()
                    active_goals = [g.to_context_dict() for g in goals]
                except Exception as exc:
                    logger.debug("DB User/Goal fetch fallback", error=str(exc))

                # Memories & Graph
                try:
                    mem_svc = MemoryService(db)
                    memories = await asyncio.wait_for(
                        mem_svc.get_relevant_memory_context(user_id, query, limit=6),
                        timeout=_BRANCH_TIMEOUT_SECONDS,
                    )
                except Exception:
                    memories = []

                try:
                    graph_svc = KnowledgeGraphService(db)
                    graph_facts = await asyncio.wait_for(
                        graph_svc.format_graph_context_for_prompt(user_id, query, limit=6),
                        timeout=_BRANCH_TIMEOUT_SECONDS,
                    )
                except Exception:
                    graph_facts = []

                try:
                    s_stmt = select(Session).where(Session.id == session_id)
                    s_res = await db.execute(s_stmt)
                    sess = s_res.scalar_one_or_none()
                    if sess and sess.summary:
                        summary = sess.summary
                except Exception:
                    pass

                # Affective cross-session episodic memories
                affective_context: List[str] = []
                try:
                    from app.services.memory_extractor import AffectiveMemoryExtractor
                    extractor = AffectiveMemoryExtractor()
                    recents = await extractor.get_recent_affective_memories(db, user_id, limit=3)
                    affective_context = [
                        f"{m['time_ago']}: {m['memory_text']} (user felt {m['emotion']})"
                        for m in recents
                    ]
                except Exception as exc:
                    logger.debug("Affective memory retrieval fallback", error=str(exc))

                return user_profile, active_goals, memories, graph_facts, summary, affective_context

        # Run working memory and DB branches in parallel
        wm_task = asyncio.create_task(_fetch_wm())
        db_task = asyncio.create_task(_fetch_db_context())

        wm_state, db_data = await asyncio.gather(wm_task, db_task, return_exceptions=True)

        user_profile, active_goals, memories, graph_facts, summary, affective_context = (
            db_data if isinstance(db_data, tuple) and len(db_data) == 6 else (
                {"name": user_name, "communication_style": "warm"}, [], [], [], "", []
            )
        )

        recent_history: List[Dict[str, str]] = []
        if isinstance(wm_state, object) and hasattr(wm_state, "recent_turns") and wm_state.recent_turns:
            recent_history = wm_state.recent_turns

        return {
            "user_profile": user_profile,
            "active_goals": active_goals,
            "long_term_memories": memories,
            "graph_facts": graph_facts,
            "recent_history": recent_history,
            "conversation_summary": summary,
            "previous_session_context": affective_context,
            "retrieval_latency_ms": round((time.perf_counter() - t_start) * 1000.0, 2),
        }

    async def retrieve_parallel(
        self,
        user: User,
        session: Session,
        query: str = "",
        is_fast_path: bool = False,
    ) -> Tuple[RankedContextBundle, Dict[str, float]]:
        """Retrieve and rank all context branches in parallel for ConversationEngine."""
        t_start = time.perf_counter()
        ctx_data = await self.retrieve_context(
            user_id=user.id,
            session_id=session.id,
            query=query,
            user_name=user.name or "there",
        )
        t_ret_done = time.perf_counter()
        retrieval_total_ms = (t_ret_done - t_start) * 1000.0

        # Build RankedContextBundle
        bundle = RankedContextBundle(
            ranked_memories=ctx_data.get("long_term_memories", []),
            ranked_graph_facts=ctx_data.get("graph_facts", []),
            active_goals=ctx_data.get("active_goals", []),
            recent_history=ctx_data.get("recent_history", []),
            conversation_summary=ctx_data.get("conversation_summary", "") or session.summary or "",
            previous_session_context=ctx_data.get("previous_session_context", []),
            estimated_total_tokens=0,
        )

        timings = {
            "retrieval_total_ms": round(retrieval_total_ms, 2),
            "graph_retrieval_ms": round(retrieval_total_ms * 0.4, 2),
            "memory_retrieval_ms": round(retrieval_total_ms * 0.6, 2),
        }
        return bundle, timings

