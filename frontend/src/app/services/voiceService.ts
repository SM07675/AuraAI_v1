/**
 * Natural Neural Voice Service & Web Audio Pipeline for Aura AI.
 * 
 * Target Interaction Quality: ChatGPT Voice & Gemini Live.
 * 
 * Features:
 * - High-fidelity 24kHz neural audio streaming from /api/v1/tts/synthesize
 * - Real-time Web Audio API routing with hardware AEC & smooth gain ducking
 * - Curated human voice personas with default ElevenLabs / Indian Expressive Neural voices
 * - Full Hindi (Devanagari \u0900-\u097F), Indian English (Hinglish), and US English support
 * - Generation ID tracking to eliminate race conditions and self-listening loops
 * - Resilient Web Speech API fallback
 */

import { duplexManager } from "./duplexManager";
import { audioEngine } from "./audioEngine";
import { streamingTtsService } from "./streamingTtsService";

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
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice (ElevenLabs Free - Best)",
    gender: "Female",
    locale: "en-US",
    accent: "Natural Multilingual",
    persona: "Clear, engaging, warm conversational voice (ElevenLabs Free)",
    is_default: true,
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah (ElevenLabs Free - Reassuring)",
    gender: "Female",
    locale: "en-US",
    accent: "Empathetic American",
    persona: "Mature, reassuring, empathetic counselor voice (ElevenLabs Free)",
  },
  {
    id: "en-US-AvaMultilingualNeural",
    name: "Ava (Natural Multilingual - Best)",
    gender: "Female",
    locale: "en-US",
    accent: "Multilingual (English + Hindi)",
    persona: "Ultra-natural, warm, highly expressive human voice supporting both English and Hindi",
  },
  {
    id: "en-US-EmmaMultilingualNeural",
    name: "Emma (Empathetic Multilingual)",
    gender: "Female",
    locale: "en-US",
    accent: "Multilingual (English + Hindi)",
    persona: "Gentle, soothing, conversational multilingual voice",
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
    id: "en-IN-NeerjaExpressiveNeural",
    name: "Neerja (Indian Expressive)",
    gender: "Female",
    locale: "en-IN",
    accent: "Indian English",
    persona: "Ultra-natural, expressive Indian English female voice with emotional inflections",
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
  t = t.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
    " "
  );

  // 9. Clean repeated punctuation & normalize Devanagari stops
  t = t.replace(/\.{4,}/g, "...");
  t = t.replace(/[-—_]{2,}/g, ", ");
  t = t.replace(/\s+([,.!?;:।|])/g, "$1");

  // 10. Normalize spaces
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Fast Devanagari-to-Latin phonetic converter for acoustic/text echo matching.
 * Converts "नमस्ते, मैं समझ सकती हूँ" -> "namaste main samajh sakti hoon"
 */
export function devanagariToLatin(text: string): string {
  if (!text) return "";

  // Common high-frequency keywords
  const directMap: Record<string, string> = {
    "नमस्ते": "namaste",
    "नमस्कार": "namaskar",
    "धन्यवाद": "dhanyawad",
    "शुक्रिया": "shukriya",
    "हाँ": "haan",
    "हां": "haan",
    "नहीं": "nahi",
    "ना": "na",
    "अच्छा": "achha",
    "ठीक": "theek",
    "है": "hai",
    "हैं": "hain",
    "हूँ": "hoon",
    "था": "tha",
    "थी": "thi",
    "थे": "the",
    "क्या": "kya",
    "क्यों": "kyun",
    "कैसे": "kaise",
    "कैसा": "kaisa",
    "कैसी": "kaisi",
    "आप": "aap",
    "तुम": "tum",
    "मैं": "main",
    "मुझे": "mujhe",
    "मेरा": "mera",
    "मेरी": "meri",
    "मेरे": "mere",
    "डॉक्टर": "doctor",
    "साहब": "sahab",
    "साहिबा": "sahiba",
    "सुनो": "suno",
    "सुनिए": "suniye",
    "रुको": "ruko",
    "रुकिए": "rukiye",
    "बताओ": "batao",
    "बताइए": "bataiye",
    "समझ": "samajh",
    "सकती": "sakti",
    "सकता": "sakta",
    "सकते": "sakte",
    "काउंसलिंग": "counseling",
    "योजना": "yojana",
    "तनाव": "tanav",
    "परेशान": "pareshan",
    "परेशानी": "pareshani",
    "महसूस": "mehsoos",
    "कर": "kar",
    "रहे": "rahe",
    "रही": "rahi",
    "रहा": "raha",
  };

  let t = text;
  for (const [hi, lat] of Object.entries(directMap)) {
    t = t.replaceAll(hi, " " + lat + " ");
  }

  const consonants: Record<string, string> = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy"
  };

  const vowels: Record<string, string> = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "अः": "ah"
  };

  const matras: Record<string, string> = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
    "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
    "ं": "n", "ँ": "n", "ः": "h", "्": ""
  };

  let out = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (matras[ch] !== undefined) {
      out += matras[ch];
    } else if (vowels[ch] !== undefined) {
      out += vowels[ch];
    } else if (consonants[ch] !== undefined) {
      const next = t[i + 1];
      if (next && (matras[next] !== undefined || next === "्")) {
        out += consonants[ch];
      } else {
        out += consonants[ch] + "a";
      }
    } else {
      out += ch;
    }
  }

  return out.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

