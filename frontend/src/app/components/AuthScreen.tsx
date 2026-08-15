import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, User, ArrowRight, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";
import { GlassCard } from "./glass-card";

interface AuthScreenProps {
  onLoginSuccess: (user: { name: string; email: string }) => void;
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
      const userName = mode === "signup" ? name : email.split("@")[0] || "Hardik";
      onLoginSuccess({ name: userName, email });
    }, 800);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[72vh] px-4 py-8">
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
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-4 liquid-glass shadow-sm"
            style={{ color: "#0284C7", fontWeight: 700, fontSize: 13 }}
          >
            <Sparkles size={15} className="text-sky-500 animate-pulse" />
            AURA AI — EMOTION & MINDSET COMPANION
          </motion.div>
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-2">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-sm text-slate-600 max-w-xs mx-auto">
            Experience intelligent, emotion-aware conversation tailored to your mood and goals.
          </p>
        </div>

        {/* Liquid Glass Card Container */}
        <GlassCard style={{ padding: "32px 28px", borderRadius: "28px" }}>
          {/* Mode Switch Tabs */}
          <div className="flex rounded-2xl p-1 mb-6 bg-slate-200/50 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-sky-600 shadow-md"
                  : "text-slate-500 hover:text-slate-800"
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
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                mode === "signup"
                  ? "bg-white text-sky-600 shadow-md"
                  : "text-slate-500 hover:text-slate-800"
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
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <div className="relative flex items-center">
                    <User size={18} className="absolute left-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Hardik Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 transition-all text-slate-800 placeholder-slate-400 font-medium"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail size={18} className="absolute left-3.5 text-slate-400" />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 transition-all text-slate-800 placeholder-slate-400 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock size={18} className="absolute left-3.5 text-slate-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 transition-all text-slate-800 placeholder-slate-400 font-medium"
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-center"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              type="submit"
              className="mt-2 w-full py-3.5 rounded-xl font-bold text-white shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all"
              style={{
                background: "linear-gradient(135deg, #0284C7, #38BDF8)",
                boxShadow: "0 8px 24px rgba(2, 132, 199, 0.35)",
              }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In to Aura" : "Create My Account"}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </motion.button>
          </form>

          {/* Quick Demo Access Divider */}
          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-slate-300/60"></div>
            <span className="flex-shrink mx-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
              OR
            </span>
            <div className="flex-grow border-t border-slate-300/60"></div>
          </div>

          {/* Instant Guest / Demo Button */}
          <motion.button
            whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.95)" }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onGuestAccess}
            className="w-full py-3 rounded-xl border border-sky-200 bg-white/80 text-sky-700 font-semibold text-sm shadow-sm cursor-pointer flex items-center justify-center gap-2 transition-all hover:border-sky-400"
          >
            <ShieldCheck size={17} className="text-sky-500" />
            <span>Continue as Guest (Instant Demo)</span>
          </motion.button>
        </GlassCard>

        {/* Security badge footer */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-500 font-medium">
          <CheckCircle2 size={14} className="text-sky-600" />
          <span>Encrypted Session · Privacy Guaranteed</span>
        </div>
      </motion.div>
    </div>
  );
}
