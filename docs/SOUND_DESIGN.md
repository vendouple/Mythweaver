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

**Format:** mp3 (ogg/m4a/wav also work). Aim for 2–4 tracks per shelf so
the shuffle doesn't repeat too soon. Everything should be **instrumental**
— vocals fight the narrator.

## Suno prompts (paste as the Style, tick "Instrumental")

General tips: add `[Instrumental]` and exclude vocals; ask for a "seamless
loop feel, no big intro or outro"; generate a couple of variations per
prompt and keep the best.

### `lobby/` — the Gathering
> Warm mystical fantasy tavern ambience, soft harp arpeggios and dulcimer
> over low string drones, gentle woodwind melody, candlelit and inviting,
> patient tempo around 70 bpm, cinematic but understated, seamless loop
> feel, no percussion climax, instrumental

### `weaving/` — the loading interlude
> Arcane ritual soundscape, slow building choir pads and shimmering bells,
> deep cello drone, threads of celesta and reversed harp, sense of a world
> being written into existence, mysterious and expectant, gradual swell
> without resolution, instrumental

### `main/` — general adventuring (the workhorse shelf)
> Cinematic fantasy exploration score, warm strings and light hand
> percussion, wandering flute and fiddle motifs, hopeful but with shadows
> at the edges, mid tempo, orchestral folk hybrid, loopable underscore that
> stays out of the way of a narrator, instrumental

### `calm/` — safety, camps, taverns
> Peaceful medieval campfire underscore, solo nylon guitar and soft
> hammered dulcimer, distant strings, crackling warmth, unhurried and
> tender, low dynamic range, sleepy village at dusk, instrumental

### `tense/` — stealth, standoffs, storm brewing
> Suspenseful low underscore, staccato cello ostinato, muted taiko pulses,
> dissonant sustained violins, ticking percussive textures, coiled spring
> tension that never releases, dark cinematic thriller in a fantasy world,
> instrumental

### `battle/` — combat
> Epic fantasy battle music, driving taiko and frame drums, aggressive
> string ostinatos, brass stabs and war horns, choir hits, fast heroic
> tempo around 140 bpm, relentless momentum, cinematic trailer energy,
> instrumental

### `mystery/` — investigation, ruins, arcane strangeness
> Enigmatic arcane underscore, glass harmonica and music box textures,
> slow viola phrases in a minor mode, subtle whispers of wind chimes,
> curious and unsettling in equal measure, fog over old stone, sparse and
> spacious, instrumental

### `dread/` — horror
> Dark ambient horror drone, sub bass swells, bowed metal and detuned
> strings, distant heartbeat pulse, dissonant choir breaths, creeping
> dread without jump scares, very sparse, glacial pacing, instrumental

### `triumph/` — victory
> Triumphant fantasy fanfare turned underscore, noble French horns and
> soaring strings, bright major key, timpani rolls and cymbal swells,
> golden sunrise after the battle, celebratory but not cheesy, resolves
> gently so it can loop, instrumental

### `wonder/` — awe and revealed magic
> Ethereal wonder theme, celesta and glass bells over lush string pads,
> wordless soprano vocalise used as an instrument, floating harp
> glissandi, starlight and first snowfall, weightless and luminous,
> instrumental

### `somber/` — loss and aftermath
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
