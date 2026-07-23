# Mythweaver — Sound Design Guide

The table finds its own music. Drop files into the folders below and the
engine does the rest — no code changes, no restarts (the manifest is read
on each `/api/music` call).

## How music is picked

```
public/music/BGM/
  lobby/       ← the Gathering — the CALL TO ADVENTURE (join code on screen)
  weaving/     ← the loading interlude while the AI writes the world
  main/        ← general adventuring fallback for every mood
  calm/        ← DM mood: safety, camps, taverns, travel
  tense/       ← DM mood: stealth, standoffs, storm brewing
  adrenaline/  ← DM mood: chases, escapes, heists, races against time
  battle/      ← DM mood: ORDINARY combat — skirmish scale
  boss/        ← DM mood: climactic showdowns — the villain, the endgame
  mystery/     ← DM mood: investigation, ruins, arcane strangeness
  dread/       ← DM mood: horror, something is very wrong
  triumph/     ← DM mood: victory, celebration
  wonder/      ← DM mood: awe, vistas, magic revealed
  somber/      ← DM mood: loss, mourning, quiet aftermath
  outro/               ← generic end credits (fallback for any ending)
  outro-victory/       ← end credits: the party WON
  outro-defeat/        ← end credits: the party lost / died / failed
  outro-bittersweet/   ← end credits: mixed — gains paid for in losses
  outro-escape/        ← end credits: survived by fleeing, threat remains
  outro-draw/          ← end credits: stalemate, neither side prevailed
  outro-cliffhanger/   ← end credits: deliberately unresolved, "to be continued"
```

The AI Dungeon Master sets an ambience mood as the story shifts; the host
screen crossfades to a track from the matching shelf. Empty shelves fall
back gracefully, so you can start small and add moods over time. Loose
files directly in `BGM/` act as a final catch-all pool.

Key fallback chains: `boss → battle → dread → tense → main`,
`battle → adrenaline → tense → main`, `adrenaline → battle → tense → main`.

### The three combat lanes (read this before generating action music)

Action music drifts. A "battle" prompt happily comes back as a
world-ending boss theme one take and a jaunty chase the next — and a shelf
that mixes those moods whiplashes the table mid-fight. So the engine has
**three separate lanes**, and every prompt below is written to hold its lane:

| Shelf | What it scores | Scale | It must NOT feel like |
| --- | --- | --- | --- |
| `adrenaline/` | chases, escapes, heists, races against time | exhilarating | combat, doom, dread |
| `battle/` | ordinary combat encounters | dangerous but human-scale | a final boss, apocalyptic choirs |
| `boss/` | the villain, the endgame confrontation | colossal, overwhelming | a routine skirmish |

When you audition takes, sort by lane ruthlessly: a battle generation that
came out huge and doomy is a great **boss** track — move it, don't trash it.

## Mood cheat sheet

| Shelf | When it plays | The feel in one line |
| --- | --- | --- |
| `lobby` | join code on screen | the eve of an adventure — anticipation with a spark |
| `weaving` | world being generated | creation, expectancy, a swell that never resolves |
| `main` | default adventuring | hopeful wandering with shadows at the edges |
| `calm` | camps, taverns, safety | tender, unhurried, safe |
| `tense` | stealth, standoffs | coiled spring that never releases |
| `adrenaline` | chases, heists, escapes | breathless momentum with a grin |
| `battle` | ordinary combat | punchy, agile, dangerous — human-scale |
| `boss` | endgame showdowns | massive, dark, apocalyptic |
| `mystery` | investigation, ruins | curious and unsettling in equal measure |
| `dread` | horror | glacial creeping wrongness |
| `triumph` | victory | golden dawn after the storm |
| `wonder` | awe, revealed magic | weightless and luminous |
| `somber` | loss, mourning | private, dignified grief |
| `outro-*` | end credits | see the outro section |

## Genre theming (important — read before generating)

The same *mood* wants different *instruments* depending on the campaign. A
lute-and-dulcimer "calm" is perfect for D&D but wrong for a modern spy
thriller. So each mood shelf holds a **genre-neutral root** plus **themed
subfolders one level down**:

```
public/music/BGM/calm/            ← genre-neutral (plays for ANY campaign)
public/music/BGM/calm/fantasy/    ← the "calm-fantasy" shelf
```

**Each campaign picks one theme at start.** D&D is always `fantasy`; Story
Engine campaigns are classified from their premise (see
`src/lib/campaign/musicTheme.ts`). From then on the AI DM only ever sets
*moods*; the engine combines the fixed theme with the current mood:

- It looks for `BGM/<mood>/<theme>/` first.
- If that themed shelf is empty, it **falls back to the neutral
  `BGM/<mood>/` root** — never to another genre's music. A half-stocked
  theme is always safe.

Supported themes: **`fantasy`**, **`scifi`**, **`horror`**, **`noir`**,
**`modern`** (spy / thriller / heist / present-day), **`western`**,
**`postapoc`** (wasteland / after-the-fall), plus the extended set below:
**`cyberpunk`**, **`steampunk`**, **`gothic`**, **`urbanfantasy`**,
**`spaceopera`**, **`pirate`**, **`cozy`**, **`eastasian`**,
**`superhero`**, **`pulp`**. A campaign that matches none (e.g.
slice-of-life) stays themeless and plays the neutral roots.

> These are folder names under each mood: `BGM/<mood>/<theme>/`. Adding a
> new theme is only ever a matter of making folders — see
> `src/lib/campaign/musicTheme.ts` for the classifier keywords that decide
> which campaigns map to each theme.

The winning strategy:

1. Fill the **mood roots** with genre-neutral cinematic tracks — the safety
   net for every campaign and the fallback for every theme.
2. Add themed tracks into `<mood>/<theme>/` for the genres you actually run.

> Adding a new theme is just making folders — no code change. The classifier
> keyword lists in `musicTheme.ts` decide which campaigns map to it.

**Suggested fill order** for empty shelves (most-heard first):
`battle → boss → adrenaline → tense → mystery → triumph → somber → dread → wonder → outro`.

### Extended genres

The seven core themes above cover most campaigns. The ten below are popular
sub-genres that deserve their own shelf when you run them often. Each maps
to a folder name under any mood (`BGM/<mood>/<theme>/`); fill only the ones
you actually use — empty themed shelves always fall back to the neutral mood
root.

| Theme folder | Genre | Distinct audio identity |
| --- | --- | --- |
| `cyberpunk` | Cyberpunk / neon-noir | Darksynth, synthwave, industrial techno, gritty neon-noir electronic (*Cyberpunk RED, Netrunner*). Grittier and more electronic than `scifi`. |
| `steampunk` | Steampunk / gaslight | Clockwork percussion, Victorian orchestral, brass, dark cabaret, electro-swing (*Blades in the Dark, Iron Kingdoms*). |
| `gothic` | Gothic / dark fantasy | Harpsichord, pipe organ, eerie chamber strings, dark choir, slow dirges. `fantasy` is heroic/folk; `gothic` is melancholic and spooky without full modern `horror`. |
| `urbanfantasy` | Urban fantasy | Dark electronic, noir jazz, moody trip-hop (*Vampire: The Masquerade, Monster of the Week*). |
| `spaceopera` | Space opera | Grand, heroic, brass-heavy cinematic orchestral (*Star Wars, Traveller, Mass Effect*). Very different from gritty synth `scifi`. |
| `pirate` | Pirate / nautical | Accordion, sea shanties, acoustic fiddle, wooden percussion, marimba, naval fanfares (*7th Sea, Pirate Borg*). |
| `cozy` | Cozy / pastoral / whimsical | Soft piano, acoustic fingerpicking, wooden flutes, light bells, lo-fi chillhop (*Wanderhome, Ryuutama*). For downtime/campfire where epic `fantasy` is too intense. |
| `eastasian` | East Asian / wuxia / samurai | Guzheng, koto, erhu, shakuhachi, taiko ensembles (*Legend of the Five Rings, Avatar Legends*). |
| `superhero` | Superhero / modern heroic | Hollywood blockbuster brass, driving action strings, guitar/orchestral hybrid, optimistic fanfare (*Masks, Mutants & Masterminds*). Bolder than understated `modern`. |
| `pulp` | Pulp / 1930s expedition | Brassy serial adventure fanfare (Indiana-Jones style), exotic tomb/jungle percussion (*Pulp Cthulhu, Hollow Earth Expedition*). `noir` = dark detective; `pulp` = grand expedition. |

To use one, create matching folders under the moods you want
(e.g. `BGM/calm/cyberpunk/`, `BGM/battle/spaceopera/`), then add the theme's
folder name to the `MusicTheme` union and `THEME_KEYWORDS` in
`src/lib/campaign/musicTheme.ts` so the classifier can pick it.

## Format & looping

**Format:** mp3 (ogg/m4a/wav also work). **2–3 tracks per shelf is plenty**
— the engine shuffles within a shelf and crossfades between tracks.

**Looping is automatic.** Tracks do **not** need to loop cleanly on their
own: the bard begins crossfading into the next track (or back into the same
one) ~4.5 s before the current track ends. Because of this:

- **Avoid hard cold stops and long silent tails** — they get caught
  mid-fade and sound abrupt. Let the track stay active to the end.
- **Skip big dramatic intros/outros.** A track that opens with 8 s of
  silence-then-swell will do that swell every loop.
- Everything must be **instrumental** — vocals fight the narrator
  (wordless vocalise *used as an instrument* is fine).

## Getting variety out of Suno (v5.5)

An over-specified prompt pasted six times returns six near-identical songs.
The prompts below are written with **swap levers** — choices joined by
"or" (`harp or dulcimer or soft flute`) and tempo *ranges* instead of a
single bpm. To get a varied shelf:

1. Per generation, mentally **commit to ONE option per lever** — and pick a
   different one next take.
2. Between takes, change **one or two things only**: the lead instrument,
   the tempo within the stated range, or one imagery phrase. Keep the feel
   words and the loop rules — those hold the shelf together.
3. Generate 4–6 takes per shelf and keep the best 2–3. Cull anything that
   drifted out of its lane (especially battle takes that came out boss-sized
   — re-shelve those instead of deleting).

Paste prompts as the **Style**, tick **Instrumental**.

---

# The Prompt Book

One section per shelf. Each gives the neutral root prompt first, then every
genre. The genre palettes, for reference while editing:

- **fantasy** — harp, dulcimer, strings, war horns, wooden flute, fiddle; heroic/folk medieval-mythic. Not mournful gothic, not cozy pastoral.
- **scifi** — analog synths, arpeggiators, sub bass, glassy digital bells, granular textures; chrome-and-starlight, cool and clean. Not grimy darksynth (`cyberpunk`), not grand brass fanfare (`spaceopera`).
- **horror** — detuned strings, bowed metal, prepared piano, breathy choir, music box; sparse and wrong. Full modern terror — not gothic melancholy alone.
- **noir** — muted trumpet, brushed drums, upright bass, lounge piano, vibraphone, clarinet; rain-slick 1940s detective. Not globe-trotting expedition (`pulp`).
- **modern** — hybrid orchestral + electronic, pulsing synth bass, taut string ostinatos, ticking textures; sleek spy/thriller understatement. Not bombastic hero fanfare (`superhero`).
- **western** — reverb guitar, harmonica, lonesome whistle, fiddle, mariachi trumpet; dusty and wide.
- **postapoc** — junkyard/scrap-metal percussion, detuned guitar, dusty drones, kalimba, raw synth; rust and grit.
- **cyberpunk** — darksynth, synthwave, industrial techno, gritty neon-noir electronic, distorted bass, driving retro drum machines; grimy and neon. Distinct from clean `scifi`.
- **steampunk** — clockwork percussion, Victorian orchestral arrangements, brass, dark cabaret, electro-swing; gears, steam, and gaslight.
- **gothic** — harpsichord, pipe organ, eerie chamber strings, dark choir, slow dirges; melancholic and oppressive. `fantasy` is heroic/folk; `gothic` is mournful without full modern `horror`.
- **urbanfantasy** — dark electronic, noir jazz, moody trip-hop; modern-city night with a supernatural chill. Not pure detective `noir`, not understated spy `modern`.
- **spaceopera** — grand heroic brass-heavy cinematic orchestral; sweeping galactic fanfare. Very different from gritty synth `scifi`.
- **pirate** — accordion, sea shanties, acoustic fiddle, wooden percussion, marimba, naval orchestral fanfares; folk-maritime swashbuckling.
- **cozy** — soft piano, acoustic fingerpicking, wooden flutes, light bells, lo-fi chillhop; low-stakes downtime and village rest. Gentler than epic `fantasy`.
- **eastasian** — guzheng, koto, erhu, shakuhachi, taiko ensembles; traditional Asian instrumentation with zero European-medieval overlap.
- **superhero** — Hollywood blockbuster brass, driving action strings, electric-guitar/orchestral hybrids, optimistic fanfare; bombastic high-stakes hero themes. Bolder than understated `modern`.
- **pulp** — brassy 1930s serial adventure fanfare, exotic tomb/jungle percussion, fast-paced brass; globe-trotting expedition. `noir` = dark detective; `pulp` = grand dig.

## `lobby/` — the Gathering (the call to adventure)

This shelf is NOT calm music. It plays while heroes join and the code is on
the TV — it should feel like the eve of a journey: packed bags, a map on
the table, a pulse of excitement. Warm, yes; sleepy, never.

