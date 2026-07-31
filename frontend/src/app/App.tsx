import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AuroraBackground } from "./components/aurora-background";
import { GlassNav } from "./components/glass-nav";
import { MusicPlayer } from "./components/music-player";
import { HomeScreen, ChatScreen, EmotionScreen, AnalyticsScreen, PlaceholderScreen } from "./components/screens";
import { FaceToFaceScreen } from "./components/FaceToFaceScreen";
import { MemoryScreen } from "./components/MemoryScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { DebugScreen } from "./components/DebugScreen";
import { VoiceScreen } from "./components/VoiceScreen";

export default function App() {
  const [active, setActive] = useState("Dashboard");

  const renderScreen = () => {
    switch (active) {
      case "Dashboard":
      case "Home":
        return <HomeScreen onStart={() => setActive("Face-to-Face")} />;
      case "Chat":
        return <ChatScreen />;
      case "Voice Mode":
        return <VoiceScreen />;
      case "Face-to-Face":
        return <FaceToFaceScreen />;
      case "Memory":
        return <MemoryScreen />;
      case "Profile":
        return <ProfileScreen />;
      case "Emotion":
        return <EmotionScreen />;
      case "Analytics":
        return <AnalyticsScreen />;
      case "Debug":
        return <DebugScreen />;
      case "Settings":
        return <ProfileScreen />;
      default:
        return <HomeScreen onStart={() => setActive("Face-to-Face")} />;
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif", color: "#25253c" }}>
      <AuroraBackground />
      <GlassNav active={active} onSelect={setActive} />

      <main className="mx-auto px-8 pt-36 pb-44" style={{ maxWidth: "min(1320px, 94vw)" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
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
    </div>
  );
}
