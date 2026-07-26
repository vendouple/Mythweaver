import os
import glob
import torch
import torchaudio as ta
from pathlib import Path
from chatterbox.tts import ChatterboxTTS

# 1. Directory Configuration
VOICES_DIR = Path("voices")
OUTPUT_DIR = Path("output")
AUDIO_EXTENSIONS = ("*.mp3", "*.wav", "*.flac", "*.ogg")

# Ensure directories exist
VOICES_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Scan voices/ folder for valid audio files
valid_voices = []
for ext in AUDIO_EXTENSIONS:
    valid_voices.extend(VOICES_DIR.glob(ext))

if not valid_voices:
    raise FileNotFoundError(
        f"No audio files found in '{VOICES_DIR.resolve()}'. "
        "Please add .mp3 or .wav reference files to the /voices folder."
    )

# 2. D&D Test Suite
TEST_SUITE = [
    # ==========================================
    # CATEGORY A: STANDARD NARRATION & WORLD-BUILDING
    # ==========================================
    {
        "filename": "A1_fantasy_exploration_long.wav",
        "category": "Standard Narration",
        "genre": "Fantasy World-Building",
        "text": (
            "Steve spent eleven years as a Sanguine Grid infrastructure maintenance technician — "
            "a civilian contractor for Hames Lili's Department of Municipal Utilities. "
            "His Saboteur's Eye reads the trunk like an open page: stamped serial plates reading ATR-PRIM-9C-001. "
            "His margin note, three years old in faded red ink, reads: DO NOT ENTER. Lock type unknown. "
            "But it isn't unknown anymore. Three feet from the base, the dark metal is wrapped in rune-carved bands."
        ),
        "exaggeration": 0.5,
        "cfg_weight": 0.5
    },
    {
        "filename": "A2_tavern_lore_exposition.wav",
        "category": "Standard Narration",
        "genre": "Tavern Exposition / Dialogue",
        "text": (
            "The innkeeper wipes down the stained mahogany counter with a threadbare rag, "
            "glancing toward the heavy oak door as the blizzard outside howls against the shutters. "
            "'Listen closely, traveler,' he mutters under his breath. 'If you're truly heading north past the ridge, "
            "you'd best carry iron. The silver-miners didn't abandon those tunnels because of bad ore... "
            "they abandoned them because of what was waking up beneath the bedrock.'"
        ),
        "exaggeration": 0.55,
        "cfg_weight": 0.45
    },

    # ==========================================
    # CATEGORY B: SUSPENSE, GOTHIC HORROR & TENSION
    # ==========================================
    {
        "filename": "B1_gothic_horror_suspense.wav",
        "category": "Gothic & Horror",
        "genre": "Ruined Cathedral / Slow Tension",
        "text": (
            "Shadows stretch long across the ruined cathedral floor, flickering beneath the dying torchlight. "
            "Something moves in the darkness above you... shifting softly amongst the rafters, "
            "breathing with a slow, wet rhythm, waiting for you to take just one more step into the altar's circle."
        ),
        "exaggeration": 0.75,
        "cfg_weight": 0.3
    },

    # ==========================================
    # CATEGORY C: COMBAT & HIGH-ACTION ENCOUNTERS
    # ==========================================
    {
        "filename": "C1_boss_encounter_dragon.wav",
        "category": "Combat & High-Action",
        "genre": "Boss Encounter / Dragon Battle",
        "text": (
            "The dragon rears back, its chest cavern glowing with a violent, incandescent flame! "
            "'Insolent mortals!' it roars, slamming its massive tail into the ancient stone pillars, "
            "sending a rain of crushed marble down upon the battlefield as the air ignites!"
        ),
        "exaggeration": 0.9,
        "cfg_weight": 0.65
    },

    # ==========================================
    # CATEGORY D: SCI-FI, TACTICAL & CYBERPUNK
    # ==========================================
    {
        "filename": "D1_cyberpunk_tactical.wav",
        "category": "Sci-Fi & Tactical",
        "genre": "Cyberpunk Operator / Controlled Pitch",
        "text": (
            "Comm-link active. Sector 4 grid security has gone dark. Auxiliary power is routing through "
            "sub-level conduits, but signal noise indicates secondary override protocols in progress. "
            "Maintain radio silence, sync your optics, and await my mark."
        ),
        "exaggeration": 0.35,
        "cfg_weight": 0.45
    }
]

# 3. Pre-check missing files across voices
pending_jobs = []

for voice_path in valid_voices:
    voice_tag = voice_path.stem.replace("voice_preview_", "")
    voice_output_dir = OUTPUT_DIR / voice_tag
    voice_output_dir.mkdir(parents=True, exist_ok=True)

    for sample in TEST_SUITE:
        target_file = voice_output_dir / sample["filename"]
        if not target_file.exists():
            pending_jobs.append({
                "voice_path": voice_path,
                "voice_tag": voice_tag,
                "target_file": target_file,
                "sample": sample
            })

# 4. Initialize Device & Model ONLY if work is required
if not pending_jobs:
    print("\n" + "="*60)
    print(" ALL VOICES & SAMPLES ALREADY EXIST! SKIPPING GENERATION. ")
    print("="*60 + "\n")
    exit(0)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading Chatterbox 500M on [{device.upper()}]...")
model = ChatterboxTTS.from_pretrained(device=device)

# 5. Execution Loop for Pending Generations
print("\n" + "="*60)
print(f" PROCESSING {len(pending_jobs)} NEW/MISSING GENERATION TASK(S) ")
print("="*60 + "\n")

current_voice = None
for idx, job in enumerate(pending_jobs, 1):
    voice_tag = job["voice_tag"]
    voice_path = job["voice_path"]
    target_file = job["target_file"]
    sample = job["sample"]

    if current_voice != voice_tag:
        current_voice = voice_tag
        print(f"\n>>> VOICE: [{voice_path.name}] -> Target: {OUTPUT_DIR / voice_tag}/")
        print("-" * 60)

    print(f"[{idx}/{len(pending_jobs)}] Generating [{sample['category']}] -> {target_file.name}")

    wav = model.generate(
        text=sample["text"],
        audio_prompt_path=str(voice_path),
        exaggeration=sample["exaggeration"],
        cfg_weight=sample["cfg_weight"]
    )
    
    ta.save(str(target_file), wav, model.sr)

print("\n" + "="*60)
print("ALL DONE! New voice samples updated in /output.")
print("="*60)