"use client";

import { useEffect, useRef, useState } from "react";
import { api, loadSeat, saveSeat, StoredSeat } from "@/lib/client/api";
import CosmosCanvas from "@/components/three/CosmosCanvas";

/** Retry cadence while the opening weave still holds the doors shut. */
const QUEUE_RETRY_MS = 6000;
const QUEUE_MAX_TRIES = 50;

/**
 * The phone's doorway: enter the table code, then shape (or summon) the
 * character you'll carry into the tale.
 */
export default function JoinFlow({
  initialCode,
  onSeated,
  onBack
}: {
  initialCode?: string;
  onSeated: (seat: StoredSeat) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<"code" | "picker" | "character">("code");
  const [code, setCode] = useState(initialCode?.toUpperCase() || "");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tableTitle, setTableTitle] = useState<string | null>(null);
  const [reconnectable, setReconnectable] = useState<{ id: string; name: string; characterName?: string }[]>([]);
  const [name, setName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [background, setBackground] = useState("");
  const [personality, setPersonality] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oldSeat, setOldSeat] = useState<StoredSeat | null>(null);

  useEffect(() => {
    setOldSeat(loadSeat());
  }, []);

  // If the QR carried a code, verify it right away.
  useEffect(() => {
    if (initialCode) checkCode(initialCode.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function checkCode(value: string) {
    setBusy("code");
    setError(null);
    try {
      const { campaigns } = await api.listCampaigns();
      const found = campaigns.find((item) => item.joinCode === value || item.id === value);
      if (!found) {
        setError("No table answers to that code.");
        return;
      }
      setCode(found.joinCode);
      setCampaignId(found.id);
      setTableTitle(found.title);
      await refreshReconnectable(found.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the table.");
    } finally {
      setBusy(null);
    }
  }

  // Who's currently disconnected and reclaimable — lets a returning player pick
  // themselves off a list instead of retyping their name (and risking a form
  // full of blank background/personality boxes overwriting nothing, since
  // rejoin no longer touches those fields anyway). Fails open to the normal
  // creation form if the peek itself errors, so a hiccup here never blocks
  // joining outright.
  async function refreshReconnectable(id: string) {
    try {
      const { reconnectable: list } = await api.peekReconnect(id);
      setReconnectable(list);
      setStep(list.length > 0 ? "picker" : "character");
    } catch {
      setReconnectable([]);
      setStep("character");
    }
  }

  const forgeCharacter = async () => {
    setBusy("forge");
    setError(null);
    try {
      const { result } = await api.generate({
        type: "character",
        joinCode: code,
        prompt: background.trim() || undefined,
        characterName: characterName.trim() || undefined,
        personality: personality.trim() || undefined
      });
      setCharacterName(String(result.characterName || characterName));
      setBackground(String(result.background || background));
      setPersonality(String(result.personality || personality));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Oracle fell silent — try again.");
    } finally {
      setBusy(null);
    }
  };

  // While the opening weave runs, the server holds the doors: the join either
  // waits on the campaign lock or answers "currently starting". Either way the
  // seat is QUEUED here — a patient spinner that retries until the world is
  // ready — instead of surfacing a scary error at the worst moment.
  const queueTries = useRef(0);
  const cancelQueue = useRef(false);

  const performJoin = async (
    joinCall: () => ReturnType<typeof api.join>,
    isRetry: boolean,
    onFail?: (message: string) => void
  ) => {
    if (!isRetry) {
      queueTries.current = 0;
      cancelQueue.current = false;
      setBusy("join");
    }
    setError(null);
    try {
      const { campaignId: joinedId, player, isPartyLeader } = await joinCall();
      if (cancelQueue.current) return;
      const seat: StoredSeat = { campaignId: joinedId, playerId: player.id, name: player.name, isPartyLeader };
      saveSeat(seat);
      onSeated(seat);
    } catch (err) {
      if (cancelQueue.current) return;
      const message = err instanceof Error ? err.message : "The table refused the seat.";
      if (/currently starting/i.test(message) && queueTries.current < QUEUE_MAX_TRIES) {
        queueTries.current += 1;
        setBusy("queued");
        setTimeout(() => {
          if (!cancelQueue.current) performJoin(joinCall, true, onFail);
        }, QUEUE_RETRY_MS);
        return;
      }
      setError(message);
      setBusy(null);
      onFail?.(message);
    }
  };

  const takeSeat = () => {
    if (!name.trim()) {
      setError("Tell the table your name first.");
      return;
    }
    performJoin(
      () =>
        api.join({
          joinCode: code,
          name: name.trim(),
          characterName: characterName.trim(),
          background: background.trim(),
          personality: personality.trim()
        }),
      false
    );
  };

  // Tapped from the reconnect picker — claims a specific disconnected seat by
  // id instead of name-matching. On a 409 (someone else just reconnected as
  // that seat), re-peek so the stale entry disappears from the list.
  const claimSeat = (playerId: string) => {
    performJoin(
      () => api.join({ joinCode: code, rejoinPlayerId: playerId }),
      false,
      (message) => {
        if (/already reconnected/i.test(message) && campaignId) refreshReconnectable(campaignId);
      }
    );
  };

  return (
    <div className="join screen">
      <CosmosCanvas drama={0.45} />
      <div className="portal-veil" />

      <div className="join-frame panel">
        {step === "code" ? (
          <>
            <button className="ghost-button" onClick={onBack}>← Back</button>
            <h1 className="join-title">Join a Table</h1>
            {oldSeat ? (
              <button className="choice-card resume-seat" onClick={() => onSeated(oldSeat)}>
                <span className="choice-title">Return to your seat</span>
                <span className="choice-sub">You were seated as {oldSeat.name} — pick up where you left off.</span>
              </button>
            ) : null}
            <label className="director-label">Table code</label>
            <input
              className="field code-field"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="e.g. K3XT9A"
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && code.length >= 4) checkCode(code);
              }}
            />
            {error ? <div className="form-error">{error}</div> : null}
            <button className="primary-button" disabled={busy !== null || code.length < 4} onClick={() => checkCode(code)}>
              {busy === "code" ? "Knocking…" : "Knock on the door"}
            </button>
          </>
        ) : step === "picker" ? (
          <>
            <button className="ghost-button" onClick={() => setStep("code")}>← Different table</button>
            <h1 className="join-title small">{tableTitle}</h1>
            <p className="panel-hint">A few seats are waiting to be reclaimed — is one of them yours?</p>

            {reconnectable.map((seat) => (
              <button key={seat.id} className="choice-card resume-seat" disabled={busy !== null} onClick={() => claimSeat(seat.id)}>
                <span className="choice-title">{seat.characterName || seat.name}</span>
                <span className="choice-sub">{seat.name}</span>
              </button>
            ))}

            {error ? <div className="form-error">{error}</div> : null}
            {busy === "queued" ? (
              <div className="join-queued">
                <span className="forge-circle small" aria-hidden />
                <p>The world is still being woven — your seat is saved, and you&apos;ll step in the moment it&apos;s ready.</p>
                <button
                  className="ghost-button"
                  onClick={() => {
                    cancelQueue.current = true;
                    setBusy(null);
                  }}
                >
                  Stop waiting
                </button>
              </div>
            ) : null}

            <button className="ghost-button" disabled={busy !== null} onClick={() => setStep("character")}>
              + Start a new character instead
            </button>
          </>
        ) : (
          <>
            <button className="ghost-button" onClick={() => setStep(reconnectable.length > 0 ? "picker" : "code")}>
              {reconnectable.length > 0 ? "← Back" : "← Different table"}
            </button>
            <h1 className="join-title small">{tableTitle}</h1>
            <p className="panel-hint">Who takes this seat?</p>

            <label className="director-label">Your name (the real you)</label>
            <input className="field" value={name} placeholder="e.g. Sam" onChange={(event) => setName(event.target.value)} />

            <label className="director-label">Your character</label>
            <input
              className="field"
              value={characterName}
              placeholder="Character name — or leave blank and be surprised"
              onChange={(event) => setCharacterName(event.target.value)}
            />
            <textarea
              className="field textarea slim"
              rows={3}
              value={background}
              placeholder="Backstory — a sentence is plenty. The Weaver will grow it."
              onChange={(event) => setBackground(event.target.value)}
            />
            <textarea
              className="field textarea slim"
              rows={2}
              value={personality}
              placeholder="Personality — quirks, flaws, fire."
              onChange={(event) => setPersonality(event.target.value)}
            />
            <button className="oracle-button" disabled={busy !== null} onClick={forgeCharacter}>
              {busy === "forge" ? "The Oracle forges…" : "✦ Let the Oracle forge me"}
            </button>

            {error ? <div className="form-error">{error}</div> : null}
            {busy === "queued" ? (
              <div className="join-queued">
                <span className="forge-circle small" aria-hidden />
                <p>The world is still being woven — your seat is saved, and you&apos;ll step in the moment it&apos;s ready.</p>
                <button
                  className="ghost-button"
                  onClick={() => {
                    cancelQueue.current = true;
                    setBusy(null);
                  }}
                >
                  Stop waiting
                </button>
              </div>
            ) : (
              <button className="summon-button" disabled={busy !== null} onClick={() => takeSeat()}>
                {busy === "join" ? "Taking your seat…" : "⟡ Take the Seat"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
