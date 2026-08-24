import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { GlassCard } from "./glass-card";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { ClayCalmFaceIcon } from "./clay-icons";

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
    <GlassCard delay={0.3} style={{ padding: 26, width: 340, borderRadius: 28 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <span className="font-bold text-slate-800 text-sm tracking-tight">Current Emotion</span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold flex items-center gap-1"
          style={{
            background: "rgba(16, 185, 129, 0.12)",
            color: "#10B981",
            border: "1px solid rgba(16, 185, 129, 0.25)"
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ACTIVE
        </span>
      </div>

      {/* Main Emotion Display */}
      <div className="flex items-center gap-3.5 mb-6">
        <div
          className="grid place-items-center rounded-2xl shrink-0 shadow-sm"
          style={{ width: 52, height: 52, background: "linear-gradient(135deg, #0284C7, #38BDF8)" }}
        >
          <ClayCalmFaceIcon size={34} />
        </div>
        <div>
          <div className="text-xl font-bold text-slate-800 leading-tight">Calm</div>
          <div className="text-xs text-slate-500 font-medium">
            {status?.face_model ? `FERPlus (${status.face_model_available ? 'ONNX' : 'Fallback'})` : 'FERPlus (Fallback)'}
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className="mb-5">
        <div className="flex justify-between mb-2 text-xs font-semibold">
          <span className="text-slate-500">Confidence</span>
          <span className="font-bold text-sky-600">85%</span>
        </div>
        <div className="rounded-full overflow-hidden p-[1px]" style={{ height: 9, background: "rgba(2, 132, 199, 0.12)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "85%" }}
            transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
            style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #0284C7, #38BDF8)" }}
          />
        </div>
      </div>

      {/* Animated Trend Graph */}
      <div style={{ height: 80 }} className="mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={DATA} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="emoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284C7" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke="#0284C7" strokeWidth={2.5} fill="url(#emoGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { l: "Joy", v: "72%" },
          { l: "Focus", v: "64%" },
          { l: "Stress", v: "18%" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-2xl px-2 py-2.5 text-center border border-white/70 shadow-2xs"
            style={{ background: "rgba(255, 255, 255, 0.65)" }}
          >
            <div className="text-base font-extrabold text-sky-600">{s.v}</div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
