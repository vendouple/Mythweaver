# Mythweaver — Sound Design Guide

The table finds its own music. Drop files into the folders below and the
engine does the rest — no code changes, no restarts (the manifest is read
on each `/api/music` call).

## How music is picked

```
public/music/BGM/
  lobby/     ← the Gathering (join code on screen)
  weaving/   ← the loading interlude while the AI writes the world
  main/      ← general adventuring fallback for every mood
  calm/      ← DM mood: safety, camps, taverns, travel
  tense/     ← DM mood: stealth, standoffs, storm brewing
  battle/    ← DM mood: combat
  mystery/   ← DM mood: investigation, ruins, arcane strangeness
  dread/     ← DM mood: horror, something is very wrong
  triumph/   ← DM mood: victory, celebration
  wonder/    ← DM mood: awe, vistas, magic revealed
  somber/    ← DM mood: loss, mourning, quiet aftermath
```

The AI Dungeon Master sets an ambience mood as the story shifts; the host
screen crossfades to a track from the matching shelf. Empty shelves fall
back gracefully (e.g. `battle → tense → main → any`), so you can start
with just `lobby/`, `weaving/`, and `main/` and add moods over time.
Loose files directly in `BGM/` act as a final catch-all pool.

### Genre theming (important — read before generating)

The same *mood* wants different *instruments* depending on the campaign. A
lute-and-dulcimer "calm" is perfect for D&D but wrong for a modern spy
thriller or sci-fi story. So each mood shelf can hold a **genre-neutral
root** plus **themed subfolders one level down**:

```
public/music/BGM/calm/            ← genre-neutral (plays for ANY campaign)
public/music/BGM/calm/fantasy/    ← the "calm-fantasy" shelf
```

- **D&D campaigns** automatically prefer the `fantasy/` variant of each
  mood, then fall back to the neutral root if that folder is empty.
- **All other tabletop campaigns** (modern, sci-fi, spy, horror, etc.)
  play the neutral **root** shelf.

So the winning strategy:

1. Fill the **mood roots** with *genre-neutral cinematic / orchestral-hybrid*
   tracks that don't scream any single setting — these are the safety net
   for every campaign and every genre.
2. Add overtly **fantasy** tracks (lute, harp, hammered dulcimer, war
   horns, tavern fiddle, choir) into `<mood>/fantasy/` for D&D tables.

> The engine supports arbitrary themes (`<mood>/<theme>/`), but only
> `fantasy` is wired up right now (for `campaignType === "dnd"`). Other
> themes are ready to activate when we map more campaign types.

**Suggested fill order** for the empty mood roots (most-used first):
`tense → battle → mystery → triumph → somber → dread → wonder`. `lobby/`,
`weaving/`, `main/`, and `calm/` already have tracks.

## Format & looping

**Format:** mp3 (ogg/m4a/wav also work). **2–3 tracks per shelf is plenty**
— the engine shuffles within a shelf and crossfades between tracks, so you
don't need a huge library to avoid repetition.

**Looping is automatic.** Tracks do **not** need to loop cleanly on their
own: the bard begins crossfading into the next track (or back into the same
one, on a single-track shelf) ~4.5 s before the current track ends. Because
of this:

- **Avoid hard cold stops and long silent tails** at the very end — they'll
  be caught mid-fade and sound abrupt. Let the track stay active to the end.
- **Skip big dramatic intros/outros.** A track that opens with 8 s of
  silence-then-swell will do that swell every loop. Ask for a "seamless loop
  feel, no big intro or outro, no fade to silence."
- Everything must be **instrumental** — vocals fight the narrator (wordless
  vocalise *used as an instrument* is fine).

## Suno prompts (paste as the Style, tick "Instrumental")

General tips: add `[Instrumental]` and exclude vocals; ask for a "seamless
loop feel, no big intro or outro, no fade to silence"; generate a couple of
variations per prompt and keep the best.

