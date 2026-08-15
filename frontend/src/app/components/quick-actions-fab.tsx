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
      className="fixed bottom-8 left-8 flex flex-row items-center gap-3.5"
      style={{ zIndex: 99999, pointerEvents: "auto" }}
    >
      {/* Circular Plus (+) Floating Action Button */}
      <motion.button
        onClick={() => setActionsOpen(!actionsOpen)}
        whileHover={{ scale: 1.08, boxShadow: "0 16px 40px rgba(2,132,199,0.55)" }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 450, damping: 18 }}
        className="liquid-icon-orb flex items-center justify-center rounded-full cursor-pointer relative shadow-xl shrink-0"
        style={{
          width: 56,
          height: 56,
          background: "linear-gradient(135deg,#0284C7 0%,#38BDF8 100%)",
          color: "#fff",
          boxShadow: "0 12px 32px rgba(2,132,199,0.45), inset 0 2px 3px rgba(255,255,255,0.8)",
          border: "1.5px solid rgba(255, 255, 255, 0.75)",
        }}
        aria-label="Quick Actions"
        title="Quick Actions"
      >
        <motion.div
          animate={{ rotate: actionsOpen ? 135 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <Plus size={26} color="#fff" strokeWidth={2.5} />
        </motion.div>
      </motion.button>

      {/* Horizontal row of transparent liquid glass buttons opening left to right */}
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
                  whileHover={{ scale: 1.06, y: -2 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 480, damping: 24, delay: i * 0.035 }}
                  onClick={() => {
                    setActionsOpen(false);
                    if (a.action === "music") {
                      window.dispatchEvent(new CustomEvent("aura-toggle-music", { detail: { play: true } }));
                    } else if (onNavigate) {
                      onNavigate(a.screen);
                    }
                  }}
                  className="liquid-glass-btn flex items-center gap-2.5 rounded-full px-3.5 py-2 cursor-pointer shadow-lg backdrop-blur-xl border border-white/85 group whitespace-nowrap shrink-0"
                  style={{
                    background: "rgba(255, 255, 255, 0.75)",
                    backdropFilter: "blur(20px) saturate(190%)",
                    willChange: "transform, opacity",
                  }}
                >
                  <div
                    className="liquid-icon-orb grid place-items-center rounded-full shrink-0 shadow-xs"
                    style={{
                      width: 28,
                      height: 28,
                      background: a.action === "music" ? "linear-gradient(135deg, #7A5AF8, #00D4FF)" : "linear-gradient(135deg, #0284C7, #38BDF8)",
                    }}
                  >
                    <Icon size={14} color="#fff" />
                  </div>
                  <span className="font-bold text-[#1e2740] text-[13px] group-hover:text-sky-700 transition-colors pr-1">
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

