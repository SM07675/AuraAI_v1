import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, SkipBack, SkipForward, Volume2, Music, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const TRACKS = [
  {
    title: "Peaceful Mind",
    artist: "Aura · Ambient",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
    cover: "linear-gradient(135deg, #0284C7, #38BDF8)",
  },
  {
    title: "Ocean Waves & Chill",
    artist: "Aura · Lofi Meditation",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-amp-strings-10711.mp3",
    cover: "linear-gradient(135deg, #7A5AF8, #00D4FF)",
  },
  {
    title: "Aurora Focus Flow",
    artist: "Aura · Ambient Synth",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70514.mp3?filename=relaxing-light-background-116686.mp3",
    cover: "linear-gradient(135deg, #2458FF, #5EEAD4)",
  },
];

export function MusicPlayer() {
  const [tracks, setTracks] = useState(TRACKS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const [vol, setVol] = useState(70);
  const [toastMsg, setToastMsg] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscNodeRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const bars = Array.from({ length: 28 });
  const currentTrack = tracks[trackIdx] || TRACKS[0];

  // Fetch YouTube Music ambient tracks from backend
  useEffect(() => {
    fetch("/api/v1/music/ambient")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const loadedTracks = data.map((t: any, i: number) => ({
            title: t.title,
            artist: t.artist || "YouTube Music Ambient",
            url: t.stream_url || TRACKS[i % TRACKS.length].url,
            cover: TRACKS[i % TRACKS.length].cover,
          }));
          setTracks(loadedTracks);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize Audio Element
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.crossOrigin = "anonymous";
    audio.volume = vol / 100;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Update track source when trackIdx changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = currentTrack.url;
      if (isPlaying) {
        audioRef.current.play().catch(() => {
          // If network stream is blocked by CORS/offline, start Web Audio ambient synth fallback
          startAmbientSynth();
        });
      }
    }
  }, [trackIdx]);

  // Sync Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (vol / 100) * 0.15;
    }
  }, [vol]);

  // Web Audio Synth ambient fallback
  const startAmbientSynth = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }

      if (!oscNodeRef.current) {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(216, ctx.currentTime); // 432Hz ambient harmonic

        gain.gain.setValueAtTime((vol / 100) * 0.12, ctx.currentTime);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        oscNodeRef.current = osc;
        gainNodeRef.current = gain;
      }
    } catch (e) {}
  };

  const stopAmbientSynth = () => {
    try {
      if (oscNodeRef.current) {
        oscNodeRef.current.stop();
        oscNodeRef.current.disconnect();
        oscNodeRef.current = null;
      }
    } catch (e) {}
  };

  // Listen to Quick Actions "Play Music" custom event
  useEffect(() => {
    const handleMusicEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ play?: boolean }>;
      const forcePlay = customEvent.detail?.play;

      if (forcePlay || !isPlaying) {
        playMusic();
        showToast(`Playing "${currentTrack.title}"`);
      } else {
        pauseMusic();
        showToast("Background Music Paused");
      }
    };

    window.addEventListener("aura-toggle-music", handleMusicEvent);
    return () => {
      window.removeEventListener("aura-toggle-music", handleMusicEvent);
    };
  }, [isPlaying, currentTrack]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3200);
  };

  const playMusic = () => {
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.play().catch(() => {
        startAmbientSynth();
      });
    }
  };

  const pauseMusic = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopAmbientSynth();
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pauseMusic();
    } else {
      playMusic();
    }
  };

  const nextTrack = () => {
    const next = (trackIdx + 1) % TRACKS.length;
    setTrackIdx(next);
    showToast(`Switched to "${TRACKS[next].title}"`);
  };

  const prevTrack = () => {
    const prev = (trackIdx - 1 + TRACKS.length) % TRACKS.length;
    setTrackIdx(prev);
    showToast(`Switched to "${TRACKS[prev].title}"`);
  };

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
      style={{ width: "min(680px, 92vw)" }}
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: -45, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute left-1/2 -translate-x-1/2 top-0 liquid-glass rounded-full px-4 py-1.5 text-xs font-bold text-sky-900 shadow-md flex items-center gap-2 border border-sky-300/60 pointer-events-none whitespace-nowrap"
          >
            <Sparkles size={13} className="text-sky-500 animate-pulse" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="liquid-glass flex items-center gap-4 px-4 py-3 shadow-xl backdrop-blur-2xl"
        style={{ borderRadius: 28, background: "rgba(255, 255, 255, 0.65)", border: "1px solid rgba(255, 255, 255, 0.8)" }}
      >
        <div
          className="rounded-2xl shrink-0 grid place-items-center text-white shadow-sm"
          style={{ width: 48, height: 48, background: currentTrack.cover }}
        >
          <Music size={22} className={isPlaying ? "animate-bounce" : ""} />
        </div>

        <div className="shrink-0" style={{ minWidth: 120 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2740" }} className="truncate">
            {currentTrack.title}
          </div>
          <div style={{ fontSize: 12, color: "#5c5c78" }} className="truncate">
            {currentTrack.artist}
          </div>
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className="flex items-center gap-[3px] flex-1 h-8 overflow-hidden">
          {bars.map((_, i) => (
            <motion.div
              key={i}
              style={{ width: 3, borderRadius: 3, background: "linear-gradient(180deg,#2458FF,#00D4FF)" }}
              animate={
                isPlaying
                  ? { height: [6, 8 + Math.sin(i + Date.now() / 200) * 14 + Math.random() * 8, 6] }
                  : { height: 6 }
              }
              transition={
                isPlaying
                  ? { duration: 0.6 + (i % 5) * 0.1, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
            />
          ))}
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={prevTrack}
            title="Previous Track"
            className="p-1.5 text-[#4a4a68] hover:text-[#2458FF] transition-colors cursor-pointer"
          >
            <SkipBack size={18} />
          </button>

          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.85 }}
            onClick={togglePlayPause}
            title={isPlaying ? "Pause Music" : "Play Music"}
            transition={{ type: "spring", stiffness: 500, damping: 12 }}
            className="grid place-items-center rounded-full cursor-pointer shadow-md"
            style={{ width: 40, height: 40, background: "linear-gradient(135deg,#0284C7,#38BDF8)" }}
          >
            {isPlaying ? (
              <Pause size={18} color="#fff" fill="#fff" />
            ) : (
              <Play size={18} color="#fff" fill="#fff" className="ml-0.5" />
            )}
          </motion.button>

          <button
            onClick={nextTrack}
            title="Next Track"
            className="p-1.5 text-[#4a4a68] hover:text-[#2458FF] transition-colors cursor-pointer"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Volume Slider */}
        <div className="hidden sm:flex items-center gap-2 shrink-0" style={{ width: 110 }}>
          <Volume2 size={16} color="#717190" />
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => setVol(+e.target.value)}
            className="w-full accent-[#0284C7] cursor-pointer"
          />
        </div>
      </div>
    </motion.div>
  );
}
