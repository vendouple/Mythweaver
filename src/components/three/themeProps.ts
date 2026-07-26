"use client";

import * as THREE from "three";
import type { ThemeKey, ThemeVisual } from "./themeVisuals";

/**
 * Signature props — the one unmistakable 3D landmark each campaign theme
 * plants among the drifting dice. Where themeLayers.ts paints the weather
 * (auroras, rain, ash), this module builds the hero object that sells the
 * genre at a glance: an enchanted blade for fantasy, an orbital station with
 * a circling shuttle for scifi, a guttering candelabra for horror, a lone
 * streetlamp for noir, a patrol drone for modern, a rolling tumbleweed for
 * the frontier, a snapped beacon mast for the wasteland, a ghost galleon on
 * live water for pirate, a rain-slick spinner for cyberpunk, and a wind-belled
 * pagoda for east-asian. One prop per scene, built from cheap primitives,
 * driven by one `update(t, dt, drive)`.
 */

export type ThemeProp = {
  /** Advance the prop. `drive` is the scene's energy multiplier (~0.4..1.3). */
  update: (t: number, dt: number, drive: number) => void;
  dispose: () => void;
};

/** Which scene the prop dresses — the lobby cosmos or the Weaving loom. */
export type ThemePropContext = "cosmos" | "loom";

type Placement = { position: [number, number, number]; scale: number };

/**
 * Where each theme's landmark sits. The cosmos camera rests near (0, 0.4, 11)
 * looking a little past the origin, with the lobby UI owning the middle of
 * the frame, so props live in the right-hand third (the tumbleweed instead
 * rolls the whole width of the floor). The loom camera orbits (0,0,0) from
 * z≈14, so loom props stand further out, clear of the great rings.
 */
const PLACEMENTS: Record<ThemePropContext, Partial<Record<ThemeKey, Placement>>> = {
  cosmos: {
    fantasy: { position: [6.2, 1.4, -5], scale: 1.1 },
    scifi: { position: [6.9, 1.6, -6.5], scale: 1.15 },
    horror: { position: [5.9, -2.3, -4], scale: 1.25 },
    noir: { position: [6.3, -0.3, -5], scale: 1.3 },
    modern: { position: [6.1, 2.3, -5], scale: 1.2 },
    western: { position: [0, -5.2, -5], scale: 1.2 },
    postapoc: { position: [6.5, -0.9, -6], scale: 1.2 },
    // Sub-genres reuse a kindred builder (see createThemeProp) but get their
    // own framing, so the shared silhouette still reads as a different object.
    cyberpunk: { position: [6.4, 2.6, -5.5], scale: 1.15 },
    spaceopera: { position: [7.1, 1.2, -7], scale: 1.25 },
    gothic: { position: [6.0, -2.0, -4], scale: 1.3 },
    urbanfantasy: { position: [6.4, -0.5, -5], scale: 1.25 },
    steampunk: { position: [6.6, -0.6, -5.5], scale: 1.15 },
    // The galleon brings its own stretch of sea, so it sits back and small.
    pirate: { position: [7.4, -1.2, -8], scale: 0.85 },
    eastasian: { position: [6.4, 0.4, -5.5], scale: 0.95 },
    superhero: { position: [6.2, 2.6, -5], scale: 1.25 },
    pulp: { position: [6.6, -0.7, -6], scale: 1.15 },
    cozy: { position: [5.9, -1.8, -4], scale: 1.1 }
  },
  loom: {
    fantasy: { position: [7.4, 2.8, -3], scale: 0.8 },
    scifi: { position: [7.8, 3, -4], scale: 0.85 },
    horror: { position: [7.2, -3.2, -2], scale: 0.85 },
    noir: { position: [7.8, -0.2, -3], scale: 0.9 },
    modern: { position: [7.4, 3.2, -3], scale: 0.8 },
    western: { position: [0, -5, -2], scale: 0.9 },
    postapoc: { position: [7.9, -0.5, -4], scale: 0.85 },
    cyberpunk: { position: [7.6, 3.4, -3], scale: 0.85 },
    spaceopera: { position: [8.1, 2.6, -4.5], scale: 0.95 },
    gothic: { position: [7.3, -3.0, -2], scale: 0.9 },
    urbanfantasy: { position: [7.7, -0.1, -3], scale: 0.9 },
    steampunk: { position: [7.9, -0.4, -4], scale: 0.85 },
    pirate: { position: [8.8, -0.6, -6], scale: 0.72 },
    eastasian: { position: [7.6, 1.4, -3.5], scale: 0.72 },
    superhero: { position: [7.5, 3.4, -3], scale: 0.9 },
    pulp: { position: [7.9, -0.4, -4], scale: 0.85 },
    cozy: { position: [7.1, -2.8, -2], scale: 0.8 }
  }
};

function hexToRgba(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
}

/** Soft radial glow — flames, beacons, engine wash, lamp halos. */
function makeGlowTexture(inner: string, outer: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

type BuiltProp = {
  group: THREE.Group;
  update: (t: number, dt: number, drive: number) => void;
  dispose: () => void;
};

/** Additive glow sprite that ignores fog so it punches through the murk. */
function makeGlowSprite(
  texture: THREE.CanvasTexture,
  color: string,
  disposables: Array<{ dispose: () => void }>
) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  disposables.push(material);
  return { sprite: new THREE.Sprite(material), material };
}

