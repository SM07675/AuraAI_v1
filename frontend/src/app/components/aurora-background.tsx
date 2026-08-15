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
    <div className="aura-bg fixed inset-0 overflow-hidden -z-10" style={{ background: "#EBF3FF", contain: "strict" }}>
      {/* ── Base Gradient ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #F4F8FF 0%, #EBF2FF 35%, #DCE8FF 70%, #E8EEFF 100%)",
        }}
      />

      {/* ── Aurora Glow 1 (large vibrant cyan-sky orb) ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 2200,
          height: 2200,
          left: "50%",
          top: "42%",
          marginLeft: -1100,
          marginTop: -1100,
          opacity: 0.82,
          filter: "blur(220px)",
          background:
            "radial-gradient(circle, #38BDF8 0%, #7DD3FC 35%, #BAE6FD 60%, rgba(224,242,254,0) 78%)",
        }}
        animate={{ scale: [1, 1.05, 1], rotate: [0, 6, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Aurora Glow 2 / Top Right Deep Sky Light ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 1500,
          height: 1500,
          right: "-6%",
          top: "-16%",
          opacity: 0.55,
          filter: "blur(280px)",
          background:
            "radial-gradient(circle, #0284C7 0%, #38BDF8 35%, #7DD3FC 60%, rgba(224,242,254,0) 75%)",
        }}
        animate={{ scale: [1, 1.06, 1], x: [0, 35, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Left Sky Ambient Light ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 1300,
          height: 1300,
          left: "-12%",
          top: "20%",
          opacity: 0.45,
          filter: "blur(260px)",
          background:
            "radial-gradient(circle, #7DD3FC 0%, #BAE6FD 40%, #E0F2FE 65%, rgba(255,255,255,0) 80%)",
        }}
        animate={{ scale: [1, 1.07, 1], x: [-25, 25, -25] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Bottom Crystal Glow ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 1900,
          height: 1500,
          left: "50%",
          bottom: "-28%",
          marginLeft: -950,
          opacity: 0.35,
          filter: "blur(320px)",
          background:
            "radial-gradient(circle, #FFFFFF 0%, #BAE6FD 45%, rgba(186,230,253,0) 75%)",
        }}
        animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.4, 0.3] }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Glass Light behind center area ── */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 750,
          height: 750,
          left: "50%",
          top: "44%",
          marginLeft: -375,
          marginTop: -375,
          opacity: 0.75,
          filter: "blur(160px)",
          background:
            "radial-gradient(circle, #FFFFFF 0%, #7DD3FC 35%, #BAE6FD 60%, rgba(224,242,254,0) 80%)",
        }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.65, 0.8, 0.65] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Glass Reflections (organic curved shapes) ── */}
      {[
        { w: 950, h: 520, left: "6%", top: "8%", rot: -18, dur: 24 },
        { w: 750, h: 440, left: "58%", top: "48%", rot: 24, dur: 28 },
        { w: 660, h: 380, left: "32%", top: "64%", rot: -8, dur: 26 },
      ].map((r, i) => (
        <motion.div
          key={`refl-${i}`}
          className="absolute"
          style={{
            width: r.w,
            height: r.h,
            left: r.left,
            top: r.top,
            opacity: 0.12,
            filter: "blur(110px)",
            borderRadius: "60% 40% 55% 45% / 50% 60% 40% 50%",
            background:
              "linear-gradient(120deg, #FFFFFF, #BAE6FD 50%, #7DD3FC)",
            transform: `rotate(${r.rot}deg)`,
          }}
          animate={{ x: [-25, 25, -25] }}
          transition={{ duration: r.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* ── Liquid Waves (smooth, wide light-blue ripples) ── */}
      {[
        { w: 1650, h: 720, left: "-8%", top: "28%", dur: 18 },
        { w: 1450, h: 620, left: "18%", top: "-8%", dur: 20 },
        { w: 1550, h: 670, left: "32%", top: "46%", dur: 22 },
      ].map((wv, i) => (
        <motion.div
          key={`wave-${i}`}
          className="absolute"
          style={{
            width: wv.w,
            height: wv.h,
            left: wv.left,
            top: wv.top,
            opacity: 0.14,
            filter: "blur(130px)",
            borderRadius: "50% 50% 48% 52% / 55% 45% 55% 45%",
            background:
              "linear-gradient(100deg, #FFFFFF 0%, #E0F2FE 40%, #7DD3FC 100%)",
          }}
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: wv.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* ── Floating Light Streaks ── */}
      {[
        { w: 1350, h: 230, left: "8%", top: "22%", rot: -22 },
        { w: 1150, h: 190, left: "38%", top: "68%", rot: 16 },
      ].map((s, i) => (
        <motion.div
          key={`streak-${i}`}
          className="absolute"
          style={{
            width: s.w,
            height: s.h,
            left: s.left,
            top: s.top,
            opacity: 0.08,
            filter: "blur(130px)",
            borderRadius: "50%",
            background: "linear-gradient(90deg, transparent, #FFFFFF 50%, transparent)",
            transform: `rotate(${s.rot}deg)`,
          }}
          animate={{ x: [-25, 25, -25] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
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
              "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95), rgba(224,242,254,0.3) 50%, rgba(125,211,252,0.1) 100%)",
            border: "1.2px solid rgba(255,255,255,0.75)",
            boxShadow: "0 12px 36px rgba(2,132,199,0.18), inset 0 2px 6px rgba(255,255,255,0.95)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
          }}
          animate={{ y: [0, -65, 0], opacity: [0.25, 0.6, 0.25] }}
          transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
        >
          {/* inner highlight */}
          <div
            className="absolute rounded-full"
            style={{
              width: "30%",
              height: "30%",
              left: "20%",
              top: "16%",
              background: "rgba(255,255,255,0.95)",
              filter: "blur(1px)",
            }}
          />
        </motion.div>
      ))}

      {/* ── Subtle Light Grain (~0.8%) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.03,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ── Soft Edge Vignette ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 65%, rgba(255,255,255,0.08) 100%)",
        }}
      />
    </div>
  );
}
