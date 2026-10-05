import React, { useState, useEffect, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster, toast } from "sonner";
import { ClaySidebar, ClayBottomNav } from "./components/ClaySidebar";
import { TopBar } from "./components/TopBar";
import { AuthScreen } from "./components/AuthScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ClayPageSkeleton } from "./components/ClayPageSkeleton";
import { authService, AuthUser } from "./services/authService";
import { analytics } from "./services/analytics";
import { voiceService } from "./services/voiceService";
import { speechService } from "./services/speechRecognitionService";
import { streamingTtsService } from "./services/streamingTtsService";
import { duplexManager } from "./services/duplexManager";
import { PageTransition } from "./components/PageTransition";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { UserProvider } from "./context/UserContext";

// Eagerly loaded critical screens
import {
  HomeScreen,
  ChatScreen,
  EmotionScreen,
  PlaceholderScreen,
} from "./components/screens";

// Code-split heavy screens (drastically cuts initial JS bundle load)
const FaceToFaceScreen = lazy(() =>
  import("./components/FaceToFaceScreen").then((m) => ({ default: m.FaceToFaceScreen }))
);
const VoiceScreen = lazy(() =>
  import("./components/VoiceScreen").then((m) => ({ default: m.VoiceScreen }))
);
const AnalyticsScreen = lazy(() =>
  import("./components/AnalyticsScreen").then((m) => ({ default: m.AnalyticsScreen }))
);
const MemoryScreen = lazy(() =>
  import("./components/MemoryScreen").then((m) => ({ default: m.MemoryScreen }))
);
const ProfileScreen = lazy(() =>
  import("./components/ProfileScreen").then((m) => ({ default: m.ProfileScreen }))
);
const DebugScreen = lazy(() =>
  import("./components/DebugScreen").then((m) => ({ default: m.DebugScreen }))
);
const OnboardingInterestsScreen = lazy(() =>
  import("./components/OnboardingInterestsScreen").then((m) => ({
    default: m.OnboardingInterestsScreen,
  }))
);
const PrivacyPolicyScreen = lazy(() =>
  import("./components/PrivacyPolicyScreen").then((m) => ({
    default: m.PrivacyPolicyScreen,
  }))
);
const LandingPage = lazy(() =>
  import("./components/LandingPage").then((m) => ({ default: m.LandingPage }))
);

