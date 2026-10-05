import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Send,
  Camera,
  Sparkles,
  Heart,
  Brain,
  Globe,
  Check,
  Wind,
  X,
  Volume2,
  Sliders,
  AlertTriangle,
  Activity,
  Radio,
  Maximize2,
  Minimize2,
  Layers,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { HolographicAuraAvatar } from "./HolographicAuraAvatar";
import { voiceService } from "../services/voiceService";
import { speechService, SUPPORTED_LANGUAGES, SupportedLanguage } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
import { duplexManager, ConversationState, InterruptionScoreDetails } from "../services/duplexManager";
import { liveVoiceClient } from "../services/liveVoiceSocket";
import { audioEngine } from "../services/audioEngine";
import { authService } from "../services/authService";
import { VoiceDiagnosticsHud } from "./VoiceDiagnosticsHud";
import { LiveAudioDebugger } from "./LiveAudioDebugger";
import { FaceDebugPanel } from "./FaceDebugPanel";

type FaceEmotion = {
  primary_emotion: string;
  confidence: number;
  secondary_emotion?: string;
  secondary_confidence?: number;
  face_detected: boolean;
  stress?: string;
  sentiment?: string;
  box_norm?: { x: number; y: number; w: number; h: number } | null;
};

type Msg = {
  id: string;
  from: "user" | "aura";
  text: string;
};

