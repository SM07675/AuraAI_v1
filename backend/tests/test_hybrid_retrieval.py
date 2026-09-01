"""
Tests for Hybrid Parallel Retrieval & Context Ranker budgeting.
"""

import pytest

from app.ai.builders.context_ranker import ContextBudgets, ContextRanker
from app.services.semantic_memory_service import SemanticMemoryService


def test_semantic_memory_embedding_and_similarity():
    service = SemanticMemoryService()
    emb1 = service.compute_lightweight_embedding("Software engineering placement interview")
    emb2 = service.compute_lightweight_embedding("Coding interview and placement preparation")
    emb3 = service.compute_lightweight_embedding("Baking chocolate chip cookies in the kitchen")

    sim_related = service.cosine_similarity(emb1, emb2)
    sim_unrelated = service.cosine_similarity(emb1, emb3)

    assert sim_related > sim_unrelated
    assert sim_related > 0.4


def test_context_ranker_budgets_and_ranking():
    ranker = ContextRanker(
        budgets=ContextBudgets(
            max_memories=3,
            max_memory_tokens=150,
            max_graph_facts=3,
            max_graph_tokens=100,
            max_session_turns=4,
        )
    )

    memories = [
        {"key": "placement_prep", "value": "Preparing for Python coding round", "importance": 0.95, "relevance": 0.9},
        {"key": "football", "value": "Plays football on Sundays", "importance": 0.5, "relevance": 0.1},
        {"key": "lofi_music", "value": "Listens to lofi beats", "importance": 0.6, "relevance": 0.2},
        {"key": "fastapi_project", "value": "Building backend with FastAPI", "importance": 0.85, "relevance": 0.8},
    ]

    graph_facts = [
        "Rahul — WORKING ON → Aura AI",
        "Aura AI — USES → FastAPI",
        "Aura AI — USES → NVIDIA NIM",
        "Rahul — LIKES → Football",
    ]

    history = [
        {"role": "user", "content": f"Turn {i}"} for i in range(10)
    ]

    bundle = ranker.rank_and_pack(
        raw_memories=memories,
        raw_graph_facts=graph_facts,
        active_goals=[],
        recent_history=history,
        conversation_summary="User is coding.",
        query="Help me with placement coding round in Python",
    )

    # 1. Top memories must prioritize relevant placement prep
    assert len(bundle.ranked_memories) <= 3
    assert bundle.ranked_memories[0]["key"] == "placement_prep"

    # 2. Graph facts must be capped to budget
    assert len(bundle.ranked_graph_facts) <= 3

    # 3. History must be trimmed to max turns
    assert len(bundle.recent_history) <= 4
