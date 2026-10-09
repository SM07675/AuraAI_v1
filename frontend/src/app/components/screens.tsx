import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, MessageCircle, Activity, History as HistoryIcon, FileText, Wind, Heart, ArrowRight, Send, Plus, X, LogOut, User as UserIcon, LogIn, ShieldCheck, Video, BookOpen, Target, Leaf } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, LineChart, Line, PieChart, Pie } from "recharts";
import { AuraRobot, AuraMascot3D, AuraBlobMascot } from "./aura-robot";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";
import { speechService } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
import { SolutionCard } from "./SolutionCard";
import {
  ClayChatIcon,
  ClayVoiceWaveBarsIcon,
  ClayFaceCameraIcon,
  ClayHeartCushionIcon,
  ClayLilacBlobMascot,
  ClayMicCircleButton,
  ClayWavingHandIcon,
  ClayCalmFaceIcon,
  ClaySmileyBeadIcon,
  ClayJournalIcon,
  ClayBreathingIcon,
  ClayFocusIcon,
  ClayAuraAvatar,
  ClayDoubleCheckIcon,
} from "./clay-icons";

const QUICK_ACTIONS = [
  { label: "Talk", icon: Mic },
  { label: "Analyze Emotion", icon: Activity },
  { label: "History", icon: HistoryIcon },
  { label: "Reports", icon: FileText },
  { label: "Breathing", icon: Wind },
  { label: "Meditation", icon: Heart },
];


/* ─────────────────────────── HOME / DASHBOARD ─────────────────────────── */
import { DashboardScreen } from "./DashboardScreen";
export { DashboardScreen as HomeScreen };

/* ─────────────────────────── CHAT ─────────────────────────── */
type Msg = { id: string; from: "user" | "aura"; text: string; time?: string; showBeads?: boolean; solution?: any };

