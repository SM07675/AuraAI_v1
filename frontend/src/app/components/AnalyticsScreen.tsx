import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "./glass-card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Sparkles,
  Flame,
  TrendingUp,
  HeartHandshake,
  Compass,
  RefreshCw,
  Activity,
  Award,
  Zap,
  MessageSquare,
  Mic,
  Video,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { apiClient } from "../services/apiClient";

interface AnalyticsData {
  has_data?: boolean;
  kpis: {
    avg_mood: number;
    mood_shift: string;
    total_sessions: number;
    duration: string;
    streak_days: number;
    dominant_emotion: string;
    active_goals: number;
  };
  weekly_wellbeing: Array<{ d: string; v: number }>;
  focus_rhythm: Array<{ d: string; v: number; focus: number }>;
  emotion_distribution: Array<{ name: string; count: number; percentage: number }>;
  interaction_modes: Array<{ mode: string; count: number }>;
  insights: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    type: "positive" | "insight" | "achievement" | "recommendation";
    icon: string;
  }>;
}

const EMOTION_COLORS: Record<string, string> = {
  Calm: "#9A80E5",
  Joy: "#10B981",
  Happy: "#00D4FF",
  Neutral: "#8B5CF6",
  Anxious: "#F59E0B",
  Sad: "#6366F1",
  Angry: "#EF4444",
  Surprised: "#EC4899",
};

