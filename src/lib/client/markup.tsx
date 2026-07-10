"use client";

import { Fragment, ReactNode } from "react";

/**
 * Tiny inline-markup engine for the Weaver's prose. The DM writes
 * *italics*, **bold**, and ***both*** for cinematic delivery; the stage
 * typewriter needs to count only visible characters, so text is parsed
 * into styled tokens first and sliced by plain length.
 */

export type InlineToken = {
  text: string;
  bold: boolean;
  italic: boolean;
};

const MARKS = /(\*\*\*|\*\*|\*)/;

export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let bold = false;
  let italic = false;
  for (const part of source.split(MARKS)) {
    if (part === "***") {
      bold = !bold;
      italic = !italic;
      continue;
    }
    if (part === "**") {
      bold = !bold;
      continue;
    }
    if (part === "*") {
      italic = !italic;
      continue;
    }
    if (part) tokens.push({ text: part, bold, italic });
  }
  return tokens;
}

export function plainText(tokens: InlineToken[]): string {
  let out = "";
  for (const token of tokens) out += token.text;
  return out;
}

/**
 * Render tokens as React nodes. When `limit` is given, only the first
 * `limit` visible characters are emitted (for typewriter reveals).
 */
export function renderTokens(tokens: InlineToken[], limit = Infinity): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = limit;
  for (let i = 0; i < tokens.length && remaining > 0; i += 1) {
    const token = tokens[i];
    const text = token.text.length > remaining ? token.text.slice(0, remaining) : token.text;
    remaining -= text.length;
    let node: ReactNode = text;
    if (token.italic) node = <em>{node}</em>;
    if (token.bold) node = <strong>{node}</strong>;
    nodes.push(<Fragment key={i}>{node}</Fragment>);
  }
  return nodes;
}

/** One-shot convenience for fully revealed prose. */
export function renderInline(source: string): ReactNode[] {
  return renderTokens(parseInline(source));
}