Each mood below gives a **Neutral** prompt (goes in the mood root — works
for any genre) and a **Fantasy** prompt (goes in `<mood>/fantasy/` for D&D
tables). `lobby/`, `weaving/`, and `main/` are app framing shared across
genres — a fantasy variant is optional there.

### `lobby/` — the Gathering
**Neutral:**
> Warm, inviting cinematic ambience for a gathering, soft piano and string
> pads over a low drone, gentle woodwind or synth melody, candlelit and
> anticipatory, patient tempo around 70 bpm, understated, seamless loop
> feel, no percussion climax, no fade to silence, instrumental

**Fantasy** (`lobby/fantasy/`):
> Warm mystical fantasy tavern ambience, soft harp arpeggios and dulcimer
> over low string drones, gentle woodwind melody, candlelit and inviting,
> patient tempo around 70 bpm, cinematic but understated, seamless loop
> feel, no percussion climax, instrumental

### `weaving/` — the loading interlude
**Neutral:**
> Arcane creation soundscape, slow building choir pads and shimmering bells,
> deep cello or synth drone, threads of celesta and reversed textures, sense
> of a world being written into existence, mysterious and expectant, gradual
> swell without resolution, no fade to silence, instrumental

**Fantasy** (`weaving/fantasy/`):
> Arcane ritual soundscape, slow building choir pads and shimmering bells,
> deep cello drone, threads of celesta and reversed harp, sense of a world
> being written into existence, mysterious and expectant, gradual swell
> without resolution, instrumental

### `main/` — general adventuring (the workhorse shelf)
**Neutral:**
> Cinematic exploration underscore, hybrid orchestral, warm strings and
> subtle synth textures with light percussion, wandering melodic motif,
> hopeful with shadows at the edges, mid tempo, loopable bed that stays out
> of the way of a narrator, no big intro or outro, instrumental

**Fantasy** (`main/fantasy/`):
> Cinematic fantasy exploration score, warm strings and light hand
> percussion, wandering flute and fiddle motifs, hopeful but with shadows
> at the edges, mid tempo, orchestral folk hybrid, loopable underscore that
> stays out of the way of a narrator, instrumental

### `calm/` — safety, camps, taverns
**Neutral:**
> Peaceful ambient underscore, soft nylon guitar or felt piano, warm pads
> and distant strings, unhurried and tender, low dynamic range, safe haven
> at dusk, seamless loop feel, no fade to silence, instrumental

**Fantasy** (`calm/fantasy/`):
> Peaceful medieval campfire underscore, solo nylon guitar and soft
> hammered dulcimer, distant strings, crackling warmth, unhurried and
> tender, low dynamic range, sleepy village at dusk, instrumental

### `tense/` — stealth, standoffs, storm brewing
**Neutral:**
> Suspenseful low underscore, staccato cello ostinato, muted low pulses,
> dissonant sustained strings, ticking percussive textures, coiled spring
> tension that never releases, dark cinematic thriller tone, no fade to
> silence, instrumental

**Fantasy** (`tense/fantasy/`):
> Suspenseful low underscore, staccato cello ostinato, muted taiko pulses,
> dissonant sustained violins, ticking percussive textures, coiled spring
> tension that never releases, dark cinematic thriller in a fantasy world,
> instrumental

### `battle/` — combat
**Neutral:**
> Epic high-energy action music, driving percussion and frame drums,
> aggressive string ostinatos, brass and synth stabs, choir hits, fast
> heroic tempo around 140 bpm, relentless momentum, cinematic trailer
> energy, no big intro or outro, instrumental

**Fantasy** (`battle/fantasy/`):
> Epic fantasy battle music, driving taiko and frame drums, aggressive
> string ostinatos, brass stabs and war horns, choir hits, fast heroic
> tempo around 140 bpm, relentless momentum, cinematic trailer energy,
> instrumental

### `mystery/` — investigation, ruins, arcane strangeness
**Neutral:**
> Enigmatic underscore, music box and glass textures, slow viola or synth
> phrases in a minor mode, subtle wind-chime shimmer, curious and unsettling
> in equal measure, sparse and spacious, no fade to silence, instrumental