const DEFAULT_EMOTION_COLORS = ["#9A80E5", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899"];

export function AnalyticsScreen() {
  const { isDark } = useTheme();
  const [timeframe, setTimeframe] = useState<number>(7);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiClient.get<AnalyticsData>(`/api/v1/analytics/overview?days=${days}`);
      setData(json);
    } catch (err: any) {
      console.warn("Analytics fetch error:", err);
      setError("Could not refresh live analytics from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(timeframe);
  }, [timeframe]);

  const renderInsightIcon = (iconName: string) => {
    switch (iconName) {
      case "Sparkles":
        return <Sparkles className="w-5 h-5 text-[#9A80E5]" />;
      case "Flame":
        return <Flame className="w-5 h-5 text-amber-500" />;
      case "Compass":
        return <Compass className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
      case "HeartHandshake":
        return <HeartHandshake className="w-5 h-5 text-[#0D9488] dark:text-[#34D399]" />;
      default:
        return <TrendingUp className="w-5 h-5 text-blue-500" />;
    }
  };

  const hasSessions = (data?.kpis.total_sessions ?? 0) > 0;
  const hasEmotions = (data?.emotion_distribution?.length ?? 0) > 0;

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-4 py-3 pb-32">
      <div className="max-w-6xl mx-auto">
        {/* Header & Timeframe Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-[28px] font-extrabold tracking-tight m-0 text-[#2D2D42] dark:text-[#FFFFFF]">
              Analytics & Insights
            </h2>
            <p className="text-[14px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-1">
              Real-time multi-modal wellness metrics and AI-driven growth recommendations.
            </p>
          </div>

          {/* Timeframe Controls */}
          <div className="clay-pill flex items-center gap-1.5 p-1.5">
            {[
              { label: "7 Days", days: 7 },
              { label: "30 Days", days: 30 },
              { label: "All Time", days: 90 },
            ].map((tf) => (
              <motion.button
                key={tf.days}
                whileTap={{ scale: 0.95 }}
                onClick={() => setTimeframe(tf.days)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer border-none outline-none ${
                  timeframe === tf.days
                    ? "clay-active-nav"
                    : "text-[#6B6B85] dark:text-[#9E98B4] hover:text-[#2D2D42] dark:hover:text-[#FFFFFF]"
                }`}
              >
                {tf.label}
              </motion.button>
            ))}
            <button
              onClick={() => fetchAnalytics(timeframe)}
              title="Refresh Data"
              className="p-1.5 text-[#9E9EB2] dark:text-[#6E6882] hover:text-[#7B59DC] transition-colors border-none bg-transparent cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="clay-card-flat p-3 rounded-2xl mb-6 text-xs text-rose-500 font-semibold text-center">
            {error}
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="clay-card p-5 rounded-[28px]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-[#7A748A] dark:text-[#9E98B4] font-bold">Avg. Mood Index</span>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#E2D5FC] dark:bg-[#372B5E] text-[#7B59DC] dark:text-[#C7B5F3]">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[30px] font-extrabold text-[#7B59DC] dark:text-[#B794F6] mt-2">
              {data?.kpis.avg_mood ? `${data.kpis.avg_mood}%` : "—"}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11.5px] text-[#0D9488] dark:text-[#34D399] font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{data?.kpis.mood_shift || "No prior data"}</span>
            </div>
          </div>

          <div className="clay-card p-5 rounded-[28px]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-[#7A748A] dark:text-[#9E98B4] font-bold">Total Sessions</span>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#D0F6EC] dark:bg-[#1A453F] text-[#0D9488] dark:text-[#34D399]">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[30px] font-extrabold text-[#0D9488] dark:text-[#34D399] mt-2">
              {data?.kpis.total_sessions ?? 0}
            </div>
            <div className="text-[11.5px] text-[#7A748A] dark:text-[#9E98B4] mt-1.5 font-semibold">
              {data?.kpis.duration || "0m total"}
            </div>
          </div>

          <div className="clay-card p-5 rounded-[28px]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-[#7A748A] dark:text-[#9E98B4] font-bold">Calm Streak</span>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FEF1CE] dark:bg-[#4E3918] text-[#D97706] dark:text-[#FBBF24]">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[30px] font-extrabold text-[#D97706] dark:text-[#FBBF24] mt-2">
              {data?.kpis.streak_days ?? 0} {data?.kpis.streak_days === 1 ? "day" : "days"}
            </div>
            <div className="text-[11.5px] text-[#B45309] dark:text-[#FCD34D] mt-1.5 font-bold flex items-center gap-1">
              <span>{data?.kpis.streak_days ? "Active reflection streak" : "Start daily streak"}</span> 🔥
            </div>
          </div>

          <div className="clay-card p-5 rounded-[28px]">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-[#7A748A] dark:text-[#9E98B4] font-bold">Dominant Mood</span>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#D4EDFC] dark:bg-[#1E3A5F] text-[#0284C7] dark:text-[#38BDF8]">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[30px] font-extrabold text-[#0284C7] dark:text-[#38BDF8] mt-2">
              {data?.kpis.dominant_emotion !== "None" ? data?.kpis.dominant_emotion : "—"}
            </div>
            <div className="text-[11.5px] text-[#6B21A8] dark:text-[#C7B5F3] mt-1.5 font-semibold">
              {data?.kpis.active_goals ?? 0} active goals tracked
            </div>
          </div>
        </div>

        {/* Visualizations Section */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 mb-8">
          {/* Weekly Wellbeing Bar Chart */}
          <div className="clay-card lg:col-span-7 p-6 rounded-[32px]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0">
                  Weekly Wellbeing Score
                </h3>
                <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mt-0.5 font-medium">
                  Daily emotional resonance derived from multi-modal check-ins
                </p>
              </div>
            </div>
            <div style={{ height: 240, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.weekly_wellbeing ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9A80E5" stopOpacity={1} />
                      <stop offset="100%" stopColor="#00D4FF" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8E88A4" : "#9E9EB2", fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8E88A4" : "#9E9EB2", fontSize: 11, fontWeight: 600 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? "#171424" : "#FFFDFD",
                      borderRadius: "16px",
                      border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(255,255,255,0.9)",
                      boxShadow: isDark ? "0 10px 25px rgba(0, 0, 0, 0.6)" : "4px 6px 14px rgba(200, 180, 190, 0.3)",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: isDark ? "#FFFFFF" : "#2D2D42",
                    }}
                    formatter={(val: number) => [`${val}%`, "Mood Score"]}
                  />
                  <Bar dataKey="v" radius={[8, 8, 8, 8]} fill="url(#barGradient)" maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Focus & Emotional Stability Area Chart */}
          <div className="clay-card lg:col-span-5 p-6 rounded-[32px]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0">
                  Focus & Stability Rhythm
                </h3>
                <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mt-0.5 font-medium">
                  Cognitive stability index over time
                </p>
              </div>
            </div>
            <div style={{ height: 240, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.focus_rhythm ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8E88A4" : "#9E9EB2", fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8E88A4" : "#9E9EB2", fontSize: 11, fontWeight: 600 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? "#171424" : "#FFFDFD",
                      borderRadius: "16px",
                      border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(255,255,255,0.9)",
                      boxShadow: isDark ? "0 10px 25px rgba(0, 0, 0, 0.6)" : "4px 6px 14px rgba(200, 180, 190, 0.3)",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: isDark ? "#FFFFFF" : "#2D2D42",
                    }}
                    formatter={(val: number) => [`${val}%`, "Focus Rhythm"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="focus"
                    stroke="#8B5CF6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#areaGradient)"
                    dot={{ r: 4, fill: "#8B5CF6", strokeWidth: 2, stroke: "#ffffff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Emotion Distribution & Interaction Modes */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 mb-10">
          {/* Donut Chart: Emotion Breakdown */}
          <div className="clay-card lg:col-span-7 p-6 rounded-[32px]">
            <h3 className="font-bold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0 mb-0.5">
              Emotion Distribution
            </h3>
            <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mb-3.5 font-medium">
              Proportion of primary emotions detected across all channels
            </p>

            {hasEmotions ? (
              <div className="grid grid-cols-1 md:grid-cols-12 items-center">
                <div className="md:col-span-7" style={{ height: 210 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data?.emotion_distribution ?? []}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="count"
                      >
                        {(data?.emotion_distribution ?? []).map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={EMOTION_COLORS[entry.name] || DEFAULT_EMOTION_COLORS[index % DEFAULT_EMOTION_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#171424" : "#FFFDFD",
                          borderRadius: "16px",
                          border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(255,255,255,0.9)",
                          color: isDark ? "#FFFFFF" : "#2D2D42",
                        }}
                        formatter={(value: number, name: string, item: any) => [
                          `${value} session logs (${item.payload.percentage}%)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend List */}
                <div className="md:col-span-5 flex flex-col gap-2 pl-2">
                  {(data?.emotion_distribution ?? []).map((item, idx) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              EMOTION_COLORS[item.name] || DEFAULT_EMOTION_COLORS[idx % DEFAULT_EMOTION_COLORS.length],
                          }}
                        />
                        <span className="font-semibold text-[#4B4B60] dark:text-[#D8D2E8]">{item.name}</span>
                      </div>
                      <span className="font-bold text-[#2D2D42] dark:text-[#FFFFFF]">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[#7A7A96] dark:text-[#9E98B4]">
                No emotion logs recorded for this timeframe yet.
              </div>
            )}
          </div>

          {/* Interaction Modes Breakdown */}
          <div className="clay-card lg:col-span-5 p-6 rounded-[32px]">
            <h3 className="font-bold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0 mb-0.5">
              Interaction Modes
            </h3>
            <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mb-4 font-medium">
              Session distribution by modality
            </p>

            <div className="flex flex-col gap-4">
              {(data?.interaction_modes ?? [
                { mode: "Chat", count: 0 },
                { mode: "Voice", count: 0 },
                { mode: "Face-to-Face", count: 0 }
              ]).map((m) => {
                const isVoice = m.mode.toLowerCase().includes("voice");
                const isFace = m.mode.toLowerCase().includes("face");
                const icon = isVoice ? (
                  <Mic className="w-4 h-4 text-[#7B59DC] dark:text-[#B794F6]" />
                ) : isFace ? (
                  <Video className="w-4 h-4 text-[#0D9488] dark:text-[#34D399]" />
                ) : (
                  <MessageSquare className="w-4 h-4 text-[#0284C7] dark:text-[#38BDF8]" />
                );
                const total = (data?.interaction_modes ?? []).reduce((acc, curr) => acc + curr.count, 0) || 1;
                const pct = Math.round((m.count / total) * 100);

                return (
                  <div key={m.mode} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-bold text-[#2D2D42] dark:text-[#FFFFFF]">
                        {icon}
                        <span>{m.mode}</span>
                      </div>
                      <span className="text-[#7A7A96] dark:text-[#9E98B4] font-semibold">{m.count} sessions ({pct}%)</span>
                    </div>
                    <div className="clay-track-inset w-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isVoice
                            ? "bg-[#7B59DC]"
                            : isFace
                            ? "bg-[#0D9488]"
                            : "bg-[#0284C7]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* AI Intelligence & Actionable Insights */}
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-5 h-5 text-[#7B59DC] dark:text-[#B794F6]" />
            <h3 className="text-[20px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] m-0">
              Aura AI Intelligence & Recommendations
            </h3>
          </div>

          <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
            {(data?.insights ?? []).map((ins) => (
              <div key={ins.id} className="clay-card p-5 rounded-[28px]">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-2xl bg-[#FFFDFD] dark:bg-[#1E1B2E] shadow-sm border border-white/90 dark:border-white/10 shrink-0">
                    {renderInsightIcon(ins.icon)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="clay-pill px-2.5 py-0.5 text-[10.5px] font-bold text-[#7B59DC]">
                        {ins.category}
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] mt-2 mb-1">{ins.title}</h4>
                    <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] leading-relaxed mb-0 font-medium">{ins.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
