import type { Campaign } from "./types";

/**
 * The score's *instrumentation* flavor, chosen once per campaign from its
 * genre. It biases which music shelf plays: a "modern" campaign prefers
 * BGM/<mood>/modern/, a "fantasy" one BGM/<mood>/fantasy/, and so on. If a
 * themed shelf is empty the engine falls back to the neutral mood root, so
 * a theme never has to be fully stocked to be safe to set.
 *
 * The AI DM never touches this — it only ever picks *moods* (calm, tense,
 * battle…). The theme is orthogonal and fixed at campaign start.
 */
export type MusicTheme =
  | "fantasy"
  | "scifi"
  | "horror"
  | "noir"
  | "modern"
  | "western"
  | "postapoc"
  | "cyberpunk"
  | "spaceopera"
  | "gothic"
  | "urbanfantasy"
  | "steampunk"
  | "pirate"
  | "eastasian"
  | "superhero"
  | "pulp"
  | "cozy";

export const MUSIC_THEMES: MusicTheme[] = [
  "fantasy", "scifi", "horror", "noir", "modern", "western", "postapoc",
  "cyberpunk", "spaceopera", "gothic", "urbanfantasy", "steampunk",
  "pirate", "eastasian", "superhero", "pulp", "cozy"
];

/**
 * The one canonical description of the shelves for the AI DM. Three separate
 * prompts used to carry their own hand-written summary of the theme list, so
 * adding a genre meant remembering all three — and they had already drifted
 * apart. They all read this now.
 *
 * The "prefer the most specific shelf" instruction matters as much as the
 * definitions: several shelves are sub-genres of the broad four, and a model
 * left to itself will reach for the familiar umbrella term (calling a
 * neon-megacity run "scifi") every time.
 */
export const THEME_GUIDE = [
  "ALWAYS PREFER THE MOST SPECIFIC SHELF that fits; the broad shelves (fantasy, scifi, horror, modern) are fallbacks for when nothing narrower matches.",
  "fantasy = magic, dragons, wizards, medieval kingdoms.",
  "urbanfantasy = magic hidden in the MODERN world (fae courts, occult detectives, wizards with cell phones).",
  "eastasian = wuxia/xianxia cultivation, samurai, shinobi, yokai, dynastic courts.",
  "scifi = general future tech, aliens, exploration, colonies.",
  "cyberpunk = megacorps, netrunners, implants, neon dystopia, low-life-high-tech.",
  "spaceopera = galactic empires, grand fleets, star knights, interstellar war.",
  "steampunk = clockwork, brass, airships, aether, neo-Victorian industry.",
  "pulp = 1930s serial adventure, lost temples, biplanes, relic hunting, two-fisted derring-do.",
  "horror = visceral dread, cosmic terror, monsters, cults, madness.",
  "gothic = crumbling manors, vampires, aristocratic decay, cathedrals, romantic dread.",
  "noir = detectives, 1920s-40s, mobsters, speakeasies, murder mysteries.",
  "modern = spies, black ops, contemporary thrillers.",
  "superhero = capes, secret identities, supervillains, saving the city.",
  "western = cowboys, frontier, saloons, gunslingers.",
  "pirate = high seas, galleons, buccaneers, plunder, naval battles.",
  "postapoc = wasteland, fallout, raiders, ruined cities.",
  "cozy = slice-of-life, low stakes, small towns, bakeries, farming, friendship, no combat.",
  "Disambiguation: a Victorian haunted MANSION is gothic, visceral body-horror is horror; a neon megacity run is cyberpunk NOT scifi; a galactic fleet war is spaceopera NOT scifi; a wizard detective in a modern city is urbanfantasy NOT fantasy.",
  "When in doubt, ask: what shelf of music would a film score for this story sit on? Match the THREAT and TONE, not the era or surface props."
].join(" ");

/**
 * Classification SPECIFICITY. Several of the newer shelves are sub-genres of
 * the originals — cyberpunk and spaceopera both live under scifi's umbrella,
 * gothic under horror's, urbanfantasy under fantasy's — and their keywords
 * inevitably co-occur with the parent's ("a cyberpunk megacity" hits both
 * cyberpunk and scifi). Scoring by raw keyword count alone would let the
 * broader shelf win simply because it owns more generic words, and every
 * cyberpunk campaign would score as plain scifi.
 *
 * So each theme's hit count is multiplied by its specificity: a narrow shelf
 * needs fewer signals to claim a campaign, and a broad one only wins when it
 * is clearly the better read. This is a tiebreaker, not an override — three
 * unambiguous scifi hits still beat one incidental cyberpunk word.
 */
