# Mythweaver (TableTopRPGAI)

Couch co-op tabletop RPG: the **TV is the stage**, phones are **player controllers**, and an AI Dungeon Master runs the table.

## How to run

1. Copy `.env.example` to `.env` (or fill in your existing `.env`) with Aqua / model keys.
2. `npm install`
3. `npm run dev`
4. Open **http://localhost:3000** on the host (TV/PC) and on phones on the same network (use the machine's LAN IP if needed).

## Play loop

1. **Host** creates a campaign (or resumes one from the Archive).
2. Players **join with the code** on their phones.
3. Host starts the table; the Weaver paints the opening scene and hands out controller choices.
4. Players pick actions; the DM resolves risk with server-side dice, updates state, and drives music/effects on the TV.

## Campaign setup options

When raising a table you can choose:

| Option | Values | What it does |
|--------|--------|--------------|
| **Discipline** | Story Engine / D&D (rules-light or full 5e) | Genre + rules flavor |
| **Difficulty** | easy · medium · hard · insane | Shifts DCs (−2 / 0 / +2 / +4). Easy/medium allow **partial successes**; hard/insane do not. |
| **Dice (roll mode)** | light · standard · heavy · all | How often the DM calls for checks |
| **Length** | auto / one evening / few nights / long / endless | Pacing hint for the Weaver |
| **Sealed Envelope** | on/off | Surprise premise invented at the table |

## Dice & combat

- Rolls are **server-true random** via `roll_dice` — the DM never invents numbers.
- Full outcome spectrum: **critical success · strong success · success · partial success · failure · hard failure · critical failure**.
- **Enemy/NPC rolls** use the same dice theater on the TV (`isNpc`).
- Chain rolls in one turn (attack → damage, multi-enemy, contested checks).
- HP and traits update through campaign state after harm/healing.

## Endings & credits

- Campaigns can end with **victory**, **defeat**, **bittersweet**, or **escape** — including **early** ends (TPK, sudden win, escape).
- `end_campaign` seals status to **completed**, plays an **outro** score, and shows a **credits reel** on the TV (title, summary, highlights, party cast).
- The Archive labels finished sagas as ended (with ending kind when known).

## Stage direction

- Ambience moods: calm, tense, battle, mystery, dread, triumph, wonder, somber, **outro**.
- Stage effects: shake, flash, embers, fog, rain, snow, darkness, heartbeat — with optional **repeat** / **delay** for multi-hit beats.
- Host hotkeys: **Space** skip beat, **D** director drawer, **T** tome (ignored while typing in inputs).

## Project layout (high level)

- `src/app` — Next.js routes & APIs
- `src/components` — Portal, host stage, controllers, dice theater
- `src/lib/campaign` — store, types, DM context
- `src/lib/tools` — dice, tool registry (`roll_dice`, `end_campaign`, …)
- `src/lib/aqua` — DM chat loop & prompts
- `public/music` — BGM by mood/theme + SFX
- `data/campaigns` — per-campaign JSON + notes

## Notes

- Keep the host tab open while playing (heartbeat keeps the table "live").
- Phones and TV should share the same network for join codes to work smoothly.