**Neutral — `BGM/lobby/`**
> Uplifting cinematic prelude for a party gathering before an adventure, warm strings or piano over a soft steady pulse, a rising hopeful motif on horn or flute or bright synth, anticipation and quiet excitement, dawn before a journey, around 85-100 bpm, understated enough to sit under a menu, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/lobby/fantasy/`**
> Adventurous fantasy prelude, bright harp or dulcimer arpeggios over warm strings and a soft marching hand-drum pulse, a rising heroic motif on wooden flute or horn, banners and packed satchels at dawn, eager and hopeful, around 90 bpm, seamless loop feel, no big intro or outro, instrumental

**Scifi — `BGM/lobby/scifi/`**
> Hopeful sci-fi prelude, warm analog pads with a bright pulsing arpeggio, a rising piano or clean synth-lead motif, launch-countdown anticipation, a crew assembling on a bright bridge, cool chrome-and-starlight not grimy neon, around 90-105 bpm, gently driving but understated, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/lobby/horror/`**
> Uneasy horror prelude, a slow forward pulse under hollow drones, a curious detuned music-box or piano motif that keeps beckoning, anticipation laced with wrongness, the itch to open the door anyway, restrained but never sleepy, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/lobby/noir/`**
> Slinky noir prelude, walking upright bass and brushed drums with a confident muted trumpet or clarinet hook, a fresh case hitting the desk, intrigue and forward motion, night streets full of promise, around 100 bpm, understated swagger, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/lobby/modern/`**
> Sleek modern prelude, a quiet driving synth-bass pulse with taut strings and piano, a rising confident motif, the team assembling and gearing up, cool anticipation before the operation, around 95-110 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/lobby/western/`**
> Bright western prelude, ambling reverb guitar and a light train-beat rhythm, a hopeful whistle or fiddle or harmonica hook, saddling up at sunrise, wide horizon and itching boots, around 95 bpm, warm and eager, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/lobby/postapoc/`**
> Gritty hopeful wasteland prelude, dusty guitar or kalimba over a soft junkyard-percussion heartbeat, a rising resolute motif, survivors gearing up at the settlement gate, danger ahead but daylight too, around 90 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/lobby/cyberpunk/`**
> Neon-noir cyberpunk prelude, a pulsing darksynth or synthwave bassline under retro drum-machine ticks, a rising hopeful lead on a glassy synth or distorted arp, chrome towers and rain outside the bar, eager anticipation with a grimy edge, around 95-110 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/lobby/steampunk/`**
> Gaslight steampunk prelude, ticking clockwork percussion and a light brass or dark-cabaret swing, a rising hopeful motif on accordion or violin or music-box, airships being loaded at dawn, brass-and-steam anticipation, around 95 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/lobby/gothic/`**
> Gothic prelude, a harpsichord or eerie chamber-string figure over a slow pipe-organ drone, a rising mournful-but-eager motif, candlelit maps and a carriage waiting in the fog, melancholy anticipation, around 85-95 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/lobby/urbanfantasy/`**
> Urban-fantasy prelude, a moody trip-hop beat and noir-jazz horns under a rising dark-electronic motif, the city's hidden world stirring after midnight, cool anticipation with a supernatural chill, around 90-100 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/lobby/spaceopera/`**
> Space-opera prelude, grand heroic brass and sweeping orchestral strings over a steady forward pulse, a rising galactic-fanfare motif, a crew mustering on the launch pad, sweeping optimistic anticipation, around 95-105 bpm, understated enough to sit under a menu, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/lobby/pirate/`**
> Swashbuckling pirate prelude, an accordion or fiddle over wooden percussion and a gentle sea-shanty sway, a rising adventurous motif, a crew loading the ship at first light, salt-spray eagerness, around 95 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/lobby/cozy/`**
> Cozy pastoral prelude, soft piano or fingerpicked acoustic guitar over light bells and a gentle lo-fi chillhop beat, a rising warm motif, packing a basket for a short adventure, gentle and inviting, around 80-95 bpm, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/lobby/eastasian/`**
> East-Asian prelude, a guzheng or koto figure over soft shakuhachi and a light taiko pulse, a rising hopeful motif on erhu, travellers gathering at the village gate at dawn, eager and serene, around 90 bpm, understated, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/lobby/superhero/`**
> Superhero prelude, blockbuster brass and driving action strings over an optimistic electric-guitar/orchestral pulse, a rising heroic fanfare motif, the team suiting up for the first mission, bold and hopeful, around 100-115 bpm, understated enough for a menu, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/lobby/pulp/`**
> 1930s pulp-expedition prelude, brassy serial fanfare and fast adventure strings over jungle or tomb percussion, a rising globe-trotting motif, crates being loaded onto a tramp steamer, grand and eager, around 100-110 bpm, understated, seamless loop feel, no fade to silence, instrumental

## `weaving/` — the loading interlude

A world being written into existence: expectancy, gathering threads, a
swell that builds but never resolves.

**Neutral — `BGM/weaving/`**
> Arcane creation soundscape, slow building choir or synth pads with shimmering bells or celesta, deep cello or sub drone, reversed textures weaving in and out, a world being written into existence, mysterious and expectant, gradual swell without resolution, no fade to silence, instrumental

**Fantasy — `BGM/weaving/fantasy/`**
> Arcane ritual soundscape, slow building choir pads, shimmering bells and reversed harp or celesta threads, deep cello drone, a world woven on a great loom, mysterious and expectant, gradual swell without resolution, no fade to silence, instrumental

**Scifi — `BGM/weaving/scifi/`**
> Sci-fi genesis soundscape, evolving synth pads and glassy digital bells, granular textures assembling over a deep sub drone, a universe compiling itself into existence, mysterious and expectant, gradual swell without resolution, no fade to silence, instrumental

**Horror — `BGM/weaving/horror/`**
> Ominous horror creation soundscape, slowly gathering dissonant string clusters and breathy choir, sub-bass swells and reversed whispers, something taking shape in the dark, dread and awe together, gradual build without release, no fade to silence, instrumental

**Noir — `BGM/weaving/noir/`**
> Noir scene-setting soundscape, slow sultry clarinet or vibraphone phrases over a low walking bass, rain on the window, a case coming into focus through the smoke, gradual build without resolution, no fade to silence, instrumental

**Modern — `BGM/weaving/modern/`**
> Modern briefing soundscape, layering synth pulses and taut string swells, ticking processed textures, intel assembling on the board, a plan coming together, gradual build without resolution, no fade to silence, instrumental

**Western — `BGM/weaving/western/`**
> Western legend-telling soundscape, swelling reverb guitar and low drone with a distant lonesome whistle, wind moving over the plains, a tall tale taking shape, gradual build without resolution, no fade to silence, instrumental

**Postapoc — `BGM/weaving/postapoc/`**
> Wasteland genesis soundscape, dusty drones and scrap-metal resonance slowly gathering, a fragile melodic thread on detuned piano or kalimba, the old world remembered and a new one taking shape, gradual swell without resolution, no fade to silence, instrumental

**Cyberpunk — `BGM/weaving/cyberpunk/`**
> Cyberpunk boot-sequence soundscape, evolving darksynth pads and glitching digital textures, granular data-streams assembling over a deep distorted sub drone, a neon city compiling itself into existence, mysterious and expectant, gradual swell without resolution, no fade to silence, instrumental

**Steampunk — `BGM/weaving/steampunk/`**
> Steampunk invention soundscape, slow building clockwork percussion and Victorian strings, shimmering music-box and brass threads weaving in and out, a great engine being assembled gear by gear, mysterious and expectant, gradual swell without resolution, no fade to silence, instrumental

**Gothic — `BGM/weaving/gothic/`**
> Gothic conjuration soundscape, slowly gathering eerie chamber strings and a low pipe-organ drone, a fragile music-box or harpsichord thread, a dark destiny being written in a candlelit grimoire, mysterious and mournful, gradual swell without resolution, no fade to silence, instrumental

**Urbanfantasy — `BGM/weaving/urbanfantasy/`**
> Urban-fantasy weaving soundscape, moody trip-hop pads and dark electronic textures gathering, a fragile noir-jazz horn or piano thread, hidden magic surfacing through the city night, mysterious and expectant, gradual swell without resolution, no fade to silence, instrumental

**Spaceopera — `BGM/weaving/spaceopera/`**
> Space-opera genesis soundscape, slow building orchestral strings and heroic brass over a deep cosmic drone, shimmering celesta threads, a galaxy being written into the stars, mysterious and grand, gradual swell without resolution, no fade to silence, instrumental

**Pirate — `BGM/weaving/pirate/`**
> Pirate legend-telling soundscape, slow swelling accordion and fiddle over gentle wooden percussion, a weathered nautical motif gathering like a tide, a tall tale of the open sea taking shape, mysterious and salt-sprayed, gradual swell without resolution, no fade to silence, instrumental

**Cozy — `BGM/weaving/cozy/`**
> Cozy hearth soundscape, soft piano and fingerpicked acoustic guitar gathering over light bells and a gentle lo-fi pulse, a small warm world being knitted into being, tender and expectant, gradual swell without resolution, no fade to silence, instrumental

**Eastasian — `BGM/weaving/eastasian/`**
> East-Asian weaving soundscape, a slow guzheng or koto figure gathering over shakuhachi and a low taiko pulse, a silk scroll being painted stroke by stroke, mysterious and serene, gradual swell without resolution, no fade to silence, instrumental

**Superhero — `BGM/weaving/superhero/`**
> Superhero origin soundscape, slow building blockbuster brass and driving action strings over an optimistic pulse, a rising heroic fanfare thread, a legend being forged, mysterious and bold, gradual swell without resolution, no fade to silence, instrumental

**Pulp — `BGM/weaving/pulp/`**
> Pulp-expedition weaving soundscape, brassy serial strings and jungle percussion slowly gathering, an exotic globe-trotting motif, a map to adventure being unrolled, mysterious and eager, gradual swell without resolution, no fade to silence, instrumental

## `main/` — general adventuring (the workhorse shelf)

**Neutral — `BGM/main/`**
> Cinematic exploration underscore, hybrid orchestral, warm strings with subtle synth or woodwind textures and light percussion, a wandering melodic motif that comes and goes, hopeful with shadows at the edges, mid tempo, loopable bed that stays out of the way of a narrator, no big intro or outro, instrumental

**Fantasy — `BGM/main/fantasy/`**
> Cinematic fantasy exploration score, warm strings and light hand percussion, wandering flute or fiddle or harp motifs, hopeful but with shadows at the edges, mid tempo, orchestral folk hybrid, loopable underscore that stays out of the way of a narrator, instrumental

**Scifi — `BGM/main/scifi/`**
> Cinematic sci-fi exploration bed, warm evolving pads with a light pulsing arpeggio and soft electronic percussion, a curious wandering lead, starfield wonder with cold edges, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Horror — `BGM/main/horror/`**
> Creeping horror exploration bed, sparse prepared piano or plucked strings over a hollow drone, subtle scraping textures, wary footsteps in a wrong place, low dynamics, loopable under a narrator, no jump scares, no big intro or outro, instrumental

**Noir — `BGM/main/noir/`**
> Noir investigation underscore, brushed drums and walking upright bass, mellow piano with an occasional muted trumpet or vibraphone phrase, world-weary and watchful, mid-slow tempo, loopable bed under a narrator, no big intro or outro, instrumental

**Modern — `BGM/main/modern/`**
> Contemporary hybrid underscore, light processed percussion and warm pads with a subtle string or piano ostinato, purposeful and alert, boots on the ground, mid tempo, loopable bed under a narrator, no big intro or outro, instrumental

**Western — `BGM/main/western/`**
> Cinematic western exploration bed, ambling reverb guitar and light brushed percussion, distant whistle or fiddle motifs, wide weathered country with hope at the edges, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Postapoc — `BGM/main/postapoc/`**
> Desolate wasteland exploration bed, dusty guitar or duduk over sparse junk-percussion and wind-worn drones, a lonely resilient motif, ruins on the horizon and guarded hope, mid tempo, loopable under a narrator, no big intro or outro, instrumental

**Cyberpunk — `BGM/main/cyberpunk/`**
> Neon-noir cyberpunk exploration bed, a slow pulsing darksynth bassline and glassy digital pads with light retro drum-machine textures, a wandering gritty lead, chrome-and-rain city with cold edges, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Steampunk — `BGM/main/steampunk/`**
> Steampunk exploration bed, ambling clockwork percussion and Victorian strings with a curious brass or accordion motif, gaslit streets and humming engines, hopeful with soot at the edges, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Gothic — `BGM/main/gothic/`**
> Gothic exploration bed, eerie chamber strings and a slow harpsichord or pipe-organ figure, a mournful wandering motif, candlelit halls and gathering fog, melancholic and watchful, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Urbanfantasy — `BGM/main/urbanfantasy/`**
> Urban-fantasy exploration bed, a moody trip-hop pulse and noir-jazz horns under dark electronic pads, a curious wandering motif, hidden magic in the city night, alert and cool, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Spaceopera — `BGM/main/spaceopera/`**
> Space-opera exploration bed, sweeping orchestral strings and heroic brass over a steady forward pulse, a wandering galactic motif, starfields and new worlds, hopeful and grand, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Pirate — `BGM/main/pirate/`**
> Nautical exploration bed, a gentle sea-shanty sway on accordion and fiddle over wooden percussion, a wandering salt-sprayed motif, open water and far horizons, hopeful with spray at the edges, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Cozy — `BGM/main/cozy/`**
> Cozy exploration bed, soft piano or fingerpicked acoustic guitar over light bells and a gentle lo-fi beat, a warm wandering motif, meadow paths and friendly villages, unhurried and tender, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Eastasian — `BGM/main/eastasian/`**
> East-Asian exploration bed, a flowing guzheng or koto figure over shakuhachi and a soft taiko pulse, a wandering erhu motif, bamboo groves and misty peaks, serene and hopeful, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Superhero — `BGM/main/superhero/`**
> Superhero exploration bed, driving action strings and blockbuster brass over an optimistic guitar/orchestral pulse, a wandering heroic motif, a city watching its guardians, bold and hopeful, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

**Pulp — `BGM/main/pulp/`**
> Pulp-expedition exploration bed, brassy serial-adventure strings over jungle or tomb percussion, a wandering globe-trotting motif, dusty maps and ancient temples, grand and eager, mid tempo, loopable underscore under a narrator, no big intro or outro, instrumental

## `calm/` — safety, camps, taverns

**Neutral — `BGM/calm/`**
> Peaceful ambient underscore, soft nylon guitar or felt piano or harp, warm pads and distant strings, unhurried and tender, low dynamic range, a safe haven at dusk, seamless loop feel, no fade to silence, instrumental

**Fantasy — `BGM/calm/fantasy/`**
> Peaceful medieval campfire underscore, solo nylon guitar or hammered dulcimer, distant strings, crackling warmth, unhurried and tender, low dynamic range, sleepy village at dusk, heroic-folk calm rather than cozy lo-fi or gothic candlelight, seamless loop feel, instrumental

**Scifi — `BGM/calm/scifi/`**
> Weightless ambient sci-fi underscore, slow warm synth pads and a soft arpeggio, distant sonar pings, gentle sub bass, the quiet hum of a sleeping starship, unhurried and safe, low dynamics, no fade to silence, instrumental

**Horror — `BGM/calm/horror/`**
> Uneasy quiet horror ambience, hollow sustained drone, a faint detuned music box or distant piano, occasional creaks, a false calm that never feels quite safe, very sparse, low dynamics, no fade to silence, instrumental

**Noir — `BGM/calm/noir/`**
> Late-night noir lounge, brushed drums and soft walking upright bass, muted trumpet or mellow piano lead, cigarette smoke and neon rain, slow and world-weary, low dynamics, no fade to silence, instrumental

**Modern — `BGM/calm/modern/`**
> Sleek contemporary underscore, warm synth pads over soft piano, subtle processed percussion, the quiet safehouse before the op, unhurried but alert, low dynamics, no fade to silence, instrumental

**Western — `BGM/calm/western/`**
> Lonesome western dusk, soft reverb guitar and a distant whistle or gentle harmonica, wide open prairie at sundown, unhurried and weary, low dynamics, no fade to silence, instrumental

**Postapoc — `BGM/calm/postapoc/`**
> Quiet wasteland refuge, soft detuned guitar or kalimba over warm dusty pads, a campfire inside the settlement walls, tired bones and rare safety, unhurried, low dynamics, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/calm/cyberpunk/`**
> Neon-noir downtime bed, slow warm darksynth pads or soft synthwave chords over a sparse retro drum-machine tick, a mellow glassy lead or muted arp, rain on the apartment window after the run, unhurried and safe with a grimy edge, low dynamics, no fade to silence, instrumental