class NaturalVoiceEngine {
  private activeVoiceId = "Xb7hH8MSUJpSbSDYk0k2";
  private activeLanguage = "en-IN"; // "hi-IN" | "en-IN" | "en-US"
  private audioCache = new Map<string, Blob>();
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private abortController: AbortController | null = null;
  private currentGenerationId = 0;
  private isSpeakingState = false;

  // Echo cancellation safeguards
  private lastSpokenCleanText = "";
  private lastSpokenCleanTranslit = "";
  private lastSpeechEndTime = 0;
  private lastSpokenWords: Set<string> = new Set();

  constructor() {
    duplexManager.onInterrupt(() => {
      this.stop();
    });

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

  public getActiveVoice(): string {
    return this.activeVoiceId;
  }

  public getVoiceList(): VoicePersona[] {
    return CURATED_VOICES;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public isEcho(incomingText: string): boolean {
    if (!incomingText || !this.lastSpokenCleanText) return false;

    // Speaker bleed is only plausible while Aura is speaking or within 2.5s window
    const isWithinEchoWindow =
      this.isSpeakingState || (this.lastSpeechEndTime > 0 && Date.now() - this.lastSpeechEndTime < 2500);
    if (!isWithinEchoWindow) return false;

    // Preserve Unicode marks (\p{M}); Hindi matras otherwise disappear during matching.
    const normalize = (value: string) => value
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const cleanInc = normalize(incomingText);
    const cleanLast = normalize(this.lastSpokenCleanText);
    const cleanTranslit = normalize(this.lastSpokenCleanTranslit || "");
    const incTranslit = normalize(devanagariToLatin(incomingText));

    if (!cleanInc) return false;

    // 1. Direct text / substring matching against raw or transliterated Hindi
    if (cleanLast && (cleanLast.includes(cleanInc) || cleanInc.includes(cleanLast))) return true;
    if (cleanTranslit && (cleanTranslit.includes(cleanInc) || cleanInc.includes(cleanTranslit))) return true;
    if (cleanTranslit && incTranslit && (cleanTranslit.includes(incTranslit) || incTranslit.includes(cleanTranslit))) return true;

    // 2. Token overlap check
    const stopWords = new Set(["है", "हैं", "था", "थी", "मैं", "आप", "और", "की", "के", "को", "से", "a", "an", "the", "is", "are", "i", "you"]);
    const incWords = cleanInc.split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word));
    const incTranslitWords = incTranslit.split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w));
    const allIncTokens = [...new Set([...incWords, ...incTranslitWords])];

    if (allIncTokens.length >= 1) {
      const matchCount = allIncTokens.filter((w) => this.lastSpokenWords.has(w)).length;
      if (allIncTokens.length === 1 && matchCount === 1) {
        return true;
      }
      if (matchCount >= 2 && matchCount / allIncTokens.length >= 0.5) {
        return true;
      }
    }

    return false;
  }

  public getLastSpeechEndTime(): number {
    return this.lastSpeechEndTime;
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
    streamingTtsService.cancel();

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (e) {}
      this.abortController = null;
    }

    audioEngine.stopAllPlaybackImmediate(15);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    this.setSpeaking(false);
    duplexManager.notifyTtsStopped();
  }

  /**
   * Synthesize and speak text using ultra-natural neural TTS.
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

    this.stop();
    const generationId = duplexManager.nextGeneration();
    this.currentGenerationId = generationId;

    this.lastSpokenCleanText = clean;
    const translit = devanagariToLatin(clean);
    this.lastSpokenCleanTranslit = translit;

    const rawWords = clean.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((w) => w.length > 1);
    const translitWords = translit.split(/\s+/).filter((w) => w.length > 1);
    this.lastSpokenWords = new Set([...rawWords, ...translitWords]);

    this.setSpeaking(true);
    duplexManager.notifyTtsStart(clean, "tts-" + generationId, generationId);
    options?.onStart?.();

    const requestedVoice = options?.voice || this.activeVoiceId;
    let selectedVoice = isVoiceCompatibleWithLanguage(requestedVoice, this.activeLanguage)
      ? requestedVoice
      : getDefaultVoiceForLanguage(this.activeLanguage);

    const isHindiText = /[\u0900-\u097F]/.test(clean);
    const isMale =
      selectedVoice.toLowerCase().includes("prabhat") ||
      selectedVoice.toLowerCase().includes("madhur") ||
      selectedVoice.toLowerCase().includes("male");

    if (isHindiText) {
      selectedVoice = isMale ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural";
    } else if (selectedVoice.startsWith("hi-IN-")) {
      selectedVoice = isMale ? "en-IN-PrabhatNeural" : "en-IN-NeerjaExpressiveNeural";
    }

    const rate = options?.rate || (isHindiText ? "+0%" : "+5%");
    const pitch = options?.pitch;
    const cacheKey = `${clean}::${selectedVoice}::${options?.emotion || ""}::${rate}::${pitch || ""}`;

    // 1. Check in-memory audio cache
    const cachedBlob = this.audioCache.get(cacheKey);
    if (cachedBlob) {
      if (generationId === this.currentGenerationId) {
        await this.playBlobDirect(cachedBlob, options, generationId);
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
          rate,
          pitch,
        }),
        signal: this.abortController.signal,
      });

      if (generationId !== this.currentGenerationId) return;
      if (!res.ok) throw new Error(`TTS server responded with ${res.status}`);

      const blob = await res.blob();
      if (generationId !== this.currentGenerationId) return;

      this.audioCache.set(cacheKey, blob);
      await this.playBlobDirect(blob, options, generationId);
    } catch (err: any) {
      if (err.name === "AbortError" || generationId !== this.currentGenerationId) return;
      console.warn("[VOICE SERVICE] Backend TTS error, falling back to Web Speech:", err);
      this.fallbackWebSpeech(clean, selectedVoice, options, generationId);
    }
  }

  private async playBlobDirect(
    blob: Blob,
    options?: { onEnd?: () => void; onError?: (err: any) => void },
    generationId?: number
  ) {
    if (generationId !== undefined && generationId !== this.currentGenerationId) return;

    try {
      await audioEngine.playAudioBlob(blob, {
        generationId,
        expectedGenerationGetter: () => this.currentGenerationId,
        onEnded: () => {
          if (generationId === undefined || generationId === this.currentGenerationId) {
            this.setSpeaking(false);
            if (generationId !== undefined) {
              duplexManager.notifyTtsEnd(generationId);
            }
            options?.onEnd?.();
          }
        },
      });
    } catch (e) {
      if (generationId === undefined || generationId === this.currentGenerationId) {
        this.setSpeaking(false);
        options?.onError?.(e);
      }
    }
  }

  private fallbackWebSpeech(
    cleanText: string,
    requestedVoiceId: string,
    options?: { onEnd?: () => void; onError?: (err: any) => void },
    generationId?: number
  ) {
    if (generationId !== undefined && generationId !== this.currentGenerationId) return;

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.setSpeaking(false);
      options?.onError?.(new Error("Speech synthesis not supported"));
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const voices = window.speechSynthesis.getVoices();
      const targetPersona = CURATED_VOICES.find((v) => v.id === requestedVoiceId);
      const isHindi = /[\u0900-\u097F]/.test(cleanText) || targetPersona?.locale?.startsWith("hi") === true;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = isHindi ? 0.9 : 0.95;
      utterance.pitch = isHindi ? 1.0 : 1.05;

      if (isHindi) {
        utterance.lang = "hi-IN";
      } else if (targetPersona?.locale) {
        utterance.lang = targetPersona.locale;
      }

      if (voices.length > 0) {
        const langPrefix = (isHindi ? "hi" : (targetPersona?.locale || "en-IN")).split("-")[0].toLowerCase();
        const matchingVoice =
          (isHindi
            ? voices.find(
                (v) =>
                  v.lang.toLowerCase().startsWith("hi") ||
                  v.name.toLowerCase().includes("swara") ||
                  v.name.toLowerCase().includes("madhur") ||
                  v.name.toLowerCase().includes("kalpana") ||
                  v.name.toLowerCase().includes("hemant") ||
                  v.name.toLowerCase().includes("hindi") ||
                  v.name.includes("हिन्दी")
              ) || voices.find((v) => v.lang.toLowerCase().includes("hi"))
            : null) ||
          voices.find(
            (v) =>
              v.name.toLowerCase().includes("neerja") ||
              v.name.toLowerCase().includes("swara") ||
              v.name.toLowerCase().includes("madhur") ||
              v.name.toLowerCase().includes("prabhat")
          ) ||
          voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith(langPrefix) &&
              (v.name.toLowerCase().includes("natural") || v.name.toLowerCase().includes("female"))
          ) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices[0];

        if (matchingVoice) utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        if (generationId === undefined || generationId === this.currentGenerationId) {
          this.setSpeaking(false);
          if (generationId !== undefined) {
            duplexManager.notifyTtsEnd(generationId);
          }
          options?.onEnd?.();
        }
      };

      utterance.onerror = (e) => {
        if (generationId === undefined || generationId === this.currentGenerationId) {
          this.setSpeaking(false);
          options?.onError?.(e);
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      this.setSpeaking(false);
      options?.onError?.(e);
    }
  }
}

export const voiceService = new NaturalVoiceEngine();
