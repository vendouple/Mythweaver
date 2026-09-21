type TurnPayload = Record<string, any> & {
  story: Array<Record<string, any> & { speaker: string; content: string }>;
};

/** Decode the double-encoded fields emitted by some RP model endpoints. */
export function normalizeTurnPayload(raw: unknown): TurnPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = { ...raw } as Record<string, any>;
  for (const key of ["story", "playerActions", "partyActions", "playerUpdates", "npcUpdates"]) {
    if (typeof data[key] !== "string") continue;
    try {
      data[key] = JSON.parse(data[key]);
    } catch {
      // A malformed story string gets one structural recovery attempt below.
    }
  }
  const story = parseStoryArray(data.story);
  if (!story.length && typeof data.narrator === "string" && data.narrator.trim()) {
    story.push({ speaker: data.speaker || "NARRATOR", content: data.narrator, itemUsed: data.itemUsed, abilityUsed: data.abilityUsed, effect: data.effect });
  }
  if (!story.length || story.some((beat) =>
    !beat || typeof beat !== "object" || Array.isArray(beat) ||
    typeof beat.content !== "string" || !beat.content.trim() ||
    (beat.speaker !== undefined && typeof beat.speaker !== "string")
  )) return null;
  for (const key of ["playerUpdates", "npcUpdates"]) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key]) || data[key].some((item: unknown) => !item || typeof item !== "object" || Array.isArray(item))) return null;
    for (const update of data[key]) {
      for (const field of ["inventory", "abilities", "conditions", "stats"]) {
        if (update[field] !== undefined && !Array.isArray(update[field])) return null;
      }
      if (update.stats?.some((stat: any) => !stat || typeof stat !== "object" ||
        typeof stat.name !== "string" || !stat.name.trim() ||
        typeof stat.value !== "number" || !Number.isFinite(stat.value) ||
        (stat.maxValue !== undefined && (typeof stat.maxValue !== "number" || !Number.isFinite(stat.maxValue))))) return null;
    }
  }
  if (data.partyActions !== undefined && !Array.isArray(data.partyActions)) return null;
  if (data.playerActions !== undefined) {
    if (!data.playerActions || typeof data.playerActions !== "object") return null;
    if (Array.isArray(data.playerActions)) {
      if (data.playerActions.some((item: any) => !item || typeof item !== "object" ||
        typeof (item.playerId || item.playerName) !== "string" || !Array.isArray(item.actions))) return null;
    } else if (Object.values(data.playerActions).some((actions) => !Array.isArray(actions))) return null;
  }
  return {
    ...data,
    story: story.map((beat) => ({ ...beat, speaker: beat.speaker?.trim() || "NARRATOR", content: beat.content.trim() }))
  };
}

function parseStoryArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return [];

  // Recover complete beat objects from a double-encoded array with a misplaced
  // closing bracket. Braces inside dialogue must not count as structure.
  const beats: any[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          const obj = JSON.parse(trimmed.slice(start, i + 1));
          if (obj && typeof obj === "object" && ("speaker" in obj || "content" in obj)) beats.push(obj);
        } catch {
          return [];
        }
        start = -1;
      }
    }
  }
  return depth === 0 && !inString ? beats : [];
}

/** Both state tools and final turns must produce the same safe phone labels. */
export function normalizeActions(actions: unknown): Array<{ title: string; prompt: string }> {
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action) => {
    if (typeof action === "string") action = { title: action, prompt: action };
    if (!action || typeof action !== "object" || Array.isArray(action)) return [];
    const title = typeof action.title === "string" ? action.title.trim() : "";
    const prompt = typeof action.prompt === "string" ? action.prompt.trim() : "";
    if (!title && !prompt) return [];
    return [{ title: (title || prompt).replace(/\s+/g, " ").slice(0, 48), prompt: prompt || title }];
  }).slice(0, 4);
}
