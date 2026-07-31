import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { GlassCard } from "./glass-card";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

const DATA = [
  { v: 40 }, { v: 55 }, { v: 48 }, { v: 70 }, { v: 62 }, { v: 82 }, { v: 76 }, { v: 90 },
];

export function EmotionPanel() {
  const [status, setStatus] = useState<{ face_model_available: boolean; face_model: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/emotion/status')
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  return (
    <GlassCard delay={0.3} style={{ padding: 24, width: 300 }}>
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontWeight: 600 }}>Current Emotion</span>
        <span
          className="rounded-full px-2.5 py-1"
          style={{
            background: status?.face_model_available ? "rgba(94,234,212,0.25)" : "rgba(255,200,0,0.25)",
            color: status?.face_model_available ? "#0d9488" : "#d97706",
            fontSize: 12,
            fontWeight: 600
          }}
        >
          ● {status?.face_model_available ? "LIVE" : "ACTIVE"}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div
          className="grid place-items-center rounded-2xl"
          style={{ width: 56, height: 56, background: "linear-gradient(135deg,#2458FF,#00D4FF)", fontSize: 28 }}
        >
          😌
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>Calm</div>
          <div style={{ fontSize: 13, color: "#717190" }}>
            {status?.face_model ? `FERPlus (${status.face_model_available ? 'ONNX' : 'Fallback'})` : 'Relaxed & balanced'}
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className="mb-4">
        <div className="flex justify-between mb-1.5" style={{ fontSize: 13, color: "#6b6b88" }}>
          <span>Confidence</span>
          <span style={{ fontWeight: 700, color: "#2458FF" }}>85%</span>
        </div>
        <div className="rounded-full overflow-hidden" style={{ height: 10, background: "rgba(78,168,255,0.15)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "85%" }}
            transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
            style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#2458FF,#00D4FF)" }}
          />
        </div>
      </div>

      {/* Animated graph */}
      <div style={{ height: 84 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={DATA} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="emoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2458FF" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#00D4FF" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke="#2458FF" strokeWidth={3} fill="url(#emoGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { l: "Joy", v: "72%" },
          { l: "Focus", v: "64%" },
          { l: "Stress", v: "18%" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-2xl px-2 py-2 text-center"
            style={{ background: "rgba(255,255,255,0.5)" }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2458FF" }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "#717190" }}>{s.l}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
