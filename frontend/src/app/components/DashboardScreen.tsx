import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  MessageSquare,
  Mic,
  Video,
  Brain,
  ArrowUpRight,
  Sparkles,
  Heart,
  Target,
  Activity,
  Smile,
} from "lucide-react";
import { AuraOrb } from "./AuraOrb";
import { authService } from "../services/authService";

interface DashboardScreenProps {
  onStart: (screen?: string, query?: string) => void;
  onLogout?: () => void;
  onNavigateToAuth?: () => void;
}

const PRIMARY_ACTIONS = [
  {
    label: "Chat",
    subtitle: "Write what is on your mind",
    screen: "Chat",
    icon: MessageSquare,
    color: "#8B5CF6",
    glow: "rgba(139, 92, 246, 0.35)",
  },
  {
    label: "Voice",
    subtitle: "A hands-free conversation",
    screen: "Voice Mode",
    icon: Mic,
    color: "#38BDF8",
    glow: "rgba(56, 189, 248, 0.35)",
  },
  {
    label: "Face-to-Face",
    subtitle: "See & talk with Holographic Aura",
    screen: "Face-to-Face",
    icon: Video,
    color: "#EC4899",
    glow: "rgba(236, 72, 153, 0.35)",
    badge: "Hero Experience",
  },
  {
    label: "Memory",
    subtitle: "Review what Aura remembers",
    screen: "Memory",
    icon: Brain,
    color: "#10B981",
    glow: "rgba(16, 185, 129, 0.35)",
  },
];

const MOOD_CHECKINS = [
  { label: "Calm & Centered", emoji: "😌", query: "I'm feeling calm and centered today." },
  { label: "A Little Unsettled", emoji: "😮‍💨", query: "I'm feeling a little unsettled and overwhelmed right now." },
  { label: "Need to Talk", emoji: "💭", query: "I have a lot on my mind and really need to talk." },
  { label: "Reflective", emoji: "✨", query: "I'm in a reflective mood, looking to pause and think." },
];

