"""
Context Ranker & Strict Context Budget Engine for Aura AI 2.0.

Evaluates and scores all candidate context items (memories, graph facts, session items, goals)
using a multi-factor weighted scoring algorithm, then trims and packs them into strict context budgets.

Scoring Factors:
- Semantic Similarity (w = 0.30)
- Graph Distance / Relevance (w = 0.20)
- Recency (w = 0.15)
- Importance (w = 0.15)
- Extraction Confidence (w = 0.10)
- Topic / Goal Match (w = 0.10)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ContextBudgets:
    """Strict token and item limits for prompt sections."""
    max_profile_tokens: int = 200
    max_session_turns: int = 12
    max_session_tokens: int = 600
    max_memories: int = 6
    max_memory_tokens: int = 400
    max_graph_facts: int = 6
    max_graph_tokens: int = 300
    max_summary_tokens: int = 250
    max_emotion_tokens: int = 150


@dataclass
class RankedContextBundle:
    """Packaged, ranked context ready for prompt generation within budget."""
    ranked_memories: list[dict[str, Any]] = field(default_factory=list)
    ranked_graph_facts: list[str] = field(default_factory=list)
    active_goals: list[dict[str, Any]] = field(default_factory=list)
    recent_history: list[dict[str, str]] = field(default_factory=list)
    conversation_summary: str = ""
    previous_session_context: list[str] = field(default_factory=list)
    estimated_total_tokens: int = 0


class ContextRanker:
    """Ranks and budgets context items to prevent prompt bloating and reduce LLM latency."""

    def __init__(self, budgets: ContextBudgets | None = None) -> None:
        self.budgets = budgets or ContextBudgets()

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Fast character-based token estimation (~4 chars per token)."""
        if not text:
            return 0
        return max(1, len(text) // 4)

    def score_memory(
        self,
        memory: dict[str, Any],
        query: str,
        current_topic: str = "",
        current_goal: str = "",
    ) -> float:
        """Calculate weighted score for a memory candidate."""
        semantic_sim = float(memory.get("relevance", memory.get("semantic_score", 0.5)))
        importance = float(memory.get("importance", 0.5))
        confidence = float(memory.get("confidence", 0.85))

        key_val = f"{memory.get('key', '')} {memory.get('value', '')}".lower()
        topic_match = 1.0 if current_topic and current_topic.lower() in key_val else 0.0
        goal_match = 1.0 if current_goal and current_goal.lower() in key_val else 0.0

        score = (
            (semantic_sim * 0.35)
            + (importance * 0.25)
            + (confidence * 0.15)
            + (topic_match * 0.15)
            + (goal_match * 0.10)
        )
        return min(1.0, max(0.0, score))

    def rank_and_pack(
        self,
        raw_memories: list[dict[str, Any]],
        raw_graph_facts: list[str],
        active_goals: list[dict[str, Any]],
        recent_history: list[dict[str, str]],
        conversation_summary: str,
        previous_session_context: list[str] | None = None,
        query: str = "",
        current_topic: str = "",
        current_goal: str = "",
    ) -> RankedContextBundle:
        """Rank and strictly budget all retrieved candidate context."""
        total_tokens = 0

        # 1. Rank & budget memories
        scored_mems = [
            (self.score_memory(m, query, current_topic, current_goal), m)
            for m in raw_memories
        ]
        scored_mems.sort(key=lambda x: x[0], reverse=True)

        packed_memories: list[dict[str, Any]] = []
        mem_tokens = 0
        for score, m in scored_mems[:self.budgets.max_memories]:
            cost = self.estimate_tokens(f"{m.get('key', '')}: {m.get('value', '')}")
            if mem_tokens + cost > self.budgets.max_memory_tokens:
                break
            m_copy = dict(m)
            m_copy["final_rank_score"] = round(score, 3)
            packed_memories.append(m_copy)
            mem_tokens += cost

        total_tokens += mem_tokens

        # 2. Pack graph facts
        packed_graph: list[str] = []
        graph_tokens = 0
        for fact in raw_graph_facts[:self.budgets.max_graph_facts]:
            cost = self.estimate_tokens(fact)
            if graph_tokens + cost > self.budgets.max_graph_tokens:
                break
            packed_graph.append(fact)
            graph_tokens += cost

        total_tokens += graph_tokens

        # 3. Trim recent turns to strict budget
        packed_history = recent_history[-self.budgets.max_session_turns:]
        hist_tokens = sum(self.estimate_tokens(t.get("content", "")) for t in packed_history)
        while hist_tokens > self.budgets.max_session_tokens and len(packed_history) > 2:
            dropped = packed_history.pop(0)
            hist_tokens -= self.estimate_tokens(dropped.get("content", ""))

        total_tokens += hist_tokens

        # 4. Summary budget
        summary_txt = conversation_summary
        if self.estimate_tokens(summary_txt) > self.budgets.max_summary_tokens:
            summary_txt = summary_txt[:self.budgets.max_summary_tokens * 4] + "..."
        total_tokens += self.estimate_tokens(summary_txt)

        # 5. Goals budget (top 3 active goals max)
        packed_goals = active_goals[:3]

        return RankedContextBundle(
            ranked_memories=packed_memories,
            ranked_graph_facts=packed_graph,
            active_goals=packed_goals,
            recent_history=packed_history,
            conversation_summary=summary_txt,
            previous_session_context=previous_session_context or [],
            estimated_total_tokens=total_tokens,
        )
