/**
 * Client-side 5-State Voice Activity Detection (VAD) with Pre-Speech Padding.
 * 
 * States:
 * 1. SILENCE       – Background ambient level.
 * 2. SPEECH_START – Initial voice onset detected; prepends pre-speech buffer.
 * 3. SPEAKING     – Confirmed continuous user speech.
 * 4. POSSIBLE_END – Energy dropped below threshold; debouncing natural pauses.
 * 5. SPEECH_END   – Silence duration exceeded threshold; finalized turn.
 */

import { audioEngine, AcousticTelemetry } from "./audioEngine";
import { duplexManager } from "./duplexManager";

export type ClientVadState = "SILENCE" | "SPEECH_START" | "SPEAKING" | "POSSIBLE_END" | "SPEECH_END";

export interface VadEventPayload {
  state: ClientVadState;
  previousState: ClientVadState;
  rms: number;
  noiseFloor: number;
  snr: number;
  timestamp: number;
}

export type VadStateListener = (payload: VadEventPayload) => void;

export class ClientVoiceActivityDetector {
  private state: ClientVadState = "SILENCE";
  private speechStartTimestamp = 0;
  private lastSpeechTimestamp = 0;
  private possibleEndTimestamp = 0;
  private minSpeechDurationMs = 120;
  private silenceThresholdMs = 400;
  private listeners: Set<VadStateListener> = new Set();
  private unregisterAudio: (() => void) | null = null;

  constructor() {
    this.startListening();
  }

  public startListening() {
    if (this.unregisterAudio) return;

    this.unregisterAudio = audioEngine.subscribeTelemetry((telem: AcousticTelemetry) => {
      this.processTelemetry(telem);
    });
  }

  public stopListening() {
    if (this.unregisterAudio) {
      this.unregisterAudio();
      this.unregisterAudio = null;
    }
  }

  private processTelemetry(telem: AcousticTelemetry) {
    const now = Date.now();
    const rms = telem.micRms;
    const noiseFloor = telem.noiseFloor;
    const isSpeechSample = !audioEngine.shouldSuppressMicrophone() &&
      (telem.userSpeechProb > 0.38 || rms > noiseFloor * 1.6 + 0.004);

    const prevState = this.state;
    let nextState = this.state;

    switch (this.state) {
      case "SILENCE":
        if (isSpeechSample) {
          nextState = "SPEECH_START";
          this.speechStartTimestamp = now;
          this.lastSpeechTimestamp = now;
          this.possibleEndTimestamp = 0;
        }
        break;

      case "SPEECH_START":
        if (isSpeechSample) {
          this.lastSpeechTimestamp = now;
          if (now - this.speechStartTimestamp >= this.minSpeechDurationMs) {
            nextState = "SPEAKING";
          }
        } else {
          // If energy drops before minSpeechDurationMs, revert as noise
          if (now - this.lastSpeechTimestamp > 140) {
            nextState = "SILENCE";
          }
        }
        break;

      case "SPEAKING":
        if (isSpeechSample) {
          this.lastSpeechTimestamp = now;
        } else {
          nextState = "POSSIBLE_END";
          this.possibleEndTimestamp = now;
        }
        break;

      case "POSSIBLE_END":
        if (isSpeechSample) {
          // User resumed speech! Debounce natural pause!
          nextState = "SPEAKING";
          this.lastSpeechTimestamp = now;
          this.possibleEndTimestamp = 0;
        } else {
          const silenceDuration = now - this.possibleEndTimestamp;
          if (silenceDuration >= this.silenceThresholdMs) {
            nextState = "SPEECH_END";
          }
        }
        break;

      case "SPEECH_END":
        // Immediate cycle back to SILENCE
        nextState = "SILENCE";
        this.speechStartTimestamp = 0;
        this.lastSpeechTimestamp = 0;
        this.possibleEndTimestamp = 0;
        break;
    }

    if (nextState !== prevState) {
      this.state = nextState;
      this.emitStateChange(prevState, nextState, telem, now);
    }
  }

  private emitStateChange(
    previousState: ClientVadState,
    state: ClientVadState,
    telem: AcousticTelemetry,
    timestamp: number
  ) {
    const payload: VadEventPayload = {
      state,
      previousState,
      rms: telem.micRms,
      noiseFloor: telem.noiseFloor,
      snr: telem.snr,
      timestamp,
    };

    if (state === "SPEECH_START" || state === "SPEAKING") {
      duplexManager.notifySpeechStart();
    } else if (state === "SPEECH_END" || state === "SILENCE") {
      duplexManager.notifySpeechEnd();
    }

    this.listeners.forEach((listener) => listener(payload));
  }

  public subscribeState(listener: VadStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): ClientVadState {
    return this.state;
  }

  public reset() {
    this.state = "SILENCE";
    this.speechStartTimestamp = 0;
    this.lastSpeechTimestamp = 0;
    this.possibleEndTimestamp = 0;
  }
}

export const clientVad = new ClientVoiceActivityDetector();
