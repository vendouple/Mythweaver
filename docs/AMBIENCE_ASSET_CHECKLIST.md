# Mythweaver Ambience Asset Checklist

Add ambience beds directly to `public/music/AMBIENCE/`. Do not create a
folder for each sound. The filename identifies the category used by the app:

```text
public/music/AMBIENCE/
  rain.mp3
  forest.mp3
  tavern.mp3
```

MP3 is recommended, although OGG, M4A, and WAV are also indexed. Each file is
looped continuously and may be layered with one other ambience file. Use long,
steady recordings with no music, speech, sudden loud events, silent intro, or
fade-out. A clean loop or a naturally consistent bed will work best.

Status below is from disk after sorting
`public/music/AMBIENCE/TO_BE_ADDED_VERIFIED/` (2026-07-23). Checked items
exist as `public/music/AMBIENCE/<category>.mp3`. Unchecked items are still
missing — do not treat them as complete.

## Weather and nature

- [x] `storm.mp3` - Continuous distant thunder, heavy weather, and wind; avoid frequent close lightning cracks.
- [x] `rain.mp3` - Steady rainfall with a consistent intensity.
- [x] `wind.mp3` - Sustained natural wind with gentle gust variation.
- [x] `snow.mp3` - Muted winter wind and soft frozen-environment texture.
- [x] `ocean.mp3` - Repeating shore waves or open-sea movement.
- [x] `water.mp3` - Flowing river, stream, sewer, or waterfall bed.
- [x] `forest.mp3` - Leaves, distant wildlife, and woodland air.
- [x] `swamp.mp3` - Wet marsh movement, frogs, and low insect texture. *(from HoMM3 Fortress)*
  - **Mixing note:** Minimal-insect swamp beds are rare; most swamp sources are
    insect-heavy, not sparse. Do **not** layer `swamp` + `insects` unless the
    scene wants a thick bug chorus — the swamp bed usually already has insects.
    Prefer `swamp` alone (or with `water` / `rain`) for a quieter marsh.
- [x] `desert.mp3` - Dry wind, shifting sand, and sparse open-space texture. *(from HoMM3 Stronghold)*
- [ ] `insects.mp3` - Crickets, cicadas, or night insects without prominent birds.
- [ ] `birds.mp3` - General birdsong suitable for forests, villages, and outdoor scenes.
- [x] `fire.mp3` - Steady campfire, hearth, or burning wood crackle. *(from Burning Field — fire-forward bed)*
- [x] `underwater.mp3` - Submerged / deep-water bed for underwater scenes. *(from Sea Beasts; wired in code)*

## Fantasy and historical places

- [x] `cave.mp3` - Water drips, distant air, and resonant underground space. *(from Volcanic Cavern)*
- [x] `dungeon.mp3` - Damp stone room tone, chains, drips, and distant structural creaks. *(from Undead Crypt)*
- [x] `tavern.mp3` - Low indistinct patrons, mugs, chairs, and hearth texture; no intelligible speech. *(from Dwarven Mead Hall full file)*
- [x] `village.mp3` - Distant market activity, carts, livestock, and light outdoor work. *(from Goblin Market)*
- [x] `castle.mp3` - Large stone interior, distant footsteps, banners, and subtle hall movement. *(from HoMM3 Castle)*

## Modern places

- [x] `city.mp3` - General urban street bed with distant vehicles and building noise. *(from Harbour Protest)*
- [ ] `traffic.mp3` - Continuous roadway movement without horns dominating the loop.
- [ ] `crowd.mp3` - Indistinct public crowd murmur with no intelligible words.
- [ ] `office.mp3` - Quiet workplace HVAC, keyboards, printers, and distant movement.
- [x] `industrial.mp3` - Factory or warehouse room tone with broad mechanical activity. *(from Steampunk Factory)*
- [x] `machinery.mp3` - Repeating engines, gears, hydraulics, or generator operation. *(from Robot Factory)*
- [ ] `electrical.mp3` - Transformer hum, server electronics, and occasional subtle relay texture.
- [ ] `ventilation.mp3` - Stable fan, air duct, or HVAC noise.
- [x] `laboratory.mp3` - Clean-room hum, monitors, pumps, and restrained equipment tones. *(from Arctic Research Station)*

## Science fiction and genre settings

- [x] `spaceship.mp3` - Starship engine hum, ventilation, and subtle console activity. *(from Space Port / Station)*
- [x] `western-town.mp3` - Dusty street wind, hitching posts, distant horses, and saloon bleed. *(from Wild West Saloon)*
- [x] `wasteland.mp3` - Exposed wind, loose metal, and distant ruined machinery. *(from Frostpunk Freezing City)*
- [x] `battlefield.mp3` - Distant combat, artillery, and debris; keep foreground shots sparse enough to loop. *(from WWI Trenches)*
- [x] `supernatural.mp3` - Low spectral drone, faint whispers, or occult resonance without a melody. *(from HoMM3 Necropolis)*

## Optional / not stocked

These remain missing. Do not mark complete until a real file is on disk.

- [ ] `computer-hums.mp3` - Computer / server room hum, HDD click, PSU high-frequency tone.
- [ ] `computer-beeping.mp3` - Terminal / hacking beeps (more exaggerated than `electrical`).

## Still missing (priority)

1. `insects.mp3`
2. `birds.mp3`
3. `traffic.mp3`
4. `crowd.mp3`
5. `office.mp3`
6. `electrical.mp3`
7. `ventilation.mp3`
8. `computer-hums.mp3` / `computer-beeping.mp3` (optional until wired)

## Rejected from staging (deleted, not kept)

Combat set-pieces, novelty one-offs, music-heavy beds, incomplete stubs, and
near-duplicates were removed from `TO_BE_ADDED_VERIFIED` after keepers were
moved. Examples of rejects: lightsaber fight, western shootout, forest ambush,
storm battle, air raid, cannibal camp, sleeping giant, mind flayer, chaos-god
beds, incomplete ~1 MB stubs, and second copies of already-chosen categories.

The engine chooses up to two compatible files from the scene description, or
uses ambience categories explicitly selected by the Dungeon Master. Missing
files are skipped without interrupting the music or story.
