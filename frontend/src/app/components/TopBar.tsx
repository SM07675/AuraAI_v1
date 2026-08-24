import React from "react";
import { motion } from "motion/react";
import { ClaySunIcon, ClaySearchIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";
import { Moon, Sun } from "lucide-react";

export function TopBar() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="flex items-center justify-between w-full mb-5 pt-1 px-1 select-none">
      {/* Status Pill: Aura is online */}
      <div
        className="clay-pill px-3.5 py-1.5 inline-flex items-center gap-2 text-[12px] font-bold text-[#2E2544] dark:text-[#E8E4F2]"
        style={{ borderRadius: 999 }}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_6px_#10B981]"></span>
        </span>
        <span style={{ letterSpacing: "-0.1px" }}>Aura is online</span>
      </div>

      {/* Right Utilities: Theme Toggle & Search */}
      <div className="flex items-center gap-3">
        {/* Soft 3D Clay Theme Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.08, rotate: 15 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="clay-theme-toggle border-none outline-none"
        >
          {isDark ? (
            <ClaySunIcon size={20} />
          ) : (
            <Sun size={19} className="text-amber-500" />
          )}
        </motion.button>

        {/* Soft Clay Search Pill */}
        <div
          className="clay-pill flex items-center gap-2.5 px-4 py-2 w-64"
          style={{ borderRadius: 999 }}
        >
          <input
            type="text"
            placeholder="Search or ask Aura..."
            className="bg-transparent border-none outline-none text-[12px] text-[#2E2544] dark:text-[#E8E4F2] placeholder-[#9E98AA] dark:placeholder-[#6E6882] w-full font-medium"
            style={{ letterSpacing: "-0.1px" }}
          />
          <ClaySearchIcon size={18} />
        </div>
      </div>
    </div>
  );
}

