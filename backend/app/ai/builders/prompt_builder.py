"""
Prompt Builder

Assembles the final system prompt from modular Jinja2 templates.
No raw user message is ever sent to the LLM without context wrapping.

Section order:
  1. System base (identity + communication style)
  2. Safety instructions (mental health guardrails)
  3. Emotion guidance reference (per-emotion behavior matrix)
  4. User context (profile, interests, skills, projects)
  5. Goal context (active structured goals)
  6. Memory context (long-term memories)
  7. Conversation summary (rolling summary for long sessions)
  8. Emotion awareness (from EmotionContext — primary emotion,
     secondary, conflict, trend, per-emotion guidance)
  9. Session context (time, active project, stress level)
  10. Targeted directive (follow-up question from QuestionBuilder)

Architecture note
-----------------
The emotion section passes EmotionContext.to_prompt_dict() data to
the template — never raw scores or model internals.
"""

from __future__ import annotations

from typing import Any

from app.ai.builders.context_builder import ContextObject
from app.emotion.base import EmotionContext
from app.prompts.loader import render_template
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class PromptBuilder:
    """Assembles complete system prompts from modular templates.

    Never sends raw user messages to the LLM. Every interaction is
    wrapped in a structured, context-enriched prompt.
    """

    def build(
        self,
        context: ContextObject,
        targeted_question: str | None,
        user_message: str,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Build the complete System Prompt and message list.

        Args:
            context: Rich ContextObject from ContextBuilder.
            targeted_question: Optional follow-up question from QuestionBuilder.
            user_message: The current user message.

        Returns:
            Tuple of (system_prompt_string, openai_messages_list).
        """
        parts: list[str] = []

        # ── 1. System identity ────────────────────────────────────
        parts.append(self._render("system_base.md"))

        # ── 2. Safety instructions ────────────────────────────────
        parts.append(self._render("safety_instructions.md"))

        # ── 3. Emotion guidance reference ─────────────────────────
        # Always included so LLM knows behavioral rules for all emotions
        parts.append(self._render("emotion_guidance.md"))

        # ── 4. User profile ───────────────────────────────────────
        parts.append(self._render(
            "user_context.md",
            user_name=context.user_name,
            preferred_language=context.preferred_language,
            communication_style=context.communication_style,
            interests=context.interests or "None",
            goals=context.goals or "None",
            skills=context.skills or "None",
            projects=context.projects or "None",
            learning_style=context.learning_style or "visual",
            favourite_topics=context.favourite_topics or "None",
        ))

        # ── 5. Goal context ───────────────────────────────────────
        if context.active_goals:
            parts.append(self._render(
                "goal_context.md",
                user_name=context.user_name,
                active_goals=context.active_goals,
            ))

        # ── 6. Memory context ─────────────────────────────────────
        mem_str = "None"
        if context.long_term_memories:
            mem_str = "\n".join(
                f"- {m['key']}: {m['value']} (type: {m['type']})"
                for m in context.long_term_memories
            )
        parts.append(self._render(
            "memory_context.md",
            memories=mem_str,
            conversation_history=context.recent_history,
        ))

        # ── 7. Conversation summary ───────────────────────────────
        if context.conversation_summary:
            parts.append(self._render(
                "conversation_summary.md",
                conversation_summary=context.conversation_summary,
            ))

        # ── 8. Emotion awareness (full EmotionContext) ────────────
        ec: EmotionContext = context.emotion_context
        prompt_data = ec.to_prompt_dict()

        # Build per-source confidence map for template
        parts.append(self._render(
            "system_emotion_aware.md",
            user_name=context.user_name,
            # Core emotion signals
            primary_emotion=ec.primary_emotion,
            secondary_emotion=ec.secondary_emotion,
            confidence=ec.confidence,
            stress=ec.stress,
            sentiment=ec.sentiment,
            intent=ec.intent,
            sources=ec.sources,
            # Per-modality (label only)
            face_emotion=ec.face_emotion,
            face_confidence=round(ec.face_confidence, 1),
            face_detected=ec.face_detected,
            text_emotion=ec.text_emotion,
            text_confidence=round(ec.text_confidence, 1),
            voice_emotion=ec.voice_emotion,
            # Conflict
            emotion_conflict=ec.emotion_conflict,
            conflict_detail=ec.conflict_detail,
            # Trend
            conversation_trend=ec.conversation_trend,
            # Guidance (from EmotionContext, derived in EmotionFusion)
            guidance=ec.guidance or ec.get_guidance(),
        ))

        # ── 9. Session context ────────────────────────────────────
        session_lines = [
            f"\n## Session Context",
            f"- Current Time: {context.current_time}",
            f"- Session ID: {context.session_id}",
        ]
        if context.active_project:
            session_lines.append(f"- Active Project: {context.active_project}")
        if ec.stress == "high":
            session_lines.append(
                "- ⚠️ User stress is HIGH — keep responses short, calm, and grounded"
            )
        elif ec.stress == "medium":
            session_lines.append(
                "- User shows moderate stress — be patient and gentle"
            )
        parts.append("\n".join(session_lines))

        # ── 10. Targeted directive ────────────────────────────────
        if targeted_question:
            parts.append(
                f"\n## DIRECTIVE\n"
                f"Weave the following question naturally into your response "
                f"— do not append it mechanically:\n"
                f'"{targeted_question}"'
            )

        # ── Assemble ──────────────────────────────────────────────
        system_prompt = "\n\n---\n\n".join(
            p for p in parts if p and p.strip()
        ).strip()

        # ── Message list ──────────────────────────────────────────
        messages = list(context.recent_history)
        messages.append({"role": "user", "content": user_message})

        return system_prompt, messages

    def _render(self, template_name: str, **kwargs: Any) -> str:
        """Render a template, returning empty string on failure."""
        try:
            return render_template(template_name, **kwargs)
        except Exception as e:
            import traceback
            logger.warning(
                "Template render failed",
                template=template_name,
                error=str(e),
                traceback=traceback.format_exc(),
            )
            return ""
