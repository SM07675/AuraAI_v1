"""
Emotion Cross-Validation & Nuanced Mental-State Assessment Service for Aura AI.

Implements rigorous multi-region FACS validation, Duchenne smile verification,
epistemic humility, and contradiction handling to avoid misattributing emotions
to isolated facial artifacts (e.g. classifying weak AU12 as happiness when AU06 is 0%).
"""

from __future__ import annotations

import collections
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ValidationReport:
    """Standardized emotion validation report adhering to clinical cross-validation principles."""

    primary_emotion: str
    confidence: str  # "High" | "Moderate" | "Low" | "Uncertain"
    intensity: str  # "None" | "Very Low" | "Low" | "Moderate" | "High" | "Very High"
    facial_evidence: List[str]
    supporting_evidence: List[str]
    contradicting_evidence: List[str]
    alternative_interpretations: List[str]
    temporal_consistency: str  # "Consistent" | "Partially Consistent" | "Inconsistent" | "Unavailable"
    final_assessment: str
    is_genuine_smile: bool = False
    is_duchenne: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "primary_emotion": self.primary_emotion,
            "confidence": self.confidence,
            "intensity": self.intensity,
            "facial_evidence": self.facial_evidence,
            "supporting_evidence": self.supporting_evidence,
            "contradicting_evidence": self.contradicting_evidence,
            "alternative_interpretations": self.alternative_interpretations,
            "temporal_consistency": self.temporal_consistency,
            "final_assessment": self.final_assessment,
            "is_genuine_smile": self.is_genuine_smile,
            "is_duchenne": self.is_duchenne,
        }

    def to_formatted_markdown(self) -> str:
        """Render the structured report exactly in the standardized consultation format."""
        evidence_lines = "\n".join(f"- {e}" for e in self.facial_evidence)
        supporting_lines = "\n".join(f"- {e}" for e in self.supporting_evidence)
        contradicting_lines = "\n".join(f"- {e}" for e in self.contradicting_evidence)
        alternative_lines = "\n".join(f"- {e}" for e in self.alternative_interpretations)

        return (
            f"**Primary Emotion:** {self.primary_emotion.title()}\n\n"
            f"**Emotion Intensity:** {self.intensity}\n\n"
            f"**Confidence:** {self.confidence}\n\n"
            f"**Facial Evidence:**\n{evidence_lines}\n\n"
            f"**Cross-Validation:**\n"
            f"- Supporting evidence:\n{supporting_lines}\n"
            f"- Contradicting evidence:\n{contradicting_lines}\n"
            f"- Temporal consistency: {self.temporal_consistency}\n\n"
            f"**Alternative Interpretations:**\n{alternative_lines}\n\n"
            f"**Final Assessment:**\n{self.final_assessment}"
        )


_GLOBAL_CROSS_VALIDATOR: Optional[EmotionCrossValidator] = None


