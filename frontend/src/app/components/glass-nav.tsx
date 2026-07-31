import { motion, useMotionValue, animate } from "motion/react";
import { Sparkles } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

const ITEMS = ["Dashboard", "Chat", "Voice Mode", "Face-to-Face", "Memory", "Profile", "Emotion", "Analytics", "Debug", "Settings"];

type Rect = { left: number; width: number };

export function GlassNav({ active, onSelect }: { active: string; onSelect: (s: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rects, setRects] = useState<Rect[]>([]);
  const x = useMotionValue(0);
  const w = useMotionValue(0);
  const [dragging, setDragging] = useState(false);

  const activeIndex = Math.max(0, ITEMS.indexOf(active));

  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const measure = () => {
      const cRect = c.getBoundingClientRect();
      const next = itemRefs.current.map((el) => {
        const r = el!.getBoundingClientRect();
        return { left: r.left - cRect.left, width: r.width };
      });
      setRects(next);
    };

    measure();

    // Re-measure once web fonts finish loading (tab widths change after Inter loads).
    if (document.fonts?.ready) document.fonts.ready.then(measure);

    // Re-measure on any container size change (resize, zoom, layout shifts).
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    itemRefs.current.forEach((el) => el && ro.observe(el));

    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useLayoutEffect(() => {
    if (!rects[activeIndex] || dragging) return;
    animate(x, rects[activeIndex].left, { type: "spring", stiffness: 320, damping: 26, mass: 1.1 });
    animate(w, rects[activeIndex].width, { type: "spring", stiffness: 320, damping: 26, mass: 1.1 });
  }, [rects, activeIndex, dragging]);

  const nearestIndex = () => {
    const center = x.get() + w.get() / 2;
    let best = 0;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
      const c = r.left + r.width / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const dragBounds = rects.length
    ? { left: rects[0].left, right: rects[rects.length - 1].left }
    : { left: 0, right: 0 };

  return (
    <>
      {/* Logo — separate, disconnected pill in the top-left corner */}
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="liquid-glass fixed top-5 left-6 z-50 inline-flex items-center gap-2.5 rounded-full w-max shrink-0"
        style={{ paddingLeft: 8, paddingRight: 16, paddingBlock: 7 }}
      >
        <div
          className="grid place-items-center rounded-full relative overflow-hidden"
          style={{
            width: 34,
            height: 34,
            background: "linear-gradient(135deg,#2458FF,#7A5AF8 50%,#00D4FF)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 4px 12px rgba(36,88,255,0.4), inset 0 1px 2px rgba(255,255,255,0.8)",
          }}
        >
          <div
            className="absolute rounded-full"
            style={{ width: 12, height: 7, left: 5, top: 3, background: "rgba(255,255,255,0.6)", filter: "blur(2px)" }}
          />
          <Sparkles size={16} color="#fff" />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: "#1e2740" }}>
          Aura{" "}
          <span
            style={{
              background: "linear-gradient(120deg,#7A5AF8,#2458FF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AI
          </span>
        </span>
      </motion.div>

      {/* Tabs — separate small capsule, centered */}
      <motion.nav
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-5 left-1/2 -translate-x-1/2 z-50"
      >
        <div className="liquid-glass rounded-full" style={{ padding: 4, background: "rgba(255, 255, 255, 0.45)", backdropFilter: "blur(16px)" }}>
          <div ref={containerRef} className="relative flex items-center">
            {/* Draggable liquid bubble (drag-only selection) */}
            {rects.length > 0 && (
              <motion.div
                drag="x"
                dragConstraints={dragBounds}
                dragElastic={0.14}
                dragMomentum={false}
                onDragStart={() => setDragging(true)}
                onDrag={() => {
                  const i = nearestIndex();
                  if (ITEMS[i] !== active) onSelect(ITEMS[i]);
                }}
                onDragEnd={() => {
                  const i = nearestIndex();
                  setDragging(false);
                  onSelect(ITEMS[i]);
                  animate(x, rects[i].left, { type: "spring", stiffness: 360, damping: 22, mass: 1 });
                  animate(w, rects[i].width, { type: "spring", stiffness: 360, damping: 22, mass: 1 });
                }}
                whileDrag={{ scale: 1.08 }}
                whileTap={{ scale: 1.04 }}
                className="liquid-bubble absolute rounded-full cursor-grab active:cursor-grabbing"
                style={{ x, width: w, height: 32, top: "50%", marginTop: -16, touchAction: "none" }}
              />
            )}

            {ITEMS.map((item, i) => {
              const isActive = active === item;
              return (
                <button
                  key={item}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  onClick={() => onSelect(item)}
                  className="relative rounded-full transition-colors z-10 cursor-pointer whitespace-nowrap"
                  style={{
                    paddingInline: 12,
                    paddingBlock: 6,
                    color: isActive ? "#2458FF" : "#49536A",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item}</span>
                </button>
              );
            })}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 4, delay: 1.2, times: [0, 0.15, 0.8, 1] }}
          className="text-center mt-2"
          style={{ fontSize: 11, color: "#6b7a95", fontWeight: 500 }}
        >
          Hold & drag the glass bubble between tabs ✦
        </motion.div>
      </motion.nav>
    </>
  );
}
