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

/**
 * Small block-level markdown renderer for DM-authored documents (the quest
 * log). Supports headings, bullet lists, ordered lists, and paragraphs —
 * inline bold and italic marks flow through the engine above. Anything
 * fancier degrades gracefully to a paragraph.
 */
export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let key = 0;
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(<p key={key++} className="md-p">{renderInline(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{renderInline(item)}</li>);
    nodes.push(list.ordered ? <ol key={key++} className="md-list">{items}</ol> : <ul key={key++} className="md-list">{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      nodes.push(
        level <= 2
          ? <h3 key={key++} className="md-h1">{content}</h3>
          : <h4 key={key++} className="md-h2">{content}</h4>
      );
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    // Indented continuation of a list item stays with the list.
    if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return nodes;
}
