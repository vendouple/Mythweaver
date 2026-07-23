#!/usr/bin/env python3
"""One-shot: sort TO_BE_ADDED_VERIFIED into AMBIENCE category basenames."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(r"D:\dev\Github\TableTopRPGAI\public\music\AMBIENCE")
STAGING = ROOT / "TO_BE_ADDED_VERIFIED"

# Only long, steady beds that map cleanly to one engine category.
# Existing weather files (storm/rain/wind/snow/ocean/water/forest) are left alone.
KEEPERS = {
    "fire.mp3": "RPG ｜ D&D Ambience - Burning Field (flames, crows) #fire #flames #ambience [lYsLeQNM9Ik].mp3",
    "swamp.mp3": "RPG ｜ D&D Ambience - HoMM 3： Fortress (swamp, insects, snakes) #ambience #rpg #homm3 [qHYw-dPLcpc].mp3",
    "desert.mp3": "RPG ｜ D&D Ambience - HoMM 3： Stronghold (wind, animals, sand) #ambience #rpg #homm3 [iYMI6a34mVE].mp3",
    "dungeon.mp3": "RPG ｜ D&D Ambience - Undead Crypt (skeletons, zombies, desolation) [QVtwZW7YQik].mp3",
    "tavern.mp3": "RPG ｜ D&D Ambience - Dwarven Mead Hall (drunken crowd, smithing, fire) [QIoNzWHZtlM].mp3",
    "castle.mp3": "HoMM 3 Ambience - HoMM 3： Castle (market, smith, griffins, angels) #ambience #rpg #homm3 [B-vkax5Pb2c].mp3",
    "crowd.mp3": "RPG ｜ D&D Ambience - Disco Elysium： Harbour Protest (crowd, machinery, metal) [hQ24zbRWX0s].mp3",
    "industrial.mp3": "RPG ｜ D&D Ambience - Steampunk Factory (clockwork engines, steam, electricity) #steampunk #factory [KRFLzK0D-7g].mp3",
    "machinery.mp3": "RPG ｜ Shadowrun Ambience - Robot Factory (mechanical sounds, machinery) #shadowrun #rpg #ambience [I5k0yK7AR-M].mp3",
    "laboratory.mp3": "RPG ｜ Sci-fi Ambience - Arctic Research Station (electronics, snowstorm, researchers) [Ag5aQfwDKl8].mp3",
    "spaceship.mp3": "RPG ｜ D&D Ambience - Space Port ⧸ Space Station (spaceships, pneumatic doors, robots, computers) [MT_1a_qTlvU].mp3",
    "western-town.mp3": "RPG ｜ D&D Ambience - Wild West Saloon (crowd, piano, drinking) #bigiron [4j9pXU_Yd2E].mp3",
    "wasteland.mp3": "RPG ｜ D&D Ambience - Frostpunk： Freezing City (snowstorm, crowd, machinery) [jNFIrglmSfU].mp3",
    "battlefield.mp3": "RPG ｜ D&D Ambience - WWI Trenches (rifles, cannons, bombs) #ambience #historical #wwi [n7eqHf0dhcU].mp3",
    "supernatural.mp3": "RPG ｜ D&D Ambience - HoMM 3： Necropolis (silence, crows, spirits) #ambience #rpg #homm3 [OdGh5H9Oh0E].mp3",
}


def main() -> None:
    if not STAGING.is_dir():
        raise SystemExit(f"Staging folder missing: {STAGING}")

    existing = {p.name for p in ROOT.iterdir() if p.is_file()}
    print("Existing root files:", sorted(existing))

    staging_files = {p.name: p for p in STAGING.iterdir() if p.is_file()}
    print(f"Staging count: {len(staging_files)}")

    moved: list[tuple[str, str, int]] = []
    missing_src: list[str] = []
    skipped_exists: list[str] = []

    for dest_name, src_name in KEEPERS.items():
        src = staging_files.get(src_name)
        if src is None:
            missing_src.append(src_name)
            continue
        dest = ROOT / dest_name
        if dest.exists():
            skipped_exists.append(dest_name)
            continue
        # Copy + size-check, then delete source (safer than rename).
        shutil.copy2(src, dest)
        if dest.stat().st_size != src.stat().st_size:
            dest.unlink(missing_ok=True)
            raise SystemExit(f"Size mismatch after copy: {src_name} -> {dest_name}")
        src.unlink()
        moved.append((src_name, dest_name, dest.stat().st_size))
        del staging_files[src_name]

    print("\nMOVED:")
    for src_name, dest_name, size in moved:
        print(f"  {dest_name}  ({size / 1e6:.1f} MB)  <- {src_name[:90]}")
    if missing_src:
        print("\nMISSING SOURCES (not found in staging):")
        for name in missing_src:
            print(" ", name)
    if skipped_exists:
        print("\nSKIPPED (already on disk):", skipped_exists)

    remaining = [p for p in STAGING.iterdir() if p.is_file()]
    print(f"\nDeleting {len(remaining)} remaining staging file(s)...")
    deleted: list[tuple[str, int]] = []
    for path in remaining:
        deleted.append((path.name, path.stat().st_size))
        path.unlink()

    print("DELETED:")
    for name, size in sorted(deleted, key=lambda item: item[0].lower()):
        print(f"  ({size / 1e6:.1f} MB) {name}")

    leftovers = list(STAGING.iterdir())
    if not leftovers:
        STAGING.rmdir()
        print("\nRemoved empty TO_BE_ADDED_VERIFIED/")
    else:
        print("\nStaging still has:", [p.name for p in leftovers])

    print("\nFINAL AMBIENCE ROOT:")
    for path in sorted(ROOT.iterdir(), key=lambda p: p.name.lower()):
        if path.is_file():
            print(f"  {path.name}  {path.stat().st_size / 1e6:.1f} MB")
        else:
            print(f"  {path.name}/")


if __name__ == "__main__":
    main()
