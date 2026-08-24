import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, Sparkles, RefreshCw, AlertCircle, StopCircle, Radio } from "lucide-react";
import { AuraMascot3D, AuraRobot } from "./aura-robot";
import { ClayMicCircleButton, ClayVoiceWaveBarsIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";

export function VoiceScreen() {
  const { isDark } = useTheme();
  const [listening, setListening] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("Hello! I'm Aura, your emotion-aware companion. I'm listening—go ahead and talk to me.");
  const [sttSupported, setSttSupported] = useState(true);
  const [sttError, setSttError] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  // ── 1. Speech Synthesis (TTS) Helper ─────────────────────────────────────────
  const speakText = (txt: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      setSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(txt);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const enVoice =
        voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Female") || v.name.includes("Zira") || v.name.includes("Google") || v.name.includes("Natural"))) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (enVoice) utterance.voice = enVoice;

      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("TTS error:", e);
      setSpeaking(false);
    }
  };

  // ── 2. WebSocket Connection Setup with Auto-Reconnect ─────────────────────────
  useEffect(() => {
    let socket: WebSocket | null = null;
    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/chat`;

      socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("VoiceScreen WebSocket connected");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "start") {
            setThinking(false);
            setAiResponse("");
          } else if (data.type === "chunk") {
            setThinking(false);
            setAiResponse((prev) => prev + data.content);
          } else if (data.type === "done") {
            setThinking(false);
            setAiResponse((fullText) => {
              if (fullText) speakText(fullText);
              return fullText;
            });
          } else if (data.type === "error") {
            setThinking(false);
            const fallbackMsg = "I'm right here with you and listening. What's on your mind today?";
            setAiResponse(fallbackMsg);
            speakText(fallbackMsg);
          }
        } catch (e) {
          console.error("WS message parse error:", e);
        }
      };

      socket.onclose = () => {
        console.log("VoiceScreen WebSocket disconnected");
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      socket?.close();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Send message to AI backend
  const sendToAi = (userSpeech: string) => {
    if (!userSpeech.trim()) return;
    setThinking(true);
    setAiResponse("Aura is processing...");

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "message", content: userSpeech, mode: "voice" }));
    } else {
      // Fallback response if offline
      setTimeout(() => {
        setThinking(false);
        const lower = userSpeech.toLowerCase();
        let reply = `I heard you say: "${userSpeech}". I am here to support you whenever you need to talk.`;
        if (lower.includes("stress") || lower.includes("pressure") || lower.includes("project")) {
          reply = "Take a slow, gentle breath with me. Final projects and expectations can feel intense, but you are more than capable of taking it step by step.";
        } else if (lower.includes("hello") || lower.includes("hi")) {
          reply = "Hello! I'm so glad to talk with you today. How is your heart feeling right now?";
        }
        setAiResponse(reply);
        speakText(reply);
      }, 1000);
    }
  };

  // ── 3. Continuous Speech Recognition (STT) ───────────────────────────────────
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSttSupported(false);
      setSttError("Speech recognition is not supported in this browser. Try Google Chrome, MS Edge, or Safari.");
      return;
    }

    let recognition: any = null;
    let isComponentMounted = true;

    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setSttError(null);
      };

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

        if (interim) {
          setInterimTranscript(interim);
        }

        if (final) {
          const cleanFinal = final.trim();
          setTranscript(cleanFinal);
          setInterimTranscript("");
          sendToAi(cleanFinal);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "not-allowed") {
          setSttError("Microphone access denied. Please allow microphone permissions in your browser address bar.");
          setListening(false);
        } else if (event.error !== "no-speech" && event.error !== "network") {
          console.warn("SpeechRecognition notice:", event.error);
        }
      };

      recognition.onend = () => {
        if (isComponentMounted && listeningRef.current) {
          try {
            recognition.start();
          } catch (e) {
            // Ignore if already starting
          }
        }
      };

      if (listening) {
        recognition.start();
      }
    } catch (e: any) {
      console.warn("SpeechRecognition init exception:", e);
      setSttError(e.message || "Failed to initialize Speech Recognition.");
    }

    return () => {
      isComponentMounted = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {}
      }
    };
  }, [listening]);

  const toggleListening = () => {
    if (speaking) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setSpeaking(false);
    }
    setListening(!listening);
  };

  const handleResetSession = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setThinking(false);
    setTranscript("");
    setInterimTranscript("");
    const greeting = "Session refreshed. I'm listening—what would you like to talk about?";
    setAiResponse(greeting);
    speakText(greeting);
  };

  // Waveform Bar Heights (smooth symmetrical animation pattern)
  const waveHeights = [10, 18, 28, 16, 34, 24, 14, 30, 36, 22, 12, 32, 20, 34, 26, 14, 28, 16];

  return (
    <div className="w-full max-w-[760px] mx-auto select-none px-2 sm:px-4">
      {/* Main Compact Voice Mode Panel (Bento Container) */}
      <div className="clay-voice-panel p-4 sm:p-5 lg:p-6 flex flex-col items-center text-center">
        {/* Header Strip */}
        <div className="w-full flex items-center justify-between border-b border-white/60 dark:border-white/10 pb-2.5 mb-2.5">
          <div className="text-left">
            <h2 className="text-[19px] sm:text-[21px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] tracking-tight leading-tight m-0">
              Voice Mode
            </h2>
            <p className="text-[11.5px] sm:text-[12px] text-[#7A748A] dark:text-[#9E98B4] font-semibold mt-0.5 m-0">
              Continuous listening & low-latency voice interaction with Aura.
            </p>
          </div>

          {/* Top Live Badge */}
          <div className="flex items-center gap-2">
            <span
              className="clay-pill flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-bold"
              style={{
                color: isDark
                  ? speaking ? "#C7B5F3" : thinking ? "#FBBF24" : listening ? "#34D399" : "#9E98B4"
                  : speaking ? "#7B59DC" : thinking ? "#D97706" : listening ? "#059669" : "#6B6B85",
                background: isDark
                  ? speaking ? "#2E2452" : thinking ? "#3D2B12" : listening ? "#133D37" : "#1A1728"
                  : speaking ? "#EDE5FB" : thinking ? "#FEF3C7" : listening ? "#ECFDF5" : "#F5ECE5",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                style={{
                  background: speaking ? "#9A80E5" : thinking ? "#F59E0B" : listening ? "#10B981" : "#94A3B8",
                }}
              />
              <span>
                {speaking
                  ? "Speaking"
                  : thinking
                  ? "Thinking"
                  : listening
                  ? "Active"
                  : "Paused"}
              </span>
            </span>
          </div>
        </div>

        {/* Hero 3D Robot Mascot (Compact proportion) */}
        <div className="my-1 relative flex items-center justify-center">
          <motion.div
            animate={{
              y: speaking ? [0, -4, 0] : thinking ? [0, -3, 0] : [0, -3.5, 0],
              scale: speaking ? [1, 1.02, 1] : 1,
            }}
            transition={{
              duration: speaking ? 3.0 : 5.0,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <AuraMascot3D size={100} />
          </motion.div>
        </div>

        {/* Animated Voice Waveform Visualizer */}
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 my-1.5 h-7">
          {waveHeights.map((h, i) => {
            const isSpeakingOrListening = speaking || listening;
            const targetHeight = speaking
              ? [6, h * 0.8, 6]
              : thinking
              ? [4, (h % 14) + 8, 4]
              : listening
              ? [4, h * 0.5, 4]
              : 4;

            return (
              <motion.div
                key={i}
                className="w-1 sm:w-1.5 rounded-full"
                style={{
                  background: speaking
                    ? "linear-gradient(to top, #9E7EE6, #C7B5F3, #6EE7B7)"
                    : listening
                    ? "linear-gradient(to top, #7B56DB, #9E7EE6, #38BDF8)"
                    : isDark ? "#3A354E" : "#D8CED6",
                  boxShadow: isSpeakingOrListening
                    ? "0 2px 6px rgba(158, 126, 230, 0.3)"
                    : "none",
                }}
                animate={{
                  height: targetHeight,
                }}
                transition={{
                  duration: speaking ? 0.45 : thinking ? 0.7 : 0.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.035,
                }}
              />
            );
          })}
        </div>

        {/* Status Pill Floating Beneath Waveform */}
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="mb-2.5"
        >
          <span
            className="clay-pill inline-flex items-center gap-2 px-3 py-1 text-[11px] font-bold shadow-sm"
            style={{
              color: isDark
                ? speaking ? "#C7B5F3" : thinking ? "#FBBF24" : listening ? "#34D399" : "#9E98B4"
                : speaking ? "#7B59DC" : thinking ? "#D97706" : listening ? "#059669" : "#6B6B85",
              background: isDark
                ? speaking ? "#2E2452" : thinking ? "#3D2B12" : listening ? "#133D37" : "#1A1728"
                : speaking ? "#F0E9FD" : thinking ? "#FEF3C7" : listening ? "#ECFDF5" : "#FAF4F0",
              border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.9)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{
                background: speaking ? "#9A80E5" : thinking ? "#F59E0B" : listening ? "#10B981" : "#94A3B8",
              }}
            />
            {speaking
              ? "Aura is Speaking..."
              : thinking
              ? "Aura is Thinking..."
              : listening
              ? "Mic Active — Listening to you..."
              : "Microphone Paused"}
          </span>
        </motion.div>

        {/* STT Critical Error Notification (e.g. Mic Permission Denied) */}
        {sttError && sttError.includes("Microphone access denied") && (
          <div className="clay-voice-subcard w-full max-w-[580px] mb-2.5 p-2.5 flex items-center gap-2.5 text-left text-[11.5px] font-semibold text-[#92400E] bg-[#FEF3C7]/60 border border-[#FDE68A]">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#D97706]" />
            <div>{sttError}</div>
          </div>
        )}

        {/* ── Conversational Status & Content Bento Card (Compact) ── */}
        <div className="clay-voice-subcard w-full max-w-[620px] p-3.5 sm:p-4 mb-3 text-left flex flex-col gap-2.5">
          {/* Section: You Said (Live STT) */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#9E98AA] dark:text-[#8E88A4] mb-1">
              <span>YOU SAID (LIVE STT)</span>
              {interimTranscript && (
                <span className="text-[#9E7EE6] font-bold lowercase flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#9E7EE6] animate-ping" />
                  transcribing...
                </span>
              )}
            </div>

            <div className="text-[12.5px] font-medium text-[#2E2544] dark:text-[#F3EFFC] leading-snug min-h-[18px]">
              {transcript || interimTranscript || (
                <span className="italic text-[#9E98AA] dark:text-[#6E6882] font-normal">
                  {listening
                    ? "Speak naturally into your microphone... your words will stream live here."
                    : "Microphone paused. Click 'Start Listening' to begin speaking."}
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-white/80 dark:bg-white/10" />

          {/* Section: Aura Response */}
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#9E7EE6] dark:text-[#B794F6] mb-1 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#9E7EE6] dark:text-[#B794F6]" />
              <span>AURA RESPONSE</span>
            </div>

            <div className="text-[12.5px] font-semibold text-[#2E2544] dark:text-[#F3EFFC] leading-snug min-h-[26px]">
              {aiResponse}
            </div>
          </div>
        </div>

        {/* ── Natural Speech Input Controls (Bottom Bento Row) ── */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mt-0.5">
          {/* Main Toggle Mic Button */}
          <motion.button
            whileHover={{ scale: 1.04, y: -1.5 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
            onClick={toggleListening}
            className={`clay-voice-mic-btn flex items-center gap-2 px-5 sm:px-6 py-2.5 text-[12.5px] sm:text-[13px] font-bold select-none cursor-pointer ${
              !listening ? "paused" : ""
            }`}
            title={listening ? "Pause Listening" : "Start Listening"}
          >
            {listening ? <Mic size={16} /> : <MicOff size={16} />}
            <span>{listening ? "Pause Listening" : "Start Listening"}</span>
          </motion.button>

          {/* Stop Speaking (TTS) Button */}
          {speaking && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 350, damping: 22 }}
              onClick={() => {
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
                setSpeaking(false);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[12px] font-bold text-[#777287] hover:text-[#2E2544] bg-white/80 hover:bg-white border border-white/90 shadow-sm cursor-pointer transition-all"
            >
              <Volume2 size={15} />
              <span>Stop Speaking</span>
            </motion.button>
          )}

          {/* Reset / New Session Button */}
          <motion.button
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
            onClick={handleResetSession}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-full text-[11.5px] sm:text-[12px] font-bold text-[#777287] hover:text-[#2E2544] bg-white/70 hover:bg-white border border-white/80 shadow-sm cursor-pointer transition-all"
            title="Reset speech buffer & restart session"
          >
            <RefreshCw size={14} />
            <span>Reset Session</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}


