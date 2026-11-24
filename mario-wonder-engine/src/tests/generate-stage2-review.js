/**
 * Stage 2 Velocity Graph & Telemetry Artifact Generator
 * ======================================================
 * Runs deterministic Stage 2 kinematics and exports SVG velocity curves
 * + measured-vs-target JSON into /review/stage2/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../review/stage2');
fs.mkdirSync(outDir, { recursive: true });

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function setupPlayer() {
  resetMovementProfile();
  const map = new TileMap(80, 15);
  map.fillRect(0, 0, 80, 4, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(3.0, 4.0);
  player.update(null, collision, DT);
  player.update(null, collision, DT);
  return { map, collision, input, player };
}

function recordSeries(frames, getMask) {
  const { collision, input, player } = setupPlayer();
  const samples = [{ frame: 0, t: 0, vx: 0, x: player.pos.x, state: player.state }];
  for (let f = 1; f <= frames; f++) {
    input.applySnapshot(getMask(f, player));
    player.update(input, collision, DT);
    samples.push({
      frame: f,
      t: +(f / 60).toFixed(4),
      vx: +player.vel.x.toFixed(4),
      x: +player.pos.x.toFixed(4),
      state: player.state,
    });
  }
  return samples;
}

const walkSamples = recordSeries(35, () => InputManager.encodeActions([Actions.RIGHT]));
const runSamples = recordSeries(45, () => InputManager.encodeActions([Actions.RIGHT, Actions.RUN]));
const releaseSamples = recordSeries(75, (f) => (
  f <= 35 ? InputManager.encodeActions([Actions.RIGHT, Actions.RUN]) : 0
));
const skidSamples = recordSeries(60, (f) => (
  f <= 35
    ? InputManager.encodeActions([Actions.RIGHT, Actions.RUN])
    : InputManager.encodeActions([Actions.LEFT, Actions.RUN])
));

function renderSvg({ title, subtitle, seriesList, yMin, yMax, width = 760, height = 340 }) {
  const padL = 56;
  const padR = 24;
  const padT = 48;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxFrames = Math.max(...seriesList.map((s) => s.data.length - 1));

  const mapX = (f) => padL + (f / maxFrames) * plotW;
  const mapY = (v) => padT + ((yMax - v) / (yMax - yMin)) * plotH;

  const gridLines = [];
  for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v += 2) {
    const y = mapY(v).toFixed(1);
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${v === 0 ? '#64748B' : '#1E293B'}" stroke-width="${v === 0 ? 1.5 : 1}" />`);
    gridLines.push(`<text x="${padL - 8}" y="${+y + 4}" text-anchor="end" fill="#94A3B8" font-size="11" font-family="monospace">${v}</text>`);
  }

  const paths = seriesList.map((s) => {
    const d = s.data
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.frame).toFixed(1)} ${mapY(pt.vx).toFixed(1)}`)
      .join(' ');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" />`;
  });

  const legend = seriesList.map((s, idx) => {
    const lx = padL + idx * 180;
    return `<g transform="translate(${lx}, ${height - 14})"><rect width="12" height="4" y="-6" fill="${s.color}" rx="2"/><text x="18" y="0" fill="#CBD5E1" font-size="11" font-family="monospace">${s.label}</text></g>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#090D1F" rx="8" />
  <text x="${padL}" y="24" fill="#38BDF8" font-size="14" font-weight="bold" font-family="monospace">${title}</text>
  <text x="${padL}" y="39" fill="#94A3B8" font-size="11" font-family="monospace">${subtitle}</text>
  ${gridLines.join('\n  ')}
  ${paths.join('\n  ')}
  ${legend.join('\n  ')}
</svg>`;
}

fs.writeFileSync(
  path.join(outDir, 'walk_and_run_ramp.svg'),
  renderSvg({
    title: 'Stage 2 — Walk & Run Non-Linear Acceleration Curves (60 Hz)',
    subtitle: 'Frame-1 pop 1.25 t/s | Walk 5.20 t/s (~0.21s) | Run 9.20 t/s (~0.43s)',
    seriesList: [
      { label: 'Run (X held)', color: '#22D3EE', data: runSamples },
      { label: 'Walk only', color: '#FACC15', data: walkSamples },
    ],
    yMin: 0,
    yMax: 10,
  })
);

fs.writeFileSync(
  path.join(outDir, 'release_and_skid_brake.svg'),
  renderSvg({
    title: 'Stage 2 — Release Friction (22 t/s²) vs High-Speed Skid Brake (44 t/s²)',
    subtitle: 'Release halts in ~1.92t / 0.42s | Skid halts in ~0.96t / 0.21s',
    seriesList: [
      { label: 'Release Friction', color: '#38BDF8', data: releaseSamples },
      { label: 'Skid Reversal', color: '#FB923C', data: skidSamples },
    ],
    yMin: -6,
    yMax: 10,
  })
);

fs.writeFileSync(
  path.join(outDir, 'stage2_velocity_traces.json'),
  JSON.stringify({ walkSamples, runSamples, releaseSamples, skidSamples }, null, 2)
);

console.log(`Generated Stage 2 velocity graphs in ${outDir}`);
