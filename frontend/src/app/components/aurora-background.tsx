import { motion } from "motion/react";
import { useMemo } from "react";

/* Floating glass bubbles — glassy, thin white edge, inner highlight */
const BUBBLES = [
  { size: 60, left: "18%", top: "62%", dur: 26, delay: 0 },
  { size: 40, left: "72%", top: "30%", dur: 22, delay: 3 },
  { size: 20, left: "40%", top: "78%", dur: 18, delay: 1 },
  { size: 12, left: "60%", top: "68%", dur: 16, delay: 4 },
  { size: 40, left: "30%", top: "24%", dur: 24, delay: 2 },
  { size: 20, left: "84%", top: "58%", dur: 20, delay: 5 },
  { size: 12, left: "50%", top: "40%", dur: 15, delay: 2.5 },
  { size: 60, left: "78%", top: "80%", dur: 28, delay: 1.5 },
  { size: 20, left: "12%", top: "38%", dur: 21, delay: 3.5 },
];

export function AuroraBackground() {
  const bubbles = useMemo(() => BUBBLES, []);

  return (
    <div className="aura-bg fixed inset-0 overflow-hidden -z-10" style={{ background: "#E0F2FE", contain: "strict" }}>
      {/* ── Base Gradient ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 40%, #BAE6FD 75%, #7DD3FC 100%)",
        }}
      />

      {/* ── Aurora Glow 1 (large, slightly above center) ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 2200,
          height: 2200,
          left: "50%",
          top: "42%",
          marginLeft: -1100,
          marginTop: -1100,
          opacity: 0.75,
          filter: "blur(250px)",
          background:
            "radial-gradient(circle, #38BDF8 0%, #7DD3FC 35%, #BAE6FD 60%, rgba(224,242,254,0) 75%)",
        }}
        animate={{ scale: [1, 1.04, 1], rotate: [0, 4, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Aurora Glow 2 / Right Glow (top right) ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 1400,
          height: 1400,
          right: "-8%",
          top: "-18%",
          opacity: 0.45,
          filter: "blur(350px)",
          background:
            "radial-gradient(circle, #FFFFFF 0%, #D7E8FF 45%, rgba(215,232,255,0) 72%)",
        }}
        animate={{ scale: [1, 1.05, 1], x: [0, 30, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Left Ambient Light ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 1200,
          height: 1200,
          left: "-14%",
          top: "22%",
          opacity: 0.35,
          filter: "blur(300px)",
          background:
            "radial-gradient(circle, #CBBEFF 0%, #FFFFFF 42%, rgba(255,255,255,0) 70%)",
        }}
        animate={{ scale: [1, 1.06, 1], x: [-30, 30, -30] }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Bottom Glow ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 1800,
          height: 1400,
          left: "50%",
          bottom: "-30%",
          marginLeft: -900,
          opacity: 0.2,
          filter: "blur(400px)",
          background:
            "radial-gradient(circle, #FFFFFF 0%, #D8F8FF 45%, rgba(216,248,255,0) 72%)",
        }}
        animate={{ scale: [1, 1.05, 1], opacity: [0.18, 0.24, 0.18] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Glass Light behind robot (center) ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: "44%",
          marginLeft: -350,
          marginTop: -350,
          opacity: 0.7,
          filter: "blur(180px)",
          background:
            "radial-gradient(circle, #FFFFFF 0%, #CBBEFF 35%, #D7E8FF 60%, rgba(215,232,255,0) 78%)",
        }}
        animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0.75, 0.6] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Glass Reflections (organic curved shapes) ── */}
      {[
        { w: 900, h: 500, left: "8%", top: "10%", rot: -18, dur: 25 },
        { w: 700, h: 420, left: "60%", top: "50%", rot: 24, dur: 30 },
        { w: 620, h: 360, left: "34%", top: "66%", rot: -8, dur: 27 },
      ].map((r, i) => (
        <motion.div
          key={`refl-${i}`}
          className="absolute"
          style={{
            width: r.w,
            height: r.h,
            left: r.left,
            top: r.top,
            opacity: 0.08,
            filter: "blur(120px)",
            borderRadius: "60% 40% 55% 45% / 50% 60% 40% 50%",
            background:
              "linear-gradient(120deg, #FFFFFF, #D7E8FF 50%, rgba(203,190,255,0.6))",
            transform: `rotate(${r.rot}deg)`,
          }}
          animate={{ x: [-30, 30, -30] }}
          transition={{ duration: r.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* ── Liquid Waves (smooth, wide, transparent) ── */}
      {[
        { w: 1600, h: 700, left: "-10%", top: "30%", dur: 18 },
        { w: 1400, h: 600, left: "20%", top: "-6%", dur: 20 },
        { w: 1500, h: 650, left: "34%", top: "48%", dur: 22 },
      ].map((wv, i) => (
        <motion.div
          key={`wave-${i}`}
          className="absolute"
          style={{
            width: wv.w,
            height: wv.h,
            left: wv.left,
            top: wv.top,
            opacity: 0.1,
            filter: "blur(150px)",
            borderRadius: "50% 50% 48% 52% / 55% 45% 55% 45%",
            background:
              "linear-gradient(100deg, #FFFFFF, #CBBEFF 45%, #D7E8FF)",
          }}
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: wv.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* ── Floating Light Streaks (curved, very soft) ── */}
      {[
        { w: 1300, h: 220, left: "10%", top: "24%", rot: -22 },
        { w: 1100, h: 180, left: "40%", top: "70%", rot: 16 },
      ].map((s, i) => (
        <motion.div
          key={`streak-${i}`}
          className="absolute"
          style={{
            width: s.w,
            height: s.h,
            left: s.left,
            top: s.top,
            opacity: 0.05,
            filter: "blur(150px)",
            borderRadius: "50%",
            background: "linear-gradient(90deg, transparent, #FFFFFF, transparent)",
            transform: `rotate(${s.rot}deg)`,
          }}
          animate={{ x: [-30, 30, -30] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* ── Floating Glass Bubbles ── */}
      {bubbles.map((b, i) => (
        <motion.div
          key={`bubble-${i}`}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            left: b.left,
            top: b.top,
            background:
              "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 12px 40px rgba(120,120,255,0.12), inset 0 1px 4px rgba(255,255,255,0.8)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
          animate={{ y: [0, -60, 0], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
        >
          {/* inner highlight */}
          <div
            className="absolute rounded-full"
            style={{
              width: "28%",
              height: "28%",
              left: "22%",
              top: "18%",
              background: "rgba(255,255,255,0.9)",
              filter: "blur(1px)",
            }}
          />
        </motion.div>
      ))}

      {/* ── Light Noise / film grain (~1%) ── */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.04,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ── Edge Vignette (very soft, white) ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(255,255,255,0.04) 100%)",
        }}
      />
    </div>
  );
}
