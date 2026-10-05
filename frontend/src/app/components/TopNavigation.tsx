import React, { useEffect, useRef, useState } from "react";
import { PanelLeft, X, LogOut } from "lucide-react";
import { NAV_ITEMS, NavUser } from "./LiquidSidebar";
import { AuraBrandLogo } from "./AuraBrandLogo";

export function TopNavigation({ active, onSelect, user, onLogout }: {
  active: string; onSelect: (screen: string) => void; user: NavUser | null; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) { dialog.close(); triggerRef.current?.focus(); }
  }, [open]);
  const items = user?.is_admin ? [...NAV_ITEMS, { id: "Debug", label: "Debug", icon: PanelLeft }] : NAV_ITEMS;
  return <header className="aura-top-navigation" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <div className="aura-top-navigation__row">
      <button ref={triggerRef} className="aura-top-navigation__toggle" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls="aura-navigation-menu" aria-label="Open sidebar navigation" title="Open sidebar navigation"><PanelLeft size={21} /></button>
      <button className="aura-top-navigation__brand" onClick={() => { onSelect("Dashboard"); setOpen(false); }} aria-label="Aura home">
        <AuraBrandLogo size={30} showWordmark />
      </button>
      <nav className="aura-top-navigation__desktop" aria-label="Primary navigation">
        {items.map(item => <button key={item.id} onClick={() => onSelect(item.id)} aria-current={active === item.id ? "page" : undefined}>{item.label}</button>)}
      </nav>
      <button className="aura-top-navigation__logout" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
    </div>
    <dialog ref={dialogRef} id="aura-navigation-menu" className="aura-navigation-drawer" aria-labelledby="aura-navigation-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false); } }}>
      <div className="aura-navigation-drawer__heading"><div><h2 id="aura-navigation-title">Your space</h2><p>Choose where to go next</p></div><button autoFocus onClick={() => setOpen(false)} aria-label="Close sidebar navigation"><X size={20} /></button></div>
      <nav aria-label="Sidebar navigation">
        {items.map(item => <button key={item.id} onClick={() => { onSelect(item.id); setOpen(false); }} aria-current={active === item.id ? "page" : undefined}><item.icon size={19} /><span>{item.label}</span></button>)}
      </nav>
      <div className="aura-navigation-drawer__account"><span>{user?.name || "Guest"}</span><button onClick={() => { setOpen(false); onLogout(); }}><LogOut size={17} />Sign out</button></div>
    </dialog>
  </header>;
}
