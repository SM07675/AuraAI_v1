import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Send, Sparkles, CheckCheck, RefreshCw, AlertCircle } from "lucide-react";
import { voiceService } from "../services/voiceService";
import { speechService } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
import { SolutionCard } from "./SolutionCard";
import { AuraBrandLogo } from "./AuraBrandLogo";

type Msg = {
  id: string;
  from: "user" | "aura";
  text: string;
  time?: string;
  solution?: any;
};

interface ChatScreenProps {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

export function ChatScreen({ initialQuery, onClearInitialQuery }: ChatScreenProps = {}) {
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Hello. I'm Aura, your AI wellbeing companion. How are you feeling today?",
      time: getCurrentTime(),
    },
  ]);

  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "offline">("connecting");

  const endRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);

  // Consume incoming query from search or mood check-in
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setText(initialQuery);
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialQuery]);

  // WebSocket Connection & Stream Lifecycle
  useEffect(() => {
    let socket: WebSocket | null = null;
    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (isUnmounted) return;
      setConnectionStatus("connecting");
      const wsUrl = getWebSocketUrl("/api/v1/ws/chat");

      try {
        socket = new WebSocket(wsUrl);
        ws.current = socket;

        socket.onopen = () => {
          if (!isUnmounted) setConnectionStatus("connected");
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "ping") {
              socket?.send(JSON.stringify({ type: "pong" }));
              return;
            }
            if (data.type === "interrupted") {
              setTyping(false);
              return;
            }
            if (data.type === "session_start" || data.type === "emotion" || data.type === "debug") {
              return;
            }
            if (data.type === "start") {
              setTyping(true);
              setMsgs((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.from === "aura" && !last.text) return prev;
                return [...prev, { id: "aura-" + Date.now(), from: "aura", text: "", time: getCurrentTime() }];
              });
            } else if (data.type === "chunk") {
              setTyping(false);
              const chunk = data.content || "";
              if (!chunk) return;
              setMsgs((prev) => {
                if (prev.length === 0) {
                  return [{ id: "aura-" + Date.now(), from: "aura", text: chunk, time: getCurrentTime() }];
                }
                const lastIdx = prev.length - 1;
                const lastMsg = prev[lastIdx];
                if (lastMsg && lastMsg.from === "aura") {
                  return [...prev.slice(0, lastIdx), { ...lastMsg, text: lastMsg.text + chunk }];
                }
                return [...prev, { id: "aura-" + Date.now(), from: "aura", text: chunk, time: getCurrentTime() }];
              });
            } else if (data.type === "solution_card") {
              const solData = data.solution || data.data;
              if (solData) {
                setMsgs((prev) => {
                  if (prev.length === 0) {
                    return [{ id: "aura-sol-" + Date.now(), from: "aura", text: "", solution: solData, time: getCurrentTime() }];
                  }
                  const lastIdx = prev.length - 1;
                  const lastMsg = prev[lastIdx];
                  if (lastMsg && lastMsg.from === "aura") {
                    return [...prev.slice(0, lastIdx), { ...lastMsg, solution: solData }];
                  }
                  return [...prev, { id: "aura-sol-" + Date.now(), from: "aura", text: "", solution: solData, time: getCurrentTime() }];
                });
              }
            } else if (data.type === "done" || data.type === "message") {
              setTyping(false);
              const reply = data.response || data.content || "";
              setMsgs((prev) => {
                if (prev.length === 0) {
                  if (reply) {
                    voiceService.speak(reply);
                    return [{ id: "aura-" + Date.now(), from: "aura", text: reply, time: getCurrentTime() }];
                  }
                  return prev;
                }
                const lastIdx = prev.length - 1;
                const lastMsg = prev[lastIdx];
                const finalText = reply || (lastMsg && lastMsg.from === "aura" ? lastMsg.text : "");
                if (finalText) {
                  voiceService.speak(finalText);
                }
                if (lastMsg && lastMsg.from === "aura") {
                  return [...prev.slice(0, lastIdx), { ...lastMsg, text: finalText || lastMsg.text }];
                } else if (reply) {
                  return [...prev, { id: "aura-" + Date.now(), from: "aura", text: reply, time: getCurrentTime() }];
                }
                return prev;
              });
            } else if (data.type === "error") {
              setTyping(false);
              const errTxt =
                data.error === "Server error" || data.error === "Connection error"
                  ? "I'm right here with you. Take your time, what's on your mind today?"
                  : data.error || data.message || "I'm here with you, tell me more.";
              setMsgs((m) => [...m, { id: "error-" + Date.now(), from: "aura", text: errTxt, time: getCurrentTime() }]);
            }
          } catch (e) {}
        };

        socket.onclose = () => {
          if (!isUnmounted) {
            setConnectionStatus("offline");
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        if (!isUnmounted) {
          setConnectionStatus("offline");
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      socket?.close();
      voiceService.stop();
    };
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  // Speech Recognition subscription
  useEffect(() => {
    const unsubscribe = speechService.subscribe({
      onInterim: (interim) => setText(interim),
      onFinal: (final) => setText(final),
      onListeningChange: (isList) => setListening(isList),
    });

    return () => {
      unsubscribe();
      if (speechService.isListening) speechService.stop();
    };
  }, []);

  const toggleVoiceInput = () => {
    if (listening) speechService.stop();
    else speechService.start();
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;

    const id = "user-" + Date.now();
    const currentTime = getCurrentTime();
    setMsgs((m) => [...m, { id, from: "user", text: t, time: currentTime }]);
    setText("");
    setTyping(true);

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "message", content: t, mode: "chat" }));
    } else {
      // Local graceful fallback if backend socket is reconnecting
      setTimeout(() => {
        setTyping(false);
        const lower = t.toLowerCase();
        let reply = "I'm right here with you and listening. What's on your mind today?";
        if (lower.includes("stress") || lower.includes("pressure") || lower.includes("work")) {
          reply = "I understand that can feel really overwhelming. Take a gentle breath. What part of it feels heaviest right now?";
        } else if (lower.includes("sad") || lower.includes("lonely") || lower.includes("alone")) {
          reply = "I hear you, and it is completely okay to feel this way. You don't have to carry it all by yourself.";
        } else if (lower.includes("anxious") || lower.includes("worry") || lower.includes("panic")) {
          reply = "Let's pause together for a moment. Inhale gently for 4 counts, hold for 4, and release. You are safe here.";
        }
        setMsgs((m) => [...m, { id: "aura-" + Date.now(), from: "aura", text: reply, time: getCurrentTime() }]);
      }, 900);
    }
  };

  return (
    <div className="w-full max-w-[1040px] mx-auto flex flex-col justify-between select-none h-[calc(100vh-84px)] overflow-hidden pb-2 px-2 sm:px-4">
      {/* ── Main Chat Panel (Liquid Glass Surface) ── */}
      <div className="liquid-glass-elevated rounded-[30px] flex flex-col justify-between flex-1 min-h-0 p-4 sm:p-6 overflow-hidden">
        {/* Header: Minimal Aura Identity Mark */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <AuraBrandLogo size={32} showWordmark={true} subtitle="Empathetic Text Conversation" />
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`liquid-pill px-2.5 py-1 text-[11px] font-semibold gap-1.5 ${
                connectionStatus === "connected"
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : "text-amber-400 bg-amber-500/10 border-amber-500/20"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              <span>{connectionStatus === "connected" ? "Live Session" : "Connecting"}</span>
            </span>
          </div>
        </div>

        {/* Message Thread Canvas */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1.5 min-h-0 my-1">
          {msgs.map((m) => {
            if (m.from === "aura" && !m.text && !m.solution) return null;

            if (m.from === "user") {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className="flex flex-col items-end self-end max-w-[85%] sm:max-w-[70%]"
                >
                  <div className="liquid-bubble-user px-5 py-3.5 sm:px-6 sm:py-3.5">
                    <span className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">
                      {m.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 mr-2 text-[11px] font-medium text-slate-400">
                    <span>{m.time}</span>
                    <CheckCheck size={14} className="text-violet-400" />
                  </div>
                </motion.div>
              );
            }

            // Aura Assistant Message
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="flex items-start gap-3 max-w-[88%] sm:max-w-[75%]"
              >
                <div className="mt-1 shrink-0">
                  <AuraBrandLogo size={28} showWordmark={false} />
                </div>

                <div className="flex flex-col items-start min-w-0">
                  <div className="liquid-bubble-aura px-5 py-3.5 sm:px-6 sm:py-3.5 text-slate-800 dark:text-slate-100">
                    {m.text && (
                      <span className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">
                        {m.text}
                      </span>
                    )}

                    {m.solution && (
                      <div className="w-full mt-3">
                        <SolutionCard solution={m.solution} />
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 mt-1 ml-2">
                    {m.time}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Typing Indicator */}
          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3"
            >
              <div className="mt-1 shrink-0">
                <AuraBrandLogo size={28} showWordmark={false} />
              </div>
              <div className="liquid-bubble-aura px-5 py-3.5 flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-400"
                    animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16 }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={endRef} />
        </div>

        {/* ── Bottom Composer: Floating Liquid Glass Input ── */}
        <div className="flex items-center gap-3 mt-3 pt-2">
          <div className="liquid-input flex-1 flex items-center px-5 py-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={listening ? "Listening to your voice..." : "Share what is on your mind..."}
              className="bg-transparent border-none outline-none w-full text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 font-medium"
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleVoiceInput}
            className={`liquid-button w-11 h-11 sm:w-12 sm:h-12 shrink-0 ${
              listening ? "text-rose-400 border-rose-500/40 bg-rose-500/15" : "text-violet-400"
            }`}
            title={listening ? "Pause voice input" : "Voice input"}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={send}
            disabled={!text.trim()}
            className="liquid-button-primary w-11 h-11 sm:w-12 sm:h-12 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
