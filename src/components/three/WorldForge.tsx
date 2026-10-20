"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createMusicPulse } from "@/lib/client/musicPulse";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";
import { createWorldBackdrop } from "@/components/three/worldBackdrop";
import { createLandmark } from "@/components/three/landmarks";
import { createD20, createIsland } from "@/components/three/forgeWorld";
import {
  TAU,
  approach,
  clamp01,
  createParticles,
  createRingPool,
  createTracker,
  easeOutCubic,
  glowSprite,
  glowTexture,
  lerp,
  mulberry32,
  hashString,
  shapeAtlasTexture,
  smooth
} from "@/components/three/sceneKit";

/* ═══════════════════════════════════════════════════════════════════════════
   THE WORLDFORGE — acts one and two of every saga's arc.

   One stage for both: a floating island in the void, the campaign's
   LANDMARK standing on it (a wizard's spire, a lighthouse, an arcology…, see
   landmarks.ts), and over it THE D20 — the forge that makes the world.
   Behind it all, the theme's own environment is woven into the sky with that
   genre's pattern (worldBackdrop.ts).

     LOBBY    The island lies in pieces, its sectors drifting in the dark;
              the landmark hangs over the gap as a ghost of thread; the D20
              turns slowly, dark. Every hero who takes a seat sends a comet
              into the die: one more face ignites and the die turns to show
              the number it just lit. As the table fills the shards close in
              and the glimpse of the world behind them widens.

     WEAVING  `progress` (0..1, monotonic) forges it. The sectors fly home
              and lock with a spark; the die spins up and casts threads of
              light down to a nib that traces the landmark's outline; matter
              fills in behind the thread; windows light; the world is woven
              into the sky around it. Every face of the die burns brighter
              as the weave climbs.

     COMPLETE At 100% the finale waits for a downbeat — then the die SLAMS
              round to show a 20, a shockwave breaks across the island and
              the landmark comes alive (the windmill turns, the bell swings,
              the beam sweeps the sea).

   Act three is OutroTheater: the same island, landmark and die — and the die
   rolls the world's fate.
   ═══════════════════════════════════════════════════════════════════════ */

/** How hard each genre answers each drum voice (orchestral swells vs. synth kits). */
type Flavor = { kick: number; snare: number; hat: number; swell: number };
export const FLAVOR: Record<ThemeKey, Flavor> = {
  none: { kick: 1, snare: 0.8, hat: 0.7, swell: 0.8 },
  fantasy: { kick: 0.85, snare: 0.6, hat: 1.1, swell: 1.5 },
  scifi: { kick: 1.2, snare: 1.1, hat: 1.5, swell: 0.7 },
  horror: { kick: 0.6, snare: 1.3, hat: 0.35, swell: 1.6 },
  noir: { kick: 0.6, snare: 1.45, hat: 1.2, swell: 0.9 },
  modern: { kick: 1.25, snare: 1.0, hat: 1.0, swell: 0.8 },
  western: { kick: 1.3, snare: 1.15, hat: 0.5, swell: 0.9 },
  postapoc: { kick: 1.45, snare: 1.6, hat: 0.6, swell: 0.7 },
  cyberpunk: { kick: 1.6, snare: 1.3, hat: 1.6, swell: 0.6 },
  spaceopera: { kick: 0.9, snare: 0.7, hat: 0.9, swell: 1.8 },
  gothic: { kick: 1.0, snare: 0.85, hat: 0.5, swell: 1.7 },
  urbanfantasy: { kick: 1.15, snare: 1.2, hat: 1.15, swell: 1.1 },
  steampunk: { kick: 1.25, snare: 1.05, hat: 1.35, swell: 0.85 },
  pirate: { kick: 1.4, snare: 1.25, hat: 0.7, swell: 1.25 },
  eastasian: { kick: 1.5, snare: 1.2, hat: 1.2, swell: 1.2 },
  superhero: { kick: 1.3, snare: 1.25, hat: 1.0, swell: 1.55 },
  pulp: { kick: 1.2, snare: 1.4, hat: 0.85, swell: 1.35 },
  cozy: { kick: 0.6, snare: 0.55, hat: 0.9, swell: 1.15 }
};

export const ISLAND_Y = -1.6;