export function DashboardScreen({ onStart }: DashboardScreenProps) {
  let firstName = "there";
  try {
    const raw = localStorage.getItem("aura_user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u.name) firstName = u.name.split(" ")[0];
    }
  } catch {}

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Real backend context
  const [recentMemories, setRecentMemories] = useState<any[]>([]);
  const [activeGoals, setActiveGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      authService.authFetch("/api/v1/memory?limit=3").then((r) => (r.ok ? r.json() : null)),
      authService.authFetch("/api/v1/users/me").then((r) => (r.ok ? r.json() : null)),
    ]).then(([memRes, userRes]) => {
      if (cancelled) return;

      if (memRes.status === "fulfilled" && memRes.value?.memories) {
        setRecentMemories(memRes.value.memories.slice(0, 3));
      }
      if (userRes.status === "fulfilled" && userRes.value?.goals) {
        setActiveGoals(userRes.value.goals);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar px-3 sm:px-6 lg:px-8 py-3 sm:py-6 pb-28 lg:pb-8 select-none">
      <div className="max-w-[1360px] mx-auto flex flex-col gap-6">
        {/* ── Top Hero Section: Large Greeting + Abstract Aura Glow ── */}
        <section className="grid lg:grid-cols-[1.12fr_.88fr] gap-5 items-stretch">
          {/* Left Greeting Card */}
          <div className="liquid-card-large p-7 sm:p-9 flex flex-col justify-between overflow-hidden relative">
            {/* Ambient Background Aura Source */}
            <div className="absolute -left-16 -top-16 w-80 h-80 rounded-full bg-violet-600/15 blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 mb-4">
                <Sparkles size={13} />
                <span>Your sanctuary to pause and reconnect</span>
              </div>

              <h1 className="text-[34px] sm:text-[48px] leading-[1.08] tracking-tight font-extrabold m-0 text-slate-900 dark:text-white">
                {greeting},<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-indigo-400 to-sky-400">
                  {firstName}.
                </span>
              </h1>

              <p className="mt-4 max-w-lg text-[15px] sm:text-[16px] leading-relaxed text-slate-600 dark:text-slate-300 font-normal">
                How are you feeling today? Aura is an AI companion here to listen,
                reflect, and help you navigate whatever is on your mind with gentle awareness.
              </p>
            </div>

            {/* Optional Mood Check-In Pills */}
            <div className="relative z-10 mt-6 pt-5 border-t border-white/10 dark:border-white/5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2.5">
                Quick mood check-in:
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mood check-in">
                {MOOD_CHECKINS.map((item) => (
                  <motion.button
                    key={item.label}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onStart("Chat", item.query)}
                    className="liquid-pill px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:border-violet-400/50 cursor-pointer gap-1.5 border"
                  >
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Hero: Calm Environment with Living Aura Orb */}
          <div className="liquid-card-large p-6 min-h-[360px] relative overflow-hidden flex flex-col items-center justify-center text-center">
            <div className="absolute top-5 left-6 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span>Aura Presence</span>
            </div>

            {/* Living Aura Energy Orb */}
            <div className="my-auto py-2">
              <AuraOrb state="ready" size={260} />
            </div>

            <p className="text-[11.5px] text-slate-500 dark:text-slate-400 max-w-xs m-0">
              Abstract AI presence · Holographic companion materializes inside Face-to-Face
            </p>
          </div>
        </section>

        {/* ── Primary Action Tiles (Liquid Glass) ── */}
        <section>
          <div className="mb-3 px-1 flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-bold text-slate-900 dark:text-white m-0 tracking-tight">
                Step into a Space
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 m-0">
                Choose the medium that best fits your moment
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {PRIMARY_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.label}
                  whileHover={{ y: -3, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onStart(item.screen)}
                  className="liquid-card text-left p-5 min-h-[160px] flex flex-col justify-between cursor-pointer border-none outline-none group hover:border-violet-400/40 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between relative z-10">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{
                        background: `radial-gradient(circle, ${item.glow} 0%, transparent 80%)`,
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: item.color,
                      }}
                    >
                      <Icon size={22} />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.badge && (
                        <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/30">
                          {item.badge}
                        </span>
                      )}
                      <ArrowUpRight
                        size={17}
                        className="text-slate-400 group-hover:text-violet-400 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="relative z-10 mt-5">
                    <h3 className="text-[16px] font-bold text-slate-900 dark:text-white m-0">
                      {item.label}
                    </h3>
                    <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 m-0 leading-snug">
                      {item.subtitle}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* ── Secondary Information Panels ── */}
        <section className="grid md:grid-cols-2 gap-4">
          {/* Recent Activity / Context */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between min-h-[200px]">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity size={17} className="text-violet-400" />
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white m-0">
                    Recent Cognitive Memory
                  </h3>
                </div>
                <button
                  onClick={() => onStart("Memory")}
                  className="text-xs font-semibold text-violet-400 hover:text-violet-300 bg-transparent border-none cursor-pointer"
                >
                  View All →
                </button>
              </div>

              {recentMemories.length > 0 ? (
                <div className="flex flex-col gap-2 mt-3">
                  {recentMemories.map((m: any) => (
                    <div
                      key={m.id}
                      className="liquid-card-subtle p-3 flex items-start justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 capitalize">
                          {String(m.title || m.key || "Saved memory").replaceAll("_", " ")}
                        </span>
                        <span className="block mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Protected memory · Open Memory to review
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 uppercase tracking-wider">
                        {m.type}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2 m-0">
                  No previous sessions logged yet. As you converse with Aura, significant insights,
                  preferences, and goals will be saved to your cognitive memory.
                </p>
              )}
            </div>
          </div>

          {/* Active Goals & Wellbeing Reflection */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between min-h-[200px]">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target size={17} className="text-emerald-400" />
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white m-0">
                    Personal Focus & Goals
                  </h3>
                </div>
                <button
                  onClick={() => onStart("Interests")}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-transparent border-none cursor-pointer"
                >
                  Edit →
                </button>
              </div>

              {activeGoals.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {activeGoals.map((g, idx) => (
                    <span
                      key={idx}
                      className="liquid-pill px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 border border-emerald-500/20 bg-emerald-500/10 font-medium"
                    >
                      🌱 {g}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2 m-0">
                  You haven't set any active goals yet. You can personalize your wellbeing journey
                  under Interests or by discussing your intentions with Aura.
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Protected account data</span>
              <span>AI wellbeing companion</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
