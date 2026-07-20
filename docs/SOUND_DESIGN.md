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
**`postapoc`** (wasteland / after-the-fall). A campaign that matches none
(e.g. slice-of-life) stays themeless and plays the neutral roots.

The winning strategy:

1. Fill the **mood roots** with genre-neutral cinematic tracks — the safety
   net for every campaign and the fallback for every theme.
2. Add themed tracks into `<mood>/<theme>/` for the genres you actually run.

> Adding a new theme is just making folders — no code change. The classifier
> keyword lists in `musicTheme.ts` decide which campaigns map to it.

**Suggested fill order** for empty shelves (most-heard first):
`battle → boss → adrenaline → tense → mystery → triumph → somber → dread → wonder → outro`.

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

- **fantasy** — harp, dulcimer, strings, war horns, taiko, wooden flute, fiddle; medieval-mythic.
- **scifi** — analog synths, arpeggiators, sub bass, glassy digital bells, granular textures; chrome-and-starlight.
- **horror** — detuned strings, bowed metal, prepared piano, breathy choir, music box; sparse and wrong.
- **noir** — muted trumpet, brushed drums, upright bass, lounge piano, vibraphone, clarinet; rain-slick 1940s.
- **modern** — hybrid orchestral + electronic, pulsing synth bass, taut string ostinatos, ticking textures; sleek.
- **western** — reverb guitar, harmonica, lonesome whistle, fiddle, mariachi trumpet; dusty and wide.
- **postapoc** — junkyard/scrap-metal percussion, detuned guitar, dusty drones, kalimba, raw synth; rust and grit.

## `lobby/` — the Gathering (the call to adventure)

This shelf is NOT calm music. It plays while heroes join and the code is on
the TV — it should feel like the eve of a journey: packed bags, a map on
the table, a pulse of excitement. Warm, yes; sleepy, never.

**Neutral — `BGM/lobby/`**
> Uplifting cinematic prelude for a party gathering before an adventure, warm strings or piano over a soft steady pulse, a rising hopeful motif on horn or flute or bright synth, anticipation and quiet excitement, dawn before a journey, around 85-100 bpm, understated enough to sit under a menu, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**Fantasy — `BGM/lobby/fantasy/`**
> Adventurous fantasy prelude, bright harp or dulcimer arpeggios over warm strings and a soft marching hand-drum pulse, a rising heroic motif on wooden flute or horn, banners and packed satchels at dawn, eager and hopeful, around 90 bpm, seamless loop feel, no big intro or outro, instrumental

**Scifi — `BGM/lobby/scifi/`**
> Hopeful sci-fi prelude, warm analog pads with a bright pulsing arpeggio, a rising piano or synth-lead motif, launch-countdown anticipation, a crew assembling on a bright bridge, around 90-105 bpm, gently driving but understated, seamless loop feel, no fade to silence, instrumental

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

## `calm/` — safety, camps, taverns

**Neutral — `BGM/calm/`**
> Peaceful ambient underscore, soft nylon guitar or felt piano or harp, warm pads and distant strings, unhurried and tender, low dynamic range, a safe haven at dusk, seamless loop feel, no fade to silence, instrumental

**Fantasy — `BGM/calm/fantasy/`**
> Peaceful medieval campfire underscore, solo nylon guitar or hammered dulcimer, distant strings, crackling warmth, unhurried and tender, low dynamic range, sleepy village at dusk, seamless loop feel, instrumental

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
> High-speed sci-fi pursuit, driving electronic percussion and a sprinting arpeggiator, gliding synth leads, thruster-burn momentum through a neon canyon or asteroid field, exhilarating rather than menacing, around 140 bpm, no big intro or outro, instrumental

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
> Modern firefight underscore, driving hybrid percussion and distorted synth bass, aggressive staccato strings and brass hits, a running gun battle through the compound, kinetic and dangerous but squad-scale, not apocalyptic, around 140 bpm, no big intro or outro, instrumental

**Western — `BGM/battle/western/`**
> Western gunfight music, galloping percussion and driving bass, frantic fiddle, twanging guitar stabs and a hard trumpet edge, lead flying behind the saloon, rowdy and dangerous but human-scale, around 135 bpm, no big intro or outro, instrumental

