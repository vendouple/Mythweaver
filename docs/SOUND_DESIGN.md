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

- **Don't write loop rules into prompts.** No "seamless loop feel", "no
  big intro or outro", "no fade to silence" — the crossfade already handles
  all of that, and those constraints flatten the music into background
  paste. Let each take breathe, build, and end however it wants.
- **Cull at audition time instead:** skip takes whose final ~10 s are dead
  silence (the gap plays before the crossfade catches it). Everything else
  — fade-outs, big endings, slow intros — loops fine.
- Everything must be **instrumental** — vocals fight the narrator
  (wordless vocalise or choir *used as an instrument* is fine).

## Getting variety out of Suno (v5.5)

An over-specified prompt pasted six times returns six near-identical songs.
The prompts below are written with **swap levers** — choices joined by
"or" (`harp or dulcimer or soft flute`) and tempo *ranges* instead of a
single bpm. To get a varied shelf:

1. Per generation, mentally **commit to ONE option per lever** — and pick a
   different one next take.
2. Between takes, change **one or two things only**: the lead instrument,
   the tempo within the stated range, or one imagery phrase. Keep the feel
   words and the lane words — those hold the shelf together.
3. Generate 4–6 takes per shelf and keep the best 2–3. Cull anything that
   drifted out of its lane (especially battle takes that came out boss-sized
   — re-shelve those instead of deleting).

Paste prompts as the **Style**, tick **Instrumental**.

---

# The Prompt Book

One section per shelf. Each gives the neutral root prompt first, then every
genre. The genre palettes, for reference while editing:

- **fantasy** — sweeping heroic folk-orchestral: harp, hammered dulcimer, wooden flute, fiddle, war horns, lush strings, bodhran, choir for the big moments; mythic and warm. Not mournful gothic, not cozy pastoral.
- **scifi** — cinematic analog-synth score: warm pads, vintage arpeggiators, sub bass, glassy digital bells, granular shimmer, soft hybrid strings; chrome-and-starlight, cool and clean. Not grimy darksynth (`cyberpunk`), not grand brass fanfare (`spaceopera`).
- **horror** — modern horror scoring: detuned strings, prepared piano, bowed metal, breathy choir, music box, deep drones; sparse and wrong. Full modern terror — not gothic melancholy alone.
- **noir** — smoky film-noir jazz: muted trumpet, smoky clarinet, brushed drums, upright bass, lounge piano, vibraphone, tremolo strings; rain-slick 1940s detective. Not globe-trotting expedition (`pulp`).
- **modern** — sleek thriller hybrid: pulsing synth bass, taut string ostinatos, ticking processed percussion, felt piano, muted electric-guitar textures; spy/thriller cool. Not bombastic hero fanfare (`superhero`).
- **western** — widescreen frontier myth: twangy baritone guitar, harmonica, lonesome whistle, fiddle, mariachi trumpet, mission bells, hoofbeat percussion; dusty and vast.
- **postapoc** — gritty wasteland score: junkyard percussion, detuned guitar, duduk, kalimba, tape-warped drones, raw gritty bass; rust, dust, and stubborn hope.
- **cyberpunk** — darksynth, synthwave, industrial techno: heavy bass design, analog arpeggios, rain-slick pads, driving drum machines, glitch textures; grimy neon-noir electricity. Distinct from clean `scifi`.
- **steampunk** — Victorian clockwork orchestral: ratchet percussion, brass band, waltzing strings, accordion, music box, dark cabaret swing; gears, steam, and gaslight wonder.
- **gothic** — dark romantic chamber: pipe organ, harpsichord, eerie chamber strings, dark choir, tolling bells; velvet-dark grandeur, mournful without full modern `horror`. `fantasy` is heroic/folk.
- **urbanfantasy** — the city's hidden magic after midnight: trip-hop beats, dark electronica, noir-jazz horns, tremolo guitar, shimmering pads. Not pure detective `noir`, not understated spy `modern`.
- **spaceopera** — golden-age galactic film score: massive heroic brass, sweeping romantic strings, choir, celesta, harp, timpani. Very different from gritty synth `scifi`.
- **pirate** — swashbuckling nautical folk-orchestral: rollicking fiddle, accordion, tin whistle, ship-deck percussion, naval brass, sea-shanty rhythms; salt-sprayed and rowdy.
- **cozy** — hearth-light pastoral folk: felt piano, nylon-string guitar, glockenspiel, soft flutes, light bells, gentle lo-fi beats, humming strings. Gentler than epic `fantasy`.
- **eastasian** — cinematic wuxia/samurai scoring: guzheng, koto, erhu, shakuhachi, dizi, pipa, taiko, temple bells, silk strings with cinematic orchestra; zero European-medieval overlap.
- **superhero** — modern blockbuster: towering brass, driving string ostinatos, hybrid percussion, electric guitar, soaring anthem themes; city-scale hope. Bolder than understated `modern`.
- **pulp** — 1930s matinee serial: big-band brass fanfares, swashbuckling strings, jungle drums, tomb-echo percussion, mysterious woodwinds; grand expedition. `noir` = dark detective; `pulp` = grand dig.

## `lobby/` — the Gathering (the call to adventure)

This shelf is NOT calm music. It plays while heroes join and the code is on
the TV — it should feel like the eve of a journey: packed bags, a map on
the table, a pulse of excitement. Warm, yes; sleepy, never.

**Neutral — `BGM/lobby/`**
> Uplifting cinematic prelude for a party gathering before an adventure, warm strings and piano over a soft steady pulse, a rising hopeful motif on horn or flute or bright synth, light percussion warming underneath, maps unrolled and bags packed at dawn, anticipation with a spark, around 85-105 bpm, instrumental

**Fantasy — `BGM/lobby/fantasy/`**
> Adventurous heroic-folk fantasy overture, bright harp and hammered dulcimer runs over warm sweeping strings, a marching bodhran and frame-drum pulse, a rising heroic motif on low whistle or French horn, banners snapping over a waking castle town, packed satchels and map ink at dawn, eager and warm-hearted, around 90-105 bpm, instrumental

**Scifi — `BGM/lobby/scifi/`**
> Hopeful cinematic synth prelude, warm analog pads and a bright vintage arpeggiator over clean deep sub bass, glassy bells and soft hybrid strings, a rising lead like a launch countdown, a crew boarding a gleaming starship at first light, chrome-and-starlight optimism, cool and clean rather than grimy neon, around 95-110 bpm, instrumental

**Horror — `BGM/lobby/horror/`**
> Uneasy horror overture, a slow forward pulse under hollow drones and prepared piano, a beckoning detuned music-box motif that will not stop, breathy dissonant textures curling at the edges, an invitation you know better than to accept, curiosity laced with wrongness, restrained but never sleepy, no jump scares, instrumental

**Noir — `BGM/lobby/noir/`**
> Slinky film-noir jazz prelude, walking upright bass and crisp brushed drums, a confident muted trumpet or smoky clarinet hook over lounge piano and vibraphone, a fresh case file sliding across the desk, neon rain and night streets full of promise, cool swagger and forward motion, around 95-110 bpm, instrumental

**Modern — `BGM/lobby/modern/`**
> Sleek spy-thriller prelude, a driving analog synth-bass pulse under taut staccato strings and felt piano, ticking hybrid percussion, a rising confident motif with quiet electricity, the team gearing up as the skyline glitters, cool controlled anticipation before the operation, around 100-115 bpm, instrumental

**Western — `BGM/lobby/western/`**
> Bright frontier western prelude, ambling twangy baritone guitar and a rolling train-beat rhythm, hopeful harmonica and fiddle trading a rising hook, warm strings opening onto a wide horizon, saddling up at sunrise with dust in the light, eager and warm, around 95-110 bpm, instrumental

**Postapoc — `BGM/lobby/postapoc/`**
> Gritty hopeful wasteland prelude, dusty detuned guitar and kalimba over a junkyard-percussion heartbeat, warm tape-worn pads and a resolute rising lead, survivors loading packs at the settlement gate, danger down the road but daylight on their backs, weathered optimism, around 90-105 bpm, instrumental

**Cyberpunk — `BGM/lobby/cyberpunk/`**
> Neon-noir synthwave prelude, a pulsing darksynth bassline and glowing analog arpeggios over crisp retro drum machines, rain-slick pads and a hopeful glassy lead cutting through the grime, meeting the crew in a neon-lit bar before the big run, electric anticipation with a dangerous edge, around 100-118 bpm, instrumental

**Steampunk — `BGM/lobby/steampunk/`**
> Gaslight steampunk overture, ticking clockwork percussion and a jaunty brass band over waltzing Victorian strings, accordion and music box trading a rising hopeful motif with a dark-cabaret wink, airships straining at their moorings in the dawn steam, wonder and machine-oil excitement, around 95-112 bpm, instrumental

**Gothic — `BGM/lobby/gothic/`**
> Gothic overture, harpsichord arpeggios and rich chamber strings over a deep pipe-organ foundation, tolling bells far off, a mournful-but-eager rising theme, candlelit maps and a black carriage waiting in the fog, elegant dark anticipation, around 85-100 bpm, instrumental

**Urbanfantasy — `BGM/lobby/urbanfantasy/`**
> Midnight urban-fantasy prelude, a moody trip-hop groove with noir-jazz horns and shimmering pads, tremolo guitar and upright bass under a rising dark-electronic motif, the city's hidden world waking as the streetlights hum, cool anticipation with a supernatural shiver, around 92-108 bpm, instrumental

**Spaceopera — `BGM/lobby/spaceopera/`**
> Grand space-opera overture, heroic brass and sweeping romantic strings over rolling timpani, harp flourishes and a soaring rising fanfare motif, a fleet assembling against a field of stars, destiny-sized anticipation with warmth at its heart, around 95-110 bpm, instrumental

**Pirate — `BGM/lobby/pirate/`**
> Swashbuckling pirate overture, rollicking fiddle and accordion over ship-deck percussion and a gentle shanty sway, tin whistle tossing a rising adventurous hook to warm naval brass, the crew hauling cargo aboard at first light, salt-spray eagerness and mischief, around 95-112 bpm, instrumental

**Cozy — `BGM/lobby/cozy/`**
> Warm pastoral folk prelude, felt piano and fingerpicked nylon guitar over glockenspiel, soft flute and a gentle lo-fi beat, a rising tender motif like a kettle coming to song, packing bread and blankets for a small adventure, gentle excitement and hearth-light warmth, around 85-100 bpm, instrumental

**Eastasian — `BGM/lobby/eastasian/`**
> East-Asian cinematic prelude, bright guzheng and koto figures over silk strings and a light taiko pulse, a rising hopeful erhu or dizi melody, lanterns lit at the village gate as travellers gather at dawn, serene eagerness and quiet honor, around 90-105 bpm, instrumental

**Superhero — `BGM/lobby/superhero/`**
> Modern blockbuster superhero prelude, bold brass and driving string ostinatos over hybrid percussion and a bright electric-guitar pulse, a rising anthem motif finding its wings, the team suiting up as sunrise hits the tower, hope with voltage in it, around 105-120 bpm, instrumental

**Pulp — `BGM/lobby/pulp/`**
> 1930s adventure-serial overture, brassy big-band fanfares and swashbuckling string runs over jungle drums, a rising globe-trotting motif with matinee sparkle, steamer trunks and biplane engines warming on the runway, grand grinning anticipation, around 100-118 bpm, instrumental

## `weaving/` — the loading interlude

A world being written into existence: expectancy, gathering threads, a
swell that builds but never resolves.

**Neutral — `BGM/weaving/`**
> Arcane creation soundscape, slow-building choir and evolving synth pads with shimmering bells or celesta, deep cello and sub drone, reversed textures weaving in and out, a world being written into existence line by line, mysterious and expectant, a gradual swell that never resolves, instrumental

**Fantasy — `BGM/weaving/fantasy/`**
> Arcane creation soundscape, slow-building choir and lush strings, harp and celesta threads weaving through reversed shimmer, deep cello drone under rising war-horn glints, a world being spun on a great loom thread by thread, sacred and expectant, a gradual swell that never resolves, instrumental

**Scifi — `BGM/weaving/scifi/`**
> Sci-fi genesis soundscape, evolving analog pads and glassy digital bells over a deep sub drone, granular textures and slow arpeggios assembling like code, soft strings dawning through the static, a universe compiling itself into existence, awe and expectancy, a gradual swell that never resolves, instrumental

**Horror — `BGM/weaving/horror/`**
> Horror creation soundscape, dissonant string clusters and breathy choir gathering in the dark, bowed metal and reversed whispers over sub-bass swells, a music-box fragment surfacing and sinking, something vast taking shape where it should not, dread and awe entwined, a gradual build without release, no jump scares, instrumental

**Noir — `BGM/weaving/noir/`**
> Noir scene-setting soundscape, slow sultry clarinet and vibraphone phrases over a low walking bass, brushed cymbals like rain on glass, muted trumpet sighing through the smoke, a case assembling itself clue by clue in the fog, wary intrigue, a gradual build without resolution, instrumental

