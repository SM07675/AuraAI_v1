/**
 * Continuous Resilient Speech Recognition (STT) Controller for Aura AI.
 * 
 * Solves the Web Speech API timeout & 3-turn drop-off issues:
 * - Autonomous self-healing restart loop that never dies after turns/pauses
 * - Multilingual support: Hindi (hi-IN), Indian English / Hinglish (en-IN), US English (en-US)
 * - Acoustic echo suppression with Unicode Devanagari awareness
 * - Safe lifecycle management with debounced restarts & error backoff
 */

import { voiceService } from "./voiceService";

export interface SpeechCallbacks {
  onInterim?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (error: string) => void;
  onListeningChange?: (listening: boolean) => void;
}

export type SupportedLanguage = "hi-IN" | "en-IN" | "en-US";

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  defaultVoice: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "hi-IN",
    name: "Hindi",
    nativeName: "हिन्दी",
    flag: "🇮🇳",
    defaultVoice: "hi-IN-SwaraNeural",
  },
  {
    code: "en-IN",
    name: "Indian English / Hinglish",
    nativeName: "English (India)",
    flag: "🇮🇳",
    defaultVoice: "en-IN-NeerjaExpressiveNeural",
  },
  {
    code: "en-US",
    name: "US English",
    nativeName: "English (US)",
    flag: "🇺🇸",
    defaultVoice: "en-US-AriaNeural",
  },
];

class SpeechRecognitionEngine {
  private recognition: any = null;
  private isListeningDesired = false;
  private isRecognizing = false;
  private language: SupportedLanguage = "en-IN";
  private listeners: Set<SpeechCallbacks> = new Set();
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
  private isBrowserSupported = true;

  constructor() {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.isBrowserSupported = false;
      }

      // Load persisted language
      const savedLang = localStorage.getItem("aura_stt_language") as SupportedLanguage;
      if (savedLang && SUPPORTED_LANGUAGES.some((l) => l.code === savedLang)) {
        this.language = savedLang;
      }
    }
  }

  public get isSupported(): boolean {
    return this.isBrowserSupported;
  }

  public get isListening(): boolean {
    return this.isListeningDesired;
  }

  public get currentLanguage(): SupportedLanguage {
    return this.language;
  }

  public setLanguage(lang: SupportedLanguage) {
    if (this.language === lang) return;
    this.language = lang;
    if (typeof window !== "undefined") {
      localStorage.setItem("aura_stt_language", lang);
    }

    // Sync with Voice Service for voice persona pairing
    voiceService.setLanguage(lang);

    // If currently running, cleanly restart with new language
    if (this.isListeningDesired) {
      this.recreateAndStart();
    }
  }

  public subscribe(callbacks: SpeechCallbacks): () => void {
    this.listeners.add(callbacks);
    return () => this.listeners.delete(callbacks);
  }

  private notifyInterim(text: string) {
    this.listeners.forEach((l) => l.onInterim?.(text));
  }

  private notifyFinal(text: string) {
    this.listeners.forEach((l) => l.onFinal?.(text));
  }

  private notifyError(error: string) {
    this.listeners.forEach((l) => l.onError?.(error));
  }

  private notifyListeningChange(listening: boolean) {
    this.listeners.forEach((l) => l.onListeningChange?.(listening));
  }

  public start() {
    if (!this.isBrowserSupported) {
      this.notifyError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    this.isListeningDesired = true;
    this.consecutiveErrors = 0;
    this.notifyListeningChange(true);
    this.recreateAndStart();
  }

  public stop() {
    this.isListeningDesired = false;
    this.clearRestartTimer();

    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }

    this.isRecognizing = false;
    this.notifyListeningChange(false);
  }

  public toggle() {
    if (this.isListeningDesired) {
      this.stop();
    } else {
      this.start();
    }
  }

  private clearRestartTimer() {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
  }

  private recreateAndStart() {
    this.clearRestartTimer();

    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Teardown previous instance cleanly
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = this.language;

      rec.onstart = () => {
        this.isRecognizing = true;
        this.consecutiveErrors = 0;
      };

      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        // Acoustic Echo & Mutual Exclusion Safeguard
        if (voiceService.isSpeaking()) {
          // If speech synthesis is playing, check if microphone heard Aura's own voice
          const candidate = (final || interim).trim();
          if (candidate && voiceService.isEcho(candidate)) {
            // Suppress echo
            return;
          }
          // If the user intentionally said something distinct with substance, stop Aura
          if (final.trim().length > 3 || (interim.trim().split(/\s+/).length >= 2 && !voiceService.isEcho(interim))) {
            voiceService.stop();
          } else {
            // Still potential speaker bleeding, ignore interim
            return;
          }
        }

        if (interim) {
          const cleanInterim = interim.trim();
          if (cleanInterim && !voiceService.isEcho(cleanInterim)) {
            this.notifyInterim(cleanInterim);
          }
        }

        if (final) {
          const cleanFinal = final.trim();
          if (cleanFinal && !voiceService.isEcho(cleanFinal)) {
            this.notifyFinal(cleanFinal);
          }
        }
      };

      rec.onerror = (event: any) => {
        const err = event.error;

        // Normal silence timeout between turns
        if (err === "no-speech") {
          return; // onend will handle smooth restart
        }

        if (err === "aborted") {
          return; // Intentional or browser reset, onend will restart if listening
        }

        if (err === "not-allowed" || err === "service-not-allowed") {
          this.isListeningDesired = false;
          this.notifyListeningChange(false);
          this.notifyError("Microphone permission was denied. Please allow microphone access in browser settings.");
          return;
        }

        if (err === "network") {
          this.consecutiveErrors++;
          console.warn("SpeechRecognition network glitch, scheduling backoff retry...");
          return;
        }

        console.warn("SpeechRecognition error:", err);
      };

      rec.onend = () => {
        this.isRecognizing = false;

        // If user wants to keep listening, schedule an immediate resilient restart
        if (this.isListeningDesired) {
          const delay = this.consecutiveErrors > 0 ? Math.min(300 * this.consecutiveErrors, 1500) : 150;
          this.clearRestartTimer();
          this.restartTimeout = setTimeout(() => {
            if (this.isListeningDesired) {
              this.recreateAndStart();
            }
          }, delay);
        }
      };

      this.recognition = rec;
      rec.start();
    } catch (err: any) {
      console.warn("SpeechRecognition initialization failed, retrying:", err);
      if (this.isListeningDesired) {
        this.clearRestartTimer();
        this.restartTimeout = setTimeout(() => {
          if (this.isListeningDesired) {
            this.recreateAndStart();
          }
        }, 400);
      }
    }
  }
}

export const speechService = new SpeechRecognitionEngine();
