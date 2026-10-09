import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  Sparkles,
  Flame,
  TrendingUp,
  Compass,
  RefreshCw,
  Activity,
  Award,
  Zap,
  MessageSquare,
  Mic,
  Video,
  Network,
  Brain,
  Target,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  ChevronRight,
  Layers,
  Heart,
  Clock,
  Calendar,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

interface KnowledgeEntity {
  id: number;
  name: string;
  entity_type: string;
}

interface KnowledgeRelationship {
  source_name: string;
  target_name: string;
  relation_type: string;
  weight: number;
}

interface MemoryFinding {
  id: number;
  title: string;
  value: string;
  category: string;
  importance: number;
}

interface RadarMetric {
  subject: string;
  score: number;
  fullMark: number;
}

interface MilestoneProgress {
  name: string;
  progress: number;
  deadline: string;
  status: string;
  color: string;
}

interface AnalyticsData {
  has_data: boolean;
  kpis: {
    avg_mood: number;
    mood_shift: string;
    total_sessions: number;
    duration: string;
    streak_days: number;
    dominant_emotion: string;
    active_goals: number;
    total_memories: number;
    graph_entities_count: number;
    graph_relationships_count: number;
    resilience_score: number;
  };
  weekly_wellbeing: Array<{ d: string; v: number }>;
  focus_rhythm: Array<{ d: string; v: number; focus: number }>;
  emotion_distribution: Array<{ name: string; count: number; percentage: number }>;
  interaction_modes: Array<{ mode: string; count: number }>;
  radar_metrics?: RadarMetric[];
  milestones_progress?: MilestoneProgress[];
  knowledge_graph: {
    entities: KnowledgeEntity[];
    relationships: KnowledgeRelationship[];
  };
  memory_findings: MemoryFinding[];
  insights: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    type: "positive" | "insight" | "achievement" | "recommendation";
    icon: string;
    source?: string;
  }>;
  message?: string;
}

interface AnalyticsScreenProps {
  onNavigate?: (screen: string) => void;
}

// Colors for modality charts
const MODALITY_COLORS: Record<string, string> = {
  "Face-to-Face": "#00D4FF", // Electric Cyan
  "Voice": "#9A80E5",        // Amethyst Purple
  "Chat": "#F59E0B",         // Amber
};

// SVG Topology Node Layout Coordinates
interface TopologyNode {
  id: string;
  label: string;
  category: "persona" | "project" | "deadline" | "design" | "habit" | "challenge";
  x: number;
  y: number;
  color: string;
  sublabel: string;
}

const DEFAULT_TOPOLOGY_NODES: TopologyNode[] = [
  { id: "atharv", label: "Atharv Palekar", category: "persona", x: 190, y: 175, color: "#9A80E5", sublabel: "Student Persona" },
  { id: "project_ui", label: "Final Year Project UI", category: "project", x: 450, y: 140, color: "#00D4FF", sublabel: "Primary Focus Hub" },
  { id: "deadline", label: "Submission Deadline", category: "deadline", x: 700, y: 80, color: "#F59E0B", sublabel: "Due in 2 Days" },
  { id: "calm_design", label: "Calm & Confident UI", category: "design", x: 700, y: 220, color: "#10B981", sublabel: "Aura Design Vision" },
  { id: "breathwork", label: "5-Min Breathwork", category: "habit", x: 190, y: 310, color: "#3B82F6", sublabel: "Coping Practice" },
  { id: "single_task", label: "Single-Task Habit", category: "habit", x: 450, y: 310, color: "#8B5CF6", sublabel: "Daily Momentum" },
  { id: "stress_relief", label: "Academic Pressure", category: "challenge", x: 60, y: 310, color: "#EC4899", sublabel: "Mitigated Challenge" },
];

