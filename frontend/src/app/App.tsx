import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ClaySidebar, ClayBottomNav } from "./components/ClaySidebar";
import { TopBar } from "./components/TopBar";
import { MusicPlayer } from "./components/music-player";
import { QuickActionsFAB } from "./components/quick-actions-fab";
import { AuthScreen } from "./components/AuthScreen";
import { OnboardingInterestsScreen } from "./components/OnboardingInterestsScreen";
import {
  HomeScreen,
  ChatScreen,
  EmotionScreen,
  PlaceholderScreen,
} from "./components/screens";
import { AnalyticsScreen } from "./components/AnalyticsScreen";
import { DebugScreen } from "./components/DebugScreen";
import { FaceToFaceScreen } from "./components/FaceToFaceScreen";
import { MemoryScreen } from "./components/MemoryScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { VoiceScreen } from "./components/VoiceScreen";
import { voiceService } from "./services/voiceService";

import { ThemeProvider, useTheme } from "./context/ThemeContext";

function MainApp() {
  const { isDark } = useTheme();
  const [active, setActive] = useState("Dashboard");
  const [user, setUser] = useState<{ name: string; email: string } | null>(() => {
    try {
      const saved = localStorage.getItem("aura_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    try {
      const savedUser = localStorage.getItem("aura_user");
      if (!savedUser) return false;
      const parsed = JSON.parse(savedUser);
      return (
        localStorage.getItem(`aura_onboarded_${parsed.email}`) === "true" ||
        localStorage.getItem("aura_onboarded") === "true"
      );
    } catch (e) {
      return false;
    }
  });

  const handleLoginSuccess = (userData: { name: string; email: string; isNewUser?: boolean }) => {
    setUser(userData);
    localStorage.setItem("aura_user", JSON.stringify(userData));

    // Sync user name dynamically with backend profile
    fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: userData.name }),
    }).catch(() => {});

    const wasOnboarded =
      !userData.isNewUser &&
      (localStorage.getItem(`aura_onboarded_${userData.email}`) === "true" ||
       localStorage.getItem("aura_onboarded") === "true");

    if (wasOnboarded) {
      setIsOnboarded(true);
      localStorage.setItem("aura_onboarded", "true");
      localStorage.setItem(`aura_onboarded_${userData.email}`, "true");
      setActive("Dashboard");
    } else {
      setIsOnboarded(false);
      localStorage.setItem("aura_onboarded", "false");
      setActive("Onboarding");
    }
  };

  const handleGuestAccess = () => {
    const guestUser = { name: "Guest User", email: "guest@aura.ai" };
    setUser(guestUser);
    setIsOnboarded(true);
    localStorage.setItem("aura_user", JSON.stringify(guestUser));
    localStorage.setItem("aura_onboarded", "true");
    localStorage.setItem("aura_onboarded_guest@aura.ai", "true");
    setActive("Dashboard");
  };

  const handleOnboardingComplete = (data: { interests: string[]; goals: string[]; communicationStyle: string }) => {
    setIsOnboarded(true);
    localStorage.setItem("aura_onboarded", "true");
    if (user?.email) {
      localStorage.setItem(`aura_onboarded_${user.email}`, "true");
    }
    localStorage.setItem("aura_user_interests", JSON.stringify(data.interests));
    localStorage.setItem("aura_user_style", data.communicationStyle);

    // Sync interests and communication style dynamically to backend
    fetch("/api/v1/users/me/interests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests: data.interests }),
    }).catch(() => {});

    fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communication_style: data.communicationStyle }),
    }).catch(() => {});

    setActive("Dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    setIsOnboarded(false);
    localStorage.removeItem("aura_user");
    localStorage.removeItem("aura_onboarded");
  };

  const handleNavigateScreen = (screenName: string) => {
    voiceService.stop();
    setActive(screenName);
  };

  useEffect(() => {
    // Whenever switching tabs or screens, immediately stop any playing voice
    voiceService.stop();
  }, [active]);

  const renderScreen = () => {
    if (!user) {
      return (
        <AuthScreen
          onLoginSuccess={handleLoginSuccess}
          onGuestAccess={handleGuestAccess}
        />
      );
    }

    if (!isOnboarded || active === "Onboarding") {
      return (
        <OnboardingInterestsScreen
          userName={user.name}
          isUpdateMode={false}
          onComplete={handleOnboardingComplete}
        />
      );
    }

    if (active === "Interests") {
      return (
        <OnboardingInterestsScreen
          userName={user.name}
          isUpdateMode={true}
          onComplete={handleOnboardingComplete}
        />
      );
    }

    switch (active) {
      case "Dashboard":
      case "Home":
        return <HomeScreen onStart={(scr) => setActive(scr || "Voice Mode")} onLogout={handleLogout} onNavigateToAuth={handleLogout} />;
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
      case "Debug":
        return <DebugScreen />;
      case "Settings":
        return <ProfileScreen onLogout={handleLogout} />;
      default:
        return <HomeScreen onStart={(scr) => setActive(scr || "Voice Mode")} onLogout={handleLogout} onNavigateToAuth={handleLogout} />;
    }
  };

  return (
    <div
      className="h-screen max-h-screen w-full flex overflow-hidden selection:bg-[#C7B5F3]/30 transition-colors duration-300"
      style={{
        background: isDark
          ? "linear-gradient(135deg, #12101B 0%, #171424 50%, #0E0C17 100%)"
          : "linear-gradient(135deg, #FBF4F0 0%, #F5ECE6 50%, #EDE1DB 100%)",
        color: isDark ? "#F3EFFC" : "#2E2544",
      }}
    >
      {user && isOnboarded && (
        <ClaySidebar
          active={active}
          onSelect={handleNavigateScreen}
          user={user}
          onLogout={handleLogout}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 p-2 sm:p-3 lg:p-3.5 pb-20 lg:pb-3.5 h-screen max-h-screen overflow-hidden justify-between">
        {user && isOnboarded && <TopBar />}

        <main className="flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden flex flex-col justify-between custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={user ? (isOnboarded ? active : "onboarding") : "auth"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full flex flex-col min-h-0"
              style={{ willChange: "transform, opacity" }}
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile & Tablet Bottom Navigation Bar */}
      {user && isOnboarded && (
        <ClayBottomNav active={active} onSelect={handleNavigateScreen} />
      )}

      {/* Music player is inlined on Chat page matching reference layout, and hidden on Dashboard */}
      {active !== "Dashboard" && active !== "Home" && active !== "Chat" && <MusicPlayer />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