const THEME_SPECIFICITY: Record<MusicTheme, number> = {
  // Broad umbrellas — the fallback when nothing narrower fits.
  fantasy: 1,
  scifi: 1,
  horror: 1,
  modern: 1,
  // Distinct but wide-ranging.
  noir: 1.15,
  western: 1.15,
  postapoc: 1.15,
  pulp: 1.2,
  cozy: 1.2,
  // Sharply defined sub-genres: a couple of hits is a strong signal.
  spaceopera: 1.35,
  gothic: 1.35,
  urbanfantasy: 1.35,
  eastasian: 1.35,
  superhero: 1.4,
  steampunk: 1.45,
  pirate: 1.45,
  cyberpunk: 1.5
};

/** Whole-word-ish keyword signals per theme (matched case-insensitively). */
const THEME_KEYWORDS: Record<MusicTheme, string[]> = {
  fantasy: [
    "fantasy", "dragon", "wizard", "sorcer", "mage", "magic", "spell", "sword", "elf", "elves",
    "dwarf", "orc", "goblin", "kingdom", "castle", "dungeon", "knight", "rune", "tavern",
    "medieval", "enchant", "wyvern", "necromanc", "paladin", "druid", "arcane", "realm", "quest"
  ],
  // Note: "cyber*" words moved to the cyberpunk shelf and the grand-fleet
  // vocabulary to spaceopera — scifi keeps the general-purpose future.
  scifi: [
    "sci-fi", "scifi", "science fiction", "spaceship", "starship", "spacecraft", "alien",
    "robot", "android", "laser", "plasma", "planet", "orbital", "orbit", "mech",
    "warp", "hyperspace", "space station", "nanite", "quantum", "colony", "hologram",
    "futuristic", "terraform", "ai core", "research vessel", "xenobiolog", "airlock",
    "cryosleep", "faster-than-light", "exoplanet", "spacesuit", "derelict ship"
  ],
  // "gothic", "vampire" and the crumbling-manor vocabulary moved to the
  // gothic shelf; horror keeps visceral dread and cosmic terror.
  horror: [
    "horror", "haunted", "haunting", "ghost", "undead", "zombie", "demon", "demonic", "eldritch",
    "cursed", "curse", "nightmare", "occult", "monster", "creature", "cult", "possess", "decay",
    "cosmic dread", "lovecraft", "werewolf", "abomination", "flesh", "asylum", "grave",
    "terror", "supernatural", "paranormal", "eerie", "phantom", "apparition", "poltergeist",
    "sinister", "ominous", "dread", "malevolent", "macabre", "creepy", "unsettling", "vanish",
    "vanished", "breathing walls", "breathed", "rearranged", "spectral", "wraith", "ghoul",
    "possessed", "menace", "foreboding", "dreadful", "slaughter", "viscera", "butcher",
    "screaming", "writhing", "unspeakable", "madness", "sanity"
  ],
  noir: [
    "noir", "detective", "private eye", "gumshoe", "hardboiled", "hard-boiled", "femme fatale",
    "precinct", "informant", "1920s", "1930s", "1940s", "prohibition", "mobster", "speakeasy",
    "whodunit", "murder mystery", "smoke-filled", "trench coat", "rain-slick"
  ],
  modern: [
    "spy", "espionage", "secret agent", "agency", "handler", "operative", "surveillance",
    "thriller", "terrorist", "heist", "conspiracy", "assassin", "sniper",
    "black ops", "special forces", "cartel", "smuggl", "encrypted", "wiretap", "cia", "fbi",
    "interpol", "contemporary", "present-day", "modern day", "extraction", "safehouse",
    "dead drop", "burner phone", "embassy", "military", "helicopter"
  ],
  western: [
    "western", "wild west", "frontier", "cowboy", "saloon", "sheriff", "outlaw", "gunslinger",
    "revolver", "six-shooter", "stagecoach", "ranch", "cattle", "prairie", "bounty hunter",
    "gold rush", "homestead", "desperado"
  ],
  postapoc: [
    "post-apocal", "postapocal", "post apocal", "apocalypse", "apocalyptic", "wasteland",
    "nuclear", "fallout", "radiation", "radioactive", "irradiated", "mutant", "raider",
    "scaveng", "bunker", "vault dweller", "geiger", "after the bomb", "end of the world",
    "ruined city", "collapsed civilization", "last survivors", "dust-choked", "warband",
    "settlement", "the wastes", "overgrown ruins", "old world", "rustpunk", "dieselpunk"
  ],
  cyberpunk: [
    "cyberpunk", "cyber", "cybernetic", "cyberspace", "cyberware", "netrunner", "netrun",
    "megacorp", "mega-corp", "corporate arcology", "arcology", "chrome", "chromed",
    "neon", "neon-lit", "neon-drenched", "sprawl", "the sprawl", "black ice", "ice breaker",
    "implant", "neural implant", "neural interface", "neural lace", "wetware", "datajack",
    "braindance", "deck", "console cowboy", "street samurai", "fixer", "ripperdoc",
    "synthetic", "biotech", "gene-mod", "augment", "augmented", "cyborg", "hacker",
    "hacking", "darknet", "dark net", "data heist", "data haven", "zaibatsu", "night city",
    "acid rain", "holo-ad", "synthwave", "dystopia", "dystopian", "corporate dystopia",
    "low life high tech", "gig economy", "eviction", "slum tower", "vat-grown"
  ],
  spaceopera: [
    "space opera", "spaceopera", "galactic empire", "galactic", "galaxy", "star empire",
    "imperium", "the republic", "senate", "core worlds", "outer rim", "sector fleet",
    "armada", "battlecruiser", "dreadnought", "flagship", "starfleet", "star fleet",
    "capital ship", "fleet admiral", "grand admiral", "jump gate", "hyperlane",
    "hyperdrive", "wormhole", "star system", "systems", "space marine", "star knight",
    "psionic", "psionics", "the void between stars", "interstellar", "galactic war",
    "rebellion", "insurgency", "throne world", "space", "star cluster", "alien empire",
    "xeno", "diplomatic envoy", "trade federation", "smuggler's run", "bounty",
    "ancient precursor", "precursor", "monolith", "ringworld", "dyson"
  ],
  gothic: [
    "gothic", "gothic horror", "vampire", "vampiric", "nosferatu", "count", "countess",
    "castle", "crumbling manor", "manor", "manse", "estate", "ancestral", "bloodline",
    "crypt", "catacomb", "mausoleum", "sepulchre", "sepulcher", "cathedral", "chapel",
    "belfry", "candelabra", "gargoyle", "moor", "moors", "fog-shrouded", "mist-shrouded",
    "carriage", "victorian", "regency", "aristocrat", "aristocracy", "decadent",
    "melancholy", "romantic dread", "corsets", "widow", "mourning", "lament",
    "black veil", "portrait gallery", "forbidden wing", "family curse", "lycanthrop",
    "revenant", "the old country", "carpathian", "transylvan", "wuthering", "brontë"
  ],
  urbanfantasy: [
    "urban fantasy", "urbanfantasy", "modern magic", "secret world", "hidden world",
    "masquerade", "the veil", "veiled world", "fae", "fae court", "faerie", "faery",
    "changeling", "seelie", "unseelie", "glamour", "warlock", "witch", "coven",
    "hedge witch", "wizard detective", "arcane underworld", "magical underground",
    "ley line", "ley lines", "sigil", "ward", "warded", "banish", "exorcis",
    "supernatural community", "shifter", "shapeshifter", "pack", "vampire court",
    "bounty on a demon", "occult detective", "paranormal investigator",
    "downtown", "city streets", "bar", "diner", "subway", "back alley", "precinct",
    "dresden", "urban legend", "cell phone", "apartment"
  ],
  steampunk: [
    "steampunk", "steam-powered", "steam power", "clockwork", "clockwork automaton",
    "automaton", "brass", "brass fittings", "cog", "cogs", "gears", "gearwork",
    "airship", "dirigible", "zeppelin", "aether", "aetheric", "boiler", "pressure gauge",
    "pneumatic", "pneumatic tube", "goggles", "tinker", "tinkerer", "artificer",
    "engineer's guild", "difference engine", "analytical engine", "telegraph",
    "industrial revolution", "smokestack", "soot", "coal", "furnace", "rivets",
    "victoriana", "neo-victorian", "gaslamp", "gaslight", "steam carriage",
    "monowheel", "prosthetic arm", "wind-up", "escapement", "chronometer"
  ],
  pirate: [
    "pirate", "pirates", "piracy", "buccaneer", "privateer", "corsair", "freebooter",
    "swashbuckl", "high seas", "the seven seas", "galleon", "schooner", "brigantine",
    "frigate", "sloop", "man-o-war", "flagship of the fleet", "captain", "first mate",
    "quartermaster", "bosun", "crow's nest", "mainmast", "rigging", "broadside",
    "cannon", "cannons", "grapeshot", "cutlass", "flintlock", "jolly roger",
    "black flag", "letters of marque", "treasure map", "buried treasure", "doubloon",
    "pieces of eight", "plunder", "booty", "mutiny", "keelhaul", "walk the plank",
    "port town", "tortuga", "caribbean", "kraken", "leviathan", "siren", "tide",
    "harbor", "harbour", "shipwreck", "castaway", "island cove", "naval"
  ],
  eastasian: [
    "wuxia", "xianxia", "cultivation", "cultivator", "qi", "chi", "dao", "jianghu",
    "martial arts", "martial artist", "kung fu", "shaolin", "sect", "sect elder",
    "immortal", "ascension", "spirit beast", "jade", "silk road", "samurai", "ronin",
    "shogun", "shogunate", "daimyo", "bushido", "katana", "wakizashi", "ninja",
    "shinobi", "kunoichi", "sensei", "dojo", "onmyoji", "yokai", "youkai", "oni",
    "kitsune", "tengu", "shrine", "torii", "sakura", "cherry blossom", "pagoda",
    "temple bell", "bamboo", "koi", "dragon emperor", "celestial court", "mandate of heaven",
    "edo", "kyoto", "heian", "sengoku", "joseon", "hanbok", "gisaeng", "taoist",
    "monastery in the mountains", "guqin", "shamisen", "erhu", "taiko"
  ],
  superhero: [
    "superhero", "super hero", "superheroes", "supervillain", "super villain", "supers",
    "cape", "capes", "caped", "secret identity", "alter ego", "sidekick", "nemesis",
    "arch-nemesis", "archenemy", "origin story", "superpower", "superpowers", "powers",
    "metahuman", "meta-human", "mutant gene", "vigilante", "masked vigilante",
    "the league", "the team", "headquarters", "hq", "watchtower", "utility belt",
    "flight", "super strength", "invulnerab", "telekinesis", "telepath", "speedster",
    "lair", "doomsday device", "world domination", "saving the city", "civilian casualties",
    "comic book", "four-color", "patrol", "rooftop", "signal in the sky",
    "mad scientist", "power armor", "kaiju attack", "alien invasion of earth"
  ],
  pulp: [
    "pulp", "pulp adventure", "two-fisted", "derring-do", "daring escape", "cliffhanger",
    "serial", "adventurer", "explorer", "expedition", "lost city", "lost world",
    "hidden temple", "ancient temple", "idol", "relic", "artifact hunter", "tomb",
    "jungle", "amazon", "sahara", "himalaya", "tibet", "mummy", "sarcophagus",
    "dinosaur", "hollow earth", "atlantis", "shangri-la", "el dorado", "aviator",
    "biplane", "seaplane", "fedora", "bullwhip", "revolver", "tommy gun", "dieselpunk",
    "nazi", "nazis", "the third reich", "secret society", "occult expedition",
    "rocketeer", "ray gun", "mad inventor", "damsel", "professor", "archaeologist",
    "1930s adventure", "indiana", "globe-trotting", "airfield", "safari"
  ],
  cozy: [
    "cozy", "cosy", "slice of life", "slice-of-life", "wholesome", "heartwarming",
    "gentle", "peaceful", "quiet life", "small town", "village life", "hometown",
    "bakery", "cafe", "café", "coffee shop", "teahouse", "tea shop", "bookshop",
    "bookstore", "library", "inn", "innkeeper", "tavern keeper", "shopkeeper",
    "general store", "flower shop", "florist", "farm", "farming", "harvest",
    "garden", "gardening", "orchard", "beekeep", "recipe", "baking", "cooking",
    "knitting", "pottery", "craft", "crafting", "festival", "harvest festival",
    "friendship", "neighbors", "neighbours", "community", "found family",
    "no combat", "low stakes", "lighthearted", "light-hearted", "charming",
    "whimsical", "stardew", "ghibli", "cottage", "cottagecore", "hearth",
    "lantern light", "rainy afternoon", "cat", "dog", "letters", "postal"
  ]
};