**Steampunk — `BGM/calm/steampunk/`**
> Gaslight parlor calm, soft music-box or accordion over warm Victorian strings and a gentle clockwork tick, a tender brass or violin motif, tea and brass gears by lamplight, unhurried and cozy, low dynamics, no fade to silence, instrumental

**Gothic — `BGM/calm/gothic/`**
> Candlelit gothic calm, soft harpsichord or sparse chamber strings over a low pipe-organ drone, a fragile mournful motif, quiet safety inside a dark manor, tender but never fully bright, low dynamics, no fade to silence, instrumental

**Urbanfantasy — `BGM/calm/urbanfantasy/`**
> Urban-fantasy night calm, soft noir-jazz piano or muted horn over a slow trip-hop pulse and dark electronic pads, a safehouse after midnight, unhurried with a supernatural chill, low dynamics, no fade to silence, instrumental

**Spaceopera — `BGM/calm/spaceopera/`**
> Quiet starship calm, warm orchestral pads and soft brass over a gentle pulse, a tender piano or harp motif, the observation deck at night, unhurried and grand rather than cold-synth, low dynamics, no fade to silence, instrumental

**Pirate — `BGM/calm/pirate/`**
> Quiet harbor calm, soft accordion or nylon guitar over gentle wooden percussion and distant fiddle, a ship at anchor under stars, unhurried and salt-sprayed, low dynamics, no fade to silence, instrumental

