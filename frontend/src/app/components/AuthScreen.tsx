import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, Lock, User, ArrowRight, Sparkles, CheckCircle2, ShieldCheck, Shield } from "lucide-react";
import { authService, AuthUser } from "../services/authService";
import { analytics } from "../services/analytics";

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
  const [role, setRole] = useState<"patient" | "clinician">("patient");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if redirected from Google with an error
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
        const { user } = await authService.register(name, email, password, role);
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
    <div className="w-full min-h-full flex flex-col items-center justify-start px-4 pt-8 sm:pt-12 pb-24 select-none">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md flex flex-col items-center"
      >
        {onBackToLanding && (
          <div className="mb-6 flex justify-center w-full">
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold text-[#A78BFA] hover:text-white bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.16] shadow-sm cursor-pointer transition-all duration-200 active:scale-95 hover:shadow-purple-500/10"
            >
              <span>← Back to Platform Overview</span>
            </button>
          </div>
        )}

        {/* Brand Header */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-3 clay-pill"
            style={{ color: "#7B59DC", fontWeight: 700, fontSize: 12 }}
          >
            <Sparkles size={14} className="text-[#9A80E5] animate-pulse" />
            AURA AI • EMOTION & MINDSET COMPANION
          </motion.div>
          <h1 className="text-[26px] sm:text-[30px] font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] tracking-tight mb-1.5">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-xs text-[#7A7A96] dark:text-[#9E98B4] max-w-xs mx-auto font-medium">
            Multimodal affective companion with real-time FACS facial tracking & long-term memory.
          </p>
        </div>

        {/* Clay Card Container */}
        <div className="clay-card p-6 sm:p-7" style={{ borderRadius: 28 }}>
          {/* Mode Switch Tabs */}
          <div className="clay-track-inset flex p-1 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-full transition-all cursor-pointer border-none outline-none ${
                mode === "login"
                  ? "clay-active-nav"
                  : "text-[#7A7A96] hover:text-[#2D2D42] dark:hover:text-[#FFFFFF]"
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
                  : "text-[#7A7A96] hover:text-[#2D2D42] dark:hover:text-[#FFFFFF]"
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-3.5"
                >
                  <div>
                    <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <div className="relative flex items-center">
                      <User size={15} className="absolute left-3 text-[#9E9EB2]" />
                      <input
                        type="text"
                        placeholder="e.g. Atharva Palekar"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="clay-input w-full pl-9 pr-4 py-2 text-xs font-semibold"
                        required={mode === "signup"}
                      />
                    </div>
                  </div>

                  {/* Role Selector Pill */}
                  <div>
                    <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1.5">
                      Select Portal Purpose
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRole("patient")}
                        className={`p-2.5 rounded-2xl flex flex-col items-center text-center gap-1 border-none cursor-pointer transition-all ${
                          role === "patient"
                            ? "clay-button ring-2 ring-[#7B59DC]"
                            : "clay-card-flat opacity-75 hover:opacity-100"
                        }`}
                      >
                        <span className="text-lg">🧘</span>
                        <span className="text-xs font-extrabold text-[#2D2D42] dark:text-[#F3F0FF]">
                          Patient Sanctuary
                        </span>
                        <span className="text-[10px] text-[#7A7A96] dark:text-[#A9A4BC] leading-tight font-medium">
                          Affective wellness & companion
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRole("clinician")}
                        className={`p-2.5 rounded-2xl flex flex-col items-center text-center gap-1 border-none cursor-pointer transition-all ${
                          role === "clinician"
                            ? "clay-button ring-2 ring-[#7B59DC]"
                            : "clay-card-flat opacity-75 hover:opacity-100"
                        }`}
                      >
                        <span className="text-lg">🩺</span>
                        <span className="text-xs font-extrabold text-[#2D2D42] dark:text-[#F3F0FF]">
                          Clinician Lab
                        </span>
                        <span className="text-[10px] text-[#7A7A96] dark:text-[#A9A4BC] leading-tight font-medium">
                          EEG topomap & triage
                        </span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail size={15} className="absolute left-3 text-[#9E9EB2]" />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="clay-input w-full pl-9 pr-4 py-2 text-xs font-semibold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10.5px] font-bold text-[#4B4B60] dark:text-[#C7B5F3] uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock size={15} className="absolute left-3 text-[#9E9EB2]" />
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="clay-input w-full pl-9 pr-4 py-2 text-xs font-semibold"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="clay-card-flat text-xs text-rose-600 dark:text-rose-400 font-semibold p-2.5 text-center"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.015, y: -1 }}
              whileTap={{ scale: 0.985 }}
              disabled={loading}
              type="submit"
              className="clay-button mt-1.5 w-full py-2.5 rounded-full font-bold text-xs text-[#7B59DC] cursor-pointer flex items-center justify-center gap-2 border-none outline-none"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-[#7B59DC] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In with Email" : "Create Account"}</span>
                  <ArrowRight size={15} />
                </>
              )}
            </motion.button>
          </form>

          {/* Social OAuth Divider */}
          <div className="relative flex py-3.5 items-center">
            <div className="flex-grow border-t border-black/10 dark:border-white/10"></div>
            <span className="flex-shrink mx-3 text-[10px] font-bold text-[#9E9EB2] uppercase tracking-widest">
              OR
            </span>
            <div className="flex-grow border-t border-black/10 dark:border-white/10"></div>
          </div>

          {/* Google OAuth Button */}
          <motion.button
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.985 }}
            type="button"
            disabled={googleLoading}
            onClick={handleGoogleClick}
            className="clay-card-flat w-full py-2.5 rounded-full text-[#2D2D42] dark:text-[#FFFFFF] font-bold text-xs cursor-pointer flex items-center justify-center gap-2.5 border-none outline-none mb-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {googleLoading ? (
              <div className="w-4 h-4 border-2 border-[#7B59DC] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </motion.button>

          {/* Instant Guest Button */}
          <motion.button
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.985 }}
            type="button"
            onClick={onGuestAccess}
            className="clay-card-flat w-full py-2.5 rounded-full text-[#6E6A80] dark:text-[#B7B1C8] font-bold text-xs cursor-pointer flex items-center justify-center gap-2 border-none outline-none"
          >
            <ShieldCheck size={15} className="text-[#10B981]" />
            <span>Continue as Guest (Instant Demo)</span>
          </motion.button>

          {/* DPDP Privacy Policy notice */}
          <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 text-center text-[10.5px] text-[#7A7A96] dark:text-[#9E98B4]">
            By continuing, you acknowledge our{" "}
            <button
              type="button"
              onClick={onNavigateToPrivacy}
              className="text-[#7B59DC] dark:text-[#B794F6] underline font-bold bg-transparent border-none p-0 cursor-pointer"
            >
              Privacy Policy & DPDP Data Rights
            </button>
            .
          </div>
        </div>

        {/* Security badge footer */}
        <div className="flex items-center justify-center gap-2 mt-5 text-xs text-[#7A7A96] dark:text-[#9E98B4] font-medium">
          <CheckCircle2 size={14} className="text-[#10B981]" />
          <span>Encrypted Session • DPDP Act 2023 Compliant</span>
        </div>
      </motion.div>
    </div>
  );
}
