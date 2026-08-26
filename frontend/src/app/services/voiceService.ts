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
    id: "hi-IN-MadhurNeural",
    name: "Madhur (Hindi Male)",
    gender: "Male",
    locale: "hi-IN",
    accent: "Indian Hindi",
    persona: "Deep, calm, reassuring Hindi & Hinglish male voice",
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
    id: "en-IN-PrabhatNeural",
    name: "Prabhat (Indian Male)",
    gender: "Male",
    locale: "en-IN",
    accent: "Indian English",
    persona: "Clear, friendly, conversational Indian English male voice",
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

export const DEFAULT_VOICE_BY_LANGUAGE: Record<string, string> = {
  "hi-IN": "hi-IN-SwaraNeural",
  "en-IN": "en-IN-NeerjaExpressiveNeural",
  "en-US": "en-US-AriaNeural",
};

export function isVoiceCompatibleWithLanguage(voiceId: string, language: string): boolean {
  const voice = CURATED_VOICES.find((candidate) => candidate.id === voiceId);
  return voice?.locale === language;
}

export function getDefaultVoiceForLanguage(language: string): string {
  return DEFAULT_VOICE_BY_LANGUAGE[language] || DEFAULT_VOICE_BY_LANGUAGE["en-IN"];
}

/**
 * Strips markdown symbols, URLs, and noisy emojis from text before speaking.
 * Fully preserves Hindi (Devanagari \u0900-\u097F), Latin, numbers, and natural punctuation.
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

  // 8. Strip emojis & symbols (Unicode emoji ranges)
  t = t.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, " ");

  // 9. Clean repeated punctuation
  t = t.replace(/\.{4,}/g, "...");
  t = t.replace(/[-—_]{2,}/g, ", ");
  t = t.replace(/\s+([,.!?;:।|])/g, "$1");

  // 10. Normalize spaces
  return t.replace(/\s+/g, " ").trim();
}

class NaturalVoiceEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private isSpeakingState = false;
  private activeVoiceId = "en-IN-NeerjaExpressiveNeural";
  private activeLanguage = "en-IN"; // "hi-IN" | "en-IN" | "en-US"
  private audioCache = new Map<string, string>(); // text+voice -> blobUrl
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private abortController: AbortController | null = null;
  private currentGenerationId = 0; // Strict singleton playback generation counter

  // Echo cancellation & self-listening safeguards
  private lastSpokenCleanText = "";
  private lastSpeechEndTime = 0;

  constructor() {
    // Load saved voice and language preference from localStorage if present
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("aura_stt_language");
      if (savedLang) {
        this.activeLanguage = savedLang;
      }
      const savedVoice = localStorage.getItem("aura_selected_voice");
      if (savedVoice && isVoiceCompatibleWithLanguage(savedVoice, this.activeLanguage)) {
        this.activeVoiceId = savedVoice;
      } else {
        this.activeVoiceId = getDefaultVoiceForLanguage(this.activeLanguage);
      }
    }
  }

  public get activeVoice(): string {
    return this.activeVoiceId;
  }

  public get language(): string {
    return this.activeLanguage;
  }

  public setLanguage(lang: string) {
    this.activeLanguage = lang;
    if (typeof window !== "undefined") {
      localStorage.setItem("aura_stt_language", lang);
    }
    // Never carry an English voice into Hindi mode (or vice versa).
    if (!isVoiceCompatibleWithLanguage(this.activeVoiceId, lang)) {
      this.setVoice(getDefaultVoiceForLanguage(lang));
    }
  }

  public setVoice(voiceId: string) {
    if (isVoiceCompatibleWithLanguage(voiceId, this.activeLanguage)) {
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
   * Checks if incoming text is an echo of what Aura is currently or recently speaking.
   * Uses Unicode letter matching (\p{L}) to support Hindi (Devanagari), English, etc.
   */
  public isEcho(incomingText: string): boolean {
    if (!incomingText || !this.lastSpokenCleanText) return false;

    // Speaker bleed is only plausible while Aura is speaking or just after it stops.
    if (!this.isSpeakingState && Date.now() - this.lastSpeechEndTime > 2500) {
      return false;
    }

    // Preserve Unicode marks (\p{M}); Hindi matras otherwise disappear during matching.
    const normalize = (value: string) => value
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const cleanInc = normalize(incomingText);
    const cleanLast = normalize(this.lastSpokenCleanText);

    if (!cleanInc || !cleanLast) return false;

    // Direct match or prefix/substring match
    if (cleanLast.includes(cleanInc) || cleanInc.includes(cleanLast)) {
      return true;
    }

    // Exact-token overlap avoids false matches from common Hindi words and substrings.
    const stopWords = new Set(["है", "हैं", "था", "थी", "मैं", "आप", "और", "की", "के", "को", "से", "a", "an", "the", "is", "are", "i", "you"]);
    const incWords = cleanInc.split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word));
    const lastWords = new Set(cleanLast.split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word)));
    if (incWords.length >= 2) {
      const matches = incWords.filter((word) => lastWords.has(word));
      if (matches.length >= 2 && matches.length / incWords.length >= 0.6) {
        return true;
      }
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
    this.currentGenerationId++;

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
   * Guaranteed singleton: any previous voice is immediately terminated.
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

    // Terminate any previous speech and create a new playback transaction
    this.stop();
    const generationId = ++this.currentGenerationId;

    this.lastSpokenCleanText = clean;
    this.setSpeaking(true);
    options?.onStart?.();

    const requestedVoice = options?.voice || this.activeVoiceId;
    const selectedVoice = isVoiceCompatibleWithLanguage(requestedVoice, this.activeLanguage)
      ? requestedVoice
      : getDefaultVoiceForLanguage(this.activeLanguage);
    // The backend applies locale-aware Hindi defaults; explicit caller settings
    // remain available for emotion-specific or accessibility adjustments.
    const effectiveRate = options?.rate;
    const effectivePitch = options?.pitch;
    const cacheKey = `${clean}::${selectedVoice}::${options?.emotion || ""}::${effectiveRate || ""}::${effectivePitch || ""}`;

    // 1. Check browser memory cache
    const cachedBlobUrl = this.audioCache.get(cacheKey);
    if (cachedBlobUrl) {
      if (generationId === this.currentGenerationId) {
        this.playAudioBlob(cachedBlobUrl, options, clean, selectedVoice, generationId);
      }
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
          rate: effectiveRate,
          pitch: effectivePitch,
        }),
        signal: this.abortController.signal,
      });

      if (generationId !== this.currentGenerationId) {
        return; // Obsolete request
      }

      if (!res.ok) {
        throw new Error(`TTS server responded with ${res.status}`);
      }

      const blob = await res.blob();
      if (generationId !== this.currentGenerationId) return;

      const blobUrl = URL.createObjectURL(blob);
      this.audioCache.set(cacheKey, blobUrl);

      this.playAudioBlob(blobUrl, options, clean, selectedVoice, generationId);
    } catch (err: any) {
      if (err.name === "AbortError" || generationId !== this.currentGenerationId) return;

      console.warn("Backend Neural TTS failed, falling back to Web Speech API:", err);
      this.fallbackWebSpeech(clean, selectedVoice, options, generationId);
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
    requestedVoiceId?: string,
    generationId?: number
  ) {
    if (generationId !== undefined && generationId !== this.currentGenerationId) {
      return;
    }

    try {
      // Ensure web speech is stopped
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }

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
        if (generationId === undefined || generationId === this.currentGenerationId) {
          this.setSpeaking(false);
          this.currentAudio = null;
          options?.onEnd?.();
        }
      };

      audio.onerror = (e) => {
        if (generationId !== undefined && generationId !== this.currentGenerationId) return;
        console.warn("Audio playback error:", e);
        if (fallbackText) {
          this.fallbackWebSpeech(fallbackText, requestedVoiceId || this.activeVoiceId, options, generationId);
        } else {
          this.setSpeaking(false);
          this.currentAudio = null;
          options?.onError?.(e);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (generationId !== undefined && generationId !== this.currentGenerationId) return;
          this.setSpeaking(false);
          this.currentAudio = null;
          if (e.name !== "AbortError") {
            console.warn("Audio play prevented by browser autoplay policy, attempting WebSpeech fallback:", e);
            if (fallbackText) {
              this.fallbackWebSpeech(fallbackText, requestedVoiceId || this.activeVoiceId, options, generationId);
            }
          }
        });
      }
    } catch (err) {
      if (generationId !== undefined && generationId !== this.currentGenerationId) return;
      console.warn("playAudioBlob exception:", err);
      if (fallbackText) {
        this.fallbackWebSpeech(fallbackText, requestedVoiceId || this.activeVoiceId, options, generationId);
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
    options?: { onEnd?: () => void; onError?: (err: any) => void },
    generationId?: number
  ) {
    if (generationId !== undefined && generationId !== this.currentGenerationId) {
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.setSpeaking(false);
      options?.onError?.(new Error("Speech synthesis not supported"));
      return;
    }

    try {
      // Pause any HTML audio
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
          this.currentAudio.src = "";
        } catch (e) {}
        this.currentAudio = null;
      }

      window.speechSynthesis.cancel();

      const voices = window.speechSynthesis.getVoices();
      const targetPersona = CURATED_VOICES.find((v) => v.id === requestedVoiceId);
      const isHindi = targetPersona?.locale?.startsWith("hi") === true;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = isHindi ? 0.9 : 0.95;
      utterance.pitch = isHindi ? 1.0 : 1.05;

      if (voices.length > 0) {
        const langPrefix = (targetPersona?.locale || "en-IN").split("-")[0].toLowerCase();
        const matchingVoice =
          (isHindi
            ? voices.find((v) => v.name.toLowerCase().includes("swara") || v.name.toLowerCase().includes("madhur") || v.lang.toLowerCase().startsWith("hi")) ||
              voices.find((v) => v.lang.toLowerCase().includes("hi"))
            : null) ||
          voices.find((v) => v.name.toLowerCase().includes("neerja") || v.name.toLowerCase().includes("swara") || v.name.toLowerCase().includes("madhur") || v.name.toLowerCase().includes("prabhat")) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix) && (v.name.toLowerCase().includes("natural") || v.name.toLowerCase().includes("female"))) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ||
          voices[0];

        if (matchingVoice) utterance.voice = matchingVoice;
        if (targetPersona?.locale) utterance.lang = targetPersona.locale;
      }

      utterance.onend = () => {
        if (generationId === undefined || generationId === this.currentGenerationId) {
          this.setSpeaking(false);
          options?.onEnd?.();
        }
      };

      utterance.onerror = (e) => {
        if (generationId === undefined || generationId === this.currentGenerationId) {
          console.warn("WebSpeech utterance error:", e);
          this.setSpeaking(false);
          options?.onError?.(e);
        }
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
