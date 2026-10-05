import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, User, ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Compass } from "lucide-react";
import { authService, AuthUser } from "../services/authService";
import { analytics } from "../services/analytics";
import { AuraBrandLogo } from "./AuraBrandLogo";

interface AuthScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
  onGuestAccess: () => void;
  onNavigateToPrivacy?: () => void;
  onBackToLanding?: () => void;
  initialMode?: "login" | "signup";
}

export function AuthScreen({
  onLoginSuccess,
  onGuestAccess,
  onNavigateToPrivacy,
  onBackToLanding,
  initialMode = "login",
}: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authErr = params.get("auth_error");
    if (authErr) {
      setError(decodeURIComponent(authErr));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password || (mode === "signup" && !name)) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const { user } = await authService.register(name, email, password);
        analytics.trackRegister("email");
        onLoginSuccess(user);
      } else {
        const { user } = await authService.login(email, password);
        analytics.trackLogin("email");
        onLoginSuccess(user);
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = () => {
    setGoogleLoading(true);
    analytics.track("google_auth_initiated");
    authService.initiateGoogleLogin();
  };

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center px-4 py-8 select-none z-10">
      {onBackToLanding && (
        <div className="mb-6 flex justify-center w-full">
          <button
            onClick={onBackToLanding}
            className="liquid-button px-4 py-2 text-xs text-slate-300 hover:text-white"
          >
            <span>← Back to Platform Overview</span>
          </button>
        </div>
      )}

      {/* ── Single Premium Liquid Glass Authentication Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md liquid-glass-elevated rounded-[32px] p-8 shadow-2xl relative overflow-hidden"
      >
        {/* Subtle Ambient Top Accent Glow */}
        <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 w-56 h-56 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />

        {/* Brand Symbol & Title */}
        <div className="flex flex-col items-center text-center mb-6 relative z-10">
          <AuraBrandLogo size={48} showWordmark={false} />
          <h1 className="text-[24px] font-extrabold text-slate-900 dark:text-white mt-3 m-0 tracking-tight">
            Welcome to Aura
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 m-0">
            Your affective AI companion for calm and awareness
          </p>
        </div>

        {/* Mode Switcher: Sign In vs Register */}
        <div className="liquid-glass p-1 rounded-2xl flex items-center gap-1 mb-5 relative z-10">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl cursor-pointer border-none outline-none transition-all ${
              mode === "login"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-white bg-transparent"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl cursor-pointer border-none outline-none transition-all ${
              mode === "signup"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-white bg-transparent"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 relative z-10">
          {mode === "signup" && (
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Full Name
              </label>
              <div className="liquid-input flex items-center gap-2.5 px-3.5 py-2.5">
                <User size={15} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  required={mode === "signup"}
                  className="bg-transparent border-none outline-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400 w-full"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              Email Address
            </label>
            <div className="liquid-input flex items-center gap-2.5 px-3.5 py-2.5">
              <Mail size={15} className="text-slate-400 shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="bg-transparent border-none outline-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400 w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              Password
            </label>
            <div className="liquid-input flex items-center gap-2.5 px-3.5 py-2.5">
              <Lock size={15} className="text-slate-400 shrink-0" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="bg-transparent border-none outline-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400 w-full"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="liquid-button-primary w-full py-3 text-xs font-semibold gap-2 mt-2 disabled:opacity-50"
          >
            <span>{loading ? "Authenticating..." : mode === "signup" ? "Create Account" : "Sign In"}</span>
            <ArrowRight size={14} />
          </motion.button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-4 relative z-10">
          <div className="flex-1 h-px bg-white/10 dark:bg-white/5" />
          <span className="px-3 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Or
          </span>
          <div className="flex-1 h-px bg-white/10 dark:bg-white/5" />
        </div>

        {/* Guest Exploration Option */}
        <div className="flex flex-col gap-2 relative z-10">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onGuestAccess}
            className="liquid-button w-full py-2.5 text-xs text-slate-300 hover:text-white gap-2"
          >
            <Compass size={15} className="text-cyan-400" />
            <span>Continue as Guest (Instant Demo)</span>
          </motion.button>
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-5 m-0 relative z-10">
          Your personal data is encrypted and preserved with strict privacy standards.
        </p>
      </motion.div>
    </div>
  );
}