**Fantasy** (`mystery/fantasy/`):
> Enigmatic arcane underscore, glass harmonica and music box textures,
> slow viola phrases in a minor mode, subtle whispers of wind chimes,
> curious and unsettling in equal measure, fog over old stone, sparse and
> spacious, instrumental

### `dread/` — horror
**Neutral:**
> Dark ambient horror drone, sub bass swells, bowed metal and detuned
> strings, distant heartbeat pulse, dissonant breaths, creeping dread
> without jump scares, very sparse, glacial pacing, no fade to silence,
> instrumental

**Fantasy** (`dread/fantasy/`):
> Dark ambient horror drone, sub bass swells, bowed metal and detuned
> strings, distant heartbeat pulse, dissonant choir breaths, creeping
> dread without jump scares, very sparse, glacial pacing, instrumental

### `triumph/` — victory
**Neutral:**
> Triumphant cinematic swell turned underscore, soaring strings and brass,
> bright major key, timpani rolls and cymbal swells, golden dawn after the
> storm, celebratory but not cheesy, resolves gently so it can loop,
> instrumental

**Fantasy** (`triumph/fantasy/`):
> Triumphant fantasy fanfare turned underscore, noble French horns and
> soaring strings, bright major key, timpani rolls and cymbal swells,
> golden sunrise after the battle, celebratory but not cheesy, resolves
> gently so it can loop, instrumental

### `wonder/` — awe and revealed magic
**Neutral:**
> Ethereal wonder theme, celesta and glass bells over lush string or synth
> pads, wordless soprano vocalise used as an instrument, floating glissandi,
> starlight and first snowfall, weightless and luminous, no fade to silence,
> instrumental

**Fantasy** (`wonder/fantasy/`):
> Ethereal wonder theme, celesta and glass bells over lush string pads,
> wordless soprano vocalise used as an instrument, floating harp
> glissandi, starlight and first snowfall, weightless and luminous,
> instrumental

### `somber/` — loss and aftermath
**Neutral:**
> Mournful solo cello elegy with sparse piano, slow air on strings, rainy
> grey light, dignified grief, long silences between phrases, quiet and
> restrained, no fade to silence, instrumental

**Fantasy** (`somber/fantasy/`):
> Mournful solo cello elegy with sparse piano, slow air on strings, rainy
> grey light, dignified grief, long silences between phrases, funeral for
> a hero, quiet and restrained, instrumental

## Sound effects — `public/music/SFX/`

Every cue below already has a built-in synthesized fallback, so the game is
fully voiced with zero files. Drop a file with the exact name to replace a
cue with something richer (Suno's SFX-style generations or any foley pack).

| File name       | Cue                                            | Suggested character |
|-----------------|------------------------------------------------|---------------------|
| `tap.mp3`       | small UI touch (tabs, minor buttons)           | soft wooden tick, felt piano damper |
| `confirm.mp3`   | "Begin the Adventure" / big confirmations      | short warm chime, two rising notes |
| `send.mp3`      | player sends an action to the Weaver           | quick parchment whoosh with a spark |
| `join.mp3`      | a hero takes a seat in the lobby               | gentle three-note bell arpeggio |
| `beat.mp3`      | the chronicle advances to a new story beat     | whisper-quiet page turn |
| `flash.mp3`     | stage flash effect (explosions, lightning)     | bright impact crack with air |
| `rumble.mp3`    | stage shake effect                             | deep earth rumble, sub-heavy |
| `darkness.mp3`  | darkness falls                                 | descending drone, air being swallowed |
| `heartbeat.mp3` | horror pulse                                   | slow double heartbeat thump |

Dice rolls keep their bespoke synthesized tumble/impact/crit chimes in the
Dice Theater.

Keep SFX short (≤ 1.5 s except rumble/darkness), mixed quiet, and free of
reverb tails that overlap the music.
