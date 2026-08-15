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

export function OnboardingInterestsScreen({ userName = "Hardik", onComplete }: OnboardingProps) {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "mindfulness",
    "stress_relief",
    "emotion_tracking",
  ]);
  const [selectedStyle, setSelectedStyle] = useState("empathetic");

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
    <div className="max-w-4xl mx-auto py-6 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1 mb-3 liquid-glass" style={{ color: "#0284C7", fontWeight: 700, fontSize: 13 }}>
          <Sparkles size={14} className="text-sky-500" />
          PERSONALIZING YOUR EXPERIENCE
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 tracking-tight">
          What would you like to focus on, <span className="bg-gradient-to-r from-sky-600 via-sky-500 to-sky-400 bg-clip-text text-transparent">{userName}</span>?
        </h1>
        <p className="text-slate-600 text-sm sm:text-base max-w-lg mx-auto mt-2">
          Select your primary interests so Aura AI can customize conversations, suggestions, and emotional feedback for you.
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
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                isSelected
                  ? "bg-white/90 border-sky-400 shadow-lg ring-2 ring-sky-300/60"
                  : "bg-white/50 border-white/60 hover:bg-white/70 shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-gradient-to-br from-sky-500 to-sky-400 text-white shadow-md"
                      : "bg-sky-100/70 text-sky-600"
                  }`}
                >
                  <Icon size={20} />
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                    isSelected
                      ? "bg-sky-500 border-sky-500 text-white"
                      : "border-slate-300 bg-white/60"
                  }`}
                >
                  {isSelected && <Check size={14} strokeWidth={3} />}
                </div>
              </div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">{item.label}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Communication Style Preference */}
      <GlassCard style={{ padding: "24px", borderRadius: "24px", marginBottom: "32px" }}>
        <div className="flex items-center gap-2 mb-4">
          <Sliders size={18} className="text-sky-600" />
          <h2 className="font-bold text-slate-800 text-base">
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
                className={`p-3.5 rounded-xl cursor-pointer transition-all border text-left ${
                  active
                    ? "bg-sky-500/10 border-sky-500 shadow-sm"
                    : "bg-white/40 border-slate-200 hover:bg-white/60"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-slate-800">{st.label}</span>
                  {active && <span className="w-2 h-2 rounded-full bg-sky-500" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{st.desc}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Footer Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-slate-500 font-medium">
          Selected <span className="font-bold text-sky-600">{selectedInterests.length}</span> focus area{selectedInterests.length > 1 ? "s" : ""}
        </div>

        <motion.button
          whileHover={{ scale: 1.04, boxShadow: "0 12px 30px rgba(2, 132, 199, 0.4)" }}
          whileTap={{ scale: 0.96 }}
          onClick={handleFinish}
          className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white shadow-xl cursor-pointer flex items-center justify-center gap-2 transition-all"
          style={{ background: "linear-gradient(135deg, #0284C7, #38BDF8)" }}
        >
          <span>Complete Setup & Enter Dashboard</span>
          <ArrowRight size={18} />
        </motion.button>
      </div>
    </div>
  );
}