export function ChatScreen({
  initialQuery,
  onClearInitialQuery,
}: {
  initialQuery?: string;
  onClearInitialQuery?: () => void;
} = {}) {
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Hi — I am Aura. How are you feeling today?",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setText(initialQuery);
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialQuery]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (isUnmounted) return;
      const wsUrl = getWebSocketUrl("/api/v1/ws/chat");

      socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("Connected to Aura AI");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "start") {
            setMsgs((m) => [...m, { id: "aura-" + Date.now(), from: "aura", text: "", time: getCurrentTime() }]);
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
              }
              return prev;
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
                  return [
                    ...prev.slice(0, lastIdx),
                    { ...lastMsg, solution: solData },
                  ];
                }
                return [...prev, { id: "aura-sol-" + Date.now(), from: "aura", text: "", solution: solData, time: getCurrentTime() }];
              });
            }
          } else if (data.type === "done") {
            setTyping(false);
            setMsgs((prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.from === "aura" && lastMsg.text) {
                voiceService.speak(lastMsg.text);
              }
              return prev;
            });
          } else if (data.type === "error") {
            setTyping(false);
            const errTxt = data.error === "Server error" || data.error === "Connection error"
              ? "I'm right here with you and listening. Take your time, what's on your mind today?"
              : (data.error || data.message || "I'm here with you, tell me more.");
            setMsgs((m) => [...m, { id: "error-" + Date.now(), from: "aura", text: errTxt, time: getCurrentTime() }]);
          }
        } catch (e) {}
      };

      socket.onclose = () => {
        console.log("Disconnected from Aura AI");
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

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
      // Fallback local response generator if backend WS is offline
      setTimeout(() => {
        setTyping(false);
        const lower = t.toLowerCase();
        let reply = "I'm right here with you and listening. What's on your mind today?";
        if (lower.includes("stress") || lower.includes("frustrat") || lower.includes("project") || lower.includes("pressure") || lower.includes("work") || lower.includes("exam")) {
          reply = "I understand that can feel really overwhelming. Remember to take it one step at a time. What part of it feels heaviest right now?";
        } else if (lower.includes("sad") || lower.includes("lonely") || lower.includes("alone") || lower.includes("unhappy")) {
          reply = "I hear you, and it is completely okay to feel this way. You don't have to carry it all by yourself. I'm here for you.";
        } else if (lower.includes("anxious") || lower.includes("panic") || lower.includes("worry") || lower.includes("scared")) {
          reply = "Let's pause together for a moment. Inhale gently for 4 counts, hold for 4, and release. You are safe here.";
        } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
          reply = "Hello! I'm glad you reached out. How has your day been treating you?";
        }

        setMsgs((m) => [
          ...m,
          {
            id: "aura-" + Date.now(),
            from: "aura",
            text: reply,
            time: getCurrentTime(),
            showBeads: true,
          },
        ]);
      }, 1000);
    }
  };

  const [listening, setListening] = useState(false);

  useEffect(() => {
    const unsubscribe = speechService.subscribe({
      onInterim: (interim) => {
        setText(interim);
      },
      onFinal: (final) => {
        setText(final);
      },
      onListeningChange: (isList) => {
        setListening(isList);
      },
    });

    return () => {
      unsubscribe();
      if (speechService.isListening) {
        speechService.stop();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (listening) {
      speechService.stop();
    } else {
      speechService.start();
    }
  };

  return (
    <div className="w-full max-w-[1040px] mx-auto flex flex-col justify-between select-none h-[calc(100vh-84px)] overflow-hidden pb-1">
      {/* ═══ MAIN CHAT CONTAINER (Unified Large Claymorphic Panel) ═══ */}
      <div
        className="clay-chat-panel flex flex-col justify-between flex-1 min-h-0"
        style={{
          padding: "16px 20px 14px 20px",
        }}
      >
        {/* ── 1. Compact Header: 3D Aura Mascot with Floating Spheres + Title ── */}
        <div className="flex items-center gap-3.5 mb-2.5 pt-0.5 pl-0.5 shrink-0 border-b border-white/60 dark:border-white/10 pb-2">
          <div className="shrink-0 flex items-center justify-center">
            <AuraMascot3D size={65} />
          </div>
          <div>
            <h2 className="text-[19px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] m-0 leading-tight tracking-tight">
              Live Counseling Session
            </h2>
            <p className="text-[11.5px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-0.5 m-0">
              Real-time, continuous empathetic session with Aura.
            </p>
          </div>
        </div>

        {/* ── 2. Spacious Conversation Thread ── */}
        <div
          className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1 min-h-0 my-1"
        >
          {msgs.map((m) => {
            if (m.from === "aura" && !m.text) return null;

            if (m.from === "user") {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className="flex flex-col items-end self-end max-w-[85%] sm:max-w-[72%]"
                >
                  <div
                    className="clay-bubble-user px-5 py-3.5 sm:px-6 sm:py-3.5"
                    style={{ borderRadius: 24 }}
                  >
                    <span className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium text-[#FFFFFF]">
                      {m.text}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 mt-1 mr-1.5"
                    style={{ fontSize: 11, fontWeight: 500, color: "#8F87A0" }}
                  >
                    <span>{m.time || "10:31 AM"}</span>
                    <ClayDoubleCheckIcon size={14} color="#8F87A0" />
                  </div>
                </motion.div>
              );
            }

            // Assistant (Aura) Message
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="flex items-start gap-3 sm:gap-3.5 max-w-[88%] sm:max-w-[76%]"
              >
                <ClayAuraAvatar size={38} className="mt-1" />

                <div className="flex flex-col items-start min-w-0">
                  <div
                    className="clay-bubble-aura relative px-5 py-3.5 sm:px-6 sm:py-3.5"
                    style={{ borderRadius: 24 }}
                  >
                    {m.text && (
                      <span className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium text-[#2E2544] dark:text-[#F3EFFC]">
                        {m.text}
                      </span>
                    )}

                    {m.solution && (
                      <div className="w-full mt-2">
                        <SolutionCard solution={m.solution} />
                      </div>
                    )}

                    {/* 3 Pastel Reaction/Status Spheres matching target reference */}
                    {m.showBeads && (
                      <div className="absolute -bottom-1.5 -right-2 flex items-center gap-1 pointer-events-none">
                        <span
                          style={{
                            width: 7.5,
                            height: 7.5,
                            borderRadius: 99,
                            background: "linear-gradient(135deg, #D4C5F7, #9E7EE6)",
                            boxShadow: "0 1px 3px rgba(158,126,230,0.45)",
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            width: 7.5,
                            height: 7.5,
                            borderRadius: 99,
                            background: "linear-gradient(135deg, #C4EBDD, #8EE0C6)",
                            boxShadow: "0 1px 3px rgba(142,224,198,0.45)",
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            width: 7.5,
                            height: 7.5,
                            borderRadius: 99,
                            background: "linear-gradient(135deg, #FCD9CE, #F7C8BA)",
                            boxShadow: "0 1px 3px rgba(247,200,186,0.45)",
                            display: "inline-block",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#9E98AA",
                      marginTop: 4,
                      marginLeft: 4,
                    }}
                  >
                    {m.time || "10:30 AM"}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Typing indicator */}
          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 sm:gap-3.5"
            >
              <ClayAuraAvatar size={38} className="mt-1" />
              <div
                className="clay-bubble-aura px-5 py-3.5 flex items-center gap-1.5"
                style={{ borderRadius: 24 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 99,
                      background: "linear-gradient(135deg, #C7B5F3, #9E7EE6)",
                      boxShadow: "0 1px 3px rgba(158,126,230,0.35)",
                    }}
                    animate={{ y: [0, -4.5, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={endRef} />
        </div>

        {/* ── 3. Chat Input Bar: Recessed Pill + Round Mic + Lavender Send Button ── */}
        <div className="flex items-center gap-3 mt-4 sm:mt-5 pt-1">
          <div className="clay-chat-input-pill flex-1 flex items-center px-5 sm:px-6 py-3 transition-all duration-200">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={listening ? "Listening to your voice..." : "Tell Aura how you feel..."}
              className="bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none w-full text-[14.5px] text-[#2E2544] dark:text-[#FFFFFF] placeholder-[#7A748A] dark:placeholder-[#8E87A4] font-medium"
              style={{ letterSpacing: "-0.1px" }}
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggleVoiceInput}
            className={`clay-btn-mic w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0 ${
              listening ? "listening" : ""
            }`}
            title={listening ? "Pause Voice Input" : "Start Voice Input"}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            onClick={send}
            className="clay-btn-send w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0"
            title="Send Message"
          >
            <Send size={17} color="#FFFFFF" className="translate-x-[-1px] translate-y-[0.5px]" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── EMOTION ─────────────────────────── */
const EMOTIONS = [
  { label: "Joy", emoji: "😊", val: 72, color: "#F59E0B" },
  { label: "Calm", emoji: "😌", val: 85, color: "#38BDF8" },
  { label: "Focus", emoji: "🎯", val: 64, color: "#34D399" },
  { label: "Stress", emoji: "😮‍💨", val: 18, color: "#9A80E5" },
];

export function EmotionScreen() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadData = () => {
    Promise.allSettled([
      fetch("/api/v1/analytics/overview").then((r) => r.ok ? r.json() : null),
      fetch("/api/v1/analytics/emotion_history").then((r) => r.ok ? r.json() : null),
    ]).then(([ov, hist]) => {
      if (ov.status === "fulfilled" && ov.value) setOverview(ov.value);
      if (hist.status === "fulfilled" && hist.value?.history) setHistory(hist.value.history);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const dominant = overview?.dominant_emotion || "Calm";
  const confidence = overview?.avg_mood || 85;

  const emotionList = overview?.emotion_distribution && overview.emotion_distribution.length > 0
    ? overview.emotion_distribution.map((d: any) => {
        const emojiMap: Record<string, string> = {
          Calm: "😌", Joy: "😊", Happy: "😄", Focus: "🎯", Stress: "😮‍💨",
          Sad: "😢", Anxious: "😰", Neutral: "😐", Angry: "😠"
        };
        const colorMap: Record<string, string> = {
          Calm: "#38BDF8", Joy: "#F59E0B", Happy: "#F59E0B", Focus: "#34D399",
          Stress: "#9A80E5", Sad: "#60A5FA", Anxious: "#F87171", Neutral: "#A39EB2", Angry: "#EF4444"
        };
        return {
          label: d.name,
          emoji: emojiMap[d.name] || "✨",
          val: d.percentage,
          color: colorMap[d.name] || "#7C3AED",
        };
      })
    : [
        { label: "Joy", emoji: "😊", val: 72, color: "#F59E0B" },
        { label: "Calm", emoji: "😌", val: 85, color: "#38BDF8" },
        { label: "Focus", emoji: "🎯", val: 64, color: "#34D399" },
        { label: "Stress", emoji: "😮‍💨", val: 18, color: "#9A80E5" },
      ];

  const chartData = history && history.length > 0
    ? history.map((h: any, i: number) => ({
        i: i + 1,
        v: Math.round((h.confidence || 0.75) * 100),
        emotion: h.fused_emotion || "calm",
      }))
    : [];

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-4 py-3 pb-32">
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-[26px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] m-0 tracking-tight">Emotion Insight</h2>
          <p className="text-[14px] font-medium text-[#7A7A96] dark:text-[#9E98B4] mt-1 mb-5">Live multimodal affective signals detected by Aura.</p>
        </div>
        <div className="clay-pill px-3 py-1 flex items-center gap-2 text-xs font-bold text-[#10B981]">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          Live 30s Sync
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: Current State */}
        <div className="clay-card p-6 sm:p-7">
          <div className="flex items-center gap-3.5 mb-6">
            <div style={{
              width: 64, height: 64, borderRadius: 22,
              background: "linear-gradient(135deg, #38BDF8, #0284C7)",
              display: "grid", placeItems: "center", fontSize: 32,
              boxShadow: "4px 6px 14px rgba(2,132,199,0.3), inset 2px 2px 4px rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.8)",
            }}>
              😌
            </div>
            <div>
              <div className="text-[22px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF]">{dominant} & Balanced</div>
              <div className="text-[13px] font-semibold text-[#7A7A96] dark:text-[#9E98B4]">Confidence {confidence}%</div>
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            {emotionList.map((e) => (
              <div key={e.label}>
                <div className="flex justify-between mb-1.5 text-[13px] font-semibold text-[#4B4B60] dark:text-[#D8D2E8]">
                  <span>{e.emoji} {e.label}</span>
                  <span style={{ fontWeight: 700, color: e.color }}>{e.val}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-[#E8E0E3] dark:bg-[#100E1A] overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${e.val}%` }} transition={{ duration: 1, ease: "easeOut" }} style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${e.color}, ${e.color}88)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Mood Chart */}
        <div className="clay-card p-6 sm:p-7 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[16px] font-bold text-[#2D2D42] dark:text-[#FFFFFF]">Mood Trajectory</span>
            <span className="text-[11px] font-bold text-[#7B59DC] bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-full">Recent Activity</span>
          </div>
          {chartData.length > 0 ? (
            <div style={{ height: 240, marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="emo2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9A80E5" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#9A80E5" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#9A80E5" strokeWidth={3} fill="url(#emo2)" dot={{ r: 3, fill: "#7B59DC" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 min-h-[220px]">
              <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] font-medium max-w-xs m-0">
                No emotion history logged yet. Complete a consultation with Dr. Aura to plot your real affective trajectory.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export { AnalyticsScreen } from "./AnalyticsScreen";

/* ─────────────────────────── PLACEHOLDER ─────────────────────────── */
export function PlaceholderScreen({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center", paddingTop: 40 }}>
      <div style={{ transform: "scale(0.6)", display: "flex", justifyContent: "center" }}>
        <AuraRobot expression="calm" />
      </div>
      <h2 className="text-[28px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] mt-2">{title}</h2>
      <p className="text-[15px] font-medium text-[#7A7A96] dark:text-[#9E98B4] mt-2">{desc}</p>
      <div className="clay-card p-6 mt-6">
        <p className="text-[#7A7A96] dark:text-[#9E98B4] font-medium">This space is coming to life soon — Aura is preparing your {title.toLowerCase()}.</p>
      </div>
    </div>
  );
}
