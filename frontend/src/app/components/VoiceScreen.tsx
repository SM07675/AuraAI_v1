import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, Sparkles, RefreshCw, AlertCircle, Settings2, Play, Check } from "lucide-react";
import { AuraMascot3D } from "./aura-robot";
import { useTheme } from "../context/ThemeContext";
import { voiceService, CURATED_VOICES, VoicePersona } from "../services/voiceService";

export function VoiceScreen() {
  const { isDark } = useTheme();
  const [listening, setListening] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("Hello! I'm Aura, your emotion-aware companion. I'm listening with my new natural neural voice—go ahead and talk to me.");
  const [sttSupported, setSttSupported] = useState(true);
  const [sttError, setSttError] = useState<string | null>(null);

  // Selected Voice Persona & Voice Menu Drawer
  const [selectedVoice, setSelectedVoice] = useState<string>(voiceService.activeVoice);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  // Audio & STT references
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(listening);
  isListeningRef.current = listening;

  const isSpeakingRef = useRef(speaking);
  isSpeakingRef.current = speaking;

  const ws = useRef<WebSocket | null>(null);

  // Speak with neural TTS
  const speakText = (textToSpeak: string) => {
    setSpeaking(true);
    voiceService.speak(textToSpeak, {
      voice: selectedVoice,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };
  
  // Sync speaking state with global voice service
  useEffect(() => {
    return voiceService.subscribe((isSpk) => {
      setSpeaking(isSpk);
      isSpeakingRef.current = isSpk;
    });
  }, []);

  // ── Establish WebSocket connection ───────────────────────────────────────────
  useEffect(() => {
    let socket: WebSocket;
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
      voiceService.stop();
    };
  }, []);

  // Send message to AI backend
  const sendToAi = (userSpeech: string) => {
    if (!userSpeech || userSpeech.trim().length === 0) return;
    if (voiceService.isEcho(userSpeech)) return;

    setThinking(true);
    setAiResponse("");

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "message", content: userSpeech, mode: "voice" }));
    } else {
      // Offline fallback
      setTimeout(() => {
        setThinking(false);
        const lower = userSpeech.toLowerCase();
        let reply = "I hear you. Could you share a bit more about how that makes you feel?";
        if (lower.includes("stress") || lower.includes("pressure") || lower.includes("exam") || lower.includes("work")) {
          reply = "That sounds like a lot of weight to carry. Let's take a slow breath together. What's the biggest source of pressure right now?";
        } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
          reply = "Hello there! I'm completely tuned in. How are you feeling today?";
        }
        setAiResponse(reply);
        speakText(reply);
      }, 1000);
    }
  };

  // ── Speech Recognition (STT) ────────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSttSupported(false);
      setSttError("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    let recognition: any = null;
    let isComponentMounted = true;

    try {
      recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setSttError(null);
      };

      recognition.onresult = (event: any) => {
        // Hard-block when Aura is speaking to eliminate acoustic echo loop
        if (voiceService.isSpeaking() || isSpeakingRef.current) {
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
          setInterimTranscript(interim);
        }

        if (final) {
          const finalClean = final.trim();
          if (!finalClean || voiceService.isEcho(finalClean) || finalClean.length < 2) return;
          setTranscript(finalClean);
          setInterimTranscript("");
          sendToAi(finalClean);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech") return;
        if (event.error === "not-allowed") {
          setSttError("Microphone access denied. Please allow microphone permissions.");
        } else {
          console.warn("SpeechRecognition error:", event.error);
        }
      };

      recognition.onend = () => {
        if (isComponentMounted && isListeningRef.current) {
          try {
            if (!voiceService.isSpeaking()) {
              recognition.start();
            } else {
              const checkInterval = setInterval(() => {
                if (!voiceService.isSpeaking() && isComponentMounted && isListeningRef.current) {
                  clearInterval(checkInterval);
                  try { recognition.start(); } catch (e) {}
                }
              }, 400);
            }
          } catch (e) {}
        }
      };

      if (listening && !voiceService.isSpeaking()) {
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
      voiceService.stop();
      setSpeaking(false);
    }
    setListening(!listening);
  };

  const handleResetSession = () => {
    voiceService.stop();
    setSpeaking(false);
    setThinking(false);
    setTranscript("");
    setInterimTranscript("");
    const greeting = "Session refreshed. I'm listening—what would you like to talk about?";
    setAiResponse(greeting);
    speakText(greeting);
  };

  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    voiceService.setVoice(voiceId);
  };

  const handlePreviewVoice = (v: VoicePersona, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewingVoice(v.id);
    voiceService.speak(`Hello! I'm ${v.name.split(" ")[0]}. This is how my voice sounds.`, {
      voice: v.id,
      onEnd: () => setPreviewingVoice(null),
      onError: () => setPreviewingVoice(null),
    });
  };

  // Speak greeting on mount
  useEffect(() => {
    speakText("Hello! I'm Aura, your emotion-aware companion. I'm listening with my natural neural voice—go ahead and talk to me.");
    return () => {
      voiceService.stop();
    };
  }, []);

  const activePersonaObj = CURATED_VOICES.find((v) => v.id === selectedVoice) || CURATED_VOICES[0];

  // Waveform Bar Heights (smooth symmetrical animation pattern)
  const waveHeights = [10, 18, 28, 16, 34, 24, 14, 30, 36, 22, 12, 32, 20, 34, 26, 14, 28, 16];

  return (
    <div className="w-full max-w-[760px] mx-auto select-none h-[calc(100vh-84px)] flex flex-col justify-center overflow-hidden px-2 sm:px-4">
      {/* Main Compact Voice Mode Panel (Bento Container) */}
      <div className="clay-voice-panel p-3.5 sm:p-4 lg:p-5 flex flex-col items-center text-center max-h-full justify-between">
        {/* Header Strip */}
        <div className="w-full flex items-center justify-between border-b border-white/60 dark:border-white/10 pb-2.5 mb-2.5">
          <div className="text-left">
            <h2 className="text-[19px] sm:text-[21px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] tracking-tight leading-tight m-0">
              Voice Mode
            </h2>
            <p className="text-[11.5px] sm:text-[12px] text-[#7A748A] dark:text-[#9E98B4] font-semibold mt-0.5 m-0">
              Continuous listening & neural voice synthesis with Aura.
            </p>
          </div>

          {/* Top Voice Selector & Live Badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVoiceMenu(!showVoiceMenu)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-white/90 dark:border-white/10 shadow-sm hover:shadow text-[#2E2544] dark:text-[#FFFFFF] text-[11px] font-bold cursor-pointer transition-all"
            >
              <Sparkles size={13} className="text-[#7B59DC]" />
              <span>Voice: <strong className="text-[#7B59DC]">{activePersonaObj.name.split(" ")[0]}</strong></span>
              <Settings2 size={12} className="text-[#7A748A]" />
            </button>

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

        {/* Voice Selection Modal / Drawer */}
        <AnimatePresence>
          {showVoiceMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="w-full mb-4 p-3.5 rounded-3xl bg-white/90 dark:bg-[#1E192D]/95 border border-white/80 dark:border-white/10 backdrop-blur-xl shadow-xl text-left"
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#7B59DC]" />
                  <span className="font-extrabold text-[#2E2544] dark:text-[#FFFFFF] text-xs">Choose Neural Voice Persona</span>
                </div>
                <button
                  onClick={() => setShowVoiceMenu(false)}
                  className="text-xs font-bold text-[#7A748A] hover:text-[#2E2544] dark:hover:text-[#FFFFFF] px-2 py-0.5 rounded cursor-pointer"
                >
                  Done ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {CURATED_VOICES.map((v) => {
                  const isSelected = v.id === selectedVoice;
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleSelectVoice(v.id)}
                      className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "bg-purple-50 dark:bg-purple-950/40 border-purple-400 shadow-sm"
                          : "bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold text-[#2E2544] dark:text-[#FFFFFF]">{v.name}</span>
                          {isSelected && <Check size={14} className="text-[#7B59DC]" />}
                        </div>
                        <p className="text-[11px] text-[#7A748A] dark:text-[#A19BB5] leading-tight mb-1.5">{v.persona}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/10">
                        <span className="text-[10px] font-semibold text-[#9E98AA] uppercase tracking-wider">{v.accent} · {v.gender}</span>
                        <button
                          onClick={(e) => handlePreviewVoice(v, e)}
                          className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 hover:bg-purple-200 text-[#7B59DC] dark:text-purple-200 text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Play size={9} />
                          <span>{previewingVoice === v.id ? "Playing..." : "Preview"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              ? `Aura is Speaking (${activePersonaObj.name.split(" ")[0]} Neural)...`
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
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#9E7EE6] dark:text-[#B794F6] mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-[#9E7EE6] dark:text-[#B794F6]" />
                <span>AURA RESPONSE</span>
              </div>
              <span className="text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">24kHz Neural HD</span>
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
                voiceService.stop();
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
