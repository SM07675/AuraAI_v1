import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { audioEngine } from "../services/audioEngine";

export type AuraOrbState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "user-speaking"
  | "processing"
  | "speaking"
  | "interrupted"
  | "offline";

interface AuraOrbProps {
  state?: AuraOrbState;
  size?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  angle: number;
  dist: number;
  speed: number;
  size: number;
  alpha: number;
  color: string;
}

export function AuraOrb({ state = "idle", size = 280, className = "" }: AuraOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [audioLevel, setAudioLevel] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Subscribe to live audio telemetry (mic RMS and TTS output reference RMS)
  useEffect(() => {
    return audioEngine.subscribeTelemetry((t) => {
      const live =
        stateRef.current === "speaking"
          ? t.refRms || 0
          : stateRef.current === "user-speaking" || stateRef.current === "listening"
          ? t.micRms || 0
          : 0;

      // Smooth envelope filter for organic audio responsiveness
      const boosted = Math.min(1.0, live * 9.0);
      setAudioLevel((prev) => prev * 0.7 + boosted * 0.3);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const baseRadius = size * 0.32;

    // Initialize procedural energy particles
    const particles: Particle[] = [];
    const particleCount = 28;
    const colors = ["#8B5CF6", "#6366F1", "#38BDF8", "#22D3EE", "#F472B6"];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: center,
        y: center,
        radius: Math.random() * 2 + 1.2,
        angle: Math.random() * Math.PI * 2,
        dist: baseRadius * (0.85 + Math.random() * 0.65),
        speed: (Math.random() * 0.02 + 0.008) * (Math.random() > 0.5 ? 1 : -1),
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.6 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animId: number;
    let time = 0;

    const draw = () => {
      time += 0.025;
      ctx.clearRect(0, 0, size, size);

      const currentState = stateRef.current;
      const rms = currentState === "interrupted" ? 0 : audioLevel;

      // ── Outer Aura Halos ──────────────────────────────────────────────────
      const haloExpansion =
        currentState === "listening"
          ? 1.18 + Math.sin(time * 1.5) * 0.05
          : currentState === "user-speaking"
          ? 1.15 + rms * 0.35
          : currentState === "speaking"
          ? 1.25 + rms * 0.45
          : currentState === "connecting"
          ? 1.05 + Math.sin(time * 3) * 0.08
          : 1.08 + Math.sin(time * 0.8) * 0.04;

      const haloGrad = ctx.createRadialGradient(
        center,
        center,
        baseRadius * 0.5,
        center,
        center,
        baseRadius * 1.65 * haloExpansion
      );

      if (currentState === "offline") {
        haloGrad.addColorStop(0, "rgba(100, 110, 140, 0.25)");
        haloGrad.addColorStop(0.6, "rgba(70, 80, 110, 0.1)");
        haloGrad.addColorStop(1, "rgba(50, 60, 90, 0)");
      } else if (currentState === "listening") {
        haloGrad.addColorStop(0, "rgba(56, 189, 248, 0.35)");
        haloGrad.addColorStop(0.5, "rgba(34, 211, 238, 0.18)");
        haloGrad.addColorStop(1, "rgba(14, 165, 233, 0)");
      } else if (currentState === "user-speaking") {
        haloGrad.addColorStop(0, "rgba(34, 211, 238, 0.45)");
        haloGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.25)");
        haloGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
      } else if (currentState === "speaking") {
        haloGrad.addColorStop(0, "rgba(139, 92, 246, 0.5)");
        haloGrad.addColorStop(0.5, "rgba(56, 189, 248, 0.3)");
        haloGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
      } else {
        // Idle / Ready / Connecting
        haloGrad.addColorStop(0, "rgba(139, 92, 246, 0.35)");
        haloGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.18)");
        haloGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
      }

      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(center, center, baseRadius * 1.65 * haloExpansion, 0, Math.PI * 2);
      ctx.fill();

      // ── Reactive Fluid Energy Contour ────────────────────────────────────
      const wavePoints = 48;
      const distortion =
        currentState === "user-speaking"
          ? 8 + rms * 34
          : currentState === "speaking"
          ? 12 + rms * 42
          : currentState === "processing"
          ? 6 + Math.sin(time * 4) * 4
          : 3 + Math.sin(time * 1.2) * 2;

      ctx.beginPath();
      for (let i = 0; i <= wavePoints; i++) {
        const theta = (i / wavePoints) * Math.PI * 2;
        const offset =
          Math.sin(theta * 3 + time * 2) * distortion * 0.4 +
          Math.cos(theta * 5 - time * 1.5) * distortion * 0.3 +
          Math.sin(theta * 2 + time * 3.5) * distortion * 0.3;

        const r = baseRadius + offset;
        const x = center + Math.cos(theta) * r;
        const y = center + Math.sin(theta) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const fluidGrad = ctx.createLinearGradient(
        center - baseRadius,
        center - baseRadius,
        center + baseRadius,
        center + baseRadius
      );

      if (currentState === "offline") {
        fluidGrad.addColorStop(0, "#475569");
        fluidGrad.addColorStop(1, "#334155");
      } else if (currentState === "listening") {
        fluidGrad.addColorStop(0, "#0284C7");
        fluidGrad.addColorStop(0.5, "#06B6D4");
        fluidGrad.addColorStop(1, "#6366F1");
      } else if (currentState === "user-speaking") {
        fluidGrad.addColorStop(0, "#06B6D4");
        fluidGrad.addColorStop(0.5, "#38BDF8");
        fluidGrad.addColorStop(1, "#8B5CF6");
      } else if (currentState === "speaking") {
        fluidGrad.addColorStop(0, "#8B5CF6");
        fluidGrad.addColorStop(0.5, "#6366F1");
        fluidGrad.addColorStop(1, "#EC4899");
      } else {
        fluidGrad.addColorStop(0, "#7C3AED");
        fluidGrad.addColorStop(0.5, "#6366F1");
        fluidGrad.addColorStop(1, "#38BDF8");
      }

      ctx.fillStyle = fluidGrad;
      ctx.shadowColor = currentState === "offline" ? "transparent" : "#8B5CF6";
      ctx.shadowBlur = currentState === "offline" ? 0 : 25;
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // ── Inner Glass Core Specular Sheen ──────────────────────────────────
      const innerCoreGrad = ctx.createRadialGradient(
        center - baseRadius * 0.3,
        center - baseRadius * 0.3,
        baseRadius * 0.05,
        center,
        center,
        baseRadius * 0.95
      );
      innerCoreGrad.addColorStop(0, "rgba(255, 255, 255, 0.75)");
      innerCoreGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.15)");
      innerCoreGrad.addColorStop(0.85, "rgba(0, 0, 0, 0.1)");
      innerCoreGrad.addColorStop(1, "rgba(0, 0, 0, 0.35)");

      ctx.beginPath();
      ctx.arc(center, center, baseRadius * 0.92, 0, Math.PI * 2);
      ctx.fillStyle = innerCoreGrad;
      ctx.fill();

      // ── Specular Top Rim Arch ─────────────────────────────────────────────
      ctx.beginPath();
      ctx.ellipse(
        center,
        center - baseRadius * 0.45,
        baseRadius * 0.55,
        baseRadius * 0.22,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fill();

      // ── Floating Orbital Particles ────────────────────────────────────────
      if (!reduceMotion && currentState !== "offline") {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.angle += p.speed;

          // In connecting/processing mode: particles spiral inward
          // In speaking mode: particles oscillate outward
          let currentDist = p.dist;
          if (currentState === "connecting" || currentState === "processing") {
            currentDist = p.dist * (0.65 + Math.sin(time * 3 + i) * 0.15);
          } else if (currentState === "speaking") {
            currentDist = p.dist * (1.1 + rms * 0.4);
          }

          p.x = center + Math.cos(p.angle) * currentDist;
          p.y = center + Math.sin(p.angle) * currentDist;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1.0;
        }
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [size, audioLevel, reduceMotion]);

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Living Aura Orb in state: ${state}`}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="relative z-10 transition-transform duration-300"
      />
    </div>
  );
}
