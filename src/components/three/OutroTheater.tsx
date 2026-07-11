"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CampaignEnding, EndingKind, EndingStat, Player } from "@/lib/campaign/types";
import { accentColor } from "@/lib/client/api";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";

/**
 * Every ending kind gets its own finale choreography — the same instruments
 * (vortex, sigil ring, god rays, shockwaves, streaks, camera) tuned into six
 * very different last images:
 *
 *   victory     – a golden ascension: particles spiral upward, shockwave
 *                 rings bloom, comets cross the sky, the sigil blazes.
 *   defeat      – ash falls, the light dies, the great ring slowly collapses.
 *   bittersweet – gold and cold blue share the sky; lanterns drift up gently.
 *   escape      – everything streams sideways past the camera; the ring
 *                 recedes behind the fleeing party.
 *   draw        – two mirrored rings counter-rotate in perfect balance;
 *                 half the sky turns one way, half the other.
 *   cliffhanger – the vortex keeps stalling mid-turn, the ring is unfinished,
 *                 and the whole sky flickers like a film about to snap.
 */
type FinaleRecipe = {
  label: string;
  fin: string;
  colors: [string, string];
  /** Deep background tint behind the canvas. */
  deep: string;
  /** Tangential vortex speed (radians/s at speed seed 1). */
  swirl: number;
  /** Vertical drift per second; positive = rising. */
  lift: number;
  /** Lateral wind per second (escape's sideways rush). */
  sweep: number;
  turbulence: number;
  rays: number;
  /** Fraction of the sigil circle that gets drawn (cliffhanger < 1). */
  ringArc: number;
  ringSpin: number;
  /** Per-second scale factor applied to the ring (defeat collapses it). */
  ringCollapse: number;
  /** Seconds between shockwave rings; 0 = never. */
  burstEvery: number;
  /** Seconds between comet streaks; 0 = never. */
  streakEvery: number;
  /** Streak heading (unit-ish direction, x/y). */
  streakDir: [number, number];
  /** Camera drift per second. */
  camDrift: [number, number, number];
  /** 1 = the cliffhanger stall-and-flicker cycle is active. */
  flicker: number;
  /** True = split the field into two counter-rotating halves (draw). */
  mirrored: boolean;
  particleSize: number;
  opacity: number;
};

const FINALES: Record<EndingKind, FinaleRecipe> = {
  victory: {
    label: "Victory", fin: "✦ FIN ✦",
    colors: ["#ffe6a8", "#ffb84d"], deep: "#120c04",
    swirl: 0.85, lift: 0.6, sweep: 0, turbulence: 0.8, rays: 1,
    ringArc: 1, ringSpin: 0.14, ringCollapse: 0, burstEvery: 4.5,
    streakEvery: 1.4, streakDir: [0.7, 0.55], camDrift: [0, 0.12, 0],
    flicker: 0, mirrored: false, particleSize: 0.075, opacity: 0.95
  },
  defeat: {
    label: "Defeat", fin: "✦ FIN ✦",
    colors: ["#8a8f9c", "#ff5c3c"], deep: "#080304",
    swirl: 0.12, lift: -0.55, sweep: 0, turbulence: 0.35, rays: 0.12,
    ringArc: 1, ringSpin: 0.03, ringCollapse: 0.02, burstEvery: 0,
    streakEvery: 0, streakDir: [0, -1], camDrift: [0, -0.08, 0],
    flicker: 0, mirrored: false, particleSize: 0.055, opacity: 0.7
  },
  bittersweet: {
    label: "Bittersweet", fin: "✦ FIN ✦",
    colors: ["#ffd98a", "#9ec8ff"], deep: "#0a0a10",
    swirl: 0.4, lift: 0.32, sweep: 0, turbulence: 0.55, rays: 0.55,
    ringArc: 1, ringSpin: 0.08, ringCollapse: 0, burstEvery: 9,
    streakEvery: 4.5, streakDir: [0.5, 0.5], camDrift: [0, 0.06, 0],
    flicker: 0, mirrored: false, particleSize: 0.065, opacity: 0.85
  },
  escape: {
    label: "Escape", fin: "✦ FIN ✦",
    colors: ["#a8ecff", "#f2fbff"], deep: "#040a10",
    swirl: 0.22, lift: 0.08, sweep: 3.2, turbulence: 0.5, rays: 0.3,
    ringArc: 1, ringSpin: 0.06, ringCollapse: 0, burstEvery: 0,
    streakEvery: 0.8, streakDir: [1, 0.08], camDrift: [0, 0, 0.14],
    flicker: 0, mirrored: false, particleSize: 0.06, opacity: 0.85
  },
  draw: {
    label: "Stalemate", fin: "THE SCALES REST EVEN",
    colors: ["#d9dde6", "#c9a35c"], deep: "#090a0e",
    swirl: 0.5, lift: 0.14, sweep: 0, turbulence: 0.4, rays: 0.4,
    ringArc: 1, ringSpin: 0.07, ringCollapse: 0, burstEvery: 0,
    streakEvery: 0, streakDir: [0, 1], camDrift: [0, 0, 0],
    flicker: 0, mirrored: true, particleSize: 0.06, opacity: 0.8
  },
  cliffhanger: {
    label: "To Be Continued", fin: "TO BE CONTINUED…",
    colors: ["#b18cff", "#ff4fa8"], deep: "#0a0512",
    swirl: 0.75, lift: 0.28, sweep: 0, turbulence: 1.1, rays: 0.35,
    ringArc: 0.72, ringSpin: 0.16, ringCollapse: 0, burstEvery: 0,
    streakEvery: 3, streakDir: [0.6, 0.7], camDrift: [0.04, 0, -0.05],
    flicker: 1, mirrored: false, particleSize: 0.07, opacity: 0.9
  }
};

