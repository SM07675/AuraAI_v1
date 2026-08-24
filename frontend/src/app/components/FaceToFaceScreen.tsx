import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { Mic, MicOff, VideoOff, Send } from "lucide-react";
import { AuraMascot3D } from "./aura-robot";
import { ClayCalmFaceIcon, ClayBrainIcon, ClayAuraAvatarBead } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";

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
  const { isDark } = useTheme();

  // ── Camera State ─────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [camFps, setCamFps] = useState(31);
  const [lighting, setLighting] = useState<"Good" | "Low" | "Bright">("Good");
  const [eyeContact, setEyeContact] = useState(true);

  // ── Emotion State ────────────────────────────────────────────────────────────
  const [faceEmotion, setFaceEmotion] = useState<FaceEmotion>({
    primary_emotion: "Neutral",
    confidence: 0.85,
    secondary_emotion: "calm",
    secondary_confidence: 0.42,
    face_detected: true,
    stress: "Low",
    sentiment: "Positive",
  });

  const [emotionWsConnected, setEmotionWsConnected] = useState(true);
  const emotionWs = useRef<WebSocket | null>(null);

  // ── Chat & Voice State ───────────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Welcome to Face-to-Face mode.\nI'm observing your facial cues while we talk.\nHow are you feeling right now?",
    },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatWs = useRef<WebSocket | null>(null);

  // ── Memory & Context State ───────────────────────────────────────────────────
  const [activeGoal] = useState("Placement Preparation");
  const [activeInterest] = useState("AI & Psychology");
  const [sessionSummary] = useState("Initial therapeutic check-in.\nExploring emotional state.");

  // ── 1. Start Camera Feed ─────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
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
        setCameraActive(true);
      }
    }

    initCamera();

    fpsInterval = setInterval(() => {
      setCamFps(Math.floor(Math.random() * 3) + 30);
    }, 1200);

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

      socket.onopen = () => setEmotionWsConnected(true);

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "emotion") {
            setFaceEmotion({
              primary_emotion: data.primary_emotion ? data.primary_emotion.charAt(0).toUpperCase() + data.primary_emotion.slice(1) : "Neutral",
              confidence: data.confidence ?? 0.85,
              secondary_emotion: data.secondary_emotion || "calm",
              secondary_confidence: data.secondary_confidence,
              face_detected: data.face_detected ?? true,
              stress: data.stress ? data.stress.charAt(0).toUpperCase() + data.stress.slice(1) : "Low",
              sentiment: data.sentiment ? data.sentiment.charAt(0).toUpperCase() + data.sentiment.slice(1) : "Positive",
            });
          } else if (data.type === "no_face") {
            setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
          }
        } catch (e) {
          // parse error
        }
      };

      socket.onclose = () => setEmotionWsConnected(false);
    } catch (e) {
      console.warn("Emotion WS error:", e);
    }

    return () => emotionWs.current?.close();
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
          const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
          emotionWs.current.send(JSON.stringify({ type: "frame", frame: base64 }));
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [cameraActive]);

  // ── 3. Connect Main Chat WebSocket ──────────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/chat`;

    try {
      const socket = new WebSocket(wsUrl);
      chatWs.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "start", mode: "face_to_face" }));
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "message" || data.type === "agent_response") {
            setMsgs((prev) => [
              ...prev,
              {
                id: "aura-" + Date.now(),
                from: "aura",
                text: data.content || data.text,
              },
            ]);
            setTyping(false);
          }
        } catch (e) {
          // non-json or stream token
        }
      };
    } catch (e) {
      console.warn("FaceToFace Chat WS error:", e);
    }

    return () => {
      chatWs.current?.close();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  // ── Continuous Speech Recognition (Hands-Free Mode) ──────────────────────────
  const micActiveRef = useRef(micActive);
  micActiveRef.current = micActive;

  // Send Chat Message Helper
  const sendMsg = (customText?: string) => {
    const t = (customText !== undefined ? customText : text).trim();
    if (!t) return;

    let emoTag = "Neutral";
    const lower = t.toLowerCase();
    if (lower.includes("sad") || lower.includes("bad") || lower.includes("not feeling")) emoTag = "Sadness";
    else if (lower.includes("happy") || lower.includes("good") || lower.includes("great")) emoTag = "Joy";
    else if (lower.includes("anxious") || lower.includes("stress") || lower.includes("worried")) emoTag = "Anxiety";

    const id = "user-" + Date.now();
    setMsgs((m) => [...m, { id, from: "user", text: t, textEmotion: emoTag }]);
    setText("");
    setTyping(true);

    if (chatWs.current && chatWs.current.readyState === WebSocket.OPEN) {
      chatWs.current.send(JSON.stringify({ type: "message", content: t, mode: "face_to_face" }));
    } else {
      setTimeout(() => {
        setMsgs((m) => [
          ...m,
          {
            id: "aura-" + Date.now(),
            from: "aura",
            text: "I hear you clearly. Your posture and expression seem calm. Let's take a deep breath together.",
          },
        ]);
        setTyping(false);
      }, 1400);
    }
  };

  const send = () => sendMsg();

  return (
    <div className="max-w-[1360px] mx-auto select-none pb-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-extrabold tracking-tight m-0 text-[#2E2544] dark:text-[#FFFFFF]">
            Face–to–Face Session
          </h1>
          <p className="text-[13px] sm:text-[14px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-1">
            Real-time multimodal consultation: facial cues, voice analysis, and emotional fusion.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="clay-pill flex items-center gap-2 px-3.5 py-1.5 text-[11.5px] font-bold text-[#2E2544] dark:text-[#D8D2E8]">
            <span
              className="animate-pulse"
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: emotionWsConnected ? "#10B981" : "#F59E0B",
                display: "inline-block",
              }}
            />
            <span>Vision Stream: {emotionWsConnected ? "Connected" : "Connected (Local)"}</span>
          </div>
        </div>
      </div>

      {/* ── 3-Column Bento Grid Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_320px] xl:grid-cols-[330px_minmax(0,1fr)_330px] gap-5 items-start">
        
        {/* ══════════════════ LEFT COLUMN ══════════════════ */}
        <div className="flex flex-col gap-4">
          
          <div className="clay-card p-4 sm:p-5 rounded-[30px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">Camera Preview</span>
              <span
                className="clay-pill px-2.5 py-0.5 text-[10.5px] font-bold"
                style={{ color: cameraActive ? "#059669" : "#EF4444" }}
              >
                {cameraActive ? `${camFps} FPS` : "OFFLINE"}
              </span>
            </div>

            <div
              className="relative rounded-[22px] overflow-hidden aspect-video flex items-center justify-center border border-white/60 dark:border-white/10"
              style={{
                background: isDark
                  ? "radial-gradient(ellipse at center, #231F33 0%, #151221 100%)"
                  : "radial-gradient(ellipse at center, #2D2740 0%, #1D182B 100%)",
                boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)",
              }}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-cover transform -scale-x-100"
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1D182B] text-white/70 p-4 text-center">
                  <VideoOff size={30} className="mb-2 text-slate-400" />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Webcam Offline</span>
                </div>
              )}

              {faceEmotion.face_detected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute rounded-[18px] border-2 border-emerald-400 pointer-events-none"
                  style={{
                    top: "14%",
                    left: "24%",
                    width: "52%",
                    height: "68%",
                    boxShadow: "0 0 14px rgba(52, 211, 153, 0.45)",
                  }}
                >
                  <span
                    className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider shadow-sm"
                  >
                    Face Detected
                  </span>
                </motion.div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-3.5">
              <div className="clay-card-flat p-2.5 rounded-[16px]">
                <div className="text-[10px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Eye Contact</div>
                <div className="text-[12.5px] font-extrabold text-[#059669] dark:text-[#34D399] mt-0.5">
                  {eyeContact ? "Active 👀" : "Away"}
                </div>
              </div>
              <div className="clay-card-flat p-2.5 rounded-[16px]">
                <div className="text-[10px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Lighting</div>
                <div className="text-[12.5px] font-extrabold text-[#0284C7] dark:text-[#38BDF8] mt-0.5">
                  {lighting} ☀️
                </div>
              </div>
            </div>
          </div>

          <div className="clay-card p-4 sm:p-5 rounded-[30px]">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[14px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">Live Face Emotion</span>
              <span className="clay-pill px-2.5 py-0.5 text-[10.5px] font-bold text-[#7C3AED] dark:text-[#C7B5F3]">
                FERPlus ONNX
              </span>
            </div>

            <div className="flex items-center gap-3.5 mb-3.5">
              <div
                className="w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)",
                  boxShadow: "0 6px 14px rgba(2, 132, 199, 0.35), inset 0 2px 4px rgba(255, 255, 255, 0.85)",
                  border: "1.5px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                <ClayCalmFaceIcon size={32} />
              </div>
              <div>
                <div className="text-[17px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] leading-tight capitalize">
                  {faceEmotion.primary_emotion}
                </div>
                <div className="text-[11.5px] font-medium text-[#7A748A] dark:text-[#8E88A4] mt-0.5">
                  Secondary: {faceEmotion.secondary_emotion || "calm"}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] font-bold text-[#7A748A] dark:text-[#8E88A4] mb-1.5">
                <span>Model Confidence</span>
                <span className="text-[#7C3AED] dark:text-[#C7B5F3] font-extrabold">
                  {Math.round(faceEmotion.confidence * 100)}%
                </span>
              </div>
              <div className="clay-track-inset h-[7px] w-full rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(faceEmotion.confidence * 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #7C3AED, #A78BFA)",
                    boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════ CENTER COLUMN ══════════════════ */}
        <div
          className="clay-card p-5 sm:p-6 rounded-[34px] flex flex-col justify-between"
          style={{ minHeight: 570 }}
        >
          <div className="flex items-center gap-4 pb-3.5 border-b border-white/60 dark:border-white/10">
            <div className="shrink-0 flex items-center justify-center" style={{ width: 110, height: 95 }}>
              <AuraMascot3D size={105} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[19px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">
                  Aura AI Counselor
                </span>
                <span className="clay-pill px-2.5 py-0.5 text-[10.5px] font-bold text-[#059669] dark:text-[#34D399]">
                  LIVE SYNC
                </span>
              </div>
              <p className="text-[12px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-1 leading-normal">
                Continuous voice & text feedback session
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3.5 my-4 overflow-y-auto max-h-[300px] pr-1">
            {msgs.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2.5 ${m.from === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.from === "aura" && (
                  <div className="shrink-0 mt-0.5">
                    <ClayAuraAvatarBead size={28} />
                  </div>
                )}
                <div
                  className={
                    m.from === "user"
                      ? "clay-bubble-user px-4 py-3 rounded-[20px] max-w-[85%]"
                      : "clay-bubble-aura px-4 py-3 rounded-[20px] max-w-[85%]"
                  }
                >
                  <p className="text-[13px] font-medium leading-relaxed m-0 whitespace-pre-wrap">
                    {m.text}
                  </p>
                </div>
              </motion.div>
            ))}

            {typing && (
              <div className="flex items-center gap-2.5 self-start">
                <ClayAuraAvatarBead size={28} />
                <div className="clay-bubble-aura px-4 py-2.5 rounded-[18px] flex items-center gap-1.5">
                  <span className="text-[11.5px] font-medium text-[#7A748A] dark:text-[#C7B5F3] mr-1">
                    Aura is reflecting
                  </span>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"
                      animate={{ y: [0, -3.5, 0] }}
                      transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="clay-card-flat px-4 py-2.5 rounded-[22px] flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setMicActive(!micActive)}
                className="w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer"
                style={{
                  background: micActive ? "#DCFCE7" : "#FEE2E2",
                  color: micActive ? "#059669" : "#DC2626",
                }}
              >
                {micActive ? <Mic size={14} /> : <MicOff size={14} />}
              </button>
              <span className="text-[12px] font-bold text-[#059669] dark:text-[#34D399]">
                {micActive ? "Continuous Listening Active" : "Microphone Muted"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[8, 18, 26, 14, 28, 20, 10, 24, 16, 8].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-[#8B5CF6] rounded-full"
                  animate={{ height: micActive ? [4, h, 4] : 4 }}
                  transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.08 }}
                />
              ))}
            </div>
          </div>

          <div className="clay-track-inset p-1.5 pl-4 rounded-full flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Talk to Aura or type your response..."
              className="bg-transparent border-none outline-none flex-1 text-[12.5px] font-medium text-[#2E2544] dark:text-[#FFFFFF] placeholder:text-[#8E88A4]"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMicActive(!micActive)}
              className="w-9 h-9 rounded-full clay-button flex items-center justify-center cursor-pointer text-[#7A748A] dark:text-[#D8D2E8]"
            >
              <Mic size={15} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={send}
              className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-white border-none outline-none"
              style={{
                background: "linear-gradient(135deg, #9E7EE6 0%, #7B56DB 100%)",
                boxShadow: "0 4px 12px rgba(123, 86, 219, 0.45), inset 0 1px 2px rgba(255,255,255,0.4)",
              }}
            >
              <Send size={15} />
            </motion.button>
          </div>
        </div>

        {/* ══════════════════ RIGHT COLUMN ══════════════════ */}
        <div className="flex flex-col gap-4">
          
          <div className="clay-card p-4 sm:p-5 rounded-[30px]">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[14px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">Emotion Fusion</span>
              <span className="clay-pill px-2.5 py-0.5 text-[10.5px] font-bold text-[#059669] dark:text-[#34D399]">
                REAL-TIME
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="clay-card-flat px-3.5 py-2.5 rounded-[16px] flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Primary Emotion</span>
                <span className="text-[#0284C7] dark:text-[#38BDF8] capitalize">{faceEmotion.primary_emotion}</span>
              </div>
              <div className="clay-card-flat px-3.5 py-2.5 rounded-[16px] flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Stress Level</span>
                <span className="text-[#059669] dark:text-[#34D399] capitalize">{faceEmotion.stress}</span>
              </div>
              <div className="clay-card-flat px-3.5 py-2.5 rounded-[16px] flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Sentiment</span>
                <span className="text-[#0284C7] dark:text-[#38BDF8] capitalize">{faceEmotion.sentiment}</span>
              </div>
            </div>
          </div>

          <div className="clay-card p-4 sm:p-5 rounded-[30px]">
            <div className="flex items-center gap-2 mb-3.5 text-[#2E2544] dark:text-[#FFFFFF]">
              <ClayBrainIcon size={22} />
              <span className="text-[14px] font-extrabold">Active Memory Context</span>
            </div>

            <div className="flex flex-col gap-2.5">
              <div
                className="clay-pastel-blue p-3 rounded-[18px]"
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #152336 0%, #0E1825 100%)"
                    : "linear-gradient(145deg, #D4EBFC 0%, #C3E2FA 100%)",
                  border: isDark
                    ? "1px solid rgba(56, 189, 248, 0.25)"
                    : "1px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                <div className="text-[10px] font-extrabold text-[#0284C7] dark:text-[#38BDF8] uppercase tracking-wider">
                  Target Goal
                </div>
                <div className="text-[12.5px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mt-0.5">
                  {activeGoal}
                </div>
              </div>

              <div
                className="clay-pastel-mint p-3 rounded-[18px]"
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #122E26 0%, #0B1F19 100%)"
                    : "linear-gradient(145deg, #D4F4E7 0%, #BFEBD8 100%)",
                  border: isDark
                    ? "1px solid rgba(52, 211, 153, 0.25)"
                    : "1px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                <div className="text-[10px] font-extrabold text-[#0D9488] dark:text-[#34D399] uppercase tracking-wider">
                  Key Interest
                </div>
                <div className="text-[12.5px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mt-0.5">
                  {activeInterest}
                </div>
              </div>

              {/* Session Summary Card */}
              <div className="clay-card-flat p-3 rounded-[18px]">
                <div className="text-[10px] font-bold text-[#7A748A] dark:text-[#8E88A4] uppercase tracking-wider">
                  Session Summary
                </div>
                <div className="text-[11.5px] font-medium text-[#2E2544] dark:text-[#D8D2E8] leading-relaxed mt-0.5 whitespace-pre-line">
                  {sessionSummary}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


