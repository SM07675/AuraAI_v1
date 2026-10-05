import React, { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  phase: number;
}

export function AmbientBackground() {
  const { isDark } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Parallax Pointer Tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let animId: number;

    const handlePointerMove = (e: PointerEvent) => {
      // Very gentle, almost subconscious parallax (-15px to +15px)
      targetX = (e.clientX / window.innerWidth - 0.5) * 28;
      targetY = (e.clientY / window.innerHeight - 0.5) * 20;
    };

    const updateParallax = () => {
      currentX += (targetX - currentX) * 0.04;
      currentY += (targetY - currentY) * 0.04;

      if (container) {
        container.style.setProperty("--parallax-x", `${currentX.toFixed(2)}px`);
        container.style.setProperty("--parallax-y", `${currentY.toFixed(2)}px`);
      }
      animId = requestAnimationFrame(updateParallax);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    animId = requestAnimationFrame(updateParallax);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  // Subtle Ambient Canvas Dust Particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize, { passive: true });

    // Sparse, very gentle micro-particles (35-45 particles total)
    const count = Math.min(40, Math.floor((width * height) / 35000));
    const particles: DustParticle[] = [];

    for (let i = 0; i < count; i++) {
      const baseAlpha = 0.08 + Math.random() * 0.22;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.06 - Math.random() * 0.14, // slow upward drift
        size: 0.8 + Math.random() * 1.8,
        alpha: baseAlpha,
        baseAlpha,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(50, time - lastTime) / 1000;
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      const color = isDark ? "210, 220, 255" : "130, 110, 190";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx * 60 * dt;
        p.y += p.vy * 60 * dt;
        p.phase += dt * 0.8;

        // Gentle breathing opacity
        p.alpha = p.baseAlpha * (0.6 + 0.4 * Math.sin(p.phase));

        // Wrap around viewport edges
        if (p.y < -10) p.y = height + 10;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${p.alpha.toFixed(3)})`;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDark]);

  return (
    <div
      ref={containerRef}
      className={`aura-ambient-container fixed inset-0 pointer-events-none overflow-hidden select-none z-0 transition-colors duration-700 ${
        isDark ? "aura-ambient-dark" : "aura-ambient-light"
      }`}
      aria-hidden="true"
    >
      {/* Layer 1: Atmosphere Base Aurora Gradient */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(99, 102, 241, 0.18), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 40%, rgba(139, 92, 246, 0.12), transparent 60%)"
            : "radial-gradient(ellipse 85% 55% at 50% -5%, rgba(220, 205, 255, 0.35), transparent 70%), radial-gradient(ellipse 60% 40% at 20% 30%, rgba(215, 235, 255, 0.35), transparent 60%)",
        }}
      />

      {/* Layer 2: Parallax Layer with Blurred Light Clouds */}
      <div
        className="absolute inset-[-40px] pointer-events-none will-change-transform"
        style={{
          transform: "translate3d(var(--parallax-x, 0px), var(--parallax-y, 0px), 0)",
          transition: "transform 0.1s ease-out",
        }}
      >
        {/* Violet / Indigo Light Cloud (Top Left) */}
        <div
          className="ambient-glow-cloud"
          style={{
            top: "5%",
            left: "8%",
            width: "48vw",
            height: "48vw",
            maxWidth: "680px",
            maxHeight: "680px",
            background: isDark
              ? "radial-gradient(circle, rgba(124, 58, 237, 0.32) 0%, rgba(99, 102, 241, 0.15) 50%, transparent 75%)"
              : "radial-gradient(circle, rgba(199, 180, 255, 0.35) 0%, rgba(220, 205, 250, 0.18) 50%, transparent 75%)",
            animationDuration: "26s",
          }}
        />

        {/* Luminous Blue / Subtle Cyan Light Cloud (Right Center) */}
        <div
          className="ambient-glow-cloud"
          style={{
            top: "30%",
            right: "5%",
            width: "44vw",
            height: "44vw",
            maxWidth: "600px",
            maxHeight: "600px",
            background: isDark
              ? "radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(14, 165, 233, 0.08) 50%, transparent 75%)"
              : "radial-gradient(circle, rgba(186, 230, 253, 0.35) 0%, rgba(200, 235, 255, 0.15) 50%, transparent 75%)",
            animationDuration: "32s",
            animationDelay: "-10s",
          }}
        />

        {/* Subtle Warm Pink / Lavender Light Cloud (Bottom Left) */}
        <div
          className="ambient-glow-cloud"
          style={{
            bottom: "0%",
            left: "25%",
            width: "50vw",
            height: "50vw",
            maxWidth: "700px",
            maxHeight: "700px",
            background: isDark
              ? "radial-gradient(circle, rgba(244, 114, 182, 0.14) 0%, rgba(139, 92, 246, 0.08) 50%, transparent 75%)"
              : "radial-gradient(circle, rgba(254, 215, 226, 0.35) 0%, rgba(255, 237, 240, 0.18) 50%, transparent 75%)",
            animationDuration: "28s",
            animationDelay: "-16s",
          }}
        />
      </div>

      {/* Layer 3: Canvas for Subconscious Ambient Stardust Particles */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Layer 4: Vignette / Atmospheric Depth Veil */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(ellipse at center, transparent 40%, rgba(7, 9, 20, 0.55) 100%)"
            : "radial-gradient(ellipse at center, transparent 50%, rgba(235, 238, 250, 0.45) 100%)",
        }}
      />
    </div>
  );
}
