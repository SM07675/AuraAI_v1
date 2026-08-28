/**
 * Aura Advanced Full-Duplex Conversational Engine & Echo-Aware Interruption System.
 * 
 * Target Interaction Quality: ChatGPT Voice & Gemini Live.
 * 
 * Features:
 * - 9-State Strict Conversation State Machine:
 *   IDLE -> LISTENING -> USER_SPEAKING -> PROCESSING -> AURA_SPEAKING
 *   -> POSSIBLE_INTERRUPT (with smooth 25% ducking) -> USER_INTERRUPT -> CANCELLING_TTS
 * - Multi-Signal Classifier:
 *   Acoustic Echo Correlation + Spectral Coherence + Adaptive SNR + Text/N-gram Overlap + ASR Conf + Grammar Likelihood
 * - Smooth Gain Ducking (30ms linear ramp to 25% on onset, restore to 100% on echo, 0% on barge-in)
 * - Strict Generation IDs to prevent race conditions or stale playback
 * - Comprehensive Hindi (Devanagari \u0900-\u097F), Indian English, and US English support
 */

import { audioEngine, AcousticTelemetry } from "./audioEngine";

import { devanagariToLatin } from "./voiceService";

export type ConversationState =
  | "IDLE"
  | "LISTENING"
  | "USER_SPEAKING"
  | "PROCESSING"
  | "AURA_SPEAKING"
  | "POSSIBLE_INTERRUPT"
  | "USER_INTERRUPT"
  | "CANCELLING_TTS"
  | "ERROR";

export interface PlaybackMetadata {
  isSpeaking: boolean;
  currentAudioId: string | null;
  generationId: number;
  playbackStartedAt: number;
  playbackPositionMs: number;
  currentText: string;
  tokenSet: Set<string>;
}

export interface InterruptionScoreDetails {
  timestamp: number;
  state: ConversationState;
  vadScore: number;
  acousticEchoProb: number;
  textEchoProb: number;
  combinedEchoProb: number;
  speechDurationMs: number;
  asrConfidence: number;
  humanSpeechLikelihood: number;
  interruptScore: number;
  decision: "USER_INTERRUPT" | "IGNORE_ECHO" | "BACKCHANNEL" | "PENDING_CONFIRMATION" | "PASS_THROUGH";
  reason: string;
  transcript: string;
  telemetry?: AcousticTelemetry;
}

export interface DuplexConfig {
  minInterruptionDurationMs: number; // Minimum speech duration to trigger interrupt
  confirmationWindowMs: number;      // Window to confirm ambiguous speech (with ducking)
  interruptThreshold: number;        // Composite score needed to interrupt Aura
  echoThreshold: number;             // Combined echo probability threshold to reject
  bargeInKeywords: Set<string>;      // High-priority interruption keywords (Hindi & English)
  backchannelKeywords: Set<string>;   // Passive listening keywords (do not interrupt)
}

const DEFAULT_CONFIG: DuplexConfig = {
  minInterruptionDurationMs: 100,
  confirmationWindowMs: 180,
  interruptThreshold: 0.52,
  echoThreshold: 0.38,
  bargeInKeywords: new Set([
    // English barge-in
    "wait", "stop", "doctor", "aura", "hold on", "listen", "no", "actually", "excuse me",
    "one second", "wait a minute", "pause", "cancel", "what", "why", "how", "help",
    "hang on", "wait wait", "stop speaking", "let me speak",
    // Hindi / Hinglish barge-in (Latin script)
    "ruko", "suno", "doctor sahab", "doctor", "nahin", "nahi", "ek minute", "thahro", "kya", "kyun",
    "are", "arrey", "achha", "bataiye", "meri baat suno", "chup", "rok", "bas", "meri suno", "ek second",
    // Hindi barge-in (Devanagari script)
    "रुको", "सुनो", "डॉक्टर", "डॉक्टर साहिबा", "नहीं", "ना", "एक मिनट", "ठहरो", "क्या", "क्यों",
    "अरे", "अच्छा", "बताइए", "मेरी बात सुनो", "चुप", "रोक", "बस", "मेरी सुनो", "रुकिए", "सुनिए", "रुक जाओ", "एक सेकंड"
  ]),
  backchannelKeywords: new Set([
    "hmm", "mhm", "uh-huh", "yeah", "ok", "okay", "haan", "accha", "theek hai", "sahi hai", "got it",
    "हाँ", "हां", "अच्छा", "ठीक है", "सही है", "हम्म"
  ])
};