function MainApp() {
  const { isDark } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(() => {
    return authService.getUser();
  });
  const [active, setActive] = useState<string>(() => {
    return authService.getUser() ? "Dashboard" : "Landing";
  });
  const [initialChatQuery, setInitialChatQuery] = useState<string>("");

  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    try {
      const savedUser = authService.getUser();
      if (!savedUser) return false;
      return (
        localStorage.getItem(`aura_onboarded_${savedUser.email}`) === "true" ||
        localStorage.getItem("aura_onboarded") === "true"
      );
    } catch {
      return false;
    }
  });

  // 1. Consume Google OAuth redirect tokens on initial load
  useEffect(() => {
    const oauthUser = authService.checkOAuthRedirect();
    if (oauthUser) {
      handleLoginSuccess(oauthUser);
      toast.success(`Welcome, ${oauthUser.name}! Signed in with Google.`);
    }
  }, []);

  // 2. Dynamic document title per screen
  useEffect(() => {
    const SCREEN_TITLES: Record<string, string> = {
      Landing: "Aura AI • Multimodal Affective Wellness Companion",
      About: "About Aura AI • Vision & Architecture",
      Dashboard: "Dashboard • Aura AI",
      Home: "Dashboard • Aura AI",
      Chat: "Chat with Aura • Aura AI",
      "Voice Mode": "Voice Consultation • Aura AI",
      "Face-to-Face": "Face-to-Face Consultation • Aura AI",
      Memory: "Cognitive Memory • Aura AI",
      Emotion: "Emotion Insight • Aura AI",
      Analytics: "Affective Analytics • Aura AI",
      Debug: "System Telemetry • Aura AI",
      Profile: "User Profile • Aura AI",
      Settings: "Preferences • Aura AI",
      Privacy: "Privacy Policy & DPDP Rights • Aura AI",
      Onboarding: "Getting Started • Aura AI",
      Login: "Sign In • Aura AI",
      Register: "Create Account • Aura AI",
    };
    document.title = SCREEN_TITLES[active] || "Aura AI • Emotion-Aware Companion";
  }, [active]);

  // Stop any ongoing voice generation, speech recognition, and streaming audio on tab switch
  useEffect(() => {
    voiceService.stop();
    speechService.stop();
    streamingTtsService.cancel();
    duplexManager.stop();
  }, [active]);

  const handleLoginSuccess = (userData: AuthUser) => {
    setUser(userData);
    analytics.identify(userData.id, { name: userData.name, email: userData.email });

    // Sync profile name with backend
    authService.authFetch("/api/v1/users/me", {
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
    // Generate unique guest UUID to avoid database collision
    const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
    const guestEmail = `${guestId}@aura.local`;
    const guestUser: AuthUser = {
      id: guestId,
      name: "Guest Explorer",
      email: guestEmail,
      is_admin: false,
      auth_provider: "guest",
    };

    setUser(guestUser);
    setIsOnboarded(true);
    authService.setSession(guestUser, {
      access_token: `guest_token_${guestId}`,
      refresh_token: `guest_refresh_${guestId}`,
    });
    localStorage.setItem("aura_onboarded", "true");
    localStorage.setItem(`aura_onboarded_${guestEmail}`, "true");
    analytics.track("guest_access_started", { guest_id: guestId });
    setActive("Dashboard");
    toast.info("Browsing in Guest mode. Sign in anytime to preserve your memories.");
  };

  const handleOnboardingComplete = (data: {
    interests: string[];
    goals: string[];
    communicationStyle: string;
  }) => {
    setIsOnboarded(true);
    localStorage.setItem("aura_onboarded", "true");
    if (user?.email) {
      localStorage.setItem(`aura_onboarded_${user.email}`, "true");
    }
    localStorage.setItem("aura_user_interests", JSON.stringify(data.interests));
    localStorage.setItem("aura_user_style", data.communicationStyle);

    authService.authFetch("/api/v1/users/me/interests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests: data.interests }),
    }).catch(() => {});

    authService.authFetch("/api/v1/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communication_style: data.communicationStyle }),
    }).catch(() => {});

    analytics.track("onboarding_completed", { interests_count: data.interests.length });
    setActive("Dashboard");
  };

  const handleLogout = () => {
    analytics.reset();
    authService.clearSession();
    setUser(null);
    setIsOnboarded(false);
    toast.success("Signed out successfully.");
  };

  const handleNavigateScreen = (screenName: string) => {
    voiceService.stop();
    setActive(screenName);
  };

  const renderScreen = () => {
    if (!user) {
      if (active === "Privacy") {
        return <PrivacyPolicyScreen onBack={() => setActive("Landing")} />;
      }
      if (active === "Login" || active === "Register" || active === "Auth") {
        return (
          <AuthScreen
            initialMode={active === "Register" ? "signup" : "login"}
            onLoginSuccess={handleLoginSuccess}
            onGuestAccess={handleGuestAccess}
            onNavigateToPrivacy={() => setActive("Privacy")}
            onBackToLanding={() => setActive("Landing")}
          />
        );
      }
      return (
        <LandingPage
          isLoggedIn={false}
          onGetStarted={(mode) => setActive(mode === "register" ? "Register" : "Login")}
          onTryGuestDemo={handleGuestAccess}
          onNavigateToPrivacy={() => setActive("Privacy")}
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
      case "Landing":
      case "About":
        return (
          <LandingPage
            isLoggedIn={true}
            onEnterDashboard={() => setActive("Dashboard")}
            onGetStarted={() => setActive("Dashboard")}
            onTryGuestDemo={() => setActive("Dashboard")}
            onNavigateToPrivacy={() => setActive("Privacy")}
          />
        );
      case "Dashboard":
      case "Home":
        return (
          <HomeScreen
            onStart={(scr) => setActive(scr || "Voice Mode")}
            onLogout={handleLogout}
            onNavigateToAuth={handleLogout}
          />
        );
      case "Chat":
        return (
          <ChatScreen
            initialQuery={initialChatQuery}
            onClearInitialQuery={() => setInitialChatQuery("")}
          />
        );
      case "Voice Mode":
        return <VoiceScreen />;
      case "Face-to-Face":
        return <FaceToFaceScreen />;
      case "Memory":
        return <MemoryScreen />;
      case "Profile":
        return <ProfileScreen user={user} onLogout={handleLogout} />;
      case "Emotion":
        return <EmotionScreen />;
      case "Analytics":
        return <AnalyticsScreen />;
      case "Debug":
        // Admin-only gate
        if (!user.is_admin) {
          return (
            <div className="w-full h-full min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none">
              <div className="clay-card p-8 max-w-md w-full" style={{ borderRadius: 28 }}>
                <div className="text-3xl mb-3">🔒</div>
                <h2 className="text-[20px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] mb-2">
                  Admin Access Restricted
                </h2>
                <p className="text-[13px] text-[#7A748A] dark:text-[#9E98B4] leading-relaxed mb-6 font-medium">
                  The System Telemetry and FACS Debug HUD is reserved for authorized administrative accounts.
                </p>
                <button
                  onClick={() => setActive("Dashboard")}
                  className="clay-button py-2.5 px-6 rounded-full font-bold text-xs text-[#7B59DC] cursor-pointer border-none outline-none"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          );
        }
        return <DebugScreen />;
      case "Settings":
        return <ProfileScreen user={user} onLogout={handleLogout} />;
      case "Privacy":
        return <PrivacyPolicyScreen onBack={() => setActive("Dashboard")} />;
      default:
        return (
          <HomeScreen
            onStart={(scr) => setActive(scr || "Voice Mode")}
            onLogout={handleLogout}
            onNavigateToAuth={handleLogout}
          />
        );
    }
  };

  const isLandingView =
    active === "Landing" ||
    active === "About" ||
    (!user && active !== "Login" && active !== "Register" && active !== "Privacy");

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
      <Toaster position="top-right" richColors closeButton />

      {user && isOnboarded && active !== "Privacy" && !isLandingView && (
        <ClaySidebar
          active={active}
          onSelect={handleNavigateScreen}
          user={user}
          onLogout={handleLogout}
        />
      )}

      <div
        className={`flex-1 flex flex-col min-w-0 ${
          isLandingView || !user
            ? "p-0 pb-0 h-screen max-h-screen overflow-hidden"
            : "p-2 sm:p-3 lg:p-3.5 pb-20 lg:pb-3.5 h-screen max-h-screen overflow-hidden justify-between"
        }`}
      >
        {user && isOnboarded && active !== "Privacy" && !isLandingView && (
          <TopBar
            userName={user?.name}
            onSearch={(query) => {
              setInitialChatQuery(query);
              setActive("Chat");
            }}
            onAvatarClick={() => setActive("Settings")}
          />
        )}

        <main
          className={`flex-1 w-full min-h-0 ${
            isLandingView
              ? "h-full overflow-hidden p-0"
              : !user
              ? "h-full overflow-y-auto custom-scrollbar p-0"
              : "overflow-y-auto overflow-x-hidden flex flex-col justify-between custom-scrollbar"
          }`}
        >
          <ErrorBoundary>
            <Suspense fallback={<ClayPageSkeleton />}>
              <AnimatePresence mode="wait">
                <PageTransition key={user ? (isOnboarded ? active : "onboarding") : active}>
                  {renderScreen()}
                </PageTransition>
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile & Tablet Bottom Navigation Bar */}
      {user && isOnboarded && active !== "Privacy" && !isLandingView && (
        <ClayBottomNav active={active} onSelect={handleNavigateScreen} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <UserProvider>
          <MainApp />
        </UserProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

