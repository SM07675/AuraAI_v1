"""
Prompt builder — assembles the final prompt for each AI request.

Combines: system identity + user context + memory + emotion + conversation.
Never hardcodes prompt content — everything comes from template files.
"""

from __future__ import annotations

from typing import Any

from app.prompts.loader import render_template


class PromptBuilder:
    """Assembles complete prompts from modular template components.

    Usage:
        builder = PromptBuilder()
        system, messages = builder.build(
            user_name="Alex",
            user_message="I'm feeling overwhelmed today",
            emotion_data={...},
            user_profile={...},
            memory_context={...},
            conversation_history=[...],
        )
    """

    def build(
        self,
        *,
        user_name: str,
        user_message: str,
        emotion_data: dict[str, Any] | None = None,
        user_profile: dict[str, Any] | None = None,
        long_term_memories: list[dict] | None = None,
        conversation_history: list[dict] | None = None,
    ) -> tuple[str, list[dict]]:
        """Build the system prompt and message history for an AI request.

        Args:
            user_name: Display name of the user.
            user_message: The current user message.
            emotion_data: Emotion analysis results (fused + per-modality).
            user_profile: User profile data (interests, goals, style, etc.).
            long_term_memories: Relevant long-term memory entries.
            conversation_history: Recent session messages.

        Returns:
            Tuple of (system_prompt_string, messages_list).
            Messages list is in OpenAI-compatible format.
        """
        profile = user_profile or {}
        emotion = emotion_data or {}
        memories = long_term_memories or []
        history = conversation_history or []

        # Extract interests / goals
        interests = [i.strip() for i in (profile.get("interests") or "").split(",") if i.strip()]
        goals = [g.strip() for g in (profile.get("goals") or "").split(",") if g.strip()]
        primary_interest = interests[0] if interests else None

        def get_emo_str(val: dict | str | None) -> str:
            if isinstance(val, dict):
                return val.get("emotion", "")
            if isinstance(val, str):
                return val
            return ""

        # Detect emotion conflicts
        text_emo = get_emo_str(emotion.get("text_emotion"))
        voice_emo = get_emo_str(emotion.get("voice_emotion"))
        face_emo = get_emo_str(emotion.get("face_emotion"))
        fused_emo = emotion.get("fused_emotion", "neutral")
        confidence = emotion.get("confidence", 0.0)

        emotion_conflict = False
        conflict_modality = ""
        conflict_emotion = ""
        positive_emotions = {"happy", "calm", "neutral", "joy", "surprised"}

        if text_emo and text_emo.lower() in positive_emotions:
            for modality, emo in [("voice", voice_emo), ("face", face_emo)]:
                if emo and emo.lower() not in positive_emotions:
                    emotion_conflict = True
                    conflict_modality = modality
                    conflict_emotion = emo
                    break

        # ── System prompt sections ────────────────────────────────

        # 1. Base identity
        system_parts = [render_template("system_base.md")]

        # 2. User context
        system_parts.append(render_template(
            "user_context.md",
            user_name=user_name,
            preferred_language=profile.get("preferred_language", "en"),
            communication_style=profile.get("communication_style", "balanced"),
            interests=interests,
            interests_text=", ".join(interests) if interests else "not specified",
            goals=goals,
            goals_text=", ".join(goals) if goals else "not specified",
            primary_interest=primary_interest,
        ))

        # 3. Memory context
        system_parts.append(render_template(
            "memory_context.md",
            user_name=user_name,
            long_term_memories=memories,
            conversation_history=history,
        ))

        # 4. Emotion awareness (if we have emotion data)
        if emotion_data:
            system_parts.append(render_template(
                "system_emotion_aware.md",
                user_name=user_name,
                fused_emotion=fused_emo,
                confidence=round(confidence, 1),
                text_emotion=text_emo,
                voice_emotion=voice_emo,
                face_emotion=face_emo,
                emotion_conflict=emotion_conflict,
                conflict_modality=conflict_modality,
                conflict_emotion=conflict_emotion,
            ))

        system_prompt = "\n\n---\n\n".join(part for part in system_parts if part.strip())

        # ── Messages list (for multi-turn context) ───────────────
        messages: list[dict] = []
        for turn in history:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

        # Current user message
        messages.append({"role": "user", "content": user_message})

        return system_prompt, messages
