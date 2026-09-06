import React, { useState } from "react";
import { motion } from "motion/react";
import { ClaySunIcon, ClaySearchIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";
import { Sun } from "lucide-react";

interface TopBarProps {
  userName?: string;
  isConnected?: boolean;
  onSearch?: (query: string) => void;
}

export function TopBar({ userName, isConnected = true, onSearch }: TopBarProps) {
  const { isDark, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = userName ? userName.split(" ")[0] : "Friend";

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery.trim());
      setSearchQuery("");
    }
  };

  return (
    <div className="flex items-center justify-between w-full mb-3 pt-1 px-1 select-none gap-2">
      {/* Left: Greeting & Status Pill */}
      <div className="flex items-center gap-2.5">
        <div
          className="clay-pill px-3.5 py-1.5 inline-flex items-center gap-2 text-[12px] font-bold text-[#2E2544] dark:text-[#E8E4F2]"
          style={{ borderRadius: 999 }}
        >
          <span className="relative flex h-2.5 w-2.5">
            {isConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_#10B981]"></span>
              </>
            ) : (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_8px_#F59E0B]"></span>
              </>
            )}
          </span>
          <span style={{ letterSpacing: "-0.1px" }}>
            {isConnected ? "Aura is online" : "Connecting..."}
          </span>
        </div>

        <span className="hidden md:inline-block text-[12.5px] font-extrabold text-[#777287] dark:text-[#A39EB2]">
          {getGreeting()}, <span className="text-[#7C3AED] dark:text-[#C7B5F3]">{displayName}</span> 🌱
        </span>
      </div>

      {/* Right Utilities: Theme Toggle & Conversational Search */}
      <div className="flex items-center gap-2.5">
        {/* Soft 3D Clay Theme Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.08, rotate: 15 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="clay-theme-toggle border-none outline-none cursor-pointer"
        >
          {isDark ? (
            <ClaySunIcon size={20} />
          ) : (
            <Sun size={19} className="text-amber-500" />
          )}
        </motion.button>

        {/* Soft Clay Search Pill with Quick-Ask */}
        <form
          onSubmit={handleSearchSubmit}
          className="clay-pill flex items-center gap-2 px-3.5 py-1.5 w-52 sm:w-64 transition-all focus-within:w-64 sm:focus-within:w-76 focus-within:ring-2 focus-within:ring-[#7C3AED]/30"
          style={{ borderRadius: 999 }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask Aura anything..."
            className="bg-transparent border-none outline-none text-[12px] text-[#2E2544] dark:text-[#E8E4F2] placeholder-[#9E98AA] dark:placeholder-[#6E6882] w-full font-medium"
            style={{ letterSpacing: "-0.1px" }}
          />
          <motion.button
            type="submit"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            className="bg-transparent border-none outline-none p-0 cursor-pointer flex items-center justify-center shrink-0"
            title="Ask Aura"
          >
            <ClaySearchIcon size={17} />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
