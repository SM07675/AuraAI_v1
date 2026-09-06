import React, { useRef, useEffect, useState, useCallback, useContext, createContext } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  useInView,
  AnimatePresence,
  type Variants,
} from "motion/react";
import {
  Sun,
  Moon,
  Play,
  Volume2,
  VolumeX,
  ShieldCheck,
  Lock,
  ArrowRight,
  Sparkles,
  Check,
  ChevronDown,
  ExternalLink,
  Download,
  Trash2,
  Edit2,
  Heart,
  Brain,
  Activity,
  Sliders,
  Clock,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import auraMascotPng from "../../assets/aura-mascot-3d.png";
import { useTheme } from "../context/ThemeContext";
import { voiceService } from "../services/voiceService";

// ─────────────────────────────────────────────
// PROPS & CONTEXT
// ─────────────────────────────────────────────
interface LandingPageProps {
  onGetStarted: (mode?: "login" | "register") => void;
  onTryGuestDemo: () => void;
  onNavigateToPrivacy: () => void;
  isLoggedIn?: boolean;
  onEnterDashboard?: () => void;
}

const ScrollContainerContext = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

// ─────────────────────────────────────────────
// SPRING CONFIGS
// ─────────────────────────────────────────────
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 220, damping: 22 };
const SPRING_SOFT   = { type: "spring" as const, stiffness: 80,  damping: 14 };
const SPRING_SLOW   = { type: "spring" as const, stiffness: 50,  damping: 12 };

// ─────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────
function useCountUp(target: number, duration = 1.8) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!isInView) return;
    let frame = 0;
    const total = Math.ceil(duration * 60);
    const tick = () => {
      frame++;
      setCount(Math.round(target * (frame / total)));
      if (frame < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, target, duration]);

  return { count, ref };
}

function useMagnetic(strength = 0.35) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 22 });
  const sy = useSpring(y, { stiffness: 300, damping: 22 });

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      x.set((e.clientX - (r.left + r.width / 2)) * strength);
      y.set((e.clientY - (r.top + r.height / 2)) * strength);
    },
    [x, y, strength]
  );
  const onLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return { ref, sx, sy, onMove, onLeave };
}

