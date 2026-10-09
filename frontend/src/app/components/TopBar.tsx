import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { ClaySunIcon, ClaySearchIcon } from "./clay-icons";
import { useTheme } from "../context/ThemeContext";
import { Sun } from "lucide-react";

interface TopBarProps {
  userName?: string;
  isConnected?: boolean;
  onSearch?: (query: string) => void;
  onAvatarClick?: () => void;
}

export function TopBar({ userName, isConnected = true, onSearch, onAvatarClick }: TopBarProps) {
  const { isDark, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = userName ? userName.split(" ")[0] : "Atharv";
  const avatarChar = displayName.charAt(0).toUpperCase();

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

      {/* Right Utilities: Search Pill, Theme Toggle & Avatar Circle */}
      <div className="flex items-center gap-2.5">
        {/* Soft Clay Search Pill with ⌘ K badge */}
        <form
          onSubmit={handleSearchSubmit}
          className="clay-pill flex items-center gap-2 px-3.5 py-1.5 w-48 sm:w-60 transition-all focus-within:w-60 sm:focus-within:w-72 focus-within:ring-2 focus-within:ring-[#7C3AED]/30"
          style={{ borderRadius: 999 }}
        >
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask Aura anything..."
            className="bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none text-[12.5px] text-[#2E2544] dark:text-[#FFFFFF] placeholder-[#7A748A] dark:placeholder-[#8E87A4] w-full font-medium"
            style={{ letterSpacing: "-0.1px" }}
          />
          <div
            className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-[#8E88A4] dark:text-[#9E98B4] bg-black/5 dark:bg-white/10 shrink-0 select-none pointer-events-none"
            title="Press ⌘ K to search"
          >
            ⌘ K
          </div>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            className="bg-transparent border-none outline-none p-0 cursor-pointer flex items-center justify-center shrink-0 text-[#7C3AED] dark:text-[#C7B5F3]"
            title="Ask Aura"
          >
            <ClaySearchIcon size={16} />
          </motion.button>
        </form>

        {/* Soft 3D Clay Theme Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.08, rotate: 15 }}
          whileTap={{ scale: 0.92 }}
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="clay-theme-toggle border-none outline-none cursor-pointer"
        >
          {isDark ? (
            <ClaySunIcon size={19} />
          ) : (
            <Sun size={18} className="text-amber-500" />
          )}
        </motion.button>

        {/* User Initial Circle Avatar (Reference Image Header) */}
        <motion.div
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          onClick={onAvatarClick}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer text-white font-bold text-[12px] select-none"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
            boxShadow: "0 2px 8px rgba(124, 58, 237, 0.35)",
            border: "1.5px solid rgba(255, 255, 255, 0.3)",
          }}
          title={displayName}
        >
          {avatarChar}
        </motion.div>
      </div>
    </div>
  );
}