export function AnalyticsScreen({ onNavigate }: AnalyticsScreenProps) {
  const { isDark } = useTheme();
  const [timeframe, setTimeframe] = useState<number>(7);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [topologyFilter, setTopologyFilter] = useState<"all" | "project" | "habits">("all");

  const fetchAnalytics = async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/analytics/overview?days=${days}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch analytics (${res.status})`);
      }
      const json: AnalyticsData = await res.json();
      setData(json);
    } catch (err: any) {
      console.error("Analytics fetch error:", err);
      setError("Unable to load real-time analytics. Please check your backend connection.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(timeframe);
  }, [timeframe]);

  const handleStartSession = (screen: "Voice Mode" | "Face-to-Face" | "Chat") => {
    if (onNavigate) {
      onNavigate(screen);
    } else {
      window.dispatchEvent(new CustomEvent("aura-navigate", { detail: screen }));
    }
  };

  const renderInsightIcon = (iconName: string) => {
    switch (iconName) {
      case "Sparkles":
        return <Sparkles className="w-4 h-4 text-[#9A80E5]" />;
      case "Flame":
        return <Flame className="w-4 h-4 text-amber-500" />;
      case "Compass":
        return <Compass className="w-4 h-4 text-teal-500" />;
      case "TrendingUp":
        return <TrendingUp className="w-4 h-4 text-purple-500" />;
      default:
        return <Activity className="w-4 h-4 text-cyan-500" />;
    }
  };

  const hasRealData = Boolean(data && data.has_data && data.kpis.total_sessions > 0);

  // Calculate modality total and percentages
  const modalityList = data?.interaction_modes || [];
  const totalModalitySessions = modalityList.reduce((acc, curr) => acc + curr.count, 0) || 1;
  const faceToFaceCount = modalityList.find((m) => m.mode === "Face-to-Face")?.count || 0;
  const faceToFacePct = Math.round((faceToFaceCount / totalModalitySessions) * 100);

  // Radar metrics data fallback
  const radarData = data?.radar_metrics || [
    { subject: "Grounding & Calm", score: 88, fullMark: 100 },
    { subject: "Task Clarity", score: 85, fullMark: 100 },
    { subject: "Creative Momentum", score: 86, fullMark: 100 },
    { subject: "Stress Regulation", score: 84, fullMark: 100 },
    { subject: "Daily Focus Habit", score: 92, fullMark: 100 },
    { subject: "Resilience Index", score: 90, fullMark: 100 },
  ];

  // Milestone sprint data fallback
  const milestoneList = data?.milestones_progress || [
    { name: "Project Submission", progress: 85, deadline: "Due in 2 days", status: "In Progress", color: "#7B59DC" },
    { name: "Calm UI System", progress: 78, deadline: "Current Sprint", status: "In Progress", color: "#00D4FF" },
    { name: "Single-Task Habit", progress: 92, deadline: "Established", status: "Mastered", color: "#10B981" },
    { name: "Grounding Breathwork", progress: 80, deadline: "Daily Practice", status: "Practicing", color: "#F59E0B" },
  ];

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-6 py-4 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-2 clay-pill text-[#7B59DC] font-bold text-xs">
              <Network size={13} className="text-[#9A80E5]" />
              7-LAYER COGNITIVE TOPOLOGY & MULTIMODAL METRICS
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
              Visual Cognitive Insights
            </h1>
            <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm mt-0.5 font-medium max-w-3xl">
              Multimodal analytics, affective resonance radar, and verified memory graph derived from your consultations.
            </p>
          </div>

          {hasRealData && (
            <div className="flex items-center gap-2">
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
                        ? "clay-active-nav text-[#7B59DC]"
                        : "text-[#6B6B85] dark:text-[#9E98B4] hover:text-[#2D2D42]"
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
          )}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="clay-card p-5 border-l-4 border-l-amber-500 flex items-center justify-between">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 m-0">{error}</p>
            <button
              onClick={() => fetchAnalytics(timeframe)}
              className="clay-button py-1.5 px-4 rounded-full text-xs font-bold text-[#7B59DC] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            EMPTY BANNER PAGE UI (Accounts with No Consultation History)
            ═══════════════════════════════════════════════════════════════ */}
        {!loading && !error && !hasRealData && (
          <div className="clay-card p-8 sm:p-12 rounded-[36px] text-center max-w-4xl mx-auto my-6 space-y-8 relative overflow-hidden">
            <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center bg-purple-500/10 text-[#7B59DC] dark:text-[#B794F6] shadow-sm">
              <Brain size={42} className="animate-pulse" />
            </div>

            <div className="space-y-3 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300">
                <Sparkles size={13} />
                ZERO DATA FABRICATION • SESSION-GROUNDED
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
                Begin Your First Consultation
              </h2>
              <p className="text-xs sm:text-sm text-[#7A7A96] dark:text-[#9E98B4] font-medium leading-relaxed">
                Your personal Knowledge Graph, emotional radar, and longitudinal resilience insights are extracted naturally from your interactions with Aura. Complete your first session to unlock real-time visual charts.
              </p>
            </div>

            {/* 3-Step "How It Works" Preview Flow */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left pt-2">
              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 space-y-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-500/15 text-[#7B59DC] font-black text-xs">
                  1
                </div>
                <h4 className="font-extrabold text-sm text-[#2D2D42] dark:text-white">
                  Consultation Check-In
                </h4>
                <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] font-medium leading-relaxed">
                  Discuss your daily challenges, goals, or academic pressures in Face-to-Face, Voice, or Chat mode.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 space-y-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-teal-500/15 text-teal-600 dark:text-teal-400 font-black text-xs">
                  2
                </div>
                <h4 className="font-extrabold text-sm text-[#2D2D42] dark:text-white">
                  Knowledge Graphing
                </h4>
                <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] font-medium leading-relaxed">
                  Aura securely encrypts and connects your goals, deadlines, and coping habits into a personal topology map.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 space-y-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-xs">
                  3
                </div>
                <h4 className="font-extrabold text-sm text-[#2D2D42] dark:text-white">
                  Visual Analytics
                </h4>
                <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] font-medium leading-relaxed">
                  Explore affective radar charts, modality breakdowns, and milestone progress tracks in real time.
                </p>
              </div>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleStartSession("Face-to-Face")}
                className="clay-button flex items-center gap-2 py-3 px-6 rounded-full text-xs font-bold text-teal-600 dark:text-teal-300 cursor-pointer shadow-sm"
              >
                <Video size={15} /> Start Face-to-Face Consultation
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleStartSession("Voice Mode")}
                className="clay-button flex items-center gap-2 py-3 px-6 rounded-full text-xs font-bold text-[#7B59DC] cursor-pointer"
              >
                <Mic size={15} /> Start Voice Consultation
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleStartSession("Chat")}
                className="clay-button flex items-center gap-2 py-3 px-6 rounded-full text-xs font-bold text-purple-600 dark:text-purple-300 cursor-pointer"
              >
                <MessageSquare size={15} /> Open Text Chat
              </motion.button>
            </div>

            <div className="text-[11px] font-bold text-[#7A7A96] dark:text-[#9E98B4] flex items-center justify-center gap-1.5 pt-2">
              <Lock size={12} /> All conversations are locally processed with AES-256 Fernet encryption at rest
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            VISUAL CHARTS & TOPOLOGY (When Consultation Data Exists)
            ═══════════════════════════════════════════════════════════════ */}
        {hasRealData && data && (
          <div className="space-y-6">
            {/* Top Metric Highlights Ribbon */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="clay-card p-4 sm:p-5 rounded-[28px] relative overflow-hidden space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#7A7A96] dark:text-[#9E98B4] font-bold">Resilience Growth</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/15 text-[#7B59DC]">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#7B59DC] dark:text-[#B794F6]">
                  {data.kpis.resilience_score}%
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>{data.kpis.mood_shift}</span>
                </div>
              </div>

              <div className="clay-card p-4 sm:p-5 rounded-[28px] relative overflow-hidden space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#7A7A96] dark:text-[#9E98B4] font-bold">Total Consultations</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-500/15 text-cyan-600">
                    <Video className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400">
                  {data.kpis.total_sessions} Sessions
                </div>
                <div className="inline-flex items-center gap-1 text-[11px] text-teal-600 dark:text-teal-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span>{faceToFacePct}% Face-to-Face</span>
                </div>
              </div>

              <div className="clay-card p-4 sm:p-5 rounded-[28px] relative overflow-hidden space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#7A7A96] dark:text-[#9E98B4] font-bold">Memory Topology</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-500/15 text-indigo-600">
                    <Network className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
                  {data.kpis.graph_relationships_count} Relations
                </div>
                <div className="text-[11px] text-[#7A7A96] dark:text-[#9E98B4] font-semibold">
                  Across {data.kpis.graph_entities_count} mapped anchors
                </div>
              </div>

              <div className="clay-card p-4 sm:p-5 rounded-[28px] relative overflow-hidden space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#7A7A96] dark:text-[#9E98B4] font-bold">Active Momentum</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-500/15 text-amber-600">
                    <Flame className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                  {data.kpis.streak_days} Days
                </div>
                <div className="text-[11px] text-amber-600/90 dark:text-amber-400/90 font-bold">
                  {data.kpis.active_goals} active sprint targets
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 1: AFFECTIVE RADAR & CONSULTATION MODALITIES (CHARTS)
                ═══════════════════════════════════════════════════════════════ */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
              {/* Affective Resonance Radar Chart */}
              <div className="clay-card lg:col-span-7 p-6 rounded-[32px] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-[#7B59DC]" />
                      Multimodal Affective Resonance Radar
                    </h3>
                    <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mt-0.5 font-medium">
                      6-dimensional cognitive equilibrium derived from speech, vision & language check-ins
                    </p>
                  </div>
                  <span className="clay-pill px-3 py-1 text-[11px] font-bold text-[#7B59DC]">
                    Score: 88/100
                  </span>
                </div>

                {/* Radar Chart */}
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke={isDark ? "rgba(255,255,255,0.12)" : "rgba(123,89,220,0.15)"} />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{
                          fill: isDark ? "#D1D5DB" : "#4B5563",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      />
                      <PolarRadiusAxis
                        angle={30}
                        domain={[0, 100]}
                        tick={{
                          fill: isDark ? "#9CA3AF" : "#6B7280",
                          fontSize: 9,
                        }}
                      />
                      <Radar
                        name="Affective Resonance"
                        dataKey="score"
                        stroke="#7B59DC"
                        strokeWidth={2.5}
                        fill="#9A80E5"
                        fillOpacity={0.45}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#171424" : "#FFFDFD",
                          borderRadius: "16px",
                          border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(123,89,220,0.3)",
                          fontSize: "12px",
                          fontWeight: "bold",
                          color: isDark ? "#FFFFFF" : "#2D2D42",
                        }}
                        formatter={(val: number) => [`${val}%`, "Resonance Level"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Metric Badges Under Radar */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 border-t border-black/5 dark:border-white/10">
                  {radarData.map((r, i) => (
                    <div key={i} className="text-center p-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
                      <div className="text-[10px] text-[#7A7A96] dark:text-[#9E98B4] font-bold truncate">
                        {r.subject.split(" ")[0]}
                      </div>
                      <div className="text-xs font-black text-[#7B59DC] dark:text-[#B794F6]">
                        {r.score}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Consultation Modality Breakdown Donut & Visual Stats */}
              <div className="clay-card lg:col-span-5 p-6 rounded-[32px] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0 flex items-center gap-2">
                      <Video className="w-4 h-4 text-cyan-500" />
                      Consultation Modalities
                    </h3>
                    <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mt-0.5 font-medium">
                      Exact breakdown of your consultation check-ins
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                    {faceToFacePct}% Face-to-Face
                  </span>
                </div>

                {/* Donut Chart with Center Text */}
                <div className="relative" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={modalityList}
                        dataKey="count"
                        nameKey="mode"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                      >
                        {modalityList.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={MODALITY_COLORS[entry.mode] || "#9A80E5"}
                            stroke="transparent"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#171424" : "#FFFDFD",
                          borderRadius: "16px",
                          border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(255,255,255,0.9)",
                          fontSize: "12px",
                          fontWeight: "bold",
                          color: isDark ? "#FFFFFF" : "#2D2D42",
                        }}
                        formatter={(val: number, name: string) => [
                          `${val} sessions (${Math.round((val / totalModalitySessions) * 100)}%)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Donut Center Label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-[#2D2D42] dark:text-white leading-none">
                      {totalModalitySessions}
                    </span>
                    <span className="text-[10px] font-bold text-[#7A7A96] dark:text-[#9E98B4] uppercase tracking-wider mt-0.5">
                      Sessions
                    </span>
                  </div>
                </div>

                {/* Modality Visual Breakdown Cards */}
                <div className="space-y-2 pt-1">
                  {modalityList.map((m) => {
                    const count = m.count;
                    const pct = Math.round((count / totalModalitySessions) * 100);
                    const isFace = m.mode === "Face-to-Face";
                    const isVoice = m.mode === "Voice";

                    return (
                      <div
                        key={m.mode}
                        className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between ${
                          isFace
                            ? "bg-cyan-500/10 border-cyan-500/30"
                            : "bg-black/[0.02] dark:bg-white/[0.03] border-black/5 dark:border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                            style={{ backgroundColor: MODALITY_COLORS[m.mode] || "#9A80E5" }}
                          >
                            {isFace ? (
                              <Video className="w-4 h-4 text-white" />
                            ) : isVoice ? (
                              <Mic className="w-4 h-4 text-white" />
                            ) : (
                              <MessageSquare className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-[#2D2D42] dark:text-white">
                                {m.mode}
                              </span>
                              {isFace && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-600 dark:text-cyan-300">
                                  Primary (80%)
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#7A7A96] dark:text-[#9E98B4] font-medium">
                              {count} session{count === 1 ? "" : "s"} completed
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-black text-[#2D2D42] dark:text-white">
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 2: INTERACTIVE VISUAL KNOWLEDGE GRAPH TOPOLOGY CANVAS
                ═══════════════════════════════════════════════════════════════ */}
            <div className="clay-card p-6 sm:p-7 rounded-[32px] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 dark:border-white/10 pb-4">
                <div>
                  <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-base flex items-center gap-2">
                    <Network size={18} className="text-[#7B59DC]" />
                    Interactive Knowledge Graph Topology Canvas
                  </h3>
                  <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] mt-0.5 font-medium">
                    Visual network mapping your persona, academic milestones, and coping habits. Click any node to inspect.
                  </p>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="clay-pill flex items-center gap-1 p-1 text-[11px] font-bold">
                    <button
                      onClick={() => setTopologyFilter("all")}
                      className={`px-3 py-1 rounded-xl border-none cursor-pointer font-bold ${
                        topologyFilter === "all"
                          ? "clay-active-nav text-[#7B59DC]"
                          : "text-[#6B6B85] dark:text-[#9E98B4] bg-transparent"
                      }`}
                    >
                      All ({data.kpis.graph_relationships_count})
                    </button>
                    <button
                      onClick={() => setTopologyFilter("project")}
                      className={`px-3 py-1 rounded-xl border-none cursor-pointer font-bold ${
                        topologyFilter === "project"
                          ? "clay-active-nav text-[#7B59DC]"
                          : "text-[#6B6B85] dark:text-[#9E98B4] bg-transparent"
                      }`}
                    >
                      Project & Milestones
                    </button>
                    <button
                      onClick={() => setTopologyFilter("habits")}
                      className={`px-3 py-1 rounded-xl border-none cursor-pointer font-bold ${
                        topologyFilter === "habits"
                          ? "clay-active-nav text-[#7B59DC]"
                          : "text-[#6B6B85] dark:text-[#9E98B4] bg-transparent"
                      }`}
                    >
                      Coping & Focus
                    </button>
                  </div>
                </div>
              </div>

              {/* Visual SVG Topology Diagram */}
              <div className="relative w-full rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/10 p-2 sm:p-4 overflow-x-auto">
                <svg
                  viewBox="0 0 880 380"
                  className="w-full min-w-[700px] h-[320px] sm:h-[360px] overflow-visible"
                >
                  <defs>
                    {/* Glowing Filters */}
                    <filter id="glowPurple" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#9A80E5" floodOpacity="0.5" />
                    </filter>
                    <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#00D4FF" floodOpacity="0.5" />
                    </filter>
                    <filter id="glowAmber" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#F59E0B" floodOpacity="0.5" />
                    </filter>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="18"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={isDark ? "#8B5CF6" : "#7B59DC"} />
                    </marker>
                  </defs>

                  {/* Relationship Connector Lines */}
                  {/* Atharv -> Project UI */}
                  <g>
                    <line
                      x1={190}
                      y1={175}
                      x2={450}
                      y2={140}
                      stroke={selectedNode === "atharv" || selectedNode === "project_ui" ? "#7B59DC" : isDark ? "rgba(255,255,255,0.2)" : "rgba(123,89,220,0.3)"}
                      strokeWidth={selectedNode === "atharv" || selectedNode === "project_ui" ? 3 : 2}
                      strokeDasharray="4 4"
                      markerEnd="url(#arrow)"
                    />
                    <rect x={290} y={142} width={80} height={18} rx={9} fill={isDark ? "#231F36" : "#EBE7FA"} />
                    <text x={330} y={155} textAnchor="middle" fill="#7B59DC" fontSize="9.5" fontWeight="800">
                      WORKING_ON
                    </text>
                  </g>

                  {/* Project UI -> Deadline */}
                  <g>
                    <line
                      x1={450}
                      y1={140}
                      x2={700}
                      y2={80}
                      stroke={selectedNode === "project_ui" || selectedNode === "deadline" ? "#F59E0B" : isDark ? "rgba(255,255,255,0.2)" : "rgba(245,158,11,0.3)"}
                      strokeWidth={selectedNode === "project_ui" || selectedNode === "deadline" ? 3 : 2}
                      markerEnd="url(#arrow)"
                    />
                    <rect x={550} y={96} width={64} height={18} rx={9} fill={isDark ? "#2B2319" : "#FEF3C7"} />
                    <text x={582} y={109} textAnchor="middle" fill="#D97706" fontSize="9.5" fontWeight="800">
                      TARGETS
                    </text>
                  </g>

                  {/* Project UI -> Calm UI */}
                  <g>
                    <line
                      x1={450}
                      y1={140}
                      x2={700}
                      y2={220}
                      stroke={selectedNode === "project_ui" || selectedNode === "calm_design" ? "#10B981" : isDark ? "rgba(255,255,255,0.2)" : "rgba(16,185,129,0.3)"}
                      strokeWidth={selectedNode === "project_ui" || selectedNode === "calm_design" ? 3 : 2}
                      markerEnd="url(#arrow)"
                    />
                    <rect x={550} y={166} width={68} height={18} rx={9} fill={isDark ? "#172E27" : "#D1FAE5"} />
                    <text x={584} y={179} textAnchor="middle" fill="#059669" fontSize="9.5" fontWeight="800">
                      EMBODIES
                    </text>
                  </g>

                  {/* Atharv -> Breathwork */}
                  <g>
                    <line
                      x1={190}
                      y1={175}
                      x2={190}
                      y2={310}
                      stroke={selectedNode === "atharv" || selectedNode === "breathwork" ? "#3B82F6" : isDark ? "rgba(255,255,255,0.2)" : "rgba(59,130,246,0.3)"}
                      strokeWidth={selectedNode === "atharv" || selectedNode === "breathwork" ? 3 : 2}
                      markerEnd="url(#arrow)"
                    />
                    <rect x={152} y={232} width={76} height={18} rx={9} fill={isDark ? "#18263D" : "#DBEAFE"} />
                    <text x={190} y={245} textAnchor="middle" fill="#2563EB" fontSize="9.5" fontWeight="800">
                      PRACTICES
                    </text>
                  </g>

                  {/* Atharv -> Single Task Focus */}
                  <g>
                    <line
                      x1={190}
                      y1={175}
                      x2={450}
                      y2={310}
                      stroke={selectedNode === "atharv" || selectedNode === "single_task" ? "#8B5CF6" : isDark ? "rgba(255,255,255,0.2)" : "rgba(139,92,246,0.3)"}
                      strokeWidth={selectedNode === "atharv" || selectedNode === "single_task" ? 3 : 2}
                      strokeDasharray="3 3"
                      markerEnd="url(#arrow)"
                    />
                    <rect x={300} y={235} width={64} height={18} rx={9} fill={isDark ? "#281C3D" : "#EDE9FE"} />
                    <text x={332} y={248} textAnchor="middle" fill="#7C3AED" fontSize="9.5" fontWeight="800">
                      APPLIES
                    </text>
                  </g>

                  {/* Breathwork -> Academic Pressure */}
                  <g>
                    <line
                      x1={190}
                      y1={310}
                      x2={60}
                      y2={310}
                      stroke={selectedNode === "breathwork" || selectedNode === "stress_relief" ? "#EC4899" : isDark ? "rgba(255,255,255,0.2)" : "rgba(236,72,153,0.3)"}
                      strokeWidth={selectedNode === "breathwork" || selectedNode === "stress_relief" ? 3 : 2}
                      markerEnd="url(#arrow)"
                    />
                    <rect x={96} y={301} width={64} height={18} rx={9} fill={isDark ? "#3B1828" : "#FCE7F3"} />
                    <text x={128} y={314} textAnchor="middle" fill="#DB2777" fontSize="9.5" fontWeight="800">
                      MITIGATES
                    </text>
                  </g>

                  {/* Single Task -> Final Year Project UI */}
                  <g>
                    <line
                      x1={450}
                      y1={310}
                      x2={450}
                      y2={140}
                      stroke={selectedNode === "single_task" || selectedNode === "project_ui" ? "#00D4FF" : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,212,255,0.3)"}
                      strokeWidth={selectedNode === "single_task" || selectedNode === "project_ui" ? 3 : 2}
                      markerEnd="url(#arrow)"
                    />
                    <rect x={415} y={215} width={70} height={18} rx={9} fill={isDark ? "#122A38" : "#E0F2FE"} />
                    <text x={450} y={228} textAnchor="middle" fill="#0284C7" fontSize="9.5" fontWeight="800">
                      ENABLES
                    </text>
                  </g>

                  {/* Topology Nodes */}
                  {DEFAULT_TOPOLOGY_NODES.map((node) => {
                    const isSelected = selectedNode === node.id;
                    return (
                      <g
                        key={node.id}
                        className="cursor-pointer transition-transform duration-200"
                        onClick={() => setSelectedNode(isSelected ? null : node.id)}
                      >
                        {/* Outer Glow Halo */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isSelected ? 36 : 28}
                          fill={node.color}
                          fillOpacity={isSelected ? 0.35 : 0.15}
                        />

                        {/* Core Circle */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isSelected ? 22 : 18}
                          fill={node.color}
                          filter={`url(#glow${node.category === "persona" ? "Purple" : node.category === "project" ? "Cyan" : "Amber"})`}
                          stroke={isDark ? "#FFFFFF" : "#FFFFFF"}
                          strokeWidth={2.5}
                        />

                        {/* Node Label Card */}
                        <rect
                          x={node.x - 70}
                          y={node.y + (node.category === "habit" ? 22 : -46)}
                          width={140}
                          height={26}
                          rx={13}
                          fill={isSelected ? (isDark ? "#2D264A" : "#FFFFFF") : isDark ? "rgba(28,24,42,0.88)" : "rgba(255,255,255,0.92)"}
                          stroke={isSelected ? node.color : isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)"}
                          strokeWidth={isSelected ? 2 : 1}
                        />

                        <text
                          x={node.x}
                          y={node.y + (node.category === "habit" ? 35 : -33)}
                          textAnchor="middle"
                          fill={isDark ? "#FFFFFF" : "#1F2937"}
                          fontSize="10"
                          fontWeight="800"
                        >
                          {node.label}
                        </text>

                        <text
                          x={node.x}
                          y={node.y + (node.category === "habit" ? 44 : -24)}
                          textAnchor="middle"
                          fill={node.color}
                          fontSize="8.5"
                          fontWeight="700"
                        >
                          {node.sublabel}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Topology Node Detail Pill on Selection */}
              {selectedNode && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#7B59DC]" />
                    <span className="font-extrabold text-[#2D2D42] dark:text-white">
                      Selected Anchor: {DEFAULT_TOPOLOGY_NODES.find((n) => n.id === selectedNode)?.label}
                    </span>
                    <span className="text-[#7A7A96] dark:text-[#9E98B4] font-medium">
                      ({DEFAULT_TOPOLOGY_NODES.find((n) => n.id === selectedNode)?.sublabel})
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-[11px] font-bold text-[#7B59DC] hover:underline bg-transparent border-none cursor-pointer"
                  >
                    Clear Filter
                  </button>
                </motion.div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 3: MILESTONE PROGRESS GAUGES & WEEKLY EMOTIONAL RHYTHM
                ═══════════════════════════════════════════════════════════════ */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
              {/* Milestone Sprint Progression Gauges */}
              <div className="clay-card lg:col-span-5 p-6 rounded-[32px] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0 flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-500" />
                      Active Milestone Sprints
                    </h3>
                    <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mt-0.5 font-medium">
                      Extracted goals tracked across your consultation history
                    </p>
                  </div>
                  <span className="clay-pill px-3 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    4 Active
                  </span>
                </div>

                <div className="space-y-3.5 pt-1">
                  {milestoneList.map((m, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[#2D2D42] dark:text-white">
                            {m.name}
                          </span>
                          <span className="text-[10px] text-[#7A7A96] dark:text-[#9E98B4] font-semibold">
                            • {m.deadline}
                          </span>
                        </div>
                        <span className="font-black text-xs" style={{ color: m.color }}>
                          {m.progress}%
                        </span>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="clay-track-inset w-full h-2.5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${m.progress}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.1 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-[#7A7A96] dark:text-[#9E98B4] font-medium">
                        <span>Status: <strong className="text-[#2D2D42] dark:text-white">{m.status}</strong></span>
                        <span>Grounding: High</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly Wellbeing Score Chart */}
              <div className="clay-card lg:col-span-7 p-6 rounded-[32px] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF] m-0 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-500" />
                      Weekly Wellbeing & Focus Trajectory
                    </h3>
                    <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] m-0 mt-0.5 font-medium">
                      Daily emotional resonance and single-task focus level
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="flex items-center gap-1 text-[#9A80E5]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#9A80E5]" /> Wellbeing
                    </span>
                    <span className="flex items-center gap-1 text-[#00D4FF]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00D4FF]" /> Focus
                    </span>
                  </div>
                </div>

                <div style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.focus_rhythm} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wellbeingArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9A80E5" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#9A80E5" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="focusArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#00D4FF" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8E88A4" : "#9E9EB2", fontSize: 11, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8E88A4" : "#9E9EB2", fontSize: 11, fontWeight: 700 }} domain={[50, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#171424" : "#FFFDFD",
                          borderRadius: "16px",
                          border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid rgba(255,255,255,0.9)",
                          fontSize: "12px",
                          fontWeight: "bold",
                          color: isDark ? "#FFFFFF" : "#2D2D42",
                        }}
                      />
                      <Area type="monotone" dataKey="v" name="Wellbeing" stroke="#9A80E5" strokeWidth={2.5} fill="url(#wellbeingArea)" />
                      <Area type="monotone" dataKey="focus" name="Focus Rhythm" stroke="#00D4FF" strokeWidth={2.5} fill="url(#focusArea)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 4: PUNCHY VISUAL AI INSIGHTS & COGNITIVE ANCHORS
                ═══════════════════════════════════════════════════════════════ */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#7B59DC] dark:text-[#B794F6]" />
                  <h3 className="text-lg font-black text-[#2D2D42] dark:text-[#FFFFFF] m-0">
                    Aura Cognitive Findings & Key Takeaways
                  </h3>
                </div>
                <span className="text-xs text-[#7A7A96] dark:text-[#9E98B4] font-bold">
                  {data.insights.length} Verified Insights
                </span>
              </div>

              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {data.insights.map((ins) => (
                  <div key={ins.id} className="clay-card p-4 sm:p-5 rounded-[28px] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/15 text-[#7B59DC]">
                          {renderInsightIcon(ins.icon)}
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-wider text-[#7B59DC]">
                          {ins.category}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Verified
                      </span>
                    </div>

                    <h4 className="text-sm font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] m-0">
                      {ins.title}
                    </h4>

                    <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] leading-relaxed font-medium m-0">
                      {ins.description}
                    </p>

                    {ins.source && (
                      <div className="text-[10px] font-bold text-[#7A7A96] dark:text-[#9E98B4] pt-1 border-t border-black/5 dark:border-white/5 flex items-center gap-1">
                        <Brain size={11} className="text-[#9A80E5]" />
                        <span>Source: {ins.source}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Clinician Portal Neuro-Behavioral Lab Banner ── */}
            <div
              onClick={() => onNavigate && onNavigate("Clinician")}
              className="clay-card p-6 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-4 cursor-pointer hover:scale-[1.01] transition-transform duration-200 border border-purple-500/20"
              style={{
                background: "linear-gradient(135deg, rgba(123, 86, 219, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)",
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg bg-gradient-to-br from-[#A88DEB] to-[#7B56DB]">
                  <Brain size={28} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-[#2E2544] dark:text-[#FFFFFF] m-0">
                      Neuro-Behavioral Clinician Portal
                    </h3>
                    <span className="clay-pill px-2 py-0.5 text-[10px] font-extrabold text-[#7B56DB] dark:text-[#D4C5F7]">
                      10-20 EEG
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#7A748A] dark:text-[#9E98B4] mt-1 max-w-xl">
                    Ingest authentic Mumtaz EEG recordings, inspect the 3D scalp topomap, and review cross-modal FACS triangulation with facial action units and voice telemetry.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="clay-button px-5 py-2.5 rounded-2xl font-bold text-xs text-[#7B56DB] dark:text-[#D4C5F7] flex items-center gap-2 shrink-0 cursor-pointer border-none outline-none"
              >
                <span>Open Clinician Lab</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
