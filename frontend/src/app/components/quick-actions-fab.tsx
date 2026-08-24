import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Activity, History as HistoryIcon, FileText, Wind, Heart, Plus, ChevronRight, Music } from "lucide-react";

const QUICK_ACTIONS = [
  { label: "Play Music", icon: Music, action: "music", screen: "Music" },
  { label: "Talk", icon: Mic, action: "navigate", screen: "Face-to-Face" },
  { label: "Analyze Emotion", icon: Activity, action: "navigate", screen: "Emotion" },
  { label: "History", icon: HistoryIcon, action: "navigate", screen: "Chat" },
  { label: "Reports", icon: FileText, action: "navigate", screen: "Analytics" },
  { label: "Breathing", icon: Wind, action: "navigate", screen: "Voice Mode" },
  { label: "Meditation", icon: Heart, action: "navigate", screen: "Memory" },
];

export function QuickActionsFAB({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed bottom-8 left-8 flex flex-row items-center gap-3.5 select-none"
      style={{ zIndex: 99999, pointerEvents: "auto" }}
    >
      {/* Circular Plus (+) Floating Action Button */}
      <motion.button
        onClick={() => setActionsOpen(!actionsOpen)}
        whileHover={{ scale: 1.08, y: -2 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 450, damping: 18 }}
        className="clay-button flex items-center justify-center rounded-full cursor-pointer relative shrink-0 border-none outline-none"
        style={{
          width: 52,
          height: 52,
          background: "linear-gradient(135deg, #9A80E5, #7B59DC)",
          color: "#fff",
        }}
        aria-label="Quick Actions"
        title="Quick Actions"
      >
        <motion.div
          animate={{ rotate: actionsOpen ? 135 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <Plus size={24} color="#fff" strokeWidth={2.5} />
        </motion.div>
      </motion.button>

      {/* Horizontal row of clay buttons opening left to right */}
      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="flex flex-row items-center gap-2.5 overflow-x-auto no-scrollbar py-2 max-w-[calc(100vw-120px)]"
          >
            {QUICK_ACTIONS.map((a, i) => {
              const Icon = a.icon;
              return (
                <motion.button
                  key={a.label}
                  initial={{ opacity: 0, x: -30, scale: 0.75 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.8 }}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 480, damping: 24, delay: i * 0.035 }}
                  onClick={() => {
                    setActionsOpen(false);
                    if (a.action === "music") {
                      window.dispatchEvent(new CustomEvent("aura-toggle-music", { detail: { play: true } }));
                    } else if (onNavigate) {
                      onNavigate(a.screen);
                    }
                  }}
                  className="clay-button flex items-center gap-2.5 rounded-full px-3.5 py-2 cursor-pointer group whitespace-nowrap shrink-0 border-none outline-none"
                >
                  <div
                    className="grid place-items-center rounded-full shrink-0 shadow-sm"
                    style={{
                      width: 26,
                      height: 26,
                      background: a.action === "music" ? "#E2D5FC" : "#D0F6EC",
                      color: a.action === "music" ? "#7B59DC" : "#0D9488",
                    }}
                  >
                    <Icon size={14} />
                  </div>
                  <span className="font-bold text-[#2D2D42] text-xs group-hover:text-[#7B59DC] transition-colors pr-1">
                    {a.label}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}

