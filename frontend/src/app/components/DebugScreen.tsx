import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Cpu, Server, Activity, Terminal, Code2, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { GlassCard } from "./glass-card";

export function DebugScreen() {
  const [statusData, setStatusData] = useState<any>(null);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [heartbeatCount, setHeartbeatCount] = useState(0);

  const loadStatus = () => {
    fetch("/api/v1/debug/status")
      .then((r) => r.json())
      .then((d) => setStatusData(d))
      .catch(() => {});
  };

  useEffect(() => {
    loadStatus();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/debug/ws`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => setWsStatus("connected");
      ws.onmessage = () => setHeartbeatCount((c) => c + 1);
      ws.onclose = () => setWsStatus("disconnected");

      return () => ws.close();
    } catch (e) {
      setWsStatus("disconnected");
    }
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Debug System Inspector</h2>
          <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6 }}>
            Real-time pipeline monitoring, prompt inspect, emotion JSON, and active AI provider state.
          </p>
        </div>
        <button
          onClick={loadStatus}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 bg-white/70 border border-white/80 text-slate-800 font-semibold text-xs shadow-sm hover:bg-white"
        >
          <RefreshCw size={14} />
          Refresh Snapshot
        </button>
      </div>

      {/* Grid Inspector */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* System & Gateway Status */}
        <GlassCard style={{ padding: 24 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-blue-600" />
              <span className="font-bold text-slate-900 text-base">Backend & Gateway State</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
              {wsStatus === "connected" ? "WS LIVE" : "POLLING"}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-white/50 border border-white/60 flex justify-between">
              <span className="text-slate-600">Environment</span>
              <span className="font-bold text-slate-900">{statusData?.environment || "development"}</span>
            </div>

            <div className="p-3 rounded-xl bg-white/50 border border-white/60 flex justify-between">
              <span className="text-slate-600">Active AI Provider</span>
              <span className="font-bold text-blue-600">NVIDIA NIM (Nemotron 120B)</span>
            </div>

            <div className="p-3 rounded-xl bg-white/50 border border-white/60 flex justify-between">
              <span className="text-slate-600">Face Emotion Model</span>
              <span className="font-bold text-emerald-600">FERPlus ONNX (Available)</span>
            </div>

            <div className="p-3 rounded-xl bg-white/50 border border-white/60 flex justify-between">
              <span className="text-slate-600">WebSocket Heartbeats</span>
              <span className="font-bold text-slate-900">{heartbeatCount} events received</span>
            </div>
          </div>
        </GlassCard>

        {/* Live Context & Prompt Inspector */}
        <GlassCard style={{ padding: 24 }}>
          <div className="flex items-center gap-2 mb-4">
            <Code2 size={18} className="text-indigo-600" />
            <span className="font-bold text-slate-900 text-base">Prompt & Context Builder</span>
          </div>

          <div className="rounded-2xl p-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-64">
            <div className="text-emerald-400 font-bold mb-2">// Active System Prompt & Context Directive</div>
            <pre className="whitespace-pre-wrap leading-relaxed">
{`Role: Aura AI Mental Health Counselor
Session Directive: check_in
User Profile: Rahul
Goals: Placement Preparation
Primary Emotion: neutral (confidence: 85%)
Question Engine: Active (1 probing question per turn)`}
            </pre>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
