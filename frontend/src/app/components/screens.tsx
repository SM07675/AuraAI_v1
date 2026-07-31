import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MessageCircle, Activity, History as HistoryIcon, FileText, Wind, Heart, ArrowRight, Send, Plus, X } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, LineChart, Line } from "recharts";
import { GlassCard } from "./glass-card";
import { AuraRobot } from "./aura-robot";
import { EmotionPanel } from "./emotion-panel";

const QUICK_ACTIONS = [
  { label: "Talk", icon: Mic },
  { label: "Analyze Emotion", icon: Activity },
  { label: "History", icon: HistoryIcon },
  { label: "Reports", icon: FileText },
  { label: "Breathing", icon: Wind },
  { label: "Meditation", icon: Heart },
];

/* ─────────────────────────── HOME ─────────────────────────── */
export function HomeScreen({ onStart }: { onStart: () => void }) {
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div>
      <div className="grid items-center gap-6" style={{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", minHeight: "62vh" }}>
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <div className="liquid-glass inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5" style={{ fontSize: 13, color: "#0284C7", fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: "#38BDF8", display: "inline-block" }} />
            Aura is online
          </div>
          <h1 style={{ fontSize: "clamp(46px, 4.6vw, 78px)", fontWeight: 800, lineHeight: 1.0, letterSpacing: -2, margin: 0 }}>
            Welcome
            <br />
            <span style={{ background: "linear-gradient(120deg,#0284C7,#38BDF8,#0284C7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              back, Hardik
            </span>
          </h1>
          <p style={{ fontSize: "clamp(16px, 1.15vw, 19px)", color: "#5c5c78", maxWidth: 400, marginTop: 20, lineHeight: 1.55 }}>
            Your emotion-aware companion is ready to listen. Start a session and let Aura tune into how you feel.
          </p>
          <motion.button
            onClick={onStart}
            whileHover={{ scale: 1.04, boxShadow: "0 16px 40px rgba(2,132,199,0.4)" }}
            whileTap={{ scale: 0.9, scaleY: 0.82 }}
            transition={{ type: "spring", stiffness: 500, damping: 12 }}
            className="inline-flex items-center gap-2 rounded-full mt-7"
            style={{ padding: "16px 28px", background: "linear-gradient(135deg,#0284C7,#38BDF8)", color: "#fff", fontWeight: 600, fontSize: 16, boxShadow: "0 12px 30px rgba(2,132,199,0.4)" }}
          >
            Start Session
            <ArrowRight size={18} />
          </motion.button>
        </motion.div>

        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{ scale: 1.16, transformOrigin: "center", margin: "0 28px" }}
        >
          <AuraRobot expression="happy" />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="liquid-glass flex items-center gap-3 rounded-full px-5 py-2.5 -mt-4">
            <MessageCircle size={16} color="#0284C7" />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Aura is listening…</span>
            <div className="flex items-center gap-[3px]">
              {[0, 1, 2, 3].map((i) => (
                <motion.div key={i} style={{ width: 3, borderRadius: 3, background: "#38BDF8" }} animate={{ height: [6, 16, 6] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }} />
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#0284C7" }}>● LIVE</span>
          </motion.div>
        </motion.div>

        <motion.div className="flex justify-end" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <EmotionPanel />
        </motion.div>
      </div>

      {/* ── Collapsible Floating Quick Actions with Plus (+) Icon ── */}
      <div className="flex flex-col items-center justify-center mt-16 relative">
        <AnimatePresence>
          {actionsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="flex flex-wrap justify-center gap-3 mb-4 max-w-3xl"
            >
              {QUICK_ACTIONS.map((a, i) => {
                const Icon = a.icon;
                return (
                  <motion.button
                    key={a.label}
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 10 }}
                    whileHover={{ y: -4, scale: 1.05 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20, delay: i * 0.05 }}
                    onClick={onStart}
                    className="liquid-glass flex items-center gap-2.5 rounded-full px-5 py-3 shadow-md cursor-pointer"
                  >
                    <span className="grid place-items-center rounded-full" style={{ width: 30, height: 30, background: "linear-gradient(135deg,#0284C7,#38BDF8)" }}>
                      <Icon size={15} color="#fff" />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#1e2740" }}>{a.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plus (+) Floating Button */}
        <motion.button
          onClick={() => setActionsOpen(!actionsOpen)}
          whileHover={{ scale: 1.08, boxShadow: "0 12px 30px rgba(2,132,199,0.4)" }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 450, damping: 18 }}
          className="liquid-glass flex items-center gap-2.5 rounded-full px-6 py-3.5 shadow-xl cursor-pointer"
          style={{ background: "linear-gradient(135deg,#0284C7,#38BDF8)", color: "#fff", fontWeight: 700, fontSize: 15 }}
        >
          <motion.div animate={{ rotate: actionsOpen ? 45 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
            <Plus size={20} color="#fff" />
          </motion.div>
          <span>{actionsOpen ? "Close Quick Actions" : "Quick Actions"}</span>
        </motion.button>
      </div>

      <div className="grid gap-6 mt-14" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <GlassCard delay={0.6} style={{ padding: 28 }}>
          <div className="flex items-center justify-between mb-4">
            <span style={{ fontWeight: 700, fontSize: 18 }}>Recent Session</span>
            <span style={{ fontSize: 13, color: "#717190" }}>Today · 14:20</span>
          </div>
          {[
            { t: "Morning check-in", d: "You felt calm and focused after a good night's rest.", e: "😌" },
            { t: "Breathing exercise", d: "4-7-8 technique completed. Stress lowered by 22%.", e: "🌬️" },
            { t: "Reflection", d: "Aura suggested journaling three gratitudes.", e: "✨" },
          ].map((r) => (
            <div key={r.t} className="flex items-center gap-4 py-3" style={{ borderTop: "1px solid rgba(78,168,255,0.12)" }}>
              <div className="grid place-items-center rounded-2xl shrink-0" style={{ width: 44, height: 44, background: "rgba(255,255,255,0.6)", fontSize: 20 }}>{r.e}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{r.t}</div>
                <div style={{ fontSize: 13, color: "#717190" }}>{r.d}</div>
              </div>
            </div>
          ))}
        </GlassCard>

        <GlassCard delay={0.7} style={{ padding: 28 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>AI Suggestions</span>
          <div className="flex flex-col gap-3 mt-4">
            {[
              { t: "Try a 5-min meditation", i: Heart },
              { t: "Share your thoughts", i: MessageCircle },
              { t: "Review weekly report", i: FileText },
            ].map((s) => {
              const Icon = s.i;
              return (
                <motion.div key={s.t} whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer" style={{ background: "rgba(255,255,255,0.5)" }}>
                  <span className="grid place-items-center rounded-full" style={{ width: 32, height: 32, background: "linear-gradient(135deg,#2458FF,#5EEAD4)" }}>
                    <Icon size={15} color="#fff" />
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{s.t}</span>
                  <ArrowRight size={16} color="#2458FF" />
                </motion.div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* ─────────────────────────── CHAT ─────────────────────────── */
type Msg = { id: string; from: "user" | "aura"; text: string };

export function ChatScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: "init", from: "aura", text: "Hi Hardik — I am Aura. How are you feeling today?" },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/chat`;
    
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      console.log("Connected to Aura AI");
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "start") {
        setMsgs((m) => [...m, { id: "aura-" + Date.now(), from: "aura", text: "" }]);
      } else if (data.type === "chunk") {
        setTyping(false);
        setMsgs((prev) => {
          if (prev.length === 0) return prev;
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg && lastMsg.from === "aura") {
            return [
              ...prev.slice(0, lastIdx),
              { ...lastMsg, text: lastMsg.text + data.content }
            ];
          }
          return prev;
        });
      } else if (data.type === "done") {
        setTyping(false);
        setMsgs((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.from === "aura" && lastMsg.text && typeof window !== "undefined" && "speechSynthesis" in window) {
            try {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(lastMsg.text);
              utterance.rate = 0.95;
              const voices = window.speechSynthesis.getVoices();
              const enVoice = voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Female") || v.name.includes("Zira") || v.name.includes("Google") || v.name.includes("Natural"))) || voices.find((v) => v.lang.startsWith("en"));
              if (enVoice) utterance.voice = enVoice;
              window.speechSynthesis.speak(utterance);
            } catch (e) {}
          }
          return prev;
        });
      } else if (data.type === "error") {
        setTyping(false);
        setMsgs((m) => [...m, { id: "error-" + Date.now(), from: "aura", text: "Sorry, I ran into an issue connecting to my brain." }]);
      }
    };

    ws.current.onclose = () => {
      console.log("Disconnected from Aura AI");
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const send = () => {
    const t = text.trim();
    if (!t || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    
    const id = "user-" + Date.now();
    setMsgs((m) => [...m, { id, from: "user", text: t }]);
    setText("");
    setTyping(true);
    
    // Send to backend
    ws.current.send(JSON.stringify({ type: "message", content: t }));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <div style={{ transform: "scale(0.5)", transformOrigin: "center", width: 160, height: 180, marginLeft: -60, marginRight: -60 }}>
          <AuraRobot expression={typing ? "thinking" : "talking"} />
        </div>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>Live Counseling Session</h2>
          <p style={{ color: "#5c5c78", fontSize: 15 }}>A real-time, continuous session with Aura.</p>
        </div>
      </div>

      <GlassCard hover={false} style={{ padding: 24 }}>
        <div className="flex flex-col gap-4" style={{ minHeight: 340, maxHeight: 420, overflowY: "auto" }}>
          {msgs.map((m) => {
            if (m.from === "aura" && !m.text) return null;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 26 }}
                className={m.from === "user" ? "self-end" : "self-start"}
                style={{ maxWidth: "78%" }}
              >
                <div
                  className="rounded-[24px] px-5 py-3"
                  style={
                    m.from === "user"
                      ? { background: "linear-gradient(135deg,#2458FF,#00C6FF)", color: "#fff", boxShadow: "0 8px 20px rgba(36,88,255,0.3)" }
                      : { background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)", color: "#25253c", backdropFilter: "blur(20px)" }
                  }
                >
                  <span style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{m.text}</span>
                </div>
                {m.from === "user" && (
                  <div className="text-right mt-1">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/70 backdrop-blur-sm text-[11px] font-semibold text-blue-600 border border-blue-200 shadow-sm">
                      Text Emotion: {m.text.toLowerCase().includes("sad") || m.text.toLowerCase().includes("bad") ? "Sadness 😔" : m.text.toLowerCase().includes("happy") || m.text.toLowerCase().includes("good") ? "Joy 😊" : "Neutral 😌"}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
          {typing && (
            <div className="self-start rounded-[24px] px-5 py-4" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.7)" }}>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} style={{ width: 8, height: 8, borderRadius: 99, background: "#2458FF" }} animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Tell Aura how you feel…"
            className="flex-1 rounded-full px-5 py-3 outline-none"
            style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.7)", fontSize: 15 }}
          />
          <motion.button whileTap={{ scale: 0.88 }} onClick={send} className="grid place-items-center rounded-full" style={{ width: 48, height: 48, background: "linear-gradient(135deg,#2458FF,#00C6FF)", boxShadow: "0 8px 20px rgba(36,88,255,0.4)" }}>
            <Send size={18} color="#fff" />
          </motion.button>
        </div>
      </GlassCard>
    </div>
  );
}

/* ─────────────────────────── EMOTION ─────────────────────────── */
const EMOTIONS = [
  { label: "Joy", emoji: "😊", val: 72, color: "#2458FF" },
  { label: "Calm", emoji: "😌", val: 85, color: "#00C6FF" },
  { label: "Focus", emoji: "🎯", val: 64, color: "#5EEAD4" },
  { label: "Stress", emoji: "😮‍💨", val: 18, color: "#8B5CF6" },
];

export function EmotionScreen() {
  return (
    <div className="max-w-5xl mx-auto">
      <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Emotion Insight</h2>
      <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6, marginBottom: 28 }}>Live emotional signals detected by Aura.</p>

      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <GlassCard style={{ padding: 28 }}>
          <div className="flex items-center gap-4 mb-6">
            <div className="grid place-items-center rounded-3xl" style={{ width: 72, height: 72, background: "linear-gradient(135deg,#2458FF,#00D4FF)", fontSize: 36 }}>😌</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>Calm & Balanced</div>
              <div style={{ color: "#717190" }}>Confidence 85%</div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {EMOTIONS.map((e) => (
              <div key={e.label}>
                <div className="flex justify-between mb-1.5" style={{ fontSize: 14 }}>
                  <span>{e.emoji} {e.label}</span>
                  <span style={{ fontWeight: 700, color: e.color }}>{e.val}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 10, background: "rgba(78,168,255,0.12)" }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${e.val}%` }} transition={{ duration: 1, ease: "easeOut" }} style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${e.color},#00D4FF)` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard style={{ padding: 28 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Mood over the day</span>
          <div style={{ height: 260, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[40, 55, 48, 70, 62, 82, 76, 90, 84].map((v, i) => ({ i, v }))}>
                <defs>
                  <linearGradient id="emo2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2458FF" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#00D4FF" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="#2458FF" strokeWidth={3} fill="url(#emo2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* ─────────────────────────── ANALYTICS ─────────────────────────── */
export function AnalyticsScreen() {
  const week = [
    { d: "Mon", v: 62 }, { d: "Tue", v: 74 }, { d: "Wed", v: 58 },
    { d: "Thu", v: 81 }, { d: "Fri", v: 69 }, { d: "Sat", v: 88 }, { d: "Sun", v: 92 },
  ];
  return (
    <div className="max-w-5xl mx-auto">
      <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Analytics</h2>
      <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6, marginBottom: 28 }}>Your wellness trends this week.</p>

      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {[
          { l: "Avg. Mood", v: "78%", s: "+6% vs last week" },
          { l: "Sessions", v: "24", s: "12h 40m total" },
          { l: "Calm Streak", v: "9 days", s: "Personal best 🔥" },
        ].map((k) => (
          <GlassCard key={k.l} style={{ padding: 24 }}>
            <div style={{ fontSize: 14, color: "#717190" }}>{k.l}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#2458FF", marginTop: 4 }}>{k.v}</div>
            <div style={{ fontSize: 13, color: "#0d9488", marginTop: 2 }}>{k.s}</div>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-6 mt-6" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <GlassCard style={{ padding: 28 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Weekly wellbeing</span>
          <div style={{ height: 240, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week}>
                <defs>
                  <linearGradient id="bar1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2458FF" />
                    <stop offset="100%" stopColor="#00D4FF" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill: "#717190", fontSize: 12 }} />
                <Bar dataKey="v" radius={[10, 10, 10, 10]} fill="url(#bar1)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard style={{ padding: 28 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Focus rhythm</span>
          <div style={{ height: 240, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={week}>
                <Line type="monotone" dataKey="v" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4, fill: "#8B5CF6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* ─────────────────────────── PLACEHOLDER (Reports / History / Settings) ─────────────────────────── */
export function PlaceholderScreen({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-3xl mx-auto text-center pt-10">
      <div style={{ transform: "scale(0.7)" }} className="flex justify-center">
        <AuraRobot expression="calm" />
      </div>
      <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginTop: 8 }}>{title}</h2>
      <p style={{ color: "#5c5c78", fontSize: 17, marginTop: 8 }}>{desc}</p>
      <GlassCard style={{ padding: 28, marginTop: 24 }}>
        <p style={{ color: "#717190" }}>This space is coming to life soon — Aura is preparing your {title.toLowerCase()}.</p>
      </GlassCard>
    </div>
  );
}
