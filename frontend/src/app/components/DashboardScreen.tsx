import { motion } from "motion/react";
import { MessageSquare, Mic, Video, Brain, ArrowUpRight, Sparkles } from "lucide-react";
import { AuraOrb } from "./AuraOrb";

interface DashboardScreenProps { onStart: (screen?: string, query?: string) => void; onLogout?: () => void; onNavigateToAuth?: () => void; }
const MODES = [
  { label: "Chat", detail: "Write what is on your mind", screen: "Chat", icon: MessageSquare },
  { label: "Voice", detail: "A hands-free conversation", screen: "Voice Mode", icon: Mic },
  { label: "Face-to-Face", detail: "Talk with Aura in a shared space", screen: "Face-to-Face", icon: Video },
  { label: "Memory", detail: "Review what Aura remembers", screen: "Memory", icon: Brain },
];

export function DashboardScreen({ onStart }: DashboardScreenProps) {
  let firstName = "there";
  try { firstName = JSON.parse(localStorage.getItem("aura_user") || "{}").name?.split(" ")[0] || "there"; } catch {}
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <div className="w-full h-full overflow-y-auto custom-scrollbar px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-28 lg:pb-8"><div className="max-w-[1320px] mx-auto">
    <section className="grid lg:grid-cols-[1.05fr_.95fr] gap-5 items-stretch">
      <div className="clay-card relative overflow-hidden p-7 sm:p-10 min-h-[390px] flex flex-col justify-between"><div className="absolute -left-24 -top-24 w-72 h-72 rounded-full bg-violet-500/15 blur-3xl" /><div className="relative"><div className="eyebrow-label mb-4">Your space to pause and reconnect</div><h1 className="text-[38px] sm:text-[56px] leading-[1.04] tracking-[-.045em] font-semibold m-0 text-[#201b35] dark:text-white">{greeting},<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-indigo-400 to-sky-400">{firstName}.</span></h1><p className="mt-5 max-w-lg text-[15px] sm:text-[17px] leading-7 text-[#716b84] dark:text-[#aaa7bd]">How are you feeling today? Aura is an AI companion here to listen, reflect, and help you find the next gentle step.</p></div><div className="relative flex flex-wrap gap-2 mt-8" aria-label="Optional mood check-in">{["I feel good","A little unsettled","I need to talk","Just checking in"].map(label=><button key={label} onClick={()=>onStart("Chat",label)} className="clay-pill min-h-11 px-4 text-sm font-semibold text-[#514a68] dark:text-[#d9d5e7] cursor-pointer">{label}</button>)}</div></div>
      <div className="clay-card min-h-[390px] relative overflow-hidden grid place-items-center p-6"><div className="absolute top-6 left-6 flex items-center gap-2 text-xs font-semibold text-[#716b84] dark:text-[#aaa7bd]"><Sparkles size={14} className="text-violet-400"/> Aura presence</div><AuraOrb state="ready" size={330}/><p className="absolute bottom-7 text-xs text-center text-[#817b93] dark:text-[#918ca4]">Abstract AI presence · human avatar appears only in Face-to-Face</p></div>
    </section>
    <section className="mt-5"><div className="mb-3 px-1"><h2 className="text-xl font-semibold m-0 dark:text-white">Start with Aura</h2><p className="text-sm text-[#716b84] dark:text-[#aaa7bd] mt-1">Choose the space that feels right.</p></div><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{MODES.map(({label,detail,screen,icon:Icon})=><motion.button key={label} whileHover={{y:-3}} whileTap={{scale:.98}} onClick={()=>onStart(screen)} className="clay-card text-left p-5 min-h-[150px] cursor-pointer group"><div className="flex items-start justify-between"><div className="w-11 h-11 rounded-2xl grid place-items-center bg-gradient-to-br from-violet-500/20 to-sky-400/10 text-violet-500"><Icon size={21}/></div><ArrowUpRight size={18} className="text-[#8d87a0] group-hover:text-violet-400"/></div><h3 className="mt-6 mb-1 text-base font-semibold dark:text-white">{label}</h3><p className="m-0 text-sm text-[#716b84] dark:text-[#aaa7bd]">{detail}</p></motion.button>)}</div></section>
    <section className="grid md:grid-cols-2 gap-3 mt-5"><div className="clay-card-flat p-6"><h3 className="m-0 text-base font-semibold dark:text-white">Recent activity</h3><p className="mt-3 mb-0 text-sm leading-6 text-[#716b84] dark:text-[#aaa7bd]">No recent activity is available yet. Your real conversations will appear here when the service provides them.</p></div><div className="clay-card-flat p-6"><h3 className="m-0 text-base font-semibold dark:text-white">Wellbeing summary</h3><p className="mt-3 mb-0 text-sm leading-6 text-[#716b84] dark:text-[#aaa7bd]">There is not enough information for a summary. Aura will never invent insights about you.</p></div></section>
  </div></div>;
}
