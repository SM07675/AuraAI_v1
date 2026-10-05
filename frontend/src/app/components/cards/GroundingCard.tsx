import React, { useState } from "react";
import { Eye, Hand, Volume2, Sparkles, Heart } from "lucide-react";

interface GroundingCardProps {
  title: string;
  description: string;
  steps?: string[];
}

export const GroundingCard: React.FC<GroundingCardProps> = ({
  title,
  description,
  steps = [],
}) => {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  const sensoryIcons = [Eye, Hand, Volume2, Sparkles, Heart];

  return (
    <div className="p-3 text-left space-y-3">
      <div className="space-y-2">
        {steps.map((st, idx) => {
          const IconComponent = sensoryIcons[idx % sensoryIcons.length];
          const isCurrent = idx === currentStepIdx;
          const isPast = idx < currentStepIdx;

          return (
            <div
              key={idx}
              onClick={() => setCurrentStepIdx(idx)}
              className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                isCurrent
                  ? "bg-purple-50 dark:bg-purple-950/40 border-purple-400 dark:border-purple-600 shadow-sm"
                  : isPast
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300/30 opacity-80"
                  : "bg-white/40 dark:bg-white/5 border-white/40 dark:border-white/10 opacity-70"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                  isCurrent
                    ? "bg-purple-600 text-white shadow-md"
                    : isPast
                    ? "bg-emerald-500 text-white"
                    : "bg-white dark:bg-white/10 text-purple-700 dark:text-purple-300"
                }`}
              >
                <IconComponent className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-[#2E2544] dark:text-white leading-tight block">
                  {st}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
