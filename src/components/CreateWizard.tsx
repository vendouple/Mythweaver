"use client";

import { useState } from "react";
import { api, Campaign } from "@/lib/client/api";
import CosmosCanvas from "@/components/three/CosmosCanvas";
import { createId } from "@/lib/utils/ids";

type PlannedNpc = {
  id: string;
  name: string;
  biography: string;
  traits: string[];
  motive: string;
  disposition: "friendly" | "neutral" | "suspicious" | "hostile" | "conflicted";
  role: string;
  arrival: "opening" | "early" | "middle" | "late";
  introductionTrigger: string;
  appearance: string;
};
type Step = 0 | 1 | 2 | 3;
type CastVisibility = "sealed" | "revealed";

const LENGTHS: Array<{ value: string; label: string; sub: string }> = [
  { value: "auto", label: "Let Fate Decide", sub: "The Weaver paces the tale" },
  { value: "short", label: "One Evening", sub: "A tight, sharp tale" },
  { value: "medium", label: "A Few Nights", sub: "Room for detours" },
  { value: "long", label: "A Long Road", sub: "A proper campaign" },
  { value: "infinite", label: "Endless", sub: "It ends when you stop" }
];

const STEP_NAMES = ["The Discipline", "The Premise", "The Summons"];

/**
 * Three visible phases raise a table. Private cast planning happens behind the
 * premise before the host speaks the summons.
 */
