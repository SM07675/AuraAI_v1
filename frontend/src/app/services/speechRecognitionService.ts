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

export const SESSION_CLOSING_PHRASES = [
  "close today's session",
  "close the session",
  "close session",
  "end today's session",
  "end the session",
  "end session",
  "end this session",
  "end the conversation",
  "end conversation",
  "end this conversation",
  "close the conversation",
  "close conversation",
  "close this conversation",
  "stop the conversation",
  "stop conversation",
  "finish the conversation",
  "finish conversation",
  "wrap up the conversation",
  "wrap up the session",
  "wrap up today's session",
  "wrap up",
  "wrap it up",
  "goodbye",
  "bye",
  "bye bye",
  "that's all for today",
  "thats all for today",
  "that is all for today",
  "that's it for today",
  "thats it for today",
  "that is it for today",
  "that will be all for today",
  "that'll be all for today",
  "that will be all",
  "that'll be all",
  "nothing more for today",
  "nothing else for today",
  "no more for today",
  "nothing more",
  "feeling alright now we can close",
  "feeling alright now",
  "feeling better now",
  "feeling good now",
  "we can stop here",
  "we can end here",
  "we can wrap up here",
  "talk to you later",
  "see you later",
  "see you next time",
  "done for today",
  "done for now",
  "stop today",
  "all good for now",
  "i have to go",
  "gotta go",
  "need to go",
  "sign off",
  "session close",
  "session end",
  "end chat",
  "close chat",
  "stop chat",
  "alvida",
  "chalta hoon",
  "chalti hoon",
  "aaj ke liye itna hi",
  "aaj ke liye bas",
  "bas aaj ke liye",
];

/**
 * Wispr Flow-inspired Automatic Filler Word Removal.
 * Filters out hesitation markers, thinking-out-loud sounds, and stutter fillers.
 */
export function removeFillerWords(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // 1. Remove isolated English vocal fillers: um, uh, ah, er, erm
  cleaned = cleaned.replace(/\b(um+|uh+|er+|ah+|erm+)\b/gi, "");

  // 2. Remove conversational fillers when isolated by commas or at start/end
  cleaned = cleaned.replace(/^\s*(?:like|you know|i mean|so yeah|well)\s*,\s*/gi, "");
  cleaned = cleaned.replace(/,\s*(?:like|you know|i mean)\s*,/gi, ", ");
  cleaned = cleaned.replace(/,\s*(?:like|you know|i mean)\s*$/gi, "");

  // 3. Remove Hindi / Hinglish fillers
  cleaned = cleaned.replace(/\b(मतलब|मतलब कि|यार|समझे|है ना)\b/gi, "");
  cleaned = cleaned.replace(/\b(matlab(\s+ki)?|yaar|samjhe|hain\s+na|achha\s+toh)\b/gi, "");

  // 4. Collapse extra spaces and clean dangling punctuation
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  cleaned = cleaned.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();

  return cleaned;
}

/**
 * Wispr Flow-inspired Smart "Course Correction" & Backtracking.
 * Handles mid-sentence self-corrections, stutters, and false starts.
 * E.g., "Let's meet at 2... actually, make that 3 PM" -> "Let's meet at 3 PM".
 */