export class FullDuplexManager {
  private state: ConversationState = "IDLE";
  private generationId = 0;
  private config: DuplexConfig = { ...DEFAULT_CONFIG };
  private stateListeners: Set<(state: ConversationState, prev: ConversationState) => void> = new Set();
  private diagnosticListeners: Set<(diag: InterruptionScoreDetails) => void> = new Set();
  
  private playbackState: PlaybackMetadata = {
    isSpeaking: false,
    currentAudioId: null,
    generationId: 0,
    playbackStartedAt: 0,
    playbackPositionMs: 0,
    currentText: "",
    tokenSet: new Set()
  };

  private pendingInterruptTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCandidate: { text: string; startTime: number; conf: number; vadEnergy: number } | null = null;
  private recentDecisionHistory: InterruptionScoreDetails[] = [];
  private onInterruptCallbacks: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      (window as any).__auraDuplexManager = this;
    }
  }

  // ── State Machine & Generation Control ───────────────────────────────────────

  public getState(): ConversationState {
    return this.state;
  }

  public getGenerationId(): number {
    return this.generationId;
  }

  public nextGeneration(): number {
    this.generationId++;
    return this.generationId;
  }

  public onInterrupt(cb: () => void): () => void {
    this.onInterruptCallbacks.add(cb);
    return () => this.onInterruptCallbacks.delete(cb);
  }

  public setOnInterrupt(cb: () => void) {
    this.onInterruptCallbacks.clear();
    this.onInterruptCallbacks.add(cb);
  }

  public transitionTo(newState: ConversationState, reason: string = ""): void {
    const prev = this.state;
    if (prev === newState) return;

    // Prevent illegal transitions
    if (prev === "AURA_SPEAKING" && newState === "LISTENING" && this.playbackState.isSpeaking) {
      return;
    }

    // Ducking side effects
    if (newState === "POSSIBLE_INTERRUPT") {
      audioEngine.duckAudio(0.25, 30);
    } else if (prev === "POSSIBLE_INTERRUPT" && (newState === "AURA_SPEAKING" || newState === "LISTENING")) {
      audioEngine.restoreAudio(60);
    } else if (newState === "USER_INTERRUPT" || newState === "CANCELLING_TTS") {
      audioEngine.stopAllPlaybackImmediate(15);
    }

    this.state = newState;

    const diag: InterruptionScoreDetails = {
      timestamp: Date.now(),
      state: newState,
      vadScore: 0,
      acousticEchoProb: 0,
      textEchoProb: 0,
      combinedEchoProb: 0,
      speechDurationMs: 0,
      asrConfidence: 1,
      humanSpeechLikelihood: 1,
      interruptScore: 0,
      decision: "PASS_THROUGH",
      reason: `State: ${prev} -> ${newState} (${reason})`,
      transcript: "",
      telemetry: audioEngine.getTelemetry()
    };

    this.logDiagnostic(diag);
    this.stateListeners.forEach((l) => l(newState, prev));
  }

  public subscribeState(listener: (state: ConversationState, prev: ConversationState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeDiagnostics(listener: (diag: InterruptionScoreDetails) => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  public getRecentDiagnostics(): InterruptionScoreDetails[] {
    return [...this.recentDecisionHistory];
  }

  // ── TTS Playback State Tracking ──────────────────────────────────────────────

  public notifyTtsStart(text: string, audioId: string, genId: number) {
    this.playbackState = {
      isSpeaking: true,
      currentAudioId: audioId,
      generationId: genId,
      playbackStartedAt: Date.now(),
      playbackPositionMs: 0,
      currentText: text,
      tokenSet: this.extractTokens(text)
    };
    this.transitionTo("AURA_SPEAKING", "TTS playback started");
  }

  public notifyTtsEnd(genId: number) {
    if (this.playbackState.generationId === genId) {
      this.playbackState.isSpeaking = false;
      this.playbackState.currentAudioId = null;
      if (this.state === "AURA_SPEAKING" || this.state === "POSSIBLE_INTERRUPT") {
        this.transitionTo("LISTENING", "TTS playback ended naturally");
      }
    }
  }

  public notifyTtsStopped() {
    this.playbackState.isSpeaking = false;
    this.playbackState.currentAudioId = null;
    this.clearPendingInterrupt();
    if (this.state === "AURA_SPEAKING" || this.state === "POSSIBLE_INTERRUPT" || this.state === "CANCELLING_TTS") {
      this.transitionTo("LISTENING", "TTS playback halted");
    }
  }

  public getPlaybackState(): PlaybackMetadata {
    return { ...this.playbackState };
  }

  /**
   * React to the browser's speech-onset event before a transcript exists.
   * This mirrors Live API VAD behaviour: duck immediately, then use acoustic
   * telemetry to stop playback early when speech is clearly not speaker echo.
   */
  public notifySpeechStart(): void {
    const telem = audioEngine.getTelemetry();
    const isAuraActive =
      this.playbackState.isSpeaking ||
      this.state === "AURA_SPEAKING" ||
      this.state === "POSSIBLE_INTERRUPT" ||
      telem.isTtsActive === 1;

    if (!isAuraActive) {
      this.transitionTo("USER_SPEAKING", "Browser VAD detected speech onset");
      return;
    }

    this.clearPendingInterrupt();
    this.transitionTo("POSSIBLE_INTERRUPT", "Speech onset; ducking while attribution is confirmed");
    this.pendingInterruptTimer = setTimeout(() => {
      if (this.state !== "POSSIBLE_INTERRUPT") return;
      const latest = audioEngine.getTelemetry();
      const aboveNoiseFloor = latest.micRms > Math.max(0.008, latest.noiseFloor * 1.6);
      if (
        aboveNoiseFloor &&
        latest.userSpeechProb >= 0.58 &&
        latest.acousticEchoProb < this.config.echoThreshold
      ) {
        this.triggerBargeIn("acoustic speech onset");
      }
    }, Math.min(140, this.config.confirmationWindowMs));
  }

  public notifySpeechEnd(): void {
    if (this.state === "POSSIBLE_INTERRUPT") {
      this.clearPendingInterrupt();
      this.transitionTo(
        this.playbackState.isSpeaking ? "AURA_SPEAKING" : "LISTENING",
        "Speech onset ended without a confirmed interruption"
      );
    } else if (this.state === "USER_SPEAKING" && !this.playbackState.isSpeaking) {
      this.transitionTo("LISTENING", "User speech ended");
    }
  }

  // ── Multi-Signal Speaker Attribution & Interruption Classifier ───────────────

  public evaluateSpeechEvent(params: {
    transcript: string;
    isFinal: boolean;
    confidence?: number;
    speechDurationMs?: number;
    vadEnergy?: number;
  }): InterruptionScoreDetails {
    const { transcript, isFinal, confidence = 0.85, speechDurationMs = 200, vadEnergy = 0.8 } = params;
    const now = Date.now();
    const clean = transcript.trim();
    const telem = audioEngine.getTelemetry();

    if (!clean) {
      return {
        timestamp: now,
        state: this.state,
        vadScore: 0,
        acousticEchoProb: 0,
        textEchoProb: 0,
        combinedEchoProb: 0,
        speechDurationMs: 0,
        asrConfidence: 0,
        humanSpeechLikelihood: 0,
        interruptScore: 0,
        decision: "IGNORE_ECHO",
        reason: "Empty transcript",
        transcript: "",
        telemetry: telem
      };
    }

    // ── If Aura is NOT speaking, this is standard user speech ───
    const isAuraActive =
      this.playbackState.isSpeaking ||
      this.state === "AURA_SPEAKING" ||
      this.state === "POSSIBLE_INTERRUPT" ||
      telem.isTtsActive === 1;

    if (!isAuraActive) {
      const diag: InterruptionScoreDetails = {
        timestamp: now,
        state: this.state,
        vadScore: vadEnergy,
        acousticEchoProb: 0,
        textEchoProb: 0,
        combinedEchoProb: 0,
        speechDurationMs,
        asrConfidence: confidence,
        humanSpeechLikelihood: 1.0,
        interruptScore: 1.0,
        decision: "PASS_THROUGH",
        reason: "Aura is silent; standard user speech turn",
        transcript: clean,
        telemetry: telem
      };
      this.logDiagnostic(diag);
      this.transitionTo("USER_SPEAKING", "User started speaking");
      return diag;
    }

    // ── Aura IS speaking: Full Duplex Multi-Signal Evaluation ───
    const textEchoProb = this.calculateTextEchoProbability(clean);
    const acousticEchoProb = telem.acousticEchoProb;

    // Combined echo probability: weighted acoustic correlation + phonetic/text overlap
    const combinedEchoProb = Math.max(
      acousticEchoProb,
      textEchoProb > 0.4 ? 0.4 * acousticEchoProb + 0.6 * textEchoProb : acousticEchoProb
    );

    const humanSpeechLikelihood = this.calculateHumanSpeechLikelihood(clean);
    const durationScore = Math.min(1.0, speechDurationMs / 250);
    const snrScore = Math.min(1.0, telem.snr / 3.0);

    // Multi-signal composite interruption score
    const interruptScore =
      0.25 * (1.0 - combinedEchoProb) +
      0.20 * confidence +
      0.20 * durationScore +
      0.20 * humanSpeechLikelihood +
      0.15 * Math.max(vadEnergy, snrScore);

    let decision: InterruptionScoreDetails["decision"] = "IGNORE_ECHO";
    let reason = "";

    // 1. Check for passive backchannel (e.g. "hmm", "haan", "yeah", "ok") -> do not interrupt
    if (this.isBackchannel(clean)) {
      decision = "BACKCHANNEL";
      reason = `Passive backchannel ("${clean}") — Aura continues speaking`;
    }
    // 2. High-priority barge-in trigger word ("wait", "stop", "ruko", "suno", "doctor") -> Instant halt!
    else if (this.isBargeInKeyword(clean)) {
      decision = "USER_INTERRUPT";
      reason = `Explicit barge-in keyword ("${clean}") -> Instant interruption`;
      this.triggerBargeIn(clean);
    }
    // 3. User speech dominance in acoustic overlap
    else if (telem.userSpeechProb > 0.70 && combinedEchoProb < 0.35) {
      decision = "USER_INTERRUPT";
      reason = `Acoustic user speech dominance (${(telem.userSpeechProb * 100).toFixed(0)}% speech vs ${(combinedEchoProb * 100).toFixed(0)}% echo)`;
      this.triggerBargeIn(clean);
    }
    // 4. Confident user speech with high score & low echo -> Trigger interrupt!
    else if (interruptScore >= this.config.interruptThreshold && combinedEchoProb < this.config.echoThreshold) {
      decision = "USER_INTERRUPT";
      reason = `High-confidence user barge-in (Score: ${(interruptScore * 100).toFixed(1)}%, Echo: ${(combinedEchoProb * 100).toFixed(1)}%)`;
      this.triggerBargeIn(clean);
    }
    // 5. Strong acoustic echo from speaker bleed -> Suppress immediately!
    else if (combinedEchoProb >= this.config.echoThreshold || acousticEchoProb > 0.60) {
      decision = "IGNORE_ECHO";
      reason = `Acoustic/text echo bleed rejected (AcousticEcho: ${(acousticEchoProb * 100).toFixed(0)}%, TextEcho: ${(textEchoProb * 100).toFixed(0)}%)`;
    }
    // 6. Ambiguous interim signal -> Duck audio and start confirmation window
    else if (!isFinal) {
      decision = "PENDING_CONFIRMATION";
      reason = `Ambiguous speech onset (Score: ${(interruptScore * 100).toFixed(1)}%), ducking Aura volume for ${this.config.confirmationWindowMs}ms confirmation window`;
      this.scheduleConfirmationWindow(clean, confidence, vadEnergy);
    }
    // 7. Ambiguous final result with low score -> Drop safely
    else {
      decision = "IGNORE_ECHO";
      reason = `Low-confidence utterance during TTS playback (Score: ${(interruptScore * 100).toFixed(1)}%), dropped safely`;
    }

    const diag: InterruptionScoreDetails = {
      timestamp: now,
      state: this.state,
      vadScore: vadEnergy,
      acousticEchoProb,
      textEchoProb,
      combinedEchoProb,
      speechDurationMs,
      asrConfidence: confidence,
      humanSpeechLikelihood,
      interruptScore,
      decision,
      reason,
      transcript: clean,
      telemetry: telem
    };

    this.logDiagnostic(diag);
    return diag;
  }

  // ── Text & Phonetic Overlap Math ───────────────────────────────────────────

  public isTextEcho(incomingText: string): boolean {
    return this.calculateTextEchoProbability(incomingText) >= 0.4;
  }

  private calculateTextEchoProbability(incomingText: string): number {
    if (!this.playbackState.isSpeaking || !this.playbackState.currentText) {
      return 0;
    }

    const normIncoming = this.normalize(incomingText);
    const normTts = this.normalize(this.playbackState.currentText);
    const translitTts = devanagariToLatin(this.playbackState.currentText);
    const translitInc = devanagariToLatin(incomingText);

    if (!normIncoming) return 0;

    // 1. Direct Substring Containment (Raw & Transliterated)
    if (normTts && normTts.includes(normIncoming) && normIncoming.length >= 3) return 0.95;
    if (normTts && normIncoming.includes(normTts) && normTts.length >= 3) return 0.95;
    if (translitTts && translitTts.includes(normIncoming) && normIncoming.length >= 3) return 0.95;
    if (translitTts && translitInc && translitTts.includes(translitInc) && translitInc.length >= 3) return 0.95;
    if (translitTts && translitInc && translitInc.includes(translitTts) && translitTts.length >= 3) return 0.95;

    // 2. Token Jaccard Overlap
    const inTokens = this.extractTokens(incomingText);
    if (inTokens.size === 0) return 0;

    let overlap = 0;
    inTokens.forEach((t) => {
      if (this.playbackState.tokenSet.has(t)) overlap++;
    });

    const tokenOverlapRatio = overlap / inTokens.size;
    if (inTokens.size === 1 && overlap === 1) {
      return 0.95; // Single word echo match (e.g. "namaste")
    }
    if (tokenOverlapRatio >= 0.3) {
      return Math.min(1.0, 0.4 + tokenOverlapRatio * 0.6);
    }

    // 3. Bi-gram & Tri-gram Overlap
    const inBigrams = this.extractNgrams(normIncoming, 2);
    const ttsBigrams = this.extractNgrams(normTts, 2);
    if (inBigrams.size > 0 && ttsBigrams.size > 0) {
      let bgOverlap = 0;
      inBigrams.forEach((bg) => {
        if (ttsBigrams.has(bg)) bgOverlap++;
      });
      const bgRatio = bgOverlap / inBigrams.size;
      if (bgRatio >= 0.35) {
        return Math.min(0.92, 0.35 + bgRatio * 0.55);
      }
    }

    return tokenOverlapRatio * 0.5;
  }

  private calculateHumanSpeechLikelihood(incomingText: string): number {
    const norm = this.normalize(incomingText);
    const words = norm.split(/\s+/).filter(Boolean);

    if (norm.length <= 1) return 0.2;
    if (this.isBargeInKeyword(norm)) return 1.0;

    const inTokens = this.extractTokens(incomingText);
    let novelWords = 0;
    inTokens.forEach((t) => {
      if (!this.playbackState.tokenSet.has(t)) novelWords++;
    });

    if (novelWords >= 2) return 0.95;
    if (novelWords === 1 && words.length >= 2) return 0.85;

    return 0.55;
  }

  private isBargeInKeyword(text: string): boolean {
    const norm = this.normalize(text);
    const words = norm.split(/\s+/);
    for (const w of words) {
      if (this.config.bargeInKeywords.has(w)) return true;
    }
    for (const kw of this.config.bargeInKeywords) {
      if (norm.includes(kw)) return true;
    }
    return false;
  }

  private isBackchannel(text: string): boolean {
    const norm = this.normalize(text);
    return this.config.backchannelKeywords.has(norm);
  }

  // ── Barge-In Action Execution ──────────────────────────────────────────────

  private triggerBargeIn(triggerText: string) {
    this.clearPendingInterrupt();
    this.nextGeneration();
    this.playbackState.isSpeaking = false;
    
    this.transitionTo("USER_INTERRUPT", `Barge-in by "${triggerText}"`);
    this.transitionTo("CANCELLING_TTS", "Flushing active audio");
    this.transitionTo("USER_SPEAKING", "User now speaking");

    this.onInterruptCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn("[DUPLEX] onInterrupt callback error:", e);
      }
    });
  }

  private scheduleConfirmationWindow(candidateText: string, confidence: number, vadEnergy: number) {
    this.clearPendingInterrupt();
    this.pendingCandidate = { text: candidateText, startTime: Date.now(), conf: confidence, vadEnergy };
    this.transitionTo("POSSIBLE_INTERRUPT", "Evaluating confirmation window");

    this.pendingInterruptTimer = setTimeout(() => {
      if (this.state === "POSSIBLE_INTERRUPT" && this.pendingCandidate) {
        const textEchoProb = this.calculateTextEchoProbability(this.pendingCandidate.text);
        const telem = audioEngine.getTelemetry();
        const combinedEcho = Math.max(telem.acousticEchoProb, textEchoProb);

        if (combinedEcho < this.config.echoThreshold && (telem.userSpeechProb > 0.4 || this.pendingCandidate.conf > 0.6)) {
          this.triggerBargeIn(this.pendingCandidate.text);
        } else {
          this.transitionTo("AURA_SPEAKING", "Confirmation window resolved as echo");
        }
      }
      this.clearPendingInterrupt();
    }, this.config.confirmationWindowMs);
  }

  private clearPendingInterrupt() {
    if (this.pendingInterruptTimer) {
      clearTimeout(this.pendingInterruptTimer);
      this.pendingInterruptTimer = null;
    }
    this.pendingCandidate = null;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private normalize(text: string): string {
    return (text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractTokens(text: string): Set<string> {
    const norm = this.normalize(text);
    const translit = devanagariToLatin(text);
    const rawTokens = norm.split(/\s+/).filter((w) => w.length > 1);
    const translitTokens = translit.split(/\s+/).filter((w) => w.length > 1);
    return new Set([...rawTokens, ...translitTokens]);
  }

  private extractNgrams(text: string, n: number): Set<string> {
    const words = text.split(/\s+/).filter(Boolean);
    const ngrams = new Set<string>();
    if (words.length < n) return ngrams;
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(" "));
    }
    return ngrams;
  }

  private logDiagnostic(diag: InterruptionScoreDetails) {
    this.recentDecisionHistory.push(diag);
    if (this.recentDecisionHistory.length > 50) {
      this.recentDecisionHistory.shift();
    }

    if (diag.decision === "USER_INTERRUPT" || diag.decision === "IGNORE_ECHO") {
      const color = diag.decision === "USER_INTERRUPT" ? "color: #10B981; font-weight: bold;" : "color: #F59E0B;";
      console.log(
        `%c[DUPLEX ${diag.state}] Decision=${diag.decision} | VAD=${diag.vadScore.toFixed(2)} | Echo=${diag.combinedEchoProb.toFixed(2)} | ASRConf=${diag.asrConfidence.toFixed(2)} | Score=${diag.interruptScore.toFixed(2)} | "${diag.transcript}" (${diag.reason})`,
        color
      );
    }

    this.diagnosticListeners.forEach((l) => l(diag));
  }
}

export const duplexManager = new FullDuplexManager();
