/**
 * Stage 3 Jump Arc & Forgiveness Artifact Generator
 * ===================================================
 * Runs deterministic Stage 3 jump simulations and exports SVG trajectory plots
 * + measured telemetry JSON into /review/stage3/.
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
const outDir = path.resolve(__dirname, '../../review/stage3');
fs.mkdirSync(outDir, { recursive: true });

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function setupFlat() {
  resetMovementProfile();
  const map = new TileMap(120, 20);
  map.fillRect(0, 0, 120, 4, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(4.0, 4.0);
  player.update(null, collision, DT);
  player.update(null, collision, DT);
  return { collision, input, player };
}

function recordJump(preRunFrames, holdJumpFrames) {
  const { collision, input, player } = setupFlat();
  const runRight = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  for (let f = 0; f < preRunFrames; f++) {
    input.applySnapshot(runRight);
    player.update(input, collision, DT);
  }

  const startY = player.pos.y;
  const startX = player.pos.x;
  const samples = [{ frame: 0, t: 0, dy: 0, dx: 0, vy: +player.vel.y.toFixed(4) }];

  for (let f = 1; f <= 80; f++) {
    const acts = [];
    if (preRunFrames > 0) acts.push(Actions.RIGHT, Actions.RUN);
    if (f <= holdJumpFrames) acts.push(Actions.JUMP);
    input.applySnapshot(InputManager.encodeActions(acts));
    player.update(input, collision, DT);
    samples.push({
      frame: f,
      t: +(f / 60).toFixed(4),
      dy: +(player.pos.y - startY).toFixed(4),
      dx: +(player.pos.x - startX).toFixed(4),
      vy: +player.vel.y.toFixed(4),
      state: player.state,
    });
    if (f > 2 && player.grounded) break;
  }

  return {
    samples,
    peakHeight: +player.jumpMetrics.peakHeight.toFixed(4),
    timeToApex: +player.jumpMetrics.timeToApex.toFixed(4),
    airtime: +player.jumpMetrics.airtime.toFixed(4),
    apexFloatFrames: player.jumpMetrics.apexFloatFrames,
  };
}

const standingJump = recordJump(0, 70);
const sprintJump = recordJump(45, 70);
const tapJump = recordJump(0, 1);

function renderJumpComparisonSvg() {
  const width = 760;
  const height = 360;
  const padL = 58;
  const padR = 24;
  const padT = 50;
  const padB = 46;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxFrames = 56;
  const maxY = 5.2;

  const mapX = (f) => padL + (f / maxFrames) * plotW;
  const mapY = (dy) => padT + ((maxY - dy) / maxY) * plotH;

  const gridLines = [];
  for (let yVal = 0; yVal <= 5; yVal += 1) {
    const y = mapY(yVal).toFixed(1);
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${yVal === 0 ? '#64748B' : '#1E293B'}" stroke-width="${yVal === 0 ? 1.5 : 1}" />`);
    gridLines.push(`<text x="${padL - 8}" y="${+y + 4}" text-anchor="end" fill="#94A3B8" font-size="11" font-family="monospace">${yVal}.0t</text>`);
  }
  // Target band markers (4.10t standing, 4.85t sprint)
  for (const target of [
    { val: 4.10, label: '4.10t target', color: 'rgba(56, 189, 248, 0.4)' },
    { val: 4.85, label: '4.85t target', color: 'rgba(245, 158, 11, 0.4)' },
  ]) {
    const y = mapY(target.val).toFixed(1);
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${target.color}" stroke-dasharray="5 4" stroke-width="1.2" />`);
  }

  const series = [
    { label: `Sprint Jump (${sprintJump.peakHeight.toFixed(2)}t)`, color: '#F59E0B', data: sprintJump.samples },
    { label: `Standing Jump (${standingJump.peakHeight.toFixed(2)}t)`, color: '#38BDF8', data: standingJump.samples },
    { label: `1f Tap Jump (${tapJump.peakHeight.toFixed(2)}t)`, color: '#4ADE80', data: tapJump.samples },
  ];

  const paths = series.map((s) => {
    const d = s.data
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.frame).toFixed(1)} ${mapY(pt.dy).toFixed(1)}`)
      .join(' ');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" />`;
  });

  const legend = series.map((s, idx) => {
    const lx = padL + idx * 225;
    return `<g transform="translate(${lx}, ${height - 16})"><rect width="12" height="4" y="-6" fill="${s.color}" rx="2"/><text x="18" y="0" fill="#CBD5E1" font-size="11" font-family="monospace">${s.label}</text></g>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#090D1F" rx="8" />
  <text x="${padL}" y="24" fill="#38BDF8" font-size="14" font-weight="bold" font-family="monospace">Stage 3 — Two-Phase Asymmetric Jump Curves &amp; Apex Float (60 Hz)</text>
  <text x="${padL}" y="40" fill="#94A3B8" font-size="11" font-family="monospace">Standing: ${standingJump.peakHeight}t (${standingJump.timeToApex}s apex) | Sprint: ${sprintJump.peakHeight}t | 1f Tap: ${tapJump.peakHeight}t</text>
  ${gridLines.join('\n  ')}
  ${paths.join('\n  ')}
  ${legend.join('\n  ')}
</svg>`;
}

function measureCoyoteWindow() {
  const results = [];
  for (let k = 1; k <= 7; k++) {
    resetMovementProfile();
    const map = new TileMap(30, 15);
    map.fillRect(0, 0, 8, 6, tileTypes.SOLID);
    const collision = new CollisionSystem(map);
    const input = new InputManager();
    const player = new PlayerController();
    player.spawn(6.5, 6.0);
    player.update(null, collision, DT);

    const runRight = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
    while (player.grounded) {
      input.applySnapshot(runRight);
      player.update(input, collision, DT);
    }
    for (let i = 1; i < k; i++) {
      input.applySnapshot(0);
      player.update(input, collision, DT);
    }
    input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
    player.update(input, collision, DT);
    results.push({ frameOffset: k, success: player.isJumping && player.vel.y > 15 });
  }
  return results;
}

function measureBufferWindow() {
  const results = [];
  for (let j = 1; j <= 8; j++) {
    resetMovementProfile();
    const { collision, input, player } = setupFlat();
    const probe = new PlayerController();
    probe.spawn(5.0, 10.0);
    probe.vel.y = -12.0;
    let landFrame = -1;
    for (let f = 1; f <= 60; f++) {
      probe.update(null, collision, DT);
      if (probe.grounded) {
        landFrame = f;
        break;
      }
    }
    player.spawn(5.0, 10.0);
    player.vel.y = -12.0;
    const pressFrame = landFrame - j;
    let success = false;
    for (let f = 1; f <= landFrame; f++) {
      input.applySnapshot(f === pressFrame ? InputManager.encodeActions([Actions.JUMP]) : 0);
      player.update(input, collision, DT);
      if (f === landFrame) success = !player.grounded && player.vel.y > 18;
    }
    results.push({ frameOffset: j, success });
  }
  return results;
}

const coyoteWindow = measureCoyoteWindow();
const bufferWindow = measureBufferWindow();

function renderForgivenessSvg() {
  const width = 760;
  const height = 260;
  const padL = 58;

  const drawRow = (title, y, items, passColor) => {
    const cells = items.map((item, idx) => {
      const cx = padL + idx * 78;
      const fill = item.success ? passColor : 'rgba(239, 68, 68, 0.25)';
      const stroke = item.success ? passColor : '#EF4444';
      const txt = item.success ? 'PASS' : 'FAIL';
      return `
        <rect x="${cx}" y="${y}" width="68" height="38" rx="6" fill="${fill}" fill-opacity="0.28" stroke="${stroke}" stroke-width="1.5" />
        <text x="${cx + 34}" y="${y + 16}" text-anchor="middle" fill="#F8FAFC" font-size="11" font-weight="bold" font-family="monospace">${item.frameOffset}f</text>
        <text x="${cx + 34}" y="${y + 31}" text-anchor="middle" fill="${item.success ? '#E2E8F0' : '#FCA5A5'}" font-size="10" font-family="monospace">${txt}</text>
      `;
    });
    return `
      <text x="${padL}" y="${y - 10}" fill="#CBD5E1" font-size="12" font-weight="bold" font-family="monospace">${title}</text>
      ${cells.join('\n')}
    `;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#090D1F" rx="8" />
  <text x="${padL}" y="28" fill="#38BDF8" font-size="14" font-weight="bold" font-family="monospace">Stage 3 — Invisible Player Forgiveness Frame Windows (60 Hz)</text>
  ${drawRow('Coyote Time (5 frames after ledge drop: 1f–5f pass, 6f+ fail)', 76, coyoteWindow, '#4ADE80')}
  ${drawRow('Jump Buffer (6 frames prior to landing: 1f–6f pass, 7f+ fail)', 168, bufferWindow, '#FACC15')}
</svg>`;
}

fs.writeFileSync(path.join(outDir, 'standing_vs_running_jump.svg'), renderJumpComparisonSvg());
fs.writeFileSync(path.join(outDir, 'forgiveness_windows.svg'), renderForgivenessSvg());
fs.writeFileSync(
  path.join(outDir, 'stage3_jump_traces.json'),
  JSON.stringify({ standingJump, sprintJump, tapJump, coyoteWindow, bufferWindow }, null, 2)
);

console.log(`Generated Stage 3 review artifacts in ${outDir}`);
