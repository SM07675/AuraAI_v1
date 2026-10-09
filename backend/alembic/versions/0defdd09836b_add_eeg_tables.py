"""add_eeg_tables

Revision ID: 0defdd09836b
Revises: 06824bd3af30
Create Date: 2026-10-09 14:39:54.043081
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = '0defdd09836b'
down_revision: Union[str, None] = '06824bd3af30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'eeg_reports',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=True),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('sampling_rate', sa.Float(), nullable=False, server_default='256.0'),
        sa.Column('duration_seconds', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('num_channels', sa.Integer(), nullable=False, server_default='19'),
        sa.Column('recording_state', sa.String(length=50), nullable=False, server_default='eyes_closed', comment='eyes_closed, eyes_open, task, unknown'),
        sa.Column('predicted_class', sa.String(length=50), nullable=False, server_default='normative', comment='depressive_risk or normative'),
        sa.Column('confidence_score', sa.Float(), nullable=False, server_default='0.5'),
        sa.Column('faa_score', sa.Float(), nullable=False, server_default='0.0', comment='Frontal Alpha Asymmetry: ln(Alpha_F4) - ln(Alpha_F3)'),
        sa.Column('tbr_fz_score', sa.Float(), nullable=False, server_default='1.0', comment='Theta / Beta Ratio at Frontal Midline Fz'),
        sa.Column('band_powers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('channel_topomap', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('biomarkers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('patient_summary', sa.Text(), nullable=False, server_default=''),
        sa.Column('clinician_summary', sa.Text(), nullable=False, server_default=''),
        sa.Column('disclaimer', sa.Text(), nullable=False, server_default='Investigational neuro-behavioral telemetry for clinical decision support. Not a standalone diagnostic medical device.'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_eeg_reports_session_id'), 'eeg_reports', ['session_id'], unique=False)
    op.create_index(op.f('ix_eeg_reports_user_id'), 'eeg_reports', ['user_id'], unique=False)

    op.create_table(
        'eeg_correlations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('eeg_report_id', sa.Integer(), nullable=False),
        sa.Column('emotion_log_id', sa.Integer(), nullable=True),
        sa.Column('session_id', sa.Integer(), nullable=True),
        sa.Column('triangulation_score', sa.Float(), nullable=False, server_default='0.0', comment='0.0 - 1.0 concordance between EEG and behavioral affect'),
        sa.Column('concordance_level', sa.String(length=50), nullable=False, server_default='moderate', comment='high, moderate, low, discordant'),
        sa.Column('facs_markers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('graph_entities', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('synthesis_notes', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['eeg_report_id'], ['eeg_reports.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['emotion_log_id'], ['emotion_logs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_eeg_correlations_eeg_report_id'), 'eeg_correlations', ['eeg_report_id'], unique=False)
    op.create_index(op.f('ix_eeg_correlations_emotion_log_id'), 'eeg_correlations', ['emotion_log_id'], unique=False)
    op.create_index(op.f('ix_eeg_correlations_session_id'), 'eeg_correlations', ['session_id'], unique=False)
    op.create_index(op.f('ix_eeg_correlations_user_id'), 'eeg_correlations', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_eeg_correlations_user_id'), table_name='eeg_correlations')
    op.drop_index(op.f('ix_eeg_correlations_session_id'), table_name='eeg_correlations')
    op.drop_index(op.f('ix_eeg_correlations_emotion_log_id'), table_name='eeg_correlations')
    op.drop_index(op.f('ix_eeg_correlations_eeg_report_id'), table_name='eeg_correlations')
    op.drop_table('eeg_correlations')

    op.drop_index(op.f('ix_eeg_reports_user_id'), table_name='eeg_reports')
    op.drop_index(op.f('ix_eeg_reports_session_id'), table_name='eeg_reports')
    op.drop_table('eeg_reports')
