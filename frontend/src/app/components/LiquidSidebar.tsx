import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Home,
  MessageSquare,
  Mic,
  Video,
  Brain,
  Activity,
  BarChart2,
  Sparkles,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  User,
  Shield,
} from "lucide-react";
import { AuraBrandLogo } from "./AuraBrandLogo";

export interface NavUser {
  name: string;
  email: string;
  is_admin?: boolean;
}

interface LiquidSidebarProps {
  active: string;
  onSelect: (screen: string) => void;
  user: NavUser | null;
  onLogout?: () => void;
}

export const NAV_ITEMS = [
  { id: "Dashboard", label: "Home", icon: Home },
  { id: "Chat", label: "Chat", icon: MessageSquare },
  { id: "Voice Mode", label: "Voice Mode", icon: Mic },
  { id: "Face-to-Face", label: "Face-to-Face", icon: Video, badge: "Hero" },
  { id: "Memory", label: "Memory", icon: Brain },
  { id: "Emotion", label: "Emotion", icon: Activity },
  { id: "Analytics", label: "Analytics", icon: BarChart2 },
  { id: "Interests", label: "Interests", icon: Sparkles },
  { id: "Settings", label: "Settings", icon: Settings },
];

export function LiquidSidebar({ active, onSelect, user, onLogout }: LiquidSidebarProps) {
  const [isPinned, setIsPinned] = useState(() => {
    try {
      const saved = localStorage.getItem("aura_sidebar_pinned");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = isPinned || isHovered;

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("aura_sidebar_pinned", String(next));
      } catch {}
      return next;
    });
  };

  const displayName = user?.name || "Friend";
  const avatarChar = displayName.charAt(0).toUpperCase();

  const navList = user?.is_admin
    ? [...NAV_ITEMS, { id: "Debug", label: "Debug HUD", icon: Shield, badge: "Admin" }]
    : NAV_ITEMS;

  return (
    <motion.aside
      className="hidden lg:flex flex-col justify-between shrink-0 select-none overflow-hidden z-30 liquid-glass-elevated rounded-[28px] my-3.5 ml-3.5 transition-shadow duration-300"
      initial={{ width: isExpanded ? 240 : 76 }}
      animate={{ width: isExpanded ? 240 : 76 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        height: "calc(100vh - 28px)",
        maxHeight: "calc(100vh - 28px)",
        padding: isExpanded ? "18px 14px 16px 14px" : "18px 10px 16px 10px",
      }}
      aria-label="Aura Primary Navigation"
    >
      {/* ── Top Header: Brand Logo & Collapse Control ── */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between pb-4 mb-2 border-b border-white/10 dark:border-white/5">
          <div
            onClick={() => onSelect("Dashboard")}
            className="flex items-center gap-2 cursor-pointer overflow-hidden"
            title="Aura AI Home"
          >
            <AuraBrandLogo size={34} showWordmark={isExpanded} subtitle="AI Wellbeing Companion" />
          </div>

          {isExpanded && (
            <button
              onClick={togglePin}
              className="liquid-button w-7 h-7 rounded-full text-slate-400 hover:text-white dark:hover:text-white"
              title={isPinned ? "Collapse Sidebar" : "Pin Sidebar"}
              aria-label={isPinned ? "Collapse Sidebar" : "Pin Sidebar"}
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* ── Nav Links ── */}
        <nav className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar flex-1 pr-0.5 pt-1">
          {navList.map((item) => {
            const isActive =
              active === item.id || (item.id === "Dashboard" && active === "Home");
            const Icon = item.icon;

            return (
              <motion.button
                key={item.id}
                whileHover={{ x: isExpanded ? 3 : 0 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(item.id)}
                title={!isExpanded ? item.label : undefined}
                className={`relative flex items-center ${
                  isExpanded ? "gap-3 px-3.5" : "justify-center px-0"
                } py-2.5 rounded-[18px] text-[13px] font-semibold cursor-pointer border-none outline-none transition-colors duration-200 shrink-0 ${
                  isActive
                    ? "text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
                style={{ minHeight: 44 }}
              >
                {/* Active Luminous Glass Background Highlight */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavHighlight"
                    className="absolute inset-0 rounded-[18px] z-0"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(139, 92, 246, 0.45) 0%, rgba(99, 102, 241, 0.35) 100%)",
                      boxShadow:
                        "0 4px 20px -2px rgba(124, 58, 237, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                    }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}

                {/* Icon Container */}
                <div
                  className={`relative z-10 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? "text-violet-200"
                      : "text-slate-500 dark:text-slate-400 group-hover:text-violet-400"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                </div>

                {/* Label */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, x: -6, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "auto" }}
                      exit={{ opacity: 0, x: -6, width: 0 }}
                      transition={{ duration: 0.16 }}
                      className="relative z-10 flex items-center justify-between flex-1 overflow-hidden whitespace-nowrap"
                    >
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30">
                          {item.badge}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom Section: Profile & Account Controls ── */}
      <div className="pt-3 border-t border-white/10 dark:border-white/5 shrink-0 flex flex-col gap-2">
        <div
          onClick={() => onSelect("Settings")}
          className={`flex items-center ${
            isExpanded ? "gap-2.5 p-2" : "justify-center p-1"
          } rounded-[18px] hover:bg-white/5 cursor-pointer transition-colors`}
          title={`Profile: ${displayName}`}
        >
          {/* Avatar Circle */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-xs select-none"
            style={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)",
              boxShadow: "0 2px 10px rgba(139, 92, 246, 0.4)",
              border: "1.5px solid rgba(255, 255, 255, 0.35)",
            }}
          >
            {avatarChar}
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -6, width: 0 }}
                animate={{ opacity: 1, x: 0, width: "auto" }}
                exit={{ opacity: 0, x: -6, width: 0 }}
                className="flex flex-col min-w-0 flex-1 whitespace-nowrap overflow-hidden"
              >
                <span className="text-[13px] font-bold text-slate-800 dark:text-white truncate">
                  {displayName}
                </span>
                <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logout Button */}
        {onLogout && isExpanded && (
          <button
            onClick={onLogout}
            className="liquid-button w-full py-2 px-3 text-[12px] text-slate-400 hover:text-rose-400 dark:text-slate-400 dark:hover:text-rose-400 gap-2 border-none"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </motion.aside>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Mobile & Tablet Liquid Glass Bottom Nav Bar (< 1024px)
   ────────────────────────────────────────────────────────────────────────── */

interface LiquidBottomNavProps {
  active: string;
  onSelect: (screen: string) => void;
}

export function LiquidBottomNav({ active, onSelect }: LiquidBottomNavProps) {
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

  const PRIMARY_MOBILE_ITEMS = [
    { id: "Dashboard", label: "Home", icon: Home },
    { id: "Chat", label: "Chat", icon: MessageSquare },
    { id: "Voice Mode", label: "Voice", icon: Mic },
    { id: "Face-to-Face", label: "Face", icon: Video },
    { id: "Emotion", label: "Emotion", icon: Activity },
  ];

  const DRAWER_ITEMS = [
    { id: "Memory", label: "Memory", icon: Brain, desc: "Personal insights and facts" },
    { id: "Analytics", label: "Analytics", icon: BarChart2, desc: "Wellbeing trends and progress" },
    { id: "Interests", label: "Interests", icon: Sparkles, desc: "Focus topics & communication style" },
    { id: "Settings", label: "Settings", icon: Settings, desc: "Preferences, appearance and account" },
  ];

  return (
    <>
      {/* Floating Bottom Nav Bar */}
      <nav
        className="lg:hidden fixed bottom-3 left-3 right-3 z-40 liquid-glass-elevated rounded-[24px] px-2 py-1.5 flex items-center justify-around shadow-2xl"
        aria-label="Mobile Navigation"
      >
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const isActive =
            active === item.id || (item.id === "Dashboard" && active === "Home");
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => {
                setShowMoreDrawer(false);
                onSelect(item.id);
              }}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl cursor-pointer border-none outline-none transition-all ${
                isActive
                  ? "text-violet-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              style={{ minWidth: 48, minHeight: 44 }}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? "bg-violet-500/20 text-violet-300" : ""
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
              </div>
              <span className="text-[10px] font-bold mt-0.5 tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More Button */}
        <button
          onClick={() => setShowMoreDrawer(true)}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl cursor-pointer border-none outline-none transition-all ${
            showMoreDrawer ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
          }`}
          style={{ minWidth: 48, minHeight: 44 }}
        >
          <div className="p-1 rounded-xl">
            <MoreHorizontal size={19} strokeWidth={1.8} />
          </div>
          <span className="text-[10px] font-bold mt-0.5 tracking-tight">More</span>
        </button>
      </nav>

      {/* "More" Liquid Glass Sheet Drawer */}
      <AnimatePresence>
        {showMoreDrawer && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreDrawer(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="relative z-10 liquid-glass-elevated rounded-t-[32px] p-6 pb-12 shadow-2xl border-t border-white/20"
            >
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <AuraBrandLogo size={28} showWordmark={true} />
                  <span className="text-xs text-slate-400 font-semibold">• Spaces</span>
                </div>
                <button
                  onClick={() => setShowMoreDrawer(false)}
                  className="w-8 h-8 rounded-full liquid-button text-slate-300"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DRAWER_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setShowMoreDrawer(false);
                        onSelect(item.id);
                      }}
                      className="liquid-card p-3.5 flex items-center gap-3.5 text-left cursor-pointer border-none outline-none group hover:bg-white/10"
                    >
                      <div className="w-10 h-10 rounded-2xl liquid-button text-violet-400 flex items-center justify-center shrink-0">
                        <Icon size={20} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[14px] font-bold text-slate-800 dark:text-white">
                          {item.label}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
