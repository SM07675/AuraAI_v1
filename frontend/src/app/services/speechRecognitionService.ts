/**
 * Continuous Resilient Speech Recognition (STT) Controller for Aura AI.
 * 
 * Features:
 * - Direct Web Audio AEC stream anchoring to keep hardware echo cancellation active
 * - Autonomous self-healing restart loop that never dies after turns/pauses
 * - Multilingual support: Hindi (hi-IN), Indian English / Hinglish (en-IN), US English (en-US)
 * - Multi-signal evaluation via duplexManager (VAD + Acoustic Echo Correlation + Phonetic Overlap)
 * - Safe lifecycle management with debounced restarts & error backoff
 */

import { voiceService } from "./voiceService";
import { duplexManager } from "./duplexManager";
import { audioEngine } from "./audioEngine";

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
  private speechStartTimestamp = 0;

  constructor() {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.isBrowserSupported = false;
      }

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

    voiceService.setLanguage(lang);

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

  public async start() {
    if (!this.isBrowserSupported) {
      this.notifyError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    // Anchor Web Audio AEC stream so hardware echo cancellation is permanently active
    await audioEngine.initMicrophonePipeline();

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
        this.recognition.onspeechstart = null;
        this.recognition.onspeechend = null;
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

      rec.onspeechstart = () => {
        this.speechStartTimestamp = Date.now();
        duplexManager.notifySpeechStart();
      };

      rec.onspeechend = () => {
        duplexManager.notifySpeechEnd();
      };

      rec.onresult = (event: any) => {
        const interimParts: string[] = [];
        const finalParts: string[] = [];
        let bestConf = 0.85;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript?.trim();
          if (item[0]?.confidence) {
            bestConf = item[0].confidence;
          }
          if (!text) continue;
          if (item.isFinal) {
            finalParts.push(text);
          } else {
            interimParts.push(text);
          }
        }

        // Browsers can return multiple finalized segments in one event. Joining them
        // explicitly prevents Hindi words from being accidentally concatenated.
        const interim = interimParts.join(" ");
        const final = finalParts.join(" ");
        const durationMs = this.speechStartTimestamp > 0 ? Date.now() - this.speechStartTimestamp : 200;
        const telem = audioEngine.getTelemetry();

        // 1. Process Interim Transcripts (for fast live typing & sub-200ms barge-in detection)
        if (interim) {
          const cleanInterim = interim.trim();
          if (cleanInterim) {
            const evalResult = duplexManager.evaluateSpeechEvent({
              transcript: cleanInterim,
              isFinal: false,
              confidence: bestConf,
              speechDurationMs: durationMs,
              vadEnergy: Math.min(1.0, telem.micRms / 0.05),
            });

            if (evalResult.decision === "PASS_THROUGH" || evalResult.decision === "USER_INTERRUPT") {
              this.notifyInterim(cleanInterim);
            }
          }
        }

        // 2. Process Final Transcripts (committed user turn)
        if (final) {
          const cleanFinal = final.trim();
          if (cleanFinal) {
            const evalResult = duplexManager.evaluateSpeechEvent({
              transcript: cleanFinal,
              isFinal: true,
              confidence: bestConf,
              speechDurationMs: durationMs,
              vadEnergy: Math.min(1.0, telem.micRms / 0.05),
            });

            if (evalResult.decision === "PASS_THROUGH" || evalResult.decision === "USER_INTERRUPT") {
              this.notifyFinal(cleanFinal);
              this.speechStartTimestamp = 0;
            }
          }
        }
      };

      rec.onerror = (event: any) => {
        const err = event.error;

        if (err === "no-speech" || err === "aborted") {
          return;
        }

        if (err === "not-allowed" || err === "service-not-allowed") {
          this.isListeningDesired = false;
          this.notifyListeningChange(false);
          this.notifyError("Microphone permission was denied. Please allow microphone access in browser settings.");
          return;
        }

        if (err === "network") {
          this.consecutiveErrors++;
          if (this.consecutiveErrors <= 2) {
            console.warn("[SPEECH SERVICE] SpeechRecognition network glitch, scheduling backoff retry...");
          }
          return;
        }

        console.warn("[SPEECH SERVICE] SpeechRecognition error:", err);
      };

      rec.onend = () => {
        this.isRecognizing = false;

        if (this.isListeningDesired) {
          const delay = this.consecutiveErrors > 0 ? Math.min(300 * this.consecutiveErrors, 1500) : 120;
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
      if (this.consecutiveErrors <= 2) {
        console.warn("[SPEECH SERVICE] SpeechRecognition initialization failed, retrying:", err);
      }
      if (this.isListeningDesired) {
        this.clearRestartTimer();
        this.restartTimeout = setTimeout(() => {
          if (this.isListeningDesired) {
            this.recreateAndStart();
          }
        }, 500);
      }
    }
  }
}

export const speechService = new SpeechRecognitionEngine();
