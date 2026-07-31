import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Mic, MicOff, Volume2, Sparkles, RefreshCw, Zap } from "lucide-react";
import { GlassCard } from "./glass-card";
import { AuraRobot } from "./aura-robot";

export function VoiceScreen() {
  const [listening, setListening] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("Hello Aura, I am feeling a bit stressed about my upcoming interviews.");
  const [aiResponse, setAiResponse] = useState("I hear how important these interviews are to you, Rahul. What specific part of the preparation feels most overwhelming right now?");

  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="mb-8">
        <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Voice Mode</h2>
        <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6 }}>
          Continuous listening & low-latency voice interaction. Speak naturally with Aura.
        </p>
      </div>

      <GlassCard style={{ padding: 40 }} className="flex flex-col items-center">
        {/* Robot Avatar */}
        <div style={{ scale: 1.25 }} className="my-6">
          <AuraRobot expression={speaking ? "talking" : listening ? "happy" : "neutral"} />
        </div>

        {/* Audio Waveform */}
        <div className="flex items-center gap-1.5 my-8 h-12">
          {[12, 28, 40, 20, 48, 32, 16, 38, 24, 12, 36, 18, 44, 26, 14].map((h, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full bg-gradient-to-t from-blue-600 to-cyan-400"
              animate={{ height: listening || speaking ? [6, h, 6] : 6 }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.06 }}
            />
          ))}
        </div>

        {/* Transcript Pill */}
        <div className="max-w-xl p-5 rounded-2xl bg-white/70 border border-white/80 backdrop-blur-md shadow-sm mb-8 text-left">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live Transcript</div>
          <div className="text-sm font-medium text-slate-800 leading-relaxed">{transcript}</div>

          <div className="mt-4 pt-3 border-t border-slate-200/60">
            <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1">Aura Response</div>
            <div className="text-sm font-semibold text-blue-950 leading-relaxed">{aiResponse}</div>
          </div>
        </div>

        {/* Control Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setListening(!listening)}
          className="flex items-center gap-3 rounded-full px-8 py-4 text-white font-bold text-base shadow-xl shadow-blue-500/30"
          style={{ background: listening ? "linear-gradient(135deg,#2458FF,#00C6FF)" : "#475569" }}
        >
          {listening ? <Mic size={20} /> : <MicOff size={20} />}
          <span>{listening ? "Listening (Tap to Pause)" : "Paused (Tap to Listen)"}</span>
        </motion.button>
      </GlassCard>
    </div>
  );
}
