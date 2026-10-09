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
  Sliders,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { AuraMascot3D } from "./aura-robot";
import { ClayCalmFaceIcon, ClayBrainIcon, ClayAuraAvatarBead, ClaySmileyBeadIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";
import { speechService, SUPPORTED_LANGUAGES, SupportedLanguage, SESSION_CLOSING_PHRASES } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
import { duplexManager, ConversationState, InterruptionScoreDetails } from "../services/duplexManager";
import { streamingTtsService } from "../services/streamingTtsService";
import { VoiceDiagnosticsHud } from "./VoiceDiagnosticsHud";
import { FaceDebugPanel } from "./FaceDebugPanel";
import { apiClient } from "../services/apiClient";
import { SolutionCard } from "./SolutionCard";

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
  solution?: any;
};

export function FaceToFaceScreen() {
  const { isDark } = useTheme();

  // ── Camera State ─────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const cameraActiveRef = useRef(cameraActive);
  cameraActiveRef.current = cameraActive;
  const [camFps, setCamFps] = useState(30);
  const [lighting, setLighting] = useState<"Good" | "Low" | "Bright">("Good");
  const [eyeContact, setEyeContact] = useState(true);

  // ── Emotion State (Strictly Verified, No Fake Initial Face Detected) ───────
  const [faceEmotion, setFaceEmotion] = useState<FaceEmotion>({
    primary_emotion: "Detecting...",
    confidence: 0.0,
    secondary_emotion: "calm",
    secondary_confidence: 0.0,
    face_detected: false,
    stress: "Low",
    sentiment: "Neutral",
    box_norm: null,
  });

  const [emotionWsConnected, setEmotionWsConnected] = useState(false);
  const emotionWs = useRef<WebSocket | null>(null);

  // ── Camera Permission Error State ──────────────────────────────────────────
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);

  // ── Live Face Debug Telemetry State ─────────────────────────────────────────
  const [showFaceDebug, setShowFaceDebug] = useState(false);
  const [trackingQuality, setTrackingQuality] = useState(0.0);
  const [qualityBreakdown, setQualityBreakdown] = useState<Record<string, number>>({});
  const [ferScores, setFerScores] = useState<Record<string, number>>({});
  const [facialMovement, setFacialMovement] = useState<any>({});
  const [transitions, setTransitions] = useState<any>({});
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [faceErrors, setFaceErrors] = useState<string[]>([]);

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
  const [micActive, setMicActive] = useState(false);
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(speechService.currentLanguage);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [currentVoiceId, setCurrentVoiceId] = useState(voiceService.getActiveVoice());
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const voiceList = voiceService.getVoiceList();
  const [showBreathingPacer, setShowBreathingPacer] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale");
  const [isSessionClosed, setIsSessionClosed] = useState(false);
  const [isConsultationActive, setIsConsultationActive] = useState(false);

  // ── Push-to-Talk (Wispr Flow) & Draft Recovery State ────────────────────────
  const [isPushToTalk, setIsPushToTalk] = useState(speechService.isPushToTalk);
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && isPushToTalk && !isPttPressed && isConsultationActive && !isSessionClosed) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea") {
          return;
        }
        e.preventDefault();
        setIsPttPressed(true);
        if (!speechService.isListening) {
          speechService.start().then(() => {
            speechService.setPushToTalkActive(true);
          });
        } else {
          speechService.setPushToTalkActive(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && isPushToTalk && isPttPressed) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea") {
          return;
        }
        e.preventDefault();
        setIsPttPressed(false);
        speechService.setPushToTalkActive(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPushToTalk, isPttPressed]);

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
  const chatSessionIdRef = useRef<number | null>(null);
  const serverGenerationRef = useRef(0);
  const clientTurnIdRef = useRef(0);
  const [isWsReconnecting, setIsWsReconnecting] = useState<boolean>(false);

  // ── Memory, Behavioral & Dynamic Context State ───────────────────────────
  const [activeGoal, setActiveGoal] = useState<string>("Career & Interview Preparation");
  const [activeInterest, setActiveInterest] = useState<string>("Artificial Intelligence & ML");
  const [sessionSummary, setSessionSummary] = useState<string>("Active clinical multimodal intake & diagnostic dialogue.");
  const [actionUnits, setActionUnits] = useState<Record<string, number>>({});
  const [gazeInfo, setGazeInfo] = useState<{ eye_contact?: boolean; gaze_angle_x?: number; ear?: number }>({});
  const [headPose, setHeadPose] = useState<{ pitch?: number; yaw?: number; roll?: number }>({});
  const [fusedEmotion, setFusedEmotion] = useState<{ primary?: string; confidence?: number; text?: string; voice?: string; face?: string }>({});
  const [latencyMetrics, setLatencyMetrics] = useState<Record<string, number>>({});

  const formatList = (val: any) => {
    if (Array.isArray(val)) return val.filter(Boolean).join(" • ");
    if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean).join(" • ");
    return val || "";
  };

  useEffect(() => {
    apiClient
      .get<any>("/api/v1/users/me")
      .then((u) => {
        if (u) {
          if (u.goals && (Array.isArray(u.goals) ? u.goals.length : u.goals)) {
            setActiveGoal(formatList(u.goals));
          }
          if (u.interests && (Array.isArray(u.interests) ? u.interests.length : u.interests)) {
            setActiveInterest(formatList(u.interests));
          }
        }
      })
      .catch(() => {});
  }, []);

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

  // ── 1. Camera Permissions & Progressive Multi-Tier Fallback ────────────────
  const startCamera = async () => {
    setIsSessionClosed(false);
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
      setCameraError("Camera media devices API is not supported in this browser environment.");
      return;
    }

    // Pre-check available hardware video inputs if permitted
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      if (devices.length > 0 && videoDevices.length === 0) {
        setCameraActive(false);
        setCameraError(
          "No webcam device detected. If using a laptop, check if the physical camera privacy slider is closed or Fn key is toggled off. Continuing in Voice & Audio mode."
        );
        return;
      }
    } catch {
      // Continue to getUserMedia if enumerateDevices was restricted before permission
    }

    let stream: MediaStream | null = null;

    // Tier 1: Standard relaxed video constraint (ideal 640x480, no strict facingMode)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (firstErr: any) {
      console.info("Standard webcam constraint failed, attempting universal fallback:", firstErr);
      try {
        // Tier 2: Universal { video: true } constraint for external/UVC/virtual webcams
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (secondErr: any) {
        console.warn("Webcam access error:", secondErr);
        setCameraActive(false);
        const isDenied = secondErr.name === "NotAllowedError" || secondErr.name === "PermissionDeniedError";
        const isNotFound = secondErr.name === "NotFoundError" || secondErr.name === "DevicesNotFoundError";
        setCameraError(
          isNotFound
            ? "Webcam device was not found or is disabled by a physical privacy slider / Fn key. Continuing seamlessly in Voice & Audio mode."
            : isDenied
            ? "Camera permission was denied. Check browser and Windows permissions to enable facial analysis, or continue in Voice & Audio mode."
            : "Webcam could not be opened (may be in use by another application). Continuing in Voice & Audio mode."
        );
        setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
        setTrackingQuality(0.0);
        return;
      }
    }

    if (stream) {
      mediaStreamRef.current = stream;
      setCameraActive(true);
      setCameraError(null);

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          console.warn("[CAMERA] Video track ended by hardware switch or browser");
          setCameraActive(false);
          setCameraError("Camera was turned off by hardware switch or disconnected.");
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("autoplay", "true");
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("muted", "true");
        videoRef.current.play().catch((e) => console.warn("Video play error:", e));
      }
    }
  };

  const stopCamera = () => {
    // 1. Terminate all hardware tracks on saved media stream reference
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping media track:", e);
        }
      });
      mediaStreamRef.current = null;
    }

    // 2. Terminate all tracks on video DOM element if still attached
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => {
        try {
          t.stop();
        } catch (e) {}
      });
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraError(null);
    setFaceEmotion((prev) => ({ ...prev, face_detected: false }));
    setTrackingQuality(0.0);
  };

  const handleSessionClose = () => {
    setIsSessionClosed(true);
    setIsConsultationActive(false);
    stopCamera();
    speechService.stop();
    setMicActive(false);
    duplexManager.transitionTo("IDLE", "Session concluded");
  };

  const toggleCamera = () => {
    if (cameraActive) {
      stopCamera();
    } else {
      setIsSessionClosed(false);
      setIsConsultationActive(true);
      startCamera();
    }
  };
  const handleStartConsultation = async () => {
    setIsSessionClosed(false);
    setIsConsultationActive(true);
    setSttError(null);
    duplexManager.transitionTo("LISTENING", "Consultation started");
    await startCamera();
    try {
      await speechService.start();
      setMicActive(true);
    } catch (e) {
      console.warn("Speech recognition activation error:", e);
    }
  };

  useEffect(() => {
    let fpsInterval: any;

    // Camera and mic remain in standby until the user initiates the consultation

    fpsInterval = setInterval(() => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        setCamFps(settings?.frameRate ? Math.round(settings.frameRate) : 30);
      } else {
        setCamFps(0);
      }
    }, 1000);

    return () => {
      stopCamera();
      speechService.stop();
      voiceService.stop();
      duplexManager.stop();
      streamingTtsService.cancel();
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
            const rawPrimary = data.primary_emotion || data.emotion?.primary || data.emotion || "neutral";
            const formattedPrimary = rawPrimary.charAt(0).toUpperCase() + rawPrimary.slice(1);
            const confRaw = data.confidence !== undefined ? data.confidence : (data.emotion?.confidence ?? 0.85);
            const confVal = confRaw > 1.0 ? confRaw / 100.0 : confRaw;

            if (data.tracking_quality !== undefined) setTrackingQuality(data.tracking_quality);
            if (data.quality_breakdown) setQualityBreakdown(data.quality_breakdown);
            if (data.action_units) setActionUnits(data.action_units);
            if (data.gaze) {
              setGazeInfo(data.gaze);
              if (data.gaze.eye_contact !== undefined) setEyeContact(Boolean(data.gaze.eye_contact));
            }
            if (data.head_pose) setHeadPose(data.head_pose);
            if (data.facial_movement) setFacialMovement(data.facial_movement);
            if (data.transitions) setTransitions(data.transitions);
            if (data.scores) setFerScores(data.scores);
            if (data.latencies) setLatencyMetrics(data.latencies);

            setFaceEmotion((prev) => ({
              primary_emotion: formattedPrimary,
              confidence: confVal,
              secondary_emotion: data.secondary_emotion || data.emotion?.secondary || "calm",
              secondary_confidence: data.secondary_confidence || 0.4,
              face_detected: cameraActiveRef.current && data.face_detected === true,
              stress: data.stress ? data.stress.charAt(0).toUpperCase() + data.stress.slice(1) : "Low",
              sentiment: data.sentiment ? data.sentiment.charAt(0).toUpperCase() + data.sentiment.slice(1) : "Positive",
              box_norm: data.box_norm || null,
              face_box: data.face_box || null,
            }));
          } else if (data.type === "no_face") {
            setFaceEmotion((prev) => ({
              ...prev,
              face_detected: false,
              confidence: 0,
              primary_emotion: "No Face",
            }));
            if (data.tracking_quality !== undefined) setTrackingQuality(data.tracking_quality);
            if (data.quality_breakdown) setQualityBreakdown(data.quality_breakdown);
            if (data.transitions) setTransitions(data.transitions);
            setActionUnits({ presence: {}, intensity: {} });
            setGazeInfo({});
            setHeadPose({});
          } else if (data.type === "error") {
            setFaceErrors((prev) => [data.message || "Face stream error", ...prev].slice(0, 5));
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
  const actionUnitsRef = useRef(actionUnits);
  actionUnitsRef.current = actionUnits;
  const gazeInfoRef = useRef(gazeInfo);
  gazeInfoRef.current = gazeInfo;
  const headPoseRef = useRef(headPose);
  headPoseRef.current = headPose;
  const currentVoiceIdRef = useRef(currentVoiceId);
  currentVoiceIdRef.current = currentVoiceId;

  useEffect(() => {
    let socket: WebSocket;
    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectAttempt = 0;

    const connectChat = () => {
      if (isUnmounted) return;
      const wsUrl = getWebSocketUrl("/api/v1/ws/chat");

      socket = new WebSocket(wsUrl);
      chatWs.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setIsWsReconnecting(false);
      };

      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }));
            return;
          }
          if (data.type === "interrupted") {
            serverGenerationRef.current = Math.max(
              serverGenerationRef.current,
              Number(data.next_generation_id || data.generation_id || 0)
            );
            setTyping(false);
            streamingTtsService.cancel();
            voiceService.stop();
            return;
          }

          const eventGeneration = Number(data.generation_id || 0);
          if (eventGeneration > 0) {
            if (eventGeneration < serverGenerationRef.current) {
              return;
            }
            serverGenerationRef.current = eventGeneration;
          }

          if (data.type === "session_start") {
            chatSessionIdRef.current = Number(data.session_id) || chatSessionIdRef.current;
            return;
          }

          if (data.type === "start") {
            setTyping(true);
            streamingTtsService.startStream({
              voice: currentVoiceIdRef.current,
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
          } else if (data.type === "solution_card") {
            const solData = data.solution || data.data;
            if (solData) {
              setMsgs((prev) => {
                if (prev.length === 0) {
                  return [{ id: "aura-sol-" + Date.now(), from: "aura", text: "", solution: solData }];
                }
                const lastIdx = prev.length - 1;
                const lastMsg = prev[lastIdx];
                if (lastMsg && lastMsg.from === "aura") {
                  return [
                    ...prev.slice(0, lastIdx),
                    { ...lastMsg, solution: solData },
                  ];
                } else {
                  return [
                    ...prev,
                    { id: "aura-sol-" + Date.now(), from: "aura", text: "", solution: solData },
                  ];
                }
              });
            }
          } else if (data.type === "session_closing") {
            handleSessionClose();
          } else if (data.type === "done" || data.type === "message" || data.type === "agent_response") {
            setTyping(false);
            streamingTtsService.finalizeStream();
            if (data.is_closing || data.phase === "wrap_up") {
              handleSessionClose();
            }
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
          setIsWsReconnecting(true);
          reconnectAttempt += 1;
          const backoff = Math.min(10000, 500 * 2 ** Math.min(reconnectAttempt, 4));
          const jitter = Math.floor(Math.random() * 250);
          reconnectTimeout = setTimeout(connectChat, backoff + jitter);
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

  useEffect(() => {
    return duplexManager.onInterrupt(() => {
      if (chatWs.current?.readyState === WebSocket.OPEN) {
        chatWs.current.send(
          JSON.stringify({ type: "interrupt", reason: "speech_barge_in" })
        );
      }
      const draft = speechService.getRecoverableDraft();
      if (draft && draft.trim()) {
        setRecoverableDraft(draft.trim());
      }
    });
  }, []);

  const speakText = (txt: string, customEmotion?: string) => {
    voiceService.speak(txt, {
      emotion: customEmotion || faceEmotionRef.current.primary_emotion || "calm",
    });
  };

  const micActiveRef = useRef(micActive);
  micActiveRef.current = micActive;

  const [legacyVoiceSpeaking, setLegacyVoiceSpeaking] = useState(false);
  const isAuraSpeaking =
    legacyVoiceSpeaking ||
    duplexState === "AURA_SPEAKING" ||
    duplexState === "POSSIBLE_INTERRUPT" ||
    duplexState === "CANCELLING_TTS";

  useEffect(() => {
    return voiceService.subscribe((speaking) => {
      setLegacyVoiceSpeaking(speaking);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = speechService.subscribe({
      onInterim: (interim) => {
        // Echo Shield: reject interim transcripts if TTS is speaking or in 1500ms post-playback hangover
        if (duplexManager.isTtsActiveOrRecent(1500)) return;
        const clean = interim.trim();
        if (!clean) return;
        setText(clean);
      },
      onFinal: (final) => {
        // Echo Shield: never let Aura's own speech be transcribed and committed
        if (duplexManager.isTtsActiveOrRecent(1500)) return;
        const clean = final.trim();
        if (!clean) return;
        setText(clean);
        sendMsg(clean);
      },
      onError: (err) => {
        setSttError(err);
      },
      onListeningChange: (isList) => {
        setMicActive(isList);
      },
    });

    // Mic remains in standby until consultation is started

    return () => {
      unsubscribe();
      speechService.stop();
    };
  }, []);

  const toggleMic = async () => {
    setSttError(null);
    if (isAuraSpeaking) {
      voiceService.stop();
    }
    if (speechService.isListening) {
      speechService.stop();
    } else {
      setIsSessionClosed(false);
      setIsConsultationActive(true);
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

    setRecoverableDraft(null);
    speechService.clearRecoverableDraft();

    const tLower = t.toLowerCase().trim();
    const isClosing = SESSION_CLOSING_PHRASES.some((phrase) => tLower.includes(phrase));
    if (isClosing) {
      handleSessionClose();
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
    duplexManager.transitionTo("PROCESSING", "User utterance sent to AI");

    if (chatWs.current && chatWs.current.readyState === WebSocket.OPEN) {
      clientTurnIdRef.current += 1;
      chatWs.current.send(
        JSON.stringify({
          type: "message",
          content: t,
          session_id: chatSessionIdRef.current,
          client_turn_id: clientTurnIdRef.current,
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
            action_units: actionUnitsRef.current,
            gaze: gazeInfoRef.current,
            head_pose: headPoseRef.current,
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
                    : duplexState === "PROCESSING"
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
                    : duplexState === "PROCESSING"
                    ? "AI Thinking"
                    : duplexState === "POSSIBLE_INTERRUPT"
                    ? "Evaluating Barge-in"
                    : "Live Duplex • Listening"}
                </span>
                <Activity size={10} className="opacity-70" />
              </button>
              {faceEmotion.stress === "High" && (
                <div
                  className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-400/40 animate-pulse flex items-center gap-1 cursor-pointer"
                  onClick={() => setShowBreathingPacer(true)}
                  title="Aura notices your tension. Click to begin a gentle breath reset."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                  <span>Gentle Breath Nudge</span>
                </div>
              )}
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

      {/* Camera Permission Denial / Error Banner */}
      <AnimatePresence>
        {cameraError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-amber-500/15 border border-amber-500/30 rounded-[18px] p-2.5 mb-2 flex items-center justify-between text-amber-200 text-xs shadow-lg"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <span>{cameraError}</span>
            </div>
            <button
              onClick={() => setCameraError(null)}
              className="w-5 h-5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center justify-center cursor-pointer border-none ml-2 shrink-0"
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speech Recognition Error Banner */}
      <AnimatePresence>
        {sttError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-amber-500/15 border border-amber-500/30 rounded-[18px] p-2.5 mb-2 flex items-center justify-between text-amber-200 text-xs shadow-lg"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <span>{sttError}</span>
            </div>
            <button
              onClick={() => setSttError(null)}
              className="w-5 h-5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center justify-center cursor-pointer border-none ml-2 shrink-0"
            >
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced Live Face Debug Panel */}
      <FaceDebugPanel
        isOpen={showFaceDebug}
        onClose={() => setShowFaceDebug(false)}
        cameraActive={cameraActive}
        camFps={camFps}
        faceDetected={cameraActive && faceEmotion.face_detected}
        trackingQuality={trackingQuality}
        qualityBreakdown={qualityBreakdown}
        actionUnits={actionUnits as any}
        gaze={gazeInfo}
        headPose={headPose}
        ferScores={ferScores}
        facialMovement={facialMovement}
        transitions={transitions}
        latencies={latencyMetrics}
        smoothedEmotion={faceEmotion.primary_emotion}
        confidence={faceEmotion.confidence}
        droppedFrames={droppedFrames}
        errors={faceErrors}
      />

      {/* Session Concluded Notification Banner */}
      <AnimatePresence>
        {isSessionClosed && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-purple-500/15 border border-purple-500/30 rounded-[18px] p-2.5 mb-2 flex items-center justify-between text-purple-200 text-xs shadow-lg"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
              <span className="font-semibold text-[11.5px]">
                Session concluded. Camera and microphone have been automatically closed for your privacy. Click &quot;Start Camera&quot; or the microphone button below to resume anytime.
              </span>
            </div>
            <button
              onClick={() => setIsSessionClosed(false)}
              className="w-5 h-5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 flex items-center justify-center cursor-pointer border-none ml-2 shrink-0"
              title="Dismiss"
            >
              <X size={11} />
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
                <button
                  onClick={() => setShowFaceDebug(!showFaceDebug)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold cursor-pointer transition-all border flex items-center gap-1 ${
                    showFaceDebug
                      ? "bg-purple-600 text-white border-purple-400 shadow-sm"
                      : "bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/20"
                  }`}
                  title="Toggle Live FACS & Behavioral Debug Panel"
                >
                  <Sliders size={10} />
                  <span>Face HUD</span>
                </button>
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
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${
                  cameraActive ? "opacity-100" : "opacity-0 absolute pointer-events-none"
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!cameraActive && isConsultationActive && !isSessionClosed && (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-300 p-5 text-center max-w-xs">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 mb-0.5 shadow-inner">
                    <Mic size={22} className={micActive ? "animate-pulse" : ""} />
                  </div>
                  <span className="text-[12.5px] font-bold text-white leading-tight">
                    Voice & Audio Mode Active
                  </span>
                  <p className="text-[10px] text-slate-400 m-0 leading-relaxed font-medium">
                    Webcam is offline or not detected. Full duplex voice, sentiment analysis & clinical dialogue are running smoothly.
                  </p>
                  <button
                    onClick={startCamera}
                    className="mt-1.5 px-3.5 py-1 bg-white/10 hover:bg-white/20 text-purple-200 hover:text-white border border-purple-400/30 rounded-full text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5"
                    title="Retry connecting camera"
                  >
                    <Camera size={11} />
                    <span>Connect Camera</span>
                  </button>
                </div>
              )}

              {!cameraActive && (!isConsultationActive || isSessionClosed) && (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-400 p-5 text-center max-w-xs">
                  <div className="w-11 h-11 rounded-full bg-purple-900/40 flex items-center justify-center text-purple-300 mb-0.5 shadow-inner">
                    <VideoOff size={22} />
                  </div>
                  <span className="text-[12.5px] font-bold text-white leading-tight">
                    {isSessionClosed ? "Session Concluded" : "Camera & Microphone Standby"}
                  </span>
                  <p className="text-[10.5px] text-slate-400 m-0 leading-relaxed font-medium">
                    {isSessionClosed
                      ? "Hardware devices have been disconnected. Click below to start a new consultation whenever you're ready."
                      : "Monitoring is paused. When you are ready to begin, click below to start your consultation with Dr. Aura."}
                  </p>
                  <button
                    onClick={handleStartConsultation}
                    className="mt-1.5 px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-full text-[11px] font-bold cursor-pointer border-none shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Camera size={13} />
                    <span>{isSessionClosed ? "Start New Consultation" : "Start Consultation"}</span>
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
                <div className={`text-[10.5px] font-extrabold mt-0.5 ${eyeContact ? "text-[#059669] dark:text-[#34D399]" : "text-amber-500"}`}>
                  {eyeContact ? "Attentive" : "Averted"}
                </div>
              </div>
              <div className="clay-card-flat p-1.5 rounded-[12px] text-center">
                <div className="text-[8.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Tracking Quality</div>
                <div className={`text-[10.5px] font-extrabold mt-0.5 ${trackingQuality >= 0.7 ? "text-emerald-500" : trackingQuality >= 0.4 ? "text-amber-500" : "text-rose-500"}`}>
                  {Math.round(trackingQuality * 100)}%
                </div>
              </div>
              <div className="clay-card-flat p-1.5 rounded-[12px] text-center">
                <div className="text-[8.5px] font-bold text-[#7A748A] dark:text-[#8E88A4]">Pipeline State</div>
                <div className="text-[10.5px] font-extrabold text-[#7C3AED] dark:text-[#A78BFA] mt-0.5 truncate capitalize">
                  {transitions?.state || "Active"}
                </div>
              </div>
            </div>
          </div>

          <div className="clay-card p-3 rounded-[22px] shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] font-extrabold text-[#2E2544] dark:text-white">
                FACS Action Units (OpenFace)
              </span>
              <span className="text-[9px] font-extrabold text-[#7C3AED] dark:text-[#C7B5F3]">
                {headPose?.yaw !== undefined ? `Yaw ${headPose.yaw}° · Pitch ${headPose.pitch || 0}°` : "MediaPipe 478D"}
              </span>
            </div>

            {(() => {
              const auInt = (actionUnits as any)?.intensity || {};
              const auPres = (actionUnits as any)?.presence || {};
              const getVal = (k: string, alt: string) => {
                if (auInt[k] !== undefined) return auInt[k];
                if ((actionUnits as any)[k] !== undefined) return (actionUnits as any)[k];
                if ((actionUnits as any)[alt] !== undefined) return (actionUnits as any)[alt];
                return 0;
              };

              const au12 = getVal("AU12", "AU12_LipCornerPuller");
              const au04 = getVal("AU04", "AU04_BrowLowerer");
              const au01 = getVal("AU01", "AU01_InnerBrowRaiser");
              const au06 = getVal("AU06", "AU06_CheekRaiser");

              return (
                <div className="grid grid-cols-2 gap-1.5 text-[9.5px]">
                  <div className="clay-card-flat p-1.5 rounded-[10px] flex items-center justify-between">
                    <span className="text-[#7A748A] dark:text-[#8E88A4] font-bold">AU12 Smile</span>
                    <span className="font-mono font-extrabold text-emerald-500">
                      {typeof au12 === "number" ? (au12 <= 1.0 ? `${Math.round(au12 * 100)}%` : `${au12.toFixed(1)}/5`) : au12}
                    </span>
                  </div>
                  <div className="clay-card-flat p-1.5 rounded-[10px] flex items-center justify-between">
                    <span className="text-[#7A748A] dark:text-[#8E88A4] font-bold">AU04 Brow Low</span>
                    <span className="font-mono font-extrabold text-amber-500">
                      {typeof au04 === "number" ? (au04 <= 1.0 ? `${Math.round(au04 * 100)}%` : `${au04.toFixed(1)}/5`) : au04}
                    </span>
                  </div>
                  <div className="clay-card-flat p-1.5 rounded-[10px] flex items-center justify-between">
                    <span className="text-[#7A748A] dark:text-[#8E88A4] font-bold">AU06 Cheek</span>
                    <span className="font-mono font-extrabold text-sky-500">
                      {typeof au06 === "number" ? (au06 <= 1.0 ? `${Math.round(au06 * 100)}%` : `${au06.toFixed(1)}/5`) : au06}
                    </span>
                  </div>
                  <div className="clay-card-flat p-1.5 rounded-[10px] flex items-center justify-between">
                    <span className="text-[#7A748A] dark:text-[#8E88A4] font-bold">AU45 Blink/EAR</span>
                    <span className="font-mono font-extrabold text-purple-500">
                      {gazeInfo?.ear !== undefined ? gazeInfo.ear : (auPres?.AU45 ? "Blink" : "Open")}
                    </span>
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

          {isWsReconnecting && (
            <div className="clay-card-flat px-3 py-1.5 rounded-xl text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 flex items-center justify-between gap-2 shrink-0 animate-pulse mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Reconnecting with Aura server...
              </span>
              <button
                onClick={() => window.location.reload()}
                className="underline bg-transparent border-none text-[9.5px] cursor-pointer text-amber-700 dark:text-amber-300 font-bold"
              >
                Reload
              </button>
            </div>
          )}

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
                      : "clay-bubble-aura px-3.5 py-2.5 rounded-[16px] max-w-[90%]"
                  }
                >
                  {m.text && (
                    <p className="text-[12px] font-medium leading-relaxed m-0 whitespace-pre-wrap">
                      {m.text}
                    </p>
                  )}
                  {m.solution && (
                    <SolutionCard solution={m.solution} sessionId={chatSessionIdRef.current} />
                  )}
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

          {recoverableDraft && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="clay-card-flat px-3 py-1.5 rounded-[14px] flex items-center justify-between mb-2 shrink-0 bg-purple-500/10 dark:bg-purple-900/20 border border-purple-500/20"
            >
              <div className="flex items-center gap-1.5 min-w-0 mr-2 text-[10.5px]">
                <Sparkles size={12} className="text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="font-extrabold text-purple-700 dark:text-purple-300 shrink-0">Interrupted draft:</span>
                <span className="text-[#2E2544] dark:text-purple-100 truncate italic">"{recoverableDraft}"</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setText(recoverableDraft);
                    setRecoverableDraft(null);
                    speechService.clearRecoverableDraft();
                  }}
                  className="px-2 py-0.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-[9.5px] font-extrabold transition-all"
                >
                  Restore
                </button>
                <button
                  onClick={() => {
                    setRecoverableDraft(null);
                    speechService.clearRecoverableDraft();
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={11} />
                </button>
              </div>
            </motion.div>
          )}

          <div
            onClick={isPushToTalk ? undefined : toggleMic}
            className="clay-card-flat px-3 py-1.5 rounded-[16px] flex items-center justify-between mb-2 shrink-0 cursor-pointer hover:opacity-90 transition-all"
            title={isPushToTalk ? "Push-to-Talk Mode: Hold Spacebar or mic button to speak" : "Click to toggle microphone"}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center border-none transition-colors"
                style={{
                  background: isAuraSpeaking
                    ? "#EDE9FE"
                    : isPushToTalk
                    ? isPttPressed
                      ? "#DCFCE7"
                      : "#E0F2FE"
                    : micActive
                    ? "#DCFCE7"
                    : "#FEE2E2",
                  color: isAuraSpeaking
                    ? "#7C3AED"
                    : isPushToTalk
                    ? isPttPressed
                      ? "#059669"
                      : "#0284C7"
                    : micActive
                    ? "#059669"
                    : "#DC2626",
                }}
              >
                {isPushToTalk ? (
                  isPttPressed ? <Mic size={11} /> : <MicOff size={11} />
                ) : micActive ? (
                  <Mic size={11} />
                ) : (
                  <MicOff size={11} />
                )}
              </div>
              <span
                className={`text-[10px] font-extrabold ${
                  isAuraSpeaking
                    ? "text-[#7C3AED] dark:text-[#A78BFA]"
                    : isPushToTalk
                    ? isPttPressed
                      ? "text-[#059669] dark:text-[#34D399]"
                      : "text-sky-600 dark:text-sky-300"
                    : isSessionClosed && !micActive
                    ? "text-purple-600 dark:text-purple-300"
                    : micActive
                    ? "text-[#059669] dark:text-[#34D399]"
                    : "text-[#DC2626] dark:text-[#F87171]"
                }`}
              >
                {isAuraSpeaking
                  ? "Dr. Aura Speaking • Echo Shield Active (Click to interrupt)..."
                  : isPushToTalk
                  ? isPttPressed
                    ? "Push-to-Talk Active • Speaking..."
                    : "Push-to-Talk Ready • Hold Spacebar or Button to Speak"
                  : isSessionClosed && !micActive
                  ? "Session Concluded • Microphone Off (Click to Resume)"
                  : micActive
                  ? "Continuous Listening Active • Speak now"
                  : "Microphone Paused • Click to Start Listening"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextMode = !isPushToTalk;
                  setIsPushToTalk(nextMode);
                  speechService.setPushToTalkMode(nextMode);
                }}
                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border ${
                  isPushToTalk
                    ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                    : "bg-white/50 dark:bg-white/10 text-[#7A748A] dark:text-[#D8D2E8] border-black/5 dark:border-white/10 hover:border-purple-400"
                }`}
                title="Switch between Wispr Flow Push-to-Talk (Hold Spacebar) and Continuous Listening"
              >
                {isPushToTalk ? "PTT Mode" : "Continuous"}
              </button>

              <div className="flex items-center gap-1">
                {[5, 12, 18, 10, 20, 14, 7, 16, 10, 5].map((h, i) => (
                  <motion.div
                    key={i}
                    className={`w-1 rounded-full ${isAuraSpeaking ? "bg-[#7C3AED]" : "bg-[#8B5CF6]"}`}
                    animate={{
                      height:
                        (micActive && (!isPushToTalk || isPttPressed)) || isAuraSpeaking
                          ? [2, h, 2]
                          : 2,
                    }}
                    transition={{
                      duration: isAuraSpeaking ? 0.4 : 0.55,
                      repeat: Infinity,
                      delay: i * 0.06,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="clay-track-inset p-1 pl-3 rounded-full flex items-center gap-2 shrink-0">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              placeholder={isPushToTalk ? "Hold Spacebar to speak, or type here..." : "Speak naturally or describe your symptoms..."}
              className="bg-transparent border-none outline-none flex-1 text-[11.5px] font-medium text-[#2E2544] dark:text-white placeholder:text-[#8E88A4]"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={isPushToTalk ? undefined : toggleMic}
              onMouseDown={() => {
                if (isPushToTalk && isConsultationActive && !isSessionClosed) {
                  setIsPttPressed(true);
                  if (!speechService.isListening) {
                    speechService.start().then(() => speechService.setPushToTalkActive(true));
                  } else {
                    speechService.setPushToTalkActive(true);
                  }
                }
              }}
              onMouseUp={() => {
                if (isPushToTalk) {
                  setIsPttPressed(false);
                  speechService.setPushToTalkActive(false);
                }
              }}
              onTouchStart={() => {
                if (isPushToTalk && isConsultationActive && !isSessionClosed) {
                  setIsPttPressed(true);
                  if (!speechService.isListening) {
                    speechService.start().then(() => speechService.setPushToTalkActive(true));
                  } else {
                    speechService.setPushToTalkActive(true);
                  }
                }
              }}
              onTouchEnd={() => {
                if (isPushToTalk) {
                  setIsPttPressed(false);
                  speechService.setPushToTalkActive(false);
                }
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                isPushToTalk && isPttPressed
                  ? "bg-emerald-500 text-white shadow-md"
                  : micActive
                  ? "bg-purple-100 dark:bg-purple-900/60 text-[#7B59DC] dark:text-purple-200"
                  : "clay-button text-[#7A748A] dark:text-[#D8D2E8]"
              }`}
              title={
                isPushToTalk
                  ? "Hold to Speak (or hold Spacebar)"
                  : micActive
                  ? "Mute Microphone"
                  : "Unmute Microphone"
              }
            >
              {micActive || (isPushToTalk && isPttPressed) ? <Mic size={12} /> : <MicOff size={12} />}
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
                <span>Multimodal Emotion State</span>
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
                <span className="text-[#7A748A] dark:text-[#8E88A4]">Active Sources</span>
                <span className="text-purple-600 dark:text-purple-300 font-extrabold">Face + Voice + Text</span>
              </div>
            </div>
          </div>

          <div className="clay-card p-3 rounded-[22px] flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center gap-1.5 mb-1.5 text-[#2E2544] dark:text-white shrink-0">
              <Stethoscope size={14} className="text-[#7C3AED] dark:text-[#A78BFA]" />
              <span className="text-[12px] font-extrabold">Live Personalized Context</span>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 justify-between min-h-0">
              <div className="p-2 rounded-[12px] bg-sky-500/10 border border-sky-500/20">
                <div className="text-[8.5px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Target Goal
                </div>
                <div className="text-[10px] font-semibold text-[#2E2544] dark:text-white mt-0.5 truncate">
                  {activeGoal}
                </div>
              </div>

              <div className="p-2 rounded-[12px] bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[8.5px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Known Interest & Project
                </div>
                <div className="text-[10px] font-semibold text-[#2E2544] dark:text-white mt-0.5 truncate">
                  {activeInterest}
                </div>
              </div>

              {latencyMetrics.total_turn_latency_ms ? (
                <div className="p-2 rounded-[12px] bg-purple-500/10 border border-purple-500/20 text-[9px] font-mono flex justify-between items-center text-purple-600 dark:text-purple-300">
                  <span>Turn Latency</span>
                  <span className="font-bold">{latencyMetrics.total_turn_latency_ms} ms</span>
                </div>
              ) : null}

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
