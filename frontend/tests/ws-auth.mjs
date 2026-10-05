import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import assert from "node:assert/strict";

const output = new URL("../.ws-auth-test.mjs", import.meta.url);
const path = output.pathname.replace(/^\/(?:([A-Z]:))/, "$1");
const local = new Map();
const session = new Map();
globalThis.window = { location: { protocol: "http:", hostname: "localhost", host: "localhost:5173", port: "5173" } };
globalThis.localStorage = { getItem: (key) => local.get(key) ?? null };
globalThis.sessionStorage = { getItem: (key) => session.get(key) ?? null };
try {
  await build({ entryPoints: ["src/app/services/wsHelper.ts"], bundle: true, platform: "node", format: "esm", outfile: path });
  const { getWebSocketUrl } = await import(pathToFileURL(path));
  const endpoint = "/api/v1/ws/voice";
  local.set("aura_access_token", "local-jwt");
  assert.equal(new URL(getWebSocketUrl(endpoint)).searchParams.get("token"), "local-jwt");
  session.set("aura_access_token", "session-jwt");
  assert.equal(new URL(getWebSocketUrl(endpoint)).searchParams.get("token"), "session-jwt");
  session.set("aura_access_token", "guest_token_demo");
  assert.equal(new URL(getWebSocketUrl(endpoint)).searchParams.has("token"), false);
  session.clear(); local.clear();
  assert.equal(getWebSocketUrl(endpoint), "ws://localhost:8000/api/v1/ws/voice");
  console.log("WebSocket signed-in identity and guest access checks passed");
} finally { await rm(output, { force: true }); }
