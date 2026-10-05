import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Mic,
  Video,
  FileText,
  Lock,
  Sparkles,
  ChevronDown,
  Target,
  Zap,
  Heart,
  PlusSquare,
  ArrowRight,
  BookOpen,
  Wind,
  Clock,
  Keyboard,
  Activity,
  Smile,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import heroSanctuaryArt from "../../assets/hero_sanctuary_art@2x.png";
import mountainSunsetArt from "../../assets/mountain_sunset_art@2x.png";
import { useTheme } from "../context/ThemeContext";

interface DashboardScreenProps {
  onStart: (screen?: string, query?: string) => void;
  onLogout?: () => void;
  onNavigateToAuth?: () => void;
}

export function DashboardScreen({
  onStart,
}: DashboardScreenProps) {
  const { isDark } = useTheme();

  // Load user name
  const user = (() => {
    try {
      const saved = localStorage.getItem("aura_user");
      return saved ? JSON.parse(saved) : { name: "Atharv", email: "" };
    } catch {
      return { name: "Atharv", email: "" };
    }
  })();
  const firstName = user.name ? user.name.split(" ")[0] : "Atharv";

  // Emotion trend 7-day spline data
  const trendData = [
    { day: "Mon", score: 45, label: "Low" },
    { day: "Tue", score: 62, label: "Neutral" },
    { day: "Wed", score: 54, label: "Neutral" },
    { day: "Thu", score: 78, label: "Positive" },
    { day: "Fri", score: 70, label: "Positive" },
    { day: "Sat", score: 65, label: "Neutral" },
    { day: "Sun", score: 85, label: "Positive" },
  ];

  // Active session tab selector (Chat is active in reference design)
  const [activeSessionTab, setActiveSessionTab] = useState<"Chat" | "Voice" | "Face-to-Face" | "Memory">("Chat");

  // Selected feeling chip
  const [selectedFeeling, setSelectedFeeling] = useState<string | null>(null);

  // Timeframe selector
  const [timeframe, setTimeframe] = useState("Last 7 days");

  const feelingChips = [
    { label: "I'm feeling anxious", query: "I'm feeling anxious right now, can you help ground me?" },
    { label: "Help me focus", query: "Can you help me get into a focused state for my work?" },
    { label: "I had a good day", query: "I had a really good day today and wanted to reflect on it!" },
    { label: "Just listen", query: "I have a lot on my mind. I just need you to listen." },
  ];

  const handleChipClick = (chip: { label: string; query: string }) => {
    setSelectedFeeling(chip.label);
    onStart("Chat", chip.query);
  };

  const handleModeClick = (mode: "Chat" | "Voice" | "Face-to-Face" | "Memory") => {
    setActiveSessionTab(mode);
    if (mode === "Chat") onStart("Chat");
    else if (mode === "Voice") onStart("Voice Mode");
    else if (mode === "Face-to-Face") onStart("Face-to-Face");
    else if (mode === "Memory") onStart("Memory");
  };

  // Dynamic date for today's insight
  const formattedToday = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date());

  // Spacebar trigger for Voice Mode ("or press space" microinteraction)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.isContentEditable;
      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        onStart("Voice Mode");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onStart]);

  return (
    <div
      className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none p-3 sm:p-4 lg:p-5 flex flex-col gap-4"
      style={{
        background: isDark
          ? "linear-gradient(145deg, #090712 0%, #0D0A18 50%, #0A0814 100%)"
          : "linear-gradient(145deg, #FAF8F5 0%, #F5ECE5 100%)",
        color: isDark ? "#F5F2EB" : "#1E182F",
      }}
    >
      {/* ═══ 2-COLUMN MAIN BENTO GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_370px] xl:grid-cols-[1fr_400px] gap-4 items-start w-full max-w-[1440px] mx-auto">
        {/* ─────────────────────────────────────────────────────────────
            LEFT COLUMN (Hero Banner + Start a Session + Emotion Trend)
           ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* ── 1. Hero Sanctuary Banner with High-Res 3D Artwork ── */}
          <div
            className="relative rounded-[24px] overflow-hidden p-6 sm:p-7 border shadow-xl flex flex-col justify-center min-h-[185px] sm:min-h-[195px]"
            style={{
              background: isDark
                ? "linear-gradient(135deg, #101222 0%, #16172d 40%, #131225 100%)"
                : "linear-gradient(135deg, #F6EEF8 0%, #EFE4FA 60%, #FDF4ED 100%)",
              borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 16px 40px rgba(0, 0, 0, 0.45)"
                : "-6px -6px 18px rgba(255,255,255,0.95), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            {/* Right: Pixel-Perfect High-Res 3D Sanctuary Artwork */}
            <div className="absolute right-0 top-0 bottom-0 w-[58%] sm:w-[52%] md:w-[48%] pointer-events-none overflow-hidden flex items-center justify-end select-none">
              <img
                src={heroSanctuaryArt}
                alt="Aura Sanctuary"
                className="h-full w-full object-cover object-left"
              />
            </div>

            {/* Left Content */}
            <div className="relative z-10 max-w-[310px] sm:max-w-[360px] flex flex-col gap-2 my-auto">
              <span
                className="font-sans text-[10px] sm:text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{ color: isDark ? "#C7B5F3" : "#7C3AED" }}
              >
                YOUR SPACE TO FEEL, REFLECT, AND GROW
              </span>

              <h1
                className="font-sans text-[26px] sm:text-[32px] font-bold leading-[1.12] tracking-[-0.02em] m-0"
                style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
              >
                Good to see you,
                <br />
                {firstName}.
              </h1>

              <p
                className="font-sans text-[12.5px] sm:text-[13px] leading-[1.5] m-0"
                style={{ color: isDark ? "#A8A2B8" : "#6A6478" }}
              >
                I&apos;m Aura, your emotion-aware companion. Let&apos;s explore how you feel today.
              </p>
            </div>
          </div>

          {/* ── 2. Start a session Card ── */}
          <div
            className="rounded-[28px] p-5 sm:p-6 border shadow-lg flex flex-col gap-5"
            style={{
              background: isDark
                ? "linear-gradient(150deg, #130F23 0%, #100D1D 100%)"
                : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.18)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 16px 40px rgba(0,0,0,0.5)"
                : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            {/* Header: Title + Privacy Badge */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #7C3AED 0%, #632BD6 100%)",
                    boxShadow: "0 0 12px rgba(124,58,237,0.4)",
                  }}
                >
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2
                    className="font-sans text-[16px] font-bold m-0 leading-tight"
                    style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                  >
                    Start a session
                  </h2>
                  <p
                    className="font-sans text-[11.5px] m-0 text-muted mt-0.5"
                    style={{ color: isDark ? "#8E88A3" : "#777287" }}
                  >
                    Choose how you&apos;d like to connect with Aura.
                  </p>
                </div>
              </div>

              <div
                className="flex items-center gap-1.5 font-sans text-[11px] font-semibold select-none"
                style={{ color: isDark ? "#8E88A3" : "#777287" }}
              >
                <Lock className="w-3.5 h-3.5" />
                Your conversations are private
              </div>
            </div>

            {/* 4 Mode Buttons / Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  id: "Chat" as const,
                  label: "Chat",
                  sub: "Talk to Aura",
                  icon: MessageSquare,
                },
                {
                  id: "Voice" as const,
                  label: "Voice",
                  sub: "Speak your mind",
                  icon: Mic,
                },
                {
                  id: "Face-to-Face" as const,
                  label: "Face-to-Face",
                  sub: "Scan your expression",
                  icon: Video,
                },
                {
                  id: "Memory" as const,
                  label: "Memory",
                  sub: "Explore your memories",
                  icon: FileText,
                },
              ].map((tab) => {
                const isActive = activeSessionTab === tab.id;
                const IconComponent = tab.icon;

                return (
                  <motion.button
                    key={tab.id}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleModeClick(tab.id)}
                    className="p-3.5 rounded-[20px] flex items-center gap-3 border text-left cursor-pointer transition-all relative overflow-hidden"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, #7C3AED 0%, #632BD6 100%)"
                        : isDark
                        ? "linear-gradient(145deg, #18132B 0%, #120F20 100%)"
                        : "linear-gradient(145deg, #FAF4F0 0%, #F5ECE5 100%)",
                      borderColor: isActive
                        ? "rgba(255, 255, 255, 0.3)"
                        : isDark
                        ? "rgba(255, 255, 255, 0.07)"
                        : "rgba(255, 255, 255, 0.95)",
                      boxShadow: isActive
                        ? "0 8px 24px rgba(124, 58, 237, 0.45), inset 1px 1px 2px rgba(255,255,255,0.3)"
                        : isDark
                        ? "0 4px 14px rgba(0,0,0,0.3)"
                        : "3px 4px 10px rgba(198,178,190,0.2), -2px -2px 6px rgba(255,255,255,0.9)",
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: isActive
                          ? "rgba(255, 255, 255, 0.2)"
                          : isDark
                          ? "rgba(169, 139, 232, 0.12)"
                          : "rgba(124, 58, 237, 0.08)",
                        color: isActive ? "#FFFFFF" : isDark ? "#C7B5F3" : "#7C3AED",
                      }}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div
                        className="font-sans text-[13px] font-bold leading-tight truncate"
                        style={{ color: isActive ? "#FFFFFF" : isDark ? "#F5F2EB" : "#1E182F" }}
                      >
                        {tab.label}
                      </div>
                      <div
                        className="font-sans text-[10px] leading-tight truncate mt-0.5"
                        style={{
                          color: isActive
                            ? "rgba(255,255,255,0.8)"
                            : isDark
                            ? "#8E88A3"
                            : "#777287",
                        }}
                      >
                        {tab.sub}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Check-in Prompt Tray */}
            <div
              className="p-5 rounded-[22px] border flex flex-col gap-4"
              style={{
                background: isDark
                  ? "linear-gradient(145deg, #161129 0%, #100C1F 100%)"
                  : "linear-gradient(145deg, #EFE6E2 0%, #E8DFDB 100%)",
                borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.6)",
                boxShadow: isDark
                  ? "inset 1px 1px 3px rgba(0,0,0,0.5)"
                  : "inset 2px 2px 5px rgba(185,165,175,0.25), inset -2px -2px 5px rgba(255,255,255,0.9)",
              }}
            >
              {/* Tray Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3
                    className="font-sans text-[15px] font-bold m-0 leading-tight"
                    style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                  >
                    How are you feeling right now?
                  </h3>
                  <p
                    className="font-sans text-[11.5px] m-0 text-muted mt-0.5"
                    style={{ color: isDark ? "#8E88A3" : "#777287" }}
                  >
                    I&apos;m here to listen — no pressure.
                  </p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onStart("Chat")}
                  className="px-3.5 py-1.5 rounded-full border flex items-center gap-1.5 font-sans text-[11.5px] font-semibold cursor-pointer shadow-sm"
                  style={{
                    background: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.8)",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.9)",
                    color: isDark ? "#E5E1F0" : "#1E182F",
                  }}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  Text input
                </motion.button>
              </div>

              {/* Interaction Bar: Feeling Chips on Left, Center Mic, Waveform on Right */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center pt-1">
                {/* Left: 4 Feeling Chips */}
                <div className="flex flex-wrap gap-2">
                  {feelingChips.map((chip) => (
                    <motion.button
                      key={chip.label}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleChipClick(chip)}
                      className="px-3 py-1.5 rounded-full border font-sans text-[11px] font-semibold cursor-pointer transition-colors"
                      style={{
                        background:
                          selectedFeeling === chip.label
                            ? "linear-gradient(135deg, #7C3AED 0%, #632BD6 100%)"
                            : isDark
                            ? "rgba(255, 255, 255, 0.05)"
                            : "rgba(255, 255, 255, 0.7)",
                        borderColor:
                          selectedFeeling === chip.label
                            ? "rgba(255,255,255,0.3)"
                            : isDark
                            ? "rgba(255, 255, 255, 0.08)"
                            : "rgba(255, 255, 255, 0.9)",
                        color:
                          selectedFeeling === chip.label
                            ? "#FFFFFF"
                            : isDark
                            ? "#C5BFD4"
                            : "#5D5773",
                      }}
                    >
                      {chip.label}
                    </motion.button>
                  ))}
                </div>

                {/* Center: Glowing Purple Microphone Button */}
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onStart("Voice Mode")}
                    className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer border-2 border-white/30"
                    style={{
                      background: "linear-gradient(135deg, #9333EA 0%, #7C3AED 50%, #581C87 100%)",
                      boxShadow: "0 0 25px rgba(124, 58, 237, 0.55), inset 1px 1px 3px rgba(255,255,255,0.4)",
                    }}
                    title="Tap to speak"
                  >
                    <Mic className="w-6 h-6 text-white" />
                  </motion.button>
                  <div className="text-center">
                    <div
                      className="font-sans text-[11px] font-bold"
                      style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                    >
                      Tap to speak
                    </div>
                    <div
                      className="font-sans text-[9px]"
                      style={{ color: isDark ? "#8E88A3" : "#777287" }}
                    >
                      or press space
                    </div>
                  </div>
                </div>

                {/* Right: Soundwave Visualizer & Reassurance Text */}
                <div className="flex flex-col items-center md:items-end justify-center gap-1.5">
                  <div className="flex items-end gap-1 h-6">
                    {[10, 16, 22, 14, 26, 18, 12, 20, 8].map((h, i) => (
                      <div
                        key={i}
                        className="wave-bar"
                        style={{
                          height: h,
                          width: 3,
                          background: "#A855F7",
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className="font-sans text-[11px] text-center md:text-right"
                    style={{ color: isDark ? "#8E88A3" : "#777287" }}
                  >
                    Sometimes, being heard is enough.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Emotion trend Card (Spline Chart) ── */}
          <div
            className="rounded-[28px] p-5 sm:p-6 border shadow-lg flex flex-col gap-4"
            style={{
              background: isDark
                ? "linear-gradient(150deg, #130F23 0%, #100D1D 100%)"
                : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.18)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 16px 40px rgba(0,0,0,0.5)"
                : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            {/* Header: Title + Dropdown Selector */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: isDark ? "rgba(169, 139, 232, 0.15)" : "#D4C5F7",
                    color: isDark ? "#C7B5F3" : "#7C3AED",
                  }}
                >
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3
                    className="font-sans text-[15px] font-bold m-0 leading-tight"
                    style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                  >
                    Emotion trend
                  </h3>
                  <p
                    className="font-sans text-[11.5px] m-0 text-muted mt-0.5"
                    style={{ color: isDark ? "#8E88A3" : "#777287" }}
                  >
                    A glimpse into your emotional journey
                  </p>
                </div>
              </div>

              {/* Dropdown Selector */}
              <div
                className="px-3 py-1.5 rounded-full border font-sans text-[11.5px] font-semibold flex items-center gap-1.5 cursor-pointer"
                style={{
                  background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.8)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.9)",
                  color: isDark ? "#E5E1F0" : "#1E182F",
                }}
              >
                <span>{timeframe}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </div>
            </div>

            {/* Spline Chart */}
            <div className="w-full h-36 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: isDark ? "#8E88A3" : "#777287", fontSize: 11, fontWeight: 500 }}
                    dy={5}
                  />
                  <YAxis
                    domain={[30, 90]}
                    ticks={[40, 60, 80]}
                    tickFormatter={(val) => (val === 80 ? "Positive" : val === 60 ? "Neutral" : "Low")}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: isDark ? "#8E88A3" : "#777287", fontSize: 10, fontWeight: 500 }}
                    dx={-5}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? "#1A152E" : "#FFFFFF",
                      borderColor: isDark ? "#7C3AED" : "#C7B5F3",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="natural"
                    dataKey="score"
                    stroke="#A855F7"
                    strokeWidth={3}
                    dot={{
                      r: 4.5,
                      fill: "#C084FC",
                      stroke: isDark ? "#130F23" : "#FFFFFF",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: "#7C3AED",
                      stroke: "#FFFFFF",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            RIGHT COLUMN (Current State + Today's Insight + Quick Actions + Mountain Card)
           ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 w-full">
          {/* ── 1. Current State Card ── */}
          <div
            className="rounded-[28px] p-5 sm:p-6 border shadow-lg flex flex-col gap-4"
            style={{
              background: isDark
                ? "linear-gradient(150deg, #130F23 0%, #100D1D 100%)"
                : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.18)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 16px 40px rgba(0,0,0,0.5)"
                : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            {/* Header: Title + Status Pill */}
            <div className="flex items-center justify-between">
              <h3
                className="font-sans text-[15px] font-bold m-0"
                style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
              >
                Current state
              </h3>
              <div className="flex items-center gap-1.5 font-sans text-[11px] font-bold text-emerald-400 select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10B981]" />
                Calm
              </div>
            </div>

            {/* Avatar + Calm Description */}
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border"
                style={{
                  background: "radial-gradient(circle, #0284C7 0%, #0369A1 100%)",
                  borderColor: "rgba(56, 189, 248, 0.4)",
                  boxShadow: "0 0 16px rgba(56, 189, 248, 0.3)",
                }}
              >
                <Smile className="w-6 h-6 text-white" />
              </div>
              <div>
                <div
                  className="font-sans text-[16px] font-bold leading-tight"
                  style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                >
                  Calm
                </div>
                <div
                  className="font-sans text-[11px] mt-0.5"
                  style={{ color: isDark ? "#8E88A3" : "#777287" }}
                >
                  You seem centered right now.
                </div>
              </div>
            </div>

            {/* Flowing Ambient Sine Wave */}
            <div className="w-full h-8 overflow-hidden relative">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 40">
                <path
                  d="M0,20 Q40,5 80,20 T160,20 T240,20 T300,20"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                />
              </svg>
            </div>

            {/* 3 Telemetry Pill Boxes */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: "Focus", val: "Good", color: "#3B82F6", icon: Target },
                { label: "Energy", val: "Stable", color: "#06B6D4", icon: Zap },
                { label: "Sentiment", val: "Positive", color: "#10B981", icon: Heart },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="p-2.5 rounded-2xl border flex flex-col items-center text-center gap-1"
                    style={{
                      background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.6)",
                      borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.8)",
                    }}
                  >
                    <ItemIcon className="w-4 h-4" style={{ color: item.color }} />
                    <span
                      className="font-sans text-[9px] uppercase tracking-wider font-semibold"
                      style={{ color: isDark ? "#8E88A3" : "#777287" }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="font-sans text-[11.5px] font-bold"
                      style={{ color: item.color }}
                    >
                      {item.val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 2. Today's Insight Card ── */}
          <div
            className="rounded-[28px] p-5 sm:p-6 border shadow-lg flex flex-col gap-3"
            style={{
              background: isDark
                ? "linear-gradient(150deg, #130F23 0%, #100D1D 100%)"
                : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.18)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 16px 40px rgba(0,0,0,0.5)"
                : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm select-none">ⓘ</span>
                <span
                  className="font-sans text-[14px] font-bold"
                  style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                >
                  Today&apos;s insight
                </span>
              </div>
              <span
                className="font-sans text-[11px] font-medium"
                style={{ color: isDark ? "#8E88A3" : "#777287" }}
              >
                Today, {formattedToday}
              </span>
            </div>

            <div className="flex items-start gap-3 pt-1">
              <span className="text-xl select-none">🌱</span>
              <p
                className="font-sans text-[12.5px] leading-[1.6] m-0"
                style={{ color: isDark ? "#C5BFD4" : "#5D5773" }}
              >
                &ldquo;Your consistent routine this week shows a strong sense of self-care. Keep
                going — progress looks good on you.&rdquo;
              </p>
            </div>
          </div>

          {/* ── 3. Quick Actions Card ── */}
          <div
            className="rounded-[28px] p-5 sm:p-6 border shadow-lg flex flex-col gap-3.5"
            style={{
              background: isDark
                ? "linear-gradient(150deg, #130F23 0%, #100D1D 100%)"
                : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.18)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 16px 40px rgba(0,0,0,0.5)"
                : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusSquare className="w-4 h-4 text-[#A855F7]" />
                <span
                  className="font-sans text-[14px] font-bold"
                  style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                >
                  Quick actions
                </span>
              </div>
              <button
                onClick={() => onStart("Analytics")}
                className="font-sans text-[11.5px] font-semibold text-[#A855F7] hover:underline bg-transparent border-none cursor-pointer flex items-center gap-1 p-0"
              >
                See all →
              </button>
            </div>

            {/* 4 Action Cards */}
            <div className="grid grid-cols-4 gap-2.5">
              {[
                {
                  id: "journal",
                  label: "Journal",
                  sub: "Write thoughts",
                  icon: BookOpen,
                  color: "#F59E0B",
                  action: () => onStart("Chat", "I'd like to write in my reflection journal today."),
                },
                {
                  id: "breathing",
                  label: "Breathing",
                  sub: "4-7-8 Calm",
                  icon: Wind,
                  color: "#06B6D4",
                  action: () => onStart("Voice Mode", "Guide me through a 4-7-8 breathing exercise."),
                },
                {
                  id: "focus",
                  label: "Focus",
                  sub: "Pomodoro",
                  icon: Clock,
                  color: "#A855F7",
                  action: () => onStart("Chat", "Let's do a 25-minute Pomodoro focus block."),
                },
                {
                  id: "consult",
                  label: "Consult",
                  sub: "Face-to-Face",
                  icon: Video,
                  color: "#F43F5E",
                  action: () => onStart("Face-to-Face"),
                },
              ].map((act) => {
                const ActIcon = act.icon;
                return (
                  <motion.div
                    key={act.id}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={act.action}
                    className="p-3 rounded-2xl border flex flex-col items-center text-center cursor-pointer transition-colors"
                    style={{
                      background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.7)",
                      borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.9)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center mb-1.5"
                      style={{ background: `${act.color}20`, color: act.color }}
                    >
                      <ActIcon className="w-4 h-4" />
                    </div>
                    <span
                      className="font-sans text-[11px] font-bold leading-tight"
                      style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
                    >
                      {act.label}
                    </span>
                    <span
                      className="font-sans text-[8.5px] mt-0.5 leading-tight truncate w-full"
                      style={{ color: isDark ? "#8E88A3" : "#777287" }}
                    >
                      {act.sub}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* ── 4. Inspiration Mountain Sunset Card ── */}
          <div
            className="rounded-[24px] overflow-hidden p-5 sm:p-6 border shadow-lg relative min-h-[110px] flex flex-col justify-between"
            style={{
              background: isDark
                ? "linear-gradient(135deg, #181934 0%, #1c1a3b 60%, #281938 100%)"
                : "linear-gradient(135deg, #F5EFF9 0%, #EFE1F5 60%, #FDEAE8 100%)",
              borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.95)",
              boxShadow: isDark
                ? "0 12px 30px rgba(0,0,0,0.4)"
                : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.25)",
            }}
          >
            {/* Real photorealistic mountain sunset scenery */}
            <div className="absolute right-0 top-0 bottom-0 w-[52%] pointer-events-none overflow-hidden flex items-center justify-end select-none">
              <img
                src={mountainSunsetArt}
                alt="Mountain sunset"
                className="h-full w-full object-cover object-left"
              />
            </div>

            <div className="relative z-10 max-w-[210px]">
              <h4
                className="font-sans text-[14.5px] font-bold leading-snug m-0"
                style={{ color: isDark ? "#FFFFFF" : "#1E182F" }}
              >
                You&apos;re doing better than you think.
              </h4>
              <p
                className="font-sans text-[11px] mt-1 m-0 leading-normal"
                style={{ color: isDark ? "#A8A2B8" : "#777287" }}
              >
                Small steps still move you forward.
              </p>
            </div>

            <div className="relative z-10 w-8 h-[2px] rounded-full bg-[#7C3AED]/40 mt-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;
