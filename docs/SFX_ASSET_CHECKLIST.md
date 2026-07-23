# Mythweaver SFX Asset Checklist

Mythweaver looks for one-shot sound files in `public/music/SFX/`. The filename
must match the cue name exactly, such as `door-creak.mp3` for the
`door-creak` cue. MP3 is recommended, although the audio manifest also accepts
other browser-supported formats such as OGG, M4A, and WAV.

Keep these effects short, dry, and free of music so they can sit over the BGM
and ambience. Avoid long silent starts or tails.

## Already added

- [x] `beat.mp3` - Soft story-beat or page-turn transition.
- [x] `heartbeat.mp3` - Double heartbeat for fear and danger moments.
- [x] `rumble.mp3` - Deep impact or environmental shake.

## UI and lobby sounds

These currently have synthesized Web Audio fallbacks, but recorded versions
can be added later for a more polished and consistent sound.

- [x] `tap.mp3` - Light, unobtrusive interface tap.
- [x] `confirm.mp3` - Warm two-note confirmation.
- [x] `send.mp3` - Quick magical or energetic dispatch whoosh.
- [x] `join.mp3` - Welcoming three-note flourish when a player joins.

## Cinematic stage effects

`flash` and `darkness` currently have synthesized fallbacks. The other missing
stage cues remain silent until a matching file is added.

- [x] `flash.mp3` - Bright magical burst, camera flash, or lightning snap.
- [ ] `darkness.mp3` - Descending shadow swell or ominous low whoosh.

## Doors and entrances

- [ ] `door-creak.mp3` - Slow wooden hinge creak.
- [ ] `door-open.mp3` - General door latch and opening movement.
- [ ] `door-close.mp3` - General door closing with a firm latch.
- [ ] `knock.mp3` - Two or three clear knocks on wood.
- [ ] `airlock-open.mp3` - Pneumatic seal release and mechanical slide.
- [ ] `airlock-close.mp3` - Mechanical slide followed by a pressure seal.

## Technology and alerts

- [ ] `code-beep.mp3` - Short keypad input tone.
- [ ] `code-success.mp3` - Clean ascending access-granted chime.
- [ ] `code-denied.mp3` - Harsh descending rejection buzz.
- [ ] `alarm.mp3` - Short repeating warning alarm.
- [ ] `siren.mp3` - Urgent emergency siren burst.
- [ ] `radio-static.mp3` - Brief radio crackle or transmission breakup.
- [ ] `power-up.mp3` - Rising electrical or reactor startup swell.
- [ ] `power-down.mp3` - Falling shutdown tone with a fading hum.

## Combat and destruction

- [ ] `explosion.mp3` - Cinematic blast with a short low-end tail.
- [ ] `gunshot.mp3` - Punchy single gunshot without a long echo.
- [ ] `laser.mp3` - Fast sci-fi energy shot.
- [ ] `impact.mp3` - General heavy hit for collisions and blows.
- [ ] `debris.mp3` - Falling stones, rubble, or scattered wreckage.
- [ ] `glass-break.mp3` - Sharp window or bottle shatter.
- [ ] `sword.mp3` - Fast blade swing or metal clash.
- [ ] `arrow.mp3` - Bow release followed by a quick arrow pass.
- [ ] `shield.mp3` - Solid metal or wooden shield block.

## Movement and creatures

- [ ] `footsteps.mp3` - Short neutral sequence of approaching footsteps.
- [ ] `horse.mp3` - Brief hoofbeats or a horse snort and step.
- [ ] `creature-roar.mp3` - Genre-neutral monster roar with no recognizable animal call.
- [ ] `whisper.mp3` - Indistinct supernatural whisper with no intelligible words.

## Weather and elements

- [ ] `thunder.mp3` - Strong thunder crack with a compact rumble.
- [ ] `fire-burst.mp3` - Sudden ignition or magical flame burst.
- [ ] `splash.mp3` - Medium water impact.
- [ ] `wind-gust.mp3` - Fast gust or air displacement whoosh.

## Magic and the supernatural

- [ ] `magic.mp3` - General magical shimmer or spell release.
- [ ] `portal.mp3` - Dimensional tear, resonant opening, or teleport swell.
- [ ] `spell-fail.mp3` - Unstable magical sputter and collapse.
- [ ] `heal.mp3` - Gentle restorative shimmer with a soft resolution.

## Traps, locks, and items

- [ ] `trap.mp3` - Mechanical trigger followed by a quick snap.
- [ ] `lock-click.mp3` - Precise lock, latch, or mechanism click.
- [ ] `coin.mp3` - A few coins landing on a hard surface.
- [ ] `item-pickup.mp3` - Small rewarding inventory pickup chime.

## Suggested priority

For the broadest storytelling coverage, add these first:

1. `impact.mp3`
2. `door-creak.mp3`
3. `magic.mp3`
4. `explosion.mp3`
5. `thunder.mp3`
6. `footsteps.mp3`
7. `sword.mp3`
8. `portal.mp3`
9. `creature-roar.mp3`
10. `item-pickup.mp3`

After adding files, use the host debug showcase's **SFX cues** controls to
audition each cue against the app's normal music and ambience levels.
