/**
 * Aura Web Audio Engine & Real-Time Acoustic Reference Pipeline.
 * 
 * Provides:
 * - Persistent AudioContext with auto-unlock and device resumption
 * - Microphone MediaStream with verified hardware Acoustic Echo Cancellation (AEC)
 * - Real-time Audio Routing Graph with AnalyserNodes for mic input and TTS output
 * - Acoustic Echo Correlator: compares live mic energy & spectrum against playing TTS reference
 * - Adaptive Noise Floor & SNR estimation
 * - Click-free Smooth Gain Ducking (1.0 -> 0.25 on potential speech, 0.25 -> 1.0 on echo, 0.25 -> 0.0 on barge-in)
 * - Gapless AudioBuffer / Blob player with strict Generation ID gating
 */

export interface AcousticTelemetry {
  micRms: number;
  refRms: number;
  noiseFloor: number;
  snr: number;
  acousticEchoProb: number;
  userSpeechProb: number;
  isTtsActive: number; // 0 or 1
  gainLevel: number;
  hardwareAecActive: boolean;
}

class WebAudioEngine {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  
  // TTS Output Graph
  private ttsMasterGain: GainNode | null = null;
  private ttsAnalyser: AnalyserNode | null = null;
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private activeHtmlAudio: HTMLAudioElement | null = null;

  // Analysis buffers
  private micDataArray: Float32Array = new Float32Array(512);
  private refDataArray: Float32Array = new Float32Array(512);
  private micFreqArray: Uint8Array = new Uint8Array(256);
  private refFreqArray: Uint8Array = new Uint8Array(256);

  // Acoustic Reference & Correlator State
  private refHistory: Float32Array = new Float32Array(32); // Rolling history of TTS RMS (~640ms)
  private refHistoryIdx = 0;
  private noiseFloorEstimate = 0.005; // Adaptive noise floor
  private hardwareAecActive = false;
  private isInitialized = false;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  
  // Current Telemetry
  private currentTelemetry: AcousticTelemetry = {
    micRms: 0,
    refRms: 0,
    noiseFloor: 0.005,
    snr: 1.0,
    acousticEchoProb: 0,
    userSpeechProb: 0,
    isTtsActive: 0,
    gainLevel: 1.0,
    hardwareAecActive: false,
  };

