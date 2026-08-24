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
    <header className="fixed top-4 left-0 right-0 z-50 px-6 flex items-center justify-between pointer-events-none">
      {/* Top Left Pills Row (Aura Logo, User Profile, Logout) */}
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-2.5 pointer-events-auto"
      >
        {/* Pill 1: Aura Logo */}
        <div
          className="liquid-glass flex items-center gap-2 rounded-full px-3.5 py-1.5 shadow-sm border border-white/80"
          style={{ background: "rgba(255, 255, 255, 0.75)" }}
        >
          <div
            className="grid place-items-center rounded-full text-white font-extrabold text-xs shadow-xs"
            style={{
              width: 26,
              height: 26,
              background: "linear-gradient(135deg, #0284C7, #38BDF8)",
            }}
          >
            A
          </div>
          <span className="text-sm font-bold text-slate-800 tracking-tight">Aura</span>
        </div>

        {/* Pill 2: User Name */}
        {user && (
          <div
            onClick={() => onSelect("Profile")}
            title="View Profile & Settings"
            className={`liquid-glass flex items-center gap-2 rounded-full px-3.5 py-1.5 shadow-sm border border-white/80 cursor-pointer transition-all ${
              active === "Profile" ? "ring-2 ring-sky-400 bg-sky-50/90" : "hover:bg-white/90"
            }`}
            style={{ background: "rgba(255, 255, 255, 0.75)" }}
          >
            <div
              className="grid place-items-center rounded-full text-white font-extrabold text-xs shadow-xs"
              style={{
                width: 26,
                height: 26,
                background: "linear-gradient(135deg, #0284C7, #38BDF8)",
              }}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <span className="text-sm font-bold text-slate-800 tracking-tight">{user.name}</span>
          </div>
        )}

        {/* Pill 3: Logout */}
        {user && onLogout && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={onLogout}
            title="Log Out"
            className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 bg-white/75 hover:bg-rose-50 border border-white/80 cursor-pointer shadow-sm transition-all"
          >
            <LogOut size={13} className="text-rose-500" />
            <span>Logout</span>
          </motion.button>
        )}
      </motion.div>

      {/* Top Right Capsule Navigation */}
      <motion.nav
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto"
      >
        <div
          className="liquid-glass rounded-full shadow-md border border-white/80"
          style={{ padding: 4, background: "rgba(255, 255, 255, 0.7)", backdropFilter: "blur(20px)" }}
        >
          <div ref={containerRef} className="relative flex items-center overflow-x-auto no-scrollbar gap-1">
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
                  className="relative rounded-full transition-all z-10 cursor-pointer whitespace-nowrap px-3.5 py-1.5"
                  style={{
                    color: isActive ? "#0284C7" : "#5c5c78",
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 500 }}>{item}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </header>
  );
}
