import React from "react";
import { motion } from "motion/react";

interface AuraBrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
}

export function AuraBrandLogo({
  size = 32,
  showWordmark = true,
  subtitle,
  className = "",
}: AuraBrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Luminous Abstract Symbol: Interconnected Light / Presence Ribbon */}
      <motion.div
        whileHover={{ scale: 1.06, rotate: 6 }}
        whileTap={{ scale: 0.94 }}
        className="relative shrink-0 flex items-center justify-center cursor-pointer"
        style={{ width: size, height: size }}
      >
        {/* Soft Ambient Radiance Behind Mark */}
        <div
          className="absolute inset-0 rounded-full blur-md opacity-70 pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(139, 92, 246, 0.6) 0%, rgba(56, 189, 248, 0.3) 60%, transparent 100%)",
          }}
        />

        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 filter drop-shadow-[0_2px_8px_rgba(139,92,246,0.45)]"
        >
          <defs>
            <linearGradient id="aura-grad-1" x1="4" y1="8" x2="44" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="45%" stopColor="#6366F1" />
              <stop offset="75%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>

            <linearGradient id="aura-grad-2" x1="40" y1="10" x2="8" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F472B6" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#A78BFA" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.9" />
            </linearGradient>

            <filter id="aura-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Primary Harmonic Loop: Continuous Flow of Awareness */}
          <path
            d="M 24 6 C 14 6, 6 14, 6 24 C 6 34, 14 42, 24 42 C 34 42, 42 34, 42 24 C 42 14, 34 6, 24 6 Z"
            stroke="url(#aura-grad-1)"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
            className="opacity-40"
          />

          {/* Intersecting Luminous Waveform / Infinity Respiration Ribbon */}
          <path
            d="M 12 24 C 12 17, 18 13, 24 24 C 30 35, 36 31, 36 24 C 36 17, 30 13, 24 24 C 18 35, 12 31, 12 24 Z"
            stroke="url(#aura-grad-1)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#aura-glow)"
          />

          {/* Inner Light Core / Spark */}
          <circle cx="24" cy="24" r="3.2" fill="#FFFFFF" opacity="0.95" />
          <circle cx="24" cy="24" r="5.5" stroke="url(#aura-grad-2)" strokeWidth="1.2" opacity="0.8" />
        </svg>
      </motion.div>

      {/* Wordmark */}
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[18px] font-extrabold tracking-tight text-[#191B2E] dark:text-[#FFFFFF]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Aura
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider text-violet-600 dark:text-violet-300 bg-violet-500/10 border border-violet-500/20"
            >
              AI
            </span>
          </div>
          {subtitle && (
            <span className="text-[10.5px] font-medium text-[#717694] dark:text-[#8E95B8] mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