**Modern — `BGM/weaving/modern/`**
> Modern briefing soundscape, layering synth pulses and taut string swells over ticking processed percussion, felt piano fragments and a low brass bloom, intel pinned to the board one thread at a time, focus sharpening into resolve, a gradual build without resolution, instrumental

**Western — `BGM/weaving/western/`**
> Western legend-telling soundscape, swelling reverb guitar and low tremolo strings under a distant lonesome whistle, harmonica breath and mission-bell glints, wind dragging a tall tale across the plains, myth gathering like weather, a gradual build without resolution, instrumental

**Postapoc — `BGM/weaving/postapoc/`**
> Wasteland genesis soundscape, dusty drones and scrap-metal resonance slowly gathering, a fragile melody on detuned piano or kalimba, duduk breath over a deepening pulse, the old world remembered while a new one is scavenged together, grief and stubborn hope, a gradual swell that never resolves, instrumental

**Cyberpunk — `BGM/weaving/cyberpunk/`**
> Cyberpunk boot-sequence soundscape, evolving darksynth pads and glitching data textures over a deep distorted sub drone, analog arps flickering on like windows in a tower, neon bleeding through digital rain, a megacity compiling itself into existence, electric expectancy, a gradual swell that never resolves, instrumental

**Steampunk — `BGM/weaving/steampunk/`**
> Steampunk invention soundscape, clockwork percussion assembling gear by gear under swelling Victorian strings, music-box and brass threads winding tighter, steam pressure rising in the pipes, a great engine being born in the workshop dark, wonder and momentum, a gradual swell that never resolves, instrumental

**Gothic — `BGM/weaving/gothic/`**
> Gothic conjuration soundscape, eerie chamber strings and a low pipe-organ drone slowly gathering, a fragile harpsichord or music-box thread, dark choir breath swelling behind the candlelight, a destiny written line by line in a grimoire, mournful awe, a gradual swell that never resolves, instrumental

**Urbanfantasy — `BGM/weaving/urbanfantasy/`**
> Urban-fantasy weaving soundscape, moody trip-hop pads and dark electronic textures gathering like fog, a fragile noir-jazz horn or piano thread, tremolo guitar shimmering under streetlight hum, hidden magic surfacing through the midnight city, secret expectancy, a gradual swell that never resolves, instrumental

**Spaceopera — `BGM/weaving/spaceopera/`**
> Space-opera genesis soundscape, slow-building romantic strings and heroic brass over a deep cosmic drone, celesta and harp scattering starlight, choir dawning at the edge of hearing, a galaxy being written into the dark, sacred grandeur, a gradual swell that never resolves, instrumental

**Pirate — `BGM/weaving/pirate/`**
> Pirate legend-telling soundscape, slow swelling accordion and fiddle over creaking ship-timber percussion, tin whistle drifting like gull-cry, naval brass gathering like a tide under the hull, a tall tale of the open sea taking shape, salt-sprayed wonder, a gradual swell that never resolves, instrumental

**Cozy — `BGM/weaving/cozy/`**
> Cozy hearth soundscape, felt piano and fingerpicked guitar gathering over glockenspiel and warm humming strings, a soft lo-fi pulse like a loom's rhythm, a small warm world being knitted into being stitch by stitch, tender expectancy, a gradual swell that never resolves, instrumental

**Eastasian — `BGM/weaving/eastasian/`**
> East-Asian weaving soundscape, slow guzheng and koto figures gathering over shakuhachi breath and a low taiko heartbeat, erhu threads drawn long across silk strings, a scroll painted stroke by patient stroke, misted serenity and expectancy, a gradual swell that never resolves, instrumental

**Superhero — `BGM/weaving/superhero/`**
> Superhero origin soundscape, slow-building blockbuster brass and driving strings over a swelling hybrid pulse, electric-guitar shimmer and rising anthem fragments, a legend forging itself piece by piece, hope gathering like a storm front, a gradual swell that never resolves, instrumental

**Pulp — `BGM/weaving/pulp/`**
> Pulp-expedition soundscape, brassy serial fragments and adventurous strings gathering over jungle drums and tomb-echo percussion, a mysterious woodwind thread, a map to a lost world unrolling inch by inch, matinee mystery and eagerness, a gradual swell that never resolves, instrumental

## `main/` — general adventuring (the workhorse shelf)

**Neutral — `BGM/main/`**
> Cinematic hybrid-orchestral exploration score, warm strings with woodwind and subtle synth colors over light percussion, a wandering melodic motif that comes and goes, distant horns hinting at the road ahead, hopeful with shadows at the edges, mid tempo, instrumental

**Fantasy — `BGM/main/fantasy/`**
> Cinematic fantasy exploration score, warm sweeping strings and light hand percussion, wandering melodies passed between wooden flute, fiddle and harp, distant horns hinting at old kingdoms, green valleys with ruins on the ridgeline, hopeful with shadows at the edges, mid tempo, instrumental

**Scifi — `BGM/main/scifi/`**
> Cinematic sci-fi exploration score, warm evolving analog pads and a light pulsing arpeggio over soft electronic percussion, a curious glassy lead drifting between star charts, hybrid strings warming the vacuum, uncharted systems and quiet marvels, wonder with cold edges, mid tempo, instrumental

**Horror — `BGM/main/horror/`**
> Creeping horror exploration score, sparse prepared piano and plucked strings over a hollow drone, bowed-metal shivers and a faint pulse, wary footsteps in a place that watches back, dread curiosity at low light, restrained and unsettling, no jump scares, instrumental

**Noir — `BGM/main/noir/`**
> Film-noir investigation score, brushed drums and walking upright bass under mellow lounge piano, muted trumpet and vibraphone trading world-weary phrases, wet streets and half-truths after midnight, watchful and wry, mid-slow tempo, instrumental

**Modern — `BGM/main/modern/`**
> Sleek modern thriller exploration score, light processed percussion and warm pads under a subtle string-and-piano ostinato, muted electric-guitar textures, boots on the ground and eyes on the exits, purposeful and alert, mid tempo, instrumental

**Western — `BGM/main/western/`**
> Cinematic western exploration score, ambling twangy guitar and brushed percussion under wide-open strings, harmonica and fiddle drifting like heat haze, mesa country rolling past the saddle, weathered hope at the horizon line, mid tempo, instrumental

**Postapoc — `BGM/main/postapoc/`**
> Desolate wasteland exploration score, dusty guitar and duduk over sparse junk percussion and wind-worn drones, a lonely resilient melody carrying through the ruins, cracked highways under an enormous sky, guarded hope, mid tempo, instrumental

**Cyberpunk — `BGM/main/cyberpunk/`**
> Neon-noir cyberpunk exploration score, a slow pulsing darksynth bassline and glassy pads over crisp retro drum machines, a wandering gritty lead threading the crowd, rain-slick chrome canyons and hologram glow, cool wonder with menace beneath, mid tempo, instrumental

**Steampunk — `BGM/main/steampunk/`**
> Steampunk exploration score, ambling clockwork percussion and warm Victorian strings, curious brass and accordion motifs weaving through gaslit streets, gears turning under the cobblestones, soot-dusted wonder and industry, mid tempo, instrumental

**Gothic — `BGM/main/gothic/`**
> Gothic exploration score, eerie chamber strings and slow harpsichord figures over a low organ breath, a mournful wandering theme down candlelit corridors, fog pressing at the leaded windows, melancholy beauty and watchfulness, mid tempo, instrumental

**Urbanfantasy — `BGM/main/urbanfantasy/`**
> Urban-fantasy exploration score, a moody trip-hop pulse with noir-jazz horns and dark shimmering pads, tremolo guitar tracing sigils in neon, a curious wandering motif through the city's second skin, alert and quietly enchanted, mid tempo, instrumental

**Spaceopera — `BGM/main/spaceopera/`**
> Space-opera exploration score, sweeping romantic strings and warm heroic brass over a steady forward pulse, harp and celesta glittering like starfields, new worlds turning slow beneath the ship, grand hopeful wandering, mid tempo, instrumental

**Pirate — `BGM/main/pirate/`**
> Nautical exploration score, a gentle shanty sway on accordion and fiddle over ship-deck percussion, tin whistle drifting with the gulls, warm strings swelling with the open water, far horizons and full sails, salt-bright hope, mid tempo, instrumental

**Cozy — `BGM/main/cozy/`**
> Warm pastoral exploration score, felt piano and fingerpicked guitar over glockenspiel, soft flute and a gentle lo-fi beat, a friendly wandering melody down meadow paths, market smoke over little rooftops, unhurried tenderness, mid tempo, instrumental

**Eastasian — `BGM/main/eastasian/`**
> East-Asian cinematic exploration score, flowing guzheng and koto over silk strings and a soft taiko pulse, a wandering erhu or dizi melody, bamboo seas and mist-wrapped peaks, serene purpose and quiet awe, mid tempo, instrumental

**Superhero — `BGM/main/superhero/`**
> Modern superhero exploration score, driving strings and warm blockbuster brass over a confident hybrid pulse, electric-guitar shimmer and a wandering heroic motif, patrolling a skyline that trusts its guardians, bold hope on watch, mid tempo, instrumental

**Pulp — `BGM/main/pulp/`**
> Pulp-expedition exploration score, adventurous strings and warm brass over jungle drums, a wandering globe-trotting melody with mysterious woodwind asides, dusty maps and temple thresholds, grand curiosity, mid tempo, instrumental

## `calm/` — safety, camps, taverns

**Neutral — `BGM/calm/`**
> Peaceful cinematic calm piece, soft nylon guitar or felt piano or harp over warm pads and distant strings, gentle breath-slow phrasing, a safe haven at dusk with the fire lit, unhurried and tender, hushed dynamics, instrumental

**Fantasy — `BGM/calm/fantasy/`**
> Peaceful fantasy campfire piece, solo nylon guitar or hammered dulcimer over distant warm strings, a tender harp answering, embers and story-murmur at the edge of hearing, a sleepy village under early stars, safe and unhurried, heroic-folk warmth rather than gothic gloom, hushed dynamics, instrumental

**Scifi — `BGM/calm/scifi/`**
> Weightless sci-fi ambient piece, slow warm analog pads and a soft glassy arpeggio, gentle sub bass and distant sonar pings, the hum of a sleeping starship between the stars, drifting and safe, hushed dynamics, instrumental

**Horror — `BGM/calm/horror/`**
> Uneasy quiet horror ambience, a hollow sustained drone with faint detuned music box and distant piano, occasional creaks in the dark, a false calm that never feels quite safe, very sparse and hushed, no jump scares, instrumental

**Noir — `BGM/calm/noir/`**
> Late-night noir lounge piece, brushed drums and a soft walking upright bass, muted trumpet or mellow piano musing low, cigarette smoke curling under a neon sign, rain easing off outside, world-weary comfort, slow and hushed, instrumental

**Modern — `BGM/calm/modern/`**
> Sleek modern downtime piece, warm synth pads over soft felt piano and subtle brushed percussion, a quiet safehouse with the city glittering far below, guarded but restful, unhurried and hushed, instrumental

**Western — `BGM/calm/western/`**
> Lonesome western dusk piece, soft twangy guitar with distant harmonica or a low whistle, warm strings settling like sundown, the prairie going gold and quiet, tired boots by the fire, weathered peace, hushed dynamics, instrumental

**Postapoc — `BGM/calm/postapoc/`**
> Quiet wasteland refuge piece, soft detuned guitar or kalimba over warm dusty pads, a small fire inside the settlement walls, tired bones and rare safety, tender and worn, hushed dynamics, instrumental

**Cyberpunk — `BGM/calm/cyberpunk/`**
> Neon-noir downtime piece, slow warm darksynth pads and soft synthwave chords over a sparse drum-machine tick, a mellow glassy lead like rain tracing the window, the apartment above the megacity after the run, safe for tonight, hushed with a grimy afterglow, instrumental

**Steampunk — `BGM/calm/steampunk/`**
> Gaslight parlor piece, soft music box and accordion over warm Victorian strings and a gentle clockwork tick, tea steam and lamplight on polished brass, a tender violin musing by the fire, snug and unhurried, hushed dynamics, instrumental

**Gothic — `BGM/calm/gothic/`**
> Candlelit gothic calm piece, soft harpsichord and sparse chamber strings over a low organ breath, a fragile tender theme in the hush of a dark manor, safety inside while fog walks the grounds, beautiful and faintly sad, hushed dynamics, instrumental

**Urbanfantasy — `BGM/calm/urbanfantasy/`**
> Urban-fantasy night calm piece, soft noir-jazz piano and muted horn over a slow trip-hop pulse and dark velvet pads, a warded safehouse after midnight, the city humming harmless below, restful with a supernatural shiver, hushed dynamics, instrumental

**Spaceopera — `BGM/calm/spaceopera/`**
> Quiet starship calm piece, warm orchestral pads and soft horns over a gentle pulse, tender piano and harp on the observation deck, a nebula drifting past the glass, grand serenity rather than cold synth, hushed dynamics, instrumental

