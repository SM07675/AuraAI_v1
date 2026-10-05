import { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";

export function AmbientBackground() {
  const { isDark } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      node.style.setProperty("--pointer-x", `${event.clientX / window.innerWidth - 0.5}`);
      node.style.setProperty("--pointer-y", `${event.clientY / window.innerHeight - 0.5}`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  return (
    <div ref={ref} className={`aura-ambient ${isDark ? "is-dark" : "is-light"}`} aria-hidden="true">
      <div className="aura-ambient__cloud aura-ambient__cloud--one" />
      <div className="aura-ambient__cloud aura-ambient__cloud--two" />
      <div className="aura-ambient__cloud aura-ambient__cloud--three" />
      <div className="aura-ambient__dust" />
      <div className="aura-ambient__veil" />
    </div>
  );
}
