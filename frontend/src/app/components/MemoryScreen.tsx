import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  Plus,
  Trash2,
  Edit2,
  Search,
  Target,
  Sparkles,
  Check,
  X,
  Network,
  Database,
  TrendingUp,
  Compass,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Zap,
  Activity,
  Award,
  Calendar,
  Layers,
  Heart,
  Lightbulb,
} from "lucide-react";

type MemoryItem = {
  id: number;
  type: string;
  key: string;
  title?: string;
  value: string;
  category?: string;
  status?: string;
  sentiment?: string;
  importance: number;
  confidence?: number;
  version?: number;
  created_at?: string;
};

type GraphRelationship = {
  id?: number;
  source_name: string;
  target_name: string;
  relation_type: string;
  weight: number;
};

type Milestone = {
  id: number;
  title: string;
  category: string;
  progress: number;
  target_timeline: string;
  status: string;
  priority: string;
  notes: string;
};

type Breakthrough = {
  title: string;
  description: string;
  date: string;
  category?: string;
};

type CopingTool = {
  technique: string;
  benefit: string;
  category: string;
};

type InsightsData = {
  user_name: string;
  journey_summary: string;
  emotional_trajectory: {
    initial_state: string;
    current_state: string;
    resilience_score: number;
    anxiety_reduction: string;
    clarity_gain: string;
    stages: {
      stage: number;
      title: string;
      description: string;
      status: string;
    }[];
  };
  active_milestones: Milestone[];
  core_breakthroughs: Breakthrough[];
  personalized_toolkit: CopingTool[];
  stats: {
    total_memories: number;
    active_goals: number;
    sessions_completed: number;
    breakthroughs: number;
    resilience_rating: number;
  };
};

