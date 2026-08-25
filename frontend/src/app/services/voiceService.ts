/**
 * Natural Neural Voice Service & Web Audio Engine.
 * 
 * Provides studio-quality, lifelike human voice synthesis for Aura AI.
 * - Streams high-fidelity 24kHz neural audio from /api/v1/tts/synthesize
 * - Real-time Web Audio API AnalyserNode for reactive mouth/waveform visualizers
 * - Curated human voice personas (Warm, Gentle, Mindful, Confident, British, etc.)
 * - Emotion-aware prosody and speech rate modulation
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
    id: "en-US-AriaNeural",
    name: "Aura (Warm & Empathetic)",
    gender: "Female",
    locale: "en-US",
    accent: "American",
    persona: "Warm, engaging, highly empathetic companion voice",
    is_default: true,
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
    id: "en-US-AvaMultilingualNeural",
    name: "Ava (Modern & Expressive)",
    gender: "Female",
    locale: "en-US",
    accent: "American",
    persona: "Natural, dynamic, lifelike modern voice",
  },
  {
    id: "en-US-EmmaNeural",
    name: "Emma (Patient Guide)",
    gender: "Female",
    locale: "en-US",
    accent: "American",
    persona: "Supportive, clear, encouraging guide",
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy (Confident & Reassuring)",
    gender: "Male",
    locale: "en-US",
    accent: "American",
    persona: "Deep, natural, reassuring male companion",
  },
  {
    id: "en-US-AndrewMultilingualNeural",
    name: "Andrew (Warm & Friendly)",
    gender: "Male",
    locale: "en-US",
    accent: "American",
    persona: "Conversational, articulate, friendly male voice",
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
    id: "en-AU-NatashaNeural",
    name: "Natasha (Australian Warmth)",
    gender: "Female",
    locale: "en-AU",
    accent: "Australian",
    persona: "Relaxed, natural Australian English",
  },
  {
    id: "en-IN-NeerjaNeural",
    name: "Neerja (Indian English)",
    gender: "Female",
    locale: "en-IN",
    accent: "Indian",
    persona: "Fluent, warm Indian English voice",
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
  private analyser: AnalyserNode | null = null;
  private audioSourceNode: MediaElementAudioSourceNode | null = null;
  private isSpeakingState = false;
  private activeVoiceId = "en-US-AriaNeural";
  private audioCache = new Map<string, string>(); // text+voice -> blobUrl
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private abortController: AbortController | null = null;

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

  public subscribe(listener: (speaking: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setSpeaking(speaking: boolean) {
    this.isSpeakingState = speaking;
    this.listeners.forEach((l) => l(speaking));
  }

  /**
   * Stop any current audio or speech playback immediately.
   */
  public stop() {
    if (this.abortController) {
      this.abortController.abort();
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

    this.stop();
    this.setSpeaking(true);
    options?.onStart?.();

    const selectedVoice = options?.voice || this.activeVoiceId;
    const cacheKey = `${clean}::${selectedVoice}::${options?.emotion || ""}`;

    // 1. Check browser memory cache
    const cachedBlobUrl = this.audioCache.get(cacheKey);
    if (cachedBlobUrl) {
      this.playAudioBlob(cachedBlobUrl, options);
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

      this.playAudioBlob(blobUrl, options);
    } catch (err: any) {
      if (err.name === "AbortError") return;

      console.warn("Backend Neural TTS failed, falling back to Web Speech API:", err);
      this.fallbackWebSpeech(clean, selectedVoice, options);
    }
  }

  /**
   * Internal player for neural MP3 audio blobs with Web Audio analyzer.
   */
  private playAudioBlob(
    blobUrl: string,
    options?: {
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ) {
    try {
      const audio = new Audio();
      audio.src = blobUrl;
      audio.crossOrigin = "anonymous";
      this.currentAudio = audio;

      // Connect Web Audio API Analyser
      try {
        if (!this.audioContext) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            this.audioContext = new AudioContextClass();
          }
        }
        if (this.audioContext && this.audioContext.state === "suspended") {
          this.audioContext.resume();
        }
        if (this.audioContext && !this.analyser) {
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
        }
        if (this.audioContext && this.analyser) {
          this.audioSourceNode = this.audioContext.createMediaElementSource(audio);
          this.audioSourceNode.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
        }
      } catch (e) {
        // Fallback to standard audio playback if audio node routing is restricted
      }

      audio.onended = () => {
        this.setSpeaking(false);
        this.currentAudio = null;
        options?.onEnd?.();
      };

      audio.onerror = (e) => {
        console.warn("Audio playback error:", e);
        this.setSpeaking(false);
        this.currentAudio = null;
        options?.onError?.(e);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          if (e.name !== "AbortError") {
            console.warn("Audio play prevented by browser autoplay policy:", e);
            this.setSpeaking(false);
          }
        });
      }
    } catch (err) {
      console.warn("playAudioBlob exception:", err);
      this.setSpeaking(false);
      options?.onError?.(err);
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
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.98; // Human conversational pacing
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      // Select best available natural online / enhanced browser voice
      const naturalVoice =
        voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Online") || v.name.includes("Neural"))) ||
        voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Aria") || v.name.includes("Jenny"))) ||
        voices.find((v) => v.lang.startsWith("en") && v.name.includes("Female")) ||
        voices.find((v) => v.lang.startsWith("en"));

      if (naturalVoice) utterance.voice = naturalVoice;

      utterance.onend = () => {
        this.setSpeaking(false);
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        this.setSpeaking(false);
        options?.onError?.(e);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Web Speech API exception:", e);
      this.setSpeaking(false);
      options?.onError?.(e);
    }
  }

  /**
   * Get audio frequency level (0 to 1) for live mouth and waveform animations.
   */
  public getAudioLevel(): number {
    if (!this.isSpeakingState || !this.analyser) {
      return this.isSpeakingState ? 0.6 : 0;
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    return Math.min(1, avg / 128);
  }
}

export const voiceService = new NaturalVoiceEngine();