class EmotionCrossValidator:
    """Multimodal and facial Action Unit cross-validator for nuanced affect analysis."""

    def __init__(self, history_maxlen: int = 20) -> None:
        self._history: collections.deque[Dict[str, Any]] = collections.deque(maxlen=history_maxlen)
        self._last_validation_time: float = 0.0

    @classmethod
    def get_instance(cls) -> EmotionCrossValidator:
        global _GLOBAL_CROSS_VALIDATOR
        if _GLOBAL_CROSS_VALIDATOR is None:
            _GLOBAL_CROSS_VALIDATOR = cls()
        return _GLOBAL_CROSS_VALIDATOR

    def validate(
        self,
        classifier_emotion: str,
        classifier_confidence: float,
        action_units: Optional[Dict[str, Any]] = None,
        gaze: Optional[Dict[str, Any]] = None,
        user_message: str = "",
        tracking_quality: float = 1.0,
    ) -> ValidationReport:
        """Execute the 11-step emotion cross-validation pipeline.

        1. Observe physical facial features.
        2. Validate against classifier hypothesis.
        3. Enforce strict Duchenne verification for smiles.
        4. Measure temporal consistency across observation window.
        5. Evaluate cross-emotion alternatives.
        6. Compute emotion intensity.
        7. Isolate contradictions.
        8. Apply mental-health counseling perspective.
        9. Calibrate evidence-based confidence.
        10. Fallback to Neutral/Uncertain if unsupported.
        11. Generate structured ValidationReport.
        """
        au = action_units or {}
        gaze_info = gaze or {}
        user_text = (user_message or "").strip().lower()

        # Extract normalized Action Unit values (handling 0-5 scale and aliases)
        au12 = float(au.get("AU12") or au.get("AU12_LipCornerPuller") or 0.0)
        au06 = float(au.get("AU06") or au.get("AU06_CheekRaiser") or 0.0)
        au04 = float(au.get("AU04") or au.get("AU04_BrowLowerer") or 0.0)
        au01 = float(au.get("AU01") or au.get("AU01_InnerBrowRaiser") or 0.0)
        au02 = float(au.get("AU02") or au.get("AU02_OuterBrowRaiser") or 0.0)
        au15 = float(au.get("AU15") or au.get("AU15_LipCornerDepressor") or 0.0)
        au25 = float(au.get("AU25") or 0.0)
        au26 = float(au.get("AU26") or 0.0)
        ear = float(gaze_info.get("ear", 0.28) if gaze_info else 0.28)
        eye_contact = bool(gaze_info.get("eye_contact", True) if gaze_info else True)

        # Record observation in temporal rolling history
        now = time.perf_counter()
        self._history.append({
            "timestamp": now,
            "classifier_emotion": classifier_emotion.lower(),
            "classifier_confidence": classifier_confidence,
            "au12": au12,
            "au06": au06,
            "au04": au04,
            "tracking_quality": tracking_quality,
        })
        self._last_validation_time = now

        # ── Step 1: Separate Objective Observation from Interpretation ────
        observable_features: List[str] = []

        # Mouth observations
        if au12 >= 2.4:
            observable_features.append(f"Pronounced bilateral mouth corner elevation (AU12: {au12:.1f}/5.0)")
        elif au12 >= 1.5:
            observable_features.append(f"Subtle/mild mouth corner pull or resting curve (AU12: {au12:.1f}/5.0)")
        elif au15 >= 1.8:
            observable_features.append(f"Depressed lip corners / downturned mouth line (AU15: {au15:.1f}/5.0)")
        else:
            observable_features.append("Mouth rests along a neutral, horizontal line without corner elevation")

        # Cheek observations (Orbicularis oculi / Duchenne marker)
        if au06 >= 1.4:
            observable_features.append(f"Distinct cheek elevation and infraorbital skin bunching (AU06: {au06:.1f}/5.0)")
        elif au06 >= 0.8:
            observable_features.append(f"Trace cheek muscle activation (AU06: {au06:.1f}/5.0)")
        else:
            observable_features.append("Complete absence of cheek elevation or orbital bunching (AU06: 0%)")

        # Eyebrow / Upper Face observations
        if au04 >= 2.0:
            observable_features.append(f"Marked medial brow lowering and furrowing tension (AU04: {au04:.1f}/5.0)")
        elif au04 >= 1.2:
            observable_features.append(f"Mild medial brow lowering / cognitive focus (AU04: {au04:.1f}/5.0)")
        elif au01 >= 2.0 and au02 >= 1.5:
            observable_features.append(f"Elevated inner and outer eyebrow arches (AU01: {au01:.1f}, AU02: {au02:.1f})")
        else:
            observable_features.append("Forehead and eyebrow musculature remain in baseline resting posture")

        # Eye & Gaze observations
        if not eye_contact:
            observable_features.append("Gaze averted away from direct camera axis")
        elif ear < 0.20:
            observable_features.append("Narrowed eyelid opening / squinting")
        else:
            observable_features.append("Attentive frontal gaze with steady eyelid aperture")

        # ── Step 2 & 3: Duchenne Smile and Positive Affect Validation ───────
        # Core Rule: A smile requires bilateral AU12 >= 2.2 AND AU06 >= 1.2.
        # An isolated AU12 with AU06 < 1.0 is NEVER genuine happiness.
        is_duchenne = (au12 >= 2.2 and au06 >= 1.2)
        is_weak_smile = (au12 >= 2.0 and au06 >= 0.8)
        is_isolated_lip_movement = (au12 >= 1.5 and au06 < 0.8)

        # ── Step 4: Temporal Consistency ──────────────────────────────────
        if len(self._history) < 3:
            temporal_consistency = "Unavailable"
        else:
            recent_au12 = [h["au12"] for h in self._history]
            std_au12 = float(np_std := (sum((x - sum(recent_au12)/len(recent_au12))**2 for x in recent_au12)/len(recent_au12))**0.5)
            if std_au12 < 0.35:
                temporal_consistency = "Consistent"
            elif std_au12 < 0.70:
                temporal_consistency = "Partially Consistent"
            else:
                temporal_consistency = "Inconsistent"

        # ── Step 5 & 6: Cross-Emotion Validation & Intensity ──────────────
        supporting_evidence: List[str] = []
        contradicting_evidence: List[str] = []
        alternative_interpretations: List[str] = []

        validated_emotion = "neutral"
        intensity = "None"
        confidence = "Moderate"

        if is_duchenne:
            validated_emotion = "happy"
            intensity = "High" if au12 >= 3.5 else "Moderate"
            confidence = "High" if temporal_consistency == "Consistent" else "Moderate"
            supporting_evidence.append("Bilateral mouth corner elevation concurrently supported by cheek elevation (AU06)")
            supporting_evidence.append("Morphologically coherent Duchenne smile configuration")
            alternative_interpretations.extend(["Mild social amusement", "Expressive delight"])
        elif is_isolated_lip_movement:
            # Crucial case matching user issue: AU12 present without AU06!
            validated_emotion = "neutral"
            intensity = "Very Low"
            confidence = "Moderate"
            supporting_evidence.append("Lack of orbicularis oculi engagement (AU06: 0%) contradicts positive affect")
            supporting_evidence.append("Resting oral line and neutral upper face indicate baseline composure")
            contradicting_evidence.append(f"Classifier registered isolated AU12 ({au12:.1f}/5.0), falsely proposing smile; cheek raiser (AU06: {au06:.1f}) is completely inactive")
            alternative_interpretations.extend([
                "Resting lip anatomy, speech movement, or camera lighting shadow",
                "Polite social masking or nervous smile",
                "Subdued or suppressed emotion",
            ])
        elif au04 >= 2.0 and au15 >= 1.5:
            validated_emotion = "sad"
            intensity = "Moderate"
            confidence = "Moderate"
            supporting_evidence.append("Co-activation of brow lowerer (AU04) and lip corner depressor (AU15)")
            alternative_interpretations.extend(["Physical discomfort", "Mental fatigue", "Somatic tension"])
        elif au04 >= 1.8:
            validated_emotion = "neutral"
            intensity = "Low"
            confidence = "Moderate"
            supporting_evidence.append("Medial brow lowering reflects cognitive effort without full depressive configuration")
            alternative_interpretations.extend([
                "Cognitive concentration or reading screen text",
                "Visual fatigue or room glare",
                "Subdued or contemplative baseline state",
            ])
        elif (au01 >= 2.0 or au02 >= 2.0) and (au25 >= 1.5 or au26 >= 1.5):
            validated_emotion = "surprised"
            intensity = "Moderate"
            confidence = "Moderate"
            supporting_evidence.append("Elevated eyebrow arches combined with jaw/lip parting")
            alternative_interpretations.extend(["Brief startle reflex", "Attentive intake of new information"])
        else:
            validated_emotion = "neutral"
            intensity = "None"
            confidence = "High" if tracking_quality >= 0.85 else "Moderate"
            supporting_evidence.append("Facial musculature is relaxed and in anatomical equilibrium")
            contradicting_evidence.append("None identified")
            alternative_interpretations.extend(["Calm resting state", "Undivided cognitive focus"])

        # ── Step 7 & 8: Contextual Integration & Epistemic Humility ────────
        # Check against verbal narrative
        claims_sadness = any(w in user_text for w in ["sad", "depressed", "hurting", "down", "cry", "unhappy", "pain"])
        claims_happiness = any(w in user_text for w in ["happy", "great", "awesome", "good", "fine", "fantastic"])

        if claims_sadness:
            if not is_duchenne:
                alternative_interpretations.insert(0, "Subdued affect / masked sadness coherent with verbal self-report")
                if validated_emotion == "neutral":
                    final_note = "User verbally reports feeling sad while facial expression remains neutral/subdued."
            else:
                contradicting_evidence.append("User verbally reports sadness while facial expression displays a genuine smile")
                final_note = "Incongruous affect: Verified smile co-occurring with stated sadness."
        elif claims_happiness:
            if not is_duchenne and validated_emotion == "neutral":
                contradicting_evidence.append("User verbally reports happiness while facial expression remains quiet/neutral")
                final_note = "Verbal statement indicates happiness, but facial composure remains quiet/solemn."
            else:
                final_note = "Facial composure and verbal sentiment are reasonably concordant."
        else:
            final_note = f"Facial expression evaluated as {validated_emotion.title()} with {confidence} confidence."

        if not contradicting_evidence:
            contradicting_evidence.append("None identified")

        # ── Step 9 & 10: Final Assessment Formulation ─────────────────────
        if validated_emotion == "neutral" and is_isolated_lip_movement:
            final_assessment = (
                f"The facial configuration is evaluated as Neutral with {confidence} confidence. "
                f"Although an isolated lip corner pull was detected (AU12: {au12:.1f}/5.0), the complete absence "
                f"of cheek raiser activation (AU06: {au06:.1f}/5.0) rules out authentic positive affect or a Duchenne smile. "
                f"The observed cue is most plausibly a resting anatomical trait, lighting artifact, or subtle social mask. "
                f"{final_note}"
            )
        else:
            final_assessment = (
                f"The observable facial evidence is consistent with {validated_emotion.title()} at {intensity} intensity "
                f"({confidence} confidence). {final_note} Epistemic humility applies: physical facial cues are "
                f"probabilistic telemetry, not direct proof of internal psychological experience."
            )

        return ValidationReport(
            primary_emotion=validated_emotion,
            confidence=confidence,
            intensity=intensity,
            facial_evidence=observable_features,
            supporting_evidence=supporting_evidence,
            contradicting_evidence=contradicting_evidence,
            alternative_interpretations=alternative_interpretations[:3],
            temporal_consistency=temporal_consistency,
            final_assessment=final_assessment,
            is_genuine_smile=is_duchenne or is_weak_smile,
            is_duchenne=is_duchenne,
        )


def get_cross_validator() -> EmotionCrossValidator:
    """Singleton provider for EmotionCrossValidator."""
    return EmotionCrossValidator.get_instance()
