/**
 * Aura Streaming Sentence-by-Sentence TTS Pipeline.
 * 
 * Provides Gemini Live / ChatGPT Voice ultra-low latency TTS streaming:
 * - Incremental sentence and safe-clause boundary tokenization
 * - Parallel pre-fetching of upcoming sentences while current sentence is speaking
 * - Chained gapless playback through Web Audio Engine
 * - Sub-400ms first-audio latency (vs 3-5 seconds with full-response waiting)
 * - Immediate abort and queue purge on user barge-in
 */

import { audioEngine } from "./audioEngine";
import { duplexManager } from "./duplexManager";
import { cleanTextForSpeech } from "./voiceService";

export interface StreamingTtsOptions {
  voice?: string;
  emotion?: string;
  rate?: string;
  pitch?: string;
  onStart?: () => void;
  onSentenceStart?: (sentence: string, index: number) => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

interface QueuedSentence {
  index: number;
  text: string;
  blobPromise: Promise<Blob | null>;
}

class StreamingTtsEngine {
  private buffer = "";
  private sentenceIndex = 0;
  private currentGenerationId = 0;
  private isStreamActive = false;
  private abortController: AbortController | null = null;
  private sentenceQueue: QueuedSentence[] = [];
  private isPlayerLoopRunning = false;
  private options: StreamingTtsOptions = {};
  private firstPhraseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    duplexManager.onInterrupt(() => {
      this.cancel();
    });
  }

  /**
   * Start a new streaming session for an incoming LLM token stream.
   */
  public startStream(options?: StreamingTtsOptions) {
    this.cancel(); // Stop any active playback

    this.currentGenerationId = duplexManager.nextGeneration();
    this.isStreamActive = true;
    this.buffer = "";
    this.sentenceIndex = 0;
    this.sentenceQueue = [];
    this.abortController = new AbortController();
    this.options = options || {};

    this.options.onStart?.();
  }

  /**
   * Push incoming LLM tokens as they arrive from WebSocket (`data.type === "chunk"`).
   */
  public pushChunk(chunk: string) {
    if (!this.isStreamActive || !chunk) return;

    this.buffer += chunk;
    this.extractAndQueueSentences(false);
    this.scheduleFirstPhraseFlush();
  }

  /**
   * Signal that the LLM has completed token generation (`data.type === "done"`).
   */
  public finalizeStream() {
    if (!this.isStreamActive) return;

    this.extractAndQueueSentences(true);
    this.clearFirstPhraseTimer();
    this.isStreamActive = false;
  }

  /**
   * Immediately cancel any active stream, abort fetches, and flush audio queue.
   */
  public cancel() {
    this.currentGenerationId++;
    this.isStreamActive = false;
    this.buffer = "";
    this.sentenceIndex = 0;
    this.sentenceQueue = [];
    this.clearFirstPhraseTimer();

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (e) {}
      this.abortController = null;
    }

