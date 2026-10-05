import React, { useState } from "react";
import { BookOpen, Check, Save } from "lucide-react";

interface JournalingCardProps {
  title: string;
  description: string;
  steps?: string[];
  thought_trigger?: string;
}

export const JournalingCard: React.FC<JournalingCardProps> = ({
  title,
  description,
  steps,
  thought_trigger,
}) => {
  const [entry, setEntry] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!entry.trim()) return;
    setSaved(true);
  };

  return (
    <div className="p-3 text-left space-y-2.5">
      <div className="p-2.5 rounded-xl bg-purple-500/10 dark:bg-purple-950/30 border border-purple-300/30">
        <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-extrabold text-[10.5px] uppercase tracking-wider mb-1">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Guided Reflection Prompt</span>
        </div>
        <p className="text-xs font-semibold text-[#2E2544] dark:text-[#E2D9F3] leading-snug">
          {thought_trigger || "What is one small thing within your control today that would bring you relief or clarity?"}
        </p>
      </div>

      <div className="space-y-1.5">
        <textarea
          rows={3}
          value={entry}
          onChange={(e) => {
            setEntry(e.target.value);
            if (saved) setSaved(false);
          }}
          placeholder="Jot down your private reflection here..."
          className="w-full p-2.5 rounded-xl text-xs bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-[#2E2544] dark:text-white placeholder-[#8E88A4] focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={!entry.trim() || saved}
            className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10.5px] flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
          >
            {saved ? <Check className="w-3 h-3 text-emerald-300" /> : <Save className="w-3 h-3" />}
            <span>{saved ? "Reflection Saved" : "Save Note"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
