"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { DiceOutcome } from "@/lib/campaign/types";

export type DiceRollData = {
  id: string;
  notation: string;
  reason: string;
  rolls: number[];
  modifier: number;
  total: number;
  d20Mode?: "normal" | "advantage" | "disadvantage";
  dc?: number;
  outcome?: DiceOutcome;
  speaker?: string;
  color?: string;
  /** True when this roll is for an NPC/enemy. */
  isNpc?: boolean;
};

type Phase = "tumble" | "settle" | "reveal";

const TUMBLE_SECONDS = 2.1;
const SETTLE_SECONDS = 0.65;

const OUTCOME_LABELS: Record<DiceOutcome, string> = {
  "critical-success": "Triumph",
  "strong-success": "Strong Success",
  success: "Success",
  "partial-success": "Partial Success",
  failure: "Failure",
  "hard-failure": "Hard Failure",
  "critical-failure": "Catastrophe"
};


/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */

/**
 * 5x4 atlas of engraved numerals, one cell per d20 face.
 *
 * The old atlas was a flat slate rectangle with a glowing numeral floating in
 * it, so every face looked like a screen rather than a surface. This one builds
 * an actual die face: a stone triangle inset inside the cell (the triangle
 * matters — the UVs are triangular, so a rectangular design bled across the
 * bevels), a brushed radial sheen, a chamfer highlight on the two upper edges
 * and shadow on the lower, and the numeral CUT INTO it — dark incision first,
 * then a bright rim offset up-left, which is how engraving reads under a key
 * light. The 20 and the 1 get extra treatment so a crit is unmistakable.
 */