const CATEGORY_COLORS: Record<string, { pill: string; border: string; text: string }> = {
  "Goals & Milestones": {
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    border: "border-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  "Emotional Shifts": {
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    border: "border-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
  },
  "Coping Techniques": {
    pill: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    border: "border-cyan-500/20",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  "Workstyle & Strategy": {
    pill: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
    border: "border-purple-500/20",
    text: "text-purple-600 dark:text-purple-400",
  },
  "Durable Facts": {
    pill: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    border: "border-indigo-500/20",
    text: "text-indigo-600 dark:text-indigo-400",
  },
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  breakthrough: { label: "Breakthrough", cls: "bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30" },
  in_progress: { label: "In Progress", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/25" },
  practicing: { label: "Practicing Habit", cls: "bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/25" },
  active: { label: "Active Context", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/25" },
  achieved: { label: "Mastered", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/25" },
};

export function MemoryScreen() {
  const [viewMode, setViewMode] = useState<"insights" | "memories" | "graph">("insights");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [graphData, setGraphData] = useState<{ entities: any[]; relationships: GraphRelationship[] }>({
    entities: [],
    relationships: [],
  });
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Add / Edit state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formType, setFormType] = useState("goal");
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formImportance, setFormImportance] = useState(0.8);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [memRes, insRes, graphRes] = await Promise.all([
        fetch("/api/v1/memory").then((r) => (r.ok ? r.json() : { memories: [] })),
        fetch("/api/v1/memory/insights").then((r) => (r.ok ? r.json() : { insights: null })),
        fetch("/api/v1/memory/graph").then((r) => (r.ok ? r.json() : { entities: [], relationships: [] })),
      ]);

      setMemories(memRes.memories || []);
      setInsights(insRes.insights || null);
      setGraphData(graphRes || { entities: [], relationships: [] });
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = (id: number) => {
    fetch(`/api/v1/memory/${id}`, { method: "DELETE" })
      .then(() => setMemories((prev) => prev.filter((m) => m.id !== id)))
      .catch(() => setMemories((prev) => prev.filter((m) => m.id !== id)));
  };

  const handleSave = () => {
    if (!formKey.trim() || !formValue.trim()) return;

    const payload = {
      type: formType,
      key: formKey,
      value: formValue,
      importance: formImportance,
    };

    if (editingId) {
      fetch(`/api/v1/memory/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).finally(() => {
        fetchData();
        closeModal();
      });
    } else {
      fetch("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).finally(() => {
        fetchData();
        closeModal();
      });
    }
  };

  const openEdit = (m: MemoryItem) => {
    setEditingId(m.id);
    setFormType(m.type);
    setFormKey(m.key);
    setFormValue(m.value);
    setFormImportance(m.importance);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormKey("");
    setFormValue("");
    setFormImportance(0.8);
  };

  const filteredMemories = memories.filter((m) => {
    const category = m.category || "Durable Facts";
    const matchesCategory = filterCategory === "all" || category === filterCategory;
    const q = searchQuery.toLowerCase();
    const titleMatch = (m.title || m.key).toLowerCase().includes(q);
    const valueMatch = m.value.toLowerCase().includes(q);
    const keyMatch = m.key.toLowerCase().includes(q);
    return matchesCategory && (!searchQuery || titleMatch || valueMatch || keyMatch);
  });

  const categories = [
    "all",
    "Goals & Milestones",
    "Emotional Shifts",
    "Coping Techniques",
    "Workstyle & Strategy",
    "Durable Facts",
  ];

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-6 py-4 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-2 clay-pill text-[#7B59DC] font-bold text-xs">
              <Sparkles size={13} className="text-[#9A80E5]" />
              COGNITIVE MEMORY & USER PROGRESS ENGINE
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
              {insights?.user_name ? `${insights.user_name}'s Cognitive Memory & Growth` : "Cognitive Memory & Growth"}
            </h1>
            <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm mt-1 font-medium max-w-3xl">
              Understand the tangible progress you've made across sessions: emotional shifts, goal milestones, and durable personal insights.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
              <button
                onClick={() => setViewMode("insights")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  viewMode === "insights" ? "clay-active-nav text-[#7B59DC]" : "text-[#7A7A96] hover:text-[#2D2D42]"
                }`}
              >
                <TrendingUp size={13} /> Progress Insights
              </button>
              <button
                onClick={() => setViewMode("memories")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  viewMode === "memories" ? "clay-active-nav text-[#7B59DC]" : "text-[#7A7A96] hover:text-[#2D2D42]"
                }`}
              >
                <Database size={13} /> Memory Bank ({memories.length})
              </button>
              <button
                onClick={() => setViewMode("graph")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  viewMode === "graph" ? "clay-active-nav text-[#7B59DC]" : "text-[#7A7A96] hover:text-[#2D2D42]"
                }`}
              >
                <Network size={13} /> Topology ({graphData.relationships.length})
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                closeModal();
                setShowModal(true);
              }}
              className="clay-button flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#7B59DC]"
              style={{ borderRadius: 9999 }}
            >
              <Plus size={14} /> Add Fact
            </motion.button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            VIEW 1: PROGRESS & GROWTH INSIGHTS
            ═══════════════════════════════════════════════════════════════ */}
        {viewMode === "insights" && insights && (
          <div className="space-y-6">
            {/* Executive Progress Narrative Card */}
            <div className="clay-card p-6 sm:p-7 rounded-[32px] relative overflow-hidden space-y-5">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="space-y-2 max-w-3xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-300">
                    <Compass size={12} /> Executive Trajectory Summary
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-[#2D2D42] dark:text-[#FFFFFF] leading-snug">
                    {insights.journey_summary}
                  </h2>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="clay-card-flat p-4 rounded-2xl text-center min-w-[110px]">
                    <div className="text-2xl font-black text-[#7B59DC]">
                      {insights.emotional_trajectory.resilience_score}%
                    </div>
                    <div className="text-[10px] font-bold text-[#7A7A96] mt-0.5 uppercase tracking-wide">
                      Resilience Index
                    </div>
                  </div>
                  <div className="clay-card-flat p-4 rounded-2xl text-center min-w-[110px]">
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {insights.emotional_trajectory.anxiety_reduction}
                    </div>
                    <div className="text-[10px] font-bold text-[#7A7A96] mt-0.5 uppercase tracking-wide">
                      Anxiety Shift
                    </div>
                  </div>
                </div>
              </div>

              {/* Longitudinal Evolution Stages */}
              <div className="pt-2 border-t border-black/5 dark:border-white/10">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#7A7A96] dark:text-[#9E98B4] mb-3 flex items-center gap-2">
                  <TrendingUp size={13} className="text-[#7B59DC]" /> Longitudinal Evolution Arc
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {insights.emotional_trajectory.stages.map((stg, i) => (
                    <div
                      key={stg.stage}
                      className={`p-4 rounded-2xl border transition-all ${
                        stg.status === "active"
                          ? "bg-purple-500/10 border-purple-500/30 shadow-sm"
                          : "bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10.5px] font-black uppercase tracking-wider text-[#7A7A96]">
                          Phase {stg.stage}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                            stg.status === "active"
                              ? "bg-purple-500/20 text-purple-600 dark:text-purple-300"
                              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {stg.status === "active" ? "Current Focus" : "Integrated"}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-[#2D2D42] dark:text-white text-sm mb-1">{stg.title}</h4>
                      <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] leading-relaxed font-medium">
                        {stg.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Milestones & Goals Tracker */}
            <div className="clay-card p-6 rounded-[32px] space-y-4">
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-3">
                <div>
                  <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-base flex items-center gap-2">
                    <Target size={16} className="text-[#7B59DC]" /> Active Goals & Milestone Progression
                  </h3>
                  <p className="text-xs text-[#7A7A96] mt-0.5">
                    Extracted from your consultations and tracked across sessions.
                  </p>
                </div>
                <span className="clay-pill px-3 py-1 text-xs font-bold text-[#7B59DC]">
                  {insights.active_milestones.length} Goals Active
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.active_milestones.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                          {m.category}
                        </span>
                        <h4 className="font-extrabold text-[#2D2D42] dark:text-white text-sm mt-0.5">{m.title}</h4>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-[#7B59DC] border border-purple-500/20 shrink-0">
                        {m.target_timeline}
                      </span>
                    </div>

                    <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] font-medium leading-relaxed">
                      {m.notes}
                    </p>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[10.5px] font-bold text-[#6B6B85] dark:text-[#9E98B4]">
                        <span>Progress Confidence</span>
                        <span className="text-[#7B59DC] font-black">{m.progress}%</span>
                      </div>
                      <div className="clay-track-inset h-2 w-full overflow-hidden">
                        <div
                          className="clay-progress-fill h-full transition-all duration-700"
                          style={{ width: `${m.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakthroughs & Personalized Toolkit Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Breakthroughs Card */}
              <div className="clay-card p-6 rounded-[32px] space-y-4">
                <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-base flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" /> Key Cognitive Breakthroughs
                </h3>
                <div className="space-y-3">
                  {insights.core_breakthroughs.map((b, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/15 flex items-start gap-3"
                    >
                      <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                        <CheckCircle2 size={15} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-extrabold text-xs text-[#2D2D42] dark:text-white">{b.title}</h4>
                          <span className="text-[10px] font-bold text-[#7A7A96]">{b.date}</span>
                        </div>
                        <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] font-medium mt-1 leading-relaxed">
                          {b.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Personalized Toolkit */}
              <div className="clay-card p-6 rounded-[32px] space-y-4">
                <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-base flex items-center gap-2">
                  <ShieldCheck size={16} className="text-teal-500" /> Personalized Coping Toolkit
                </h3>
                <div className="space-y-3">
                  {insights.personalized_toolkit.map((tool, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-teal-500/5 border border-teal-500/15 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-[#2D2D42] dark:text-white">
                            {tool.technique}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-300">
                            {tool.category}
                          </span>
                        </div>
                        <p className="text-xs text-[#6B6B85] dark:text-[#9E98B4] font-medium">
                          {tool.benefit}
                        </p>
                      </div>
                      <span className="text-xs text-teal-600 font-bold shrink-0 pt-0.5">Active Habit</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            VIEW 2: STRUCTURED MEMORY BANK
            ═══════════════════════════════════════════════════════════════ */}
        {viewMode === "memories" && (
          <div className="space-y-5">
            {/* Filters & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilterCategory(c)}
                    className={`capitalize px-3 py-1.5 text-xs font-bold transition-all cursor-pointer border-none outline-none rounded-xl ${
                      filterCategory === c
                        ? "clay-active-nav text-[#7B59DC]"
                        : "clay-pill text-[#6B6B85] dark:text-[#9E98B4]"
                    }`}
                  >
                    {c === "all" ? "All Memories" : c}
                  </button>
                ))}
              </div>

              <div className="clay-pill relative w-72 flex items-center px-3 py-1.5">
                <Search size={14} className="text-[#9E9EB2] dark:text-[#6E6882] mr-2 shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search insights, goals, notes…"
                  className="w-full bg-transparent border-none outline-none text-xs text-[#2D2D42] dark:text-[#E8E4F2] placeholder-[#9E9EB2] dark:placeholder-[#6E6882] font-medium"
                />
              </div>
            </div>

            {/* Grid of Readable Insight Cards */}
            {loading ? (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className="clay-card p-5 rounded-[28px] space-y-3 min-h-[160px] flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <div className="clay-shimmer w-20 h-5 rounded-full bg-slate-200 dark:bg-slate-700/40" />
                      <div className="clay-shimmer w-16 h-5 rounded-md bg-slate-200 dark:bg-slate-700/40" />
                    </div>
                    <div className="space-y-2">
                      <div className="clay-shimmer w-3/4 h-4 rounded-md bg-slate-200 dark:bg-slate-700/40" />
                      <div className="clay-shimmer w-full h-3 rounded-md bg-slate-200 dark:bg-slate-700/40" />
                    </div>
                    <div className="clay-shimmer w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700/40" />
                  </div>
                ))}
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="clay-card p-8 rounded-[28px] text-center max-w-md mx-auto my-8">
                <Brain size={44} className="mx-auto text-[#9A80E5] mb-3 opacity-80" />
                <h3 className="text-base font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] mb-1">
                  No Memories Match Search
                </h3>
                <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] leading-relaxed">
                  Try adjusting your search query or switching categories.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredMemories.map((m, idx) => {
                  const cat = m.category || "Durable Facts";
                  const colorTheme = CATEGORY_COLORS[cat] || CATEGORY_COLORS["Durable Facts"];
                  const statusInfo = STATUS_BADGES[m.status || "active"] || STATUS_BADGES.active;

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 450, damping: 25, delay: idx * 0.03 }}
                    >
                      <div className="clay-card p-5 rounded-[28px] space-y-3.5 flex flex-col justify-between h-full border border-black/5 dark:border-white/10 hover:shadow-md transition-all">
                        {/* Top Pills */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colorTheme.pill}`}>
                              {cat}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border ${statusInfo.cls}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEdit(m)}
                              className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-[#7A7A96] border-none cursor-pointer"
                              title="Edit Memory"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500 border-none cursor-pointer"
                              title="Delete Memory"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Title & Readable Value */}
                        <div className="space-y-1.5 flex-1">
                          <h4 className="font-black text-[#2D2D42] dark:text-[#FFFFFF] text-sm leading-snug">
                            {m.title || m.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </h4>
                          <p className="text-[#55556E] dark:text-[#CBC4DF] text-xs leading-relaxed font-medium">
                            {m.value}
                          </p>
                        </div>

                        {/* Importance Score Bar */}
                        <div className="space-y-1.5 pt-2 border-t border-black/5 dark:border-white/5">
                          <div className="flex justify-between text-[10px] font-bold text-[#7A7A96] dark:text-[#9E98B4]">
                            <span>Significance & Priority</span>
                            <span className="text-[#7B59DC] font-black">{Math.round(m.importance * 100)}%</span>
                          </div>
                          <div className="clay-track-inset h-1.5 w-full overflow-hidden">
                            <div
                              className="clay-progress-fill h-full"
                              style={{ width: `${Math.round(m.importance * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            VIEW 3: KNOWLEDGE GRAPH TOPOLOGY
            ═══════════════════════════════════════════════════════════════ */}
        {viewMode === "graph" && (
          <div className="clay-card p-6 space-y-4 rounded-[28px]">
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-3">
              <div>
                <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                  <Network size={16} className="text-[#7B59DC]" /> Verified Entity Relationships (Knowledge Graph)
                </h3>
                <p className="text-xs text-[#7A7A96] mt-0.5">
                  Directed multi-hop facts used for hybrid context retrieval.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-600">
                {graphData.relationships.length} Relationships Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {graphData.relationships.map((r, idx) => (
                <div
                  key={r.id || idx}
                  className="clay-card-flat p-3.5 rounded-2xl flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-[#2D2D42] dark:text-white">{r.source_name}</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#7B59DC]/15 text-[#7B59DC] font-black text-[10.5px]">
                      —[{r.relation_type}]→
                    </span>
                    <span className="font-extrabold text-[#2D2D42] dark:text-white">{r.target_name}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold px-2 py-0.5 rounded bg-emerald-500/10 shrink-0">
                    weight={r.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div className="clay-card p-6 w-full max-w-[460px] rounded-[32px] max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF]">
                  {editingId ? "Edit Memory Item" : "Add Memory / Fact"}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-1 text-[#9E9EB2] hover:text-[#2D2D42] dark:hover:text-white border-none cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Memory Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2]"
                    style={{ borderRadius: 16 }}
                  >
                    <option value="goal" className="bg-[#171424] text-[#E8E4F2]">Goal</option>
                    <option value="preference" className="bg-[#171424] text-[#E8E4F2]">Preference</option>
                    <option value="fact" className="bg-[#171424] text-[#E8E4F2]">Fact</option>
                    <option value="interest" className="bg-[#171424] text-[#E8E4F2]">Interest</option>
                    <option value="project" className="bg-[#171424] text-[#E8E4F2]">Project</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Identifier / Title</label>
                  <input
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    placeholder="e.g. project_deadline or Calm UI Vision"
                    className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2]"
                    style={{ borderRadius: 16 }}
                  />
                </div>

                <div>
                  <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Readable Insight / Fact</label>
                  <textarea
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="Describe the actionable insight or detail..."
                    rows={4}
                    className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2] resize-none"
                    style={{ borderRadius: 16 }}
                  />
                </div>

                <div>
                  <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Importance (0.1 - 1.0)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    value={formImportance}
                    onChange={(e) => setFormImportance(parseFloat(e.target.value))}
                    className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2]"
                    style={{ borderRadius: 16 }}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-[#6B6B85] dark:text-[#9E98B4] font-bold border-none cursor-pointer hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSave}
                    className="clay-button px-5 py-2 rounded-xl text-[#7B59DC] font-bold cursor-pointer"
                  >
                    Save Memory
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
