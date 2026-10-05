import React, { useState } from "react";
import { CheckSquare, Square, Target, CheckCircle2 } from "lucide-react";
import { apiClient } from "../../services/apiClient";

interface ActionPlanCardProps {
  title: string;
  description: string;
  steps?: string[];
  domain?: string;
}

export const ActionPlanCard: React.FC<ActionPlanCardProps> = ({
  title,
  description,
  steps = [],
  domain = "wellness",
}) => {
  const [completed, setCompleted] = useState<Record<number, boolean>>({});
  const [savedToGoal, setSavedToGoal] = useState(false);

  const toggleStep = (idx: number) => {
    setCompleted((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const completedCount = Object.values(completed).filter(Boolean).length;
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  const handleSaveGoal = async () => {
    try {
      await apiClient.put("/api/v1/users/me/goals", {
        goals: [title],
      });
      setSavedToGoal(true);
    } catch {
      setSavedToGoal(true);
    }
  };

  return (
    <div className="p-3 text-left space-y-3">
      {/* Progress Bar */}
      <div>
        <div className="flex items-center justify-between text-[10.5px] font-bold text-[#6B637B] dark:text-[#A89EC4] mb-1">
          <span>Action Progress</span>
          <span className="text-purple-600 dark:text-purple-300 font-mono font-extrabold">{progressPct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-purple-100 dark:bg-purple-950/60 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-teal-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Interactive Checkable Steps */}
      <div className="space-y-1.5">
        {steps.map((st, idx) => {
          const isDone = Boolean(completed[idx]);
          return (
            <div
              key={idx}
              onClick={() => toggleStep(idx)}
              className={`p-2 rounded-xl flex items-start gap-2.5 cursor-pointer transition-all ${
                isDone
                  ? "bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300/40 dark:border-emerald-700/40 text-emerald-900 dark:text-emerald-200 line-through opacity-75"
                  : "bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10 text-[#3B334C] dark:text-[#E2D9F3]"
              }`}
            >
              <div className="mt-0.5 shrink-0 text-purple-600 dark:text-purple-300">
                {isDone ? (
                  <CheckSquare className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Square className="w-4 h-4 opacity-70" />
                )}
              </div>
              <span className="text-xs font-semibold leading-snug select-none">{st}</span>
            </div>
          );
        })}
      </div>

      {/* Action footer */}
      <div className="pt-1 flex items-center justify-between">
        <span className="text-[10px] text-[#7A748A] dark:text-[#8E88A4] font-medium">
          {completedCount} of {steps.length} milestones complete
        </span>
        <button
          onClick={handleSaveGoal}
          disabled={savedToGoal}
          className="text-[10.5px] font-bold px-2.5 py-1 rounded-lg bg-purple-500/10 dark:bg-purple-400/20 text-purple-700 dark:text-purple-200 hover:bg-purple-500/20 transition-all flex items-center gap-1.5 disabled:opacity-60"
        >
          {savedToGoal ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Target className="w-3 h-3" />}
          <span>{savedToGoal ? "Saved to Goals" : "Save as Target"}</span>
        </button>
      </div>
    </div>
  );
};