**Pirate — `BGM/calm/pirate/`**
> Quiet harbor calm piece, soft accordion or nylon guitar over lapping wooden percussion and distant fiddle, a ship rocking at anchor under lantern light, rope creak and calm water, salt-worn peace, hushed dynamics, instrumental

**Cozy — `BGM/calm/cozy/`**
> Cozy hearth piece, felt piano and fingerpicked guitar over light bells and a gentle lo-fi beat, soft wooden flute by the fire, quilts and kettle steam, village rest and campfire safety, tender and unhurried, hushed dynamics, instrumental

**Eastasian — `BGM/calm/eastasian/`**
> East-Asian calm piece, soft guzheng or koto over gentle shakuhachi and sparse chimes, a serene courtyard at dusk, lantern light on still water, luminous and unhurried, hushed dynamics, instrumental

**Superhero — `BGM/calm/superhero/`**
> Quiet hero downtime piece, warm felt piano and soft strings over a faint hopeful pulse, the suit hung up and the city safe till morning, tenderness with quiet steel in it, hushed dynamics, instrumental

**Pulp — `BGM/calm/pulp/`**
> Quiet expedition camp piece, soft nylon guitar and mellow brass over sparse hand percussion, lantern light on canvas after the dig, journals and starlight, warm tired satisfaction, hushed dynamics, instrumental

## `tense/` — stealth, standoffs, storm brewing

**Neutral — `BGM/tense/`**
> Suspenseful cinematic underscore, a staccato cello ostinato and muted low pulses, dissonant sustained strings and ticking percussive textures, low brass warnings swelling and receding, a coiled spring that never releases, dark thriller tone, instrumental

**Fantasy — `BGM/tense/fantasy/`**
> Suspenseful fantasy underscore, staccato cello ostinato and muted taiko pulses under dissonant sustained violins, low horn warnings and ticking percussive textures, torchlight held at a door that should not be open, a coiled spring that never releases, dark cinematic tension, instrumental

**Scifi — `BGM/tense/scifi/`**
> Cold sci-fi suspense, a pulsing low synth ostinato and ticking metallic percussion, dissonant glassy pads and warning-light flickers, pressure needles climbing toward the red, a coiled spring that never releases, instrumental

**Horror — `BGM/tense/horror/`**
> Horror suspense, scraping bowed metal and sub-bass pulses like a held breath, dissonant string clusters swelling and receding, prepared-piano ticks in the dark, something pacing you just out of sight, airless coiled dread that never releases, no jump scares, instrumental

**Noir — `BGM/tense/noir/`**
> Noir suspense, sparse pizzicato bass and ticking brushed cymbals, muted trumpet stabs and a wary clarinet thread, tremolo strings under a flickering streetlamp, a tail you cannot shake through wet alleys, coiled tension that never resolves, instrumental

**Modern — `BGM/tense/modern/`**
> Spy-thriller suspense, a taut string ostinato and pulsing synth bass over ticking clock percussion, low brass swells and static-charged pads, a countdown running under every heartbeat, surveillance from somewhere unseen, coiled tension that never releases, instrumental

**Western — `BGM/tense/western/`**
> Western standoff tension, single twanging guitar notes and low tremolo strings, a creaking rope and ticking pocket-watch percussion, spurs shifting in the dust, hands hovering at holsters, a coiled spring before the draw that never releases, instrumental

**Postapoc — `BGM/tense/postapoc/`**
> Wasteland suspense, a ticking scrap-metal pulse and low detuned drone, tight dissonant strings and feedback swells, engine glint past the ridge line, raiders counting your fires, coiled tension that never releases, instrumental

**Cyberpunk — `BGM/tense/cyberpunk/`**
> Cyberpunk suspense, a low distorted darksynth pulse and ticking industrial percussion, dissonant glassy pads and glitch static, ICE tracing the line while the deal goes quiet, neon flicker on drawn weapons, coiled tension that never releases, instrumental

**Steampunk — `BGM/tense/steampunk/`**
> Steampunk suspense, a ticking clockwork ostinato under low Victorian strings, muted brass stabs and hissing steam-valve textures, the boiler needle trembling at the line, a heist frozen mid-vault, coiled tension that never releases, instrumental

**Gothic — `BGM/tense/gothic/`**
> Gothic suspense, sparse harpsichord figures over a low pipe-organ drone, eerie chamber-string clusters and a single far-off bell, breath held behind a candlelit door, something waiting in the next room, coiled mournful tension that never releases, instrumental

**Urbanfantasy — `BGM/tense/urbanfantasy/`**
> Urban-fantasy suspense, a slow trip-hop pulse under taut dark-electronic pads, sparse noir-jazz stabs and tremolo guitar shivers, stalking something inhuman through neon fog, wards straining at the edges, coiled tension that never releases, instrumental

**Spaceopera — `BGM/tense/spaceopera/`**
> Space-opera suspense, taut orchestral ostinatos and low brass swells over restrained timpani, high strings thinning to a wire, a standoff on the bridge with fleets in the balance, grand coiled tension that never releases, instrumental

**Pirate — `BGM/tense/pirate/`**
> Nautical suspense, sparse ship-timber percussion and low fiddle drones, a held accordion note over creaking hull and slack rigging, enemy sails growing on the horizon, powder kept dry and voices low, coiled tension that never releases, instrumental

**Cozy — `BGM/tense/cozy/`**
> Soft cozy suspense, a gentle ticking lo-fi pulse under sparse felt piano and low wooden flute, a held breath in a small town, worry rather than dread, the prize pumpkin missing and the gate ajar, light coiled unease that never turns scary, instrumental

**Eastasian — `BGM/tense/eastasian/`**
> East-Asian suspense, sparse guzheng plucks over a low taiko heartbeat and held shakuhachi tones, silk strings drawn thin, two swords not yet drawn in the mist, coiled stillness that never releases, instrumental

**Superhero — `BGM/tense/superhero/`**
> Superhero standoff tension, taut driving strings and a restrained brass pulse over ticking hybrid percussion, sirens held at bay and capes in the wind, the second before everything moves, coiled cinematic tension that never releases, instrumental

**Pulp — `BGM/tense/pulp/`**
> Pulp suspense, sparse jungle percussion and low brass drones, a ticking motif over uneasy strings, torchlight on a pressure plate in the tomb, the idol one breath from the pedestal, coiled matinee tension that never releases, instrumental

## `adrenaline/` — chases, escapes, heists (NEW)

Excitement that is **not** combat: rooftop pursuits, breakneck getaways,
vaults cracking on a timer. Fast, propulsive, and *fun* — exhilaration,
never doom. If a take comes out martial or menacing, it belongs in
`battle/` instead.

**Neutral — `BGM/adrenaline/`**
> Propulsive cinematic chase music, driving percussion and a running bassline, agile string and synth ostinatos passing a quick melody around, bright brass flashes, breathless momentum and a sense of daring, exhilarating rather than menacing, relentless but bright, around 130-150 bpm, instrumental

**Fantasy — `BGM/adrenaline/fantasy/`**
> Breathless fantasy chase, galloping bodhran and hand percussion under racing fiddle and flute runs, driving low strings and bright horn calls, vaulting market stalls with the guard a step behind, playful daring danger, exhilarating rather than menacing, around 135-150 bpm, instrumental

**Scifi — `BGM/adrenaline/scifi/`**
> High-speed sci-fi pursuit, driving electronic percussion and a sprinting arpeggiator, gliding clean synth leads over deep sub thrust, threading an asteroid field at full burn, grin-and-white-knuckle momentum, exhilarating rather than menacing, cool chrome not grimy neon, around 135-150 bpm, instrumental

**Horror — `BGM/adrenaline/horror/`**
> Panicked horror flight, pounding irregular drums and racing string ostinatos, gasping textures and shrieking accents, lungs burning down a corridor that will not end, the thing right behind, terror-fueled momentum, relentless, instrumental

**Noir — `BGM/adrenaline/noir/`**
> Breakneck noir chase, sprinting upright bass and hot brushed drums, stabbing brass and frantic piano runs, hats flying through rain-slick alleys, slick urgent swing with a wink, around 140-155 bpm, instrumental

**Modern — `BGM/adrenaline/modern/`**
> Modern heist-chase score, driving hybrid percussion and a pulsing synth bassline, taut string runs and slick electric textures, weaving traffic with the goods in the trunk and sirens in the mirror, adrenaline with swagger, around 135-150 bpm, instrumental

**Western — `BGM/adrenaline/western/`**
> Galloping western chase, pounding hoofbeat percussion and driving upright bass, frantic fiddle and twanging guitar runs, mariachi trumpet flashes, flat-out across the mesa with dust boiling behind, wild grinning momentum, around 135-150 bpm, instrumental

**Postapoc — `BGM/adrenaline/postapoc/`**
> Full-throttle wasteland chase, pounding junkyard percussion and growling bass, distorted guitar and raw synth stabs, war-rig engines at redline through the dust wall, feral joy and hazard, relentless momentum, around 138-152 bpm, instrumental

**Cyberpunk — `BGM/adrenaline/cyberpunk/`**
> Neon cyberpunk chase, driving industrial-techno percussion and a sprinting distorted bassline, glitch arps and blazing synthwave leads, rooftop to rooftop through rain and hologram glare, electric exhilaration rather than menace, around 138-152 bpm, instrumental

**Steampunk — `BGM/adrenaline/steampunk/`**
> Steampunk chase, pounding clockwork percussion and racing brass over driving Victorian strings, accordion runs and train-whistle shrieks, airship boilers screaming through the fog, gears-and-gaslight exhilaration rather than menace, around 135-150 bpm, instrumental

**Gothic — `BGM/adrenaline/gothic/`**
> Gothic flight, racing chamber-string ostinatos and urgent harpsichord figures over a dark organ pulse, bells tumbling past, skirts and candleflame down the long corridors, breathless dramatic sweep rather than pure horror, around 132-148 bpm, instrumental

**Urbanfantasy — `BGM/adrenaline/urbanfantasy/`**
> Urban-fantasy chase, driving trip-hop breaks and dark-electronic bass with taut noir-jazz stabs, tremolo guitar sparks, sprinting the midnight streets with something inhuman a heartbeat behind, chilled exhilaration, around 135-150 bpm, instrumental

**Spaceopera — `BGM/adrenaline/spaceopera/`**
> Space-opera pursuit, driving orchestral percussion and racing heroic brass over sweeping strings, starfighters rolling through the canyon walls of a capital ship, grand exhilaration rather than menace, around 135-150 bpm, instrumental

**Pirate — `BGM/adrenaline/pirate/`**
> Swashbuckling pirate chase, pounding ship-deck percussion and racing fiddle and accordion runs, naval brass surging with the wind, swinging deck to deck with the tide turning, salt-sprayed grinning momentum, around 135-150 bpm, instrumental

**Cozy — `BGM/adrenaline/cozy/`**
> Light cozy scramble, a quick lo-fi beat and racing felt piano and wooden flute, playful strings tumbling after, chasing the runaway cart through the village market, breathless giggling fun, never scary, around 120-138 bpm, instrumental

**Eastasian — `BGM/adrenaline/eastasian/`**
> East-Asian chase, driving taiko and racing guzheng runs over urgent dizi and shakuhachi, silk strings sprinting the lantern-lit rooftops, robes snapping in the night wind, weightless exhilaration rather than menace, around 135-150 bpm, instrumental

**Superhero — `BGM/adrenaline/superhero/`**
> Superhero chase, driving string ostinatos and blockbuster brass over pounding hybrid percussion, electric guitar surging through the skyline, a rescue race with the whole city watching, soaring exhilaration rather than menace, around 140-155 bpm, instrumental

**Pulp — `BGM/adrenaline/pulp/`**
> Pulp chase, racing big-band brass and jungle percussion, swashbuckling string runs and matinee fanfare flashes, outrunning the boulder with the idol under one arm, grand grinning momentum, around 138-152 bpm, instrumental

## `battle/` — ordinary combat (skirmish scale)

The everyday fight: bandits on the road, a patrol clash, a bar brawl with
blades. Punchy, agile, dangerous — but **human-scale**. Every prompt
explicitly steers away from final-boss weight; if a generation still comes
out enormous, shelve it in `boss/`.

**Neutral — `BGM/battle/`**
> Driving cinematic combat music for a mid-stakes skirmish, punchy percussion and aggressive string ostinatos, short brass and synth stabs trading blows, agile and dangerous but human-scale, a hard fight rather than a world-ending final boss, no massive choir, no doom bells, relentless momentum, around 130-145 bpm, instrumental

**Fantasy — `BGM/battle/fantasy/`**
> Fantasy skirmish combat score, driving frame drums and taiko with galloping string ostinatos, sharp brass hits and quick fiddle and flute flourishes, steel ringing on shields at close quarters, heroic and light on its feet, a road battle not a world-ending boss, no massive doom choir, around 130-142 bpm, instrumental

**Scifi — `BGM/battle/scifi/`**
> Sci-fi skirmish combat score, driving electronic percussion and distorted bass, aggressive arpeggiators and synth-brass stabs, plasma fire down a service corridor, fast kinetic danger at squad scale, not apocalyptic, around 135-148 bpm, instrumental

