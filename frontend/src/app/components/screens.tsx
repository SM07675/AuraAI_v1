import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, MessageCircle, Activity, History as HistoryIcon, FileText, Wind, Heart, ArrowRight, Send, Plus, X, LogOut, User as UserIcon, LogIn, ShieldCheck, Video, Music, BookOpen, Target, Leaf } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, LineChart, Line, PieChart, Pie } from "recharts";
import { AuraRobot, AuraMascot3D, AuraBlobMascot } from "./aura-robot";
import { MusicPlayer } from "./music-player";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";
import { speechService } from "../services/speechRecognitionService";
import { getWebSocketUrl } from "../services/wsHelper";
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
  ClayMusicIcon,
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


/* ─────────────────────────── HOME ─────────────────────────── */
export function HomeScreen({
  onStart,
  onLogout,
  onNavigateToAuth,
}: {
  onStart: (screen?: string) => void;
  onLogout?: () => void;
  onNavigateToAuth?: () => void;
}) {
  const { isDark } = useTheme();
  const user = (() => {
    try {
      const saved = localStorage.getItem("aura_user");
      return saved ? JSON.parse(saved) : { name: "athavpalekar", email: "atharv@aura.ai" };
    } catch {
      return { name: "athavpalekar", email: "atharv@aura.ai" };
    }
  })();

  const userName = user.name || "athavpalekar";

  return (
    <div className="relative w-full select-none h-full max-h-[calc(100vh-80px)] flex flex-col justify-between overflow-hidden" style={{ maxWidth: 1240 }}>
      {/* ═══ MAIN 2-COLUMN LAYOUT (Responsive: Stacks on mobile/tablet, 2 columns on desktop) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.32fr)_minmax(330px,370px)] gap-3 relative z-[1] flex-1 min-h-0 items-stretch">

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="flex flex-col gap-2.5 justify-between h-full min-h-0">

          {/* ── Row 1: Greeting + Proportional 3D Mascot on Lavender Puddle ── */}
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-3 p-1 text-center sm:text-left shrink-0">
            <div>
              <h1 className="text-[23px] sm:text-[25px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] m-0 leading-tight tracking-tight">
                Good to see you,<br />
                <span className="inline-flex items-center gap-1.5 text-[#9878E0] dark:text-[#B794F6]">
                  {userName} <ClayWavingHandIcon size={24} />
                </span>
              </h1>
              <p className="text-[12px] text-[#7A748A] dark:text-[#9E98B4] mt-1 leading-normal font-medium m-0">
                I'm Aura, your emotion-aware companion. Let's explore how you feel.
              </p>
            </div>

            {/* 3D Mascot Area with Surrounding Clay Floating Orbs */}
            <div className="relative shrink-0 sm:mr-3">
              {/* Floating Purple Sphere (Top Left) */}
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-2 -left-4 w-3.5 h-3.5 rounded-full pointer-events-none"
                style={{
                  background: "linear-gradient(135deg, #D4C5F7, #9E7EE6)",
                  boxShadow: "2px 3px 6px rgba(150, 120, 210, 0.35), inset 1px 1px 2px rgba(255,255,255,0.9)",
                }}
              />

              {/* Floating Pink Sphere (Top Right) */}
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                className="absolute -top-2 -right-1 w-3 h-3 rounded-full pointer-events-none"
                style={{
                  background: "linear-gradient(135deg, #F8B4D9, #EE7EB8)",
                  boxShadow: "2px 3px 6px rgba(220, 120, 160, 0.35), inset 1px 1px 2px rgba(255,255,255,0.9)",
                }}
              />

              {/* Main 3D Mascot on Lavender Platform */}
              <AuraMascot3D size={125} />
            </div>
          </div>

          {/* ── Row 2: Main 4-Action Section (Wide Thick Clay Tray) ── */}
          <div
            className="clay-card shrink-0"
            style={{
              padding: "10px 12px",
              borderRadius: 24,
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Chat — Soft Lavender / Dark Purple */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Chat")}
                className={isDark ? "clay-tile-chat" : ""}
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #3B2A6F 0%, #25174B 100%)"
                    : "linear-gradient(145deg, #D6C7F8 0%, #C7B5F3 100%)",
                  border: isDark
                    ? "1.5px solid rgba(169, 139, 232, 0.38)"
                    : "1.5px solid rgba(255, 255, 255, 0.85)",
                  boxShadow: isDark
                    ? "0 10px 20px rgba(25, 12, 50, 0.65), inset 1px 1px 2px rgba(255, 255, 255, 0.22)"
                    : "0 6px 14px rgba(160, 135, 225, 0.22), inset 0 2px 4px rgba(255, 255, 255, 0.9)",
                  padding: "10px 8px 8px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  minHeight: 88,
                  borderRadius: 18,
                }}
              >
                <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 3 }}>
                  <ClayChatIcon size={28} />
                </div>
                <div className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Chat</div>
                <div className="text-[9.5px] font-medium text-[#6E6680] dark:text-[#C7B5F3] mt-0.5">Talk to Aura</div>
              </motion.div>

              {/* Voice Mode — Soft Mint / Dark Teal */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Voice Mode")}
                className={isDark ? "clay-tile-voice" : ""}
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #1C5A51 0%, #103B35 100%)"
                    : "linear-gradient(145deg, #C4EBDD 0%, #B4E3D2 100%)",
                  border: isDark
                    ? "1.5px solid rgba(52, 211, 153, 0.38)"
                    : "1.5px solid rgba(255, 255, 255, 0.85)",
                  boxShadow: isDark
                    ? "0 10px 20px rgba(10, 45, 40, 0.65), inset 1px 1px 2px rgba(255, 255, 255, 0.22)"
                    : "0 6px 14px rgba(50, 160, 130, 0.18), inset 0 2px 4px rgba(255, 255, 255, 0.9)",
                  padding: "10px 8px 8px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  minHeight: 88,
                  borderRadius: 18,
                }}
              >
                <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 3 }}>
                  <ClayVoiceWaveBarsIcon size={28} />
                </div>
                <div className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Voice Mode</div>
                <div className="text-[9.5px] font-medium text-[#6E6680] dark:text-[#6EE7B7] mt-0.5">Speak your mind</div>
              </motion.div>

              {/* Face-to-Face — Soft Peach / Dark Coral */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Face-to-Face")}
                className={isDark ? "clay-tile-face" : ""}
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #7C3737 0%, #4D1E1E 100%)"
                    : "linear-gradient(145deg, #FCD9CE 0%, #F7C7B9 100%)",
                  border: isDark
                    ? "1.5px solid rgba(248, 113, 113, 0.38)"
                    : "1.5px solid rgba(255, 255, 255, 0.85)",
                  boxShadow: isDark
                    ? "0 10px 20px rgba(60, 20, 20, 0.65), inset 1px 1px 2px rgba(255, 255, 255, 0.22)"
                    : "0 6px 14px rgba(220, 120, 100, 0.18), inset 0 2px 4px rgba(255, 255, 255, 0.9)",
                  padding: "10px 8px 8px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  minHeight: 88,
                  borderRadius: 18,
                }}
              >
                <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 3 }}>
                  <ClayFaceCameraIcon size={28} />
                </div>
                <div className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Face-to-Face</div>
                <div className="text-[9.5px] font-medium text-[#6E6680] dark:text-[#FCA5A5] mt-0.5">Scan emotion</div>
              </motion.div>

              {/* Memory — Soft Warm Yellow / Dark Amber */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Memory")}
                className={isDark ? "clay-tile-memory" : ""}
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #8B6528 0%, #563E14 100%)"
                    : "linear-gradient(145deg, #FDE9BF 0%, #F8DB9C 100%)",
                  border: isDark
                    ? "1.5px solid rgba(251, 191, 36, 0.38)"
                    : "1.5px solid rgba(255, 255, 255, 0.85)",
                  boxShadow: isDark
                    ? "0 10px 20px rgba(60, 40, 10, 0.65), inset 1px 1px 2px rgba(255, 255, 255, 0.22)"
                    : "0 6px 14px rgba(200, 150, 50, 0.18), inset 0 2px 4px rgba(255, 255, 255, 0.9)",
                  padding: "10px 8px 8px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  minHeight: 88,
                  borderRadius: 18,
                }}
              >
                <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 3 }}>
                  <ClayHeartCushionIcon size={28} />
                </div>
                <div className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Memory</div>
                <div className="text-[9.5px] font-medium text-[#6E6680] dark:text-[#FDE047] mt-0.5">Your memories</div>
              </motion.div>
            </div>
          </div>

          {/* ── Row 3: Emotion Trend + Lilac Blob Mascot Check-in Bar ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-1 min-h-0">
            {/* Emotion Trend */}
            <div className="clay-card flex flex-col justify-between" style={{ padding: "12px 14px", borderRadius: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <h3 className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] m-0">Emotion Trend</h3>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="clay-pill" style={{ padding: "2px 8px", fontSize: 9.5, fontWeight: 600, cursor: "pointer" }}>
                  7 Days <span style={{ fontSize: 8 }}>⌄</span>
                </motion.div>
              </div>
              <div style={{ height: 68, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={[
                      { d: "Mon", v: 62 },
                      { d: "Tue", v: 78 },
                      { d: "Wed", v: 55 },
                      { d: "Thu", v: 82 },
                      { d: "Fri", v: 68 },
                      { d: "Sat", v: 89 },
                      { d: "Sun", v: 94 },
                    ]}
                    margin={{ top: 4, right: 6, left: 6, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="trendLavenderFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C7B5F3" stopOpacity={isDark ? 0.25 : 0.45} />
                        <stop offset="100%" stopColor="#C7B5F3" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="d"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: isDark ? "#8E88A4" : "#9E98AA", fontSize: 9, fontWeight: 600 }}
                      dy={2}
                    />
                    <Area
                      type="natural"
                      dataKey="v"
                      stroke="#9E7EE6"
                      strokeWidth={2.5}
                      fill="url(#trendLavenderFill)"
                      dot={{ r: 3.5, fill: "#9E7EE6", strokeWidth: 2, stroke: isDark ? "#171424" : "#FFFFFF" }}
                      activeDot={{ r: 5, fill: "#7B56DB", strokeWidth: 2.5, stroke: "#FFFFFF" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Lilac Blob Mascot Check-in Bar */}
            <div
              style={{
                background: isDark
                  ? "linear-gradient(145deg, #2D234A 0%, #1E1734 100%)"
                  : "linear-gradient(145deg, #E8DDFB 0%, #D8C7F5 100%)",
                border: isDark
                  ? "1.5px solid rgba(169, 139, 232, 0.3)"
                  : "1.5px solid rgba(255, 255, 255, 0.85)",
                boxShadow: isDark
                  ? "0 8px 18px rgba(0, 0, 0, 0.55), inset 1px 1px 2px rgba(255, 255, 255, 0.1)"
                  : "0 8px 18px rgba(160, 135, 225, 0.22), inset 0 2px 4px rgba(255, 255, 255, 0.9)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                borderRadius: 22,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <ClayLilacBlobMascot size={42} />
                <div style={{ minWidth: 0 }}>
                  <div className="text-[12.5px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight truncate">
                    How are you feeling right now?
                  </div>
                  <div className="text-[10.5px] font-medium text-[#6E6680] dark:text-[#B2ABC8] mt-0.5 flex items-center gap-1.5">
                    <span>I'm here to listen...</span>
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      <motion.span animate={{ y: [0, -2.5, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} style={{ width: 3, height: 3, borderRadius: 99, background: "#9E7EE6" }} />
                      <motion.span animate={{ y: [0, -2.5, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} style={{ width: 3, height: 3, borderRadius: 99, background: "#9E7EE6" }} />
                      <motion.span animate={{ y: [0, -2.5, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} style={{ width: 3, height: 3, borderRadius: 99, background: "#9E7EE6" }} />
                    </span>
                  </div>
                </div>
              </div>

              <motion.button
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ scale: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } }}
                whileHover={{ scale: 1.08, y: -1 }}
                whileTap={{ scale: 0.95, y: 1 }}
                onClick={() => onStart("Voice Mode")}
                className="cursor-pointer border-none outline-none bg-transparent shrink-0"
                style={{ padding: 0 }}
              >
                <ClayMicCircleButton size={36} />
              </motion.button>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN — stacked 3 cards vertically ═══ */}
        <div className="flex flex-col gap-2.5 justify-between h-full min-h-0">

          {/* ── 1. Current Emotion ── */}
          <div className="clay-card" style={{ padding: "12px 14px", borderRadius: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF]">Current Emotion</span>
              <div
                style={{
                  padding: "2px 7px",
                  background: "linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)",
                  color: "#15803D",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.85)",
                }}
              >
                <span className="animate-pulse" style={{ width: 5, height: 5, borderRadius: 999, background: "#15803D", display: "inline-block" }} />
                ACTIVE
              </div>
            </div>

            {/* Emotion face + label + soft organic sparkline */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <motion.div
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    width: 40, height: 40, borderRadius: 14,
                    background: "linear-gradient(135deg, #BBDCF5 0%, #60A5FA 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 10px rgba(96, 165, 250, 0.35), inset 0 1px 3px rgba(255,255,255,0.9)",
                    border: "1px solid rgba(255,255,255,0.9)",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                >
                  <ClayCalmFaceIcon size={26} />
                </motion.div>
                <div>
                  <div className="text-[15px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Calm</div>
                  <div className="text-[10px] font-medium text-[#9E98AA] dark:text-[#8E88A4] mt-0.5">FERPlus Live</div>
                </div>
              </div>
              <div style={{ width: 95, height: 32 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[{ v: 55 }, { v: 72 }, { v: 64 }, { v: 85 }, { v: 80 }, { v: 92 }]} margin={{ top: 2, bottom: 0, left: 2, right: 2 }}>
                    <defs>
                      <linearGradient id="calmSparkFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="natural"
                      dataKey="v"
                      stroke="#38BDF8"
                      strokeWidth={2.2}
                      fill="url(#calmSparkFill)"
                      dot={{ r: 2.5, fill: "#38BDF8", strokeWidth: 1.5, stroke: isDark ? "#171424" : "#FFFFFF" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Confidence Bar */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: isDark ? "#9E98B4" : "#777287", marginBottom: 3 }}>
                <span>Confidence</span>
                <span style={{ color: "#0284C7", fontWeight: 800 }}>85%</span>
              </div>
              <div className="w-full h-[5px] rounded-full bg-[#EAE2E6] dark:bg-[#100E1A] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "85%" }}
                  transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                  style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #38BDF8, #0284C7)", boxShadow: "inset 0 1px 2px rgba(255,255,255,0.6)" }}
                />
              </div>
            </div>

            {/* 4 metric pills */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[
                { label: "Joy", val: "72%", color: "#F59E0B" },
                { label: "Focus", val: "64%", color: "#10B981" },
                { label: "Stress", val: "18%", color: "#F87171" },
                { label: "Sad", val: "6%", color: "#60A5FA" },
              ].map((m) => (
                <motion.div
                  key={m.label}
                  whileHover={{ y: -1 }}
                  className="clay-card-flat"
                  style={{ padding: "4px 2px", display: "flex", flexDirection: "column", alignItems: "center", borderRadius: 10, cursor: "default" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: m.color, display: "inline-block" }} />
                    <span className="text-[10px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]">{m.val}</span>
                  </div>
                  <span className="text-[8.5px] font-medium text-[#777287] dark:text-[#8E88A4]">{m.label}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ── 2. Today's Insights (Compact Donut Chart) ── */}
          <div className="clay-card" style={{ padding: "10px 14px", borderRadius: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h4 className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] m-0">Today's Insights</h4>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="clay-pill" style={{ padding: "2px 7px", fontSize: 9.5, fontWeight: 600, cursor: "pointer" }}>
                Today <span style={{ fontSize: 8 }}>⌄</span>
              </motion.div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative", width: 62, height: 62, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Coral", value: 30, fill: isDark ? "#EC4899" : "#F4A6C8" },
                        { name: "Peach", value: 25, fill: isDark ? "#F97316" : "#F7C8BA" },
                        { name: "Mint", value: 25, fill: isDark ? "#10B981" : "#8EE0C6" },
                        { name: "Lavender", value: 20, fill: isDark ? "#8B5CF6" : "#C7B5F3" },
                      ]}
                      innerRadius={19}
                      outerRadius={29}
                      paddingAngle={2}
                      cornerRadius={2}
                      dataKey="value"
                    />
                  </PieChart>
                </ResponsiveContainer>
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    position: "absolute", width: 22, height: 22, borderRadius: "50%",
                    background: isDark ? "linear-gradient(135deg, #FBBF24 0%, #D97706 100%)" : "linear-gradient(135deg, #FFF4D0 0%, #F9DA8A 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 4px rgba(220,180,100,0.35)",
                    border: "1px solid #FFFFFF",
                  }}
                >
                  <ClaySmileyBeadIcon size={16} />
                </motion.div>
              </div>

              <div className="text-[11.5px] font-semibold text-[#2E2544] dark:text-[#FFFFFF] leading-snug">
                You've been <strong className="text-[#2E2544] dark:text-[#FFFFFF] font-extrabold">mostly calm & focused</strong> today.
              </div>
            </div>
          </div>

          {/* ── 3. Quick Actions ── */}
          <div className="quick-actions-container" style={{ padding: "10px 14px", borderRadius: 22 }}>
            <h4 className="text-[13px] font-bold text-[#2E2544] dark:text-[#FFFFFF] m-0 mb-2" style={{ letterSpacing: "-0.2px" }}>
              Quick Actions
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {/* Journal */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Chat")}
                className="clay-quick-action quick-card-journal"
                style={{
                  height: 78,
                  minHeight: 78,
                  padding: "8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  textAlign: "left",
                  cursor: "pointer",
                  borderRadius: 16,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 3 }}>
                  <ClayJournalIcon size={20} />
                </div>
                <div className="text-[11.5px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Journal</div>
                <div className="text-[8.5px] leading-tight text-[#777287] dark:text-[#8E88A4] mt-0.5 font-medium truncate w-full">
                  Write thoughts
                </div>
              </motion.div>

              {/* Breathing */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Voice Mode")}
                className="clay-quick-action quick-card-breathing"
                style={{
                  height: 78,
                  minHeight: 78,
                  padding: "8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  textAlign: "left",
                  cursor: "pointer",
                  borderRadius: 16,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 3 }}>
                  <ClayBreathingIcon size={20} />
                </div>
                <div className="text-[11.5px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Breathing</div>
                <div className="text-[8.5px] leading-tight text-[#777287] dark:text-[#8E88A4] mt-0.5 font-medium truncate w-full">
                  4-7-8 Calm
                </div>
              </motion.div>

              {/* Focus */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Chat")}
                className="clay-quick-action quick-card-focus"
                style={{
                  height: 78,
                  minHeight: 78,
                  padding: "8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  textAlign: "left",
                  cursor: "pointer",
                  borderRadius: 16,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 3 }}>
                  <ClayFocusIcon size={20} />
                </div>
                <div className="text-[11.5px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Focus</div>
                <div className="text-[8.5px] leading-tight text-[#777287] dark:text-[#8E88A4] mt-0.5 font-medium truncate w-full">
                  Pomodoro
                </div>
              </motion.div>

              {/* Music */}
              <motion.div
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ y: 1, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => onStart("Chat")}
                className="clay-quick-action quick-card-music"
                style={{
                  height: 78,
                  minHeight: 78,
                  padding: "8px 6px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  textAlign: "left",
                  cursor: "pointer",
                  borderRadius: 16,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 3 }}>
                  <ClayMusicIcon size={20} />
                </div>
                <div className="text-[11.5px] font-bold text-[#2E2544] dark:text-[#FFFFFF] leading-tight">Music</div>
                <div className="text-[8.5px] leading-tight text-[#777287] dark:text-[#8E88A4] mt-0.5 font-medium truncate w-full">
                  Ambient
                </div>
              </motion.div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── CHAT ─────────────────────────── */
type Msg = { id: string; from: "user" | "aura"; text: string; time?: string; showBeads?: boolean };

export function ChatScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "init",
      from: "aura",
      text: "Hi — I am Aura. How are you feeling today?",
      time: "10:30 AM",
    },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

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
                    <span className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium text-[#2E2544] dark:text-[#F3EFFC]">
                      {m.text}
                    </span>

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
          <div className="clay-chat-input-pill flex-1 flex items-center px-5 sm:px-6 py-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={listening ? "Listening to your voice..." : "Tell Aura how you feel..."}
              className="bg-transparent border-none outline-none w-full text-[14px] text-[#2E2544] dark:text-[#E8E4F2] placeholder-[#9E98AA] dark:placeholder-[#6E6882] font-medium"
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

      {/* ═══ MUSIC PLAYER (Horizontal Rounded Clay Bar Directly Below Chat) ═══ */}
      <div className="w-full shrink-0 mt-1.5">
        <MusicPlayer variant="inline" />
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
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2 className="text-[26px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] m-0 tracking-tight">Emotion Insight</h2>
      <p className="text-[14px] font-medium text-[#7A7A96] dark:text-[#9E98B4] mt-1.5 mb-6">Live emotional signals detected by Aura.</p>

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
              <div className="text-[22px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF]">Calm & Balanced</div>
              <div className="text-[13px] font-semibold text-[#7A7A96] dark:text-[#9E98B4]">Confidence 85%</div>
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            {EMOTIONS.map((e) => (
              <div key={e.label}>
                <div className="flex justify-between mb-1.5 text-[13px] font-semibold text-[#4B4B60] dark:text-[#D8D2E8]">
                  <span>{e.emoji} {e.label}</span>
                  <span style={{ fontWeight: 700, color: e.color }}>{e.val}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#E8E0E3] dark:bg-[#100E1A] overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${e.val}%` }} transition={{ duration: 1, ease: "easeOut" }} style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${e.color}, ${e.color}88)` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Mood Chart */}
        <div className="clay-card p-6 sm:p-7">
          <span className="text-[16px] font-bold text-[#2D2D42] dark:text-[#FFFFFF]">Mood over the day</span>
          <div style={{ height: 240, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[40, 55, 48, 70, 62, 82, 76, 90, 84].map((v, i) => ({ i, v }))}>
                <defs>
                  <linearGradient id="emo2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9A80E5" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#9A80E5" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke="#9A80E5" strokeWidth={3} fill="url(#emo2)" />
              </AreaChart>
            </ResponsiveContainer>
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
