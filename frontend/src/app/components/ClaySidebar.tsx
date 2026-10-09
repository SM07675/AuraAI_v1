import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ClayAuraTorusIcon,
  ClayHomeIcon,
  ClayChatSidebarIcon,
  ClayVoiceSidebarIcon,
  ClayCameraSidebarIcon,
  ClayHeartSidebarIcon,
  ClaySmileySidebarIcon,
  ClayAnalyticsSidebarIcon,
  ClaySettingsSidebarIcon,
  ClayBrainIcon,
} from "./clay-icons";

interface ClaySidebarProps {
  active: string;
  onSelect: (screen: string) => void;
  user: { name: string; email: string; is_admin?: boolean; role?: "patient" | "clinician" } | null;
  onLogout?: () => void;
  isConnected?: boolean;
  portalMode?: "patient" | "clinician";
  onSwitchPortal?: (portal: "patient" | "clinician") => void;
}

const PATIENT_NAV_ITEMS = [
  { id: "Dashboard", label: "Sanctuary", IconComponent: ClayHomeIcon },
  { id: "Chat", label: "Companion", IconComponent: ClayChatSidebarIcon },
  { id: "Voice Mode", label: "Voice", IconComponent: ClayVoiceSidebarIcon },
  { id: "Face-to-Face", label: "Face-to-Face", IconComponent: ClayCameraSidebarIcon },
  { id: "Memory", label: "Memory", IconComponent: ClayHeartSidebarIcon },
  { id: "Analytics", label: "Insights", IconComponent: ClayAnalyticsSidebarIcon },
  { id: "Settings", label: "Settings", IconComponent: ClaySettingsSidebarIcon },
];

const CLINICIAN_NAV_ITEMS = [
  { id: "Clinician", label: "EEG Lab", IconComponent: ClayBrainIcon },
  { id: "Analytics", label: "Biomarkers", IconComponent: ClayAnalyticsSidebarIcon },
  { id: "Chat", label: "Simulation", IconComponent: ClayChatSidebarIcon },
  { id: "Memory", label: "Patient Graph", IconComponent: ClayHeartSidebarIcon },
  { id: "Settings", label: "Clinical Config", IconComponent: ClaySettingsSidebarIcon },
];

