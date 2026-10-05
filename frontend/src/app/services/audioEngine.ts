/**
 * Aura Web Audio Engine & Real-Time Acoustic Preprocessing Pipeline.
 * 
 * Provides:
 * - Real browser microphone capture with supported constraint checking
 * - Verified hardware/browser AEC, AGC, and Noise Suppression tracking
 * - Preprocessing audio graph: 80Hz Highpass filter + gentle DynamicsCompressor + Analyser
 * - Real-time acoustic telemetry: sample rate, channels, RMS, peak, clipping, noise floor, SNR
 * - Acoustic Echo Correlator comparing mic input against TTS speaker output
 * - 16kHz 16-bit mono PCM downsampler & continuous audio frame streamer
 * - Gapless audio chunk player with strict Generation ID gating and instant barge-in cut
 */

export interface AcousticTelemetry {
  micRms: number;
  peakLevel: number;
  clipping: boolean;
  refRms: number;
  noiseFloor: number;
  snr: number;
  snrDb: number;
  acousticEchoProb: number;
  userSpeechProb: number;
  isTtsActive: number; // 0 or 1
  gainLevel: number;
  hardwareAecActive: boolean;
  hardwareAgcActive: boolean;
  hardwareNsActive: boolean;
  sampleRate: number;
  channels: number;
  deviceName: string;
  permissionState: "granted" | "denied" | "prompt" | "unknown";
  clippingCount: number;
  droppedFrames: number;
}

export type PcmChunkCallback = (pcmData: ArrayBuffer) => void;

class WebAudioEngine {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private pcmProcessorNode: ScriptProcessorNode | null = null;

  // TTS Output Graph
  private ttsMasterGain: GainNode | null = null;
  private ttsAnalyser: AnalyserNode | null = null;
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private playbackWaiters: Set<() => void> = new Set();
  private playbackTailUntil = 0;
  private assistantOutputActive = false;
  private nearEndSince = 0;
  private nearEndEvidenceUntil = 0;

  // Analysis Buffers
  private micDataArray: Float32Array = new Float32Array(1024);
  private refDataArray: Float32Array = new Float32Array(1024);
  private micFreqArray: Uint8Array = new Uint8Array(512);
  private refFreqArray: Uint8Array = new Uint8Array(512);

  // Acoustic Reference & Correlator State
  private refHistory: Float32Array = new Float32Array(32); // ~640ms history
  private refHistoryIdx = 0;
  private noiseFloorEstimate = 0.005;
  private clippingCounter = 0;
  private droppedFramesCounter = 0;
  private pcmSequence = 0;

  // Hardware Constraints Verified Status
  private hardwareAecActive = false;
  private hardwareAgcActive = false;
  private hardwareNsActive = false;
  private deviceName = "Default Microphone";
  private permissionState: "granted" | "denied" | "prompt" | "unknown" = "unknown";
  private micSampleRate = 48000;
  private micChannels = 1;

  private isInitialized = false;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;

  // Playback Queue & Generation ID for Gapless Streaming
  private currentGenerationId = 0;
  private currentTurnId = 0;
  private scheduledPlaybackTime = 0;

  // Current Telemetry
  private currentTelemetry: AcousticTelemetry = {
    micRms: 0,
    peakLevel: 0,
    clipping: false,
    refRms: 0,
    noiseFloor: 0.005,
    snr: 1.0,
    snrDb: 0.0,
    acousticEchoProb: 0,
    userSpeechProb: 0,
    isTtsActive: 0,
    gainLevel: 1.0,
    hardwareAecActive: false,
    hardwareAgcActive: false,
    hardwareNsActive: false,
    sampleRate: 48000,
    channels: 1,
    deviceName: "Default Microphone",
    permissionState: "unknown",
    clippingCount: 0,
    droppedFrames: 0,
  };

