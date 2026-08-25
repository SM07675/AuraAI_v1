import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Cpu, Server, Activity, Terminal, Code2, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { GlassCard } from "./glass-card";
import { getWebSocketUrl } from "../services/wsHelper";

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

    const wsUrl = getWebSocketUrl("/api/v1/debug/ws");

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
    <div className="max-w-6xl mx-auto select-none">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", margin: 0, color: "#2D2D42" }}>Debug System Inspector</h2>
          <p style={{ color: "#7A7A96", fontSize: 14, marginTop: 4, fontWeight: 500 }}>
            Real-time pipeline monitoring, prompt inspect, emotion JSON, and active AI provider state.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.95 }}
          onClick={loadStatus}
          className="clay-button flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-[#7B59DC] cursor-pointer"
          style={{ borderRadius: 9999 }}
        >
          <RefreshCw size={14} />
          Refresh Snapshot
        </motion.button>
      </div>

      {/* Grid Inspector */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* System & Gateway Status */}
        <div className="clay-card p-6" style={{ borderRadius: 32 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-[#7B59DC]" />
              <span className="font-extrabold text-[#2D2D42] text-sm">Backend & Gateway State</span>
            </div>
            <span className="clay-pill px-2.5 py-0.5 text-emerald-700 text-xs font-bold">
              {wsStatus === "connected" ? "WS LIVE" : "POLLING"}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="clay-card-flat p-3 flex justify-between font-medium" style={{ borderRadius: 16 }}>
              <span className="text-[#6B6B85]">Environment</span>
              <span className="font-bold text-[#2D2D42]">{statusData?.environment || "development"}</span>
            </div>

            <div className="clay-card-flat p-3 flex justify-between font-medium" style={{ borderRadius: 16 }}>
              <span className="text-[#6B6B85]">Active AI Provider</span>
              <span className="font-bold text-[#7B59DC]">NVIDIA NIM (Nemotron 120B)</span>
            </div>

            <div className="clay-card-flat p-3 flex justify-between font-medium" style={{ borderRadius: 16 }}>
              <span className="text-[#6B6B85]">Face Emotion Model</span>
              <span className="font-bold text-[#10B981]">FERPlus ONNX (Available)</span>
            </div>

            <div className="clay-card-flat p-3 flex justify-between font-medium" style={{ borderRadius: 16 }}>
              <span className="text-[#6B6B85]">WebSocket Heartbeats</span>
              <span className="font-bold text-[#2D2D42]">{heartbeatCount} events received</span>
            </div>
          </div>
        </div>

        {/* Live Context & Prompt Inspector */}
        <div className="clay-card p-6" style={{ borderRadius: 32 }}>
          <div className="flex items-center gap-2 mb-4">
            <Code2 size={18} className="text-[#7B59DC]" />
            <span className="font-extrabold text-[#2D2D42] text-sm">Prompt & Context Builder</span>
          </div>

          <div className="rounded-2xl p-4 bg-[#2D2D42] text-slate-200 font-mono text-xs overflow-x-auto max-h-64 shadow-inner border border-white/40">
            <div className="text-emerald-400 font-bold mb-2">// Active System Prompt & Context Directive</div>
            <pre className="whitespace-pre-wrap leading-relaxed font-sans text-xs">
{`Role: Aura AI Mental Health Counselor
Session Directive: check_in
User Profile: Rahul
Goals: Placement Preparation
Primary Emotion: neutral (confidence: 85%)
Question Engine: Active (1 probing question per turn)`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
