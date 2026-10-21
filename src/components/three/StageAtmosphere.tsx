"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { AmbienceMood, AmbienceVisual, StageEffectKind } from "@/lib/campaign/types";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";
import { themeGutter } from "@/components/three/themeLayers";
import { createThemeEnvironment } from "@/components/three/themeEnvironments";
import { createMusicPulse } from "@/lib/client/musicPulse";

export type AtmosphereHandle = {
  /** Fire a one-shot particle surge (embers burst, rain squall, fog roll…). */
  burst: (kind: StageEffectKind, strength: number) => void;
  clear: () => void;
};

type MoodRecipe = {
  colors: [string, string];
  /** Base vertical drift per second; positive = rising. */
  drift: number;
  /** Horizontal wander amplitude. */
  wander: number;
  size: number;
  opacity: number;
  count: number;
  fogOpacity: number;
  fogColor: string;
  /** 0..1 — strength of the god-ray shafts falling from above. */
  rays: number;
};

const MOODS: Record<AmbienceMood, MoodRecipe> = {
  calm:    { colors: ["#e8c98a", "#c9a35c"], drift: 0.35,  wander: 0.5, size: 0.05,  opacity: 0.65, count: 240, fogOpacity: 0.10, fogColor: "#3a3222", rays: 0.5 },
  tense:   { colors: ["#8fa8b8", "#5d7683"], drift: 0.18,  wander: 1.4, size: 0.04,  opacity: 0.5,  count: 260, fogOpacity: 0.22, fogColor: "#1d2733", rays: 0.16 },
  adrenaline: { colors: ["#ffd75c", "#4cd9c0"], drift: 1.35, wander: 2.5, size: 0.055, opacity: 0.85, count: 380, fogOpacity: 0.10, fogColor: "#1e2b26", rays: 0.4 },
  battle:  { colors: ["#ffb35c", "#ff5c3c"], drift: 1.5,   wander: 2.0, size: 0.06,  opacity: 0.9,  count: 420, fogOpacity: 0.14, fogColor: "#3a1c12", rays: 0.28 },
  boss:    { colors: ["#ff4c5c", "#8a3cff"], drift: 0.9,   wander: 1.7, size: 0.065, opacity: 0.95, count: 480, fogOpacity: 0.32, fogColor: "#1c0a16", rays: 0.18 },
  mystery: { colors: ["#a98cff", "#5f6cff"], drift: 0.28,  wander: 1.8, size: 0.05,  opacity: 0.6,  count: 300, fogOpacity: 0.30, fogColor: "#221c3d", rays: 0.45 },
  dread:   { colors: ["#6f7787", "#3d4351"], drift: -0.35, wander: 0.6, size: 0.045, opacity: 0.55, count: 300, fogOpacity: 0.38, fogColor: "#0d1017", rays: 0.12 },
  triumph: { colors: ["#ffe08a", "#ffc23c"], drift: 1.1,   wander: 0.8, size: 0.065, opacity: 1.0,  count: 380, fogOpacity: 0.08, fogColor: "#3a2f14", rays: 0.75 },
  wonder:  { colors: ["#8affd8", "#5cc9ff"], drift: 0.45,  wander: 1.2, size: 0.055, opacity: 0.8,  count: 320, fogOpacity: 0.16, fogColor: "#12343a", rays: 0.65 },
  somber:  { colors: ["#aebdd6", "#7385a3"], drift: -0.22, wander: 0.4, size: 0.04,  opacity: 0.5,  count: 220, fogOpacity: 0.26, fogColor: "#151c29", rays: 0.22 },
  outro:   { colors: ["#ffe08a", "#aebdd6"], drift: 0.55,  wander: 0.7, size: 0.055, opacity: 0.85, count: 300, fogOpacity: 0.18, fogColor: "#2a2418", rays: 0.55 }
};

const MAX_PARTICLES = 900;

/**
 * Particle weather the DM can hold on screen (set_ambience visuals). Only one
 * flavour drives the particle field at a time; this is the priority order.
 * "motes" uses the mood's own recipe (gold dust when calm, sparks in battle).
 */
