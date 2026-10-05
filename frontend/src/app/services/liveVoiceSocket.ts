/**
 * Full-Duplex Live Voice WebSocket Client.
 * 
 * Bridges browser microphone PCM capture, server VAD, parallel Whisper STT,
 * voice emotion, NVIDIA NIM streaming, phrase-chunked TTS, and instant barge-in.
 */

import { getWebSocketUrl } from "./wsHelper";
import { audioEngine } from "./audioEngine";
import { duplexManager, ConversationState } from "./duplexManager";

export interface LiveVoiceCallbacks {
  onStateChange?: (state: string, snapshot?: any) => void;
  onVadState?: (state: string, rms: number, snrDb: number) => void;
  onTurnStarted?: (turnId: number, generationId: number) => void;
  onUserSpeechStart?: (turnId: number) => void;
  onUserSpeechEnd?: (turnId: number) => void;
  onAssistantSpeechStart?: (turnId: number, generationId: number) => void;
  onAssistantSpeechEnd?: (turnId: number, generationId: number) => void;
  onPartialTranscript?: (text: string, confidence: number) => void;
  onFinalTranscript?: (text: string, confidence: number) => void;
  onPartialResponseToken?: (token: string) => void;
  onFullResponse?: (text: string) => void;
  onEmotion?: (data: any) => void;
  onSpeaking?: () => void;
  onInterrupted?: () => void;
  onTurnCompleted?: (data: any) => void;
  onMetrics?: (metrics: any) => void;
  onError?: (error: string) => void;
  onConnectionChange?: (status: "connected" | "connecting" | "disconnected" | "reconnecting") => void;
}

class LiveVoiceClient {
  private socket: WebSocket | null = null;
  private isIntentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId = "aura-live-session";
  private currentTurnId = 1;
  private isListeningActive = false;
  private fullResponseBuffer = "";
  private currentGenerationId = 0;
  private unregisterPcm: (() => void) | null = null;
  private isSessionReady = false;
  private reconnectAttempt = 0;
  private activeLanguage = "en-IN";
  private clientTranscription = false;
  private microphoneEnabled = true;
  private pendingTranscript: { text: string; confidence: number; durationMs: number; at: number } | null = null;

  private callbacks: LiveVoiceCallbacks = {};
  private audioQueue: Promise<void> = Promise.resolve();

  constructor() {
    duplexManager.onInterrupt(() => {
      this.interrupt();
    });
  }

  public setCallbacks(cbs: LiveVoiceCallbacks) {
    this.callbacks = cbs;
  }

  public connect(userId = 0) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionalClose = false;
    this.isSessionReady = false;
    this.currentTurnId = 0;
    this.currentGenerationId = 0;
    audioEngine.setTurnId(0);
    audioEngine.setGenerationId(0);
    this.callbacks.onConnectionChange?.("connecting");

    const wsUrl = getWebSocketUrl("/api/v1/ws/voice");
    console.log("[LIVE VOICE] Connecting...");

    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = "arraybuffer";