function makeD20Atlas(accent: string) {
  const size = 1024;
  const cell = size / 5;
  const cellH = size / 5;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.ceil(cellH * 4);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#070a11";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let value = 1; value <= 20; value += 1) {
    const col = (value - 1) % 5;
    const row = Math.floor((value - 1) / 5);
    const x0 = col * cell;
    const y0 = row * cellH;
    const cx = x0 + cell / 2;
    const cy = y0 + cellH * 0.58;
    const isTop = value === 20;
    const isBottom = value === 1;

    ctx.save();
    // Clip to the face's triangle, apex up — matches the UV layout exactly.
    ctx.beginPath();
    ctx.moveTo(cx, y0 + cellH * 0.04);
    ctx.lineTo(x0 + cell * 0.97, y0 + cellH * 0.96);
    ctx.lineTo(x0 + cell * 0.03, y0 + cellH * 0.96);
    ctx.closePath();
    ctx.clip();

    // Stone body: a vertical gradient so the face has a lit top and dark base.
    const body = ctx.createLinearGradient(0, y0, 0, y0 + cellH);
    if (isTop) {
      body.addColorStop(0, "#3b3320");
      body.addColorStop(1, "#171308");
    } else if (isBottom) {
      body.addColorStop(0, "#3a1a1c");
      body.addColorStop(1, "#150809");
    } else {
      body.addColorStop(0, "#232a3c");
      body.addColorStop(1, "#0c1018");
    }
    ctx.fillStyle = body;
    ctx.fillRect(x0, y0, cell, cellH);

    // Brushed sheen sweeping off the upper-left, as if from the key light.
    const sheen = ctx.createRadialGradient(
      x0 + cell * 0.34, y0 + cellH * 0.3, cell * 0.03,
      x0 + cell * 0.34, y0 + cellH * 0.3, cell * 0.8
    );
    sheen.addColorStop(0, "rgba(255,255,255,0.13)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x0, y0, cell, cellH);

    // Fine speckle: keeps the stone from looking like flat vector art.
    ctx.globalAlpha = 0.05;
    for (let s = 0; s < 90; s += 1) {
      const sx = x0 + ((s * 37) % 100) / 100 * cell;
      const sy = y0 + ((s * 61) % 100) / 100 * cellH;
      ctx.fillStyle = s % 3 === 0 ? "#ffffff" : "#000000";
      ctx.fillRect(sx, sy, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;

    // Chamfer: the bevel that every real die has where the faces meet.
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x0 + cell * 0.06, y0 + cellH * 0.93);
    ctx.lineTo(cx, y0 + cellH * 0.08);
    ctx.lineTo(x0 + cell * 0.94, y0 + cellH * 0.93);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = cell * 0.035;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 + cell * 0.06, y0 + cellH * 0.93);
    ctx.lineTo(x0 + cell * 0.94, y0 + cellH * 0.93);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = cell * 0.045;
    ctx.stroke();

    // An inlaid rim line, offset in from the chamfer — the maker's border.
    ctx.beginPath();
    ctx.moveTo(cx, y0 + cellH * 0.2);
    ctx.lineTo(x0 + cell * 0.83, y0 + cellH * 0.86);
    ctx.lineTo(x0 + cell * 0.17, y0 + cellH * 0.86);
    ctx.closePath();
    ctx.strokeStyle = isTop || isBottom ? `${accent}55` : "rgba(190,205,235,0.16)";
    ctx.lineWidth = cell * 0.012;
    ctx.stroke();

    // The numeral, ENGRAVED: a dark cut, then a light rim offset up-left.
    const label = String(value);
    const fontSize = Math.round(cellH * (label.length > 1 ? 0.34 : 0.4));
    ctx.font = `700 ${fontSize}px Cinzel, 'Times New Roman', serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Cut shadow, pushed down-right into the stone.
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillText(label, cx + fontSize * 0.035, cy + fontSize * 0.04);
    // Bright rim catching the light on the upper-left lip of the incision.
    ctx.fillStyle = isBottom ? "#ff9a86" : accent;
    ctx.shadowColor = isTop || isBottom ? accent : "rgba(0,0,0,0)";
    ctx.shadowBlur = isTop || isBottom ? cell * 0.09 : 0;
    ctx.fillText(label, cx - fontSize * 0.022, cy - fontSize * 0.026);
    ctx.shadowBlur = 0;

    // The 6/9 underline, so an upside-down face is never ambiguous.
    if (value === 6 || value === 9) {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - cell * 0.07, cy + fontSize * 0.36, cell * 0.14, cell * 0.018);
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Pip layout per face value, in a -1..1 square. */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-0.44, -0.44], [0.44, 0.44]],
  3: [[-0.46, -0.46], [0, 0], [0.46, 0.46]],
  4: [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]],
  5: [[-0.44, -0.44], [0.44, -0.44], [0, 0], [-0.44, 0.44], [0.44, 0.44]],
  6: [[-0.42, -0.48], [0.42, -0.48], [-0.42, 0], [0.42, 0], [-0.42, 0.48], [0.42, 0.48]]
};

/**
 * One face of a numbered die.
 *
 * The old version was a slate square with a hairline border and a glowing
 * numeral — it read as a UI tile, not an object. This paints a real face:
 * a stone slab with a lit upper-left, a rounded inset panel, and then either
 * PIPS (drilled, with an inner shadow and a bright lower-right catchlight, so
 * they look like holes rather than dots) for d6 values, or an engraved numeral
 * for larger dice where pips make no sense.
 */
function makeValueTexture(value: number, accent: string, pipped: boolean) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;

  // Stone body, lit from the upper-left.
  const body = ctx.createLinearGradient(0, 0, size, size);
  body.addColorStop(0, "#2a3346");
  body.addColorStop(0.55, "#161d2b");
  body.addColorStop(1, "#0a0e16");
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);

  const sheen = ctx.createRadialGradient(size * 0.3, size * 0.26, 6, size * 0.3, size * 0.26, size * 0.85);
  sheen.addColorStop(0, "rgba(255,255,255,0.14)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.05;
  for (let s = 0; s < 200; s += 1) {
    const sx = ((s * 41) % 100) / 100 * size;
    const sy = ((s * 67) % 100) / 100 * size;
    ctx.fillStyle = s % 3 === 0 ? "#ffffff" : "#000000";
    ctx.fillRect(sx, sy, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Chamfer: bright on the top/left edges, dark on the bottom/right.
  const bevel = size * 0.055;
  ctx.lineWidth = bevel;
  ctx.beginPath();
  ctx.moveTo(bevel / 2, size - bevel / 2);
  ctx.lineTo(bevel / 2, bevel / 2);
  ctx.lineTo(size - bevel / 2, bevel / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.17)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size - bevel / 2, bevel / 2);
  ctx.lineTo(size - bevel / 2, size - bevel / 2);
  ctx.lineTo(bevel / 2, size - bevel / 2);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.stroke();

  // Inset panel, rounded — the recessed field the marks sit in.
  const inset = size * 0.13;
  const r = size * 0.09;
  ctx.beginPath();
  ctx.moveTo(inset + r, inset);
  ctx.arcTo(size - inset, inset, size - inset, size - inset, r);
  ctx.arcTo(size - inset, size - inset, inset, size - inset, r);
  ctx.arcTo(inset, size - inset, inset, inset, r);
  ctx.arcTo(inset, inset, size - inset, inset, r);
  ctx.closePath();
  ctx.strokeStyle = `${accent}30`;
  ctx.lineWidth = size * 0.008;
  ctx.stroke();

  if (pipped && PIPS[value]) {
    const pipR = size * 0.072;
    for (const [px, py] of PIPS[value]) {
      const x = c + px * size * 0.31;
      const y = c + py * size * 0.31;
      // The hole: dark at the far wall, so it reads as depth.
      const hole = ctx.createRadialGradient(x - pipR * 0.3, y - pipR * 0.3, pipR * 0.1, x, y, pipR);
      hole.addColorStop(0, "#02040a");
      hole.addColorStop(0.7, "#070c16");
      hole.addColorStop(1, "#0d1420");
      ctx.beginPath();
      ctx.arc(x, y, pipR, 0, Math.PI * 2);
      ctx.fillStyle = hole;
      ctx.fill();
      // Inlay glow pooled at the bottom of the drilling.
      const inlay = ctx.createRadialGradient(x + pipR * 0.25, y + pipR * 0.3, 1, x, y, pipR * 0.95);
      inlay.addColorStop(0, `${accent}cc`);
      inlay.addColorStop(0.6, `${accent}44`);
      inlay.addColorStop(1, `${accent}00`);
      ctx.fillStyle = inlay;
      ctx.fill();
      // The lip: bright where the light clips the near rim, dark opposite.
      ctx.beginPath();
      ctx.arc(x, y, pipR, Math.PI * 0.75, Math.PI * 1.75);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = size * 0.012;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, pipR, Math.PI * 1.75, Math.PI * 2.75);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = size * 0.01;
      ctx.stroke();
    }
  } else {
    // Engraved numeral, same cut-then-rim treatment as the d20.
    const label = String(value);
    const fontSize = Math.round(size * (label.length > 1 ? 0.4 : 0.5));
    ctx.font = `700 ${fontSize}px Cinzel, 'Times New Roman', serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillText(label, c + fontSize * 0.03, c + fontSize * 0.035);
    ctx.fillStyle = accent;
    ctx.fillText(label, c - fontSize * 0.02, c - fontSize * 0.025);
    if (value === 6 || value === 9) {
      ctx.fillRect(c - size * 0.07, c + fontSize * 0.34, size * 0.14, size * 0.018);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A cube with rounded edges and per-face materials.
 *
 * `BoxGeometry` gives hard 90° corners that catch the light as three flat
 * planes and look like a texture swatch. A real die is a rounded cube: the
 * chamfer is where all the specular life is. This subdivides a box and pushes
 * every vertex out onto a superellipsoid, which rounds the edges while keeping
 * the six faces flat and their UVs intact — so the face textures still map
 * correctly and each face can keep its own material.
 */
function buildRoundedDie(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  // Higher exponent = flatter faces and a tighter corner radius.
  const n = 2 / Math.max(0.02, radius);
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    // Superellipsoid: |x|^n + |y|^n + |z|^n = const, solved along the ray.
    const ax = Math.abs(v.x * 2);
    const ay = Math.abs(v.y * 2);
    const az = Math.abs(v.z * 2);
    const d = Math.pow(Math.pow(ax, n) + Math.pow(ay, n) + Math.pow(az, n), 1 / n);
    if (d > 0.0001) v.multiplyScalar(1 / d);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

type D20Build = {
  geometry: THREE.BufferGeometry;
  /** Quaternion that presents face `value` upright toward +Z. */
  presentation: THREE.Quaternion[];
};

/** Icosahedron with per-face atlas UVs and precomputed landing rotations. */
function buildD20(): D20Build {
  // IcosahedronGeometry is already non-indexed; calling toNonIndexed would only
  // warn. Per-face UVs need the un-shared vertices this already has.
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute("position");
  const faceCount = position.count / 3; // 20
  const uvs = new Float32Array(position.count * 2);
  const presentation: THREE.Quaternion[] = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const upish = new THREE.Vector3();
  const xAxis = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  for (let face = 0; face < faceCount; face += 1) {
    const col = face % 5;
    const row = Math.floor(face / 5);
    const u0 = col / 5;
    const v0 = 1 - (row + 1) / 4;
    const cw = 1 / 5;
    const ch = 1 / 4;
    const pad = 0.16;
    // v0 = apex (number top), v1/v2 = base corners.
    uvs[face * 6 + 0] = u0 + cw / 2;
    uvs[face * 6 + 1] = v0 + ch * (1 - pad * 0.6);
    uvs[face * 6 + 2] = u0 + cw * pad;
    uvs[face * 6 + 3] = v0 + ch * pad;
    uvs[face * 6 + 4] = u0 + cw * (1 - pad);
    uvs[face * 6 + 5] = v0 + ch * pad;

    a.fromBufferAttribute(position, face * 3);
    b.fromBufferAttribute(position, face * 3 + 1);
    c.fromBufferAttribute(position, face * 3 + 2);
    mid.copy(b).add(c).multiplyScalar(0.5);
    normal.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
    // Ensure outward normal.
    if (normal.dot(a) < 0) normal.negate();
    upish.copy(a).sub(mid);
    upish.addScaledVector(normal, -upish.dot(normal)).normalize();
    xAxis.copy(upish).cross(normal).normalize();

    // Local frame (x', up, normal) → world (X, Y, Z): rotation = basis⁻¹.
    basis.makeBasis(xAxis, upish, normal);
    presentation.push(new THREE.Quaternion().setFromRotationMatrix(basis.clone().transpose()));
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return { geometry, presentation };
}

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

function playRollSound(critical: "high" | "low" | null) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx: AudioContext = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);

    // Rumbling tumble: low sawtooth with wobble, fading into the impact.
    const rumble = ctx.createOscillator();
    rumble.type = "sawtooth";
    rumble.frequency.setValueAtTime(55, ctx.currentTime);
    rumble.frequency.linearRampToValueAtTime(110, ctx.currentTime + TUMBLE_SECONDS);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 9;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 22;
    wobble.connect(wobbleGain);
    wobbleGain.connect(rumble.frequency);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    rumbleGain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.35);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + TUMBLE_SECONDS + 0.2);
    rumble.connect(rumbleGain);
    rumbleGain.connect(master);
    rumble.start();
    wobble.start();
    rumble.stop(ctx.currentTime + TUMBLE_SECONDS + 0.3);
    wobble.stop(ctx.currentTime + TUMBLE_SECONDS + 0.3);

    // Impact at settle.
    const impactAt = ctx.currentTime + TUMBLE_SECONDS;
    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(150, impactAt);
    thud.frequency.exponentialRampToValueAtTime(40, impactAt + 0.4);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    thudGain.gain.setValueAtTime(0.9, impactAt);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + 0.45);
    thud.connect(thudGain);
    thudGain.connect(master);
    thud.start(impactAt);
    thud.stop(impactAt + 0.5);

    // Crit chime / dirge.
    if (critical) {
      const revealAt = impactAt + SETTLE_SECONDS + 0.1;
      const freqs = critical === "high" ? [660, 990, 1320] : [220, 208];
      freqs.forEach((freq, index) => {
        const chime = ctx.createOscillator();
        chime.type = "triangle";
        chime.frequency.value = freq;
        const chimeGain = ctx.createGain();
        chimeGain.gain.setValueAtTime(0.0001, revealAt);
        chimeGain.gain.exponentialRampToValueAtTime(0.4 / (index + 1), revealAt + 0.05 + index * 0.08);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, revealAt + 1.1);
        chime.connect(chimeGain);
        chimeGain.connect(master);
        chime.start(revealAt);
        chime.stop(revealAt + 1.2);
      });
    }

    setTimeout(() => ctx.close().catch(() => undefined), (TUMBLE_SECONDS + SETTLE_SECONDS + 2.5) * 1000);
  } catch {
    // Sound is decoration; never let it break the roll.
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * Full-screen dice cinematic. A d20 (or a fistful of dice for other
 * notations) drops out of darkness, tumbles with decaying spin, and is
 * snapped onto its rolled face — the face texture mapping is exact, so the
 * die genuinely lands showing the number the server rolled. Advantage and
 * disadvantage throw two dice and let the loser sink into shadow.
 */
export default function DiceTheater({
  roll,
  compact = false,
  muted = false,
  onDone
}: {
  roll: DiceRollData;
  compact?: boolean;
  muted?: boolean;
  onDone: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("tumble");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const isD20 = roll.notation.toLowerCase().includes("d20") || !!roll.d20Mode;
  // How many faces the die has, so a d6 gets pips and a d10 gets numerals, and
  // the opposite-face fill uses the right total.
  const dieSize = (() => {
    const match = /d\s*(\d+)/i.exec(roll.notation);
    const parsed = match ? parseInt(match[1], 10) : 6;
    return Number.isFinite(parsed) && parsed >= 2 ? Math.min(100, parsed) : 6;
  })();
  const isDual = (roll.d20Mode === "advantage" || roll.d20Mode === "disadvantage") && roll.rolls.length >= 2;
  const chosenIndex = isDual
    ? (roll.d20Mode === "advantage"
        ? (roll.rolls[0] >= roll.rolls[1] ? 0 : 1)
        : (roll.rolls[0] <= roll.rolls[1] ? 0 : 1))
    : 0;
  const headline = isDual ? roll.rolls[chosenIndex] : roll.total;
  const critical: "high" | "low" | null =
    roll.outcome === "critical-success" || (isD20 && headline === 20)
      ? "high"
      : roll.outcome === "critical-failure" || (isD20 && headline === 1)
        ? "low"
        : null;
  const accent = roll.isNpc
    ? "#c48a8a"
    : critical === "high"
      ? "#ffd76a"
      : critical === "low"
        ? "#ff6a5c"
        : "#e6c378";
  const outcomeLabel = roll.outcome ? OUTCOME_LABELS[roll.outcome] : null;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    camera.position.set(0, 0.15, compact ? 5.6 : 6.4);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x404868, 1.4));
    const key = new THREE.PointLight(0xe6c378, 60, 40, 1.8);
    key.position.set(-4, 5, 5);
    scene.add(key);
    const fill = new THREE.PointLight(0x5f6cff, 22, 30, 2);
    fill.position.set(5, -3, 3);
    scene.add(fill);

    const disposables: Array<{ dispose: () => void }> = [];
    const dice: Array<{
      mesh: THREE.Mesh;
      spin: THREE.Vector3;
      startQ: THREE.Quaternion;
      targetQ: THREE.Quaternion;
      restX: number;
      dim: boolean;
    }> = [];

    const shownRolls = roll.rolls.slice(0, isDual ? 2 : 5);
    const spread = shownRolls.length > 1 ? (compact ? 1.5 : 1.85) : 0;
    const scale = (compact ? 0.95 : 1.15) * (shownRolls.length > 1 ? 0.82 : 1);

    /** Aim a die's presented face at the camera from its resting spot. */
    const aimAtCamera = (restX: number) => {
      const toCamera = camera.position.clone().sub(new THREE.Vector3(restX, 0, 0)).normalize();
      return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toCamera);
    };

    if (isD20) {
      const { geometry, presentation } = buildD20();
      // The die itself carries the outcome's color, so a triumph is a gold die
      // and a catastrophe a red one before the label even appears.
      const atlas = makeD20Atlas(accent);
      const material = new THREE.MeshStandardMaterial({
        map: atlas,
        roughness: 0.32,
        metalness: 0.55,
        flatShading: true
      });
      disposables.push(geometry, atlas, material);

      shownRolls.forEach((value, index) => {
        const mesh = new THREE.Mesh(geometry, material.clone());
        disposables.push(mesh.material as THREE.Material);
        mesh.scale.setScalar(scale);
        const restX = (index - (shownRolls.length - 1) / 2) * spread * 1.5;
        mesh.position.set(restX, 4.5, 0);
        scene.add(mesh);
        dice.push({
          mesh,
          spin: new THREE.Vector3(
            (Math.random() * 6 + 7) * (Math.random() < 0.5 ? -1 : 1),
            (Math.random() * 6 + 7) * (Math.random() < 0.5 ? -1 : 1),
            (Math.random() * 4 + 3) * (Math.random() < 0.5 ? -1 : 1)
          ),
          startQ: new THREE.Quaternion(),
          targetQ: aimAtCamera(restX).multiply(presentation[Math.max(0, Math.min(19, value - 1))]),
          restX,
          dim: isDual && index !== chosenIndex
        });
      });
    } else {
      // A ROUNDED cube with six DIFFERENT faces, and it lands on the right one.
      // Previously the same value was painted on all six sides of a hard box —
      // which meant it couldn't be wrong, but it also looked like a printed
      // block instead of a die. Now the die carries a real face set (the rolled
      // value forward, the rest filled in around it, opposite faces summing to
      // the die's size the way a real one does) and the settle rotation
      // presents the rolled face to camera.
      const geometry = buildRoundedDie(0.16);
      geometry.scale(1.2, 1.2, 1.2);
      disposables.push(geometry);
      // Box face order: +X, -X, +Y, -Y, +Z, -Z. +Z is the one facing camera.
      const faceCount = Math.max(2, dieSize);
      const pipped = faceCount <= 6;
      shownRolls.forEach((value, index) => {
        // Fill the other five faces with plausible neighbors so no two adjacent
        // faces repeat; +Z always holds the rolled value.
        const other = (offset: number) => ((value - 1 + offset) % faceCount) + 1;
        const faceValues = [
          other(2),
          other(faceCount - 2),
          other(1),
          other(faceCount - 1),
          value,
          // Opposite the rolled face: n+1-value, as on a real die.
          Math.max(1, faceCount + 1 - value)
        ];
        const materials = faceValues.map((faceValue) => {
          const texture = makeValueTexture(faceValue, accent, pipped);
          const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.42,
            metalness: 0.45
          });
          disposables.push(texture, material);
          return material;
        });
        const mesh = new THREE.Mesh(geometry, materials);
        mesh.scale.setScalar(scale * 0.85);
        const restX = (index - (shownRolls.length - 1) / 2) * spread;
        mesh.position.set(restX, 4.5, 0);
        scene.add(mesh);
        dice.push({
          mesh,
          spin: new THREE.Vector3(
            (Math.random() * 5 + 6) * (Math.random() < 0.5 ? -1 : 1),
            (Math.random() * 5 + 6) * (Math.random() < 0.5 ? -1 : 1),
            (Math.random() * 3 + 2) * (Math.random() < 0.5 ? -1 : 1)
          ),
          startQ: new THREE.Quaternion(),
          targetQ: aimAtCamera(restX),
          restX,
          dim: false
        });
      });
    }

    // Glow disc beneath the landing spot.
    const glowTexture = (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
      gradient.addColorStop(0, "rgba(230,195,120,0.55)");
      gradient.addColorStop(1, "rgba(230,195,120,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(canvas);
    })();
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMaterial);
    glow.position.set(0, -1.2, -1);
    scene.add(glow);
    disposables.push(glowTexture, glowMaterial, glow.geometry);

    if (!muted) playRollSound(critical);

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
    let lastT = 0;
    let currentPhase: Phase = "tumble";
    let settleCaptured = false;
    let finished = false;
    const tumbleTime = reducedMotion ? 0.01 : TUMBLE_SECONDS;
    const settleTime = reducedMotion ? 0.01 : SETTLE_SECONDS;
    const holdTime = compact ? 2.0 : 2.9;

    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      const dt = Math.min(Math.max(t - lastT, 0.001), 0.05);
      lastT = t;

      if (t < tumbleTime) {
        const progress = t / tumbleTime;
        const decay = 1 - easeOutCubic(progress) * 0.85;
        // Drop with two decaying bounces.
        const drop = Math.max(0, 4.5 * (1 - easeOutCubic(Math.min(progress * 1.6, 1))));
        const bounce = progress > 0.6 ? Math.abs(Math.sin(progress * 14)) * (1 - progress) * 0.7 : 0;
        for (const die of dice) {
          die.mesh.rotation.x += die.spin.x * dt * decay;
          die.mesh.rotation.y += die.spin.y * dt * decay;
          die.mesh.rotation.z += die.spin.z * dt * decay;
          die.mesh.position.y = drop + bounce;
          die.mesh.position.x = die.restX + Math.sin(t * 5 + die.restX) * (1 - progress) * 0.4;
        }
        glowMaterial.opacity = progress * 0.35;
      } else if (t < tumbleTime + settleTime) {
        if (!settleCaptured) {
          settleCaptured = true;
          for (const die of dice) die.startQ.copy(die.mesh.quaternion);
          if (currentPhase !== "settle") {
            currentPhase = "settle";
            setPhase("settle");
          }
        }
        const progress = easeOutCubic((t - tumbleTime) / settleTime);
        for (const die of dice) {
          die.mesh.quaternion.slerpQuaternions(die.startQ, die.targetQ, progress);
          die.mesh.position.y *= 1 - progress;
          die.mesh.position.x = die.restX;
        }
        glowMaterial.opacity = 0.35 + progress * 0.3;
      } else {
        if (currentPhase !== "reveal") {
          currentPhase = "reveal";
          setPhase("reveal");
        }
        const since = t - tumbleTime - settleTime;
        for (const die of dice) {
          die.mesh.quaternion.copy(die.targetQ);
          if (die.dim) {
            // The unchosen die sinks into shadow.
            const sink = Math.min(since / 0.9, 1);
            die.mesh.position.y = -sink * 1.4;
            die.mesh.scale.setScalar(scale * (1 - sink * 0.35));
            const material = die.mesh.material as THREE.MeshStandardMaterial;
            material.transparent = true;
            material.opacity = 1 - sink * 0.75;
          } else {
            die.mesh.position.y = Math.sin(since * 1.8) * 0.06;
          }
        }
        glowMaterial.opacity = 0.65 + Math.sin(since * 3) * 0.12;
        if (!finished && since > holdTime) {
          finished = true;
          onDoneRef.current();
        }
      }

      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      for (const item of disposables) item.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // The roll is immutable per mount; parent remounts with a new key per event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll.id]);

  const modeLabel = roll.d20Mode === "advantage" ? "Advantage" : roll.d20Mode === "disadvantage" ? "Disadvantage" : null;

  return (
    <div className={`dice-theater ${compact ? "compact" : ""} phase-${phase} ${critical ? `crit-${critical}` : ""} ${roll.isNpc ? "npc-roll" : ""}`}>
      <div className="dice-theater-canvas" ref={mountRef} />
      <div className="dice-theater-chrome">
        <div className="dice-reason">
          {roll.speaker ? <span className="dice-speaker" style={{ color: roll.color || accent }}>{roll.speaker}</span> : null}
          {roll.isNpc ? <span className="dice-mode mode-npc">Enemy</span> : null}
          <span className="dice-reason-text">{roll.reason}</span>
          {modeLabel ? <span className={`dice-mode mode-${roll.d20Mode}`}>{modeLabel}</span> : null}
        </div>
        <div className="dice-result" style={{ color: accent }}>
          <span className="dice-result-number">{headline}</span>
          {critical === "high" ? <span className="dice-crit-label">Critical!</span> : null}
          {critical === "low" ? <span className="dice-crit-label">Catastrophe</span> : null}
          {isDual ? (
            <span className="dice-dual-detail">
              {roll.rolls[0]} / {roll.rolls[1]} - kept {roll.rolls[chosenIndex]}
            </span>
          ) : roll.modifier ? (
            <span className="dice-dual-detail">
              {roll.rolls.join(" + ")} {roll.modifier > 0 ? `+ ${roll.modifier}` : `- ${Math.abs(roll.modifier)}`} = {roll.total}
            </span>
          ) : roll.rolls.length > 1 ? (
            <span className="dice-dual-detail">{roll.rolls.join(" + ")} = {roll.total}</span>
          ) : null}
          {roll.dc && outcomeLabel ? (
            <span className={`dice-verdict verdict-${roll.outcome}`}>
              vs DC {roll.dc} - {outcomeLabel}
            </span>
          ) : null}
          <span className="dice-notation">{roll.notation}</span>
        </div>
      </div>
    </div>
  );
}
