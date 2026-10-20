import { NextResponse } from "next/server";
import { aquaConfig, aquaFetch, extractToolArgs, singleToolChoice } from "@/lib/aqua/client";
import { listCampaigns, getCampaign } from "@/lib/campaign/store";
import { serverLog, serverError } from "@/lib/aqua/chat";

export const dynamic = "force-dynamic";

async function findCampaignByJoinCode(code: string) {
  const summaries = await listCampaigns();
  const summary = summaries.find(
    (c) => c.joinCode === code.trim().toUpperCase()
  );
  if (!summary) return null;
  return await getCampaign(summary.id);
}

type StructuredTool = { name: string; description: string; parameters: Record<string, unknown> };

function missingRequired(result: Record<string, any> | null, tool: StructuredTool): string[] {
  const required = Array.isArray((tool.parameters as any).required) ? (tool.parameters as any).required as string[] : [];
  if (!result) return required;
  return required.filter((key) => {
    const value = result[key];
    if (typeof value === "string") return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null;
  });
}

/**
 * Ask the model for a structured object via OpenAI-compatible tool calling,
 * validating the required fields and retrying when they come back missing.
 *
 * Some backends (DeepSeek via Pollinations, observed) answer a FORCED
 * tool_choice with an empty `{}` call about half the time, which is what made
 * character generation fail with "AI did not return a valid character JSON
 * structure". So: offer the single tool with the configured tool choice
 * (default "auto"), then retry, and finally fall back to plain JSON-in-content
 * with no tools at all, which every chat endpoint can do.
 */
async function callStructured(
  systemInstruction: string,
  userPrompt: string,
  tool: StructuredTool,
  label: string,
  ignoreMissing: string[] = []
): Promise<Record<string, any> | null> {
  const config = aquaConfig();
  const fieldList = Object.keys((tool.parameters as any).properties || {}).join(", ");
  const attempts = [
    { tools: true },
    { tools: true },
    { tools: false }
  ];
  let best: Record<string, any> | null = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const useTools = attempts[i].tools;
    const delivery = useTools
      ? `Delivery: call ${tool.name} exactly once and put EVERY field (${fieldList}) in its arguments, fully written. Never call it with empty arguments. Do not also write JSON or prose in message content.`
      : `Delivery: reply with ONE JSON object and nothing else — no markdown, no code fences, no commentary. It must contain these keys, each fully written: ${fieldList}.`;
    try {
      const response = await aquaFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: config.chatModel,
          messages: [
            { role: "system", content: `${systemInstruction}

${delivery}` },
            { role: "user", content: userPrompt }
          ],
          ...(useTools
            ? { tools: [{ type: "function", function: tool }], tool_choice: singleToolChoice(tool.name) }
            : {})
        })
      }, { retries: 3, reasoningEffort: config.chatReasoningEffort }) as any;
      const message = response?.choices?.[0]?.message || response?.message;
      const result = extractToolArgs(message, tool.name);
      const missing = missingRequired(result, tool).filter((key) => !ignoreMissing.includes(key));
      if (result && !missing.length) {
        if (i > 0) serverLog("API generate", `${label}: valid result on attempt ${i + 1}/${attempts.length}${useTools ? "" : " (plain JSON fallback)"}`);
        return result;
      }
      if (result && (!best || Object.keys(result).length > Object.keys(best).length)) best = result;
      const rawArgs = Array.isArray(message?.tool_calls) ? String(message.tool_calls[0]?.function?.arguments ?? "") : "";
      serverError("API generate", `${label}: attempt ${i + 1}/${attempts.length} missing [${missing.join(", ")}]` +
        ` (tool args: ${rawArgs.slice(0, 160) || "none"}; content: ${String(message?.content || "").slice(0, 160) || "none"})`);
    } catch (err) {
      serverError("API generate", `${label}: attempt ${i + 1}/${attempts.length} request failed`, err);
      if (i === attempts.length - 1) throw err;
    }
  }
  return best;
}

const CAMPAIGN_TOOL = {
  name: "compose_campaign",
  description: "Return the finished campaign title and starting background story.",
  parameters: {
    type: "object",
    required: ["title", "startingStory"],
    properties: {
      title: { type: "string", description: "The campaign title." },
      startingStory: { type: "string", description: "The starting background story (about 3 paragraphs)." }
    }
  }
};

