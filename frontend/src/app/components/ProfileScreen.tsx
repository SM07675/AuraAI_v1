import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { User as UserIcon, Save, Sparkles, Target, Compass, MessageSquare, Check, LogOut, ShieldAlert, Stethoscope } from "lucide-react";
import { GlassCard } from "./glass-card";
import { useUser } from "../context/UserContext";
import { apiClient } from "../services/apiClient";
import { authService } from "../services/authService";
import { toast } from "sonner";

interface ProfileScreenProps {
  onLogout?: () => void;
  user?: { name: string; email: string; role?: "patient" | "clinician" } | null;
}

export function ProfileScreen({ onLogout, user: propUser }: ProfileScreenProps) {
  const { user: authUser, updateUserLocally, refreshUser } = useUser();
  const effectiveUser = authUser || propUser;
  const [loading, setLoading] = useState(false);

  const [role, setRole] = useState<"patient" | "clinician">(() => {
    return authService.getActivePortal();
  });

  const [name, setName] = useState(() => {
    if (effectiveUser?.name && effectiveUser.name !== "User") return effectiveUser.name;
    try {
      const u = localStorage.getItem("aura_user");
      const parsed = u ? JSON.parse(u) : null;
      if (parsed?.name && parsed.name !== "User") return parsed.name;
    } catch {}
    return "atharvpalekar";
  });

  const [email, setEmail] = useState(() => {
    if (effectiveUser?.email && effectiveUser.email !== "user@aura.ai") return effectiveUser.email;
    try {
      const u = localStorage.getItem("aura_user");
      const parsed = u ? JSON.parse(u) : null;
      if (parsed?.email && parsed.email !== "user@aura.ai") return parsed.email;
    } catch {}
    return "atharv@aura.ai";
  });

  const [commStyle, setCommStyle] = useState(() => (authUser as any)?.communication_style || "balanced");
  const [interestsStr, setInterestsStr] = useState(() => (authUser?.interests && authUser.interests.length > 0 ? authUser.interests.join(", ") : ""));
  const [goalsStr, setGoalsStr] = useState(() => (authUser?.goals && authUser.goals.length > 0 ? authUser.goals.join(", ") : "Boost Teamwork Momentum"));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const activeU = authUser || propUser;
    if (activeU) {
      if (activeU.name && activeU.name !== "User") setName(activeU.name);
      if (activeU.email && activeU.email !== "user@aura.ai") setEmail(activeU.email);
      if ("communication_style" in activeU && (activeU as any).communication_style) {
        setCommStyle((activeU as any).communication_style);
      }
      if ("interests" in activeU && Array.isArray((activeU as any).interests) && (activeU as any).interests.length > 0) {
        setInterestsStr((activeU as any).interests.join(", "));
      }
      if ("goals" in activeU && Array.isArray((activeU as any).goals) && (activeU as any).goals.length > 0) {
        setGoalsStr((activeU as any).goals.join(", "));
      }
    }

    apiClient.get<any>("/api/v1/users/me")
      .then((data) => {
        if (data) {
          if (data.name && data.name !== "User") setName(data.name);
          if (data.email && data.email !== "user@aura.ai") setEmail(data.email);
          if (data.communication_style) setCommStyle(data.communication_style);
          if (Array.isArray(data.interests) && data.interests.length > 0) {
            setInterestsStr(data.interests.join(", "));
          }
          if (Array.isArray(data.goals) && data.goals.length > 0) {
            setGoalsStr(data.goals.join(", "));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authUser]);

  const handleSave = async () => {
    const interests = interestsStr.split(",").map((i) => i.trim()).filter(Boolean);
    const goals = goalsStr.split(",").map((g) => g.trim()).filter(Boolean);

    try {
      await apiClient.patch("/api/v1/users/me", { name, communication_style: commStyle });
      await apiClient.put("/api/v1/users/me/interests", { interests });
      await apiClient.put("/api/v1/users/me/goals", { goals });
    } catch (e) {
      console.warn("Could not sync profile with backend:", e);
    }

    // Update local state and storage
    updateUserLocally({ name, email, communication_style: commStyle, interests, goals });
    try {
      const savedUser = localStorage.getItem("aura_user");
      const updated = savedUser ? { ...JSON.parse(savedUser), name, email } : { name, email };
      localStorage.setItem("aura_user", JSON.stringify(updated));
      localStorage.setItem("aura_user_interests", JSON.stringify(interests));
      localStorage.setItem("aura_user_goals", JSON.stringify(goals));
      localStorage.setItem("aura_user_style", commStyle);
    } catch (e) {}

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-2 sm:px-4 py-3 pb-32">
      <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[28px] font-extrabold tracking-tight m-0 text-[#2D2D42] dark:text-[#FFFFFF]">User Profile</h2>
          <p className="text-[14px] font-medium text-[#7A748A] dark:text-[#9E98B4] mt-1">
            Personalize your identity, communication style, and active goals for Aura.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          className="clay-button flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-[#7B59DC] cursor-pointer"
          style={{ borderRadius: 9999 }}
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? "Saved!" : "Save Profile"}
        </motion.button>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Basic Info */}
        <div className="clay-card p-6 rounded-[32px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-[#DDD2FC] dark:bg-[#372B5E] grid place-items-center text-[#7B59DC] dark:text-[#C7B5F3] shadow-sm">
              <UserIcon size={18} />
            </div>
            <h3 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-base">Identity & Style</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="clay-input w-full p-3 text-xs font-semibold text-[#2D2D42] dark:text-[#E8E4F2]"
                style={{ borderRadius: 16 }}
              />
            </div>

            <div>
              <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Email</label>
              <input
                value={email}
                disabled
                className="clay-input w-full p-3 text-xs font-medium text-[#7A748A] dark:text-[#6E6882] opacity-80"
                style={{ borderRadius: 16 }}
              />
            </div>

            <div>
              <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Communication Style</label>
              <select
                value={commStyle}
                onChange={(e) => setCommStyle(e.target.value)}
                className="clay-input w-full p-3 text-xs font-semibold text-[#2D2D42] dark:text-[#E8E4F2]"
                style={{ borderRadius: 16 }}
              >
                <option value="balanced" className="bg-[#171424] text-[#E8E4F2]">Balanced & Empathetic</option>
                <option value="direct" className="bg-[#171424] text-[#E8E4F2]">Direct & Solution-Focused</option>
                <option value="gentle" className="bg-[#171424] text-[#E8E4F2]">Gentle & Supportive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Goals & Interests */}
        <div className="clay-card p-6 rounded-[32px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-[#D0F6EC] dark:bg-[#1A453F] grid place-items-center text-[#0D9488] dark:text-[#34D399] shadow-sm">
              <Target size={18} />
            </div>
            <h3 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-base">Goals & Hobbies</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Active Goals (comma-separated)</label>
              <textarea
                value={goalsStr}
                onChange={(e) => setGoalsStr(e.target.value)}
                rows={3}
                className="clay-input w-full p-3 text-xs font-medium text-[#2D2D42] dark:text-[#E8E4F2] resize-none"
                style={{ borderRadius: 16 }}
              />
            </div>

            <div>
              <label className="font-bold text-[#4B4B60] dark:text-[#D8D2E8] block mb-1">Interests & Hobbies (comma-separated)</label>
              <textarea
                value={interestsStr}
                onChange={(e) => setInterestsStr(e.target.value)}
                rows={3}
                className="clay-input w-full p-3 text-xs font-medium text-[#2D2D42] dark:text-[#E8E4F2] resize-none"
                style={{ borderRadius: 16 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Role & Portal Workstation Access */}
      <div className="clay-card p-6 rounded-[32px]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-[#EDE7FB] dark:bg-[#2F274A] grid place-items-center text-[#7B59DC] dark:text-[#C7B5F3] shadow-sm">
            <Stethoscope size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-base m-0">
              Role & Workstation Authorization
            </h3>
            <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] font-medium m-0 mt-0.5">
              Role-Based Access Control (RBAC) enforced under healthcare compliance protocols.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl clay-card-flat flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{role === "clinician" ? "🩺" : "🧘"}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-[#2D2D42] dark:text-[#FFFFFF]">
                  {role === "clinician" ? "Clinician Workstation" : "Patient Sanctuary"}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  role === "clinician"
                    ? "bg-[#7B59DC]/20 text-[#7B59DC] dark:text-[#C7B5F3]"
                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                }`}>
                  Verified {role === "clinician" ? "Clinician" : "Patient"}
                </span>
              </div>
              <p className="text-[11px] text-[#7A748A] dark:text-[#9E98B4] font-medium mt-1 m-0">
                {role === "clinician"
                  ? "Authorized for empirical EEG file ingestion, 10-20 topomap analysis, and FACS triangulation matrix."
                  : "Authorized for personal emotional support, voice conversations, and memory journaling."}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-[#8E88A4] dark:text-[#9E98B4] font-bold px-2.5 py-1 rounded-xl bg-black/5 dark:bg-white/10 shrink-0">
            Immutable Role
          </span>
        </div>
      </div>

      {/* Account Security & Sign Out Section */}
      {onLogout && (
        <div className="clay-card p-6 rounded-[32px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#FEE0E0] dark:bg-[#592323] grid place-items-center text-[#D65548] dark:text-[#F87171] shadow-sm">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-[#2D2D42] dark:text-[#FFFFFF] text-sm">Account Session & Authentication</h3>
                <p className="text-xs text-[#7A748A] dark:text-[#9E98B4] font-medium mt-0.5">Sign out of your active session and return to the Sign In screen.</p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onLogout}
              className="clay-logout-btn px-6 py-2.5 rounded-full font-bold text-xs cursor-pointer flex items-center justify-center gap-2 border-none outline-none"
            >
              <LogOut size={15} />
              <span>Log Out of Aura</span>
            </motion.button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