  private telemetryListeners: Set<(telem: AcousticTelemetry) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      (window as any).__auraAudioEngine = this;
    }
  }

  // ── Initialization & AudioContext ──────────────────────────────────────────

  public async getAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({
        latencyHint: "interactive",
        sampleRate: 48000,
      });

      // TTS Output Graph Setup:
      // SourceNode -> ttsMasterGain -> ttsAnalyser -> destination
      this.ttsMasterGain = this.audioCtx.createGain();
      this.ttsMasterGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

      this.ttsAnalyser = this.audioCtx.createAnalyser();
      this.ttsAnalyser.fftSize = 512;
      this.ttsAnalyser.smoothingTimeConstant = 0.3;

      this.ttsMasterGain.connect(this.ttsAnalyser);
      this.ttsAnalyser.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn("[AUDIO ENGINE] AudioContext resume failed:", e);
      }
    }

    return this.audioCtx;
  }

  /**
   * Acquire high-quality microphone with verified hardware AEC constraints.
   * Keeps track alive inside the Web Audio graph so hardware AEC stays active.
   */
  public async initMicrophonePipeline(): Promise<MediaStream | null> {
    if (this.micStream && this.micStream.active) {
      return this.micStream;
    }

    try {
      const ctx = await this.getAudioContext();
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micStream = stream;

      const track = stream.getAudioTracks()[0];
      if (track) {
        const settings = track.getSettings ? track.getSettings() : ({} as any);
        this.hardwareAecActive = !!settings.echoCancellation;
        console.log("[AUDIO ENGINE] Mic initialized with constraints:", {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          sampleRate: settings.sampleRate,
        });
      }

      // Connect Mic to AnalyserNode for energy & spectral tracking
      this.micSourceNode = ctx.createMediaStreamSource(stream);
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micAnalyser.smoothingTimeConstant = 0.2;

      // Connect to analyser (silent node - don't connect to destination to avoid self-feedback!)
      this.micSourceNode.connect(this.micAnalyser);

      // Start continuous telemetry loop
      this.startAnalysisLoop();
      this.isInitialized = true;
      return stream;
    } catch (err) {
      console.warn("[AUDIO ENGINE] getUserMedia failed:", err);
      return null;
    }
  }

  // ── Real-Time Acoustic Echo & Energy Correlator ─────────────────────────────

  private startAnalysisLoop() {
    if (this.analysisInterval) return;

    this.analysisInterval = setInterval(() => {
      this.computeAcousticCorrelation();
    }, 20); // 50 Hz analysis rate
  }

  private computeAcousticCorrelation() {
    let micRms = 0;
    let refRms = 0;

    // 1. Measure Mic input energy
    if (this.micAnalyser) {
      this.micAnalyser.getFloatTimeDomainData(this.micDataArray);
      let sumSq = 0;
      for (let i = 0; i < this.micDataArray.length; i++) {
        const v = this.micDataArray[i];
        sumSq += v * v;
      }
      micRms = Math.sqrt(sumSq / this.micDataArray.length);
      this.micAnalyser.getByteFrequencyData(this.micFreqArray);
    }

    // 2. Measure TTS reference energy
    if (this.ttsAnalyser) {
      this.ttsAnalyser.getFloatTimeDomainData(this.refDataArray);
      let sumSq = 0;
      for (let i = 0; i < this.refDataArray.length; i++) {
        const v = this.refDataArray[i];
        sumSq += v * v;
      }
      refRms = Math.sqrt(sumSq / this.refDataArray.length);
      this.ttsAnalyser.getByteFrequencyData(this.refFreqArray);
    }

    // Record reference energy in rolling ring buffer
    this.refHistory[this.refHistoryIdx] = refRms;
    this.refHistoryIdx = (this.refHistoryIdx + 1) % this.refHistory.length;

    // 3. Adaptive Noise Floor Tracking (Minimum Statistics Tracking)
    if (refRms < 0.005) {
      if (micRms < this.noiseFloorEstimate * 1.5) {
        this.noiseFloorEstimate = this.noiseFloorEstimate * 0.95 + micRms * 0.05;
      } else {
        this.noiseFloorEstimate = this.noiseFloorEstimate * 0.999 + micRms * 0.001;
      }
      this.noiseFloorEstimate = Math.max(0.001, Math.min(0.08, this.noiseFloorEstimate));
    }

    const snr = micRms / Math.max(0.001, this.noiseFloorEstimate);

    // 4. Acoustic Cross-Correlation & Echo Estimation
    // Compare Mic energy with recent reference energy across acoustic delay window (20-300ms)
    let maxRefLag = 0;
    let avgRecentRef = 0;
    for (let i = 0; i < this.refHistory.length; i++) {
      if (this.refHistory[i] > maxRefLag) maxRefLag = this.refHistory[i];
      avgRecentRef += this.refHistory[i];
    }
    avgRecentRef /= this.refHistory.length;

    const isTtsPlaying = refRms > 0.008 || avgRecentRef > 0.008;

    let acousticEchoProb = 0;
    let userSpeechProb = 0;

    if (!isTtsPlaying) {
      // Aura is silent
      acousticEchoProb = 0;
      userSpeechProb = micRms > this.noiseFloorEstimate * 2.2 ? Math.min(1.0, snr / 4.0) : 0;
    } else {
      // Aura IS playing audio through speakers
      // Check spectral similarity between TTS reference and Mic capture
      let spectralDot = 0;
      let refNorm = 0;
      let micNorm = 0;
      for (let i = 0; i < 64; i++) {
        // Look at speech frequency bands 100Hz - 4000Hz
        const rf = this.refFreqArray[i];
        const mf = this.micFreqArray[i];
        spectralDot += rf * mf;
        refNorm += rf * rf;
        micNorm += mf * mf;
      }
      const spectralCos =
        refNorm > 100 && micNorm > 100 ? spectralDot / (Math.sqrt(refNorm) * Math.sqrt(micNorm)) : 0;

      // If mic energy closely tracks reference peak energy with spectral alignment -> high echo probability
      if (micRms > 0.003 && maxRefLag > 0.005) {
        const energyRatio = micRms / maxRefLag;
        // Typical speaker-to-mic bleed is 0.05 to 0.65 of speaker output
        if (energyRatio <= 0.85 && spectralCos > 0.45) {
          acousticEchoProb = Math.min(0.98, 0.5 + spectralCos * 0.45);
        } else if (spectralCos > 0.3) {
          acousticEchoProb = Math.min(0.85, spectralCos * 0.8);
        } else {
          acousticEchoProb = Math.min(0.6, energyRatio * 0.5);
        }

        // If Mic energy surges substantially ABOVE the reference leakage envelope -> User speech overlap!
        if (micRms > maxRefLag * 1.3 && micRms > this.noiseFloorEstimate * 3.5) {
          userSpeechProb = Math.min(1.0, (micRms - maxRefLag) / (this.noiseFloorEstimate * 4));
          acousticEchoProb = Math.max(0.1, acousticEchoProb * 0.4); // User dominates overlap
        }
      } else {
        acousticEchoProb = 0.1;
      }
    }

    const currentGain = this.ttsMasterGain ? this.ttsMasterGain.gain.value : 1.0;

    this.currentTelemetry = {
      micRms,
      refRms,
      noiseFloor: this.noiseFloorEstimate,
      snr,
      acousticEchoProb,
      userSpeechProb,
      isTtsActive: isTtsPlaying ? 1 : 0,
      gainLevel: currentGain,
      hardwareAecActive: this.hardwareAecActive,
    };

    this.telemetryListeners.forEach((l) => l(this.currentTelemetry));
  }

  public getTelemetry(): AcousticTelemetry {
    return { ...this.currentTelemetry };
  }

  public subscribeTelemetry(listener: (t: AcousticTelemetry) => void): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  // ── Smooth Ducking & Gain Control ──────────────────────────────────────────

  /**
   * Smoothly ducks Aura's playback volume (e.g. from 100% to 25%) when possible speech begins.
   */
  public duckAudio(targetRatio: number = 0.25, durationMs: number = 30) {
    if (!this.ttsMasterGain || !this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      this.ttsMasterGain.gain.cancelScheduledValues(now);
      this.ttsMasterGain.gain.setValueAtTime(this.ttsMasterGain.gain.value, now);
      this.ttsMasterGain.gain.linearRampToValueAtTime(targetRatio, now + durationMs / 1000);
    } catch (e) {
      console.warn("[AUDIO ENGINE] duckAudio error:", e);
    }
  }

  /**
   * Smoothly restores Aura's playback volume (from ducked 25% back to 100%) if speech was echo.
   */
  public restoreAudio(durationMs: number = 60) {
    if (!this.ttsMasterGain || !this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      this.ttsMasterGain.gain.cancelScheduledValues(now);
      this.ttsMasterGain.gain.setValueAtTime(this.ttsMasterGain.gain.value, now);
      this.ttsMasterGain.gain.linearRampToValueAtTime(1.0, now + durationMs / 1000);
    } catch (e) {
      console.warn("[AUDIO ENGINE] restoreAudio error:", e);
    }
  }

  /**
   * Immediately ramps volume to 0 over 15ms (prevents pops/clicks) and halts active sources.
   */
  public stopAllPlaybackImmediate(durationMs: number = 15) {
    if (this.ttsMasterGain && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.ttsMasterGain.gain.cancelScheduledValues(now);
        this.ttsMasterGain.gain.setValueAtTime(this.ttsMasterGain.gain.value, now);
        this.ttsMasterGain.gain.linearRampToValueAtTime(0.0, now + durationMs / 1000);
      } catch (e) {}
    }

    setTimeout(() => {
      this.activeSourceNodes.forEach((node) => {
        try {
          node.stop();
          node.disconnect();
        } catch (e) {}
      });
      this.activeSourceNodes.clear();

      if (this.activeHtmlAudio) {
        try {
          this.activeHtmlAudio.pause();
          this.activeHtmlAudio.currentTime = 0;
          this.activeHtmlAudio.src = "";
        } catch (e) {}
        this.activeHtmlAudio = null;
      }

      // Reset master gain back to 1.0 ready for next turn
      if (this.ttsMasterGain && this.audioCtx) {
        try {
          this.ttsMasterGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
        } catch (e) {}
      }
    }, durationMs + 5);
  }

  // ── High-Fidelity Audio Playback ───────────────────────────────────────────

  /**
   * Plays an audio Blob or ArrayBuffer through the managed Web Audio Gain & Analyser graph.
   * Returns a promise that resolves when playback completes, or rejects if cancelled.
   */
  public async playAudioBlob(
    blob: Blob,
    options?: {
      generationId?: number;
      expectedGenerationGetter?: () => number;
      onEnded?: () => void;
    }
  ): Promise<void> {
    const ctx = await this.getAudioContext();

    if (
      options?.generationId !== undefined &&
      options.expectedGenerationGetter &&
      options.generationId !== options.expectedGenerationGetter()
    ) {
      return; // Outdated generation
    }

    const arrayBuffer = await blob.arrayBuffer();

    if (
      options?.generationId !== undefined &&
      options.expectedGenerationGetter &&
      options.generationId !== options.expectedGenerationGetter()
    ) {
      return; // Stale after decode
    }

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    if (
      options?.generationId !== undefined &&
      options.expectedGenerationGetter &&
      options.generationId !== options.expectedGenerationGetter()
    ) {
      return;
    }

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.ttsMasterGain!);

      this.activeSourceNodes.add(source);

      source.onended = () => {
        this.activeSourceNodes.delete(source);
        try {
          source.disconnect();
        } catch (e) {}
        options?.onEnded?.();
        resolve();
      };

      source.start();
    });
  }

  public getLiveMicrophoneStream(): MediaStream | null {
    return this.micStream;
  }
}

export const audioEngine = new WebAudioEngine();
