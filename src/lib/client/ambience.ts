"use client";

import { loadAmbienceManifest } from "@/lib/client/audio";
import type { AmbienceAcoustic, AmbienceSound } from "@/lib/campaign/types";

type AmbienceState = {
  categories: string[];
  acoustics: AmbienceAcoustic[];
  muted: boolean;
  volume: number;
};

type AmbienceOptions = {
  sounds?: AmbienceSound[];
  acoustics?: AmbienceAcoustic[];
};

type ActiveLayer = {
  element: HTMLAudioElement;
  filter?: BiquadFilterNode;
  dry?: GainNode;
  wet?: GainNode;
  convolver?: ConvolverNode;
};

type CategoryRule = {
  category: string;
  pattern: RegExp;
  group: "weather" | "place" | "detail";
};

const CATEGORY_RULES: CategoryRule[] = [
  { category: "storm", pattern: /\b(thunder|lightning|tempest|storm)\b/i, group: "weather" },
  { category: "rain", pattern: /\b(rain|rainy|downpour|drizzle|monsoon)\b/i, group: "weather" },
  { category: "wind", pattern: /\b(wind|windy|gale|blizzard|snowstorm|howling)\b/i, group: "weather" },
  { category: "snow", pattern: /\b(snow|snowfall|tundra|frozen|ice field)\b/i, group: "weather" },
  { category: "ocean", pattern: /\b(ocean|sea|beach|shore|coast|waves|ship deck|sailing)\b/i, group: "place" },
  { category: "water", pattern: /\b(river|stream|waterfall|sewer|canal|fountain|underground lake)\b/i, group: "detail" },
  { category: "forest", pattern: /\b(forest|woods|woodland|grove|jungle|rainforest)\b/i, group: "place" },
  { category: "swamp", pattern: /\b(swamp|marsh|bog|wetland|mangrove)\b/i, group: "place" },
  { category: "desert", pattern: /\b(desert|dunes|sandstorm|badlands|arid)\b/i, group: "place" },
  { category: "insects", pattern: /\b(crickets|cicadas|insects|mosquitoes|flies|night bugs)\b/i, group: "detail" },
  { category: "birds", pattern: /\b(birds|birdsong|aviary|seagulls|crows|ravens)\b/i, group: "detail" },
  { category: "cave", pattern: /\b(cave|cavern|grotto|underground chamber|mine shaft)\b/i, group: "place" },
  { category: "dungeon", pattern: /\b(dungeon|crypt|catacomb|tomb|prison|cellblock)\b/i, group: "place" },
  { category: "tavern", pattern: /\b(tavern|inn|alehouse|pub|feast hall)\b/i, group: "place" },
  { category: "village", pattern: /\b(village|medieval town|market square|farmstead|hamlet)\b/i, group: "place" },
  { category: "castle", pattern: /\b(castle|palace|throne room|great hall|fortress|keep)\b/i, group: "place" },
  { category: "city", pattern: /\b(city|street|alley|downtown|urban|neon|metropolis)\b/i, group: "place" },
  { category: "traffic", pattern: /\b(traffic|highway|cars|vehicles|intersection|roadway)\b/i, group: "detail" },
  { category: "crowd", pattern: /\b(crowd|market|bazaar|festival|arena|stadium|busy station)\b/i, group: "detail" },
  { category: "office", pattern: /\b(office|corporate|cubicle|conference room|workplace)\b/i, group: "place" },
  { category: "industrial", pattern: /\b(factory|warehouse|industrial|foundry|refinery|plant|workshop)\b/i, group: "place" },
  { category: "machinery", pattern: /\b(machine|machinery|generator|turbine|hydraulics|gears|conveyor|engine room)\b/i, group: "detail" },
  { category: "electrical", pattern: /\b(electric|electrical|electronics|server|computer|monitor|neon|transformer|substation|reactor)\b/i, group: "detail" },
  { category: "ventilation", pattern: /\b(vent|vents|ventilation|fan|fans|hvac|air duct|cooling system)\b/i, group: "detail" },
  { category: "laboratory", pattern: /\b(lab|laboratory|research facility|clean room|medical bay)\b/i, group: "place" },
  { category: "spaceship", pattern: /\b(spaceship|starship|space station|bridge|airlock|cargo bay|orbital|spacecraft)\b/i, group: "place" },
  { category: "western-town", pattern: /\b(saloon|frontier town|wild west|dusty street|ranch|stable)\b/i, group: "place" },
  { category: "wasteland", pattern: /\b(wasteland|post-apocalyptic|post apocalyptic|ruins|bunker|fallout|scrapyard)\b/i, group: "place" },
  { category: "battlefield", pattern: /\b(battlefield|war zone|trenches|artillery|gunfire|siege)\b/i, group: "place" },
  { category: "fire", pattern: /\b(fire|flames|campfire|bonfire|hearth|burning|inferno)\b/i, group: "detail" },
  { category: "supernatural", pattern: /\b(haunted|ghost|spirit|spectral|occult|ritual|portal|eldritch|cursed)\b/i, group: "detail" },
  { category: "underwater", pattern: /\b(underwater|submerged|beneath the waves|deep sea|ocean floor|scuba|diving bell)\b/i, group: "place" }
];

