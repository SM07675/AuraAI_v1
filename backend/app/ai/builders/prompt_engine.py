"""
Advanced Prompt Engine for Aura AI 2.0.

Assembles the unified, high-precision system prompt and conversation messages
for NVIDIA NIM streaming generation without requiring redundant serial LLM pre-flights.

Components Assembled:
1. System base instructions & Dr. Aura persona
2. Conversation mode & tone instructions (chat vs voice vs face_to_face)
3. User profile (name, communication style, language)
4. Active goals & priority targets (e.g. placement preparation)
5. Relevant user interests & projects (e.g. AI, Aura AI)
6. Relevant long-term episodic & semantic memories
7. Relevant knowledge graph facts
8. Multimodal emotion context (primary, secondary, conflict, stress)
9. Rolling session summary
10. Context-aware single question directive (avoiding questionnaire fatigue)
11. Recent dialogue turns + current user message
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging_config import get_logger
from app.emotion.base import EmotionContext

logger = get_logger(__name__)

_DEFAULT_SYSTEM_BASE = """\
You are Dr. Aura, a world-class empathetic AI wellness companion, clinical counselor, and mentor.
You communicate naturally, with deep emotional intelligence, warmth, clarity, and precision.

CORE PRINCIPLES:
1. Empathy & Active Listening: Validate the user's emotions authentically. Never use robotic clichés or toxic positivity.
2. Contextual Personalization: Use known user facts (goals, interests, projects) naturally when relevant to their message.
3. Natural Flow & Single Follow-Up: Always respond concisely and end with at most ONE insightful, relevant follow-up question. Never overwhelm the user with multiple questions or turn the dialogue into an interview.
4. Non-repetitive: Do NOT ask questions or request information the user has already provided in profile, goals, or knowledge graph.
5. Multimodal Awareness: If emotional cues (voice stress, facial tension) are present, acknowledge them with gentle empathy without being clinical or intrusive.
6. Safety: In crisis or self-harm situations, provide supportive safety resources immediately with compassionate grounding.
"""


class PromptEngine:
    """Master prompt assembler for real-time streaming LLM generation."""

    def __init__(self) -> None:
        pass

    def build_prompt(
        self,
        user_name: str,
        user_message: str,
        emotion_context: Optional[EmotionContext | Dict[str, Any]] = None,
        user_profile: Optional[Dict[str, Any]] = None,
        active_goals: Optional[List[Dict[str, Any]]] = None,
        relevant_memories: Optional[List[Dict[str, Any]]] = None,
        graph_facts: Optional[List[str]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        conversation_summary: Optional[str] = None,
        mode: str = "chat",
        preferred_language: Optional[str] = None,
        turn_count: int = 1,
        previously_asked_questions: Optional[List[str]] = None,
        crisis_context: Optional[str] = None,
    ) -> Tuple[str, List[Dict[str, str]]]:
        """Build the complete system prompt string and OpenAI-format messages list."""
        profile = user_profile or {}
        goals = active_goals or []
        memories = relevant_memories or []
        facts = graph_facts or []
        history = conversation_history or []

        prompt_sections: List[str] = [_DEFAULT_SYSTEM_BASE]

        # ── 1. Conversation Mode Directive ─────────────────────────
        if mode in ("voice", "live", "realtime", "face_to_face"):
            prompt_sections.append(
                "## CONVERSATION MODE: REAL-TIME VOICE / FACE-TO-FACE\n"
                "- Keep responses concise, spoken-friendly, and conversational (typically 2–4 sentences).\n"
                "- Avoid bullet lists, markdown headers, code blocks, or URLs in voice mode unless explicitly requested.\n"
                "- Use natural phrasing with smooth pauses so speech synthesis sounds human."
            )
        else:
            prompt_sections.append(
                "## CONVERSATION MODE: TEXT CHAT\n"
                "- Format responses cleanly with appropriate paragraphs and empathetic spacing."
            )

        # ── 2. Language Directive ──────────────────────────────────
        lang = preferred_language or profile.get("preferred_language", "en")
        is_hindi = lang.startswith("hi") or bool(re.search(r"[\u0900-\u097F]", user_message))
        if is_hindi:
            prompt_sections.append(
                "## LANGUAGE DIRECTIVE: HINDI / HINGLISH\n"
                "- Respond warmly in natural Hindi (Devanagari) or Hinglish matching the user's style.\n"
                "- Keep medical/counseling terms natural and comforting."
            )

        # ── 3. User Profile & Personalization ──────────────────────
        profile_lines = [f"- Name: {user_name or 'Friend'}"]
        if profile.get("communication_style"):
            profile_lines.append(f"- Communication Style: {profile['communication_style']}")
        if profile.get("interests"):
            profile_lines.append(f"- Known Interests: {profile['interests']}")
        if profile.get("projects"):
            profile_lines.append(f"- Current Projects: {profile['projects']}")
        prompt_sections.append("## USER PROFILE:\n" + "\n".join(profile_lines))

        # ── 4. Active Goals & Targets ──────────────────────────────
        if goals:
            goal_lines = []
            for g in goals[:4]:
                title = g.get("title") or g.get("goal") or str(g)
                cat = g.get("category", "General")
                goal_lines.append(f"- [{cat}] {title}")
            prompt_sections.append("## ACTIVE USER GOALS:\n" + "\n".join(goal_lines))
        elif profile.get("goals"):
            prompt_sections.append(f"## ACTIVE USER GOALS:\n- {profile['goals']}")

        # ── 5. Relevant Long-Term Memory Context ───────────────────
        if memories:
            mem_lines = []
            for m in memories[:6]:
                k = m.get("key") or m.get("topic") or "Fact"
                v = m.get("value") or m.get("content") or str(m)
                mem_lines.append(f"- {k}: {v}")
            prompt_sections.append("## RELEVANT MEMORIES & PRIOR CONTEXT:\n" + "\n".join(mem_lines))

        # ── 6. Knowledge Graph Facts ───────────────────────────────
        if facts:
            fact_lines = [f"- {f}" for f in facts[:6]]
            prompt_sections.append("## KNOWLEDGE GRAPH FACTS (Already known — do NOT re-ask):\n" + "\n".join(fact_lines))

        # ── 7. Rolling Session Summary ─────────────────────────────
        if conversation_summary and conversation_summary.strip():
            prompt_sections.append(f"## ROLLING SESSION SUMMARY:\n{conversation_summary.strip()}")

        # ── 8. Multimodal Emotion Context ──────────────────────────
        if emotion_context:
            if isinstance(emotion_context, EmotionContext):
                emo_name = emotion_context.primary_emotion
                emo_conf = round(emotion_context.confidence * 100 if emotion_context.confidence <= 1.0 else emotion_context.confidence, 1)
                emo_stress = emotion_context.stress
                emo_sentiment = emotion_context.sentiment
                emo_conflict = emotion_context.conflict
                conflict_detail = getattr(emotion_context, "_conflict_detail", "")
            elif isinstance(emotion_context, dict):
                emo_name = emotion_context.get("primary_emotion") or emotion_context.get("fused_emotion") or "neutral"
                c_val = float(emotion_context.get("confidence") or 0.7)
                emo_conf = round(c_val * 100 if c_val <= 1.0 else c_val, 1)
                emo_stress = emotion_context.get("stress") or emotion_context.get("stress_level") or "low"
                emo_sentiment = emotion_context.get("sentiment", "neutral")
                emo_conflict = bool(emotion_context.get("conflict") or emotion_context.get("conflict_status", False))
                conflict_detail = emotion_context.get("conflict_detail", "")
            else:
                emo_name, emo_conf, emo_stress, emo_sentiment, emo_conflict, conflict_detail = "neutral", 50.0, "low", "neutral", False, ""

            emo_lines = [
                f"- Primary Observed Emotion: {emo_name.upper()} (Confidence: {emo_conf}%)",
                f"- Stress Level: {emo_stress.upper()}",
                f"- Valence/Sentiment: {emo_sentiment.upper()}",
            ]
            if emo_conflict:
                emo_lines.append(f"- Note: Non-verbal/verbal divergence detected ({conflict_detail or 'mixed cues'}). Prioritize the user's explicit words.")

            prompt_sections.append("## CURRENT MULTIMODAL EMOTION STATE:\n" + "\n".join(emo_lines))

        # ── 9. Question & Learning Directives ──────────────────────
        question_guidance = [
            "## QUESTION GUIDELINES:",
            "- If the user is sharing a struggle, ask how they are coping or what specific part feels most challenging.",
            "- If the user is starting a session and profile is empty, gently ask one natural question about their day or goals.",
            "- End your response with at most ONE clear, open-ended question.",
        ]
        if previously_asked_questions:
            q_list = [f"- {q}" for q in previously_asked_questions[-4:]]
            question_guidance.append("Previously Asked (Do NOT repeat):\n" + "\n".join(q_list))
        prompt_sections.append("\n".join(question_guidance))

        # ── 10. Crisis Safety Override ─────────────────────────────
        if crisis_context:
            prompt_sections.append(f"## CRISIS INTERVENTION DIRECTIVE:\n{crisis_context}")

        # Assemble full system prompt
        system_prompt = "\n\n".join(prompt_sections)

        # Build messages list
        messages: List[Dict[str, str]] = []
        for turn in history[-10:]:
            r = turn.get("role", "user")
            c = turn.get("content", "")
            if c:
                messages.append({"role": r, "content": c})

        # Add current user message
        if user_message and (not messages or messages[-1].get("content") != user_message):
            messages.append({"role": "user", "content": user_message})

        return system_prompt, messages
