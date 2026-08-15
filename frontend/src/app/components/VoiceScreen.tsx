import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Mic, MicOff, Volume2, Sparkles, RefreshCw, Zap, Send, AlertCircle } from "lucide-react";
import { GlassCard } from "./glass-card";
import { AuraRobot } from "./aura-robot";

export function VoiceScreen() {
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

  // ── 2. WebSocket Connection Setup ────────────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/chat`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("VoiceScreen WebSocket connected");
    };

    ws.current.onmessage = (event) => {
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
          setAiResponse("I ran into an issue connecting to my brain. Please try speaking again.");
        }
      } catch (e) {
        console.error("WS message parse error:", e);
      }
    };

    ws.current.onclose = () => {
      console.log("VoiceScreen WebSocket disconnected");
    };

    return () => {
      ws.current?.close();
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
      ws.current.send(JSON.stringify({ type: "message", content: userSpeech }));
    } else {
      // Fallback response if offline
      setTimeout(() => {
        setThinking(false);
        const reply = `I heard you say: "${userSpeech}". I am here to support you whenever you need to talk.`;
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
        console.warn("SpeechRecognition error:", event.error);
        if (event.error === "not-allowed") {
          setSttError("Microphone access denied. Please allow microphone permissions in your browser address bar.");
          setListening(false);
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

  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="mb-8">
        <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Voice Mode</h2>
        <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6 }}>
          Continuous listening & low-latency voice interaction. Speak naturally with Aura.
        </p>
      </div>

      <GlassCard style={{ padding: 40 }} className="flex flex-col items-center">
        {/* Robot Avatar */}
        <div style={{ scale: 1.25 }} className="my-6">
          <AuraRobot expression={speaking ? "talking" : thinking ? "thinking" : listening ? "happy" : "neutral"} />
        </div>

        {/* Live Audio Waveform Visualizer */}
        <div className="flex items-center gap-1.5 my-6 h-12">
          {[14, 28, 42, 22, 50, 36, 18, 40, 26, 14, 38, 20, 46, 28, 16].map((h, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full bg-gradient-to-t from-blue-600 to-cyan-400"
              animate={{ height: speaking ? [8, h * 1.1, 8] : listening ? [6, h * 0.7, 6] : 6 }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.05 }}
            />
          ))}
        </div>

        {/* Status Pill */}
        <div className="mb-6">
          <span
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm transition-all ${
              speaking
                ? "bg-purple-100 text-purple-700 border border-purple-200 animate-pulse"
                : thinking
                ? "bg-amber-100 text-amber-700 border border-amber-200 animate-pulse"
                : listening
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                speaking ? "bg-purple-500" : thinking ? "bg-amber-500" : listening ? "bg-emerald-500 animate-ping" : "bg-slate-400"
              }`}
            />
            {speaking
              ? "Aura is Speaking..."
              : thinking
              ? "Aura is Thinking..."
              : listening
              ? "Mic Active — Listening to you..."
              : "Microphone Paused"}
          </span>
        </div>

        {/* Error Warning banner if browser mic/STT issue */}
        {sttError && (
          <div className="max-w-lg mb-6 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2.5 text-left">
            <AlertCircle size={18} className="shrink-0 text-amber-600" />
            <div>{sttError}</div>
          </div>
        )}

        {/* Transcript Card */}
        <div className="w-full max-w-xl p-5 rounded-2xl bg-white/75 border border-white/80 backdrop-blur-md shadow-sm mb-8 text-left">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>You Said (Live STT)</span>
            {interimTranscript && <span className="text-blue-500 animate-pulse">Transcribing...</span>}
          </div>
          <div className="text-sm font-medium text-slate-800 leading-relaxed min-h-[28px]">
            {transcript || interimTranscript || (
              <span className="italic text-slate-400">
                {listening ? "Speak into your microphone... your words will appear here live." : "Click 'Start Listening' to speak."}
              </span>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200/60">
            <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1">Aura Response</div>
            <div className="text-sm font-semibold text-blue-950 leading-relaxed min-h-[36px]">
              {aiResponse}
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggleListening}
            className="flex items-center gap-3 rounded-full px-8 py-4 text-white font-bold text-base shadow-xl shadow-blue-500/30 cursor-pointer"
            style={{ background: listening ? "linear-gradient(135deg,#2458FF,#00C6FF)" : "#475569" }}
          >
            {listening ? <Mic size={20} /> : <MicOff size={20} />}
            <span>{listening ? "Pause Listening" : "Start Listening"}</span>
          </motion.button>

          {speaking && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
                setSpeaking(false);
              }}
              className="flex items-center gap-2 rounded-full px-5 py-3 text-slate-700 font-semibold text-sm bg-white/80 border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-100"
            >
              <Volume2 size={16} />
              <span>Stop Speaking</span>
            </motion.button>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