export default function WorldForge({
  mode = "weaving",
  progress = 0,
  drama = 0.5,
  arrivals = 0,
  accent,
  theme = "none",
  title = ""
}: {
  /** "lobby": the shards drift, charged by `drama`. "weaving": `progress` forges the world. */
  mode?: "lobby" | "weaving";
  /** 0..1, monotonic — how much of the world is forged. */
  progress?: number;
  /** Lobby charge (players seated); 0..1-ish. */
  drama?: number;
  /**
   * Lobby: a monotonically rising count of seated heroes. Every INCREASE sends
   * a comet into the D20, which lights one more face and turns to show it.
   * A fresh mount adopts the current count silently.
   */
  arrivals?: number;
  accent?: string;
  theme?: ThemeKey | string | null;
  /** Weaving only: drawn into the in-scene readout (kicker + title + percent). */
  title?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const dramaRef = useRef(drama);
  dramaRef.current = drama;
  const arrivalsRef = useRef(arrivals);
  arrivalsRef.current = arrivals;
  // Ref, not an effect dep: a sealed campaign's title is revealed mid-finale,
  // and rebuilding the whole scene for a caption change would reset the world.
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visual = themeVisual(theme);
    const isLobby = mode === "lobby";
    const flavor = FLAVOR[visual.key] || FLAVOR.none;
    const rand = mulberry32(hashString(visual.key) ^ 0x10070);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    mount.appendChild(renderer.domElement);

    const tracker = createTracker();
    const backdrop = createWorldBackdrop(visual);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    camera.position.set(0, 4, 19);
    scene.add(camera);
    // The sky is composed for a frontal view; it gets its own camera that
    // only parallaxes a little as the main one swings round the island.
    const skyCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    skyCamera.position.set(0, 0.4, 11);

    const accentColor = new THREE.Color(accent || visual.accent);
    const bright = new THREE.Color(visual.accentBright);
    const secondary = new THREE.Color(visual.secondary);
    const white = new THREE.Color("#ffffff");
    const glow = tracker.track(glowTexture());
    const atlas = tracker.track(shapeAtlasTexture());
    const rootStyle = getComputedStyle(document.documentElement);
    const displayFont = rootStyle.getPropertyValue("--font-display").trim() || "serif";

    /* -- light ---------------------------------------------------------------- */
    scene.add(new THREE.AmbientLight(new THREE.Color(visual.ambient), 0.7));
    const key = new THREE.DirectionalLight(new THREE.Color("#ffffff").lerp(bright, 0.3), 1.0);
    key.position.set(5, 9, 8);
    scene.add(key);
    const underLight = new THREE.PointLight(accentColor, 0, 30, 1.6);
    underLight.position.set(0, ISLAND_Y - 5, 2);
    scene.add(underLight);
    const forgeLight = new THREE.PointLight(bright, 0, 40, 1.4);
    scene.add(forgeLight);

    /* -- the island ------------------------------------------------------------ */
    const island = createIsland(visual, tracker, rand);
    island.group.position.y = ISLAND_Y;
    scene.add(island.group);

    /* -- the landmark on it ------------------------------------------------------ */
    const landmark = createLandmark(visual, tracker, { glow, atlas }, { thick: true, ground: false });
    const lmScale = Math.min(0.95, 11.2 / landmark.width, 6.4 / landmark.height);
    landmark.group.scale.setScalar(lmScale);
    landmark.group.position.set(0, ISLAND_Y + 0.02, 0);
    scene.add(landmark.group);

    /* -- the D20 forge ------------------------------------------------------------ */
    const d20 = createD20(visual, tracker, 1.05, glow, displayFont);
    const D20_Y = ISLAND_Y + landmark.height * lmScale + 2.1;
    d20.group.position.set(0, D20_Y, 0);
    scene.add(d20.group);
    forgeLight.position.set(0, D20_Y, 1.5);

    /* -- forge threads: jittered strands from the die down to the nib ------------ */
    const THREADS = 3;
    const THREAD_PTS = 18;
    const threads = Array.from({ length: THREADS }, (_, i) => {
      const positions = new Float32Array(THREAD_PTS * 3);
      const geometry = tracker.track(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = tracker.track(new THREE.LineBasicMaterial({ color: i === 0 ? bright : i === 1 ? accentColor : secondary, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 18;
      scene.add(line);
      return { positions, attr: geometry.getAttribute("position") as THREE.BufferAttribute, material, seed: rand() * 10 };
    });

    /* -- motes, sparks, rings -------------------------------------------------------- */
    const motes = createParticles(tracker, atlas, 900);
    motes.points.renderOrder = 17;
    scene.add(motes.points);
    const rings = createRingPool(tracker, 8, 1.5);
    rings.group.children.forEach((child) => { child.renderOrder = 18; });
    scene.add(rings.group);
    const moteShape = (["fantasy", "eastasian", "cozy", "spaceopera"].includes(visual.key) ? 3
      : ["scifi", "cyberpunk", "modern"].includes(visual.key) ? 2 : 0) as 0 | 2 | 3;
    const flash = glowSprite(tracker, glow, bright, 0);
    flash.renderOrder = 25;
    scene.add(flash);
    const nibGlow = glowSprite(tracker, glow, bright, 0);
    nibGlow.renderOrder = 16;
    scene.add(nibGlow);
    const comet = glowSprite(tracker, glow, bright, 0);
    comet.renderOrder = 25;
    scene.add(comet);

    /* -- the in-scene readout (weaving) ------------------------------------------------ */
    const readoutCanvas = document.createElement("canvas");
    readoutCanvas.width = 1024;
    readoutCanvas.height = 380;
    const readoutCtx = readoutCanvas.getContext("2d")!;
    const readoutTexture = tracker.track(new THREE.CanvasTexture(readoutCanvas));
    readoutTexture.colorSpace = THREE.SRGBColorSpace;
    let drawnPercent = -1;
    let drawnTitle: string | null = null;
    const accentHex = `#${accentColor.getHexString()}`;
    const drawReadout = (pct: number, titleText: string) => {
      const ctx = readoutCtx;
      ctx.clearRect(0, 0, 1024, 380);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const spacing = (value: string) => {
        try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value; } catch { /* older canvas */ }
      };
      spacing("9px");
      ctx.font = `600 26px ${displayFont}`;
      ctx.fillStyle = accentHex;
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 12;
      ctx.fillText(visual.copy.kicker.toUpperCase(), 512, 52);
      spacing("1px");
      let size = 78;
      ctx.font = `700 ${size}px ${displayFont}`;
      while (size > 36 && ctx.measureText(titleText).width > 940) {
        size -= 4;
        ctx.font = `700 ${size}px ${displayFont}`;
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f4ecdc";
      ctx.shadowBlur = 24;
      ctx.fillText(titleText, 512, 148);
      // The thread: a stitched bar, sewn as far as the weave has come.
      const x0 = 212;
      const x1 = 812;
      const y = 214;
      const xp = x0 + (x1 - x0) * (pct / 100);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = accentHex;
      ctx.fillRect(x0, y - 1, x1 - x0, 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = visual.accentBright;
      ctx.lineWidth = 3;
      ctx.shadowColor = accentHex;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let x = x0; x <= xp; x += 4) {
        const yy = y + Math.sin((x - x0) * 0.21) * 4;
        if (x === x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(xp, y + Math.sin((xp - x0) * 0.21) * 4, 6, 0, TAU);
      ctx.fill();
      spacing("4px");
      ctx.font = `700 92px ${displayFont}`;
      ctx.fillStyle = visual.accentBright;
      ctx.shadowColor = accentHex;
      ctx.shadowBlur = 30;
      ctx.fillText(`${pct}%`, 512, 330);
      readoutTexture.needsUpdate = true;
    };
    document.fonts?.load(`700 100px ${displayFont}`).then(() => { drawnPercent = -1; }).catch(() => {});
    const readoutMaterial = tracker.track(new THREE.SpriteMaterial({ map: readoutTexture, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    const readout = new THREE.Sprite(readoutMaterial);
    readout.renderOrder = 30;
    readout.visible = !isLobby;
    camera.add(readout);

    /* -- sizing ------------------------------------------------------------------------- */
    const resize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      skyCamera.aspect = w / h;
      skyCamera.updateProjectionMatrix();
      backdrop.setSize(w, h, renderer.getPixelRatio());
      const scale = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      motes.setScale(scale);
      landmark.setPixelScale(scale * lmScale);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove);

    /* -- the frame -------------------------------------------------------------------------- */
    const pulseReader = createMusicPulse();
    let frame = 0;
    let smoothP = isLobby ? 0 : Math.min(0.04, progressRef.current);
    let finaleArm = -1;
    let finaleT = -1;
    let moteAcc = 0;
    let seen = arrivalsRef.current;
    let seated = isLobby ? Math.min(20, seen) : 0;
    let cometT = -1;
    let arrivalFlare = 0;
    let showFor = 0;
    let forgeLevel = 0;
    const docked = new Array<boolean>(island.chunks.length).fill(false);
    const chunkFlash = new Float32Array(island.chunks.length);
    const cometFrom = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const beaconPos = new THREE.Vector3();
    const nib = new THREE.Vector3();
    const diePos = new THREE.Vector3();
    const drift = new THREE.Vector3();

    const burst = (at: THREE.Vector3, count: number, speed: number, colorA: THREE.Color, colorB: THREE.Color) => {
      if (reducedMotion) return;
      for (let k = 0; k < count; k += 1) {
        const a = rand() * TAU;
        const e = (rand() - 0.3) * Math.PI;
        const sp = speed * (0.4 + rand());
        motes.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 0.8, vz: Math.sin(a) * Math.cos(e) * sp, life: 0.9 + rand() * 0.8, size: 0.06 + rand() * 0.06, color: rand() < 0.5 ? colorA : colorB, gravity: 2, drag: 1, shape: moteShape });
      }
    };

    const renderFrame = (dtIn: number, t: number) => {
      const dt = Math.min(dtIn, 0.05);
      const pulse = pulseReader.read(dt, t);
      const charge = isLobby ? clamp01(dramaRef.current) : 0;
      if (!isLobby) {
        // Eases toward the live value, never regresses, rate-capped so a
        // remount mid-weave builds up rather than snapping together.
        const step = (Math.max(smoothP, clamp01(progressRef.current)) - smoothP) * approach(dt, 1.8);
        smoothP += Math.min(step, dt * 0.18);
      }
      const p = smoothP;
      const kick = pulse.kick * flavor.kick;
      const snare = pulse.snare * flavor.snare;
      const hat = pulse.hat * flavor.hat;
      const swell = pulse.swell * flavor.swell;

      /* timeline */
      const trace = isLobby ? 1 : smooth(0.16, 0.6, p);
      const fill = isLobby ? 1 : smooth(0.4, 0.92, p);
      const reveal = isLobby ? 0.12 + charge * 0.26 + arrivalFlare * 0.04 : 0.04 + smooth(0.12, 0.95, p) * 0.96;
      const finale = finaleT >= 0 ? clamp01(finaleT / 1.6) : 0;
      const feeding = !isLobby && trace > 0 && trace < 1;
      forgeLevel += ((feeding || (!isLobby && fill < 1 && p > 0.02) ? 1 : 0) - forgeLevel) * approach(dt, 3);

      /* island: shards drift (lobby) or fly home and lock (weaving) */
      const gather = isLobby ? easeOutCubic(charge) : 0;
      island.chunks.forEach((chunk, i) => {
        const w0 = 0.015 + (i / island.chunks.length) * 0.26;
        const dock = isLobby ? 0 : easeOutCubic(smooth(w0, w0 + 0.12, p));
        const away = isLobby ? 2.4 + (1 - gather) * 4.2 : 5;
        const bob = Math.sin(t * 0.5 + chunk.seed * 9) * 0.5;
        drift.copy(chunk.out).multiplyScalar(away);
        if (drift.z > 0) drift.z *= 0.35;
        drift.y += bob + (isLobby ? -0.4 : 2.6);
        chunk.mesh.position.copy(chunk.home).addScaledVector(drift, 1 - dock);
        const tumble = (1 - dock) * (isLobby ? 0.35 + (1 - gather) * 0.35 : 1);
        chunk.mesh.rotation.set(
          Math.sin(t * 0.3 + chunk.seed * 7) * chunk.spin.x * tumble,
          Math.sin(t * 0.21 + chunk.seed * 3) * chunk.spin.y * tumble,
          Math.cos(t * 0.27 + chunk.seed * 4) * chunk.spin.z * tumble
        );
        if (!isLobby && dock > 0.995 && !docked[i]) {
          docked[i] = true;
          chunkFlash[i] = 1;
          tmp.copy(chunk.home).add(island.group.position);
          tmp.y += 0.2;
          burst(tmp, 26, 2.4, bright, accentColor);
        }
        chunkFlash[i] = Math.max(0, chunkFlash[i] - dt * 2);
      });
      const dockFlash = chunkFlash.reduce((a, b) => Math.max(a, b), 0);
      island.material.emissiveIntensity = (isLobby ? 0.02 + charge * 0.03 : 0.02 + forgeLevel * 0.06 + dockFlash * 0.25) + kick * 0.04 + finale * (1 - finale) * 0.5;
      island.crystals.opacity = 0.45 + (isLobby ? charge * 0.25 : p * 0.4) + hat * 0.25;
      underLight.intensity = (isLobby ? 6 + charge * 10 : 8 + p * 22) + kick * 10;

      /* the landmark */
      const perSeat = Math.max(1, Math.ceil(landmark.lightCount / 6));
      landmark.update({
        t,
        dt,
        pulse,
        trace,
        outline: isLobby ? 0.5 + charge * 0.3 + snare * 0.15 : lerp(0.8, 0.14, smooth(0.6, 0.98, p)),
        fill,
        ground: 1,
        lit: isLobby ? Math.min(landmark.lightCount, seated * perSeat) : smooth(0.55, 0.97, p) * (landmark.lightCount + 1),
        lightBoost: isLobby ? 0.65 + arrivalFlare * 0.6 : 0.95 + finale * 0.2,
        beacon: isLobby ? 0.25 + charge * 0.35 + arrivalFlare * 0.8 : smooth(0.7, 0.96, p) * 0.95 + (finaleT >= 0 ? Math.exp(-finaleT * 1.6) * 1.4 : 0),
        motion: isLobby ? 0.35 + charge * 0.4 : Math.max(smooth(0.88, 1, p) * 0.5, finale),
        extras: isLobby ? 0.15 + charge * 0.2 : smooth(0.85, 1, p) * 0.55 + finale * 0.45,
        gild: 0,
        ash: 0,
        frost: 0,
        divide: 0,
        exposure: 1,
        // The lobby's landmark is a ghost: thread over a translucent shade.
        opacity: isLobby ? 0.28 + charge * 0.25 + arrivalFlare * 0.2 : 1,
        react: 0.8
      });

      /* the D20 */
      d20.group.position.y = D20_Y + Math.sin(t * 0.8) * 0.18 + (isLobby ? 0 : swell * 0.1);
      d20.group.getWorldPosition(diePos);
      if (isLobby) {
        d20.spin = 0.25 + charge * 0.35 + kick * 0.6;
        d20.uniforms.uLit.value = seated;
        d20.uniforms.uHeat.value = 0.15 + charge * 0.3 + arrivalFlare * 0.8 + kick * 0.15;
        d20.target = showFor > 0 ? Math.max(1, seated) : null;
        d20.settleRate = 5;
        d20.uniforms.uShow.value = seated;
        d20.uniforms.uShowAmt.value = showFor > 0 ? Math.min(1, showFor) : 0;
        showFor = Math.max(0, showFor - dt);
      } else if (finaleT < 0) {
        d20.spin = 0.5 + p * 3.2 + kick * 1.5;
        d20.uniforms.uLit.value = Math.floor(p * 20);
        d20.uniforms.uHeat.value = 0.25 + p * 0.65 + kick * 0.25 + snare * 0.15;
        d20.target = null;
      } else {
        // Held: a 20, the world forged.
        d20.target = 20;
        d20.settleRate = finaleT < 0.6 ? 10 : 3;
        d20.uniforms.uLit.value = 20;
        d20.uniforms.uShow.value = 20;
        d20.uniforms.uShowAmt.value = 1;
        d20.uniforms.uHeat.value = 0.5 + Math.exp(-finaleT * 1.4) * 1.2 + kick * 0.2;
      }
      d20.edges.opacity = 0.35 + d20.uniforms.uHeat.value * 0.4 + hat * 0.2;
      d20.halo.material.opacity = 0.2 + d20.uniforms.uHeat.value * 0.35 + swell * 0.2;
      d20.halo.scale.setScalar(5 * (1 + swell * 0.2 + kick * 0.1));
      d20.update(dt, camera.position);
      forgeLight.position.y = diePos.y;
      forgeLight.intensity = 6 + d20.uniforms.uHeat.value * 30;

      /* forge threads from the die to the nib */
      landmark.beaconWorld(beaconPos);
      landmark.nibWorld(nib);
      threads.forEach((thread, k) => {
        const on = feeding ? 0.85 : 0;
        thread.material.opacity += (on * (0.5 + hat * 0.5) - thread.material.opacity) * approach(dt, 8);
        if (thread.material.opacity < 0.01) return;
        for (let i = 0; i < THREAD_PTS; i += 1) {
          const u = i / (THREAD_PTS - 1);
          const jitter = Math.sin(u * Math.PI) * (0.18 + snare * 0.3);
          thread.positions[i * 3] = lerp(diePos.x, nib.x, u) + Math.sin(t * 9 + u * 13 + thread.seed) * jitter;
          thread.positions[i * 3 + 1] = lerp(diePos.y, nib.y, u) + Math.sin(u * Math.PI) * 0.5 * (k - 1) + Math.cos(t * 7 + u * 11 + thread.seed) * jitter;
          thread.positions[i * 3 + 2] = lerp(diePos.z, nib.z, u) + Math.sin(t * 8 + u * 17 + thread.seed * 2) * jitter;
        }
        thread.attr.needsUpdate = true;
      });

      /* motes pour from the die into the nib (or drift round it in the lobby) */
      motes.target.copy(feeding ? nib : beaconPos);
      const moteRate = isLobby ? 4 + charge * 8 : feeding ? 60 + pulse.level * 60 : 0;
      moteAcc += dt * moteRate;
      while (moteAcc > 1 && !reducedMotion) {
        moteAcc -= 1;
        const a = rand() * TAU;
        const e = (rand() - 0.5) * Math.PI;
        const r = isLobby ? 8 + rand() * 6 : 1.2;
        const color = rand() < 0.6 ? bright : rand() < 0.5 ? accentColor : secondary;
        motes.spawn({
          x: (isLobby ? 0 : diePos.x) + Math.cos(a) * Math.cos(e) * r,
          y: (isLobby ? ISLAND_Y + 2 : diePos.y) + Math.sin(e) * r * (isLobby ? 0.4 : 1),
          z: (isLobby ? 0 : diePos.z) + Math.sin(a) * Math.cos(e) * r,
          vx: (rand() - 0.5) * 1.2,
          vy: (rand() - 0.5) * 1.2,
          vz: (rand() - 0.5) * 1.2,
          life: isLobby ? 4 : 1.6,
          size: 0.07 + rand() * 0.06,
          color,
          shape: moteShape,
          homing: isLobby ? 0.35 : 1.4,
          drag: 0.8,
          alpha: 0.9
        });
      }
      nibGlow.position.copy(nib);
      nibGlow.material.opacity += ((feeding ? 0.9 + hat * 0.3 : 0) - nibGlow.material.opacity) * approach(dt, 8);
      nibGlow.scale.setScalar(0.8 + kick * 0.4 + Math.sin(t * 20) * 0.08);
      if (feeding && pulse.hatHit) burst(nib, 6, 1.4, white, bright);
      motes.update(dt);
      rings.update(dt);

      /* lobby: arrivals */
      if (isLobby) {
        if (arrivalsRef.current > seen) {
          seen = arrivalsRef.current;
          const a = rand() * TAU;
          cometFrom.set(Math.cos(a) * 16, diePos.y + 6, Math.sin(a) * 6 - 4);
          cometT = 0;
        }
        if (cometT >= 0) {
          cometT += dt;
          const k = clamp01(cometT / 1.0);
          comet.position.lerpVectors(cometFrom, diePos, k * k);
          comet.position.y += Math.sin(k * Math.PI) * 1.5;
          comet.material.opacity = 0.95;
          comet.scale.setScalar(1 + k * 0.8);
          if (!reducedMotion) motes.spawn({ x: comet.position.x, y: comet.position.y, z: comet.position.z, vx: (rand() - 0.5) * 0.4, vy: 0.2, life: 0.8, size: 0.09, color: bright, shape: moteShape, drag: 1 });
          if (k >= 1) {
            cometT = -1;
            comet.material.opacity = 0;
            seated = Math.min(20, seated + 1);
            arrivalFlare = 1;
            showFor = 2.6;
            rings.fire(diePos.x, diePos.y, diePos.z, 3.5, 0.8, bright);
            rings.fire(diePos.x, diePos.y, diePos.z, 6, 0.4, accentColor);
            burst(diePos, 50, 3, bright, accentColor);
          }
        }
        arrivalFlare = Math.max(0, arrivalFlare - dt * 0.7);
      }

      /* complete: the world holds ON A DOWNBEAT */
      if (!isLobby && p >= 0.985 && finaleT < 0) {
        if (finaleArm < 0) finaleArm = t;
        if (pulse.kickHit || t - finaleArm > 0.75 || reducedMotion) {
          finaleT = 0;
          rings.fire(diePos.x, diePos.y, diePos.z, 7, 0.9, bright);
          rings.fire(diePos.x, diePos.y, diePos.z, 12, 0.5, accentColor);
          rings.fire(0, ISLAND_Y + 0.1, 0, 16, 0.6, bright, true);
          rings.fire(0, ISLAND_Y + 0.1, 0, 10, 0.5, accentColor, true);
          burst(diePos, 160, 5, bright, accentColor);
        }
      }
      if (finaleT >= 0) finaleT += dt;
      const flashK = finaleT >= 0 ? Math.exp(-finaleT * 2.4) : 0;
      flash.position.copy(diePos);
      flash.material.opacity = flashK * 0.95 + arrivalFlare * 0.3;
      flash.scale.setScalar(5 + (1 - flashK) * 26 + arrivalFlare * 5);

      /* camera: a slow swing round the island */
      const swing = Math.sin(t * 0.07) * (isLobby ? 0.55 : 0.42) + pointer.x * 0.12;
      const radius = isLobby ? 27 - charge * 2 : lerp(27.5, 23, easeOutCubic(p)) - finale * 0.8;
      const height = (isLobby ? 6 : lerp(7, 5.2, p)) + Math.sin(t * 0.09) * 0.35 - pointer.y * 0.6;
      tmp.set(Math.sin(swing) * radius, height + swell * 0.2, Math.cos(swing) * (radius + swell * 0.5 - kick * 0.15));
      camera.position.lerp(tmp, approach(dt, 1.6));
      camera.lookAt(0, ISLAND_Y + (isLobby ? 0.2 : -0.9), 0);
      camera.updateMatrixWorld();
      skyCamera.position.set(-swing * 1.6, 0.4 - pointer.y * 0.2, 11);
      skyCamera.lookAt(-swing * 0.8, 0.6, 0);

      /* sky */
      backdrop.uniforms.uCenter.value.set(0.5, 0.55);
      backdrop.uniforms.uFocus.value = isLobby ? 0.75 : 0;
      backdrop.uniforms.uReveal.value = reducedMotion && !isLobby ? Math.max(reveal, 0.999) : reveal;
      backdrop.uniforms.uEdgeGain.value = (isLobby ? 0.25 : 0.4) + kick * 0.35 + snare * 0.2;
      backdrop.uniforms.uLift.value = 0.75 + swell * 0.1 + flashK * 0.3;

      /* readout */
      if (!isLobby) {
        const percent = p > 0.993 ? 100 : Math.min(99, Math.floor(p * 100));
        if (percent !== drawnPercent || titleRef.current !== drawnTitle) {
          drawnPercent = percent;
          drawnTitle = titleRef.current;
          drawReadout(percent, drawnTitle || "");
        }
        const halfV = Math.tan((camera.fov * Math.PI) / 360);
        const halfH = halfV * camera.aspect;
        const dist = Math.max(7, 2.6 / Math.max(halfH, 0.15));
        readout.position.set(0, -(dist * halfV - 0.72), -dist);
        readout.scale.set(3.5, 3.5 * (380 / 1024), 1);
        readoutMaterial.opacity += (0.97 - readoutMaterial.opacity) * approach(dt, 1.6);
      }

      backdrop.render(renderer, skyCamera, { t, dt, envelope: isLobby ? 0.4 + charge * 0.35 : 0.45 + p * 0.55, drive: 0.6 + (isLobby ? charge : p) * 0.6, pulse }, null);
      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      // One still frame of the world as far as progress says, fully composed.
      smoothP = isLobby ? 0 : Math.max(0.6, progressRef.current);
      readoutMaterial.opacity = 0.97;
      renderFrame(0.016, 4);
    } else {
      const startedAt = performance.now();
      let lastNow = startedAt;
      const loop = () => {
        frame = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = (now - lastNow) / 1000;
        lastNow = now;
        renderFrame(dt, (now - startedAt) / 1000);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      backdrop.dispose();
      tracker.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [accent, theme, mode]);

  return <div ref={mountRef} className="cosmos-canvas" aria-hidden />;
}