    audioEngine.stopAllPlaybackImmediate(15);
    duplexManager.notifyTtsStopped();
  }

  public get generationId(): number {
    return this.currentGenerationId;
  }

  // ── Sentence Boundary Tokenizer ────────────────────────────────────────────

  private extractAndQueueSentences(isFinal: boolean) {
    // Regex matches sentence ends: . ! ? \n Devanagari danda (।)
    // For longer clauses (>35 chars), also splits on comma, colon, semicolon
    let remaining = this.buffer;

    while (remaining.length > 0) {
      // Look for standard terminal punctuation
      const terminalMatch = remaining.match(/([.!?।\n]+)(\s+|$)/);
      // Look for natural clause pause if buffer is getting long
      const clauseMatch = remaining.length > 35 ? remaining.match(/([,;:—]+)(\s+|$)/) : null;

      let splitIndex = -1;
      let matchLength = 0;

      if (terminalMatch && terminalMatch.index !== undefined) {
        splitIndex = terminalMatch.index + terminalMatch[1].length;
        matchLength = terminalMatch[0].length;
      } else if (clauseMatch && clauseMatch.index !== undefined && clauseMatch.index >= 20) {
        splitIndex = clauseMatch.index + clauseMatch[1].length;
        matchLength = clauseMatch[0].length;
      }

      if (splitIndex !== -1) {
        const sentence = remaining.slice(0, splitIndex).trim();
        remaining = remaining.slice(splitIndex).trim();

        if (sentence) {
          this.queueSentence(sentence);
        }
      } else {
        break;
      }
    }

    if (isFinal && remaining.trim()) {
      this.queueSentence(remaining.trim());
      remaining = "";
    }

    this.buffer = remaining;
  }

  /** Queue a short first phrase even if the model has not emitted punctuation. */
  private scheduleFirstPhraseFlush() {
    if (this.sentenceIndex > 0 || this.firstPhraseTimer || this.buffer.trim().length < 18) {
      return;
    }
    const generationId = this.currentGenerationId;
    this.firstPhraseTimer = setTimeout(() => {
      this.firstPhraseTimer = null;
      if (!this.isStreamActive || generationId !== this.currentGenerationId || this.sentenceIndex > 0) {
        return;
      }
      const candidate = this.buffer.trim();
      if (candidate.length < 18) return;
      const preferredEnd = Math.min(candidate.length, 72);
      const splitAt = candidate.lastIndexOf(" ", preferredEnd);
      const phraseEnd = splitAt >= 18 ? splitAt : preferredEnd;
      this.queueSentence(candidate.slice(0, phraseEnd));
      this.buffer = candidate.slice(phraseEnd).trimStart();
    }, 180);
  }

  private clearFirstPhraseTimer() {
    if (this.firstPhraseTimer) {
      clearTimeout(this.firstPhraseTimer);
      this.firstPhraseTimer = null;
    }
  }

  private queueSentence(rawSentence: string) {
    const clean = cleanTextForSpeech(rawSentence);
    if (!clean || clean.length < 2) return;

    const genId = this.currentGenerationId;
    const idx = this.sentenceIndex++;
    if (idx === 0) this.clearFirstPhraseTimer();

    // Dispatch parallel fetch for this sentence immediately
    const blobPromise = this.fetchSentenceAudio(clean, genId);

    this.sentenceQueue.push({
      index: idx,
      text: clean,
      blobPromise,
    });

    if (!this.isPlayerLoopRunning) {
      this.startPlayerLoop();
    }
  }

  // ── Sequential Gapless Audio Playback Loop ──────────────────────────────────

  private async startPlayerLoop() {
    if (this.isPlayerLoopRunning) return;
    this.isPlayerLoopRunning = true;

    try {
      while (this.sentenceQueue.length > 0) {
        const item = this.sentenceQueue.shift();
        if (!item) break;

        const currentGen = this.currentGenerationId;
        let blob: Blob | null = null;
        try {
          blob = await item.blobPromise;
        } catch (e) {
          console.warn("[STREAMING TTS] Sentence blob promise error:", e);
        }

        // Verify generation before speaking
        if (currentGen !== this.currentGenerationId || !blob) {
          continue;
        }

        duplexManager.notifyTtsStart(item.text, `stream-${currentGen}-${item.index}`, currentGen);
        this.options.onSentenceStart?.(item.text, item.index);

        try {
          await audioEngine.playAudioBlob(blob, {
            generationId: currentGen,
            expectedGenerationGetter: () => this.currentGenerationId,
          });
        } catch (playErr) {
          console.warn("[STREAMING TTS] Sentence playback error:", playErr);
        }

        if (currentGen === this.currentGenerationId && this.sentenceQueue.length === 0 && !this.isStreamActive) {
          duplexManager.notifyTtsEnd(currentGen);
          this.options.onEnd?.();
        }
      }
    } catch (e) {
      console.warn("[STREAMING TTS] Player loop error:", e);
      this.options.onError?.(e);
    } finally {
      this.isPlayerLoopRunning = false;
    }
  }

  // ── Backend Synthesis Fetcher ──────────────────────────────────────────────

  private async fetchSentenceAudio(cleanText: string, genId: number): Promise<Blob | null> {
    if (genId !== this.currentGenerationId) return null;

    const isHindiText = /[\u0900-\u097F]/.test(cleanText);
    let targetVoice = this.options.voice || "en-IN-NeerjaExpressiveNeural";
    const isMale =
      targetVoice.toLowerCase().includes("madhur") ||
      targetVoice.toLowerCase().includes("prabhat") ||
      targetVoice.toLowerCase().includes("male");

    if (isHindiText) {
      targetVoice = isMale ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural";
    } else if (targetVoice.startsWith("hi-IN-")) {
      targetVoice = isMale ? "en-IN-PrabhatNeural" : "en-IN-NeerjaExpressiveNeural";
    }

    const rate = isHindiText ? "+0%" : (this.options.rate || "+5%");

    try {
      const res = await fetch("/api/v1/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voice: targetVoice,
          emotion: this.options.emotion,
          rate,
          pitch: this.options.pitch,
        }),
        signal: this.abortController?.signal,
      });

      if (genId !== this.currentGenerationId || !res.ok) {
        return null;
      }

      const blob = await res.blob();
      if (genId !== this.currentGenerationId) return null;

      return blob;
    } catch (err: any) {
      if (err.name === "AbortError" || genId !== this.currentGenerationId) {
        return null;
      }
      console.warn("[STREAMING TTS] Synthesis fetch error for sentence:", cleanText.slice(0, 30), err);
      return null;
    }
  }
}

export const streamingTtsService = new StreamingTtsEngine();