const AMBIENCE_VOLUME_KEY = "mythweaver-ambience-volume";
const BASE_VOLUME = 0.22;
const FADE_MS = 1800;
const MAX_LAYERS = 2;

let userVolume = 0.65;
if (typeof window !== "undefined") {
  const parsed = parseFloat(window.localStorage.getItem(AMBIENCE_VOLUME_KEY) || "");
  if (Number.isFinite(parsed)) userVolume = Math.min(1, Math.max(0, parsed));
}

const state: AmbienceState = { categories: [], acoustics: [], muted: false, volume: userVolume };
const listeners = new Set<(next: AmbienceState) => void>();
const active = new Map<string, ActiveLayer>();
let desiredText = "";
let desiredOptions: AmbienceOptions = {};
let changeToken = 0;
let context: AudioContext | null = null;

function notify() {
  for (const listener of listeners) listener({ ...state, categories: [...state.categories], acoustics: [...state.acoustics] });
}

function targetVolume(layerCount = Math.max(active.size, 1)) {
  if (state.muted) return 0;
  return BASE_VOLUME * userVolume / Math.sqrt(layerCount);
}

function fade(element: HTMLAudioElement, from: number, to: number, onDone?: () => void) {
  const started = performance.now();
  const timer = setInterval(() => {
    const progress = Math.min((performance.now() - started) / FADE_MS, 1);
    element.volume = Math.max(0, Math.min(1, from + (to - from) * progress));
    if (progress < 1) return;
    clearInterval(timer);
    onDone?.();
  }, 80);
}

function audioContext() {
  if (!context) context = new AudioContext();
  return context;
}

function acousticProfile(acoustics: AmbienceAcoustic[]) {
  let cutoff = 20000;
  if (acoustics.includes("distant")) cutoff = Math.min(cutoff, 4200);
  if (acoustics.includes("muffled")) cutoff = Math.min(cutoff, 1500);
  if (acoustics.includes("underwater")) cutoff = Math.min(cutoff, 650);
  const space = acoustics.find((item) => item === "small-room" || item === "indoors" || item === "large-hall" || item === "cave");
  if (space === "small-room" || space === "indoors") return { cutoff, reverb: 0.18, duration: 0.45, decay: 2.2 };
  if (space === "large-hall") return { cutoff, reverb: 0.34, duration: 1.8, decay: 2.8 };
  if (space === "cave") return { cutoff, reverb: 0.44, duration: 2.8, decay: 3.6 };
  return { cutoff, reverb: acoustics.includes("underwater") ? 0.12 : 0, duration: 0.7, decay: 2.4 };
}

function impulse(contextValue: AudioContext, duration: number, decay: number) {
  const length = Math.max(1, Math.floor(contextValue.sampleRate * duration));
  const buffer = contextValue.createBuffer(2, length, contextValue.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
    }
  }
  return buffer;
}

function routeLayer(element: HTMLAudioElement, acoustics: AmbienceAcoustic[]): ActiveLayer {
  try {
    const contextValue = audioContext();
    const source = contextValue.createMediaElementSource(element);
    const filter = contextValue.createBiquadFilter();
    const dry = contextValue.createGain();
    const wet = contextValue.createGain();
    const convolver = contextValue.createConvolver();
    const profile = acousticProfile(acoustics);
    filter.type = "lowpass";
    filter.frequency.value = profile.cutoff;
    dry.gain.value = 1 - profile.reverb * 0.35;
    wet.gain.value = profile.reverb;
    convolver.buffer = impulse(contextValue, profile.duration, profile.decay);
    source.connect(filter);
    filter.connect(dry).connect(contextValue.destination);
    filter.connect(convolver).connect(wet).connect(contextValue.destination);
    return { element, filter, dry, wet, convolver };
  } catch {
    return { element };
  }
}

