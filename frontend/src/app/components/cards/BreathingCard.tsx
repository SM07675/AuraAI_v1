import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Play, Pause, RefreshCw, Wind } from "lucide-react";

interface BreathingCardProps {
  title: string;
  description: string;
  steps?: string[];
  duration_minutes?: number;
}

export const BreathingCard: React.FC<BreathingCardProps> = ({
  title,
  description,
  steps,
  duration_minutes = 3,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<"Inhale" | "Hold" | "Exhale">("Inhale");
  const [secondsRemaining, setSecondsRemaining] = useState(duration_minutes * 60);

  useEffect(() => {
    if (!isActive) return;

    let stepTimer: NodeJS.Timeout;
    const cycle = () => {
      setPhase("Inhale");
      stepTimer = setTimeout(() => {
        setPhase("Hold");
        stepTimer = setTimeout(() => {
          setPhase("Exhale");
          stepTimer = setTimeout(cycle, 4000);
        }, 4000);
      }, 4000);
    };

    cycle();

    const countdown = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(stepTimer);
      clearInterval(countdown);
    };
  }, [isActive]);

  const toggleExercise = () => {
    setIsActive(!isActive);
    if (!isActive && secondsRemaining === 0) {
      setSecondsRemaining(duration_minutes * 60);
    }
  };

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;

  return (
    <div className="flex flex-col items-center justify-center p-4 text-center">
      {/* Animated Breathing Circle */}
      <div className="relative w-36 h-36 flex items-center justify-center my-3">
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-500/20 to-teal-400/30 dark:from-purple-500/30 dark:to-teal-400/40 blur-md"
          animate={{
            scale: isActive ? (phase === "Inhale" ? 1.35 : phase === "Hold" ? 1.35 : 0.85) : 1,
          }}
          transition={{ duration: 4, ease: "easeInOut" }}
        />
        <motion.div
          className="w-28 h-28 rounded-full border-2 border-teal-400/60 dark:border-teal-300/80 flex flex-col items-center justify-center bg-white/40 dark:bg-purple-950/50 backdrop-blur-md shadow-lg"
          animate={{
            scale: isActive ? (phase === "Inhale" ? 1.25 : phase === "Hold" ? 1.25 : 0.88) : 1,
          }}
          transition={{ duration: 4, ease: "easeInOut" }}
        >
          <Wind className="w-6 h-6 text-teal-600 dark:text-teal-300 mb-1" />
          <span className="text-xs font-black tracking-wider uppercase text-purple-950 dark:text-teal-100">
            {isActive ? phase : "Ready"}
          </span>
          <span className="text-[10px] font-mono text-purple-700/80 dark:text-purple-300/80 font-bold">
            {mins}:{secs < 10 ? `0${secs}` : secs}
          </span>
        </motion.div>
      </div>

      {/* Step Pills */}
      {steps && steps.length > 0 && (
        <div className="w-full text-left space-y-1.5 my-2">
          {steps.map((st, idx) => (
            <div
              key={idx}
              className="text-[11px] font-medium text-[#4A4458] dark:text-[#C7B5F3] flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/50 dark:bg-white/5"
            >
              <span className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-700 dark:text-teal-300 font-bold text-[9px] flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <span>{st}</span>
            </div>
          ))}
        </div>
      )}

      {/* Control Button */}
      <button
        onClick={toggleExercise}
        className="mt-3 px-5 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:from-teal-600 hover:to-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all"
      >
        {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        <span>{isActive ? "Pause Breathing" : "Begin Guided Breath"}</span>
      </button>
    </div>
  );
};