  private telemetryListeners: Set<(telem: AcousticTelemetry) => void> = new Set();
  private pcmListeners: Set<PcmChunkCallback> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      (window as any).__auraAudioEngine = this;
      this.checkPermissionState();
    }
  }

  private async checkPermissionState() {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        this.permissionState = status.state as any;
        status.onchange = () => {
          this.permissionState = status.state as any;
        };
      } catch {
        this.permissionState = "unknown";
      }
    }
  }

  // ── AudioContext Management ────────────────────────────────────────────────

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
      this.ttsAnalyser.fftSize = 1024;
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

  // ── Real Browser Microphone Pipeline ───────────────────────────────────────

  /**
   * Acquire high-quality microphone with verified browser constraints and preprocessing.
   * Checks supported constraints before requesting.
   * Only claims a constraint is active if track.getSettings() actually confirms it.
   */
  public async initMicrophonePipeline(): Promise<MediaStream | null> {
    if (this.micStream && this.micStream.active) {
      return this.micStream;
    }

    try {
      const ctx = await this.getAudioContext();

      // Check supported constraints
      const supported = navigator.mediaDevices.getSupportedConstraints
        ? navigator.mediaDevices.getSupportedConstraints()
        : {};

      const audioConstraints: MediaTrackConstraints = {};

      if (supported.echoCancellation) {
        audioConstraints.echoCancellation = true;
      }
      if (supported.noiseSuppression) {
        audioConstraints.noiseSuppression = true;
      }
      if (supported.autoGainControl) {
        audioConstraints.autoGainControl = true;
      }
      if (supported.channelCount) {
        audioConstraints.channelCount = 1;
      }
      if (supported.sampleRate) {
        audioConstraints.sampleRate = { ideal: 48000 } as any;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      this.micStream = stream;
      this.permissionState = "granted";

      const track = stream.getAudioTracks()[0];
      if (track) {
        const settings = track.getSettings ? track.getSettings() : ({} as any);
        this.hardwareAecActive = settings.echoCancellation === true;
        this.hardwareAgcActive = settings.autoGainControl === true;
        this.hardwareNsActive = settings.noiseSuppression === true;
        this.deviceName = track.label || "System Audio Input";
        this.micSampleRate = settings.sampleRate || ctx.sampleRate || 48000;
        this.micChannels = settings.channelCount || 1;

        console.log("[AUDIO ENGINE] Real Mic Constraints Verified:", {
          device: this.deviceName,
          sampleRate: this.micSampleRate,
          channels: this.micChannels,
          echoCancellation: this.hardwareAecActive,
          noiseSuppression: this.hardwareNsActive,
          autoGainControl: this.hardwareAgcActive,
        });
      }

      // ── Build Preprocessing Layer ──────────────────────────────────────────
      // Microphone -> Highpass Filter (80Hz) -> Dynamics Compressor -> Analyser -> PCM Downsampler
      this.micSourceNode = ctx.createMediaStreamSource(stream);

      // 1. High-pass filter: cuts rumble, DC offset, fan noise < 80Hz without harming speech formants
      this.highpassFilter = ctx.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.setValueAtTime(80, ctx.currentTime);
      this.highpassFilter.Q.setValueAtTime(0.707, ctx.currentTime);

      // 2. Gentle Dynamics Compressor: ensures quiet speech is preserved without clipping
      this.compressorNode = ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-28, ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(10, ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(2.5, ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.20, ctx.currentTime);

      // 3. Analyser Node: for time-domain RMS, peak, and spectral correlation
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 1024;
      this.micAnalyser.smoothingTimeConstant = 0.2;

      // Connect preprocessor graph
      this.micSourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.compressorNode);
      this.compressorNode.connect(this.micAnalyser);

      // 4. Downsampling & PCM Streamer (48kHz/original -> 16kHz 16-bit Mono PCM)
      this.initPcmStreamer(ctx, this.compressorNode);

      // Start continuous analysis & correlation loop
      this.startAnalysisLoop();
      this.isInitialized = true;
      return stream;
    } catch (err) {
      console.error("[AUDIO ENGINE] getUserMedia failed:", err);
      this.permissionState = "denied";
      return null;
    }
  }

  public releaseMicrophone(): void {
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
    if (this.pcmProcessorNode) this.pcmProcessorNode.onaudioprocess = null;
    [this.micSourceNode, this.highpassFilter, this.compressorNode, this.micAnalyser, this.pcmProcessorNode].forEach((node) => {
      try { node?.disconnect(); } catch {}
    });
    this.micSourceNode = null;
    this.pcmProcessorNode = null;
    if (this.analysisInterval) clearInterval(this.analysisInterval);
    this.analysisInterval = null;
    this.isInitialized = false;
  }

  // ── PCM Downsampling & Frame Streaming (16kHz, 16-bit Mono) ────────────────

  private initPcmStreamer(ctx: AudioContext, inputNode: AudioNode) {
    // Buffer size 2048 samples (~42ms @ 48kHz)
    const bufferSize = 2048;
    this.pcmProcessorNode = ctx.createScriptProcessor(bufferSize, 1, 1);

    const targetSampleRate = 16000;
    const sourceSampleRate = ctx.sampleRate;
    const resampleRatio = sourceSampleRate / targetSampleRate;

    this.pcmProcessorNode.onaudioprocess = (e) => {
      const inputChannel = e.inputBuffer.getChannelData(0);
      const outputLength = Math.floor(inputChannel.length / resampleRatio);
      const int16Pcm = new Int16Array(outputLength);

      // Adaptive digital make-up gain for clear soft/whispered voice capture
      const currentRms = this.currentTelemetry.micRms;
      let speechGain = 1.0;
      if (!this.hasActivePlayback() && currentRms > 0.0005 && currentRms < 0.045) {
        speechGain = Math.min(3.0, 0.035 / Math.max(0.006, currentRms));
      }

      // Linear interpolation downsampling to 16kHz with soft saturation limiter
      for (let i = 0; i < outputLength; i++) {
        const sourceIndex = i * resampleRatio;
        const indexFloor = Math.floor(sourceIndex);
        const fraction = sourceIndex - indexFloor;
        const s1 = inputChannel[indexFloor] || 0;
        const s2 = inputChannel[indexFloor + 1] || s1;
        const rawSample = (s1 + (s2 - s1) * fraction) * speechGain;

        // Soft hyperbolic tangent limiter: prevents harsh clipping while boosting quiet vowels
        const compressed = Math.tanh(rawSample);
        int16Pcm[i] = compressed < 0 ? compressed * 0x8000 : compressed * 0x7fff;
      }

      this.pcmSequence++;
      // Preserve silence frames so server VAD can end an utterance, but do not
      // stream assistant speaker bleed into server Whisper.
      if (this.shouldSuppressMicrophone()) int16Pcm.fill(0);
      // Notify all PCM stream listeners (e.g. WebSocket voice stream)
      if (this.pcmListeners.size > 0) {
        const buffer = int16Pcm.buffer;
        this.pcmListeners.forEach((cb) => cb(buffer));
      }
    };

    inputNode.connect(this.pcmProcessorNode);
    // Connect to silent destination so the audio clock pulls samples
    const silentGain = ctx.createGain();
    silentGain.gain.setValueAtTime(0, ctx.currentTime);
    this.pcmProcessorNode.connect(silentGain);
    silentGain.connect(ctx.destination);
  }

  public subscribePcm(callback: PcmChunkCallback): () => void {
    this.pcmListeners.add(callback);
    return () => this.pcmListeners.delete(callback);
  }

  // ── Acoustic Correlation, Noise Floor & Telemetry ──────────────────────────

  private startAnalysisLoop() {
    if (this.analysisInterval) return;

    this.analysisInterval = setInterval(() => {
      this.computeAcousticCorrelation();
    }, 25); // 40 Hz telemetry refresh
  }

  private computeAcousticCorrelation() {
    let micRms = 0;
    let peakLevel = 0;
    let clipping = false;
    let refRms = 0;

    // 1. Measure Mic Input
    if (this.micAnalyser) {
      this.micAnalyser.getFloatTimeDomainData(this.micDataArray);
      let sumSq = 0;
      for (let i = 0; i < this.micDataArray.length; i++) {
        const sample = this.micDataArray[i];
        const abs = Math.abs(sample);
        if (abs > peakLevel) peakLevel = abs;
        if (abs >= 0.98) {
          clipping = true;
          this.clippingCounter++;
        }
        sumSq += sample * sample;
      }
      micRms = Math.sqrt(sumSq / this.micDataArray.length);
      this.micAnalyser.getByteFrequencyData(this.micFreqArray);
    }

    // 2. Measure TTS Reference Playback
    if (this.ttsAnalyser) {
      this.ttsAnalyser.getFloatTimeDomainData(this.refDataArray);
      let sumSq = 0;
      for (let i = 0; i < this.refDataArray.length; i++) {
        const s = this.refDataArray[i];
        sumSq += s * s;
      }
      refRms = Math.sqrt(sumSq / this.refDataArray.length);
      this.ttsAnalyser.getByteFrequencyData(this.refFreqArray);
    }

    // Rolling reference history
    this.refHistory[this.refHistoryIdx] = refRms;
    this.refHistoryIdx = (this.refHistoryIdx + 1) % this.refHistory.length;

    // 3. Adaptive Noise Floor Tracking
    if (refRms < 0.005) {
      if (micRms < this.noiseFloorEstimate * 1.5) {
        this.noiseFloorEstimate = this.noiseFloorEstimate * 0.95 + micRms * 0.05;
      } else {
        this.noiseFloorEstimate = this.noiseFloorEstimate * 0.999 + micRms * 0.001;
      }
      this.noiseFloorEstimate = Math.max(0.001, Math.min(0.08, this.noiseFloorEstimate));
    }

    const snr = micRms / Math.max(0.001, this.noiseFloorEstimate);
    const snrDb = 20 * Math.log10(Math.max(1e-4, micRms) / Math.max(1e-4, this.noiseFloorEstimate));

    // 4. Acoustic Cross-Correlation & Echo Estimation
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
      acousticEchoProb = 0;
      userSpeechProb = micRms > this.noiseFloorEstimate * 2.2 ? Math.min(1.0, snr / 4.0) : 0;
    } else {
      // Compare spectral bands (100Hz - 4000Hz)
      let spectralDot = 0;
      let refNorm = 0;
      let micNorm = 0;
      for (let i = 0; i < 64; i++) {
        const rf = this.refFreqArray[i];
        const mf = this.micFreqArray[i];
        spectralDot += rf * mf;
        refNorm += rf * rf;
        micNorm += mf * mf;
      }
      const spectralCos =
        refNorm > 100 && micNorm > 100 ? spectralDot / (Math.sqrt(refNorm) * Math.sqrt(micNorm)) : 0;

      if (micRms > 0.003 && maxRefLag > 0.005) {
        const energyRatio = micRms / maxRefLag;
        if (energyRatio <= 0.85 && spectralCos > 0.45) {
          acousticEchoProb = Math.min(0.98, 0.5 + spectralCos * 0.45);
        } else if (spectralCos > 0.3) {
          acousticEchoProb = Math.min(0.85, spectralCos * 0.8);
        } else {
          acousticEchoProb = 0.15;
        }
      }

      if (acousticEchoProb > 0.40) {
        userSpeechProb = Math.max(0, (snr / 6.0) * (1.0 - acousticEchoProb));
      } else {
        userSpeechProb = micRms > this.noiseFloorEstimate * 2.5 ? Math.min(1.0, snr / 3.5) : 0;
      }
    }

    const currentGain = this.ttsMasterGain ? this.ttsMasterGain.gain.value : 1.0;

    this.currentTelemetry = {
      micRms,
      peakLevel,
      clipping,
      refRms,
      noiseFloor: this.noiseFloorEstimate,
      snr,
      snrDb: Math.round(snrDb * 10) / 10,
      acousticEchoProb,
      userSpeechProb,
      isTtsActive: isTtsPlaying ? 1 : 0,
      gainLevel: currentGain,
      hardwareAecActive: this.hardwareAecActive,
      hardwareAgcActive: this.hardwareAgcActive,
      hardwareNsActive: this.hardwareNsActive,
      sampleRate: this.micSampleRate,
      channels: this.micChannels,
      deviceName: this.deviceName,
      permissionState: this.permissionState,
      clippingCount: this.clippingCounter,
      droppedFrames: this.droppedFramesCounter,
    };

    // Emit to listeners
    this.hasNearEndSpeechEvidence();
    this.telemetryListeners.forEach((listener) => listener(this.currentTelemetry));
  }

  public getTelemetry(): AcousticTelemetry {
    return { ...this.currentTelemetry };
  }

  public setAssistantOutputActive(active: boolean) {
    if (active && !this.assistantOutputActive) {
      this.nearEndSince = 0;
      this.nearEndEvidenceUntil = 0;
    }
    this.assistantOutputActive = active;
    if (!active) this.markPlaybackEnded();
  }

  public markPlaybackEnded() {
    this.playbackTailUntil = Date.now() + 1200;
  }

  public shouldSuppressMicrophone(): boolean {
    // Loud speaker echo can look like strong near-end speech. Never let an
    // energy/confidence heuristic bypass the speaker playback lock.
    return this.assistantOutputActive || this.hasActivePlayback() || Date.now() < this.playbackTailUntil;
  }

  public subscribeTelemetry(callback: (telem: AcousticTelemetry) => void): () => void {
    this.telemetryListeners.add(callback);
    callback(this.currentTelemetry);
    return () => this.telemetryListeners.delete(callback);
  }

  public hasNearEndSpeechEvidence(): boolean {
    const t = this.currentTelemetry;
    const strong = t.hardwareAecActive && t.micRms >= 0.015 && t.snrDb >= 12 &&
      t.userSpeechProb >= 0.8 && t.acousticEchoProb < 0.2 && !t.clipping;
    if (strong) {
      if (!this.nearEndSince) this.nearEndSince = Date.now();
      if (Date.now() - this.nearEndSince >= 180) this.nearEndEvidenceUntil = Date.now() + 1000;
    } else {
      this.nearEndSince = 0;
    }
    return Date.now() < this.nearEndEvidenceUntil;
  }

  public releasePlaybackLockForUser() {
    this.assistantOutputActive = false;
    this.playbackTailUntil = 0;
  }

  // ── Gain Ducking & Immediate Barge-In Abort ─────────────────────────────────

  public setTtsMasterGain(gain: number, rampDurationMs = 30) {
    if (!this.audioCtx || !this.ttsMasterGain) return;
    const targetGain = Math.max(0.0, Math.min(1.0, gain));
    const now = this.audioCtx.currentTime;
    this.ttsMasterGain.gain.cancelScheduledValues(now);
    this.ttsMasterGain.gain.setValueAtTime(this.ttsMasterGain.gain.value, now);
    this.ttsMasterGain.gain.linearRampToValueAtTime(targetGain, now + rampDurationMs / 1000.0);
  }

  public duckAudio(targetGain = 0.25, rampMs = 30) {
    this.setTtsMasterGain(targetGain, rampMs);
  }

  public restoreAudio(rampMs = 60) {
    this.setTtsMasterGain(1.0, rampMs);
  }

  public stopAllPlaybackImmediate(rampDurationMs = 15) {
    this.stopAllPlayback();
  }

  /**
   * Play an audio Blob (from REST TTS synthesize or audio stream).
   */
  public async playAudioBlob(
    blob: Blob,
    options?: {
      generationId?: number;
      expectedGenerationGetter?: () => number;
      onEnded?: () => void;
    }
  ): Promise<void> {
    const currentGen = options?.generationId !== undefined ? options.generationId : this.currentGenerationId;
    const isCurrent = () => {
      if (options?.expectedGenerationGetter) {
        return options.expectedGenerationGetter() === currentGen;
      }
      return options?.generationId === undefined || options.generationId === this.currentGenerationId;
    };

    if (!isCurrent()) return;

    try {
      const ctx = await this.getAudioContext();
      if (!isCurrent()) return;

      const arrayBuffer = await blob.arrayBuffer();
      if (!isCurrent()) return;

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      if (!isCurrent()) return;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.ttsMasterGain!);

      this.activeSourceNodes.add(sourceNode);
      await new Promise<void>((resolve) => {
        const cancel = () => { this.playbackWaiters.delete(cancel); resolve(); };
        this.playbackWaiters.add(cancel);
        sourceNode.onended = () => {
          this.activeSourceNodes.delete(sourceNode);
          sourceNode.disconnect();
          this.markPlaybackEnded();
          const natural = this.playbackWaiters.delete(cancel);
          if (natural && isCurrent()) options?.onEnded?.();
          resolve();
        };
        sourceNode.start(0);
      });
    } catch (err) {
      console.warn("[AUDIO ENGINE] playAudioBlob error:", err);
      // Fallback using HTMLAudioElement if WebAudio decoding fails
      if (!isCurrent()) return;
      await this.playHtmlAudio(blob, isCurrent, options?.onEnded);
    }
  }

  /**
   * Immediately stops all active TTS playback, purges scheduled chunks, and resets gain.
   * Called instantly when barge-in is triggered.
   */
  public stopAllPlayback() {
    if (this.hasActivePlayback()) this.markPlaybackEnded();
    this.currentGenerationId++;
    this.scheduledPlaybackTime = 0;

    // Stop active buffer sources
    this.activeSourceNodes.forEach((node) => {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    });
    this.activeSourceNodes.clear();
    this.playbackWaiters.forEach((cancel) => cancel());
    this.playbackWaiters.clear();

    // Stop HTMLAudio fallback if active
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.currentTime = 0;
        this.activeHtmlAudio.src = "";
      } catch {}
      this.activeHtmlAudio = null;
    }

    // Always cancel browser SpeechSynthesis to prevent dual speech overlap
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // Reset gain to full volume
    if (this.audioCtx && this.ttsMasterGain) {
      const now = this.audioCtx.currentTime;
      this.ttsMasterGain.gain.cancelScheduledValues(now);
      this.ttsMasterGain.gain.setValueAtTime(1.0, now);
    }
  }

  public setTurnId(turnId: number): void {
    this.currentTurnId = turnId;
  }

  public getTurnId(): number {
    return this.currentTurnId;
  }

  public setGenerationId(genId: number): void {
    this.currentGenerationId = genId;
  }

  public resetPlaybackTiming(): void {
    this.scheduledPlaybackTime = 0;
  }

  // ── Gapless Playback of Audio Chunks ────────────────────────────────────────

  /**
   * Play an MP3 audio buffer (received from WebSocket or TTS) gaplessly.
   * Discards any audio chunk belonging to an old turn or invalidated generation.
   * Enforces single-source playback (cancels any duplicate Web Speech or HTMLAudio).
   */
  public async playAudioChunk(arrayBuffer: ArrayBuffer, generationId: number, turnId?: number): Promise<void> {
    if (generationId < this.currentGenerationId) return;
    if (turnId && this.currentTurnId && turnId < this.currentTurnId) return;

    if (generationId > this.currentGenerationId) {
      this.currentGenerationId = generationId;
    }
    if (turnId && turnId > this.currentTurnId) {
      this.currentTurnId = turnId;
    }

    // Ensure no background browser speech synthesis is running in parallel
    if (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    try {
      const ctx = await this.getAudioContext();
      if (generationId < this.currentGenerationId) return;
      if (turnId && this.currentTurnId && turnId < this.currentTurnId) return;

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      if (generationId < this.currentGenerationId) return;
      if (turnId && this.currentTurnId && turnId < this.currentTurnId) return;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.ttsMasterGain!);

      this.activeSourceNodes.add(sourceNode);

      sourceNode.onended = () => {
        this.activeSourceNodes.delete(sourceNode);
        sourceNode.disconnect();
        this.markPlaybackEnded();
      };

      const now = ctx.currentTime;
      // Schedule playback gaplessly: start at scheduledPlaybackTime or now, whichever is later
      const startTime = Math.max(now + 0.02, this.scheduledPlaybackTime);
      sourceNode.start(startTime);
      this.scheduledPlaybackTime = startTime + audioBuffer.duration;
    } catch (err) {
      console.warn("[AUDIO ENGINE] playAudioChunk decode error, using HTMLAudio fallback:", err);
      if (generationId !== this.currentGenerationId || (turnId && turnId !== this.currentTurnId)) return;
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      await this.playHtmlAudio(blob, () => generationId === this.currentGenerationId && (!turnId || turnId === this.currentTurnId));
    }
  }

  public hasActivePlayback(): boolean {
    return this.activeSourceNodes.size > 0 || !!this.activeHtmlAudio ||
      (typeof window !== "undefined" && !!window.speechSynthesis?.speaking);
  }

  private async playHtmlAudio(blob: Blob, isCurrent: () => boolean, onEnded?: () => void) {
    if (!isCurrent()) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.activeHtmlAudio = audio;
    const ctx = await this.getAudioContext();
    // Route fallback output through the same reference analyser and volume graph.
    const source = ctx.createMediaElementSource(audio);
    source.connect(this.ttsMasterGain!);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.playbackWaiters.delete(cancel);
        source.disconnect();
        URL.revokeObjectURL(url);
        if (this.activeHtmlAudio === audio) this.activeHtmlAudio = null;
        this.markPlaybackEnded();
      };
      const cancel = () => { audio.pause(); cleanup(); resolve(); };
      this.playbackWaiters.add(cancel);
      audio.onended = () => { cleanup(); if (isCurrent()) onEnded?.(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("Speech audio playback failed")); };
      audio.play().catch((error) => { cleanup(); reject(error); });
    });
  }

  public getGenerationId(): number {
    return this.currentGenerationId;
  }

  public nextGeneration(): number {
    this.currentGenerationId++;
    return this.currentGenerationId;
  }
}

export const audioEngine = new WebAudioEngine();
