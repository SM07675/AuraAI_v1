import { motion } from "motion/react";
import { Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useState } from "react";

export function MusicPlayer() {
  const [vol, setVol] = useState(70);
  const bars = Array.from({ length: 28 });

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
      style={{ width: "min(680px, 92vw)" }}
    >
      <div
        className="liquid-glass flex items-center gap-4 px-4 py-3"
        style={{ borderRadius: 28 }}
      >
        <div
          className="rounded-2xl shrink-0"
          style={{ width: 48, height: 48, background: "linear-gradient(135deg,#2458FF,#5EEAD4)" }}
        />
        <div className="shrink-0" style={{ minWidth: 120 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Peaceful Mind</div>
          <div style={{ fontSize: 12, color: "#717190" }}>Aura · Ambient</div>
        </div>

        {/* Waveform */}
        <div className="flex items-center gap-[3px] flex-1 h-8 overflow-hidden">
          {bars.map((_, i) => (
            <motion.div
              key={i}
              style={{ width: 3, borderRadius: 3, background: "linear-gradient(180deg,#2458FF,#00D4FF)" }}
              animate={{ height: [8, 6 + Math.random() * 22, 8] }}
              transition={{ duration: 0.9 + Math.random(), repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button className="p-1.5 text-[#4a4a68] hover:text-[#2458FF] transition-colors"><SkipBack size={18} /></button>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.85, scaleY: 0.78 }}
            transition={{ type: "spring", stiffness: 500, damping: 12 }}
            className="grid place-items-center rounded-full"
            style={{ width: 40, height: 40, background: "linear-gradient(135deg,#2458FF,#00C6FF)", boxShadow: "0 6px 16px rgba(78,168,255,0.5)" }}
          >
            <Play size={18} color="#fff" fill="#fff" />
          </motion.button>
          <button className="p-1.5 text-[#4a4a68] hover:text-[#2458FF] transition-colors"><SkipForward size={18} /></button>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0" style={{ width: 110 }}>
          <Volume2 size={16} color="#717190" />
          <input
            type="range" min={0} max={100} value={vol}
            onChange={(e) => setVol(+e.target.value)}
            className="w-full accent-[#2458FF]"
          />
        </div>
      </div>
    </motion.div>
  );
}
