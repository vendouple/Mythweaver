"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";
import { createThemeProp } from "@/components/three/themeProps";
import { createThemeEnvironment } from "@/components/three/themeEnvironments";
import { createMusicPulse, silentPulse } from "@/lib/client/musicPulse";

/** Soft radial glow used for nebulae, bokeh, suns, and shooting-star heads. */
function makeGlowTexture(inner: string, outer: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/** Horizontal streak texture for shooting stars (bright head, long tail). */
function makeStreakTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.75, "rgba(244,228,189,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0.95)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 32);
  return new THREE.CanvasTexture(canvas);
}

function hexToRgba(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
}

/**
 * The Astral Table — the ambient scene behind the portal, creation wizard,
 * lobby, and join flow. Great polyhedral dice drift like slow moons through
 * star-dust over sleeping nebulae. When a campaign theme is known the scene
 * becomes that theme's own environment (themeEnvironments.ts): a castle under
 * auroras, a rain-soaked skyline, a moonlit sea, a neon city whose towers are
 * the score's equalizer. Everything listens to the music — dice swell on the
 * kick, dust glints on the hats. Pointer movement gives a gentle parallax.
 */
export default function CosmosCanvas({
  accent,
  drama = 0.6,
  theme = "none"
}: {
  accent?: string;
  drama?: number;
  theme?: ThemeKey | string | null;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const dramaRef = useRef(drama);
  dramaRef.current = drama;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visual = themeVisual(theme);
    // An explicitly passed accent (e.g. a player's color) outranks the theme's.
    const accentHex = accent || visual.accent;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(visual.fog), visual.fogDensity);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 0.4, 11);

    const accentColor = new THREE.Color(accentHex);
    const secondaryColor = new THREE.Color(visual.secondary);
    const disposables: Array<{ dispose: () => void }> = [];

    // -- lighting --------------------------------------------------------
    scene.add(new THREE.AmbientLight(new THREE.Color(visual.ambient), 1.1));
    const keyLight = new THREE.PointLight(accentColor, 42, 60, 1.9);
    keyLight.position.set(-6, 6, 6);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(secondaryColor, 16, 50, 2);
    rimLight.position.set(8, -4, -4);
    scene.add(rimLight);

    // -- the drifting dice moons ----------------------------------------
    const solids: Array<{
      group: THREE.Group;
      spin: THREE.Vector3;
      bobPhase: number;
      bobSpeed: number;
      base: THREE.Vector3;
    }> = [];

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(visual.dice.body),
      roughness: visual.dice.roughness,
      metalness: visual.dice.metalness,
      flatShading: true,
      transparent: visual.dice.opacity < 1,
      opacity: visual.dice.opacity
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(visual.dice.edge),
      transparent: true,
      opacity: visual.dice.edgeOpacity
    });
    disposables.push(bodyMaterial, edgeMaterial);

    const shapes: Array<[THREE.BufferGeometry, number, THREE.Vector3]> = [
      [new THREE.IcosahedronGeometry(1.9, 0), 1, new THREE.Vector3(-4.6, 1.6, -3)],
      [new THREE.DodecahedronGeometry(1.25, 0), 0.8, new THREE.Vector3(4.9, 2.3, -5)],
      [new THREE.OctahedronGeometry(0.95, 0), 0.7, new THREE.Vector3(3.6, -2.2, -2)],
      [new THREE.TetrahedronGeometry(0.85, 0), 0.6, new THREE.Vector3(-3.4, -2.6, -4.5)],
      [new THREE.IcosahedronGeometry(0.7, 0), 0.5, new THREE.Vector3(0.4, 3.4, -7)],
      [new THREE.BoxGeometry(1.05, 1.05, 1.05), 0.6, new THREE.Vector3(-6.4, -0.6, -8)]
    ];

    for (const [geometry, , base] of shapes) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(geometry, bodyMaterial);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      group.add(mesh);
      group.add(edges);
      group.position.copy(base);
      group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(group);
      solids.push({
        group,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.24,
          (Math.random() - 0.5) * 0.24,
          (Math.random() - 0.5) * 0.18
        ),
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 0.25 + Math.random() * 0.3,
        base: base.clone()
      });
    }

    // -- sleeping nebulae --------------------------------------------------
    const nebulaTextures = visual.nebulae.map((hex, index) =>
      makeGlowTexture(hexToRgba(hex, 0.22 + (index === 0 ? 0.1 : 0.04)), hexToRgba(hex, 0))
    );
    disposables.push(...nebulaTextures);
    const nebulae: THREE.Sprite[] = [];
    const nebulaSeeds: number[] = [];
    const nebulaSpots: Array<[number, number, number, number]> = [
      [-9, 4.5, -16, 22],
      [10, -3, -18, 26],
      [2, 6, -20, 18]
    ];
    nebulaSpots.forEach(([x, y, z, size], index) => {
      const material = new THREE.SpriteMaterial({
        map: nebulaTextures[index % nebulaTextures.length],
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(size);
      scene.add(sprite);
      nebulae.push(sprite);
      nebulaSeeds.push(Math.random() * Math.PI * 2);
      disposables.push(material);
    });

    // -- shooting stars ----------------------------------------------------
    const streakTexture = makeStreakTexture();
    disposables.push(streakTexture);
    type Meteor = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; life: number; velocity: THREE.Vector3 };
    const meteors: Meteor[] = [];
    for (let i = 0; i < 3; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: streakTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.07), material);
      mesh.visible = false;
      scene.add(mesh);
      meteors.push({ mesh, material, life: 0, velocity: new THREE.Vector3() });
      disposables.push(mesh.geometry, material);
    }
    let nextMeteorAt = 2 + Math.random() * 4;

    const launchMeteor = () => {
      const meteor = meteors.find((m) => !m.mesh.visible);
      if (!meteor) return;
      const fromLeft = Math.random() < 0.5;
      meteor.mesh.position.set(fromLeft ? -14 : 14, 4 + Math.random() * 5, -10 - Math.random() * 8);
      meteor.velocity.set((fromLeft ? 1 : -1) * (9 + Math.random() * 5), -(2.5 + Math.random() * 2.5), 0);
      // Aligning the plane's +X with the velocity puts the bright head in front.
      meteor.mesh.rotation.z = Math.atan2(meteor.velocity.y, meteor.velocity.x);
      meteor.life = 1.4;
      meteor.mesh.visible = true;
    };

    // -- star dust --------------------------------------------------------
    const DUST_COUNT = 950;
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustSeeds = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 34;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      dustPositions[i * 3 + 2] = -Math.random() * 22;
      dustSeeds[i] = Math.random() * Math.PI * 2;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(visual.dust.color),
      size: visual.dust.size,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);
    disposables.push(dustGeometry, dustMaterial);
    const [windX, windY] = visual.dust.flow;
    const dustHasWind = windX !== 0 || windY !== 0;

    /* ====================================================================
       Theme environment — a complete, music-synced world per genre (see
       themeEnvironments.ts). The neutral Astral Table has none.
       ==================================================================== */
    type FrameHook = (dt: number, t: number, drive: number) => void;
    const frameHooks: FrameHook[] = [];
    const environment = createThemeEnvironment(scene, visual, { width: 48, height: 26, z: -12, full: true });
    const themed = !!environment;
    // Only a themed scene taps the score. The neutral table runs on phones and
    // menus where no music plays, and building the analyser there would spin
    // up an AudioContext for nothing — so it reads a frozen, silent pulse.
    const pulseReader = themed ? createMusicPulse() : null;
    let pulse = silentPulse();
    if (environment) {
      frameHooks.push((dt, t, drive) => environment.update({ t, dt, envelope: 1, drive, pulse }));
    }

    // -- signature prop -----------------------------------------------------
    // The theme's hero landmark beside the dice — an enchanted blade, an
    // orbital station, a candelabra, a streetlamp, a drone, a tumbleweed,
    // a snapped beacon mast. Nothing for the neutral Astral Table.
    const themeProp = createThemeProp(scene, visual, "cosmos");
    if (themeProp) frameHooks.push((dt, t, drive) => themeProp.update(t, dt, drive));

    // -- pointer parallax --------------------------------------------------
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove);

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    let frame = 0;
    const renderFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      if (pulseReader) pulse = pulseReader.read(dt, t);
      const drive = (0.4 + dramaRef.current * 0.9) * (1 + pulse.level * 0.35);

      for (const solid of solids) {
        solid.group.rotation.x += solid.spin.x * dt * drive;
        solid.group.rotation.y += solid.spin.y * dt * drive * (1 + pulse.snare * 2);
        solid.group.rotation.z += solid.spin.z * dt * drive;
        solid.group.position.y = solid.base.y + Math.sin(t * solid.bobSpeed + solid.bobPhase) * 0.35;
        solid.group.scale.setScalar(1 + pulse.kick * 0.06);
      }
      edgeMaterial.opacity = Math.min(1, visual.dice.edgeOpacity * (0.85 + pulse.kick * 0.4 + pulse.brightness * 0.2));
      keyLight.intensity = 42 * (0.85 + pulse.kick * 0.35 + pulse.swell * 0.3);

      if (dustHasWind) {
        const attr = dustGeometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < DUST_COUNT; i += 1) {
          let x = dustPositions[i * 3] + windX * dt * (0.6 + dustSeeds[i] * 0.2);
          let y = dustPositions[i * 3 + 1] + windY * dt * (0.6 + dustSeeds[i] * 0.2);
          if (x > 17) x = -17;
          if (x < -17) x = 17;
          if (y > 10) y = -10;
          if (y < -10) y = 10;
          dustPositions[i * 3] = x;
          dustPositions[i * 3 + 1] = y;
        }
        attr.needsUpdate = true;
      } else {
        dust.rotation.y = t * 0.008 * drive;
      }
      dustMaterial.opacity = (0.55 + Math.sin(t * 0.6) * 0.15 + pulse.hat * 0.25) * (themed ? 0.5 : 1);
      dustMaterial.size = visual.dust.size + Math.sin(t * 1.7) * 0.008 + pulse.hat * 0.015;

      nebulae.forEach((sprite, index) => {
        const material = sprite.material as THREE.SpriteMaterial;
        // A themed environment paints its own sky; the generic nebulae would
        // only wash it out.
        material.opacity = themed ? 0 : (0.34 + Math.sin(t * 0.14 + nebulaSeeds[index]) * 0.16) * (1 + pulse.swell * 0.6);
        sprite.position.y += Math.sin(t * 0.05 + nebulaSeeds[index]) * dt * 0.12;
      });

      nextMeteorAt -= dt * drive;
      if (nextMeteorAt <= 0 && !themed) {
        launchMeteor();
        nextMeteorAt = 5 + Math.random() * 11;
      }
      for (const meteor of meteors) {
        if (!meteor.mesh.visible) continue;
        meteor.life -= dt;
        meteor.mesh.position.addScaledVector(meteor.velocity, dt);
        const fade = Math.max(0, Math.min(1, meteor.life / 1.4));
        meteor.material.opacity = Math.sin(fade * Math.PI) * 0.9;
        if (meteor.life <= 0) meteor.mesh.visible = false;
      }

      for (const hook of frameHooks) hook(dt, t, drive);

      camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.02;
      camera.position.y += (0.4 - pointer.y * 0.6 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, -3);

      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      renderFrame();
    } else {
      const loop = () => {
        renderFrame();
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      for (const [geometry] of shapes) geometry.dispose();
      for (const solid of solids) {
        solid.group.children.forEach((child) => {
          if (child instanceof THREE.LineSegments) child.geometry.dispose();
        });
      }
      themeProp?.dispose();
      environment?.dispose();
      for (const item of disposables) item.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [accent, theme]);

  return <div ref={mountRef} className="cosmos-canvas" aria-hidden />;
}
