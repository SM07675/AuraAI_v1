import React, { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";

interface PomodoroCardProps {
  title: string;
  description: string;
  duration_minutes?: number;
  steps?: string[];
}

export const PomodoroCard: React.FC<PomodoroCardProps> = ({
  title,
  description,
  duration_minutes = 25,
  steps,
}) => {
  const [seconds, setSeconds] = useState(duration_minutes * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prev) => prev - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsRunning(false);
    }
    return () => clearInterval(interval);
  }, [isRunning, seconds]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => {
    setIsRunning(false);
    setSeconds(duration_minutes * 60);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progressPct = Math.round(((duration_minutes * 60 - seconds) / (duration_minutes * 60)) * 100);

  return (
    <div className="p-3 text-center space-y-3">
      {/* Timer Display */}
      <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-amber-500/10 dark:from-purple-950/40 dark:to-amber-950/20 border border-purple-300/30">
        <Timer className="w-5 h-5 text-purple-600 dark:text-purple-300 mb-1" />
        <div className="font-mono text-3xl font-black text-[#2E2544] dark:text-white tracking-tight">
          {mins < 10 ? `0${mins}` : mins}:{secs < 10 ? `0${secs}` : secs}
        </div>
        <div className="text-[10.5px] font-bold text-[#7A748A] dark:text-[#9A90B2] mt-0.5">
          {isRunning ? "Focus Block Active" : "Sprint Ready"}
        </div>
      </div>

      {/* Steps checklist */}
      {steps && steps.length > 0 && (
        <div className="text-left space-y-1 my-2">
          {steps.map((st, idx) => (
            <div key={idx} className="text-[11px] text-[#4A4458] dark:text-[#C7B5F3] flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold text-[9px] flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <span>{st}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={toggleTimer}
          className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95"
        >
          {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isRunning ? "Pause Sprint" : "Start 25m Focus"}</span>
        </button>
        <button
          onClick={resetTimer}
          className="p-1.5 rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 text-[#6B637B] dark:text-[#C7B5F3] transition-all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