export function applyCourseCorrection(text: string): string {
  if (!text) return "";
  let result = text.trim();

  // 1. Stutter removal: duplicate adjacent words (e.g. "I I was" -> "I was", "at at" -> "at")
  result = result.replace(/\b(\w+)\s+\1\b/gi, "$1");
  result = result.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // 2. Discard clauses before "scratch that" / "never mind that" / "forget that"
  const scratchMatch = result.match(/^(?:.*?[,.;\s]+)?(?:scratch that|never mind that|forget that)[,.;\s]+(.*)$/i);
  if (scratchMatch && scratchMatch[1]?.trim()) {
    return scratchMatch[1].trim();
  }

  // 3. "actually, make that [X]" or "make that [X]" course corrections
  const makeThatMatch = result.match(/^(.*?)(?:,\s*|\s+)?(?:\.{2,3}\s*)?(?:actually,?\s+)?make\s+that\s+(.*)$/i);
  if (makeThatMatch) {
    const prefix = makeThatMatch[1].trim();
    const replacement = makeThatMatch[2].trim();
    if (replacement) {
      if (prefix) {
        // If prefix has a preposition tail, e.g. "Let's meet at 2" -> "Let's meet at 3 PM"
        const prepMatch = prefix.match(/^(.*?\b(?:at|for|to|on|in|with|about)\s+)([^,.]+)$/i);
        if (prepMatch) {
          const prepPrefix = prepMatch[1];
          const repFirstWord = replacement.split(/\s+/)[0].toLowerCase();
          const lastPrep = prepPrefix.trim().split(/\s+/).pop()?.toLowerCase();
          if (repFirstWord === lastPrep) {
            return `${prepMatch[1].slice(0, -repFirstWord.length).trim()} ${replacement}`.trim();
          }
          return `${prepPrefix}${replacement}`.trim();
        }

        // Check if prefix ends with an entity / object, e.g. "I want tea... make that coffee"
        const verbMatch = prefix.match(/^(.*?\b(?:want|need|have|get|take|buy|book)\s+(?:a|an|the)?\s*)([^,.]+)$/i);
        if (verbMatch) {
          return `${verbMatch[1]}${replacement}`.trim();
        }

        return replacement;
      }
      return replacement;
    }
  }

  // 4. "actually, [X]" or "no wait, [X]" or "wait no, [X]" or "i mean, [X]"
  const correctionMarkers = result.match(/^(.*?)[,.\s]+(?:\.{2,3}\s*)?(?:actually|no wait|wait no|i mean|rather|nahi|mera matlab)[,.\s]+(.*)$/i);
  if (correctionMarkers) {
    const prefix = correctionMarkers[1].trim();
    const replacement = correctionMarkers[2].trim();
    if (replacement) {
      const prepMatch = prefix.match(/^(.*?\b(?:at|for|to|on|in)\s+)[^,.]+$/i);
      if (prepMatch) {
        return `${prepMatch[1]}${replacement}`.trim();
      }
      if (prefix.split(/\s+/).length <= 4) {
        return replacement;
      }
      if (replacement.length > prefix.length * 0.7) {
        return replacement;
      }
    }
  }

  return result;
}

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
  private isPushToTalkMode = false;
  private isPushToTalkActive = false;
  private lastRecoverableDraft: string | null = null;
  private pttReleaseTimer: ReturnType<typeof setTimeout> | null = null;

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

      const savedPtt = localStorage.getItem("aura_stt_ptt_mode");
      if (savedPtt === "true") {
        this.isPushToTalkMode = true;
      }

      window.addEventListener("online", () => {
        if (this.isListeningDesired && !this.isRecognizing) {
          console.log("[SPEECH SERVICE] Network restored, re-initializing speech recognition...");
          this.consecutiveErrors = 0;
          this.recreateAndStart();
        }
      });
      window.addEventListener("offline", () => {
        if (this.isListeningDesired) {
          console.warn("[SPEECH SERVICE] Network connection lost.");
          this.notifyError("You are offline. Speech recognition requires an active internet connection.");
        }
      });
    }

    duplexManager.onInterrupt(() => {
      // If user barge-in interrupted playback, retain user speech draft
    });
  }

  private isBraveBrowser(): boolean {
    if (typeof window === "undefined") return false;
    return (
      typeof (navigator as any).brave !== "undefined" &&
      typeof (navigator as any).brave?.isBrave === "function"
    );
  }

  public get isSupported(): boolean {
    return this.isBrowserSupported;
  }

  public get isListening(): boolean {
    return this.isListeningDesired;
  }

  public get isPushToTalk(): boolean {
    return this.isPushToTalkMode;
  }

  public setPushToTalkMode(enabled: boolean) {
    this.isPushToTalkMode = enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem("aura_stt_ptt_mode", enabled ? "true" : "false");
    }
    if (!enabled) {
      this.isPushToTalkActive = false;
    }
  }

  public get isPttActive(): boolean {
    return this.isPushToTalkActive;
  }

  public setPushToTalkActive(active: boolean) {
    if (!this.isPushToTalkMode) return;
    this.isPushToTalkActive = active;
    if (active) {
      if (this.pttReleaseTimer) {
        clearTimeout(this.pttReleaseTimer);
        this.pttReleaseTimer = null;
      }
      this.speechStartTimestamp = Date.now();
      duplexManager.notifySpeechStart();
    } else {
      this.pttReleaseTimer = setTimeout(() => {
        this.pttReleaseTimer = null;
        if (this.lastRecoverableDraft) {
          const finalCandidate = this.cleanAndCorrect(this.lastRecoverableDraft);
          if (finalCandidate) {
            this.notifyFinal(finalCandidate);
          }
          this.lastRecoverableDraft = null;
        }
        duplexManager.notifySpeechEnd();
      }, 150);
    }
  }

  public getRecoverableDraft(): string | null {
    return this.lastRecoverableDraft;
  }

  public clearRecoverableDraft() {
    this.lastRecoverableDraft = null;
  }

  public setRecoverableDraft(draft: string) {
    this.lastRecoverableDraft = draft;
  }

  public cleanAndCorrect(rawText: string): string {
    const withoutFillers = removeFillerWords(rawText);
    const corrected = applyCourseCorrection(withoutFillers);
    return corrected.trim();
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

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.notifyError("You are currently offline. Voice recognition requires an active internet connection.");
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
    audioEngine.stopMicrophonePipeline();
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
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = this.language;

      let sessionHadError = false;

      rec.onstart = () => {
        this.isRecognizing = true;
        // Do not reset consecutiveErrors here: Chromium fires onstart locally before
        // the cloud speech endpoint handshake completes.
      };

      rec.onspeechstart = () => {
        this.speechStartTimestamp = Date.now();
        duplexManager.notifySpeechStart();
      };

      rec.onspeechend = () => {
        duplexManager.notifySpeechEnd();
      };

      rec.onresult = (event: any) => {
        // Successful transcript payload received: reset error count
        this.consecutiveErrors = 0;

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

        // In Push-to-Talk mode, discard microphone input unless key is actively held
        if (this.isPushToTalkMode && !this.isPushToTalkActive) {
          return;
        }

        // Browsers can return multiple finalized segments in one event. Joining them
        // explicitly prevents Hindi words from being accidentally concatenated.
        const interim = interimParts.join(" ");
        const final = finalParts.join(" ");
        const durationMs = this.speechStartTimestamp > 0 ? Date.now() - this.speechStartTimestamp : 200;
        const telem = audioEngine.getTelemetry();

        // 1. Process Interim Transcripts (for fast live typing & sub-200ms barge-in detection)
        if (interim) {
          const cleanInterim = this.cleanAndCorrect(interim);
          if (cleanInterim) {
            // Echo Shield: filter out speaker bleed during and shortly after TTS playback
            const isTtsActiveOrRecent = duplexManager.isTtsActiveOrRecent(1500);
            const echoProb = duplexManager.calculateTextEchoProbability(cleanInterim);
            const isBargeIn = duplexManager.isBargeInKeyword(cleanInterim);

            if (isTtsActiveOrRecent && (echoProb > 0.25 || !isBargeIn)) {
              return;
            }

            const evalResult = duplexManager.evaluateSpeechEvent({
              transcript: cleanInterim,
              isFinal: false,
              confidence: bestConf,
              speechDurationMs: durationMs,
              vadEnergy: Math.min(1.0, telem.micRms / 0.05),
            });

            if (evalResult.decision === "PASS_THROUGH" || evalResult.decision === "USER_INTERRUPT") {
              this.lastRecoverableDraft = cleanInterim;
              this.notifyInterim(cleanInterim);
            }
          }
        }

        // 2. Process Final Transcripts (committed user turn)
        if (final) {
          const cleanFinal = this.cleanAndCorrect(final);
          if (cleanFinal) {
            // Echo Shield: never allow AI's spoken words to be re-transcribed as user input
            const isTtsActiveOrRecent = duplexManager.isTtsActiveOrRecent(1500);
            const echoProb = duplexManager.calculateTextEchoProbability(cleanFinal);
            const isBargeIn = duplexManager.isBargeInKeyword(cleanFinal);

            if (isTtsActiveOrRecent && (echoProb > 0.25 || !isBargeIn)) {
              console.log("[SPEECH SERVICE] Suppressed final TTS echo bleed:", cleanFinal);
              return;
            }

            const evalResult = duplexManager.evaluateSpeechEvent({
              transcript: cleanFinal,
              isFinal: true,
              confidence: bestConf,
              speechDurationMs: durationMs,
              vadEnergy: Math.min(1.0, telem.micRms / 0.05),
            });

            if (evalResult.decision === "PASS_THROUGH" || evalResult.decision === "USER_INTERRUPT") {
              this.lastRecoverableDraft = null;
              this.notifyFinal(cleanFinal);
              this.speechStartTimestamp = 0;
            }
          }
        }
      };

      rec.onerror = (event: any) => {
        sessionHadError = true;
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
          console.warn(`[SPEECH SERVICE] SpeechRecognition network error (attempt ${this.consecutiveErrors}).`);

          if (typeof navigator !== "undefined" && !navigator.onLine) {
            this.notifyError("You are currently offline. Voice recognition requires an active internet connection.");
            return;
          }

          if (this.isBraveBrowser()) {
            this.notifyError(
              "Brave browser blocks Google Speech Recognition by default. Please enable 'Use Google services for speech recognition' in Settings > Privacy/System, or try Chrome/Edge."
            );
            return;
          }

          if (this.consecutiveErrors >= 3) {
            this.notifyError(
              "Speech recognition network error: unable to reach speech servers. Please check your internet connection, VPN, or firewall."
            );
          }
          return;
        }

        console.warn("[SPEECH SERVICE] SpeechRecognition error:", err);
      };

      rec.onend = () => {
        this.isRecognizing = false;

        if (this.isListeningDesired) {
          if (!sessionHadError) {
            this.consecutiveErrors = 0;
          }

          // If offline, wait for window 'online' event instead of tight spinning
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            console.warn("[SPEECH SERVICE] Offline, pausing reconnect until network returns.");
            return;
          }

          // If persistent network failure (6+ failed retries), pause auto-restart to prevent spamming
          if (this.consecutiveErrors >= 6) {
            console.warn("[SPEECH SERVICE] Pausing automatic restarts after repeated network failures.");
            this.isListeningDesired = false;
            this.notifyListeningChange(false);
            return;
          }

          // Progressive exponential backoff: 500ms, 900ms, 1600ms, 2900ms, up to 5000ms (120ms on clean restart)
          const delay = this.consecutiveErrors > 0
            ? Math.min(500 * Math.pow(1.8, Math.min(this.consecutiveErrors - 1, 4)), 5000)
            : 120;

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
      this.consecutiveErrors++;
      if (this.consecutiveErrors <= 2) {
        console.warn("[SPEECH SERVICE] SpeechRecognition initialization failed, retrying:", err);
      }
      if (this.isListeningDesired) {
        const delay = Math.min(500 * Math.pow(1.8, Math.min(this.consecutiveErrors - 1, 4)), 5000);
        this.clearRestartTimer();
        this.restartTimeout = setTimeout(() => {
          if (this.isListeningDesired) {
            this.recreateAndStart();
          }
        }, delay);
      }
    }
  }
}

export const speechService = new SpeechRecognitionEngine();
