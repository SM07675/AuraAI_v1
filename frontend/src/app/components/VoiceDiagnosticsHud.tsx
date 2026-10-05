import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ShieldCheck, Volume2, Mic, Zap, X, Radio, Sliders, CheckCircle2, AlertCircle } from "lucide-react";
import { duplexManager, ConversationState, InterruptionScoreDetails } from "../services/duplexManager";
import { audioEngine, AcousticTelemetry } from "../services/audioEngine";
import { clientVad, ClientVadState } from "../services/clientVad";

export function VoiceDiagnosticsHud({ onClose }: { onClose?: () => void }) {
  const [state, setState] = useState<ConversationState>(duplexManager.getState());
  const [vadState, setVadState] = useState<ClientVadState>(clientVad.getState());
  const [diag, setDiag] = useState<InterruptionScoreDetails | null>(null);
  const [telem, setTelem] = useState<AcousticTelemetry>(audioEngine.getTelemetry());
  const [turnId, setTurnId] = useState<number>(audioEngine.getTurnId() || 1);
  const [generationId, setGenerationId] = useState<number>(audioEngine.getGenerationId() || 0);
  const [interruptedTurn, setInterruptedTurn] = useState<number | null>(null);

  useEffect(() => {
    const unState = duplexManager.subscribeState((st) => setState(st));
    const unDiag = duplexManager.subscribeDiagnostics((d) => setDiag(d));
    const unTelem = audioEngine.subscribeTelemetry((t) => {
      setTelem(t);
      setTurnId(audioEngine.getTurnId());
      setGenerationId(audioEngine.getGenerationId());
    });
    const unVad = clientVad.subscribeState((p) => setVadState(p.state));

    return () => {
      unState();
      unDiag();
      unTelem();
      unVad();
    };
  }, []);

  const getStateBadgeColor = (st: ConversationState) => {
    switch (st) {
      case "SPEAKING":
      case "AURA_SPEAKING":
        return "bg-purple-500/20 text-purple-400 border-purple-500/40";
      case "INTERRUPTED":
      case "USER_INTERRUPT":
        return "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse";
      case "USER_SPEAKING":
        return "bg-sky-500/20 text-sky-400 border-sky-500/40";
      case "THINKING":
      case "PROCESSING":
        return "bg-amber-500/20 text-amber-400 border-amber-500/40";
      case "LISTENING":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/40";
    }
  };

  const getVadBadgeColor = (vst: ClientVadState) => {
    switch (vst) {
      case "SPEAKING":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
      case "SPEECH_START":
        return "bg-sky-500/20 text-sky-400 border-sky-500/40";
      case "POSSIBLE_END":
        return "bg-amber-500/20 text-amber-400 border-amber-500/40";
      case "SPEECH_END":
        return "bg-purple-500/20 text-purple-400 border-purple-500/40";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/40";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-20 right-6 z-50 w-[420px] rounded-2xl bg-black/90 backdrop-blur-2xl border border-white/15 p-4 text-xs font-mono text-white/90 shadow-2xl shadow-purple-950/50 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-bold text-[13px] tracking-wide text-white flex items-center gap-1.5">
            <Radio size={14} className="text-purple-400" /> Audio Diagnostics & VAD
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

      {/* Prominent Turn & Generation Telemetry */}
      <div className="grid grid-cols-3 gap-1.5 mb-3 text-center">
        <div className="bg-white/5 rounded-xl p-2 border border-white/10">
          <div className="text-[9px] text-white/50 uppercase tracking-wider font-semibold">Current Turn</div>
          <div className="text-base font-black text-emerald-400">#{turnId}</div>
        </div>
        <div className="bg-white/5 rounded-xl p-2 border border-white/10">
          <div className="text-[9px] text-white/50 uppercase tracking-wider font-semibold">Interrupted Turn</div>
          <div className={`text-base font-black ${interruptedTurn ? "text-rose-400" : "text-white/30"}`}>
            {interruptedTurn ? `#${interruptedTurn}` : "None"}
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-2 border border-white/10">
          <div className="text-[9px] text-white/50 uppercase tracking-wider font-semibold">Active Gen</div>
          <div className="text-base font-black text-sky-400">#{generationId}</div>
        </div>
      </div>

      {/* Device & Permission Status */}
      <div className="bg-white/5 rounded-xl p-2.5 mb-3 border border-white/5 space-y-1">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Device Name:</span>
          <span className="font-semibold text-white/90 truncate max-w-[240px]" title={telem.deviceName}>
            {telem.deviceName}
          </span>
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Permission State:</span>
          <span
            className={`font-bold capitalize ${
              telem.permissionState === "granted" ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {telem.permissionState}
          </span>
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Audio Format:</span>
          <span className="text-white/90">
            {telem.sampleRate} Hz • {telem.channels} ch (16-bit PCM streaming)
          </span>
        </div>
      </div>

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-[10px]">
            <span className="flex items-center gap-1">
              <Mic size={11} /> Input Level (RMS)
            </span>
            <span className="font-bold text-white">{(telem.micRms * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                telem.clipping ? "bg-rose-500" : "bg-sky-400"
              }`}
              style={{ width: `${Math.min(100, telem.micRms * 350)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-white/40 mt-1">
            <span>Peak: {(telem.peakLevel * 100).toFixed(0)}%</span>
            <span>Clip: {telem.clippingCount}</span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-[10px]">
            <span className="flex items-center gap-1">
              <Volume2 size={11} /> Noise Floor / SNR
            </span>
            <span className="font-bold text-white">{telem.snrDb.toFixed(1)} dB</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-purple-400 rounded-full transition-all duration-75"
              style={{ width: `${Math.min(100, Math.max(5, telem.snr * 15))}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-white/40 mt-1">
            <span>Floor: {(telem.noiseFloor * 1000).toFixed(1)} mV</span>
            <span>SNR: {telem.snr.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      {/* Hardware Processing Constraints & Status */}
      <div className="space-y-1.5 mb-3 bg-white/5 rounded-xl p-2.5 border border-white/5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Echo Cancellation (AEC):</span>
          <span
            className={`flex items-center gap-1 font-bold ${
              telem.hardwareAecActive ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            <ShieldCheck size={12} /> {telem.hardwareAecActive ? "Active (Hardware)" : "Software / Fallback"}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Auto Gain Control (AGC):</span>
          <span className={`font-bold ${telem.hardwareAgcActive ? "text-emerald-400" : "text-white/50"}`}>
            {telem.hardwareAgcActive ? "Active" : "Inactive / Pass-Through"}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Noise Suppression (NS):</span>
          <span className={`font-bold ${telem.hardwareNsActive ? "text-emerald-400" : "text-white/50"}`}>
            {telem.hardwareNsActive ? "Active" : "80Hz Preprocessor Filter"}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px] pt-1 border-t border-white/5">
          <span className="text-white/60">VAD 5-State Status:</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getVadBadgeColor(vadState)}`}>
            {vadState}
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-white/60">Acoustic Self-Echo Prob:</span>
          <span
            className={`font-bold ${
              telem.acousticEchoProb > 0.4 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {(telem.acousticEchoProb * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Decision / Interruption Details */}
      {diag && (
        <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/20 text-[11px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-purple-300 font-bold flex items-center gap-1">
              <Zap size={12} /> Interruption: {diag.decision}
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
