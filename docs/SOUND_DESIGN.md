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

**Each campaign picks one theme at start.** The theme is chosen once, when
the table is raised, from the campaign's genre — D&D is always `fantasy`;
Story Engine campaigns are classified from their premise text (see
`src/lib/campaign/musicTheme.ts`). From then on the AI DM only ever sets
*moods* (`calm`, `tense`, `battle`…); the engine combines the fixed theme
with the current mood to pick the shelf:

- It looks for `BGM/<mood>/<theme>/` first.
- If that themed shelf is empty, it **falls back to the neutral `BGM/<mood>/`
  root** — never to another genre's music. A half-stocked theme is safe.

Supported themes (auto-detected from the premise): **`fantasy`**,
**`scifi`**, **`horror`**, **`noir`**, **`modern`** (spy / thriller /
heist / present-day), **`western`**. A campaign that matches none (e.g.
slice-of-life) stays themeless and plays the neutral roots.

So the winning strategy:

1. Fill the **mood roots** with *genre-neutral cinematic / orchestral-hybrid*
   tracks that don't scream any single setting — these are the safety net
   for every campaign, and the fallback for every theme.
2. Add themed tracks into `<mood>/<theme>/` for the genres you actually run
   (start with `fantasy/` for D&D, then whichever others you play).

> Adding a new theme is just making folders — no code change. The classifier
> keyword lists in `musicTheme.ts` decide which campaigns map to it.

**Suggested fill order** for the empty mood roots (most-used first):
`tense → battle → mystery → triumph → somber → dread → wonder`. `lobby/`,
`weaving/`, `main/`, and `calm/` already have tracks. Fill themed folders
only for the moods a given genre reaches for most.

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
genres — a fantasy variant is optional there. Prompts for the other themes
(`scifi`, `horror`, `noir`, `modern`, `western`) are in their own section
below the moods.

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

## Other genre themes

Each theme has a signature **palette** (its instruments and tone). To fill a
themed shelf, take the palette and bolt on the *mood energy* — reuse the mood
descriptors from the sections above (calm = safe/tender/low dynamics, tense =
coiled ostinato that never releases, battle = driving percussion + relentless
momentum, mystery = sparse and curious, dread = glacial horror drone, triumph
= bright swelling resolve, wonder = weightless and luminous, somber = mournful
elegy). Always add `seamless loop feel, no big intro or outro, no fade to
silence, instrumental`.

Ready examples cover `calm`, `tense`, and `battle` (the widest spread — safe,
suspense, action); build the rest from the palette + the mood descriptor.

### `scifi` — `<mood>/scifi/`
**Palette:** analog synths, pulsing arpeggiators, deep sub bass, metallic and
glassy pads, granular sound-design textures, distant sonar blips; cold, vast,
electronic, chrome-and-starlight.
- **calm** (`calm/scifi/`): > Weightless ambient sci-fi underscore, slow warm synth pads and soft arpeggio, distant sonar pings, gentle sub bass, the quiet hum of a sleeping starship, unhurried and safe, no fade to silence, instrumental
- **tense** (`tense/scifi/`): > Cold sci-fi suspense, pulsing low synth ostinato, ticking metallic textures, dissonant glassy pads, a reactor about to breach, coiled tension that never releases, no big intro or outro, instrumental
- **battle** (`battle/scifi/`): > High-energy sci-fi action, driving electronic percussion and distorted synth bass, aggressive arpeggiators, brass-synth stabs, relentless momentum, cinematic space-combat trailer energy, instrumental

### `horror` — `<mood>/horror/`
**Palette:** detuned strings, bowed metal, prepared piano, sub-bass swells,
breathy dissonant choir, scraping textures, distant music-box; dread-soaked,
sparse, wrong.
- **calm** (`calm/horror/`): > Uneasy quiet horror ambience, hollow sustained drone, faint detuned music box, distant creaks, a false calm that never feels safe, very sparse, low dynamics, no fade to silence, instrumental
- **tense** (`tense/horror/`): > Horror suspense, scraping bowed-metal textures, sub-bass pulse like a held breath, dissonant string clusters swelling and receding, stalking dread, coiled and airless, instrumental
- **battle** (`battle/horror/`): > Frantic horror chase, pounding irregular percussion, shrieking dissonant strings, distorted low brass, panic and adrenaline, relentless and ugly, no big intro or outro, instrumental

### `noir` — `<mood>/noir/`
**Palette:** smoky muted trumpet, brushed jazz drums, upright bass walking
lines, lounge piano, vibraphone, sultry clarinet; rain-slick, 1940s, dim and
world-weary.
- **calm** (`calm/noir/`): > Late-night noir lounge, brushed drums and soft walking upright bass, muted trumpet and mellow piano, cigarette smoke and neon rain, slow and world-weary, low dynamics, no fade to silence, instrumental
- **tense** (`tense/noir/`): > Noir suspense, sparse pizzicato bass, muted trumpet stabs, ticking brushed cymbal, a dark alley and a tail you can't shake, coiled tension that never resolves, instrumental
- **battle** (`battle/noir/`): > Frantic noir chase, driving upright bass and snare, stabbing brass, dissonant piano, a shootout in the rain, breathless momentum, no big intro or outro, instrumental

### `modern` — `<mood>/modern/`
Spy / thriller / heist / present-day.
**Palette:** hybrid orchestral + electronic, pulsing synth bass, taut string
ostinatos, processed percussion, ticking clock textures, low brass; sleek,
tense, contemporary.
- **calm** (`calm/modern/`): > Sleek contemporary underscore, warm synth pads over soft piano, subtle processed percussion, quiet safehouse before the op, unhurried but alert, low dynamics, no fade to silence, instrumental
- **tense** (`tense/modern/`): > Spy-thriller suspense, taut string ostinato and pulsing synth bass, ticking clock percussion, low brass swell, surveillance and a countdown, coiled tension that never releases, instrumental
- **battle** (`battle/modern/`): > Modern action, driving hybrid percussion and distorted synth bass, aggressive string ostinatos, brass hits, a rooftop firefight, relentless trailer momentum, no big intro or outro, instrumental

### `western` — `<mood>/western/`
**Palette:** twanging reverb guitar, lonesome whistle, harmonica, upright bass,
fiddle, sparse mariachi trumpet, distant coyote-night ambience; dusty, wide,
sun-bleached.
- **calm** (`calm/western/`): > Lonesome western dusk, soft reverb guitar and distant whistle, gentle harmonica, wide open prairie at sundown, unhurried and weary, low dynamics, no fade to silence, instrumental
- **tense** (`tense/western/`): > Western standoff tension, single twanging guitar notes, low tremolo strings, creaking silence and a ticking pocket watch, coiled tension before the draw, never releasing, instrumental
- **battle** (`battle/western/`): > Western action, galloping percussion and driving upright bass, frantic fiddle and stabbing brass, a chase across the badlands, relentless momentum, no big intro or outro, instrumental

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
