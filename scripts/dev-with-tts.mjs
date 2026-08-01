#!/usr/bin/env node
/**
 * `npm run dev` launcher: starts the Next.js dev server and, when a usable
 * Python is available, the Chatterbox TTS sidecar alongside it — one command,
 * two processes. The sidecar is optional: if no Python interpreter is found
 * the app still runs and narration simply stays text-only.
 *
 *   TTS_AUTOSTART=0  -> skip the sidecar entirely (plain `next dev`)
 */

import { spawn, spawnSync } from "node:child_process";

const AUTOSTART = String(process.env.TTS_AUTOSTART ?? "1").toLowerCase() !== "0";

/** First working Python interpreter command, or null. */
function findPython() {
  for (const candidate of [["python"], ["python3"], ["py", "-3"]]) {
    const [cmd, ...args] = candidate;
    const probe = spawnSync(cmd, [...args, "--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const children = [];
let shuttingDown = false;

function start(label, cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
  child.on("error", (err) => console.warn(`[dev] ${label} failed to start: ${err.message}`));
  children.push(child);
  return child;
}

/** When one process exits, bring the other down too so no orphan survives. */
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code ?? 0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const next = start("next", "npx", ["next", "dev"]);
next.on("exit", (code) => shutdown(code));

if (AUTOSTART) {
  const python = findPython();
  if (!python) {
    console.warn("[dev] No Python found — TTS sidecar skipped (voice narration unavailable).");
  } else {
    const [cmd, ...prefix] = python;
    const tts = start("tts", cmd, [...prefix, "services/tts/server.py"]);
    // A crashing sidecar must NOT kill the dev server — just log it.
    tts.on("exit", (code) => {
      if (!shuttingDown) console.warn(`[dev] TTS sidecar exited (code ${code}); narration will fall back to text.`);
    });
  }
}
