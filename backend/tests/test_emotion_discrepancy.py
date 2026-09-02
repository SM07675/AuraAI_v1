import pytest
from app.services.emotion.emotion_fusion import EmotionFusionService
from app.emotion.base import EmotionContext
from app.prompts.builder import PromptBuilder

def test_affective_discrepancy_happy_text_sad_face():
    fusion = EmotionFusionService.get_instance()
    result = fusion.fuse(
        text_res={"primary_emotion": "happy", "confidence": 0.90, "quality": 1.0},
        face_res={"primary_emotion": "sad", "confidence": 0.85, "face_detected": True, "tracking_quality": 0.95},
        user_message="I am really happy today",
    )
    assert result["conflict_status"] is True
    assert "divergence" in result["conflict_detail"].lower() or "incongruence" in result["conflict_detail"].lower()

def test_affective_discrepancy_happy_text_neutral_solemn_face():
    # Matching user scenario: says "I am really happy today" but face is neutral with low smile (1.4) and brow furrow (1.0)
    fusion = EmotionFusionService.get_instance()
    result = fusion.fuse(
        text_res={"primary_emotion": "happy", "confidence": 0.90, "quality": 1.0},
        face_res={
            "primary_emotion": "neutral",
            "confidence": 0.85,
            "face_detected": True,
            "tracking_quality": 0.96,
            "action_units": {"AU12": 1.4, "AU04": 1.0},
        },
        user_message="I am really happy today",
    )
    assert result["conflict_status"] is True
    assert "incongruence" in result["conflict_detail"].lower()

def test_affective_discrepancy_sad_text_smiling_face():
    # Exactly matching user scenario: says "I am feeling sad today" while face has an active smile (AU12 = 2.8)
    fusion = EmotionFusionService.get_instance()
    result = fusion.fuse(
        text_res={"primary_emotion": "sad", "confidence": 0.90, "quality": 1.0},
        face_res={
            "primary_emotion": "neutral",
            "confidence": 0.85,
            "face_detected": True,
            "tracking_quality": 0.85,
            "action_units": {"AU12": 2.8, "AU04": 0.85},
        },
        user_message="I am feeling sad today",
    )
    assert result["conflict_status"] is True
    assert "smiling" in result["conflict_detail"].lower() or "incongruous" in result["conflict_detail"].lower()

def test_prompt_builder_injects_discrepancy_directive():
    ctx = EmotionContext(
        primaryEmotion="happy",
        confidence=0.85,
        stressLevel=0.2,
        activeSources=["face", "text"],
        conflict=True,
        sentiment="positive",
        intent="casual",
        stress="low",
        text_emotion="happy",
        face_emotion="neutral",
        conflict_detail="Non-verbal incongruence: User claims 'happy', but facial expression is solemn/neutral",
    )
    setattr(ctx, "action_units", {"AU12": 1.4, "AU04": 1.0})
    setattr(ctx, "gaze", {"eye_contact": "direct"})
    setattr(ctx, "head_pose", {"pitch": -5.0, "yaw": 2.0})

    builder = PromptBuilder()
    system_prompt, messages = builder.build(
        user_name="Atharv",
        user_profile={"name": "Atharv"},
        emotion_data=ctx,
        conversation_history=[],
        user_message="I am really happy today",
    )

    assert "CRITICAL NON-VERBAL AFFECTIVE DISCREPANCY DETECTED" in system_prompt
    assert "solemn" in system_prompt or "quiet" in system_prompt
