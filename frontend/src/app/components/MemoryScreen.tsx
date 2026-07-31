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
      .then((res) => res.json())
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
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Memory Timeline</h2>
          <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6 }}>
            Long-term facts, goals, interests, and emotional context learned by Aura.
          </p>
        </div>
        <button
          onClick={() => {
            closeModal();
            setShowModal(true);
          }}
          className="flex items-center gap-2 rounded-full px-5 py-3 text-white font-semibold text-sm shadow-lg shadow-blue-500/30"
          style={{ background: "linear-gradient(135deg,#2458FF,#00C6FF)" }}
        >
          <Plus size={18} />
          Add Memory
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* Filters */}
        <div className="flex gap-2">
          {["all", "goal", "interest", "preference", "fact"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className="capitalize rounded-full px-4 py-1.5 text-xs font-semibold transition-all border"
              style={
                filterType === t
                  ? { background: "#2458FF", color: "#fff", borderColor: "#2458FF" }
                  : { background: "rgba(255,255,255,0.6)", color: "#475569", borderColor: "rgba(255,255,255,0.8)" }
              }
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories…"
            className="w-full rounded-full pl-9 pr-4 py-2 bg-white/70 border border-white/80 outline-none text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {filtered.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard style={{ padding: 20 }}>
              <div className="flex items-center justify-between mb-3">
                <span className="capitalize px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">
                  {m.type}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <h4 className="font-bold text-slate-900 text-base mb-1">{m.key}</h4>
              <p className="text-slate-600 text-xs leading-relaxed mb-4">{m.value}</p>

              {/* Importance Score Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-slate-500">
                  <span>Importance Score</span>
                  <span className="font-bold text-blue-600">{Math.round(m.importance * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.round(m.importance * 100)}%` }} />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <GlassCard style={{ width: 440, padding: 28 }} hover={false}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-slate-900">{editingId ? "Edit Memory" : "Add Memory"}</h3>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Memory Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full rounded-xl p-2.5 bg-white/80 border border-slate-200 text-slate-800 outline-none"
                >
                  <option value="goal">Goal</option>
                  <option value="interest">Interest</option>
                  <option value="preference">Preference</option>
                  <option value="fact">Fact</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Title / Key</label>
                <input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. Placement Goal"
                  className="w-full rounded-xl p-2.5 bg-white/80 border border-slate-200 text-slate-800 outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Detail / Value</label>
                <textarea
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder="Describe this memory item…"
                  rows={3}
                  className="w-full rounded-xl p-2.5 bg-white/80 border border-slate-200 text-slate-800 outline-none resize-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Importance (0.1 - 1.0)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="1.0"
                  value={formImportance}
                  onChange={(e) => setFormImportance(parseFloat(e.target.value))}
                  className="w-full rounded-xl p-2.5 bg-white/80 border border-slate-200 text-slate-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button onClick={closeModal} className="px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-100">
                  Cancel
                </button>
                <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/30">
                  Save Memory
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
