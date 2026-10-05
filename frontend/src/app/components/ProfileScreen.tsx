import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  User as UserIcon,
  Sun,
  Moon,
  Laptop,
  Volume2,
  Globe,
  Save,
  Check,
  LogOut,
  Shield,
  Play,
  Square,
  Sparkles,
  Sliders,
} from "lucide-react";
import { useUser } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import { voiceService, CURATED_VOICES } from "../services/voiceService";
import { speechService, SUPPORTED_LANGUAGES, SupportedLanguage } from "../services/speechRecognitionService";
import { apiClient } from "../services/apiClient";

interface ProfileScreenProps {
  onLogout?: () => void;
  user?: { name: string; email: string } | null;
}

export function ProfileScreen({ onLogout, user: propUser }: ProfileScreenProps) {
  const { user: authUser, updateUserLocally } = useUser();
  const { isDark, toggleTheme } = useTheme();
  const effectiveUser = authUser || propUser;

  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "voice" | "language" | "account">("profile");

  // Profile Form State
  const [name, setName] = useState(() => effectiveUser?.name || "Friend");
  const [email, setEmail] = useState(() => effectiveUser?.email || "friend@aura.local");
  const [commStyle, setCommStyle] = useState(() => (authUser as any)?.communication_style || "empathetic");
  const [interestsStr, setInterestsStr] = useState(() =>
    authUser?.interests && authUser.interests.length > 0 ? authUser.interests.join(", ") : "Mindfulness, Focus"
  );
  const [goalsStr, setGoalsStr] = useState(() =>
    authUser?.goals && authUser.goals.length > 0 ? authUser.goals.join(", ") : "Cultivate daily calm"
  );
  const [saved, setSaved] = useState(false);

  // Voice Persona State
  const [activeVoice, setActiveVoice] = useState(voiceService.activeVoice);
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null);

  // Language State
  const [activeLang, setActiveLang] = useState<SupportedLanguage>(speechService.currentLanguage);

  useEffect(() => {
    if (effectiveUser) {
      if (effectiveUser.name) setName(effectiveUser.name);
      if (effectiveUser.email) setEmail(effectiveUser.email);
    }
  }, [effectiveUser]);

  const handleSaveProfile = async () => {
    const interests = interestsStr.split(",").map((i) => i.trim()).filter(Boolean);
    const goals = goalsStr.split(",").map((g) => g.trim()).filter(Boolean);

    try {
      await apiClient.patch("/api/v1/users/me", { name, communication_style: commStyle });
      await apiClient.put("/api/v1/users/me/interests", { interests });
      await apiClient.put("/api/v1/users/me/goals", { goals });
    } catch (e) {
      console.warn("Profile sync warning:", e);
    }

    updateUserLocally({ name, email, communication_style: commStyle, interests, goals });
    try {
      const savedUser = localStorage.getItem("aura_user");
      const updated = savedUser ? { ...JSON.parse(savedUser), name, email } : { name, email };
      localStorage.setItem("aura_user", JSON.stringify(updated));
    } catch {}

    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  const handlePreviewVoice = (vId: string, name: string) => {
    if (isPlayingPreview === vId) {
      voiceService.stop();
      setIsPlayingPreview(null);
    } else {
      setIsPlayingPreview(vId);
      voiceService.setVoice(vId);
      setActiveVoice(vId);
      voiceService.speak(`Hello! I am Aura, speaking with my ${name} voice persona.`);
      setTimeout(() => setIsPlayingPreview(null), 3500);
    }
  };

  const handleSelectLanguage = (code: SupportedLanguage) => {
    setActiveLang(code);
    speechService.setLanguage(code);
  };

  const avatarChar = (name || "F").charAt(0).toUpperCase();

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto custom-scrollbar select-none px-3 sm:px-6 py-4 pb-28">
      <div className="max-w-[880px] mx-auto flex flex-col gap-6">
        {/* ── Top Header ── */}
        <div>
          <h1 className="text-[26px] font-extrabold text-slate-900 dark:text-white m-0 tracking-tight">
            Settings & Preferences
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 m-0">
            Personalize your Aura companion profile, voice, and system behavior
          </p>
        </div>

        {/* ── Liquid Glass Tab Bar ── */}
        <div className="liquid-glass p-1 rounded-2xl flex flex-wrap gap-1">
          {[
            { id: "profile", label: "Profile", icon: UserIcon },
            { id: "appearance", label: "Appearance", icon: Sun },
            { id: "voice", label: "Voice", icon: Volume2 },
            { id: "language", label: "Language", icon: Globe },
            { id: "account", label: "Account", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border-none outline-none flex items-center gap-2 transition-all ${
                  isActive
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-slate-400 hover:text-white bg-transparent"
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab Content Panels ── */}
        <div className="liquid-card-opaque p-6 sm:p-8">
          {/* 1. Profile Tab */}
          {activeTab === "profile" && (
            <div className="flex flex-col gap-5">
              {/* User Avatar & Identity Header */}
              <div className="flex items-center gap-4 pb-5 border-b border-white/10 dark:border-white/5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)",
                    border: "2px solid rgba(255, 255, 255, 0.4)",
                  }}
                >
                  {avatarChar}
                </div>
                <div>
                  <h3 className="text-[17px] font-bold text-slate-900 dark:text-white m-0">
                    {name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 m-0">{email}</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                    Your Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="liquid-input w-full px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                    Email Address
                  </label>
                  <input
                    value={email}
                    disabled
                    className="liquid-input w-full px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400 outline-none opacity-70 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  Communication Style
                </label>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { id: "empathetic", label: "Warm & Empathetic", desc: "Compassionate, reflective" },
                    { id: "direct", label: "Direct & Analytical", desc: "Concise, clarity-focused" },
                    { id: "reflective", label: "Calm & Reflective", desc: "Mindful, exploratory" },
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setCommStyle(style.id)}
                      className={`liquid-card-subtle p-3.5 text-left border cursor-pointer transition-all ${
                        commStyle === style.id
                          ? "border-violet-500 bg-violet-500/10 text-violet-300"
                          : "border-transparent text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold block text-slate-900 dark:text-white">
                        {style.label}
                      </span>
                      <span className="text-[10.5px] mt-0.5 block opacity-75">{style.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  Personal Wellbeing Goals (comma-separated)
                </label>
                <input
                  value={goalsStr}
                  onChange={(e) => setGoalsStr(e.target.value)}
                  className="liquid-input w-full px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none"
                  placeholder="e.g. Cultivate peace, Better sleep, Focus"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  Focus Areas & Interests (comma-separated)
                </label>
                <input
                  value={interestsStr}
                  onChange={(e) => setInterestsStr(e.target.value)}
                  className="liquid-input w-full px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none"
                  placeholder="e.g. Mindfulness, Anxiety relief, Journaling"
                />
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10 dark:border-white/5">
                {saved && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check size={14} />
                    <span>Saved successfully!</span>
                  </span>
                )}
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveProfile}
                  className="liquid-button-primary px-6 py-2.5 text-xs gap-1.5"
                >
                  <Save size={14} />
                  <span>Save Preferences</span>
                </motion.button>
              </div>
            </div>
          )}

          {/* 2. Appearance Tab */}
          {activeTab === "appearance" && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  Theme Palette
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Choose between the dark indigo atmosphere or soft warm morning light
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <button
                    onClick={toggleTheme}
                    className={`liquid-card p-4 text-left border cursor-pointer transition-all ${
                      !isDark
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Sun size={18} className="text-amber-500" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Light Theme
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 m-0">
                      Soft warm white, pale lavender, mist blue, translucent glass
                    </p>
                  </button>

                  <button
                    onClick={toggleTheme}
                    className={`liquid-card p-4 text-left border cursor-pointer transition-all ${
                      isDark
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Moon size={18} className="text-violet-400" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Dark Theme
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 m-0">
                      Deep indigo #070914, electric violet, luminous blue light sources
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Voice Tab */}
          {activeTab === "voice" && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  Neural Voice Personas
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Select and preview the natural neural voice used by Aura in Voice and Face-to-Face consultations
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {CURATED_VOICES.map((v) => (
                  <div
                    key={v.id}
                    className={`liquid-card p-4 flex items-center justify-between border ${
                      activeVoice === v.id
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-transparent"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        {v.name}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {v.gender} • {v.accent}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePreviewVoice(v.id, v.name)}
                        className="w-8 h-8 rounded-full liquid-button text-violet-400"
                        title="Preview voice"
                      >
                        {isPlayingPreview === v.id ? <Square size={13} /> : <Play size={13} />}
                      </button>

                      <button
                        onClick={() => {
                          voiceService.setVoice(v.id);
                          setActiveVoice(v.id);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold cursor-pointer border-none ${
                          activeVoice === v.id
                            ? "bg-violet-600 text-white"
                            : "liquid-button text-slate-400"
                        }`}
                      >
                        {activeVoice === v.id ? "Active" : "Select"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Language Tab */}
          {activeTab === "language" && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  Spoken Language
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Select the primary language for voice recognition and natural conversation
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handleSelectLanguage(l.code)}
                    className={`liquid-card p-3.5 text-left flex items-center justify-between border cursor-pointer transition-all ${
                      activeLang === l.code
                        ? "border-violet-500 bg-violet-500/10 text-violet-300"
                        : "border-transparent text-slate-400 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{l.flag}</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {l.name}
                      </span>
                    </div>
                    {activeLang === l.code && <Check size={15} className="text-violet-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Account & Privacy Tab */}
          {activeTab === "account" && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  Account & Privacy Guard
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  Your emotional and wellbeing data is confidential and stored securely in local database records.
                </p>
              </div>

              <div className="liquid-card-subtle p-4 text-xs text-slate-300 leading-relaxed">
                <div className="flex items-center gap-2 font-bold text-violet-300 mb-1.5">
                  <Shield size={16} />
                  <span>Privacy First Guarantee</span>
                </div>
                Your conversations are never sold or used for public advertising. You retain full control over your cognitive memories and can delete them at any time from the Memory tab.
              </div>

              {onLogout && (
                <div className="pt-4 border-t border-white/10 dark:border-white/5 flex justify-end">
                  <button
                    onClick={onLogout}
                    className="liquid-button px-5 py-2.5 text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/15 gap-2"
                  >
                    <LogOut size={14} />
                    <span>Sign Out of Aura</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