export function ClaySidebar({
  active,
  onSelect,
  user,
  onLogout,
  isConnected = true,
  portalMode = "patient",
  onSwitchPortal,
}: ClaySidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    try {
      const saved = localStorage.getItem("aura_sidebar_pinned");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const isExpanded = isHovered || isPinned;
  const userName = user?.name || "Friend";
  const avatarChar = userName.charAt(0).toUpperCase();

  const isClinician = portalMode === "clinician";
  const baseItems = isClinician ? CLINICIAN_NAV_ITEMS : PATIENT_NAV_ITEMS;
  const navItems = user?.is_admin
    ? [...baseItems, { id: "Debug", label: "Debug HUD", IconComponent: ClaySettingsSidebarIcon }]
    : baseItems;

  return (
    <motion.aside
      className="clay-sidebar hidden lg:flex flex-col justify-between shrink-0 select-none overflow-hidden z-20"
      initial={{ width: isExpanded ? 220 : 68 }}
      animate={{ width: isExpanded ? 220 : 68 }}
      transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.8 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        height: "calc(100vh - 28px)",
        maxHeight: "calc(100vh - 28px)",
        margin: "14px 0 14px 14px",
        padding: isExpanded ? "16px 14px 14px 14px" : "16px 10px 14px 10px",
        willChange: "width",
      }}
    >
      {/* ── Top: Branding ── */}
      <div className="flex flex-col min-h-0 flex-1">
        <div
          className={`flex items-center ${isExpanded ? "gap-2.5 px-1.5" : "justify-center px-0"} mb-3 cursor-pointer shrink-0 transition-all`}
          onClick={() => {
            onSelect(isClinician ? "Clinician" : "Dashboard");
          }}
          title={isClinician ? "Aura AI Clinician Workstation" : "Aura AI Patient Sanctuary"}
        >
          <motion.div
            whileHover={{ rotate: 15, scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className="shrink-0 flex items-center justify-center"
          >
            {isClinician ? <ClayBrainIcon size={30} /> : <ClayAuraTorusIcon size={32} />}
          </motion.div>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -8, width: 0 }}
                animate={{ opacity: 1, x: 0, width: "auto" }}
                exit={{ opacity: 0, x: -8, width: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col whitespace-nowrap overflow-hidden leading-tight"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[16px] font-black text-[#2E2544] dark:text-[#FFFFFF]"
                    style={{ letterSpacing: "-0.4px" }}
                  >
                    Aura AI
                  </span>
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase ${
                      isClinician
                        ? "bg-[#7C3AED]/20 text-[#7C3AED] dark:text-[#C7B5F3]"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isClinician ? "Clinician" : "Sanctuary"}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-[#8E88A4] dark:text-[#9E98B4]">
                  {isClinician ? "Electrophysiology Lab" : "Empathetic companion"}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Navigation Items ── */}
        <nav className="flex flex-col gap-1 overflow-y-auto scrollbar-none min-h-0 flex-1 pr-0.5">
          {navItems.map((item) => {
            const isActive =
              active === item.id ||
              (item.id === "Dashboard" && active === "Home");
            const Icon = item.IconComponent;

            return (
              <motion.button
                key={item.id}
                whileHover={{ x: isExpanded ? 3 : 0, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelect(item.id)}
                title={!isExpanded ? item.label : undefined}
                className={`relative flex items-center ${
                  isExpanded ? "gap-2.5 px-3" : "justify-center px-0"
                } py-2 rounded-2xl text-[12.5px] font-bold cursor-pointer border-none outline-none transition-colors duration-150 shrink-0 ${
                  isActive
                    ? "text-white shadow-[0_4px_16px_rgba(169,139,232,0.4)]"
                    : "text-[#777287] hover:text-[#2E294F] dark:text-[#9E98B4] dark:hover:text-[#F3EFFC]"
                }`}
                style={{ background: "transparent", minHeight: 40 }}
              >
                {/* Smooth Animated Clay Surface Pill */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavPill"
                    className="clay-active-nav absolute inset-0 rounded-2xl"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    style={{ zIndex: 0 }}
                  />
                )}

                <div className="relative z-10 w-6.5 h-6.5 rounded-xl flex items-center justify-center shrink-0">
                  <Icon size={19} />
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -6, width: 0 }}
                      animate={{ opacity: 1, x: 0, width: "auto" }}
                      exit={{ opacity: 0, x: -6, width: 0 }}
                      transition={{ duration: 0.16 }}
                      className="relative z-10 whitespace-nowrap overflow-hidden text-left flex-1"
                      style={{ letterSpacing: "-0.15px" }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom: Tagline, Profile & Collapse Toggle ── */}
      <div className="mt-2 pt-2 border-t border-white/60 dark:border-white/10 shrink-0 flex flex-col gap-2">
        {/* ── 1-Click Role-Based Portal Switcher ── */}
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSwitchPortal?.(isClinician ? "patient" : "clinician")}
          title={isClinician ? "Switch to Patient Sanctuary" : "Switch to Clinician Workstation"}
          className={`w-full flex items-center ${
            isExpanded ? "justify-between px-2.5 py-2" : "justify-center p-2"
          } rounded-2xl cursor-pointer border-none outline-none transition-all shadow-sm ${
            isClinician
              ? "bg-gradient-to-r from-emerald-500/15 to-teal-500/10 hover:from-emerald-500/25 hover:to-teal-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
              : "bg-gradient-to-r from-purple-500/15 to-indigo-500/10 hover:from-purple-500/25 hover:to-indigo-500/20 text-[#7C3AED] dark:text-[#C7B5F3] border border-purple-500/20"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">{isClinician ? "🧘" : "🩺"}</span>
            {isExpanded && (
              <div className="flex flex-col text-left leading-tight min-w-0">
                <span className="text-[10.5px] font-extrabold truncate">
                  {isClinician ? "Patient Sanctuary" : "Clinician Lab"}
                </span>
                <span className="text-[9px] opacity-75 font-semibold">
                  {isClinician ? "Switch to Companion" : "Switch to EEG Lab"}
                </span>
              </div>
            )}
          </div>
          {isExpanded && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 shrink-0">
              ⇄
            </span>
          )}
        </motion.button>

        {/* Tagline from reference image */}
        {isExpanded && (
          <div className="px-1 text-left">
            <p className="text-[11px] font-medium text-[#8E88A4] dark:text-[#9E98B4] leading-tight m-0">
              {isClinician ? "Objective clinical telemetry." : "A kinder AI for brighter tomorrows."}
            </p>
          </div>
        )}

        {/* User Profile */}
        <div className={`flex items-center ${isExpanded ? "gap-2.5 px-1" : "justify-center"}`}>
          <motion.div
            whileHover={{ scale: 1.06 }}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #7B56DB, #5B30C9)",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: 12.5,
              boxShadow: "0 4px 12px rgba(123,86,219,0.35), inset 1px 1px 2px rgba(255,255,255,0.4)",
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}
            title={userName}
            onClick={() => onSelect("Settings")}
          >
            {avatarChar}
          </motion.div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -8, width: 0 }}
                animate={{ opacity: 1, x: 0, width: "auto" }}
                exit={{ opacity: 0, x: -8, width: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden whitespace-nowrap"
                style={{ minWidth: 0 }}
              >
                <div
                  className="text-[12px] font-bold text-[#2E294F] dark:text-[#FFFFFF] truncate"
                  style={{ letterSpacing: "-0.2px", maxWidth: 120 }}
                >
                  {userName}
                </div>
                <div
                  className="flex items-center gap-1.5"
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: isConnected ? "#10B981" : "#F59E0B",
                  }}
                >
                  <span
                    className="animate-pulse"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: isConnected ? "#10B981" : "#F59E0B",
                      display: "inline-block",
                    }}
                  />
                  {isConnected ? "Connected" : "Connecting..."}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isExpanded && (
          <div className="text-center flex flex-col gap-0.5">
            <button
              onClick={() => onSelect("Landing")}
              className="text-[9.5px] text-[#8E88A4] hover:text-[#7C3AED] dark:hover:text-[#C7B5F3] font-bold bg-transparent border-none cursor-pointer flex items-center justify-center gap-1"
            >
              <span>✨ Platform Overview</span>
            </button>
            <button
              onClick={() => onSelect("Privacy")}
              className="text-[9.5px] text-[#8E88A4] hover:text-[#7C3AED] dark:hover:text-[#C7B5F3] font-medium bg-transparent border-none cursor-pointer underline"
            >
              Privacy Notice
            </button>
          </div>
        )}

        {onLogout && (
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={onLogout}
            title="Logout"
            className={`clay-logout-btn w-full flex items-center ${
              isExpanded ? "justify-center gap-2 px-3" : "justify-center px-0"
            } py-1.5 cursor-pointer border-none outline-none rounded-xl text-[11px] font-bold`}
            style={{ letterSpacing: "-0.1px" }}
          >
            <LogOut style={{ width: 13, height: 13 }} />
            {isExpanded && <span>Logout</span>}
          </motion.button>
        )}

        {/* Tactile Horizontal Pill Collapse / Pin Toggle Button */}
        <div className="pt-1 flex items-center justify-center">
          <button
            onClick={() => {
              const next = !isPinned;
              setIsPinned(next);
              try {
                localStorage.setItem("aura_sidebar_pinned", String(next));
              } catch {}
            }}
            title={isPinned ? "Collapse sidebar" : "Pin sidebar open"}
            className="group w-full flex items-center justify-center gap-2 py-1.5 px-2 rounded-xl border border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer outline-none bg-transparent"
          >
            <div className="w-8 h-4 rounded-full bg-[#E5DFD7] dark:bg-[#252033] p-0.5 flex items-center shadow-inner relative transition-colors">
              <motion.div
                className="w-3 h-3 rounded-full bg-[#7C3AED] shadow-sm flex items-center justify-center text-white"
                animate={{ x: isExpanded ? 16 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
              >
                {isExpanded ? <ChevronLeft size={8} /> : <ChevronRight size={8} />}
              </motion.div>
            </div>
            {isExpanded && (
              <span className="text-[10px] font-bold text-[#8E88A4] dark:text-[#9E98B4] group-hover:text-[#7C3AED] dark:group-hover:text-[#C7B5F3] transition-colors">
                {isPinned ? "Collapse" : "Expand"}
              </span>
            )}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOBILE & TABLET BOTTOM NAVIGATION BAR
   ───────────────────────────────────────────────────────────────────────────── */
const MOBILE_PATIENT_ITEMS = [
  { id: "Dashboard", label: "Home", IconComponent: ClayHomeIcon },
  { id: "Chat", label: "Chat", IconComponent: ClayChatSidebarIcon },
  { id: "Voice Mode", label: "Voice", IconComponent: ClayVoiceSidebarIcon },
  { id: "Face-to-Face", label: "Face", IconComponent: ClayCameraSidebarIcon },
  { id: "Memory", label: "Memory", IconComponent: ClayHeartSidebarIcon },
  { id: "Analytics", label: "Stats", IconComponent: ClayAnalyticsSidebarIcon },
];

const MOBILE_CLINICIAN_ITEMS = [
  { id: "Clinician", label: "EEG Lab", IconComponent: ClayBrainIcon },
  { id: "Analytics", label: "Biomarkers", IconComponent: ClayAnalyticsSidebarIcon },
  { id: "Chat", label: "Simulate", IconComponent: ClayChatSidebarIcon },
  { id: "Memory", label: "Graph", IconComponent: ClayHeartSidebarIcon },
  { id: "Settings", label: "Config", IconComponent: ClaySettingsSidebarIcon },
];

export function ClayBottomNav({
  active,
  onSelect,
  portalMode = "patient",
}: {
  active: string;
  onSelect: (screen: string) => void;
  portalMode?: "patient" | "clinician";
}) {
  const items = portalMode === "clinician" ? MOBILE_CLINICIAN_ITEMS : MOBILE_PATIENT_ITEMS;

  return (
    <nav
      className="clay-card fixed bottom-2.5 left-3 right-3 lg:hidden flex items-center justify-around py-1.5 px-2 z-50 rounded-3xl"
      style={{
        boxShadow: "0 10px 30px rgba(180, 160, 200, 0.45)",
      }}
    >
      {items.map((item) => {
        const isActive =
          active === item.id ||
          (item.id === "Dashboard" && active === "Home");
        const Icon = item.IconComponent;

        return (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSelect(item.id)}
            className={`relative flex flex-col items-center justify-center p-1.5 rounded-2xl border-none outline-none cursor-pointer ${
              isActive ? "text-[#7C3AED] dark:text-[#C7B5F3]" : "text-[#8E88A4] dark:text-[#6E6882]"
            }`}
            style={{ background: "transparent", minWidth: 44 }}
          >
            {isActive && (
              <motion.div
                layoutId="activeBottomNav"
                className="absolute inset-0 bg-[#7C3AED]/15 dark:bg-[#7C3AED]/30 rounded-2xl"
                transition={{ type: "spring", stiffness: 450, damping: 30 }}
              />
            )}
            <div className="relative z-10">
              <Icon size={20} />
            </div>
            <span className="relative z-10 text-[9px] font-bold mt-0.5">{item.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
