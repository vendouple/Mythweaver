"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { bgmGetAnalyser } from "@/lib/client/audio";
import { themeVisual, ThemeKey } from "@/components/three/themeVisuals";

function hexToRgba(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
}

/** Soft radial glow sprite texture. */
function makeGlowTexture(inner: string, outer: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/** Strip of faint glyphs — drawn once onto a wide canvas and wrapped around
 *  the great rings with polar UVs, so every letter sits fully inside the
 *  visible band instead of being clipped by it. The alphabet is the theme's:
 *  runes for fantasy, hex code for scifi, occult marks for horror,
 *  typewriter punctuation for noir… */
function makeGlyphBandTexture(accent: string, glyphs: string, font: string, anisotropy: number) {
  const width = 4096;
  const height = 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // Hairlines along the band's edges so the ring reads as an etched circle.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 4, width, 2);
  ctx.fillRect(0, height - 6, width, 2);
  // Keep the theme's font family, but size the glyphs to the band itself.
  const family = font.replace(/^[\d.]+px\s*/, "") || "serif";
  ctx.font = `${Math.round(height * 0.6)}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 6;
  const count = 32;
  for (let i = 0; i < count; i += 1) {
    ctx.globalAlpha = 0.6 + (i % 3) * 0.14;
    ctx.fillText(glyphs[i % glyphs.length], ((i + 0.5) / count) * width, height * 0.52);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

/**
 * The Loom of Worlds — the Weaving interlude's centerpiece. A world is
 * assembled live in front of the party: thousands of motes stream down
 * luminous threads from the outer dark and lock into a forming planet, while
 * rune-etched rings precess around it. `progress` (0..1, from the dmPhase
 * timeline) drives how complete the world is; the whole scene breathes with
 * the score via the shared BGM analyser. The campaign's theme recolors the
 * whole loom — palette, glyph rings, molten heart — so a noir case file and
 * a fantasy realm are woven from visibly different cloth.
 */
export default function WeavingLoom({
  progress = 0.2,
  accent,
  theme = "none"
}: {
  progress?: number;
  accent?: string;
  theme?: ThemeKey | string | null;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visual = themeVisual(theme);
    const accentHex = accent || visual.accent;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(visual.fog), 0.03);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 1.2, 14);

    const accentColor = new THREE.Color(accentHex);
    const arcane = new THREE.Color(visual.secondary);

    scene.add(new THREE.AmbientLight(0x222a44, 1.4));
    const coreLight = new THREE.PointLight(accentColor, 30, 60, 1.8);
    scene.add(coreLight);
    const rimLight = new THREE.PointLight(arcane, 18, 70, 2);
    rimLight.position.set(9, 6, -6);
    scene.add(rimLight);

    const disposables: Array<{ dispose: () => void }> = [];

    /* -- the forming world: motes fly from chaos onto the sphere ---------- */
    const WORLD_RADIUS = 2.6;
    const sphereSource = new THREE.IcosahedronGeometry(WORLD_RADIUS, 24);
    const sourcePositions = sphereSource.getAttribute("position");
    const MOTES = 3200;
    const target = new Float32Array(MOTES * 3);
    const origin = new Float32Array(MOTES * 3);
    const seeds = new Float32Array(MOTES);
    const live = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i += 1) {
      const v = Math.floor(Math.random() * sourcePositions.count);
      target[i * 3] = sourcePositions.getX(v);
      target[i * 3 + 1] = sourcePositions.getY(v);
      target[i * 3 + 2] = sourcePositions.getZ(v);
      // Birthplace: a wide swirling halo out in the dark.
      const theta = Math.random() * Math.PI * 2;
      const radius = 9 + Math.random() * 14;
      origin[i * 3] = Math.cos(theta) * radius;
      origin[i * 3 + 1] = (Math.random() - 0.5) * 14;
      origin[i * 3 + 2] = Math.sin(theta) * radius - 4;
      seeds[i] = Math.random();
    }
    sphereSource.dispose();
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(live, 3));
    const moteMaterial = new THREE.PointsMaterial({
      color: accentColor,
      size: 0.055,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const motes = new THREE.Points(moteGeometry, moteMaterial);
    scene.add(motes);
    disposables.push(moteGeometry, moteMaterial);

    // The crystallized world beneath the motes, fading in as it completes.
    const worldGeometry = new THREE.IcosahedronGeometry(WORLD_RADIUS * 0.985, 2);
    const worldMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(visual.loom.world),
      roughness: 0.4,
      metalness: 0.7,
      flatShading: true,
      transparent: true,
      opacity: 0
    });
    const world = new THREE.Mesh(worldGeometry, worldMaterial);
    scene.add(world);
    const worldWireGeometry = new THREE.EdgesGeometry(worldGeometry);
    const worldWireMaterial = new THREE.LineBasicMaterial({ color: accentColor, transparent: true, opacity: 0 });
    const worldWire = new THREE.LineSegments(worldWireGeometry, worldWireMaterial);
    world.add(worldWire);
    disposables.push(worldGeometry, worldMaterial, worldWireGeometry, worldWireMaterial);

    // Molten heart glow behind everything, in the theme's fire.
    const heartTexture = makeGlowTexture(`rgba(${visual.loom.heart},0.85)`, `rgba(${visual.loom.heart},0)`);
    const heartMaterial = new THREE.SpriteMaterial({ map: heartTexture, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const heart = new THREE.Sprite(heartMaterial);
    heart.scale.setScalar(7);
    scene.add(heart);
    disposables.push(heartTexture, heartMaterial);

    /* -- the loom threads: streams of light feeding the world -------------- */
    const THREADS = 9;
    const PER_THREAD = 70;
    type Thread = { curve: THREE.CubicBezierCurve3; points: THREE.Points; geometry: THREE.BufferGeometry; offsets: Float32Array; speed: number };
    const threads: Thread[] = [];
    const threadMaterial = new THREE.PointsMaterial({
      color: arcane.clone().lerp(accentColor, 0.35),
      size: 0.075,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    disposables.push(threadMaterial);
    for (let i = 0; i < THREADS; i += 1) {
      const angle = (i / THREADS) * Math.PI * 2;
      const start = new THREE.Vector3(Math.cos(angle) * 17, 6 + Math.sin(i * 2.4) * 5, Math.sin(angle) * 17 - 3);
      const endDir = new THREE.Vector3().setFromSphericalCoords(WORLD_RADIUS, Math.acos(2 * Math.random() - 1), Math.random() * Math.PI * 2);
      const mid1 = start.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 4 + Math.random() * 3, 0));
      const mid2 = endDir.clone().multiplyScalar(2.6).add(new THREE.Vector3(Math.sin(angle) * 2, -1 + Math.random() * 2, Math.cos(angle) * 2));
      const curve = new THREE.CubicBezierCurve3(start, mid1, mid2, endDir);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PER_THREAD * 3), 3));
      const offsets = new Float32Array(PER_THREAD);
      for (let p = 0; p < PER_THREAD; p += 1) offsets[p] = Math.random();
      const points = new THREE.Points(geometry, threadMaterial);
      scene.add(points);
      threads.push({ curve, points, geometry, offsets, speed: 0.055 + Math.random() * 0.05 });
      disposables.push(geometry);
    }

    /* -- glyph rings ---------------------------------------------------------- */
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const runeTexture = makeGlyphBandTexture(accentHex, visual.glyphs, visual.glyphFont, anisotropy);
    const rings: Array<{ mesh: THREE.Mesh; spin: number; baseTilt: number; phase: number }> = [];
    const ringSpecs: Array<[number, number, number]> = [
      [4.4, 0.42, 0.012],
      [5.6, -0.62, -0.008],
      [7.1, 0.18, 0.005]
    ];
    ringSpecs.forEach(([radius, tilt, spin], index) => {
      // A wide band whose UVs run along the circumference, so the glyph strip
      // wraps the ring exactly — no radial cropping, no smeared sampling.
      const segments = 220;
      const geometry = new THREE.RingGeometry(radius * 0.88, radius, segments, 1);
      const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
      for (let j = 0; j <= 1; j += 1) {
        for (let i = 0; i <= segments; i += 1) {
          uv.setXY(j * (segments + 1) + i, i / segments, j);
        }
      }
      uv.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({
        map: runeTexture,
        color: accentColor,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = Math.PI / 2 + tilt;
      scene.add(mesh);
      rings.push({ mesh, spin, baseTilt: Math.PI / 2 + tilt, phase: index * 2.1 });
      disposables.push(geometry, material);
    });
    disposables.push(runeTexture);

    /* -- deep starfield + nebulae ------------------------------------------- */
    const STARS = 1100;
    const starPositions = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i += 1) {
      starPositions[i * 3] = (Math.random() - 0.5) * 70;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 44;
      starPositions[i * 3 + 2] = -8 - Math.random() * 50;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xcfd6ee, size: 0.06, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    disposables.push(starGeometry, starMaterial);

    const nebulaTextures = [
      makeGlowTexture(hexToRgba(visual.nebulae[0], 0.28), hexToRgba(visual.nebulae[0], 0)),
      makeGlowTexture(hexToRgba(visual.nebulae[1], 0.2), hexToRgba(visual.nebulae[1], 0))
    ];
    const nebulae: THREE.Sprite[] = [];
    [[-14, 7, -26, 30], [13, -6, -30, 36]].forEach(([x, y, z, size], index) => {
      const material = new THREE.SpriteMaterial({ map: nebulaTextures[index], transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(size);
      scene.add(sprite);
      nebulae.push(sprite);
      disposables.push(material);
    });
    disposables.push(...nebulaTextures);

    /* -- pointer parallax ----------------------------------------------------- */
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

    /* -- animation -------------------------------------------------------------- */
    const motion = visual.loom.motion;
    const clock = new THREE.Clock();
    let frame = 0;
    let smoothProgress = Math.max(0.05, progressRef.current);
    let freqData: Uint8Array<ArrayBuffer> | null = null;
    let musicLevel = 0;
    let scaleLevel = 0;
    const tmp = new THREE.Vector3();

    const renderFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // Progress eases toward the live dmPhase; the world never regresses.
      smoothProgress += (Math.max(smoothProgress, progressRef.current) - smoothProgress) * Math.min(1, dt * 0.9);

      // Music drive: low-frequency energy from the shared BGM analyser.
      const analyser = bgmGetAnalyser();
      if (analyser) {
        if (!freqData || freqData.length !== analyser.frequencyBinCount) {
          freqData = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        const bins = Math.max(8, Math.floor(freqData.length * 0.25));
        for (let i = 0; i < bins; i += 1) sum += freqData[i];
        const level = sum / (bins * 255);
        musicLevel += (level - musicLevel) * Math.min(1, dt * 8);
      } else {
        // No analyser (autoplay blocked / muted): breathe on a slow sine.
        musicLevel += ((0.24 + Math.sin(t * 0.9) * 0.1) - musicLevel) * Math.min(1, dt * 2);
      }
      // Geometry breathes on a slower envelope than the lights, so bass hits
      // glow rather than physically jolting the half-woven world.
      scaleLevel += (musicLevel - scaleLevel) * Math.min(1, dt * 2.5);
      const pulse = 1 + scaleLevel * 0.09;

      // Theme light gutter — layered sines, so the flicker is organic but
      // never the single-frame strobe that random noise gives.
      let glow = 1;
      if (motion.flicker > 0) {
        const g = Math.sin(t * 11.3) * Math.sin(t * 5.1 + 1.7) * Math.sin(t * 2.3 + 4.2);
        glow = 1 - motion.flicker * (0.12 + 0.3 * Math.max(0, g));
      }

      // Motes converge; each has a staggered window so the world knits
      // outward in waves rather than snapping together. The halo's orbit
      // phase depends only on time — never on convergence — so a mote flies
      // a clean arc home instead of unwinding its own swirl.
      const position = moteGeometry.getAttribute("position") as THREE.BufferAttribute;
      const spinBase = t * 0.036 * motion.swirl;
      for (let i = 0; i < MOTES; i += 1) {
        const seed = seeds[i];
        const k = easeOutCubic((smoothProgress * 1.35 - seed * 0.4) / 0.95);
        const inv = 1 - k;
        const ox = origin[i * 3];
        const oz = origin[i * 3 + 2];
        // Vertical drift of the unassembled halo: fantasy embers rise, noir
        // rain and post-apoc ash sift down, wrapping seamlessly.
        const oy = motion.rise !== 0
          ? ((((origin[i * 3 + 1] + 7 + t * motion.rise * 1.4) % 14) + 14) % 14) - 7
          : origin[i * 3 + 1];
        const angle = spinBase * (0.7 + seed * 0.6) + seed * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const bob = Math.sin(t * 1.3 + seed * 9) * 0.16 * motion.wobble * inv;
        tmp.set(
          (ox * cos - oz * sin) * inv + target[i * 3] * k * pulse,
          oy * inv + bob + target[i * 3 + 1] * k * pulse,
          (ox * sin + oz * cos) * inv + target[i * 3 + 2] * k * pulse
        );
        position.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      position.needsUpdate = true;
      motes.rotation.y = t * 0.05;
      moteMaterial.opacity = 0.95 * (0.7 + 0.3 * glow);

      // The solid world crystallizes late so motes get their moment.
      const solidity = easeOutCubic((smoothProgress - 0.45) / 0.55);
      worldMaterial.opacity = solidity * 0.92;
      worldWireMaterial.opacity = Math.min(1, (0.12 + solidity * 0.6 + musicLevel * 0.25) * visual.loom.wireBoost);
      world.rotation.y = t * 0.07;
      world.rotation.x = Math.sin(t * 0.11) * 0.08;
      world.scale.setScalar(pulse);

      heartMaterial.opacity = (0.42 + musicLevel * 0.45 + Math.sin(t * 1.8) * 0.05) * glow;
      heart.scale.setScalar(6.4 * pulse + solidity * 1.2);
      coreLight.intensity = (30 + musicLevel * 50) * glow;

      // Threads: flowing beads of light; they thin out as the world completes.
      const threadAlpha = 0.9 - solidity * 0.55;
      threadMaterial.opacity = Math.max(0.18, threadAlpha);
      for (const thread of threads) {
        const attr = thread.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let p = 0; p < PER_THREAD; p += 1) {
          thread.offsets[p] = (thread.offsets[p] + dt * thread.speed * (1 + musicLevel * 1.4)) % 1;
          thread.curve.getPoint(thread.offsets[p], tmp);
          attr.setXYZ(p, tmp.x, tmp.y, tmp.z);
        }
        attr.needsUpdate = true;
      }

      for (const ring of rings) {
        ring.mesh.rotation.z += ring.spin * 4 * motion.ringSpeed * (1 + musicLevel * 2) * dt;
        // Rings sway on their tilt axis — barely at all for scifi's gyros,
        // a slow drunken list for horror's derelict seals.
        ring.mesh.rotation.x = ring.baseTilt + Math.sin(t * (0.4 + ring.phase * 0.06) + ring.phase) * motion.ringSway * 4;
        (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (0.24 + musicLevel * 0.3 + solidity * 0.12) * glow;
      }

      nebulae.forEach((sprite, index) => {
        (sprite.material as THREE.SpriteMaterial).opacity = 0.34 + Math.sin(t * 0.12 + index * 2.4) * 0.14;
      });
      starMaterial.opacity = 0.45 + musicLevel * 0.3;

      // Slow heroic orbit + pointer parallax + faint bass push-in — damped
      // with exponential smoothing so the glide is identical at any framerate.
      const orbit = t * motion.orbit;
      const dampXY = 1 - Math.exp(-dt * 2.2);
      const dampZ = 1 - Math.exp(-dt * 1.4);
      const dolly = 14 - solidity * 1.6 - scaleLevel * 0.5;
      camera.position.x += (Math.sin(orbit) * 2.2 + pointer.x * 0.9 - camera.position.x) * dampXY;
      camera.position.y += (1.2 + Math.sin(t * 0.21) * 0.25 - pointer.y * 0.7 - camera.position.y) * dampXY;
      camera.position.z += (dolly - camera.position.z) * dampZ;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      smoothProgress = Math.max(0.6, progressRef.current);
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
      for (const item of disposables) item.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [accent, theme]);

  return <div ref={mountRef} className="cosmos-canvas" aria-hidden />;
}
