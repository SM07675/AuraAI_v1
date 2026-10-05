import React, { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Star, ThumbsUp, Check, Tag } from "lucide-react";
import { BreathingCard } from "./cards/BreathingCard";
import { ActionPlanCard } from "./cards/ActionPlanCard";
import { CBTReframeCard } from "./cards/CBTReframeCard";
import { PomodoroCard } from "./cards/PomodoroCard";
import { GroundingCard } from "./cards/GroundingCard";
import { JournalingCard } from "./cards/JournalingCard";
import { apiClient } from "../services/apiClient";

export interface SolutionCardData {
  id: string;
  type: string;
  title: string;
  description: string;
  domain?: string;
  personalization_note?: string;
  steps?: string[];
  thought_trigger?: string;
  reframed_perspective?: string;
  duration_minutes?: number;
  tags?: string[];
}

interface SolutionCardProps {
  solution: SolutionCardData;
  sessionId?: number | null;
}

export const SolutionCard: React.FC<SolutionCardProps> = ({ solution, sessionId }) => {
  const [rating, setRating] = useState<number | null>(null);
  const [submittedFeedback, setSubmittedFeedback] = useState(false);

  const handleRate = async (star: number) => {
    setRating(star);
    setSubmittedFeedback(true);
    try {
      await apiClient.post("/api/v1/feedback/solution", {
        solution_id: solution.id,
        solution_type: solution.type,
        domain: solution.domain || "wellness",
        rating: star,
        helpful: star >= 3,
        session_id: sessionId,
      });
    } catch {
      // Graceful fallback
    }
  };

  const renderIntervention = () => {
    switch (solution.type) {
      case "breathing_exercise":
        return <BreathingCard {...solution} />;
      case "cbt_reframe":
        return <CBTReframeCard {...solution} />;
      case "pomodoro_timer":
        return <PomodoroCard {...solution} />;
      case "grounding_5_4_3_2_1":
        return <GroundingCard {...solution} />;
      case "journaling_prompt":
        return <JournalingCard {...solution} />;
      case "action_plan":
      default:
        return <ActionPlanCard {...solution} />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="my-3 rounded-2xl bg-gradient-to-br from-white/95 via-purple-50/60 to-white/90 dark:from-[#211835]/95 dark:via-[#1A122C]/90 dark:to-[#261A3E]/90 border border-purple-300/60 dark:border-purple-600/40 shadow-xl overflow-hidden backdrop-blur-md"
    >
      {/* Header bar with Domain & Companion Badge */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-purple-600/15 via-teal-500/10 to-transparent dark:from-purple-500/25 dark:via-teal-400/15 border-b border-purple-200/50 dark:border-purple-800/30 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-purple-600 text-white flex items-center justify-center">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-black text-[#2E2544] dark:text-white tracking-tight">
            {solution.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {solution.domain && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-300/30">
              {solution.domain}
            </span>
          )}
        </div>
      </div>

      {/* Description & Personalization Note */}
      <div className="px-3.5 pt-2.5 pb-1">
        <p className="text-xs font-medium text-[#4A4458] dark:text-[#C7B5F3] leading-snug">
          {solution.description}
        </p>
        {solution.personalization_note && (
          <div className="mt-1.5 text-[10.5px] font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5 bg-teal-500/10 dark:bg-teal-400/10 px-2 py-1 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
            <span>{solution.personalization_note}</span>
          </div>
        )}
      </div>

      {/* Interactive Intervention Body */}
      <div className="px-1">{renderIntervention()}</div>

      {/* Footer Feedback Rating */}
      <div className="px-3.5 py-2 bg-purple-500/5 dark:bg-white/5 border-t border-purple-200/40 dark:border-white/5 flex items-center justify-between text-[10.5px]">
        <span className="text-[#7A748A] dark:text-[#8E88A4] font-medium">
          {submittedFeedback ? "Thanks for your feedback!" : "Was this intervention helpful?"}
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleRate(star)}
              className={`p-1 rounded transition-all ${
                rating !== null && rating >= star
                  ? "text-amber-400 scale-110"
                  : "text-[#B3A9C8] dark:text-[#5E5478] hover:text-amber-400"
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
