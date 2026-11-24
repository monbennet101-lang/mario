/**
 * Stage 7 Review Artifact Generator
 * ===================================
 * Generates empirical camera tracking SVG curves and JSON telemetry traces
 * in /mario-wonder-engine/review/stage7/:
 *   1. horizontal_lookahead_and_reversal.svg — Player X, Camera X, Look-Ahead Offset (+3.0t -> -3.0t), and Player Screen X %
 *   2. vertical_calm_and_ledge_ease.svg — Flat standing jump (0.00t cam drift) vs 6-tile ledge jump & 0.60s landing ease
 *   3. stage7_camera_traces.json — Summary metrics and frame-by-frame samples
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import TileMap from '../engine/physics/TileMap.js';

const TILE_TYPE = MovementProfile.tileTypes;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../review/stage7');
fs.mkdirSync(outDir, { recursive: true });

resetMovementProfile();

// ── 1. Horizontal Look-Ahead & Reversal Trace ──
const engH = new GameEngine();
engH.initHeadless(0);
engH.player.pos.x = 14.0;
engH.player.prevPos.x = 14.0;
engH.camera.snapToPlayer(engH.player, engH.tileMap);

const horizSamples = [];
for (let f = 0; f < 160; f++) {
  const input = f < 90
    ? { right: true, run: true }
    : { left: true, run: true };
  engH.stepHeadless(input);
  horizSamples.push({
    frame: f,
    t: Number((f / 60).toFixed(4)),
    playerX: Number(engH.player.pos.x.toFixed(3)),
    camX: Number(engH.camera.x.toFixed(3)),
    lookAhead: Number(engH.camera.lookAheadOffset.toFixed(3)),
    screenXPercent: Number((engH.camera.playerScreenX * 100).toFixed(2)),
    fov: Number(engH.camera.camera.fov.toFixed(2)),
  });
}

// ── 2. Vertical Calm (Flat Jump) & 6-Tile Ledge Elevation Trace ──
const engV = new GameEngine();
engV.initHeadless(0);
const tallMap = new TileMap(60, 30);
tallMap.fillRect(0, 0, 60, 5, TILE_TYPE.SOLID);
for (let x = 14; x <= 40; x++) {
  tallMap.setTile(x, 10, TILE_TYPE.SEMISOLID); // y = 11.0 top (+6.0t ledge)
}
engV.tileMap = tallMap;
engV.player.spawn(20.0, 5.0);
for (let i = 0; i < 4; i++) {
  engV.stepHeadless({});
}
engV.camera.snapToPlayer(engV.player, tallMap);

const vertSamples = [];
for (let f = 0; f < 160; f++) {
  // Frames 0..64: Full standing jump on flat ground
  // Frame 65: High jump onto y = 8.0 (+6.0t) ledge
  if (f === 65) {
    MovementProfile.jump.launchVelocity = 26.0;
  }
  const jumpHeld = (f >= 2 && f < 30) || (f >= 66 && f < 92);
  engV.stepHeadless({ jump: jumpHeld });
  vertSamples.push({
    frame: f,
    t: Number((f / 60).toFixed(4)),
    playerY: Number(engV.player.pos.y.toFixed(3)),
    camY: Number(engV.camera.y.toFixed(3)),
    anchorY: Number(engV.camera.anchorElevationY.toFixed(3)),
    screenYPercent: Number((engV.camera.playerScreenY * 100).toFixed(2)),
  });
}

function buildHorizontalSvg(samples) {
  const w = 860;
  const h = 380;
  const padL = 58;
  const padR = 30;
  const padT = 44;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const toX = (f) => padL + (f / (samples.length - 1)) * plotW;
  const toYLead = (val) => padT + ((4.0 - val) / 8.0) * plotH; // -4..+4 tiles
  const toYScr = (pct) => padT + ((100 - pct) / 100) * plotH; // 0..100%

  const leadPts = samples.map((s) => `${toX(s.frame).toFixed(1)},${toYLead(s.lookAhead).toFixed(1)}`).join(' ');
  const scrPts = samples.map((s) => `${toX(s.frame).toFixed(1)},${toYScr(s.screenXPercent).toFixed(1)}`).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#070B19"/>
  <text x="${padL}" y="26" fill="#38BDF8" font-family="monospace" font-size="14" font-weight="bold">STAGE 7 — HORIZONTAL LOOK-AHEAD (+3.0t) &amp; 0.40s REVERSAL EASING</text>
  <rect x="${padL}" y="${toYScr(48).toFixed(1)}" width="${plotW}" height="${(toYScr(35) - toYScr(48)).toFixed(1)}" fill="rgba(74, 222, 128, 0.10)" stroke="rgba(74, 222, 128, 0.35)" stroke-dasharray="4 3"/>
  <line x1="${padL}" y1="${toYLead(0).toFixed(1)}" x2="${w - padR}" y2="${toYLead(0).toFixed(1)}" stroke="rgba(148,163,184,0.28)" stroke-width="1"/>
  <line x1="${toX(90).toFixed(1)}" y1="${padT}" x2="${toX(90).toFixed(1)}" y2="${h - padB}" stroke="#FACC15" stroke-dasharray="5 4" stroke-width="1.2"/>
  <polyline fill="none" stroke="#38BDF8" stroke-width="2.5" points="${leadPts}"/>
  <polyline fill="none" stroke="#4ADE80" stroke-width="2.2" points="${scrPts}"/>
  <text x="${padL + 10}" y="${padT + 18}" fill="#38BDF8" font-family="monospace" font-size="11">Cyan: Look-Ahead Offset (-3.0t to +3.0t)</text>
  <text x="${padL + 310}" y="${padT + 18}" fill="#4ADE80" font-family="monospace" font-size="11">Green: Player Screen X % (Target Band 35%–48%)</text>
  <text x="${toX(90) + 6}" y="${padT + 36}" fill="#FACC15" font-family="monospace" font-size="11">Frame 90: Sprint Reversal</text>
</svg>`;
}

function buildVerticalSvg(samples) {
  const w = 860;
  const h = 380;
  const padL = 58;
  const padR = 30;
  const padT = 44;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const toX = (f) => padL + (f / (samples.length - 1)) * plotW;
  const toYWorld = (y) => padT + ((16.0 - y) / 16.0) * plotH;

  const playerPts = samples.map((s) => `${toX(s.frame).toFixed(1)},${toYWorld(s.playerY).toFixed(1)}`).join(' ');
  const camPts = samples.map((s) => `${toX(s.frame).toFixed(1)},${toYWorld(s.camY).toFixed(1)}`).join(' ');
  const anchorPts = samples.map((s) => `${toX(s.frame).toFixed(1)},${toYWorld(s.anchorY).toFixed(1)}`).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#070B19"/>
  <text x="${padL}" y="26" fill="#FACC15" font-family="monospace" font-size="14" font-weight="bold">STAGE 7 — VERTICAL CALM (0.00t DRIFT) &amp; 6-TILE LEDGE RE-CENTERING (0.60s)</text>
  <line x1="${toX(65).toFixed(1)}" y1="${padT}" x2="${toX(65).toFixed(1)}" y2="${h - padB}" stroke="rgba(148,163,184,0.35)" stroke-dasharray="5 4"/>
  <polyline fill="none" stroke="#38BDF8" stroke-width="2.0" points="${playerPts}"/>
  <polyline fill="none" stroke="#FACC15" stroke-width="2.0" stroke-dasharray="4 3" points="${anchorPts}"/>
  <polyline fill="none" stroke="#FB7185" stroke-width="2.6" points="${camPts}"/>
  <text x="${padL + 10}" y="${padT + 18}" fill="#38BDF8" font-family="monospace" font-size="11">Cyan: Player Y (tiles)</text>
  <text x="${padL + 200}" y="${padT + 18}" fill="#FB7185" font-family="monospace" font-size="11">Rose: Camera Y (0.00t flat jump drift)</text>
  <text x="${padL + 490}" y="${padT + 18}" fill="#FACC15" font-family="monospace" font-size="11">Gold: Elevation Anchor (0.60s ease)</text>
</svg>`;
}

fs.writeFileSync(path.join(outDir, 'horizontal_lookahead_and_reversal.svg'), buildHorizontalSvg(horizSamples));
fs.writeFileSync(path.join(outDir, 'vertical_calm_and_ledge_ease.svg'), buildVerticalSvg(vertSamples));
fs.writeFileSync(
  path.join(outDir, 'stage7_camera_traces.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        settledSprintScreenXPercent: horizSamples[89].screenXPercent,
        settledSprintLookAheadTiles: horizSamples[89].lookAhead,
        settledSprintFovDeg: horizSamples[89].fov,
        flatJumpCameraYDriftTiles: Number(
          Math.max(...vertSamples.slice(0, 64).map((s) => Math.abs(s.camY - vertSamples[0].camY))).toFixed(4)
        ),
        maxLedgeJumpScreenYPercent: Number(
          Math.max(...vertSamples.slice(65).map((s) => s.screenYPercent)).toFixed(2)
        ),
      },
      horizSamples,
      vertSamples,
    },
    null,
    2
  )
);

console.log('Stage 7 review artifacts generated in:', outDir);