**Horror — `BGM/battle/horror/`**
> Desperate horror combat score, pounding irregular drums and shrieking string stabs over low distorted pulses, fighting it off with whatever is in reach, ugly scrappy panic rather than epic scale, no giant choir, relentless, instrumental

**Noir — `BGM/battle/noir/`**
> Hard-boiled noir shootout score, driving snare and sprinting upright bass, stabbing brass and jagged piano clusters, tommy guns flashing under the el-train, kinetic swing-inflected danger at street scale, around 135-148 bpm, instrumental

**Modern — `BGM/battle/modern/`**
> Modern firefight score, driving hybrid percussion and distorted synth bass, aggressive staccato strings and clipped brass hits, muzzle flash between concrete pillars, kinetic squad-scale danger, controlled not bombastic, around 135-148 bpm, instrumental

**Western — `BGM/battle/western/`**
> Western gunfight score, galloping percussion and driving bass, frantic fiddle and twanging guitar stabs with a hard trumpet edge, lead splintering the saloon rail, rowdy dangerous and human-scale, around 130-142 bpm, instrumental

**Postapoc — `BGM/battle/postapoc/`**
> Wasteland skirmish score, pounding scrap-metal percussion and growling distorted bass, raw guitar and synth stabs, a raider ambush at the gates, savage scrappy and survivable, not world-ending, fast and relentless, around 132-146 bpm, instrumental

**Cyberpunk — `BGM/battle/cyberpunk/`**
> Cyberpunk street-fight score, driving industrial-techno percussion and distorted darksynth bass, aggressive glitch arps and synthwave stabs, gunfire strobing through club smoke and neon, kinetic gritty squad-scale danger, not apocalyptic, around 138-150 bpm, instrumental

**Steampunk — `BGM/battle/steampunk/`**
> Steampunk skirmish score, pounding clockwork percussion and aggressive brass hits over driving Victorian strings, sabers and pistols in the gearworks, sparks off the boiler plate, dangerous but human-scale, not a final boss, around 130-144 bpm, instrumental

**Gothic — `BGM/battle/gothic/`**
> Gothic skirmish score, driving chamber-string ostinatos and hard harpsichord and organ stabs over urgent percussion, blades flashing in a candlelit hall, dramatic and dark but human-scale, no massive choir, around 128-140 bpm, instrumental

**Urbanfantasy — `BGM/battle/urbanfantasy/`**
> Urban-fantasy street-combat score, driving trip-hop-edged percussion and dark-electronic bass with taut noir-brass stabs, claws and iron in a neon alley, kinetic supernatural danger at street scale, around 135-148 bpm, instrumental

**Spaceopera — `BGM/battle/spaceopera/`**
> Space-opera skirmish score, driving orchestral percussion and heroic brass hits over aggressive string ostinatos, a boarding action in the hangar bay, kinetic and grand but not fleet-ending, no massive doom choir, around 132-146 bpm, instrumental

**Pirate — `BGM/battle/pirate/`**
> Pirate skirmish score, pounding ship-deck percussion and aggressive fiddle and accordion runs over driving low strings, cutlasses through the rigging smoke, rowdy dangerous and human-scale, around 130-144 bpm, instrumental

**Cozy — `BGM/battle/cozy/`**
> Light cozy scrap score, punchy soft percussion and playful piano and wooden-flute flourishes, brooms versus scarecrows in the town square, danger enough to matter but never grim, around 120-136 bpm, instrumental

**Eastasian — `BGM/battle/eastasian/`**
> East-Asian skirmish score, driving taiko and aggressive guzheng ostinatos with sharp shakuhachi cries, blades circling in the courtyard, agile honorable and human-scale, no massive choir, around 130-144 bpm, instrumental

**Superhero — `BGM/battle/superhero/`**
> Superhero skirmish score, driving string ostinatos and blockbuster brass hits over punchy hybrid percussion and electric-guitar chugs, henchmen scattering down the block, bold kinetic street-level heroics, not the endgame, around 138-150 bpm, instrumental

**Pulp — `BGM/battle/pulp/`**
> Pulp skirmish score, racing brass and jungle percussion with aggressive string ostinatos, fists and whip-cracks on the dig site, matinee danger at human scale, around 132-146 bpm, instrumental

## `boss/` — climactic showdowns (NEW)

The fight everything led to: the dragon on its hoard, the god-machine, the
kingpin's penthouse. Colossal, dark, overwhelming — massive choirs and
doom brass are *required* here, exactly what `battle/` forbids.

**Neutral — `BGM/boss/`**
> Colossal final-boss battle music, massive low choir and doom-laden brass, thundering half-time percussion under racing string ostinatos, a tolling low bell and sub hits, overwhelming and apocalyptic, the confrontation everything led to, dark and enormous, around 90-110 bpm with double-time flurries, instrumental

**Fantasy — `BGM/boss/fantasy/`**
> Epic fantasy final-boss score, massive dark choir and war horns over thundering taiko, furious string ostinatos and a tolling bell, shrieking high strings against abyssal brass, an ancient evil at full power, apocalyptic dread majesty, around 95-115 bpm with double-time flurries, instrumental

**Scifi — `BGM/boss/scifi/`**
> Sci-fi final-boss score, crushing distorted synth bass and industrial percussion, massive braams and racing arpeggiators, klaxon textures bleeding into dissonant orchestra, a god-machine waking level by level, apocalyptic scale, around 100-120 bpm, instrumental

**Horror — `BGM/boss/horror/`**
> Horror final-confrontation score, overwhelming dissonant orchestra and full dark choir, pounding ritual drums and shrieking string clusters over an abyssal drone, facing the source of every nightmare, cataclysmic terror and awe, instrumental

**Noir — `BGM/boss/noir/`**
> Noir kingpin-showdown score, dark heavy brass and urgent full strings over a pounding pulse, jagged piano stabs and a wailing muted trumpet, the whole city holding its breath in the rain, grand fatal confrontation, weighty and inescapable, instrumental

**Modern — `BGM/boss/modern/`**
> Modern endgame score, massive hybrid orchestra with doom braams and relentless processed percussion, racing staccato strings and a dark choir pad, the final operation against the mastermind, overwhelming cinematic scale, around 100-120 bpm, instrumental

**Western — `BGM/boss/western/`**
> Western final-showdown score, doom-laden mariachi trumpet and massive orchestral swells over a funeral-march pulse, cracking whip percussion, tremolo strings and a tolling mission bell, high noon against a living legend, mythic and heavy, instrumental

**Postapoc — `BGM/boss/postapoc/`**
> Wasteland warlord boss score, crushing industrial percussion and walls of distorted guitar and raw synth, a massive chanting drone-choir, war drums and engines at the end of the world, apocalyptic and merciless, around 100-120 bpm, instrumental

**Cyberpunk — `BGM/boss/cyberpunk/`**
> Cyberpunk final-boss score, crushing industrial techno and distorted darksynth bass, massive braams and racing glitch arps over a dark choir pad, a megacorp AI unfolding across the whole grid, apocalyptic neon scale, around 105-125 bpm, instrumental

**Steampunk — `BGM/boss/steampunk/`**
> Steampunk final-boss score, massive Victorian brass and thundering clockwork percussion under furious strings, pipe organ and boiler-roar textures, a colossal engine-god shaking the city, overwhelming industrial grandeur, instrumental

**Gothic — `BGM/boss/gothic/`**
> Gothic final-boss score, massive pipe organ and full dark choir over thundering percussion and furious chamber strings, bells tolling through the shattered nave, an ancient curse at full power, apocalyptic and mournful, instrumental

**Urbanfantasy — `BGM/boss/urbanfantasy/`**
> Urban-fantasy final-confrontation score, massive dark-electronic bass and heavy drums under urgent brass and full strings, choir rising through the static, the city's hidden god unveiled above the skyline, overwhelming midnight scale, instrumental

**Spaceopera — `BGM/boss/spaceopera/`**
> Space-opera final-boss score, massive heroic brass and full dark choir over thundering timpani and racing strings, a dreadnought blotting out the stars, galactic apocalyptic grandeur, instrumental

**Pirate — `BGM/boss/pirate/`**
> Pirate final-showdown score, massive naval brass and thundering ship-deck percussion under furious fiddle and low choir, the kraken breaching through the storm wall, colossal salt-and-thunder scale, instrumental

**Cozy — `BGM/boss/cozy/`**
> Cozy endgame score, big warm orchestral percussion and bold piano and wooden-flute themes over sweeping strings, the village's greatest threat faced hand in hand, dramatic for its small world but never grimdark, instrumental

**Eastasian — `BGM/boss/eastasian/`**
> East-Asian final-boss score, thunderous taiko and massive dark choir over furious guzheng ostinatos and piercing shakuhachi, a demon lord unmasked in the burning shrine, apocalyptic majesty, instrumental

**Superhero — `BGM/boss/superhero/`**
> Superhero endgame score, massive blockbuster brass and driving string ostinatos over relentless hybrid percussion, dark choir against a defiant heroic theme, the archvillain's final form over a breaking city, overwhelming cinematic scale, instrumental

**Pulp — `BGM/boss/pulp/`**
> Pulp final-boss score, massive serial-fanfare brass and thundering jungle percussion under furious adventure strings, gong crashes as the temple god rises, colossal matinee terror and spectacle, instrumental

## `mystery/` — investigation, ruins, strangeness

**Neutral — `BGM/mystery/`**
> Enigmatic cinematic mystery piece, music box and glass textures with slow viola or synth phrases in a minor mode, subtle wind-chime shimmer and a low held drone, clues that almost connect, curious and unsettling in equal measure, sparse and spacious, instrumental

**Fantasy — `BGM/mystery/fantasy/`**
> Enigmatic arcane mystery piece, glass harmonica and music-box textures with slow viola phrases in a minor mode, harp harmonics and wind-chime shimmer, runes half-glowing under the moss, curious and unsettling in equal measure, sparse and spacious, instrumental

**Scifi — `BGM/mystery/scifi/`**
> Enigmatic sci-fi mystery piece, sparse metallic pings and glassy pads, slow detuned synth phrases and faint radio-static shimmer, an anomaly pulsing where no signal should be, curious and unsettling, sparse and spacious, instrumental

**Horror — `BGM/mystery/horror/`**
> Unsettling horror mystery piece, a lone music box and prepared-piano plinks, faint whispering textures under slow minor viola, dread curiosity in an abandoned place, very sparse and spacious, no jump scares, instrumental

**Noir — `BGM/mystery/noir/`**
> Noir mystery piece, lone vibraphone and sparse lounge piano, muted trumpet sighs and a ticking clock, clues surfacing through the cigarette fog, curious and unsettling, slow and spacious, instrumental

**Modern — `BGM/mystery/modern/`**
> Modern investigation mystery piece, sparse felt piano and glassy synth textures over a slow pulsing bass, faint ticking and one thread that does not add up, following the lead into the dark, curious and unsettling, spacious, instrumental

**Western — `BGM/mystery/western/`**
> Western mystery piece, sparse muted guitar harmonics and a lonesome whistle, low tremolo strings and dust settling in an empty street, a ghost town keeping its secret, curious and unsettling, slow and spacious, instrumental

**Postapoc — `BGM/mystery/postapoc/`**
> Wasteland mystery piece, sparse detuned piano and kalimba plinks over humming drones and faint geiger-tick textures, strange lights out past the ruins, curious and unsettling, slow and spacious, instrumental

**Cyberpunk — `BGM/mystery/cyberpunk/`**
> Cyberpunk mystery piece, sparse glassy synth pings over a slow darksynth pad, data-static shimmer and a half-decrypted signal repeating, a lead buried deep in the net, curious and unsettling, slow and spacious, instrumental

**Steampunk — `BGM/mystery/steampunk/`**
> Steampunk mystery piece, sparse music-box and clockwork ticks over low Victorian strings, a curious brass or accordion phrase, blueprints that should not exist in the workshop drawer, spacious and slow, instrumental

**Gothic — `BGM/mystery/gothic/`**
> Gothic mystery piece, sparse harpsichord and eerie chamber strings over a low organ breath, a fragile music-box theme, the library's locked case and a missing page, curious and mournful, slow and spacious, instrumental

**Urbanfantasy — `BGM/mystery/urbanfantasy/`**
> Urban-fantasy mystery piece, sparse noir-jazz piano and dark electronic pads over a slow trip-hop tick, sigils under the overpass still warm, curious and unsettling, slow and spacious, instrumental

**Spaceopera — `BGM/mystery/spaceopera/`**
> Space-opera mystery piece, sparse celesta and soft strings over a low brass drone, harp glints across vast silence, an ancient signal older than the star charts, curious and grand, slow and spacious, instrumental

**Pirate — `BGM/mystery/pirate/`**
> Nautical mystery piece, sparse accordion and fiddle harmonics over slow wooden percussion and a low drone, a chart with an island that is not there, curious and salt-sprayed, slow and spacious, instrumental

