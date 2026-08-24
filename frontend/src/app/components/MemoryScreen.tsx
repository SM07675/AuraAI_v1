import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Brain, Plus, Trash2, Edit2, Search, Target, Sparkles, Check, X } from "lucide-react";
import { GlassCard } from "./glass-card";

type MemoryItem = {
  id: number;
  type: string;
  key: string;
  value: string;
  importance: number;
  created_at: string;
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

  const fetchMemories = () => {
    setLoading(true);
    fetch("/api/v1/memory")
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data) => {
        setMemories(data.memories || []);
        setLoading(false);
      })
      .catch(() => {
        // Fallback default demo data if API unavailable
        setMemories([
          { id: 1, type: "goal", key: "Placement Preparation", value: "Preparing for software engineering campus placements", importance: 0.95, created_at: "2026-07-30T10:00:00Z" },
          { id: 2, type: "interest", key: "Football", value: "Enjoys playing and watching football on weekends", importance: 0.85, created_at: "2026-07-30T11:30:00Z" },
          { id: 3, type: "preference", key: "Communication Style", value: "Prefers direct, balanced feedback without heavy jargon", importance: 0.9, created_at: "2026-07-29T14:20:00Z" },
          { id: 4, type: "fact", key: "Name", value: "Rahul", importance: 1.0, created_at: "2026-07-28T09:15:00Z" },
        ]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleDelete = (id: number) => {
    fetch(`/api/v1/memory/${id}`, { method: "DELETE" })
      .then(() => setMemories((prev) => prev.filter((m) => m.id !== id)))
      .catch(() => setMemories((prev) => prev.filter((m) => m.id !== id)));
  };

  const handleSave = () => {
    if (!formKey.trim() || !formValue.trim()) return;

    if (editingId) {
      fetch(`/api/v1/memory/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: formType, key: formKey, value: formValue, importance: formImportance }),
      }).finally(() => {
        fetchMemories();
        closeModal();
      });
    } else {
      fetch("/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: formType, key: formKey, value: formValue, importance: formImportance }),
      }).finally(() => {
        fetchMemories();
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

  const filtered = memories.filter((m) => {
    const matchesType = filterType === "all" || m.type === filterType;
    const matchesQuery = !searchQuery || m.key.toLowerCase().includes(searchQuery.toLowerCase()) || m.value.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <div className="max-w-6xl mx-auto select-none px-2 sm:px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-2 clay-pill text-[#7B59DC] font-bold text-xs">
            <Sparkles size={13} className="text-[#9A80E5]" />
            AURA LONG-TERM MEMORY
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">Active Context & Preferences</h1>
          <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm mt-1 font-medium">
            Explicit goals, interests, facts, and communication parameters remembered by Aura across sessions.
          </p>
        </div>

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

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* Filters */}
        <div className="flex gap-2">
          {["all", "goal", "interest", "preference", "fact"].map((t) => (
            <motion.button
              key={t}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterType(t)}
              className={`capitalize px-4 py-1.5 text-xs font-bold transition-all cursor-pointer border-none outline-none ${
                filterType === t ? "clay-active-nav" : "clay-pill text-[#6B6B85] dark:text-[#9E98B4]"
              }`}
            >
              {t}
            </motion.button>
          ))}
        </div>

        {/* Search */}
        <div className="clay-pill relative w-64 flex items-center px-3 py-1.5">
          <Search size={14} className="text-[#9E9EB2] dark:text-[#6E6882] mr-2 shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories…"
            className="w-full bg-transparent border-none outline-none text-xs text-[#2D2D42] dark:text-[#E8E4F2] placeholder-[#9E9EB2] dark:placeholder-[#6E6882] font-medium"
          />
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="clay-card p-5 rounded-[28px]">
              <div className="flex items-center justify-between mb-3">
                <span className="clay-pill capitalize px-3 py-0.5 text-[10.5px] font-bold text-[#7B59DC]">
                  {m.type}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-white/20 rounded-lg text-[#7A7A96] dark:text-[#9E98B4] border-none cursor-pointer">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-500 border-none cursor-pointer">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <h4 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-sm mb-1">{m.key}</h4>
              <p className="text-[#6B6B85] dark:text-[#9E98B4] text-xs leading-relaxed mb-4 font-medium">{m.value}</p>

              {/* Importance Score Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10.5px] font-bold text-[#6B6B85] dark:text-[#9E98B4]">
                  <span>Importance Score</span>
                  <span className="text-[#7B59DC]">{Math.round(m.importance * 100)}%</span>
                </div>
                <div className="clay-track-inset h-2 w-full overflow-hidden">
                  <div className="clay-progress-fill h-full" style={{ width: `${Math.round(m.importance * 100)}%` }} />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="clay-card p-6 w-full max-w-[440px] rounded-[32px]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF]">{editingId ? "Edit Memory" : "Add Memory"}</h3>
              <button onClick={closeModal} className="p-1 text-[#9E9EB2] hover:text-[#2D2D42] dark:hover:text-white border-none cursor-pointer">
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
                  <option value="interest" className="bg-[#171424] text-[#E8E4F2]">Interest</option>
                  <option value="preference" className="bg-[#171424] text-[#E8E4F2]">Preference</option>
                  <option value="fact" className="bg-[#171424] text-[#E8E4F2]">Fact</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Title / Key</label>
                <input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. Placement Goal"
                  className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2]"
                  style={{ borderRadius: 16 }}
                />
              </div>

              <div>
                <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Detail / Value</label>
                <textarea
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder="Describe this memory item…"
                  rows={3}
                  className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2] resize-none"
                  style={{ borderRadius: 16 }}
                />
              </div>

              <div>
                <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Importance (0.1 - 1.0)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="1.0"
                  value={formImportance}
                  onChange={(e) => setFormImportance(parseFloat(e.target.value))}
                  className="clay-input w-full p-2.5 text-xs text-[#2D2D42] dark:text-[#E8E4F2]"
                  style={{ borderRadius: 16 }}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button onClick={closeModal} className="px-4 py-2 rounded-xl text-[#6B6B85] dark:text-[#9E98B4] font-bold border-none cursor-pointer hover:bg-white/10">
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
  );
}
