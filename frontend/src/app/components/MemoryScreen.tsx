import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Plus, Trash2, Edit2, Search, Target, Sparkles, Check, X, Network, Database, Layers } from "lucide-react";
import { GlassCard } from "./glass-card";

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
  const [graphData, setGraphData] = useState<{ entities: any[]; relationships: GraphRelationship[] }>({ entities: [], relationships: [] });
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
      })
      .catch(() => {
        setMemories([
          { id: 1, type: "goal", key: "Placement Preparation", value: "Preparing for software engineering campus placements", importance: 0.95, confidence: 0.95, version: 1, created_at: "2026-07-30T10:00:00Z" },
          { id: 2, type: "interest", key: "Football", value: "Enjoys playing and watching football on weekends", importance: 0.85, confidence: 0.9, version: 1, created_at: "2026-07-30T11:30:00Z" },
          { id: 3, type: "preference", key: "Communication Style", value: "Prefers direct, balanced feedback without heavy jargon", importance: 0.9, confidence: 0.95, version: 1, created_at: "2026-07-29T14:20:00Z" },
          { id: 4, type: "project", key: "Aura AI", value: "Building Aura AI real-time wellness companion", importance: 1.0, confidence: 1.0, version: 1, created_at: "2026-07-28T09:15:00Z" },
        ]);
      });

    fetch("/api/v1/memory/graph")
      .then((res) => res.json())
      .then((data) => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(() => {
        setGraphData({
          entities: [
            { id: 1, name: "User", entity_type: "USER" },
            { id: 2, name: "Aura AI", entity_type: "PROJECT" },
            { id: 3, name: "NVIDIA NIM", entity_type: "TECHNOLOGY" },
            { id: 4, name: "Placement Preparation", entity_type: "GOAL" },
          ],
          relationships: [
            { id: 1, source_name: "User", target_name: "Aura AI", relation_type: "WORKING_ON", weight: 0.95 },
            { id: 2, source_name: "Aura AI", target_name: "NVIDIA NIM", relation_type: "USES", weight: 0.9 },
            { id: 3, source_name: "User", target_name: "Placement Preparation", relation_type: "HAS_GOAL", weight: 1.0 },
          ]
        });
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
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-6 py-4 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-2 clay-pill text-[#7B59DC] font-bold text-xs">
              <Sparkles size={13} className="text-[#9A80E5]" />
              7-LAYER MEMORY & KNOWLEDGE GRAPH
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
              Memory & Knowledge Topology
            </h1>
            <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm mt-1 font-medium">
              Durable user facts, semantic memory embeddings, and real entity relationships connected across sessions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex gap-1.5 p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
              <button
                onClick={() => setViewMode("memories")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  viewMode === "memories" ? "clay-active-nav text-[#7B59DC]" : "text-[#7A7A96] hover:text-[#2D2D42]"
                }`}
              >
                <Database size={13} /> Memories ({memories.length})
              </button>
              <button
                onClick={() => setViewMode("graph")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                  viewMode === "graph" ? "clay-active-nav text-[#7B59DC]" : "text-[#7A7A96] hover:text-[#2D2D42]"
                }`}
              >
                <Network size={13} /> Graph ({graphData.relationships.length})
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                closeModal();
                setShowModal(true);
              }}
              className="clay-button flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#7B59DC]"
              style={{ borderRadius: 9999 }}
            >
              <Plus size={15} /> Add Memory
            </motion.button>
          </div>
        </div>

        {/* View Mode 1: Durable Memories */}
        {viewMode === "memories" && (
          <>
            {/* Filters & Search */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-2">
                {["all", "goal", "interest", "preference", "project", "fact"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`capitalize px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer border-none outline-none rounded-xl ${
                      filterType === t ? "clay-active-nav text-[#7B59DC]" : "clay-pill text-[#6B6B85] dark:text-[#9E98B4]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="clay-pill relative w-64 flex items-center px-3 py-1.5">
                <Search size={14} className="text-[#9E9EB2] dark:text-[#6E6882] mr-2 shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search semantic memories…"
                  className="w-full bg-transparent border-none outline-none text-xs text-[#2D2D42] dark:text-[#E8E4F2] placeholder-[#9E9EB2] dark:placeholder-[#6E6882] font-medium"
                />
              </div>
            </div>

            {/* Timeline Grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="clay-card p-5 rounded-[28px] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="clay-pill capitalize px-3 py-0.5 text-[10.5px] font-bold text-[#7B59DC]">
                          {m.type}
                        </span>
                        {m.version && (
                          <span className="text-[10px] text-[#7A7A96] font-mono">v{m.version}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-[#7A7A96] border-none cursor-pointer">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500 border-none cursor-pointer">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-sm mb-1">{m.key}</h4>
                      <p className="text-[#6B6B85] dark:text-[#9E98B4] text-xs leading-relaxed font-medium">{m.value}</p>
                    </div>

                    {/* Importance Score Bar */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10.5px] font-bold text-[#6B6B85] dark:text-[#9E98B4]">
                        <span>Importance & Semantic Weight</span>
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
          </>
        )}

        {/* View Mode 2: Knowledge Graph View */}
        {viewMode === "graph" && (
          <div className="clay-card p-6 space-y-4" style={{ borderRadius: 28 }}>
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-3">
              <div>
                <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                  <Network size={16} className="text-[#7B59DC]" /> Verified Entity Relationships (Knowledge Graph)
                </h3>
                <p className="text-xs text-[#7A7A96] mt-0.5">Directed multi-hop facts used for hybrid context retrieval.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-600">
                {graphData.relationships.length} Relationships Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {graphData.relationships.map((r, idx) => (
                <div key={r.id || idx} className="clay-card-flat p-3.5 rounded-2xl flex items-center justify-between text-xs font-mono">
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
            <div className="clay-card p-6 w-full max-w-[440px] rounded-[32px] max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-extrabold text-base text-[#2D2D42] dark:text-[#FFFFFF]">
                  {editingId ? "Edit Memory" : "Add Memory"}
                </h3>
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
                    <option value="project" className="bg-[#171424] text-[#E8E4F2]">Project</option>
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
    </div>
  );
}