**Cozy — `BGM/mystery/cozy/`**
> Soft cozy mystery piece, sparse felt piano and wooden flute over light bells and a gentle lo-fi tick, footprints in the flour and a missing pie, a small-town puzzle, curious never scary, slow and spacious, instrumental

**Eastasian — `BGM/mystery/eastasian/`**
> East-Asian mystery piece, sparse guzheng plinks and soft shakuhachi over a low drone, temple bells far off in the mist, a riddle left in brushstrokes, curious and serene, slow and spacious, instrumental

**Superhero — `BGM/mystery/superhero/`**
> Superhero investigation piece, sparse piano and soft string pads over a restrained pulse, evidence spread under a desk lamp, the pattern one clue from visible, curious and cinematic, slow and spacious, instrumental

**Pulp — `BGM/mystery/pulp/`**
> Pulp mystery piece, sparse tomb-echo percussion and soft brass over a low drone, a mysterious woodwind tracing a half-translated tablet, torchlight on hieroglyphs, curious matinee wonder with an edge, slow and spacious, instrumental

## `dread/` — horror, something is very wrong

**Neutral — `BGM/dread/`**
> Dark ambient horror drone, sub-bass swells, bowed metal and detuned strings, a distant heartbeat pulse and dissonant breaths, the light thinning at the edges, creeping dread without jump scares, very sparse, glacial pacing, instrumental

**Fantasy — `BGM/dread/fantasy/`**
> Fantasy dread drone, sub-bass swells with bowed metal and detuned strings, a distant heartbeat pulse and dissonant choir breaths, the forest gone silent and the dark between the trees too thick, creeping wrongness without jump scares, very sparse, glacial pacing, instrumental

**Scifi — `BGM/dread/scifi/`**
> Sci-fi horror drone, groaning hull sub-bass and bowed metal with detuned synth, a distant alarm pulse through dead decks, something loose on the ship and the crew count wrong, creeping dread without jump scares, very sparse, glacial pacing, instrumental

**Horror — `BGM/dread/horror/`**
> Pure horror dread drone, deep sub-bass swells, bowed metal and detuned strings, a distant heartbeat and breathy dissonant choir, the wrongness standing just behind the light, creeping terror without jump scares, glacial and airless, instrumental

**Noir — `BGM/dread/noir/`**
> Noir dread piece, a low bowed-bass drone and dissonant muted brass, a far-off siren-like clarinet through the rain, a body in the alley and a name you recognize, heavy creeping wrongness, very sparse, glacial pacing, instrumental

**Modern — `BGM/dread/modern/`**
> Modern dread drone, deep synth sub swells and dissonant sustained strings, a distant low alarm and static breath, the operation gone wrong in a way no one will say aloud, creeping weight, very sparse, glacial pacing, instrumental

**Western — `BGM/dread/western/`**
> Western dread piece, a low bowed drone and detuned guitar, scraping wind and a far coyote wail, buzzard shadows over a dry canyon, something waiting past the switchback, creeping wrongness, very sparse, glacial pacing, instrumental

**Postapoc — `BGM/dread/postapoc/`**
> Wasteland dread drone, deep irradiated sub swells, groaning metal and detuned strings, a warning siren swallowed by wind, the crater nobody walks back out of, creeping wrongness, very sparse, glacial pacing, instrumental

**Cyberpunk — `BGM/dread/cyberpunk/`**
> Cyberpunk dread drone, deep distorted darksynth sub swells and glitching bowed-metal textures, a distant alarm drowned in rain, the feed showing a room that should not exist, creeping wrongness in the net, very sparse, glacial pacing, instrumental

**Steampunk — `BGM/dread/steampunk/`**
> Steampunk dread piece, a low boiler-room drone and detuned Victorian strings, distant clockwork grinding out of rhythm, steam hissing where no pipe runs, the machine dreaming something wrong, very sparse, glacial pacing, instrumental

**Gothic — `BGM/dread/gothic/`**
> Gothic dread piece, a low pipe-organ drone and eerie chamber-string clusters, a distant heartbeat under stone, candle flames leaning toward the crypt door, creeping wrongness without jump scares, glacial pacing, instrumental

**Urbanfantasy — `BGM/dread/urbanfantasy/`**
> Urban-fantasy dread piece, a low dark-electronic drone and sparse dissonant noir-jazz shivers, a siren stretching too long, the city's hidden world turning its face away, creeping wrongness, very sparse, glacial pacing, instrumental

**Spaceopera — `BGM/dread/spaceopera/`**
> Space-opera dread piece, deep orchestral sub swells and low brass drones, a lone klaxon under vast choir-tinged silence, the fleet answering nothing beyond the viewport, grand cold wrongness, glacial pacing, instrumental

**Pirate — `BGM/dread/pirate/`**
> Nautical dread piece, a low creaking-hull drone and sparse detuned fiddle, wind over black water and rigging knocking to no rhythm, wake lights circling beneath the keel, creeping wrongness, very sparse, glacial pacing, instrumental

**Cozy — `BGM/dread/cozy/`**
> Soft cozy unease piece, a hollow felt-piano drone and sparse wooden-flute sighs, the familiar room a half-step wrong, shadows where the cat will not go, mild creeping worry never full horror, glacial pacing, instrumental

**Eastasian — `BGM/dread/eastasian/`**
> East-Asian dread piece, a low shakuhachi drone and sparse detuned guzheng, a distant taiko like a held breath, the shrine gate open at the wrong hour, creeping wrongness in the mist, very sparse, glacial pacing, instrumental

**Superhero — `BGM/dread/superhero/`**
> Superhero dread piece, deep hybrid-orchestral drones and dissonant string clusters, a distant low alarm rolling across the city, the sky the wrong color over downtown, creeping catastrophe, sparse and heavy, glacial pacing, instrumental

**Pulp — `BGM/dread/pulp/`**
> Pulp dread piece, a low tomb-drone and sparse detuned brass, dead air moving through the dig shaft, the idol's eyes following the lantern, creeping matinee wrongness, very sparse, glacial pacing, instrumental

## `triumph/` — victory, celebration

**Neutral — `BGM/triumph/`**
> Triumphant cinematic victory theme, soaring strings and noble brass in a bright major key, timpani rolls and cymbal swells, a choir lifting the final phrase, golden dawn after the storm, earned joy and gratitude, celebratory but not cheesy, instrumental

**Fantasy — `BGM/triumph/fantasy/`**
> Triumphant fantasy fanfare, noble French horns and soaring strings in a bright major key, timpani rolls, harp flourishes and cymbal swells, a choir lifting the melody home, banners raised over the field at golden sunrise, earned joy and gratitude, celebratory but not cheesy, instrumental

**Scifi — `BGM/triumph/scifi/`**
> Triumphant sci-fi anthem, soaring synth leads over bright analog pads, rising arpeggios and shimmering bells, hybrid strings breaking into warmth, the ship climbing into dawn over the curve of the world, luminous earned joy, instrumental

**Horror — `BGM/triumph/horror/`**
> Grim horror reprieve, a fragile major-key melody emerging from dissolving dissonance, warm strings pushing back the dark, the music box finally playing in tune, uneasy relief and gray morning light, gentle and hard-won, instrumental

**Noir — `BGM/triumph/noir/`**
> Bittersweet noir resolve piece, warm swelling strings with a lone confident muted trumpet, brushed drums easing into daylight, the case closed as dawn hits the office blinds, hard-won satisfaction, understated not cheesy, instrumental

**Modern — `BGM/triumph/modern/`**
> Triumphant modern anthem, soaring strings and bright brass over a driving hybrid pulse, piano striking home, mission accomplished as the sun clears the skyline, sleek earned celebration, instrumental

**Western — `BGM/triumph/western/`**
> Triumphant western piece, soaring fiddle and mariachi trumpet over full warm strings, church bells and hoofbeat percussion easing to a walk, the town saved and hats thrown high at sunrise, rugged golden celebration, instrumental

**Postapoc — `BGM/triumph/postapoc/`**
> Hard-won wasteland triumph, warm strings and a soaring guitar or trumpet lead rising over dusty drones, junk percussion turning celebratory, the settlement standing as sun breaks the haze, gritty tearful joy, instrumental

**Cyberpunk — `BGM/triumph/cyberpunk/`**
> Neon cyberpunk triumph, soaring synthwave leads over bright darksynth pads and a driving retro pulse, glassy bells cutting through, rain breaking over the skyline as the crew walks away paid, gritty electric jubilation, instrumental

**Steampunk — `BGM/triumph/steampunk/`**
> Steampunk triumph, soaring Victorian brass and warm strings over bright celebratory clockwork percussion, accordion and bells joining in, airships rising into sunrise with pennants streaming, grand mechanical joy, instrumental

**Gothic — `BGM/triumph/gothic/`**
> Gothic triumph, warm chamber strings and a noble organ swell carrying a fragile major-key theme, bells ringing clean at last, candlelight returning room by room to the hall, hard-won relief more than gloating cheer, instrumental

**Urbanfantasy — `BGM/triumph/urbanfantasy/`**
> Urban-fantasy triumph, warm noir-jazz horns and swelling pads over a hopeful trip-hop pulse, piano opening like daybreak, dawn washing the neon out of the sky after the long night's fight, cool-headed jubilation, instrumental

**Spaceopera — `BGM/triumph/spaceopera/`**
> Space-opera triumph, soaring heroic brass and full romantic strings over bright timpani and choir, harp cascades, the fleet breaking into sunlight above a saved world, grand galactic celebration, instrumental

**Pirate — `BGM/triumph/pirate/`**
> Pirate triumph, soaring fiddle and accordion over warm naval brass and rolling ship-deck percussion, a shanty theme turned victory march, safe harbor and full holds after the storm, salt-sprayed jubilation, instrumental

**Cozy — `BGM/triumph/cozy/`**
> Cozy triumph, bright felt piano and warm acoustic guitar over light bells and a gentle lo-fi beat, flutes and strings joining the round, the village festival spilling into the square after the scare, gentle glowing joy rather than epic fanfare, instrumental

**Eastasian — `BGM/triumph/eastasian/`**
> East-Asian triumph, soaring erhu and dizi over bright guzheng and rolling taiko, temple bells ringing across the valley, sunrise over the peaks after victory, majestic serene celebration, instrumental

**Superhero — `BGM/triumph/superhero/`**
> Superhero triumph, soaring blockbuster brass and optimistic string ostinatos over a bright hybrid pulse and ringing electric guitar, the full anthem finally uncaged, the city cheering from the rooftops at dawn, bold golden celebration, instrumental

**Pulp — `BGM/triumph/pulp/`**
> Pulp triumph, soaring serial-fanfare brass and warm adventure strings over bright jungle percussion, the treasure aboard and the map complete, matinee-poster jubilation, grand and grinning, instrumental

## `wonder/` — awe, vistas, revealed magic

**Neutral — `BGM/wonder/`**
> Ethereal wonder theme, celesta and glass bells over lush string and synth pads, wordless soprano vocalise used as an instrument, floating harp glissandi, starlight and first snowfall, weightless and luminous awe, instrumental

**Fantasy — `BGM/wonder/fantasy/`**
> Ethereal fantasy wonder piece, celesta and glass bells over lush string pads, wordless soprano vocalise used as an instrument, floating harp glissandi and soft horn glow, starlight and first snowfall over ancient stones, weightless and luminous, instrumental

**Scifi — `BGM/wonder/scifi/`**
> Ethereal sci-fi wonder piece, glassy digital bells and lush analog pads, wordless vocalise drifting through slow floating arpeggios, a nebula unfolding beyond the glass in silence, weightless luminous awe, instrumental

**Horror — `BGM/wonder/horror/`**
> Eerie horror wonder piece, shimmering glassy bells over cold pads, a wordless vocalise turned ghostly, music-box glints in black water, beautiful and deeply wrong, floating weightless chill, no jump scares, instrumental

**Noir — `BGM/wonder/noir/`**
> Wistful noir wonder piece, shimmering vibraphone and soft strings, a sultry clarinet drifting over brushed hush, neon blooming in rain-mirrored streets, weightless bittersweet beauty, instrumental

**Modern — `BGM/wonder/modern/`**
> Modern wonder piece, shimmering synth bells and lush warm pads, a wordless vocalise over slow piano, the city grid glittering from a rooftop at night, weightless luminous stillness, instrumental

**Western — `BGM/wonder/western/`**
> Expansive western wonder piece, shimmering reverb guitar and soft swelling strings, a lonesome whistle turned luminous, the mesa rim at sunset going to fire and gold, weightless open-sky awe, instrumental

**Postapoc — `BGM/wonder/postapoc/`**
> Wasteland wonder piece, shimmering bells and lush pads blooming over dusty textures, a wordless vocalise over kalimba glints, green shoots through cracked concrete, awe that the world can still be beautiful, weightless and luminous, instrumental

**Cyberpunk — `BGM/wonder/cyberpunk/`**
> Neon cyberpunk wonder piece, shimmering glassy synth bells over lush darksynth pads, a wordless vocalise through the data-haze, the megacity blooming in holograms beneath the rain, weightless luminous awe with a gritty under-glow, instrumental