export default function CreateWizard({
  onBack,
  onCreated,
  voiceServer
}: {
  onBack: () => void;
  onCreated: (campaign: Campaign) => void;
  voiceServer?: { host: string; port: number; voiceId?: string };
}) {
  const [step, setStep] = useState<Step>(0);
  const [campaignType, setCampaignType] = useState<"tabletop" | "dnd">("tabletop");
  const [rulesMode, setRulesMode] = useState<"casual" | "full">("casual");
  const [campaignLength, setCampaignLength] = useState("auto");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "insane">("medium");
  const [rollMode, setRollMode] = useState<"light" | "standard" | "heavy" | "all">("standard");
  const [surprise, setSurprise] = useState(false);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [castPlan, setCastPlan] = useState<PlannedNpc[]>([]);
  const [castVisibility, setCastVisibility] = useState<CastVisibility | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleStep = step === 0 ? 0 : step === 3 ? 2 : 1;

  const oracle = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Oracle fell silent. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const generatePremise = () =>
    oracle("premise", async () => {
      const trimmedTitle = title.trim();
      const { result } = await api.generate({
        type: "campaign",
        prompt: story.trim() || undefined,
        title: trimmedTitle || undefined,
        campaignType,
        rulesMode
      });
      // A title the user typed is theirs to keep — the Oracle only names the
      // tale when the field was left blank. The story is always (re)written.
      setTitle(trimmedTitle || String(result.title || ""));
      setStory(String(result.startingStory || ""));
    });

  const planCast = (visibility: CastVisibility) =>
    oracle("cast", async () => {
      const { result } = await api.generate({
        type: "plan_cast",
        prompt: story,
        title,
        campaignLength,
        campaignType,
        rulesMode
      });
      const planned = (Array.isArray(result.cast) ? result.cast : []).map((npc: Record<string, unknown>) => ({
        id: createId("planned-npc"),
        name: String(npc.name || "Stranger"),
        biography: String(npc.biography || ""),
        traits: Array.isArray(npc.traits) ? npc.traits.map(String).filter(Boolean) : [],
        motive: String(npc.motive || ""),
        disposition: (["friendly", "neutral", "suspicious", "hostile", "conflicted"].includes(String(npc.disposition))
          ? String(npc.disposition)
          : "neutral") as PlannedNpc["disposition"],
        role: String(npc.role || "wildcard"),
        arrival: (["opening", "early", "middle", "late"].includes(String(npc.arrival))
          ? String(npc.arrival)
          : "early") as PlannedNpc["arrival"],
        introductionTrigger: String(npc.introductionTrigger || ""),
        appearance: String(npc.appearance || "")
      }));
      if (!planned.length) throw new Error("The Oracle returned an empty cast plan. Try again.");
      setCastPlan(planned);
      setCastVisibility(visibility);
      setConfirmReveal(false);
      if (visibility === "sealed") setStep(3);
    });

  const summon = () =>
    oracle("summon", async () => {
      const { campaign } = await api.createCampaign({
        title: surprise ? "" : title,
        startingStory: surprise ? "" : story,
        castPlan,
        isRandomized: surprise,
        campaignLength,
        campaignType,
        rulesMode: campaignType === "dnd" ? rulesMode : "casual",
        difficulty,
        rollMode,
        ttsServerHost: voiceServer?.host,
        ttsServerPort: voiceServer?.port,
        ttsVoiceId: voiceServer?.voiceId
      });
      onCreated(campaign);
    });

  const canAdvance =
    step === 0 ? true :
    step === 1 ? (surprise || story.trim().length > 0 || title.trim().length > 0) :
    step === 2 ? castVisibility !== null && castPlan.length > 0 :
    true;

  const next = () => {
    if (step === 1) {
      setCastPlan([]);
      setCastVisibility(null);
      setConfirmReveal(false);
    }
    setStep((s) => Math.min(3, s + 1) as Step);
  };
  const back = () => {
    if (step === 0) {
      onBack();
    } else {
      setStep((s) => Math.max(0, s - 1) as Step);
    }
  };

  return (
    <div className="wizard screen">
      <CosmosCanvas drama={0.35} />
      <div className="portal-veil" />

      <div className="wizard-frame panel">
        <header className="wizard-head">
          <button className="ghost-button" aria-label="Back" disabled={busy !== null} onClick={back}>←</button>
          <div className="wizard-steps">
            {STEP_NAMES.map((name, index) => (
              <span key={name} className={`wizard-step ${index === visibleStep ? "current" : index < visibleStep ? "done" : ""}`}>
                {name}
              </span>
            ))}
          </div>
        </header>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        {step === 0 ? (
          <section className="wizard-body">
            <h2 className="panel-title">Choose the discipline</h2>
            <div className="choice-grid">
              <button className={`choice-card ${campaignType === "tabletop" ? "selected" : ""}`} aria-pressed={campaignType === "tabletop"} onClick={() => setCampaignType("tabletop")}>
                <span className="choice-title">Story Engine</span>
                <span className="choice-sub">Any genre — noir, sci-fi, horror, heists, slice of life. Rules melt into the fiction.</span>
              </button>
              <button className={`choice-card ${campaignType === "dnd" ? "selected" : ""}`} aria-pressed={campaignType === "dnd"} onClick={() => setCampaignType("dnd")}>
                <span className="choice-title">Dungeons & Dragons</span>
                <span className="choice-sub">Swords, spells, and dungeon-crawling heroics.</span>
              </button>
            </div>

            {campaignType === "dnd" ? (
              <div className="choice-row">
                <button className={`chip-toggle ${rulesMode === "casual" ? "selected" : ""}`} aria-pressed={rulesMode === "casual"} onClick={() => setRulesMode("casual")}>
                  Rules-light <em>HP and heart, no bookkeeping</em>
                </button>
                <button className={`chip-toggle ${rulesMode === "full" ? "selected" : ""}`} aria-pressed={rulesMode === "full"} onClick={() => setRulesMode("full")}>
                  Full 5e <em>Stats, classes, spell slots</em>
                </button>
              </div>
            ) : null}

            <h3 className="panel-subtitle">How long should the tale run?</h3>
            <div className="choice-row wrap">
              {LENGTHS.map((length) => (
                <button
                  key={length.value}
                  className={`chip-toggle ${campaignLength === length.value ? "selected" : ""}`}
                  aria-pressed={campaignLength === length.value}
                  onClick={() => setCampaignLength(length.value)}
                >
                  {length.label} <em>{length.sub}</em>
                </button>
              ))}
            </div>

            <h3 className="panel-subtitle">How hard should fate push?</h3>
            <div className="choice-row wrap">
              {([
                { value: "easy", label: "Easy", sub: "Forgiving DCs, partials" },
                { value: "medium", label: "Medium", sub: "Balanced" },
                { value: "hard", label: "Hard", sub: "Tougher, no partials" },
                { value: "insane", label: "Insane", sub: "Brutal, lethal" }
              ] as const).map((d) => (
                <button
                  key={d.value}
                  className={`chip-toggle ${difficulty === d.value ? "selected" : ""}`}
                  aria-pressed={difficulty === d.value}
                  onClick={() => setDifficulty(d.value)}
                >
                  {d.label} <em>{d.sub}</em>
                </button>
              ))}
            </div>

            <h3 className="panel-subtitle">How often do the dice speak?</h3>
            <div className="choice-row wrap">
              {([
                { value: "light", label: "Light", sub: "Climactic only" },
                { value: "standard", label: "Standard", sub: "Meaningful risk" },
                { value: "heavy", label: "Heavy", sub: "Most contested acts" },
                { value: "all", label: "All", sub: "Nearly every uncertainty" }
              ] as const).map((m) => (
                <button
                  key={m.value}
                  className={`chip-toggle ${rollMode === m.value ? "selected" : ""}`}
                  aria-pressed={rollMode === m.value}
                  onClick={() => setRollMode(m.value)}
                >
                  {m.label} <em>{m.sub}</em>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="wizard-body">
            <h2 className="panel-title">The premise</h2>
            <label className={`surprise-toggle ${surprise ? "selected" : ""}`}>
              <input type="checkbox" checked={surprise} onChange={(event) => setSurprise(event.target.checked)} />
              <span className="surprise-rune" aria-hidden>☄</span>
              <span>
                <strong>Sealed Envelope</strong>
                <em>Nobody — not even you — knows the tale until the table lights up. The Weaver invents everything.</em>
              </span>
            </label>

            {!surprise ? (
              <>
                <input
                  className="field"
                  aria-label="Campaign title"
                  placeholder="Title of the legend (optional — the Oracle can name it)"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <textarea
                  className="field textarea"
                  aria-label="Starting story"
                  rows={9}
                  placeholder="Where does it begin? A rain-slick megacity, a manor with one locked door, a caravan crossing dead salt flats… Write a seed or a saga — or leave it to the Oracle."
                  value={story}
                  onChange={(event) => setStory(event.target.value)}
                />
                <div className="choice-row">
                  <button className="oracle-button" disabled={busy !== null} onClick={generatePremise}>
                    {busy === "premise" ? "The Oracle writes…" : story.trim() ? "✦ Let the Oracle deepen it" : "✦ Let the Oracle write it"}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="wizard-body">
            <h2 className="panel-title">Behind the curtain</h2>
            {!castVisibility ? (
              <>
                <p className="panel-hint">The Weaver will plan the allies, enemies, and uncertain souls who may cross the party&apos;s path. Choose whether their identities remain hidden.</p>
                <div className="choice-grid cast-privacy-grid">
                  <button className="choice-card selected" disabled={busy !== null} onClick={() => planCast("sealed")}>
                    <span className="choice-title">Keep the cast sealed</span>
                    <span className="choice-sub">Recommended. The plan stays behind the curtain and characters reveal themselves naturally in play.</span>
                  </button>
                  <button className="choice-card" disabled={busy !== null} onClick={() => setConfirmReveal(true)}>
                    <span className="choice-title">Reveal and edit the cast</span>
                    <span className="choice-sub">Review biographies, traits, loyalties, and likely arrival points before the campaign begins.</span>
                  </button>
                </div>
                {confirmReveal ? (
                  <div className="spoiler-confirm" role="alertdialog" aria-labelledby="cast-spoiler-title">
                    <strong id="cast-spoiler-title">This opens the sealed plan.</strong>
                    <p>You may see future allies, enemies, hidden motives, and arrivals before the party meets them.</p>
                    <div className="choice-row">
                      <button className="primary-button" disabled={busy !== null} onClick={() => planCast("revealed")}>Reveal and generate</button>
                      <button className="ghost-button" disabled={busy !== null} onClick={() => setConfirmReveal(false)}>Keep it sealed</button>
                    </div>
                  </div>
                ) : null}
                {busy === "cast" ? <p className="cast-weaving">The Weaver is plotting entrances, loyalties, and hidden motives…</p> : null}
              </>
            ) : castVisibility === "sealed" ? (
              <>
                <div className="sealed-cast-state">
                  <span className="surprise-rune" aria-hidden>✦</span>
                  <div>
                    <strong>The cast is sealed.</strong>
                    <p>{castPlan.length} figures are waiting behind the curtain. They have no portraits and will enter only when the story calls for them.</p>
                  </div>
                </div>
                <button className="ghost-button" disabled={busy !== null} onClick={() => setConfirmReveal(true)}>Reveal the plan instead</button>
                {confirmReveal ? (
                  <div className="spoiler-confirm" role="alertdialog" aria-labelledby="sealed-cast-spoiler-title">
                    <strong id="sealed-cast-spoiler-title">This cannot restore the surprise.</strong>
                    <p>You will see future allies, enemies, hidden motives, and likely arrivals.</p>
                    <div className="choice-row">
                      <button className="primary-button" onClick={() => { setCastVisibility("revealed"); setConfirmReveal(false); }}>Reveal the cast</button>
                      <button className="ghost-button" onClick={() => setConfirmReveal(false)}>Leave it sealed</button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : castVisibility === "revealed" ? (
              <>
                <p className="panel-hint">These are private possibilities, not a fixed script. Change any detail; portraits wait until each character enters the story.</p>
                <div className="npc-list cast-plan-list">
                  {castPlan.map((npc, index) => (
                    <article key={npc.id} className="npc-row cast-plan-card">
                      <div className="npc-row-top">
                        <input className="field slim" aria-label={`Planned NPC ${index + 1} name`} value={npc.name} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                        <select className="field slim" aria-label={`${npc.name} disposition`} value={npc.disposition} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, disposition: event.target.value as PlannedNpc["disposition"] } : item))}>
                          <option value="friendly">Friendly</option>
                          <option value="neutral">Neutral</option>
                          <option value="suspicious">Suspicious</option>
                          <option value="hostile">Hostile</option>
                          <option value="conflicted">Conflicted</option>
                        </select>
                        <select className="field slim" aria-label={`${npc.name} arrival`} value={npc.arrival} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, arrival: event.target.value as PlannedNpc["arrival"] } : item))}>
                          <option value="opening">Opening</option>
                          <option value="early">Early</option>
                          <option value="middle">Middle</option>
                          <option value="late">Late</option>
                        </select>
                      </div>
                      <div className="cast-plan-grid">
                        <label><span>Role</span><input className="field slim" value={npc.role} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} /></label>
                        <label><span>Traits</span><input className="field slim" value={npc.traits.join(", ")} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, traits: event.target.value.split(",").map((trait) => trait.trim()).filter(Boolean) } : item))} /></label>
                        <label className="wide"><span>Biography</span><textarea className="field textarea slim" rows={3} value={npc.biography} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, biography: event.target.value } : item))} /></label>
                        <label className="wide"><span>Motive</span><textarea className="field textarea slim" rows={2} value={npc.motive} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, motive: event.target.value } : item))} /></label>
                        <label className="wide"><span>Introduction trigger</span><textarea className="field textarea slim" rows={2} value={npc.introductionTrigger} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, introductionTrigger: event.target.value } : item))} /></label>
                        <label className="wide"><span>Appearance</span><textarea className="field textarea slim" rows={2} value={npc.appearance} onChange={(event) => setCastPlan((prev) => prev.map((item, i) => i === index ? { ...item, appearance: event.target.value } : item))} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="wizard-body">
            <h2 className="panel-title">Speak the summons</h2>
            <div className="summons-review">
              <div className="summons-line"><span>Discipline</span><strong>{campaignType === "dnd" ? `Dungeons & Dragons — ${rulesMode === "full" ? "full 5e" : "rules-light"}` : "Story Engine"}</strong></div>
              <div className="summons-line"><span>Length</span><strong>{LENGTHS.find((l) => l.value === campaignLength)?.label}</strong></div>
              <div className="summons-line"><span>Difficulty</span><strong>{difficulty}</strong></div>
              <div className="summons-line"><span>Dice</span><strong>{rollMode}</strong></div>
              {surprise ? (
                <div className="summons-line"><span>Premise</span><strong>Sealed — revealed at the table</strong></div>
              ) : (
                <>
                  <div className="summons-line"><span>Title</span><strong>{title.trim() || "The Oracle will name it"}</strong></div>
                  <div className="summons-line"><span>Premise</span><strong>{story.trim() ? `${story.trim().slice(0, 160)}${story.trim().length > 160 ? "…" : ""}` : "Woven from the party's characters"}</strong></div>
                </>
              )}
              <div className="summons-line"><span>Cast</span><strong>{castVisibility === "revealed" ? `${castPlan.length} planned figures reviewed` : "Sealed — revealed through play"}</strong></div>
            </div>
            <button className="summon-button" disabled={busy !== null || !castPlan.length} onClick={summon}>
              {busy === "summon" ? "Raising the table…" : "⟡ Raise the Table"}
            </button>
          </section>
        ) : null}

        {step < 3 && step !== 2 ? (
          <footer className="wizard-foot">
            <button className="primary-button" disabled={!canAdvance || busy !== null} onClick={next}>
              Continue →
            </button>
          </footer>
        ) : null}
        {step === 2 && castVisibility !== null ? (
          <footer className="wizard-foot">
            <button className="primary-button" disabled={!canAdvance || busy !== null} onClick={next}>Continue →</button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
