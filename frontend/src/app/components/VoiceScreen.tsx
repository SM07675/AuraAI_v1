import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Volume2, Sparkles, RefreshCw, AlertCircle, Settings2, Play, Check, Globe, Activity } from "lucide-react";
import { AuraOrb, AuraOrbState } from "./AuraOrb";
import { useTheme } from "../context/ThemeContext";
import { voiceService, CURATED_VOICES, VoicePersona } from "../services/voiceService";
import { speechService, SUPPORTED_LANGUAGES, SupportedLanguage } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
import { streamingTtsService } from "../services/streamingTtsService";
import { duplexManager, ConversationState } from "../services/duplexManager";
import { VoiceDiagnosticsHud } from "./VoiceDiagnosticsHud";
import { LiveAudioDebugger } from "./LiveAudioDebugger";
import { liveVoiceClient } from "../services/liveVoiceSocket";
import { audioEngine } from "../services/audioEngine";

export function VoiceScreen() {
  const { isDark } = useTheme();
  const [listening, setListening] = useState(speechService.isListening);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [showDuplexHud, setShowDuplexHud] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const [duplexState, setDuplexState] = useState<ConversationState>(duplexManager.getState());

  useEffect(() => {
    return duplexManager.subscribeState((st) => setDuplexState(st));
  }, []);
  
  // Language & Voice State
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(speechService.currentLanguage);
  const [selectedVoice, setSelectedVoice] = useState<string>(voiceService.activeVoice);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const isHindi = currentLang === "hi-IN";
  const defaultInitialGreeting = isHindi
    ? "नमस्ते! मैं ऑरा हूँ, आपकी AI कल्याण साथी। मैं सुन रही हूँ—कृपया बताइए आज आप कैसा महसूस कर रहे हैं?"
    : "Hello! I'm Aura, your emotion-aware companion. I'm listening with my natural neural voice—go ahead and talk to me.";
    
  const [sttError, setSttError] = useState<string | null>(null);

  // ── Establish Authoritative Real-Time Full-Duplex Voice Connection ───────────
  useEffect(() => {
    liveVoiceClient.setCallbacks({
      onStateChange: (st) => {
        if (st === "LISTENING") {
          setListening(true);
          setThinking(false);
          setSpeaking(false);
        } else if (st === "USER_SPEAKING") {
          setListening(true);
          setThinking(false);
          setSpeaking(false);
        } else if (st === "THINKING") {
          setThinking(true);
          setSpeaking(false);
        } else if (st === "SPEAKING") {
          setListening(true); // Full duplex: mic stays active while Aura speaks
          setThinking(false);
          setSpeaking(true);
        } else if (st === "INTERRUPTED") {
          setSpeaking(false);
          setThinking(false);
          setListening(true);
        }
      },
      onTurnStarted: () => {
        setAiResponse("");
        setInterimTranscript("");
      },
      onPartialTranscript: (text) => {
        setInterimTranscript(text);
      },
      onFinalTranscript: (text) => {
        setTranscript(text);
        setInterimTranscript("");
      },
      onPartialResponseToken: (token) => {
        setThinking(false);
        setAiResponse((prev) => prev + token);
      },
      onFullResponse: (text) => {
        setThinking(false);
        setAiResponse(text);
      },
      onSpeaking: () => {
        setSpeaking(true);
        setThinking(false);
      },
      onInterrupted: () => {
        setSpeaking(false);
        setThinking(false);
      },
      onTurnCompleted: () => {
        setSpeaking(false);
        setThinking(false);
        setListening(true);
      },
      onError: (err) => {
        setThinking(false);
        setSpeaking(false);
        console.warn("[VOICE SCREEN] Live voice error:", err);
      },
    });

    // Attempt microphone pipeline init on mount; if blocked by browser autoplay policy,
    // toggleListening handles it upon user click.
    audioEngine.initMicrophonePipeline().then((stream) => {
      if (stream) {
        setSttError(null);
        setListening(true);
      }
    }).catch((err) => {
      console.warn("[VOICE SCREEN] Autoplay/Mount mic init:", err);
    });

    liveVoiceClient.connect();
    liveVoiceClient.setClientTranscription(speechService.isSupported);

    // Subscribe to speechService (Web Speech API) for real-time visual transcription feedback
    const unSpeech = speechService.subscribe({
      onInterim: (interim) => {
        const clean = interim.trim();
        if (clean) {
          setInterimTranscript(clean);
        }
      },
      onFinal: (final) => {
        const clean = final.trim();
        if (clean) {
          setTranscript(clean);
          setInterimTranscript("");
          // Forward via fast client_transcript if live voice is connected,
          // providing sub-100ms instant response without CPU Whisper latency
          if (liveVoiceClient.isConnected()) {
            liveVoiceClient.sendClientTranscript(clean, 0.96);
          } else {
            sendToAi(clean);
          }
        }
      },
      onError: (err) => {
        liveVoiceClient.setClientTranscription(false);
        console.warn("[VOICE SCREEN] Web Speech error:", err);
      },
    });

    liveVoiceClient.setLanguage(currentLang);

    if (speechService.isSupported) {
      speechService.start();
    }

    return () => {
      unSpeech();
      speechService.stop();
      liveVoiceClient.disconnect();
      audioEngine.stopAllPlayback();
    };
  }, []);
  
  // Sync speaking state with global voice service
  useEffect(() => {
    return voiceService.subscribe((isSpk) => {
      setSpeaking(isSpk);
    });
  }, []);

  // Send message to AI backend (offline fallback)
  const sendToAi = (userSpeech: string) => {
    if (!userSpeech || userSpeech.trim().length === 0) return;
    if (voiceService.isEcho(userSpeech) || duplexManager.isTextEcho(userSpeech)) return;

    if (speaking) {
      voiceService.stop();
      setSpeaking(false);
    }
    streamingTtsService.cancel();

    setThinking(true);
    setAiResponse("");

    // Offline fallback response
    setTimeout(() => {
      setThinking(false);
      const lower = userSpeech.toLowerCase();
      let reply = isHindi
        ? "मैं समझ रही हूँ। क्या आप इसके बारे में थोड़ा और बता सकते हैं कि आप कैसा महसूस कर रहे हैं?"
        : "I hear you. Could you share a bit more about how that makes you feel?";
        
      if (lower.includes("stress") || lower.includes("तनाव") || lower.includes("pressure") || lower.includes("exam") || lower.includes("काम")) {
        reply = isHindi
          ? "यह काफी भारी लग सकता है। चलिए मिलकर एक गहरी सांस लेते हैं। इस समय सबसे ज्यादा तनाव किस बात से है?"
          : "That sounds like a lot of weight to carry. Let's take a slow breath together. What's the biggest source of pressure right now?";
      } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("नमस्ते") || lower.includes("प्रणाम") || lower.includes("hey")) {
        reply = isHindi
          ? "नमस्ते! मैं पूरी तरह से सुन रही हूँ। आज आपका दिन कैसा जा रहा है?"
          : "Hello there! I'm completely tuned in. How are you feeling today?";
      }
      setAiResponse(reply);
      speakText(reply);
    }, 800);
  };

  // ── Unified Full-Duplex Microphone & Barge-in Controls ─────────────────────
  const toggleListening = async () => {
    if (speaking) {
      liveVoiceClient.interrupt();
      audioEngine.stopAllPlayback();
      setSpeaking(false);
      return;
    }
    if (listening) {
      setListening(false);
      speechService.stop();
      liveVoiceClient.disconnect();
      audioEngine.stopAllPlayback();
    } else {
      try {
        const ctx = await audioEngine.getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        const stream = await audioEngine.initMicrophonePipeline();
        if (!stream) {
          setSttError("Microphone access was denied or not found. Please allow microphone permissions in your browser to speak with Aura.");
          return;
        }
        setSttError(null);
        setListening(true);
        liveVoiceClient.connect();
        if (speechService.isSupported) {
          speechService.start();
        }
      } catch (err: any) {
        console.error("[VOICE SCREEN] Mic start failed:", err);
        setSttError("Could not access microphone. Please check browser settings.");
      }
    }
  };

  const handleResetSession = () => {
    liveVoiceClient.interrupt();
    audioEngine.stopAllPlayback();
    setSpeaking(false);
    setThinking(false);
    setTranscript("");
    setInterimTranscript("");
    const greeting = isHindi
      ? "सत्र रीफ्रेश हो गया है। मैं सुन रही हूँ—आज आप किस विषय पर बात करना चाहते हैं?"
      : "Session refreshed. I'm listening—what would you like to talk about?";
    setAiResponse(greeting);
    liveVoiceClient.connect();
    if (speechService.isSupported) {
      speechService.start();
    }
  };

  const handleSelectLanguage = (langCode: SupportedLanguage) => {
    setCurrentLang(langCode);
    speechService.setLanguage(langCode);
    liveVoiceClient.setLanguage(langCode);
    setShowLangMenu(false);
    
    // Switch voice default for the language
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
    if (langObj) {
      setSelectedVoice(langObj.defaultVoice);
      voiceService.setVoice(langObj.defaultVoice);
      
      const newGreeting = langCode === "hi-IN"
        ? "नमस्ते! मैंने हिंदी भाषा चुन ली है। मैं सुन रही हूँ, आप बोल सकते हैं।"
        : "Language updated. I'm listening—go ahead and speak.";
      setAiResponse(newGreeting);
    }
  };

  const speakText = (textToSpeak: string, voiceId?: string) => {
    audioEngine.stopAllPlayback();
    voiceService.stop();
    setSpeaking(true);
    voiceService.speak(textToSpeak, {
      voice: voiceId || selectedVoice,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    voiceService.setVoice(voiceId);
    setShowVoiceMenu(false);
  };

  const handlePreviewVoice = (v: VoicePersona, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewingVoice(v.id);
    const sample = v.locale.startsWith("hi")
      ? `नमस्ते! मैं ${v.name.split(" ")[0]} हूँ। मेरी आवाज़ ऐसी सुनाई देती है।`
      : `Hello! I'm ${v.name.split(" ")[0]}. This is how my voice sounds.`;
    audioEngine.stopAllPlayback();
    voiceService.stop();
    voiceService.speak(sample, {
      voice: v.id,
      onEnd: () => setPreviewingVoice(null),
      onError: () => setPreviewingVoice(null),
    });
  };

  const activePersonaObj = CURATED_VOICES.find((v) => v.id === selectedVoice) || CURATED_VOICES[0];
  const activeLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang) || SUPPORTED_LANGUAGES[0];
  const orbState: AuraOrbState = speaking
    ? "speaking"
    : thinking
    ? "processing"
    : duplexState === "USER_SPEAKING"
    ? "user-speaking"
    : listening
    ? "listening"
    : "idle";

  // Waveform Bar Heights (smooth symmetrical animation pattern)
  const waveHeights = [10, 18, 28, 16, 34, 24, 14, 30, 36, 22, 12, 32, 20, 34, 26, 14, 28, 16];

  return (
    <div className="w-full max-w-[760px] mx-auto select-none h-full min-h-0 flex flex-col justify-start lg:justify-center overflow-y-auto custom-scrollbar px-2 sm:px-4 py-2 pb-24 lg:pb-3">
      {/* Main Compact Voice Mode Panel (Bento Container) */}
      <div className="clay-voice-panel p-3.5 sm:p-4 lg:p-5 flex flex-col items-center text-center max-h-full justify-between">
        {/* Header Strip */}
        <div className="w-full flex items-center justify-between border-b border-white/60 dark:border-white/10 pb-2.5 mb-2.5">
          <div className="text-left">
            <h2 className="text-[19px] sm:text-[21px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] tracking-tight leading-tight m-0">
              Voice Mode
            </h2>
            <p className="text-[11.5px] sm:text-[12px] text-[#7A748A] dark:text-[#9E98B4] font-semibold mt-0.5 m-0">
              Continuous infinite listening & neural voice synthesis with Aura.
            </p>
          </div>

          {/* Top Controls: Language & Voice Selectors */}
          <div className="flex items-center gap-2">
            {/* Duplex State & HUD Toggle Pill */}
            <button
              onClick={() => setShowDuplexHud(!showDuplexHud)}
              className={`px-2.5 py-1 rounded-full text-[10.5px] font-black tracking-wider uppercase border flex items-center gap-1.5 transition-all cursor-pointer ${
                duplexState === "SPEAKING" || duplexState === "AURA_SPEAKING"
                  ? "bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/40"
                  : duplexState === "USER_SPEAKING"
                  ? "bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40 animate-pulse"
                  : duplexState === "THINKING" || duplexState === "PROCESSING"
                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40"
                  : duplexState === "INTERRUPTED" || duplexState === "POSSIBLE_INTERRUPT" || duplexState === "USER_INTERRUPT"
                  ? "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 animate-pulse"
                  : "bg-black/5 dark:bg-white/10 text-[#7A748A] dark:text-[#9E98B4] border-transparent"
              }`}
              title="Toggle Full-Duplex Audio Telemetry HUD"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  duplexState === "SPEAKING" || duplexState === "AURA_SPEAKING"
                    ? "bg-purple-500"
                    : duplexState === "USER_SPEAKING"
                    ? "bg-sky-500"
                    : duplexState === "THINKING" || duplexState === "PROCESSING"
                    ? "bg-amber-500"
                    : duplexState === "INTERRUPTED" || duplexState === "POSSIBLE_INTERRUPT" || duplexState === "USER_INTERRUPT"
                    ? "bg-rose-500"
                    : "bg-emerald-500"
                }`}
              />
              <span>{duplexState}</span>
            </button>

            {/* Live Audio Telemetry Debugger Toggle Pill */}
            <button
              onClick={() => setShowDebugger(!showDebugger)}
              className="px-2.5 py-1 rounded-full text-[10.5px] font-black tracking-wider uppercase border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Toggle Live Audio & Pipeline Debugger"
            >
              <Activity size={11} className="text-purple-500" />
              <span>Debug</span>
            </button>

            {/* Language Switcher Pill */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowLangMenu(!showLangMenu);
                  setShowVoiceMenu(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-white/90 dark:border-white/10 shadow-sm hover:shadow text-[#2E2544] dark:text-[#FFFFFF] text-[11px] font-bold cursor-pointer transition-all"
                title="Switch Speech Recognition & Voice Language"
              >
                <span>{activeLangObj.flag}</span>
                <span className="text-[#7B59DC] font-extrabold">{activeLangObj.nativeName}</span>
                <Globe size={11} className="text-[#7A748A]" />
              </button>

              {/* Language Dropdown Menu */}
              <AnimatePresence>
                {showLangMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    className="absolute right-0 top-9 z-50 w-52 p-2 rounded-2xl bg-white/95 dark:bg-[#1E192D]/95 border border-white/80 dark:border-white/10 backdrop-blur-xl shadow-2xl text-left"
                  >
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#9E98AA] px-2 py-1 mb-1">
                      Choose Language
                    </div>
                    <div className="flex flex-col gap-1">
                      {SUPPORTED_LANGUAGES.map((lang) => {
                        const isCurrent = lang.code === currentLang;
                        return (
                          <button
                            key={lang.code}
                            onClick={() => handleSelectLanguage(lang.code)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isCurrent
                                ? "bg-purple-100 dark:bg-purple-900/50 text-[#7B59DC] dark:text-purple-200"
                                : "hover:bg-slate-100 dark:hover:bg-white/10 text-[#2E2544] dark:text-[#F3EFFC]"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span>{lang.flag}</span>
                              <span>{lang.nativeName}</span>
                              <span className="text-[10px] text-[#9E98AA] font-normal">({lang.name})</span>
                            </span>
                            {isCurrent && <Check size={13} className="text-[#7B59DC]" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice Persona Selector */}
            <button
              onClick={() => {
                setShowVoiceMenu(!showVoiceMenu);
                setShowLangMenu(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-white/90 dark:border-white/10 shadow-sm hover:shadow text-[#2E2544] dark:text-[#FFFFFF] text-[11px] font-bold cursor-pointer transition-all"
            >
              <Sparkles size={13} className="text-[#7B59DC]" />
              <span>Voice: <strong className="text-[#7B59DC]">{activePersonaObj.name.split(" ")[0]}</strong></span>
              <Settings2 size={12} className="text-[#7A748A]" />
            </button>

            {/* Live Indicator Pill */}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[260px] overflow-y-auto pr-1">
                {CURATED_VOICES.filter((v) => v.locale === currentLang).map((v) => {
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

        <div className="my-1 relative flex items-center justify-center">
          <AuraOrb state={orbState} size={240} />
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
              ? `Mic Active (${activeLangObj.nativeName}) — Listening continuously...`
              : "Microphone Paused"}
          </span>
        </motion.div>

        {/* STT Critical Error Notification (e.g. Mic Permission Denied) */}
        {sttError && (
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
              <span>{isHindi ? "आपकी आवाज़ (लाइव सुनना)" : "YOU SAID (LIVE STT)"}</span>
              {interimTranscript && (
                <span className="text-[#9E7EE6] font-bold lowercase flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#9E7EE6] animate-ping" />
                  {isHindi ? "सुन रहे हैं..." : "transcribing..."}
                </span>
              )}
            </div>

            <div className="text-[12.5px] font-medium text-[#2E2544] dark:text-[#F3EFFC] leading-snug min-h-[18px]">
              {transcript || interimTranscript || (
                <span className="italic text-[#9E98AA] dark:text-[#6E6882] font-normal">
                  {listening
                    ? isHindi
                      ? "माइक में स्वाभाविक रूप से बोलें... आपके शब्द यहाँ लाइव ट्रांसक्राइब होंगे।"
                      : "Speak naturally into your microphone... your words will stream live here."
                    : isHindi
                    ? "माइक्रोफ़ोन रुका हुआ है। बोलने के लिए 'सुनना शुरू करें' पर क्लिक करें।"
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
                <span>{isHindi ? "ऑरा का उत्तर" : "AURA RESPONSE"}</span>
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
            <span>
              {listening 
                ? isHindi ? "सुनना रोकें" : "Pause Listening" 
                : isHindi ? "सुनना शुरू करें" : "Start Listening"}
            </span>
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
              <span>{isHindi ? "बोलना रोकें" : "Stop Speaking"}</span>
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
            <span>{isHindi ? "सत्र रीसेट करें" : "Reset Session"}</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showDuplexHud && <VoiceDiagnosticsHud onClose={() => setShowDuplexHud(false)} />}
        {showDebugger && <LiveAudioDebugger onClose={() => setShowDebugger(false)} />}
      </AnimatePresence>
    </div>
  );
}
