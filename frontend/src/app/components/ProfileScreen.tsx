import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { User as UserIcon, Save, Sparkles, Target, Compass, MessageSquare, Check } from "lucide-react";
import { GlassCard } from "./glass-card";

export function ProfileScreen() {
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
      .catch(() => {});
  }, []);

  const handleSave = () => {
    const interests = interestsStr.split(",").map((i) => i.strip ? i.strip() : i.trim());
    const goals = goalsStr.split(",").map((g) => g.strip ? g.strip() : g.trim());

    // Update profile
    fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, communication_style: commStyle }),
    });

    // Update interests & goals
    fetch("/api/v1/users/me/interests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests }),
    });

    fetch("/api/v1/users/me/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals }),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, margin: 0 }}>User Profile</h2>
          <p style={{ color: "#5c5c78", fontSize: 16, marginTop: 6 }}>
            Personalize your identity, communication style, and active goals for Aura.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 rounded-full px-6 py-3 text-white font-semibold text-sm shadow-lg shadow-blue-500/30"
          style={{ background: "linear-gradient(135deg,#2458FF,#00C6FF)" }}
        >
          {saved ? <Check size={18} /> : <Save size={18} />}
          {saved ? "Saved!" : "Save Profile"}
        </button>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Basic Info */}
        <GlassCard style={{ padding: 24 }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-100 grid place-items-center text-blue-600">
              <UserIcon size={20} />
            </div>
            <h3 className="font-bold text-slate-900 text-lg">Identity & Style</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl p-3 bg-white/80 border border-slate-200 text-slate-800 outline-none font-medium"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Email</label>
              <input
                value={email}
                disabled
                className="w-full rounded-xl p-3 bg-slate-100/80 border border-slate-200 text-slate-500 outline-none font-medium"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Communication Style</label>
              <select
                value={commStyle}
                onChange={(e) => setCommStyle(e.target.value)}
                className="w-full rounded-xl p-3 bg-white/80 border border-slate-200 text-slate-800 outline-none font-medium"
              >
                <option value="balanced">Balanced & Empathetic</option>
                <option value="direct">Direct & Solution-Focused</option>
                <option value="gentle">Gentle & Supportive</option>
              </select>
            </div>
          </div>
        </GlassCard>

        {/* Goals & Interests */}
        <GlassCard style={{ padding: 24 }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-teal-100 grid place-items-center text-teal-600">
              <Target size={20} />
            </div>
            <h3 className="font-bold text-slate-900 text-lg">Goals & Hobbies</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Active Goals (comma-separated)</label>
              <textarea
                value={goalsStr}
                onChange={(e) => setGoalsStr(e.target.value)}
                rows={3}
                className="w-full rounded-xl p-3 bg-white/80 border border-slate-200 text-slate-800 outline-none font-medium resize-none"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Interests & Hobbies (comma-separated)</label>
              <textarea
                value={interestsStr}
                onChange={(e) => setInterestsStr(e.target.value)}
                rows={3}
                className="w-full rounded-xl p-3 bg-white/80 border border-slate-200 text-slate-800 outline-none font-medium resize-none"
              />
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
