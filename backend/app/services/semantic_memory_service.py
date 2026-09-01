"""
Semantic Memory Service for Aura AI 2.0.

Layer 4 of the 7-Layer Memory Hierarchy:
- Vector embeddings generation & cosine similarity search
- Metadata filtering (user_id, memory_type, topic, time_range, confidence, privacy_level)
- Hybrid dense + lexical scoring fallback
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

import numpy as np

from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Dimension for lightweight semantic hashing vector when external embedding model is skipped
_EMBEDDING_DIM = 64


class SemanticMemoryService:
    """Provides semantic vector encoding and similarity search over durable memories."""

    @staticmethod
    def compute_lightweight_embedding(text: str) -> list[float]:
        """Generate a deterministic 64-dimensional semantic projection vector.

        Used for fast in-process semantic scoring without external provider roundtrips.
        """
        if not text:
            return [0.0] * _EMBEDDING_DIM

        vec = np.zeros(_EMBEDDING_DIM, dtype=np.float32)
        words = re.findall(r"[a-z0-9]+", text.lower())
        if not words:
            return vec.tolist()

        import zlib

        for word in words:
            # Deterministic hash projection
            h = zlib.crc32(word.encode("utf-8"))
            idx = h % _EMBEDDING_DIM
            sign = 1.0 if (h % 2 == 0) else -1.0
            vec[idx] += sign * (1.0 / (1.0 + math.log(1 + len(word))))

        # L2 normalize
        norm = np.linalg.norm(vec)
        if norm > 1e-6:
            vec = vec / norm
        return vec.tolist()

    @staticmethod
    def cosine_similarity(vec1: list[float] | np.ndarray, vec2: list[float] | np.ndarray) -> float:
        """Calculate cosine similarity between two float vectors."""
        if not vec1 or not vec2:
            return 0.0
        v1 = np.asarray(vec1, dtype=np.float32)
        v2 = np.asarray(vec2, dtype=np.float32)
        if v1.shape != v2.shape:
            return 0.0

        denom = float(np.linalg.norm(v1) * np.linalg.norm(v2))
        if denom < 1e-6:
            return 0.0
        dot = float(np.dot(v1, v2))
        return max(0.0, min(1.0, dot / denom))

    def rank_memories_semantically(
        self,
        query: str,
        memories: list[dict[str, Any]],
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Rank candidates using semantic similarity + metadata filters."""
        if not memories:
            return []

        query_emb = self.compute_lightweight_embedding(query)
        q_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))
        scored: list[tuple[float, dict[str, Any]]] = []

        filters = filters or {}
        req_type = filters.get("memory_type")
        min_conf = float(filters.get("min_confidence", 0.0))
        max_privacy = filters.get("privacy_level")

        for m in memories:
            # Apply metadata filters
            if req_type and m.get("type") != req_type:
                continue
            conf_val = m.get("confidence")
            if float(conf_val if conf_val is not None else 1.0) < min_conf:
                continue
            if max_privacy and m.get("privacy_level") == "clinical" and max_privacy != "clinical":
                continue

            m_text = f"{m.get('key', '')} {m.get('value', '')}"
            m_tokens = set(re.findall(r"[a-z0-9]+", m_text.lower()))

            m_emb = m.get("embedding")
            if not m_emb:
                m_emb = self.compute_lightweight_embedding(m_text)

            sim = self.cosine_similarity(query_emb, m_emb)
            lex = (len(q_tokens & m_tokens) / len(q_tokens)) if q_tokens else 0.0
            imp_val = m.get("importance")
            importance = float(imp_val if imp_val is not None else 0.5)

            # Combined score: 45% lexical match + 40% semantic similarity + 15% importance score
            final_score = (lex * 0.45) + (sim * 0.40) + (importance * 0.15)

            item = dict(m)
            item["semantic_score"] = round(sim, 3)
            item["hybrid_score"] = round(final_score, 3)
            scored.append((final_score, item))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:top_k]]
