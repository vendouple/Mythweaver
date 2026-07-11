"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayEvent } from "@/lib/campaign/types";
import { api, accentColor, clearSeat, createActionId, StoredSeat, useCampaignPoll } from "@/lib/client/api";
import { playSfx } from "@/lib/client/sfx";
import { renderInline, renderMarkdown } from "@/lib/client/markup";
import { ACCENT_THEMES, applyAccent, currentAccent, initAccent } from "@/lib/client/theme";
import DiceTheater, { DiceRollData } from "@/components/three/DiceTheater";
import CosmosCanvas from "@/components/three/CosmosCanvas";

type Tab = "act" | "sheet" | "party" | "quest";

/**
 * Split a sheet entry like "Pattern Recognition: Can spot anomalies…" or
 * "Professional-grade lockpick set (concealed)" into a bold name and a
 * quieter descriptive line, so the sheet reads at a glance.
 */
function splitEntry(entry: string): { name: string; detail?: string } {
  const colon = entry.indexOf(":");
  if (colon > 0 && colon <= 48) {
    const detail = entry.slice(colon + 1).trim();
    if (detail) return { name: entry.slice(0, colon).trim(), detail };
  }
  const paren = entry.match(/^(.{3,}?)\s*\((.+)\)\s*$/);
  if (paren) return { name: paren[1].trim(), detail: paren[2].trim() };
  return { name: entry.trim() };
}

/**
 * The phone becomes the character's talisman: their portrait and pulse up
 * top, the Weaver's latest words in the middle, and their fate — action
 * cards and a free-form voice — under the thumb.
 */