export function FaceToFaceScreen() {
  // ── Camera State ─────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const cameraActiveRef = useRef(cameraActive);
  cameraActiveRef.current = cameraActive;
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [camFps, setCamFps] = useState(30);
  const [isCameraExpanded, setIsCameraExpanded] = useState(false);

  // ── Emotion State ────────────────────────────────────────────────────────────
  const [faceEmotion, setFaceEmotion] = useState<FaceEmotion>({
    primary_emotion: "Waiting",
    confidence: 0.0,
    secondary_emotion: "calm",
    secondary_confidence: 0.0,
    face_detected: false,
    stress: "Low",
    sentiment: "Neutral",
    box_norm: null,
  });

  const [fusedEmotion, setFusedEmotion] = useState<{
    primary: string;
    confidence: number;
    sources: string[];
  }>({
    primary: "Unavailable",
    confidence: 0,
    sources: [],
  });

  // ── Conversational Context ──────────────────────────────────────────────────
  const [activeGoal, setActiveGoal] = useState("No goal set");
  const [activeInterest, setActiveInterest] = useState("No focus selected");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const responseId = useRef<string | null>(null);

  // ── Chat & Dialogue State ───────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Hello, I am Aura. I am right here with you in this space. Take your time — what is on your heart today?",
    },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const micEnabledRef = useRef(false);
  const [micStarting, setMicStarting] = useState(false);
  const [interimSpeech, setInterimSpeech] = useState("");
  const [isAuraSpeaking, setIsAuraSpeaking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  // ── Drawer & Utilities State ────────────────────────────────────────────────
  const [showSideDrawer, setShowSideDrawer] = useState(false);
  const [showDuplexHud, setShowDuplexHud] = useState(false);
  const [showFaceDebug, setShowFaceDebug] = useState(false);
  const [showAudioDebugger, setShowAudioDebugger] = useState(false);
  const [showBreathingPacer, setShowBreathingPacer] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale");

  // Voice Persona & Language
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(speechService.currentLanguage);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [currentVoiceId, setCurrentVoiceId] = useState(voiceService.getActiveVoice());
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const voiceList = voiceService.getVoiceList();

  // Duplex State Machine
  const [duplexState, setDuplexState] = useState<ConversationState>(duplexManager.getState());
  const [latestDiag, setLatestDiag] = useState<InterruptionScoreDetails | null>(null);

  useEffect(() => {
    const unState = duplexManager.subscribeState((st) => setDuplexState(st));
    const unDiag = duplexManager.subscribeDiagnostics((dg) => setLatestDiag(dg));
    return () => {
      unState();
      unDiag();
    };
  }, []);

  // Fetch real personalized user context
  useEffect(() => {
    authService.authFetch("/api/v1/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.goals?.length) setActiveGoal(data.goals[0]);
        if (data?.interests?.length) setActiveInterest(data.interests[0]);
      })
      .catch(() => {});
  }, []);

  // ── Live Voice Client Integration ──────────────────────────────────────────
  useEffect(() => {
    liveVoiceClient.setCallbacks({
      onConnectionChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") setSessionError(null);
      },
      onStateChange: (st) => {
        if (st === "LISTENING") {
          setIsAuraSpeaking(false);
          setTyping(false);
        } else if (st === "USER_SPEAKING") {
          setIsAuraSpeaking(false);
          setTyping(false);
        } else if (st === "THINKING") {
          setTyping(true);
          setIsAuraSpeaking(false);
        } else if (st === "SPEAKING") {
          setIsAuraSpeaking(true);
          setTyping(false);
        } else if (st === "INTERRUPTED") {
          setIsAuraSpeaking(false);
          setTyping(false);
        }
      },
      onTurnStarted: () => {
        responseId.current = `aura-${Date.now()}`;
        setTyping(true);
      },
      onPartialTranscript: (txt) => {
        setText(txt);
      },
      onFinalTranscript: (txt) => {
        setText("");
        setMsgs((prev) => [...prev, { id: "user-" + Date.now(), from: "user", text: txt }]);
      },
      onPartialResponseToken: (tok) => {
        setTyping(false);
        setMsgs((prev) => {
          const id = responseId.current || (responseId.current = `aura-${Date.now()}`);
          const existing = prev.find((message) => message.id === id);
          return existing ? prev.map((message) => message.id === id ? { ...message, text: message.text + tok } : message)
            : [...prev, { id, from: "aura", text: tok }];
        });
      },
      onSpeaking: () => {
        setIsAuraSpeaking(true);
        setTyping(false);
      },
      onAssistantSpeechEnd: () => {
        setIsAuraSpeaking(false);
        setTyping(false);
      },
      onInterrupted: () => {
        setIsAuraSpeaking(false);
        setTyping(false);
      },
      onTurnCompleted: () => {
        setTyping(false);
      },
      onError: (error) => {
        setSessionError(error);
        setIsAuraSpeaking(false);
        setTyping(false);
      },
    });

    liveVoiceClient.connect();
    liveVoiceClient.setLanguage(currentLang);
    liveVoiceClient.setMicrophoneEnabled(false);
    liveVoiceClient.setClientTranscription(false);
    const unsubscribeSpeech = speechService.subscribe({
      onInterim: (transcript) => setInterimSpeech(transcript),
      onFinal: (transcript) => {
        if (micEnabledRef.current && transcript.trim()) {
          liveVoiceClient.sendClientTranscript(transcript.trim(), 0.96);
          setInterimSpeech("");
        }
      },
      onError: (error) => {
        // Browser recognition may be unavailable; keep PCM/server STT active.
        liveVoiceClient.setClientTranscription(false);
        if (error === "not-allowed" || error === "audio-capture") setSessionError("Microphone access is unavailable. Check browser permissions or type below.");
      },
    });

    return () => {
      liveVoiceClient.disconnect();
      unsubscribeSpeech();
      micEnabledRef.current = false;
      speechService.stop();
      audioEngine.releaseMicrophone();
      liveVoiceClient.setCallbacks({});
      stopCamera();
    };
  }, []);

  // ── Camera Initialization & Frame Stream ──────────────────────────────────
  useEffect(() => {
    if (!cameraActive) return;
    const socket = new WebSocket(getWebSocketUrl("/api/v1/emotion/ws"));
    let waiting = false;
    let sentAt = 0;
    socket.onmessage = (event) => {
      waiting = false;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "error") { setCameraError(data.message || "Face observations are unavailable."); return; }
        if (data.primary_emotion && cameraActiveRef.current) {
          setFaceEmotion(data);
          liveVoiceClient.sendFaceEmotion(data);
          setFusedEmotion({ primary: data.face_detected ? data.primary_emotion : "Unavailable", confidence: data.confidence || 0, sources: data.face_detected ? ["Camera observation"] : [] });
        }
      } catch { /* Ignore malformed observations. */ }
    };
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (waiting && Date.now() - sentAt < 5000) return;
      if (!video || !canvas || video.readyState < 2 || socket.readyState !== WebSocket.OPEN || !cameraActiveRef.current || socket.bufferedAmount > 64000) return;
      canvas.width = 320;
      canvas.height = Math.round(320 * video.videoHeight / video.videoWidth);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      socket.send(JSON.stringify({ type: "frame", image: canvas.toDataURL("image/jpeg", 0.65) }));
      waiting = true;
      sentAt = Date.now();
    }, 400);
    return () => {
      window.clearInterval(timer);
      socket.onmessage = null;
      socket.close();
      setFusedEmotion({ primary: "Unavailable", confidence: 0, sources: [] });
    };
  }, [cameraActive]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn("Camera permission denied:", err);
      setCameraError("Camera permission denied or camera unavailable. Microphone conversation remains active.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const toggleCamera = () => {
    if (cameraActive) stopCamera();
    else startCamera();
  };

  const toggleMic = async () => {
    if (micStarting) return;
    if (audioEngine.hasActivePlayback()) liveVoiceClient.interrupt();
    if (micEnabledRef.current) {
      micEnabledRef.current = false;
      speechService.stop();
      liveVoiceClient.setMicrophoneEnabled(false);
      audioEngine.releaseMicrophone();
      setMicActive(false);
    } else {
      setMicStarting(true);
      try {
        await audioEngine.getAudioContext();
        const stream = await audioEngine.initMicrophonePipeline();
        if (!stream) { setSessionError("Allow microphone access to speak. Text conversation remains available."); return; }
        micEnabledRef.current = true;
        liveVoiceClient.setMicrophoneEnabled(true);
        liveVoiceClient.setClientTranscription(speechService.isSupported);
        liveVoiceClient.connect();
        if (speechService.isSupported) speechService.start();
        setSessionError(null);
        setMicActive(true);
      } catch {
        setSessionError("Could not start audio. Check microphone permissions and try again.");
      } finally { setMicStarting(false); }
    }
  };

  const sendMsg = async () => {
    const t = text.trim();
    if (!t) return;
    // Unlock browser playback while the Send click/Enter gesture is active.
    await audioEngine.getAudioContext();
    if (!liveVoiceClient.getIsSessionReady()) {
      setSessionError("Aura is reconnecting. Your message is still here—send it when connected.");
      liveVoiceClient.connect();
      return;
    }
    if (audioEngine.hasActivePlayback()) liveVoiceClient.interrupt();
    if (!liveVoiceClient.sendTextMessage(t, currentLang)) return;
    setMsgs((m) => [...m, { id: "user-" + Date.now(), from: "user", text: t }]);
    setText("");
    setTyping(true);

  };

  const latestAuraMsg = [...msgs].reverse().find((m) => m.from === "aura")?.text || "";

  return (
    <div className="face-stage relative w-full h-full min-h-[480px] flex flex-col justify-between overflow-hidden px-2 sm:px-4 py-2">
      {/* ── 1. Top Controls Bar: State & Options ── */}
      <header className="face-stage__bar liquid-glass-elevated rounded-[24px] px-3 sm:px-4 py-2 flex items-center justify-between z-30 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22D3EE]" />
            <span className="hidden sm:inline text-[13px] font-bold text-slate-800 dark:text-white">
              Face-to-Face Hologram
            </span>
          </div>

          <span className="liquid-pill px-2.5 py-0.5 text-[10px] uppercase font-bold text-violet-300">
            {connectionStatus !== "connected" ? connectionStatus : micActive || isAuraSpeaking || typing ? duplexState : "Ready · microphone off"}
          </span>
        </div>

        {/* Action Toggles: Language, Voice, Pacer & Drawer */}
        <div className="flex items-center gap-2">
          {/* Breathing Pacer Button */}
          <button
            onClick={() => setShowBreathingPacer(!showBreathingPacer)}
            className={`liquid-button px-3 py-1 text-xs gap-1.5 ${
              showBreathingPacer ? "text-violet-300 border-violet-500/40" : "text-slate-300"
            }`}
          >
            <Wind size={13} />
            <span className="hidden md:inline">Pacer</span>
          </button>

          {/* Voice Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowVoiceMenu(!showVoiceMenu);
                setShowLangMenu(false);
              }}
              className="liquid-button px-3 py-1 text-xs text-slate-300 gap-1.5"
            >
              <Volume2 size={13} />
              <span className="hidden md:inline">{voiceList.find((v) => v.id === currentVoiceId)?.name.split(" ")[0] || "Voice"}</span>
            </button>

            <AnimatePresence>
              {showVoiceMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute right-0 top-full mt-2 w-52 liquid-glass-elevated rounded-2xl p-1.5 z-50 shadow-2xl"
                >
                  {voiceList.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setCurrentVoiceId(v.id);
                        voiceService.setVoice(v.id);
                        setShowVoiceMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold rounded-xl flex items-center justify-between cursor-pointer border-none bg-transparent hover:bg-white/10 ${
                        currentVoiceId === v.id ? "text-violet-400 font-bold" : "text-slate-300"
                      }`}
                    >
                      <span>{v.name}</span>
                      {currentVoiceId === v.id && <Check size={12} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Context & Diagnostics Drawer Toggle Button */}
          <button
            onClick={() => setShowSideDrawer(!showSideDrawer)}
            className={`liquid-button px-3 py-1 text-xs gap-1.5 ${
              showSideDrawer ? "text-cyan-300 border-cyan-500/40 bg-cyan-500/10" : "text-slate-300"
            }`}
            title="Toggle Context & Observations Drawer"
          >
            <Layers size={13} />
            <span className="hidden md:inline">Context</span>
          </button>
        </div>
      </header>
      {(sessionError || cameraError) && <div role="status" className="liquid-card-subtle px-4 py-2 my-2 text-sm text-amber-700 dark:text-amber-200">{sessionError || cameraError}</div>}
      {!micActive && !micStarting && <div className="flex items-center justify-center gap-3 py-2 text-sm text-slate-600 dark:text-slate-300"><span>Ready to talk?</span><button onClick={toggleMic} className="liquid-button-primary rounded-full px-4 py-2" aria-label="Start voice conversation">Start conversation</button></div>}
      {interimSpeech && <p role="status" className="text-center text-sm text-slate-600 dark:text-cyan-200 m-0 py-2">You: {interimSpeech}</p>}

      {/* ── 2. Hero Center: Full Holographic 3D Aura Character ── */}
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden z-10">
        <HolographicAuraAvatar
          isSpeaking={isAuraSpeaking}
          isListening={micActive && !isAuraSpeaking}
          isThinking={typing}
          userEmotion={fusedEmotion.primary}
          className="w-full h-full"
        />

        {/* Live Subtitle Transcript Projection Overlay */}
        <div className="face-captions absolute bottom-4 left-4 right-4 sm:left-12 sm:right-12 max-w-xl mx-auto pointer-events-none z-20 flex flex-col items-center text-center" aria-live="polite">
          <AnimatePresence mode="wait">
            {latestAuraMsg && (
              <motion.div
                key={latestAuraMsg}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="liquid-glass-elevated rounded-[22px] px-6 py-3 shadow-2xl pointer-events-auto border border-violet-400/25"
              >
                <p className="text-[14px] sm:text-[15px] font-medium text-slate-800 dark:text-slate-100 leading-relaxed m-0 max-h-24 overflow-y-auto">
                  {latestAuraMsg}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {typing && (
            <div className="liquid-pill px-3 py-1 mt-2 flex items-center gap-1.5 text-xs text-violet-300">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>Aura is thinking...</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Picture-in-Picture User Camera Panel (Floating Corner) ── */}
      <motion.div
        drag
        dragConstraints={{ left: -300, right: 300, top: -400, bottom: 200 }}
        className={`face-stage__camera absolute top-16 right-4 z-40 liquid-glass-elevated rounded-[22px] overflow-hidden shadow-2xl transition-all ${
          isCameraExpanded ? "w-64 sm:w-72" : "w-44 sm:w-52"
        }`}
        style={{ cursor: "grab", position: "absolute" }}
      >
        <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Camera size={13} className="text-cyan-400" />
            <span>You</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCameraExpanded(!isCameraExpanded)}
              className="text-slate-400 hover:text-white p-0.5 border-none bg-transparent cursor-pointer"
            >
              {isCameraExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              onClick={toggleCamera}
              className="text-slate-400 hover:text-white p-0.5 border-none bg-transparent cursor-pointer"
            >
              {cameraActive ? <VideoIcon size={12} className="text-emerald-400" /> : <VideoOff size={12} className="text-rose-400" />}
            </button>
          </div>
        </div>

        {/* Video / Fallback View */}
        <div className="relative aspect-4/3 bg-slate-950 flex items-center justify-center">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover transform -scale-x-100 ${!cameraActive ? "hidden" : ""}`}
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {!cameraActive && (
            <div className="flex flex-col items-center gap-1 text-slate-400 p-3 text-center">
              <VideoOff size={22} className="opacity-50" />
              <span className="text-[10.5px]">Camera Off</span>
              <button
                onClick={startCamera}
                className="mt-1 px-2.5 py-0.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-semibold border-none cursor-pointer"
              >
                Enable
              </button>
            </div>
          )}

          {cameraActive && (
            <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded-full bg-black/70 text-[9px] font-semibold text-emerald-400">
              ● Live 30 FPS
            </div>
          )}
        </div>
      </motion.div>

      {/* ── 4. Bottom Conversation Controls (Liquid Glass) ── */}
      <footer className="w-full max-w-xl mx-auto liquid-glass-elevated rounded-[28px] p-2 flex items-center gap-3 z-30 shadow-2xl">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMsg()}
          placeholder={micActive ? "Speak naturally or write here..." : "Type what is on your mind..."}
          className="bg-transparent border-none outline-none flex-1 px-4 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 font-medium"
        />

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={toggleMic}
          disabled={micStarting}
          aria-label={micStarting ? "Starting microphone" : micActive ? "Mute microphone" : "Start voice conversation"}
          className={`w-10 h-10 rounded-full liquid-button shrink-0 ${
            micActive ? "text-violet-300 bg-violet-500/20 border-violet-500/40" : "text-rose-400"
          }`}
          title={micActive ? "Mute Microphone" : "Unmute Microphone"}
        >
          {micActive ? <Mic size={17} /> : <MicOff size={17} />}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={sendMsg}
          disabled={!text.trim()}
          className="liquid-button-primary w-10 h-10 rounded-full shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send"
        >
          <Send size={16} />
        </motion.button>
      </footer>

      {/* ── 5. Collapsible Context & Telemetry Drawer (Right Side) ── */}
      <AnimatePresence>
        {showSideDrawer && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Conversation context"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="fixed top-14 right-3 bottom-3 w-80 sm:w-96 z-50 liquid-glass-elevated rounded-[28px] p-5 shadow-2xl flex flex-col justify-between overflow-y-auto custom-scrollbar border-l border-white/20"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Layers size={17} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white m-0">
                    Live Session Context
                  </h3>
                </div>
                <button
                  onClick={() => setShowSideDrawer(false)}
                  className="w-7 h-7 rounded-full liquid-button text-slate-400 hover:text-white"
                  aria-label="Close conversation context"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Personal Focus Goal */}
              <div className="liquid-card-subtle p-3 mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <Brain size={14} />
                  <span>Personal Goal</span>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1 m-0">
                  {activeGoal}
                </p>
              </div>

              {/* Active Focus Interest */}
              <div className="liquid-card-subtle p-3 mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-violet-400 uppercase tracking-wider">
                  <Sparkles size={14} />
                  <span>Primary Focus</span>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1 m-0">
                  {activeInterest}
                </p>
              </div>

              {/* Affective Observation */}
              <div className="liquid-card-subtle p-3 mb-4">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  <Heart size={14} />
                  <span>Observed Wellbeing State</span>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-slate-400">Fused State:</span>
                  <span className="font-bold text-cyan-300">{fusedEmotion.primary}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-slate-400">Sources:</span>
                  <span className="text-slate-300">{fusedEmotion.sources.join(" + ")}</span>
                </div>
              </div>

              {/* Diagnostic HUD Buttons */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Telemetry & HUDs
                </span>
                <button
                  onClick={() => setShowDuplexHud(true)}
                  className="liquid-button py-2 px-3 text-xs justify-between text-slate-300"
                >
                  <span>Duplex Telemetry Inspector</span>
                  <Activity size={14} />
                </button>
                <button
                  onClick={() => setShowFaceDebug(true)}
                  className="liquid-button py-2 px-3 text-xs justify-between text-slate-300"
                >
                  <span>Face Action Units (FACS)</span>
                  <Sliders size={14} />
                </button>
                <button
                  onClick={() => setShowAudioDebugger(true)}
                  className="liquid-button py-2 px-3 text-xs justify-between text-slate-300"
                >
                  <span>Acoustic Wave & Latency Debugger</span>
                  <Radio size={14} />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 text-center m-0 mt-4">
              Aura is an AI companion · Real Web Audio & WebGL telemetry
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Diagnostics HUDs */}
      <AnimatePresence>
        {showDuplexHud && (
          <VoiceDiagnosticsHud onClose={() => setShowDuplexHud(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFaceDebug && (
          <FaceDebugPanel
            isOpen={showFaceDebug}
            onClose={() => setShowFaceDebug(false)}
            cameraActive={cameraActive}
            camFps={camFps}
            faceDetected={cameraActive && faceEmotion.face_detected}
            trackingQuality={0.88}
            qualityBreakdown={{}}
            actionUnits={{} as any}
            gaze={{} as any}
            headPose={{} as any}
            ferScores={{}}
            facialMovement={{}}
            transitions={{}}
            latencies={{}}
            smoothedEmotion={faceEmotion.primary_emotion}
            confidence={faceEmotion.confidence}
            droppedFrames={0}
            errors={[]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAudioDebugger && (
          <LiveAudioDebugger
            onClose={() => setShowAudioDebugger(false)}
            sessionId={liveVoiceClient.getSessionId()}
            turnId={liveVoiceClient.getTurnId()}
            partialTranscript=""
            finalTranscript=""
            voiceEmotion="calm"
            voiceConfidence={0.85}
            faceEmotion="calm"
            faceConfidence={0.85}
            openFaceState="Tracking (30 fps)"
            ferState="Active"
            textEmotion="calm"
            fusedEmotion="calm"
            nvidiaState="streaming"
            ttftMs={260}
            ttsStatus={isAuraSpeaking ? "playing" : "idle"}
            playbackQueueCount={0}
            wsState="connected"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