type Flavor = { colors: [string, string]; drift: number; wander: number; size: number; opacity: number; count: number };
const PARTICLE_FLAVORS: Partial<Record<AmbienceVisual, Flavor>> = {
  rain:   { colors: ["#a9bcd4", "#7f93ac"], drift: -9,   wander: 0.2, size: 0.06,  opacity: 0.35, count: 160 },
  snow:   { colors: ["#f6f9ff", "#cfdcef"], drift: -0.8, wander: 1.0, size: 0.07,  opacity: 0.85, count: 420 },
  embers: { colors: ["#ffb35c", "#ff5c2a"], drift: 1.6,  wander: 1.3, size: 0.06,  opacity: 0.9,  count: 320 },
  ash:    { colors: ["#bdb2a4", "#7d756c"], drift: -0.5, wander: 1.0, size: 0.05,  opacity: 0.55, count: 300 }
};
const FLAVOR_ORDER: AmbienceVisual[] = ["rain", "snow", "embers", "ash", "motes"];

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
  // Feather the sides so the shaft has no hard edges.
  ctx.globalCompositeOperation = "destination-in";
  const horizontal = ctx.createLinearGradient(0, 0, 128, 0);
  horizontal.addColorStop(0, "rgba(255,255,255,0)");
  horizontal.addColorStop(0.5, "rgba(255,255,255,1)");
  horizontal.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, 128, 512);
  return new THREE.CanvasTexture(canvas);
}

function makeFogTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.28)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The living air of the host stage, rendered transparently above the painted
 * scene backdrop. By default it is light: the mood's motes, a little fog and
 * soft light shafts. The DM layers weather on top via set_ambience visuals
 * (rain, snow, embers, ash, heavier fog, lightning, stronger light rays, the
 * world overlay), and trigger_effect fires one-shot squalls.
 */