**Cozy — `BGM/calm/cozy/`**
> Cozy hearth underscore, soft piano or fingerpicked acoustic guitar over light bells and a gentle lo-fi chillhop beat, wooden flute optional, village rest and campfire safety, unhurried and tender, low dynamics, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/calm/eastasian/`**
> East-Asian calm, soft guzheng or koto over gentle shakuhachi and sparse light percussion, a serene courtyard at dusk, unhurried and luminous, low dynamics, no fade to silence, instrumental

**Superhero — `BGM/calm/superhero/`**
> Quiet hero downtime, warm piano and soft strings over a light optimistic pulse, a brief rest between missions, tender but still slightly heroic, low dynamics, no fade to silence, instrumental

**Pulp — `BGM/calm/pulp/`**
> Quiet expedition camp, soft nylon guitar or mellow brass over light exotic percussion, a tent by lantern light after the dig, unhurried and warm, low dynamics, no fade to silence, instrumental

## `tense/` — stealth, standoffs, storm brewing

**Neutral — `BGM/tense/`**
> Suspenseful low underscore, staccato cello ostinato, muted low pulses, dissonant sustained strings, ticking percussive textures, coiled spring tension that never releases, dark cinematic thriller tone, no fade to silence, instrumental

**Fantasy — `BGM/tense/fantasy/`**
> Suspenseful low underscore, staccato cello ostinato, muted taiko pulses, dissonant sustained violins, ticking percussive textures, coiled spring tension that never releases, dark cinematic thriller in a fantasy world, instrumental

**Scifi — `BGM/tense/scifi/`**
> Cold sci-fi suspense, pulsing low synth ostinato, ticking metallic textures, dissonant glassy pads, a reactor about to breach, coiled tension that never releases, no big intro or outro, instrumental

**Horror — `BGM/tense/horror/`**
> Horror suspense, scraping bowed-metal textures, a sub-bass pulse like a held breath, dissonant string clusters swelling and receding, stalking dread, coiled and airless, no big intro or outro, instrumental

**Noir — `BGM/tense/noir/`**
> Noir suspense, sparse pizzicato bass, muted trumpet stabs, ticking brushed cymbal, a dark alley and a tail you can't shake, coiled tension that never resolves, no big intro or outro, instrumental

**Modern — `BGM/tense/modern/`**
> Spy-thriller suspense, taut string ostinato and pulsing synth bass, ticking clock percussion, a low brass swell, surveillance and a countdown, coiled tension that never releases, no big intro or outro, instrumental

**Western — `BGM/tense/western/`**
> Western standoff tension, single twanging guitar notes, low tremolo strings, creaking silence and a ticking pocket watch, coiled tension before the draw, never releasing, no big intro or outro, instrumental

**Postapoc — `BGM/tense/postapoc/`**
> Wasteland suspense, a ticking scrap-metal pulse and low detuned drone, tight dissonant strings or feedback swells, raiders somewhere past the ridge line, coiled tension that never releases, no big intro or outro, instrumental

**Cyberpunk — `BGM/tense/cyberpunk/`**
> Neon-noir cyberpunk suspense, a low distorted darksynth pulse and ticking industrial textures, dissonant glassy pads, ICE closing in or a deal about to go wrong, coiled tension that never releases, no big intro or outro, instrumental

**Steampunk — `BGM/tense/steampunk/`**
> Steampunk suspense, a ticking clockwork ostinato and low Victorian strings, muted brass stabs, a boiler about to blow or a heist mid-vault, coiled tension that never releases, no big intro or outro, instrumental

**Gothic — `BGM/tense/gothic/`**
> Gothic suspense, sparse harpsichord figures and low pipe-organ drones, eerie chamber-string clusters, something waiting behind the next door, coiled and mournful, no big intro or outro, instrumental

**Urbanfantasy — `BGM/tense/urbanfantasy/`**
> Urban-fantasy suspense, a slow trip-hop pulse under taut dark-electronic pads, sparse noir-jazz stabs, stalking something supernatural through the city night, coiled tension that never releases, no big intro or outro, instrumental

**Spaceopera — `BGM/tense/spaceopera/`**
> Space-opera suspense, taut orchestral ostinatos and low brass swells over a restrained pulse, a standoff on the bridge before the jump, coiled tension that never releases, grand rather than cold-synth, no big intro or outro, instrumental

**Pirate — `BGM/tense/pirate/`**
> Nautical suspense, sparse wooden percussion and low fiddle drones, a creaking hull and a held accordion note, enemy sails on the horizon, coiled tension that never releases, no big intro or outro, instrumental

**Cozy — `BGM/tense/cozy/`**
> Soft cozy suspense, a gentle ticking lo-fi pulse under sparse piano or wooden flute, mild unease rather than dread, a small problem in a small town, restrained and never scary, no big intro or outro, instrumental

**Eastasian — `BGM/tense/eastasian/`**
> East-Asian suspense, sparse guzheng or koto plucks over a low taiko pulse and held shakuhachi tones, a standoff in the mist, coiled tension that never releases, no big intro or outro, instrumental

**Superhero — `BGM/tense/superhero/`**
> Superhero standoff tension, taut action strings and a restrained brass pulse, ticking hybrid percussion, the moment before the fight starts, coiled and cinematic, no big intro or outro, instrumental

**Pulp — `BGM/tense/pulp/`**
> Pulp-expedition suspense, sparse exotic percussion and low brass drones, a ticking motif, the trap about to spring in the tomb, coiled tension that never releases, no big intro or outro, instrumental

## `adrenaline/` — chases, escapes, heists (NEW)

Excitement that is **not** combat: rooftop pursuits, breakneck getaways,
vaults cracking on a timer. Fast, propulsive, and *fun* — exhilaration,
never doom. If a take comes out martial or menacing, it belongs in
`battle/` instead.

**Neutral — `BGM/adrenaline/`**
> Propulsive cinematic chase music, driving percussion and a running bassline, agile string or synth ostinatos passing a quick melody around, breathless momentum and a sense of daring, exhilarating rather than menacing, around 130-150 bpm, relentless but bright, no big intro or outro, instrumental

**Fantasy — `BGM/adrenaline/fantasy/`**
> Breathless fantasy chase, galloping hand percussion and racing fiddle or flute runs over driving low strings, a rooftop pursuit through a crowded market, daring and playful danger, exhilarating rather than menacing, around 140 bpm, no big intro or outro, instrumental

**Scifi — `BGM/adrenaline/scifi/`**
> High-speed sci-fi pursuit, driving electronic percussion and a sprinting arpeggiator, gliding clean synth leads, thruster-burn momentum through an asteroid field or orbital corridor, exhilarating rather than menacing, cool chrome not grimy neon, around 140 bpm, no big intro or outro, instrumental

**Horror — `BGM/adrenaline/horror/`**
> Panicked horror flight, pounding irregular percussion and racing string ostinatos, gasping textures, sprinting through the dark with the thing right behind, terror-fueled momentum, relentless, no big intro or outro, instrumental

**Noir — `BGM/adrenaline/noir/`**
> Breakneck noir chase, sprinting upright bass and hot brushed drums, stabbing brass and frantic piano runs, a foot chase through rainy alleys with hats flying, urgent but slick, around 150 bpm, no big intro or outro, instrumental

**Modern — `BGM/adrenaline/modern/`**
> Modern heist-chase underscore, driving hybrid percussion and a pulsing synth bassline, taut string runs and slick electronic textures, weaving through traffic with the goods in the trunk, adrenaline and swagger, around 140 bpm, no big intro or outro, instrumental

**Western — `BGM/adrenaline/western/`**
> Galloping western chase, pounding hoofbeat percussion and driving upright bass, frantic fiddle and twanging guitar runs, a horseback pursuit across the flats, dust and daring, exhilarating, around 140 bpm, no big intro or outro, instrumental

**Postapoc — `BGM/adrenaline/postapoc/`**
> Full-throttle wasteland chase, pounding junkyard percussion and growling bass, distorted guitar or raw synth stabs, war-rig engines at redline, feral joy and danger, relentless momentum, around 140-150 bpm, no big intro or outro, instrumental

**Cyberpunk — `BGM/adrenaline/cyberpunk/`**
> Neon cyberpunk chase, driving industrial techno or darksynth percussion and a sprinting distorted bassline, glitchy arps and synthwave leads, rooftop pursuit through rain and neon, exhilarating rather than menacing, around 140-150 bpm, no big intro or outro, instrumental

**Steampunk — `BGM/adrenaline/steampunk/`**
> Steampunk chase, pounding clockwork percussion and racing brass or accordion runs over driving Victorian strings, airship pursuit or street escape through gaslit alleys, exhilarating rather than menacing, around 140 bpm, no big intro or outro, instrumental

**Gothic — `BGM/adrenaline/gothic/`**
> Gothic flight, racing chamber-string ostinatos and urgent harpsichord figures over a dark organ pulse, fleeing through candlelit corridors, breathless and dramatic rather than pure horror, around 135-145 bpm, no big intro or outro, instrumental

**Urbanfantasy — `BGM/adrenaline/urbanfantasy/`**
> Urban-fantasy chase, driving trip-hop or dark-electronic percussion and taut noir-jazz stabs, sprinting through midnight streets with something supernatural close behind, exhilarating with a chill, around 140 bpm, no big intro or outro, instrumental

**Spaceopera — `BGM/adrenaline/spaceopera/`**
> Space-opera pursuit, driving orchestral percussion and racing brass over sweeping strings, a starfighter chase or hangar escape, exhilarating and grand rather than cold-synth, around 140 bpm, no big intro or outro, instrumental

**Pirate — `BGM/adrenaline/pirate/`**
> Swashbuckling pirate chase, pounding wooden percussion and racing fiddle or accordion runs, a deck-to-deck pursuit or rooftop escape in port, exhilarating and salt-sprayed, around 140 bpm, no big intro or outro, instrumental

**Cozy — `BGM/adrenaline/cozy/`**
> Light cozy scramble, a quick lo-fi beat and racing soft piano or wooden flute, a playful chase through the village market, breathless but never scary, around 120-135 bpm, no big intro or outro, instrumental

**Eastasian — `BGM/adrenaline/eastasian/`**
> East-Asian chase, driving taiko and racing guzheng or koto runs over urgent shakuhachi, a rooftop pursuit through lantern-lit streets, exhilarating rather than menacing, around 140 bpm, no big intro or outro, instrumental

**Superhero — `BGM/adrenaline/superhero/`**
> Superhero chase, driving action strings and blockbuster brass over hybrid percussion, a city-spanning pursuit with optimistic swagger, exhilarating rather than menacing, around 140-150 bpm, no big intro or outro, instrumental

**Pulp — `BGM/adrenaline/pulp/`**
> Pulp-expedition chase, racing brass fanfare and jungle or tomb percussion, a breakneck escape from the dig site, exhilarating and globe-trotting, around 140 bpm, no big intro or outro, instrumental

## `battle/` — ordinary combat (skirmish scale)

The everyday fight: bandits on the road, a patrol clash, a bar brawl with
blades. Punchy, agile, dangerous — but **human-scale**. Every prompt
explicitly steers away from final-boss weight; if a generation still comes
out enormous, shelve it in `boss/`.

**Neutral — `BGM/battle/`**
> Driving combat music for a mid-stakes skirmish, punchy percussion and aggressive string ostinatos, short brass or synth stabs, agile and dangerous but human-scale, a hard fight rather than a world-ending final boss, no massive choir, no doom bells, around 130-140 bpm, relentless momentum, no big intro or outro, instrumental

**Fantasy — `BGM/battle/fantasy/`**
> Fantasy skirmish combat music, driving frame drums and taiko with galloping string ostinatos, sharp brass hits and quick fiddle or flute flourishes, swords and shields at close quarters, heroic and light on its feet, a road battle rather than a final boss, no massive choir, around 135 bpm, no big intro or outro, instrumental

**Scifi — `BGM/battle/scifi/`**
> Sci-fi skirmish combat, driving electronic percussion and distorted bass, aggressive arpeggiators and synth-brass stabs, corridor firefight energy, fast and kinetic but not apocalyptic, a patrol clash rather than a fleet-ending boss, around 135-145 bpm, no big intro or outro, instrumental

**Horror — `BGM/battle/horror/`**
> Desperate horror combat, pounding irregular drums, shrieking string stabs and low distorted pulses, fighting something off with whatever is at hand, ugly scrappy panic rather than epic scale, no giant choir, relentless, no big intro or outro, instrumental

**Noir — `BGM/battle/noir/`**
> Hard-boiled noir shootout, driving snare and sprinting upright bass, stabbing brass and jagged piano clusters, tommy guns in the rain, kinetic swing-inflected danger, street-scale rather than epic, around 140 bpm, no big intro or outro, instrumental

**Modern — `BGM/battle/modern/`**
> Modern firefight underscore, driving hybrid percussion and distorted synth bass, aggressive staccato strings and restrained brass hits, a running gun battle through the compound, kinetic and dangerous but squad-scale and understated, not bombastic superhero fanfare, around 140 bpm, no big intro or outro, instrumental

**Western — `BGM/battle/western/`**
> Western gunfight music, galloping percussion and driving bass, frantic fiddle, twanging guitar stabs and a hard trumpet edge, lead flying behind the saloon, rowdy and dangerous but human-scale, around 135 bpm, no big intro or outro, instrumental

**Postapoc — `BGM/battle/postapoc/`**
> Wasteland skirmish combat, pounding scrap-metal percussion and growling distorted bass, raw guitar or synth stabs, a raider ambush at the gates, savage and scrappy but not world-ending, fast and relentless, no big intro or outro, instrumental

**Cyberpunk — `BGM/battle/cyberpunk/`**
> Cyberpunk street fight, driving industrial techno or darksynth percussion and distorted bass, aggressive glitch arps and synthwave stabs, alley or club firefight energy, kinetic and gritty but squad-scale, not apocalyptic, around 140 bpm, no big intro or outro, instrumental

**Steampunk — `BGM/battle/steampunk/`**
> Steampunk skirmish, pounding clockwork percussion and aggressive brass hits over driving Victorian strings, gears and steam and close-quarters blades, human-scale rather than final-boss, around 135 bpm, no big intro or outro, instrumental

**Gothic — `BGM/battle/gothic/`**
> Gothic skirmish combat, driving chamber-string ostinatos and hard harpsichord or organ stabs over urgent percussion, a fight in a candlelit hall, dramatic and dark but human-scale, no massive choir, around 130-140 bpm, no big intro or outro, instrumental

**Urbanfantasy — `BGM/battle/urbanfantasy/`**
> Urban-fantasy street combat, driving trip-hop or dark-electronic percussion and taut noir-jazz brass stabs, a supernatural brawl in an alley, kinetic and dangerous but street-scale, around 140 bpm, no big intro or outro, instrumental

**Spaceopera — `BGM/battle/spaceopera/`**
> Space-opera skirmish, driving orchestral percussion and heroic brass hits over aggressive string ostinatos, a boarding action or hangar firefight, kinetic and grand but not fleet-ending, no massive doom choir, around 135-145 bpm, no big intro or outro, instrumental

**Pirate — `BGM/battle/pirate/`**
> Pirate skirmish combat, pounding wooden percussion and aggressive fiddle or accordion runs over driving low strings, a deck fight or tavern brawl with blades, rowdy and human-scale, around 135 bpm, no big intro or outro, instrumental

**Cozy — `BGM/battle/cozy/`**
> Light cozy scrap, punchy soft percussion and playful piano or wooden-flute flourishes, a bar brawl or scarecrow fight, dangerous enough to matter but never grim, around 120-135 bpm, no big intro or outro, instrumental

**Eastasian — `BGM/battle/eastasian/`**
> East-Asian skirmish combat, driving taiko and aggressive guzheng or koto ostinatos with sharp shakuhachi accents, a duel or patrol clash, agile and human-scale, no massive choir, around 135 bpm, no big intro or outro, instrumental

**Superhero — `BGM/battle/superhero/`**
> Superhero skirmish combat, driving action strings and blockbuster brass hits over hybrid percussion, a street-level fight against henchmen, bold and kinetic but not endgame, around 140 bpm, no big intro or outro, instrumental

**Pulp — `BGM/battle/pulp/`**
> Pulp-expedition skirmish, racing brass and jungle or tomb percussion with aggressive string ostinatos, a dig-site ambush or temple fight, globe-trotting and human-scale, around 135-145 bpm, no big intro or outro, instrumental

## `boss/` — climactic showdowns (NEW)

The fight everything led to: the dragon on its hoard, the god-machine, the
kingpin's penthouse. Colossal, dark, overwhelming — massive choirs and
doom brass are *required* here, exactly what `battle/` forbids.

**Neutral — `BGM/boss/`**
> Colossal final-boss battle music, massive low choir and doom-laden brass, thundering half-time percussion under racing string ostinatos, a tolling low bell or sub hits, overwhelming and apocalyptic, the confrontation everything led to, dark and enormous, around 90-110 bpm with double-time flurries, no big intro or outro, instrumental

**Fantasy — `BGM/boss/fantasy/`**
> Epic fantasy final-boss music, massive dark choir and war horns, thundering taiko under furious string ostinatos, a tolling bell and shrieking high strings, an ancient evil unleashed at full power, apocalyptic scale and dread majesty, no big intro or outro, instrumental

**Scifi — `BGM/boss/scifi/`**
> Sci-fi final-boss confrontation, crushing distorted synth bass and industrial percussion, massive braams and racing arpeggiators, klaxon textures bleeding into the score, a dreadnought or god-machine awakening, apocalyptic scale, no big intro or outro, instrumental

**Horror — `BGM/boss/horror/`**
> Horror final confrontation, overwhelming dissonant orchestra and full dark choir, pounding ritual drums, shrieking string clusters over an abyssal drone, facing the source of the nightmare, cataclysmic and terrifying, no big intro or outro, instrumental

**Noir — `BGM/boss/noir/`**
> Noir showdown with the kingpin, dark heavy brass and urgent full strings over a pounding pulse, jagged piano stabs and a wailing muted trumpet, the whole city holding its breath, grand fatal confrontation, weighty and inescapable, no big intro or outro, instrumental

**Modern — `BGM/boss/modern/`**
> Modern endgame confrontation, massive hybrid orchestra, doom braams and relentless processed percussion, racing staccato strings and a dark choir pad, the final operation against the mastermind, overwhelming cinematic scale, no big intro or outro, instrumental

**Western — `BGM/boss/western/`**
> Western final showdown, doom-laden mariachi trumpet and a massive orchestral swell over a funeral-march pulse, cracking whip percussion and tremolo strings, high noon against the legend himself, mythic and heavy, no big intro or outro, instrumental

**Postapoc — `BGM/boss/postapoc/`**
> Wasteland warlord boss battle, crushing industrial percussion and walls of distorted guitar and raw synth, a massive chanting or droning choir, war drums and engines at the end of the world, apocalyptic and merciless, no big intro or outro, instrumental

**Cyberpunk — `BGM/boss/cyberpunk/`**
> Cyberpunk final-boss confrontation, crushing industrial techno and distorted darksynth bass, massive braams and racing glitch arps, a megacorp AI or cyber-demon awakening, apocalyptic neon scale, no big intro or outro, instrumental

**Steampunk — `BGM/boss/steampunk/`**
> Steampunk final-boss music, massive Victorian brass and thundering clockwork percussion under furious strings, a colossal engine-god or airship dreadnought, overwhelming and industrial-grand, no big intro or outro, instrumental

**Gothic — `BGM/boss/gothic/`**
> Gothic final-boss music, massive pipe organ and dark choir over thundering percussion and furious chamber strings, an ancient curse or vampire lord at full power, apocalyptic and mournful, no big intro or outro, instrumental

**Urbanfantasy — `BGM/boss/urbanfantasy/`**
> Urban-fantasy final confrontation, massive dark-electronic pads and heavy trip-hop drums under urgent noir-jazz brass and full strings, the city's hidden god or elder vampire revealed, overwhelming night-scale, no big intro or outro, instrumental

**Spaceopera — `BGM/boss/spaceopera/`**
> Space-opera final-boss music, massive heroic brass and full dark choir over thundering orchestral percussion and racing strings, a dreadnought or dark emperor confrontation, galactic and apocalyptic, no big intro or outro, instrumental

**Pirate — `BGM/boss/pirate/`**
> Pirate final showdown, massive naval brass and thundering wooden percussion under furious fiddle and low choir, the kraken or pirate king at full power, colossal and salt-sprayed, no big intro or outro, instrumental

**Cozy — `BGM/boss/cozy/`**
> Cozy endgame confrontation, bigger soft-orchestral percussion and bold piano or wooden-flute motifs over warm strings, the village's greatest threat faced head-on, dramatic for the scale but never grimdark, no big intro or outro, instrumental

**Eastasian — `BGM/boss/eastasian/`**
> East-Asian final-boss music, thunderous taiko and massive dark choir over furious guzheng or koto ostinatos and piercing shakuhachi, a demon lord or fallen emperor, apocalyptic and majestic, no big intro or outro, instrumental

**Superhero — `BGM/boss/superhero/`**
> Superhero endgame confrontation, massive blockbuster brass and driving action strings over relentless hybrid percussion and a dark choir pad, the archvillain's final form, overwhelming cinematic scale, no big intro or outro, instrumental

**Pulp — `BGM/boss/pulp/`**
> Pulp final-boss expedition music, massive brassy serial fanfare and thundering jungle or tomb percussion under furious adventure strings, the temple god or cult leader revealed, colossal and globe-trotting, no big intro or outro, instrumental

## `mystery/` — investigation, ruins, strangeness

**Neutral — `BGM/mystery/`**
> Enigmatic underscore, music box and glass textures, slow viola or synth phrases in a minor mode, subtle wind-chime shimmer, curious and unsettling in equal measure, sparse and spacious, no fade to silence, instrumental

**Fantasy — `BGM/mystery/fantasy/`**
> Enigmatic arcane underscore, glass harmonica and music box textures, slow viola phrases in a minor mode, whispers of wind chimes, curious and unsettling in equal measure, fog over old stone, sparse and spacious, instrumental

**Scifi — `BGM/mystery/scifi/`**
> Enigmatic sci-fi underscore, sparse metallic pings and glassy pads, slow detuned synth phrases, faint radio-static shimmer, an anomaly in deep space, curious and unsettling, spacious, no fade to silence, instrumental

**Horror — `BGM/mystery/horror/`**
> Unsettling horror mystery, a lone music box and prepared-piano plinks, faint whispering textures, slow minor viola, dread curiosity in an abandoned place, very sparse and spacious, no fade to silence, instrumental

**Noir — `BGM/mystery/noir/`**
> Enigmatic noir mystery, lone vibraphone and sparse piano, muted trumpet sighs, a ticking clock, clues surfacing in the fog, curious and unsettling, spacious and slow, no fade to silence, instrumental

**Modern — `BGM/mystery/modern/`**
> Modern investigation mystery, sparse piano and glassy synth textures, a slow pulsing bass, faint ticking, following a lead in the dark, curious and unsettling, spacious, no fade to silence, instrumental

**Western — `BGM/mystery/western/`**
> Enigmatic western mystery, sparse muted guitar harmonics and a lonesome whistle, low tremolo strings, dust and secrets in a ghost town, curious and unsettling, spacious and slow, no fade to silence, instrumental

**Postapoc — `BGM/mystery/postapoc/`**
> Wasteland mystery underscore, sparse detuned piano or kalimba plinks over humming drones and faint geiger-tick textures, strange lights out past the ruins, curious and unsettling, spacious and slow, no fade to silence, instrumental

**Cyberpunk — `BGM/mystery/cyberpunk/`**
> Neon-noir cyberpunk mystery, sparse glassy synth pings and a slow darksynth pad, faint data-static shimmer, a lead buried in the net, curious and unsettling, spacious and slow, no fade to silence, instrumental

**Steampunk — `BGM/mystery/steampunk/`**
> Steampunk mystery, sparse music-box and clockwork ticks over low Victorian strings, a curious brass or accordion phrase, secrets in the workshop, spacious and slow, no fade to silence, instrumental

**Gothic — `BGM/mystery/gothic/`**
> Gothic mystery, sparse harpsichord and eerie chamber strings over a low organ drone, a fragile music-box motif, secrets in the manor library, curious and mournful, spacious and slow, no fade to silence, instrumental

**Urbanfantasy — `BGM/mystery/urbanfantasy/`**
> Urban-fantasy mystery, sparse noir-jazz piano and dark electronic pads over a slow trip-hop tick, clues in the city night, curious and unsettling, spacious and slow, no fade to silence, instrumental

**Spaceopera — `BGM/mystery/spaceopera/`**
> Space-opera mystery, sparse celesta and soft orchestral strings over a low brass drone, an ancient signal from the stars, curious and grand rather than cold-synth, spacious and slow, no fade to silence, instrumental

**Pirate — `BGM/mystery/pirate/`**
> Nautical mystery, sparse accordion or fiddle over gentle wooden percussion and a low drone, a map with missing pieces, curious and salt-sprayed, spacious and slow, no fade to silence, instrumental

**Cozy — `BGM/mystery/cozy/`**
> Soft cozy mystery, sparse piano or wooden flute over light bells and a gentle lo-fi tick, a small-town puzzle, curious rather than scary, spacious and slow, no fade to silence, instrumental

**Eastasian — `BGM/mystery/eastasian/`**
> East-Asian mystery, sparse guzheng or koto plinks over soft shakuhachi and a low drone, secrets in the mist, curious and serene, spacious and slow, no fade to silence, instrumental

**Superhero — `BGM/mystery/superhero/`**
> Superhero investigation mystery, sparse piano and soft action-string pads over a restrained pulse, following a lead before the next fight, curious and cinematic, spacious and slow, no fade to silence, instrumental

**Pulp — `BGM/mystery/pulp/`**
> Pulp-expedition mystery, sparse exotic percussion and soft brass over a low drone, a half-translated tablet in the tomb, curious and globe-trotting, spacious and slow, no fade to silence, instrumental

## `dread/` — horror, something is very wrong

**Neutral — `BGM/dread/`**
> Dark ambient horror drone, sub bass swells, bowed metal and detuned strings, a distant heartbeat pulse, dissonant breaths, creeping dread without jump scares, very sparse, glacial pacing, no fade to silence, instrumental

**Fantasy — `BGM/dread/fantasy/`**
> Dark ambient horror drone, sub bass swells, bowed metal and detuned strings, a distant heartbeat pulse, dissonant choir breaths, creeping dread without jump scares, very sparse, glacial pacing, instrumental

**Scifi — `BGM/dread/scifi/`**
> Sci-fi horror drone, groaning hull sub-bass swells, bowed metal and detuned synth, a distant alarm pulse, something loose on the ship, very sparse, glacial pacing, no fade to silence, instrumental

**Horror — `BGM/dread/horror/`**
> Pure horror dread drone, deep sub-bass swells, bowed metal and detuned strings, a distant heartbeat, breathy dissonant choir, creeping terror without jump scares, glacial and airless, no fade to silence, instrumental

**Noir — `BGM/dread/noir/`**
> Dark noir dread, a low bowed-bass drone, dissonant muted brass, a distant siren-like clarinet, a body in the alley, very sparse and heavy, glacial pacing, no fade to silence, instrumental

**Modern — `BGM/dread/modern/`**
> Modern dread drone, deep synth sub-bass swells, dissonant sustained strings, a distant low alarm, the operation gone badly wrong, very sparse and heavy, glacial pacing, no fade to silence, instrumental

**Western — `BGM/dread/western/`**
> Grim western dread, a low bowed drone and detuned guitar, a distant coyote wail, scraping wind, something waiting in the dark canyon, very sparse, glacial pacing, no fade to silence, instrumental

**Postapoc — `BGM/dread/postapoc/`**
> Wasteland dread drone, deep irradiated sub swells, groaning metal and detuned strings, a distant warning siren swallowed by wind, something wrong in the crater, very sparse, glacial pacing, no fade to silence, instrumental

**Cyberpunk — `BGM/dread/cyberpunk/`**
> Neon-noir cyberpunk dread, deep distorted darksynth sub swells, glitching bowed-metal textures, a distant alarm swallowed by rain, something wrong in the net, very sparse, glacial pacing, no fade to silence, instrumental

**Steampunk — `BGM/dread/steampunk/`**
> Steampunk dread, a low boiler-room drone and detuned Victorian strings, distant clockwork grinding, something wrong in the machine, very sparse, glacial pacing, no fade to silence, instrumental

**Gothic — `BGM/dread/gothic/`**
> Gothic dread, a low pipe-organ drone and eerie chamber-string clusters, a distant heartbeat, candlelight dying in the hall, creeping wrongness without jump scares, glacial pacing, no fade to silence, instrumental

**Urbanfantasy — `BGM/dread/urbanfantasy/`**
> Urban-fantasy dread, a low dark-electronic drone and sparse noir-jazz dissonance, a distant siren, the city's hidden world turning hostile, very sparse, glacial pacing, no fade to silence, instrumental

**Spaceopera — `BGM/dread/spaceopera/`**
> Space-opera dread, deep orchestral sub swells and low brass drones, a distant klaxon under vast silence, something wrong beyond the viewport, grand and cold rather than pure synth horror, glacial pacing, no fade to silence, instrumental

**Pirate — `BGM/dread/pirate/`**
> Nautical dread, a low creaking-hull drone and sparse detuned fiddle, distant wind over black water, something waiting beneath the waves, very sparse, glacial pacing, no fade to silence, instrumental

**Cozy — `BGM/dread/cozy/`**
> Soft cozy unease, a hollow piano drone and sparse wooden-flute sighs, mild wrongness in a familiar place, restrained and never full horror, glacial pacing, no fade to silence, instrumental

**Eastasian — `BGM/dread/eastasian/`**
> East-Asian dread, a low shakuhachi drone and sparse detuned guzheng, distant taiko like a held breath, something wrong in the mist, very sparse, glacial pacing, no fade to silence, instrumental

**Superhero — `BGM/dread/superhero/`**
> Superhero dread, deep hybrid-orchestra drones and dissonant action strings, a distant low alarm, the city holding its breath before catastrophe, sparse and heavy, glacial pacing, no fade to silence, instrumental

**Pulp — `BGM/dread/pulp/`**
> Pulp-expedition dread, a low exotic-drone and sparse detuned brass, distant tomb wind, something wrong in the dig, very sparse, glacial pacing, no fade to silence, instrumental

## `triumph/` — victory, celebration

**Neutral — `BGM/triumph/`**
> Triumphant cinematic swell turned underscore, soaring strings and brass, bright major key, timpani rolls and cymbal swells, golden dawn after the storm, celebratory but not cheesy, resolves gently so it can loop, instrumental

**Fantasy — `BGM/triumph/fantasy/`**
> Triumphant fantasy fanfare turned underscore, noble French horns and soaring strings, bright major key, timpani rolls and cymbal swells, golden sunrise after the battle, celebratory but not cheesy, resolves gently so it can loop, instrumental

**Scifi — `BGM/triumph/scifi/`**
> Triumphant sci-fi swell, soaring synth leads over bright pads, rising arpeggios and cymbal shimmer, a ship breaking orbit into dawn light, celebratory, resolves gently so it can loop, instrumental

**Horror — `BGM/triumph/horror/`**
> Grim horror reprieve, a fragile major chord emerging from dissonance, warm strings pushing back the dark, uneasy relief rather than celebration, swells and resolves gently so it can loop, instrumental

**Noir — `BGM/triumph/noir/`**
> Bittersweet noir resolve, warm swelling strings with a lone muted trumpet, the case closed at dawn, hard-won and understated rather than cheesy, resolves gently so it can loop, instrumental

**Modern — `BGM/triumph/modern/`**
> Triumphant modern swell, soaring strings and bright brass over a driving pulse, mission accomplished at sunrise, celebratory but sleek, resolves gently so it can loop, instrumental

**Western — `BGM/triumph/western/`**
> Triumphant western swell, soaring fiddle and mariachi trumpet over full strings, a warm sunrise after the showdown, celebratory but rugged, resolves gently so it can loop, instrumental

**Postapoc — `BGM/triumph/postapoc/`**
> Hard-won wasteland triumph, warm strings and a soaring guitar or trumpet lead rising over dusty drones, the settlement stands and sun breaks through the haze, gritty joy, resolves gently so it can loop, instrumental

**Cyberpunk — `BGM/triumph/cyberpunk/`**
> Neon cyberpunk triumph, soaring synthwave leads over bright darksynth pads and a driving retro pulse, rain clearing over the skyline after the run, celebratory with a gritty edge, resolves gently so it can loop, instrumental

**Steampunk — `BGM/triumph/steampunk/`**
> Steampunk triumph, soaring Victorian brass and warm strings over bright clockwork percussion, airships rising into sunrise, celebratory and grand, resolves gently so it can loop, instrumental

**Gothic — `BGM/triumph/gothic/`**
> Gothic triumph, warm chamber strings and a noble organ swell over a fragile major motif, candlelight returning to the hall, hard-won relief rather than pure cheer, resolves gently so it can loop, instrumental

**Urbanfantasy — `BGM/triumph/urbanfantasy/`**
> Urban-fantasy triumph, warm noir-jazz horns and swelling dark-electronic pads over a hopeful trip-hop pulse, dawn over the city after the night's fight, celebratory with a cool edge, resolves gently so it can loop, instrumental

**Spaceopera — `BGM/triumph/spaceopera/`**
> Space-opera triumph, soaring heroic brass and full strings over bright timpani, a fleet breaking into dawn light, grand and celebratory, resolves gently so it can loop, instrumental

**Pirate — `BGM/triumph/pirate/`**
> Pirate triumph, soaring fiddle and accordion over warm naval brass and wooden percussion, safe harbor after the storm, celebratory and salt-sprayed, resolves gently so it can loop, instrumental

**Cozy — `BGM/triumph/cozy/`**
> Cozy triumph, bright soft piano and warm acoustic guitar over light bells and a gentle lo-fi beat, the village festival after the scare, gentle joy rather than epic fanfare, resolves gently so it can loop, instrumental

**Eastasian — `BGM/triumph/eastasian/`**
> East-Asian triumph, soaring erhu or shakuhachi over bright guzheng and rolling taiko, sunrise over the peaks after victory, celebratory and majestic, resolves gently so it can loop, instrumental

**Superhero — `BGM/triumph/superhero/`**
> Superhero triumph, soaring blockbuster brass and optimistic action strings over a bright hybrid pulse, the city cheering at dawn, celebratory and bold, resolves gently so it can loop, instrumental

**Pulp — `BGM/triumph/pulp/`**
> Pulp-expedition triumph, soaring brassy serial fanfare and warm adventure strings over bright exotic percussion, the treasure secured and the map complete, celebratory and globe-trotting, resolves gently so it can loop, instrumental

## `wonder/` — awe, vistas, revealed magic

**Neutral — `BGM/wonder/`**
> Ethereal wonder theme, celesta and glass bells over lush string or synth pads, wordless soprano vocalise used as an instrument, floating glissandi, starlight and first snowfall, weightless and luminous, no fade to silence, instrumental

**Fantasy — `BGM/wonder/fantasy/`**
> Ethereal wonder theme, celesta and glass bells over lush string pads, wordless soprano vocalise used as an instrument, floating harp glissandi, starlight and first snowfall, weightless and luminous, instrumental

**Scifi — `BGM/wonder/scifi/`**
> Ethereal sci-fi wonder, glassy bells and lush synth pads, wordless vocalise used as an instrument, slow floating arpeggios, a nebula unfolding beyond the glass, weightless and luminous, no fade to silence, instrumental

**Horror — `BGM/wonder/horror/`**
> Eerie horror wonder, shimmering glassy bells over cold pads, a wordless vocalise turned ghostly, beautiful but wrong, floating and weightless with a chill, no fade to silence, instrumental

**Noir — `BGM/wonder/noir/`**
> Wistful noir wonder, shimmering vibraphone and soft strings, a sultry clarinet line, neon reflected in rain, weightless and bittersweet, floating, no fade to silence, instrumental

**Modern — `BGM/wonder/modern/`**
> Contemporary wonder, shimmering synth bells and lush pads, a wordless vocalise, the city skyline at night from above, weightless and luminous, floating, no fade to silence, instrumental

**Western — `BGM/wonder/western/`**
> Expansive western wonder, shimmering reverb guitar and soft strings, a lonesome whistle turned luminous, endless sky over the mesa, weightless and awed, floating, no fade to silence, instrumental

**Postapoc — `BGM/wonder/postapoc/`**
> Wasteland wonder, shimmering bells and lush pads blooming over dusty textures, a wordless vocalise, green shoots through cracked concrete, awe that the world can still be beautiful, weightless and luminous, no fade to silence, instrumental

**Cyberpunk — `BGM/wonder/cyberpunk/`**
> Neon cyberpunk wonder, shimmering glassy synth bells over lush darksynth pads, a wordless vocalise, the city skyline blooming through rain and holograms, weightless and luminous with a gritty edge, no fade to silence, instrumental

**Steampunk — `BGM/wonder/steampunk/`**
> Steampunk wonder, shimmering music-box and glass bells over warm Victorian strings, a floating brass or accordion motif, airships against a painted sky, weightless and luminous, no fade to silence, instrumental

**Gothic — `BGM/wonder/gothic/`**
> Gothic wonder, shimmering glass bells over lush chamber strings and a soft organ pad, a fragile wordless vocalise, moonlight through stained glass, beautiful and slightly mournful, weightless, no fade to silence, instrumental

**Urbanfantasy — `BGM/wonder/urbanfantasy/`**
> Urban-fantasy wonder, shimmering vibraphone and soft noir-jazz pads over dark electronic bloom, a wordless vocalise, magic revealed in the city night, weightless and luminous, no fade to silence, instrumental

**Spaceopera — `BGM/wonder/spaceopera/`**
> Space-opera wonder, shimmering celesta and lush orchestral strings over soft heroic brass, a wordless vocalise, a nebula unfolding beyond the glass, grand and weightless rather than cold-synth, no fade to silence, instrumental

**Pirate — `BGM/wonder/pirate/`**
> Nautical wonder, shimmering bells and soft accordion over warm strings, a floating fiddle motif, first sight of an uncharted island at dawn, weightless and salt-sprayed, no fade to silence, instrumental

**Cozy — `BGM/wonder/cozy/`**
> Cozy wonder, light bells and soft piano over fingerpicked guitar and a gentle lo-fi bloom, a wordless vocalise, fireflies over the meadow, weightless and tender, no fade to silence, instrumental

**Eastasian — `BGM/wonder/eastasian/`**
> East-Asian wonder, shimmering guzheng harmonics and soft shakuhachi over lush pads, a floating erhu motif, mist parting over sacred peaks, weightless and luminous, no fade to silence, instrumental

**Superhero — `BGM/wonder/superhero/`**
> Superhero wonder, shimmering bells and lush action-string pads over soft optimistic brass, a wordless vocalise, the city from above at golden hour, weightless and luminous, no fade to silence, instrumental

**Pulp — `BGM/wonder/pulp/`**
> Pulp-expedition wonder, shimmering exotic bells and soft brass over warm adventure strings, a floating motif, first light on the lost city, weightless and globe-trotting, no fade to silence, instrumental

## `somber/` — loss, mourning, quiet aftermath

Private, dignified grief — one voice, small room. (The *end-credits*
version of grief lives in `outro-defeat/`, which is bigger and darker;
keep these two shelves distinct.)

**Neutral — `BGM/somber/`**
> Mournful solo cello elegy with sparse piano, slow air on strings, rainy grey light, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Fantasy — `BGM/somber/fantasy/`**
> Mournful solo cello elegy with sparse piano, slow air on strings, rainy grey light, dignified grief, long silences between phrases, a funeral for a hero, quiet and restrained, instrumental

**Scifi — `BGM/somber/scifi/`**
> Mournful sci-fi elegy, a lone sustained synth pad and sparse piano, slow airy drone, cold starlight through a viewport, dignified grief, long silences, quiet and restrained, no fade to silence, instrumental

**Horror — `BGM/somber/horror/`**
> Mournful horror elegy, lone cello over a hollow drone, sparse detuned piano, a funeral in a haunted place, dignified grief shot through with dread, long silences, quiet, no fade to silence, instrumental

**Noir — `BGM/somber/noir/`**
> Mournful noir elegy, a lone muted trumpet over sparse piano and brushed cymbal, rainy grey light, dignified grief in a dim room, long silences between phrases, quiet, no fade to silence, instrumental

**Modern — `BGM/somber/modern/`**
> Mournful modern elegy, lone piano over a soft sustained synth pad, slow strings, grey rain on glass, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Western — `BGM/somber/western/`**
> Mournful western elegy, lone reverb guitar over sparse strings and harmonica, dignified grief on the frontier, a grave at dusk, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Postapoc — `BGM/somber/postapoc/`**
> Wasteland elegy, a lone detuned guitar or cello over a dusty drone, sparse piano, a grave marked with scrap metal, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Cyberpunk — `BGM/somber/cyberpunk/`**
> Neon-noir cyberpunk elegy, a lone glassy synth pad and sparse piano over a soft darksynth drone, rain on the apartment window, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Steampunk — `BGM/somber/steampunk/`**
> Steampunk elegy, a lone accordion or cello over sparse Victorian piano and a soft clockwork tick, dignified grief by lamplight, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Gothic — `BGM/somber/gothic/`**
> Gothic elegy, a lone cello over sparse harpsichord and a low organ drone, dignified grief in a candlelit chapel, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Urbanfantasy — `BGM/somber/urbanfantasy/`**
> Urban-fantasy elegy, a lone muted trumpet or piano over soft dark-electronic pads, dignified grief after midnight, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Spaceopera — `BGM/somber/spaceopera/`**
> Space-opera elegy, a lone horn or cello over soft orchestral pads, cold starlight through a viewport, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Pirate — `BGM/somber/pirate/`**
> Nautical elegy, a lone accordion or fiddle over sparse strings, a burial at sea under grey light, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Cozy — `BGM/somber/cozy/`**
> Cozy elegy, a lone soft piano or wooden flute over sparse acoustic guitar, quiet mourning in a small room, tender and restrained, long silences between phrases, no fade to silence, instrumental

**Eastasian — `BGM/somber/eastasian/`**
> East-Asian elegy, a lone erhu or shakuhachi over sparse guzheng, dignified grief in the mist, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Superhero — `BGM/somber/superhero/`**
> Superhero elegy, a lone piano over soft action-string pads, dignified grief after the cost of victory, long silences between phrases, quiet and restrained, no fade to silence, instrumental

**Pulp — `BGM/somber/pulp/`**
> Pulp-expedition elegy, a lone muted brass or guitar over sparse exotic percussion, a grave at the dig site, dignified grief, long silences between phrases, quiet and restrained, no fade to silence, instrumental

## `outro/` — generic end credits (any ending)

Plays when the AI calls `end_campaign` and the Three.js outro takes the TV,
whenever the specific `outro-<state>/` shelf is empty. All outro music
loops under the credits until the host leaves — keep the
no-intro/no-outro/no-silent-tail rule.

**Neutral — `BGM/outro/`**
> Cinematic end-credits theme, warm strings and reflective piano over a slow noble pulse, equal parts gratitude and farewell, grand but tender, gentle swells that resolve and return, works over victory or loss alike, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro/fantasy/`**
> Fantasy end-credits theme, warm strings and harp over reflective piano, a noble horn recalling the journey, gratitude and farewell around the last campfire, grand but tender, gentle swells that resolve and return, works over victory or loss alike, no fade to silence, instrumental

