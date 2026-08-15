import { motion, useMotionValue, animate } from "motion/react";
import { Sparkles, LogOut, User as UserIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

const ITEMS = ["Dashboard", "Chat", "Voice Mode", "Face-to-Face", "Memory", "Emotion", "Analytics", "Interests"];

type Rect = { left: number; width: number };

interface GlassNavProps {
  active: string;
  onSelect: (s: string) => void;
  user?: { name: string; email: string } | null;
  onLogout?: () => void;
}

export function GlassNav({ active, onSelect, user, onLogout }: GlassNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rects, setRects] = useState<Rect[]>([]);
  const x = useMotionValue(0);
  const w = useMotionValue(0);
  const [dragging, setDragging] = useState(false);

  const activeIndex = ITEMS.indexOf(active);

  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    const measure = () => {
      const cRect = c.getBoundingClientRect();
      const next = itemRefs.current.map((el) => {
        if (!el) return { left: 0, width: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left - cRect.left, width: r.width };
      });
      setRects(next);
    };

    measure();

    if (document.fonts?.ready) document.fonts.ready.then(measure);

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
    if (activeIndex === -1 || !rects[activeIndex] || dragging) return;
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
      {/* Logo — fixed in the top-left corner */}
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="liquid-glass fixed top-4 left-5 z-[60] inline-flex items-center gap-2.5 rounded-full w-max shrink-0 shadow-sm"
        style={{ paddingLeft: 8, paddingRight: 16, paddingBlock: 6 }}
      >
        <div
          className="grid place-items-center rounded-full relative overflow-hidden"
          style={{
            width: 32,
            height: 32,
            background: "linear-gradient(135deg,#2458FF,#7A5AF8 50%,#00D4FF)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 4px 12px rgba(36,88,255,0.4), inset 0 1px 2px rgba(255,255,255,0.8)",
          }}
        >
          <div
            className="absolute rounded-full"
            style={{ width: 12, height: 7, left: 5, top: 3, background: "rgba(255,255,255,0.6)", filter: "blur(2px)" }}
          />
          <Sparkles size={15} color="#fff" />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, color: "#1e2740" }}>
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

      {/* User Profile & Logout — permanently FIXED pill in top-right corner */}
      {user && (
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="liquid-glass fixed top-4 right-5 z-[60] inline-flex items-center gap-2 rounded-full shrink-0 shadow-md backdrop-blur-xl"
          style={{
            paddingLeft: 6,
            paddingRight: 6,
            paddingBlock: 5,
            background: "rgba(255, 255, 255, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          }}
        >
          {/* User Profile Button */}
          <div
            onClick={() => onSelect("Profile")}
            title="View Profile & Settings"
            className={`flex items-center gap-2 cursor-pointer rounded-full px-2.5 py-1 transition-all ${
              active === "Profile"
                ? "bg-sky-100/90 text-sky-800 ring-1 ring-sky-300"
                : "hover:bg-white/80 text-slate-800"
            }`}
          >
            <div
              className="grid place-items-center rounded-full text-white font-bold text-xs shrink-0 shadow-sm"
              style={{
                width: 26,
                height: 26,
                background: "linear-gradient(135deg, #0284C7, #38BDF8)",
              }}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e2740" }}>
              {user.name}
            </span>
          </div>

          {/* Logout Button */}
          {onLogout && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onLogout}
              title="Log Out of Aura"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100/90 border border-rose-200/90 cursor-pointer transition-all shadow-xs"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Tabs — centered capsule */}
      <motion.nav
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-360px)]"
      >
        <div className="liquid-glass rounded-full" style={{ padding: 3, background: "rgba(255, 255, 255, 0.55)", backdropFilter: "blur(18px)" }}>
          <div ref={containerRef} className="relative flex items-center overflow-x-auto no-scrollbar">
            {/* Draggable liquid bubble */}
            {rects.length > 0 && activeIndex !== -1 && (
              <motion.div
                drag="x"
                dragConstraints={dragBounds}
                dragElastic={0.14}
                dragMomentum={false}
                onDragStart={() => setDragging(true)}
                onDrag={() => {
                  const i = nearestIndex();
                  if (ITEMS[i] && ITEMS[i] !== active) onSelect(ITEMS[i]);
                }}
                onDragEnd={() => {
                  const i = nearestIndex();
                  setDragging(false);
                  if (ITEMS[i]) {
                    onSelect(ITEMS[i]);
                    animate(x, rects[i].left, { type: "spring", stiffness: 360, damping: 22, mass: 1 });
                    animate(w, rects[i].width, { type: "spring", stiffness: 360, damping: 22, mass: 1 });
                  }
                }}
                whileDrag={{ scale: 1.08 }}
                whileTap={{ scale: 1.04 }}
                className="liquid-bubble absolute rounded-full cursor-grab active:cursor-grabbing"
                style={{ x, width: w, height: 30, top: "50%", marginTop: -15, touchAction: "none" }}
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
                    paddingInline: 10,
                    paddingBlock: 5,
                    color: isActive ? "#0077FF" : "#64748B",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{item}</span>
                </button>
              );
            })}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 4, delay: 1.2, times: [0, 0.15, 0.8, 1] }}
          className="text-center mt-1.5"
          style={{ fontSize: 10.5, color: "#6b7a95", fontWeight: 500 }}
        >
          Hold & drag glass bubble between tabs ✦
        </motion.div>
      </motion.nav>
    </>
  );
}