const VORTEX_COUNT = 1800;
const STAR_COUNT = 500;

/** Tall soft-edged shaft, bright at the top, dissolving downward. */
function makeRayTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const vertical = ctx.createLinearGradient(0, 0, 0, 512);
  vertical.addColorStop(0, "rgba(255,255,255,0.7)");
  vertical.addColorStop(0.65, "rgba(255,255,255,0.18)");
  vertical.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 128, 512);
  ctx.globalCompositeOperation = "destination-in";
  const horizontal = ctx.createLinearGradient(0, 0, 128, 0);
  horizontal.addColorStop(0, "rgba(255,255,255,0)");
  horizontal.addColorStop(0.5, "rgba(255,255,255,1)");
  horizontal.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, 128, 512);
  return new THREE.CanvasTexture(canvas);
}

/** Thin expanding shockwave circle. */
function makeShockTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 96, 128, 128, 122);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.65, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/** Comet streak — a hot head trailing off to nothing. */
function makeStreakTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.75, "rgba(255,255,255,0.35)");
  gradient.addColorStop(0.96, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 32);
  ctx.globalCompositeOperation = "destination-in";
  const vertical = ctx.createLinearGradient(0, 0, 0, 32);
  vertical.addColorStop(0, "rgba(255,255,255,0)");
  vertical.addColorStop(0.5, "rgba(255,255,255,1)");
  vertical.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 256, 32);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The Grand Sigil — the campaign theme's glyph alphabet arranged in a great
 * circle, with concentric orbit lines. `arc` < 1 leaves the circle unfinished
 * (the cliffhanger's broken seal).
 */
function makeSigilTexture(glyphs: string, glyphFont: string, arc: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const cx = 512;
  const cy = 512;
  const sweep = Math.PI * 2 * arc;
  const start = -Math.PI / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 430, start, start + sweep);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(cx, cy, 330, start, start + sweep);
  ctx.stroke();

  const letters = glyphs.split("");
  const count = Math.max(letters.length, 12);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = glyphFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < count; i += 1) {
    const fraction = i / count;
    if (fraction > arc) continue;
    const angle = start + fraction * Math.PI * 2;
    const glyph = letters[i % letters.length];
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * 382, cy + Math.sin(angle) * 382);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(glyph, 0, 0);
    ctx.restore();
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * The final cinematic. A full-screen Three.js finale choreographed by the
 * ending kind and tinted by the campaign theme, beneath a staged credits
 * scroll: kind → title → epilogue → highlights → stats board → cast → fin.
 */
