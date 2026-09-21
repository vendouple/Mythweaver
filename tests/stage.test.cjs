const assert = require("node:assert/strict");
const { test } = require("node:test");
const catalog = require("../src/lib/campaign/stageCatalog.ts");
const store = require("../src/lib/campaign/store.ts");
const { runTool, toolDefinitions: tools } = require("../src/lib/tools/registry.ts");
const audio = require("../src/lib/client/audio.ts");

test("stage catalog stays available to model schemas and beat validation", () => {
  for (const list of Object.values(catalog)) assert.equal(new Set(list).size, list.length);
  const trigger = tools.find((tool) => tool.function.name === "trigger_effect").function.parameters;
  assert.deepEqual(trigger.properties.cues.items.enum, catalog.SFX_CUES);
  assert.deepEqual(trigger.properties.visual.enum, ["none", ...catalog.EFFECT_KINDS]);
  const ambience = tools.find((tool) => tool.function.name === "set_ambience").function.parameters;
  assert.deepEqual(ambience.properties.sounds.items.enum, catalog.AMBIENCE_SOUNDS);
  for (const visual of catalog.EFFECT_KINDS) assert.equal(store.normalizeBeatEffect({ visual }).visual, visual);
  for (const cue of catalog.SFX_CUES) assert.deepEqual(store.normalizeBeatEffect({ cues: [cue] }).cues, [cue]);
  assert.equal(store.normalizeBeatEffect({ visual: "invented", cues: ["invalid"] }), undefined);
});

test("visual-only and new audio tools work without dropping their envelopes", async (t) => {
  const campaign = { id: "stage-test-only", effects: [] };
  t.mock.method(store, "getCampaign", async () => campaign);
  t.mock.method(store, "saveCampaign", async () => {});
  assert.equal((await runTool(campaign.id, "trigger_effect", { visual: "shockwave", repeat: 12, delayMs: 10000 })).ok, true);
  assert.equal(campaign.effects[0].kind, "shockwave");
  assert.equal(campaign.effects[0].repeat, 12);
  assert.equal(campaign.effects[0].delayMs, 10000);
  assert.equal((await runTool(campaign.id, "trigger_effect", { cues: ["discovery"] })).ok, true);
  assert.ok((await runTool(campaign.id, "trigger_effect", { visual: "none", cues: [] })).error);
  assert.equal((await runTool(campaign.id, "set_ambience", { mood: "calm", sounds: ["library", "underwater"] })).ok, true);
  assert.deepEqual(campaign.ambience.sounds, ["library", "underwater"]);
});

test("SFX source labels are accurate and stopping cancels manifest-waiting cues", async (t) => {
  let resolveManifest;
  const manifest = new Promise((resolve) => { resolveManifest = resolve; });
  t.mock.method(audio, "loadSfxManifest", () => manifest);
  const elements = [];
  class FakeAudio {
    constructor(url) { this.url = url; elements.push(this); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  const original = global.Audio;
  global.Audio = FakeAudio;
  t.after(() => { global.Audio = original; });
  const sfx = require("../src/lib/client/sfx.ts");
  t.after(() => sfx.sfxStop());
  sfx.playSfx("discovery");
  sfx.sfxStop();
  resolveManifest(["/music/SFX/discovery.mp3"]);
  assert.deepEqual(await sfx.sfxSources(["discovery", "heartbeat", "reload"]), {
    discovery: "recorded", heartbeat: "synthesized", reload: "missing"
  });
  assert.equal(elements.length, 0);
  sfx.playSfx("reload");
  assert.equal(elements.length, 0);
  sfx.playSfx("discovery");
  assert.equal(elements.length, 1);
  sfx.sfxStop();
  assert.equal(elements[0].paused, true);
});

test("ambience stop cancels pending accents, active layers, and all fade timers", async (t) => {
  const originalAudio = global.Audio;
  const elements = [];
  class FakeAudio {
    constructor(url) { this.url = url; elements.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  global.Audio = FakeAudio;
  t.after(() => { global.Audio = originalAudio; });
  const intervals = new Set();
  t.mock.method(global, "setInterval", () => { const token = {}; intervals.add(token); return token; });
  t.mock.method(global, "clearInterval", (token) => intervals.delete(token));
  const ambience = require("../src/lib/client/ambience.ts");
  t.after(() => ambience.ambienceStop());
  let resolveManifest;
  t.mock.method(audio, "loadAmbienceManifest", () => new Promise((resolve) => { resolveManifest = resolve; }));
  const pending = ambience.ambienceAccent("rain");
  ambience.ambienceStop();
  resolveManifest({ rain: ["/rain.mp3"] });
  await pending;
  assert.equal(elements.length, 0);
  t.mock.method(audio, "loadAmbienceManifest", async () => ({ rain: ["/rain.mp3"], library: ["/library.mp3"] }));
  await ambience.ambienceAccent("rain");
  ambience.ambienceSetScene("The library is silent.");
  await new Promise(setImmediate);
  assert.equal(elements.length, 2);
  assert.ok(intervals.size > 0);
  ambience.ambienceStop();
  assert.equal(intervals.size, 0);
  assert.ok(elements.every((element) => element.paused));
});
