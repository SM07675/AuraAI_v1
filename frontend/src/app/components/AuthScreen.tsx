import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, User, ArrowRight, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";
import { GlassCard } from "./glass-card";

interface AuthScreenProps {
  onLoginSuccess: (user: { name: string; email: string; isNewUser?: boolean }) => void;
  onGuestAccess: () => void;
}

export function AuthScreen({ onLoginSuccess, onGuestAccess }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password || (mode === "signup" && !name)) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);

    // Simulate authentication delay for smooth UX
    setTimeout(() => {
      setLoading(false);
      // Retrieve any previous name associated with this email
      let userName = name;
      if (mode === "login") {
        try {
          const savedProfile = localStorage.getItem(`aura_profile_${email}`);
          if (savedProfile) {
            const parsed = JSON.parse(savedProfile);
            if (parsed.name) userName = parsed.name;
          }
        } catch (e) {}
        if (!userName) userName = email.split("@")[0] || "User";
      }

      onLoginSuccess({ name: userName, email, isNewUser: mode === "signup" });
    }, 600);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[72vh] px-4 py-8 select-none">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-4 clay-pill"
            style={{ color: "#7B59DC", fontWeight: 700, fontSize: 12 }}
          >
            <Sparkles size={14} className="text-[#9A80E5] animate-pulse" />
            AURA AI — EMOTION & MINDSET COMPANION
          </motion.div>
          <h1 className="text-3xl font-extrabold text-[#2D2D42] tracking-tight mb-2">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-xs text-[#7A7A96] max-w-xs mx-auto font-medium">
            Experience intelligent, emotion-aware conversation tailored to your mood and goals.
          </p>
        </div>

        {/* Clay Card Container */}
        <div className="clay-card p-7" style={{ borderRadius: 32 }}>
          {/* Mode Switch Tabs */}
          <div className="clay-track-inset flex p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-full transition-all cursor-pointer border-none outline-none ${
                mode === "login"
                  ? "clay-active-nav"
                  : "text-[#7A7A96] hover:text-[#2D2D42]"
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
              className={`flex-1 py-2 text-xs font-bold rounded-full transition-all cursor-pointer border-none outline-none ${
                mode === "signup"
                  ? "clay-active-nav"
                  : "text-[#7A7A96] hover:text-[#2D2D42]"
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="name-input"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className="block text-[11px] font-bold text-[#4B4B60] uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <div className="relative flex items-center">
                    <User size={16} className="absolute left-3.5 text-[#9E9EB2]" />
                    <input
                      type="text"
                      placeholder="e.g. Atharva Palekar"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="clay-input w-full pl-10 pr-4 py-2.5 text-xs font-semibold"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-[11px] font-bold text-[#4B4B60] uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="absolute left-3.5 text-[#9E9EB2]" />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="clay-input w-full pl-10 pr-4 py-2.5 text-xs font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#4B4B60] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock size={16} className="absolute left-3.5 text-[#9E9EB2]" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="clay-input w-full pl-10 pr-4 py-2.5 text-xs font-semibold"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="clay-card-flat text-xs text-rose-600 font-semibold p-2.5 text-center"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              type="submit"
              className="clay-button mt-2 w-full py-3 rounded-full font-bold text-xs text-[#7B59DC] cursor-pointer flex items-center justify-center gap-2 border-none outline-none"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-[#7B59DC] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In to Aura" : "Create My Account"}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </motion.button>
          </form>

          {/* Quick Demo Access Divider */}
          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-white/80"></div>
            <span className="flex-shrink mx-3 text-[10px] font-bold text-[#9E9EB2] uppercase tracking-widest">
              OR
            </span>
            <div className="flex-grow border-t border-white/80"></div>
          </div>

          {/* Instant Guest / Demo Button */}
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onGuestAccess}
            className="clay-card-flat w-full py-2.5 rounded-full text-[#4B4B60] font-bold text-xs cursor-pointer flex items-center justify-center gap-2 border-none outline-none"
          >
            <ShieldCheck size={16} className="text-[#10B981]" />
            <span>Continue as Guest (Instant Demo)</span>
          </motion.button>
        </div>

        {/* Security badge footer */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-[#7A7A96] font-semibold">
          <CheckCircle2 size={14} className="text-[#10B981]" />
          <span>Encrypted Session · Privacy Guaranteed</span>
        </div>
      </motion.div>
    </div>
  );
}