**Steampunk — `BGM/wonder/steampunk/`**
> Steampunk wonder piece, shimmering music box and glass bells over warm Victorian strings, a floating brass or accordion theme, the airship breaking through cloud into painted sky, weightless brass-and-sunlight awe, instrumental

**Gothic — `BGM/wonder/gothic/`**
> Gothic wonder piece, shimmering glass bells over lush chamber strings and a soft organ pad, a fragile wordless vocalise, moonlight pouring through rose-window glass, beautiful mournful weightlessness, instrumental

**Urbanfantasy — `BGM/wonder/urbanfantasy/`**
> Urban-fantasy wonder piece, shimmering vibraphone and soft noir-jazz pads over dark electronic bloom, a wordless vocalise, the hidden world unveiled above the midnight skyline, weightless secret luminescence, instrumental

**Spaceopera — `BGM/wonder/spaceopera/`**
> Space-opera wonder piece, shimmering celesta and lush romantic strings over soft heroic brass and choir, harp cascades through starlight, twin suns rising over an unnamed world, grand weightless awe, instrumental

**Pirate — `BGM/wonder/pirate/`**
> Nautical wonder piece, shimmering bells and soft accordion over warm swelling strings, a floating fiddle theme, an uncharted island lifting out of the dawn mist, weightless salt-sprayed awe, instrumental

**Cozy — `BGM/wonder/cozy/`**
> Cozy wonder piece, light bells and felt piano over fingerpicked guitar and a gentle lo-fi bloom, a wordless vocalise like breath on cold air, fireflies rising over the meadow at dusk, weightless tender awe, instrumental

**Eastasian — `BGM/wonder/eastasian/`**
> East-Asian wonder piece, shimmering guzheng harmonics and soft shakuhachi over lush silk-string pads, a floating erhu theme, mist parting from the sacred peak at first light, weightless luminous serenity, instrumental

**Superhero — `BGM/wonder/superhero/`**
> Superhero wonder piece, shimmering bells and lush string pads over soft warm brass, a wordless vocalise lifting, the city golden and small beneath the clouds, weightless hopeful awe, instrumental

**Pulp — `BGM/wonder/pulp/`**
> Pulp wonder piece, shimmering bells and soft brass over warm adventure strings, a mysterious woodwind floating through the torch-glow, first light falling on the lost city, weightless matinee awe, instrumental

## `somber/` — loss, mourning, quiet aftermath

Private, dignified grief — one voice, small room. (The *end-credits*
version of grief lives in `outro-defeat/`, which is bigger and darker;
keep these two shelves distinct.)

**Neutral — `BGM/somber/`**
> Mournful solo cello elegy with sparse felt piano, slow air on strings swelling gently and falling away, rainy grey light through a window, dignified private grief, long silences between phrases, quiet and restrained, instrumental

**Fantasy — `BGM/somber/fantasy/`**
> Mournful fantasy elegy, solo cello over sparse piano and slow air on strings, a distant horn like a memory of banners, rain on the barrow field, a hero laid to rest, dignified private grief with long silences between phrases, quiet and restrained, instrumental

**Scifi — `BGM/somber/scifi/`**
> Mournful sci-fi elegy, a lone sustained analog pad and sparse felt piano, slow airy drone and one soft signal blinking unanswered, cold starlight through a viewport, dignified grief with long silences, quiet and restrained, instrumental

**Horror — `BGM/somber/horror/`**
> Mournful horror elegy, lone cello over a hollow drone, sparse detuned piano and breath-thin textures, a funeral in a place still watching, grief shot through with dread, long silences, quiet and restrained, instrumental

**Noir — `BGM/somber/noir/`**
> Mournful noir elegy, a lone muted trumpet over sparse lounge piano and brushed cymbal hush, rain streaking the office glass gray, a name crossed out gently, dignified grief with long silences, quiet and restrained, instrumental

**Modern — `BGM/somber/modern/`**
> Mournful modern elegy, lone felt piano over a soft sustained pad and slow strings, gray rain on glass and a folded flag, dignified grief with long silences between phrases, quiet and restrained, instrumental

**Western — `BGM/somber/western/`**
> Mournful western elegy, lone reverb guitar over sparse strings and a far harmonica breath, a grave on the hill at dusk and a hat held to the chest, frontier grief with long silences, quiet and restrained, instrumental

**Postapoc — `BGM/somber/postapoc/`**
> Wasteland elegy, a lone detuned guitar or cello over a dusty drone and sparse piano, a marker welded from scrap, grief that cannot stop long, long silences between phrases, quiet and restrained, instrumental

**Cyberpunk — `BGM/somber/cyberpunk/`**
> Cyberpunk elegy, a lone glassy synth lead and sparse felt piano over a soft darksynth drone, rain on the apartment window and one chair empty, neon grief with long silences, quiet and restrained, instrumental

**Steampunk — `BGM/somber/steampunk/`**
> Steampunk elegy, a lone accordion or cello over sparse piano and a slowed clockwork tick, a workshop gone quiet and goggles left on the bench, lamplit grief with long silences, quiet and restrained, instrumental

**Gothic — `BGM/somber/gothic/`**
> Gothic elegy, a lone cello over sparse harpsichord and a low organ breath, a candlelit chapel and one name new on the stone, mournful dignified grief with long silences, quiet and restrained, instrumental

**Urbanfantasy — `BGM/somber/urbanfantasy/`**
> Urban-fantasy elegy, a lone muted trumpet or piano over soft dark-electronic pads, the safehouse quiet after midnight and a coat never claimed, city grief with long silences, quiet and restrained, instrumental

**Spaceopera — `BGM/somber/spaceopera/`**
> Space-opera elegy, a lone horn or cello over soft orchestral pads and faint choir, a fallen crewmate given to the stars, vast gentle grief with long silences, quiet and restrained, instrumental

**Pirate — `BGM/somber/pirate/`**
> Nautical elegy, a lone accordion or fiddle over sparse strings and slow water-lapped percussion, a burial at sea under gray light, the crew bareheaded at the rail, salt-worn grief with long silences, quiet and restrained, instrumental

**Cozy — `BGM/somber/cozy/`**
> Cozy elegy, a lone felt piano or wooden flute over sparse acoustic guitar, an empty chair by the hearth and tea gone cold, small tender mourning with long silences, quiet and restrained, instrumental

**Eastasian — `BGM/somber/eastasian/`**
> East-Asian elegy, a lone erhu or shakuhachi over sparse guzheng, incense smoke rising straight in still air, dignified grief in the mist with long silences, quiet and restrained, instrumental

**Superhero — `BGM/somber/superhero/`**
> Superhero elegy, a lone piano over soft string pads, the cowl set down on an empty desk, the cost of the victory counted in silence, dignified grief with long silences, quiet and restrained, instrumental

**Pulp — `BGM/somber/pulp/`**
> Pulp elegy, a lone muted brass or guitar over sparse hand percussion, a grave at the dig site marked with a compass, grief between the adventures, long silences, quiet and restrained, instrumental

## `outro/` — generic end credits (any ending)

Plays when the AI calls `end_campaign` and the Three.js outro takes the TV,
whenever the specific `outro-<state>/` shelf is empty. All outro music
loops under the credits until the host leaves — the crossfade handles the
looping, so just cull takes with long dead-silent tails.

**Neutral — `BGM/outro/`**
> Cinematic end-credits theme, warm strings and reflective piano over a slow noble pulse, a horn recalling the journey's theme, equal parts gratitude and farewell, grand but tender, works over victory or loss alike, instrumental

**Fantasy — `BGM/outro/fantasy/`**
> Fantasy end-credits theme, warm strings and harp over reflective piano, a noble horn recalling the whole journey, the last campfire burning low as names are toasted, gratitude and farewell entwined, grand but tender, works over victory or loss alike, instrumental

**Scifi — `BGM/outro/scifi/`**
> Sci-fi end-credits theme, warm analog pads and a slow soaring lead, gentle arpeggios receding like starlight, a farewell transmission home from the edge of the map, reflective and vast, works over victory or loss alike, instrumental

**Horror — `BGM/outro/horror/`**
> Horror end-credits theme, a fragile piano melody over dark ambient drones, a distant music box and mournful strings, the dread receding but never quite gone, reflective and uneasy, works whether the survivors won or lost, no jump scares, instrumental

**Noir — `BGM/outro/noir/`**
> Noir end-credits theme, smoky muted trumpet over brushed drums and lounge piano, strings settling like streetlight through blinds, one last slow walk into the rain, world-weary warmth and bittersweet resolve, suits a closed case or a cold one, instrumental

**Modern — `BGM/outro/modern/`**
> Modern end-credits theme, warm hybrid pads and reflective piano over a slow steady pulse, strings swelling with quiet resolve, the debrief ending and the lights going out floor by floor, sleek and heartfelt, works over success or failure alike, instrumental

**Western — `BGM/outro/western/`**
> Western end-credits theme, warm reverb guitar and fiddle over slow strings, a lonesome whistle bidding farewell, riding toward the horizon at dusk, dusty and tender, suits a won showdown or a lost one, instrumental

**Postapoc — `BGM/outro/postapoc/`**
> Wasteland end-credits theme, warm dusty guitar and strings over a slow steady pulse, a weathered hopeful lead, survivors walking into the sunrise with everything they could carry, gratitude and grit in equal measure, works over victory or loss alike, instrumental

**Cyberpunk — `BGM/outro/cyberpunk/`**
> Cyberpunk end-credits theme, warm darksynth pads and a reflective synthwave lead over a slow retro pulse, rain thinning over the skyline as the neon dims, gratitude and farewell with a gritty edge, works over victory or loss alike, instrumental

**Steampunk — `BGM/outro/steampunk/`**
> Steampunk end-credits theme, warm Victorian strings and soft brass over a gentle clockwork pulse, a reflective accordion and music-box theme, airships drifting into dusk with lanterns lit, gratitude and farewell, works over victory or loss alike, instrumental

**Gothic — `BGM/outro/gothic/`**
> Gothic end-credits theme, warm chamber strings and a soft organ pad over sparse harpsichord, a mournful-but-tender theme, the last candles carried from the hall, farewell in velvet dark, works over victory or loss alike, instrumental

**Urbanfantasy — `BGM/outro/urbanfantasy/`**
> Urban-fantasy end-credits theme, warm noir-jazz horns and reflective piano over a slow trip-hop pulse and dark velvet pads, one last walk through the city as the hidden world settles, cool tender farewell, works over victory or loss alike, instrumental

**Spaceopera — `BGM/outro/spaceopera/`**
> Space-opera end-credits theme, warm romantic strings and soft heroic brass over a slow noble pulse, a reflective horn theme and choir glow, farewells exchanged under a field of stars, grand and tender, works over victory or loss alike, instrumental

**Pirate — `BGM/outro/pirate/`**
> Pirate end-credits theme, warm accordion and fiddle over slow strings and gentle ship-deck percussion, a shanty slowed to a farewell, the crew watching the coastline fade, salt-sprayed gratitude, works over victory or loss alike, instrumental

**Cozy — `BGM/outro/cozy/`**
> Cozy end-credits theme, felt piano and fingerpicked guitar over light bells and a gentle lo-fi pulse, a warm farewell by the hearth as the mugs empty, tender and glowing, works over victory or loss alike, instrumental

**Eastasian — `BGM/outro/eastasian/`**
> East-Asian end-credits theme, warm guzheng and soft shakuhachi over slow silk strings and a gentle taiko pulse, a reflective erhu theme, farewell bows in lantern light and mist, serene gratitude, works over victory or loss alike, instrumental

**Superhero — `BGM/outro/superhero/`**
> Superhero end-credits theme, warm blockbuster brass gone reflective over soft strings and piano, a hopeful fanfare turned tender, the city at dusk watching its guardians go home, grateful and bold-hearted, works over victory or loss alike, instrumental

**Pulp — `BGM/outro/pulp/`**
> Pulp end-credits theme, warm brass and reflective adventure strings over soft jungle percussion, a last look at the finished map as the steamer pulls out, matinee gratitude and farewell, works over victory or loss alike, instrumental

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
> Triumphant end-credits theme, soaring strings and brass over a warm major-key pulse, bright harp runs and choir swells, earned jubilation and gratitude, heroic but not gloating, instrumental

**Fantasy — `BGM/outro-victory/fantasy/`**
> Triumphant fantasy end-credits, noble horns and soaring strings over warm harp and dulcimer, bright major key with choir glow, timpani easing into a golden processional, the realm saved and the heroes named in song, earned jubilation, instrumental

**Scifi — `BGM/outro-victory/scifi/`**
> Triumphant sci-fi end-credits, soaring synth leads over bright analog pads and rising arpeggios, hybrid strings warming the chrome, the ship breaking orbit into dawn with the mission done, vast luminous celebration, instrumental

**Horror — `BGM/outro-victory/horror/`**
> Hard-won horror end-credits, a fragile major melody rising out of dark drones, warm strings pushing the night back inch by inch, survivors in gray morning light, relief more than parade, gentle and human, no jump scares, instrumental