**Scifi — `BGM/outro/scifi/`**
> Sci-fi end-credits theme, warm analog synth pads and a slow soaring lead, gentle arpeggios like receding stars, reflective and vast, a farewell transmission from orbit, works over victory or loss alike, gentle swells that resolve and return, no fade to silence, instrumental

**Horror — `BGM/outro/horror/`**
> Horror end-credits theme, a fragile piano melody over dark ambient drones, a distant detuned music box, mournful strings, the dread recedes but never quite leaves, reflective and uneasy, works whether the survivors won or lost, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro/noir/`**
> Noir end-credits theme, smoky muted trumpet over brushed drums and lounge piano, one last slow walk into the rain, world-weary but warm, bittersweet resolve that suits a closed case or a cold one, gentle swells that resolve and return, no fade to silence, instrumental

**Modern — `BGM/outro/modern/`**
> Modern end-credits theme, warm hybrid pads and reflective piano over a slow steady pulse, strings swelling with quiet resolve, the debrief after the operation, sleek and heartfelt, works over success or failure alike, resolves gently to loop, no fade to silence, instrumental

**Western — `BGM/outro/western/`**
> Western end-credits theme, warm reverb guitar and fiddle over slow strings, a lonesome whistle bidding farewell, riding toward the horizon at dusk, dusty and tender, suits a won showdown or a lost one, gentle swells that resolve and return, no fade to silence, instrumental

**Postapoc — `BGM/outro/postapoc/`**
> Wasteland end-credits theme, warm dusty guitar and strings over a slow steady pulse, a weathered hopeful lead, survivors walking into the sunrise, gratitude and grit in equal measure, works over victory or loss alike, gentle swells that resolve and return, no fade to silence, instrumental

**Cyberpunk — `BGM/outro/cyberpunk/`**
> Neon-noir cyberpunk end-credits theme, warm darksynth pads and a reflective synthwave lead over a slow retro pulse, rain clearing on the skyline, gratitude and farewell with a gritty edge, works over victory or loss alike, gentle swells that resolve and return, no fade to silence, instrumental

**Steampunk — `BGM/outro/steampunk/`**
> Steampunk end-credits theme, warm Victorian strings and soft brass over a gentle clockwork pulse, a reflective accordion or music-box motif, airships drifting into dusk, gratitude and farewell, works over victory or loss alike, no fade to silence, instrumental

**Gothic — `BGM/outro/gothic/`**
> Gothic end-credits theme, warm chamber strings and a soft organ pad over sparse harpsichord, a mournful-but-tender motif, candlelight and farewell, works over victory or loss alike, gentle swells that resolve and return, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro/urbanfantasy/`**
> Urban-fantasy end-credits theme, warm noir-jazz horns and reflective piano over a slow trip-hop pulse and dark electronic pads, one last walk through the city night, works over victory or loss alike, no fade to silence, instrumental