/**
 * Deterministically pick a music theme from a campaign's text. D&D is always
 * fantasy; other campaigns are scored by keyword hits across title, premise,
 * scene, overview, and NPC blurbs. Returns null when nothing scores (→ the
 * neutral mood roots play), which is the right answer for slice-of-life and
 * other genres we don't have a themed shelf for.
 */
export function classifyMusicTheme(campaign: Campaign): MusicTheme | null {
  if (campaign.campaignType === "dnd") return "fantasy";

  const haystack = [
    campaign.title,
    campaign.startingStory,
    campaign.currentScene,
    campaign.overview,
    campaign.memory,
    ...(campaign.storyCharacters || []).map((npc) => `${npc.name} ${npc.description}`)
  ]
    .join(" \n ")
    .toLowerCase();

  if (!haystack.trim()) return null;

  let best: MusicTheme | null = null;
  let bestWeighted = 0;
  let bestHits = 0;
  for (const theme of MUSIC_THEMES) {
    let hits = 0;
    for (const keyword of THEME_KEYWORDS[theme]) {
      if (haystack.includes(keyword)) hits += 1;
    }
    if (hits === 0) continue;
    // Specificity breaks the sub-genre/parent-genre tie (see THEME_SPECIFICITY).
    const weighted = hits * THEME_SPECIFICITY[theme];
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestHits = hits;
      best = theme;
    }
  }
  // Require a small floor so one stray word doesn't lock a theme.
  return bestHits >= 1 ? best : null;
}