// ─────────────────────────────────────────────
// BASE UI & 3D PHYSICS COMPONENTS
// ─────────────────────────────────────────────
function ScrollReveal({
  children,
  delay = 0,
  from = "bottom",
  className = "",
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: "bottom" | "left" | "right" | "top" | "scale";
  className?: string;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, margin: "-80px" });

  const initial =
    from === "bottom"
      ? { opacity: 0, y: 50, filter: "blur(8px)" }
      : from === "top"
      ? { opacity: 0, y: -50, filter: "blur(8px)" }
      : from === "left"
      ? { opacity: 0, x: -60, filter: "blur(8px)" }
      : from === "right"
      ? { opacity: 0, x: 60, filter: "blur(8px)" }
      : { opacity: 0, scale: 0.88, filter: "blur(10px)" };

  const animate =
    from === "bottom" || from === "top"
      ? { opacity: 1, y: 0, filter: "blur(0px)" }
      : from === "left" || from === "right"
      ? { opacity: 1, x: 0, filter: "blur(0px)" }
      : { opacity: 1, scale: 1, filter: "blur(0px)" };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={isInView ? animate : initial}
      transition={{ ...SPRING_SOFT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function MagneticButton({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { ref, sx, sy, onMove, onLeave } = useMagnetic(0.4);
  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96, y: 1 }}
      transition={SPRING_SNAPPY}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

function TiltCard({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const rotX = useTransform(ny, [-0.5, 0.5], [7, -7]);
  const rotY = useTransform(nx, [-0.5, 0.5], [-7, 7]);
  const sRotX = useSpring(rotX, { stiffness: 200, damping: 20 });
  const sRotY = useSpring(rotY, { stiffness: 200, damping: 20 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    nx.set((e.clientX - r.left) / r.width - 0.5);
    ny.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    nx.set(0);
    ny.set(0);
  };

  return (
    <motion.div
      style={{ rotateX: sRotX, rotateY: sRotY, transformStyle: "preserve-3d", ...style }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function FloatingOrb({
  color,
  size,
  style,
  animClass,
  delay,
  blur = 0,
}: {
  color: string;
  size: number;
  style?: React.CSSProperties;
  animClass: string;
  delay: number;
  blur?: number;
}) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...SPRING_SOFT, delay }}
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        filter: blur ? `blur(${blur}px)` : undefined,
        ...style,
      }}
      className={animClass}
    />
  );
}

// ─────────────────────────────────────────────
// CURSOR GLOW
// ─────────────────────────────────────────────
function CursorGlow() {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const sx = useSpring(x, { stiffness: 80, damping: 18 });
  const sy = useSpring(y, { stiffness: 80, damping: 18 });
  const dotX = useSpring(x, { stiffness: 600, damping: 30 });
  const dotY = useSpring(y, { stiffness: 600, damping: 30 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [x, y]);

  return (
    <>
      <motion.div
        className="pointer-events-none fixed z-[9999]"
        style={{
          x: sx,
          y: sy,
          translateX: "-50%",
          translateY: "-50%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(123,86,219,0.08) 0%, transparent 70%)",
        }}
      />
      <motion.div
        className="pointer-events-none fixed z-[9999]"
        style={{
          x: dotX,
          y: dotY,
          translateX: "-50%",
          translateY: "-50%",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "rgba(168,85,247,0.75)",
          boxShadow: "0 0 14px rgba(168,85,247,0.9)",
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// FIXED HEADER (With Theme Toggle & No Pricing)
// ─────────────────────────────────────────────
function Header({
  onGetStarted,
  isLoggedIn,
  onEnterDashboard,
  scrollToSection,
  isDark,
  toggleTheme,
}: {
  onGetStarted: (mode?: "login" | "register") => void;
  isLoggedIn?: boolean;
  onEnterDashboard?: () => void;
  scrollToSection: (id: string) => void;
  isDark: boolean;
  toggleTheme: () => void;
}) {
  const container = useContext(ScrollContainerContext);
  const { scrollY } = useScroll({ container: container || undefined });
  const bgOpacity = useTransform(scrollY, [0, 60], [0, 1]);

  // Replaced "Pricing" with "Experience" as requested!
  const navLinks = [
    { label: "Product", id: "product" },
    { label: "How it works", id: "how-it-works" },
    { label: "Research", id: "research" },
    { label: "Experience", id: "experience" },
    { label: "Safety", id: "safety" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 h-[70px] transition-colors">
      <motion.div
        className="absolute inset-0 border-b backdrop-blur-xl transition-colors"
        style={{
          opacity: bgOpacity,
          background: isDark ? "rgba(14, 11, 23, 0.85)" : "rgba(250, 248, 245, 0.85)",
          borderColor: isDark ? "rgba(169, 139, 232, 0.15)" : "rgba(195, 172, 162, 0.25)",
          boxShadow: isDark
            ? "0 4px 24px rgba(0, 0, 0, 0.5)"
            : "0 1px 0 rgba(255,255,255,0.95), 0 4px 20px rgba(195,172,162,0.14)",
        }}
      />

      {/* Brand */}
      <div
        className="relative flex items-center gap-3 cursor-pointer select-none"
        onClick={() => scrollToSection("hero")}
      >
        <motion.div
          whileHover={{ rotate: 18, scale: 1.1 }}
          transition={SPRING_SNAPPY}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, #9333EA, #A855F7, #06B6D4)",
            boxShadow: "0 0 16px rgba(168,85,247,0.5)",
          }}
        >
          <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
        </motion.div>
        <div>
          <div
            className="font-sans font-bold text-[17px] leading-tight"
            style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
          >
            Aura AI
          </div>
          <div
            className="font-sans font-medium text-[10.5px] leading-tight"
            style={{ color: isDark ? "#8E88A3" : "#777287" }}
          >
            A more human AI
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="relative hidden md:flex items-center gap-7">
        {navLinks.map((item, i) => (
          <motion.button
            key={item.label}
            onClick={() => scrollToSection(item.id)}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SNAPPY, delay: 0.05 * i }}
            whileHover={{ y: -1, color: isDark ? "#C7B5F3" : "#7C3AED" }}
            className="font-sans text-[13px] font-semibold bg-transparent border-none cursor-pointer transition-colors"
            style={{ color: isDark ? "#A39EB2" : "#777287" }}
          >
            {item.label}
          </motion.button>
        ))}
      </nav>

      {/* Actions */}
      <div className="relative flex items-center gap-3">
        {/* Tactile Theme Toggle Button */}
        <motion.button
          onClick={toggleTheme}
          whileHover={{ scale: 1.1, rotate: isDark ? 20 : -20 }}
          whileTap={{ scale: 0.92 }}
          transition={SPRING_SNAPPY}
          title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer border transition-colors shadow-sm"
          style={{
            background: isDark
              ? "linear-gradient(145deg, #1F1A2E 0%, #151122 100%)"
              : "linear-gradient(145deg, #FFFFFF 0%, #F5ECE5 100%)",
            borderColor: isDark ? "rgba(169, 139, 232, 0.3)" : "rgba(255, 255, 255, 0.9)",
            color: isDark ? "#FDE047" : "#7C3AED",
            boxShadow: isDark
              ? "0 4px 12px rgba(0,0,0,0.4)"
              : "3px 4px 10px rgba(198,178,190,0.3), -2px -2px 6px rgba(255,255,255,0.9)",
          }}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </motion.button>

        {isLoggedIn ? (
          <MagneticButton onClick={onEnterDashboard}>
            <div
              className="px-5 py-2 rounded-full font-sans text-xs font-bold text-white cursor-pointer btn-primary-glow"
              style={{
                background: "linear-gradient(140deg, #9333EA 0%, #7C3AED 100%)",
                boxShadow: "0 6px 20px rgba(124,58,237,0.4)",
              }}
            >
              Enter Dashboard →
            </div>
          </MagneticButton>
        ) : (
          <>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={SPRING_SNAPPY}
              onClick={() => onGetStarted("login")}
              className="px-4 py-1.5 rounded-full font-sans text-xs font-semibold cursor-pointer border transition-colors"
              style={{
                background: isDark
                  ? "linear-gradient(145deg, #1B1728 0%, #120F1D 100%)"
                  : "linear-gradient(145deg, #FAF4F0 0%, #F5ECE5 100%)",
                borderColor: isDark ? "rgba(169, 139, 232, 0.25)" : "rgba(255, 255, 255, 0.95)",
                color: isDark ? "#C7B5F3" : "#777287",
                boxShadow: isDark
                  ? "0 4px 12px rgba(0,0,0,0.3)"
                  : "3px 4px 10px rgba(198,178,190,0.25), -2px -2px 6px rgba(255,255,255,0.95)",
              }}
            >
              Sign in
            </motion.button>

            <MagneticButton onClick={() => onGetStarted("register")}>
              <div
                className="px-5 py-2 rounded-full font-sans text-xs font-bold text-white cursor-pointer btn-primary-glow"
                style={{
                  background: "linear-gradient(140deg, #9333EA 0%, #7C3AED 100%)",
                  boxShadow: "0 6px 20px rgba(124,58,237,0.4)",
                }}
              >
                Get started →
              </div>
            </MagneticButton>
          </>
        )}
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// SCROLL PROGRESS RAIL
// ─────────────────────────────────────────────
function ScrollRail({ isDark }: { isDark: boolean }) {
  const container = useContext(ScrollContainerContext);
  const { scrollYProgress } = useScroll({ container: container || undefined });
  const scaleY = useSpring(scrollYProgress, { stiffness: 60, damping: 15 });
  const steps = ["01", "02", "03", "04", "05"];

  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center gap-2 pointer-events-none">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-col items-center gap-1.5">
          <span
            className="font-mono text-[9px] font-semibold tracking-wider select-none"
            style={{ color: isDark ? "#6E6882" : "#A39EB2" }}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <div className="scroll-rail-line h-10 w-[2px]">
              <motion.div
                style={{
                  height: "100%",
                  background: "#A855F7",
                  scaleY: scaleY,
                  transformOrigin: "top",
                  width: "100%",
                  borderRadius: 999,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// ACT I: HERO SANCTUARY
// ─────────────────────────────────────────────
function HeroSection({
  onGetStarted,
  onTryGuestDemo,
  onNavigateToPrivacy,
  isLoggedIn,
  onEnterDashboard,
  scrollToSection,
  isDark,
}: {
  onGetStarted: (mode?: "login" | "register") => void;
  onTryGuestDemo: () => void;
  onNavigateToPrivacy: () => void;
  isLoggedIn?: boolean;
  onEnterDashboard?: () => void;
  scrollToSection: (id: string) => void;
  isDark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const container = useContext(ScrollContainerContext);
  const { scrollYProgress } = useScroll({
    container: container || undefined,
    target: ref,
    offset: ["start start", "end start"],
  });

  const contentY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const archY    = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const archScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
  const archOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  const sContentY = useSpring(contentY, { stiffness: 60, damping: 15 });
  const sArchY    = useSpring(archY,    { stiffness: 60, damping: 15 });

  // Audio greeting playback
  const [isPlayingGreeting, setIsPlayingGreeting] = useState(false);
  const handleToggleGreeting = () => {
    if (isPlayingGreeting) {
      voiceService.stop();
      setIsPlayingGreeting(false);
    } else {
      voiceService.stop();
      setIsPlayingGreeting(true);
      voiceService.speak("Namaste! I'm listening to your thoughts.", () => {
        setIsPlayingGreeting(false);
      });
    }
  };

  useEffect(() => {
    return () => {
      voiceService.stop();
    };
  }, []);

  const headlineVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.18, delayChildren: 0.25 } },
  };
  const wordVariant: Variants = {
    hidden: { opacity: 0, y: 40, filter: "blur(12px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { ...SPRING_SOFT } },
  };

  return (
    <section
      id="hero"
      ref={ref}
      className="hero-mesh-bg relative min-h-screen flex items-center pt-[90px] pb-16 overflow-hidden"
    >
      {/* Ambient background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <FloatingOrb
          color={isDark ? "rgba(168,85,247,0.18)" : "rgba(196,181,253,0.25)"}
          size={520}
          style={{ top: -100, right: -100 }}
          animClass="float-orb-a"
          delay={0}
          blur={60}
        />
        <FloatingOrb
          color={isDark ? "rgba(244,114,182,0.12)" : "rgba(253,186,116,0.18)"}
          size={360}
          style={{ bottom: -80, left: -60 }}
          animClass="float-orb-b"
          delay={0.4}
          blur={50}
        />
      </div>

      <div className="relative w-full max-w-[1440px] mx-auto px-6 md:px-14 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* ── Left Column ── */}
        <motion.div style={{ y: sContentY }} className="flex flex-col gap-6 will-gpu">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
            className="eyebrow-label flex items-center gap-2 select-none"
          >
            <div className="w-6 h-[2px] rounded-full bg-[#A855F7]" />
            AURA AI · COMPANION SYSTEM
          </motion.div>

          {/* Editorial Serif Headline */}
          <motion.h1
            variants={headlineVariants}
            initial="hidden"
            animate="visible"
            className="font-serif text-[48px] sm:text-[62px] lg:text-[76px] leading-[1.05] tracking-[-0.025em] font-light"
            style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
          >
            {["A more", "understanding", "AI."].map((line, i) => (
              <motion.span
                key={i}
                variants={wordVariant}
                className={`block ${i === 1 ? "italic" : ""}`}
                style={{
                  color: i === 1 ? (isDark ? "#C7B5F3" : "#7C3AED") : undefined,
                }}
              >
                {line}
              </motion.span>
            ))}
          </motion.h1>

          {/* Body Paragraph */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SOFT, delay: 0.8 }}
            className="font-sans text-[15px] sm:text-[16px] leading-[1.65] max-w-[430px]"
            style={{ color: isDark ? "#A8A2B8" : "#777287" }}
          >
            Aura listens, observes, and remembers — offering guidance that meets you exactly where
            you are, in real time.
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SNAPPY, delay: 1 }}
            className="flex flex-wrap items-center gap-3.5 pt-2"
          >
            {isLoggedIn ? (
              <MagneticButton onClick={onEnterDashboard}>
                <div
                  className="px-8 py-4 rounded-full font-sans text-sm font-bold text-white cursor-pointer btn-primary-glow flex items-center gap-2"
                  style={{
                    background: "linear-gradient(140deg, #9333EA 0%, #7C3AED 100%)",
                    boxShadow: "0 10px 30px rgba(124,58,237,0.45)",
                  }}
                >
                  Enter Sanctuary →
                </div>
              </MagneticButton>
            ) : (
              <MagneticButton onClick={() => onGetStarted("register")}>
                <div
                  className="px-8 py-4 rounded-full font-sans text-sm font-bold text-white cursor-pointer btn-primary-glow flex items-center gap-2"
                  style={{
                    background: "linear-gradient(140deg, #9333EA 0%, #7C3AED 100%)",
                    boxShadow: "0 10px 30px rgba(124,58,237,0.45)",
                  }}
                >
                  Try Aura AI Free
                  <ArrowRight className="w-4 h-4" />
                </div>
              </MagneticButton>
            )}

            <MagneticButton onClick={onTryGuestDemo}>
              <div
                className="px-7 py-4 rounded-full font-sans text-sm font-semibold cursor-pointer flex items-center gap-2 border transition-colors shadow-sm"
                style={{
                  background: isDark
                    ? "linear-gradient(145deg, #1B1728 0%, #120F1D 100%)"
                    : "linear-gradient(145deg, #FFFFFF 0%, #F5ECE5 100%)",
                  borderColor: isDark ? "rgba(169, 139, 232, 0.25)" : "rgba(255, 255, 255, 0.95)",
                  color: isDark ? "#F5F2EB" : "#1E182F",
                  boxShadow: isDark
                    ? "0 6px 20px rgba(0,0,0,0.4)"
                    : "4px 6px 16px rgba(198,178,190,0.25), -3px -3px 8px rgba(255,255,255,0.98)",
                }}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Watch 2 min demo
              </div>
            </MagneticButton>
          </motion.div>

          {/* Trust line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
            className="flex items-center gap-5 flex-wrap pt-2 font-sans text-[12px] font-semibold select-none"
            style={{ color: isDark ? "#716B82" : "#A39EB2" }}
          >
            <div className="flex items-center gap-1.5">
              <span>川</span>
              Natural voice
            </div>
            <div
              className="flex items-center gap-1.5 cursor-pointer hover:underline"
              onClick={onNavigateToPrivacy}
              title="Review Privacy Policy"
            >
              <span>🛡</span>
              Built for privacy
            </div>
            <div className="flex items-center gap-1.5">
              <span>📱</span>
              On your terms
            </div>
          </motion.div>

          {/* Scroll explore indicator */}
          <motion.button
            onClick={() => scrollToSection("research")}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="flex items-center gap-3 mt-4 bg-transparent border-none cursor-pointer p-0 font-sans text-[11px] font-bold tracking-wider select-none text-left"
            style={{ color: isDark ? "#716B82" : "#A39EB2" }}
          >
            <motion.div
              animate={{ y: [0, 5, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="w-8 h-8 rounded-full flex items-center justify-center border shadow-sm"
              style={{
                background: isDark
                  ? "linear-gradient(145deg, #1B1728 0%, #120F1D 100%)"
                  : "linear-gradient(145deg, #FAF4F0 0%, #F5ECE5 100%)",
                borderColor: isDark ? "rgba(169, 139, 232, 0.2)" : "rgba(255, 255, 255, 0.95)",
                color: isDark ? "#C7B5F3" : "#7C3AED",
              }}
            >
              ↓
            </motion.div>
            SCROLL TO EXPLORE
          </motion.button>
        </motion.div>

        {/* ── Right Column — Architectural Sunset Arch + Mascot ── */}
        <motion.div
          style={{ y: sArchY, opacity: archOpacity }}
          className="relative flex justify-center items-end will-gpu pt-8"
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING_SLOW, delay: 0.4 }}
            style={{ scale: archScale }}
            className="relative"
          >
            {/* Sunset Arch */}
            <div
              className="sunset-arch relative"
              style={{
                width: 330,
                height: 480,
                boxShadow: isDark
                  ? "0 24px 60px rgba(0, 0, 0, 0.7)"
                  : "0 20px 50px rgba(168,85,247,0.28)",
              }}
            >
              {/* Cloud wisps drifting */}
              {[
                { top: "25%", left: "10%", w: 80, opacity: 0.3 },
                { top: "35%", right: "5%", w: 60, opacity: 0.25 },
                { top: "55%", left: "15%", w: 100, opacity: 0.2 },
              ].map((cloud, i) => (
                <motion.div
                  key={i}
                  animate={{
                    x: [0, 6, 0],
                    opacity: [cloud.opacity, cloud.opacity * 1.4, cloud.opacity],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 5 + i,
                    ease: "easeInOut",
                    delay: i * 1.5,
                  }}
                  style={{
                    position: "absolute",
                    top: cloud.top,
                    left: "left" in cloud ? cloud.left : undefined,
                    right: "right" in cloud ? cloud.right : undefined,
                    width: cloud.w,
                    height: cloud.w / 2.5,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.55)",
                    filter: "blur(8px)",
                  }}
                />
              ))}

              {/* Floating Pastel Orbs */}
              <FloatingOrb
                color="linear-gradient(135deg, #FBD5D5, #F1A6A6)"
                size={38}
                style={{ top: "18%", right: "18%", zIndex: 2 }}
                animClass="float-orb-a"
                delay={0.9}
              />
              <FloatingOrb
                color="linear-gradient(135deg, #D4EBFC, #BBDCF5)"
                size={26}
                style={{ top: "32%", left: "14%", zIndex: 2 }}
                animClass="float-orb-b"
                delay={1.1}
              />
              <FloatingOrb
                color="linear-gradient(135deg, #D2F2E7, #BFE6D8)"
                size={22}
                style={{ top: "44%", right: "12%", zIndex: 2 }}
                animClass="float-orb-c"
                delay={1.3}
              />
            </div>

            {/* 3D Mascot Floating */}
            <motion.div
              initial={{ scale: 0, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ ...SPRING_SOFT, delay: 0.7 }}
              className="mascot-float will-gpu absolute pointer-events-none"
              style={{
                bottom: 30,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                filter: isDark
                  ? "drop-shadow(0 20px 50px rgba(168,85,247,0.5))"
                  : "drop-shadow(0 20px 40px rgba(123,86,219,0.35))",
              }}
            >
              <img
                src={auraMascotPng}
                alt="Aura AI Mascot"
                className="w-[210px] sm:w-[230px] h-auto object-contain select-none"
              />
            </motion.div>

            {/* Handwritten Annotation with Curved Arrow */}
            <motion.div
              initial={{ opacity: 0, rotate: -10, x: -20 }}
              animate={{ opacity: 1, rotate: -6, x: 0 }}
              transition={{ ...SPRING_SOFT, delay: 1.4 }}
              className="absolute font-hand select-none pointer-events-none"
              style={{
                top: "12%",
                left: -75,
                fontSize: 18,
                color: isDark ? "#C7B5F3" : "#7C3AED",
                transform: "rotate(-6deg)",
                whiteSpace: "nowrap",
              }}
            >
              Hey there, I&apos;m Aura! ✨
              <svg
                width="60"
                height="30"
                viewBox="0 0 60 30"
                style={{ position: "absolute", bottom: -20, right: -10 }}
              >
                <path
                  d="M5 5 Q 30 20 55 10"
                  fill="none"
                  stroke={isDark ? "#C7B5F3" : "#A855F7"}
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                <polygon points="55,6 55,14 62,10" fill={isDark ? "#C7B5F3" : "#A855F7"} />
              </svg>
            </motion.div>
          </motion.div>

          {/* Interactive Floating Audio Capsule */}
          <motion.div
            initial={{ opacity: 0, x: 30, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ ...SPRING_SOFT, delay: 1.1 }}
            onClick={handleToggleGreeting}
            className="audio-float absolute flex items-center gap-3 px-4 py-3 rounded-full border cursor-pointer select-none transition-transform hover:scale-105"
            style={{
              bottom: -15,
              right: -20,
              zIndex: 20,
              background: isDark ? "rgba(22, 17, 34, 0.95)" : "rgba(250,248,245,0.95)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.3)" : "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(16px)",
              maxWidth: 290,
              boxShadow: isDark
                ? "0 12px 30px rgba(0, 0, 0, 0.6)"
                : "4px 6px 16px rgba(198,178,190,0.3), -3px -3px 8px rgba(255,255,255,0.98)",
            }}
            title="Click to hear Aura speak"
          >
            {/* Waveform Bars */}
            <div className="flex items-end gap-[2px] h-5 shrink-0">
              {[10, 18, 14, 20, 12, 16, 8].map((h, i) => (
                <div
                  key={i}
                  className="wave-bar"
                  style={{
                    height: h,
                    animationDelay: `${i * 0.1}s`,
                    animationPlayState: isPlayingGreeting ? "running" : "paused",
                  }}
                />
              ))}
            </div>

            <span
              className="font-sans text-[11px] font-medium leading-[1.4] flex-1"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              &ldquo;Namaste! I&apos;m listening to your thoughts.&rdquo;
            </span>

            {/* Pulsating Beacon */}
            <div className="relative shrink-0 w-3 h-3">
              <div
                className="w-3 h-3 rounded-full bg-emerald-400"
                style={{ boxShadow: "0 0 8px #10B981" }}
              />
              <div
                className="absolute inset-0 rounded-full bg-emerald-400"
                style={{ animation: "beacon-pulse 1.8s ease-out infinite" }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT II (PART 1): METRICS BANNER
// ─────────────────────────────────────────────
function MetricsBanner({ isDark }: { isDark: boolean }) {
  const m1 = useCountUp(18, 1.5);
  const m2 = useCountUp(400, 1.8);
  const m3 = useCountUp(92, 1.6);

  const metrics = [
    {
      ref: m1.ref,
      value: m1.count,
      unit: "",
      suffix: " FACS",
      label: "Action Units detected per frame",
      icon: "🎭",
    },
    {
      ref: m2.ref,
      value: m2.count,
      unit: "<",
      suffix: "ms",
      label: "Response latency, real time duplex",
      icon: "⚡",
    },
    {
      ref: m3.ref,
      value: m3.count,
      unit: "",
      suffix: "%",
      label: "Emotion recognition clinical accuracy",
      icon: "🧠",
    },
  ];

  return (
    <section id="research" className="py-12 relative overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14">
        <ScrollReveal>
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-px rounded-[28px] overflow-hidden border shadow-sm"
            style={{
              background: isDark ? "rgba(169, 139, 232, 0.15)" : "rgba(195, 172, 162, 0.2)",
              borderColor: isDark ? "rgba(169, 139, 232, 0.2)" : "rgba(255, 255, 255, 0.95)",
            }}
          >
            {metrics.map((metric, i) => (
              <div
                key={i}
                className="p-8 flex flex-col gap-2 transition-colors"
                style={{
                  background: isDark
                    ? "linear-gradient(150deg, #181424 0%, #120F1D 100%)"
                    : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
                }}
              >
                <div className="text-2xl select-none">{metric.icon}</div>
                <div className="flex items-end gap-1">
                  <span
                    className="font-mono text-[46px] font-bold leading-none tracking-tight"
                    style={{ color: isDark ? "#C7B5F3" : "#7B56DB" }}
                  >
                    {metric.unit}
                    <span ref={metric.ref}>{metric.value}</span>
                    {metric.suffix}
                  </span>
                </div>
                <div
                  className="font-sans text-[13px] font-medium"
                  style={{ color: isDark ? "#8E88A3" : "#777287" }}
                >
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT II (PART 2): WHAT MAKES AURA DIFFERENT
// ─────────────────────────────────────────────
function WhatMakesDifferentSection({
  onNavigateToPrivacy,
  isDark,
}: {
  onNavigateToPrivacy: () => void;
  isDark: boolean;
}) {
  const tags = [
    { icon: "🎚", label: "Understands your emotions", pos: { top: "10%", left: "5%" } },
    { icon: "🧠", label: "Remembers your context",    pos: { top: "10%", right: "5%" } },
    { icon: "⏱", label: "Adapts in real time",        pos: { bottom: "12%", left: "5%" } },
    { icon: "📈", label: "Supports your growth",       pos: { bottom: "12%", right: "5%" } },
  ];

  return (
    <section id="product" className="py-24 relative">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Left Copy */}
        <div className="flex flex-col gap-6">
          <ScrollReveal>
            <div className="eyebrow-label">WHAT MAKES AURA DIFFERENT</div>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <h2
              className="font-serif text-[36px] sm:text-[46px] lg:text-[52px] leading-[1.12] tracking-[-0.015em] font-light"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              More than responses.{" "}
              <em style={{ color: isDark ? "#C7B5F3" : "#7C3AED" }}>A deeper connection.</em>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <p
              className="font-sans text-[15px] leading-[1.65] max-w-[440px]"
              style={{ color: isDark ? "#A8A2B8" : "#777287" }}
            >
              Aura combines multimodal perception, longitudinal memory, and adaptive tone to create
              support that actually evolves with you — not just answers that sound right.
            </p>
          </ScrollReveal>

          {/* Feature Bullets */}
          <div className="flex flex-col gap-3.5 mt-2">
            {[
              ["Reads facial expressions & voice tone simultaneously", "#7B56DB"],
              ["Maintains emotional continuity across every session", "#10B981"],
              ["Zero video storage — volatile frame processing only", "#06B6D4"],
              ["DPDP Act 2023 compliant, India-first privacy design", "#EC4899"],
            ].map(([text, color], i) => (
              <ScrollReveal key={i} delay={0.28 + i * 0.08} from="left">
                <div
                  className={`flex items-start gap-3 ${
                    i >= 2 ? "cursor-pointer hover:opacity-85" : ""
                  }`}
                  onClick={i >= 2 ? onNavigateToPrivacy : undefined}
                >
                  <div
                    className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ background: `${color}25`, border: `1.5px solid ${color}55` }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  </div>
                  <span
                    className="font-sans text-[14px] leading-[1.5]"
                    style={{ color: isDark ? "#C5BFD4" : "#5D5773" }}
                  >
                    {text}
                  </span>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* Right — 3D Tilt Frame with Mascot + Spatial Tags */}
        <ScrollReveal delay={0.15} from="right">
          <TiltCard className="perspective">
            <div
              className="relative overflow-visible rounded-[32px] p-2 border shadow-xl"
              style={{
                background: isDark
                  ? "linear-gradient(150deg, #181424 0%, #120F1D 100%)"
                  : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
                borderColor: isDark ? "rgba(169, 139, 232, 0.2)" : "rgba(255, 255, 255, 0.95)",
                boxShadow: isDark
                  ? "0 24px 60px rgba(0, 0, 0, 0.7)"
                  : "-8px -8px 20px rgba(255,255,255,0.98), 12px 16px 32px rgba(195,172,162,0.35)",
              }}
            >
              {/* Inner Scene Viewport */}
              <div
                className="w-full h-full rounded-[26px] flex items-center justify-center overflow-hidden relative min-h-[300px]"
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, #0D0A17 0%, #1E1538 50%, #101B2E 100%)"
                    : "linear-gradient(135deg, #1B1533 0%, #2D1C5E 50%, #1B2D4A 100%)",
                }}
              >
                {/* Internal cloud wisps */}
                {[
                  { top: "20%", left: "10%", w: 120, opacity: 0.12 },
                  { top: "50%", right: "8%", w: 90, opacity: 0.08 },
                ].map((c, i) => (
                  <motion.div
                    key={i}
                    animate={{ x: [0, 8, 0] }}
                    transition={{ repeat: Infinity, duration: 6 + i, ease: "easeInOut" }}
                    style={{
                      position: "absolute",
                      top: c.top,
                      left: "left" in c ? c.left : undefined,
                      right: "right" in c ? c.right : undefined,
                      width: c.w,
                      height: c.w / 3,
                      borderRadius: 999,
                      background: `rgba(169,139,232,${c.opacity})`,
                      filter: "blur(12px)",
                    }}
                  />
                ))}

                {/* Mascot floating */}
                <motion.img
                  src={auraMascotPng}
                  alt="Aura AI Multimodal Perception"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="w-[170px] h-auto object-contain relative z-[2] select-none"
                  style={{
                    filter: "drop-shadow(0 0 35px rgba(123,86,219,0.55))",
                  }}
                />
              </div>

              {/* 4 Corner Spatial Tags */}
              {tags.map((tag, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ ...SPRING_SNAPPY, delay: 0.35 + i * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.08, y: -2 }}
                  className="absolute flex items-center gap-2 px-3.5 py-2 rounded-full border shadow-md select-none"
                  style={{
                    ...tag.pos,
                    fontSize: 11,
                    fontWeight: 600,
                    backdropFilter: "blur(12px)",
                    zIndex: 10,
                    background: isDark ? "rgba(22, 17, 34, 0.92)" : "rgba(250,248,245,0.92)",
                    borderColor: isDark ? "rgba(169, 139, 232, 0.3)" : "rgba(255, 255, 255, 0.95)",
                    color: isDark ? "#F5F2EB" : "#1E182F",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontSize: 13 }}>{tag.icon}</span>
                  {tag.label}
                </motion.div>
              ))}
            </div>
          </TiltCard>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT III: HOW IT WORKS
// ─────────────────────────────────────────────
function HowItWorksSection({ isDark }: { isDark: boolean }) {
  const stages = [
    {
      num: "01",
      icon: "👁",
      color: "#7B56DB",
      colorLight: isDark ? "#281D47" : "#D4C5F7",
      label: "Perception",
      desc: "Analyzes facial expressions, voice tone, and context in real time — 18 FACS action units decoded per frame.",
    },
    {
      num: "02",
      icon: "⚡",
      color: "#06B6D4",
      colorLight: isDark ? "#122A38" : "#D4EBFC",
      label: "Affect Fusion",
      desc: "Combines multiple signals to understand your complete emotional state across modalities.",
    },
    {
      num: "03",
      icon: "💜",
      color: "#EC4899",
      colorLight: isDark ? "#381729" : "#FBD5D5",
      label: "Response Adaptation",
      desc: "Selects the right tone, pacing and guidance tuned precisely to your emotional moment.",
    },
    {
      num: "04",
      icon: "📈",
      color: "#10B981",
      colorLight: isDark ? "#123026" : "#D2F2E7",
      label: "Continuity",
      desc: "Remembers what matters so support gets better — and more personal — over time.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14">
        {/* Header */}
        <ScrollReveal>
          <div className="flex flex-col items-center text-center gap-4 mb-16">
            <div className="eyebrow-label">HOW IT WORKS</div>
            <h2
              className="font-serif text-[32px] sm:text-[44px] lg:text-[48px] leading-[1.12] tracking-[-0.015em] font-light max-w-[560px]"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              From a moment to meaningful support.
            </h2>
            <div className="flex items-center gap-2 select-none">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="font-mono text-[11px] font-semibold"
                    style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                  >
                    {s.num}
                  </div>
                  {i < stages.length - 1 && (
                    <div
                      className="w-8 h-[1px]"
                      style={{ background: isDark ? "rgba(169,139,232,0.2)" : "rgba(123,86,219,0.2)" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Pipeline Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">
          {stages.map((stage, i) => (
            <ScrollReveal key={i} delay={i * 0.1} from="bottom">
              <TiltCard className="perspective h-full">
                <motion.div
                  whileHover={{ y: -6 }}
                  transition={SPRING_SNAPPY}
                  className="rounded-[24px] p-6 flex flex-col gap-4 h-full border transition-all relative z-[1]"
                  style={{
                    background: isDark
                      ? "linear-gradient(150deg, #181424 0%, #120F1D 100%)"
                      : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
                    borderColor: isDark ? "rgba(169, 139, 232, 0.22)" : "rgba(255, 255, 255, 0.95)",
                    boxShadow: isDark
                      ? "0 14px 32px rgba(0,0,0,0.5)"
                      : "-6px -6px 16px rgba(255,255,255,0.98), 10px 14px 28px rgba(195,172,162,0.32)",
                  }}
                >
                  <div
                    className="font-mono text-[10px] font-semibold tracking-wider select-none"
                    style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                  >
                    STAGE {stage.num}
                  </div>

                  <motion.div
                    whileHover={{ rotate: 8, scale: 1.1 }}
                    transition={SPRING_SNAPPY}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl select-none"
                    style={{
                      background: stage.colorLight,
                      boxShadow: `0 4px 16px ${stage.color}25`,
                    }}
                  >
                    {stage.icon}
                  </motion.div>

                  <div
                    className="font-sans text-[17px] font-bold tracking-tight"
                    style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
                  >
                    {stage.label}
                  </div>

                  <div
                    className="font-sans text-[13px] leading-[1.55] flex-1"
                    style={{ color: isDark ? "#A8A2B8" : "#777287" }}
                  >
                    {stage.desc}
                  </div>

                  <div
                    className="h-[3px] rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${stage.color}, transparent)`,
                      opacity: 0.6,
                    }}
                  />
                </motion.div>
              </TiltCard>
            </ScrollReveal>
          ))}
        </div>

        {/* Peeking Mascot Note */}
        <ScrollReveal delay={0.45} from="right">
          <div className="flex justify-end items-center gap-4 mt-10 pr-4 select-none">
            <motion.div
              animate={{ rotate: [-2, 2, -2] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="font-hand text-[16px]"
              style={{ color: isDark ? "#C7B5F3" : "#7C3AED", transform: "rotate(-4deg)" }}
            >
              SUBTLE CUES. REAL SUPPORT. ⤷
            </motion.div>
            <img
              src={auraMascotPng}
              alt="Aura peeking"
              className="w-[65px] h-auto object-contain"
              style={{ filter: "drop-shadow(0 8px 16px rgba(123,86,219,0.3))" }}
            />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT IV: BUILT FOR REAL LIFE (Interactive Experience Tablet)
// ─────────────────────────────────────────────
function BuiltForRealLifeSection({
  onTryGuestDemo,
  isDark,
}: {
  onTryGuestDemo: () => void;
  isDark: boolean;
}) {
  const [activeMood, setActiveMood] = useState<number>(0);

  const moods = [
    { emoji: "😌", label: "Calm",    color: "#06B6D4" },
    { emoji: "😰", label: "Anxious", color: "#F59E0B" },
    { emoji: "🥱", label: "Tired",   color: "#8B5CF6" },
    { emoji: "😣", label: "Stressed",color: "#EC4899" },
    { emoji: "😊", label: "Happy",   color: "#10B981" },
  ];

  const responses = [
    "That calmness is beautiful — let's build on it with a 2-minute mindful reflection.",
    "I hear you. Let's try a gentle 4-count breathing reset together.",
    "Rest is sacred. Want a soothing 5-minute wind-down ambient audio?",
    "You're carrying a lot right now. Let's unpack it one small step at a time.",
    "That joy is contagious! What's bringing you this spark today?",
  ];

  const features = [
    "Voice or text, your choice",
    "Personalized over time",
    "Private by design",
    "Always on your terms",
  ];

  return (
    <section id="experience" className="py-24 relative">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Left: Interactive Twilight Desk Still Life Tablet */}
        <ScrollReveal from="left">
          <div className="relative flex justify-center">
            <TiltCard className="perspective">
              <motion.div
                whileHover={{ y: -4 }}
                transition={SPRING_SOFT}
                className="overflow-hidden rounded-[36px] border shadow-2xl"
                style={{
                  width: 340,
                  background: isDark
                    ? "linear-gradient(150deg, #181424 0%, #120F1D 100%)"
                    : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
                  borderColor: isDark ? "rgba(169, 139, 232, 0.25)" : "rgba(255, 255, 255, 0.95)",
                  boxShadow: isDark
                    ? "0 24px 60px rgba(0,0,0,0.7), inset 1px 1px 2px rgba(255,255,255,0.1)"
                    : "-8px -8px 20px rgba(255,255,255,0.98), 16px 20px 40px rgba(195,172,162,0.45), inset 3px 3px 6px rgba(255,255,255,0.95)",
                }}
              >
                {/* Tablet Status Bar */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 select-none">
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                  >
                    9:41 PM
                  </span>
                  <div className="eyebrow-label text-[9px]">AURA TABLET</div>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                  >
                    ●●● 100%
                  </span>
                </div>

                {/* Greeting */}
                <div className="px-5 pb-4">
                  <div
                    className="font-sans text-[12px] font-medium mb-1"
                    style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                  >
                    Good evening, Atharv ✨
                  </div>
                  <div
                    className="font-serif text-[22px] font-normal leading-[1.2]"
                    style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
                  >
                    How are you feeling right now?
                  </div>
                </div>

                {/* 5 Interactive Mood Pebbles */}
                <div className="flex items-center gap-2 px-5 pb-4 flex-wrap">
                  {moods.map((m, i) => (
                    <motion.button
                      key={i}
                      whileHover={{ scale: 1.1, y: -2 }}
                      whileTap={{ scale: 0.92 }}
                      transition={SPRING_SNAPPY}
                      onClick={() => setActiveMood(i)}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl cursor-pointer border transition-all"
                      style={{
                        background:
                          activeMood === i
                            ? `${m.color}25`
                            : isDark
                            ? "rgba(22, 17, 34, 0.7)"
                            : "rgba(239,230,226,0.8)",
                        borderColor: activeMood === i ? m.color : "transparent",
                        boxShadow:
                          activeMood === i ? `0 4px 16px ${m.color}40` : undefined,
                      }}
                    >
                      <span className="text-xl select-none">{m.emoji}</span>
                      <span
                        className="font-sans text-[9px] font-bold"
                        style={{
                          color: activeMood === i ? m.color : isDark ? "#8E88A3" : "#A39EB2",
                        }}
                      >
                        {m.label}
                      </span>
                    </motion.button>
                  ))}
                </div>

                {/* Dr. Aura Dynamic Response Box */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeMood}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={SPRING_SNAPPY}
                    className="mx-4 mb-4 p-4 rounded-2xl border"
                    style={{
                      background: `${moods[activeMood].color}12`,
                      borderColor: `${moods[activeMood].color}30`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5 select-none">
                      <img
                        src={auraMascotPng}
                        alt=""
                        className="w-5 h-5 object-contain"
                      />
                      <span
                        className="font-sans text-[11px] font-bold"
                        style={{ color: moods[activeMood].color }}
                      >
                        Dr. Aura Companion
                      </span>
                    </div>
                    <p
                      className="font-sans text-[12px] leading-[1.55]"
                      style={{ color: isDark ? "#E5E1F0" : "#5D5773" }}
                    >
                      {responses[activeMood]}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Tablet Inset Input Bar */}
                <div
                  className="mx-4 mb-5 flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-inner cursor-pointer"
                  style={{
                    background: isDark ? "#0E0B1A" : "#EFE6E2",
                    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.6)",
                  }}
                  onClick={onTryGuestDemo}
                >
                  <span className="text-xs select-none">🎙</span>
                  <span
                    className="font-sans text-[12px] flex-1"
                    style={{ color: isDark ? "#6E6882" : "#A39EB2" }}
                  >
                    Tap to begin voice session...
                  </span>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                    style={{ background: "#7C3AED" }}
                  >
                    ↑
                  </div>
                </div>
              </motion.div>
            </TiltCard>
          </div>
        </ScrollReveal>

        {/* Right: Editorial Copy */}
        <div className="flex flex-col gap-6">
          <ScrollReveal>
            <div className="eyebrow-label">BUILT FOR REAL LIFE</div>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <h2
              className="font-serif text-[32px] sm:text-[44px] lg:text-[46px] leading-[1.12] tracking-[-0.015em] font-light"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              Support that fits around{" "}
              <em style={{ color: isDark ? "#C7B5F3" : "#7C3AED" }}>your life.</em>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <p
              className="font-sans text-[15px] leading-[1.65] max-w-[420px]"
              style={{ color: isDark ? "#A8A2B8" : "#777287" }}
            >
              Aura is designed for the way you actually live — on your schedule, through your
              preferred medium, and with your privacy intact.
            </p>
          </ScrollReveal>

          <div className="flex flex-col gap-3 mt-2">
            {features.map((f, i) => (
              <ScrollReveal key={i} delay={0.25 + i * 0.08} from="left">
                <motion.div
                  whileHover={{ x: 4 }}
                  transition={SPRING_SNAPPY}
                  className="flex items-center gap-4 px-5 py-3.5 rounded-full border shadow-sm"
                  style={{
                    background: isDark
                      ? "linear-gradient(145deg, #181424 0%, #120F1D 100%)"
                      : "linear-gradient(145deg, #FAF4F0 0%, #F5ECE5 100%)",
                    borderColor: isDark ? "rgba(169, 139, 232, 0.2)" : "rgba(255, 255, 255, 0.95)",
                    boxShadow: isDark
                      ? "0 4px 14px rgba(0,0,0,0.3)"
                      : "4px 6px 14px rgba(198,178,190,0.25), -2px -2px 6px rgba(255,255,255,0.95)",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: isDark ? "#3B2A6F" : "#D4C5F7",
                      color: isDark ? "#C7B5F3" : "#7B56DB",
                    }}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span
                    className="font-sans text-[14px] font-medium"
                    style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
                  >
                    {f}
                  </span>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT V: ADAPTATION ENGINE
// ─────────────────────────────────────────────
function AdaptationSection({ isDark }: { isDark: boolean }) {
  const phrases = [
    "Let's solve this.",
    "Let's take this\none step at a time.",
    "You've got this.",
    "I'm right here with you.",
  ];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % phrases.length), 2800);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 flex flex-col items-center text-center gap-8">
        <ScrollReveal>
          <div className="eyebrow-label">ADAPTATION ENGINE</div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p
            className="font-sans text-[15px] max-w-[440px]"
            style={{ color: isDark ? "#A8A2B8" : "#777287" }}
          >
            Aura reads the room — and adjusts. In every session, the right words arrive at the right
            time.
          </p>
        </ScrollReveal>

        {/* Morphing Dynamic Typography */}
        <div className="min-h-[140px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40, filter: "blur(16px)", scale: 0.94 }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
              exit={{ opacity: 0, y: -32, filter: "blur(12px)", scale: 1.04 }}
              transition={SPRING_SOFT}
              className="font-serif text-[40px] sm:text-[54px] lg:text-[68px] font-light leading-[1.1] tracking-[-0.02em] whitespace-pre-line text-center"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              {phrases[idx]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Phrase Selector Dots */}
        <div className="flex items-center gap-2">
          {phrases.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setIdx(i)}
              animate={{
                scale: i === idx ? 1.4 : 1,
                opacity: i === idx ? 1 : 0.3,
              }}
              transition={SPRING_SNAPPY}
              className="w-2 h-2 rounded-full cursor-pointer p-0 border-none transition-opacity"
              style={{ background: "#A855F7" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT VI: LONGITUDINAL MEMORY
// ─────────────────────────────────────────────
function MemorySection({ isDark }: { isDark: boolean }) {
  const memories = [
    {
      when: "This Week",
      tag: "Academics",
      color: "#F59E0B",
      colorLight: isDark ? "#382512" : "#F9E7B3",
      title: "Exam Stress",
      note: "Felt overwhelmed before finals. Practiced 4-7-8 breathing.",
      icon: "📚",
    },
    {
      when: "Last Week",
      tag: "Wellness",
      color: "#10B981",
      colorLight: isDark ? "#123026" : "#D2F2E7",
      title: "Sleep Routine",
      note: "Established a consistent 10:30 PM wind-down with ambient audio.",
      icon: "🌙",
    },
    {
      when: "2 Weeks Ago",
      tag: "Wellness",
      color: "#7B56DB",
      colorLight: isDark ? "#281D47" : "#D4C5F7",
      title: "Breathing Reset",
      note: "Completed 7-day breathing streak. Baseline HRV improved.",
      icon: "🫁",
    },
    {
      when: "Ongoing",
      tag: "Personal",
      color: "#06B6D4",
      colorLight: isDark ? "#122A38" : "#D4EBFC",
      title: "Career Goal",
      note: "Building toward product management role by Q3. Weekly check-ins active.",
      icon: "🎯",
    },
  ];

  const handleExportMemories = () => {
    toast.success("Longitudinal memory archive exported in AES-256 decrypted JSON format.");
  };

  const handlePurgeMemories = () => {
    toast.info("DPDP Act 2023 purge protocol initiated. Memory vector storage cleared.");
  };

  return (
    <section className="py-24 relative">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* Left Header & Privacy Controls */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-28">
          <ScrollReveal>
            <div className="eyebrow-label">LONGITUDINAL MEMORY</div>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <h2
              className="font-serif text-[32px] sm:text-[44px] lg:text-[48px] leading-[1.12] tracking-[-0.015em] font-light"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              Your memory.{" "}
              <em style={{ color: isDark ? "#C7B5F3" : "#7C3AED" }}>Your choice.</em>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <p
              className="font-sans text-[15px] leading-[1.65] max-w-[390px]"
              style={{ color: isDark ? "#A8A2B8" : "#777287" }}
            >
              Aura builds a private longitudinal understanding of you — so every conversation starts
              smarter than the last.
            </p>
          </ScrollReveal>

          {/* Encrypted Badge */}
          <ScrollReveal delay={0.2}>
            <div
              className="inline-flex items-center gap-3 px-5 py-3 rounded-full border shadow-sm self-start"
              style={{
                background: isDark
                  ? "linear-gradient(145deg, #181424 0%, #120F1D 100%)"
                  : "linear-gradient(145deg, #FAF4F0 0%, #F5ECE5 100%)",
                borderColor: isDark ? "rgba(169, 139, 232, 0.25)" : "rgba(255, 255, 255, 0.95)",
              }}
            >
              <Lock className="w-4 h-4 text-[#06B6D4]" />
              <div>
                <div
                  className="font-sans text-[12px] font-bold"
                  style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
                >
                  End-to-End Encrypted
                </div>
                <div
                  className="font-mono text-[10px]"
                  style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                >
                  AES-256 · DPDP Act 2023 Compliant
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* DPDP Transparency Controls Box */}
          <ScrollReveal delay={0.25}>
            <div
              className="p-4 rounded-2xl border shadow-inner flex flex-col gap-3"
              style={{
                background: isDark ? "#0E0B1A" : "#EFE6E2",
                borderColor: isDark ? "rgba(255,255,200,0.06)" : "rgba(255,255,255,0.6)",
              }}
            >
              <div
                className="font-sans text-[12px] font-bold"
                style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
              >
                Data Transparency Controls
              </div>
              <div className="flex flex-col gap-2">
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  transition={SPRING_SNAPPY}
                  onClick={handleExportMemories}
                  className="px-4 py-2 text-left w-full rounded-full border font-sans text-[11px] font-semibold cursor-pointer flex items-center gap-2"
                  style={{
                    background: isDark ? "#1A1528" : "#FAF4F0",
                    borderColor: isDark ? "rgba(169, 139, 232, 0.2)" : "rgba(255, 255, 255, 0.95)",
                    color: isDark ? "#F5F2EB" : "#1E182F",
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export All Memories (JSON)
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  transition={SPRING_SNAPPY}
                  onClick={handlePurgeMemories}
                  className="px-4 py-2 text-left w-full rounded-full border font-sans text-[11px] font-semibold cursor-pointer flex items-center gap-2"
                  style={{
                    background: isDark ? "#2A1418" : "#FDE8E8",
                    borderColor: "rgba(239, 68, 68, 0.3)",
                    color: "#EF4444",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Permanently Purge Memory Archive
                </motion.button>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* Right Memory Cards */}
        <div className="flex flex-col gap-4">
          {memories.map((mem, i) => (
            <ScrollReveal key={i} delay={i * 0.1} from="right">
              <TiltCard className="perspective">
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={SPRING_SNAPPY}
                  className="rounded-[20px] p-5 flex gap-4 border shadow-sm"
                  style={{
                    background: isDark
                      ? "linear-gradient(150deg, #181424 0%, #120F1D 100%)"
                      : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
                    borderColor: isDark ? "rgba(169, 139, 232, 0.2)" : "rgba(255, 255, 255, 0.95)",
                    boxShadow: isDark
                      ? "0 10px 24px rgba(0,0,0,0.4)"
                      : "-6px -6px 16px rgba(255,255,255,0.98), 8px 12px 24px rgba(195,172,162,0.3)",
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 select-none"
                    style={{ background: mem.colorLight }}
                  >
                    {mem.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <div
                        className="font-sans text-[15px] font-bold"
                        style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
                      >
                        {mem.title}
                      </div>
                      <div
                        className="px-2 py-0.5 rounded-full font-sans text-[10px] font-bold"
                        style={{ background: `${mem.color}20`, color: mem.color }}
                      >
                        {mem.tag}
                      </div>
                      <div className="px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold text-[#06B6D4] bg-[#06B6D4]/10">
                        🔒 Encrypted
                      </div>
                    </div>
                    <div
                      className="font-mono text-[10px] mb-1.5"
                      style={{ color: isDark ? "#8E88A3" : "#A39EB2" }}
                    >
                      {mem.when}
                    </div>
                    <div
                      className="font-sans text-[13px] leading-[1.5]"
                      style={{ color: isDark ? "#A8A2B8" : "#777287" }}
                    >
                      {mem.note}
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT VII: PRIVACY & SAFETY
// ─────────────────────────────────────────────
function PrivacySection({
  onNavigateToPrivacy,
  isDark,
}: {
  onNavigateToPrivacy: () => void;
  isDark: boolean;
}) {
  const cards = [
    {
      icon: "🎞",
      color: "#06B6D4",
      colorLight: isDark ? "#122A38" : "#D4EBFC",
      title: "Volatile Frame Processing",
      desc: "All video analysis happens locally on-device. Zero frames ever leave your device. Processing is volatile — nothing persists after the session ends.",
    },
    {
      icon: "📋",
      color: "#7B56DB",
      colorLight: isDark ? "#281D47" : "#D4C5F7",
      title: "Consent Architecture",
      desc: "You choose exactly what Aura can access — camera, microphone, memory. Granular consent, withdrawable at any time with immediate effect.",
    },
    {
      icon: "🚨",
      color: "#EC4899",
      colorLight: isDark ? "#381729" : "#FBD5D5",
      title: "Crisis Escalation",
      desc: "When risk signals are detected, Aura automatically surfaces certified resources: Tele-MANAS 14416 and iCall 9152987821.",
    },
  ];

  return (
    <section id="safety" className="py-24 relative overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 flex flex-col gap-12">
        <ScrollReveal>
          <div className="flex flex-col items-center text-center gap-4">
            <div className="eyebrow-label">PRIVACY & SAFETY</div>
            <h2
              className="font-serif text-[32px] sm:text-[44px] lg:text-[48px] leading-[1.12] tracking-[-0.015em] font-light max-w-[520px]"
              style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
            >
              Built on radical transparency.
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map((card, i) => (
            <ScrollReveal key={i} delay={i * 0.12} from="bottom">
              <TiltCard className="perspective h-full">
                <motion.div
                  whileHover={{ y: -6 }}
                  transition={SPRING_SNAPPY}
                  className="rounded-[28px] p-7 flex flex-col gap-5 h-full border transition-all"
                  style={{
                    background: isDark
                      ? "linear-gradient(150deg, #181424 0%, #120F1D 100%)"
                      : "linear-gradient(150deg, #FAF4F0 0%, #F5ECE5 100%)",
                    borderColor: isDark ? "rgba(169, 139, 232, 0.22)" : "rgba(255, 255, 255, 0.95)",
                    boxShadow: isDark
                      ? "0 14px 32px rgba(0,0,0,0.5)"
                      : "-6px -6px 16px rgba(255,255,255,0.98), 10px 14px 28px rgba(195,172,162,0.32)",
                  }}
                >
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    transition={SPRING_SNAPPY}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl select-none"
                    style={{
                      background: card.colorLight,
                      boxShadow: `0 6px 20px ${card.color}25`,
                    }}
                  >
                    {card.icon}
                  </motion.div>

                  <div
                    className="font-sans text-[17px] font-bold tracking-tight"
                    style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
                  >
                    {card.title}
                  </div>

                  <div
                    className="font-sans text-[13px] leading-[1.65] flex-1"
                    style={{ color: isDark ? "#A8A2B8" : "#777287" }}
                  >
                    {card.desc}
                  </div>

                  <div
                    className="h-[2px] rounded-full"
                    style={{ background: `linear-gradient(90deg, ${card.color}, transparent)` }}
                  />
                </motion.div>
              </TiltCard>
            </ScrollReveal>
          ))}
        </div>

        {/* Action Link to Full Policy */}
        <ScrollReveal delay={0.4}>
          <div className="flex justify-center mt-2">
            <motion.button
              onClick={onNavigateToPrivacy}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className="px-6 py-3 rounded-full border font-sans text-xs font-bold cursor-pointer flex items-center gap-2 shadow-sm"
              style={{
                background: isDark ? "#1F1932" : "#FAF4F0",
                borderColor: isDark ? "rgba(169, 139, 232, 0.3)" : "rgba(255, 255, 255, 0.95)",
                color: isDark ? "#C7B5F3" : "#7C3AED",
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              Review Full Privacy & Compliance Documentation →
            </motion.button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ACT VIII: FINAL CTA
// ─────────────────────────────────────────────
function FinalCTASection({
  onGetStarted,
  onTryGuestDemo,
  isLoggedIn,
  onEnterDashboard,
  isDark,
}: {
  onGetStarted: (mode?: "login" | "register") => void;
  onTryGuestDemo: () => void;
  isLoggedIn?: boolean;
  onEnterDashboard?: () => void;
  isDark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const container = useContext(ScrollContainerContext);
  const { scrollYProgress } = useScroll({
    container: container || undefined,
    target: ref,
    offset: ["start end", "end start"],
  });

  const mascotScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1.15, 1]);
  const mascotY     = useTransform(scrollYProgress, [0, 0.5, 1], [60, 0, -20]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.4, 1], [0, 1, 0.5]);
  const sMascotScale = useSpring(mascotScale, { stiffness: 60, damping: 15 });
  const sMascotY     = useSpring(mascotY,     { stiffness: 60, damping: 15 });

  return (
    <section
      id="cta"
      ref={ref}
      className="py-32 relative overflow-hidden flex flex-col items-center text-center gap-12"
    >
      {/* Radial Volumetric Glow */}
      <motion.div
        style={{
          opacity: glowOpacity,
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: isDark
            ? "radial-gradient(circle, rgba(168,85,247,0.2) 0%, rgba(123,86,219,0.08) 45%, transparent 70%)"
            : "radial-gradient(circle, rgba(123,86,219,0.16) 0%, rgba(168,85,247,0.06) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Mascot Scaling Forward */}
      <motion.div style={{ scale: sMascotScale, y: sMascotY }} className="will-gpu">
        <motion.img
          src={auraMascotPng}
          alt="Meet Aura AI"
          animate={{ y: [0, -14, 0], rotate: [-1, 1, -1] }}
          transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
          className="w-[210px] sm:w-[240px] h-auto object-contain select-none"
          style={{
            filter: isDark
              ? "drop-shadow(0 24px 60px rgba(168,85,247,0.55))"
              : "drop-shadow(0 24px 60px rgba(123,86,219,0.4))",
          }}
        />
      </motion.div>

      <div className="flex flex-col items-center gap-4 relative z-10 px-6">
        <ScrollReveal>
          <div className="eyebrow-label">BEGIN YOUR JOURNEY</div>
        </ScrollReveal>

        <ScrollReveal delay={0.12}>
          <h2
            className="font-serif text-[44px] sm:text-[60px] lg:text-[76px] leading-[1.06] tracking-[-0.025em] font-light max-w-[640px]"
            style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
          >
            Meet Aura.{" "}
            <em style={{ color: isDark ? "#C7B5F3" : "#7C3AED" }}>Your AI companion.</em>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <p
            className="font-sans text-[15px] sm:text-[16px] leading-[1.65] max-w-[440px]"
            style={{ color: isDark ? "#A8A2B8" : "#777287" }}
          >
            Free to start. No credit card. Works on any device. Designed for people, not metrics.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
            {isLoggedIn ? (
              <MagneticButton onClick={onEnterDashboard}>
                <div
                  className="px-10 py-4 rounded-full font-sans text-base font-bold text-white cursor-pointer btn-primary-glow flex items-center gap-3 shadow-2xl"
                  style={{
                    background: "linear-gradient(140deg, #9333EA 0%, #7C3AED 100%)",
                    boxShadow: "0 12px 40px -4px rgba(123,86,219,0.55)",
                  }}
                >
                  Enter Dashboard →
                </div>
              </MagneticButton>
            ) : (
              <>
                <MagneticButton onClick={() => onGetStarted("register")}>
                  <div
                    className="px-10 py-4 rounded-full font-sans text-base font-bold text-white cursor-pointer btn-primary-glow flex items-center gap-3 shadow-2xl"
                    style={{
                      background: "linear-gradient(140deg, #9333EA 0%, #7C3AED 100%)",
                      boxShadow: "0 12px 40px -4px rgba(123,86,219,0.55)",
                    }}
                  >
                    Meet Aura
                    <motion.span
                      animate={{ x: [0, 4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    >
                      →
                    </motion.span>
                  </div>
                </MagneticButton>

                <MagneticButton onClick={onTryGuestDemo}>
                  <div
                    className="px-8 py-4 rounded-full font-sans text-base font-semibold cursor-pointer border shadow-sm"
                    style={{
                      background: isDark
                        ? "linear-gradient(145deg, #1B1728 0%, #120F1D 100%)"
                        : "linear-gradient(145deg, #FAF4F0 0%, #F5ECE5 100%)",
                      borderColor: isDark ? "rgba(169, 139, 232, 0.25)" : "rgba(255, 255, 255, 0.95)",
                      color: isDark ? "#F5F2EB" : "#1E182F",
                    }}
                  >
                    Try Guest Demo
                  </div>
                </MagneticButton>
              </>
            )}
          </div>
        </ScrollReveal>

        {/* Bottom Trust Row */}
        <ScrollReveal delay={0.4}>
          <div
            className="flex items-center gap-6 flex-wrap justify-center mt-4 font-sans text-[12px] font-semibold select-none"
            style={{ color: isDark ? "#716B82" : "#A39EB2" }}
          >
            {["🔒 DPDP Act Compliant", "⚡ 400ms Latency", "🧠 92% Accuracy", "🌱 Fully Private"].map(
              (item, i) => (
                <div key={i}>{item}</div>
              )
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────
function Footer({
  onNavigateToPrivacy,
  scrollToSection,
  isDark,
}: {
  onNavigateToPrivacy: () => void;
  scrollToSection: (id: string) => void;
  isDark: boolean;
}) {
  return (
    <footer
      className="py-12 border-t transition-colors"
      style={{
        borderColor: isDark ? "rgba(169, 139, 232, 0.12)" : "rgba(123,86,219,0.1)",
      }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-14 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => scrollToSection("hero")}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #9333EA, #A855F7, #06B6D4)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
          </div>
          <span
            className="font-sans text-[14px] font-bold"
            style={{ color: isDark ? "#F5F2EB" : "#1E182F" }}
          >
            Aura AI
          </span>
        </div>

        {/* Compliance Note */}
        <div
          className="font-sans text-[12px] text-center md:text-left select-none"
          style={{ color: isDark ? "#716B82" : "#A39EB2" }}
        >
          © 2026 Aura AI · Built with empathy · India DPDP Act 2023 Compliant
        </div>

        {/* Footer Nav Links */}
        <div className="flex items-center gap-5">
          <button
            onClick={onNavigateToPrivacy}
            className="font-sans text-[12px] font-medium bg-transparent border-none cursor-pointer transition-colors p-0"
            style={{ color: isDark ? "#8E88A3" : "#777287" }}
          >
            Privacy
          </button>
          <button
            onClick={onNavigateToPrivacy}
            className="font-sans text-[12px] font-medium bg-transparent border-none cursor-pointer transition-colors p-0"
            style={{ color: isDark ? "#8E88A3" : "#777287" }}
          >
            Terms
          </button>
          <button
            onClick={() => scrollToSection("safety")}
            className="font-sans text-[12px] font-medium bg-transparent border-none cursor-pointer transition-colors p-0"
            style={{ color: isDark ? "#8E88A3" : "#777287" }}
          >
            Safety
          </button>
          <button
            onClick={() => scrollToSection("experience")}
            className="font-sans text-[12px] font-medium bg-transparent border-none cursor-pointer transition-colors p-0"
            style={{ color: isDark ? "#8E88A3" : "#777287" }}
          >
            Experience
          </button>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────
// MAIN LANDING PAGE COMPONENT
// ─────────────────────────────────────────────
export function LandingPage({
  onGetStarted,
  onTryGuestDemo,
  onNavigateToPrivacy,
  isLoggedIn = false,
  onEnterDashboard,
}: LandingPageProps) {
  const { isDark, toggleTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Smooth scroll helper to navigate to specific sections inside the container
  const scrollToSection = (id: string) => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(`#${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <ScrollContainerContext.Provider value={scrollContainerRef}>
      <div
        ref={scrollContainerRef}
        className="h-screen w-full overflow-y-auto overflow-x-hidden relative transition-colors duration-300 select-text"
        style={{
          background: isDark ? "#080711" : "#FAF8F5",
          color: isDark ? "#F5F2EB" : "#1E182F",
        }}
      >
        <CursorGlow />

        <Header
          onGetStarted={onGetStarted}
          isLoggedIn={isLoggedIn}
          onEnterDashboard={onEnterDashboard}
          scrollToSection={scrollToSection}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />

        <ScrollRail isDark={isDark} />

        <main className="w-full">
          <HeroSection
            onGetStarted={onGetStarted}
            onTryGuestDemo={onTryGuestDemo}
            onNavigateToPrivacy={onNavigateToPrivacy}
            isLoggedIn={isLoggedIn}
            onEnterDashboard={onEnterDashboard}
            scrollToSection={scrollToSection}
            isDark={isDark}
          />

          <MetricsBanner isDark={isDark} />

          <WhatMakesDifferentSection
            onNavigateToPrivacy={onNavigateToPrivacy}
            isDark={isDark}
          />

          <HowItWorksSection isDark={isDark} />

          <BuiltForRealLifeSection
            onTryGuestDemo={onTryGuestDemo}
            isDark={isDark}
          />

          <AdaptationSection isDark={isDark} />

          <MemorySection isDark={isDark} />

          <PrivacySection
            onNavigateToPrivacy={onNavigateToPrivacy}
            isDark={isDark}
          />

          <FinalCTASection
            onGetStarted={onGetStarted}
            onTryGuestDemo={onTryGuestDemo}
            isLoggedIn={isLoggedIn}
            onEnterDashboard={onEnterDashboard}
            isDark={isDark}
          />
        </main>

        <Footer
          onNavigateToPrivacy={onNavigateToPrivacy}
          scrollToSection={scrollToSection}
          isDark={isDark}
        />
      </div>
    </ScrollContainerContext.Provider>
  );
}

export default LandingPage;
