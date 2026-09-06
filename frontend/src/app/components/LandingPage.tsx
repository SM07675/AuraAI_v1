import React, { useState, useEffect, useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  AnimatePresence,
} from "motion/react";
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  Play,
  Pause,
  Volume2,
  Mic,
  Eye,
  Brain,
  Heart,
  Activity,
  Wind,
  Layers,
  Sparkles,
  ChevronDown,
  Sun,
  Moon,
  Clock,
  User,
  Sliders,
  Check,
  Radio,
  FileText,
} from "lucide-react";
import auraMascotPng from "../../assets/aura-mascot-3d.png";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";

interface LandingPageProps {
  onGetStarted: (mode?: "login" | "register") => void;
  onTryGuestDemo: () => void;
  onNavigateToPrivacy: () => void;
  isLoggedIn?: boolean;
  onEnterDashboard?: () => void;
}

export function LandingPage({
  onGetStarted,
  onTryGuestDemo,
  onNavigateToPrivacy,
  isLoggedIn = false,
  onEnterDashboard,
}: LandingPageProps) {
  const { isDark, toggleTheme } = useTheme();

  // ── Master Scroll Container & Real Physics ──────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
  });

  // Inertial spring for scroll progression (buttery smooth momentum)
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 75,
    damping: 24,
    restDelta: 0.0005,
  });

  // Track raw ratio for numeric indicator and active stages
  const [scrollRatio, setScrollRatio] = useState(0);
  useEffect(() => {
    return scrollYProgress.on("change", (v) => {
      setScrollRatio(v);
    });
  }, [scrollYProgress]);

  // ── Interactive 3D Cursor Gyroscope Physics ─────────────────────────────────
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springMouseX = useSpring(mouseX, { stiffness: 45, damping: 20 });
  const springMouseY = useSpring(mouseY, { stiffness: 45, damping: 20 });

  const mouseRotateX = useTransform(springMouseY, [-0.5, 0.5], [10, -10]);
  const mouseRotateY = useTransform(springMouseX, [-0.5, 0.5], [-12, 12]);
  const mouseTranslateX = useTransform(springMouseX, [-0.5, 0.5], [-18, 18]);
  const mouseTranslateY = useTransform(springMouseY, [-0.5, 0.5], [-14, 14]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { innerWidth, innerHeight } = window;
    const x = e.clientX / innerWidth - 0.5;
    const y = e.clientY / innerHeight - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  // ── SCENE 1: HERO 3D SCROLL CHOREOGRAPHY ────────────────────────────────────
  // Arch expands and pushes forward in Z-space toward the camera
  const archScale = useTransform(smoothProgress, [0, 0.2], [1, 1.45]);
  const archY = useTransform(smoothProgress, [0, 0.2], [0, 90]);
  const archZ = useTransform(smoothProgress, [0, 0.2], [0, 160]);
  const archRotateX = useTransform(smoothProgress, [0, 0.2], [0, 16]);
  const archOpacity = useTransform(smoothProgress, [0, 0.16, 0.24], [1, 0.7, 0]);

  // Mascot rises, expands, and turns slightly as you scroll past
  const mascotY = useTransform(smoothProgress, [0, 0.2], [0, 120]);
  const mascotScale = useTransform(smoothProgress, [0, 0.18], [1, 1.25]);
  const mascotRotateZ = useTransform(smoothProgress, [0, 0.2], [0, 7]);
  const mascotRotateY = useTransform(smoothProgress, [0, 0.2], [0, -15]);

  // Left editorial typography fades and parallaxes upward
  const heroTextY = useTransform(smoothProgress, [0, 0.16], [0, -90]);
  const heroTextOpacity = useTransform(smoothProgress, [0, 0.13], [1, 0]);

  // Floating pastel particles at multi-depth Z
  const cloudForegroundY = useTransform(smoothProgress, [0, 0.2], [0, -220]);
  const cloudForegroundScale = useTransform(smoothProgress, [0, 0.2], [1, 1.6]);
  const orbFloat1Y = useTransform(smoothProgress, [0, 0.2], [0, -160]);
  const orbFloat2Y = useTransform(smoothProgress, [0, 0.2], [0, 110]);

  // Floating Audio Capsule glides out with 3D perspective
  const capsuleX = useTransform(smoothProgress, [0, 0.15], [0, 120]);
  const capsuleRotateY = useTransform(smoothProgress, [0, 0.15], [0, 32]);
  const capsuleOpacity = useTransform(smoothProgress, [0, 0.12], [1, 0]);

  // ── SCENE 2: WHAT MAKES AURA DIFFERENT 3D CHOREOGRAPHY ──────────────────────
  // Panoramic cloud frame unfolds from dramatic isometric 3D angle into flat view
  const diffFrameRotateX = useTransform(smoothProgress, [0.12, 0.26, 0.42], [24, 0, -14]);
  const diffFrameRotateY = useTransform(smoothProgress, [0.12, 0.26, 0.42], [-18, 0, 10]);
  const diffFrameScale = useTransform(smoothProgress, [0.12, 0.26, 0.42], [0.86, 1, 0.93]);
  const diffFrameZ = useTransform(smoothProgress, [0.12, 0.26], [-90, 0]);
  const diffTextY = useTransform(smoothProgress, [0.12, 0.26], [60, 0]);
  const diffTextOpacity = useTransform(smoothProgress, [0.12, 0.23], [0, 1]);

  // 4 Corner nodes spring in from corners
  const nodeTopLeftX = useTransform(smoothProgress, [0.18, 0.28], [-40, 0]);
  const nodeTopRightX = useTransform(smoothProgress, [0.18, 0.28], [40, 0]);
  const nodeBottomLeftX = useTransform(smoothProgress, [0.2, 0.3], [-40, 0]);
  const nodeBottomRightX = useTransform(smoothProgress, [0.2, 0.3], [40, 0]);
  const nodesOpacity = useTransform(smoothProgress, [0.18, 0.28], [0, 1]);

  // ── SCENE 3: HOW IT WORKS STAGGERED 3D DOMINO ───────────────────────────────
  const pipeCard1Y = useTransform(smoothProgress, [0.34, 0.44], [60, 0]);
  const pipeCard1Rot = useTransform(smoothProgress, [0.34, 0.44], [18, 0]);
  const pipeCard1Z = useTransform(smoothProgress, [0.34, 0.44], [-60, 0]);

  const pipeCard2Y = useTransform(smoothProgress, [0.37, 0.47], [60, 0]);
  const pipeCard2Rot = useTransform(smoothProgress, [0.37, 0.47], [18, 0]);
  const pipeCard2Z = useTransform(smoothProgress, [0.37, 0.47], [-60, 0]);

  const pipeCard3Y = useTransform(smoothProgress, [0.4, 0.5], [60, 0]);
  const pipeCard3Rot = useTransform(smoothProgress, [0.4, 0.5], [18, 0]);
  const pipeCard3Z = useTransform(smoothProgress, [0.4, 0.5], [-60, 0]);

  const pipeCard4Y = useTransform(smoothProgress, [0.43, 0.53], [60, 0]);
  const pipeCard4Rot = useTransform(smoothProgress, [0.43, 0.53], [18, 0]);
  const pipeCard4Z = useTransform(smoothProgress, [0.43, 0.53], [-60, 0]);

  // Peeking mascot from right edge
  const peekingMascotX = useTransform(smoothProgress, [0.38, 0.52], [140, 0]);
  const peekingMascotRot = useTransform(smoothProgress, [0.38, 0.52], [12, -4]);

  // ── SCENE 4: PRODUCT TABLET 3D UNFOLDING ────────────────────────────────────
  const tabletRotateX = useTransform(smoothProgress, [0.52, 0.68, 0.82], [32, 0, -18]);
  const tabletRotateY = useTransform(smoothProgress, [0.52, 0.68, 0.82], [-22, 0, 12]);
  const tabletScale = useTransform(smoothProgress, [0.52, 0.68, 0.82], [0.82, 1, 0.9]);
  const tabletZ = useTransform(smoothProgress, [0.52, 0.68], [-140, 0]);
  const tabletShadow = useTransform(
    smoothProgress,
    [0.52, 0.68],
    ["0 40px 90px rgba(0,0,0,0.9)", "0 25px 60px rgba(0,0,0,0.7)"]
  );

  // ── SCENE 5: FINAL CINEMATIC PUSH-IN ─────────────────────────────────────────
  const finalMascotScale = useTransform(smoothProgress, [0.84, 1], [0.8, 1.45]);
  const finalMascotZ = useTransform(smoothProgress, [0.84, 1], [-120, 200]);
  const finalMascotY = useTransform(smoothProgress, [0.84, 1], [50, -25]);
  const finalGlowScale = useTransform(smoothProgress, [0.84, 1], [0.8, 1.8]);
  const finalGlowOpacity = useTransform(smoothProgress, [0.84, 1], [0.25, 0.75]);

  // Audio greeting playback state
  const [isPlayingGreeting, setIsPlayingGreeting] = useState(false);

  const handleToggleGreeting = () => {
    if (isPlayingGreeting) {
      voiceService.stop();
      setIsPlayingGreeting(false);
    } else {
      voiceService.stop();
      setIsPlayingGreeting(true);
      voiceService.speak("Namaste. I'm listening to your thoughts.", () => {
        setIsPlayingGreeting(false);
      });
    }
  };

  useEffect(() => {
    return () => {
      voiceService.stop();
    };
  }, []);

  // ── Interactive Tablet Mood Selector State ─────────────────────────────────
  const [selectedMood, setSelectedMood] = useState<string>("Calm");
  const moodResponses: Record<string, { prompt: string; auraReply: string; tone: string; color: string }> = {
    Calm: {
      prompt: "Feeling grounded and steady today.",
      auraReply: "That stillness is precious. Let's use this clarity to reflect on what brought you balance today.",
      tone: "Gentle Affirmative",
      color: "#06B6D4",
    },
    Anxious: {
      prompt: "There's a lot running through my head right now.",
      auraReply: "I hear you. Let's slow things down together. Exhale slowly... you don't have to carry it all at once.",
      tone: "Soothing & Regulating",
      color: "#F59E0B",
    },
    Tired: {
      prompt: "I'm just really drained after today.",
      auraReply: "Rest is just as important as progress. Close your eyes for a moment; we can keep our talk gentle.",
      tone: "Nurturing & Soft",
      color: "#8B5CF6",
    },
    Stressed: {
      prompt: "Everything feels a little too heavy to handle.",
      auraReply: "We don't have to solve everything right now. Want to take just one slow breath together?",
      tone: "De-escalating",
      color: "#EC4899",
    },
    Happy: {
      prompt: "Something went really well today!",
      auraReply: "I'm genuinely glad to hear that! Tell me all about it—let's celebrate this milestone together.",
      tone: "Inquisitive & Warm",
      color: "#10B981",
    },
  };

  // ── Kinetic Adaptation text state ──────────────────────────────────────────
  const [adaptationStep, setAdaptationStep] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setAdaptationStep((prev) => (prev === 0 ? 1 : 0));
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  // Theme styling tokens for instant dark/light switching
  const t = {
    bg: isDark ? "bg-[#080711]" : "bg-[#FAF8F5]",
    text: isDark ? "text-[#F5F2EB]" : "text-[#1E182F]",
    textMuted: isDark ? "text-[#9E98B4]" : "text-[#5D5773]",
    textSubtle: isDark ? "text-[#7A748E]" : "text-[#78718E]",
    border: isDark ? "border-white/[0.06]" : "border-black/[0.06]",
    borderSubtle: isDark ? "border-white/[0.04]" : "border-black/[0.04]",
    borderCard: isDark ? "border-white/[0.08]" : "border-purple-200/50",
    glassHeader: isDark ? "bg-[#080711]/75 border-white/[0.06]" : "bg-[#FAF8F5]/85 border-black/[0.06]",
    secBtn: isDark
      ? "bg-white/[0.06] hover:bg-white/[0.1] text-[#DDD6FE] border-white/[0.1] hover:border-white/[0.2]"
      : "bg-black/[0.04] hover:bg-black/[0.08] text-[#4C1D95] border-black/[0.1] hover:border-black/[0.2]",
  };

  return (
    <div
      ref={scrollContainerRef}
      onMouseMove={handleMouseMove}
      className={`h-screen w-full overflow-y-auto overflow-x-hidden select-none font-sans relative custom-scrollbar perspective-[1400px] transition-colors duration-300 ${t.bg} ${t.text}`}
      style={{
        backgroundColor: isDark ? "#080711" : "#FAF8F5",
      }}
    >
      {/* ────────────────────────── MINIMAL NAVIGATION ────────────────────────── */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl px-6 sm:px-12 py-4 transition-colors duration-300 border-b ${t.glassHeader}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand Logo & Subtitle */}
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          >
            {/* Iridescent Bead */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#9333EA] via-[#A855F7] to-[#06B6D4] shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center justify-center shrink-0 border border-white/40">
              <div className="w-2 h-2 rounded-full bg-white/90 shadow-[0_0_8px_white]" />
            </div>
            <div>
              <span className={`font-extrabold text-[17px] tracking-tight block leading-tight ${t.text}`}>
                Aura AI
              </span>
              <span className={`text-[10.5px] font-medium tracking-wide block -mt-0.5 ${t.textSubtle}`}>
                A more human AI
              </span>
            </div>
          </div>

          {/* Center Links (Quiet & Editorial) */}
          <nav className={`hidden md:flex items-center gap-8 text-[13px] font-medium ${isDark ? "text-[#9E98B4]" : "text-[#6B6380]"}`}>
            <a
              href="#product"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("product")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-[#F5F2EB]" : "hover:text-[#1E182F]"}`}
            >
              Product
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-[#F5F2EB]" : "hover:text-[#1E182F]"}`}
            >
              How it works
            </a>
            <a
              href="#adaptation"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("adaptation")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-[#F5F2EB]" : "hover:text-[#1E182F]"}`}
            >
              Research
            </a>
            <a
              href="#safety"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("safety")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-[#F5F2EB]" : "hover:text-[#1E182F]"}`}
            >
              Safety
            </a>
            <a
              href="#memory"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("memory")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-[#F5F2EB]" : "hover:text-[#1E182F]"}`}
            >
              Pricing
            </a>
          </nav>

          {/* Right Action Group */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className={`w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 ${
                isDark
                  ? "bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-[#A39EB2] hover:text-white"
                  : "bg-black/[0.04] hover:bg-black/[0.08] border-black/[0.08] text-[#554D69] hover:text-black shadow-sm"
              }`}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {isLoggedIn ? (
              <button
                onClick={onEnterDashboard}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-[#6D28D9] hover:bg-[#7C3AED] text-white transition-all shadow-[0_4px_16px_rgba(109,40,217,0.35)] cursor-pointer border-none flex items-center gap-1.5"
              >
                <span>Dashboard</span>
                <ArrowRight size={13} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => onGetStarted("login")}
                  className={`hidden sm:inline-block text-xs font-semibold transition-colors cursor-pointer bg-transparent border-none ${
                    isDark ? "text-[#9E98B4] hover:text-[#F5F2EB]" : "text-[#6B6380] hover:text-[#1E182F]"
                  }`}
                >
                  Sign in
                </button>
                <button
                  onClick={() => onGetStarted("register")}
                  className="px-4 sm:px-5 py-2 rounded-full text-xs font-semibold bg-[#6D28D9] hover:bg-[#7C3AED] text-white transition-all shadow-[0_4px_16px_rgba(109,40,217,0.35)] cursor-pointer border-none flex items-center gap-1.5"
                >
                  <span>Get started</span>
                  <ArrowRight size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ────────────────────────── SECTION 1: HERO VIEWPORT ────────────────────────── */}
      <section className="relative min-h-[calc(100vh-70px)] flex flex-col justify-center px-6 sm:px-12 max-w-7xl mx-auto pt-4 pb-16 overflow-visible">
        {/* Right Edge Numeric Rail Indicator (from reference image) linked to scroll progress */}
        <div className="hidden xl:flex flex-col items-center gap-3 fixed right-8 top-1/2 -translate-y-1/2 z-30 text-[11px] font-mono select-none pointer-events-none">
          <span className={`transition-colors ${scrollRatio < 0.25 ? (isDark ? "text-white font-bold" : "text-[#1E182F] font-bold") : (isDark ? "text-[#5A5470]" : "text-[#A39DB7]")}`}>
            01
          </span>
          <div className={`w-[2px] h-14 rounded-full overflow-hidden ${isDark ? "bg-white/20" : "bg-black/15"}`}>
            <motion.div
              style={{
                height: useTransform(smoothProgress, [0, 1], ["15%", "100%"]),
              }}
              className="w-full bg-[#A855F7]"
            />
          </div>
          <span className={`transition-colors ${scrollRatio >= 0.25 && scrollRatio < 0.5 ? (isDark ? "text-white font-bold" : "text-[#1E182F] font-bold") : (isDark ? "text-[#5A5470]" : "text-[#A39DB7]")}`}>
            03
          </span>
          <span className={`transition-colors ${scrollRatio >= 0.5 && scrollRatio < 0.75 ? (isDark ? "text-white font-bold" : "text-[#1E182F] font-bold") : (isDark ? "text-[#5A5470]" : "text-[#A39DB7]")}`}>
            04
          </span>
          <span className={`transition-colors ${scrollRatio >= 0.75 ? (isDark ? "text-white font-bold" : "text-[#1E182F] font-bold") : (isDark ? "text-[#5A5470]" : "text-[#A39DB7]")}`}>
            05
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-6 items-center flex-1">
          {/* Left Column: Editorial Headline & Actions with Scroll Parallax */}
          <motion.div
            style={{
              y: heroTextY,
              opacity: heroTextOpacity,
            }}
            className="lg:col-span-6 flex flex-col justify-center max-w-xl z-20"
          >
            {/* Top Minimal Label */}
            <span className="text-[11px] font-bold tracking-[0.2em] text-[#A855F7] uppercase mb-4 block">
              Aura AI
            </span>

            {/* Editorial Serif Headline (Solid warm off-white in dark, rich plum in light) */}
            <h1 className={`text-5xl sm:text-6xl lg:text-7xl font-serif tracking-tight leading-[1.08] mb-6 font-normal ${t.text}`}>
              A more<br />
              understanding<br />
              AI.
            </h1>

            {/* Supporting Copy */}
            <p className={`text-sm sm:text-base font-normal leading-relaxed mb-8 max-w-md ${t.textMuted}`}>
              Aura AI listens, understands, and adapts to you — so every conversation feels a little more human.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3.5 mb-10">
              <button
                onClick={() => onGetStarted("register")}
                className="px-6 py-3 rounded-full text-xs sm:text-sm font-semibold bg-[#6D28D9] hover:bg-[#7C3AED] text-white shadow-[0_8px_24px_rgba(109,40,217,0.4)] hover:shadow-[0_12px_28px_rgba(124,58,237,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border-none flex items-center gap-2"
              >
                <span>Try Aura AI Free</span>
                <ArrowRight size={14} />
              </button>

              <button
                onClick={onTryGuestDemo}
                className={`px-5 py-3 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer flex items-center gap-2 ${t.secBtn}`}
              >
                <Play size={13} className={isDark ? "fill-[#DDD6FE]" : "fill-[#4C1D95]"} />
                <span>Watch 2 min demo</span>
              </button>
            </div>

            {/* Trust Markers (Inline subtle text, no pills) */}
            <div className={`flex flex-wrap items-center gap-6 text-[11.5px] font-medium ${t.textSubtle}`}>
              <div className="flex items-center gap-2">
                <Volume2 size={13} className="text-[#A855F7]" />
                <span>Natural voice</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-[#06B6D4]" />
                <span>Built for privacy</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-[#A855F7]" />
                <span>On your terms</span>
              </div>
            </div>

            {/* Scroll to Explore Prompt */}
            <div
              className={`mt-12 flex items-center gap-2 text-[11px] hover:text-[#A855F7] transition-colors cursor-pointer ${t.textSubtle}`}
              onClick={() => {
                const target = document.getElementById("product");
                target?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center ${isDark ? "border-white/[0.15] text-white/60" : "border-black/[0.15] text-black/60"}`}>
                <span className="text-xs">↓</span>
              </div>
              <span>Scroll to explore</span>
            </div>
          </motion.div>

          {/* Right Column: 3D Arch Gateway with Gyroscope & Multi-Depth Parallax */}
          <motion.div
            style={{
              rotateX: mouseRotateX,
              rotateY: mouseRotateY,
              x: mouseTranslateX,
              y: mouseTranslateY,
              transformStyle: "preserve-3d",
            }}
            className="lg:col-span-6 relative flex items-center justify-center min-h-[460px] sm:min-h-[540px]"
          >
            {/* ── Soft Volumetric Glow Behind Arch ── */}
            <motion.div
              style={{
                scale: useTransform(smoothProgress, [0, 0.2], [1, 1.3]),
                opacity: useTransform(smoothProgress, [0, 0.2], [0.4, 0.1]),
                background: "radial-gradient(circle, rgba(168, 85, 247, 0.5) 0%, rgba(244, 114, 182, 0.3) 40%, transparent 70%)",
              }}
              className="absolute w-[360px] sm:w-[480px] h-[480px] sm:h-[580px] rounded-full pointer-events-none blur-[90px]"
            />

            {/* ── Dimensional Sunset Architectural Arch (Driven by 3D Scroll Physics) ── */}
            <motion.div
              style={{
                scale: archScale,
                y: archY,
                z: archZ,
                rotateX: archRotateX,
                opacity: archOpacity,
                transformStyle: "preserve-3d",
                background: "linear-gradient(180deg, #FDBA74 0%, #F472B6 32%, #A855F7 65%, #1B1533 100%)",
                boxShadow: isDark
                  ? "0 25px 65px -10px rgba(0,0,0,0.85), inset 0 2px 10px rgba(255,255,255,0.4)"
                  : "0 25px 60px -10px rgba(109,40,217,0.2), inset 0 2px 8px rgba(255,255,255,0.7)",
              }}
              className="relative w-[310px] sm:w-[390px] h-[400px] sm:h-[480px] rounded-t-full border border-white/[0.15] shadow-2xl overflow-hidden flex flex-col items-center justify-end"
            >
              {/* Diffuse Warm Sunset Rim Lighting & Drifting Cloud Layers */}
              <div className={`absolute inset-0 via-transparent to-transparent opacity-90 ${isDark ? "bg-gradient-to-t from-[#0E0C1A]" : "bg-gradient-to-t from-[#25133E]"}`} />

              {/* Parallax Clouds at Different Z Depths */}
              <motion.div
                style={{ y: cloudForegroundY, scale: cloudForegroundScale }}
                className="absolute top-16 -left-12 w-48 h-24 rounded-full bg-[#FCE7F3]/40 blur-[20px] pointer-events-none"
              />
              <motion.div
                style={{ y: useTransform(smoothProgress, [0, 0.2], [0, 60]) }}
                className="absolute top-28 -right-10 w-44 h-28 rounded-full bg-[#FDE68A]/35 blur-[22px] pointer-events-none"
              />
              <div
                className="absolute bottom-20 left-10 w-56 h-28 rounded-full bg-[#C084FC]/30 blur-[26px] pointer-events-none"
              />

              {/* Floating Pastel Clay Orbs with independent Parallax Physics */}
              <motion.div
                style={{ y: orbFloat1Y }}
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute top-24 left-6 w-10 h-10 rounded-full bg-gradient-to-tr from-[#F472B6] to-[#FDE047] shadow-[0_4px_12px_rgba(244,114,182,0.4)] border border-white/60 z-10"
              />
              <motion.div
                style={{ y: orbFloat2Y }}
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-14 right-10 w-7 h-7 rounded-full bg-gradient-to-tr from-[#38BDF8] to-[#C084FC] shadow-[0_4px_10px_rgba(56,189,248,0.4)] border border-white/60 z-10"
              />
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute bottom-24 -left-3 w-8 h-8 rounded-full bg-gradient-to-tr from-[#67E8F9] to-[#818CF8] shadow-[0_4px_10px_rgba(103,232,249,0.3)] border border-white/50 z-10"
              />

              {/* ── The 3D Aura Mascot (Driven by 3D Scroll Physics & Gyroscope) ── */}
              <motion.div
                style={{
                  y: mascotY,
                  scale: mascotScale,
                  rotateZ: mascotRotateZ,
                  rotateY: mascotRotateY,
                  transformStyle: "preserve-3d",
                }}
                className="relative z-10 flex flex-col items-center justify-end mb-4"
              >
                <img
                  src={auraMascotPng}
                  alt="Aura 3D Companion"
                  className="w-[250px] sm:w-[310px] h-auto object-contain drop-shadow-[0_25px_40px_rgba(0,0,0,0.7)]"
                  draggable={false}
                />
              </motion.div>
            </motion.div>

            {/* ── Handwritten Annotation: "Hey there I'm Aura!" ── */}
            <motion.div
              style={{
                opacity: useTransform(smoothProgress, [0, 0.12], [1, 0]),
                y: useTransform(smoothProgress, [0, 0.12], [0, -30]),
              }}
              className="absolute -top-3 right-8 sm:right-16 z-20 pointer-events-none select-none"
            >
              <div className="flex flex-col items-center">
                <span
                  className={`text-[17px] sm:text-[19px] tracking-wide font-normal -rotate-6 ${isDark ? "text-[#EDE8F5]" : "text-[#4C1D95]"}`}
                  style={{
                    fontFamily: "'Caveat', 'Comic Sans MS', cursive, sans-serif",
                    textShadow: isDark ? "0 2px 8px rgba(0,0,0,0.8)" : "0 1px 4px rgba(255,255,255,0.8)",
                  }}
                >
                  Hey there<br />I&apos;m Aura!
                </span>
                {/* Curved Arrow pointing to Aura */}
                <svg
                  className={`w-8 h-8 -mt-1 -rotate-12 ${isDark ? "text-white/80" : "text-[#7C3AED]"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a10 10 0 0 1 8 8" />
                  <polyline points="16 10 20 10 20 6" />
                </svg>
              </div>
            </motion.div>

            {/* ── Floating Conversation Capsule (3D Slide on Scroll) ── */}
            <motion.div
              style={{
                x: capsuleX,
                rotateY: capsuleRotateY,
                opacity: capsuleOpacity,
                transformStyle: "preserve-3d",
              }}
              onClick={handleToggleGreeting}
              className={`absolute -bottom-6 sm:-bottom-4 right-0 sm:-right-4 z-30 max-w-[280px] sm:max-w-[310px] backdrop-blur-xl border rounded-full p-2.5 px-4 flex items-center justify-between gap-3 cursor-pointer hover:border-[#A855F7]/50 transition-all group ${
                isDark
                  ? "bg-[#12101F]/85 border-white/[0.14] shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
                  : "bg-white/95 border-black/[0.08] shadow-[0_16px_40px_rgba(109,40,217,0.12)]"
              }`}
            >
              {/* Waveform Icon */}
              <div className="w-8 h-8 rounded-full bg-[#A855F7]/20 flex items-center justify-center shrink-0 text-[#A855F7]">
                <Volume2 size={16} />
              </div>

              {/* Spoken Text */}
              <div className="min-w-0 flex-1">
                <p className={`text-[11.5px] font-medium leading-tight m-0 truncate ${t.text}`}>
                  Namaste! I&apos;m listening
                </p>
                <p className={`text-[10px] m-0 truncate ${t.textSubtle}`}>
                  to your thoughts.
                </p>
              </div>

              {/* Status Orb Indicator */}
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${isDark ? "bg-[#1C182F] border-white/[0.15]" : "bg-purple-50 border-purple-200"}`}>
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isPlayingGreeting ? "bg-[#10B981] animate-ping" : "bg-[#A855F7] animate-pulse"
                  }`}
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ────────────────────────── SECTION 2: WHAT MAKES AURA DIFFERENT ────────────────────────── */}
      <section id="product" className={`py-28 px-6 sm:px-12 max-w-7xl mx-auto border-t relative ${t.borderSubtle}`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Editorial Statement & Technical Metrics */}
          <motion.div
            style={{
              y: diffTextY,
              opacity: diffTextOpacity,
            }}
            className="lg:col-span-5 flex flex-col justify-center"
          >
            <span className="text-[11px] font-bold tracking-[0.2em] text-[#A855F7] uppercase mb-3 block">
              What makes Aura different
            </span>

            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-serif tracking-tight leading-[1.12] mb-5 font-normal ${t.text}`}>
              More than responses.<br />
              A deeper connection.
            </h2>

            <p className={`text-sm leading-relaxed mb-8 max-w-md font-normal ${t.textMuted}`}>
              Aura doesn&apos;t just answer — it understands. Combining voice, facial cues, context, and memory
              to give you support that truly fits you.
            </p>

            <div className="mb-10">
              <button
                onClick={() => onGetStarted("register")}
                className="px-6 py-3 rounded-full text-xs font-semibold bg-[#6D28D9] hover:bg-[#7C3AED] text-white transition-all shadow-[0_4px_20px_rgba(109,40,217,0.35)] cursor-pointer border-none inline-flex items-center gap-2"
              >
                <span>Explore the experience</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* 3 Bold Grounded Metrics (from reference image) */}
            <div className={`grid grid-cols-3 gap-4 pt-6 border-t ${t.borderCard}`}>
              <div>
                <span className={`text-2xl sm:text-3xl font-bold block font-mono ${t.text}`}>
                  18
                </span>
                <span className={`text-[11px] font-medium block mt-0.5 ${t.textSubtle}`}>
                  FACS Action Units
                </span>
              </div>

              <div>
                <span className={`text-2xl sm:text-3xl font-bold block font-mono ${t.text}`}>
                  &lt;400ms
                </span>
                <span className={`text-[11px] font-medium block mt-0.5 ${t.textSubtle}`}>
                  Response Latency
                </span>
              </div>

              <div>
                <span className={`text-2xl sm:text-3xl font-bold block font-mono ${t.text}`}>
                  92%
                </span>
                <span className={`text-[11px] font-medium block mt-0.5 ${t.textSubtle}`}>
                  Emotion Recognition
                </span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Panoramic Cinematic Frame with 3D Spatial Tilt */}
          <div className="lg:col-span-7 perspective-[1200px]">
            <motion.div
              style={{
                rotateX: diffFrameRotateX,
                rotateY: diffFrameRotateY,
                scale: diffFrameScale,
                z: diffFrameZ,
                transformStyle: "preserve-3d",
                background: isDark
                  ? "linear-gradient(145deg, #1C152E 0%, #100C1F 50%, #0B0816 100%)"
                  : "linear-gradient(145deg, #F3E8FF 0%, #EDE9FE 50%, #FAF5FF 100%)",
                boxShadow: isDark
                  ? "0 30px 70px -15px rgba(0,0,0,0.85), inset 0 1px 2px rgba(255,255,255,0.15)"
                  : "0 25px 60px -15px rgba(109,40,217,0.15), inset 0 1px 2px rgba(255,255,255,0.6)",
              }}
              className={`relative w-full aspect-[16/10] sm:aspect-[16/9] rounded-[32px] border overflow-hidden shadow-2xl flex items-center justify-center p-6 sm:p-8 transition-shadow ${
                isDark ? "border-white/[0.14]" : "border-purple-200/60"
              }`}
            >
              {/* Sunset Lavender Cloud Backdrop */}
              <div
                className="absolute inset-0 pointer-events-none opacity-80"
                style={{
                  background:
                    "radial-gradient(circle at 50% 40%, rgba(244, 114, 182, 0.3) 0%, rgba(168, 85, 247, 0.25) 40%, transparent 75%)",
                }}
              />

              {/* Center Resting Mascot */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-10 flex flex-col items-center justify-center"
              >
                <img
                  src={auraMascotPng}
                  alt="Aura in Thought"
                  className="w-[200px] sm:w-[260px] h-auto object-contain drop-shadow-[0_16px_30px_rgba(0,0,0,0.6)]"
                  draggable={false}
                />
              </motion.div>

              {/* 4 Frosted Spatial Nodes springing in from corners */}
              <motion.div
                style={{ x: nodeTopLeftX, opacity: nodesOpacity }}
                className={`absolute top-4 sm:top-6 left-4 sm:left-6 backdrop-blur-md border rounded-xl px-3.5 py-2 flex items-center gap-2 z-20 shadow-md ${
                  isDark ? "bg-white/[0.08] border-white/[0.12] text-[#EDE8F5]" : "bg-white/85 border-purple-200/60 text-[#2E2544] shadow-sm"
                }`}
              >
                <Sliders size={13} className="text-[#A855F7]" />
                <span className="text-[11px] font-medium">
                  Understands your emotions
                </span>
              </motion.div>

              <motion.div
                style={{ x: nodeTopRightX, opacity: nodesOpacity }}
                className={`absolute top-4 sm:top-6 right-4 sm:right-6 backdrop-blur-md border rounded-xl px-3.5 py-2 flex items-center gap-2 z-20 shadow-md ${
                  isDark ? "bg-white/[0.08] border-white/[0.12] text-[#EDE8F5]" : "bg-white/85 border-purple-200/60 text-[#2E2544] shadow-sm"
                }`}
              >
                <Brain size={13} className="text-[#06B6D4]" />
                <span className="text-[11px] font-medium">
                  Remembers your context
                </span>
              </motion.div>

              <motion.div
                style={{ x: nodeBottomLeftX, opacity: nodesOpacity }}
                className={`absolute bottom-4 sm:bottom-6 left-4 sm:left-6 backdrop-blur-md border rounded-xl px-3.5 py-2 flex items-center gap-2 z-20 shadow-md ${
                  isDark ? "bg-white/[0.08] border-white/[0.12] text-[#EDE8F5]" : "bg-white/85 border-purple-200/60 text-[#2E2544] shadow-sm"
                }`}
              >
                <Clock size={13} className="text-[#F59E0B]" />
                <span className="text-[11px] font-medium">
                  Adapts in real time
                </span>
              </motion.div>

              <motion.div
                style={{ x: nodeBottomRightX, opacity: nodesOpacity }}
                className={`absolute bottom-4 sm:bottom-6 right-4 sm:right-6 backdrop-blur-md border rounded-xl px-3.5 py-2 flex items-center gap-2 z-20 shadow-md ${
                  isDark ? "bg-white/[0.08] border-white/[0.12] text-[#EDE8F5]" : "bg-white/85 border-purple-200/60 text-[#2E2544] shadow-sm"
                }`}
              >
                <Activity size={13} className="text-[#10B981]" />
                <span className="text-[11px] font-medium">
                  Supports your growth
                </span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ────────────────────────── SECTION 3: HOW IT WORKS (STAGGERED 3D DOMINO) ────────────────────────── */}
      <section id="how-it-works" className={`py-28 px-6 sm:px-12 max-w-7xl mx-auto border-t relative perspective-[1200px] ${t.borderSubtle}`}>
        {/* Section Header with Step Counter */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-4">
          <div>
            <span className="text-[11px] font-bold tracking-[0.2em] text-[#A855F7] uppercase mb-3 block">
              How it works
            </span>
            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-serif tracking-tight leading-[1.12] mb-3 font-normal ${t.text}`}>
              From a moment<br className="hidden sm:inline" /> to meaningful support.
            </h2>
            <p className={`text-sm max-w-md font-normal ${t.textMuted}`}>
              A real-time, multimodal pipeline that turns subtle cues into thoughtful responses.
            </p>
          </div>

          {/* Step Numbers Indicator (01 - 02 - 03 - 04) */}
          <div className={`flex items-center gap-6 text-xs font-mono ${isDark ? "text-[#7A748E]" : "text-[#8E87A4]"}`}>
            <span className={`font-bold transition-colors ${scrollRatio >= 0.35 && scrollRatio < 0.45 ? "text-[#A855F7] border-b border-[#A855F7] pb-0.5" : ""}`}>
              01
            </span>
            <span className={`font-bold transition-colors ${scrollRatio >= 0.45 && scrollRatio < 0.52 ? "text-[#A855F7] border-b border-[#A855F7] pb-0.5" : ""}`}>
              02
            </span>
            <span className={`font-bold transition-colors ${scrollRatio >= 0.52 && scrollRatio < 0.6 ? "text-[#A855F7] border-b border-[#A855F7] pb-0.5" : ""}`}>
              03
            </span>
            <span className={`font-bold transition-colors ${scrollRatio >= 0.6 ? "text-[#A855F7] border-b border-[#A855F7] pb-0.5" : ""}`}>
              04
            </span>
          </div>
        </div>

        {/* 4 Connected Milestone Spatial Cards with 3D Cascading Incline */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
          {/* Milestone 01 */}
          <motion.div
            style={{
              y: pipeCard1Y,
              rotateY: pipeCard1Rot,
              z: pipeCard1Z,
              transformStyle: "preserve-3d",
            }}
            className={`backdrop-blur-md border rounded-2xl p-5 flex flex-col justify-between min-h-[190px] relative overflow-hidden transition-all ${
              isDark
                ? "bg-[#120F20]/80 border-purple-500/40 shadow-[0_12px_35px_rgba(0,0,0,0.5)]"
                : "bg-white/95 border-purple-400/60 shadow-[0_12px_35px_rgba(109,40,217,0.08)]"
            }`}
          >
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#A855F7]/70 rounded-tr-xl" />
            <div>
              <div className="w-9 h-9 rounded-xl bg-[#A855F7]/20 text-[#A855F7] flex items-center justify-center mb-3.5">
                <Eye size={17} />
              </div>
              <h3 className={`text-base font-bold mb-1.5 ${t.text}`}>
                Perception
              </h3>
              <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
                Analyzes facial expressions, voice, and context in real time.
              </p>
            </div>
            <span className="text-[10px] font-mono text-[#A855F7] font-semibold">Stage 01</span>
          </motion.div>

          {/* Milestone 02 */}
          <motion.div
            style={{
              y: pipeCard2Y,
              rotateY: pipeCard2Rot,
              z: pipeCard2Z,
              transformStyle: "preserve-3d",
            }}
            className={`backdrop-blur-md border rounded-2xl p-5 flex flex-col justify-between min-h-[190px] transition-all ${
              isDark
                ? "bg-[#100D1C]/70 border-white/[0.1] hover:border-white/[0.2]"
                : "bg-white/85 border-purple-100/80 hover:border-purple-300/60 shadow-sm"
            }`}
          >
            <div>
              <div className={`w-9 h-9 rounded-xl text-[#06B6D4] flex items-center justify-center mb-3.5 ${isDark ? "bg-white/[0.05]" : "bg-cyan-50"}`}>
                <Layers size={17} />
              </div>
              <h3 className={`text-base font-bold mb-1.5 ${t.text}`}>
                Affect Fusion
              </h3>
              <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
                Combines multiple signals to understand your emotional state.
              </p>
            </div>
            <span className={`text-[10px] font-mono ${isDark ? "text-[#6A6480]" : "text-[#8E87A4]"}`}>Stage 02</span>
          </motion.div>

          {/* Milestone 03 */}
          <motion.div
            style={{
              y: pipeCard3Y,
              rotateY: pipeCard3Rot,
              z: pipeCard3Z,
              transformStyle: "preserve-3d",
            }}
            className={`backdrop-blur-md border rounded-2xl p-5 flex flex-col justify-between min-h-[190px] transition-all ${
              isDark
                ? "bg-[#100D1C]/70 border-white/[0.1] hover:border-white/[0.2]"
                : "bg-white/85 border-purple-100/80 hover:border-purple-300/60 shadow-sm"
            }`}
          >
            <div>
              <div className={`w-9 h-9 rounded-xl text-[#EC4899] flex items-center justify-center mb-3.5 ${isDark ? "bg-white/[0.05]" : "bg-pink-50"}`}>
                <Heart size={17} />
              </div>
              <h3 className={`text-base font-bold mb-1.5 ${t.text}`}>
                Response Adaptation
              </h3>
              <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
                Selects the right tone, pacing and guidance for your moment.
              </p>
            </div>
            <span className={`text-[10px] font-mono ${isDark ? "text-[#6A6480]" : "text-[#8E87A4]"}`}>Stage 03</span>
          </motion.div>

          {/* Milestone 04 */}
          <motion.div
            style={{
              y: pipeCard4Y,
              rotateY: pipeCard4Rot,
              z: pipeCard4Z,
              transformStyle: "preserve-3d",
            }}
            className={`backdrop-blur-md border rounded-2xl p-5 flex flex-col justify-between min-h-[190px] transition-all ${
              isDark
                ? "bg-[#100D1C]/70 border-white/[0.1] hover:border-white/[0.2]"
                : "bg-white/85 border-purple-100/80 hover:border-purple-300/60 shadow-sm"
            }`}
          >
            <div>
              <div className={`w-9 h-9 rounded-xl text-[#10B981] flex items-center justify-center mb-3.5 ${isDark ? "bg-white/[0.05]" : "bg-emerald-50"}`}>
                <Activity size={17} />
              </div>
              <h3 className={`text-base font-bold mb-1.5 ${t.text}`}>
                Continuity
              </h3>
              <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
                Remembers what matters, so support gets better over time.
              </p>
            </div>
            <span className={`text-[10px] font-mono ${isDark ? "text-[#6A6480]" : "text-[#8E87A4]"}`}>Stage 04</span>
          </motion.div>
        </div>

        {/* ── Peeking Mascot from Right Edge with Physics Slide ── */}
        <motion.div
          style={{
            x: peekingMascotX,
            rotateZ: peekingMascotRot,
          }}
          className="hidden lg:block absolute -bottom-10 -right-8 pointer-events-none z-20"
        >
          <div className="relative">
            {/* Handwritten Note */}
            <div className={`absolute -top-12 -left-20 text-[15px] -rotate-6 font-normal ${isDark ? "text-[#EDE8F5]" : "text-[#4C1D95]"}`}>
              <span style={{ fontFamily: "'Caveat', cursive, sans-serif" }}>
                SUBTLE CUES.<br />REAL SUPPORT. ⤷
              </span>
            </div>
            <img
              src={auraMascotPng}
              alt="Aura Peeking"
              className="w-48 h-auto object-contain opacity-90 translate-x-10 drop-shadow-[0_20px_35px_rgba(0,0,0,0.8)]"
            />
          </div>
        </motion.div>
      </section>

      {/* ────────────────────────── SECTION 4: PRODUCT EXPERIENCE (3D DEVICE UNFOLDING) ────────────────────────── */}
      <section className={`py-28 px-6 sm:px-12 max-w-7xl mx-auto border-t perspective-[1400px] ${t.borderSubtle}`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Physical Twilight Tablet Still Life with 3D Landing Physics */}
          <div className="lg:col-span-7">
            <motion.div
              style={{
                rotateX: tabletRotateX,
                rotateY: tabletRotateY,
                scale: tabletScale,
                z: tabletZ,
                boxShadow: tabletShadow,
                transformStyle: "preserve-3d",
                background: isDark
                  ? "radial-gradient(ellipse at 80% 20%, rgba(244, 114, 182, 0.18), transparent 60%), linear-gradient(180deg, #161226 0%, #0D0A17 100%)"
                  : "radial-gradient(ellipse at 80% 20%, rgba(244, 114, 182, 0.2), transparent 60%), linear-gradient(180deg, #F3EFFC 0%, #E9E3F5 100%)",
              }}
              className={`relative w-full rounded-[36px] border overflow-hidden p-6 sm:p-10 shadow-2xl transition-all ${
                isDark ? "border-white/[0.12]" : "border-purple-300/40"
              }`}
            >
              {/* Window Glow Backdrop at Dusk */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-b from-purple-500/15 to-transparent rounded-full blur-3xl pointer-events-none" />

              {/* The Tablet Device Container */}
              <div
                className={`relative rounded-[28px] p-5 sm:p-7 shadow-2xl max-w-md mx-auto border transition-colors ${
                  isDark ? "bg-[#171328] border-white/[0.14]" : "bg-white border-purple-200/70"
                }`}
                style={{
                  boxShadow: isDark
                    ? "0 25px 50px rgba(0,0,0,0.85), inset 0 1px 2px rgba(255,255,255,0.2)"
                    : "0 20px 40px rgba(109,40,217,0.1), inset 0 1px 2px rgba(255,255,255,0.8)",
                }}
              >
                {/* Tablet Top Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${isDark ? "bg-white/[0.08] text-white/70" : "bg-purple-100 text-purple-700"}`}>
                      ↓
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold leading-none m-0 ${t.text}`}>
                        Good evening, Atharv
                      </h4>
                      <span className={`text-[10px] font-medium ${t.textSubtle}`}>
                        How are you feeling today?
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 Mood Pebbles with Facial Expressions (Clickable with Spring Physics) */}
                <div className="grid grid-cols-5 gap-2 my-5">
                  {[
                    { label: "Calm", emoji: "😌", color: "#06B6D4" },
                    { label: "Anxious", emoji: "😰", color: "#F59E0B" },
                    { label: "Tired", emoji: "🥱", color: "#8B5CF6" },
                    { label: "Stressed", emoji: "😣", color: "#EC4899" },
                    { label: "Happy", emoji: "😊", color: "#10B981" },
                  ].map((mood) => {
                    const isSelected = selectedMood === mood.label;
                    return (
                      <motion.button
                        key={mood.label}
                        whileHover={{ scale: 1.08, y: -2 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setSelectedMood(mood.label)}
                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl transition-all cursor-pointer border ${
                          isSelected
                            ? isDark
                              ? "bg-white/[0.14] border-purple-400/60 shadow-md"
                              : "bg-purple-100 border-purple-400 shadow-sm"
                            : isDark
                            ? "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08]"
                            : "bg-purple-50/50 border-purple-100/70 hover:bg-purple-100/50"
                        }`}
                      >
                        <span className="text-xl mb-1">{mood.emoji}</span>
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: isSelected ? mood.color : isDark ? "#9E98B4" : "#6B6380" }}
                        >
                          {mood.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Simulated Live Aura Response based on Selected Mood */}
                <div className={`p-3.5 rounded-xl border mb-4 text-xs leading-relaxed shadow-inner ${
                  isDark ? "bg-white/[0.04] border-white/[0.08]" : "bg-purple-50/50 border-purple-100"
                }`}>
                  <div className={`flex items-center justify-between mb-1 text-[10px] font-semibold ${t.textSubtle}`}>
                    <span>Aura Tone: {moodResponses[selectedMood]?.tone}</span>
                    <span className="text-[#10B981] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
                      Live Interaction
                    </span>
                  </div>
                  <p className={`italic m-0 ${isDark ? "text-[#DDD6FE]" : "text-[#4C1D95]"}`}>
                    &quot;{moodResponses[selectedMood]?.auraReply}&quot;
                  </p>
                </div>

                {/* Bottom Conversational Input Bar */}
                <div className={`border rounded-full p-1.5 pl-4 flex items-center justify-between ${
                  isDark ? "bg-black/40 border-white/[0.1]" : "bg-purple-50/70 border-purple-200/60"
                }`}>
                  <span className={`text-xs ${t.textSubtle}`}>Talk to Aura...</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isDark ? "bg-white/[0.06] text-white/50" : "bg-purple-100 text-purple-700"}`}>
                      <Radio size={12} />
                    </div>
                    <div className="w-7 h-7 rounded-full bg-[#6D28D9] text-white flex items-center justify-center shadow-md">
                      <Mic size={13} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stacked Personal Journals on the Wooden Desk beside Tablet */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <div className={`px-3 py-1 rounded-lg border text-[10.5px] font-medium shadow-sm ${
                  isDark ? "bg-[#312E81]/40 border-indigo-500/25 text-[#A5B4FC]" : "bg-indigo-50 border-indigo-200 text-[#4338CA]"
                }`}>
                  Better Thinking Atharv
                </div>
                <div className={`px-3 py-1 rounded-lg border text-[10.5px] font-medium shadow-sm ${
                  isDark ? "bg-[#581C87]/40 border-purple-500/25 text-[#E9D5FF]" : "bg-purple-50 border-purple-200 text-[#6B21A8]"
                }`}>
                  Calmer Days
                </div>
                <div className={`px-3 py-1 rounded-lg border text-[10.5px] font-medium shadow-sm ${
                  isDark ? "bg-[#14532D]/40 border-emerald-500/25 text-[#A7F3D0]" : "bg-emerald-50 border-emerald-200 text-[#065F46]"
                }`}>
                  A Kinder You
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Built for Real Life Text */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <span className="text-[11px] font-bold tracking-[0.2em] text-[#A855F7] uppercase mb-3 block">
              Built for real life
            </span>

            <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-serif tracking-tight leading-[1.12] mb-5 font-normal ${t.text}`}>
              Support that<br />
              fits your world.
            </h2>

            <p className={`text-sm leading-relaxed mb-8 font-normal ${t.textMuted}`}>
              Whether it&apos;s a stressful day, a big decision, or just a quiet night — Aura is here to listen,
              guide, and grow with you.
            </p>

            {/* 4 Clean Bullet Items (Exact from reference) */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 mb-8 text-xs ${isDark ? "text-[#EDE8F5]" : "text-[#2E2544]"}`}>
              <div className="flex items-center gap-2.5">
                <Volume2 size={15} className="text-[#A855F7] shrink-0" />
                <span>Voice or text, your choice</span>
              </div>
              <div className="flex items-center gap-2.5">
                <User size={15} className="text-[#06B6D4] shrink-0" />
                <span>Personalized over time</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={15} className="text-[#10B981] shrink-0" />
                <span>Private by design</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Lock size={15} className="text-[#A855F7] shrink-0" />
                <span>Always on your terms</span>
              </div>
            </div>

            <div>
              <button
                onClick={() => onGetStarted("register")}
                className={`px-6 py-3 rounded-full text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-2 ${t.secBtn}`}
              >
                <span>See all features</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────── SECTION 5: KINETIC ADAPTATION ────────────────────────── */}
      <section id="adaptation" className={`py-28 px-6 sm:px-12 max-w-5xl mx-auto text-center border-t ${t.borderSubtle}`}>
        <span className="text-[11px] font-bold tracking-[0.2em] text-[#A855F7] uppercase mb-4 block">
          Conversational Adaptation
        </span>

        <h2 className={`text-2xl sm:text-3xl font-normal mb-8 ${t.textMuted}`}>
          Aura notices changes in how you speak, and adjusts in real time.
        </h2>

        {/* Dynamic 3D Transforming Headline */}
        <div className="min-h-[110px] flex items-center justify-center perspective-[800px]">
          <AnimatePresence mode="wait">
            {adaptationStep === 0 ? (
              <motion.h3
                key="step0"
                initial={{ opacity: 0, rotateX: 60, y: 25 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={{ opacity: 0, rotateX: -60, y: -25 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`text-3xl sm:text-5xl font-serif tracking-tight font-normal ${t.text}`}
              >
                &ldquo;Let&apos;s solve this.&rdquo;
              </motion.h3>
            ) : (
              <motion.h3
                key="step1"
                initial={{ opacity: 0, rotateX: 60, y: 25 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={{ opacity: 0, rotateX: -60, y: -25 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`text-3xl sm:text-5xl font-serif tracking-tight font-normal ${isDark ? "text-[#C4B5FD]" : "text-[#7C3AED]"}`}
              >
                &ldquo;Let&apos;s take this one step at a time.&rdquo;
              </motion.h3>
            )}
          </AnimatePresence>
        </div>

        <p className={`text-xs sm:text-sm max-w-lg mx-auto mt-6 font-normal leading-relaxed ${t.textSubtle}`}>
          From energetic problem-solving to gentle emotional containment, Aura adapts its tone, cadence, and breath
          guidance to match what you need most in that exact moment.
        </p>
      </section>

      {/* ────────────────────────── SECTION 6: MEANINGFUL MEMORY ────────────────────────── */}
      <section id="memory" className={`py-28 px-6 sm:px-12 max-w-6xl mx-auto border-t ${t.borderSubtle}`}>
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[11px] font-bold tracking-[0.2em] text-[#A855F7] uppercase mb-3 block">
            Longitudinal Memory
          </span>
          <h2 className={`text-3xl sm:text-5xl font-serif tracking-tight mb-4 font-normal ${t.text}`}>
            Some conversations are worth remembering.
          </h2>
          <p className={`text-sm font-normal leading-relaxed ${t.textMuted}`}>
            Aura connects the dots across your weeks so you don&apos;t have to re-explain yourself every time.
          </p>
        </div>

        {/* Clean Chronological Memory Cards with Subtle 3D Hover Depth */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            {
              time: "This Week",
              title: "Exam Preparation Stress",
              note: "Mentioned anxiety around timing and focus blocks.",
              tag: "Academics",
            },
            {
              time: "Last Week",
              title: "Sleep Routine Shift",
              note: "Identified evening screen fatigue as a key disruption.",
              tag: "Wellness",
            },
            {
              time: "Two Weeks Ago",
              title: "Shorter Breath Exercises",
              note: "Prefers 2-minute somatic resets over lengthy meditations.",
              tag: "Pacing",
            },
            {
              time: "Ongoing",
              title: "Career Transition Goal",
              note: "Targeting engineering interview milestones by quarter end.",
              tag: "Long-Term",
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -4, scale: 1.02 }}
              className={`backdrop-blur-md border rounded-2xl p-5 flex flex-col justify-between shadow-md transition-all ${
                isDark
                  ? "bg-[#100D1C]/70 border-white/[0.08] hover:border-purple-500/30"
                  : "bg-white/85 border-purple-100 hover:border-purple-300/60 shadow-purple-500/5"
              }`}
            >
              <div>
                <span className="text-[10.5px] font-mono text-[#A855F7] font-semibold block mb-2">
                  {item.time}
                </span>
                <h4 className={`text-sm font-bold mb-2 leading-snug ${t.text}`}>
                  {item.title}
                </h4>
                <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
                  {item.note}
                </p>
              </div>
              <div className={`pt-4 mt-4 border-t flex items-center justify-between text-[10.5px] ${isDark ? "border-white/[0.06] text-[#6A6480]" : "border-black/[0.06] text-[#8E87A4]"}`}>
                <span>{item.tag}</span>
                <span className={isDark ? "text-white/40" : "text-black/40"}>Encrypted</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Personal Agency & Transparency Callout */}
        <div className={`border rounded-2xl p-5 max-w-xl mx-auto flex items-center justify-between gap-4 ${
          isDark ? "bg-[#131022] border-white/[0.08]" : "bg-white border-purple-200/60 shadow-sm"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#A855F7]/15 text-[#A855F7] flex items-center justify-center shrink-0">
              <Lock size={15} />
            </div>
            <div>
              <span className={`text-xs font-bold block ${t.text}`}>
                Your memory. Your choice.
              </span>
              <span className={`text-[11px] font-normal ${t.textSubtle}`}>
                View, edit, export, or permanently delete remembered context anytime.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────── SECTION 7: QUIET SAFETY & PRIVACY ────────────────────────── */}
      <section id="safety" className={`py-28 px-6 sm:px-12 max-w-5xl mx-auto border-t ${t.borderSubtle}`}>
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[11px] font-bold tracking-[0.2em] text-[#06B6D4] uppercase mb-3 block">
            Privacy & Guardrails
          </span>
          <h2 className={`text-3xl sm:text-5xl font-serif tracking-tight mb-4 font-normal ${t.text}`}>
            Your signals are yours.
          </h2>
          <p className={`text-sm font-normal leading-relaxed ${t.textMuted}`}>
            Built from first principles under the India DPDP Act 2023. Video is analyzed in volatile memory
            and discarded in milliseconds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mb-10">
          <div className={`border rounded-2xl p-6 transition-all ${
            isDark ? "bg-[#100D1C]/70 border-white/[0.08]" : "bg-white/85 border-purple-100 shadow-md shadow-purple-500/5"
          }`}>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-[#10B981] flex items-center justify-center mb-3.5">
              <ShieldCheck size={18} />
            </div>
            <h4 className={`text-sm font-bold mb-2 ${t.text}`}>
              Volatile Processing
            </h4>
            <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
              Camera frames are evaluated for Action Units and immediately dropped. No video is ever saved to disk or cloud storage.
            </p>
          </div>

          <div className={`border rounded-2xl p-6 transition-all ${
            isDark ? "bg-[#100D1C]/70 border-white/[0.08]" : "bg-white/85 border-purple-100 shadow-md shadow-purple-500/5"
          }`}>
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-[#06B6D4] flex items-center justify-center mb-3.5">
              <Lock size={18} />
            </div>
            <h4 className={`text-sm font-bold mb-2 ${t.text}`}>
              Consent Architecture
            </h4>
            <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
              Every sensory channel requires explicit user activation. You control when Aura listens, looks, or takes a pause.
            </p>
          </div>

          <div className={`border rounded-2xl p-6 transition-all ${
            isDark ? "bg-[#100D1C]/70 border-white/[0.08]" : "bg-white/85 border-purple-100 shadow-md shadow-purple-500/5"
          }`}>
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-[#A855F7] flex items-center justify-center mb-3.5">
              <Heart size={18} />
            </div>
            <h4 className={`text-sm font-bold mb-2 ${t.text}`}>
              Certified Crisis Safety
            </h4>
            <p className={`text-xs leading-relaxed font-normal ${t.textMuted}`}>
              Aura is not a doctor. If acute distress is detected, it connects immediately to Tele-MANAS (14416) and AASRA helplines.
            </p>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={onNavigateToPrivacy}
            className={`text-xs hover:underline cursor-pointer bg-transparent border-none font-medium ${
              isDark ? "text-[#A855F7]" : "text-[#7C3AED]"
            }`}
          >
            Read our complete Privacy Policy & DPDP Rights →
          </button>
        </div>
      </section>

      {/* ────────────────────────── SECTION 8: FINAL CINEMATIC CTA (3D CAMERA PUSH-IN) ────────────────────────── */}
      <section className={`py-32 px-6 sm:px-12 max-w-4xl mx-auto text-center border-t perspective-[1200px] ${t.borderSubtle}`}>
        {/* The Mascot scaling dramatically forward in 3D center stage */}
        <div className="flex flex-col items-center justify-center mb-8">
          <motion.div
            style={{
              scale: finalGlowScale,
              opacity: finalGlowOpacity,
              background: isDark
                ? "radial-gradient(circle, rgba(168, 85, 247, 0.45) 0%, rgba(244, 114, 182, 0.2) 50%, transparent 75%)"
                : "radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, rgba(244, 114, 182, 0.15) 50%, transparent 75%)",
            }}
            className="w-56 h-56 rounded-full absolute pointer-events-none blur-3xl"
          />

          <motion.div
            style={{
              scale: finalMascotScale,
              z: finalMascotZ,
              y: finalMascotY,
              transformStyle: "preserve-3d",
            }}
            className="relative z-10 flex items-center justify-center"
          >
            <img
              src={auraMascotPng}
              alt="Talk to Aura"
              className="w-44 sm:w-56 h-auto object-contain drop-shadow-[0_25px_45px_rgba(0,0,0,0.85)]"
              draggable={false}
            />
          </motion.div>
        </div>

        <h2 className={`text-4xl sm:text-6xl font-serif tracking-tight leading-tight mb-4 font-normal ${t.text}`}>
          Talk to Aura.
        </h2>

        <p className={`text-sm sm:text-base max-w-md mx-auto font-normal leading-relaxed mb-8 ${t.textMuted}`}>
          Sometimes being understood starts with being heard.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => onGetStarted("register")}
            className="px-8 py-3.5 rounded-full text-xs sm:text-sm font-semibold bg-[#6D28D9] hover:bg-[#7C3AED] text-white shadow-[0_10px_28px_rgba(109,40,217,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border-none flex items-center gap-2"
          >
            <span>Meet Aura</span>
            <ArrowRight size={14} />
          </button>

          <button
            onClick={onTryGuestDemo}
            className={`px-6 py-3.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${t.secBtn}`}
          >
            <span>Explore the product</span>
          </button>
        </div>
      </section>

      {/* ────────────────────────── MINIMAL FOOTER ────────────────────────── */}
      <footer className={`border-t py-12 px-6 sm:px-12 text-xs max-w-7xl mx-auto ${t.border} ${t.textSubtle}`}>
        <div className="flex flex-wrap items-center justify-between gap-6 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#9333EA] to-[#06B6D4]" />
            <span className={`font-bold ${t.text}`}>Aura AI</span>
          </div>

          <div className={`flex flex-wrap items-center gap-6 ${isDark ? "text-[#9E98B4]" : "text-[#6B6380]"}`}>
            <a
              href="#product"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("product")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-black"}`}
            >
              Product
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-black"}`}
            >
              How it works
            </a>
            <a
              href="#safety"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("safety")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-black"}`}
            >
              Safety & Ethics
            </a>
            <button
              onClick={onNavigateToPrivacy}
              className={`transition-colors bg-transparent border-none cursor-pointer p-0 font-normal ${
                isDark ? "hover:text-white text-[#9E98B4]" : "hover:text-black text-[#6B6380]"
              }`}
            >
              Privacy Notice
            </button>
          </div>
        </div>

        <p className={`max-w-2xl text-[11px] leading-relaxed m-0 ${isDark ? "text-[#6A6480]" : "text-[#78718E]"}`}>
          Aura AI is an affective conversational wellness companion and does not provide clinical diagnosis or medical treatment.
          If you are experiencing an acute mental health crisis, please reach out to Tele-MANAS at <strong>14416</strong> or AASRA at <strong>+91 9820466726</strong>.
        </p>

        <p className={`mt-4 text-[10px] m-0 ${isDark ? "text-[#5A5470]" : "text-[#8E87A4]"}`}>
          © {new Date().getFullYear()} Aura AI • Built with privacy & empathy.
        </p>
      </footer>
    </div>
  );
}
