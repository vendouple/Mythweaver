import { NextResponse } from "next/server";
import { aquaConfig, aquaFetch } from "@/lib/aqua/client";
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

function parseJsonBlock(content: string) {
  const startIdx = content.indexOf("{");
  const endIdx = content.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }
  try {
    return JSON.parse(content.substring(startIdx, endIdx + 1));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, prompt, joinCode, characterName, rulesMode: rulesModeParam, campaignType: campaignTypeParam } = body;

    const config = aquaConfig();

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

    if (type === "campaign") {
      let systemInstruction = "";
      let userPrompt = "";

      if (!prompt || !prompt.trim()) {
        systemInstruction = isFullRules
          ? "You are a professional Dungeons & Dragons adventure designer. Generate a creative, detailed starting D&D campaign scenario. Suggest a fitting Campaign Title and a detailed Starting Background Story (about 3 paragraphs) outlining the setting, initial quest/threat, and atmosphere. Return the response as a JSON object with keys 'title' and 'startingStory'. Do not include any markdown styling or extra text outside the JSON object."
          : isDndCampaign
            ? "You are a professional Dungeons & Dragons adventure designer. Generate a creative, detailed starting D&D campaign scenario with approachable, rules-light handling. Suggest a fitting Campaign Title and a detailed Starting Background Story (about 3 paragraphs) outlining the setting, initial quest/threat, and atmosphere. Return the response as a JSON object with keys 'title' and 'startingStory'. Do not include any markdown styling or extra text outside the JSON object."
            : `You are a professional tabletop RPG adventure designer. Generate a creative, detailed starting campaign scenario. ${tabletopGuard} Focus on story, vibe, setting, and atmosphere. Suggest a fitting Campaign Title and a detailed Starting Background Story (about 3 paragraphs) outlining the setting, initial quest/threat, and atmosphere. Return the response as a JSON object with keys 'title' and 'startingStory'. Do not include any markdown styling or extra text outside the JSON object.`;
        userPrompt = "Generate a new starting campaign.";
        serverLog("API generate", `Generating new campaign title and backstory (${rulesMode} rules)`);
      } else {
        systemInstruction = isFullRules
          ? "You are a professional Dungeons & Dragons adventure designer. Improve the following D&D campaign starting story draft, making it more detailed, atmospheric, descriptive, and engaging, but retaining the original core D&D elements, ideas, and setting. Also suggest an appropriate, epic Campaign Title. Return the response as a JSON object with keys 'title' and 'startingStory'. Do not include any markdown styling or extra text outside the JSON object."
          : isDndCampaign
            ? "You are a professional Dungeons & Dragons adventure designer. Improve the following D&D campaign starting story draft, making it more detailed, atmospheric, descriptive, and engaging, but keep it approachable and rules-light. Also suggest an appropriate Campaign Title. Return the response as a JSON object with keys 'title' and 'startingStory'. Do not include any markdown styling or extra text outside the JSON object."
            : `You are a professional tabletop RPG adventure designer. Improve the following campaign starting story draft, making it more detailed, atmospheric, descriptive, and engaging, but retaining the original core ideas, genre, era, and setting. ${tabletopGuard} Return the response as a JSON object with keys 'title' and 'startingStory'. Do not include any markdown styling or extra text outside the JSON object.`;
        userPrompt = `Original draft to improve: "${prompt}"`;
        serverLog("API generate", `Improving campaign backstory (${rulesMode} rules): "${prompt.slice(0, 80)}..."`);
      }

      const response = await aquaFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: config.chatModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ]
        })
      }) as any;

      const content = response.choices?.[0]?.message?.content || response.message?.content || "";
      const result = parseJsonBlock(content);
      if (!result || !result.title || !result.startingStory) {
        serverError("API generate", "AI did not return a valid campaign JSON structure. Raw response: " + content.slice(0, 200));
        throw new Error("AI did not return a valid campaign JSON structure");
      }

      serverLog("API generate", `Successfully generated/improved campaign title: "${result.title}"`);
      return NextResponse.json({ result });

    } else if (type === "suggest_npcs") {
      serverLog("API generate", `Suggesting NPCs for campaign backstory (${rulesMode} rules): "${(prompt || "").slice(0, 80)}..."`);
      const systemInstruction = isFullRules
        ? `You are a professional Dungeons & Dragons adventure designer. Based on the following starting campaign background, suggest 3 to 5 interesting NPCs that fit the theme, setting, and plot. Some should be "Starting NPC" (present in the opening scene) and others should be "Future NPC" (to be met later in the adventure).
Campaign Backstory: "${prompt || ""}"

Return the response as a JSON object with a single key 'npcs', which is an array of objects. Each NPC object should have keys:
- 'name': a creative name
- 'description': a short description of who they are, their role/backstory, and how they relate to the campaign
- 'status': either "Starting NPC" or "Future NPC"

Do not include any markdown styling or extra text outside the JSON object.`
        : `You are a professional tabletop RPG adventure designer. Based on the following starting campaign background, suggest 3 to 5 interesting NPCs that fit the theme, setting, genre, era, and plot. Some should be "Starting NPC" (present in the opening scene) and others should be "Future NPC" (to be met later in the adventure). ${tabletopGuard} NPC descriptions must focus purely on story, personality, motive, and role.
Campaign Backstory: "${prompt || ""}"

Return the response as a JSON object with a single key 'npcs', which is an array of objects. Each NPC object should have keys:
- 'name': a creative name
- 'description': a short description of who they are, their role/backstory, and how they relate to the campaign
- 'status': either "Starting NPC" or "Future NPC"

Do not include any markdown styling or extra text outside the JSON object.`;

      const response = await aquaFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: config.chatModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: `Suggest NPCs for this ${isDndCampaign ? "D&D" : "tabletop RPG"} campaign.` }
          ]
        })
      }) as any;

      const content = response.choices?.[0]?.message?.content || response.message?.content || "";
      const result = parseJsonBlock(content);
      if (!result || !Array.isArray(result.npcs)) {
        serverError("API generate", "AI did not return a valid NPC suggestions array. Raw response: " + content.slice(0, 200));
        throw new Error("AI did not return a valid NPC suggestions array");
      }

      serverLog("API generate", `Successfully suggested ${result.npcs.length} NPCs`);
      return NextResponse.json({ result });

    } else if (type === "npc") {
      const startStory = body.startingStory || "";
      const npcName = body.name || "";
      let systemInstruction = "";
      let userPrompt = "";

      if (!prompt || !prompt.trim()) {
        systemInstruction = isFullRules
          ? `You are a professional Dungeons & Dragons writer. Based on the following campaign backstory, write a creative name and a compelling description/backstory (1-2 paragraphs) for a D&D NPC.
Campaign Backstory: "${startStory}"

Return the response as a JSON object with keys 'name' and 'description'. Do not include any markdown styling or extra text outside the JSON object.`
          : `You are a professional tabletop RPG writer. Based on the following campaign backstory, write a creative name and a compelling description/backstory (1-2 paragraphs) for a new NPC. ${tabletopGuard} Focus purely on story, role, personality, motive, and vibe.
Campaign Backstory: "${startStory}"

Return the response as a JSON object with keys 'name' and 'description'. Do not include any markdown styling or extra text outside the JSON object.`;
        userPrompt = "Generate a new NPC name and description.";
        serverLog("API generate", `Generating new NPC name and description (${rulesMode} rules)`);
      } else {
        systemInstruction = isFullRules
          ? `You are a professional Dungeons & Dragons writer. Based on the following campaign backstory, improve the NPC backstory draft to make it more detailed, atmospheric, and immersive. Suggest a fitting name if none is provided or if the current one can be improved.
Campaign Backstory: "${startStory}"

Return the response as a JSON object with keys 'name' and 'description'. Do not include any markdown styling or extra text outside the JSON object.`
          : `You are a professional tabletop RPG writer. Based on the following campaign backstory, improve the NPC backstory draft to make it more detailed, atmospheric, and immersive. ${tabletopGuard} Focus purely on story, role, personality, motive, and vibe. Suggest a fitting name if none is provided or if the current one can be improved.
Campaign Backstory: "${startStory}"

Return the response as a JSON object with keys 'name' and 'description'. Do not include any markdown styling or extra text outside the JSON object.`;
        userPrompt = `NPC name draft: "${npcName}"\nNPC description draft: "${prompt}"`;
        serverLog("API generate", `Improving NPC description draft for name: "${npcName || "Unnamed NPC"}" (${rulesMode} rules)`);
      }

      const response = await aquaFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: config.chatModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ]
        })
      }) as any;

      const content = response.choices?.[0]?.message?.content || response.message?.content || "";
      const result = parseJsonBlock(content);
      if (!result || !result.name || !result.description) {
        serverError("API generate", "AI did not return a valid NPC JSON structure. Raw response: " + content.slice(0, 200));
        throw new Error("AI did not return a valid NPC JSON structure");
      }

      serverLog("API generate", `Successfully generated/improved NPC name: "${result.name}"`);
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

      if (!prompt || !prompt.trim()) {
        systemInstruction = isDndCampaign
          ? `You are a professional D&D writer. Based on the following campaign setting, write a compelling character name, a personality description (1 paragraph outlining traits, quirks, flaws), and a background backstory (1-2 paragraphs) for a player joining the campaign. ${isFullRules ? "Full D&D 5e character concepts are welcome." : "Keep D&D concepts approachable and rules-light."}
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Return the response as a JSON object with keys 'characterName', 'personality', and 'background'. Do not include any markdown styling or extra text outside the JSON object.`
          : `You are a professional tabletop RPG writer. Based on the following campaign setting, write a compelling character name, a personality description (1 paragraph outlining traits, quirks, flaws), and a background backstory (1-2 paragraphs) for a player joining the campaign. ${tabletopGuard} Focus purely on story, role, vibe, and personality traits.
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Return the response as a JSON object with keys 'characterName', 'personality', and 'background'. Do not include any markdown styling or extra text outside the JSON object.`;
        userPrompt = "Generate a new character name, personality, and backstory.";
        serverLog("API generate", `Generating starting character for campaign: "${campaignTitle}" (${rulesMode} rules)`);
      } else {
        systemInstruction = isDndCampaign
          ? `You are a professional D&D writer. Based on the following campaign setting, improve the player's draft character background backstory and personality, making them more detailed, thematic, and immersive. Keep the player's core identity, but weave it beautifully into the campaign. Also suggest a fitting character name if none is provided or if the current one can be improved. ${isFullRules ? "Full D&D 5e character concepts are welcome." : "Keep D&D concepts approachable and rules-light."}
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Return the response as a JSON object with keys 'characterName', 'personality', and 'background'. Do not include any markdown styling or extra text outside the JSON object.`
          : `You are a professional tabletop RPG writer. Based on the following campaign setting, improve the player's draft character background backstory and personality, making them more detailed, thematic, and immersive. Keep the player's core identity, but weave it beautifully into the campaign. ${tabletopGuard} Focus purely on story, role, vibe, and personality traits. Also suggest a fitting character name if none is provided or if the current one can be improved.
Campaign Title: "${campaignTitle}"
Campaign Backstory: "${campaignBackstory}"${existingPartyContext}

Return the response as a JSON object with keys 'characterName', 'personality', and 'background'. Do not include any markdown styling or extra text outside the JSON object.`;
        userPrompt = `Character name draft: "${characterName || ""}"\nCharacter personality draft: "${body.personality || ""}"\nCharacter background draft: "${prompt}"`;
        serverLog("API generate", `Improving character draft for: "${characterName || "Unnamed character"}" (${rulesMode} rules)`);
      }

      const response = await aquaFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: config.chatModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ]
        })
      }) as any;

      const content = response.choices?.[0]?.message?.content || response.message?.content || "";
      const result = parseJsonBlock(content);
      if (!result || !result.characterName || !result.background) {
        serverError("API generate", "AI did not return a valid character JSON structure. Raw response: " + content.slice(0, 200));
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
