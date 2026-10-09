import React, { useState } from "react";
import { Moon, Bed, Check, Sparkles, Clock, CheckCircle2 } from "lucide-react";

interface SleepHygieneCardProps {
  title: string;
  description: string;
  steps?: string[];
  duration_minutes?: number;
}

export const SleepHygieneCard: React.FC<SleepHygieneCardProps> = ({
  title,
  description,
  steps = [],
  duration_minutes = 15,
}) => {
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const defaultSteps = [
    "Dim harsh overhead lights and shift screens to warm night mode",
    "Jot down 3 racing thoughts on paper to clear cognitive load",
    "Take 10 slow, deep diaphragmatic breaths through the nose",
    "Ensure your sleeping space is cool, quiet, and pitch dark",
  ];

  const activeSteps = steps.length > 0 ? steps : defaultSteps;
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / activeSteps.length) * 100);

  return (
    <div className="p-3 text-left space-y-3">
      {/* Protocol Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 border border-indigo-400/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Moon className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200">
              Wind-Down Sequence
            </div>
            <div className="text-[9.5px] font-medium text-indigo-600 dark:text-indigo-300 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span>Recommended: {duration_minutes} mins before bed</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
            {progressPercent}% Complete
          </span>
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-1.5">
        {activeSteps.map((st, idx) => {
          const isDone = !!completedSteps[idx];
          return (
            <div
              key={idx}
              onClick={() => toggleStep(idx)}
              className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                isDone
                  ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300/40 opacity-90"
                  : "bg-white/60 dark:bg-white/5 border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                  isDone
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "border-2 border-indigo-300 dark:border-indigo-700 text-transparent hover:border-indigo-500"
                }`}
              >
                <Check className="w-3 h-3" />
              </div>
              <span
                className={`text-xs font-semibold leading-tight flex-1 ${
                  isDone
                    ? "line-through text-slate-400 dark:text-slate-500"
                    : "text-[#2E2544] dark:text-white"
                }`}
              >
                {st}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