export default function Controller({ seat, onLeave }: { seat: StoredSeat; onLeave: () => void }) {
  const { campaign, refresh, lost } = useCampaignPoll(seat.campaignId, false);
  const [tab, setTab] = useState<Tab>("act");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [miniDice, setMiniDice] = useState<DiceRollData | null>(null);
  const [accent, setAccent] = useState("gold");
  const diceSeenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    setAccent(initAccent() || currentAccent());
  }, []);

  const me = useMemo(
    () => campaign?.players.find((player) => player.id === seat.playerId) || null,
    [campaign?.players, seat.playerId]
  );
  const isLeader = campaign?.partyLeaderId === seat.playerId;
  const color = accentColor(me?.color);
  const weaving = !!campaign?.dmStatus;

  // Play a compact dice cinematic when the Weaver rolls for *this* player.
  useEffect(() => {
    if (!campaign) return;
    if (!diceSeenRef.current) {
      diceSeenRef.current = new Set(campaign.displayEvents.map((event) => event.id));
      return;
    }
    const seen = diceSeenRef.current;
    for (const event of campaign.displayEvents) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      if (event.type === "dice" && event.dice && event.playerId === seat.playerId) {
        setMiniDice({
          id: event.id,
          notation: event.dice.notation,
          reason: event.dice.reason || event.content || "Fate decides",
          rolls: event.dice.rolls,
          modifier: event.dice.modifier,
          total: event.dice.total,
          d20Mode: event.dice.d20Mode,
          dc: event.dice.dc,
          outcome: event.dice.outcome,
          speaker: event.speaker,
          color,
          isNpc: event.dice.isNpc
        });
      }
    }
  }, [campaign, seat.playerId, color]);

  const latestBeat: DisplayEvent | null = useMemo(() => {
    if (!campaign) return null;
    return (
      [...campaign.displayEvents]
        .reverse()
        .find((event) => event.type === "narration" || event.type === "dialogue" || event.type === "system") || null
    );
  }, [campaign]);

  const myActions = campaign && me ? campaign.playerActions[me.id] || [] : [];
  const partyActions = campaign?.partyActions || [];

  const act = async (prompt: string, display?: string) => {
    if (!campaign || !me || sending || weaving) return;
    setSending(true);
    setSendError(null);
    playSfx("send");
    try {
      await api.chat({
        campaignId: campaign.id,
        playerId: me.id,
        action: prompt,
        displayAction: display,
        actionId: createActionId()
      });
      setComposer("");
      await refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The Weaver did not hear you. Try again.");
    } finally {
      setSending(false);
    }
  };

  const begin = async () => {
    if (!campaign) return;
    setStarting(true);
    playSfx("confirm");
    try {
      await api.party({ campaignId: campaign.id, action: "start", playerId: seat.playerId });
      await refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The tale would not begin.");
    } finally {
      setStarting(false);
    }
  };

  const leave = () => {
    clearSeat();
    onLeave();
  };

  /* ------------------------------------------------------------------ */

  if (!campaign || !me) {
    return (
      <div className="controller screen">
        <CosmosCanvas drama={0.4} />
        <div className="portal-veil" />
        <div className="loading-center">
          <span className="forge-circle" aria-hidden />
          <p>{lost ? "The table is unreachable." : !campaign ? "Finding your seat…" : "Your seat is gone — the saga may have been deleted."}</p>
          {(lost || campaign) && <button className="ghost-button" onClick={leave}>Leave the table</button>}
        </div>
      </div>
    );
  }

  // Lobby waiting room --------------------------------------------------
  if (campaign.status === "lobby") {
    const forging = (me.status || "").toLowerCase().includes("generating");
    return (
      <div className="controller screen lobby-wait">
        <CosmosCanvas drama={0.5} accent={me.color ? color : undefined} />
        <div className="portal-veil" />
        <div className="wait-center">
          <div className="wait-portrait" style={{ borderColor: color }}>
            {me.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.portraitUrl} alt={me.characterName || me.name} />
            ) : (
              <span className="forge-circle" aria-hidden />
            )}
          </div>
          <h1 className="wait-name" style={{ color }}>{me.characterName || me.name}</h1>
          <p className="wait-status">
            {forging ? "The Weaver forges your likeness and legend…" : me.status || "Seated. The tale waits."}
          </p>
          {me.background && !forging ? <p className="wait-blurb">{me.background.slice(0, 220)}{me.background.length > 220 ? "…" : ""}</p> : null}

          <div className="wait-party">
            {campaign.players.filter((player) => player.id !== me.id).map((player) => (
              <span key={player.id} className="wait-party-chip" style={{ borderColor: accentColor(player.color) }}>
                {player.characterName || player.name}
              </span>
            ))}
          </div>

          {isLeader ? (
            <button className="summon-button" disabled={starting || forging} onClick={begin}>
              {starting ? "The seal breaks…" : "⟡ Begin the Adventure"}
            </button>
          ) : (
            <p className="wait-hint">The party leader&apos;s phone holds the seal to begin.</p>
          )}
          {sendError ? <div className="form-error">{sendError}</div> : null}
          <button className="ghost-button leave" onClick={leave}>Leave the table</button>
        </div>
      </div>
    );
  }

  // Active controller ----------------------------------------------------
  const hp = me.stats.find((stat) => stat.name.toUpperCase() === "HP");
  const otherStats = me.stats.filter((stat) => stat.name.toUpperCase() !== "HP");
  const npcsMet = campaign.storyCharacters.filter((npc) => npc.portraitUrl || (npc.status && npc.status !== "Future NPC"));

  return (
    <div className="controller screen active" style={{ ["--seat-color" as any]: color }}>
      <header className="talisman">
        <div className="talisman-portrait" style={{ borderColor: color }}>
          {me.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.portraitUrl} alt={me.characterName || me.name} />
          ) : (
            <span className="forge-circle small" aria-hidden />
          )}
        </div>
        <div className="talisman-core">
          <span className="talisman-name" style={{ color }}>{me.characterName || me.name}</span>
          {hp ? (
            <span className="rail-hp big">
              <span className="rail-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (hp.value / Math.max(hp.maxValue, 1)) * 100))}%` }} />
              <span className="rail-hp-text">{hp.value}/{hp.maxValue} HP</span>
            </span>
          ) : null}
          {me.status ? <span className="talisman-status">{me.status}</span> : null}
        </div>
      </header>

      <div className="controller-story">
        {latestBeat ? (
          <>
            {latestBeat.speaker && latestBeat.speaker.toUpperCase() !== "NARRATOR" ? (
              <span className="story-speaker">{latestBeat.speaker}</span>
            ) : null}
            <p className="story-text">{renderInline(latestBeat.content || "")}</p>
          </>
        ) : (
          <p className="story-text muted">{campaign.overview}</p>
        )}
      </div>

      <main className="controller-body">
        {tab === "act" ? (
          <section className="act-panel">
            {weaving ? (
              <div className="weaving-lock">
                <span className="sigil-ring small" aria-hidden />
                <span>{campaign.dmStatus}</span>
              </div>
            ) : (
              <>
                {myActions.length ? (
                  <div className="action-stack">
                    {myActions.map((action, index) => (
                      <button
                        key={`${action.title}-${index}`}
                        className="action-card"
                        disabled={sending}
                        onClick={() => act(action.prompt, action.title)}
                      >
                        <span className="action-glyph" aria-hidden>❯</span>
                        {action.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="panel-hint center">The Weaver has left your path open — write your own move below.</p>
                )}
                {partyActions.length ? (
                  <div className="action-stack party">
                    <span className="action-stack-label">Together</span>
                    {partyActions.map((action, index) => (
                      <button
                        key={`${action.title}-${index}`}
                        className="action-card party"
                        disabled={sending}
                        onClick={() => act(action.prompt, action.title)}
                      >
                        <span className="action-glyph" aria-hidden>❖</span>
                        {action.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            <div className="composer">
              <textarea
                className="field textarea slim"
                rows={2}
                value={composer}
                placeholder={weaving ? "The Weaver is weaving…" : "Speak or act in your own words…"}
                disabled={weaving || sending}
                onChange={(event) => setComposer(event.target.value)}
              />
              <button
                className="primary-button"
                disabled={weaving || sending || !composer.trim()}
                onClick={() => act(composer.trim())}
              >
                {sending ? "…" : "Do it"}
              </button>
            </div>
            {sendError ? <div className="form-error">{sendError}</div> : null}
          </section>
        ) : null}

        {tab === "sheet" ? (
          <section className="sheet-panel">
            {otherStats.length ? (
              <>
                <span className="director-label">Traits</span>
                <div className="stat-grid">
                  {otherStats.map((stat) => (
                    <div key={stat.name} className="stat-cell">
                      <div className="stat-head">
                        <span className="stat-name">{stat.name}</span>
                        <span className="stat-value">{stat.value}/{stat.maxValue}</span>
                      </div>
                      <span className="stat-bar">
                        <span
                          className="stat-bar-fill"
                          style={{
                            width: `${Math.max(0, Math.min(100, (stat.value / Math.max(stat.maxValue, 1)) * 100))}%`,
                            background: accentColor(stat.color, "var(--gold)")
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <span className="director-label">Abilities</span>
            <div className="kit-stack">
              {me.abilities.length ? me.abilities.map((ability, index) => {
                const { name, detail } = splitEntry(ability);
                return (
                  <button key={`${ability}-${index}`} className="kit-card ability" disabled={weaving || sending} onClick={() => { setTab("act"); setComposer(`I use ${name}: `); }}>
                    <span className="kit-head">
                      <span className="kit-glyph" aria-hidden>✧</span>
                      <span className="kit-name">{name}</span>
                      <span className="kit-use" aria-hidden>use ❯</span>
                    </span>
                    {detail ? <span className="kit-detail">{detail}</span> : null}
                  </button>
                );
              }) : <span className="panel-hint">Raw talent only, so far.</span>}
            </div>

            <span className="director-label">Inventory</span>
            <div className="kit-stack">
              {me.inventory.length ? me.inventory.map((item, index) => {
                const { name, detail } = splitEntry(item);
                return (
                  <button key={`${item}-${index}`} className="kit-card" disabled={weaving || sending} onClick={() => { setTab("act"); setComposer(`I use my ${name}: `); }}>
                    <span className="kit-head">
                      <span className="kit-glyph" aria-hidden>✦</span>
                      <span className="kit-name">{name}</span>
                      <span className="kit-use" aria-hidden>use ❯</span>
                    </span>
                    {detail ? <span className="kit-detail">{detail}</span> : null}
                  </button>
                );
              }) : <span className="panel-hint">Empty pockets, big dreams.</span>}
            </div>

            {me.background ? (
              <details className="sheet-fold">
                <summary className="director-label">Backstory</summary>
                <p className="sheet-prose">{me.background}</p>
              </details>
            ) : null}
            {me.personality ? (
              <details className="sheet-fold">
                <summary className="director-label">Personality</summary>
                <p className="sheet-prose">{me.personality}</p>
              </details>
            ) : null}
            {me.notes ? (
              <details className="sheet-fold">
                <summary className="director-label">Notes</summary>
                <p className="sheet-prose small">{me.notes}</p>
              </details>
            ) : null}

            <span className="director-label">Table colors</span>
            <div className="accent-row">
              {ACCENT_THEMES.map((themeOption) => (
                <button
                  key={themeOption.key}
                  className={`accent-swatch ${accent === themeOption.key ? "current" : ""}`}
                  style={{ background: themeOption.swatch }}
                  title={themeOption.label}
                  aria-label={themeOption.label}
                  onClick={() => { applyAccent(themeOption.key); setAccent(themeOption.key); playSfx("tap", 0.5); }}
                />
              ))}
            </div>

            <button className="ghost-button leave" onClick={leave}>Leave the table</button>
          </section>
        ) : null}

        {tab === "party" ? (
          <section className="party-panel">
            {campaign.players.filter((player) => player.id !== me.id).map((player) => {
              const pColor = accentColor(player.color);
              const pHp = player.stats.find((stat) => stat.name.toUpperCase() === "HP");
              return (
                <div key={player.id} className="party-row" style={{ borderColor: `${pColor}55` }}>
                  <div className="party-face">
                    {player.portraitUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.portraitUrl} alt={player.characterName || player.name} />
                    ) : <span className="forge-circle small" aria-hidden />}
                  </div>
                  <div className="party-info">
                    <span className="party-name" style={{ color: pColor }}>
                      {player.characterName || player.name}
                      {campaign.partyLeaderId === player.id ? " ♛" : ""}
                    </span>
                    {pHp ? <span className="party-detail">{pHp.value}/{pHp.maxValue} HP{player.status ? ` · ${player.status}` : ""}</span> : null}
                    {campaign.showPartyInventories && player.inventory.length ? (
                      <span className="party-detail">Carries: {player.inventory.slice(0, 4).join(", ")}</span>
                    ) : null}
                    {campaign.showPartyAbilities && player.abilities.length ? (
                      <span className="party-detail">Knows: {player.abilities.slice(0, 4).join(", ")}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {npcsMet.length ? <span className="director-label">Faces you&apos;ve met</span> : null}
            {npcsMet.map((npc) => (
              <div key={npc.id} className="party-row npc" style={{ borderColor: `${accentColor(npc.color, "#9aa4c0")}44` }}>
                <div className="party-face">
                  {npc.portraitUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={npc.portraitUrl} alt={npc.name} />
                  ) : <span className="party-face-glyph" aria-hidden>?</span>}
                </div>
                <div className="party-info">
                  <span className="party-name" style={{ color: accentColor(npc.color, "#9aa4c0") }}>{npc.name}</span>
                  {npc.status ? <span className="party-detail">{npc.status}</span> : null}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {tab === "quest" ? (
          <section className="quest-panel">
            {campaign.showQuestOnController && campaign.questLog ? (
              <div className="quest-text">{renderMarkdown(campaign.questLog)}</div>
            ) : (
              <p className="panel-hint center">The quest is kept close to the Weaver&apos;s chest.</p>
            )}
          </section>
        ) : null}
      </main>

      <nav className="controller-tabs">
        {([
          ["act", "Act", "❯"],
          ["sheet", "Sheet", "✦"],
          ["party", "Party", "❖"],
          ["quest", "Quest", "⟡"]
        ] as Array<[Tab, string, string]>).map(([key, label, glyph]) => (
          <button key={key} className={`tab-button ${tab === key ? "current" : ""}`} onClick={() => { playSfx("tap", 0.6); setTab(key); }}>
            <span aria-hidden>{glyph}</span>
            {label}
          </button>
        ))}
      </nav>

      {miniDice ? (
        <DiceTheater key={miniDice.id} roll={miniDice} compact onDone={() => setMiniDice(null)} />
      ) : null}
    </div>
  );
}
