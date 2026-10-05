import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  Activity,
  Zap,
  Volume2,
  ShieldCheck,
  Radio,
  Clock,
  Terminal,
  Cpu,
  Smile,
  X,
  RefreshCw,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { audioEngine, AcousticTelemetry } from "../services/audioEngine";
import { clientVad, ClientVadState } from "../services/clientVad";
import { duplexManager, ConversationState } from "../services/duplexManager";

export interface LiveAudioDebuggerProps {
  onClose?: () => void;
  sessionId?: string;
  turnId?: number;
  partialTranscript?: string;
  finalTranscript?: string;
  sttConfidence?: number;
  voiceEmotion?: string;
  voiceConfidence?: number;
  faceEmotion?: string;
  faceConfidence?: number;
  openFaceState?: string;
  ferState?: string;
  textEmotion?: string;
  fusedEmotion?: string;
  fusionScores?: Record<string, number>;
  nvidiaState?: "streaming" | "idle" | "error";
  ttftMs?: number;
  ttsStatus?: "playing" | "buffering" | "idle";
  playbackQueueCount?: number;
  wsState?: "connected" | "connecting" | "disconnected" | "reconnecting";
  errors?: string[];
}

export function LiveAudioDebugger({
  onClose,
  sessionId = "voice-session-live",
  turnId = 1,
  partialTranscript = "",
  finalTranscript = "",
  sttConfidence = 0.92,
  voiceEmotion = "neutral",
  voiceConfidence = 0.65,
  faceEmotion = "neutral",
  faceConfidence = 0.78,
  openFaceState = "Tracking (30 fps)",
  ferState = "Active (FER+ ONNX)",
  textEmotion = "neutral",
  fusedEmotion = "neutral",
  fusionScores = { neutral: 0.7, happy: 0.2, calm: 0.1 },
  nvidiaState = "idle",
  ttftMs = 280,
  ttsStatus = "idle",
  playbackQueueCount = 0,
  wsState = "connected",
  errors = [],
}: LiveAudioDebuggerProps) {
  const [telem, setTelem] = useState<AcousticTelemetry>(audioEngine.getTelemetry());
  const [vadState, setVadState] = useState<ClientVadState>(clientVad.getState());
  const [conversationState, setConversationState] = useState<ConversationState>(duplexManager.getState());
  const [speechStartTime, setSpeechStartTime] = useState<string>("--:--:--");
  const [speechEndTime, setSpeechEndTime] = useState<string>("--:--:--");
  const [activeTab, setActiveTab] = useState<"audio" | "vad" | "emotion" | "pipeline">("audio");

  useEffect(() => {
    const unTelem = audioEngine.subscribeTelemetry((t) => setTelem(t));
    const unVad = clientVad.subscribeState((p) => {
      setVadState(p.state);
      if (p.state === "SPEECH_START") {
        setSpeechStartTime(new Date(p.timestamp).toLocaleTimeString());
      } else if (p.state === "SPEECH_END") {
        setSpeechEndTime(new Date(p.timestamp).toLocaleTimeString());
      }
    });
    const unState = duplexManager.subscribeState((st) => setConversationState(st));

    return () => {
      unTelem();
      unVad();
      unState();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-16 right-4 z-50 w-[540px] max-h-[82vh] flex flex-col rounded-2xl bg-zinc-950/95 backdrop-blur-2xl border border-white/15 shadow-2xl shadow-purple-950/60 text-xs font-mono text-zinc-100 select-none overflow-hidden"
    >
      {/* Top Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-sm text-white flex items-center gap-1.5">
            <Terminal size={15} className="text-purple-400" /> AURA Live Audio & Engine Debugger
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            State: {conversationState}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-black/40 text-[11px]">
        {(["audio", "vad", "emotion", "pipeline"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 text-center font-bold capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? "border-purple-400 text-purple-300 bg-purple-500/10"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab === "audio" && "1. Capture & Noise"}
            {tab === "vad" && "2. VAD & Transcripts"}
            {tab === "emotion" && "3. Multimodal Emotion"}
            {tab === "pipeline" && "4. Engine & Latency"}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Tab 1: Audio Capture & Noise */}
        {activeTab === "audio" && (
          <div className="space-y-2.5">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-1.5">
              <div className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                <Mic size={13} /> Hardware Microphone & Constraints
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div>
                  <span className="text-zinc-400">Device: </span>
                  <span className="font-semibold text-white truncate inline-block max-w-[150px]" title={telem.deviceName}>
                    {telem.deviceName}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400">Permission: </span>
                  <span className="font-bold text-emerald-400 capitalize">{telem.permissionState}</span>
                </div>
                <div>
                  <span className="text-zinc-400">Sample Rate: </span>
                  <span className="text-white">{telem.sampleRate} Hz</span>
                </div>
                <div>
                  <span className="text-zinc-400">Channels: </span>
                  <span className="text-white">{telem.channels} (16-bit PCM)</span>
                </div>
                <div>
                  <span className="text-zinc-400">AEC (Hardware): </span>
                  <span className={telem.hardwareAecActive ? "text-emerald-400 font-bold" : "text-amber-400"}>
                    {telem.hardwareAecActive ? "Active" : "Software"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400">AGC / NS: </span>
                  <span className="text-white font-medium">
                    {telem.hardwareAgcActive ? "AGC ON" : "AGC OFF"} • {telem.hardwareNsActive ? "NS ON" : "Filter ON"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <div className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                <Activity size={13} /> Real-Time Signal Preprocessing (80Hz Highpass + Compressor)
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-zinc-400">Input RMS Level:</span>
                  <span className="font-bold text-white">{(telem.micRms * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 ${
                      telem.clipping ? "bg-rose-500" : "bg-sky-400"
                    }`}
                    style={{ width: `${Math.min(100, telem.micRms * 350)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-300 pt-1">
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">Peak Level</span>
                  <span className="font-bold text-white">{(telem.peakLevel * 100).toFixed(1)}%</span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">Noise Floor</span>
                  <span className="font-bold text-white">{(telem.noiseFloor * 1000).toFixed(1)} mV</span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">SNR</span>
                  <span className="font-bold text-emerald-400">{telem.snrDb.toFixed(1)} dB</span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">Clipping Count</span>
                  <span className={telem.clippingCount > 0 ? "text-amber-400 font-bold" : "text-white"}>
                    {telem.clippingCount}
                  </span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">Echo Prob</span>
                  <span className="font-bold text-white">{(telem.acousticEchoProb * 100).toFixed(1)}%</span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">Speech Prob</span>
                  <span className="font-bold text-emerald-400">{(telem.userSpeechProb * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: VAD & Transcripts */}
        {activeTab === "vad" && (
          <div className="space-y-2.5">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-purple-300">5-State VAD Engine</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  State: {vadState}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-300">
                <div>
                  <span className="text-zinc-500">Speech Start Time: </span>
                  <span className="text-white font-mono">{speechStartTime}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Speech End Time: </span>
                  <span className="text-white font-mono">{speechEndTime}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Pre-Speech Buffer: </span>
                  <span className="text-emerald-400 font-semibold">200 ms (Preserved)</span>
                </div>
                <div>
                  <span className="text-zinc-500">Silence Debounce: </span>
                  <span className="text-emerald-400 font-semibold">650 ms Hysteresis</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-purple-300">Live Speech-to-Text (Whisper)</span>
                <span className="text-[10px] text-zinc-400">Conf: {(sttConfidence * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block mb-0.5">Partial Transcript (Live Speaking):</span>
                <div className="p-2 rounded bg-black/40 text-sky-300 text-[11px] min-h-[32px] italic">
                  {partialTranscript || "Waiting for speech..."}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block mb-0.5">Final Transcript (Turn Turnaround):</span>
                <div className="p-2 rounded bg-black/40 text-emerald-300 text-[11px] min-h-[32px] font-medium">
                  {finalTranscript || "No turn finalized yet"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Multimodal Emotion */}
        {activeTab === "emotion" && (
          <div className="space-y-2.5">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                <Smile size={13} /> Multimodal Emotion Fusion
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-black/30 p-2 rounded">
                  <span className="text-zinc-500 block text-[10px]">Voice Emotion (SpeechBrain)</span>
                  <span className="font-bold text-sky-300 capitalize">{voiceEmotion}</span>
                  <span className="text-zinc-400 text-[10px] block">
                    Conf: {(voiceConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="bg-black/30 p-2 rounded">
                  <span className="text-zinc-500 block text-[10px]">Face Emotion (FER+ / OpenFace)</span>
                  <span className="font-bold text-amber-300 capitalize">{faceEmotion}</span>
                  <span className="text-zinc-400 text-[10px] block">
                    Conf: {(faceConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="bg-black/30 p-2 rounded">
                  <span className="text-zinc-500 block text-[10px]">Text Emotion (RoBERTa)</span>
                  <span className="font-bold text-purple-300 capitalize">{textEmotion}</span>
                </div>
                <div className="bg-purple-950/40 p-2 rounded border border-purple-500/30">
                  <span className="text-zinc-400 block text-[10px]">Authoritative Fused Emotion</span>
                  <span className="font-bold text-white text-sm capitalize">{fusedEmotion}</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-1">
              <span className="text-[10px] text-zinc-500 block">Vision Models Health:</span>
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">OpenFace Pipeline:</span>
                <span className="text-emerald-400 font-semibold">{openFaceState}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">FER+ ONNX Engine:</span>
                <span className="text-emerald-400 font-semibold">{ferState}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Engine & Latency */}
        {activeTab === "pipeline" && (
          <div className="space-y-2.5">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-1.5">
              <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                <Cpu size={13} /> Session & Transport Telemetry
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-zinc-500">Session ID: </span>
                  <span className="text-white truncate inline-block max-w-[140px] font-mono" title={sessionId}>
                    {sessionId}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Turn ID: </span>
                  <span className="text-white font-bold">#{turnId}</span>
                </div>
                <div>
                  <span className="text-zinc-500">WebSocket: </span>
                  <span className="text-emerald-400 font-bold capitalize">{wsState}</span>
                </div>
                <div>
                  <span className="text-zinc-500">NVIDIA NIM State: </span>
                  <span className="text-purple-300 font-semibold capitalize">{nvidiaState}</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                <Clock size={13} /> Real-Time Latency Profiling
              </span>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-300">
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">TTFT (Time-to-First-Token)</span>
                  <span className="font-bold text-emerald-400 text-xs">{ttftMs} ms</span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">TTS Status</span>
                  <span className="font-bold text-white text-xs capitalize">{ttsStatus}</span>
                </div>
                <div className="bg-black/30 p-1.5 rounded">
                  <span className="text-zinc-500 block">Playback Queue</span>
                  <span className="font-bold text-white text-xs">{playbackQueueCount} chunks</span>
                </div>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-2.5 space-y-1">
                <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                  <AlertTriangle size={12} /> Active Error Logs
                </span>
                {errors.slice(0, 3).map((err, i) => (
                  <div key={i} className="text-[10px] text-rose-300 truncate">
                    • {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
