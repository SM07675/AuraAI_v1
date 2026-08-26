import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  HeartHandshake,
  Zap,
  Target,
  MessageCircle,
  Activity,
  BookOpen,
  Moon,
  Rocket,
  Lightbulb,
  Check,
  ArrowRight,
  Sliders,
} from "lucide-react";
import { GlassCard } from "./glass-card";

interface OnboardingProps {
  userName?: string;
  onComplete: (data: {
    interests: string[];
    goals: string[];
    communicationStyle: string;
  }) => void;
}

const INTEREST_TOPICS = [
  {
    id: "mindfulness",
    label: "Mindfulness & Meditation",
    icon: HeartHandshake,
    category: "Mental Wellness",
    desc: "Guided calm exercises & deep breathing",
  },
  {
    id: "stress_relief",
    label: "Stress & Anxiety Relief",
    icon: Zap,
    category: "Mental Wellness",
    desc: "Immediate grounding tools & coping techniques",
  },
  {
    id: "focus",
    label: "Focus & Productivity",
    icon: Target,
    category: "Performance",
    desc: "Goal tracking, motivation & flow state support",
  },
  {
    id: "conversation",
    label: "Speech & Conversation Practice",
    icon: MessageCircle,
    category: "Communication",
    desc: "Real-time voice feedback & social practice",
  },
  {
    id: "emotion_tracking",
    label: "Emotion & Mood Analysis",
    icon: Activity,
    category: "Self-Awareness",
    desc: "Facial & vocal emotion insights",
  },
  {
    id: "journaling",
    label: "Daily Reflection & Journaling",
    icon: BookOpen,
    category: "Self-Awareness",
    desc: "Thoughtful prompts & mood history",
  },
  {
    id: "sleep",
    label: "Sleep & Deep Relaxation",
    icon: Moon,
    category: "Mental Wellness",
    desc: "Bedtime wind-downs & calming audio",
  },
  {
    id: "growth",
    label: "Confidence & Habit Building",
    icon: Rocket,
    category: "Performance",
    desc: "Positive reinforcement & routine building",
  },
  {
    id: "creativity",
    label: "Creative Thinking",
    icon: Lightbulb,
    category: "Performance",
    desc: "Brainstorming buddy & open dialogue",
  },
];

const COMMUNICATION_STYLES = [
  {
    id: "empathetic",
    label: "Warm & Empathetic",
    desc: "Supportive, encouraging & compassionate tone",
  },
  {
    id: "analytical",
    label: "Direct & Analytical",
    desc: "Structured, clear & solution-focused advice",
  },
  {
    id: "reflective",
    label: "Calm & Reflective",
    desc: "Gentle questioning & thoughtful pacing",
  },
];

interface OnboardingProps {
  userName?: string;
  isUpdateMode?: boolean;
  onComplete: (data: {
    interests: string[];
    goals: string[];
    communicationStyle: string;
  }) => void;
}