**Noir — `BGM/outro-victory/noir/`**
> Noir victory end-credits, warm strings and a confident muted trumpet over easy brushed drums, lounge piano stretching out, the case closed at dawn and the fee paid, understated swagger and relief, instrumental

**Modern — `BGM/outro-victory/modern/`**
> Modern victory end-credits, soaring strings and bright brass over a sleek hybrid pulse, piano landing every phrase, mission accomplished as sunrise floods the safehouse, cool earned celebration, instrumental

**Western — `BGM/outro-victory/western/`**
> Western victory end-credits, soaring fiddle and mariachi trumpet over full warm strings and church bells, the showdown won and the street alive again, rugged golden celebration, instrumental

**Postapoc — `BGM/outro-victory/postapoc/`**
> Wasteland victory end-credits, warm strings and a soaring guitar or trumpet over dusty drones turned bright, junk percussion swinging easy, the settlement standing and the water clean, gritty joy, instrumental

**Cyberpunk — `BGM/outro-victory/cyberpunk/`**
> Cyberpunk victory end-credits, soaring synthwave leads over bright darksynth pads and a driving retro pulse, the score settled and the megacorp bleeding, rain clearing off the skyline, gritty electric jubilation, instrumental

**Steampunk — `BGM/outro-victory/steampunk/`**
> Steampunk victory end-credits, soaring Victorian brass and warm strings over bright clockwork percussion, bells and accordion joining, airships rising into sunrise with flags out, grand mechanical celebration, instrumental

**Gothic — `BGM/outro-victory/gothic/`**
> Gothic victory end-credits, warm chamber strings and a noble organ swell around a fragile major theme, bells ringing true over the rooftops, the curse broken and candlelight returned, hard-won radiant relief, instrumental

**Urbanfantasy — `BGM/outro-victory/urbanfantasy/`**
> Urban-fantasy victory end-credits, warm noir-jazz horns and swelling pads over a hopeful trip-hop pulse, dawn over the city with the night's monsters gone, cool glowing celebration, instrumental

**Spaceopera — `BGM/outro-victory/spaceopera/`**
> Space-opera victory end-credits, soaring heroic brass and full romantic strings over bright timpani and choir, the fleet home in dawn light over a saved world, grand galactic jubilation, instrumental

**Pirate — `BGM/outro-victory/pirate/`**
> Pirate victory end-credits, soaring fiddle and accordion over warm naval brass and rolling deck percussion, a shanty turned victory reel, safe harbor with holds full of treasure, salt-sprayed jubilation, instrumental

**Cozy — `BGM/outro-victory/cozy/`**
> Cozy victory end-credits, bright felt piano and warm guitar over light bells and a gentle lo-fi beat, the village festival in full swing after the scare, lanterns and laughter, gentle glowing joy rather than epic fanfare, instrumental

**Eastasian — `BGM/outro-victory/eastasian/`**
> East-Asian victory end-credits, soaring erhu and dizi over bright guzheng and rolling taiko, temple bells across the valley at sunrise, honor restored on the peaks, majestic celebration, instrumental

**Superhero — `BGM/outro-victory/superhero/`**
> Superhero victory end-credits, soaring blockbuster brass and optimistic strings over a bright hybrid pulse and ringing guitar, the anthem at full wingspan, the city cheering at dawn, bold golden celebration, instrumental

**Pulp — `BGM/outro-victory/pulp/`**
> Pulp victory end-credits, soaring serial-fanfare brass and warm adventure strings over bright jungle percussion, the treasure secured and the villain foiled, matinee jubilation, instrumental

### `outro-defeat/` — the party lost, died, or failed

Not the quiet private grief of `somber/` — a full dark requiem with weight
and finality.

**Neutral — `BGM/outro-defeat/`**
> Dark requiem end-credits, heavy low brass and full mourning choir over a slow tolling bell, grave processional strings, the crushing weight of final defeat, vast and shadowed rather than gentle, instrumental

**Fantasy — `BGM/outro-defeat/fantasy/`**
> Dark fantasy requiem end-credits, heavy low brass and full mourning choir over a tolling bell, slow processional strings and war drums at half-mast, a funeral for the world that could have been, vast and shadowed, crushing finality, instrumental

**Scifi — `BGM/outro-defeat/scifi/`**
> Sci-fi defeat end-credits, deep sub drones and cold analog pads over a slow tolling pulse, a dead ship drifting with its running lights off, a mourning signal fading into static, vast and shadowed, instrumental

**Horror — `BGM/outro-defeat/horror/`**
> Horror defeat end-credits, full dark choir and bowed metal over an abyssal drone, a tolling bell and collapsing string clusters, the nightmare won and the dark settling in to stay, vast and terrifying, no jump scares, instrumental

**Noir — `BGM/outro-defeat/noir/`**
> Noir defeat end-credits, heavy muted brass and sparse piano over a funeral pulse, strings dragging like wet coats, the case gone cold for good and the city unbothered, vast shadowed resignation, instrumental

**Modern — `BGM/outro-defeat/modern/`**
> Modern defeat end-credits, heavy hybrid orchestra and dark choir pads over a slow processional pulse, sub swells like distant demolition, the operation failed and the names redacted, vast and shadowed, instrumental

**Western — `BGM/outro-defeat/western/`**
> Western defeat end-credits, doom-laden trumpet and low strings over a funeral-march pulse, a cracked mission bell tolling, fresh graves on the ridge and the town gone quiet, vast frontier mourning, instrumental

**Postapoc — `BGM/outro-defeat/postapoc/`**
> Wasteland defeat end-credits, crushing industrial drones and mourning strings over scrap-metal tolls, the settlement fallen and the fires out, wind taking the rest, vast and shadowed, instrumental

**Cyberpunk — `BGM/outro-defeat/cyberpunk/`**
> Cyberpunk defeat end-credits, crushing darksynth drones and distorted bass over a slow industrial pulse, dead neon flickering on a flooded street, the megacorp won and the city forgets, vast shadowed requiem, instrumental

**Steampunk — `BGM/outro-defeat/steampunk/`**
> Steampunk defeat end-credits, heavy Victorian brass and low organ over grinding slowing clockwork, steam bleeding from a broken engine, the great machine dark and the city cold, vast mechanical mourning, instrumental

**Gothic — `BGM/outro-defeat/gothic/`**
> Gothic defeat end-credits, massive pipe organ and dark choir over a tolling bell and processional strings, every candle in the hall snuffed in turn, the curse complete, vast mournful finality, instrumental

**Urbanfantasy — `BGM/outro-defeat/urbanfantasy/`**
> Urban-fantasy defeat end-credits, heavy dark-electronic drones and mourning noir-brass over a slow trip-hop dirge, the hidden world lost behind a door that will not reopen, the city hums on unknowing, vast and shadowed, instrumental

**Spaceopera — `BGM/outro-defeat/spaceopera/`**
> Space-opera defeat end-credits, massive low brass and full mourning choir over a slow processional pulse, strings falling like burning ships, a fleet scattered among cold stars, vast galactic requiem, instrumental

**Pirate — `BGM/outro-defeat/pirate/`**
> Pirate defeat end-credits, heavy low strings and mourning accordion over a slow naval drum, a ship gone under black water with all hands, the sea keeping what it took, vast salt-dark mourning, instrumental

**Cozy — `BGM/outro-defeat/cozy/`**
> Cozy defeat end-credits, sparse felt piano and hollow wooden flute over a soft mourning drone, the hearth cold and the small world unsaved, tender heartbreak rather than epic doom, quiet finality, instrumental

**Eastasian — `BGM/outro-defeat/eastasian/`**
> East-Asian defeat end-credits, low shakuhachi and mourning erhu over sparse guzheng and a slow taiko toll, a fallen house and banners burned, the mist closing over the pass, vast and shadowed, instrumental

**Superhero — `BGM/outro-defeat/superhero/`**
> Superhero defeat end-credits, heavy blockbuster brass turned funeral-dark and a mourning choir over a slow processional pulse, the skyline broken and the signal unanswered, vast shadowed grief, instrumental

**Pulp — `BGM/outro-defeat/pulp/`**
> Pulp defeat end-credits, heavy muted brass and mourning adventure strings over a slow tomb drum, the expedition lost and the idol still smiling in the dark, vast matinee tragedy, instrumental

### `outro-bittersweet/` — gains paid for in losses

**Neutral — `BGM/outro-bittersweet/`**
> Bittersweet end-credits theme, warm strings and reflective piano with a single wistful solo instrument, a major melody shadowed by minor harmony, gratitude and grief entwined, tender and resolved but aching, instrumental

**Fantasy — `BGM/outro-bittersweet/fantasy/`**
> Bittersweet fantasy end-credits, warm strings and harp with a wistful horn or flute, a major melody under minor shadow, the realm saved and an empty chair at the feast, gratitude and grief entwined, tender and aching, instrumental

**Scifi — `BGM/outro-bittersweet/scifi/`**
> Bittersweet sci-fi end-credits, warm analog pads and a reflective synth lead over a slow pulse, stars receding behind the wake, the mission won and a bunk left made, tender and aching, instrumental

**Horror — `BGM/outro-bittersweet/horror/`**
> Bittersweet horror end-credits, fragile piano over dark drones with one thin major thread, survivors walking out changed and lighter by someone, tender and uneasy, no jump scares, instrumental

**Noir — `BGM/outro-bittersweet/noir/`**
> Bittersweet noir end-credits, warm strings and a wistful muted trumpet over slow brushed drums, the case closed and the drink untouched across the table, tender world-weary ache, instrumental

**Modern — `BGM/outro-bittersweet/modern/`**
> Bittersweet modern end-credits, reflective piano and soft strings over a slow hybrid pulse, the mission done and a chair empty at the debrief, tender and aching, instrumental

**Western — `BGM/outro-bittersweet/western/`**
> Bittersweet western end-credits, warm reverb guitar and a lonesome whistle over soft strings, the town saved and the rider already small on the horizon, tender dusty ache, instrumental

**Postapoc — `BGM/outro-bittersweet/postapoc/`**
> Bittersweet wasteland end-credits, warm dusty guitar and strings over a slow pulse, the settlement standing and new markers by the gate, hope paid for in names, tender grit, instrumental

**Cyberpunk — `BGM/outro-bittersweet/cyberpunk/`**
> Bittersweet cyberpunk end-credits, warm darksynth pads and a wistful synthwave lead over a slow retro pulse, the run paid out and someone's deck never coming back online, neon rain and ache, instrumental

**Steampunk — `BGM/outro-bittersweet/steampunk/`**
> Bittersweet steampunk end-credits, warm Victorian strings and a wistful accordion and music box over a gentle clockwork pulse, the city saved and one workbench forever tidy, tender brass-soft ache, instrumental

**Gothic — `BGM/outro-bittersweet/gothic/`**
> Bittersweet gothic end-credits, warm chamber strings and soft organ with a fragile major theme in minor shadow, the curse lifted at a price the survivors carry, candlelight and loss, tender and mournful, instrumental

**Urbanfantasy — `BGM/outro-bittersweet/urbanfantasy/`**
> Bittersweet urban-fantasy end-credits, warm noir-jazz horns and reflective piano over a slow trip-hop pulse, the night won and the price paid where nobody saw, tender and cool, instrumental

**Spaceopera — `BGM/outro-bittersweet/spaceopera/`**
> Bittersweet space-opera end-credits, warm romantic strings and soft heroic brass with a wistful horn, the galaxy safer and friends among the stars now, grand and aching, instrumental

**Pirate — `BGM/outro-bittersweet/pirate/`**
> Bittersweet pirate end-credits, warm accordion and fiddle over soft strings and slow deck percussion, safe harbor with empty berths at the rail, salt-sprayed gratitude and grief, instrumental

**Cozy — `BGM/outro-bittersweet/cozy/`**
> Bittersweet cozy end-credits, felt piano and fingerpicked guitar over light bells, the village safe and something gentle gone from it, warmth with a quiet ache, tender rather than epic, instrumental

**Eastasian — `BGM/outro-bittersweet/eastasian/`**
> Bittersweet East-Asian end-credits, warm guzheng and a wistful erhu or shakuhachi over soft silk strings, victory in the mist and incense for the fallen, tender serene ache, instrumental

**Superhero — `BGM/outro-bittersweet/superhero/`**
> Bittersweet superhero end-credits, warm blockbuster brass gone soft and reflective piano over string pads, the city saved and the cost of the cape counted, tender and bold, instrumental

**Pulp — `BGM/outro-bittersweet/pulp/`**
> Bittersweet pulp end-credits, warm brass and reflective adventure strings over soft jungle percussion, the treasure found and a companion left beneath the temple, tender matinee ache, instrumental

### `outro-escape/` — survived by fleeing, threat remains

**Neutral — `BGM/outro-escape/`**
> Tense-relief end-credits theme, breathless strings and synths settling over a steady wary pulse, a cautious hopeful lead that keeps glancing over its shoulder, survival without safety, restless resolve, instrumental