/* ------------------------------------------------------------------ */
/* Fantasy — an enchanted blade hangs point-down, turning slowly,      */
/* wrapped in a lazy spiral of sparks.                                 */
/* ------------------------------------------------------------------ */
function swordProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const steel = new THREE.MeshStandardMaterial({
    color: 0xd9dfef,
    roughness: 0.22,
    metalness: 0.9,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.14
  });
  const gold = new THREE.MeshStandardMaterial({
    color: new THREE.Color(visual.accent),
    roughness: 0.35,
    metalness: 0.85,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.25
  });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2a1c30, roughness: 0.75, metalness: 0.2 });
  disposables.push(steel, gold, leather);

  // A stretched octahedron reads as a double-edged blade with a clean point.
  const bladeGeometry = new THREE.OctahedronGeometry(1, 0);
  const blade = new THREE.Mesh(bladeGeometry, steel);
  blade.scale.set(0.17, 1.05, 0.055);
  blade.position.y = -0.35;
  content.add(blade);
  const guardGeometry = new THREE.BoxGeometry(0.72, 0.1, 0.15);
  const guard = new THREE.Mesh(guardGeometry, gold);
  guard.position.y = 0.72;
  content.add(guard);
  const gripGeometry = new THREE.CylinderGeometry(0.055, 0.05, 0.5, 10);
  const grip = new THREE.Mesh(gripGeometry, leather);
  grip.position.y = 1.02;
  content.add(grip);
  const pommelGeometry = new THREE.SphereGeometry(0.1, 12, 10);
  const pommel = new THREE.Mesh(pommelGeometry, gold);
  pommel.position.y = 1.32;
  content.add(pommel);
  disposables.push(bladeGeometry, guardGeometry, gripGeometry, pommelGeometry);

  const glowTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.7), hexToRgba(visual.accent, 0));
  disposables.push(glowTexture);
  const { sprite: glow, material: glowMaterial } = makeGlowSprite(glowTexture, visual.accentBright, disposables);
  glow.position.y = -0.35;
  glow.scale.setScalar(2);
  content.add(glow);

  // Sparks spiral the blade on a fixed lattice; spinning the whole cloud is
  // far cheaper than re-writing positions and reads identically from afar.
  const SPARKS = 26;
  const sparkPositions = new Float32Array(SPARKS * 3);
  for (let i = 0; i < SPARKS; i += 1) {
    const angle = (i / SPARKS) * Math.PI * 6;
    const radius = 0.45 + (i % 5) * 0.12;
    sparkPositions[i * 3] = Math.cos(angle) * radius;
    sparkPositions[i * 3 + 1] = -1.25 + (i / SPARKS) * 2.5;
    sparkPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(visual.accentBright),
    size: 0.06,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  content.add(sparks);
  disposables.push(sparkGeometry, sparkMaterial);

  return {
    group,
    update: (t) => {
      content.rotation.y = t * 0.45;
      content.rotation.z = Math.sin(t * 0.4) * 0.06;
      content.position.y = Math.sin(t * 0.8) * 0.22;
      sparks.rotation.y = -t * 0.9;
      sparkMaterial.opacity = 0.55 + Math.sin(t * 2.6) * 0.25;
      glowMaterial.opacity = 0.3 + Math.sin(t * 1.4) * 0.12;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Scifi — an orbital ring station turns over the table while a tiny   */
/* shuttle runs its patrol lap, running lights chasing round the hull. */
/* ------------------------------------------------------------------ */
function stationProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  content.rotation.x = 0.5;
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const hull = new THREE.MeshStandardMaterial({
    color: 0x22384e,
    roughness: 0.3,
    metalness: 0.9,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.18
  });
  disposables.push(hull);

  const ringGroup = new THREE.Group();
  content.add(ringGroup);
  const ringGeometry = new THREE.TorusGeometry(1.35, 0.085, 10, 48);
  ringGroup.add(new THREE.Mesh(ringGeometry, hull));
  disposables.push(ringGeometry);
  const spokeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 2.62, 6);
  for (let i = 0; i < 4; i += 1) {
    const spoke = new THREE.Mesh(spokeGeometry, hull);
    spoke.rotation.z = (i / 4) * Math.PI;
    ringGroup.add(spoke);
  }
  disposables.push(spokeGeometry);
  const hubGeometry = new THREE.SphereGeometry(0.34, 16, 12);
  ringGroup.add(new THREE.Mesh(hubGeometry, hull));
  disposables.push(hubGeometry);

  // Outer halo ring on its own tilt, counter-rotating.
  const haloGeometry = new THREE.TorusGeometry(1.8, 0.035, 8, 56);
  const halo = new THREE.Mesh(haloGeometry, hull);
  halo.rotation.x = 1.1;
  content.add(halo);
  disposables.push(haloGeometry);

  // Running lights chase each other around the main ring.
  const beaconTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.95), hexToRgba(visual.accent, 0));
  disposables.push(beaconTexture);
  const beacons: THREE.SpriteMaterial[] = [];
  for (let i = 0; i < 8; i += 1) {
    const { sprite, material } = makeGlowSprite(beaconTexture, visual.accentBright, disposables);
    const angle = (i / 8) * Math.PI * 2;
    sprite.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
    sprite.scale.setScalar(0.22);
    ringGroup.add(sprite);
    beacons.push(material);
  }

  // The patrol shuttle: a cone nosing along its orbit, engine wash behind.
  const shuttleOrbit = new THREE.Group();
  content.add(shuttleOrbit);
  const shuttleGeometry = new THREE.ConeGeometry(0.07, 0.28, 8);
  const shuttle = new THREE.Mesh(shuttleGeometry, hull);
  shuttle.position.set(2.3, 0, 0);
  shuttleOrbit.add(shuttle);
  disposables.push(shuttleGeometry);
  const { sprite: engine, material: engineMaterial } = makeGlowSprite(beaconTexture, visual.secondary, disposables);
  engine.position.set(2.3, -0.2, 0);
  engine.scale.setScalar(0.3);
  shuttleOrbit.add(engine);

  return {
    group,
    update: (t, dt, drive) => {
      ringGroup.rotation.z += dt * 0.5 * (0.7 + drive * 0.3);
      halo.rotation.z -= dt * 0.3;
      shuttleOrbit.rotation.z += dt * 0.85;
      content.rotation.y = Math.sin(t * 0.12) * 0.35;
      content.position.y = Math.sin(t * 0.5) * 0.15;
      beacons.forEach((material, index) => {
        material.opacity = 0.12 + Math.pow(Math.max(0, Math.sin(t * 2.4 - index * (Math.PI / 4))), 6) * 0.85;
      });
      engineMaterial.opacity = 0.5 + Math.sin(t * 9) * 0.2;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Horror — a tarnished candelabra whose three flames burn the theme's */
/* sickly green and gutter independently, throwing real light.         */
/* ------------------------------------------------------------------ */
function candelabraProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const metal = new THREE.MeshStandardMaterial({
    color: 0x241a12,
    roughness: 0.55,
    metalness: 0.75,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.05
  });
  const wax = new THREE.MeshStandardMaterial({ color: 0xd9d2ba, roughness: 0.9, metalness: 0 });
  disposables.push(metal, wax);

  const baseGeometry = new THREE.CylinderGeometry(0.32, 0.44, 0.08, 16);
  const base = new THREE.Mesh(baseGeometry, metal);
  base.position.y = -0.85;
  content.add(base);
  const stemGeometry = new THREE.CylinderGeometry(0.045, 0.055, 1.2, 10);
  const stem = new THREE.Mesh(stemGeometry, metal);
  stem.position.y = -0.2;
  content.add(stem);
  // Half-torus rotated to open upward — both arms in one sweep.
  const armGeometry = new THREE.TorusGeometry(0.42, 0.03, 8, 24, Math.PI);
  const arms = new THREE.Mesh(armGeometry, metal);
  arms.rotation.z = Math.PI;
  arms.position.y = 0.34;
  content.add(arms);
  disposables.push(baseGeometry, stemGeometry, armGeometry);

  const cupGeometry = new THREE.CylinderGeometry(0.08, 0.06, 0.06, 10);
  const candleTallGeometry = new THREE.CylinderGeometry(0.055, 0.065, 0.55, 10);
  const candleShortGeometry = new THREE.CylinderGeometry(0.05, 0.06, 0.38, 10);
  disposables.push(cupGeometry, candleTallGeometry, candleShortGeometry);
  const flameTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.95), hexToRgba(visual.accent, 0));
  disposables.push(flameTexture);

  const flames: Array<{ inner: THREE.Sprite; innerMaterial: THREE.SpriteMaterial; haloMaterial: THREE.SpriteMaterial; seed: number }> = [];
  const seats: Array<[number, number, boolean]> = [
    [-0.42, 0.38, false],
    [0, 0.62, true],
    [0.42, 0.38, false]
  ];
  for (const [x, y, tall] of seats) {
    const cup = new THREE.Mesh(cupGeometry, metal);
    cup.position.set(x, y, 0);
    content.add(cup);
    const candle = new THREE.Mesh(tall ? candleTallGeometry : candleShortGeometry, wax);
    const height = tall ? 0.55 : 0.38;
    candle.position.set(x, y + 0.03 + height / 2, 0);
    content.add(candle);
    const tip = y + 0.03 + height + 0.06;
    const { sprite: inner, material: innerMaterial } = makeGlowSprite(flameTexture, visual.accentBright, disposables);
    inner.position.set(x, tip, 0);
    inner.scale.set(0.12, 0.2, 1);
    content.add(inner);
    const { sprite: halo, material: haloMaterial } = makeGlowSprite(flameTexture, visual.accent, disposables);
    halo.position.set(x, tip + 0.04, 0);
    halo.scale.setScalar(0.55);
    content.add(halo);
    flames.push({ inner, innerMaterial, haloMaterial, seed: x * 7.3 + y });
  }

  const light = new THREE.PointLight(new THREE.Color(visual.accent), 8, 8, 2);
  light.position.set(0, 1.1, 0.4);
  content.add(light);

  return {
    group,
    update: (t) => {
      let glowSum = 0;
      for (const flame of flames) {
        // Two incommensurate sines per flame — each candle gutters alone.
        const flick = 0.62 + 0.38 * Math.sin(t * 11 + flame.seed * 2.4) * Math.sin(t * 3.7 + flame.seed);
        glowSum += flick;
        flame.innerMaterial.opacity = 0.15 + flick * 0.75;
        flame.inner.scale.set(0.12, 0.15 + flick * 0.1, 1);
        flame.haloMaterial.opacity = 0.06 + flick * 0.26;
      }
      light.intensity = 3 + (glowSum / flames.length) * 7;
      content.rotation.z = Math.sin(t * 0.3) * 0.03;
      content.position.y = Math.sin(t * 0.5) * 0.1;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Noir — a lone streetlamp buzzing in the rain, its cone of light     */
/* the only warm thing on the block.                                   */
/* ------------------------------------------------------------------ */
function streetlampProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const iron = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.45, metalness: 0.85 });
  disposables.push(iron);

  const poleGeometry = new THREE.CylinderGeometry(0.045, 0.065, 3.5, 10);
  content.add(new THREE.Mesh(poleGeometry, iron));
  const plinthGeometry = new THREE.CylinderGeometry(0.1, 0.14, 0.22, 12);
  const plinth = new THREE.Mesh(plinthGeometry, iron);
  plinth.position.y = -1.72;
  content.add(plinth);
  const armGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.66, 8);
  const arm = new THREE.Mesh(armGeometry, iron);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.3, 1.72, 0);
  content.add(arm);
  const shadeGeometry = new THREE.CylinderGeometry(0.03, 0.24, 0.16, 12);
  const shade = new THREE.Mesh(shadeGeometry, iron);
  shade.position.set(0.62, 1.64, 0);
  content.add(shade);
  disposables.push(poleGeometry, plinthGeometry, armGeometry, shadeGeometry);

  const bulbGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  const bulbMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accentBright),
    transparent: true,
    opacity: 0.9,
    fog: false
  });
  const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
  bulb.position.set(0.62, 1.54, 0);
  content.add(bulb);
  disposables.push(bulbGeometry, bulbMaterial);

  const glowTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.85), hexToRgba(visual.accent, 0));
  disposables.push(glowTexture);
  const { sprite: halo, material: haloMaterial } = makeGlowSprite(glowTexture, visual.accentBright, disposables);
  halo.position.copy(bulb.position);
  halo.scale.setScalar(1.1);
  content.add(halo);

  const coneGeometry = new THREE.ConeGeometry(0.8, 2.4, 20, 1, true);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accent),
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.position.set(0.62, 0.34, 0);
  content.add(cone);
  disposables.push(coneGeometry, coneMaterial);

  return {
    group,
    update: (t) => {
      // High-frequency interference = the electric buzz; the beat of two
      // slow sines occasionally crosses the threshold and the lamp browns out.
      const buzz = 0.78 + 0.22 * Math.sin(t * 31) * Math.sin(t * 7.1);
      const dip = Math.max(0, Math.sin(t * 0.83) * Math.sin(t * 1.7 + 2) - 0.93) / 0.07;
      const level = buzz * (1 - dip * 0.7);
      haloMaterial.opacity = 0.55 * level;
      coneMaterial.opacity = 0.07 * level;
      bulbMaterial.opacity = 0.9 * level;
      cone.rotation.z = Math.sin(t * 0.5) * 0.02;
      content.position.y = Math.sin(t * 0.6) * 0.08;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Modern — a surveillance drone holds a hover: rotors blurring, nav   */
/* lights blinking, a faint scan cone sweeping the ground below.       */
/* ------------------------------------------------------------------ */
function droneProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const shell = new THREE.MeshStandardMaterial({
    color: 0x0d1418,
    roughness: 0.35,
    metalness: 0.7,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.12
  });
  disposables.push(shell);

  const bodyGeometry = new THREE.SphereGeometry(0.26, 16, 12);
  const body = new THREE.Mesh(bodyGeometry, shell);
  body.scale.y = 0.55;
  content.add(body);
  const lensGeometry = new THREE.SphereGeometry(0.07, 10, 8);
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: 0x061a20,
    roughness: 0.1,
    metalness: 0.4,
    emissive: new THREE.Color(visual.secondary),
    emissiveIntensity: 0.3
  });
  const lens = new THREE.Mesh(lensGeometry, lensMaterial);
  lens.position.set(0, -0.03, 0.24);
  content.add(lens);
  disposables.push(bodyGeometry, lensGeometry, lensMaterial);

  const armGeometry = new THREE.BoxGeometry(0.78, 0.028, 0.05);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(armGeometry, shell);
    arm.rotation.y = angle;
    arm.position.y = 0.06;
    content.add(arm);
  }
  disposables.push(armGeometry);

  // Rotor = translucent blur disc + one visible blade whipping around in it.
  const discGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.014, 18);
  const bladeGeometry = new THREE.BoxGeometry(0.28, 0.012, 0.03);
  disposables.push(discGeometry, bladeGeometry);
  const rotors: Array<{ blade: THREE.Mesh; disc: THREE.MeshBasicMaterial; seed: number }> = [];
  const corners: Array<[number, number]> = [
    [0.28, 0.28],
    [0.28, -0.28],
    [-0.28, 0.28],
    [-0.28, -0.28]
  ];
  corners.forEach(([x, z], index) => {
    const discMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(visual.accent),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.position.set(x, 0.11, z);
    content.add(disc);
    const blade = new THREE.Mesh(bladeGeometry, shell);
    blade.position.set(x, 0.12, z);
    content.add(blade);
    rotors.push({ blade, disc: discMaterial, seed: index * 1.7 });
    disposables.push(discMaterial);
  });

  const ledTexture = makeGlowTexture("rgba(255,255,255,0.95)", "rgba(255,255,255,0)");
  disposables.push(ledTexture);
  const { sprite: ledFront, material: ledFrontMaterial } = makeGlowSprite(ledTexture, visual.accent, disposables);
  ledFront.position.set(0, 0.02, 0.3);
  ledFront.scale.setScalar(0.12);
  content.add(ledFront);
  const { sprite: ledRear, material: ledRearMaterial } = makeGlowSprite(ledTexture, visual.secondary, disposables);
  ledRear.position.set(0, 0.02, -0.3);
  ledRear.scale.setScalar(0.12);
  content.add(ledRear);

  const scanPivot = new THREE.Group();
  content.add(scanPivot);
  const scanGeometry = new THREE.ConeGeometry(0.55, 1.7, 16, 1, true);
  const scanMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accent),
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
  const scan = new THREE.Mesh(scanGeometry, scanMaterial);
  scan.position.y = -0.95;
  scanPivot.add(scan);
  disposables.push(scanGeometry, scanMaterial);

  return {
    group,
    update: (t, dt) => {
      content.position.y = Math.sin(t * 1.3) * 0.16;
      content.rotation.z = Math.sin(t * 0.7) * 0.08;
      content.rotation.x = Math.cos(t * 0.9) * 0.06;
      content.rotation.y = Math.sin(t * 0.21) * 0.7;
      for (const rotor of rotors) {
        rotor.blade.rotation.y += dt * (26 + rotor.seed);
        rotor.disc.opacity = 0.18 + 0.1 * Math.sin(t * 40 + rotor.seed * 9);
      }
      ledFrontMaterial.opacity = Math.pow(Math.max(0, Math.sin(t * 3)), 8);
      ledRearMaterial.opacity = Math.pow(Math.max(0, Math.sin(t * 3 + Math.PI)), 8);
      scanPivot.rotation.z = Math.sin(t * 0.45) * 0.3;
      scanPivot.rotation.x = Math.cos(t * 0.32) * 0.2;
      scanMaterial.opacity = 0.05 + 0.02 * Math.sin(t * 1.1);
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Western — a tumbleweed rolls the width of the scene on the gusting  */
/* prairie wind, hopping when the wind picks up, then rolls in again.  */
/* ------------------------------------------------------------------ */
function tumbleweedProp(visual: ThemeVisual, context: ThemePropContext): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];
  const half = context === "cosmos" ? 9 : 10;

  const weed = new THREE.Group();
  content.add(weed);
  const outerSource = new THREE.IcosahedronGeometry(0.5, 1);
  const outerGeometry = new THREE.EdgesGeometry(outerSource);
  outerSource.dispose();
  const outerMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(visual.dust.color),
    transparent: true,
    opacity: 0.85
  });
  weed.add(new THREE.LineSegments(outerGeometry, outerMaterial));
  const innerSource = new THREE.IcosahedronGeometry(0.32, 0);
  const innerGeometry = new THREE.EdgesGeometry(innerSource);
  innerSource.dispose();
  const innerMaterial = new THREE.LineBasicMaterial({ color: 0x8a6242, transparent: true, opacity: 0.6 });
  const inner = new THREE.LineSegments(innerGeometry, innerMaterial);
  inner.rotation.set(0.7, 1.9, 0.4);
  weed.add(inner);
  disposables.push(outerGeometry, outerMaterial, innerGeometry, innerMaterial);

  let x = -half;
  let hop = 0;

  return {
    group,
    update: (t, dt, drive) => {
      // The same wind-wave the western dust layer rides.
      const gust = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(t * 0.17 + 1)), 2);
      const speed = (1.6 + gust * 2.6) * (0.6 + drive * 0.5);
      x += speed * dt;
      if (x > half) x = -half - 1;
      hop += dt * speed * 1.1;
      weed.position.x = x;
      weed.position.y = 0.5 + Math.abs(Math.sin(hop)) * 0.22 * gust;
      weed.rotation.z -= (speed * dt) / 0.5 * 0.8;
      weed.rotation.x = Math.sin(t * 1.7) * 0.18;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Post-apocalypse — a snapped transmission mast leans into the ash,   */
