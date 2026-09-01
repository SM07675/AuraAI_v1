import React from "react";
import { motion } from "motion/react";
import { LogOut } from "lucide-react";
import {
  ClayAuraFlowerIcon,
  ClayHomeIcon,
  ClayChatSidebarIcon,
  ClayVoiceSidebarIcon,
  ClayCameraSidebarIcon,
  ClayHeartSidebarIcon,
  ClaySmileySidebarIcon,
  ClayAnalyticsSidebarIcon,
  ClayStarSidebarIcon,
  ClaySettingsSidebarIcon,
} from "./clay-icons";

interface ClaySidebarProps {
  active: string;
  onSelect: (screen: string) => void;
  user: { name: string; email: string } | null;
  onLogout?: () => void;
}

const NAV_ITEMS = [
  { id: "Dashboard", label: "Dashboard", IconComponent: ClayHomeIcon },
  { id: "Chat", label: "Chat", IconComponent: ClayChatSidebarIcon },
  { id: "Voice Mode", label: "Voice Mode", IconComponent: ClayVoiceSidebarIcon },
  { id: "Face-to-Face", label: "Face-to-Face", IconComponent: ClayCameraSidebarIcon },
  { id: "Memory", label: "Memory", IconComponent: ClayHeartSidebarIcon },
  { id: "Emotion", label: "Emotion", IconComponent: ClaySmileySidebarIcon },
  { id: "Analytics", label: "Analytics", IconComponent: ClayAnalyticsSidebarIcon },
  { id: "Interests", label: "Interests", IconComponent: ClayStarSidebarIcon },
  { id: "Settings", label: "Settings", IconComponent: ClaySettingsSidebarIcon },
];

export function ClaySidebar({ active, onSelect, user, onLogout }: ClaySidebarProps) {
  const userName = user?.name || "athavpalekar";
  const avatarChar = userName.charAt(0).toUpperCase();

  return (
    <aside
      className="clay-sidebar hidden lg:flex flex-col justify-between shrink-0 select-none"
      style={{
        width: 198,
        height: "calc(100vh - 28px)",
        maxHeight: "calc(100vh - 28px)",
        margin: "14px 0 14px 14px",
        padding: "16px 12px 14px 12px",
      }}
    >
      {/* ── Top: Branding ── */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center gap-2.5 px-2 mb-3.5 cursor-pointer shrink-0" onClick={() => onSelect("Dashboard")}>
          {/* 3D Lavender flower logo */}
          <ClayAuraFlowerIcon size={34} />
          <span
            className="text-[20px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF]"
            style={{
              letterSpacing: "-0.5px",
            }}
          >
            Aura
          </span>
        </div>

        {/* ── Navigation Items ── */}
        <nav className="flex flex-col gap-1 overflow-y-auto scrollbar-none min-h-0 flex-1 pr-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              active === item.id ||
              (item.id === "Dashboard" && active === "Home");
            const Icon = item.IconComponent;

            return (
              <motion.button
                key={item.id}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(item.id)}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-2xl text-[12.5px] font-bold cursor-pointer border-none outline-none transition-colors duration-150 shrink-0 ${
                  isActive ? "text-white" : "text-[#777287] hover:text-[#2E294F] dark:text-[#9E98B4] dark:hover:text-[#F3EFFC]"
                }`}
                style={{ background: "transparent" }}
              >
                {/* Smooth Animated Clay Surface Pill */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavPill"
                    className="clay-active-nav absolute inset-0 rounded-2xl"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    style={{ zIndex: 0 }}
                  />
                )}

                <div
                  className="relative z-10 w-6.5 h-6.5 rounded-xl flex items-center justify-center shrink-0"
                >
                  <Icon size={18} />
                </div>
                <span className="relative z-10" style={{ letterSpacing: "-0.15px" }}>{item.label}</span>
              </motion.button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom: User Profile ── */}
      <div className="mt-3 pt-3 border-t border-white/60 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 mb-3 px-1">
          <div
            className="w-8.5 h-8.5 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, #7B56DB, #5B30C9)",
              color: "#FFFFFF",
              fontWeight: 800,
              fontSize: 12.5,
              boxShadow: "0 4px 10px rgba(123,86,219,0.4), inset 1px 1px 2px rgba(255,255,255,0.4)",
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}
          >
            {avatarChar}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="text-[12px] font-bold text-[#2E294F] dark:text-[#FFFFFF] truncate"
              style={{
                letterSpacing: "-0.2px",
              }}
            >
              {userName}
            </div>
            <div
              className="flex items-center gap-1"
              style={{ fontSize: 9.5, fontWeight: 600, color: "#10B981" }}
            >
              <span
                className="animate-pulse"
                style={{
                  width: 4.5,
                  height: 4.5,
                  borderRadius: 999,
                  background: "#10B981",
                  display: "inline-block",
                }}
              />
              Online
            </div>
          </div>
        </div>

        {onLogout && (
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={onLogout}
            className="clay-logout-btn w-full flex items-center justify-center gap-2 cursor-pointer border-none outline-none"
            style={{
              padding: "8px 14px",
              borderRadius: 16,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "-0.1px",
            }}
          >
            <LogOut style={{ width: 13, height: 13 }} />
            Logout
          </motion.button>
        )}
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOBILE & TABLET BOTTOM NAVIGATION BAR
   ───────────────────────────────────────────────────────────────────────────── */
const MOBILE_NAV_ITEMS = [
  { id: "Dashboard", label: "Home", IconComponent: ClayHomeIcon },
  { id: "Chat", label: "Chat", IconComponent: ClayChatSidebarIcon },
  { id: "Voice Mode", label: "Voice", IconComponent: ClayVoiceSidebarIcon },
  { id: "Face-to-Face", label: "Face", IconComponent: ClayCameraSidebarIcon },
  { id: "Emotion", label: "Emotion", IconComponent: ClaySmileySidebarIcon },
  { id: "Settings", label: "Settings", IconComponent: ClaySettingsSidebarIcon },
];

export function ClayBottomNav({ active, onSelect }: { active: string; onSelect: (screen: string) => void }) {
  return (
    <nav
      className="fixed bottom-3 inset-x-3 z-50 flex lg:hidden items-center justify-around clay-card py-2 px-1.5 rounded-3xl select-none"
      style={{
        boxShadow: "0 10px 28px rgba(180, 160, 230, 0.42), 0 -2px 10px rgba(255,255,255,0.95)",
      }}
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const isActive = active === item.id || (item.id === "Dashboard" && active === "Home");
        const Icon = item.IconComponent;

        return (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.92 }}
            onClick={() => onSelect(item.id)}
            className="relative flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl cursor-pointer border-none outline-none"
            style={{ background: "transparent" }}
          >
            {isActive && (
              <motion.div
                layoutId="mobileActivePill"
                className="clay-active-nav absolute inset-0 rounded-2xl"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                style={{ zIndex: 0 }}
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <Icon size={18} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: isActive ? "#FFFFFF" : "#777287",
                  letterSpacing: "-0.1px",
                }}
              >
                {item.label}
              </span>
            </div>
          </motion.button>
        );
      })}
    </nav>
  );
}
