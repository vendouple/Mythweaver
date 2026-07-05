import { Campaign } from "./types";
import { trimToBudget } from "@/lib/utils/inputBudget";

const RECENT_TRANSCRIPT_CHARS = 120_000;
const RECENT_MESSAGE_COUNT = 24;
const MAX_MESSAGE_CHARS = 3_000;

export function buildCampaignContext(campaign: Campaign) {
  const playerState = campaign.players.map((player) => ({
    id: player.id,
    name: player.name,
    characterName: player.characterName,
    background: player.background,
    status: player.status,
    portraitUrl: player.portraitUrl,
    isPartyLeader: campaign.partyLeaderId === player.id,
    inventory: player.inventory,
    abilities: player.abilities,
    notes: player.notes
  }));

  const recentMessages = campaign.messages.slice(-RECENT_MESSAGE_COUNT);
  const messageParts = recentMessages.map((message) => {
    const label = `${message.role.toUpperCase()}${message.name ? ` ${message.name}` : ""}`;
    return `${label}: ${summarizeMessage(message.content)}`;
  });
  const recent = trimToBudget(messageParts, RECENT_TRANSCRIPT_CHARS).join("\n\n");

  return [
    `Campaign: ${campaign.title}`,
    `Status: ${campaign.status}`,
    `Campaign Type: ${campaign.campaignType === "dnd" ? "Dungeons & Dragons campaign" : "Standard tabletop RPG campaign (not D&D unless the setup explicitly says so)"}`,
    `Campaign Mode: ${campaign.isRandomized ? "Surprise / Randomized Campaign" : "Normal Campaign"}`,
    `Rules Mode: ${campaign.campaignType === "dnd" ? (campaign.rulesMode === "full" ? "Full D&D 5e" : "D&D-inspired rules-light") : "Rules-light tabletop"}`,
    `Campaign Length Setting: ${campaign.campaignLength || "auto"}`,
    `Starting background story: ${campaign.startingStory || "None provided"}`,
    `Story characters from setup: ${JSON.stringify(campaign.storyCharacters)}`,
    `Player-controlled characters that you must not speak or decide for: ${JSON.stringify(playerState.map((player) => player.characterName || player.name))}`,
    `Players: ${JSON.stringify(playerState)}`,
    `Current scene: ${campaign.currentScene}`,
    `Current TV overview: ${campaign.overview}`,
    `Current per-player controller actions: ${JSON.stringify(campaign.playerActions)}`,
    `Current shared party actions: ${JSON.stringify(campaign.partyActions)}`,
    `Long-term memory: ${campaign.memory || "None yet"}`,
    `Current image URL: ${campaign.currentImageUrl || "None"}`,
    `Previously generated backgrounds (cycle/reuse these instead of generating new ones if appropriate): ${JSON.stringify((campaign.images || []).map(img => ({ id: img.id, url: img.url, prompt: img.prompt })))}`,
    `Previously generated character portraits (cycle/reuse these to change a character's expression/action): ${JSON.stringify((campaign.portraits || []).map(p => ({ id: p.id, url: p.url, prompt: p.prompt, characterName: p.characterName })))}`,
    `Recent TV display events: ${JSON.stringify(campaign.displayEvents.slice(-12))}`,
    `Recent transcript:\n${recent}`
  ].join("\n\n");
}

function summarizeMessage(content: string) {
  let text = content.trim();
  const parsed = tryParseJsonObject(text);
  if (parsed) {
    const summary = compactAssistantJson(parsed);
    if (summary) text = summary;
  }

  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}... [truncated]` : text;
}

function tryParseJsonObject(content: string) {
  const startIdx = content.indexOf("{");
  const endIdx = content.lastIndexOf("}");
  if (startIdx === -1 || endIdx <= startIdx) return null;
  try {
    return JSON.parse(content.slice(startIdx, endIdx + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function compactAssistantJson(data: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof data.title === "string") parts.push(`title=${data.title}`);
  if (typeof data.currentScene === "string") parts.push(`scene=${data.currentScene}`);
  if (typeof data.overview === "string") parts.push(`overview=${data.overview}`);

  if (Array.isArray(data.story)) {
    const story = data.story
      .slice(-4)
      .map((item) => {
        const entry = item as Record<string, unknown>;
        return `${String(entry.speaker || "NARRATOR")}: ${String(entry.content || "")}`;
      })
      .join(" | ");
    if (story) parts.push(`story=${story}`);
  }

  if (Array.isArray(data.playerUpdates) && data.playerUpdates.length) {
    parts.push(`playerUpdates=${data.playerUpdates.length}`);
  }
  if (Array.isArray(data.npcUpdates) && data.npcUpdates.length) {
    parts.push(`npcUpdates=${data.npcUpdates.length}`);
  }

  return parts.join("\n");
}
