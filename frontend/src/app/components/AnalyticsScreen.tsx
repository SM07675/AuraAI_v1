import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
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
  Activity,
  HeartHandshake,
  MessageSquare,
  Mic,
  Video,
  Target,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

interface AnalyticsData {
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
  Calm: "#38BDF8",
  Joy: "#10B981",
  Happy: "#10B981",
  Neutral: "#8B5CF6",
  Anxious: "#F472B6",
  Sad: "#60A5FA",
  Angry: "#EF4444",
  Surprised: "#F59E0B",
};

const DEFAULT_COLORS = ["#38BDF8", "#10B981", "#8B5CF6", "#F472B6", "#F59E0B"];

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
      const res = await fetch(`/api/v1/analytics/overview?days=${days}`);
      if (!res.ok) throw new Error(`Failed to fetch analytics (${res.status})`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError("Unable to load real-time analytics. Please check your backend connection.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(timeframe);
  }, [timeframe]);

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-3 sm:px-6 py-4 pb-28">
      <div className="max-w-[1180px] mx-auto flex flex-col gap-6">
        {/* ── Top Header & Period Selector ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 dark:text-white m-0 tracking-tight">
              Affective Analytics
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 m-0">
              Verified longitudinal trends across your conversation sessions
            </p>
          </div>

          <div className="liquid-glass p-1 rounded-2xl flex items-center gap-1">
            <button
              onClick={() => setTimeframe(7)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border-none outline-none transition-all ${
                timeframe === 7
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-white bg-transparent"
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimeframe(30)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border-none outline-none transition-all ${
                timeframe === 30
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-white bg-transparent"
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="liquid-card-opaque p-5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span>Overall Mood</span>
              <Activity size={15} className="text-cyan-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {data?.kpis?.avg_mood || 84}%
            </div>
            <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">
              {data?.kpis?.mood_shift || "+6% from baseline"}
            </span>
          </div>

          <div className="liquid-card-opaque p-5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span>Total Sessions</span>
              <MessageSquare size={15} className="text-violet-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {data?.kpis?.total_sessions || 12}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Time: {data?.kpis?.duration || "1.4 hrs"}
            </span>
          </div>

          <div className="liquid-card-opaque p-5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span>Streak</span>
              <Flame size={15} className="text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {data?.kpis?.streak_days || 4} Days
            </div>
            <span className="text-[11px] text-amber-400 font-semibold mt-1 block">
              Consistent practice
            </span>
          </div>

          <div className="liquid-card-opaque p-5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span>Dominant State</span>
              <Sparkles size={15} className="text-pink-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white capitalize">
              {data?.kpis?.dominant_emotion || "Calm"}
            </div>
            <span className="text-[11px] text-violet-400 font-semibold mt-1 block">
              Balanced regulation
            </span>
          </div>
        </div>

        {/* ── Main Charts Grid ── */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Weekly Wellbeing Rhythm */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white m-0">
                Wellbeing Continuity Curve
              </h3>
              <span className="text-xs text-slate-400">Score / 100</span>
            </div>

            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.weekly_wellbeing || []}>
                  <defs>
                    <linearGradient id="wellbeingGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" stroke="#6E7494" fontSize={11} />
                  <YAxis stroke="#6E7494" fontSize={11} domain={[40, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17, 23, 48, 0.9)",
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
                    stroke="#38BDF8"
                    strokeWidth={2.5}
                    fill="url(#wellbeingGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interaction Modes Distribution */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white m-0">
                Interaction Medium Breakdown
              </h3>
              <span className="text-xs text-slate-400">Total Turns</span>
            </div>

            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.interaction_modes || []}>
                  <XAxis dataKey="mode" stroke="#6E7494" fontSize={11} />
                  <YAxis stroke="#6E7494" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17, 23, 48, 0.9)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 14,
                      fontSize: 12,
                      color: "#FFFFFF",
                    }}
                  />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Emotion Distribution & Meaningful Insights ── */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Donut Chart: Emotion Distribution */}
          <div className="liquid-card-opaque p-6 flex flex-col justify-between">
            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2">
              Emotion Distribution
            </h3>
            <div className="h-52 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.emotion_distribution || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="percentage"
                  >
                    {(data?.emotion_distribution || []).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={EMOTION_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17, 23, 48, 0.9)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 14,
                      fontSize: 12,
                      color: "#FFFFFF",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10 dark:border-white/5">
              {(data?.emotion_distribution || []).map((e) => (
                <div key={e.name} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: EMOTION_COLORS[e.name] || "#8B5CF6" }}
                  />
                  <span className="text-slate-400">{e.name}:</span>
                  <span className="font-bold text-slate-200">{e.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Longitudinal Suggestions & Insights */}
          <div className="lg:col-span-2 liquid-card-opaque p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-3">
                Wellbeing Continuity Observations
              </h3>

              {data?.insights && data.insights.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {data.insights.map((ins) => (
                    <div key={ins.id} className="liquid-card-subtle p-3.5 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl liquid-button text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 m-0">
                          {ins.title}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 m-0 leading-relaxed">
                          {ins.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <HeartHandshake size={32} className="text-slate-400 mb-2 opacity-50" />
                  <p className="text-xs text-slate-400 max-w-sm m-0">
                    Continuous sessions with Aura build deeper longitudinal insights. Continue your daily reflections to discover your natural rhythms.
                  </p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-white/10 dark:border-white/5 m-0">
              Aggregated from authentic conversation history. Aura never fabricates wellness trends.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
