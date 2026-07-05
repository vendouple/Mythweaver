export const MAX_AQUA_INPUT_CHARS = 800_000;
export const SAFE_AQUA_INPUT_CHARS = 720_000;

export function trimToBudget(parts: string[], budget = SAFE_AQUA_INPUT_CHARS) {
  const kept: string[] = [];
  let total = 0;

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (total + part.length > budget) break;
    kept.unshift(part);
    total += part.length;
  }

  return kept;
}
