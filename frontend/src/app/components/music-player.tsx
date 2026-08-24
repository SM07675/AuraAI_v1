import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, SkipBack, SkipForward, Volume2, Sparkles, ChevronUp, ChevronDown, Music2, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { ClayMusicTileIcon } from "./clay-icons";

const TRACKS = [
  {
    title: "Lofi Hip Hop Radio – Beats to Relax/Study to",
    artist: "Lofi Girl · Ambient",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
  },
  {
    title: "Peaceful Mind & Serene River",
    artist: "Aura · Lofi Meditation",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-amp-strings-10711.mp3",
  },
  {
    title: "Aurora Focus Flow",
    artist: "Aura · Ambient Synth",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70514.mp3?filename=relaxing-light-background-116686.mp3",
  },
];

interface MusicPlayerProps {
  variant?: "fixed" | "inline";
  className?: string;
  defaultExpanded?: boolean;
}

export function MusicPlayer({ variant = "fixed", className = "", defaultExpanded = false }: MusicPlayerProps) {
  const [tracks, setTracks] = useState(TRACKS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const [vol, setVol] = useState(70);
  const [toastMsg, setToastMsg] = useState("");
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [progress, setProgress] = useState(25);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscNodeRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const currentTrack = tracks[trackIdx] || TRACKS[0];

  // Fetch YouTube Music ambient tracks from backend if available
  useEffect(() => {
    fetch("/api/v1/music/ambient")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const loadedTracks = data.map((t: any, i: number) => ({
            title: t.title || TRACKS[i % TRACKS.length].title,
            artist: t.artist || "Lofi Girl · Ambient",
            url: t.stream_url || TRACKS[i % TRACKS.length].url,
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

  // Simulated progress update when playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 0.5));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Web Audio Synth ambient fallback
  const startAmbientSynth = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
        osc.frequency.setValueAtTime(216, ctx.currentTime);

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

  const togglePlayPause = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPlaying) {
      pauseMusic();
    } else {
      playMusic();
    }
  };

  const nextTrack = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = (trackIdx + 1) % tracks.length;
    setTrackIdx(next);
    setProgress(0);
    showToast(`Switched to "${tracks[next].title}"`);
  };

  const prevTrack = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const prev = (trackIdx - 1 + tracks.length) % tracks.length;
    setTrackIdx(prev);
    setProgress(0);
    showToast(`Switched to "${tracks[prev].title}"`);
  };

  // Outer placement wrapper
  const isFixed = variant === "fixed";
  const wrapperClasses = isFixed
    ? `fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 select-none ${className}`
    : `w-full select-none ${className}`;

  return (
    <div className={wrapperClasses}>
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: -45, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute right-0 -top-3 clay-pill px-3.5 py-1.5 text-xs font-bold text-[#2E2544] shadow-md flex items-center gap-2 pointer-events-none whitespace-nowrap z-50"
          >
            <Sparkles size={13} className="text-[#9E7EE6] animate-pulse" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="wait">
        {!isExpanded ? (
          /* ── COLLAPSED FLOATING CLAY PILL ── */
          <motion.div
            key="collapsed"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsExpanded(true)}
            className="clay-floating-music-pill flex items-center gap-2.5 px-3.5 py-2 cursor-pointer w-fit max-w-[340px]"
            title="Click to expand music player"
          >
            <div className="shrink-0">
              <ClayMusicTileIcon size={30} />
            </div>

            <div className="min-w-0 flex-1 pr-1">
              <div className="text-[12px] font-bold text-[#2E2544] dark:text-[#FFFFFF] truncate leading-tight">
                {currentTrack.title.replace(/ – .*/, "")}
              </div>
              <div className="text-[10.5px] text-[#777287] dark:text-[#9E98B4] font-semibold truncate mt-0.5">
                {isPlaying ? "Playing Lofi Ambient" : "Paused · Click to expand"}
              </div>
            </div>

            {/* Play/Pause Mini Button */}
            <motion.button
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.88 }}
              onClick={togglePlayPause}
              className="clay-music-play-btn w-7 h-7 flex items-center justify-center cursor-pointer border-none shrink-0"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause size={12} color="#FFFFFF" fill="#FFFFFF" />
              ) : (
                <Play size={12} color="#FFFFFF" fill="#FFFFFF" className="ml-0.5" />
              )}
            </motion.button>

            {/* Expand Indicator */}
            <div className="text-[#9E98AA] dark:text-[#8E88A4] hover:text-[#2E2544] dark:hover:text-[#FFFFFF] transition-colors p-0.5">
              <ChevronUp size={15} />
            </div>
          </motion.div>
        ) : (
          /* ── EXPANDED FLOATING CLAY MINI-PLAYER ── */
          <motion.div
            key="expanded"
            initial={{ scale: 0.92, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="clay-floating-music-expanded p-4 sm:p-4.5 w-[310px] sm:w-[360px] flex flex-col gap-3"
          >
            {/* Top Row: Track Metadata + Minimize Button */}
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <ClayMusicTileIcon size={38} />
                <div className="min-w-0 pr-1">
                  <div className="text-[12.5px] font-extrabold text-[#2E2544] dark:text-[#FFFFFF] truncate leading-tight tracking-tight">
                    {currentTrack.title}
                  </div>
                  <div className="text-[11px] text-[#777287] dark:text-[#9E98B4] font-semibold truncate mt-0.5">
                    {currentTrack.artist}
                  </div>
                </div>
              </div>

              {/* Collapse Button */}
              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className="w-7 h-7 rounded-full bg-[#FAF5F2] dark:bg-[#252136] hover:bg-[#F3EBE6] dark:hover:bg-[#302B45] text-[#777287] dark:text-[#9E98B4] hover:text-[#2E2544] dark:hover:text-[#FFFFFF] flex items-center justify-center border border-white/80 dark:border-white/10 shadow-sm cursor-pointer shrink-0 transition-colors"
                title="Minimize player"
              >
                <ChevronDown size={15} />
              </motion.button>
            </div>

            {/* Subtle Progress Bar */}
            <div className="w-full bg-[#E8DDD8] dark:bg-[#100E1A] h-1.5 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-[#C7B5F3] to-[#9E7EE6] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Controls Row: SkipBack / Play-Pause / SkipForward / Volume */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={prevTrack}
                  title="Previous Track"
                  className="p-1.5 text-[#777287] dark:text-[#9E98B4] hover:text-[#2E2544] dark:hover:text-[#FFFFFF] transition-colors cursor-pointer border-none bg-transparent flex items-center justify-center"
                >
                  <SkipBack size={16} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={togglePlayPause}
                  title={isPlaying ? "Pause Music" : "Play Music"}
                  className="clay-music-play-btn w-9 h-9 flex items-center justify-center cursor-pointer border-none shrink-0"
                >
                  {isPlaying ? (
                    <Pause size={15} color="#FFFFFF" fill="#FFFFFF" />
                  ) : (
                    <Play size={15} color="#FFFFFF" fill="#FFFFFF" className="ml-0.5" />
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.88 }}
                  onClick={nextTrack}
                  title="Next Track"
                  className="p-1.5 text-[#777287] dark:text-[#9E98B4] hover:text-[#2E2544] dark:hover:text-[#FFFFFF] transition-colors cursor-pointer border-none bg-transparent flex items-center justify-center"
                >
                  <SkipForward size={16} />
                </motion.button>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2">
                <Volume2 size={15} className="text-[#777287] dark:text-[#9E98B4]" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vol}
                  onChange={(e) => setVol(+e.target.value)}
                  className="clay-slider w-16 sm:w-20 cursor-pointer"
                  title={`Volume: ${vol}%`}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

