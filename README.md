# Mythweaver (TableTopRPGAI)

Couch co-op tabletop RPG: the **TV is the stage**, phones are **player controllers**, and an AI Dungeon Master runs the table.

## How to run

1. Copy `.env.example` to `.env` (or fill in your existing `.env`) with your model API keys.
2. `npm install`
3. Optional voice narration (beta): install one dependency profile from `services/tts`: `requirements-cpu.txt` (portable/default), `requirements-nvidia.txt` (NVIDIA CUDA), or `requirements-amd.txt` (Linux ROCm). `npm run dev` then starts the sidecar automatically (set `TTS_AUTOSTART=0` to opt out); you can also run it manually with `npm run tts`.
4. `npm run dev`
5. Open **http://localhost:3000** on the host (TV/PC) and on phones on the same network (use the machine's LAN IP if needed).

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

- Ambience moods: calm, tense, adrenaline, battle, boss, mystery, dread, triumph, wonder, somber, **outro**.
- Stage effects: shake, flash, embers, fog, rain, snow, darkness, heartbeat — with optional **repeat** / **delay** for multi-hit beats.
- Host hotkeys: **Space** skip beat, **D** director drawer, **T** tome (ignored while typing in inputs).

## Voice narration (beta)

- Enabling narration checks that the local voice server is actually running first — if the sidecar is down, the toggle stays off and the host is told to start it.
- Install exactly one profile with `python -m pip install -r services/tts/requirements-cpu.txt` (or the NVIDIA/AMD equivalent). The legacy `requirements.txt` remains an alias for the CPU profile.
- The TTS package install and the sidecar must use the same Python interpreter. To select one explicitly for `npm run dev`, set `TTS_PYTHON` in `.env` to its absolute executable path.
- NVIDIA uses the CUDA profile. AMD ROCm uses the AMD profile only on Linux with a ROCm-compatible card and driver. The RX 6700 XT is `gfx1031` and is not currently in AMD's supported Radeon ROCm matrix; on Windows it must use the CPU profile. A Linux ROCm attempt is unsupported/experimental and may not run.
- Reference voice samples live in `public/voice`. Add `.wav`, `.mp3`, `.flac`, or `.ogg` files there; the host controls discover them on demand.
- The host TV and the party leader can enable narration, choose the voice that applies to the **next** generated turn, and adjust active voice volume live.
- Narrator and NPC lines are synthesized; player-character dialogue remains subtitle-only. Subtitle timing waits for a ready clip to finish, with normal text pacing when a clip is unavailable.
- The Chatterbox sidecar listens only on `127.0.0.1:5123` by default. Generated WAV data stays in memory for the active turn and is released when presentation ends, with a TTL fallback for interrupted sessions.

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
