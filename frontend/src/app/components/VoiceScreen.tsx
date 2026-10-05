import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  Globe,
  Settings2,
  Sparkles,
  Activity,
  Check,
  Radio,
  Sliders,
} from "lucide-react";
import { AuraOrb, AuraOrbState } from "./AuraOrb";
import { voiceService, CURATED_VOICES, VoicePersona } from "../services/voiceService";
import { speechService, SUPPORTED_LANGUAGES, SupportedLanguage } from "../services/speechRecognitionService";
import { duplexManager, ConversationState } from "../services/duplexManager";
import { liveVoiceClient } from "../services/liveVoiceSocket";
import { audioEngine } from "../services/audioEngine";
import { VoiceDiagnosticsHud } from "./VoiceDiagnosticsHud";
import { LiveAudioDebugger } from "./LiveAudioDebugger";

export function VoiceScreen() {
  const [listening, setListening] = useState(speechService.isListening);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [duplexState, setDuplexState] = useState<ConversationState>(duplexManager.getState());

  // Language & Voice Persona State
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(speechService.currentLanguage);
  const [selectedVoice, setSelectedVoice] = useState<string>(voiceService.activeVoice);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showAudioDebugger, setShowAudioDebugger] = useState(false);

  useEffect(() => {
    return duplexManager.subscribeState((st) => setDuplexState(st));
  }, []);

  // Map Duplex & Audio State directly to Aura Orb State
  const getOrbState = (): AuraOrbState => {
    if (!liveVoiceClient.isConnected()) {
      return "connecting";
    }
    if (duplexState === "INTERRUPTED" || duplexState === "POSSIBLE_INTERRUPT") {
      return "interrupted";
    }
    if (speaking || duplexState === "SPEAKING" || duplexState === "AURA_SPEAKING") {
      return "speaking";
    }
    if (thinking || duplexState === "THINKING" || duplexState === "PROCESSING") {
      return "processing";
    }
    if (duplexState === "USER_SPEAKING") {
      return "user-speaking";
    }
    if (listening || duplexState === "LISTENING") {
      return "listening";
    }
    return "ready";
  };

  // Wire live duplex socket client
  useEffect(() => {
    liveVoiceClient.setCallbacks({
      onStateChange: (st) => {
        if (st === "LISTENING" || st === "USER_SPEAKING") {
          setListening(true);
          setThinking(false);
          setSpeaking(false);
        } else if (st === "THINKING") {
          setThinking(true);
          setSpeaking(false);
        } else if (st === "SPEAKING") {
          setListening(true);
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
      onPartialTranscript: (text) => setInterimTranscript(text),
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
      },
    });

    audioEngine.initMicrophonePipeline().catch(() => {});
    liveVoiceClient.connect();
    liveVoiceClient.setClientTranscription(speechService.isSupported);

    const unSpeech = speechService.subscribe({
      onInterim: (interim) => {
        const clean = interim.trim();
        if (clean) setInterimTranscript(clean);
      },
      onFinal: (final) => {
        const clean = final.trim();
        if (clean) {
          setTranscript(clean);
          setInterimTranscript("");
          if (liveVoiceClient.isConnected()) {
            liveVoiceClient.sendClientTranscript(clean, 0.96);
          }
        }
      },
      onListeningChange: (isList) => setListening(isList),
    });

    return () => {
      unSpeech();
      liveVoiceClient.disconnect();
    };
  }, []);

  const toggleMic = async () => {
    if (listening) {
      speechService.stop();
      audioEngine.pause();
      setListening(false);
    } else {
      await audioEngine.initMicrophonePipeline();
      speechService.start();
      setListening(true);
    }
  };

  const handleEndCall = () => {
    speechService.stop();
    audioEngine.pause();
    voiceService.stop();
    setSpeaking(false);
    setThinking(false);
    setListening(false);
    setTranscript("");
    setAiResponse("");
  };

  const handleSelectLanguage = (langCode: SupportedLanguage) => {
    setCurrentLang(langCode);
    speechService.setLanguage(langCode);
    setShowLangMenu(false);
  };

  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    voiceService.setVoice(voiceId);
    setShowVoiceMenu(false);
  };

  const orbState = getOrbState();

  const getStatusText = () => {
    switch (orbState) {
      case "connecting":
        return "Establishing secure neural voice stream...";
      case "listening":
        return "Listening attentively · Speak freely";
      case "user-speaking":
        return "Hearing you...";
      case "processing":
        return "Aura is reflecting...";
      case "speaking":
        return "Aura speaking · Tap or speak to interrupt";
      case "interrupted":
        return "Interrupted · Ready for your words";
      default:
        return "Ready · Speak anytime";
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-84px)] flex flex-col justify-between items-center px-4 py-4 select-none overflow-hidden">
      {/* ── Top Bar: Mode Header & Options ── */}
      <div className="w-full max-w-4xl flex items-center justify-between z-20">
        <div className="flex items-center gap-2.5">
          <div className="liquid-pill px-3.5 py-1.5 gap-2 text-xs font-semibold text-violet-300">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <span>Full-Duplex Voice</span>
          </div>
        </div>

        {/* Action Controls: Language, Persona, HUD */}
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowLangMenu(!showLangMenu);
                setShowVoiceMenu(false);
              }}
              className="liquid-button px-3 py-1.5 text-xs text-slate-300 gap-1.5"
              title="Select Language"
            >
              <Globe size={14} />
              <span>{SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.name.split(" ")[0]}</span>
            </button>

            <AnimatePresence>
              {showLangMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute right-0 top-full mt-2 w-48 liquid-glass-elevated rounded-2xl p-1.5 z-50 shadow-2xl"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleSelectLanguage(l.code)}
                      className={`w-full px-3 py-2 text-left text-xs font-semibold rounded-xl flex items-center justify-between cursor-pointer border-none bg-transparent hover:bg-white/10 ${
                        currentLang === l.code ? "text-violet-400 font-bold" : "text-slate-300"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{l.flag}</span>
                        <span>{l.name}</span>
                      </span>
                      {currentLang === l.code && <Check size={14} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Voice Persona Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowVoiceMenu(!showVoiceMenu);
                setShowLangMenu(false);
              }}
              className="liquid-button px-3 py-1.5 text-xs text-slate-300 gap-1.5"
              title="Select Voice Persona"
            >
              <Volume2 size={14} />
              <span>{CURATED_VOICES.find((v) => v.id === selectedVoice)?.name.split(" ")[0] || "Voice"}</span>
            </button>

            <AnimatePresence>
              {showVoiceMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute right-0 top-full mt-2 w-56 liquid-glass-elevated rounded-2xl p-1.5 z-50 shadow-2xl"
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Neural Voice Persona
                  </div>
                  {CURATED_VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVoice(v.id)}
                      className={`w-full px-3 py-2 text-left text-xs rounded-xl flex items-center justify-between cursor-pointer border-none bg-transparent hover:bg-white/10 ${
                        selectedVoice === v.id ? "text-violet-400 font-bold" : "text-slate-300"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>{v.name}</span>
                        <span className="text-[10px] text-slate-400">{v.gender} • {v.accent}</span>
                      </div>
                      {selectedVoice === v.id && <Check size={14} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Telemetry Toggle */}
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className={`liquid-button w-8 h-8 rounded-full ${
              showDiagnostics ? "text-violet-400 bg-violet-500/20" : "text-slate-400"
            }`}
            title="Toggle Live Telemetry HUD"
          >
            <Activity size={15} />
          </button>
        </div>
      </div>

      {/* ── Center Hero: Living Aura Orb & Conversation State ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-auto z-10">
        <AuraOrb state={orbState} size={320} />

        {/* State Indicator Pill */}
        <motion.div
          key={orbState}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-pill px-4 py-1.5 mt-6 text-[13px] font-semibold text-slate-200 border border-white/10"
        >
          {getStatusText()}
        </motion.div>

        {/* Live Transcript / Dialogue Projection */}
        <div className="mt-5 max-w-lg w-full text-center px-4 min-h-[64px] flex flex-col justify-center">
          {interimTranscript && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm font-medium text-cyan-300 italic m-0"
            >
              “{interimTranscript}”
            </motion.p>
          )}

          {!interimTranscript && transcript && (
            <p className="text-sm font-medium text-slate-300 m-0">
              “{transcript}”
            </p>
          )}

          {aiResponse && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm font-medium text-violet-200 mt-2 m-0 line-clamp-3 leading-relaxed"
            >
              {aiResponse}
            </motion.p>
          )}
        </div>
      </div>

      {/* ── Bottom Floating Controls: Circular Liquid Glass Controls ── */}
      <div className="liquid-glass-elevated rounded-[30px] px-6 py-3 flex items-center gap-5 z-20 shadow-2xl mb-2">
        {/* Mic Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={toggleMic}
          className={`w-13 h-13 rounded-full liquid-button flex items-center justify-center cursor-pointer transition-colors ${
            listening
              ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
          }`}
          title={listening ? "Mute Microphone" : "Unmute Microphone"}
          style={{ width: 50, height: 50 }}
        >
          {listening ? <Mic size={20} /> : <MicOff size={20} />}
        </motion.button>

        {/* End / Reset Session Button */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={handleEndCall}
          className="w-13 h-13 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer border border-rose-400/40 shadow-lg shadow-rose-900/40 transition-all"
          title="End Conversation"
          style={{ width: 50, height: 50 }}
        >
          <PhoneOff size={20} />
        </motion.button>
      </div>

      {/* Optional Diagnostics Telemetry Inspector */}
      <AnimatePresence>
        {showDiagnostics && (
          <VoiceDiagnosticsHud onClose={() => setShowDiagnostics(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