export default function OutroTheater({
  ending,
  players,
  campaignTitle,
  theme,
  onExit
}: {
  ending: CampaignEnding;
  players: Player[];
  campaignTitle: string;
  theme?: ThemeKey | string | null;
  onExit?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const kind: EndingKind = FINALES[ending.kind] ? ending.kind : "bittersweet";
  const recipe = FINALES[kind];
  const visual = themeVisual(theme);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 90);
    const camBase = new THREE.Vector3(0, 0, 16);
    camera.position.copy(camBase);

    // Theme tint — the finale's palette leans toward the campaign's colors,
    // so a scifi victory blazes cyan-gold while a western one burns amber.
    const tint = visual.key === "none" ? 0 : 0.25;
    const colorA = new THREE.Color(recipe.colors[0]).lerp(new THREE.Color(visual.accentBright), tint);
    const colorB = new THREE.Color(recipe.colors[1]).lerp(new THREE.Color(visual.secondary), tint);

    /* ---------------- Distant starfield ---------------- */
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      starPositions[i * 3] = (Math.random() - 0.5) * 70;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 44;
      starPositions[i * 3 + 2] = -18 - Math.random() * 30;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: 0.05,
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    /* ---------------- The finale vortex ---------------- */
    // Particles live in cylinder coordinates (angle, radius, height) around
    // the vertical axis; each kind writes a different motion into them.
    const angles = new Float32Array(VORTEX_COUNT);
    const radii = new Float32Array(VORTEX_COUNT);
    const heights = new Float32Array(VORTEX_COUNT);
    const seeds = new Float32Array(VORTEX_COUNT);
    const positions = new Float32Array(VORTEX_COUNT * 3);
    const colors = new Float32Array(VORTEX_COUNT * 3);
    const mixed = new THREE.Color();
    for (let i = 0; i < VORTEX_COUNT; i += 1) {
      angles[i] = Math.random() * Math.PI * 2;
      radii[i] = 1.5 + Math.pow(Math.random(), 0.7) * 11;
      heights[i] = (Math.random() - 0.5) * 18;
      seeds[i] = 0.4 + Math.random() * 1.2;
      // Draw splits the sky into two clean camps; everything else blends.
      const blend = recipe.mirrored ? (i % 2) : (i % 9) / 8;
      mixed.copy(colorA).lerp(colorB, blend);
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }
    const vortexGeometry = new THREE.BufferGeometry();
    vortexGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    vortexGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const vortexMaterial = new THREE.PointsMaterial({
      size: recipe.particleSize,
      transparent: true,
      vertexColors: true,
      opacity: recipe.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const vortex = new THREE.Points(vortexGeometry, vortexMaterial);
    scene.add(vortex);

    /* ---------------- The Grand Sigil rings ---------------- */
    const sigilTexture = makeSigilTexture(visual.glyphs, visual.glyphFont, recipe.ringArc);
    const outerRingMaterial = new THREE.MeshBasicMaterial({
      map: sigilTexture,
      transparent: true,
      opacity: 0.55,
      color: colorA,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const outerRing = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), outerRingMaterial);
    outerRing.position.set(0, 0, -6);
    scene.add(outerRing);

    const innerRingMaterial = outerRingMaterial.clone();
    innerRingMaterial.opacity = 0.32;
    innerRingMaterial.color = colorB;
    // Draw's twin ring matches the outer one — two equal seals in balance.
    const innerSize = recipe.mirrored ? 13 : 8;
    const innerRing = new THREE.Mesh(new THREE.PlaneGeometry(innerSize, innerSize), innerRingMaterial);
    innerRing.position.set(0, 0, -5.4);
    scene.add(innerRing);

    /* ---------------- God rays ---------------- */
    const rayTexture = makeRayTexture();
    const rays: Array<{ mesh: THREE.Mesh; seed: number }> = [];
    for (let i = 0; i < 4; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: rayTexture,
        transparent: true,
        opacity: 0,
        color: colorA,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6 + i * 1.1, 26), material);
      mesh.position.set(-8 + i * 5.4, 5.5, -7 - i * 0.6);
      mesh.rotation.z = -0.32 - i * 0.06;
      rays.push({ mesh, seed: Math.random() * Math.PI * 2 });
      scene.add(mesh);
    }

    /* ---------------- Shockwave rings ---------------- */
    const shockTexture = makeShockTexture();
    const shocks: Array<{ mesh: THREE.Mesh; born: number }> = [];
    for (let i = 0; i < 4; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: shockTexture,
        transparent: true,
        opacity: 0,
        color: colorA,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.position.set(0, 0, -4);
      shocks.push({ mesh, born: -1 });
      scene.add(mesh);
    }

    /* ---------------- Comet streaks ---------------- */
    const streakTexture = makeStreakTexture();
    const streaks: Array<{ mesh: THREE.Mesh; born: number; velocity: THREE.Vector2 }> = [];
    for (let i = 0; i < 8; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: streakTexture,
        transparent: true,
        opacity: 0,
        color: i % 2 ? colorB : colorA,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.28), material);
      streaks.push({ mesh, born: -1, velocity: new THREE.Vector2() });
      scene.add(mesh);
    }

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    let frame = 0;
    let nextShock = 1.2;
    let nextStreak = 0.8;
    let ringScale = 1;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // Cliffhanger cycle: every five seconds the whole finale stalls for a
      // heartbeat — motion freezes, the light gutters — then lurches onward.
      let speedMul = 1;
      let lightMul = 1;
      if (recipe.flicker > 0) {
        const phase = t % 5;
        if (phase < 0.55) {
          speedMul = 0.06;
          lightMul = 0.45 + Math.random() * 0.4;
        }
      }

      for (let i = 0; i < VORTEX_COUNT; i += 1) {
        const seed = seeds[i];
        const direction = recipe.mirrored && i % 2 ? -1 : 1;
        angles[i] += recipe.swirl * seed * direction * dt * speedMul;
        heights[i] += recipe.lift * seed * dt * speedMul;
        radii[i] += Math.sin(t * 0.35 + seed * 9) * recipe.turbulence * 0.25 * dt;
        if (heights[i] > 10) heights[i] = -10;
        if (heights[i] < -10) heights[i] = 10;
        if (radii[i] < 1.2) radii[i] = 12;
        if (radii[i] > 12.8) radii[i] = 1.4;
        const px = i * 3;
        positions[px] = Math.cos(angles[i]) * radii[i];
        positions[px + 1] = heights[i] + Math.sin(t * seed + angles[i]) * recipe.turbulence * 0.3;
        positions[px + 2] = Math.sin(angles[i]) * radii[i] * 0.55 - 3;
        if (recipe.sweep) {
          // Escape: the sky itself streams past the fleeing camera.
          positions[px] = ((positions[px] + t * recipe.sweep * seed + 17) % 34) - 17;
        }
      }
      vortexGeometry.attributes.position.needsUpdate = true;
      vortexMaterial.opacity = recipe.opacity * lightMul;

      // The great seal turns; defeat lets it slowly fall inward and fade.
      if (recipe.ringCollapse > 0) {
        ringScale = Math.max(0.12, ringScale - recipe.ringCollapse * dt);
        outerRingMaterial.opacity = 0.55 * ringScale * lightMul;
        innerRingMaterial.opacity = 0.32 * ringScale * lightMul;
      } else {
        const breathe = 1 + Math.sin(t * 0.4) * 0.02;
        ringScale = breathe;
        outerRingMaterial.opacity = (0.42 + Math.sin(t * 0.7) * 0.12) * lightMul;
        innerRingMaterial.opacity = (0.24 + Math.sin(t * 0.9 + 1.7) * 0.08) * lightMul;
      }
      outerRing.scale.setScalar(ringScale);
      innerRing.scale.setScalar(recipe.mirrored ? ringScale : ringScale * 0.98);
      outerRing.rotation.z += recipe.ringSpin * dt * speedMul;
      innerRing.rotation.z -= recipe.ringSpin * 1.6 * dt * speedMul;

      rays.forEach((ray, index) => {
        const material = ray.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = recipe.rays * (0.14 + 0.1 * Math.sin(t * 0.24 + ray.seed)) * lightMul;
        ray.mesh.rotation.z = -0.32 - index * 0.06 + Math.sin(t * 0.09 + ray.seed) * 0.04;
      });

      // Shockwaves — victory's blooming rings of light.
      if (recipe.burstEvery > 0 && t >= nextShock) {
        nextShock = t + recipe.burstEvery;
        const idle = shocks.find((shock) => shock.born < 0);
        if (idle) idle.born = t;
      }
      for (const shock of shocks) {
        if (shock.born < 0) continue;
        const age = (t - shock.born) / 2.6;
        if (age >= 1) {
          shock.born = -1;
          (shock.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
          continue;
        }
        const size = 1.5 + age * 20;
        shock.mesh.scale.setScalar(size);
        (shock.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * 0.5 * lightMul;
      }

      // Comet streaks.
      if (recipe.streakEvery > 0 && t >= nextStreak) {
        nextStreak = t + recipe.streakEvery * (0.6 + Math.random() * 0.8);
        const idle = streaks.find((streak) => streak.born < 0);
        if (idle) {
          idle.born = t;
          const [dx, dy] = recipe.streakDir;
          idle.velocity.set(
            (dx + (Math.random() - 0.5) * 0.4) * (Math.random() < 0.5 && !recipe.sweep ? -1 : 1),
            dy + (Math.random() - 0.5) * 0.4
          ).normalize().multiplyScalar(14 + Math.random() * 8);
          idle.mesh.position.set(
            -idle.velocity.x * 0.9 + (Math.random() - 0.5) * 10,
            -idle.velocity.y * 0.9 + (Math.random() - 0.5) * 7,
            -5 - Math.random() * 4
          );
          idle.mesh.rotation.z = Math.atan2(idle.velocity.y, idle.velocity.x);
        }
      }
      for (const streak of streaks) {
        if (streak.born < 0) continue;
        const age = (t - streak.born) / 1.4;
        if (age >= 1) {
          streak.born = -1;
          (streak.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
          continue;
        }
        streak.mesh.position.x += streak.velocity.x * dt;
        streak.mesh.position.y += streak.velocity.y * dt;
        (streak.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * 0.8 * lightMul;
      }

      // A slow cinematic dolly, easing out as the credits settle.
      const drift = Math.min(t, 24);
      camera.position.set(
        camBase.x + recipe.camDrift[0] * drift + Math.sin(t * 0.11) * 0.35,
        camBase.y + recipe.camDrift[1] * drift + Math.sin(t * 0.07 + 2) * 0.25,
        camBase.z + recipe.camDrift[2] * drift
      );
      camera.lookAt(0, 0, -4);
      camera.fov = 55 + Math.sin(t * 0.1) * 1.5;
      camera.updateProjectionMatrix();

      stars.rotation.z += dt * 0.004;

      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      vortexGeometry.dispose();
      vortexMaterial.dispose();
      sigilTexture.dispose();
      outerRing.geometry.dispose();
      outerRingMaterial.dispose();
      innerRing.geometry.dispose();
      innerRingMaterial.dispose();
      rayTexture.dispose();
      for (const ray of rays) {
        ray.mesh.geometry.dispose();
        (ray.mesh.material as THREE.Material).dispose();
      }
      shockTexture.dispose();
      for (const shock of shocks) {
        shock.mesh.geometry.dispose();
        (shock.mesh.material as THREE.Material).dispose();
      }
      streakTexture.dispose();
      for (const streak of streaks) {
        streak.mesh.geometry.dispose();
        (streak.mesh.material as THREE.Material).dispose();
      }
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // Rebuild the whole finale when the ending kind or theme changes (debug gallery).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visual.key]);

  /* ---------------- Staged credits sequence ---------------- */
  const highlights = ending.highlights || [];
  const stats: EndingStat[] = ending.stats || [];
  // Each block fades in after the previous one; delays accumulate down the reel.
  const delays = useMemo(() => {
    let at = 0.5;
    const next = (gap: number) => {
      const value = at;
      at += gap;
      return value;
    };
    return {
      kicker: next(0.5),
      kind: next(0.7),
      title: next(1.1),
      summary: next(1.1),
      highlights: next(highlights.length * 0.4 + (highlights.length ? 0.5 : 0)),
      stats: next(stats.length ? 1.1 : 0),
      cast: next(players.length ? 1 : 0),
      fin: next(0.8),
      leave: at
    };
  }, [highlights.length, stats.length, players.length]);

  const rise = (delay: number) => ({ animationDelay: `${delay}s` });

  return (
    <div
      className={`outro-theater outro-${kind}`}
      style={{ background: `radial-gradient(ellipse at 50% 42%, ${recipe.deep} 0%, #020306 100%)` }}
      onClick={(event) => event.stopPropagation()}
    >
      <div ref={mountRef} className="outro-canvas" aria-hidden />
      <div className="outro-scroll">
        <div className="outro-content">
          <span className="outro-kicker outro-rise" style={rise(delays.kicker)}>{campaignTitle}</span>
          <div className="outro-kind outro-rise" style={rise(delays.kind)}>{recipe.label}</div>
          <h1 className="outro-title outro-rise" style={rise(delays.title)}>{ending.title}</h1>
          <p className="outro-summary outro-rise" style={rise(delays.summary)}>{ending.summary}</p>
          {highlights.length ? (
            <ul className="outro-highlights">
              {highlights.map((highlight, index) => (
                <li key={index} className="outro-rise" style={rise(delays.highlights + index * 0.4)}>{highlight}</li>
              ))}
            </ul>
          ) : null}
          {stats.length ? (
            <div className="outro-stats">
              {stats.map((stat, index) => (
                <div key={index} className="outro-stat outro-rise" style={rise(delays.stats + index * 0.18)}>
                  <span className="outro-stat-value">{stat.value}</span>
                  <span className="outro-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {players.length ? (
            <div className="outro-cast outro-rise" style={rise(delays.cast)}>
              <h3>The Party</h3>
              {players.map((player) => (
                <div key={player.id} className="outro-cast-line">
                  <span className="outro-cast-character" style={{ color: accentColor(player.color) }}>
                    {player.characterName || player.name}
                  </span>
                  {player.characterName ? <span className="outro-cast-player">{player.name}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="outro-fin outro-rise" style={rise(delays.fin)}>{recipe.fin}</div>
          {onExit ? (
            <button className="ghost-button outro-leave outro-rise" style={rise(delays.leave)} onClick={onExit}>
              Leave the table (keeps the saga)
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
