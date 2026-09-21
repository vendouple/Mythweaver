const assert = require("node:assert/strict");
const { test } = require("node:test");
const { normalizeTurnPayload, normalizeActions } = require("../src/lib/aqua/turnPayload.ts");
const { buildCampaignContext } = require("../src/lib/campaign/context.ts");
const client = require("../src/lib/aqua/client.ts");
const store = require("../src/lib/campaign/store.ts");
const { runDungeonMaster } = require("../src/lib/aqua/chat.ts");

const beat = { speaker: "NARRATOR", content: "The latch clicks open." };

test("turn validation rejects parseable but unusable output", () => {
  for (const payload of [null, [], {}, { story: [] }, { story: [null] }, { story: [{ content: {} }] },
    { story: [{ ...beat, speaker: 4 }] }, { story: [beat], playerUpdates: "not JSON" },
    { story: [beat], npcUpdates: [null] }, { story: [beat], playerActions: [{ playerId: "hero" }] },
    { story: [beat], playerUpdates: [{ stats: [{ name: "HP" }] }] },
    { story: [beat], playerUpdates: [{ stats: [{ name: "HP", value: 3, maxValue: "healthy" }] }] },
    { story: [beat], playerUpdates: [{ inventory: "lost gear" }] }]) {
    assert.equal(normalizeTurnPayload(payload), null);
  }
});

test("double-encoded RP responses retain state, effects, and beat boundaries", () => {
  const story = [beat, { ...beat, content: 'A voice says "{come in}".', effect: { cues: ["knock"] } }];
  const result = normalizeTurnPayload({
    story: JSON.stringify(story),
    playerActions: JSON.stringify([{ playerId: "hero", actions: [{ title: "Enter", prompt: "I step inside." }] }]),
    playerUpdates: JSON.stringify([{ playerId: "hero", stats: [{ name: "HP", value: 12 }] }])
  });
  assert.deepEqual(result.story, story);
  assert.equal(result.playerUpdates[0].stats[0].value, 12);
  assert.equal(result.playerActions[0].playerId, "hero");
  assert.equal(normalizeTurnPayload({ story: `[${JSON.stringify(beat)}], ${JSON.stringify(beat)}]` }).story.length, 2);
  assert.equal(normalizeTurnPayload({ story: `[${JSON.stringify(beat)}, {"content":"unfinished` }), null);
});

test("existing JSON fallback formats remain supported", () => {
  assert.equal(normalizeTurnPayload({ narrator: "The door opens." }).story[0].speaker, "NARRATOR");
  assert.deepEqual(normalizeTurnPayload({ story: [beat], playerActions: { hero: [] } }).playerActions, { hero: [] });
});

test("phone choices safely normalize nulls, labels, and legacy strings", () => {
  const actions = normalizeActions([null, 42, {}, { title: {} }, "  Talk  ", { title: "x".repeat(80), prompt: "I ask." }, { prompt: "Look\n around" }, "Rest", "extra"]);
  assert.equal(actions.length, 4);
  assert.deepEqual(actions[0], { title: "Talk", prompt: "Talk" });
  assert.equal(actions[1].title.length, 48);
  assert.equal(actions[2].title, "Look around");
});

function campaignFixture() {
  return {
    id: "test-only", title: "Test", status: "active", startingStory: "A modern mystery", campaignType: "tabletop",
    players: [{ id: "hero", name: "Hero", personality: "Patient and curious", inventory: [], abilities: [], stats: [{ name: "HP", value: 20, maxValue: 20 }], locationId: "room" }],
    storyCharacters: [], currentScene: "", overview: "", messages: [], displayEvents: [],
    images: [], portraits: [], effects: [], playerActions: { hero: [{ title: "Old", prompt: "Old" }] }, partyActions: [{ title: "Stale", prompt: "Stale" }], suggestedActions: [],
    locations: [{ id: "room", name: "Room", objects: [{ name: "Reactor", state: { charge: 3 } }], cover: [], exits: [], turnState: { mode: "exploration" } }],
    focusedLocationId: "room", musicTheme: "modern", ttsEnabled: false, difficulty: "medium"
  };
}

