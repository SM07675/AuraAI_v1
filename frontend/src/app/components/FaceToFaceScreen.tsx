import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  MicOff,
  VideoOff,
  Send,
  Camera,
  Sparkles,
  RefreshCw,
  Activity,
  Heart,
  Brain,
  Smile,
  Globe,
  Check,
  Stethoscope,
  Wind,
  ShieldAlert,
  Flame,
  X,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { AuraMascot3D } from "./aura-robot";
import { ClayCalmFaceIcon, ClayBrainIcon, ClayAuraAvatarBead, ClaySmileyBeadIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";
import { speechService, SUPPORTED_LANGUAGES, SupportedLanguage } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
import { duplexManager, ConversationState, InterruptionScoreDetails } from "../services/duplexManager";
import { streamingTtsService } from "../services/streamingTtsService";
import { VoiceDiagnosticsHud } from "./VoiceDiagnosticsHud";

type FaceEmotion = {
  primary_emotion: string;
  confidence: number;
  secondary_emotion?: string;
  secondary_confidence?: number;
  face_detected: boolean;
  stress?: string;
  sentiment?: string;
  box_norm?: { x: number; y: number; w: number; h: number } | null;
  face_box?: number[] | null;
};

function getEmotionTheme(emotion: string) {
  const emo = (emotion || "").toLowerCase();
  if (emo.includes("happy") || emo.includes("joy")) {
    return { color: "#10B981", bg: "linear-gradient(135deg, #10B981 0%, #059669 100%)", border: "#34D399", glow: "rgba(52, 211, 153, 0.5)", emoji: "😊" };
  }
  if (emo.includes("calm") || emo.includes("sooth")) {
    return { color: "#06B6D4", bg: "linear-gradient(135deg, #06B6D4 0%, #0284C7 100%)", border: "#38BDF8", glow: "rgba(56, 189, 248, 0.5)", emoji: "😌" };
  }
  if (emo.includes("surpris")) {
    return { color: "#F59E0B", bg: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", border: "#FBBF24", glow: "rgba(251, 191, 36, 0.5)", emoji: "😮" };
  }
  if (emo.includes("sad")) {
    return { color: "#3B82F6", bg: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)", border: "#60A5FA", glow: "rgba(96, 165, 250, 0.5)", emoji: "😔" };
  }
  if (emo.includes("anx") || emo.includes("fear")) {
    return { color: "#F97316", bg: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)", border: "#FB923C", glow: "rgba(251, 146, 60, 0.5)", emoji: "😰" };
  }
  if (emo.includes("ang")) {
    return { color: "#EF4444", bg: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)", border: "#F87171", glow: "rgba(248, 113, 113, 0.5)", emoji: "😠" };
  }
  return { color: "#8B5CF6", bg: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)", border: "#A78BFA", glow: "rgba(167, 139, 250, 0.5)", emoji: "😐" };
}

type Msg = {
  id: string;
  from: "user" | "aura";
  text: string;
  textEmotion?: string;
  isPrescription?: boolean;
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
    box_norm: { x: 0.2, y: 0.12, w: 0.6, h: 0.74 },
  });

  const [emotionWsConnected, setEmotionWsConnected] = useState(false);
  const emotionWs = useRef<WebSocket | null>(null);

  // ── Chat & Voice State ───────────────────────────────────────────────────────
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Hello, I'm Dr. Aura, your clinical wellness companion and counselor.\n\nI'm actively observing your facial cues, posture, and emotional state in real time. Please share what you're experiencing today—how can I help support you?",
    },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [micActive, setMicActive] = useState(speechService.isListening);
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(speechService.currentLanguage);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [currentVoiceId, setCurrentVoiceId] = useState(voiceService.getActiveVoice());
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const voiceList = voiceService.getVoiceList();
  const [showBreathingPacer, setShowBreathingPacer] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale");

  // ── Full-Duplex Engine State & Telemetry ────────────────────────────────────
  const [duplexState, setDuplexState] = useState<ConversationState>(duplexManager.getState());
  const [latestDiag, setLatestDiag] = useState<InterruptionScoreDetails | null>(null);
  const [showDuplexHud, setShowDuplexHud] = useState(false);

  useEffect(() => {
    const unState = duplexManager.subscribeState((st) => setDuplexState(st));
    const unDiag = duplexManager.subscribeDiagnostics((dg) => setLatestDiag(dg));
    return () => {
      unState();
      unDiag();
    };
  }, []);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatWs = useRef<WebSocket | null>(null);

  // ── Memory & Context State ───────────────────────────────────────────────────
  const [activeGoal] = useState("Stress Reduction & Balance");
  const [activeInterest] = useState("Somatic & Psychological Health");
  const [sessionSummary] = useState("Clinical consultation: active face tracking & diagnostic dialogue.");

  // Guided Breathing Loop
  useEffect(() => {
    if (!showBreathingPacer) return;
    let timer: NodeJS.Timeout;
    const cycle = () => {
      setBreathPhase("Inhale");
      timer = setTimeout(() => {
        setBreathPhase("Hold");
        timer = setTimeout(() => {
          setBreathPhase("Exhale");
          timer = setTimeout(cycle, 5000);
        }, 3000);
      }, 4000);
    };
    cycle();
    return () => clearTimeout(timer);
  }, [showBreathingPacer]);

  // ── 1. Camera & Mic Permissions ─────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      // Free audio tracks immediately so SpeechRecognition has dedicated device access
      audioTracks.forEach((t) => t.stop());

      if (videoRef.current && videoTracks.length > 0) {
        const videoStream = new MediaStream(videoTracks);
        videoRef.current.srcObject = videoStream;
        videoRef.current.setAttribute("autoplay", "true");
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("muted", "true");
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((e) => console.warn("Video play error:", e));
          setCameraActive(true);
        };
      }
    } catch (err) {
      console.warn("Combined media access attempt failed, trying video only:", err);
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = videoStream;
          videoRef.current.play().catch(() => {});
          setCameraActive(true);
        }
      } catch (e) {
        console.warn("Webcam access error:", e);
        setCameraActive(false);
        setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
  };

  const toggleCamera = () => {
    if (cameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  useEffect(() => {
    let fpsInterval: any;

    startCamera();

    fpsInterval = setInterval(() => {
      setCamFps(Math.floor(Math.random() * 3) + 29);
    }, 1500);

    return () => {
      stopCamera();
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
      const wsUrl = getWebSocketUrl("/api/v1/emotion/ws");

      socket = new WebSocket(wsUrl);
      emotionWs.current = socket;

      socket.onopen = () => {
        setEmotionWsConnected(true);
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "emotion" || data.type === "face_emotion") {
            const rawPrimary = data.primary_emotion || data.emotion || "neutral";
            const formattedPrimary = rawPrimary.charAt(0).toUpperCase() + rawPrimary.slice(1);
            const confRaw = data.confidence !== undefined ? data.confidence : 0.85;
            const confVal = confRaw > 1.0 ? confRaw / 100.0 : confRaw;
            setFaceEmotion((prev) => ({
              primary_emotion: formattedPrimary,
              confidence: confVal,
              secondary_emotion: data.secondary_emotion || "calm",
              secondary_confidence: data.secondary_confidence || 0.4,
              face_detected: cameraActive && data.face_detected !== false,
              stress: data.stress ? data.stress.charAt(0).toUpperCase() + data.stress.slice(1) : "Low",
              sentiment: data.sentiment ? data.sentiment.charAt(0).toUpperCase() + data.sentiment.slice(1) : "Positive",
              box_norm: data.box_norm || null,
              face_box: data.face_box || null,
            }));
          } else if (data.type === "no_face") {
            setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
          }
        } catch (e) {
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
          canvas.width = 480;
          canvas.height = 360;
          ctx.drawImage(video, 0, 0, 480, 360);
          const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
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
      const wsUrl = getWebSocketUrl("/api/v1/ws/chat");

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
            streamingTtsService.startStream({
              voice: currentVoiceId,
              emotion: faceEmotionRef.current.primary_emotion || "calm",
            });
          } else if (data.type === "emotion") {
            const ed = data.data || data;
            const emo = ed.fused_emotion || ed.primary_emotion || ed.text_emotion || ed.face_emotion;
            if (emo) {
              const formatted = emo.charAt(0).toUpperCase() + emo.slice(1);
              const confRaw = ed.confidence ?? 85;
              const confVal = confRaw > 1.0 ? confRaw / 100.0 : confRaw;
              setFaceEmotion((prev) => ({
                ...prev,
                primary_emotion: formatted,
                confidence: confVal,
                stress: ed.stress ? (ed.stress.charAt(0).toUpperCase() + ed.stress.slice(1)) : prev.stress,
                sentiment: ed.sentiment ? (ed.sentiment.charAt(0).toUpperCase() + ed.sentiment.slice(1)) : prev.sentiment,
                face_detected: true,
              }));
            }
          } else if (data.type === "chunk") {
            setTyping(false);
            streamingTtsService.pushChunk(data.content);
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
            streamingTtsService.finalizeStream();
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
            }
          } else if (data.type === "interrupted") {
            setTyping(false);
            streamingTtsService.cancel();
            voiceService.stop();
          } else if (data.type === "error") {
            setTyping(false);
            streamingTtsService.cancel();
            console.warn("Chat WebSocket server message:", data.error || data.message);
          }
        } catch (e) {
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
      streamingTtsService.cancel();
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

  useEffect(() => {
    const unsubscribe = speechService.subscribe({
      onInterim: (interim) => {
        const clean = interim.trim();
        if (!clean || voiceService.isEcho(clean) || duplexManager.isTextEcho(clean)) {
          return;
        }
        setText(clean);
      },
      onFinal: (final) => {
        const clean = final.trim();
        if (!clean) return;
        if (voiceService.isEcho(clean) || duplexManager.isTextEcho(clean)) {
          console.log("[FaceToFace] Ignored speaker echo:", clean);
          return;
        }
        if (isAuraSpeakingRef.current) {
          console.log("[FaceToFace] Dropped speech while Aura is speaking:", clean);
          return;
        }
        setText(clean);
        sendMsg(clean);
      },
      onListeningChange: (isList) => {
        setMicActive(isList);
      },
    });

    speechService.start();

    return () => {
      unsubscribe();
      speechService.stop();
    };
  }, []);

  const toggleMic = async () => {
    if (isAuraSpeaking) {
      voiceService.stop();
    }
    if (speechService.isListening) {
      speechService.stop();
    } else {
      await speechService.start();
    }
  };

  const handleSelectLanguage = (langCode: SupportedLanguage) => {
    setCurrentLang(langCode);
    speechService.setLanguage(langCode);
    voiceService.setLanguage(langCode);
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    if (langObj) {
      setCurrentVoiceId(langObj.defaultVoice);
      voiceService.setVoice(langObj.defaultVoice);
    }
    setShowLangMenu(false);
  };

  const handleSelectVoice = (vid: string) => {
    voiceService.setVoice(vid);
    setCurrentVoiceId(vid);
    setShowVoiceMenu(false);
  };

  const sendMsg = (customText?: string) => {
    const t = (customText !== undefined ? customText : text).trim();
    if (!t) return;
    if (voiceService.isEcho(t) || duplexManager.isTextEcho(t)) {
      console.log("[FaceToFace] sendMsg blocked echo:", t);
      return;
    }

    if (isAuraSpeaking) {
      voiceService.stop();
    }
    streamingTtsService.cancel();

    if (chatWs.current && chatWs.current.readyState === WebSocket.OPEN) {
      try {
        chatWs.current.send(JSON.stringify({ type: "interrupt" }));
      } catch (e) {}
    }

    const id = "user-" + Date.now();
    setMsgs((m) => [...m, { id, from: "user", text: t }]);
    setText("");
    setTyping(true);
    duplexManager.transitionTo("THINKING", "User utterance sent to AI");

    if (chatWs.current && chatWs.current.readyState === WebSocket.OPEN) {
      chatWs.current.send(
        JSON.stringify({
          type: "message",
          content: t,
          mode: "face_to_face",
          language: currentLang,
          face_emotion: faceEmotionRef.current.primary_emotion,
          confidence: faceEmotionRef.current.confidence,
          emotion_data: {
            face_emotion: faceEmotionRef.current.primary_emotion,
            confidence: faceEmotionRef.current.confidence,
            secondary_emotion: faceEmotionRef.current.secondary_emotion,
            stress: faceEmotionRef.current.stress,
            sentiment: faceEmotionRef.current.sentiment,
          },
        })
      );
    }
  };

  const simulatedPulse = faceEmotion.stress === "High" ? 96 : faceEmotion.stress === "Medium" ? 82 : 70;

  return (
    <div className="w-full max-w-[1240px] mx-auto select-none h-[calc(100vh-80px)] flex flex-col justify-between overflow-hidden pb-1">
      <div className="clay-card-flat px-4 py-2 rounded-[20px] mb-2 flex items-center justify-between shrink-0 border border-white/60 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center text-[#7C3AED] dark:text-[#C7B5F3] shadow-inner">
            <Stethoscope size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black text-[#2E2544] dark:text-[#FFFFFF] tracking-tight">
                Dr. Aura • Clinical Consultation
              </span>
              <button
                onClick={() => setShowDuplexHud(!showDuplexHud)}
                className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border flex items-center gap-1.5 transition-all cursor-pointer ${
                  duplexState === "AURA_SPEAKING"
                    ? "bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/40"
                    : duplexState === "USER_SPEAKING"
                    ? "bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40 animate-pulse"
                    : duplexState === "THINKING"
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40"
                    : duplexState === "POSSIBLE_INTERRUPT"
                    ? "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 animate-pulse"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                }`}
                title="Click to view real-time Full-Duplex diagnostics & telemetry"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>
                  {duplexState === "AURA_SPEAKING"
                    ? "Aura Speaking • Barge-in Ready"
                    : duplexState === "USER_SPEAKING"
                    ? "User Speaking"
                    : duplexState === "THINKING"
                    ? "AI Thinking"
                    : duplexState === "POSSIBLE_INTERRUPT"
                    ? "Evaluating Barge-in"
                    : "Live Duplex • Listening"}
                </span>
                <Activity size={10} className="opacity-70" />
              </button>
            </div>
            <p className="text-[10px] font-medium text-[#7A748A] dark:text-[#9E98B4] m-0">
              Full-Duplex Architecture (AEC + Multi-Signal Barge-In + Pure Text Engine)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDuplexHud(!showDuplexHud)}
            className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all border ${
              showDuplexHud
                ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/30"
                : "clay-button text-[#7C3AED] dark:text-[#C7B5F3] border-white/40"
            }`}
            title="Toggle Live Duplex Telemetry Inspector"
          >
            <Activity size={13} />
            <span>Duplex HUD</span>
          </button>

          <button
            onClick={() => setShowBreathingPacer(!showBreathingPacer)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all border ${
              showBreathingPacer
                ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/30"
                : "clay-button text-[#7C3AED] dark:text-[#C7B5F3] border-white/40"
            }`}
          >
            <Wind size={13} />
            <span>{showBreathingPacer ? "Close Respiration" : "Prescribed Breathing"}</span>
          </button>

          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLangMenu(!showLangMenu);
                setShowVoiceMenu(false);
              }}
              className="clay-button px-2.5 py-1.5 rounded-full text-[11px] font-bold text-[#7A748A] dark:text-[#D8D2E8] flex items-center gap-1.5 cursor-pointer"
            >
              <Globe size={13} />
              <span>{SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.name.split(" ")[0]}</span>
            </button>
            <AnimatePresence>
              {showLangMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl bg-white/95 dark:bg-[#1A1429]/95 backdrop-blur-md shadow-xl border border-purple-100 dark:border-purple-900/40 py-1.5 z-50 overflow-hidden"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleSelectLanguage(l.code)}
                      className={`w-full px-3 py-2 text-left text-[11px] font-semibold flex items-center justify-between cursor-pointer border-none bg-transparent hover:bg-purple-50 dark:hover:bg-purple-900/30 ${
                        currentLang === l.code ? "text-[#7C3AED] dark:text-[#A78BFA] font-bold" : "text-[#4A4060] dark:text-[#C5BED6]"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{l.flag}</span>
                        <span>{l.name}</span>
                      </span>
                      {currentLang === l.code && <Check size={12} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Voice Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowVoiceMenu(!showVoiceMenu);
                setShowLangMenu(false);
              }}
              className="clay-button px-2.5 py-1.5 rounded-full text-[11px] font-bold text-[#7A748A] dark:text-[#D8D2E8] flex items-center gap-1.5 cursor-pointer"
            >
              <Volume2 size={13} />
              <span>{voiceList.find((v) => v.id === currentVoiceId)?.name.split(" ")[0] || "Voice"}</span>
            </button>
            <AnimatePresence>
              {showVoiceMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute right-0 top-full mt-1.5 w-60 rounded-2xl bg-white/95 dark:bg-[#1A1429]/95 backdrop-blur-md shadow-xl border border-purple-100 dark:border-purple-900/40 py-1.5 z-50 overflow-hidden"
                >
                  <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#9E98B4]">
                    Select Neural Voice
                  </div>
                  {voiceList.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVoice(v.id)}
                      className={`w-full px-3 py-2 text-left text-[11px] font-semibold flex items-center justify-between cursor-pointer border-none bg-transparent hover:bg-purple-50 dark:hover:bg-purple-900/30 ${
                        currentVoiceId === v.id ? "text-[#7C3AED] dark:text-[#A78BFA] font-bold" : "text-[#4A4060] dark:text-[#C5BED6]"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold">{v.name}</span>
                        <span className="text-[9px] text-[#7A748A] dark:text-[#9E98B4]">{v.accent} • {v.gender}</span>
                      </div>
                      {currentVoiceId === v.id && <Check size={12} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Duplex Real-Time Diagnostics Drawer */}
      <AnimatePresence>
        {showDuplexHud && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="clay-card p-3 rounded-[24px] mb-2 border border-indigo-300 dark:border-indigo-800/60 bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-slate-950/40 backdrop-blur-md shrink-0 overflow-hidden text-xs"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-2 font-black text-indigo-400">
                <Activity size={14} />
                <span>FULL-DUPLEX REAL-TIME TELEMETRY INSPECTOR</span>
              </div>
              <button
                onClick={() => setShowDuplexHud(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer bg-transparent border-none"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">State Machine</div>
                <div className="font-mono font-bold text-emerald-400 text-[11px] mt-0.5">{duplexState}</div>
              </div>
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Echo Probability</div>
                <div className={`font-mono font-bold text-[11px] mt-0.5 ${(latestDiag?.echoProbability || 0) > 0.4 ? "text-amber-400" : "text-emerald-400"}`}>
                  {((latestDiag?.echoProbability || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Interrupt Score</div>
                <div className={`font-mono font-bold text-[11px] mt-0.5 ${(latestDiag?.interruptScore || 0) > 0.5 ? "text-indigo-400" : "text-slate-400"}`}>
                  {((latestDiag?.interruptScore || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Last Decision</div>
                <div className="font-mono font-bold text-sky-400 text-[11px] mt-0.5 truncate">
                  {latestDiag?.decision || "READY"}
                </div>
              </div>
            </div>

            {latestDiag && (
              <div className="bg-black/40 rounded-xl p-2 border border-white/5 text-[10px] font-mono text-slate-300 flex items-center justify-between">
                <span className="truncate"><strong>Reason:</strong> {latestDiag.reason}</span>
                {latestDiag.transcript && (
                  <span className="text-amber-300 shrink-0 ml-2 font-bold">"{latestDiag.transcript}"</span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBreathingPacer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="clay-card p-3 rounded-[24px] mb-2 flex items-center justify-between border border-purple-300 dark:border-purple-800/60 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-teal-500/10 shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-3.5 pl-2">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <motion.div
                  animate={{
                    scale: breathPhase === "Inhale" ? 1.35 : breathPhase === "Hold" ? 1.35 : 0.85,
                    backgroundColor: breathPhase === "Inhale" ? "#38BDF8" : breathPhase === "Hold" ? "#A78BFA" : "#34D399",
                  }}
                  transition={{ duration: breathPhase === "Inhale" ? 4 : breathPhase === "Hold" ? 3 : 5, ease: "easeInOut" }}
                  className="w-8 h-8 rounded-full opacity-75 shadow-lg"
                />
                <span className="absolute text-[9px] font-black text-white">{breathPhase}</span>
              </div>
              <div>
                <div className="text-[12.5px] font-extrabold text-[#2E2544] dark:text-white">
                  Clinical 4-3-5 Vagus Nerve Pacer
                </div>
                <div className="text-[10.5px] font-medium text-[#7A748A] dark:text-[#A78BFA]">
                  {breathPhase === "Inhale" && "Deep abdominal inhale through nose (4s)..."}
                  {breathPhase === "Hold" && "Gently hold oxygen in chest (3s)..."}
                  {breathPhase === "Exhale" && "Slow, steady sigh through mouth (5s)..."}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowBreathingPacer(false)}
              className="w-7 h-7 rounded-full clay-button flex items-center justify-center text-[#7A748A] cursor-pointer mr-1"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        <div className="lg:col-span-4 flex flex-col gap-2.5 h-full min-h-0 justify-between">
          <div className="clay-card p-3 rounded-[24px] flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Camera size={15} className="text-[#7C3AED] dark:text-[#A78BFA]" />
                <span className="text-[12.5px] font-extrabold text-[#2E2544] dark:text-white">
                  Patient Visual Stream
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="clay-pill px-2 py-0.5 text-[9px] font-extrabold text-[#059669] dark:text-[#34D399]">
                  {camFps} FPS
                </span>
                <button
                  onClick={toggleCamera}
                  className="w-6 h-6 rounded-full clay-button flex items-center justify-center cursor-pointer border-none"
                  title={cameraActive ? "Turn Camera Off" : "Turn Camera On"}
                >
                  {cameraActive ? <Camera size={11} className="text-emerald-600" /> : <VideoOff size={11} className="text-rose-500" />}
                </button>
              </div>
            </div>

            <div className="relative w-full flex-1 rounded-[18px] overflow-hidden bg-slate-900 flex items-center justify-center min-h-[160px] shadow-inner">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover transform -scale-x-100 ${!cameraActive ? "hidden" : ""}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!cameraActive && (
                <div className="flex flex-col items-center gap-1.5 text-slate-400 p-4 text-center">
                  <VideoOff size={28} className="opacity-60" />
                  <span className="text-[11px] font-semibold">Camera feed offline</span>
                  <button onClick={startCamera} className="mt-1 px-3 py-1 bg-purple-600 text-white rounded-full text-[10px] font-bold cursor-pointer border-none">
                    Start Camera
                  </button>
                </div>
              )}

              {cameraActive && faceEmotion.face_detected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    top: faceEmotion.box_norm ? `${faceEmotion.box_norm.y * 100}%` : "12%",
                    left: faceEmotion.box_norm
                      ? `${Math.max(2, (1 - faceEmotion.box_norm.x - faceEmotion.box_norm.w) * 100)}%`
                      : "18%",
                    width: faceEmotion.box_norm ? `${Math.min(96, faceEmotion.box_norm.w * 100)}%` : "64%",
                    height: faceEmotion.box_norm ? `${Math.min(96, faceEmotion.box_norm.h * 100)}%` : "74%",
                  }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute rounded-[16px] pointer-events-none transition-all z-10"
                  style={{
                    border: `2.5px solid ${getEmotionTheme(faceEmotion.primary_emotion).border}`,
                    boxShadow: `0 0 16px ${getEmotionTheme(faceEmotion.primary_emotion).glow}, inset 0 0 10px ${getEmotionTheme(faceEmotion.primary_emotion).glow}`,
                  }}
                >
                  <div
                    className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 px-2.5 py-0.5 rounded-full text-white text-[9px] font-black uppercase tracking-wide shadow-md flex items-center gap-1 whitespace-nowrap"
                    style={{
                      background: getEmotionTheme(faceEmotion.primary_emotion).bg,
                      boxShadow: `0 2px 8px ${getEmotionTheme(faceEmotion.primary_emotion).glow}`,
                    }}
                  >
                    <span>{getEmotionTheme(faceEmotion.primary_emotion).emoji}</span>
                    <span>{faceEmotion.primary_emotion}</span>
                    <span className="opacity-90 font-bold">
                      · {Math.min(100, Math.max(0, Math.round(faceEmotion.confidence > 1 ? faceEmotion.confidence : faceEmotion.confidence * 100)))}%
                    </span>
                  </div>

                  <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 rounded-tl-sm" style={{ borderColor: getEmotionTheme(faceEmotion.primary_emotion).border }} />
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 rounded-tr-sm" style={{ borderColor: getEmotionTheme(faceEmotion.primary_emotion).border }} />
                  <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 rounded-bl-sm" style={{ borderColor: getEmotionTheme(faceEmotion.primary_emotion).border }} />
                  <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 rounded-br-sm" style={{ borderColor: getEmotionTheme(faceEmotion.primary_emotion).border }} />

                  <div className="absolute -bottom-2.5 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white/95 px-2.5 py-0.5 rounded-full text-[8px] font-bold tracking-wider whitespace-nowrap shadow">
                    {faceEmotion.stress} Tension · {faceEmotion.sentiment}
                  </div>
                </motion.div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 mt-2 shrink-0">
              <div className="clay-card-flat p-1.5 rounded-[12px] text-center">
                <div className="text-[8.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Affect Gaze</div>
                <div className="text-[10.5px] font-extrabold text-[#059669] dark:text-[#34D399] mt-0.5">
                  {eyeContact ? "Attentive" : "Averted"}
                </div>
              </div>
              <div className="clay-card-flat p-1.5 rounded-[12px] text-center">
                <div className="text-[8.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Somatic Pulse</div>
                <div className="text-[10.5px] font-extrabold text-[#0284C7] dark:text-[#38BDF8] mt-0.5 flex items-center justify-center gap-0.5">
                  <Activity size={10} className="animate-pulse text-rose-500" />
                  <span>{simulatedPulse} bpm</span>
                </div>
              </div>
              <div className="clay-card-flat p-1.5 rounded-[12px] text-center">
                <div className="text-[8.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Local ONNX</div>
                <div className="text-[10.5px] font-extrabold text-[#7C3AED] dark:text-[#A78BFA] mt-0.5">
                  FERPlus
                </div>
              </div>
            </div>
          </div>

          <div className="clay-card p-3 rounded-[22px] shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] font-extrabold text-[#2E2544] dark:text-white">
                Live Facial Presentation
              </span>
              <span className="text-[9px] font-extrabold text-[#7C3AED] dark:text-[#C7B5F3] capitalize">
                {faceEmotion.primary_emotion}
              </span>
            </div>

            {(() => {
              const confPct = Math.min(100, Math.max(0, Math.round(faceEmotion.confidence > 1.0 ? faceEmotion.confidence : faceEmotion.confidence * 100)));
              const theme = getEmotionTheme(faceEmotion.primary_emotion);
              return (
                <div>
                  <div className="flex justify-between text-[9.5px] font-bold text-[#7A748A] dark:text-[#8E88A4] mb-1">
                    <span>Diagnostic Confidence</span>
                    <span className="font-extrabold" style={{ color: theme.color }}>
                      {confPct}%
                    </span>
                  </div>
                  <div className="clay-track-inset h-[5px] w-full rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${confPct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      style={{
                        height: "100%",
                        borderRadius: 999,
                        background: theme.bg,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="lg:col-span-5 clay-card p-3.5 rounded-[28px] flex flex-col justify-between h-full min-h-0">
          <div className="flex items-center gap-3 pb-2 border-b border-white/60 dark:border-white/10 shrink-0">
            <div className="shrink-0 flex items-center justify-center" style={{ width: 55, height: 50 }}>
              <AuraMascot3D size={52} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[14.5px] font-extrabold text-[#2E2544] dark:text-white leading-tight">
                  Aura AI Counselor
                </span>
                <span className="clay-pill px-2 py-0.5 text-[8.5px] font-black text-[#059669] dark:text-[#34D399]">
                  DOCTOR SYNC
                </span>
              </div>
              <p className="text-[10px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-0.5 m-0">
                Continuous clinical intake & empathetic reasoning
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-2.5 my-2 overflow-y-auto pr-1 min-h-0">
            {msgs.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${m.from === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.from === "aura" && (
                  <div className="shrink-0 mt-0.5">
                    <ClayAuraAvatarBead size={22} />
                  </div>
                )}
                <div
                  className={
                    m.from === "user"
                      ? "clay-bubble-user px-3.5 py-2 rounded-[16px] max-w-[85%]"
                      : "clay-bubble-aura px-3.5 py-2.5 rounded-[16px] max-w-[88%]"
                  }
                >
                  <p className="text-[12px] font-medium leading-relaxed m-0 whitespace-pre-wrap">
                    {m.text}
                  </p>
                </div>
              </motion.div>
            ))}

            {typing && (
              <div className="flex items-center gap-2 self-start">
                <ClayAuraAvatarBead size={22} />
                <div className="clay-bubble-aura px-3 py-1.5 rounded-[14px] flex items-center gap-1.5">
                  <span className="text-[10.5px] font-medium text-[#7A748A] dark:text-[#C7B5F3] mr-1">
                    Dr. Aura is formulating clinical response
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

          <div
            onClick={toggleMic}
            className="clay-card-flat px-3 py-1.5 rounded-[16px] flex items-center justify-between mb-2 shrink-0 cursor-pointer hover:opacity-90 transition-all"
            title="Click to toggle microphone"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center border-none"
                style={{
                  background: isAuraSpeaking ? "#EDE9FE" : micActive ? "#DCFCE7" : "#FEE2E2",
                  color: isAuraSpeaking ? "#7C3AED" : micActive ? "#059669" : "#DC2626",
                }}
              >
                {micActive ? <Mic size={11} /> : <MicOff size={11} />}
              </div>
              <span
                className={`text-[10px] font-extrabold ${
                  isAuraSpeaking
                    ? "text-[#7C3AED] dark:text-[#A78BFA]"
                    : micActive
                    ? "text-[#059669] dark:text-[#34D399]"
                    : "text-[#DC2626] dark:text-[#F87171]"
                }`}
              >
                {isAuraSpeaking
                  ? "Dr. Aura is Speaking (Click to interrupt)..."
                  : micActive
                  ? "Continuous Listening Active • Speak now"
                  : "Microphone Paused • Click to Start Listening"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[5, 12, 18, 10, 20, 14, 7, 16, 10, 5].map((h, i) => (
                <motion.div
                  key={i}
                  className={`w-1 rounded-full ${isAuraSpeaking ? "bg-[#7C3AED]" : "bg-[#8B5CF6]"}`}
                  animate={{ height: (micActive || isAuraSpeaking) ? [2, h, 2] : 2 }}
                  transition={{ duration: isAuraSpeaking ? 0.4 : 0.55, repeat: Infinity, delay: i * 0.06 }}
                />
              ))}
            </div>
          </div>

          <div className="clay-track-inset p-1 pl-3 rounded-full flex items-center gap-2 shrink-0">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              placeholder="Speak naturally or describe your symptoms..."
              className="bg-transparent border-none outline-none flex-1 text-[11.5px] font-medium text-[#2E2544] dark:text-white placeholder:text-[#8E88A4]"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleMic}
              className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                micActive
                  ? "bg-purple-100 dark:bg-purple-900/60 text-[#7B59DC] dark:text-purple-200"
                  : "clay-button text-[#7A748A] dark:text-[#D8D2E8]"
              }`}
              title={micActive ? "Mute Microphone" : "Unmute Microphone"}
            >
              {micActive ? <Mic size={12} /> : <MicOff size={12} />}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => sendMsg()}
              className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-white border-none outline-none"
              style={{
                background: "linear-gradient(135deg, #9E7EE6 0%, #7B56DB 100%)",
                boxShadow: "0 3px 8px rgba(123, 86, 219, 0.45)",
              }}
            >
              <Send size={12} />
            </motion.button>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-2.5 h-full justify-between min-h-0">
          <div className="clay-card p-3 rounded-[22px] shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-extrabold text-[#2E2544] dark:text-white flex items-center gap-1.5">
                <Heart size={13} className="text-rose-500" />
                <span>Emotion Vitals</span>
              </span>
              <span className="clay-pill px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#059669] dark:text-[#34D399]">
                FUSED
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="clay-card-flat px-2.5 py-1 rounded-[12px] flex justify-between items-center text-[10.5px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Primary Affect</span>
                <span className="text-[#0284C7] dark:text-[#38BDF8] capitalize">{faceEmotion.primary_emotion}</span>
              </div>
              <div className="clay-card-flat px-2.5 py-1 rounded-[12px] flex justify-between items-center text-[10.5px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Stress Index</span>
                <span className="text-[#059669] dark:text-[#34D399] capitalize">{faceEmotion.stress}</span>
              </div>
              <div className="clay-card-flat px-2.5 py-1 rounded-[12px] flex justify-between items-center text-[10.5px] font-bold">
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Congruence</span>
                <span className="text-purple-600 dark:text-purple-300 font-extrabold">Active Check</span>
              </div>
            </div>
          </div>

          <div className="clay-card p-3 rounded-[22px] flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center gap-1.5 mb-1.5 text-[#2E2544] dark:text-white shrink-0">
              <Stethoscope size={14} className="text-[#7C3AED] dark:text-[#A78BFA]" />
              <span className="text-[12px] font-extrabold">Doctor's Care Protocol</span>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 justify-between min-h-0">
              <div className="p-2 rounded-[12px] bg-sky-500/10 border border-sky-500/20">
                <div className="text-[8.5px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Step 1 • Somatic Reset
                </div>
                <div className="text-[10px] font-semibold text-[#2E2544] dark:text-white mt-0.5">
                  Diaphragmatic oxygenation (Box / 4-7-8 breathing)
                </div>
              </div>

              <div className="p-2 rounded-[12px] bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[8.5px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Step 2 • Cognitive Reframing
                </div>
                <div className="text-[10px] font-semibold text-[#2E2544] dark:text-white mt-0.5">
                  Deconstruct acute stressors into actionable steps
                </div>
              </div>

              <div className="p-2 rounded-[12px] bg-purple-500/10 border border-purple-500/20">
                <div className="text-[8.5px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                  Step 3 • Somatic Release
                </div>
                <div className="text-[10px] font-semibold text-[#2E2544] dark:text-white mt-0.5">
                  Hydration & cervical neck tension release
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

      <AnimatePresence>
        {showDuplexHud && <VoiceDiagnosticsHud onClose={() => setShowDuplexHud(false)} />}
      </AnimatePresence>
    </div>
  );
}
