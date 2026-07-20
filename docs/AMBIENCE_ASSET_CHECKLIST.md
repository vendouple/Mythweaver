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

## Weather and nature

- [ ] `storm.mp3` - Continuous distant thunder, heavy weather, and wind; avoid frequent close lightning cracks.
- [ ] `rain.mp3` - Steady rainfall with a consistent intensity.
- [ ] `wind.mp3` - Sustained natural wind with gentle gust variation.
- [ ] `snow.mp3` - Muted winter wind and soft frozen-environment texture.
- [ ] `ocean.mp3` - Repeating shore waves or open-sea movement.
- [ ] `water.mp3` - Flowing river, stream, sewer, or waterfall bed.
- [ ] `forest.mp3` - Leaves, distant wildlife, and woodland air.
- [ ] `swamp.mp3` - Wet marsh movement, frogs, and low insect texture.
- [ ] `desert.mp3` - Dry wind, shifting sand, and sparse open-space texture.
- [ ] `insects.mp3` - Crickets, cicadas, or night insects without prominent birds.
- [ ] `birds.mp3` - General birdsong suitable for forests, villages, and outdoor scenes.
- [ ] `fire.mp3` - Steady campfire, hearth, or burning wood crackle.

## Fantasy and historical places

- [ ] `cave.mp3` - Water drips, distant air, and resonant underground space.
- [ ] `dungeon.mp3` - Damp stone room tone, chains, drips, and distant structural creaks.
- [ ] `tavern.mp3` - Low indistinct patrons, mugs, chairs, and hearth texture; no intelligible speech.
- [ ] `village.mp3` - Distant market activity, carts, livestock, and light outdoor work.
- [ ] `castle.mp3` - Large stone interior, distant footsteps, banners, and subtle hall movement.

## Modern places

- [ ] `city.mp3` - General urban street bed with distant vehicles and building noise.
- [ ] `traffic.mp3` - Continuous roadway movement without horns dominating the loop.
- [ ] `crowd.mp3` - Indistinct public crowd murmur with no intelligible words.
- [ ] `office.mp3` - Quiet workplace HVAC, keyboards, printers, and distant movement.
- [ ] `industrial.mp3` - Factory or warehouse room tone with broad mechanical activity.
- [ ] `machinery.mp3` - Repeating engines, gears, hydraulics, or generator operation.
- [ ] `electrical.mp3` - Transformer hum, server electronics, and occasional subtle relay texture.
- [ ] `ventilation.mp3` - Stable fan, air duct, or HVAC noise.
- [ ] `laboratory.mp3` - Clean-room hum, monitors, pumps, and restrained equipment tones.

## Science fiction and genre settings

- [ ] `spaceship.mp3` - Starship engine hum, ventilation, and subtle console activity.
- [ ] `western-town.mp3` - Dusty street wind, hitching posts, distant horses, and saloon bleed.
- [ ] `wasteland.mp3` - Exposed wind, loose metal, and distant ruined machinery.
- [ ] `battlefield.mp3` - Distant combat, artillery, and debris; keep foreground shots sparse enough to loop.
- [ ] `supernatural.mp3` - Low spectral drone, faint whispers, or occult resonance without a melody.

## Suggested priority

For broad coverage, add these first:

1. `rain.mp3`
2. `forest.mp3`
3. `tavern.mp3`
4. `wind.mp3`
5. `cave.mp3`
6. `city.mp3`
7. `fire.mp3`
8. `dungeon.mp3`
9. `spaceship.mp3`
10. `supernatural.mp3`

The engine chooses up to two compatible files from the scene description, or
uses ambience categories explicitly selected by the Dungeon Master. Missing
files are skipped without interrupting the music or story.