**Fantasy — `BGM/outro-escape/fantasy/`**
> Fantasy escape end-credits, breathless strings settling over a wary steady pulse, a cautious horn or flute lead glancing back at the treeline, out of the dark with the dark still hungry, survival without safety, restless resolve, instrumental

**Scifi — `BGM/outro-escape/scifi/`**
> Sci-fi escape end-credits, racing arpeggios cooling into a steady pulse, a cautious synth lead over watchful pads, jump complete with the hunter's signature still on the scope, restless chrome resolve, instrumental

**Horror — `BGM/outro-escape/horror/`**
> Horror escape end-credits, racing strings settling over a held drone, a fragile hopeful thread that never fully relaxes, out alive with the door left open behind, restless trembling relief, no jump scares, instrumental

**Noir — `BGM/outro-escape/noir/`**
> Noir escape end-credits, a sprinting bass easing into wary brushed drums, a cautious muted trumpet checking the mirrors, out of the alley but the town still owns you, restless resolve, instrumental

**Modern — `BGM/outro-escape/modern/`**
> Modern escape end-credits, a taut hybrid pulse settling under cautious piano and strings, extracted with the op blown and the network still live, restless watchful resolve, instrumental

**Western — `BGM/outro-escape/western/`**
> Western escape end-credits, galloping guitar easing to a hard-breathing walk, a cautious whistle and fiddle scanning the ridge, rode clear with the posse still raising dust, restless resolve, instrumental

**Postapoc — `BGM/outro-escape/postapoc/`**
> Wasteland escape end-credits, a junkyard pulse settling under dusty guitar, a cautious resilient lead counting heads, outran the raiders and the wastes keep score, restless resolve, instrumental

**Cyberpunk — `BGM/outro-escape/cyberpunk/`**
> Cyberpunk escape end-credits, industrial techno cooling into a wary darksynth pulse, a cautious synthwave lead under rain static, out of the net with ICE still sweeping, restless neon resolve, instrumental

**Steampunk — `BGM/outro-escape/steampunk/`**
> Steampunk escape end-credits, chase clockwork easing into a steady brass pulse, a cautious accordion and violin lead, the airship clear and the empire's spotters still up, restless resolve, instrumental

**Gothic — `BGM/outro-escape/gothic/`**
> Gothic escape end-credits, racing chamber strings settling over a low organ pulse, a cautious harpsichord theme, out of the manor with the curse following at walking pace, restless mournful resolve, instrumental

**Urbanfantasy — `BGM/outro-escape/urbanfantasy/`**
> Urban-fantasy escape end-credits, trip-hop chase cooling into a dark-electronic pulse, a cautious noir-jazz lead, out of the night with the hidden world still hunting, restless chilled resolve, instrumental

**Spaceopera — `BGM/outro-escape/spaceopera/`**
> Space-opera escape end-credits, racing brass settling into a steady orchestral pulse, a cautious horn theme over watchful strings, jumped clear with the empire still plotting pursuit, restless galactic resolve, instrumental

**Pirate — `BGM/outro-escape/pirate/`**
> Pirate escape end-credits, racing fiddle easing into a wary shanty pulse, a cautious accordion lead watching the horizon, slipped the noose with the navy still under sail, restless salt-sprayed resolve, instrumental

**Cozy — `BGM/outro-escape/cozy/`**
> Cozy escape end-credits, a quick lo-fi scramble settling into soft piano, a cautious wooden-flute lead peeking over the fence, got away from the scare with the worry trotting after, restless but gentle, never grim, instrumental

**Eastasian — `BGM/outro-escape/eastasian/`**
> East-Asian escape end-credits, racing taiko settling into a steady pulse, a cautious shakuhachi or erhu lead, through the pass with the banners still climbing behind, restless resolve, instrumental

**Superhero — `BGM/outro-escape/superhero/`**
> Superhero escape end-credits, racing strings settling into a hybrid pulse, a cautious brass theme over ticking percussion, civilians clear and the villain still standing in the smoke, restless resolve, instrumental

**Pulp — `BGM/outro-escape/pulp/`**
> Pulp escape end-credits, racing brass cooling into wary jungle percussion, a cautious adventure-string lead, out of the tomb with the cult's torches on the ridge, restless matinee resolve, instrumental

### `outro-draw/` — stalemate, neither side prevailed

Not peaceful and not hopeful-calm — restless and unresolved.

**Neutral — `BGM/outro-draw/`**
> Unresolved end-credits theme, a circling motif on strings or piano that never reaches its home chord, harmony drifting between minor and major without settling, a quiet pulse underneath, restless embers of a fight nobody won, weary vigilance rather than peace, instrumental

**Fantasy — `BGM/outro-draw/fantasy/`**
> Unresolved fantasy end-credits, a circling horn and string theme that never finds its home chord, harmony drifting between minor and major, the war paused with both banners still standing, weary vigilance rather than peace, instrumental

**Scifi — `BGM/outro-draw/scifi/`**
> Unresolved sci-fi end-credits, a circling synth motif over a quiet pulse, pads drifting between minor and major without landing, stalemate holding across the void, weary chrome vigilance, instrumental

**Horror — `BGM/outro-draw/horror/`**
> Unresolved horror end-credits, a circling music-box and piano motif over a hollow drone, neither side won and the dark merely waiting, weary vigilance, no jump scares, instrumental

**Noir — `BGM/outro-draw/noir/`**
> Unresolved noir end-credits, a circling muted-trumpet phrase over slow brushed drums, the case open on the desk and the city still dirty, weary vigilance, instrumental

**Modern — `BGM/outro-draw/modern/`**
> Unresolved modern end-credits, a circling piano motif over a quiet hybrid pulse, strings that lean toward resolution and step back, the op ended even and everyone still watching, weary vigilance, instrumental

**Western — `BGM/outro-draw/western/`**
> Unresolved western end-credits, a circling guitar and whistle motif over soft tremolo strings, both gunslingers still breathing and the street still theirs, weary vigilance, instrumental

**Postapoc — `BGM/outro-draw/postapoc/`**
> Unresolved wasteland end-credits, a circling dusty-guitar motif over a quiet scrap pulse, the fight burned out with no winner and the water still contested, weary vigilance, instrumental

**Cyberpunk — `BGM/outro-draw/cyberpunk/`**
> Unresolved cyberpunk end-credits, a circling darksynth motif over a quiet retro pulse, the run ended even with both sides rebuilding, rain that never quite stops, weary neon vigilance, instrumental

**Steampunk — `BGM/outro-draw/steampunk/`**
> Unresolved steampunk end-credits, a circling brass and music-box motif over a quiet clockwork pulse, the great gears stopped mid-turn awaiting the next move, weary vigilance, instrumental

**Gothic — `BGM/outro-draw/gothic/`**
> Unresolved gothic end-credits, a circling harpsichord theme over a low organ breath, the curse neither broken nor complete, candles guarded through the night, weary mournful vigilance, instrumental

**Urbanfantasy — `BGM/outro-draw/urbanfantasy/`**
> Unresolved urban-fantasy end-credits, a circling noir-jazz motif over a quiet trip-hop pulse, the night ended without a winner and the wards left up, weary vigilance, instrumental

**Spaceopera — `BGM/outro-draw/spaceopera/`**
> Unresolved space-opera end-credits, a circling brass theme over quiet strings, the fleet and the foe both withdrawn beyond sensor range, weary galactic vigilance, instrumental

**Pirate — `BGM/outro-draw/pirate/`**
> Unresolved pirate end-credits, a circling fiddle and accordion motif over a quiet sea-swell pulse, neither ship took the prize and both still float, weary salt-worn vigilance, instrumental

**Cozy — `BGM/outro-draw/cozy/`**
> Unresolved cozy end-credits, a circling felt-piano motif over a gentle lo-fi pulse, the quarrel ended without a winner and the fence still crooked, mild restlessness never dread, instrumental

**Eastasian — `BGM/outro-draw/eastasian/`**
> Unresolved East-Asian end-credits, a circling guzheng and erhu motif over a quiet taiko pulse, the duel paused mid-stance in the mist, weary vigilant stillness, instrumental

**Superhero — `BGM/outro-draw/superhero/`**
> Unresolved superhero end-credits, a circling brass motif over quiet strings and a ticking pulse, hero and villain both standing when the dust settles, weary vigilance, instrumental

**Pulp — `BGM/outro-draw/pulp/`**
> Unresolved pulp end-credits, a circling brass motif over quiet jungle percussion, the expedition and the cult both withdrawn to lick wounds, weary matinee vigilance, instrumental

### `outro-cliffhanger/` — deliberately unresolved, "to be continued"

**Neutral — `BGM/outro-cliffhanger/`**
> Ominous cliffhanger end-credits theme, a curious unresolved motif over pulsing low synths and strings and ticking percussion, mystery and anticipation, one last question hanging in the dark, tension that promises more, instrumental

**Fantasy — `BGM/outro-cliffhanger/fantasy/`**
> Fantasy cliffhanger end-credits, a curious unresolved horn and string motif over ticking percussion, harp glints like turning pages, the map's last corner still blank and something moving there, tension that promises more, instrumental

**Scifi — `BGM/outro-cliffhanger/scifi/`**
> Sci-fi cliffhanger end-credits, a curious unresolved synth motif over a pulsing low pad and ticking textures, one signal still repeating on a dead channel, tension that promises more, instrumental

**Horror — `BGM/outro-cliffhanger/horror/`**
> Horror cliffhanger end-credits, a curious unresolved music-box motif over a low drone and ticking pulse, the door left ajar exactly as they found it, tension that promises more, no jump scares, instrumental

**Noir — `BGM/outro-cliffhanger/noir/`**
> Noir cliffhanger end-credits, a curious unresolved muted-trumpet motif over ticking brushed drums, one envelope on the desk still sealed, tension that promises more, instrumental

**Modern — `BGM/outro-cliffhanger/modern/`**
> Modern cliffhanger end-credits, a curious unresolved piano motif over a pulsing hybrid tick, one monitor still scrolling in the empty office, the next op already forming, tension that promises more, instrumental

**Western — `BGM/outro-cliffhanger/western/`**
> Western cliffhanger end-credits, a curious unresolved whistle and guitar motif over a ticking pulse, dust rising on the horizon that is not weather, tension that promises more, instrumental

**Postapoc — `BGM/outro-cliffhanger/postapoc/`**
> Wasteland cliffhanger end-credits, a curious unresolved dusty-guitar motif over a ticking scrap pulse, smoke on the ridge where no camp should be, tension that promises more, instrumental

**Cyberpunk — `BGM/outro-cliffhanger/cyberpunk/`**
> Cyberpunk cliffhanger end-credits, a curious unresolved darksynth motif over a pulsing retro tick, one encrypted file blinking unopened, neon tension that promises more, instrumental

**Steampunk — `BGM/outro-cliffhanger/steampunk/`**
> Steampunk cliffhanger end-credits, a curious unresolved music-box and brass motif over ticking clockwork, a sealed letter in the airship post, tension that promises more, instrumental

**Gothic — `BGM/outro-cliffhanger/gothic/`**
> Gothic cliffhanger end-credits, a curious unresolved harpsichord motif over a low organ pulse and a single far bell, one door in the manor still locked, tension that promises more, instrumental

**Urbanfantasy — `BGM/outro-cliffhanger/urbanfantasy/`**
> Urban-fantasy cliffhanger end-credits, a curious unresolved noir-jazz motif over a trip-hop tick, a new sigil drying on the underpass wall, the city's next secret stirring, tension that promises more, instrumental

**Spaceopera — `BGM/outro-cliffhanger/spaceopera/`**
> Space-opera cliffhanger end-credits, a curious unresolved brass motif over a pulsing orchestral tick, a distress call arriving from a system that should not exist, galactic tension that promises more, instrumental

**Pirate — `BGM/outro-cliffhanger/pirate/`**
> Pirate cliffhanger end-credits, a curious unresolved fiddle motif over a ticking wooden pulse, the half-burned map's missing corner and a sail on the dawn horizon, tension that promises more, instrumental

**Cozy — `BGM/outro-cliffhanger/cozy/`**
> Cozy cliffhanger end-credits, a curious unresolved felt-piano motif over a gentle lo-fi tick, a letter on the table still unopened and the kettle just boiled, bright little anticipation never dread, instrumental

**Eastasian — `BGM/outro-cliffhanger/eastasian/`**
> East-Asian cliffhanger end-credits, a curious unresolved guzheng and shakuhachi motif over a quiet taiko tick, the mist keeping the next path to itself, tension that promises more, instrumental

**Superhero — `BGM/outro-cliffhanger/superhero/`**
> Superhero cliffhanger end-credits, a curious unresolved brass motif over pulsing strings and a ticking hybrid beat, a new silhouette on the skyline at the last frame, tension that promises more, instrumental

**Pulp — `BGM/outro-cliffhanger/pulp/`**
> Pulp cliffhanger end-credits, a curious unresolved brass motif over ticking jungle percussion, the next tomb circled on a stranger's map, matinee tension that promises more, instrumental

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
