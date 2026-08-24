import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { User as UserIcon, Save, Sparkles, Target, Compass, MessageSquare, Check, LogOut, ShieldAlert } from "lucide-react";
import { GlassCard } from "./glass-card";

interface ProfileScreenProps {
  onLogout?: () => void;
}

export function ProfileScreen({ onLogout }: ProfileScreenProps) {
  const [name, setName] = useState("Rahul");
  const [email, setEmail] = useState("rahul@example.com");
  const [commStyle, setCommStyle] = useState("balanced");
  const [interestsStr, setInterestsStr] = useState("Football, AI & Psychology, Coding");
  const [goalsStr, setGoalsStr] = useState("Placement Preparation, Stress Reduction");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/v1/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.name) setName(data.name);
        if (data.email) setEmail(data.email);
        if (data.communication_style) setCommStyle(data.communication_style);
        if (data.interests) setInterestsStr(data.interests.join(", "));
        if (data.goals) setGoalsStr(data.goals.join(", "));
      })
      .catch(() => {
        // Fallback to local storage user
        try {
          const savedUser = localStorage.getItem("aura_user");
          if (savedUser) {
            const parsed = JSON.parse(savedUser);
            if (parsed.name) setName(parsed.name);
            if (parsed.email) setEmail(parsed.email);
          }
        } catch (e) {}
      });
  }, []);

  const handleSave = () => {
    const interests = interestsStr.split(",").map((i) => i.trim()).filter(Boolean);
    const goals = goalsStr.split(",").map((g) => g.trim()).filter(Boolean);

    // Update profile
    fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, communication_style: commStyle }),
    }).catch(() => {});

    // Update interests
    fetch("/api/v1/users/me/interests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests }),
    }).catch(() => {});

    // Update goals
    fetch("/api/v1/users/me/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals }),
    }).catch(() => {});

    // Update local storage
    try {
      const savedUser = localStorage.getItem("aura_user");
      const updated = savedUser ? { ...JSON.parse(savedUser), name } : { name, email };
      localStorage.setItem("aura_user", JSON.stringify(updated));
      localStorage.setItem(`aura_profile_${email}`, JSON.stringify({ name, email, communication_style: commStyle, interests, goals }));
      localStorage.setItem("aura_user_interests", JSON.stringify(interests));
      localStorage.setItem("aura_user_goals", JSON.stringify(goals));
      localStorage.setItem("aura_user_style", commStyle);
    } catch (e) {}

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 select-none px-2 sm:px-4">
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
  );
}
