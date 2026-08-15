import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AuroraBackground } from "./components/aurora-background";
import { GlassNav } from "./components/glass-nav";
import { MusicPlayer } from "./components/music-player";
import { QuickActionsFAB } from "./components/quick-actions-fab";
import { AuthScreen } from "./components/AuthScreen";
import { OnboardingInterestsScreen } from "./components/OnboardingInterestsScreen";
import { HomeScreen, ChatScreen, EmotionScreen, AnalyticsScreen, PlaceholderScreen } from "./components/screens";
import { FaceToFaceScreen } from "./components/FaceToFaceScreen";
import { MemoryScreen } from "./components/MemoryScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { DebugScreen } from "./components/DebugScreen";
import { VoiceScreen } from "./components/VoiceScreen";

export default function App() {
  const [active, setActive] = useState("Dashboard");
  const [user, setUser] = useState<{ name: string; email: string } | null>(() => {
    const saved = localStorage.getItem("aura_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    return localStorage.getItem("aura_onboarded") === "true";
  });

  const handleLoginSuccess = (userData: { name: string; email: string }) => {
    setUser(userData);
    localStorage.setItem("aura_user", JSON.stringify(userData));
  };

  const handleGuestAccess = () => {
    const guestUser = { name: "Hardik", email: "guest@aura.ai" };
    setUser(guestUser);
    localStorage.setItem("aura_user", JSON.stringify(guestUser));
  };

  const handleOnboardingComplete = (data: { interests: string[]; goals: string[]; communicationStyle: string }) => {
    setIsOnboarded(true);
    localStorage.setItem("aura_onboarded", "true");
    localStorage.setItem("aura_user_interests", JSON.stringify(data.interests));
    localStorage.setItem("aura_user_style", data.communicationStyle);
    setActive("Dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    setIsOnboarded(false);
    localStorage.removeItem("aura_user");
    localStorage.removeItem("aura_onboarded");
  };

  const renderScreen = () => {
    if (!user) {
      return (
        <AuthScreen
          onLoginSuccess={handleLoginSuccess}
          onGuestAccess={handleGuestAccess}
        />
      );
    }

    if (!isOnboarded || active === "Onboarding" || active === "Interests") {
      return (
        <OnboardingInterestsScreen
          userName={user.name}
          onComplete={handleOnboardingComplete}
        />
      );
    }

    switch (active) {
      case "Dashboard":
      case "Home":
        return <HomeScreen onStart={() => setActive("Face-to-Face")} onLogout={handleLogout} onNavigateToAuth={handleLogout} />;
      case "Chat":
        return <ChatScreen />;
      case "Voice Mode":
        return <VoiceScreen />;
      case "Face-to-Face":
        return <FaceToFaceScreen />;
      case "Memory":
        return <MemoryScreen />;
      case "Profile":
        return <ProfileScreen onLogout={handleLogout} />;
      case "Emotion":
        return <EmotionScreen />;
      case "Analytics":
        return <AnalyticsScreen />;
      case "Interests":
        return (
          <OnboardingInterestsScreen
            userName={user.name}
            onComplete={handleOnboardingComplete}
          />
        );
      case "Debug":
        return <DebugScreen />;
      case "Settings":
        return <ProfileScreen onLogout={handleLogout} />;
      default:
        return <HomeScreen onStart={() => setActive("Face-to-Face")} onLogout={handleLogout} onNavigateToAuth={handleLogout} />;
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif", color: "#25253c" }}>
      <AuroraBackground />
      {user && isOnboarded && (
        <GlassNav active={active} onSelect={setActive} user={user} onLogout={handleLogout} />
      )}

      <main className={`mx-auto px-8 ${user && isOnboarded ? "pt-36 pb-44" : "pt-12 pb-16"}`} style={{ maxWidth: "min(1320px, 94vw)" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={user ? (isOnboarded ? active : "onboarding") : "auth"}
            initial={{ opacity: 0, y: 28, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.99 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>
      </main>

      <MusicPlayer />
      {user && isOnboarded && (
        <QuickActionsFAB onNavigate={(screen) => setActive(screen)} />
      )}
    </div>
  );
}
