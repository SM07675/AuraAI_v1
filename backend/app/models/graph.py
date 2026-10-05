"""
Knowledge Graph SQLAlchemy ORM models.

GraphEntity: Nodes representing users, concepts, topics, goals, technologies.
GraphRelationship: Directed edges between entities.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class GraphEntity(Base, TimestampMixin):
    """Knowledge graph node representing an entity in user context."""

    __tablename__ = "graph_entities"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "canonical_name", name="uq_user_entity_canonical"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    attributes_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "canonical_name": self.canonical_name,
            "entity_type": self.entity_type,
            "attributes": self.attributes_json or {},
        }

    def __repr__(self) -> str:
        return f"<GraphEntity(id={self.id}, name='{self.name}', type='{self.entity_type}')>"


class GraphRelationship(Base, TimestampMixin):
    """Knowledge graph directed edge representing relations between entities."""

    __tablename__ = "graph_relationships"
    __table_args__ = (
        UniqueConstraint("source_entity_id", "target_entity_id", "relation_type", name="uq_source_target_rel"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_entity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("graph_entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_entity_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("graph_entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    properties_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    source_entity: Mapped[Optional[GraphEntity]] = relationship("GraphEntity", foreign_keys=[source_entity_id], lazy="joined")
    target_entity: Mapped[Optional[GraphEntity]] = relationship("GraphEntity", foreign_keys=[target_entity_id], lazy="joined")

    def to_dict(self) -> dict[str, Any]:
        s_name = getattr(self.source_entity, "name", None) if getattr(self, "source_entity", None) else str(self.source_entity_id)
        t_name = getattr(self.target_entity, "name", None) if getattr(self, "target_entity", None) else str(self.target_entity_id)
        s_type = getattr(self.source_entity, "entity_type", "ENTITY") if getattr(self, "source_entity", None) else "ENTITY"
        t_type = getattr(self.target_entity, "entity_type", "ENTITY") if getattr(self, "target_entity", None) else "ENTITY"
        return {
            "id": self.id,
            "user_id": self.user_id,
            "source_entity_id": self.source_entity_id,
            "target_entity_id": self.target_entity_id,
            "source_name": s_name,
            "target_name": t_name,
            "source_type": s_type,
            "target_type": t_type,
            "relation_type": self.relation_type,
            "weight": self.weight,
            "properties": self.properties_json or {},
        }

    def __repr__(self) -> str:
        return f"<GraphRelationship(id={self.id}, {self.source_entity_id}->{self.relation_type}->{self.target_entity_id})>"