**Spaceopera — `BGM/outro/spaceopera/`**
> Space-opera end-credits theme, warm orchestral strings and soft heroic brass over a slow noble pulse, a reflective horn motif, a farewell among the stars, grand and tender, works over victory or loss alike, no fade to silence, instrumental

**Pirate — `BGM/outro/pirate/`**
> Pirate end-credits theme, warm accordion and fiddle over slow strings and gentle wooden percussion, a last look at the open sea, salt-sprayed gratitude and farewell, works over victory or loss alike, no fade to silence, instrumental

**Cozy — `BGM/outro/cozy/`**
> Cozy end-credits theme, soft piano and fingerpicked acoustic guitar over light bells and a gentle lo-fi pulse, a warm farewell by the hearth, tender and inviting, works over victory or loss alike, no fade to silence, instrumental

**Eastasian — `BGM/outro/eastasian/`**
> East-Asian end-credits theme, warm guzheng and soft shakuhachi over slow strings and a gentle taiko pulse, a reflective erhu motif, farewell in the mist, works over victory or loss alike, no fade to silence, instrumental

**Superhero — `BGM/outro/superhero/`**
> Superhero end-credits theme, warm blockbuster brass and reflective piano over soft action strings, a hopeful fanfare turned tender, the city at dusk after the fight, works over victory or loss alike, no fade to silence, instrumental

**Pulp — `BGM/outro/pulp/`**
> Pulp-expedition end-credits theme, warm brass and reflective adventure strings over soft exotic percussion, a last look at the map, gratitude and farewell, works over victory or loss alike, no fade to silence, instrumental

## `outro-<state>/` — end credits tailored to the ending

The **kind** of ending picks the shelf, so a triumphant win and a
total-party-wipe never share a cue. The host resolves
`outro-<kind>` → generic `outro` → the nearest existing mood, so every
folder is optional. Fill the ones you care about first.

Fallbacks per ending (most-specific first):

| Shelf | Falls back to |
| --- | --- |
| `outro-victory` | `outro → triumph → wonder → main` |
| `outro-defeat` | `outro → somber → dread → main` |
| `outro-bittersweet` | `outro → somber → calm → triumph → main` |
| `outro-escape` | `outro → adrenaline → tense → triumph → main` |
| `outro-draw` | `outro → somber → calm → main` |
| `outro-cliffhanger` | `outro → mystery → dread → tense → main` |

Each state shelf takes genre subfolders exactly like the moods
(`outro-victory/fantasy/`, `outro-defeat/cyberpunk/`, …). Prompts below are
open-ended with swap levers (`or`) so one paste can yield varied takes —
commit to different lever choices across 4–6 generations and keep the best 2–3.

