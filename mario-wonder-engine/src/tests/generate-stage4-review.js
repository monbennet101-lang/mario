/**
 * Stage 4 Acrobatic Move Set & State Arbitration Artifact Generator
 * ==================================================================
 * Generates:
 *  - /review/stage4/state_machine_diagram.svg (State Machine & Arbitration Matrix)
 *  - /review/stage4/acrobatic_trajectories.svg (Spin Twirl vs Jump, Room 4 Wall Climb, Ground Pound & Trauma)
 *  - /review/stage4/stage4_acrobatic_traces.json (Exact frame-by-frame metrics)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import { PlayerState } from '../game/player/PlayerState.js';
import ScreenShake from '../engine/camera/ScreenShake.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { createWallShaft } from '../game/levels/benchmark/BenchmarkRooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../review/stage4');
fs.mkdirSync(outDir, { recursive: true });

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function makeFlat(cols = 60, rows = 30, floorY = 4) {
  resetMovementProfile();
  const map = new TileMap(cols, rows);
  map.fillRect(0, 0, cols, floorY, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(8.0, floorY);
  player.update(null, collision, DT);
  player.update(null, collision, DT);
  return { collision, input, player };
}

// 1. Standing jump vs Standing jump + Spin Twirl
function traceJump(withSpin) {
  const { collision, input, player } = makeFlat();
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);
  const jumpSpinMask = InputManager.encodeActions([Actions.JUMP, Actions.SPIN]);
  const startY = player.pos.y;
  const samples = [{ f: 0, t: 0, dy: 0, vy: 0, state: player.state }];

  for (let f = 1; f <= 110; f++) {
    input.applySnapshot(withSpin && f === 27 ? jumpSpinMask : jumpMask);
    player.update(input, collision, DT);
    samples.push({
      f,
      t: +(f / 60).toFixed(4),
      dy: +(player.pos.y - startY).toFixed(4),
      vy: +player.vel.y.toFixed(4),
      state: player.state,
    });
    if (f > 2 && player.grounded) break;
  }
  return samples;
}

// 2. Room 4 Wall Shaft climb trace
function traceWallShaft() {
  resetMovementProfile();
  const room4 = createWallShaft();
  const collision = new CollisionSystem(room4.map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(room4.spawnX, room4.spawnY);
  player.update(null, collision, DT);
  player.update(null, collision, DT);

  const startY = player.pos.y;
  const samples = [{ f: 0, t: 0, x: +player.centerX.toFixed(3), dy: 0, state: player.state }];
  let targetDir = 1;
  let jumpNextRelease = false;

  for (let f = 1; f <= 300; f++) {
    const acts = [targetDir > 0 ? Actions.RIGHT : Actions.LEFT];
    let wantJump = false;
    if (player.grounded && (player.wallContactDirection === targetDir || f === 15)) {
      wantJump = true;
    } else if (player.isWallSliding || (player.wallContactDirection === targetDir && player.vel.y <= 1.0)) {
      wantJump = true;
      targetDir = -targetDir;
    }
    if (wantJump && !jumpNextRelease) {
      acts.push(Actions.JUMP);
      jumpNextRelease = true;
    } else {
      jumpNextRelease = false;
    }

    input.applySnapshot(InputManager.encodeActions(acts));
    player.update(input, collision, DT);
    samples.push({
      f,
      t: +(f / 60).toFixed(4),
      x: +player.centerX.toFixed(3),
      dy: +(player.pos.y - startY).toFixed(3),
      state: player.state,
    });
    if (player.pos.y - startY >= 12.2) break;
  }
  return samples;
}

// 3. Ground Pound + Screen Shake Trauma trace
function traceGroundPound() {
  const { collision, input, player } = makeFlat();
  const shake = new ScreenShake();
  player.spawn(8.0, 14.0);
  player.grounded = false;
  player.state = PlayerState.FALL;
  player.vel.y = -2.0;

  const downMask = InputManager.encodeActions([Actions.DOWN]);
  const samples = [];

  for (let f = 1; f <= 60; f++) {
    input.applySnapshot(f === 1 ? downMask : 0);
    player.update(input, collision, DT);
    const impact = player.events.find((e) => e.type === 'groundPoundImpact');
    if (impact) shake.addTrauma(impact.trauma);
    else shake.update(DT);
    samples.push({
      f,
      t: +(f / 60).toFixed(4),
      y: +player.pos.y.toFixed(4),
      vy: +player.vel.y.toFixed(4),
      trauma: +shake.trauma.toFixed(4),
      state: player.state,
    });
  }
  return samples;
}

const baseJump = traceJump(false);
const spinJump = traceJump(true);
const wallClimb = traceWallShaft();
const groundPound = traceGroundPound();

function writeStateMachineSvg() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="880" height="470" viewBox="0 0 880 470">
  <rect width="880" height="470" fill="#0B1120" rx="12" />
  <text x="28" y="34" fill="#F8FAFC" font-size="16" font-weight="bold" font-family="monospace">Stage 4 — Acrobatic State Machine &amp; Illegal Transition Arbitration</text>
  <text x="28" y="54" fill="#94A3B8" font-size="11" font-family="monospace">Strict guards prevent GP during WallSlide, WallSlide during GP, Spin during WallSlide/GP, and double Spin.</text>

  <!-- Grounded Hub -->
  <rect x="34" y="205" width="145" height="60" rx="10" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
  <text x="106" y="232" text-anchor="middle" fill="#38BDF8" font-size="12" font-weight="bold" font-family="monospace">GROUNDED</text>
  <text x="106" y="250" text-anchor="middle" fill="#CBD5E1" font-size="10" font-family="monospace">resets Spin &amp; Wall</text>

  <!-- Jump / Fall -->
  <rect x="255" y="195" width="165" height="80" rx="10" fill="#1E293B" stroke="#4ADE80" stroke-width="2" />
  <text x="337" y="222" text-anchor="middle" fill="#4ADE80" font-size="12" font-weight="bold" font-family="monospace">JUMP / APEX / FALL</text>
  <text x="337" y="242" text-anchor="middle" fill="#CBD5E1" font-size="10" font-family="monospace">Airborne hub</text>
  <text x="337" y="258" text-anchor="middle" fill="#94A3B8" font-size="9" font-family="monospace">canSpin · canGP · canWall</text>

  <!-- Spin Twirl -->
  <rect x="255" y="80" width="175" height="68" rx="10" fill="#082F49" stroke="#22D3EE" stroke-width="2" />
  <text x="342" y="106" text-anchor="middle" fill="#22D3EE" font-size="12" font-weight="bold" font-family="monospace">SPIN_TWIRL (18f)</text>
  <text x="342" y="124" text-anchor="middle" fill="#E0F2FE" font-size="10" font-family="monospace">1x/air · +1.60 · [-1.5,+1.5]</text>

  <!-- Wall Slide -->
  <rect x="520" y="80" width="165" height="68" rx="10" fill="#451A03" stroke="#F59E0B" stroke-width="2" />
  <text x="602" y="106" text-anchor="middle" fill="#F59E0B" font-size="12" font-weight="bold" font-family="monospace">WALL_SLIDE</text>
  <text x="602" y="124" text-anchor="middle" fill="#FEF3C7" font-size="10" font-family="monospace">4.20 t/s clamp · 5f coyote</text>

  <!-- Wall Jump -->
  <rect x="520" y="195" width="165" height="68" rx="10" fill="#052E16" stroke="#4ADE80" stroke-width="2" />
  <text x="602" y="221" text-anchor="middle" fill="#4ADE80" font-size="12" font-weight="bold" font-family="monospace">WALL_JUMP</text>
  <text x="602" y="239" text-anchor="middle" fill="#DCFCE7" font-size="10" font-family="monospace">vx ±8.50 · vy 16.80 · 8f lock</text>

  <!-- Ground Pound -->
  <rect x="255" y="330" width="195" height="82" rx="10" fill="#4C0519" stroke="#FB7185" stroke-width="2" />
  <text x="352" y="355" text-anchor="middle" fill="#FB7185" font-size="12" font-weight="bold" font-family="monospace">GROUND POUND</text>
  <text x="352" y="373" text-anchor="middle" fill="#FFE4E6" font-size="10" font-family="monospace">Windup(10f) -&gt; Fall(28 t/s)</text>
  <text x="352" y="391" text-anchor="middle" fill="#FDA4AF" font-size="10" font-family="monospace">-&gt; Land(10f, 0.65 trauma)</text>

  <!-- Allowed transitions -->
  <line x1="179" y1="228" x2="255" y2="228" stroke="#4ADE80" stroke-width="2" />
  <line x1="337" y1="195" x2="337" y2="148" stroke="#22D3EE" stroke-width="2" />
  <line x1="420" y1="215" x2="520" y2="128" stroke="#F59E0B" stroke-width="2" />
  <line x1="602" y1="148" x2="602" y2="195" stroke="#4ADE80" stroke-width="2" />
  <line x1="520" y1="232" x2="420" y2="232" stroke="#4ADE80" stroke-width="2" />
  <line x1="337" y1="275" x2="337" y2="330" stroke="#FB7185" stroke-width="2" />
  <line x1="255" y1="370" x2="106" y2="265" stroke="#FB7185" stroke-width="2" stroke-dasharray="5 3" />

  <!-- Forbidden matrix box -->
  <rect x="520" y="295" width="330" height="145" rx="8" fill="#0F172A" stroke="#EF4444" stroke-width="1.5" />
  <text x="536" y="318" fill="#F87171" font-size="11" font-weight="bold" font-family="monospace">BLOCKED TRANSITIONS (GUARDS)</text>
  <text x="536" y="340" fill="#E2E8F0" font-size="10" font-family="monospace">✕ WallSlide -&gt; GroundPound (blocked)</text>
  <text x="536" y="359" fill="#E2E8F0" font-size="10" font-family="monospace">✕ WallSlide -&gt; SpinTwirl (blocked)</text>
  <text x="536" y="378" fill="#E2E8F0" font-size="10" font-family="monospace">✕ GroundPound -&gt; WallSlide (blocked)</text>
  <text x="536" y="397" fill="#E2E8F0" font-size="10" font-family="monospace">✕ GroundPound -&gt; SpinTwirl (blocked)</text>
  <text x="536" y="416" fill="#E2E8F0" font-size="10" font-family="monospace">✕ SpinTwirl -&gt; 2nd Spin (until grounded)</text>
</svg>`;
  fs.writeFileSync(path.join(outDir, 'state_machine_diagram.svg'), svg);
}

function writeTrajectoriesSvg() {
  const w = 880;
  const h = 380;
  const padL = 56;
  const padT = 56;
  const panelW = 370;
  const panelH = 260;

  // Left panel: Base Jump vs Spin Twirl Jump (t in [0, 1.3s], dy in [0, 5t])
  const lx = (t) => padL + (t / 1.3) * panelW;
  const ly = (dy) => padT + ((5.0 - dy) / 5.0) * panelH;
  const pathFor = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${lx(p.t).toFixed(1)} ${ly(p.dy).toFixed(1)}`).join(' ');

  // Right panel: Room 4 Wall Climb dy(t) (t in [0, 4.5s], dy in [0, 14t])
  const rxOff = 474;
  const rx = (t) => rxOff + (t / 4.5) * panelW;
  const ry = (dy) => padT + ((14.0 - dy) / 14.0) * panelH;
  const wallPath = wallClimb.map((p, i) => `${i === 0 ? 'M' : 'L'} ${rx(p.t).toFixed(1)} ${ry(p.dy).toFixed(1)}`).join(' ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#0B1120" rx="12" />
  <text x="24" y="28" fill="#F8FAFC" font-size="15" font-weight="bold" font-family="monospace">Stage 4 Measured Trajectories (60 Hz Deterministic Simulation)</text>

  <!-- Left panel -->
  <rect x="${padL}" y="${padT}" width="${panelW}" height="${panelH}" fill="#0F172A" stroke="#1E293B" />
  <text x="${padL}" y="${padT - 10}" fill="#22D3EE" font-size="11" font-weight="bold" font-family="monospace">Spin Twirl Airtime Extension (+${((spinJump.at(-1).t - baseJump.at(-1).t)).toFixed(2)}s)</text>
  <path d="${pathFor(baseJump)}" fill="none" stroke="#64748B" stroke-width="2" stroke-dasharray="5 4" />
  <path d="${pathFor(spinJump)}" fill="none" stroke="#22D3EE" stroke-width="2.6" />
  <text x="${padL + 10}" y="${padT + 22}" fill="#22D3EE" font-size="10" font-family="monospace">Solid Cyan: Jump + Spin (${spinJump.at(-1).t.toFixed(2)}s)</text>
  <text x="${padL + 10}" y="${padT + 38}" fill="#94A3B8" font-size="10" font-family="monospace">Dashed: Standing Jump (${baseJump.at(-1).t.toFixed(2)}s)</text>

  <!-- Right panel -->
  <rect x="${rxOff}" y="${padT}" width="${panelW}" height="${panelH}" fill="#0F172A" stroke="#1E293B" />
  <text x="${rxOff}" y="${padT - 10}" fill="#4ADE80" font-size="11" font-weight="bold" font-family="monospace">Room 4 Wall Climb (+${wallClimb.at(-1).dy.toFixed(1)}t in ${wallClimb.at(-1).t.toFixed(2)}s)</text>
  <line x1="${rxOff}" y1="${ry(12).toFixed(1)}" x2="${rxOff + panelW}" y2="${ry(12).toFixed(1)}" stroke="rgba(250,204,21,0.45)" stroke-dasharray="4 3" />
  <path d="${wallPath}" fill="none" stroke="#4ADE80" stroke-width="2.6" />
  <text x="${rxOff + 10}" y="${padT + 22}" fill="#FACC15" font-size="10" font-family="monospace">Dashed Target: +12.0t (&lt; 7.0s)</text>
  <text x="${rxOff + 10}" y="${padT + 38}" fill="#4ADE80" font-size="10" font-family="monospace">Measured: +${wallClimb.at(-1).dy.toFixed(2)}t in ${wallClimb.at(-1).t.toFixed(2)}s</text>
</svg>`;
  fs.writeFileSync(path.join(outDir, 'acrobatic_trajectories.svg'), svg);
}

writeStateMachineSvg();
writeTrajectoriesSvg();

const summary = {
  baseJumpDurationSec: baseJump.at(-1).t,
  spinJumpDurationSec: spinJump.at(-1).t,
  spinAirtimeExtensionSec: +(spinJump.at(-1).t - baseJump.at(-1).t).toFixed(4),
  wallClimbHeightTiles: wallClimb.at(-1).dy,
  wallClimbDurationSec: wallClimb.at(-1).t,
  groundPoundDiveSpeed: Math.min(...groundPound.map((s) => s.vy)),
  groundPoundPeakTrauma: Math.max(...groundPound.map((s) => s.trauma)),
  traces: { baseJump, spinJump, wallClimb, groundPound },
};

fs.writeFileSync(path.join(outDir, 'stage4_acrobatic_traces.json'), JSON.stringify(summary, null, 2));
console.log('Generated Stage 4 review artifacts in', outDir);
console.log({
  spinExtension: summary.spinAirtimeExtensionSec,
  wallClimbTiles: summary.wallClimbHeightTiles,
  wallClimbSec: summary.wallClimbDurationSec,
  diveVy: summary.groundPoundDiveSpeed,
  peakTrauma: summary.groundPoundPeakTrauma,
});