const StageAtmosphere = forwardRef<AtmosphereHandle, { mood: AmbienceMood; intensity: number; theme?: ThemeKey | string | null; visuals?: AmbienceVisual[] }>(
  function StageAtmosphere({ mood, intensity, theme, visuals }, handle) {
    const mountRef = useRef<HTMLDivElement>(null);
    const moodRef = useRef<{ mood: AmbienceMood; intensity: number }>({ mood, intensity });
    moodRef.current = { mood, intensity };
    // Weather the DM has set on top of the light mood baseline.
    const visualsRef = useRef<AmbienceVisual[]>(visuals || []);
    visualsRef.current = visuals || [];
    const burstRef = useRef<{ kind: StageEffectKind; strength: number; at: number } | null>(null);

    useImperativeHandle(handle, () => ({
      burst: (kind, strength) => {
        burstRef.current = { kind, strength, at: performance.now() };
      },
      clear: () => { burstRef.current = null; }
    }));

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
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
      camera.position.set(0, 0, 10);

      // Particle pool — recycled between moods, capacity fixed.
      const positions = new Float32Array(MAX_PARTICLES * 3);
      const seeds = new Float32Array(MAX_PARTICLES * 2);
      const colors = new Float32Array(MAX_PARTICLES * 3);
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 26;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 16;
        positions[i * 3 + 2] = -Math.random() * 8;
        seeds[i * 2] = Math.random() * Math.PI * 2;
        seeds[i * 2 + 1] = 0.5 + Math.random();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 0.05,
        transparent: true,
        vertexColors: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);

      // Fog sheets that slide across the lower half of the stage.
      const fogTexture = makeFogTexture();
      const fogMaterial = new THREE.MeshBasicMaterial({
        map: fogTexture,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
      });
      const fogSheets: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i += 1) {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), fogMaterial.clone());
        sheet.position.set((i - 1) * 8, -4 + i * 1.2, -2 - i);
        fogSheets.push(sheet);
        scene.add(sheet);
      }

      // God rays — slanted shafts of mood-light falling from above.
      const rayTexture = makeRayTexture();
      const rays: Array<{ mesh: THREE.Mesh; seed: number }> = [];
      for (let i = 0; i < 3; i += 1) {
        const material = new THREE.MeshBasicMaterial({
          map: rayTexture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4 + i * 0.9, 20), material);
        mesh.position.set(-6 + i * 5.5, 4.5, -4 - i * 0.8);
        mesh.rotation.z = -0.3 - i * 0.07;
        rays.push({ mesh, seed: Math.random() * Math.PI * 2 });
        scene.add(mesh);
      }

      // Lightning: the whole sky blooms and flickers; no bolt is drawn, so the
      // painting is lit rather than scribbled on.
      const flashMaterial = new THREE.MeshBasicMaterial({
        map: fogTexture,
        color: "#cfe0ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), flashMaterial);
      flash.position.set(0, 3.5, -6);
      scene.add(flash);
      let flashLife = 0;
      let nextFlashAt = 2 + Math.random() * 4;

      // Rain falls as slanted streaks (points read as dust, not rain). Fades
      // in and out with the DM's "rain" visual or a rain burst.
      const RAIN_STREAKS = 420;
      const rainPositions = new Float32Array(RAIN_STREAKS * 6);
      const rainSpeeds = new Float32Array(RAIN_STREAKS);
      for (let i = 0; i < RAIN_STREAKS; i += 1) {
        rainSpeeds[i] = 0.75 + Math.random() * 0.5;
        rainPositions[i * 6] = (Math.random() - 0.5) * 28;
        rainPositions[i * 6 + 1] = (Math.random() - 0.5) * 18;
        rainPositions[i * 6 + 2] = -Math.random() * 6;
      }
      const rainGeometry = new THREE.BufferGeometry();
      rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
      const rainMaterial = new THREE.LineBasicMaterial({
        color: "#b8c8dc",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
      rain.frustumCulled = false;
      scene.add(rain);
      let rainLevel = 0;

      const colorA = new THREE.Color();
      const colorB = new THREE.Color();
      const mixed = new THREE.Color();
      const fogColor = new THREE.Color();
      // The campaign theme leans every mood toward its palette — a "tense"
      // scene glows steel-blue in noir but sickly green in horror.
      const visual = themeVisual(theme);
      const themeTintA = new THREE.Color(visual.accent);
      const themeTintB = new THREE.Color(visual.secondary);
      const themeFog = new THREE.Color(visual.fog);
      const tint = visual.key === "none" ? 0 : 0.28;

      // Beyond the tint, each genre gets motion of its own: a constant wind
      // carried by the theme's dust spec (western sand streams sideways,
      // fantasy embers rise), plus the theme's environment as a light additive
      // overlay (no opaque skylines — the painted backdrop stays the scene),
      // synced to the score through the music pulse.
      const themeWind: [number, number] = [visual.dust.flow[0] * 1.6, visual.dust.flow[1] * 1.2];
      // The theme's own overlay exists only while the DM asks for "world".
      let themeLayer: ReturnType<typeof createThemeEnvironment> = null;
      const pulseReader = createMusicPulse();
      const pickFlavor = (list: AmbienceVisual[]) => FLAVOR_ORDER.find((key) => list.includes(key)) || null;
      let lastFlavor: AmbienceVisual | null = pickFlavor(visualsRef.current);

      const applyMoodColors = () => {
        const recipe = MOODS[moodRef.current.mood] || MOODS.calm;
        const flavor = lastFlavor ? PARTICLE_FLAVORS[lastFlavor] : undefined;
        // Weather keeps its natural colour; mood motes lean to the theme.
        colorA.set((flavor || recipe).colors[0]).lerp(themeTintA, flavor ? 0 : tint);
        colorB.set((flavor || recipe).colors[1]).lerp(themeTintB, flavor ? 0 : tint);
        for (let i = 0; i < MAX_PARTICLES; i += 1) {
          mixed.copy(colorA).lerp(colorB, (i % 7) / 6);
          colors[i * 3] = mixed.r;
          colors[i * 3 + 1] = mixed.g;
          colors[i * 3 + 2] = mixed.b;
        }
        geometry.attributes.color.needsUpdate = true;
        fogColor.set(recipe.fogColor).lerp(themeFog, tint * 0.7);
        for (const sheet of fogSheets) {
          (sheet.material as THREE.MeshBasicMaterial).color.copy(fogColor);
        }
        for (const ray of rays) {
          (ray.mesh.material as THREE.MeshBasicMaterial).color.copy(colorA);
        }
      };
      let lastMood: AmbienceMood | null = null;

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

      const loop = () => {
        frame = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        const { mood: activeMood, intensity: rawIntensity } = moodRef.current;
        const recipe = MOODS[activeMood] || MOODS.calm;
        const level = 0.35 + Math.max(0, Math.min(1, rawIntensity)) * 0.85;
        const pulse = pulseReader.read(dt, t);

        const shown = visualsRef.current;
        const flavorKey = pickFlavor(shown);
        if (activeMood !== lastMood || flavorKey !== lastFlavor) {
          lastMood = activeMood;
          lastFlavor = flavorKey;
          applyMoodColors();
        }
        // Baseline is the mood's own light motes (as before the redesign);
        // DM-set weather replaces them while it lasts.
        const flavor = flavorKey ? PARTICLE_FLAVORS[flavorKey] || recipe : recipe;

        const wantsWorld = shown.includes("world");
        if (wantsWorld && !themeLayer) themeLayer = createThemeEnvironment(scene, visual, { width: 26, height: 18, z: -5, full: false });
        if (!wantsWorld && themeLayer) {
          themeLayer.dispose();
          themeLayer = null;
        }

        // One-shot squalls raise density/speed briefly.
        let surge = 0;
        let surgeKind: StageEffectKind | null = null;
        const burst = burstRef.current;
        if (burst) {
          const age = (performance.now() - burst.at) / 1000;
          if (age < 3.2) {
            surge = Math.sin(Math.min(age / 3.2, 1) * Math.PI) * burst.strength;
            surgeKind = burst.kind;
          } else {
            burstRef.current = null;
          }
        }

        const isRain = surgeKind === "rain" || (!surgeKind && flavorKey === "rain");
        const isSnow = surgeKind === "snow" || (!surgeKind && flavorKey === "snow");
        const base = flavor || recipe;
        const drift = surgeKind === "rain" ? -9 : surgeKind === "snow" ? -0.8 : base.drift * (flavor && flavor !== recipe ? 1 : level) * (1 + surge * 2.5);
        const wander = (isRain ? 0.2 : base.wander) * level;
        const visible = Math.min(
          MAX_PARTICLES,
          Math.floor(base.count * level + surge * 350)
        );

        for (let i = 0; i < MAX_PARTICLES; i += 1) {
          const px = i * 3;
          if (i >= visible) {
            positions[px + 1] = -40; // park off-stage
            continue;
          }
          if (positions[px + 1] <= -39) {
            positions[px] = (Math.random() - 0.5) * 26;
            positions[px + 1] = (Math.random() - 0.5) * 16;
          }
          const speed = seeds[i * 2 + 1];
          positions[px + 1] += (drift + themeWind[1]) * speed * dt;
          positions[px] += Math.sin(t * speed + seeds[i * 2]) * wander * dt + themeWind[0] * speed * dt;
          if (positions[px + 1] > 9) positions[px + 1] = -9;
          if (positions[px + 1] < -9) positions[px + 1] = 9;
          if (positions[px] > 13.5) positions[px] = -13.5;
          if (positions[px] < -13.5) positions[px] = 13.5;
        }
        geometry.attributes.position.needsUpdate = true;

        // Horror candles gutter, wasteland reactors stutter, noir neon buzzes —
        // the theme's flicker personality breathes through every light source.
        const gutter = themeGutter(visual, t);

        material.size = base.size * (isRain && !flavor ? 1.6 : 1) + surge * 0.02;
        material.opacity = (base.opacity * (0.5 + level * 0.5) + surge * 0.25) * (0.75 + gutter * 0.25);

        const rayStrength = shown.includes("lightrays") ? Math.max(recipe.rays, 0.45) : recipe.rays;
        rays.forEach((ray, index) => {
          const material = ray.mesh.material as THREE.MeshBasicMaterial;
          material.opacity = rayStrength * level * (0.16 + 0.1 * Math.sin(t * 0.22 + ray.seed)) * gutter;
          ray.mesh.rotation.z = -0.3 - index * 0.07 + Math.sin(t * 0.08 + ray.seed) * 0.03;
        });

        themeLayer?.update({
          t,
          dt,
          envelope: Math.min(1, 0.35 + level * 0.65) * (0.7 + gutter * 0.3),
          drive: level,
          pulse
        });

        const rainTarget = Math.max(shown.includes("rain") ? 0.6 + level * 0.4 : 0, surgeKind === "rain" ? surge : 0);
        rainLevel += (rainTarget - rainLevel) * Math.min(1, dt * 1.5);
        rain.visible = rainLevel > 0.01;
        if (rain.visible) {
          const count = Math.floor(RAIN_STREAKS * rainLevel);
          const slant = -0.18 + themeWind[0] * 0.05;
          for (let i = 0; i < count; i += 1) {
            const o = i * 6;
            const fall = 19 * rainSpeeds[i] * dt;
            rainPositions[o] += slant * fall;
            rainPositions[o + 1] -= fall;
            if (rainPositions[o + 1] < -9.5) {
              rainPositions[o] = (Math.random() - 0.5) * 28;
              rainPositions[o + 1] = 9.5 + Math.random() * 2;
            }
            if (rainPositions[o] < -14) rainPositions[o] += 28;
            if (rainPositions[o] > 14) rainPositions[o] -= 28;
            const length = 0.55 * rainSpeeds[i];
            rainPositions[o + 3] = rainPositions[o] - slant * length;
            rainPositions[o + 4] = rainPositions[o + 1] + length;
            rainPositions[o + 5] = rainPositions[o + 2];
          }
          rainGeometry.setDrawRange(0, count * 2);
          rainGeometry.attributes.position.needsUpdate = true;
          rainMaterial.opacity = 0.32 * Math.min(1, rainLevel * 1.4) * (1 + flashLife * 0.8);
        }

        const fogBoost = surgeKind === "fog" ? surge * 0.5 : 0;
        const fogBase = (shown.includes("fog") ? Math.max(recipe.fogOpacity, 0.3) : recipe.fogOpacity) * level;
        fogSheets.forEach((sheet, index) => {
          sheet.position.x += dt * (0.25 + index * 0.12) * (index % 2 === 0 ? 1 : -1);
          if (sheet.position.x > 14) sheet.position.x = -14;
          if (sheet.position.x < -14) sheet.position.x = 14;
          (sheet.material as THREE.MeshBasicMaterial).opacity = fogBase + fogBoost;
        });

        // Thunderstorm: strikes on a hard snare when the score is driving,
        // otherwise every few seconds; a double flicker, then a slow fade.
        if (shown.includes("lightning")) {
          nextFlashAt -= dt;
          if ((pulse.snareHit && pulse.snare > 0.75 && flashLife < 0.1) || nextFlashAt <= 0) {
            flashLife = 1;
            nextFlashAt = 4 + Math.random() * 7;
          }
        }
        flashLife = Math.max(0, flashLife - dt * 1.6);
        const flicker = flashLife > 0.82 ? 1 : flashLife > 0.7 ? 0.25 : flashLife > 0.6 ? 0.85 : flashLife * 0.9;
        flashMaterial.opacity = flicker * 0.55;

        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        renderer.dispose();
        geometry.dispose();
        material.dispose();
        fogTexture.dispose();
        fogMaterial.dispose();
        for (const sheet of fogSheets) {
          sheet.geometry.dispose();
          (sheet.material as THREE.Material).dispose();
        }
        rayTexture.dispose();
        for (const ray of rays) {
          ray.mesh.geometry.dispose();
          (ray.mesh.material as THREE.Material).dispose();
        }
        themeLayer?.dispose();
        flash.geometry.dispose();
        rainGeometry.dispose();
        rainMaterial.dispose();
        flashMaterial.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
    }, [theme]);

    return <div ref={mountRef} className="atmosphere-canvas" aria-hidden />;
  }
);

export default StageAtmosphere;
