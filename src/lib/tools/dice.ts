export type DiceRoll = {
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
};

const dicePattern = /^(\d*)d(\d+)([+-]\d+)?$/i;

export function rollDice(notation: string): DiceRoll {
  const normalized = notation.trim().replace(/\s+/g, "");
  const match = normalized.match(dicePattern);
  if (!match) throw new Error("Dice notation must look like 1d20, 2d6+3, or 4d8-1");

  const count = Number(match[1] || "1");
  const sides = Number(match[2]);
  const modifier = Number(match[3] || "0");

  if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
    throw new Error("Dice count or sides out of allowed range");
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
  return { notation: normalized, rolls, modifier, total };
}

export function rollD20Mode(mode: "normal" | "advantage" | "disadvantage" = "normal") {
  if (mode === "normal") return rollDice("1d20");
  const rolls = [rollDice("1d20").rolls[0], rollDice("1d20").rolls[0]];
  const chosen = mode === "advantage" ? Math.max(...rolls) : Math.min(...rolls);
  return { notation: `1d20 ${mode}`, rolls, modifier: 0, total: chosen };
}
