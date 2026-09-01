"""Add graph entities, relationships, latency metrics, conversation summaries, and long term memory fields

Revision ID: 06824bd3af30
Revises: 05824bd3af29
Create Date: 2026-09-01 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = '06824bd3af30'
down_revision: Union[str, None] = '05824bd3af29'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Long-Term Memories additional fields ─────────────────────
    # Use batch inspection/safety in case some columns already exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {c['name'] for c in inspector.get_columns('long_term_memories')}

    if 'confidence' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('confidence', sa.Float(), server_default='0.85', nullable=False))
    if 'source' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('source', sa.String(length=100), server_default='conversation', nullable=False))
    if 'version' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    if 'privacy_level' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('privacy_level', sa.String(length=50), server_default='private', nullable=False))
    if 'last_used_at' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True))
    if 'expires_at' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True))
    if 'embedding_json' not in existing_cols:
        op.add_column('long_term_memories', sa.Column('embedding_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    existing_tables = set(inspector.get_table_names())

    # ── 2. Graph Entities Table ─────────────────────────────────────
    if 'graph_entities' not in existing_tables:
        op.create_table(
            'graph_entities',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('canonical_name', sa.String(length=255), nullable=False),
            sa.Column('entity_type', sa.String(length=50), nullable=False),
            sa.Column('attributes_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'entity_type', 'canonical_name', name='uq_user_entity_canonical')
        )
        op.create_index(op.f('ix_graph_entities_user_id'), 'graph_entities', ['user_id'], unique=False)
        op.create_index(op.f('ix_graph_entities_canonical_name'), 'graph_entities', ['canonical_name'], unique=False)
        op.create_index(op.f('ix_graph_entities_entity_type'), 'graph_entities', ['entity_type'], unique=False)

    # ── 3. Graph Relationships Table ────────────────────────────────
    if 'graph_relationships' not in existing_tables:
        op.create_table(
            'graph_relationships',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('source_entity_id', sa.Integer(), nullable=False),
            sa.Column('target_entity_id', sa.Integer(), nullable=False),
            sa.Column('relation_type', sa.String(length=50), nullable=False),
            sa.Column('weight', sa.Float(), server_default='1.0', nullable=False),
            sa.Column('properties_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['source_entity_id'], ['graph_entities.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['target_entity_id'], ['graph_entities.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('source_entity_id', 'target_entity_id', 'relation_type', name='uq_source_target_rel')
        )
        op.create_index(op.f('ix_graph_relationships_user_id'), 'graph_relationships', ['user_id'], unique=False)
        op.create_index(op.f('ix_graph_relationships_source_entity_id'), 'graph_relationships', ['source_entity_id'], unique=False)
        op.create_index(op.f('ix_graph_relationships_target_entity_id'), 'graph_relationships', ['target_entity_id'], unique=False)
        op.create_index(op.f('ix_graph_relationships_relation_type'), 'graph_relationships', ['relation_type'], unique=False)

    # ── 4. Latency Metrics Table ────────────────────────────────────
    if 'latency_metrics' not in existing_tables:
        op.create_table(
            'latency_metrics',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('trace_id', sa.String(length=64), nullable=False),
            sa.Column('session_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('turn_id', sa.Integer(), server_default='1', nullable=False),
            sa.Column('context_version', sa.Integer(), server_default='1', nullable=False),
            sa.Column('prompt_version', sa.String(length=32), server_default='2.0', nullable=False),
            sa.Column('provider', sa.String(length=50), server_default='nvidia_nim', nullable=False),
            sa.Column('model', sa.String(length=100), server_default='default', nullable=False),
            sa.Column('is_fast_path', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('cache_hit', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('retrieval_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('graph_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('vector_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('prompt_build_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('llm_ttft_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('llm_total_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('tts_first_audio_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('tts_total_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('total_turn_latency_ms', sa.Float(), server_default='0.0', nullable=False),
            sa.Column('metadata_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_latency_metrics_trace_id'), 'latency_metrics', ['trace_id'], unique=False)
        op.create_index(op.f('ix_latency_metrics_session_id'), 'latency_metrics', ['session_id'], unique=False)
        op.create_index(op.f('ix_latency_metrics_user_id'), 'latency_metrics', ['user_id'], unique=False)

    # ── 5. Conversation Summaries Table ─────────────────────────────
    if 'conversation_summaries' not in existing_tables:
        op.create_table(
            'conversation_summaries',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('session_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('summary_type', sa.String(length=30), server_default='rolling', nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('key_entities', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('key_takeaways', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('turn_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_conversation_summaries_session_id'), 'conversation_summaries', ['session_id'], unique=False)
        op.create_index(op.f('ix_conversation_summaries_user_id'), 'conversation_summaries', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('conversation_summaries')
    op.drop_table('latency_metrics')
    op.drop_table('graph_relationships')
    op.drop_table('graph_entities')
    op.drop_column('long_term_memories', 'embedding_json')
    op.drop_column('long_term_memories', 'expires_at')
    op.drop_column('long_term_memories', 'last_used_at')
    op.drop_column('long_term_memories', 'privacy_level')
    op.drop_column('long_term_memories', 'version')
    op.drop_column('long_term_memories', 'source')
    op.drop_column('long_term_memories', 'confidence')
