const assert = require("node:assert/strict");
const { test, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const assets = require("../src/lib/campaign/assets.ts");
const store = require("../src/lib/campaign/store.ts");
const client = require("../src/lib/aqua/client.ts");
const { extractProfileUpdate } = require("../src/lib/aqua/chat.ts");

// A throwaway campaign folder; removed when the file's tests finish.
const CAMPAIGN = `campaign_test_stability_${process.pid}`;
const dir = path.join(process.cwd(), "data", "campaigns", CAMPAIGN);
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Smallest valid PNG (1×1), padded past the inline threshold the way real
// provider output always is.
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex"),
  Buffer.alloc(400, 7)
]);
const DATA_URL = `data:image/png;base64,${PNG.toString("base64")}`;

function assetFile(url) {
  const rel = decodeURIComponent(new URL(url, "http://x").searchParams.get("path"));
  return path.join(dir, ...rel.split("/"));
}

test("base64 provider output is saved to disk, never kept inline", async () => {
  const url = await store.downloadAndSaveImage(CAMPAIGN, DATA_URL, "players", "player_one");
  assert.match(url, new RegExp(`^/api/campaigns/${CAMPAIGN}/assets\\?path=players%2Fplayer_one%2F[0-9a-f]{20}\\.png$`));
  assert.deepEqual(fs.readFileSync(assetFile(url)), PNG);
  // Same bytes, same file; different bytes, a new URL (no stale immutable cache).
  assert.equal(await store.downloadAndSaveImage(CAMPAIGN, DATA_URL, "players", "player_one"), url);
  const other = Buffer.concat([PNG, Buffer.from([1])]);
  assert.notEqual(await store.downloadAndSaveImage(CAMPAIGN, `data:image/png;base64,${other.toString("base64")}`, "players", "player_one"), url);
});

test("inline images anywhere in a campaign are lifted out and deduplicated", async () => {
  const campaign = {
    currentImageUrl: DATA_URL,
    images: [{ id: "a", url: DATA_URL, prompt: "x" }],
    storyCharacters: [{ name: "Rita", portraitUrl: DATA_URL }],
    note: "data:image/png;base64,short"
  };
  assert.equal(await assets.externalizeInlineImages(CAMPAIGN, campaign), 3);
  assert.match(campaign.currentImageUrl, /\/assets\?path=inline%2F/);
  assert.equal(campaign.images[0].url, campaign.currentImageUrl);
  assert.equal(campaign.storyCharacters[0].portraitUrl, campaign.currentImageUrl);
  assert.equal(campaign.note, "data:image/png;base64,short");
  assert.ok(!JSON.stringify(campaign).includes("base64,iVBOR"));
});

test("atomic writes replace the whole file", async () => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "atomic.json");
  await assets.writeFileAtomic(file, "{\"a\":1}");
  await assets.writeFileAtomic(file, "{\"a\":2}");
  assert.equal(fs.readFileSync(file, "utf8"), "{\"a\":2}");
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});

test("inline images with matching edges retain their distinct contents", async () => {
  const other = Buffer.from(PNG);
  other[220] = 8;
  const second = `data:image/png;base64,${other.toString("base64")}`;
  const campaign = { images: [DATA_URL, second] };
  assert.equal(await assets.externalizeInlineImages(CAMPAIGN, campaign), 2);
  assert.notEqual(campaign.images[0], campaign.images[1]);
  assert.deepEqual(fs.readFileSync(assetFile(campaign.images[0])), PNG);
  assert.deepEqual(fs.readFileSync(assetFile(campaign.images[1])), other);
});

test("ambience visuals reject unknown weather, deduplicate, and cap layers", () => {
  assert.equal(store.normalizeAmbienceVisuals(undefined), undefined);
  assert.equal(store.normalizeAmbienceVisuals(["none", "unknown"]), undefined);
  assert.deepEqual(store.normalizeAmbienceVisuals(["rain", "rain", "lightning", "fog", "snow"]), ["rain", "lightning", "fog"]);
});

test("chat requests never carry base64 images to the model", async (t) => {
  let sent = "";
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    sent = init.body;
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await client.aquaFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "m", messages: [{ role: "user", content: `Roster: ${JSON.stringify([{ portraitUrl: DATA_URL }])}` }] })
  }, { baseUrl: "http://test.invalid/v1", apiKey: "k", retries: 1 });
  assert.ok(!sent.includes("base64,"));
  assert.match(sent, /\[inline image omitted\]/);
});

test("profile JSON is accepted in the shapes models actually return", () => {
  assert.equal(extractProfileUpdate({ playerUpdates: [{ characterName: "Bob" }] }).characterName, "Bob");
  assert.equal(extractProfileUpdate({ playerUpdates: { characterName: "Bob" } }).characterName, "Bob");
  assert.equal(extractProfileUpdate({ character: { name: "Bob", backstory: "Fixer" } }).background, "Fixer");
  assert.equal(extractProfileUpdate({ name: "Bob", items: ["wrench"] }).inventory[0], "wrench");
  assert.equal(extractProfileUpdate({ narration: "A story." }), null);
  assert.equal(extractProfileUpdate(null), null);
});
