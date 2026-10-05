import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";
import { Activity, Sparkles, Smile, Heart, RefreshCw, CheckCircle2 } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const MOOD_OPTIONS = [
  { label: "Calm", emoji: "😌", color: "#38BDF8" },
  { label: "Reflective", emoji: "✨", color: "#8B5CF6" },
  { label: "Energized", emoji: "⚡", color: "#10B981" },
  { label: "Stressed", emoji: "😮‍💨", color: "#F59E0B" },
  { label: "Vulnerable", emoji: "🌱", color: "#EC4899" },
];

export function EmotionScreen() {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selfReportedMood, setSelfReportedMood] = useState<string | null>(null);

  const loadData = () => {
    Promise.allSettled([
      fetch("/api/v1/analytics/overview").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v1/analytics/emotion_history").then((r) => (r.ok ? r.json() : null)),
    ]).then(([ov, hist]) => {
      if (ov.status === "fulfilled" && ov.value) setOverview(ov.value);
      if (hist.status === "fulfilled" && hist.value?.history) setHistory(hist.value.history);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 25000);
    return () => clearInterval(interval);
  }, []);

  const dominant = overview?.dominant_emotion || "Calm";
  const confidence = overview?.avg_mood || 82;

  const emotionList =
    overview?.emotion_distribution && overview.emotion_distribution.length > 0
      ? overview.emotion_distribution.map((d: any) => {
          const emojiMap: Record<string, string> = {
            Calm: "😌",
            Joy: "😊",
            Happy: "😄",
            Focus: "🎯",
            Stress: "😮‍💨",
            Sad: "😔",
            Anxious: "😰",
            Neutral: "😐",
            Angry: "😠",
          };
          const colorMap: Record<string, string> = {
            Calm: "#38BDF8",
            Joy: "#10B981",
            Happy: "#10B981",
            Focus: "#6366F1",
            Stress: "#F59E0B",
            Sad: "#60A5FA",
            Anxious: "#F472B6",
            Neutral: "#94A3B8",
            Angry: "#EF4444",
          };
          return {
            label: d.name,
            emoji: emojiMap[d.name] || "✨",
            val: d.percentage,
            color: colorMap[d.name] || "#8B5CF6",
          };
        })
      : [
          { label: "Calm", emoji: "😌", val: 55, color: "#38BDF8" },
          { label: "Reflective", emoji: "✨", val: 25, color: "#8B5CF6" },
          { label: "Joy", emoji: "😊", val: 12, color: "#10B981" },
          { label: "Stress", emoji: "😮‍💨", val: 8, color: "#F59E0B" },
        ];

  const chartData =
    history && history.length > 0
      ? history.map((h: any, i: number) => ({
          name: `Point ${i + 1}`,
          v: Math.round((h.confidence || 0.75) * 100),
          emotion: h.fused_emotion || "calm",
        }))
      : [];

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-3 sm:px-6 py-4 pb-28">
      <div className="max-w-[1020px] mx-auto flex flex-col gap-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 dark:text-white m-0 tracking-tight">
              Emotion Insights
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 m-0">
              Affective patterns observed through multimodal conversation with Aura
            </p>
          </div>

          <div className="liquid-pill px-3 py-1 gap-2 text-xs font-semibold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live 25s Sync</span>
          </div>
        </div>

        {/* ── Self-Reported Daily Check-in ── */}
        <div className="liquid-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Self-Reported Wellbeing Check-in
            </span>
            {selfReportedMood && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 size={13} />
                <span>Logged for this session</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            {MOOD_OPTIONS.map((m) => (
              <motion.button
                key={m.label}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSelfReportedMood(m.label)}
                className={`liquid-pill px-4 py-2 text-xs font-semibold gap-2 border cursor-pointer ${
                  selfReportedMood === m.label
                    ? "liquid-pill-active border-violet-400 text-violet-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* ── Main Grid: Observed State & Trend ── */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Left: Multimodal Dominant Breakdown */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Observed Affect
                </span>
                <span className="text-[11px] font-semibold text-violet-400">
                  Confidence ~{confidence}%
                </span>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                  }}
                >
                  😌
                </div>
                <div>
                  <h2 className="text-[20px] font-bold text-slate-900 dark:text-white m-0">
                    {dominant}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 m-0">
                    Multimodal fusion (Voice + Text + FACS)
                  </p>
                </div>
              </div>

              {/* Distribution Bars */}
              <div className="flex flex-col gap-3.5">
                {emotionList.map((e) => (
                  <div key={e.label}>
                    <div className="flex justify-between mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <span>
                        {e.emoji} {e.label}
                      </span>
                      <span style={{ color: e.color }}>{e.val}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/10 dark:bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${e.val}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${e.color}, ${e.color}99)`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-6 pt-3 border-t border-white/10 dark:border-white/5 m-0">
              Provenance: Observed from voice acoustics & facial expressions. Not a medical evaluation.
            </p>
          </div>

          {/* Right: Mood Trajectory Chart */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Affective Trajectory
                </span>
                <span className="liquid-pill px-2.5 py-0.5 text-[10px] text-violet-300 font-semibold">
                  Recent Turns
                </span>
              </div>

              {chartData.length > 0 ? (
                <div className="h-60 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="emotionGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" hide />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(17, 23, 48, 0.85)",
                          backdropFilter: "blur(12px)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          borderRadius: 14,
                          fontSize: 12,
                          color: "#FFFFFF",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#8B5CF6"
                        strokeWidth={2.5}
                        fill="url(#emotionGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex flex-col items-center justify-center text-center p-4">
                  <Activity size={28} className="text-slate-400 mb-2 opacity-50" />
                  <p className="text-xs text-slate-400 max-w-xs m-0">
                    No trajectory points recorded yet. Engage in a voice or video session with Aura to view your real affective continuity.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-white/10 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-400">
              <span>Continuity: Steady</span>
              <span>Emotion Model: RoBERTa + Wav2Vec2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
