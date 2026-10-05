import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import assert from "node:assert/strict";

const output = new URL("../.spoken-handoff-test.mjs", import.meta.url);
try {
  await build({ stdin: { contents: 'export { duplexManager } from "./src/app/services/duplexManager"; export { speechService } from "./src/app/services/speechRecognitionService"; export { audioEngine } from "./src/app/services/audioEngine"; export { liveVoiceClient } from "./src/app/services/liveVoiceSocket";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "esm", outfile: fileURLToPath(output) });
  const { speechService, audioEngine, liveVoiceClient, duplexManager } = await import(pathToFileURL(fileURLToPath(output)));
  let recognition;
  class Recognition {
    constructor() { recognition = this; }
    start() { this.onstart?.(); }
    stop() {}
    abort() {}
  }
  globalThis.window = { SpeechRecognition: Recognition, location: { protocol: "http:", hostname: "localhost", port: "3000" } };
  globalThis.localStorage = { getItem: () => null };
  audioEngine.initMicrophonePipeline = async () => ({});
  const packets = [];
  let socket;
  globalThis.WebSocket = class {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor() { socket = this; this.readyState = 1; }
    send(data) { packets.push(JSON.parse(data)); }
    close() {}
  };
  liveVoiceClient.connect();
  socket.onopen();
  assert.equal(liveVoiceClient.sendClientTranscript("Early greeting"), true);
  assert.equal(packets.some(p => p.type === "client_transcript"), false, "Speech waits for session readiness");
  socket.onmessage({ data: JSON.stringify({ type: "session_ready", session_id: "test" }) });
  assert.equal(packets.find(p => p.type === "client_transcript")?.text, "Early greeting", "Captured speech must flush when the session becomes ready");
  const finals = [], errors = [];
  speechService.subscribe({ onFinal: text => { finals.push(text); assert.equal(liveVoiceClient.sendClientTranscript(text), true); }, onError: text => errors.push(text) });
  await speechService.start();
  const event = (text, isFinal) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: .98 }], { isFinal })] });
  recognition.onresult(event("Hello Aura", false));
  await new Promise(resolve => setTimeout(resolve, 1150));
  assert.deepEqual(finals, ["Hello Aura"], "Interim-only speech must commit a turn");
  recognition.onresult(event("Hello Aura", true));
  assert.equal(finals.length, 1, "Delayed final must not duplicate the committed turn");
  recognition.onresult(event("Welcome back", false));
  recognition.onend();
  assert.deepEqual(finals, ["Hello Aura", "Welcome back"], "Recognition ending must flush pending speech");
  recognition.onerror({ error: "network" });
  assert.equal(errors.length, 1, "Network failures must enable the server fallback");
  await new Promise(resolve => setTimeout(resolve, 160));
  const oldResult = recognition.onresult;
  duplexManager.notifyTtsStart("Please take your time", "echo", 7);
  assert.equal(typeof recognition.onresult, "function", "Recognition remains active for spoken interruption");
  recognition.onspeechstart();
  oldResult(event("Baat suntar mera den", false));
  duplexManager.notifyTtsEnd(7);
  oldResult(event("Apni awaaz sunni chahiye", true));
  await new Promise(resolve => setTimeout(resolve, 1450));
  assert.equal(typeof recognition.onresult, "function", "Recognition resumes after speaker echo clears");
  oldResult(event("A very late echo with unrelated words", true));
  assert.deepEqual(finals, ["Hello Aura", "Welcome back"], "Playback and delayed echo must never be forwarded to the LLM");
  duplexManager.notifyTtsStart("Please take your time", "user", 8);
  recognition.onspeechstart();
  audioEngine.currentTelemetry = { ...audioEngine.getTelemetry(), hardwareAecActive: true,
    micRms: .05, snrDb: 20, userSpeechProb: .95, acousticEchoProb: .05, clipping: false };
  audioEngine.hasNearEndSpeechEvidence();
  await new Promise(resolve => setTimeout(resolve, 210));
  audioEngine.hasNearEndSpeechEvidence();
  recognition.onresult(event("Stop speaking please", true));
  assert.equal(finals.at(-1), "Stop speaking please", "Genuine speech interruption must reach the LLM");
  const interruptIndex = packets.findIndex(p => p.type === "interrupt");
  const spokenIndex = packets.findIndex(p => p.type === "client_transcript" && p.text === "Stop speaking please");
  assert.ok(interruptIndex >= 0 && interruptIndex < spokenIndex, "Cancel assistant generation before forwarding the user's interruption");
  assert.ok(packets.some(p => p.type === "playback_state" && p.user_interruption === true));
  assert.deepEqual(packets.filter(p => p.type === "client_transcript").map(p => p.text), ["Early greeting", ...finals], "Every committed utterance must go to the live pipeline");
  speechService.stop();
  liveVoiceClient.disconnect();
  console.log("Spoken interim, final, recognition-end and error handoffs passed");
} finally { await rm(output, { force: true }); }