test("context includes personality and object state without an unbounded image gallery", () => {
  const campaign = campaignFixture();
  campaign.images = Array.from({ length: 100 }, (_, i) => ({ url: `image-${i}`, prompt: "X".repeat(2000) }));
  const context = buildCampaignContext(campaign);
  assert.match(context, /Patient and curious/);
  assert.match(context, /charge.*3/);
  assert.match(context, /image-99/);
  assert.doesNotMatch(context, /image-0"/);
  assert.ok(context.length < 15000);
});

test("DM rejects empty and premature narration, then preserves separate effects and clears stale actions", async (t) => {
  const campaign = campaignFixture();
  for (const name of ["logCampaignDebug", "logCampaignEvent", "saveCampaign"]) t.mock.method(store, name, async () => {});
  t.mock.method(store, "getCampaign", async () => campaign);
  t.mock.method(store, "startCampaignDraft", () => {});
  t.mock.method(store, "finishCampaignDraft", () => {});
  t.mock.method(client, "aquaConfig", () => ({ chatModel: "test", fastModel: "", maxContextChars: 20000 }));
  const calls = [];
  const tool = (name, args) => ({ id: `call-${calls.length}-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
  const story = [
    { ...beat, effect: { cues: ["knock"] } },
    { ...beat, content: "The door swings inward.", effect: { cues: ["door-open"] } }
  ];
  t.mock.method(client, "aquaFetch", async (_path, init) => {
    const request = JSON.parse(init.body);
    calls.push(request);
    if (calls.length === 1) return { message: { tool_calls: [tool("narrate_turn", {})] } };
    if (calls.length === 2) {
      assert.match(request.messages.at(-1).content, /Invalid narrate_turn/);
      return { message: { tool_calls: [tool("roll_dice", { d20Mode: "normal", dc: 10 }), tool("narrate_turn", { story: [beat] })] } };
    }
    if (calls.length === 3) {
      assert.match(request.messages.at(-1).content, /after reading all other tool results/);
      assert.equal(request.messages.filter((m) => m.role === "tool" && JSON.parse(m.content).notation).length, 1);
      return { message: { tool_calls: [tool("narrate_turn", { story, playerActions: [{ playerId: "hero", actions: [null, { title: "Ask", prompt: "I ask who is inside." }] }] })] } };
    }
    assert.equal(request.tools[0].function.name, "direct_stage");
    return { message: { tool_calls: [tool("direct_stage", { mood: "keep", combat: "keep" })] } };
  });
  await runDungeonMaster(campaign.id, "Hero", "I try the latch.", { hiddenUserMessage: true });
  assert.equal(campaign.displayEvents.filter((event) => event.type === "dice").length, 1);
  const narration = campaign.displayEvents.filter((event) => event.type === "narration");
  assert.equal(narration.length, 2);
  assert.deepEqual(narration.map((event) => event.effect.cues), [["knock"], ["door-open"]]);
  assert.deepEqual(campaign.partyActions, []);
  assert.equal(campaign.playerActions.hero[0].title, "Ask");
  assert.equal(campaign.narrationFailure, undefined);
});

test("rules-light D&D cast planning is private, paced, and does not receive the non-D&D guard", async (t) => {
  t.mock.method(client, "aquaFetch", async (_path, init) => {
    const request = JSON.parse(init.body);
    const prompt = request.messages[0].content;
    assert.match(prompt, /This is a Dungeons & Dragons campaign/);
    assert.doesNotMatch(prompt, /not D&D|Return the response as a JSON object/);
    assert.match(prompt, /call compose_cast_plan exactly once/);
    assert.match(prompt, /PRIVATE cast plan/);
    assert.match(prompt, /flexible fictional introduction trigger/);
    return { message: { tool_calls: [{ function: { arguments: JSON.stringify({ cast: [{ name: "Mara", biography: "An elven archivist", traits: ["watchful"], motive: "Protect the archive", disposition: "suspicious", role: "contact", arrival: "early", introductionTrigger: "The party seeks a forbidden record", appearance: "Silver spectacles and ink-stained gloves" }] }) } }] } };
  });
  const { POST } = require("../src/app/api/generate/route.ts");
  const response = await POST(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ type: "plan_cast", campaignType: "dnd", rulesMode: "casual", campaignLength: "medium", prompt: "An elven library" }) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.cast[0].name, "Mara");
});

test("planned NPCs stay private until one idempotent promotion", () => {
  const campaign = campaignFixture();
  campaign.castPlan = [{
    id: "planned-mara",
    name: "Mara",
    biography: "The archive's guarded keeper.",
    traits: ["watchful"],
    motive: "Protect the archive",
    disposition: "suspicious",
    role: "contact",
    arrival: "early",
    introductionTrigger: "The party seeks a forbidden record",
    appearance: "Silver spectacles and ink-stained gloves"
  }];

  assert.equal(campaign.storyCharacters.length, 0);
  const promoted = store.resolveOrPromoteNpc(campaign, { plannedNpcId: "planned-mara", name: "Mara" }, "room");
  assert.equal(promoted.id, "planned-mara");
  assert.match(promoted.description, /ink-stained gloves/);
  assert.doesNotMatch(promoted.description, /archive's guarded keeper|Protect the archive/);
  assert.equal(promoted.status, "Present");
  assert.equal(campaign.castPlan[0].introduced, true);
  assert.equal(campaign.storyCharacters.length, 1);

  const sameNpc = store.resolveOrPromoteNpc(campaign, { plannedNpcId: "planned-mara", name: "Mara" }, "room");
  assert.equal(sameNpc, promoted);
  assert.equal(campaign.storyCharacters.length, 1);
});

test("cast plans normalize invalid model values to safe defaults", () => {
  const normalized = store.normalizeCastPlan([{
    name: "Mara",
    biography: "Archivist",
    traits: [" watchful ", ""],
    disposition: "unknown",
    arrival: "turn 8"
  }]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].disposition, "neutral");
  assert.equal(normalized[0].arrival, "early");
  assert.deepEqual(normalized[0].traits, ["watchful"]);
});

test("private cast plans persist without serializing into campaign responses", async (t) => {
  const plan = [{
    id: "planned-secret",
    name: "Secret",
    biography: "Hidden biography",
    traits: ["quiet"],
    motive: "Wait",
    disposition: "neutral",
    role: "wildcard",
    arrival: "late",
    introductionTrigger: "The last door opens",
    appearance: "A mirrored mask"
  }];
  const campaign = await store.createCampaign("Private Cast Test", "A sealed premise", plan);
  t.after(() => store.deleteCampaign(campaign.id));

  assert.equal(JSON.stringify(campaign).includes("Hidden biography"), false);
  const loaded = await store.getCampaign(campaign.id);
  assert.equal(loaded.castPlan[0].id, "planned-secret");
  assert.equal(JSON.stringify(loaded).includes("planned-secret"), false);
  await assert.rejects(store.readCampaignTextFile(campaign.id, "cast-plan.json"), /Private campaign file/);
  await assert.rejects(store.readCampaignTextFile(campaign.id, ".//cast-plan.json"), /Private campaign file/);
  await assert.rejects(store.writeCampaignTextFile(campaign.id, ".\\cast-plan.json", "[]"), /Private campaign file/);
});
