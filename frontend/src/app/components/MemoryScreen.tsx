import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  Plus,
  Trash2,
  Edit2,
  Search,
  Target,
  Sparkles,
  Heart,
  Check,
  X,
  Layers,
  Network,
  Calendar,
  AlertTriangle,
} from "lucide-react";

type MemoryItem = {
  id: number;
  type: string;
  key: string;
  value: string;
  importance: number;
  confidence?: number;
  version?: number;
  created_at: string;
};

type GraphRelationship = {
  id: number;
  source_name: string;
  target_name: string;
  relation_type: string;
  weight: number;
};

export function MemoryScreen() {
  const [viewMode, setViewMode] = useState<"memories" | "graph">("memories");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [graphData, setGraphData] = useState<{ entities: any[]; relationships: GraphRelationship[] }>({
    entities: [],
    relationships: [],
  });
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Add / Edit state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formType, setFormType] = useState("goal");
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formImportance, setFormImportance] = useState(0.8);

  // Deletion Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const fetchMemories = () => {
    setLoading(true);
    fetch("/api/v1/memory")
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data) => {
        setMemories(data.memories || []);
      })
      .catch(() => {
        setMemories([]);
      });

    fetch("/api/v1/memory/graph")
      .then((res) => res.json())
      .then((data) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(() => {
        setGraphData({ entities: [], relationships: [] });
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleDelete = (id: number) => {
    fetch(`/api/v1/memory/${id}`, { method: "DELETE" })
      .then(() => {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        setDeleteConfirmId(null);
      })
      .catch(() => {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        setDeleteConfirmId(null);
      });
  };

  const handleSave = () => {
    if (!formKey.trim() || !formValue.trim()) return;

    if (editingId) {
      fetch(`/api/v1/memory/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          key: formKey,
          value: formValue,
          importance: formImportance,
        }),
      }).finally(() => {
        fetchMemories();
        closeModal();
      });
    } else {
      fetch("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          key: formKey,
          value: formValue,
          importance: formImportance,
        }),
      }).finally(() => {
        fetchMemories();
        closeModal();
      });
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormType("goal");
    setFormKey("");
    setFormValue("");
    setFormImportance(0.8);
    setShowModal(true);
  };

  const openEditModal = (item: MemoryItem) => {
    setEditingId(item.id);
    setFormType(item.type);
    setFormKey(item.key);
    setFormValue(item.value);
    setFormImportance(item.importance || 0.8);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const filteredMemories = memories.filter((m) => {
    const matchesFilter = filterType === "all" || m.type.toLowerCase() === filterType.toLowerCase();
    const matchesSearch =
      m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.value.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "goal":
        return <Target size={16} className="text-emerald-400" />;
      case "preference":
        return <Heart size={16} className="text-pink-400" />;
      case "habit":
        return <Sparkles size={16} className="text-cyan-400" />;
      default:
        return <Brain size={16} className="text-violet-400" />;
    }
  };

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-3 sm:px-6 py-4 pb-28">
      <div className="max-w-[1060px] mx-auto flex flex-col gap-6">
        {/* ── Top Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 dark:text-white m-0 tracking-tight">
              Cognitive Memory
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 m-0">
              Long-term personal context and insights preserved across conversations
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher: Memories vs Graph */}
            <div className="liquid-glass p-1 rounded-2xl flex items-center gap-1">
              <button
                onClick={() => setViewMode("memories")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border-none outline-none transition-all ${
                  viewMode === "memories"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-slate-400 hover:text-white bg-transparent"
                }`}
              >
                Memories
              </button>
              <button
                onClick={() => setViewMode("graph")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border-none outline-none transition-all ${
                  viewMode === "graph"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-slate-400 hover:text-white bg-transparent"
                }`}
              >
                Knowledge Graph
              </button>
            </div>

            {/* Add Memory Button */}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={openAddModal}
              className="liquid-button-primary px-4 py-2 text-xs gap-1.5"
            >
              <Plus size={15} />
              <span>Add Memory</span>
            </motion.button>
          </div>
        </div>

        {/* ── Search & Filter Controls ── */}
        {viewMode === "memories" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="liquid-input flex items-center gap-2 px-3.5 py-2 max-w-md w-full">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search memories and preferences..."
                className="bg-transparent border-none outline-none text-xs text-slate-800 dark:text-white placeholder:text-slate-400 w-full font-medium"
              />
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap gap-2">
              {["all", "goal", "preference", "habit", "insight"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`liquid-pill px-3 py-1 text-xs capitalize cursor-pointer border transition-colors ${
                    filterType === t
                      ? "liquid-pill-active text-violet-300 border-violet-400/50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Memories List Canvas ── */}
        {viewMode === "memories" ? (
          <div>
            {filteredMemories.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {filteredMemories.map((m) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="liquid-card-opaque p-5 flex flex-col justify-between group hover:border-violet-400/30 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl liquid-button flex items-center justify-center shrink-0">
                            {getTypeIcon(m.type)}
                          </div>
                          <div>
                            <span className="text-[14px] font-bold text-slate-900 dark:text-white capitalize">
                              {m.key}
                            </span>
                            <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                              {m.type}
                            </span>
                          </div>
                        </div>

                        {/* Actions: Edit & Delete */}
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(m)}
                            className="w-7 h-7 rounded-lg liquid-button text-slate-400 hover:text-violet-400"
                            title="Edit memory"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(m.id)}
                            className="w-7 h-7 rounded-lg liquid-button text-slate-400 hover:text-rose-400"
                            title="Delete memory"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed mt-2 m-0 font-normal">
                        {m.value}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/10 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <span className="font-semibold text-violet-400">
                        Importance: {Math.round((m.importance || 0.8) * 100)}%
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="liquid-card p-12 flex flex-col items-center justify-center text-center">
                <Brain size={36} className="text-slate-400 mb-3 opacity-50" />
                <h3 className="text-[16px] font-bold text-slate-800 dark:text-white m-0">
                  No memories found
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {searchQuery
                    ? "No memories match your query. Try a different search."
                    : "Aura has not saved any memories yet. As you converse, personal facts will be cataloged here."}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ── Knowledge Graph View ── */
          <div className="liquid-card-opaque p-6 min-h-[420px] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Network size={17} className="text-cyan-400" />
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white m-0">
                  Relational Knowledge Graph
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                {graphData.entities.length} Nodes · {graphData.relationships.length} Edges
              </span>
            </div>

            {graphData.relationships.length > 0 ? (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 my-auto">
                {graphData.relationships.map((r) => (
                  <div key={r.id} className="liquid-card-subtle p-3 text-xs">
                    <span className="font-bold text-violet-300">{r.source_name}</span>
                    <span className="text-slate-400 mx-2">→ {r.relation_type} →</span>
                    <span className="font-bold text-cyan-300">{r.target_name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-8 my-auto">
                <Layers size={32} className="text-slate-400 mb-2 opacity-50" />
                <p className="text-xs text-slate-400 max-w-xs m-0">
                  Not enough relational links extracted yet. Continued dialogue will build an interactive knowledge graph.
                </p>
              </div>
            )}

            <div className="pt-3 border-t border-white/10 dark:border-white/5 text-[11px] text-slate-400">
              Extracted via Cognitive Memory Engine
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal Sheet ── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative z-10 liquid-glass-elevated rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-white/20"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <h3 className="text-[17px] font-bold text-slate-900 dark:text-white m-0">
                  {editingId ? "Edit Memory" : "Add New Memory"}
                </h3>
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-full liquid-button text-slate-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Category
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="liquid-input w-full px-3 py-2 text-xs text-slate-800 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="goal" className="dark:bg-slate-900">Goal</option>
                    <option value="preference" className="dark:bg-slate-900">Preference</option>
                    <option value="habit" className="dark:bg-slate-900">Habit</option>
                    <option value="insight" className="dark:bg-slate-900">Insight</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Key / Title
                  </label>
                  <input
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    placeholder="e.g., Morning Meditation"
                    className="liquid-input w-full px-3 py-2 text-xs text-slate-800 dark:text-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Value / Detail
                  </label>
                  <textarea
                    rows={3}
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="e.g., Enjoys 10 minutes of box breathing before work"
                    className="liquid-input w-full px-3 py-2 text-xs text-slate-800 dark:text-white outline-none custom-scrollbar resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 mt-2 pt-2 border-t border-white/10">
                  <button
                    onClick={closeModal}
                    className="liquid-button px-4 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formKey.trim() || !formValue.trim()}
                    className="liquid-button-primary px-5 py-2 text-xs disabled:opacity-50"
                  >
                    Save Memory
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Destructive Deletion Confirmation Dialog ── */}
      <AnimatePresence>
        {deleteConfirmId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 liquid-glass-elevated rounded-[24px] max-w-sm w-full p-6 shadow-2xl border border-rose-500/30 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                Confirm Deletion
              </h3>
              <p className="text-xs text-slate-400 mt-2 m-0 leading-relaxed">
                Are you sure you want to delete this memory? This action removes it permanently from your cognitive profile.
              </p>

              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="liquid-button px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer border-none shadow-lg shadow-rose-900/40"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
