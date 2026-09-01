"""
Tests for Layer 5 Knowledge Graph Service, entity resolution, and relationships.
"""

from unittest.mock import AsyncMock, MagicMock
import pytest

from app.models.graph import GraphEntity, GraphRelationship
from app.services.knowledge_graph_service import KnowledgeGraphService


@pytest.mark.asyncio
async def test_canonicalize_entity_name():
    assert KnowledgeGraphService.canonicalize("  Aura   AI  ") == "aura ai"
    assert KnowledgeGraphService.canonicalize("NVIDIA NIM") == "nvidia nim"
    assert KnowledgeGraphService.canonicalize("PLACEMENT preparation") == "placement preparation"


@pytest.mark.asyncio
async def test_knowledge_graph_entity_and_relationship_flow():
    db = AsyncMock()

    # Mock entity lookup & create
    entity_user = GraphEntity(id=1, user_id=10, name="Rahul", canonical_name="rahul", entity_type="USER")
    entity_proj = GraphEntity(id=2, user_id=10, name="Aura AI", canonical_name="aura ai", entity_type="PROJECT")
    entity_tech = GraphEntity(id=3, user_id=10, name="NVIDIA NIM", canonical_name="nvidia nim", entity_type="TECHNOLOGY")

    rel1 = GraphRelationship(id=1, user_id=10, source_entity_id=1, target_entity_id=2, relation_type="WORKING_ON", weight=0.95)
    rel1.source_entity = entity_user
    rel1.target_entity = entity_proj

    rel2 = GraphRelationship(id=2, user_id=10, source_entity_id=2, target_entity_id=3, relation_type="USES", weight=0.9)
    rel2.source_entity = entity_proj
    rel2.target_entity = entity_tech

    # Test relationship listing & subgraph formatting
    service = KnowledgeGraphService(db)
    service.get_all_relationships = AsyncMock(return_value=[rel1.to_dict(), rel2.to_dict()])

    facts = await service.format_graph_context_for_prompt(user_id=10, query="Tell me about Aura AI and technologies")
    assert len(facts) == 2
    assert any("Rahul — WORKING ON → Aura AI" in f for f in facts)
    assert any("Aura AI — USES → NVIDIA NIM" in f for f in facts)