export function OnboardingInterestsScreen({ userName = "User", isUpdateMode = false, onComplete }: OnboardingProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("aura_user_interests");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Map labels back to IDs if necessary
          const matchedIds = INTEREST_TOPICS.filter((t) =>
            parsed.some((p: string) => p.toLowerCase().includes(t.id.replace("_", " ")) || t.label.toLowerCase().includes(p.toLowerCase()))
          ).map((t) => t.id);
          if (matchedIds.length > 0) return matchedIds;
        }
      }
    } catch (e) {}
    return ["mindfulness", "stress_relief", "emotion_tracking"];
  });

  const [selectedStyle, setSelectedStyle] = useState(() => {
    return localStorage.getItem("aura_user_style") || "empathetic";
  });

  const toggleInterest = (id: string) => {
    if (selectedInterests.includes(id)) {
      if (selectedInterests.length > 1) {
        setSelectedInterests(selectedInterests.filter((i) => i !== id));
      }
    } else {
      setSelectedInterests([...selectedInterests, id]);
    }
  };

  const handleFinish = () => {
    const interestLabels = INTEREST_TOPICS.filter((t) =>
      selectedInterests.includes(t.id)
    ).map((t) => t.label);

    onComplete({
      interests: interestLabels,
      goals: interestLabels,
      communicationStyle: selectedStyle,
    });
  };

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none py-6 px-3 sm:px-6 pb-32">
      <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-3 clay-pill" style={{ color: "#7B59DC", fontWeight: 700, fontSize: 12 }}>
          <Sparkles size={14} className="text-[#9A80E5]" />
          {isUpdateMode ? "MANAGE INTERESTS & FOCUS AREAS" : "PERSONALIZING YOUR EXPERIENCE"}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
          {isUpdateMode
            ? `Your Focus Areas & Preferences, ${userName}`
            : `What would you like to focus on, ${userName}?`}
        </h1>
        <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm max-w-lg mx-auto mt-2 font-medium">
          {isUpdateMode
            ? "Update your primary interests anytime so Aura AI adapts its conversation tone, recommendations, and audio sessions."
            : "Select your primary interests so Aura AI can customize conversations, suggestions, and emotional feedback for you."}
        </p>
      </motion.div>

      {/* Grid of Interests */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {INTEREST_TOPICS.map((item, idx) => {
          const Icon = item.icon;
          const isSelected = selectedInterests.includes(item.id);

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              onClick={() => toggleInterest(item.id)}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`p-4 cursor-pointer transition-all ${
                isSelected
                  ? "clay-active-nav"
                  : "clay-card"
              }`}
              style={{ borderRadius: 24 }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/60 dark:bg-white/10 shadow-sm"
                  style={{ color: isSelected ? "#7B59DC" : "#4B4B60" }}
                >
                  <Icon size={18} />
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-[#7B59DC] text-white"
                      : "clay-track-inset text-transparent"
                  }`}
                >
                  {isSelected && <Check size={12} strokeWidth={3} />}
                </div>
              </div>
              <h3 className={`font-extrabold text-xs mb-1 ${isSelected ? "text-white" : "text-[#2D2D42] dark:text-[#FFFFFF]"}`}>{item.label}</h3>
              <p className={`text-[11px] leading-relaxed font-medium ${isSelected ? "text-white/80" : "text-[#7A7A96] dark:text-[#9E98B4]"}`}>{item.desc}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Communication Style Preference */}
      <div className="clay-card p-6 mb-8 rounded-[32px]">
        <div className="flex items-center gap-2 mb-4">
          <Sliders size={16} className="text-[#7B59DC]" />
          <h2 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-sm">
            Preferred AI Communication Style
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {COMMUNICATION_STYLES.map((st) => {
            const active = selectedStyle === st.id;
            return (
              <div
                key={st.id}
                onClick={() => setSelectedStyle(st.id)}
                className={`p-3.5 rounded-2xl cursor-pointer transition-all text-left ${
                  active
                    ? "clay-active-nav"
                    : "clay-card-flat"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-bold text-xs ${active ? "text-white" : "text-[#2D2D42] dark:text-[#FFFFFF]"}`}>{st.label}</span>
                  {active && <span className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <p className={`text-[11px] leading-snug font-medium ${active ? "text-white/80" : "text-[#7A7A96] dark:text-[#9E98B4]"}`}>{st.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-[#7A7A96] dark:text-[#9E98B4] font-semibold">
          Selected <span className="font-bold text-[#7B59DC] dark:text-[#B794F6]">{selectedInterests.length}</span> focus area{selectedInterests.length > 1 ? "s" : ""}
        </div>

        <motion.button
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleFinish}
          className="clay-button w-full sm:w-auto px-8 py-3 rounded-full font-bold text-xs text-[#7B59DC] cursor-pointer flex items-center justify-center gap-2 border-none outline-none"
        >
          <span>{isUpdateMode ? "Save Changes & Return to Dashboard" : "Complete Setup & Enter Dashboard"}</span>
          <ArrowRight size={16} />
        </motion.button>
      </div>
      </div>
    </div>
  );
}

