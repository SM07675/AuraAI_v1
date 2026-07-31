import { motion } from "motion/react";
import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  style = {},
  hover = true,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  hover?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover ? { y: -6 } : undefined}
      className={`liquid-glass ${className}`}
      style={{
        borderRadius: 32,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}
