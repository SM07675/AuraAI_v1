import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import assert from "node:assert/strict";

const output = new URL("../.echo-playback-test.mjs", import.meta.url);
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
try {
  await build({ stdin: { contents: 'export { audioEngine } from "./src/app/services/audioEngine"; export { duplexManager } from "./src/app/services/duplexManager"; export { streamingTtsService } from "./src/app/services/streamingTtsService";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: fileURLToPath(output) });
  const { audioEngine, duplexManager, streamingTtsService } = await import(output);
  let now = 10000;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    duplexManager.notifyTtsStart("Hello there. How are you feeling today?", "test", 1);
    const evaluate = text => duplexManager.evaluateSpeechEvent({ transcript: text, isFinal: true, confidence: .98, speechDurationMs: 500 });
    assert.equal(evaluate("How are you feeling today").decision, "IGNORE_ECHO");
    duplexManager.notifySpeechStart();
    assert.equal(duplexManager.getPlaybackState().isSpeaking, true, "Speaker onset must not cancel playback");
    duplexManager.notifyTtsEnd(1);
    now += 500;
    assert.equal(evaluate("How are you feeling today").decision, "IGNORE_ECHO", "Delayed ASR must not restart an assistant turn");
    assert.equal(evaluate("Please tell me a story").decision, "IGNORE_ECHO", "Echo tail blocks uncertain speaker input");
    now += 2000;
    assert.equal(evaluate("How are you feeling today").decision, "PASS_THROUGH", "Echo guard must expire");
    duplexManager.notifyTtsStart("Hello there. How are you feeling today?", "test", 2);
    assert.equal(evaluate("Stop speaking please").decision, "IGNORE_ECHO", "A mistranscribed speaker command must never interrupt");
    audioEngine.currentTelemetry = { ...audioEngine.getTelemetry(), hardwareAecActive: true,
      micRms: .05, snrDb: 20, userSpeechProb: .95, acousticEchoProb: .05, clipping: false };
    audioEngine.hasNearEndSpeechEvidence();
    now += 200;
    assert.equal(evaluate("Stop speaking please").decision, "USER_INTERRUPT", "Sustained near-end speech must restore automatic interruption");
    assert.equal(audioEngine.shouldSuppressMicrophone(), false, "User capture reopens immediately after confirmed interruption");
    audioEngine.currentTelemetry = { ...audioEngine.getTelemetry(), micRms: 0, userSpeechProb: 0 };
    assert.equal(evaluate("How are you feeling today").decision, "IGNORE_ECHO", "Echo guard survives interruption");

    const sources = [];
    const param = { value: 1, setValueAtTime() {}, cancelScheduledValues() {}, linearRampToValueAtTime() {} };
    const node = () => ({ connect() {}, disconnect() {}, gain: param });
    class Context {
      currentTime = 0; state = "running"; destination = {};
      createGain() { return node(); }
      createAnalyser() { return node(); }
      async decodeAudioData() { return { duration: 1 }; }
      createBufferSource() {
        const source = { ...node(), start() { sources.push(source); }, stop() {} };
        return source;
      }
    }
    globalThis.window = { AudioContext: Context };
    
    let completed = false;
    const playing = audioEngine.playAudioBlob(new Blob(["audio"])).then(() => { completed = true; });
    await tick();
    assert.equal(completed, false, "Blob playback must await audible completion");
    assert.equal(audioEngine.shouldSuppressMicrophone(), true, "Assistant playback must not feed server transcription");
    sources.at(-1).onended();
    await playing;
    assert.equal(audioEngine.shouldSuppressMicrophone(), true, "Room echo tail must be suppressed");
    now += 1300;
    assert.equal(audioEngine.shouldSuppressMicrophone(), false, "Microphone reopens after echo tail");

    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["audio"]) });
    let ended = 0;
    streamingTtsService.startStream({ onEnd: () => ended++ });
    const before = sources.length;
    streamingTtsService.pushChunk("First sentence. Second sentence.");
    streamingTtsService.finalizeStream();
    await tick();
    assert.equal(sources.length, before + 1, "Only the first phrase may play initially");
    sources.at(-1).onended();
    await tick();
    assert.equal(sources.length, before + 2, "Next phrase starts after the previous phrase ends");
    assert.equal(duplexManager.isTextEcho("First sentence"), true, "Earlier phrases remain in the echo reference");
    assert.equal(ended, 0, "Streaming completion waits for final audible phrase");
    sources.at(-1).onended();
    await tick();
    assert.equal(ended, 1);
    assert.equal(duplexManager.getPlaybackState().isSpeaking, false);

    const canceled = audioEngine.playAudioBlob(new Blob(["audio"]));
    await tick();
    audioEngine.stopAllPlayback();
    await canceled;
    assert.equal(audioEngine.hasActivePlayback(), false, "Cancel clears playback and resolves waiting players");
    streamingTtsService.cancel();
  } finally { Date.now = realNow; }
  console.log("Playback echo, delayed ASR, real interruption, microphone guard, ordered speech and cancellation checks passed");
} finally { await rm(output, { force: true }); }
