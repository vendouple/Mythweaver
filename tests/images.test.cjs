const assert = require("node:assert/strict");
const { test } = require("node:test");
const client = require("../src/lib/aqua/client.ts");
const { generateImage } = require("../src/lib/aqua/images.ts");
const { runTool, isNpcPortraitPending } = require("../src/lib/tools/registry.ts");
const images = require("../src/lib/aqua/images.ts");
const store = require("../src/lib/campaign/store.ts");

function config(t, model) {
  t.mock.method(client, "aquaConfig", () => ({ imageModel: model, imageBaseUrl: "http://test.invalid", imageApiKey: "" }));
}

test("NPC portraits request square dimensions and explicit framing", async (t) => {
  config(t, "square-test");
  t.mock.method(client, "aquaFetch", async (_path, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.size, "1024x1024");
    assert.match(body.prompt, /Square 1:1.*head and shoulders/);
    return { data: [{ url: "https://test.invalid/image.png" }] };
  });
  assert.equal((await generateImage("A grey-haired clerk.", { aspect: "1:1" })).url, "https://test.invalid/image.png");
});

test("size fallback is isolated by dimensions and model", async (t) => {
  config(t, "size-test");
  const sizes = [];
  t.mock.method(client, "aquaFetch", async (_path, init) => {
    const body = JSON.parse(init.body);
    sizes.push(body.size);
    if (body.size === "1344x768") throw Object.assign(new Error("Unsupported size"), { status: 400 });
    return { data: [{ url: "https://test.invalid/image.png" }] };
  });
  await generateImage("Room", { aspect: "16:9" });
  await generateImage("Clerk", { aspect: "1:1" });
  await generateImage("Room again", { aspect: "16:9" });
  assert.deepEqual(sizes, ["1344x768", undefined, "1024x1024", undefined]);
});

test("outages and authentication failures never disable image sizing", async (t) => {
  config(t, "failure-test");
  let calls = 0;
  t.mock.method(client, "aquaFetch", async () => { calls++; throw Object.assign(new Error("Unauthorized"), { status: 401 }); });
  await assert.rejects(generateImage("Clerk", { aspect: "1:1" }), /Unauthorized/);
  assert.equal(calls, 1);
});

test("failed unsized fallback preserves the original error and size capability", async (t) => {
  config(t, "double-failure-test");
  t.mock.method(client, "aquaFetch", async (_path, init) => {
    const body = JSON.parse(init.body);
    throw Object.assign(new Error(body.size ? "Unsupported size" : "Temporary outage"), { status: body.size ? 422 : 503 });
  });
  await assert.rejects(generateImage("Clerk", { aspect: "1:1" }), /Unsupported size/);
});

test("portrait tools refuse ambiguous or missing subjects before starting work", async () => {
  assert.match((await runTool("unused", "generate_image", { prompt: "Clerk", kind: "portrait" })).error, /need a target/);
  assert.match((await runTool("unused", "generate_image", { prompt: "Clerk", playerId: "hero", npcName: "Clerk" })).error, /not both/);
});

test("portrait generation cannot introduce a private planned NPC", async (t) => {
  const campaign = {
    id: "private-cast-image-test",
    players: [],
    storyCharacters: [],
    castPlan: [{ id: "planned-clerk", name: "Clerk", biography: "Hidden", traits: [], motive: "Observe", disposition: "neutral", role: "contact", arrival: "early", introductionTrigger: "Later", appearance: "Grey coat" }],
    portraits: []
  };
  t.mock.method(store, "getCampaign", async () => campaign);
  t.mock.method(store, "logCampaignEvent", async () => {});
  const result = await runTool(campaign.id, "generate_image", { prompt: "A clerk in a grey coat", npcName: "Clerk" });
  assert.match(result.error, /No introduced NPC/);
  assert.equal(campaign.storyCharacters.length, 0);
});

test("slow NPC jobs stay pending, use square framing, and deduplicate until completion", async (t) => {
  const campaign = { id: "image-test-only", players: [], storyCharacters: [{ id: "clerk", name: "Clerk" }], portraits: [] };
  t.mock.method(store, "getCampaign", async () => campaign);
  t.mock.method(store, "getCampaignLock", () => ({ acquire: async () => () => {} }));
  t.mock.method(store, "downloadAndSaveImage", async () => "/test-clerk.png");
  for (const name of ["logCampaignDebug", "logCampaignEvent", "saveCampaign"]) t.mock.method(store, name, async () => {});
  let finish;
  let requests = 0;
  t.mock.method(images, "generateImage", async (_prompt, opts) => {
    requests++;
    assert.equal(opts.aspect, "1:1");
    return new Promise((resolve) => { finish = resolve; });
  });
  const args = { prompt: "A clerk in a grey coat", npcName: "Clerk" };
  assert.equal((await runTool(campaign.id, "generate_image", args)).kind, "portrait");
  await new Promise(setImmediate);
  assert.equal(isNpcPortraitPending(campaign.id, "Clerk"), true);
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 600000);
  assert.equal((await runTool(campaign.id, "generate_image", args)).deduplicated, true);
  assert.equal(requests, 1);
  finish({ url: "https://test.invalid/clerk.png", prompt: args.prompt });
  await new Promise(setImmediate);
  assert.equal(isNpcPortraitPending(campaign.id, "Clerk"), false);
  assert.equal(campaign.storyCharacters[0].portraitUrl, "/test-clerk.png");
  assert.equal((await runTool(campaign.id, "generate_image", args)).deduplicated, true);
});
