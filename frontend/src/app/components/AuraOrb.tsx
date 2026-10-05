import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { audioEngine } from "../services/audioEngine";

export type AuraOrbState = "idle" | "connecting" | "ready" | "listening" | "user-speaking" | "processing" | "speaking" | "interrupted" | "offline";

export function AuraOrb({ state = "idle", size = 280 }: { state?: AuraOrbState; size?: number }) {
  const reduceMotion = useReducedMotion();
  const [level, setLevel] = useState(0);

  useEffect(() => audioEngine.subscribeTelemetry((t) => {
    const live = state === "speaking" ? t.refRms : t.micRms;
    setLevel(Math.min(1, live * 16));
  }), [state]);

  const activeScale = 1 + level * 0.09;
  return (
    <div className={`aura-orb aura-orb--${state}`} style={{ width: size, height: size }} role="img" aria-label={`Aura voice visualization: ${state}`}>
      <motion.div className="aura-orb__halo" animate={reduceMotion ? undefined : { scale: state === "listening" || state === "user-speaking" ? [1, 1.14, 1] : [1, 1.05, 1], opacity: [0.35, 0.7, 0.35] }} transition={{ duration: state === "user-speaking" ? 1.1 : 4.8, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="aura-orb__shell" animate={{ scale: activeScale }} transition={{ duration: 0.09 }}>
        <div className="aura-orb__surface" />
        <div className="aura-orb__light" />
        <div className="aura-orb__core" />
      </motion.div>
      {!reduceMotion && <div className="aura-orb__particles" />}
    </div>
  );
}