### `outro-victory/` — the party won

**Neutral — `BGM/outro-victory/`**
> Triumphant end-credits theme, soaring strings or brass over a warm major-key pulse, bright harp or choir swells, earned jubilation and gratitude, heroic but not gloating, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro-victory/fantasy/`**
> Triumphant fantasy end-credits, noble horns and soaring strings over warm harp or dulcimer, bright major key, golden sunrise after the battle, earned jubilation, seamless loop feel, no fade to silence, instrumental

**Scifi — `BGM/outro-victory/scifi/`**
> Triumphant sci-fi end-credits, soaring synth leads over bright pads and rising arpeggios, a ship breaking orbit into dawn, celebratory and vast, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/outro-victory/horror/`**
> Hard-won horror end-credits, a fragile major melody emerging from dark drones, warm strings pushing back the night, relief more than parade, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro-victory/noir/`**
> Hard-boiled noir victory end-credits, warm strings and a confident muted trumpet over brushed drums, the case closed at dawn, understated swagger, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/outro-victory/modern/`**
> Modern victory end-credits, soaring strings and bright brass over a sleek hybrid pulse, mission accomplished at sunrise, celebratory but cool, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/outro-victory/western/`**
> Western victory end-credits, soaring fiddle or mariachi trumpet over full strings, sunrise after the showdown, rugged celebration, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/outro-victory/postapoc/`**
> Wasteland victory end-credits, warm strings and a soaring guitar or trumpet over dusty drones, the settlement stands, gritty joy, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/outro-victory/cyberpunk/`**
> Neon cyberpunk victory end-credits, soaring synthwave leads over bright darksynth pads and a driving retro pulse, rain clearing on the skyline after the run, gritty jubilation, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/outro-victory/steampunk/`**
> Steampunk victory end-credits, soaring Victorian brass and warm strings over bright clockwork percussion, airships rising into sunrise, grand celebration, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/outro-victory/gothic/`**
> Gothic victory end-credits, warm chamber strings and a noble organ swell over a fragile major motif, candlelight returning to the hall, hard-won relief, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro-victory/urbanfantasy/`**
> Urban-fantasy victory end-credits, warm noir-jazz horns and swelling dark-electronic pads over a hopeful trip-hop pulse, dawn over the city after the night's fight, cool celebration, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/outro-victory/spaceopera/`**
> Space-opera victory end-credits, soaring heroic brass and full strings over bright timpani, a fleet breaking into dawn light, grand galactic celebration, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/outro-victory/pirate/`**
> Pirate victory end-credits, soaring fiddle and accordion over warm naval brass and wooden percussion, safe harbor after the storm, salt-sprayed celebration, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/outro-victory/cozy/`**
> Cozy victory end-credits, bright soft piano and warm acoustic guitar over light bells and a gentle lo-fi beat, the village festival after the scare, gentle joy rather than epic fanfare, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/outro-victory/eastasian/`**
> East-Asian victory end-credits, soaring erhu or shakuhachi over bright guzheng and rolling taiko, sunrise over the peaks, majestic celebration, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/outro-victory/superhero/`**
> Superhero victory end-credits, soaring blockbuster brass and optimistic action strings over a bright hybrid pulse, the city cheering at dawn, bold celebration, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/outro-victory/pulp/`**
> Pulp victory end-credits, soaring brassy serial fanfare and warm adventure strings over bright exotic percussion, the treasure secured, globe-trotting celebration, seamless loop feel, no fade to silence, instrumental

### `outro-defeat/` — the party lost, died, or failed

Not the quiet private grief of `somber/` — a full dark requiem with weight
and finality.

**Neutral — `BGM/outro-defeat/`**
> Dark requiem end-credits, heavy low brass or full mourning choir over a slow tolling bell, grave processional pulse, the crushing weight of final defeat, vast and shadowed rather than gentle, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro-defeat/fantasy/`**
> Dark fantasy requiem end-credits, heavy low brass and mourning choir over a tolling bell, slow processional strings, a funeral for the world that could have been, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Scifi — `BGM/outro-defeat/scifi/`**
> Sci-fi defeat end-credits, deep sub drones and cold synth pads over a slow tolling pulse, a dead ship drifting, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/outro-defeat/horror/`**
> Horror defeat end-credits, full dark choir and bowed metal over an abyssal drone, a tolling bell, the nightmare won, vast and terrifying rather than gentle, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro-defeat/noir/`**
> Noir defeat end-credits, heavy muted brass and sparse piano over a funeral pulse, rain and a cold case that stayed cold, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/outro-defeat/modern/`**
> Modern defeat end-credits, heavy hybrid orchestra and dark choir pads over a slow processional pulse, the operation failed, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/outro-defeat/western/`**
> Western defeat end-credits, doom-laden trumpet and low strings over a funeral-march pulse, a grave on the frontier, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/outro-defeat/postapoc/`**
> Wasteland defeat end-credits, crushing industrial drones and mourning strings over scrap-metal tolls, the settlement fell, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/outro-defeat/cyberpunk/`**
> Neon cyberpunk defeat end-credits, crushing darksynth drones and distorted bass over a slow industrial pulse, the megacorp won, rain and neon on a dead street, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/outro-defeat/steampunk/`**
> Steampunk defeat end-credits, heavy Victorian brass and low organ over grinding clockwork, a broken engine and a lost city, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/outro-defeat/gothic/`**
> Gothic defeat end-credits, massive pipe organ and dark choir over a tolling bell, candlelight snuffed in the hall, vast and mournful, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro-defeat/urbanfantasy/`**
> Urban-fantasy defeat end-credits, heavy dark-electronic drones and mourning noir-jazz brass over a slow trip-hop dirge, the city's hidden world lost, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/outro-defeat/spaceopera/`**
> Space-opera defeat end-credits, massive low brass and full mourning choir over a slow processional pulse, a fleet lost among the stars, vast and galactic, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/outro-defeat/pirate/`**
> Pirate defeat end-credits, heavy low strings and mourning accordion over a slow naval drum, a ship gone under black water, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/outro-defeat/cozy/`**
> Cozy defeat end-credits, sparse piano and hollow wooden flute over a soft mourning drone, a small world that could not be saved, tender but final rather than epic, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/outro-defeat/eastasian/`**
> East-Asian defeat end-credits, low shakuhachi and mourning erhu over sparse guzheng and a slow taiko toll, a fallen house in the mist, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/outro-defeat/superhero/`**
> Superhero defeat end-credits, heavy blockbuster brass turned dark and a mourning choir over a slow processional pulse, the city fallen, vast and shadowed, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/outro-defeat/pulp/`**
> Pulp defeat end-credits, heavy muted brass and mourning adventure strings over a slow exotic drum, the expedition lost in the tomb, vast and shadowed, seamless loop feel, no fade to silence, instrumental

### `outro-bittersweet/` — gains paid for in losses

**Neutral — `BGM/outro-bittersweet/`**
> Bittersweet end-credits theme, warm strings and reflective piano or a single wistful solo instrument, a major melody shadowed by minor harmony, gratitude and grief entwined, tender and resolved but aching, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro-bittersweet/fantasy/`**
> Bittersweet fantasy end-credits, warm strings and harp with a wistful horn or flute, major melody under minor shadow, the victory that cost too much, tender and aching, seamless loop feel, no fade to silence, instrumental

**Scifi — `BGM/outro-bittersweet/scifi/`**
> Bittersweet sci-fi end-credits, warm pads and a reflective synth lead over a slow pulse, stars receding after a costly win, tender and aching, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/outro-bittersweet/horror/`**
> Bittersweet horror end-credits, fragile piano over dark drones with a thin major thread, survivors walking away changed, tender and uneasy, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro-bittersweet/noir/`**
> Bittersweet noir end-credits, warm strings and a wistful muted trumpet over brushed drums, the case closed but the cost remains, tender and world-weary, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/outro-bittersweet/modern/`**
> Bittersweet modern end-credits, reflective piano and soft strings over a slow hybrid pulse, mission done and friends lost, tender and aching, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/outro-bittersweet/western/`**
> Bittersweet western end-credits, warm reverb guitar and a lonesome whistle over soft strings, the town saved and the rider leaving, tender and dusty, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/outro-bittersweet/postapoc/`**
> Bittersweet wasteland end-credits, warm dusty guitar and strings over a slow pulse, the settlement stands but graves remain, tender grit, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/outro-bittersweet/cyberpunk/`**
> Bittersweet cyberpunk end-credits, warm darksynth pads and a wistful synthwave lead over a slow retro pulse, the run succeeded and someone did not come back, neon rain and ache, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/outro-bittersweet/steampunk/`**
> Bittersweet steampunk end-credits, warm Victorian strings and a wistful accordion or music-box over a gentle clockwork pulse, the city saved and the cost counted, tender and brass-soft, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/outro-bittersweet/gothic/`**
> Bittersweet gothic end-credits, warm chamber strings and soft organ with a fragile major motif in minor shadow, candlelight and loss, tender and mournful, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro-bittersweet/urbanfantasy/`**
> Bittersweet urban-fantasy end-credits, warm noir-jazz horns and reflective piano over a slow trip-hop pulse, the night won and the price paid, tender and cool, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/outro-bittersweet/spaceopera/`**
> Bittersweet space-opera end-credits, warm orchestral strings and soft heroic brass with a wistful horn, the galaxy safer and friends gone, grand and aching, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/outro-bittersweet/pirate/`**
> Bittersweet pirate end-credits, warm accordion and fiddle over soft strings, safe harbor and empty berths, salt-sprayed gratitude and grief, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/outro-bittersweet/cozy/`**
> Bittersweet cozy end-credits, soft piano and fingerpicked guitar over light bells, the village safe and something gentle lost, tender rather than epic, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/outro-bittersweet/eastasian/`**
> Bittersweet East-Asian end-credits, warm guzheng and a wistful erhu or shakuhachi over soft strings, victory in the mist with quiet loss, tender and serene, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/outro-bittersweet/superhero/`**
> Bittersweet superhero end-credits, warm blockbuster brass turned soft and reflective piano over action-string pads, the city saved and the cost of being a hero, tender and bold, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/outro-bittersweet/pulp/`**
> Bittersweet pulp end-credits, warm brass and reflective adventure strings over soft exotic percussion, the treasure found and a companion left behind, tender and globe-trotting, seamless loop feel, no fade to silence, instrumental

### `outro-escape/` — survived by fleeing, threat remains

**Neutral — `BGM/outro-escape/`**
> Tense-relief end-credits theme, breathless strings or synths settling over a steady pulse, a cautious hopeful lead that keeps glancing over its shoulder, survival without safety, restless resolve, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro-escape/fantasy/`**
> Fantasy escape end-credits, breathless strings settling over a steady pulse, a cautious horn or flute lead, fled the dark with the threat still out there, restless resolve, seamless loop feel, no fade to silence, instrumental

