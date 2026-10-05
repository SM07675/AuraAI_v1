import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Search, Sun, Moon, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

interface TopBarProps {
  userName?: string;
  isConnected?: boolean;
  onSearch?: (query: string) => void;
  onAvatarClick?: () => void;
}

export function TopBar({ userName, isConnected: connectedProp, onSearch, onAvatarClick }: TopBarProps) {
  const { isDark, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const inputRef = useRef<HTMLInputElement>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = userName ? userName.split(" ")[0] : "Friend";
  const avatarChar = displayName.charAt(0).toUpperCase();

  // True connection state probe
  useEffect(() => {
    if (connectedProp !== undefined) {
      setConnection(connectedProp ? "connected" : "offline");
      return;
    }
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const response = await fetch("/api/v1/health", { cache: "no-store" });
        if (!cancelled) {
          setConnection(response.ok ? "connected" : "offline");
        }
      } catch {
        if (!cancelled) setConnection("offline");
      }
    };

    checkHealth();
    const timer = window.setInterval(checkHealth, 25000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connectedProp]);

  // Keyboard shortcut Cmd+K / Ctrl+K for search
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
    <header className="liquid-glass-elevated rounded-[22px] px-4 py-2.5 mb-3 flex items-center justify-between select-none z-20">
      {/* ── Left: Greeting & Real Connection Indicator ── */}
      <div className="flex items-center gap-3">
        {/* Real Connection Status Pill */}
        <div
          className={`liquid-pill px-3 py-1 gap-2 text-[12px] font-semibold transition-colors ${
            connection === "connected"
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : connection === "offline"
              ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
              : "text-amber-400 bg-amber-500/10 border-amber-500/20"
          }`}
          title={
            connection === "connected"
              ? "Backend API and WebSocket healthy"
              : connection === "offline"
              ? "Cannot connect to Aura backend"
              : "Verifying backend health..."
          }
        >
          <span className="relative flex h-2 w-2">
            {connection === "connected" ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </>
            ) : connection === "offline" ? (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse" />
            )}
          </span>
          <span>
            {connection === "connected"
              ? "Aura online"
              : connection === "offline"
              ? "Offline"
              : "Connecting..."}
          </span>
        </div>

        {/* Calm Human Greeting */}
        <span className="hidden md:inline-block text-[13px] font-medium text-slate-600 dark:text-slate-300">
          {getGreeting()},{" "}
          <span className="font-semibold text-violet-600 dark:text-violet-300">
            {displayName}
          </span>
        </span>
      </div>

      {/* ── Right Utilities: Search, Theme Toggle & Avatar ── */}
      <div className="flex items-center gap-2.5">
        {/* Search Input Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="liquid-input flex items-center gap-2 px-3 py-1.5 w-44 sm:w-64 transition-all"
        >
          <Search size={15} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or ask anything..."
            className="bg-transparent border-none outline-none text-[12.5px] text-slate-800 dark:text-white placeholder:text-slate-400 w-full font-medium"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-400 bg-white/10 dark:bg-white/5 border border-white/10 shrink-0">
            ⌘K
          </kbd>
        </form>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="liquid-button w-8 h-8 rounded-full text-slate-400 hover:text-amber-400 dark:text-slate-300 dark:hover:text-amber-300"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? (
            <Sun size={16} className="text-amber-300" />
          ) : (
            <Moon size={16} className="text-indigo-600" />
          )}
        </button>

        {/* Avatar / Profile Control */}
        <div
          onClick={onAvatarClick}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer text-white font-bold text-xs select-none transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)",
            boxShadow: "0 2px 8px rgba(124, 58, 237, 0.4)",
            border: "1.5px solid rgba(255, 255, 255, 0.3)",
          }}
          title={`Profile: ${displayName}`}
        >
          {avatarChar}
        </div>
      </div>
    </header>
  );
}
