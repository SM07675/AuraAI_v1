import { motion } from "motion/react";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import auraMascotPng from "../../assets/aura-mascot-3d.png";

export type Expression = 
  | "happy" 
  | "listening" 
  | "thinking" 
  | "calm" 
  | "love" 
  | "talking" 
  | "confused" 
  | "excited" 
  | "sleep" 
  | "sad" 
  | "celebrate";

export function AuraRobot({ expression = "happy" }: { expression?: Expression }) {
  const [blink, setBlink] = useState(false);

  // Natural blinking
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      // Don't blink if sleeping
      if (expression === "sleep") {
        timeout = setTimeout(loop, 1000);
        return;
      }
      const next = 2200 + Math.random() * 2600;
      timeout = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, next);
    };
    loop();
    return () => clearTimeout(timeout);
  }, [expression]);

  // Trigger confetti on celebrate
  useEffect(() => {
    if (expression === "celebrate") {
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
      }, 250);
      
      return () => clearInterval(interval);
    }
  }, [expression]);

  let eyeHeight = blink ? 4 : 34;
  if (expression === "sleep") eyeHeight = 4;
  if (expression === "sad") eyeHeight = blink ? 4 : 24;
  if (expression === "excited" || expression === "celebrate") eyeHeight = blink ? 4 : 42;

  let cheekGlow = "#5EEAD4";
  if (expression === "love") cheekGlow = "#ff8fc7";
  else if (expression === "calm") cheekGlow = "#8B5CF6";
  else if (expression === "excited" || expression === "celebrate") cheekGlow = "#00D4FF"; // Brighter cyan
  else if (expression === "sad") cheekGlow = "#2458FF"; // Cooler blue

  // Body animation variants
  let bodyY = [0, -14, 0];
  let bodyDuration = 4.5;
  let bodyRotate = 0;
  
  if (expression === "sleep") {
    bodyY = [0, -8, 0];
    bodyDuration = 6;
  } else if (expression === "excited" || expression === "celebrate") {
    bodyY = [0, -20, 0];
    bodyDuration = 1.5;
  } else if (expression === "sad") {
    bodyY = [0, -6, 0];
    bodyDuration = 5.5;
  }
  
  if (expression === "confused") {
    bodyRotate = 6;
  }

  // Mouth animation
  let mouthWidth = expression === "listening" ? 10 : 26;
  let mouthHeight = expression === "listening" ? 10 : 12;
  let mouthBorderRadius = expression === "listening" ? "50%" : "0 0 20px 20px";
  let mouthBorderBottom = "3px solid #00D4FF";
  let mouthBorderTop = "none";
  let mouthScaleY = 1;
  let mouthTranslateX = 0;

  if (expression === "talking") {
    mouthScaleY = 0.4;
  } else if (expression === "sad") {
    mouthBorderRadius = "20px 20px 0 0";
    mouthBorderTop = "3px solid #00D4FF";
    mouthBorderBottom = "none";
    mouthWidth = 20;
    mouthHeight = 8;
  } else if (expression === "sleep") {
    mouthWidth = 12;
    mouthHeight = 3;
    mouthBorderRadius = "10px";
    mouthBorderBottom = "3px solid #00D4FF";
  } else if (expression === "excited" || expression === "celebrate") {
    mouthWidth = 32;
    mouthHeight = 22;
    mouthBorderRadius = "0 0 30px 30px";
  } else if (expression === "confused") {
    mouthWidth = 14;
    mouthHeight = 6;
    mouthTranslateX = 6;
    mouthBorderRadius = "10px";
  }

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: 320, height: 360, willChange: "transform" }}>
      {/* Ambient bloom behind robot */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 300,
          height: 300,
          background:
            "radial-gradient(circle, rgba(94,234,212,0.45), rgba(78,168,255,0.4) 45%, transparent 70%)",
          filter: "blur(30px)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Orbiting thinking particles */}
      {expression === "thinking" &&
        [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 10,
              height: 10,
              background: "linear-gradient(135deg,#00D4FF,#8B5CF6)",
              top: 40,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: i * 0.4 }}
          />
        ))}

      {/* Floating Z's for sleep */}
      {expression === "sleep" &&
        [0, 1, 2].map((i) => (
          <motion.div
            key={`z-${i}`}
            className="absolute text-[#00D4FF] font-bold text-lg"
            style={{ top: 20, right: 80, opacity: 0 }}
            animate={{ 
              y: [-10, -60], 
              x: [0, i % 2 === 0 ? 15 : -15, 0],
              opacity: [0, 0.8, 0],
              scale: [0.5, 1.2, 1.5]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeOut", delay: i * 1.5 }}
          >
            z
          </motion.div>
        ))}

      {/* Floating body */}
      <motion.div
        className="relative"
        animate={{ y: bodyY, rotate: bodyRotate }}
        transition={{ duration: bodyDuration, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="240" height="270" viewBox="0 0 240 270" fill="none">
          <defs>
            <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#f4f7ff" />
              <stop offset="100%" stopColor="#dbe6ff" />
            </linearGradient>
            <radialGradient id="faceGlow" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#101826" />
              <stop offset="100%" stopColor="#03060d" />
            </radialGradient>
            <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#2458FF" floodOpacity="0.28" />
            </filter>
          </defs>

          {/* Tiny arms */}
          <motion.ellipse
            cx="34" cy="150" rx="16" ry="26" fill="url(#bodyGrad)"
            animate={{ rotate: (expression === "happy" || expression === "love" || expression === "celebrate") ? [-8, 12, -8] : [0, 4, 0] }}
            transition={{ duration: (expression === "excited" || expression === "celebrate") ? 0.8 : 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "34px 130px" }}
          />
          <motion.ellipse
            cx="206" cy="150" rx="16" ry="26" fill="url(#bodyGrad)"
            animate={{ rotate: (expression === "happy" || expression === "love" || expression === "celebrate") ? [8, -12, 8] : [0, -4, 0] }}
            transition={{ duration: (expression === "excited" || expression === "celebrate") ? 0.8 : 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "206px 130px" }}
          />

          {/* Head / body — one rounded glossy capsule */}
          <rect x="46" y="34" width="148" height="180" rx="74" fill="url(#bodyGrad)" filter="url(#soft)" />
          {/* Specular highlight */}
          <ellipse cx="90" cy="70" rx="34" ry="18" fill="#ffffff" opacity="0.7" />

          {/* Perfect circular OLED face */}
          <circle cx="120" cy="112" r="60" fill="url(#faceGlow)" />
          <circle cx="120" cy="112" r="60" fill="none" stroke="#2b3550" strokeWidth="2" />

          {/* Listening ring */}
          {expression === "listening" && (
            <motion.circle
              cx="120" cy="112" r="66" fill="none" stroke="#00D4FF" strokeWidth="3"
              initial={{ opacity: 0.9, r: 62 }}
              animate={{ opacity: [0.9, 0], r: [62, 82] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </svg>

        {/* Face features rendered as HTML for easy animation */}
        <div className="absolute inset-0 flex flex-col items-center" style={{ top: 52 }}>
          {expression === "love" ? (
            <div className="flex gap-4" style={{ marginTop: 34 }}>
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.18, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{ color: "#ff8fc7", fontSize: 26 }}
                >
                  ♥
                </motion.div>
              ))}
            </div>
          ) : expression === "celebrate" ? (
            <div className="flex gap-6" style={{ marginTop: 34 }}>
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 180, scale: blink ? 0.2 : [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  style={{ color: "#00D4FF", fontSize: 24, lineHeight: "34px", textShadow: "0 0 10px #00D4FF" }}
                >
                  ✦
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-5" style={{ marginTop: 34 }}>
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  style={{
                    width: 20,
                    borderRadius: 10,
                    background: "linear-gradient(180deg,#8fefff,#00D4FF)",
                    boxShadow: "0 0 14px rgba(0,212,255,0.9)",
                    // Confused: one eye is taller
                    height: expression === "confused" && i === 0 ? eyeHeight * 1.3 : eyeHeight,
                    // Sad: lowered slightly
                    transform: expression === "sad" ? "translateY(4px)" : "none"
                  }}
                  animate={{ height: expression === "confused" && i === 0 ? eyeHeight * 1.3 : eyeHeight }}
                  transition={{ duration: 0.1 }}
                />
              ))}
            </div>
          )}

          {/* Mouth / smile */}
          <motion.div
            style={{
              marginTop: 10,
              width: mouthWidth,
              height: mouthHeight,
              borderBottom: mouthBorderBottom,
              borderTop: mouthBorderTop,
              borderRadius: mouthBorderRadius,
              boxShadow: expression !== "sad" ? "0 2px 8px rgba(0,212,255,0.6)" : "0 -2px 8px rgba(0,212,255,0.6)",
              transform: `translateX(${mouthTranslateX}px)`
            }}
            animate={
              expression === "talking"
                ? { scaleY: [1, mouthScaleY, 1] }
                : { scaleY: 1 }
            }
            transition={{ duration: 0.4, repeat: Infinity }}
          />

          {/* Glowing cheeks */}
          <div className="flex justify-between w-full absolute" style={{ top: 44, paddingInline: 66 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 8,
                  borderRadius: 8,
                  background: cheekGlow,
                  filter: "blur(2px)",
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>


      {/* Reflective platform */}
      <motion.div
        className="absolute rounded-full"
        style={{
          bottom: 20,
          width: 180,
          height: 26,
          background: "radial-gradient(ellipse, rgba(78,168,255,0.35), transparent 70%)",
          filter: "blur(6px)",
        }}
        animate={{ scaleX: [1, 0.86, 1], opacity: [0.6, 0.4, 0.6] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* ─────────────────────────── REFERENCE IMAGE 3D CLAY MASCOT ─────────────────────────── */

export function AuraMascot3D({ 
  size = 210, 
  className = "",
  interactive = true 
}: { 
  size?: number; 
  className?: string; 
  interactive?: boolean;
}) {
  const s = size / 210;

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size * 1.15, height: size * 1.05 }}
    >
      {/* ── Decorative Clay Object 1: Top-Left Lavender Sphere ── */}
      <motion.div
        animate={{ y: [0, -4 * s, 0] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute pointer-events-none"
        style={{
          top: 10 * s,
          left: -15 * s,
          width: 24 * s,
          height: 24 * s,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #E6DCFA 0%, #C7B5F3 50%, #A98BE8 100%)",
          boxShadow: `${3 * s}px ${4 * s}px ${10 * s}px rgba(169, 139, 232, 0.4), inset 1.5px 1.5px 3px rgba(255,255,255,0.9)`,
          border: "1px solid rgba(255,255,255,0.85)",
          zIndex: 1,
        }}
      />

      {/* ── Decorative Clay Object 2: Upper Puffy Pink Blob ── */}
      <motion.div
        animate={{ y: [0, -3.5 * s, 0], scale: [1, 1.02, 1] }}
        transition={{ duration: 6.4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        className="absolute pointer-events-none"
        style={{
          top: 4 * s,
          left: 45 * s,
          width: 28 * s,
          height: 18 * s,
          borderRadius: `${14 * s}px ${16 * s}px ${14 * s}px ${18 * s}px`,
          background: "linear-gradient(135deg, #FDE2E2 0%, #F1A6A6 60%, #E88383 100%)",
          boxShadow: `${2 * s}px ${4 * s}px ${8 * s}px rgba(241, 166, 166, 0.38), inset 1px 1.5px 2px rgba(255,255,255,0.9)`,
          border: "1px solid rgba(255,255,255,0.85)",
          zIndex: 1,
        }}
      />

      {/* ── Decorative Clay Object 3: Top-Right Mint Sphere ── */}
      <motion.div
        animate={{ y: [0, -4 * s, 0] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        className="absolute pointer-events-none"
        style={{
          top: 8 * s,
          right: 5 * s,
          width: 18 * s,
          height: 18 * s,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #E2FAF2 0%, #BFE6D8 50%, #76D1B7 100%)",
          boxShadow: `${2 * s}px ${3 * s}px ${8 * s}px rgba(120, 210, 185, 0.35), inset 1px 1px 2px rgba(255,255,255,0.9)`,
          border: "1px solid rgba(255,255,255,0.85)",
          zIndex: 1,
        }}
      />

      {/* ── Decorative Clay Object 4: Mid-Right Soft Blue Sphere ── */}
      <motion.div
        animate={{ y: [0, -3 * s, 0] }}
        transition={{ duration: 6.0, repeat: Infinity, ease: "easeInOut", delay: 2.2 }}
        className="absolute pointer-events-none"
        style={{
          top: 75 * s,
          right: -10 * s,
          width: 16 * s,
          height: 16 * s,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #E8F4FD 0%, #BBDCF5 50%, #72B2E6 100%)",
          boxShadow: `${2 * s}px ${3 * s}px ${8 * s}px rgba(115, 180, 230, 0.35), inset 1px 1px 2px rgba(255,255,255,0.9)`,
          border: "1px solid rgba(255,255,255,0.85)",
          zIndex: 1,
        }}
      />

      {/* ── Decorative Clay Object 5: Small Bottom-Left Purple Pebbles ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: 12 * s,
          left: -4 * s,
          width: 15 * s,
          height: 11 * s,
          borderRadius: `${8 * s}px ${10 * s}px ${7 * s}px ${9 * s}px`,
          background: "linear-gradient(135deg, #EDE5FB 0%, #C7B5F3 60%, #9A7DE5 100%)",
          boxShadow: `${2 * s}px ${3 * s}px ${6 * s}px rgba(154, 125, 229, 0.35), inset 1px 1px 2px rgba(255,255,255,0.85)`,
          border: "1px solid rgba(255,255,255,0.8)",
          zIndex: 3,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: 6 * s,
          left: 14 * s,
          width: 10 * s,
          height: 8 * s,
          borderRadius: `${6 * s}px`,
          background: "linear-gradient(135deg, #EDE5FB 0%, #C7B5F3 60%, #9A7DE5 100%)",
          boxShadow: `${1.5 * s}px ${2 * s}px ${4 * s}px rgba(154, 125, 229, 0.3), inset 0.8px 0.8px 1.5px rgba(255,255,255,0.85)`,
          border: "1px solid rgba(255,255,255,0.8)",
          zIndex: 3,
        }}
      />

      {/* ── Soft Lavender Clay Platform Puddle (Anchors Mascot) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: 2 * s,
          width: size * 0.96,
          height: 38 * s,
          borderRadius: "50%",
          background: "linear-gradient(140deg, #E6DCFA 0%, #D4C5F6 50%, #C4B0F2 100%)",
          boxShadow:
            `0 ${10 * s}px ${24 * s}px rgba(180, 155, 225, 0.42), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.95), inset -2px -2px 6px rgba(160, 135, 215, 0.28)`,
          border: "1.5px solid rgba(255,255,255,0.9)",
          zIndex: 0,
        }}
      />

      {/* ── Soft Physical Ground Shadow on the Platform (Breathing Sync) ── */}
      <motion.div
        animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.45, 0.65, 0.45] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute pointer-events-none"
        style={{
          bottom: 12,
          width: size * 0.6,
          height: 18,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(145, 115, 205, 0.55) 0%, rgba(160, 135, 220, 0.25) 50%, transparent 80%)",
          filter: "blur(4px)",
          zIndex: 1,
        }}
      />

      {/* ── 3D Clay Robot Render (Calm Float + Tiny Scale Breathing) ── */}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        animate={{
          y: [0, -5, 0],
          scale: [1, 1.012, 1],
          rotate: [0, 0.5, -0.5, 0],
        }}
        whileHover={interactive ? { scale: 1.035, y: -7, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } } : undefined}
        whileTap={interactive ? { scale: 0.97, y: 1 } : undefined}
        transition={{
          y: { duration: 4.8, repeat: Infinity, ease: "easeInOut" },
          scale: { duration: 4.8, repeat: Infinity, ease: "easeInOut" },
          rotate: { duration: 6.4, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <img
          src={auraMascotPng}
          alt="Aura 3D Clay Mascot"
          className="object-contain"
          style={{
            width: size,
            height: "auto",
            maxHeight: size * 1.05,
            filter: "drop-shadow(0 14px 22px rgba(150, 120, 215, 0.32))",
          }}
          draggable={false}
        />
      </motion.div>
    </div>
  );
}

/* ─────────────────────────── REFERENCE IMAGE PURPLE BLOB MASCOT ─────────────────────────── */

export function AuraBlobMascot({ size = 56 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0 select-none" style={{ width: size, height: size }}>
      {/* Soft Purple Clay Blob Character (Reference Image Interaction Bar) */}
      <motion.div
        animate={{ y: [0, -3, 0], scale: [1, 1.03, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="w-full h-full rounded-[26px] bg-gradient-to-br from-[#D4C5F7] to-[#B8A2F4] shadow-[4px_6px_14px_rgba(160,135,225,0.45),-3px_-3px_8px_rgba(255,255,255,0.9),inset_1.5px_1.5px_3px_rgba(255,255,255,0.85)] border border-white/85 flex flex-col items-center justify-center relative overflow-hidden"
      >
        {/* Specular Highlight */}
        <div
          className="absolute top-1.5 left-2 w-4 h-2 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.85)", filter: "blur(0.5px)", transform: "rotate(-20deg)" }}
        />
        {/* Eyes & Cute Smile */}
        <div className="flex items-center gap-2 mb-0.5 relative z-10">
          <div className="w-2.5 h-2.5 rounded-full bg-[#201838]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#201838]" />
        </div>
        <div className="w-3.5 h-1.5 border-b-2 border-[#201838] rounded-full relative z-10" />
      </motion.div>
    </div>
  );
}

