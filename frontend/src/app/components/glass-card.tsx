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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover ? { y: -4 } : undefined}
      className={`clay-card ${className}`}
      style={{
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}
