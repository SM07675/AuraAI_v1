import React from "react";
import { Sparkles } from "lucide-react";

export { DashboardScreen as HomeScreen } from "./DashboardScreen";
export { ChatScreen } from "./ChatScreen";
export { EmotionScreen } from "./EmotionScreen";
export { AnalyticsScreen } from "./AnalyticsScreen";

/* ─────────────────────────── PLACEHOLDER SCREEN ─────────────────────────── */
export function PlaceholderScreen({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-[620px] mx-auto text-center pt-16 px-4 select-none">
      <div className="w-16 h-16 rounded-2xl liquid-button text-violet-400 mx-auto flex items-center justify-center mb-4">
        <Sparkles size={28} />
      </div>
      <h2 className="text-[26px] font-extrabold text-slate-900 dark:text-white m-0 tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 m-0 max-w-sm mx-auto">
        {desc}
      </p>
      <div className="liquid-card p-6 mt-6">
        <p className="text-xs text-slate-400 m-0">
          This space is being prepared. Aura is synthesizing your {title.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
