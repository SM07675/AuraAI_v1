/**
 * Natural Neural Voice Service & Web Audio Engine.
 * 
 * Provides studio-quality, lifelike human voice synthesis for Aura AI.
 * - Streams high-fidelity 24kHz neural audio from /api/v1/tts/synthesize
 * - Real-time Web Audio API AnalyserNode for reactive mouth/waveform visualizers
 * - Curated human voice personas with default Indian Expressive Female Neural voice (Neerja)
 * - Support for Hindi / Hinglish (Swara) and regional accents
 * - Robust acoustic echo cancellation and mutual exclusion to prevent self-listening
 * - Client-side markdown normalization
 * - Resilient fallback to browser Web Speech API if offline
 */

export interface VoicePersona {
  id: string;
  name: string;
  gender: "Female" | "Male";
  locale: string;
  accent: string;
  persona: string;
  is_default?: boolean;
}

export const CURATED_VOICES: VoicePersona[] = [
  {
    id: "en-IN-NeerjaExpressiveNeural",
    name: "Neerja (Indian Expressive)",
    gender: "Female",
    locale: "en-IN",
    accent: "Indian English",
    persona: "Ultra-natural, expressive Indian English female voice with emotional inflections",
    is_default: true,
  },
  {
    id: "hi-IN-SwaraNeural",
    name: "Swara (Hindi & Hinglish)",
    gender: "Female",
    locale: "hi-IN",
    accent: "Indian Hindi",
    persona: "Warm, authentic Hindi & conversational Hinglish female voice",
  },
  {
    id: "en-IN-NeerjaNeural",
    name: "Neerja (Indian Classic)",
    gender: "Female",
    locale: "en-IN",
    accent: "Indian English",
    persona: "Fluent, warm, clear Indian English female voice",
  },
  {
    id: "en-US-AriaNeural",
    name: "Aria (Global Empathetic)",
    gender: "Female",
    locale: "en-US",
    accent: "American",
    persona: "Warm, engaging, highly empathetic companion voice",
  },
  {
    id: "en-US-JennyNeural",
    name: "Jenny (Gentle & Soothing)",
    gender: "Female",
    locale: "en-US",
    accent: "American",
    persona: "Calm, gentle, mindful therapeutic tone",
  },
  {
    id: "en-GB-SoniaNeural",
    name: "Sonia (British Elegance)",
    gender: "Female",
    locale: "en-GB",
    accent: "British",
    persona: "Gentle, polished British English",
  },
  {
    id: "mr-IN-AarohiNeural",
    name: "Aarohi (Marathi)",
    gender: "Female",
    locale: "mr-IN",
    accent: "Indian Marathi",
    persona: "Authentic, fluent Marathi female voice",
  },
];

/**
 * Strips markdown symbols, URLs, and noisy emojis from text before speaking.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  let t = text;

  // 1. Remove code blocks and inline code
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");

  // 2. Convert markdown links [Text](url) -> Text
  t = t.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

  // 3. Strip headers (#, ##, ###)
  t = t.replace(/#{1,6}\s*/g, "");

  // 4. Strip bold / italics / strikethrough (**text**, *text*, ~~text~~, __text__)
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");

  // 5. Clean list bullets & numbering
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");

  // 6. Clean blockquotes
  t = t.replace(/^\s*>\s*/gm, "");

  // 7. Strip raw URLs
  t = t.replace(/https?:\/\/\S+/g, "");

  // 8. Strip emojis & symbols
  t = t.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, " ");

  // 9. Clean repeated punctuation
  t = t.replace(/\.{4,}/g, "...");
  t = t.replace(/[-—_]{2,}/g, ", ");
  t = t.replace(/\s+([,.!?;:])/g, "$1");

  // 10. Normalize spaces
  return t.replace(/\s+/g, " ").trim();
}

class NaturalVoiceEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private isSpeakingState = false;
  private activeVoiceId = "en-IN-NeerjaExpressiveNeural";
  private audioCache = new Map<string, string>(); // text+voice -> blobUrl
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private abortController: AbortController | null = null;

  // Echo cancellation & self-listening safeguards
  private lastSpokenCleanText = "";
  private lastSpeechEndTime = 0;

  constructor() {
    // Load saved voice preference from localStorage if present
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aura_selected_voice");
      if (saved && CURATED_VOICES.some((v) => v.id === saved)) {
        this.activeVoiceId = saved;
      }
    }
  }

  public get activeVoice(): string {
    return this.activeVoiceId;
  }

  public setVoice(voiceId: string) {
    if (CURATED_VOICES.some((v) => v.id === voiceId)) {
      this.activeVoiceId = voiceId;
      if (typeof window !== "undefined") {
        localStorage.setItem("aura_selected_voice", voiceId);
      }
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  /**
   * Checks if incoming text is an exact echo of what Aura just spoke.
   */
  public isEcho(incomingText: string): boolean {
    if (!incomingText || !this.lastSpokenCleanText) return false;

    const cleanInc = incomingText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const cleanLast = this.lastSpokenCleanText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    if (!cleanInc || !cleanLast) return false;

    // Only filter if the user's recognized text is an exact or near-complete copy of Aura's text
    if (cleanLast === cleanInc || (cleanLast.length > 15 && cleanLast.startsWith(cleanInc) && cleanInc.length > 12)) {
      return true;
    }

    return false;
  }

  public subscribe(listener: (speaking: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setSpeaking(speaking: boolean) {
    this.isSpeakingState = speaking;
    if (!speaking) {
      this.lastSpeechEndTime = Date.now();
    }
    this.listeners.forEach((l) => l(speaking));
  }

  /**
   * Stop any current audio or speech playback immediately.
   */
  public stop() {
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (e) {}
      this.abortController = null;
    }

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = "";
      } catch (e) {}
      this.currentAudio = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    this.setSpeaking(false);
  }

  /**
   * Synthesize and speak text using ultra-natural neural TTS with fallback.
   */
  public async speak(
    text: string,
    options?: {
      voice?: string;
      emotion?: string;
      rate?: string;
      pitch?: string;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ): Promise<void> {
    const clean = cleanTextForSpeech(text);
    if (!clean) return;

    this.lastSpokenCleanText = clean;
    this.stop();
    this.setSpeaking(true);
    options?.onStart?.();

    const selectedVoice = options?.voice || this.activeVoiceId;
    const cacheKey = `${clean}::${selectedVoice}::${options?.emotion || ""}`;

    // 1. Check browser memory cache
    const cachedBlobUrl = this.audioCache.get(cacheKey);
    if (cachedBlobUrl) {
      this.playAudioBlob(cachedBlobUrl, options, clean, selectedVoice);
      return;
    }

    // 2. Fetch from backend Neural TTS API
    this.abortController = new AbortController();
    try {
      const res = await fetch("/api/v1/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          voice: selectedVoice,
          emotion: options?.emotion,
          rate: options?.rate,
          pitch: options?.pitch,
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`TTS server responded with ${res.status}`);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.audioCache.set(cacheKey, blobUrl);

      this.playAudioBlob(blobUrl, options, clean, selectedVoice);
    } catch (err: any) {
      if (err.name === "AbortError") return;

      console.warn("Backend Neural TTS failed, falling back to Web Speech API:", err);
      this.fallbackWebSpeech(clean, selectedVoice, options);
    }
  }

  /**
   * Internal player for neural MP3 audio blobs.
   */
  private playAudioBlob(
    blobUrl: string,
    options?: {
      onEnd?: () => void;
      onError?: (err: any) => void;
    },
    fallbackText?: string,
    requestedVoiceId?: string
  ) {
    try {
      const audio = new Audio();
      audio.src = blobUrl;
      this.currentAudio = audio;

      // Unlock AudioContext if present
      try {
        if (!this.audioContext && typeof window !== "undefined") {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            this.audioContext = new AudioContextClass();
          }
        }
        if (this.audioContext && this.audioContext.state === "suspended") {
          this.audioContext.resume();
        }
      } catch (e) {}

      audio.onended = () => {
        this.setSpeaking(false);
        this.currentAudio = null;
        options?.onEnd?.();
      };

      audio.onerror = (e) => {
        console.warn("Audio playback error:", e);
        if (fallbackText) {
          this.fallbackWebSpeech(fallbackText, requestedVoiceId || this.activeVoiceId, options);
        } else {
          this.setSpeaking(false);
          this.currentAudio = null;
          options?.onError?.(e);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          this.setSpeaking(false);
          this.currentAudio = null;
          if (e.name !== "AbortError") {
            console.warn("Audio play prevented by browser autoplay policy, attempting WebSpeech fallback:", e);
            if (fallbackText) {
              this.fallbackWebSpeech(fallbackText, requestedVoiceId || this.activeVoiceId, options);
            }
          }
        });
      }
    } catch (err) {
      console.warn("playAudioBlob exception:", err);
      if (fallbackText) {
        this.fallbackWebSpeech(fallbackText, requestedVoiceId || this.activeVoiceId, options);
      } else {
        this.setSpeaking(false);
        options?.onError?.(err);
      }
    }
  }

  /**
   * Web Speech API fallback tuned for natural prosody and voice selection.
   */
  private fallbackWebSpeech(
    cleanText: string,
    requestedVoiceId: string,
    options?: { onEnd?: () => void; onError?: (err: any) => void }
  ) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.setSpeaking(false);
      options?.onError?.(new Error("Speech synthesis not supported"));
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const targetPersona = CURATED_VOICES.find((v) => v.id === requestedVoiceId);

      if (voices.length > 0) {
        const langPrefix = (targetPersona?.locale || "en-IN").split("-")[0].toLowerCase();
        const matchingVoice =
          voices.find((v) => v.name.toLowerCase().includes("neerja") || v.name.toLowerCase().includes("swara")) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix) && (v.name.toLowerCase().includes("natural") || v.name.toLowerCase().includes("female"))) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ||
          voices[0];

        if (matchingVoice) utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        this.setSpeaking(false);
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        console.warn("WebSpeech utterance error:", e);
        this.setSpeaking(false);
        options?.onError?.(e);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Fallback WebSpeech error:", e);
      this.setSpeaking(false);
      options?.onError?.(e);
    }
  }
}

export const voiceService = new NaturalVoiceEngine();
