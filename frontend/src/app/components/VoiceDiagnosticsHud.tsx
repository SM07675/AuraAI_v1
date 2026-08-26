import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, ShieldCheck, Volume2, Mic, Zap, CheckCircle2, AlertTriangle, X, Radio } from "lucide-react";
import { duplexManager, ConversationState, InterruptionScoreDetails } from "../services/duplexManager";
import { audioEngine, AcousticTelemetry } from "../services/audioEngine";
import { streamingTtsService } from "../services/streamingTtsService";

export function VoiceDiagnosticsHud({ onClose }: { onClose?: () => void }) {
  const [state, setState] = useState<ConversationState>(duplexManager.getState());
  const [diag, setDiag] = useState<InterruptionScoreDetails | null>(null);
  const [telem, setTelem] = useState<AcousticTelemetry>(audioEngine.getTelemetry());

  useEffect(() => {
    const unState = duplexManager.subscribeState((st) => setState(st));
    const unDiag = duplexManager.subscribeDiagnostics((d) => setDiag(d));
    const unTelem = audioEngine.subscribeTelemetry((t) => setTelem(t));

    return () => {
      unState();
      unDiag();
      unTelem();
    };
  }, []);

  const getStateBadgeColor = (st: ConversationState) => {
    switch (st) {
      case "AURA_SPEAKING":
        return "bg-purple-500/20 text-purple-400 border-purple-500/40";
      case "POSSIBLE_INTERRUPT":
        return "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse";
      case "USER_INTERRUPT":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
      case "USER_SPEAKING":
        return "bg-sky-500/20 text-sky-400 border-sky-500/40";
      case "PROCESSING":
      case "IDLE":
      case "LISTENING":
        return "bg-blue-500/20 text-blue-400 border-blue-500/40";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/40";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-20 right-6 z-50 w-96 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 p-4 text-xs font-mono text-white/90 shadow-2xl shadow-purple-950/40 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-bold text-[13px] tracking-wide text-white flex items-center gap-1.5">
            <Radio size={14} className="text-purple-400" /> Full-Duplex Audio Engine
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getStateBadgeColor(state)}`}>
            {state}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-white/50 hover:text-white rounded-md hover:bg-white/10 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-[10px]">
            <span className="flex items-center gap-1"><Mic size={11} /> Mic Input RMS</span>
            <span>{(telem.micRms * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-sky-400 rounded-full transition-all duration-75"
              style={{ width: `${Math.min(100, telem.micRms * 300)}%` }}
            />
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-[10px]">
            <span className="flex items-center gap-1"><Volume2 size={11} /> TTS Ref RMS</span>
            <span>{(telem.refRms * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-purple-400 rounded-full transition-all duration-75"
              style={{ width: `${Math.min(100, telem.refRms * 300)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Correlation & Echo Metrics */}
      <div className="space-y-1.5 mb-3 bg-white/5 rounded-xl p-2.5 border border-white/5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Acoustic Echo Prob:</span>
          <span className={`font-bold ${telem.acousticEchoProb > 0.4 ? "text-amber-400" : "text-emerald-400"}`}>
            {(telem.acousticEchoProb * 100).toFixed(1)}%
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">User Speech Prob:</span>
          <span className={`font-bold ${telem.userSpeechProb > 0.5 ? "text-emerald-400" : "text-white/60"}`}>
            {(telem.userSpeechProb * 100).toFixed(1)}%
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Ambient SNR / Noise Floor:</span>
          <span className="text-white/90">
            {telem.snr.toFixed(1)}x / {(telem.noiseFloor * 1000).toFixed(1)}m
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Hardware AEC Status:</span>
          <span className={`flex items-center gap-1 font-bold ${telem.hardwareAecActive ? "text-emerald-400" : "text-amber-400"}`}>
            <ShieldCheck size={12} /> {telem.hardwareAecActive ? "Hardware Active" : "Software Fallback"}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Playback Master Gain:</span>
          <span className={`font-bold ${telem.gainLevel < 0.9 ? "text-amber-300" : "text-white/90"}`}>
            {(telem.gainLevel * 100).toFixed(0)}% {telem.gainLevel < 0.9 ? "(Ducked)" : ""}
          </span>
        </div>
      </div>

      {/* Latest Interruption Decision */}
      {diag && (
        <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/20 text-[11px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-purple-300 font-bold flex items-center gap-1">
              <Zap size={12} /> Decision: {diag.decision}
            </span>
            <span className="text-[10px] text-white/50">Gen #{duplexManager.getGenerationId()}</span>
          </div>
          <div className="text-white/70 text-[10px] truncate" title={diag.reason}>
            {diag.reason}
          </div>
          {diag.transcript && (
            <div className="mt-1 text-white/90 text-[10px] bg-black/40 px-2 py-1 rounded truncate">
              "{diag.transcript}"
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
