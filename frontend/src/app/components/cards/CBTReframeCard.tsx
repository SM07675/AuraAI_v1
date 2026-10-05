import React from "react";
import { Sparkles, Brain, ArrowRight, ShieldCheck } from "lucide-react";

interface CBTReframeCardProps {
  title: string;
  thought_trigger?: string;
  reframed_perspective?: string;
  steps?: string[];
}

export const CBTReframeCard: React.FC<CBTReframeCardProps> = ({
  title,
  thought_trigger,
  reframed_perspective,
  steps,
}) => {
  return (
    <div className="p-3 text-left space-y-3">
      {/* Split Comparison View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Automatic Thought */}
        <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
          <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-extrabold text-[10.5px] uppercase tracking-wider mb-1">
            <Brain className="w-3.5 h-3.5" />
            <span>Automatic Thought</span>
          </div>
          <p className="text-xs font-medium text-rose-950 dark:text-rose-100 italic leading-snug">
            "{thought_trigger || "I should have this completely figured out by now, and I am falling behind."}"
          </p>
        </div>

        {/* Compassionate Reframe */}
        <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-extrabold text-[10.5px] uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Compassionate Reframe</span>
          </div>
          <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100 leading-snug">
            "{reframed_perspective || "Progress is non-linear. Facing this challenge right now is proof that I am actively learning and moving forward."}"
          </p>
        </div>
      </div>

      {/* Integration Tips */}
      {steps && steps.length > 0 && (
        <div className="space-y-1 pt-1">
          <span className="text-[10px] font-extrabold text-[#7A748A] dark:text-[#9A90B2] uppercase tracking-wider">
            How to Apply This Reframe
          </span>
          {steps.map((st, idx) => (
            <div key={idx} className="text-[11px] text-[#4A4458] dark:text-[#C7B5F3] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
              <span>{st}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
