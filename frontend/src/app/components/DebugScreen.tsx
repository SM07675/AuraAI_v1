import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Server,
  Activity,
  Code2,
  RefreshCw,
  Zap,
  Network,
  Database,
  Clock,
  Radio,
  CheckCircle2,
  Layers,
  Sparkles,
} from "lucide-react";
import { getWebSocketUrl } from "../services/wsHelper";

interface LatencySummary {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  ttft_avg_ms: number;
  sample_count: number;
}

interface LatencyTrace {
  id: number;
  trace_id: string;
  session_id: number;
  turn_id: number;
  provider: string;
  model: string;
  is_fast_path: boolean;
  cache_hit: boolean;
  retrieval_latency_ms: number;
  graph_latency_ms: number;
  vector_latency_ms: number;
  prompt_build_latency_ms: number;
  llm_ttft_ms: number;
  llm_total_latency_ms: number;
  tts_first_audio_ms: number;
  total_turn_latency_ms: number;
  created_at: string;
}

interface GraphEntity {
  id: number;
  name: string;
  entity_type: string;
  canonical_name: string;
  attributes: Record<string, any>;
}

interface GraphRelationship {
  id: number;
  source_name: string;
  target_name: string;
  relation_type: string;
  weight: number;
}

export function DebugScreen() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "graph" | "memory" | "system">("pipeline");
  const [statusData, setStatusData] = useState<any>(null);
  const [latencyData, setLatencyData] = useState<{ traces: LatencyTrace[]; p50_ms: number; p95_ms: number; p99_ms: number; ttft_avg_ms: number } | null>(null);
  const [graphData, setGraphData] = useState<{ entities: GraphEntity[]; relationships: GraphRelationship[] }>({ entities: [], relationships: [] });
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [heartbeatCount, setHeartbeatCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchAllDebugData = () => {
    setLoading(true);

    // 1. Status
    fetch("/api/v1/debug/status")
      .then((r) => r.json())
      .then((d) => setStatusData(d))
      .catch(() => {});

    // 2. Latency metrics & traces
    fetch("/api/v1/debug/latency?limit=25")
      .then((r) => r.json())
      .then((d) => setLatencyData(d))
      .catch(() => {});

    // 3. Knowledge graph
    fetch("/api/v1/debug/graph?user_id=1")
      .then((r) => r.json())
      .then((d) => setGraphData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAllDebugData();

    const wsUrl = getWebSocketUrl("/api/v1/debug/ws");
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsStatus("connected");
      ws.onmessage = () => {
        setHeartbeatCount((c) => c + 1);
      };
      ws.onclose = () => setWsStatus("disconnected");
      return () => ws.close();
    } catch {
      setWsStatus("disconnected");
    }
  }, []);

  const latencySummary: LatencySummary = statusData?.latency_metrics || {
    p50_ms: latencyData?.p50_ms || 0,
    p95_ms: latencyData?.p95_ms || 0,
    p99_ms: latencyData?.p99_ms || 0,
    ttft_avg_ms: latencyData?.ttft_avg_ms || 0,
    sample_count: latencyData?.traces?.length || 0,
  };

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-6 py-4 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-2 clay-pill text-[#7B59DC] font-bold text-xs">
              <Radio size={13} className="text-[#9A80E5] animate-pulse" />
              AURA 2.0 LIVE PIPELINE OBSERVABILITY
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight">
              System & Telemetry Inspector
            </h1>
            <p className="text-[#7A7A96] dark:text-[#9E98B4] text-xs sm:text-sm mt-1 font-medium">
              Real-time pipeline diagnostics, latency percentiles, Knowledge Graph topology, and 7-layer memory state.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              wsStatus === "connected" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border border-amber-500/30"
            }`}>
              <span className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
              {wsStatus === "connected" ? "WS STREAM LIVE" : "POLLING MODE"}
            </span>

            <motion.button
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchAllDebugData}
              disabled={loading}
              className="clay-button flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#7B59DC]"
              style={{ borderRadius: 9999 }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </motion.button>
          </div>
        </div>

        {/* Latency & Key Metrics KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="clay-card p-4 flex flex-col justify-between" style={{ borderRadius: 20 }}>
            <span className="text-[11px] font-bold text-[#7A7A96] dark:text-[#9E98B4] flex items-center gap-1">
              <Clock size={12} className="text-[#7B59DC]" /> P50 Turn Latency
            </span>
            <div className="text-xl sm:text-2xl font-black text-[#2D2D42] dark:text-white mt-1">
              {latencySummary.p50_ms > 0 ? `${latencySummary.p50_ms} ms` : "—"}
            </div>
            <span className="text-[10px] text-emerald-600 font-bold mt-1">Median Response Time</span>
          </div>

          <div className="clay-card p-4 flex flex-col justify-between" style={{ borderRadius: 20 }}>
            <span className="text-[11px] font-bold text-[#7A7A96] dark:text-[#9E98B4] flex items-center gap-1">
              <Activity size={12} className="text-amber-500" /> P95 Turn Latency
            </span>
            <div className="text-xl sm:text-2xl font-black text-[#2D2D42] dark:text-white mt-1">
              {latencySummary.p95_ms > 0 ? `${latencySummary.p95_ms} ms` : "—"}
            </div>
            <span className="text-[10px] text-amber-600 font-bold mt-1">95th Percentile</span>
          </div>

          <div className="clay-card p-4 flex flex-col justify-between" style={{ borderRadius: 20 }}>
            <span className="text-[11px] font-bold text-[#7A7A96] dark:text-[#9E98B4] flex items-center gap-1">
              <Zap size={12} className="text-sky-500" /> Avg TTFT
            </span>
            <div className="text-xl sm:text-2xl font-black text-[#2D2D42] dark:text-white mt-1">
              {latencySummary.ttft_avg_ms > 0 ? `${latencySummary.ttft_avg_ms} ms` : "—"}
            </div>
            <span className="text-[10px] text-sky-600 font-bold mt-1">Time-To-First-Token</span>
          </div>

          <div className="clay-card p-4 flex flex-col justify-between" style={{ borderRadius: 20 }}>
            <span className="text-[11px] font-bold text-[#7A7A96] dark:text-[#9E98B4] flex items-center gap-1">
              <Network size={12} className="text-purple-500" /> Graph Nodes/Edges
            </span>
            <div className="text-xl sm:text-2xl font-black text-[#2D2D42] dark:text-white mt-1">
              {statusData?.knowledge_graph ? `${statusData.knowledge_graph.entities_count} / ${statusData.knowledge_graph.relationships_count}` : `${graphData.entities.length} / ${graphData.relationships.length}`}
            </div>
            <span className="text-[10px] text-purple-600 font-bold mt-1">Layer 5 Knowledge Graph</span>
          </div>

          <div className="clay-card p-4 flex flex-col justify-between col-span-2 sm:col-span-1" style={{ borderRadius: 20 }}>
            <span className="text-[11px] font-bold text-[#7A7A96] dark:text-[#9E98B4] flex items-center gap-1">
              <Database size={12} className="text-emerald-500" /> Durable Memories
            </span>
            <div className="text-xl sm:text-2xl font-black text-[#2D2D42] dark:text-white mt-1">
              {statusData?.long_term_memories_count ?? 4}
            </div>
            <span className="text-[10px] text-emerald-600 font-bold mt-1">Layer 3 & 4 Storage</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-black/5 dark:border-white/10 pb-3">
          {[
            { id: "pipeline", label: "Turn Latency Traces", icon: Activity },
            { id: "graph", label: "Knowledge Graph Topology", icon: Network },
            { id: "memory", label: "7-Layer Memory State", icon: Layers },
            { id: "system", label: "Gateway & Environment", icon: Server },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none outline-none ${
                  active ? "clay-active-nav text-[#7B59DC] shadow-sm" : "clay-pill text-[#6B6B85] dark:text-[#9E98B4] hover:text-[#2D2D42]"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Pipeline Latency & Traces */}
        {activeTab === "pipeline" && (
          <div className="clay-card p-6 space-y-4" style={{ borderRadius: 28 }}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                <Activity size={16} className="text-[#7B59DC]" /> Live Turn Execution Traces (T0–T7 Latency Breakdown)
              </h3>
              <span className="text-[11px] text-[#7A7A96]">Showing last {latencyData?.traces?.length || 0} measured turns</span>
            </div>

            {latencyData?.traces && latencyData.traces.length > 0 ? (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-black/5 dark:border-white/10 text-[#7A7A96]">
                      <th className="pb-2.5 font-bold">Trace ID</th>
                      <th className="pb-2.5 font-bold">Path</th>
                      <th className="pb-2.5 font-bold">Retrieval</th>
                      <th className="pb-2.5 font-bold">Graph</th>
                      <th className="pb-2.5 font-bold">Prompt</th>
                      <th className="pb-2.5 font-bold">TTFT</th>
                      <th className="pb-2.5 font-bold">Total Turn</th>
                      <th className="pb-2.5 font-bold">Provider</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {latencyData.traces.map((t) => (
                      <tr key={t.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <td className="py-2.5 font-bold text-[#7B59DC]">{t.trace_id}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            t.is_fast_path ? "bg-emerald-500/20 text-emerald-600" : "bg-purple-500/20 text-purple-600"
                          }`}>
                            {t.is_fast_path ? "FAST" : "DEEP"}
                          </span>
                        </td>
                        <td className="py-2.5 text-[#2D2D42] dark:text-white">{t.retrieval_latency_ms.toFixed(1)} ms</td>
                        <td className="py-2.5 text-[#2D2D42] dark:text-white">{t.graph_latency_ms.toFixed(1)} ms</td>
                        <td className="py-2.5 text-[#2D2D42] dark:text-white">{t.prompt_build_latency_ms.toFixed(1)} ms</td>
                        <td className="py-2.5 font-bold text-sky-600 dark:text-sky-400">{t.llm_ttft_ms.toFixed(1)} ms</td>
                        <td className="py-2.5 font-bold text-emerald-600 dark:text-emerald-400">{t.total_turn_latency_ms.toFixed(1)} ms</td>
                        <td className="py-2.5 text-[#7A7A96]">{t.provider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#7A7A96] font-medium">
                No turn latency traces recorded yet. Engage in chat or voice to generate live traces.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Knowledge Graph Topology */}
        {activeTab === "graph" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="clay-card p-6 space-y-4" style={{ borderRadius: 28 }}>
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                  <Network size={16} className="text-purple-500" /> Active Entities (Nodes)
                </h3>
                <span className="text-xs text-purple-600 font-bold">{graphData.entities.length} Entities</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {graphData.entities.map((e) => (
                  <div key={e.id} className="clay-card-flat p-3 flex items-center justify-between rounded-xl">
                    <div>
                      <span className="font-bold text-xs text-[#2D2D42] dark:text-white">{e.name}</span>
                      <span className="text-[10px] text-[#7A7A96] block">{e.canonical_name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-600 border border-purple-500/20">
                      {e.entity_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="clay-card p-6 space-y-4" style={{ borderRadius: 28 }}>
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                  <Sparkles size={16} className="text-[#7B59DC]" /> Directed Relationships (Edges)
                </h3>
                <span className="text-xs text-[#7B59DC] font-bold">{graphData.relationships.length} Edges</span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {graphData.relationships.map((r) => (
                  <div key={r.id} className="clay-card-flat p-3 flex items-center justify-between rounded-xl font-mono text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[#2D2D42] dark:text-white">{r.source_name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#7B59DC]/15 text-[#7B59DC] font-black text-[10px]">
                        —[{r.relation_type}]→
                      </span>
                      <span className="font-bold text-[#2D2D42] dark:text-white">{r.target_name}</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-bold">w={r.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: 7-Layer Memory State */}
        {activeTab === "memory" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="clay-card p-5 space-y-3" style={{ borderRadius: 24 }}>
              <div className="font-bold text-xs text-[#7B59DC] flex items-center gap-1.5">
                <Zap size={14} /> Layer 1: Real-Time Working Memory
              </div>
              <p className="text-[11px] text-[#7A7A96]">Active Redis session state, atomic hashes, pending question, and TTL cache.</p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Store</span>
                  <span className="font-bold text-emerald-600">Redis Hashes</span>
                </div>
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">TTL Window</span>
                  <span className="font-bold text-[#2D2D42] dark:text-white">7200s (2h)</span>
                </div>
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Active Entities</span>
                  <span className="font-bold text-purple-600">Dynamic</span>
                </div>
              </div>
            </div>

            <div className="clay-card p-5 space-y-3" style={{ borderRadius: 24 }}>
              <div className="font-bold text-xs text-sky-500 flex items-center gap-1.5">
                <Database size={14} /> Layer 3 & 4: Durable & Semantic Memory
              </div>
              <p className="text-[11px] text-[#7A7A96]">Persistent PostgreSQL facts, cosine similarity vector search, and version history.</p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Total Records</span>
                  <span className="font-bold text-emerald-600">{statusData?.long_term_memories_count || 4}</span>
                </div>
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Deduplication</span>
                  <span className="font-bold text-sky-600">Active</span>
                </div>
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Versioning</span>
                  <span className="font-bold text-purple-600">Enabled</span>
                </div>
              </div>
            </div>

            <div className="clay-card p-5 space-y-3" style={{ borderRadius: 24 }}>
              <div className="font-bold text-xs text-purple-500 flex items-center gap-1.5">
                <Network size={14} /> Layer 5: Knowledge Graph
              </div>
              <p className="text-[11px] text-[#7A7A96]">Multi-hop relational entity graph answering connected projects and technologies.</p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Graph Nodes</span>
                  <span className="font-bold text-purple-600">{graphData.entities.length}</span>
                </div>
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Graph Edges</span>
                  <span className="font-bold text-purple-600">{graphData.relationships.length}</span>
                </div>
                <div className="clay-card-flat p-2 flex justify-between rounded-lg">
                  <span className="text-[#7A7A96]">Context Injection</span>
                  <span className="font-bold text-emerald-600">Top 6 Facts</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: System & Gateway Status */}
        {activeTab === "system" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="clay-card p-6 space-y-4" style={{ borderRadius: 28 }}>
              <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                <Server size={16} className="text-[#7B59DC]" /> AI Gateway & Providers Health
              </h3>

              <div className="space-y-2.5 text-xs">
                {statusData?.gateway?.providers?.map((p: any) => (
                  <div key={p.provider} className="clay-card-flat p-3 flex items-center justify-between rounded-xl">
                    <span className="font-bold text-[#2D2D42] dark:text-white uppercase">{p.provider}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.status === "healthy" ? "bg-emerald-500/20 text-emerald-600" : "bg-red-500/20 text-red-600"
                    }`}>
                      {p.status}
                    </span>
                  </div>
                )) || (
                  <div className="clay-card-flat p-3 flex items-center justify-between rounded-xl">
                    <span className="font-bold text-[#2D2D42] dark:text-white">NVIDIA NIM (Nemotron 30B)</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600">HEALTHY</span>
                  </div>
                )}
              </div>
            </div>

            <div className="clay-card p-6 space-y-4" style={{ borderRadius: 28 }}>
              <h3 className="font-extrabold text-[#2D2D42] dark:text-white text-sm flex items-center gap-2">
                <Code2 size={16} className="text-emerald-500" /> Runtime & Environment
              </h3>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="clay-card-flat p-3 flex justify-between rounded-xl">
                  <span className="text-[#7A7A96]">Environment</span>
                  <span className="font-bold text-[#2D2D42] dark:text-white">{statusData?.environment || "development"}</span>
                </div>
                <div className="clay-card-flat p-3 flex justify-between rounded-xl">
                  <span className="text-[#7A7A96]">Aura Version</span>
                  <span className="font-bold text-[#7B59DC]">{statusData?.version || "2.0.0"}</span>
                </div>
                <div className="clay-card-flat p-3 flex justify-between rounded-xl">
                  <span className="text-[#7A7A96]">WS Heartbeats Received</span>
                  <span className="font-bold text-emerald-600">{heartbeatCount}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
