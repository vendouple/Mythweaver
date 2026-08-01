import type { DisplayEvent } from "@/lib/campaign/types";

/*
 * The couch TV performs one bite-sized subtitle at a time. When the DM hands
 * us an over-long paragraph, we fan it out into several sequential beats (on
 * sentence, then word, boundaries) so it reads as a run of subtitles instead
 * of forcing an unusable scrollbar onto the television. Emphasis spans are
 * never cut mid-span — we only break where * and ` runs are balanced.
 */
export const BEAT_SPLIT_TARGET = 240; // aim for chunks around this many chars
export const BEAT_SPLIT_MAX = 340; // never let a single TV beat exceed this

function marksBalanced(text: string) {
  return (text.match(/\*/g) || []).length % 2 === 0 && (text.match(/`/g) || []).length % 2 === 0;
}

function hardWrapByWords(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const word of words) {
    const candidate = buf ? `${buf} ${word}` : word;
    if (candidate.length > BEAT_SPLIT_MAX && buf && marksBalanced(buf)) {
      out.push(buf);
      buf = word;
    } else {
      buf = candidate;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function splitLongContent(content: string): string[] {
  const text = content.trim();
  if (text.length <= BEAT_SPLIT_MAX) return [text];
  // Sentence-ish pieces, keeping terminal punctuation; hard-wrap any monster
  // sentence that is itself longer than the max.
  const pieces = text
    .split(/(?<=[.!?…])\s+(?=["'*(\[]?[A-Z0-9])/)
    .flatMap((piece) => (piece.length > BEAT_SPLIT_MAX ? hardWrapByWords(piece) : [piece]));
  const chunks: string[] = [];
  let buf = "";
  for (const piece of pieces) {
    const candidate = buf ? `${buf} ${piece}` : piece;
    if (candidate.length > BEAT_SPLIT_MAX && buf && marksBalanced(buf)) {
      chunks.push(buf);
      buf = piece;
    } else if (candidate.length >= BEAT_SPLIT_TARGET && marksBalanced(candidate)) {
      chunks.push(candidate);
      buf = "";
    } else {
      buf = candidate;
    }
  }
  if (buf.trim()) {
    if (chunks.length && !marksBalanced(buf)) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${buf}`;
    } else {
      chunks.push(buf);
    }
  }
  return chunks.length ? chunks : [text];
}

/**
 * Expand one display event into the beats the chronicle will actually play:
 * long narration/dialogue/action beats fan out into several subtitle-sized
 * beats (each with a stable derived id); everything else passes through.
 */
export function expandDisplayEvent(event: DisplayEvent): DisplayEvent[] {
  const splittable = event.type === "narration" || event.type === "dialogue" || event.type === "playerAction";
  const content = event.content || "";
  if (!splittable || content.length <= BEAT_SPLIT_MAX) return [event];
  const parts = splitLongContent(content);
  if (parts.length <= 1) return [event];
  // A linked effect fires once, on the first sub-beat only.
  return parts.map((part, index) => ({
    ...event,
    id: `${event.id}#${index}`,
    content: part,
    effect: index === 0 ? event.effect : undefined
  }));
}