const CAST_PLAN_TOOL = {
  name: "compose_cast_plan",
  description: "Return a private, paced cast plan for the campaign.",
  parameters: {
    type: "object",
    required: ["cast"],
    properties: {
      cast: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "biography", "traits", "motive", "disposition", "role", "arrival", "introductionTrigger", "appearance"],
          properties: {
            name: { type: "string" },
            biography: { type: "string", description: "Who they are, their relevant history, and their place in the setting." },
            traits: { type: "array", items: { type: "string" }, description: "Distinct personality traits, quirks, flaws, and mannerisms." },
            motive: { type: "string", description: "What this character currently wants." },
            disposition: { type: "string", enum: ["friendly", "neutral", "suspicious", "hostile", "conflicted"] },
            role: { type: "string", description: "Concise story role such as ally, rival, enemy, contact, authority, or wildcard." },
            arrival: { type: "string", enum: ["opening", "early", "middle", "late"] },
            introductionTrigger: { type: "string", description: "A flexible fictional situation that could bring this character into play, never a fixed turn number." },
            appearance: { type: "string", description: "Visible physical details reserved for portrait generation when the character appears." }
          }
        }
      }
    }
  }
};

const CHARACTER_TOOL = {
  name: "compose_character",
  description: "Return a player character's name, personality, and background.",
  parameters: {
    type: "object",
    required: ["characterName", "personality", "background"],
    properties: {
      characterName: { type: "string" },
      personality: { type: "string", description: "1 paragraph outlining traits, quirks, flaws." },
      background: { type: "string", description: "A background backstory (1-2 paragraphs)." }
    }
  }
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, prompt, title, joinCode, characterName, rulesMode: rulesModeParam, campaignType: campaignTypeParam } = body;
    const seedTitle = typeof title === "string" ? title.trim() : "";

    let campaignType = campaignTypeParam === "dnd" ? "dnd" : "tabletop";
    let rulesMode = rulesModeParam === "full" ? "full" : "casual";
    if (joinCode) {
      const campaign = await findCampaignByJoinCode(joinCode);
      if (campaign) {
        campaignType = campaign.campaignType === "dnd" ? "dnd" : "tabletop";
        rulesMode = campaign.rulesMode === "full" ? "full" : "casual";
      }
    }
    if (campaignType !== "dnd") rulesMode = "casual";
    const isDndCampaign = campaignType === "dnd";
    const isFullRules = isDndCampaign && rulesMode === "full";
    const tabletopGuard = "This is a standard tabletop RPG, not D&D. Preserve the user's implied genre, era, and tone. Do not add fantasy races, classes, medieval adventuring gear, spell slots, standard D&D attributes, or D&D mechanics unless the prompt explicitly includes them.";
    const npcGenreGuard = isDndCampaign
      ? "This is a Dungeons & Dragons campaign. Use setting-appropriate fantasy, but keep mechanics out of this description in rules-light mode."
      : tabletopGuard;

    if (type === "campaign") {
      let systemInstruction = "";
      let userPrompt = "";

      // A title the user typed is theirs. Keep it verbatim and treat it as the
      // thematic seed the story must grow from.
      const titleDirective = seedTitle
        ? ` IMPORTANT: The user has already chosen the campaign title: "${seedTitle}". You MUST return this EXACT title, unchanged, in the 'title' field. Treat it as the thematic seed: write the Starting Background Story so it embodies, explains, and lives up to this title.`
        : "";

      if (!prompt || !prompt.trim()) {
        systemInstruction = isFullRules
          ? "You are a professional Dungeons & Dragons adventure designer. Generate a creative starting D&D campaign scenario. Provide title and startingStory (about 3 paragraphs) outlining the setting, initial quest/threat, and atmosphere. Leave player decisions and outcomes open."
          : isDndCampaign
            ? "You are a professional Dungeons & Dragons adventure designer. Generate a creative starting D&D campaign scenario with approachable, rules-light handling. Provide title and startingStory (about 3 paragraphs) outlining the setting, initial quest/threat, and atmosphere. Leave player decisions and outcomes open."
            : `You are a professional tabletop RPG adventure designer. Generate a creative starting campaign scenario. ${tabletopGuard} Provide title and startingStory (about 3 paragraphs) outlining the setting, initial quest/threat, and atmosphere. Leave player decisions and outcomes open.`;
        userPrompt = seedTitle
          ? `Generate a new starting campaign for the title "${seedTitle}".`
          : "Generate a new starting campaign.";
        serverLog("API generate", `Generating new campaign title and backstory (${rulesMode} rules)${seedTitle ? ` from title "${seedTitle}"` : ""}`);
      } else {
        systemInstruction = isFullRules
          ? "You are a professional Dungeons & Dragons adventure designer. Deepen this starting story while retaining its core D&D elements, ideas, and setting. Provide title and startingStory. Establish a playable opening without deciding the players' actions or the ending."
          : isDndCampaign
            ? "You are a professional Dungeons & Dragons adventure designer. Deepen this starting story while preserving its premise and keeping it approachable and rules-light. Provide title and startingStory. Establish a playable opening without deciding the players' actions or the ending."
            : `You are a professional tabletop RPG adventure designer. Deepen this starting story while retaining its core ideas, genre, era, and setting. ${tabletopGuard} Provide title and startingStory. Establish a playable opening without deciding the players' actions or the ending.`;
        userPrompt = `Original draft to improve: "${prompt}"`;
        serverLog("API generate", `Improving campaign backstory (${rulesMode} rules): "${prompt.slice(0, 80)}..."`);
      }

      systemInstruction += titleDirective;

      const result = await callStructured(systemInstruction, userPrompt, CAMPAIGN_TOOL, "Campaign", seedTitle ? ["title"] : []);
      // The user's chosen title is non-negotiable — enforce it verbatim.
      if (result && seedTitle) result.title = seedTitle;
      if (!result || !result.title || !result.startingStory) {
        serverError("API generate", "AI did not return a valid campaign structure.");
        throw new Error("AI did not return a valid campaign JSON structure");
      }

      serverLog("API generate", `Successfully generated/improved campaign title: "${result.title}"`);
      return NextResponse.json({ result });

    } else if (type === "plan_cast") {
      const length = ["short", "medium", "long", "infinite"].includes(String(body.campaignLength || ""))
        ? String(body.campaignLength)
        : "auto";
      const sizeGuide = length === "short" ? "3 to 4" : length === "long" ? "6 to 8" : length === "infinite" ? "4 to 6 for the first arc" : "4 to 6";
      serverLog("API generate", `Planning private NPC cast (${rulesMode} rules, ${length} length): "${(prompt || "").slice(0, 80)}..."`);
      const systemInstruction = `You are a professional ${isDndCampaign ? "Dungeons & Dragons" : "tabletop RPG"} adventure designer. Build a PRIVATE cast plan for the campaign below. ${npcGenreGuard}
Campaign title: "${seedTitle || "Untitled Adventure"}"
Campaign premise: "${prompt || ""}"
Campaign length: ${length}

Create ${sizeGuide} distinct recurring or consequential NPCs across the planned arc. Include a useful mix of allies, enemies, neutral figures, rivals, contacts, authorities, and wildcards as the premise needs. At least one should suit the opening, but not every NPC should appear immediately.
${prompt ? "" : "The premise is intentionally sealed. Invent a coherent implied setting and conflict through this cast so the opening can grow around them without exposing it during setup."}

For each character provide name, biography, traits, current motive, initial disposition, story role, broad arrival window, a flexible fictional introduction trigger, and visible physical appearance. Disposition is only an initial attitude and can change through play. Arrival is guidance, not a railroad: never use fixed turn numbers, and allow player choices to delay, advance, transform, or prevent an appearance. Do not reveal hidden identities, allegiances, betrayals, or future events in visible dialogue before they are earned.`;

      const result = await callStructured(
        systemInstruction,
        `Plan the private NPC cast for this ${isDndCampaign ? "D&D" : "tabletop RPG"} campaign.`,
        CAST_PLAN_TOOL,
        "Cast plan"
      );
      if (!result || !Array.isArray(result.cast)) {
        serverError("API generate", "AI did not return a valid cast plan.");
        throw new Error("AI did not return a valid cast plan");
      }

      serverLog("API generate", `Successfully planned ${result.cast.length} NPCs`);
      return NextResponse.json({ result });

    } else if (type === "character") {
      // Find campaign details
      let campaignTitle = isDndCampaign ? "A D&D Adventure" : "A Tabletop RPG Campaign";
      let campaignBackstory = isDndCampaign ? "A group of adventurers embarking on a perilous quest." : "A group of protagonists entering an uncertain situation.";
      let existingPartyContext = "";

      if (joinCode) {
        const campaign = await findCampaignByJoinCode(joinCode);
        if (campaign) {
          campaignTitle = campaign.title;
          campaignBackstory = campaign.startingStory;
          rulesMode = campaign.rulesMode === "full" ? "full" : "casual";

          const existingNames: string[] = [];
          for (const p of campaign.players) {
            const details = [
              p.characterName ? `Character Name: ${p.characterName}` : "",
              p.background ? `Background: ${p.background}` : "",
              p.personality ? `Personality: ${p.personality}` : ""
            ].filter(Boolean).join(", ");
            if (details) {
              existingNames.push(`- Player character: ${details}`);
            }
          }
          for (const npc of campaign.storyCharacters) {
            existingNames.push(`- NPC character: Name: ${npc.name}, Description: ${npc.description}`);
          }
          if (existingNames.length > 0) {
            existingPartyContext = `\n\nThe following characters are ALREADY present in the adventure. You MUST NOT duplicate their names, concepts, backstories, or roles. Ensure the generated character is unique and distinct:\n${existingNames.join("\n")}`;
          }
        }
      }

      let systemInstruction = "";
      let userPrompt = "";

      // A name the player typed is theirs to keep — the Oracle weaves the
      // personality and background around it and the campaign, but never
      // renames them.
      const keepName = typeof characterName === "string" && !!characterName.trim();
      const draftPersonality = typeof body.personality === "string" ? body.personality.trim() : "";
      const nameDirective = keepName
        ? ` IMPORTANT: The player has chosen the character's name: "${characterName.trim()}". You MUST return this EXACT name, unchanged, in the 'characterName' field. Do not rename or "improve" it. Build the personality and background around this name and the campaign setting.`
        : "";
      // Weave (rather than generate from scratch) whenever the player gave us
      // anything to work from — a name, a personality note, or a backstory seed.
      const hasDraft = keepName || !!draftPersonality || !!(prompt && prompt.trim());

      if (!hasDraft) {
        systemInstruction = isDndCampaign
          ? `You are a professional D&D writer. Based on the following campaign setting, write a compelling character name, a personality description (1 paragraph outlining traits, quirks, flaws), and a background backstory (1-2 paragraphs) for a player joining the campaign. ${isFullRules ? "Full D&D 5e character concepts are welcome." : "Keep D&D concepts approachable and rules-light."}
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Provide characterName, personality, and background. Leave future choices to the player.`
          : `You are a professional tabletop RPG writer. Based on the following campaign setting, write a compelling character name, a personality description (1 paragraph outlining traits, quirks, flaws), and a background backstory (1-2 paragraphs) for a player joining the campaign. ${tabletopGuard} Focus purely on story, role, vibe, and personality traits.
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Provide characterName, personality, and background. Leave future choices to the player.`;
        userPrompt = "Generate a new character name, personality, and backstory.";
        serverLog("API generate", `Generating starting character for campaign: "${campaignTitle}" (${rulesMode} rules)`);
      } else {
        systemInstruction = isDndCampaign
          ? `You are a professional D&D writer. Based on the following campaign setting, write or deepen the player's character personality and background backstory, using whatever partial drafts they provide below (they may give only a name). Make them detailed, thematic, and immersive, weaving the character into the campaign and reading the existing cast so they fit alongside them. Keep the player's core identity. Suggest a fitting character name only if none is provided. ${isFullRules ? "Full D&D 5e character concepts are welcome." : "Keep D&D concepts approachable and rules-light."}
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Provide characterName, personality, and background. Leave future choices to the player.`
          : `You are a professional tabletop RPG writer. Based on the following campaign setting, write or deepen the player's character personality and background backstory, using whatever partial drafts they provide below (they may give only a name). Make them detailed, thematic, and immersive, weaving the character into the campaign and reading the existing cast so they fit alongside them. Keep the player's core identity. ${tabletopGuard} Focus purely on story, role, vibe, and personality traits. Suggest a fitting character name only if none is provided.
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Provide characterName, personality, and background. Leave future choices to the player.`;
        userPrompt = `Character name draft: "${characterName || ""}"\nCharacter personality draft: "${body.personality || ""}"\nCharacter background draft: "${prompt || ""}"`;
        serverLog("API generate", `Weaving character for: "${characterName || "Unnamed character"}" (${rulesMode} rules)`);
      }

      systemInstruction += nameDirective;

      const result = await callStructured(systemInstruction, userPrompt, CHARACTER_TOOL, "Character", keepName ? ["characterName"] : []);
      // The player's chosen name is non-negotiable — enforce it even if the
      // model drifted or dropped the field.
      if (result && keepName) result.characterName = characterName.trim();
      if (!result || !result.characterName || !result.background) {
        serverError("API generate", "AI did not return a valid character structure.");
        throw new Error("AI did not return a valid character JSON structure");
      }

      serverLog("API generate", `Successfully generated/improved character name: "${result.characterName}"`);
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
  } catch (error) {
    serverError("API generate", "Generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown generation error" }, { status: 500 });
  }
}