function applyAcoustics(layer: ActiveLayer, acoustics: AmbienceAcoustic[]) {
  if (!layer.filter || !layer.dry || !layer.wet || !layer.convolver || !context) return;
  const profile = acousticProfile(acoustics);
  layer.filter.frequency.setTargetAtTime(profile.cutoff, context.currentTime, 0.12);
  layer.dry.gain.setTargetAtTime(1 - profile.reverb * 0.35, context.currentTime, 0.12);
  layer.wet.gain.setTargetAtTime(profile.reverb, context.currentTime, 0.12);
  layer.convolver.buffer = impulse(context, profile.duration, profile.decay);
}

function chooseCategories(text: string, available: Record<string, string[]>): string[] {
  const found: string[] = [];
  const usedGroups = new Set<CategoryRule["group"]>();
  for (const rule of CATEGORY_RULES) {
    if (!available[rule.category]?.length || !rule.pattern.test(text)) continue;
    if (usedGroups.has(rule.group)) continue;
    found.push(rule.category);
    usedGroups.add(rule.group);
    if (found.length >= MAX_LAYERS) break;
  }
  return found;
}

function randomTrack(tracks: string[]) {
  return tracks[Math.floor(Math.random() * tracks.length)];
}

async function applyScene(text: string, options: AmbienceOptions) {
  const token = ++changeToken;
  const library = await loadAmbienceManifest();
  if (token !== changeToken || text !== desiredText) return;
  const explicitSounds = options.sounds;
  const categories = explicitSounds?.includes("none")
    ? []
    : explicitSounds?.length
      ? explicitSounds.filter((sound) => sound !== "none" && library[sound]?.length).slice(0, MAX_LAYERS)
      : chooseCategories(text, library);
  const acoustics = options.acoustics || [];
  const wanted = new Set(categories);

  for (const [category, layer] of active) {
    if (wanted.has(category)) continue;
    active.delete(category);
    const element = layer.element;
    fade(element, element.volume, 0, () => {
      element.pause();
      element.removeAttribute("src");
      element.load();
    });
  }

  const volume = targetVolume(categories.length);
  for (const layer of active.values()) {
    applyAcoustics(layer, acoustics);
    fade(layer.element, layer.element.volume, volume);
  }
  for (const category of categories) {
    if (active.has(category)) continue;
    const element = new Audio(randomTrack(library[category]));
    element.loop = true;
    element.preload = "auto";
    element.volume = 0;
    active.set(category, routeLayer(element, acoustics));
    element.play().then(() => fade(element, 0, volume)).catch(() => undefined);
  }

  state.categories = categories;
  state.acoustics = acoustics;
  notify();
}

/** Select up to two compatible environmental beds from free-form scene text. */
export function ambienceSetScene(text: string, options: AmbienceOptions = {}) {
  const normalized = text.trim();
  if (normalized === desiredText && JSON.stringify(options) === JSON.stringify(desiredOptions)) return;
  desiredText = normalized;
  desiredOptions = options;
  applyScene(normalized, options).catch(() => undefined);
}

export function ambienceSetVolume(next: number) {
  userVolume = Math.min(1, Math.max(0, next));
  state.volume = userVolume;
  if (typeof window !== "undefined") window.localStorage.setItem(AMBIENCE_VOLUME_KEY, String(userVolume));
  const volume = targetVolume();
  for (const layer of active.values()) layer.element.volume = volume;
  notify();
}

export function ambienceGetVolume() {
  return userVolume;
}

export function ambienceSetMuted(muted: boolean) {
  state.muted = muted;
  const volume = targetVolume();
  for (const layer of active.values()) layer.element.volume = volume;
  notify();
}

export function subscribeAmbience(listener: (next: AmbienceState) => void) {
  listeners.add(listener);
  listener({ ...state, categories: [...state.categories], acoustics: [...state.acoustics] });
  return () => {
    listeners.delete(listener);
  };
}

export function ambienceResume() {
  context?.resume().catch(() => undefined);
  for (const layer of active.values()) layer.element.play().catch(() => undefined);
}

export function ambienceStop() {
  changeToken += 1;
  desiredText = "";
  desiredOptions = {};
  for (const layer of active.values()) {
    const element = layer.element;
    element.pause();
    element.removeAttribute("src");
    element.load();
  }
  active.clear();
  state.categories = [];
  state.acoustics = [];
  notify();
}