      this.socket.onopen = () => {
        console.log("[LIVE VOICE] WebSocket connection open.");
        // Wait for session_ready before enabling conversation controls.

        // Send session start with active language binding
        this.sendJson({
          type: "session_start",
          user_id: userId,
          session_id: this.sessionId,
          language: this.activeLanguage,
          client_transcription: this.clientTranscription,
        });

        this.startPingLoop();
        this.startStreamingMicrophone();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.socket.onerror = (err) => {
        console.warn("[LIVE VOICE] WebSocket error:", err);
        this.callbacks.onError?.("Live Voice WebSocket encountered an error.");
      };

      this.socket.onclose = () => {
        console.log("[LIVE VOICE] WebSocket closed.");
        this.isSessionReady = false;
        this.callbacks.onConnectionChange?.("disconnected");
        this.stopStreamingMicrophone();
        this.stopPingLoop();

        if (!this.isIntentionalClose) {
          this.reconnectAttempt += 1;
          const backoff = Math.min(10000, 500 * 2 ** Math.min(this.reconnectAttempt, 4));
          const jitter = Math.floor(Math.random() * 300);
          this.reconnectTimer = setTimeout(() => {
            this.callbacks.onConnectionChange?.("reconnecting");
            this.connect(userId);
          }, backoff + jitter);
        }
      };
    } catch (e: any) {
      console.error("[LIVE VOICE] Connection initiation failed:", e);
      this.callbacks.onError?.(e.message || "Failed to initiate WebSocket");
    }
  }

  public disconnect() {
    this.isIntentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isSessionReady = false;
    this.pendingTranscript = null;
    audioEngine.stopAllPlayback();
    this.stopStreamingMicrophone();
    this.stopPingLoop();
    if (this.socket) {
      this.sendJson({ type: "stop_session" });
      this.socket.close();
      this.socket = null;
    }
  }

  // ── Microphone PCM Streaming to Backend ────────────────────────────────────

  private startStreamingMicrophone() {
    if (this.unregisterPcm) return;

    this.unregisterPcm = audioEngine.subscribePcm((pcmBuffer: ArrayBuffer) => {
      if (this.microphoneEnabled && this.isSessionReady && this.socket && this.socket.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 64000) {
        // Send raw 16kHz 16-bit mono PCM binary frame
        this.socket.send(pcmBuffer);
      }
    });
  }

  private stopStreamingMicrophone() {
    if (this.unregisterPcm) {
      this.unregisterPcm();
      this.unregisterPcm = null;
    }
  }

  // ── Barge-In Interrupt ─────────────────────────────────────────────────────

  /**
   * Immediate user barge-in triggered either by client VAD, speech detector, or button.
   */
  public interrupt() {
    // 1. Immediately kill local playback
    audioEngine.stopAllPlayback();
    this.currentGenerationId++;

    // 2. Transition client state machine
    duplexManager.notifyTtsStopped();
    duplexManager.transitionTo("USER_SPEAKING", "User interrupted");

    // 3. Send interrupt message to server
    this.sendJson({
      type: "interrupt",
      turn_id: this.currentTurnId,
      generation_id: this.currentGenerationId,
    });

    this.callbacks.onInterrupted?.();
    this.sendJson({ type: "playback_state", active: false, user_interruption: true });
  }

  // ── Multimodal Synchronization ─────────────────────────────────────────────

  public sendFaceEmotion(emotionData: any) {
    this.sendJson({
      type: "face_emotion",
      data: emotionData,
      session_id: this.sessionId,
      turn_id: this.currentTurnId,
      timestamp: Date.now(),
    });
  }

  // ── Protocol Dispatcher ────────────────────────────────────────────────────

  private handleMessage(event: MessageEvent) {
    if (typeof event.data !== "string") {
      // Binary audio from server
      if (event.data instanceof ArrayBuffer) {
        audioEngine.playAudioChunk(event.data, this.currentGenerationId, this.currentTurnId);
      }
      return;
    }

    try {
      const msg = JSON.parse(event.data);

      // Reject delayed output from a cancelled turn before it can affect UI or audio.
      const outputTypes = new Set(["partial_response", "audio_chunk", "assistant_speech_start", "assistant_speech_end", "emotion", "completed", "turn_completed"]);
      if (outputTypes.has(msg.type) && (
        (msg.turn_id != null && msg.turn_id !== this.currentTurnId) ||
        (msg.generation_id != null && msg.generation_id < this.currentGenerationId)
      )) return;

      switch (msg.type) {
        case "session_ready":
          this.sessionId = msg.session_id || this.sessionId;
          this.isSessionReady = true;
          this.reconnectAttempt = 0;
          this.callbacks.onConnectionChange?.("connected");
          const pending = this.pendingTranscript;
          this.pendingTranscript = null;
          if (pending && Date.now() - pending.at < 10000) {
            this.sendClientTranscript(pending.text, pending.confidence, pending.durationMs);
          }
          console.log("[LIVE VOICE] Session ready:", this.sessionId);
          break;

        case "turn_started":
          this.currentTurnId = msg.turn_id ?? this.currentTurnId;
          this.currentGenerationId = msg.generation_id ?? this.currentGenerationId;
          audioEngine.setTurnId(this.currentTurnId);
          audioEngine.setGenerationId(this.currentGenerationId);
          audioEngine.resetPlaybackTiming();
          this.fullResponseBuffer = "";
          this.callbacks.onTurnStarted?.(this.currentTurnId, this.currentGenerationId);
          break;

        case "state_change":
          if (msg.turn_id) {
            this.currentTurnId = msg.turn_id;
            audioEngine.setTurnId(msg.turn_id);
          }
          if (msg.active_generation_id !== undefined && msg.active_generation_id !== null) {
            this.currentGenerationId = msg.active_generation_id;
            audioEngine.setGenerationId(this.currentGenerationId);
          }
          if (msg.state === "LISTENING" && duplexManager.getPlaybackState().isSpeaking) break;
          this.callbacks.onStateChange?.(msg.state, msg);
          duplexManager.transitionTo(msg.state as ConversationState, "Server state transition");
          break;

        case "user_speech_start":
          this.callbacks.onUserSpeechStart?.(msg.turn_id ?? this.currentTurnId);
          duplexManager.transitionTo("USER_SPEAKING", "Server user_speech_start");
          break;

        case "user_speech_end":
          this.callbacks.onUserSpeechEnd?.(msg.turn_id ?? this.currentTurnId);
          duplexManager.transitionTo("THINKING", "Server user_speech_end");
          break;

        case "assistant_speech_start":
          this.sendJson({ type: "playback_state", active: true });
          const startTurn = msg.turn_id ?? this.currentTurnId;
          const startGen = msg.generation_id ?? this.currentGenerationId;
          this.currentTurnId = startTurn;
          this.currentGenerationId = startGen;
          audioEngine.setTurnId(startTurn);
          audioEngine.setGenerationId(startGen);
          this.callbacks.onAssistantSpeechStart?.(startTurn, startGen);
          this.callbacks.onSpeaking?.();
          duplexManager.notifyTtsStart(this.fullResponseBuffer || "Aura is speaking", "live-turn-" + startTurn, startGen);
          duplexManager.transitionTo("SPEAKING", "Server assistant_speech_start");
          break;

        case "assistant_speech_end":
          void this.finishPlayback(msg.turn_id ?? this.currentTurnId, msg.generation_id ?? this.currentGenerationId);
          break;

        case "vad_state":
          this.callbacks.onVadState?.(msg.state, msg.rms || 0, msg.snr_db || 0);
          break;

        case "partial_transcript":
          this.callbacks.onPartialTranscript?.(msg.text, msg.confidence || 0.85);
          break;

        case "final_transcript":
          this.callbacks.onFinalTranscript?.(msg.text, msg.confidence || 0.95);
          this.fullResponseBuffer = "";
          break;

        case "partial_response":
          if (!msg.turn_id || msg.turn_id === this.currentTurnId) {
            if (msg.text) {
              this.fullResponseBuffer += msg.text;
              if (duplexManager.getPlaybackState().isSpeaking) {
                duplexManager.notifyTtsStart(this.fullResponseBuffer, "live-turn-" + this.currentTurnId, this.currentGenerationId);
              }
              this.callbacks.onPartialResponseToken?.(msg.text);
              this.callbacks.onFullResponse?.(this.fullResponseBuffer);
            }
          }
          break;

        case "audio_chunk":
          if (msg.data) {
            const chunkTurn = msg.turn_id || this.currentTurnId;
            const chunkGen = msg.generation_id || this.currentGenerationId;
            if (chunkTurn === this.currentTurnId) {
              this.playBase64Chunk(msg.data, chunkGen, chunkTurn);
            }
          }
          break;

        case "interruption":
        case "interrupted":
          audioEngine.stopAllPlayback();
          this.fullResponseBuffer = "";
          if (msg.new_turn_id) {
            this.currentTurnId = msg.new_turn_id;
            audioEngine.setTurnId(msg.new_turn_id);
          }
          if (msg.generation_id) {
            this.currentGenerationId = msg.generation_id;
          }
          this.callbacks.onInterrupted?.();
          duplexManager.transitionTo("INTERRUPTED", "Server acknowledged barge-in");
          break;

        case "generation_cancelled":
        case "tts_cancelled":
          audioEngine.stopAllPlayback();
          break;

        case "emotion":
          this.callbacks.onEmotion?.(msg);
          break;

        case "completed":
        case "turn_completed":
          this.callbacks.onFullResponse?.(this.fullResponseBuffer);
          this.callbacks.onTurnCompleted?.(msg);
          // Generation is complete; listening state follows actual speaker playback.
          break;

        case "metrics":
          this.callbacks.onMetrics?.(msg.data || msg);
          break;

        case "error":
          console.warn("[LIVE VOICE] Server error:", msg.message);
          this.callbacks.onError?.(msg.message || "Server error");
          break;

        case "ping":
          this.sendJson({ type: "pong" });
          break;

        case "pong":
          break;
      }
    } catch (e) {
      console.warn("[LIVE VOICE] Parse message failed:", e);
    }
  }

  private async finishPlayback(turnId: number, generationId: number) {
    await this.audioQueue;
    while (turnId === this.currentTurnId && generationId === this.currentGenerationId && audioEngine.hasActivePlayback()) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (turnId !== this.currentTurnId || generationId !== this.currentGenerationId) return;
    duplexManager.notifyTtsEnd(generationId);
    this.sendJson({ type: "playback_state", active: false });
    this.callbacks.onAssistantSpeechEnd?.(turnId, generationId);
  }

  private playBase64Chunk(b64: string, genId: number, turnId?: number) {
    this.audioQueue = this.audioQueue.then(() => this.decodeAndPlayChunk(b64, genId, turnId));
  }

  private async decodeAndPlayChunk(b64: string, genId: number, turnId?: number) {
    try {
      const binaryString = window.atob(b64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      await audioEngine.playAudioChunk(bytes.buffer, genId, turnId);
    } catch (e) {
      console.warn("[LIVE VOICE] Base64 audio decode error:", e);
      this.callbacks.onError?.("Speech could not be played. Your reply is still shown as text.");
    }
  }

  private sendJson(payload: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      this.sendJson({ type: "ping" });
    }, 20000);
  }

  private stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getTurnId(): number {
    return this.currentTurnId;
  }

  /**
   * Send a typed text message through the same voice pipeline.
   * This ensures typed messages in FaceToFace get the full AI+TTS treatment.
   */
  public sendTextMessage(text: string, language: string = "en", emotionData?: any) {
    if (!this.isSessionReady) {
      console.warn("[LIVE VOICE] Cannot send text — session not ready.");
      return false;
    }
    this.sendJson({
      type: "text_message",
      content: text,
      language,
      session_id: this.sessionId,
      turn_id: this.currentTurnId,
      emotion_data: emotionData || null,
      timestamp: Date.now(),
    });
    this.fullResponseBuffer = "";
    return true;
  }

  public getIsSessionReady(): boolean {
    return this.isSessionReady;
  }

  public setMicrophoneEnabled(enabled: boolean) {
    this.microphoneEnabled = enabled;
  }

  public setClientTranscription(enabled: boolean) {
    this.clientTranscription = enabled;
    this.sendJson({ type: "set_transcription_mode", client_transcription: enabled });
  }

  public setLanguage(lang: string) {
    this.activeLanguage = lang;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendJson({
        type: "set_language",
        language: lang,
      });
    }
  }

  public sendClientTranscript(text: string, confidence: number = 0.95, durationMs: number = 0) {
    if (audioEngine.shouldSuppressMicrophone()) return false;
    if (!this.microphoneEnabled || !this.socket) return false;
    if (!this.isSessionReady && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.pendingTranscript = { text, confidence, durationMs, at: Date.now() };
      return true;
    }
    if (!this.isSessionReady || this.socket.readyState !== WebSocket.OPEN) return false;
    this.sendJson({
      type: "client_transcript",
      text,
      confidence,
      language: this.activeLanguage,
      duration_ms: durationMs,
      session_id: this.sessionId,
      turn_id: this.currentTurnId,
    });
    this.fullResponseBuffer = "";
    return true;
  }
}

export const liveVoiceClient = new LiveVoiceClient();
