import React, { useState } from "react";
import { motion } from "motion/react";
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
  Check,
  ArrowRight,
  ChevronLeft,
} from "lucide-react";
import { AuraBrandLogo } from "./AuraBrandLogo";

interface OnboardingProps {
  userName?: string;
  isUpdateMode?: boolean;
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
    desc: "Guided calm pauses, box breathing & centering",
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
    label: "Focus & Daily Rhythm",
    icon: Target,
    category: "Performance",
    desc: "Goal intention, flow state and routine clarity",
  },
  {
    id: "conversation",
    label: "Voice & Speech Dialogue",
    icon: MessageCircle,
    category: "Communication",
    desc: "Freeform voice reflection and deep social practice",
  },
  {
    id: "emotion_tracking",
    label: "Emotion & Mood Insights",
    icon: Activity,
    category: "Self-Awareness",
    desc: "Acoustic and facial affective self-discovery",
  },
  {
    id: "journaling",
    label: "Daily Reflection",
    icon: BookOpen,
    category: "Self-Awareness",
    desc: "Evening decompression and thought journaling",
  },
  {
    id: "sleep",
    label: "Sleep & Wind-Down",
    icon: Moon,
    category: "Mental Wellness",
    desc: "Gentle nocturnal wind-downs and soothing pacing",
  },
  {
    id: "growth",
    label: "Habit & Growth Intentions",
    icon: Rocket,
    category: "Performance",
    desc: "Consistent self-confidence and momentum building",
  },
];

const COMMUNICATION_STYLES = [
  {
    id: "empathetic",
    label: "Warm & Empathetic",
    desc: "Compassionate, gentle, patient, validating tone",
  },
  {
    id: "direct",
    label: "Direct & Analytical",
    desc: "Actionable insights, clear perspective, concise clarity",
  },
  {
    id: "reflective",
    label: "Calm & Reflective",
    desc: "Thought-provoking questions, mindful grounding, space to think",
  },
];

export function OnboardingInterestsScreen({
  userName = "Friend",
  isUpdateMode = false,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("aura_user_interests");
      return saved ? JSON.parse(saved) : ["mindfulness", "stress_relief"];
    } catch {
      return ["mindfulness", "stress_relief"];
    }
  });

  const [selectedStyle, setSelectedStyle] = useState<string>(() => {
    try {
      return localStorage.getItem("aura_user_style") || "empathetic";
    } catch {
      return "empathetic";
    }
  });

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else {
      const goals = selectedInterests.map((id) => {
        const topic = INTEREST_TOPICS.find((t) => t.id === id);
        return topic ? topic.label : id;
      });

      onComplete({
        interests: selectedInterests,
        goals,
        communicationStyle: selectedStyle,
      });
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-84px)] flex flex-col items-center justify-center px-4 py-8 select-none">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* ── Progress & Header ── */}
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <AuraBrandLogo size={42} showWordmark={false} />
          </div>

          {/* Simple Step Progress Bar */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === 1 ? "w-10 bg-violet-500" : "w-6 bg-violet-500/40"
              }`}
            />
            <span
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === 2 ? "w-10 bg-violet-500" : "w-6 bg-slate-600/40"
              }`}
            />
          </div>

          <h1 className="text-[26px] font-extrabold text-slate-900 dark:text-white m-0 tracking-tight">
            {step === 1
              ? `Personalize your companion, ${userName}`
              : "How would you like Aura to speak with you?"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 m-0 max-w-md mx-auto">
            {step === 1
              ? "Select the wellbeing areas you would like to focus on during your reflections."
              : "Choose a conversational style that feels most comforting and supportive for you."}
          </p>
        </div>

        {/* ── Step 1: Tactile Liquid Glass Interest Cards ── */}
        {step === 1 && (
          <div className="grid sm:grid-cols-2 gap-3.5">
            {INTEREST_TOPICS.map((topic) => {
              const Icon = topic.icon;
              const isSelected = selectedInterests.includes(topic.id);

              return (
                <motion.button
                  key={topic.id}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleInterest(topic.id)}
                  className={`liquid-card p-4.5 text-left flex items-start justify-between cursor-pointer border transition-all ${
                    isSelected
                      ? "border-violet-500 bg-violet-500/15 shadow-[0_0_20px_rgba(139,92,246,0.2)]"
                      : "border-transparent opacity-80 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-violet-500 text-white"
                          : "liquid-button text-slate-400"
                      }`}
                    >
                      <Icon size={19} />
                    </div>
                    <div>
                      <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-white m-0">
                        {topic.label}
                      </h3>
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 m-0 leading-relaxed">
                        {topic.desc}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ml-2 ${
                      isSelected
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "border-slate-500/40 text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* ── Step 2: Communication Style Options ── */}
        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            {COMMUNICATION_STYLES.map((style) => {
              const isSelected = selectedStyle === style.id;
              return (
                <motion.button
                  key={style.id}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`liquid-card p-5 text-left flex items-center justify-between cursor-pointer border transition-all ${
                    isSelected
                      ? "border-violet-500 bg-violet-500/15 shadow-[0_0_24px_rgba(139,92,246,0.25)]"
                      : "border-transparent opacity-80 hover:opacity-100"
                  }`}
                >
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-900 dark:text-white m-0">
                      {style.label}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 m-0">
                      {style.desc}
                    </p>
                  </div>

                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "border-slate-500/40 text-transparent"
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* ── Bottom Controls ── */}
        <div className="flex items-center justify-between pt-2">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="liquid-button px-4 py-2 text-xs text-slate-400 hover:text-white gap-1.5"
            >
              <ChevronLeft size={15} />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleNext}
            disabled={step === 1 && selectedInterests.length === 0}
            className="liquid-button-primary px-7 py-3 text-xs font-semibold gap-2 disabled:opacity-50"
          >
            <span>{step === 1 ? "Continue" : isUpdateMode ? "Save Preferences" : "Enter Aura Space"}</span>
            <ArrowRight size={15} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
