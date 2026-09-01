import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Brain, Plus, Trash2, Edit2, Search, Target, Sparkles, Check, X, RefreshCw } from "lucide-react";
import { GlassCard } from "./glass-card";
import { apiClient } from "../services/apiClient";

type MemoryItem = {
  id: number;
  type: string;
  key: string;
  value: string;
  importance: number;
  created_at: string | null;
};

export function MemoryScreen() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
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
  const [saving, setSaving] = useState(false);

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<{ memories: MemoryItem[] }>("/api/v1/memory");
      setMemories(data?.memories || []);
    } catch (err) {
      console.warn("Failed to load memories:", err);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleDelete = async (id: number) => {
    // Optimistic removal
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      await apiClient.delete(`/api/v1/memory/${id}`);
    } catch (err) {
      console.warn("Delete memory failed:", err);
      fetchMemories();
    }
  };

  const handleSave = async () => {
    if (!formKey.trim() || !formValue.trim()) return;
    setSaving(true);

    try {
      if (editingId) {
        await apiClient.put(`/api/v1/memory/${editingId}`, {
          type: formType,
          key: formKey,
          value: formValue,
          importance: formImportance,
        });
      } else {
        await apiClient.post("/api/v1/memory", {
          type: formType,
          key: formKey,
          value: formValue,
          importance: formImportance,
        });
      }
      await fetchMemories();
      closeModal();
    } catch (err) {
      console.warn("Save memory error:", err);
    } finally {
      setSaving(false);
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

  const filtered = memories.filter((m) => {
    const matchesType = filterType === "all" || m.type.toLowerCase() === filterType.toLowerCase();
    const matchesQuery =
      !searchQuery ||
      m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.value.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-4 py-3 pb-32">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-2 clay-pill text-[#7B59DC] font-bold text-xs">
              <Sparkles size={13} className="text-[#9A80E5]" />
              AURA LONG-TERM MEMORY
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
              Active Context & Preferences
            </h1>
            <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm mt-1 font-medium">
              Explicit goals, interests, facts, and communication parameters remembered by Aura across sessions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchMemories}
              title="Refresh Memories"
              className="p-2.5 rounded-full clay-button text-[#7B59DC] cursor-pointer border-none outline-none flex items-center justify-center"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                closeModal();
                setShowModal(true);
              }}
              className="clay-button flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-[#7B59DC]"
              style={{ borderRadius: 9999 }}
            >
              <Plus size={16} />
              Add Memory
            </motion.button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {["all", "goal", "interest", "preference", "fact"].map((t) => (
              <motion.button
                key={t}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilterType(t)}
                className={`capitalize px-4 py-1.5 text-xs font-bold transition-all cursor-pointer border-none outline-none rounded-xl ${
                  filterType === t ? "clay-active-nav" : "clay-pill text-[#6B6B85] dark:text-[#9E98B4]"
                }`}
              >
                {t}
              </motion.button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9E9EB2]" />
            <input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="clay-input w-full pl-9 pr-4 py-1.5 text-xs font-semibold rounded-full"
            />
          </div>
        </div>

        {/* Content State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#7A7A96] dark:text-[#9E98B4]">
            <div className="w-8 h-8 border-3 border-[#7B59DC] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Retrieving cognitive memories...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="clay-card p-12 text-center rounded-[32px] flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-[#7B59DC] mb-4">
              <Brain size={28} />
            </div>
            <h3 className="text-lg font-bold text-[#2D2D42] dark:text-[#FFFFFF] mb-1">
              {searchQuery ? "No matching memories found" : "No memories stored yet"}
            </h3>
            <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] max-w-sm mb-6">
              {searchQuery
                ? "Try searching for a different keyword or switch categories."
                : "Aura learns your preferences, goals, and interests automatically during conversation, or you can add them manually above."}
            </p>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                closeModal();
                setShowModal(true);
              }}
              className="clay-button px-6 py-2.5 text-xs font-bold text-[#7B59DC] rounded-full"
            >
              Add First Memory
            </motion.button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="clay-card p-5 rounded-[24px] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="capitalize text-[10px] font-extrabold px-2.5 py-0.5 rounded-full clay-pill text-[#7B59DC] dark:text-[#C7B5F3]">
                      {m.type}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#7A7A96] dark:text-[#9E98B4]">
                        {Math.round(m.importance * 100)}%
                      </span>
                      <div className="w-12 h-1.5 rounded-full bg-[#EAE2E6] dark:bg-[#100E1A] overflow-hidden">
                        <div
                          className="h-full bg-[#7B59DC] rounded-full"
                          style={{ width: `${Math.min(100, Math.max(10, m.importance * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-[#2D2D42] dark:text-[#FFFFFF] mb-1.5 line-clamp-1">
                    {m.key}
                  </h3>
                  <p className="text-xs text-[#6B6B85] dark:text-[#C7B5F3] font-medium leading-relaxed">
                    {m.value}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-black/5 dark:border-white/5">
                  <span className="text-[10px] font-medium text-[#9E9EB2]">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : "Active Context"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(m)}
                      className="p-1.5 text-[#9E9EB2] hover:text-[#7B59DC] transition-colors border-none bg-transparent cursor-pointer"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-1.5 text-[#9E9EB2] hover:text-rose-500 transition-colors border-none bg-transparent cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="clay-card p-6 rounded-[28px] w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[#2D2D42] dark:text-[#FFFFFF]">
                  {editingId ? "Edit Memory Item" : "Create New Memory"}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-1 text-[#9E9EB2] hover:text-[#2D2D42] dark:hover:text-white border-none bg-transparent cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="clay-input w-full px-3 py-2 text-xs font-semibold rounded-xl"
                  >
                    <option value="goal">Goal</option>
                    <option value="interest">Interest</option>
                    <option value="preference">Preference</option>
                    <option value="fact">Fact</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1">
                    Label / Key
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Placement Exam Prep, Morning Routine"
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    className="clay-input w-full px-3 py-2 text-xs font-semibold rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1">
                    Details & Value
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe the context or preference Aura should recall..."
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    className="clay-input w-full px-3 py-2 text-xs font-semibold rounded-xl resize-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider">
                      Importance
                    </label>
                    <span className="text-xs font-bold text-[#7B59DC]">
                      {Math.round(formImportance * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={formImportance}
                    onChange={(e) => setFormImportance(parseFloat(e.target.value))}
                    className="w-full accent-[#7B59DC]"
                  />
                </div>

                <div className="flex gap-2 justify-end mt-3">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-xs font-bold text-[#7A7A96] hover:text-[#2D2D42] dark:hover:text-white border-none bg-transparent cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formKey.trim() || !formValue.trim()}
                    className="clay-button px-5 py-2 text-xs font-bold text-[#7B59DC] rounded-full cursor-pointer"
                  >
                    {saving ? "Saving..." : editingId ? "Update Memory" : "Save Memory"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
