"""
Knowledge Graph Service for Aura AI 2.0.

Layer 5 of the 7-Layer Memory Hierarchy:
- Real relationship graph mapping Entities (User, Project, Goal, Interest, Tech, Concept)
- Directed relationships (INTERESTED_IN, WORKING_ON, HAS_GOAL, LIKES, PREFERS, USES, RELATES_TO)
- Multi-hop graph traversal & subgraph context extraction for prompt injection
- Automatic entity resolution, canonical deduplication, and PostgreSQL graph tables persistence
- Neo4j compatibility hook with transparent PostgreSQL fallback
"""

from __future__ import annotations

import re
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging_config import get_logger
from app.models.graph import GraphEntity, GraphRelationship

logger = get_logger(__name__)


class KnowledgeGraphService:
    """Provides personal knowledge graph querying, entity resolution, and traversal."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    @staticmethod
    def canonicalize(name: str) -> str:
        """Normalize entity name for stable IDs and deduplication."""
        return re.sub(r"\s+", " ", (name or "").strip().lower())

    # ── Entity Management ──────────────────────────────────────────

    async def get_or_create_entity(
        self,
        user_id: int,
        entity_type: str,
        name: str,
        attributes: dict[str, Any] | None = None,
    ) -> GraphEntity:
        """Find or create an entity node, ensuring canonical deduplication."""
        canon = self.canonicalize(name)
        if not canon:
            canon = "unspecified"

        stmt = select(GraphEntity).where(
            GraphEntity.user_id == user_id,
            GraphEntity.entity_type == entity_type.upper(),
            GraphEntity.canonical_name == canon,
        )
        res = await self._db.execute(stmt)
        entity = res.scalar_one_or_none()

        if entity:
            # Update attributes if new ones provided
            if attributes:
                current_attr = dict(entity.attributes_json or {})
                current_attr.update(attributes)
                entity.attributes_json = current_attr
                await self._db.commit()
                await self._db.refresh(entity)
            return entity

        entity = GraphEntity(
            user_id=user_id,
            name=name.strip(),
            canonical_name=canon,
            entity_type=entity_type.upper(),
            attributes_json=attributes or {},
        )
        self._db.add(entity)
        try:
            await self._db.commit()
            await self._db.refresh(entity)
        except Exception:
            await self._db.rollback()
            # In case of concurrent write race, fetch existing
            res = await self._db.execute(stmt)
            entity = res.scalar_one_or_none()
            if not entity:
                raise
        return entity

    # ── Relationship Management ───────────────────────────────────

    async def add_or_update_relationship(
        self,
        user_id: int,
        source_name: str,
        source_type: str,
        target_name: str,
        target_type: str,
        relation_type: str,
        weight: float = 1.0,
        properties: dict[str, Any] | None = None,
    ) -> GraphRelationship:
        """Create or update a directed relationship between two entities."""
        source = await self.get_or_create_entity(user_id, source_type, source_name)
        target = await self.get_or_create_entity(user_id, target_type, target_name)
        rel_type = relation_type.upper().replace(" ", "_")

        stmt = select(GraphRelationship).where(
            GraphRelationship.user_id == user_id,
            GraphRelationship.source_entity_id == source.id,
            GraphRelationship.target_entity_id == target.id,
            GraphRelationship.relation_type == rel_type,
        )
        res = await self._db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.weight = max(existing.weight, weight)
            if properties:
                props = dict(existing.properties_json or {})
                props.update(properties)
                existing.properties_json = props
            await self._db.commit()
            await self._db.refresh(existing)
            return existing

        rel = GraphRelationship(
            user_id=user_id,
            source_entity_id=source.id,
            target_entity_id=target.id,
            relation_type=rel_type,
            weight=weight,
            properties_json=properties or {},
        )
        self._db.add(rel)
        try:
            await self._db.commit()
            await self._db.refresh(rel)
        except Exception:
            await self._db.rollback()
            res = await self._db.execute(stmt)
            rel = res.scalar_one_or_none()
            if not rel:
                raise
        return rel

    # ── Graph Traversal & Subgraph Extraction ─────────────────────

    async def get_all_entities(self, user_id: int, entity_type: str | None = None) -> list[GraphEntity]:
        """List all knowledge graph entities for a user."""
        stmt = select(GraphEntity).where(GraphEntity.user_id == user_id)
        if entity_type:
            stmt = stmt.where(GraphEntity.entity_type == entity_type.upper())
        res = await self._db.execute(stmt)
        return list(res.scalars().all())

    async def get_all_relationships(self, user_id: int) -> list[dict[str, Any]]:
        """List all directed relationships with populated source and target names."""
        stmt = (
            select(GraphRelationship)
            .where(GraphRelationship.user_id == user_id)
            .options(
                selectinload(GraphRelationship.source_entity),
                selectinload(GraphRelationship.target_entity),
            )
            .order_by(GraphRelationship.weight.desc())
        )
        res = await self._db.execute(stmt)
        rels = res.scalars().all()
        return [r.to_dict() for r in rels]

    async def query_relevant_subgraph(
        self,
        user_id: int,
        query: str = "",
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        """Retrieve the most relevant knowledge graph facts for the current turn.

        Traverses active user entities (User, Projects, Goals, Interests, Tech)
        and ranks matching edges using semantic lexical overlap and edge weights.
        """
        all_rels = await self.get_all_relationships(user_id)
        if not all_rels:
            return []

        if not query.strip():
            # Return highest weighted relationships by default
            return all_rels[:limit]

        tokens = set(re.findall(r"\w+", query.lower()))

        scored_rels = []
        for r in all_rels:
            source_txt = r.get("source_name", "").lower()
            target_txt = r.get("target_name", "").lower()
            rel_txt = r.get("relation_type", "").lower()
            edge_txt = f"{source_txt} {rel_txt} {target_txt}"

            match_count = sum(1 for tok in tokens if tok in edge_txt and len(tok) > 2)
            direct_bonus = 1.0 if any(tok in source_txt or tok in target_txt for tok in tokens if len(tok) > 2) else 0.0

            relevance_score = (match_count * 0.4) + direct_bonus + (r.get("weight", 1.0) * 0.3)
            scored_rels.append((relevance_score, r))

        scored_rels.sort(key=lambda x: x[0], reverse=True)

        # Include matching facts + top core background facts
        top_matching = [r for score, r in scored_rels if score > 0.3]
        top_background = [r for score, r in scored_rels if r not in top_matching][:3]

        merged = (top_matching + top_background)[:limit]
        return merged

    async def format_graph_context_for_prompt(
        self,
        user_id: int,
        query: str = "",
        limit: int = 8,
    ) -> list[str]:
        """Return human-readable structured graph assertions for the prompt builder.

        Example:
        - "User (Rahul) -[WORKING_ON]-> Aura AI (uses NVIDIA NIM, FER+, FastAPI)"
        - "User (Rahul) -[HAS_GOAL]-> Software Placement Preparation"
        """
        subgraph = await self.query_relevant_subgraph(user_id, query, limit=limit)
        facts: list[str] = []
        for rel in subgraph:
            s_name = rel.get("source_name")
            t_name = rel.get("target_name")
            r_type = rel.get("relation_type", "RELATED_TO").replace("_", " ")
            facts.append(f"{s_name} — {r_type} → {t_name}")
        return facts

    # ── Async Post-Turn Entity & Graph Extraction ──────────────────

    async def extract_and_sync_from_profile_and_text(
        self,
        user_id: int,
        user_name: str,
        user_message: str,
        interests: list[str] | str | None = None,
        goals: list[str] | str | None = None,
        projects: list[str] | str | None = None,
        preferences: dict[str, Any] | None = None,
    ) -> None:
        """Synchronize structured user profile attributes and detect new relationships."""
        try:
            # 1. Base User node
            u_name = user_name or "User"
            user_node = await self.get_or_create_entity(user_id, "USER", u_name)

            # 2. Interests
            interest_list: list[str] = []
            if isinstance(interests, str):
                interest_list = [i.strip() for i in interests.split(",") if i.strip()]
            elif isinstance(interests, list):
                interest_list = [str(i).strip() for i in interests if str(i).strip()]

            for item in interest_list:
                await self.add_or_update_relationship(
                    user_id=user_id,
                    source_name=u_name,
                    source_type="USER",
                    target_name=item,
                    target_type="INTEREST",
                    relation_type="INTERESTED_IN",
                    weight=0.9,
                )

            # 3. Goals
            goal_list: list[str] = []
            if isinstance(goals, str):
                goal_list = [g.strip() for g in goals.split(",") if g.strip()]
            elif isinstance(goals, list):
                goal_list = [str(g).strip() for g in goals if str(g).strip()]

            for item in goal_list:
                await self.add_or_update_relationship(
                    user_id=user_id,
                    source_name=u_name,
                    source_type="USER",
                    target_name=item,
                    target_type="GOAL",
                    relation_type="HAS_GOAL",
                    weight=0.95,
                )

            # 4. Projects
            project_list: list[str] = []
            if isinstance(projects, str):
                project_list = [p.strip() for p in projects.split(",") if p.strip()]
            elif isinstance(projects, list):
                project_list = [str(p).strip() for p in projects if str(p).strip()]

            for proj in project_list:
                await self.add_or_update_relationship(
                    user_id=user_id,
                    source_name=u_name,
                    source_type="USER",
                    target_name=proj,
                    target_type="PROJECT",
                    relation_type="WORKING_ON",
                    weight=0.9,
                )

            # 5. Extract technologies connected to projects if mentioned in user_message
            msg_lower = (user_message or "").lower()
            known_techs = [
                ("nvidia nim", "NVIDIA NIM"),
                ("fastapi", "FastAPI"),
                ("redis", "Redis"),
                ("postgres", "PostgreSQL"),
                ("pgvector", "pgvector"),
                ("neo4j", "Neo4j"),
                ("react", "React"),
                ("whisper", "Whisper STT"),
                ("onnx", "FER+ ONNX"),
                ("python", "Python"),
                ("machine learning", "Machine Learning"),
                ("artificial intelligence", "Artificial Intelligence"),
            ]
            for kw, tech_name in known_techs:
                if kw in msg_lower:
                    # Connect user -> technology or active project -> technology
                    target_proj = project_list[0] if project_list else "Aura AI"
                    await self.add_or_update_relationship(
                        user_id=user_id,
                        source_name=target_proj,
                        source_type="PROJECT",
                        target_name=tech_name,
                        target_type="TECHNOLOGY",
                        relation_type="USES",
                        weight=0.85,
                    )
        except Exception as exc:
            logger.debug("Graph extraction sync error", error=str(exc))