**Scifi — `BGM/outro-escape/scifi/`**
> Sci-fi escape end-credits, racing arps settling into a steady pulse, a cautious synth lead, jump complete but the hunter still tracks, restless resolve, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/outro-escape/horror/`**
> Horror escape end-credits, racing strings settling over a held drone, a fragile hopeful thread that never fully relaxes, got out alive and the thing still waits, restless resolve, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro-escape/noir/`**
> Noir escape end-credits, sprinting bass settling into brushed drums, a cautious muted trumpet, out of the alley but not free, restless resolve, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/outro-escape/modern/`**
> Modern escape end-credits, taut hybrid pulse and settling strings, a cautious piano or synth lead, extracted but the op is not over, restless resolve, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/outro-escape/western/`**
> Western escape end-credits, galloping guitar settling into a steady pulse, a cautious whistle or fiddle, rode hard and the posse still rides, restless resolve, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/outro-escape/postapoc/`**
> Wasteland escape end-credits, junkyard pulse settling under dusty guitar, a cautious resilient lead, outran the raiders and the wastes remain, restless resolve, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/outro-escape/cyberpunk/`**
> Cyberpunk escape end-credits, industrial techno settling into a darksynth pulse, a cautious synthwave lead, out of the net and ICE still hunting, restless neon resolve, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/outro-escape/steampunk/`**
> Steampunk escape end-credits, clockwork chase settling into a steady brass pulse, a cautious accordion or violin lead, the airship fled and the empire still watches, restless resolve, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/outro-escape/gothic/`**
> Gothic escape end-credits, racing chamber strings settling over a low organ pulse, a cautious harpsichord motif, fled the manor and the curse still follows, restless resolve, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro-escape/urbanfantasy/`**
> Urban-fantasy escape end-credits, trip-hop chase settling into a dark-electronic pulse, a cautious noir-jazz lead, out of the night and the supernatural still waits, restless resolve, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/outro-escape/spaceopera/`**
> Space-opera escape end-credits, racing brass settling into a steady orchestral pulse, a cautious horn lead, jumped clear and the empire still hunts, restless galactic resolve, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/outro-escape/pirate/`**
> Pirate escape end-credits, racing fiddle settling into a sea-shanty pulse, a cautious accordion lead, slipped the noose and the navy still sails, restless salt-sprayed resolve, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/outro-escape/cozy/`**
> Cozy escape end-credits, a quick lo-fi scramble settling into soft piano, a cautious wooden-flute lead, got away from the scare and the worry lingers, restless but gentle, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/outro-escape/eastasian/`**
> East-Asian escape end-credits, racing taiko settling into a steady pulse, a cautious shakuhachi or erhu lead, fled through the mist and the enemy still follows, restless resolve, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/outro-escape/superhero/`**
> Superhero escape end-credits, racing action strings settling into a hybrid pulse, a cautious brass motif, got the civilians out and the villain still stands, restless resolve, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/outro-escape/pulp/`**
> Pulp escape end-credits, racing brass settling into exotic percussion, a cautious adventure-string lead, out of the tomb and the cult still chases, restless globe-trotting resolve, seamless loop feel, no fade to silence, instrumental

### `outro-draw/` — stalemate, neither side prevailed

Not peaceful and not hopeful-calm — restless and unresolved.

**Neutral — `BGM/outro-draw/`**
> Unresolved end-credits theme, a circling motif on strings or piano that never reaches its home chord, harmony drifting between minor and major without settling, restless embers of a fight nobody won, weary vigilance rather than peace, a moderate quiet pulse underneath, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro-draw/fantasy/`**
> Unresolved fantasy end-credits, a circling horn or string motif that never resolves, minor and major drifting, the war paused not ended, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Scifi — `BGM/outro-draw/scifi/`**
> Unresolved sci-fi end-credits, a circling synth motif over a quiet pulse, harmony that never settles, stalemate in the void, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/outro-draw/horror/`**
> Unresolved horror end-credits, a circling music-box or piano motif over a hollow drone, neither side won and the dark remains, weary vigilance, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro-draw/noir/`**
> Unresolved noir end-credits, a circling muted-trumpet motif over brushed drums, the case open and the city still dirty, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/outro-draw/modern/`**
> Unresolved modern end-credits, a circling piano motif over a quiet hybrid pulse, the op ended in stalemate, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/outro-draw/western/`**
> Unresolved western end-credits, a circling guitar or whistle motif over soft strings, neither gunslinger fell, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/outro-draw/postapoc/`**
> Unresolved wasteland end-credits, a circling dusty-guitar motif over a quiet scrap pulse, the fight burned out with no winner, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/outro-draw/cyberpunk/`**
> Unresolved cyberpunk end-credits, a circling darksynth motif over a quiet retro pulse, the run ended even and the streets still rain, weary neon vigilance, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/outro-draw/steampunk/`**
> Unresolved steampunk end-credits, a circling brass or music-box motif over a quiet clockwork pulse, gears stopped mid-turn, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/outro-draw/gothic/`**
> Unresolved gothic end-credits, a circling harpsichord motif over a low organ drone, the curse neither broken nor complete, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro-draw/urbanfantasy/`**
> Unresolved urban-fantasy end-credits, a circling noir-jazz motif over a quiet trip-hop pulse, the night ended without a winner, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/outro-draw/spaceopera/`**
> Unresolved space-opera end-credits, a circling brass motif over quiet strings, the fleet and the foe both withdrew, weary galactic vigilance, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/outro-draw/pirate/`**
> Unresolved pirate end-credits, a circling fiddle or accordion motif over a quiet sea pulse, neither ship claimed the prize, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/outro-draw/cozy/`**
> Unresolved cozy end-credits, a circling soft-piano motif over a gentle lo-fi pulse, the quarrel ended without a winner, mild restlessness rather than dread, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/outro-draw/eastasian/`**
> Unresolved East-Asian end-credits, a circling guzheng or erhu motif over a quiet taiko pulse, the duel paused in the mist, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/outro-draw/superhero/`**
> Unresolved superhero end-credits, a circling brass motif over quiet action strings, neither hero nor villain claimed the day, weary vigilance, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/outro-draw/pulp/`**
> Unresolved pulp end-credits, a circling brass motif over quiet exotic percussion, the expedition and the cult both withdrew, weary vigilance, seamless loop feel, no fade to silence, instrumental

### `outro-cliffhanger/` — deliberately unresolved, "to be continued"

**Neutral — `BGM/outro-cliffhanger/`**
> Ominous cliffhanger end-credits theme, a curious unresolved motif over pulsing low synth or strings and ticking percussion, mystery and anticipation, one last question hanging in the dark, tension that promises more, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/outro-cliffhanger/fantasy/`**
> Fantasy cliffhanger end-credits, a curious unresolved horn or string motif over ticking percussion, the map incomplete and the dark still waiting, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Scifi — `BGM/outro-cliffhanger/scifi/`**
> Sci-fi cliffhanger end-credits, a curious unresolved synth motif over a pulsing low pad and ticking textures, a signal still unanswered, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Horror — `BGM/outro-cliffhanger/horror/`**
> Horror cliffhanger end-credits, a curious unresolved music-box motif over a low drone and ticking pulse, the door still ajar, tension that promises more, seamless loop feel, no jump scares, no fade to silence, instrumental

**Noir — `BGM/outro-cliffhanger/noir/`**
> Noir cliffhanger end-credits, a curious unresolved muted-trumpet motif over ticking brushed drums, one last lead unopened, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Modern — `BGM/outro-cliffhanger/modern/`**
> Modern cliffhanger end-credits, a curious unresolved piano motif over a pulsing hybrid tick, the next op already forming, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Western — `BGM/outro-cliffhanger/western/`**
> Western cliffhanger end-credits, a curious unresolved whistle or guitar motif over a ticking pulse, dust still rising on the horizon, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Postapoc — `BGM/outro-cliffhanger/postapoc/`**
> Wasteland cliffhanger end-credits, a curious unresolved dusty-guitar motif over a ticking scrap pulse, smoke still on the ridge, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Cyberpunk — `BGM/outro-cliffhanger/cyberpunk/`**
> Cyberpunk cliffhanger end-credits, a curious unresolved darksynth motif over a pulsing retro tick, one last encrypted file unopened, neon tension that promises more, seamless loop feel, no fade to silence, instrumental

**Steampunk — `BGM/outro-cliffhanger/steampunk/`**
> Steampunk cliffhanger end-credits, a curious unresolved music-box or brass motif over ticking clockwork, a sealed letter still unopened, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Gothic — `BGM/outro-cliffhanger/gothic/`**
> Gothic cliffhanger end-credits, a curious unresolved harpsichord motif over a low organ pulse, a locked door still waiting, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Urbanfantasy — `BGM/outro-cliffhanger/urbanfantasy/`**
> Urban-fantasy cliffhanger end-credits, a curious unresolved noir-jazz motif over a trip-hop tick, the city's next secret stirring, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Spaceopera — `BGM/outro-cliffhanger/spaceopera/`**
> Space-opera cliffhanger end-credits, a curious unresolved brass motif over a pulsing orchestral tick, a distress call still unanswered, galactic tension that promises more, seamless loop feel, no fade to silence, instrumental

**Pirate — `BGM/outro-cliffhanger/pirate/`**
> Pirate cliffhanger end-credits, a curious unresolved fiddle motif over a ticking wooden pulse, a half-burned map still incomplete, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Cozy — `BGM/outro-cliffhanger/cozy/`**
> Cozy cliffhanger end-credits, a curious unresolved soft-piano motif over a gentle lo-fi tick, a letter on the table still unopened, mild anticipation rather than dread, seamless loop feel, no fade to silence, instrumental

**Eastasian — `BGM/outro-cliffhanger/eastasian/`**
> East-Asian cliffhanger end-credits, a curious unresolved guzheng or shakuhachi motif over a quiet taiko tick, mist still hiding the next path, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Superhero — `BGM/outro-cliffhanger/superhero/`**
> Superhero cliffhanger end-credits, a curious unresolved brass motif over a pulsing action-string tick, a silhouette still on the skyline, tension that promises more, seamless loop feel, no fade to silence, instrumental

**Pulp — `BGM/outro-cliffhanger/pulp/`**
> Pulp cliffhanger end-credits, a curious unresolved brass motif over ticking exotic percussion, the next tomb still unmarked on the map, tension that promises more, seamless loop feel, no fade to silence, instrumental

## Sound effects — `public/music/SFX/`

UI cues and the original stage cues have synthesized fallbacks. The expanded
cinematic catalog is deliberately file-backed: if a matching file is absent,
that cue does nothing and never substitutes an unrelated sound. Drop a file
with the exact basename below to enable it. MP3, OGG, M4A, and WAV are supported.

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

### Cinematic cue filenames

`trigger_effect` is the single AI-facing cinematic tool. It can fire up to
four cues simultaneously, repeat the group with a delay, and pair the sound
with one optional visual enhancement (`shake`, `flash`, `embers`, `fog`,
`rain`, `snow`, `darkness`, or `heartbeat`). There is no separate SFX tool.

| Group | Exact basenames |
| --- | --- |
| Doors | `door-creak`, `door-open`, `door-close`, `knock` |
| Sci-fi access | `airlock-open`, `airlock-close`, `code-beep`, `code-success`, `code-denied` |
| Systems | `alarm`, `siren`, `radio-static`, `power-up`, `power-down` |
| Destruction | `explosion`, `impact`, `debris`, `glass-break` |
| Ranged weapons | `gunshot`, `laser`, `arrow` |
| Melee/action | `sword`, `shield`, `footsteps`, `horse` |
| Weather accents | `thunder`, `fire-burst`, `splash`, `wind-gust` |
| Magic/horror | `magic`, `portal`, `spell-fail`, `creature-roar`, `whisper` |
| Interaction | `trap`, `lock-click`, `coin`, `item-pickup`, `heal` |

Examples: `explosion.mp3` plus `debris.mp3` with visual `shake`; repeated
`heartbeat.mp3` at 320 ms for panic or 850 ms for dread; `airlock-open.mp3`
plus `alarm.mp3` with visual `flash`.

## Environmental ambience — `public/music/AMBIENCE/`

Environmental beds are independent of BGM and SFX. Drop **one flat file per
category** directly into `public/music/AMBIENCE/` — do **not** create a
subfolder per sound. The basename is the category the engine indexes:

```text
public/music/AMBIENCE/
  rain.mp3
  forest.mp3
  tavern.mp3
  spaceship.mp3
```

MP3 is preferred (ogg / m4a / wav also work). The AI may select up to two
beds, or use `none` for intentional silence. When no sounds are specified,
the TV infers categories from the current scene text via keyword rules in
`src/lib/client/ambience.ts`. Missing files are skipped silently.

### Available categories

Weather / nature: `storm`, `rain`, `wind`, `snow`, `ocean`, `water`,
`forest`, `swamp`, `desert`, `insects`, `birds`, `fire`

Fantasy / historical places: `cave`, `dungeon`, `tavern`, `village`,
`castle`

Modern places: `city`, `traffic`, `crowd`, `office`, `industrial`,
`machinery`, `electrical`, `ventilation`, `laboratory`

Genre settings: `spaceship`, `western-town`, `wasteland`, `battlefield`,
`supernatural`, `underwater`

Optional / not yet stocked (checklist only): `computer-hums`,
`computer-beeping`.

### What makes a keepable bed

Keep a download only when it is a **long, steady environmental loop** that
maps cleanly to one category basename:

- continuous weather, room tone, crowd murmur, machinery hum, place bed
- no lead melody, no sung/chanted music bed, no intelligible speech
- no combat set-piece (boss fights, shootouts, lightsaber duels, ambushes)
- no novelty one-offs (snoring giant, chewing camp, etc.)
- no broken stubs (tiny incomplete downloads)

If it fails those tests, **delete it** — do not park rejects in the tree.

### Mixing note — `swamp` specifically

True **minimal-insect** swamp beds are hard to find. Most swamp downloads are
dominated by loud crickets, cicadas, or dense insect beds rather than wet
marsh / frogs / low room tone. Treat that as expected:

- Prefer a swamp file that is **wet + frogs + sparse insects**, not an insect
  wall with a little water under it.
- When layering at runtime, **do not stack `swamp` + `insects`** unless the
  scene explicitly wants a thick bug chorus — most stocked swamp beds already
  carry insect texture, so a second insect layer will overpower the mix.
- If you need a quieter marsh, use `swamp` alone (or `swamp` + `water` /
  `rain`) rather than adding `insects`.

### Staging workflow

1. Drop raw playlist downloads in
   `public/music/AMBIENCE/TO_BE_ADDED_VERIFIED/`.
2. Pick at most **one** best file per missing category.
3. Rename/move to `public/music/AMBIENCE/<category>.mp3`.
4. Delete every leftover in the staging folder (including near-duplicates and
   full-length rejects).
5. Update `docs/AMBIENCE_ASSET_CHECKLIST.md` from disk — never assume a
   category is complete just because a themed download existed.

See `docs/AMBIENCE_ASSET_CHECKLIST.md` for the live stocked / missing list.

### Acoustic modifiers (not separate files)

Acoustic modifiers alter the same source files at playback time, so duplicate
"cave" or "distant" recordings are unnecessary. `muffled`, `distant`, and
`underwater` apply low-pass filtering; `indoors`, `small-room`, `large-hall`,
and `cave` add progressively larger synthetic room responses. `outdoors`
leaves the source dry. Prefer a dry outdoor bed + `acoustics: ["underwater"]`
over a one-off underwater-only file unless the bed is uniquely aquatic.

### Recording rules

Use seamless or naturally steady recordings, ideally 30 seconds or longer
(hour-long beds are fine; the player loops them). Avoid:

- Music, melodies, piano/tavern songs, siren songs
- Intelligible dialogue or chanting that reads as speech
- Singular story events (gunfights, boss fights, lightsaber duels)
- Frequent close explosions / sirens that make a loop feel like a set-piece
- Obvious loop-boundary hits, silent intros, long fade-outs