/* hazard beacon still pulsing, a loose wire arcing now and then.      */
/* ------------------------------------------------------------------ */
function towerProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  content.rotation.z = 0.14;
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const rust = new THREE.MeshStandardMaterial({
    color: 0x38291c,
    roughness: 0.9,
    metalness: 0.45,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.06
  });
  disposables.push(rust);

  const mastGeometry = new THREE.CylinderGeometry(0.05, 0.1, 3.1, 8);
  content.add(new THREE.Mesh(mastGeometry, rust));
  disposables.push(mastGeometry);
  for (let i = 0; i < 3; i += 1) {
    const barGeometry = new THREE.BoxGeometry(0.72 - i * 0.14, 0.04, 0.04);
    const bar = new THREE.Mesh(barGeometry, rust);
    bar.position.y = -0.8 + i * 0.85;
    bar.rotation.y = i * 0.7;
    content.add(bar);
    disposables.push(barGeometry);
  }
  // The snapped top section dangles off-axis where the mast gave way.
  const tipGeometry = new THREE.CylinderGeometry(0.03, 0.045, 0.75, 8);
  const tip = new THREE.Mesh(tipGeometry, rust);
  tip.position.set(0.18, 1.75, 0);
  tip.rotation.z = 0.85;
  content.add(tip);
  disposables.push(tipGeometry);

  const beaconTexture = makeGlowTexture("rgba(255,110,70,0.95)", "rgba(255,80,40,0)");
  disposables.push(beaconTexture);
  const { sprite: beacon, material: beaconMaterial } = makeGlowSprite(beaconTexture, "#ff6a3c", disposables);
  beacon.position.set(0.02, 1.58, 0);
  content.add(beacon);
  const beaconLight = new THREE.PointLight(0xff5a30, 0, 6, 2);
  beaconLight.position.set(0, 1.6, 0.3);
  content.add(beaconLight);

  const { sprite: spark, material: sparkMaterial } = makeGlowSprite(beaconTexture, "#ffe9c9", disposables);
  spark.position.set(0.14, 1.5, 0);
  spark.scale.setScalar(0.16);
  content.add(spark);

  return {
    group,
    update: (t) => {
      const pulse = Math.pow(Math.max(0, Math.sin(t * 1.5)), 4);
      beaconMaterial.opacity = 0.08 + pulse * 0.85;
      beacon.scale.setScalar(0.5 + pulse * 0.25);
      beaconLight.intensity = pulse * 8;
      // Three incommensurate sines only align rarely — a stray arc of current.
      const arc = Math.sin(t * 7.3) * Math.sin(t * 3.1 + 2) * Math.sin(t * 0.9 + 5);
      sparkMaterial.opacity = (Math.max(0, arc - 0.82) / 0.18) * 0.9;
      content.rotation.z = 0.14 + Math.sin(t * 0.26) * 0.012;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Pirate — a ghost galleon under full sail, riding a wireframe swell. */
/* The sea is the prop as much as the ship is: a lattice of glowing    */
/* lines heaving on two crossed wave trains, with the hull pitching    */
/* and rolling in the same water it's drawn from.                      */
/* ------------------------------------------------------------------ */
function galleonProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  /* -- the sea ------------------------------------------------------ */
  // A wireframe plane whose vertices are displaced by two crossed swells,
  // rewritten each frame. 24×24 is cheap and reads as open water because the
  // long swell rolls through it in one direction while the chop crosses it.
  const SEA_N = 22;
  const SEA_W = 7.4;
  const seaGeometry = new THREE.PlaneGeometry(SEA_W, SEA_W, SEA_N, SEA_N);
  seaGeometry.rotateX(-Math.PI / 2);
  const seaWire = new THREE.WireframeGeometry(seaGeometry);
  // Keep the source grid for the displacement math, draw only the wireframe.
  const seaBase = (seaWire.getAttribute("position") as THREE.BufferAttribute).clone();
  const seaMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(visual.accent),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const sea = new THREE.LineSegments(seaWire, seaMaterial);
  sea.position.y = -1.5;
  content.add(sea);
  disposables.push(seaGeometry, seaWire, seaMaterial);

  // Foam: motes riding the crests, so the water has texture above the lattice.
  const FOAM = 90;
  const foamSeeds = new Float32Array(FOAM * 2);
  for (let i = 0; i < FOAM; i += 1) {
    foamSeeds[i * 2] = (i * 0.618034) % 1;
    foamSeeds[i * 2 + 1] = ((i * 0.381966) % 1);
  }
  const foamGeometry = new THREE.BufferGeometry();
  foamGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FOAM * 3), 3));
  const foamMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(visual.accentBright),
    size: 0.07,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const foam = new THREE.Points(foamGeometry, foamMaterial);
  foam.position.y = -1.5;
  content.add(foam);
  disposables.push(foamGeometry, foamMaterial);

  /* -- the ship ----------------------------------------------------- */
  const ship = new THREE.Group();
  ship.position.y = -1.4;
  content.add(ship);

  const timber = new THREE.MeshStandardMaterial({
    color: 0x1d1410,
    roughness: 0.85,
    metalness: 0.1,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.1
  });
  disposables.push(timber);

  // Hull: a stretched, rotated cylinder gives a tapered keel with a broad
  // waist — a galleon in profile rather than a boxy barge.
  const hullGeometry = new THREE.CylinderGeometry(0.3, 0.11, 2.5, 7);
  const hull = new THREE.Mesh(hullGeometry, timber);
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(1, 1, 0.62);
  ship.add(hull);
  const castleGeometry = new THREE.BoxGeometry(0.6, 0.34, 0.4);
  const castle = new THREE.Mesh(castleGeometry, timber);
  castle.position.set(-0.72, 0.24, 0);
  ship.add(castle);
  const bowspritGeometry = new THREE.CylinderGeometry(0.026, 0.016, 0.8, 5);
  const bowsprit = new THREE.Mesh(bowspritGeometry, timber);
  bowsprit.rotation.z = Math.PI / 2 - 0.34;
  bowsprit.position.set(1.5, 0.2, 0);
  ship.add(bowsprit);
  disposables.push(hullGeometry, castleGeometry, bowspritGeometry);

  // Masts and yards.
  const mastGeometry = new THREE.CylinderGeometry(0.028, 0.038, 2.1, 6);
  const yardGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1.15, 5);
  const mastX = [-0.42, 0.34, 0.95];
  const mastH = [2.1, 2.4, 1.7];
  for (let i = 0; i < 3; i += 1) {
    const mast = new THREE.Mesh(mastGeometry, timber);
    mast.position.set(mastX[i], mastH[i] / 2 + 0.1, 0);
    mast.scale.y = mastH[i] / 2.1;
    ship.add(mast);
    for (let y = 0; y < 2; y += 1) {
      const yard = new THREE.Mesh(yardGeometry, timber);
      yard.rotation.x = Math.PI / 2;
      yard.position.set(mastX[i], 0.7 + y * 0.78, 0);
      yard.scale.y = (1 - y * 0.22) * (i === 2 ? 0.72 : 1);
      ship.add(yard);
    }
  }
  disposables.push(mastGeometry, yardGeometry);

  // Sails: tattered translucent sheets, bellied out by the wind. Drawn
  // double-sided and additively so they read as spectral canvas, not cloth.
  const sailMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accentBright),
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
  disposables.push(sailMaterial);
  const sails: Array<{ mesh: THREE.Mesh; base: THREE.BufferAttribute; phase: number }> = [];
  for (let i = 0; i < 3; i += 1) {
    for (let y = 0; y < 2; y += 1) {
      const w = 1.05 * (1 - y * 0.2) * (i === 2 ? 0.7 : 1);
      const h = 0.66 * (1 - y * 0.14);
      const geometry = new THREE.PlaneGeometry(w, h, 5, 4);
      const mesh = new THREE.Mesh(geometry, sailMaterial);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(mastX[i], 0.7 + y * 0.78 - h / 2 - 0.03, 0);
      ship.add(mesh);
      sails.push({
        mesh,
        base: (geometry.getAttribute("position") as THREE.BufferAttribute).clone(),
        phase: i * 1.7 + y * 0.9
      });
      disposables.push(geometry);
    }
  }

  // Rigging: a lantern at the stern and a spectral glow in the sails.
  const glowTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.9), hexToRgba(visual.accent, 0));
  disposables.push(glowTexture);
  const { sprite: lantern, material: lanternMaterial } = makeGlowSprite(glowTexture, visual.accentBright, disposables);
  lantern.position.set(-0.95, 0.6, 0);
  lantern.scale.setScalar(0.5);
  ship.add(lantern);
  const { sprite: aura, material: auraMaterial } = makeGlowSprite(glowTexture, visual.secondary, disposables);
  aura.position.set(0.2, 1.1, 0);
  aura.scale.setScalar(3.4);
  ship.add(aura);

  // A wake: a thin V of light dragged behind the hull.
  const wakeGeometry = new THREE.PlaneGeometry(2.6, 0.5, 1, 1);
  const wakeMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accentBright),
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
  const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(-1.7, 0.03, 0);
  ship.add(wake);
  disposables.push(wakeGeometry, wakeMaterial);

  // Bow spray: motes thrown up and forward each time she buries her nose.
  const SPRAY = 46;
  const sprayVel = new Float32Array(SPRAY * 3);
  const sprayLife = new Float32Array(SPRAY);
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPRAY * 3).fill(-100), 3));
  const sprayMaterial = new THREE.PointsMaterial({
    color: new THREE.Color("#eaf4ff"),
    size: 0.075,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const spray = new THREE.Points(sprayGeometry, sprayMaterial);
  ship.add(spray);
  disposables.push(sprayGeometry, sprayMaterial);
  const sprayAttr = sprayGeometry.getAttribute("position") as THREE.BufferAttribute;
  let sprayNext = 0;

  // Storm light: the sails and the sea get lit from above by distant lightning
  // at irregular intervals — the single cheapest thing that makes a seascape
  // feel like weather rather than a screensaver.
  const stormLight = new THREE.PointLight(new THREE.Color("#cfe3ff"), 0, 14, 2);
  stormLight.position.set(0, 4.5, 1.5);
  content.add(stormLight);
  let boltAt = 3.5;
  let boltT = 99;

  const seaAttr = seaWire.getAttribute("position") as THREE.BufferAttribute;
  const foamAttr = foamGeometry.getAttribute("position") as THREE.BufferAttribute;

  // THREE wave trains at different scales, matched between the sea mesh and the
  // ship's motion so the hull sits IN the water rather than hovering over a
  // moving texture. The long swell carries her; the chop crosses it; a fine
  // ripple keeps the lattice from looking like a rubber sheet.
  const waveAt = (x: number, z: number, t: number) =>
    Math.sin(x * 0.62 - t * 0.78) * 0.24
    + Math.sin(z * 0.87 + t * 0.95) * 0.12
    + Math.sin((x + z) * 1.9 - t * 2.4) * 0.035;

  return {
    group,
    update: (t, dt, drive) => {
      const heave = 0.8 + drive * 0.5;
      for (let i = 0; i < seaAttr.count; i += 1) {
        const x = seaBase.getX(i);
        const z = seaBase.getZ(i);
        seaAttr.setY(i, waveAt(x, z, t) * heave);
      }
      seaAttr.needsUpdate = true;

      for (let i = 0; i < FOAM; i += 1) {
        // Foam drifts downwind and wraps, always sitting on the surface.
        const x = ((foamSeeds[i * 2] + t * 0.055) % 1 - 0.5) * SEA_W;
        const z = (foamSeeds[i * 2 + 1] - 0.5) * SEA_W;
        foamAttr.setXYZ(i, x, waveAt(x, z, t) * heave + 0.03, z);
      }
      foamAttr.needsUpdate = true;
      foamMaterial.opacity = 0.34 + Math.sin(t * 1.6) * 0.1 + drive * 0.14;

      // The ship rides the same field: pitch from the slope along its length,
      // roll from the slope across its beam, heave from the height at center.
      const centre = waveAt(0, 0, t) * heave;
      const fore = waveAt(0.9, 0, t) * heave;
      const aft = waveAt(-0.9, 0, t) * heave;
      const port = waveAt(0, 0.5, t) * heave;
      const starboard = waveAt(0, -0.5, t) * heave;
      ship.position.y = -1.5 + centre + 0.1;
      const pitch = Math.atan2(fore - aft, 1.8);
      ship.rotation.z = pitch;
      ship.rotation.x = Math.atan2(port - starboard, 1.0) * 0.7;
      // A slow yaw so she's working across the swell, not locked to camera.
      ship.rotation.y = Math.sin(t * 0.13) * 0.28;

      // Bow spray: when the bow drops through the water she throws water. The
      // trigger is the pitch RATE going nose-down past a threshold, so the
      // spray genuinely coincides with her burying it.
      const bowDrop = -(fore - aft);
      if (bowDrop > 0.16) {
        for (let n = 0; n < 3; n += 1) {
          const i = sprayNext % SPRAY;
          sprayNext += 1;
          sprayLife[i] = 1;
          sprayAttr.setXYZ(i, 1.25, 0.1, (Math.random() - 0.5) * 0.3);
          sprayVel[i * 3] = 0.7 + Math.random() * 0.9;
          sprayVel[i * 3 + 1] = 1.1 + Math.random() * 1.0;
          sprayVel[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
        }
      }
      let sprayAlive = 0;
      for (let i = 0; i < SPRAY; i += 1) {
        if (sprayLife[i] <= 0) continue;
        sprayLife[i] -= dt * 1.5;
        sprayVel[i * 3 + 1] -= dt * 3.4; // gravity
        sprayAttr.setXYZ(
          i,
          sprayAttr.getX(i) + sprayVel[i * 3] * dt,
          sprayAttr.getY(i) + sprayVel[i * 3 + 1] * dt,
          sprayAttr.getZ(i) + sprayVel[i * 3 + 2] * dt
        );
        if (sprayLife[i] <= 0) sprayAttr.setXYZ(i, 0, -100, 0);
        else sprayAlive = Math.max(sprayAlive, sprayLife[i]);
      }
      sprayAttr.needsUpdate = true;
      sprayMaterial.opacity = sprayAlive * 0.7;

      // Distant lightning on an irregular clock: a hard double flash, then
      // dark for anywhere from four to twelve seconds.
      boltT += dt;
      if (boltT > boltAt) {
        boltT = 0;
        boltAt = 4 + Math.random() * 8;
      }
      // Two spikes 90ms apart, then gone — reads as a strike, not a pulse.
      const strike = Math.exp(-boltT * 22) + Math.exp(-Math.max(0, boltT - 0.09) * 16) * 0.7;
      stormLight.intensity = Math.min(1, strike) * 9;

      // Sails belly and luff: a travelling wave across each sheet.
      for (const sail of sails) {
        const attr = sail.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < attr.count; i += 1) {
          const bx = sail.base.getX(i);
          const by = sail.base.getY(i);
          // Zero at the luff and the foot so the sheet stays laced to the yard.
          const grip = Math.cos((bx / 0.55) * 1.2) * Math.cos((by / 0.4) * 0.9);
          attr.setXYZ(
            i,
            bx,
            by,
            (0.13 + Math.sin(t * 1.8 + sail.phase + bx * 2.1) * 0.05) * grip * (0.7 + drive * 0.5)
          );
        }
        attr.needsUpdate = true;
      }
      // The lightning catches the canvas — the sails are the biggest surface
      // she has, so they're what sells the flash.
      sailMaterial.opacity = 0.11 + Math.sin(t * 0.9) * 0.03 + drive * 0.05 + Math.min(1, strike) * 0.3;

      lanternMaterial.opacity = 0.5 + Math.sin(t * 2.3) * 0.16;
      auraMaterial.opacity = 0.1 + Math.sin(t * 0.7) * 0.04;
      seaMaterial.opacity = 0.24 + drive * 0.12 + Math.sin(t * 0.6) * 0.04 + Math.min(1, strike) * 0.22;
      wakeMaterial.opacity = 0.07 + drive * 0.05;
      wake.scale.set(1 + Math.sin(t * 1.1) * 0.06, 1, 1);
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Cyberpunk — a spinner hangs in the rain on ducted fans, its holo   */
/* advert unrolling in the air beside it while a scan beam rakes down. */
/* ------------------------------------------------------------------ */
function spinnerProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const chassis = new THREE.MeshStandardMaterial({
    color: 0x0a0d16,
    roughness: 0.28,
    metalness: 0.9,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.22
  });
  disposables.push(chassis);

  // Body: a low wedge with a canopy — reads as a car that flies, not a plane.
  const bodyGeometry = new THREE.BoxGeometry(1.5, 0.24, 0.72);
  const body = new THREE.Mesh(bodyGeometry, chassis);
  content.add(body);
  const canopyGeometry = new THREE.BoxGeometry(0.66, 0.2, 0.6);
  const canopy = new THREE.Mesh(canopyGeometry, chassis);
  canopy.position.set(0.14, 0.2, 0);
  content.add(canopy);
  const noseGeometry = new THREE.ConeGeometry(0.28, 0.5, 4);
  const nose = new THREE.Mesh(noseGeometry, chassis);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.95, -0.01, 0);
  content.add(nose);
  disposables.push(bodyGeometry, canopyGeometry, noseGeometry);

  // Four ducted fans, spinning fast enough to blur into rings.
  const ductGeometry = new THREE.TorusGeometry(0.24, 0.045, 6, 16);
  const bladeGeometry = new THREE.BoxGeometry(0.42, 0.015, 0.06);
  const fans: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i += 1) {
    const x = i < 2 ? 0.56 : -0.56;
    const z = i % 2 === 0 ? 0.5 : -0.5;
    const duct = new THREE.Mesh(ductGeometry, chassis);
    duct.rotation.x = Math.PI / 2;
    duct.position.set(x, -0.04, z);
    content.add(duct);
    const blade = new THREE.Mesh(bladeGeometry, chassis);
    blade.position.set(x, -0.04, z);
    content.add(blade);
    fans.push(blade);
  }
  disposables.push(ductGeometry, bladeGeometry);

  const glowTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.95), hexToRgba(visual.accent, 0));
  disposables.push(glowTexture);
  // Fan wash underneath each duct.
  const washes: THREE.SpriteMaterial[] = [];
  for (let i = 0; i < 4; i += 1) {
    const x = i < 2 ? 0.56 : -0.56;
    const z = i % 2 === 0 ? 0.5 : -0.5;
    const { sprite, material } = makeGlowSprite(glowTexture, visual.secondary, disposables);
    sprite.position.set(x, -0.3, z);
    sprite.scale.setScalar(0.7);
    content.add(sprite);
    washes.push(material);
  }
  // Headlamps.
  const { sprite: lamp, material: lampMaterial } = makeGlowSprite(glowTexture, visual.accentBright, disposables);
  lamp.position.set(1.15, 0, 0);
  lamp.scale.setScalar(0.8);
  content.add(lamp);

  // The holo advert: a ribbon of light unrolling beside the spinner, made of
  // stacked bars whose brightness chases along it like a scrolling marquee.
  const holo = new THREE.Group();
  holo.position.set(-0.2, 0.9, -0.9);
  content.add(holo);
  const barGeometry = new THREE.PlaneGeometry(1.7, 0.08);
  const BARS = 9;
  const barMaterials: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < BARS; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(i % 3 === 0 ? visual.accentBright : visual.secondary),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false
    });
    const bar = new THREE.Mesh(barGeometry, material);
    bar.position.y = (i - (BARS - 1) / 2) * 0.13;
    bar.scale.x = 0.55 + ((i * 7) % 5) / 8;
    holo.add(bar);
    barMaterials.push(material);
    disposables.push(material);
  }
  disposables.push(barGeometry);

  // Searchlight: a hard cone raking the ground under the nose.
  const beamGeometry = new THREE.ConeGeometry(0.6, 3.2, 16, 1, true);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(visual.accentBright),
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.set(0.6, -1.7, 0);
  content.add(beam);
  disposables.push(beamGeometry, beamMaterial);

  return {
    group,
    update: (t, dt, drive) => {
      // A hover is never still: two out-of-phase drifts plus a slow bank.
      content.position.y = Math.sin(t * 0.83) * 0.14 + Math.sin(t * 1.7) * 0.04;
      content.position.x = Math.sin(t * 0.41) * 0.22;
      content.rotation.z = Math.sin(t * 0.62) * 0.07;
      content.rotation.y = -0.35 + Math.sin(t * 0.29) * 0.16;
      for (const blade of fans) blade.rotation.y += dt * 34 * (0.7 + drive * 0.5);
      const wash = 0.3 + Math.sin(t * 5.4) * 0.08 + drive * 0.14;
      for (const material of washes) material.opacity = wash;
      lampMaterial.opacity = 0.55 + Math.sin(t * 1.3) * 0.12;
      // The marquee scrolls: a bright band chasing up the stack.
      const head = (t * 0.55) % 1;
      barMaterials.forEach((material, i) => {
        const u = i / BARS;
        let d = Math.abs(u - head);
        d = Math.min(d, 1 - d);
        material.opacity = 0.08 + Math.pow(1 - Math.min(1, d * 4.5), 3) * 0.65;
      });
      holo.rotation.y = Math.sin(t * 0.24) * 0.3;
      // The searchlight sweeps, and flickers as if punching through rain.
      beam.rotation.z = Math.sin(t * 0.47) * 0.26;
      beamMaterial.opacity = 0.045 + Math.abs(Math.sin(t * 13.7)) * 0.02;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/* ------------------------------------------------------------------ */
/* East-asian — a tiered pagoda on its own islet, wind bells at every  */
/* eave, petals streaming past on the mountain air.                    */
/* ------------------------------------------------------------------ */
function pagodaProp(visual: ThemeVisual): BuiltProp {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const disposables: Array<{ dispose: () => void }> = [];

  const timber = new THREE.MeshStandardMaterial({
    color: 0x2a1512,
    roughness: 0.7,
    metalness: 0.2,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.14
  });
  const roofing = new THREE.MeshStandardMaterial({
    color: 0x141a22,
    roughness: 0.5,
    metalness: 0.5,
    emissive: new THREE.Color(visual.accent),
    emissiveIntensity: 0.1
  });
  disposables.push(timber, roofing);

  const glowTexture = makeGlowTexture(hexToRgba(visual.accentBright, 0.9), hexToRgba(visual.accent, 0));
  disposables.push(glowTexture);

  // Four tiers, each smaller than the last: the silhouette does all the work.
  const TIERS = 4;
  const eaves: Array<{ sprite: THREE.Sprite; material: THREE.SpriteMaterial; phase: number }> = [];
  const bells: Array<{ mesh: THREE.Mesh; phase: number; y: number }> = [];
  const bellGeometry = new THREE.ConeGeometry(0.045, 0.08, 6);
  disposables.push(bellGeometry);
  for (let i = 0; i < TIERS; i += 1) {
    const s = 1 - i * 0.19;
    const y = -1.2 + i * 0.82;
    const bodyGeometry = new THREE.CylinderGeometry(0.36 * s, 0.4 * s, 0.62, 8);
    const body = new THREE.Mesh(bodyGeometry, timber);
    body.position.y = y;
    content.add(body);
    const roofGeometry = new THREE.ConeGeometry(0.95 * s, 0.3, 4);
    const roof = new THREE.Mesh(roofGeometry, roofing);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + 0.44;
    content.add(roof);
    disposables.push(bodyGeometry, roofGeometry);

    // A lit window per tier, and a bell at each of the four eave corners.
    const { sprite, material } = makeGlowSprite(glowTexture, visual.accentBright, disposables);
    sprite.position.set(0, y, 0.4 * s);
    sprite.scale.setScalar(0.7 * s);
    content.add(sprite);
    eaves.push({ sprite, material, phase: i * 1.3 });

    for (let c = 0; c < 4; c += 1) {
      const a = (c / 4) * Math.PI * 2 + Math.PI / 4;
      const bell = new THREE.Mesh(bellGeometry, roofing);
      bell.position.set(Math.cos(a) * 0.82 * s, y + 0.3, Math.sin(a) * 0.82 * s);
      content.add(bell);
      bells.push({ mesh: bell, phase: i * 2.1 + c * 0.8, y: y + 0.3 });
    }
  }
  // Finial spire.
  const spireGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.7, 5);
  const spire = new THREE.Mesh(spireGeometry, roofing);
  spire.position.y = 2.3;
  content.add(spire);
  const jewelGeometry = new THREE.OctahedronGeometry(0.1, 0);
  const jewel = new THREE.Mesh(jewelGeometry, timber);
  jewel.position.y = 2.7;
  content.add(jewel);
  disposables.push(spireGeometry, jewelGeometry);
  const { sprite: crown, material: crownMaterial } = makeGlowSprite(glowTexture, visual.accentBright, disposables);
  crown.position.y = 2.7;
  crown.scale.setScalar(1.1);
  content.add(crown);

  // Petals on the wind, streaming past the tower and wrapping around.
  const PETALS = 70;
  const petalSeeds = new Float32Array(PETALS * 3);
  for (let i = 0; i < PETALS; i += 1) {
    petalSeeds[i * 3] = (i * 0.618034) % 1;
    petalSeeds[i * 3 + 1] = (i * 0.381966) % 1;
    petalSeeds[i * 3 + 2] = 0.5 + ((i * 13) % 7) / 9;
  }
  const petalGeometry = new THREE.BufferGeometry();
  petalGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PETALS * 3), 3));
  const petalMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(visual.secondary),
    size: 0.09,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const petals = new THREE.Points(petalGeometry, petalMaterial);
  content.add(petals);
  disposables.push(petalGeometry, petalMaterial);
  const petalAttr = petalGeometry.getAttribute("position") as THREE.BufferAttribute;

  return {
    group,
    update: (t, dt, drive) => {
      content.rotation.y = t * 0.09;
      content.position.y = Math.sin(t * 0.5) * 0.13;
      // The wind gusts; bells swing with it and the lanterns breathe.
      const gust = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 0.31 + 0.6)), 2);
      for (const bell of bells) {
        bell.mesh.rotation.z = Math.sin(t * 3.4 + bell.phase) * 0.3 * gust;
        bell.mesh.position.y = bell.y - 0.02 - Math.abs(Math.sin(t * 3.4 + bell.phase)) * 0.01;
      }
      for (const eave of eaves) {
        eave.material.opacity = 0.34 + Math.sin(t * 1.5 + eave.phase) * 0.12;
      }
      crownMaterial.opacity = 0.4 + Math.sin(t * 2.1) * 0.18 + drive * 0.12;
      jewel.rotation.y = t * 1.1;
      for (let i = 0; i < PETALS; i += 1) {
        // Each petal drifts along the wind, sinking and spiralling, wrapping
        // when it leaves the far side.
        const u = (petalSeeds[i * 3] + t * 0.06 * petalSeeds[i * 3 + 2] * (0.6 + gust * 0.8)) % 1;
        const a = petalSeeds[i * 3 + 1] * Math.PI * 2 + u * 2.4;
        const radius = 0.8 + u * 2.6;
        petalAttr.setXYZ(
          i,
          Math.cos(a) * radius,
          2.3 - u * 4.0 + Math.sin(t * 1.4 + i) * 0.1,
          Math.sin(a) * radius
        );
      }
      petalAttr.needsUpdate = true;
      petalMaterial.opacity = 0.42 + gust * 0.2;
    },
    dispose: () => {
      for (const item of disposables) item.dispose();
    }
  };
}

