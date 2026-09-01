"""
Prompt builder — assembles the final prompt for each AI request.

Combines: system identity + user context + memory + emotion + conversation.
Never hardcodes prompt content — everything comes from template files.
"""

from __future__ import annotations

import re
from typing import Any

from app.emotion.base import EmotionContext
from app.prompts.loader import render_template

try:
    from app.ai.builders.context_builder import ContextObject
except Exception:  # pragma: no cover
    ContextObject = None


_HINDI_KEYWORDS = frozenset({
    "mujhe", "mera", "meri", "mere", "hai", "hain", "hoon", "tha", "thi", "the",
    "kya", "kyun", "kaise", "kab", "kahan", "nahi", "nahin", "bohot", "bahut",
    "namaste", "namaskar", "shukriya", "dhanyawad", "doctor", "sahab", "sahiba",
    "thak", "thakan", "thaka", "dard", "sirdard", "pareshan", "pareshani", "tanav",
    "bechaini", "neend", "suno", "ruko", "batao", "bataiye", "kripya", "aap", "tum",
    "karen", "kare", "karo", "kaise", "hota", "hoti", "hote"
})


def _is_hindi_turn(text: str) -> bool:
    if not text:
        return False
    # 1. Any Devanagari character
    if re.search(r"[\u0900-\u097F]", text):
        return True
    # 2. Hinglish romanized keywords check
    words = re.findall(r"[a-zA-Z]+", text.lower())
    if not words:
        return False
    hindi_matches = sum(1 for w in words if w in _HINDI_KEYWORDS)
    if hindi_matches >= 2 or (hindi_matches >= 1 and len(words) <= 4):
        return True
    return False


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
        graph_facts: list[str] | None = None,
        conversation_history: list[dict] | None = None,
        crisis_context: str | None = None,
        turn_directive: dict[str, Any] | None = None,
        retrieved_solution: str | None = None,
        conversation_summary: str | None = None,
        previous_session_context: list[str] | None = None,
        targeted_question: str | None = None,
        mode: str = "chat",
    ) -> tuple[str, list[dict]]:
        """Build the system prompt and message history for an AI request.

        Args:
            user_name: Display name of the user.
            user_message: The current user message.
            emotion_data: Emotion analysis results (fused + per-modality).
            user_profile: User profile data (interests, goals, style, etc.).
            long_term_memories: Relevant long-term memory entries.
            conversation_history: Recent session messages.
            crisis_context: Optional context override if a crisis was detected.
            turn_directive: Optional fast-tier structural directive for this turn.
            retrieved_solution: Optional coping solution retrieved from the library.
            conversation_summary: Saved summary of the current session.
            previous_session_context: Concise summaries or excerpts from earlier chats.
            targeted_question: Best context-aware question selected for this turn.
            mode: "chat" or "live" — dictates verbosity and cadence.

        Returns:
            Tuple of (system_prompt_string, messages_list).
            Messages list is in OpenAI-compatible format.
        """
        profile = user_profile or {}
        if isinstance(emotion_data, EmotionContext):
            emotion = {
                "fused_emotion": emotion_data.primary_emotion,
                "confidence": emotion_data.confidence * 100,
                "text_emotion": emotion_data.text_emotion,
                "voice_emotion": emotion_data.voice_emotion,
                "face_emotion": emotion_data.face_emotion,
                "emotion_conflict": emotion_data.emotion_conflict,
                "conflict_detail": emotion_data.conflict_detail,
                "stress": emotion_data.stress,
                "sentiment": emotion_data.sentiment,
                "intent": emotion_data.intent,
                "sources": list(emotion_data.sources or []),
                "conversation_trend": emotion_data.conversation_trend,
                "guidance": emotion_data.guidance or emotion_data.get_guidance(),
            }
        elif isinstance(emotion_data, dict):
            emotion = emotion_data or {}
        else:
            emotion = {}
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
        if isinstance(confidence, str):
            try:
                confidence = float(confidence)
            except ValueError:
                confidence = 0.0

        emotion_conflict = bool(emotion.get("emotion_conflict", False) or emotion.get("conflict", False))
        conflict_detail = emotion.get("conflict_detail") or ""
        conflict_modality = ""
        conflict_emotion = ""
        positive_emotions = {"happy", "calm", "neutral", "joy", "surprised"}

        has_explicit_emotion = bool(
            emotion_data is not None
            and (
                fused_emo not in (None, "", "neutral")
                or text_emo
                or voice_emo
                or face_emo
                or emotion_conflict
            )
        )

        if not emotion_conflict and text_emo and text_emo.lower() in positive_emotions:
            for modality, emo in [("voice", voice_emo), ("face", face_emo)]:
                if emo and emo.lower() not in positive_emotions:
                    emotion_conflict = True
                    conflict_modality = modality
                    conflict_emotion = emo
                    conflict_detail = f"Discrepancy detected between {modality} emotion ({emo}) and text ({text_emo})"
                    break

        if emotion_conflict and not conflict_detail:
            conflict_detail = "Discrepancy detected across emotional modalities"

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

        # 3b. Knowledge Graph context
        if graph_facts:
            system_parts.append(render_template(
                "graph_context.md",
                graph_facts=graph_facts,
            ))

        # 4. Conversation continuity across long and previous sessions
        if conversation_summary or previous_session_context:
            system_parts.append(render_template(
                "conversation_summary.md",
                conversation_summary=conversation_summary or "",
                previous_session_context=previous_session_context or [],
            ))

        # 5. Emotion awareness (if we have emotion data)
        if has_explicit_emotion:
            system_parts.append(render_template(
                "system_emotion_aware.md",
                user_name=user_name,
                primary_emotion=fused_emo,
                fused_emotion=fused_emo,
                confidence=round(confidence / 100.0 if confidence > 1 else confidence, 1),
                stress=emotion.get("stress", "low"),
                sentiment=emotion.get("sentiment", "neutral"),
                intent=emotion.get("intent", "casual"),
                sources=emotion.get("sources") or (["text"] if text_emo or voice_emo or face_emo else ["text"]),
                text_emotion=text_emo,
                voice_emotion=voice_emo,
                face_emotion=face_emo,
                emotion_conflict=emotion_conflict,
                conflict_detail=conflict_detail,
                conflict_modality=conflict_modality,
                conflict_emotion=conflict_emotion,
                conversation_trend=emotion.get("conversation_trend", ""),
                guidance=emotion.get("guidance", {}),
                face_behavior_summary=emotion.get("face_behavior_summary") or getattr(emotion_data, "_face_behavior_summary", ""),
            ))
        else:
            system_parts.append(render_template(
                "system_emotion_aware.md",
                user_name=user_name,
                primary_emotion="neutral",
                fused_emotion="neutral",
                confidence=0.0,
                stress="low",
                sentiment="neutral",
                intent="casual",
                sources=[],
                text_emotion="",
                voice_emotion="",
                face_emotion="",
                emotion_conflict=False,
                conflict_modality="",
                conflict_emotion="",
                conversation_trend="",
                guidance={},
            ))

        if crisis_context:
            system_parts.append(f"## CRISIS RESPONSE OVERRIDE\n\n{crisis_context}")

        if turn_directive or targeted_question:
            td = turn_directive or {}
            q_seed = targeted_question or td.get("nextQuestionSeed") or ""
            system_parts.append(render_template(
                "turn_directive.md",
                phase=td.get("phase", "explore"),
                must_reflect=td.get("mustReflectFirst", True),
                offer_solution=bool(td.get("offerSolution", False) and retrieved_solution),
                solution=retrieved_solution or "",
                must_ask_follow_up=True,
                next_question_seed=q_seed,
            ))

        # ── Dynamic Per-Turn Language Directive ───────────────────
        if _is_hindi_turn(user_message):
            system_parts.append(
                "## MANDATORY LANGUAGE FOR THIS TURN: HINDI\n"
                "The patient's current message is in HINDI. You MUST generate your response entirely "
                "in natural, fluent HINDI IN DEVANAGARI SCRIPT "
                "(e.g. 'नमस्ते, मैं समझ सकती हूँ...'). "
                "Use feminine grammatical agreement (स्त्रीलिंग: 'सकती हूँ', 'करूँगी'). Do NOT reply in English."
            )
        else:
            system_parts.append(
                "## MANDATORY LANGUAGE FOR THIS TURN: ENGLISH\n"
                "The patient's current message is in ENGLISH. You MUST generate your response entirely "
                "in natural, fluent ENGLISH. "
                "Do NOT reply in Hindi."
            )

        if targeted_question:
            system_parts.append(
                "## CONTEXTUAL FOLLOW-UP\n"
                "End this response with the following question, woven in naturally. "
                "Do not add a second question and do not mention that this was generated from memory:\n"
                f'"{targeted_question}"'
            )

        if mode == "live":
            system_parts.append(
                "## LIVE MODE CONSTRAINTS\n"
                "You are communicating in a real-time, spoken conversation. "
                "Keep your sentences SHORT, conversational, and easy to hear. "
                "Do NOT use markdown lists, bold text, or overly structured paragraphs. "
                "Speak as naturally as a human on a voice call."
            )

        system_prompt = "\n\n---\n\n".join(part for part in system_parts if part.strip())

        if not system_prompt.strip():
            system_prompt = "You are a helpful AI assistant. Always provide a thoughtful response."


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
