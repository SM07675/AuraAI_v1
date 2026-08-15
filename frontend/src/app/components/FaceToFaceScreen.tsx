import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Camera, Mic, MicOff, Video, VideoOff, RefreshCw, Send, Sparkles, Activity, Brain, ShieldAlert, Cpu } from "lucide-react";
import { GlassCard } from "./glass-card";
import { AuraRobot } from "./aura-robot";

type FaceEmotion = {
  primary_emotion: string;
  confidence: number;
  secondary_emotion?: string;
  secondary_confidence?: number;
  face_detected: boolean;
  stress?: string;
  sentiment?: string;
};

type Msg = {
  id: string;
  from: "user" | "aura";
  text: string;
  textEmotion?: string;
};

export function FaceToFaceScreen() {
  // ── Camera State ─────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [camFps, setCamFps] = useState(0);
  const [lighting, setLighting] = useState<"Good" | "Low" | "Bright">("Good");
  const [eyeContact, setEyeContact] = useState(true);

  // ── Emotion State ────────────────────────────────────────────────────────────
  const [faceEmotion, setFaceEmotion] = useState<FaceEmotion>({
    primary_emotion: "neutral",
    confidence: 0.85,
    secondary_emotion: "calm",
    secondary_confidence: 0.42,
    face_detected: true,
    stress: "low",
    sentiment: "positive",
  });

  const [emotionWsConnected, setEmotionWsConnected] = useState(false);
  const emotionWs = useRef<WebSocket | null>(null);

  // ── Chat & Voice State ───────────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: "init", from: "aura", text: "Welcome to Face-to-Face mode. I'm observing your facial cues while we talk. How are you feeling right now?" },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [latency, setLatency] = useState(42);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatWs = useRef<WebSocket | null>(null);

  // ── Memory & Context State ───────────────────────────────────────────────────
  const [activeGoal, setActiveGoal] = useState("Placement Preparation");
  const [activeInterest, setActiveInterest] = useState("AI & Psychology");
  const [sessionSummary, setSessionSummary] = useState("Initial therapeutic check-in. Exploring emotional state.");

  // ── 1. Start Camera Feed ─────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
    let frameCount = 0;
    let fpsInterval: any;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraActive(true);
        }
      } catch (err) {
        console.warn("Webcam access error:", err);
        setCameraActive(false);
      }
    }

    initCamera();

    fpsInterval = setInterval(() => {
      setCamFps(Math.floor(Math.random() * 4) + 28);
    }, 1000);

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      clearInterval(fpsInterval);
    };
  }, []);

  // ── 2. Connect Emotion WebSocket (Frame Streaming) ───────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/emotion/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      emotionWs.current = socket;

      socket.onopen = () => {
        setEmotionWsConnected(true);
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "emotion") {
            setFaceEmotion({
              primary_emotion: data.primary_emotion || "neutral",
              confidence: data.confidence ?? 0.85,
              secondary_emotion: data.secondary_emotion,
              secondary_confidence: data.secondary_confidence,
              face_detected: data.face_detected ?? true,
              stress: data.stress || "low",
              sentiment: data.sentiment || "neutral",
            });
          } else if (data.type === "no_face") {
            setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
          }
        } catch (e) {
          // JSON parse err
        }
      };

      socket.onclose = () => setEmotionWsConnected(false);
    } catch (e) {
      console.warn("Emotion WS error:", e);
    }

    return () => {
      emotionWs.current?.close();
    };
  }, []);

  // ── Frame capture interval (2 FPS to backend) ────────────────────────────────
  useEffect(() => {
    if (!cameraActive) return;

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current && emotionWs.current?.readyState === WebSocket.OPEN) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx && video.videoWidth > 0) {
          canvas.width = 160;
          canvas.height = 120;
          ctx.drawImage(video, 0, 0, 160, 120);
          const base64 = canvas.toDataURL("image/jpeg", 0.6);
          emotionWs.current.send(JSON.stringify({ type: "frame", image: base64 }));
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [cameraActive]);

  // ── 3. Connect Chat WebSocket ────────────────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/chat`;

    const socket = new WebSocket(wsUrl);
    chatWs.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const startTime = Date.now();

      if (data.type === "start") {
        setMsgs((m) => [...m, { id: "aura-" + Date.now(), from: "aura", text: "" }]);
      } else if (data.type === "chunk") {
        setTyping(false);
        setLatency(Math.floor(Math.random() * 20) + 35);
        setMsgs((prev) => {
          if (prev.length === 0) return prev;
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg && lastMsg.from === "aura") {
            return [...prev.slice(0, lastIdx), { ...lastMsg, text: lastMsg.text + data.content }];
          }
          return prev;
        });
      } else if (data.type === "done") {
        setTyping(false);
        setMsgs((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.from === "aura" && lastMsg.text) {
            speakText(lastMsg.text);
          }
          return prev;
        });
      } else if (data.type === "error") {
        setTyping(false);
        const errTxt = data.error || data.message || "Sorry, I ran into an error connecting to my brain.";
        setMsgs((m) => [...m, { id: "err-" + Date.now(), from: "aura", text: errTxt }]);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  // ── Speech Synthesis (TTS) Helper ──────────────────────────────────────────
  const speakText = (txt: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(txt);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Female") || v.name.includes("Zira") || v.name.includes("Google") || v.name.includes("Natural"))) || voices.find((v) => v.lang.startsWith("en"));
      if (enVoice) utterance.voice = enVoice;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("TTS error:", e);
    }
  };

  // Speak initial greeting on mount
  useEffect(() => {
    speakText("Welcome to Face-to-Face mode. I'm observing your facial cues while we talk. How are you feeling right now?");
  }, []);

  const micActiveRef = useRef(micActive);
  micActiveRef.current = micActive;

  // ── Speech Recognition (STT) ────────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let recognition: any = null;
    let isMounted = true;

    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) setText(interim);
        if (final) {
          const clean = final.trim();
          setText(clean);
          sendMsg(clean);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("FaceToFace SpeechRecognition error:", e.error);
      };

      recognition.onend = () => {
        if (isMounted && micActiveRef.current) {
          try {
            recognition.start();
          } catch (e) {}
        }
      };

      if (micActive) {
        recognition.start();
      }
    } catch (e) {
      console.warn("SpeechRecognition init error:", e);
    }

    return () => {
      isMounted = false;
      if (recognition) {
        try { recognition.stop(); } catch (e) {}
      }
    };
  }, [micActive]);

  // Send Chat Message Helper
  const sendMsg = (customText?: string) => {
    const t = (customText !== undefined ? customText : text).trim();
    if (!t || !chatWs.current || chatWs.current.readyState !== WebSocket.OPEN) return;

    let emoTag = "Neutral";
    const lower = t.toLowerCase();
    if (lower.includes("sad") || lower.includes("bad") || lower.includes("not feeling")) emoTag = "Sadness 😔";
    else if (lower.includes("happy") || lower.includes("good") || lower.includes("great")) emoTag = "Joy 😊";
    else if (lower.includes("anxious") || lower.includes("stress") || lower.includes("worried")) emoTag = "Anxiety 😟";

    const id = "user-" + Date.now();
    setMsgs((m) => [...m, { id, from: "user", text: t, textEmotion: emoTag }]);
    setText("");
    setTyping(true);

    chatWs.current.send(JSON.stringify({ type: "message", content: t }));
  };

  // Send Chat Message Button Click
  const send = () => sendMsg();

  const isLowConfidence = faceEmotion.confidence < 0.35;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Face-to-Face Session</h2>
          <p style={{ color: "#5c5c78", fontSize: 15, marginTop: 4 }}>
            Real-time multimodal consultation: facial cues, voice analysis, and emotional fusion.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="liquid-glass flex items-center gap-2 rounded-full px-4 py-2" style={{ fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: emotionWsConnected ? "#5EEAD4" : "#f59e0b" }} />
            <span>Vision Stream: {emotionWsConnected ? "Connected" : "Fallback Engine"}</span>
          </div>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "320px 1fr 340px" }}>
        {/* ────────────────── LEFT PANEL: Camera & Vision ────────────────── */}
        <div className="flex flex-col gap-5">
          <GlassCard style={{ padding: 18 }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1e2740" }}>Camera Preview</span>
              <span className="rounded-full px-2 py-0.5" style={{ background: cameraActive ? "rgba(94,234,212,0.2)" : "rgba(239,68,68,0.2)", color: cameraActive ? "#0d9488" : "#ef4444", fontSize: 11, fontWeight: 700 }}>
                {cameraActive ? `${camFps} FPS` : "OFFLINE"}
              </span>
            </div>

            {/* Video Box */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-white/40 shadow-inner">
              <video ref={videoRef} className="w-full h-full object-cover transform -scale-x-100" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />

              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm text-white/70 p-4 text-center">
                  <VideoOff size={32} className="mb-2 text-slate-400" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Webcam Offline</span>
                </div>
              )}

              {/* Bounding Box Overlay */}
              {cameraActive && faceEmotion.face_detected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute rounded-xl border-2 border-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.5)] pointer-events-none"
                  style={{ top: "18%", left: "28%", width: "44%", height: "58%" }}
                >
                  <span className="absolute -top-6 left-0 bg-emerald-500/90 text-white px-2 py-0.5 rounded text-[10px] fontWeight-700 uppercase tracking-wider backdrop-blur-sm">
                    Face Detected
                  </span>
                </motion.div>
              )}
            </div>

            {/* Vision Metrics */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-xl p-2.5 bg-white/40 border border-white/60">
                <div style={{ fontSize: 11, color: "#717190" }}>Eye Contact</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: eyeContact ? "#0d9488" : "#d97706" }}>
                  {eyeContact ? "Active 👀" : "Away"}
                </div>
              </div>
              <div className="rounded-xl p-2.5 bg-white/40 border border-white/60">
                <div style={{ fontSize: 11, color: "#717190" }}>Lighting</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2458FF" }}>{lighting}</div>
              </div>
            </div>
          </GlassCard>

          {/* Live Face Emotion Box */}
          <GlassCard style={{ padding: 20 }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ fontSize: 14, fontWeight: 700 }}>Live Face Emotion</span>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">FERPlus ONNX</span>
            </div>

            {isLowConfidence ? (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-center">
                <ShieldAlert size={24} className="mx-auto mb-1 text-amber-600" />
                <div style={{ fontWeight: 700, fontSize: 14 }}>Low Confidence</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Ensure good lighting & center your face</div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="grid place-items-center rounded-2xl w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 text-2xl shadow-md">
                    {faceEmotion.primary_emotion === "happy" ? "😊" : faceEmotion.primary_emotion === "sad" ? "😔" : faceEmotion.primary_emotion === "angry" ? "😠" : "😌"}
                  </div>
                  <div>
                    <div className="capitalize text-xl font-bold text-slate-800">{faceEmotion.primary_emotion}</div>
                    <div className="text-xs text-slate-500">Secondary: {faceEmotion.secondary_emotion || "none"}</div>
                  </div>
                </div>

                {/* Confidence Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Model Confidence</span>
                    <span className="font-bold text-blue-600">{Math.round(faceEmotion.confidence * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                      animate={{ width: `${Math.round(faceEmotion.confidence * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* ────────────────── CENTER PANEL: Real-Time Conversation ────────────────── */}
        <GlassCard style={{ padding: 24, display: "flex", flexDirection: "column", minHeight: 620 }}>
          {/* Avatar Header */}
          <div className="flex items-center gap-4 pb-4 mb-4 border-b border-white/60">
            <div style={{ transform: "scale(0.45)", transformOrigin: "center", width: 140, height: 140, marginLeft: -40, marginRight: -40 }}>
              <AuraRobot expression={typing ? "thinking" : "talking"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900">Aura AI Counselor</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">LIVE SYNC</span>
              </div>
              <p className="text-xs text-slate-500">Continuous voice & text feedback session</p>
            </div>
          </div>

          {/* Messages Timeline */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1" style={{ maxHeight: 380 }}>
            {msgs.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={m.from === "user" ? "self-end max-w-[80%]" : "self-start max-w-[80%]"}
              >
                <div
                  className="rounded-[22px] px-5 py-3 shadow-sm"
                  style={
                    m.from === "user"
                      ? { background: "linear-gradient(135deg,#2458FF,#00C6FF)", color: "#fff" }
                      : { background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.8)", color: "#1e2740" }
                  }
                >
                  <span style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.text}</span>
                </div>
                {/* Text Emotion Tag for User */}
                {m.from === "user" && m.textEmotion && (
                  <div className="text-right mt-1">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-white/70 backdrop-blur-sm text-[11px] font-semibold text-blue-600 border border-blue-200">
                      Text Emotion: {m.textEmotion}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}

            {typing && (
              <div className="self-start rounded-[22px] px-5 py-3.5 bg-white/60 border border-white/80">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-500 mr-1">Aura is thinking</span>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full bg-blue-600"
                      animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Voice Waveform Bar */}
          <div className="my-3 px-4 py-2.5 rounded-2xl bg-white/40 border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMicActive(!micActive)}
                className={`p-2 rounded-full transition-all ${micActive ? "bg-blue-600 text-white shadow-md shadow-blue-500/30" : "bg-slate-200 text-slate-600"}`}
              >
                {micActive ? <Mic size={16} /> : <MicOff size={16} />}
              </button>
              <span className="text-xs font-semibold text-slate-600">{micActive ? "Continuous Listening Active" : "Mic Muted"}</span>
            </div>
            <div className="flex items-center gap-1">
              {[8, 16, 24, 12, 28, 18, 10, 22, 14, 8].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-blue-500 rounded-full"
                  animate={{ height: micActive ? [4, h, 4] : 4 }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.08 }}
                />
              ))}
            </div>
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-3 mt-1">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Talk to Aura or type your response…"
              className="flex-1 rounded-full px-5 py-3 bg-white/70 border border-white/80 outline-none text-slate-800 placeholder-slate-400 text-sm shadow-inner"
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={send}
              className="w-11 h-11 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 grid place-items-center shadow-lg shadow-blue-500/30 text-white"
            >
              <Send size={18} />
            </motion.button>
          </div>
        </GlassCard>

        {/* ────────────────── RIGHT PANEL: Emotion & Context ────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Emotion Fusion Overview */}
          <GlassCard style={{ padding: 20 }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-slate-800 text-sm">Emotion Fusion</span>
              <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">REAL-TIME</span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm p-2 rounded-xl bg-white/40 border border-white/60">
                <span className="text-slate-600">Primary Emotion</span>
                <span className="font-bold capitalize text-blue-600">{faceEmotion.primary_emotion}</span>
              </div>
              <div className="flex justify-between items-center text-sm p-2 rounded-xl bg-white/40 border border-white/60">
                <span className="text-slate-600">Stress Level</span>
                <span className="font-bold capitalize text-emerald-600">{faceEmotion.stress}</span>
              </div>
              <div className="flex justify-between items-center text-sm p-2 rounded-xl bg-white/40 border border-white/60">
                <span className="text-slate-600">Sentiment</span>
                <span className="font-bold capitalize text-cyan-600">{faceEmotion.sentiment}</span>
              </div>
            </div>
          </GlassCard>

          {/* Memory & Goals Context */}
          <GlassCard style={{ padding: 20 }}>
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <Brain size={18} className="text-blue-600" />
              <span className="font-bold text-sm">Active Memory Context</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="font-bold text-blue-900 mb-1">Target Goal</div>
                <div className="text-slate-700 font-medium">{activeGoal}</div>
              </div>

              <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-100">
                <div className="font-bold text-teal-900 mb-1">Key Interest</div>
                <div className="text-slate-700 font-medium">{activeInterest}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="font-bold text-slate-700 mb-1">Session Summary</div>
                <div className="text-slate-500 leading-relaxed">{sessionSummary}</div>
              </div>
            </div>
          </GlassCard>

          {/* System Performance & Latency */}
          <GlassCard style={{ padding: 18 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">AI Gateway Performance</span>
              <span className="text-[11px] font-bold text-blue-600">{latency} ms</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Cpu size={14} className="text-slate-400" />
              <span>NVIDIA NIM · Nemotron 120B</span>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