/**
 * Build the theme's signature prop into `scene`, placed for the given
 * context. Returns null for themes with no landmark ("none"). Callers own
 * the frame loop: call `update` each frame and `dispose` on teardown.
 */
export function createThemeProp(
  scene: THREE.Scene,
  visual: ThemeVisual,
  context: ThemePropContext
): ThemeProp | null {
  const placement = PLACEMENTS[context][visual.key];
  if (!placement) return null;
  let built: BuiltProp | null = null;
  switch (visual.key) {
    case "fantasy":
      built = swordProp(visual);
      break;
    case "scifi":
      built = stationProp(visual);
      break;
    case "horror":
      built = candelabraProp(visual);
      break;
    case "noir":
      built = streetlampProp(visual);
      break;
    case "modern":
      built = droneProp(visual);
      break;
    case "western":
      built = tumbleweedProp(visual, context);
      break;
    case "postapoc":
      built = towerProp(visual);
      break;
    // Bespoke silhouettes for the genres whose whole identity is one image:
    // a ghost galleon riding real water, a spinner hanging in the rain, a
    // pagoda ringing in the mountain wind.
    case "pirate":
      built = galleonProp(visual);
      break;
    case "cyberpunk":
      built = spinnerProp(visual);
      break;
    case "eastasian":
      built = pagodaProp(visual);
      break;
    // The remaining sub-genres share a builder with their nearest kin. Every
    // prop takes its colors, dust, and glow straight from `visual`, so the same
    // silhouette recolors completely per theme, and distinct framing (see
    // PLACEMENTS) finishes the separation.
    case "urbanfantasy":
      built = streetlampProp(visual);
      break;
    case "spaceopera":
      built = stationProp(visual);
      break;
    case "gothic":
    case "cozy":
      // Candlelight: dread in a crypt, hearth-warmth in a cottage.
      built = candelabraProp(visual);
      break;
    case "steampunk":
    case "pulp":
      built = towerProp(visual);
      break;
    case "superhero":
      built = droneProp(visual);
      break;
    default:
      built = null;
  }
  if (!built) return null;
  const { group, update, dispose } = built;
  group.position.set(...placement.position);
  group.scale.setScalar(placement.scale);
  scene.add(group);
  return {
    update,
    dispose: () => {
      dispose();
      scene.remove(group);
    }
  };
}