**Postapoc — `BGM/battle/postapoc/`**
> Wasteland skirmish combat, pounding scrap-metal percussion and growling distorted bass, raw guitar or synth stabs, a raider ambush at the gates, savage and scrappy but not world-ending, fast and relentless, no big intro or outro, instrumental

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
(`outro-victory/fantasy/`, `outro-defeat/postapoc/`, …). Rather than a full
prompt per genre × state, take the neutral prompts below and **append the
genre's flavor line**:

- fantasy: `orchestral folk palette, harp, strings, noble horns, wooden flute`
- scifi: `analog synth palette, warm pads, slow arpeggios, sub bass, glassy bells`
- horror: `haunted palette, detuned music box, hollow drones, bowed metal, breathy choir`
- noir: `smoky jazz palette, muted trumpet, brushed drums, upright bass, lounge piano`
- modern: `sleek hybrid palette, synth pads, processed percussion, taut strings, piano`
- western: `frontier palette, reverb guitar, harmonica, lonesome whistle, fiddle`
- postapoc: `wasteland palette, dusty guitar, junkyard percussion, kalimba, worn drones`

**`outro-victory/`** — the party won:
> Triumphant end-credits theme, soaring strings and noble brass over a warm major-key pulse, bright harp and choir swells, earned jubilation and gratitude, heroic but not gloating, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**`outro-defeat/`** — the party lost, died, or failed. NOT the quiet
private grief of `somber/` — this is a full dark requiem with weight and
finality:
> Dark requiem end-credits, heavy low brass and a full mourning choir over a slow tolling bell, grave processional pulse, the crushing weight of final defeat, vast and shadowed rather than gentle, a funeral for the world that could have been, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**`outro-bittersweet/`** — a mixed ending, gains paid for in losses:
> Bittersweet end-credits theme, warm strings and reflective piano with a single wistful solo instrument, a major melody shadowed by minor harmony, gratitude and grief entwined, tender and resolved but aching, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**`outro-escape/`** — survived by fleeing, the threat remains:
> Tense-relief end-credits theme, breathless strings settling over a steady pulse, a cautious hopeful lead that keeps glancing over its shoulder, survival without safety, restless resolve, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**`outro-draw/`** — a stalemate, neither side prevailed. NOT peaceful and
NOT hopeful-calm — restless and unresolved:
> Unresolved end-credits theme, a circling motif on strings and piano that never reaches its home chord, harmony drifting between minor and major without settling, restless embers of a fight nobody won, weary vigilance rather than peace, a moderate quiet pulse underneath, seamless loop feel, no big intro or outro, no fade to silence, instrumental

**`outro-cliffhanger/`** — deliberately unresolved, "to be continued":
> Ominous cliffhanger end-credits theme, a curious unresolved motif over pulsing low synth and ticking percussion, mystery and anticipation, one last question hanging in the dark, tension that promises more, seamless loop feel, no big intro or outro, no fade to silence, instrumental

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

Environmental beds are independent of BGM and SFX. Put reusable long-form
loops in category folders such as `AMBIENCE/rain/` or
`AMBIENCE/machinery/`. The AI may select up to two beds, or use `none` for
intentional silence. When no sounds are specified, the TV infers categories
from the current scene text.

Available categories:

`storm`, `rain`, `wind`, `snow`, `ocean`, `water`, `forest`, `swamp`,
`desert`, `insects`, `birds`, `cave`, `dungeon`, `tavern`, `village`,
`castle`, `city`, `traffic`, `crowd`, `office`, `industrial`, `machinery`,
`electrical`, `ventilation`, `laboratory`, `spaceship`, `western-town`,
`wasteland`, `battlefield`, `fire`, `supernatural`.

Acoustic modifiers alter the same source files at playback time, so duplicate
"cave" or "distant" recordings are unnecessary. `muffled`, `distant`, and
`underwater` apply low-pass filtering; `indoors`, `small-room`, `large-hall`,
and `cave` add progressively larger synthetic room responses. `outdoors`
leaves the source dry.

Use seamless or naturally steady recordings, ideally 30 seconds or longer.
Avoid music, dialogue, singular story events, and obvious loop-boundary hits.
