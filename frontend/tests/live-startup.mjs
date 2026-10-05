import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import assert from "node:assert/strict";

const output = new URL("../.live-startup-test.mjs", import.meta.url);
try {
  await build({ entryPoints: ["src/app/services/liveVoiceSocket.ts"], bundle: true,
    platform: "node", format: "esm", outfile: output.pathname.replace(/^\/(?:([A-Z]:))/, "$1") });
  const module = await import(pathToFileURL(output.pathname.replace(/^\/(?:([A-Z]:))/, "$1")));
  assert.equal(module.liveVoiceClient.getIsSessionReady(), false);
  assert.equal(module.liveVoiceClient.sendTextMessage("Hello"), false);
  assert.equal(module.liveVoiceClient.sendClientTranscript("Hello"), false);
  console.log("Live service startup and session readiness checks passed");
} finally {
  await rm(output, { force: true });
}
