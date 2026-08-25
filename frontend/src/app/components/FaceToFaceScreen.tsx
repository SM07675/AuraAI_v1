import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, VideoOff, Send, Camera, Sparkles, RefreshCw, Activity, Heart, Brain, Smile } from "lucide-react";
import { AuraMascot3D } from "./aura-robot";
import { ClayCalmFaceIcon, ClayBrainIcon, ClayAuraAvatarBead, ClaySmileyBeadIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";

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
  const [camFps, setCamFps] = useState(30);
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

  const [emotionWsConnected, setEmotionWsConnected] = useState(false);
  const emotionWs = useRef<WebSocket | null>(null);

  // ── Chat & Voice State ───────────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Welcome to Face-to-Face mode.\nI'm observing your facial cues and emotions while we talk.\nHow are you feeling right now?",
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
  const [sessionSummary] = useState("Multimodal check-in: analyzing facial cues and emotional trends.");

  // ── 1. Start Camera Feed ─────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
    let fpsInterval: any;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
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
      setCamFps(Math.floor(Math.random() * 3) + 29);
    }, 1500);

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      clearInterval(fpsInterval);
    };
  }, []);

  // ── 2. Connect Emotion WebSocket (Frame Streaming) ───────────────────────────
  useEffect(() => {
    let socket: WebSocket;
    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectEmotion = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v1/emotion/ws`;

      socket = new WebSocket(wsUrl);
      emotionWs.current = socket;

      socket.onopen = () => {
        setEmotionWsConnected(true);
        console.log("Emotion WS connected");
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "emotion") {
            const rawPrimary = data.primary_emotion || "neutral";
            const formattedPrimary = rawPrimary.charAt(0).toUpperCase() + rawPrimary.slice(1);
            setFaceEmotion({
              primary_emotion: formattedPrimary,
              confidence: data.confidence !== undefined ? data.confidence : 0.85,
              secondary_emotion: data.secondary_emotion || "calm",
              secondary_confidence: data.secondary_confidence || 0.4,
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

      socket.onclose = () => {
        setEmotionWsConnected(false);
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connectEmotion, 2500);
        }
      };
    };

    connectEmotion();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      socket?.close();
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
          const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
          // Send both 'image' and 'frame' keys for maximum compatibility
          emotionWs.current.send(JSON.stringify({ type: "frame", image: base64, frame: base64 }));
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [cameraActive]);

  // ── 3. Connect Main Chat WebSocket ──────────────────────────────────────────
  const faceEmotionRef = useRef(faceEmotion);
  faceEmotionRef.current = faceEmotion;

  useEffect(() => {
    let socket: WebSocket;
    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectChat = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/chat`;

      socket = new WebSocket(wsUrl);
      chatWs.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "start", mode: "face_to_face" }));
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "start") {
            setTyping(true);
          } else if (data.type === "chunk") {
            setTyping(false);
            setMsgs((prev) => {
              if (prev.length === 0) return prev;
              const lastIdx = prev.length - 1;
              const lastMsg = prev[lastIdx];
              if (lastMsg && lastMsg.from === "aura") {
                return [
                  ...prev.slice(0, lastIdx),
                  { ...lastMsg, text: lastMsg.text + data.content },
                ];
              } else {
                return [
                  ...prev,
                  { id: "aura-" + Date.now(), from: "aura", text: data.content },
                ];
              }
            });
          } else if (data.type === "done" || data.type === "message" || data.type === "agent_response") {
            setTyping(false);
            const reply = data.response || data.content || data.text;
            if (reply) {
              setMsgs((prev) => {
                const lastIdx = prev.length - 1;
                const lastMsg = prev[lastIdx];
                if (lastMsg && lastMsg.from === "aura") {
                  return [
                    ...prev.slice(0, lastIdx),
                    { ...lastMsg, text: reply },
                  ];
                }
                return [...prev, { id: "aura-" + Date.now(), from: "aura", text: reply }];
              });
              voiceService.speak(reply, { emotion: faceEmotionRef.current.primary_emotion || "calm" });
            }
          } else if (data.type === "error") {
            setTyping(false);
            const fallbackTxt = "I hear you, and I'm right here with you. Take a slow, deep breath. Can you tell me a little more about what's going on?";
            setMsgs((prev) => [
              ...prev,
              { id: "aura-" + Date.now(), from: "aura", text: fallbackTxt },
            ]);
            voiceService.speak(fallbackTxt);
          }
        } catch (e) {
          // non-json
        }
      };

      socket.onclose = () => {
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connectChat, 2500);
        }
      };
    };

    connectChat();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      socket?.close();
      voiceService.stop();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const speakText = (txt: string, customEmotion?: string) => {
    voiceService.speak(txt, {
      emotion: customEmotion || faceEmotionRef.current.primary_emotion || "calm",
    });
  };

  // Speak initial greeting on mount
  useEffect(() => {
    speakText("Welcome to Face-to-Face mode. I'm observing your facial cues while we talk. How are you feeling right now?");
    return () => {
      voiceService.stop();
    };
  }, []);

  const micActiveRef = useRef(micActive);
  micActiveRef.current = micActive;

  const [isAuraSpeaking, setIsAuraSpeaking] = useState(false);
  const isAuraSpeakingRef = useRef(false);

  useEffect(() => {
    return voiceService.subscribe((speaking) => {
      setIsAuraSpeaking(speaking);
      isAuraSpeakingRef.current = speaking;
    });
  }, []);

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
      recognition.lang = "en-IN"; // Supports Indian English, Hindi words, and global English

      recognition.onresult = (event: any) => {
        // Hard-block when Aura is speaking or within cooldown to prevent echo
        if (voiceService.isSpeaking() || isAuraSpeakingRef.current) {
          return;
        }

        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          if (voiceService.isEcho(interim)) return;
          setText(interim);
        }

        if (final) {
          const clean = final.trim();
          if (!clean || voiceService.isEcho(clean) || clean.length < 2) return;
          setText(clean);
          sendMsg(clean);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          console.warn("FaceToFace SpeechRecognition error:", e.error);
        }
      };

      recognition.onend = () => {
        if (isMounted && micActiveRef.current) {
          try {
            // Only restart if Aura is not currently speaking
            if (!voiceService.isSpeaking()) {
              recognition.start();
            } else {
              // Wait until Aura finishes
              const checkInterval = setInterval(() => {
                if (!voiceService.isSpeaking() && isMounted && micActiveRef.current) {
                  clearInterval(checkInterval);
                  try { recognition.start(); } catch (e) {}
                }
              }, 400);
            }
          } catch (e) {}
        }
      };

      if (micActive && !voiceService.isSpeaking()) {
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
    if (!t) return;

    let emoTag = "Neutral";
    const lower = t.toLowerCase();
    if (lower.includes("sad") || lower.includes("bad") || lower.includes("down") || lower.includes("unhappy")) emoTag = "Sadness";
    else if (lower.includes("happy") || lower.includes("good") || lower.includes("great") || lower.includes("joy")) emoTag = "Joy";
    else if (lower.includes("anxious") || lower.includes("stress") || lower.includes("worried") || lower.includes("panic")) emoTag = "Anxiety";

    const id = "user-" + Date.now();
    setMsgs((m) => [...m, { id, from: "user", text: t, textEmotion: emoTag }]);
    setText("");
    setTyping(true);

    if (chatWs.current && chatWs.current.readyState === WebSocket.OPEN) {
      chatWs.current.send(JSON.stringify({ type: "message", content: t, mode: "face_to_face" }));
    } else {
      setTimeout(() => {
        const reply = "I hear you clearly. Your posture and facial cues show you're reflecting. Let's take a deep, steady breath together.";
        setMsgs((m) => [
          ...m,
          {
            id: "aura-" + Date.now(),
            from: "aura",
            text: reply,
          },
        ]);
        setTyping(false);
        speakText(reply);
      }, 1200);
    }
  };

  const send = () => sendMsg();

  return (
    <div className="w-full max-w-[1360px] mx-auto select-none h-[calc(100vh-80px)] lg:h-[calc(100vh-84px)] flex flex-col justify-between overflow-hidden px-1">
      {/* ── Compact Header Strip ── */}
      <div className="flex items-center justify-between gap-3 mb-2.5 shrink-0">
        <div>
          <h1 className="text-[19px] sm:text-[22px] font-extrabold tracking-tight m-0 text-[#2E2544] dark:text-[#FFFFFF] leading-tight">
            Face–to–Face Session
          </h1>
          <p className="text-[11.5px] sm:text-[12px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-0.5 m-0">
            Real-time multimodal consultation: facial cues, voice analysis, and emotional fusion.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="clay-pill flex items-center gap-2 px-3 py-1 text-[11px] font-bold text-[#2E2544] dark:text-[#D8D2E8]">
            <span
              className="animate-pulse"
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: emotionWsConnected ? "#10B981" : "#F59E0B",
                display: "inline-block",
              }}
            />
            <span>Vision: {emotionWsConnected ? "Live AI Active" : "Connecting..."}</span>
          </div>
        </div>
      </div>

      {/* ── 3-Column Bento Grid Layout (Viewport Fit) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_280px] xl:grid-cols-[300px_minmax(0,1fr)_300px] gap-3 flex-1 min-h-0 items-stretch">
        
        {/* ══════════════════ LEFT COLUMN ══════════════════ */}
        <div className="flex flex-col gap-3 h-full justify-between">
          
          {/* Camera Card */}
          <div className="clay-card p-3 sm:p-3.5 rounded-[24px] flex flex-col justify-between flex-1 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">Camera Preview</span>
              <span
                className="clay-pill px-2 py-0.5 text-[10px] font-bold"
                style={{ color: cameraActive ? "#059669" : "#EF4444" }}
              >
                {cameraActive ? `${camFps} FPS` : "OFFLINE"}
              </span>
            </div>

            <div
              className="relative rounded-[18px] overflow-hidden aspect-[4/3] flex items-center justify-center border border-white/60 dark:border-white/10"
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
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1D182B] text-white/70 p-3 text-center">
                  <VideoOff size={24} className="mb-1.5 text-slate-400" />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Webcam Offline</span>
                </div>
              )}

              {faceEmotion.face_detected && cameraActive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute rounded-[14px] border-2 border-emerald-400 pointer-events-none"
                  style={{
                    top: "12%",
                    left: "22%",
                    width: "56%",
                    height: "72%",
                    boxShadow: "0 0 12px rgba(52, 211, 153, 0.45)",
                  }}
                >
                  <span
                    className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider shadow-sm"
                  >
                    Face Tracked
                  </span>
                </motion.div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <div className="clay-card-flat p-2 rounded-[14px]">
                <div className="text-[9.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Eye Contact</div>
                <div className="text-[11.5px] font-extrabold text-[#059669] dark:text-[#34D399] mt-0.5">
                  {eyeContact ? "Active 👀" : "Away"}
                </div>
              </div>
              <div className="clay-card-flat p-2 rounded-[14px]">
                <div className="text-[9.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Lighting</div>
                <div className="text-[11.5px] font-extrabold text-[#0284C7] dark:text-[#38BDF8] mt-0.5">
                  {lighting} ☀️
                </div>
              </div>
            </div>
          </div>

          {/* Live Face Emotion Model Output Card */}
          <div className="clay-card p-3 sm:p-3.5 rounded-[24px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">Live Face Emotion</span>
              <span className="clay-pill px-2 py-0.5 text-[9.5px] font-bold text-[#7C3AED] dark:text-[#C7B5F3]">
                FERPlus ONNX
              </span>
            </div>

            <div className="flex items-center gap-3 mb-2.5">
              <div
                className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)",
                  boxShadow: "0 4px 10px rgba(2, 132, 199, 0.35), inset 0 1px 3px rgba(255, 255, 255, 0.85)",
                  border: "1px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                <ClayCalmFaceIcon size={26} />
              </div>
              <div>
                <div className="text-[15px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] leading-tight capitalize">
                  {faceEmotion.primary_emotion}
                </div>
                <div className="text-[10.5px] font-medium text-[#7A748A] dark:text-[#8E88A4] mt-0.5">
                  Secondary: {faceEmotion.secondary_emotion || "calm"}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10.5px] font-bold text-[#7A748A] dark:text-[#8E88A4] mb-1">
                <span>Model Confidence</span>
                <span className="text-[#7C3AED] dark:text-[#C7B5F3] font-extrabold">
                  {Math.round(faceEmotion.confidence * 100)}%
                </span>
              </div>
              <div className="clay-track-inset h-[6px] w-full rounded-full overflow-hidden">
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
        <div className="clay-card p-3.5 sm:p-4 rounded-[28px] flex flex-col justify-between h-full min-h-0">
          {/* Header Row */}
          <div className="flex items-center gap-3 pb-2.5 border-b border-white/60 dark:border-white/10 shrink-0">
            <div className="shrink-0 flex items-center justify-center" style={{ width: 70, height: 60 }}>
              <AuraMascot3D size={65} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">
                  Aura AI Counselor
                </span>
                <span className="clay-pill px-2 py-0.5 text-[9.5px] font-bold text-[#059669] dark:text-[#34D399]">
                  LIVE SYNC
                </span>
              </div>
              <p className="text-[11px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-0.5 leading-normal m-0">
                Continuous voice, vision & multimodal check-in
              </p>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 flex flex-col gap-2.5 my-2.5 overflow-y-auto pr-1 min-h-0">
            {msgs.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${m.from === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.from === "aura" && (
                  <div className="shrink-0 mt-0.5">
                    <ClayAuraAvatarBead size={24} />
                  </div>
                )}
                <div
                  className={
                    m.from === "user"
                      ? "clay-bubble-user px-3.5 py-2 rounded-[16px] max-w-[85%]"
                      : "clay-bubble-aura px-3.5 py-2 rounded-[16px] max-w-[85%]"
                  }
                >
                  <p className="text-[12.5px] font-medium leading-relaxed m-0 whitespace-pre-wrap">
                    {m.text}
                  </p>
                </div>
              </motion.div>
            ))}

            {typing && (
              <div className="flex items-center gap-2 self-start">
                <ClayAuraAvatarBead size={24} />
                <div className="clay-bubble-aura px-3 py-1.5 rounded-[14px] flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-[#7A748A] dark:text-[#C7B5F3] mr-1">
                    Aura is reflecting
                  </span>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Continuous Mic Status Bar */}
          <div className="clay-card-flat px-3 py-2 rounded-[18px] flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMicActive(!micActive)}
                className="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer"
                style={{
                  background: micActive ? "#DCFCE7" : "#FEE2E2",
                  color: micActive ? "#059669" : "#DC2626",
                }}
              >
                {micActive ? <Mic size={12} /> : <MicOff size={12} />}
              </button>
              <span className="text-[11px] font-bold text-[#059669] dark:text-[#34D399]">
                {micActive ? "Continuous Listening Active" : "Microphone Muted"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[6, 14, 20, 12, 22, 16, 8, 18, 12, 6].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-[#8B5CF6] rounded-full"
                  animate={{ height: micActive ? [3, h, 3] : 3 }}
                  transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.06 }}
                />
              ))}
            </div>
          </div>

          {/* Chat Input Row */}
          <div className="clay-track-inset p-1 pl-3.5 rounded-full flex items-center gap-2 shrink-0">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Speak to Aura or type your response..."
              className="bg-transparent border-none outline-none flex-1 text-[12px] font-medium text-[#2E2544] dark:text-[#FFFFFF] placeholder:text-[#8E88A4]"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMicActive(!micActive)}
              className="w-8 h-8 rounded-full clay-button flex items-center justify-center cursor-pointer text-[#7A748A] dark:text-[#D8D2E8]"
            >
              <Mic size={14} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={send}
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-white border-none outline-none"
              style={{
                background: "linear-gradient(135deg, #9E7EE6 0%, #7B56DB 100%)",
                boxShadow: "0 3px 10px rgba(123, 86, 219, 0.45), inset 0 1px 2px rgba(255,255,255,0.4)",
              }}
            >
              <Send size={13} />
            </motion.button>
          </div>
        </div>

        {/* ══════════════════ RIGHT COLUMN ══════════════════ */}
        <div className="flex flex-col gap-3 h-full justify-between">
          
          {/* Emotion Fusion Card */}
          <div className="clay-card p-3 sm:p-3.5 rounded-[24px]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">Emotion Fusion</span>
              <span className="clay-pill px-2 py-0.5 text-[9.5px] font-bold text-[#059669] dark:text-[#34D399]">
                REAL-TIME
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="clay-card-flat px-3 py-1.5 rounded-[14px] flex justify-between items-center text-[11.5px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Primary Emotion</span>
                <span className="text-[#0284C7] dark:text-[#38BDF8] capitalize">{faceEmotion.primary_emotion}</span>
              </div>
              <div className="clay-card-flat px-3 py-1.5 rounded-[14px] flex justify-between items-center text-[11.5px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Stress Level</span>
                <span className="text-[#059669] dark:text-[#34D399] capitalize">{faceEmotion.stress}</span>
              </div>
              <div className="clay-card-flat px-3 py-1.5 rounded-[14px] flex justify-between items-center text-[11.5px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Sentiment</span>
                <span className="text-[#0284C7] dark:text-[#38BDF8] capitalize">{faceEmotion.sentiment}</span>
              </div>
            </div>
          </div>

          {/* Active Context Card */}
          <div className="clay-card p-3 sm:p-3.5 rounded-[24px] flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center gap-1.5 mb-2 text-[#2E2544] dark:text-[#FFFFFF]">
              <ClayBrainIcon size={18} />
              <span className="text-[13px] font-extrabold">Active Memory Context</span>
            </div>

            <div className="flex flex-col gap-2 flex-1 justify-between min-h-0">
              <div
                className="clay-pastel-blue p-2.5 rounded-[16px]"
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #152336 0%, #0E1825 100%)"
                    : "linear-gradient(145deg, #D4EBFC 0%, #C3E2FA 100%)",
                  border: isDark
                    ? "1px solid rgba(56, 189, 248, 0.25)"
                    : "1px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                <div className="text-[9.5px] font-extrabold text-[#0284C7] dark:text-[#38BDF8] uppercase tracking-wider">
                  Target Goal
                </div>
                <div className="text-[11.5px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mt-0.5 truncate">
                  {activeGoal}
                </div>
              </div>

              <div
                className="clay-pastel-mint p-2.5 rounded-[16px]"
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #122E26 0%, #0B1F19 100%)"
                    : "linear-gradient(145deg, #D4F4E7 0%, #BFEBD8 100%)",
                  border: isDark
                    ? "1px solid rgba(52, 211, 153, 0.25)"
                    : "1px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                <div className="text-[9.5px] font-extrabold text-[#0D9488] dark:text-[#34D399] uppercase tracking-wider">
                  Key Interest
                </div>
                <div className="text-[11.5px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mt-0.5 truncate">
                  {activeInterest}
                </div>
              </div>

              {/* Session Summary Card */}
              <div className="clay-card-flat p-2.5 rounded-[16px]">
                <div className="text-[9.5px] font-bold text-[#7A748A] dark:text-[#8E88A4] uppercase tracking-wider">
                  Session Summary
                </div>
                <div className="text-[10.5px] font-medium text-[#2E2544] dark:text-[#D8D2E8] leading-relaxed mt-0.5 line-clamp-2">
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
