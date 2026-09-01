from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.core.deps import get_current_user_id, get_db
from app.models.emotion_log import EmotionLog
from app.models.session import Session
from app.models.goal import UserGoal

router = APIRouter(prefix="/analytics", tags=["Analytics"])

EMOTION_WEIGHTS: Dict[str, float] = {
    "calm": 85.0,
    "joy": 95.0,
    "happy": 90.0,
    "relaxed": 85.0,
    "content": 80.0,
    "neutral": 65.0,
    "surprised": 70.0,
    "anxious": 40.0,
    "fear": 35.0,
    "fearful": 35.0,
    "sad": 35.0,
    "lonely": 30.0,
    "angry": 30.0,
    "frustrated": 35.0,
    "disgusted": 30.0,
    "contempt": 30.0,
    "fatigued": 50.0,
}

def get_mood_score(emotion_str: str) -> float:
    if not emotion_str:
        return 65.0
    clean = emotion_str.strip().lower()
    return EMOTION_WEIGHTS.get(clean, 65.0)


@router.get("/emotion_history", summary="Get recent emotion trends")
async def get_emotion_history(
    days: int = Query(default=7, ge=1, le=90),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return emotion history for the current user to build mood trends."""
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=days)
        stmt = (
            select(EmotionLog)
            .where(EmotionLog.user_id == user_id, EmotionLog.created_at >= cutoff)
            .order_by(desc(EmotionLog.created_at))
            .limit(50)
        )
        result = await db.execute(stmt)
        logs = result.scalars().all()
        logs.reverse()

        # If no logs in cutoff, try getting last 10 logs without cutoff
        if not logs:
            stmt_recent = (
                select(EmotionLog)
                .where(EmotionLog.user_id == user_id)
                .order_by(desc(EmotionLog.created_at))
                .limit(10)
            )
            res_recent = await db.execute(stmt_recent)
            logs = res_recent.scalars().all()
            logs.reverse()

        return {
            "history": [
                {
                    "id": log.id,
                    "fused_emotion": log.fused_emotion,
                    "confidence": log.confidence,
                    "timestamp": log.created_at.isoformat() if log.created_at else datetime.now(timezone.utc).isoformat()
                }
                for log in logs
            ]
        }
    except Exception:
        return {
            "history": []
        }


@router.get("/overview", summary="Get comprehensive user analytics and AI wellness insights")
async def get_analytics_overview(
    days: int = Query(default=7, ge=1, le=90),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Compute real user analytics, emotion distribution, session stats, and AI insights."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    prev_cutoff = cutoff - timedelta(days=days)

    all_logs = []
    sessions = []
    active_goals_count = 0

    # 1. Query Emotion Logs
    try:
        stmt_emotions = (
            select(EmotionLog)
            .where(EmotionLog.user_id == user_id, EmotionLog.created_at >= prev_cutoff)
            .order_by(EmotionLog.created_at.asc())
        )
        result_emotions = await db.execute(stmt_emotions)
        all_logs = result_emotions.scalars().all()
    except Exception:
        all_logs = []

    current_logs = [l for l in all_logs if l.created_at and l.created_at >= cutoff]
    previous_logs = [l for l in all_logs if l.created_at and prev_cutoff <= l.created_at < cutoff]

    # Calculate Avg Mood Score
    current_mood_scores = [get_mood_score(l.fused_emotion) for l in current_logs]
    prev_mood_scores = [get_mood_score(l.fused_emotion) for l in previous_logs]

    if current_mood_scores:
        avg_mood = round(sum(current_mood_scores) / len(current_mood_scores))
        if prev_mood_scores:
            prev_avg_mood = round(sum(prev_mood_scores) / len(prev_mood_scores))
            mood_shift = avg_mood - prev_avg_mood
            mood_shift_str = f"{'+' if mood_shift >= 0 else ''}{mood_shift}% vs last period"
        else:
            mood_shift_str = "Baseline recorded"
    else:
        avg_mood = 0
        mood_shift_str = "No logs yet"

    # Emotion Distribution Counts
    emotion_counts: Dict[str, int] = {}
    for l in current_logs:
        emo = (l.fused_emotion or "Neutral").capitalize()
        emotion_counts[emo] = emotion_counts.get(emo, 0) + 1

    total_emo_records = sum(emotion_counts.values())
    if total_emo_records > 0:
        emotion_distribution = [
            {"name": emo, "count": count, "percentage": round((count / total_emo_records) * 100)}
            for emo, count in sorted(emotion_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        dominant_emotion = emotion_distribution[0]["name"]
    else:
        emotion_distribution = []
        dominant_emotion = "None"

    # 2. Query Sessions
    try:
        stmt_sessions = (
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(desc(Session.created_at))
        )
        result_sessions = await db.execute(stmt_sessions)
        sessions = result_sessions.scalars().all()
    except Exception:
        sessions = []

    total_sessions_count = len(sessions)
    mode_counts: Dict[str, int] = {"chat": 0, "voice": 0, "face_to_face": 0}

    # Calculate active streak & duration
    unique_days = set()
    total_minutes = 0

    for s in sessions:
        m = s.mode.lower() if s.mode else "chat"
        if m in ("face", "facetoface", "face-to-face"):
            m = "face_to_face"
        mode_counts[m] = mode_counts.get(m, 0) + 1

        if s.created_at:
            unique_days.add(s.created_at.date())
            if s.ended_at:
                dur = (s.ended_at - s.created_at).total_seconds() / 60
                total_minutes += max(int(dur), 1)
            else:
                total_minutes += 5

    hours = total_minutes // 60
    mins = total_minutes % 60
    duration_str = f"{hours}h {mins}m total" if hours > 0 else f"{mins}m total"

    # Streak calculation
    streak = 0
    check_date = now.date()
    while check_date in unique_days:
        streak += 1
        check_date -= timedelta(days=1)

    # 3. Query Goals
    try:
        stmt_goals = (
            select(func.count(UserGoal.id))
            .where(UserGoal.user_id == user_id, UserGoal.status == "active")
        )
        res_goals = await db.execute(stmt_goals)
        active_goals_count = res_goals.scalar_one_or_none() or 0
    except Exception:
        active_goals_count = 0

    # 4. Build Weekly Wellbeing & Focus Rhythm Daily Trends (Mon - Sun)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    # Map logs to weekday (0=Mon, ..., 6=Sun)
    day_scores: Dict[int, List[float]] = {i: [] for i in range(7)}
    for l in current_logs:
        if l.created_at:
            wd = l.created_at.weekday()
            day_scores[wd].append(get_mood_score(l.fused_emotion))

    weekly_wellbeing = []
    focus_rhythm = []

    for i in range(7):
        scores = day_scores[i]
        calc_v = round(sum(scores) / len(scores)) if scores else 0
        focus_v = min(100, max(0, calc_v + 5)) if calc_v > 0 else 0
        weekly_wellbeing.append({"d": day_names[i], "v": calc_v})
        focus_rhythm.append({"d": day_names[i], "v": calc_v, "focus": focus_v})

    has_data = total_sessions_count > 0 or len(current_logs) > 0

    # 5. Generate AI Insights & Recommendations
    insights: List[Dict[str, Any]] = []

    if has_data:
        if dominant_emotion != "None":
            pct = emotion_distribution[0]['percentage'] if emotion_distribution else 0
            insights.append({
                "id": "1",
                "category": "Mood Resonance",
                "title": f"Predominantly {dominant_emotion} Baseline",
                "description": f"Your emotion tracking reflects a strong presence of {dominant_emotion} ({pct}% of recorded checks), showing your current emotional rhythm.",
                "type": "positive",
                "icon": "HeartHandshake"
            })

        total_interactive = mode_counts.get('voice', 0) + mode_counts.get('face_to_face', 0)
        if total_interactive > 0:
            insights.append({
                "id": "2",
                "category": "Session Dynamics",
                "title": "Interactive Multi-Modal Depth",
                "description": f"You've completed {total_interactive} voice and camera sessions. Engaging across multiple modalities deepens contextual empathy.",
                "type": "insight",
                "icon": "Sparkles"
            })

        if streak > 0:
            insights.append({
                "id": "3",
                "category": "Consistency",
                "title": f"{streak}-Day Check-in Streak",
                "description": f"You're on a {streak}-day active reflection streak. Daily check-ins build long-term emotional awareness.",
                "type": "achievement",
                "icon": "Flame"
            })

        insights.append({
            "id": "4",
            "category": "Wellness Recommendation",
            "title": "Daily Reflection Habit",
            "description": "Pairing a short 3-minute check-in with your morning or evening routine provides high-resolution emotional tracking.",
            "type": "recommendation",
            "icon": "Compass"
        })
    else:
        insights.append({
            "id": "welcome",
            "category": "Getting Started",
            "title": "Welcome to Aura AI",
            "description": "Start your first Chat, Voice, or Face-to-Face consultation to begin tracking emotional patterns, streaks, and personal growth insights.",
            "type": "insight",
            "icon": "Sparkles"
        })

    return {
        "has_data": has_data,
        "kpis": {
            "avg_mood": avg_mood,
            "mood_shift": mood_shift_str,
            "total_sessions": total_sessions_count,
            "duration": duration_str,
            "streak_days": streak,
            "dominant_emotion": dominant_emotion,
            "active_goals": active_goals_count,
        },
        "weekly_wellbeing": weekly_wellbeing,
        "focus_rhythm": focus_rhythm,
        "emotion_distribution": emotion_distribution,
        "interaction_modes": [
            {"mode": "Chat", "count": mode_counts.get("chat", 0)},
            {"mode": "Voice", "count": mode_counts.get("voice", 0)},
            {"mode": "Face-to-Face", "count": mode_counts.get("face_to_face", 0)},
        ],
        "insights": insights,
    }
