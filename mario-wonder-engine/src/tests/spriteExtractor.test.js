/**
 * Stage spriteoverhaul-00: Automated Zero-Crop Sprite Extraction & Atlas Verification Tests
 * =========================================================================================
 * Proves:
 *  1. Pure logic integrity (CadenceConfig, AlphaAudit, auto-expansion, grid packer, PngCodec).
 *  2. Generated `public/sprites/character_atlas.png` and `public/sprites/character_atlas.json`:
 *       - >325 frames rendered across all 27 clips + custom/repurposed tags.
 *       - Independent pixel-by-pixel PNG alpha audit confirms 0 cropped frames
 *         (bbox[0] > 0 && bbox[1] > 0 && bbox[2] < 256 && bbox[3] < 256) and 100% clean margins.
 *       - Idle contains exactly 31 frames with smooth breathing progression (non-static, low delta).
 *       - SpinJump and SpinAir each contain 12 frames demonstrating genuine 360° perspective rotation.
 *       - GroundPound contains 4 programmatic front-flip pitch angles (0°, 90°, 180°, 270°) + dive poses.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXTRACTION_CONFIG,
  ANIMATION_CADENCE_SPECS,
  DEFAULT_CUSTOM_TAGS,
  expandExtractionJobs,
} from '../tools/spriteExtractor/CadenceConfig.js';
import {
  analyzeAlphaBounds,
  auditFrames,
  computeAutoExpandedOrthoScale,
  computeAtlasGrid,
  resolveCustomTags,
} from '../tools/spriteExtractor/AlphaAudit.js';
import {
  encodePngRGBA,
  decodePngRGBA,
  extractSubImageRGBA,
} from '../tools/spriteExtractor/PngCodec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENGINE_ROOT = path.resolve(__dirname, '../..');
const ATLAS_PNG_PATH = path.join(ENGINE_ROOT, 'public', 'sprites', 'character_atlas.png');
const ATLAS_JSON_PATH = path.join(ENGINE_ROOT, 'public', 'sprites', 'character_atlas.json');

function computeFrameDiffRatio(rgbaA, rgbaB) {
  let diffPixels = 0;
  const totalPixels = rgbaA.length / 4;
  for (let i = 0; i < rgbaA.length; i += 4) {
    const da = Math.abs(rgbaA[i + 3] - rgbaB[i + 3]);
    const dr = Math.abs(rgbaA[i] - rgbaB[i]);
    const dg = Math.abs(rgbaA[i + 1] - rgbaB[i + 1]);
    const db = Math.abs(rgbaA[i + 2] - rgbaB[i + 2]);
    if (da > 24 || (rgbaA[i + 3] > 20 && rgbaB[i + 3] > 20 && dr + dg + db > 45)) {
      diffPixels++;
    }
  }
  return diffPixels / totalPixels;
}

// ── 1. Pure Logic Unit Tests ──────────────────────────────────────────────

test('CadenceConfig matches exact 60Hz sampling targets and exceeds 325 total frames', () => {
  const jobs = expandExtractionJobs(ANIMATION_CADENCE_SPECS);
  const byAnim = new Map();
  for (const j of jobs) {
    if (!byAnim.has(j.animation)) byAnim.set(j.animation, []);
    byAnim.get(j.animation).push(j);
  }

  assert.equal(ANIMATION_CADENCE_SPECS.length, 27, 'Must cover all 27 GLB animation clips');
  assert.ok(jobs.length > 325, `Expected >325 total frames, got ${jobs.length}`);

  // Exact required frame counts
  const expectedCounts = {
    Idle: 31,
    Walk: 15,
    Run: 15,
    Sprint: 15,
    Skid: 11,
    TurnAround: 5,
    CrouchStart: 2,
    Crouch: 7,
    Jump: 12,
    DoubleJump: 12,
    TripleJump: 17,
    FlutterJump: 11,
    WallSlide: 15,
    WallJump: 9,
    SpinJump: 12,
    SpinAir: 12,
    GroundPound: 7,
    GroundPoundLand: 6,
    Fireball: 10,
    FireballAir: 13,
    CarryWalk: 15,
    Throw: 15,
    Climb: 11,
    Swim: 9,
    Damage: 12,
    Defeat: 19,
    Victory: 17,
  };

  for (const [anim, count] of Object.entries(expectedCounts)) {
    assert.equal(byAnim.get(anim)?.length, count, `${anim} frame count mismatch`);
  }

  // Verify Idle cadence: 0, 5, 10, ..., 150
  const idleTicks = byAnim.get('Idle').map((j) => j.tick);
  assert.equal(idleTicks[0], 0);
  assert.equal(idleTicks[idleTicks.length - 1], 150);
  for (let i = 1; i < idleTicks.length; i++) {
    assert.equal(idleTicks[i] - idleTicks[i - 1], 5);
  }

  // Verify SpinJump & SpinAir programmatic 30-degree increments (0..330)
  for (const spinAnim of ['SpinJump', 'SpinAir']) {
    const angles = byAnim.get(spinAnim).map((j) => j.yawOffsetDeg);
    assert.deepEqual(angles, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  }

  // Verify GroundPound programmatic front-flip somersault angles (0, 90, 180, 270) + dive poses
  const gpPitches = byAnim.get('GroundPound').slice(0, 4).map((j) => j.pitchDeg);
  assert.deepEqual(gpPitches, [0, 90, 180, 270]);
});

test('AlphaAudit detects clean interior silhouettes vs border-cropped pixels and auto-expands', () => {
  const size = 64;
  const cleanBuf = new Uint8Array(size * size * 4);
  for (let y = 10; y < 54; y++) {
    for (let x = 12; x < 52; x++) {
      const idx = (y * size + x) * 4;
      cleanBuf[idx] = 220;
      cleanBuf[idx + 3] = 255;
    }
  }
  const cleanRes = analyzeAlphaBounds(cleanBuf, size, size, 8);
  assert.equal(cleanRes.empty, false);
  assert.equal(cleanRes.touchesBorder, false);
  assert.deepEqual(cleanRes.bbox, [12, 10, 52, 54]);
  assert.equal(cleanRes.minMarginPx, 10);

  // Touching top edge y=0 must fail zero-crop audit
  const croppedBuf = new Uint8Array(cleanBuf);
  croppedBuf[32 * 4 + 3] = 255;
  const croppedRes = analyzeAlphaBounds(croppedBuf, size, size, 8);
  assert.equal(croppedRes.touchesBorder, true);
  assert.ok(croppedRes.borderEdges.includes('top'));

  const summaryFail = auditFrames(
    [
      { key: 'ok', audit: cleanRes },
      { key: 'bad', audit: croppedRes },
    ],
    size,
    4
  );
  assert.equal(summaryFail.passed, false);
  assert.equal(summaryFail.croppedCount, 1);

  const expanded = computeAutoExpandedOrthoScale(56.0, summaryFail, size, 1.12);
  assert.ok(expanded > 56.0, 'Auto-expand must increase orthographic scale when cropped');
});

test('Atlas grid packer & custom tag resolver produce valid deterministic layouts', () => {
  const grid = computeAtlasGrid(335, 256);
  assert.equal(grid.cols * grid.rows >= 335, true);
  assert.equal(grid.atlasWidth, grid.cols * 256);
  assert.equal(grid.atlasHeight, grid.rows * 256);
  assert.ok(grid.utilization > 0.9, 'Grid packing utilization should exceed 90%');

  const resolved = resolveCustomTags(
    {
      Jump: Array.from({ length: 12 }, (_, i) => `Jump_${String(i).padStart(2, '0')}`),
      Crouch: Array.from({ length: 7 }, (_, i) => `Crouch_${String(i).padStart(2, '0')}`),
      SpinAir: Array.from({ length: 12 }, (_, i) => `SpinAir_${String(i).padStart(2, '0')}`),
      GroundPound: Array.from({ length: 7 }, (_, i) => `GroundPound_${String(i).padStart(2, '0')}`),
      TurnAround: Array.from({ length: 5 }, (_, i) => `TurnAround_${String(i).padStart(2, '0')}`),
    },
    DEFAULT_CUSTOM_TAGS
  );
  assert.deepEqual(resolved.Fall.frames, ['Jump_09', 'Jump_10', 'Jump_11']);
  assert.equal(resolved.SpinTwirl.frames.length, 12);
  assert.equal(resolved.GroundPoundWindup.frames.length, 4);
  assert.equal(resolved.GroundPoundFall.frames.length, 3);
});

test('PngCodec round-trips lossless 8-bit RGBA image data cleanly', () => {
  const w = 16;
  const h = 16;
  const src = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    src[i * 4] = (i * 7) & 255;
    src[i * 4 + 1] = (i * 13) & 255;
    src[i * 4 + 2] = (i * 29) & 255;
    src[i * 4 + 3] = i % 3 === 0 ? 0 : 255;
  }
  const png = encodePngRGBA(src, w, h);
  const decoded = decodePngRGBA(png);
  assert.equal(decoded.width, w);
  assert.equal(decoded.height, h);
  assert.deepEqual(decoded.data, src);
});

// ── 2. Generated Atlas Artifact Verification (Independent Pixel Audit) ────

test('Generated character_atlas.json & character_atlas.png exist, are valid, and pass 0-crop pixel audit', () => {
  assert.ok(fs.existsSync(ATLAS_JSON_PATH), `Missing manifest: ${ATLAS_JSON_PATH}`);
  assert.ok(fs.existsSync(ATLAS_PNG_PATH), `Missing atlas PNG: ${ATLAS_PNG_PATH}`);

  const manifest = JSON.parse(fs.readFileSync(ATLAS_JSON_PATH, 'utf8'));
  const pngBuf = fs.readFileSync(ATLAS_PNG_PATH);
  const decoded = decodePngRGBA(pngBuf);

  assert.equal(decoded.width, manifest.meta.size.w, 'PNG width must match manifest.meta.size.w');
  assert.equal(decoded.height, manifest.meta.size.h, 'PNG height must match manifest.meta.size.h');
  assert.equal(manifest.meta.cellSize.w, 256);
  assert.equal(manifest.meta.cellSize.h, 256);
  assert.deepEqual(manifest.meta.footAnchor, { x: 0.5, y: 0.15 });

  const frameEntries = Object.entries(manifest.frames);
  assert.ok(frameEntries.length > 325, `Expected >325 frames in atlas, got ${frameEntries.length}`);
  assert.equal(manifest.meta.totalFrames, frameEntries.length);

  // Independently scan EVERY SINGLE 256x256 cell from the PNG on disk
  let minMarginObserved = 256;
  const croppedList = [];

  for (const [key, rect] of frameEntries) {
    assert.equal(rect.w, 256);
    assert.equal(rect.h, 256);
    assert.ok(rect.x >= 0 && rect.x + rect.w <= decoded.width, `${key} rect X out of bounds`);
    assert.ok(rect.y >= 0 && rect.y + rect.h <= decoded.height, `${key} rect Y out of bounds`);
    assert.deepEqual(rect.anchor, { x: 0.5, y: 0.15 });

    const cellRgba = extractSubImageRGBA(decoded.data, decoded.width, rect.x, rect.y, rect.w, rect.h);
    const cellAudit = analyzeAlphaBounds(cellRgba, 256, 256, EXTRACTION_CONFIG.alphaThreshold);

    assert.equal(cellAudit.empty, false, `Frame ${key} rendered completely empty/transparent`);
    const [x0, y0, x1, y1] = cellAudit.bbox;
    if (!(x0 > 0 && y0 > 0 && x1 < 256 && y1 < 256)) {
      croppedList.push({ key, bbox: cellAudit.bbox, edges: cellAudit.borderEdges });
    }
    if (cellAudit.minMarginPx < minMarginObserved) {
      minMarginObserved = cellAudit.minMarginPx;
    }
  }

  assert.equal(
    croppedList.length,
    0,
    `Zero-crop violation! ${croppedList.length} frames touched image borders: ${JSON.stringify(croppedList.slice(0, 5))}`
  );
  assert.ok(minMarginObserved >= 4, `Expected >=4px clean safety margin across all frames, got ${minMarginObserved}px`);

  // Verify Idle 31-frame ultra-smooth breathing cadence (non-static, smooth adjacent steps)
  const idleKeys = manifest.animations.Idle;
  assert.equal(idleKeys.length, 31, 'Idle must contain exactly 31 frames');
  const idleCells = idleKeys.map((k) => {
    const r = manifest.frames[k];
    return extractSubImageRGBA(decoded.data, decoded.width, r.x, r.y, r.w, r.h);
  });
  const idleSpanDiff = computeFrameDiffRatio(idleCells[0], idleCells[15]);
  assert.ok(idleSpanDiff > 0.002, `Idle breathing frames appear completely frozen (diff=${idleSpanDiff})`);
  let maxIdleStepDiff = 0;
  for (let i = 1; i < idleCells.length; i++) {
    const d = computeFrameDiffRatio(idleCells[i - 1], idleCells[i]);
    if (d > maxIdleStepDiff) maxIdleStepDiff = d;
  }
  assert.ok(maxIdleStepDiff < 0.06, `Idle adjacent frame jump too large (${maxIdleStepDiff}); should be silky breathing`);

  // Verify SpinJump & SpinAir demonstrate true 360-degree perspective rotation (distinct silhouettes across angles)
  for (const spinName of ['SpinJump', 'SpinAir']) {
    const keys = manifest.animations[spinName];
    assert.equal(keys.length, 12, `${spinName} must have 12 turnaround frames`);
    const cells = keys.map((k) => {
      const r = manifest.frames[k];
      return extractSubImageRGBA(decoded.data, decoded.width, r.x, r.y, r.w, r.h);
    });
    // 0 deg vs 90 deg (side vs front/back), 0 deg vs 180 deg (right vs left profile), 90 deg vs 270 deg must be clearly distinct
    const diff0_90 = computeFrameDiffRatio(cells[0], cells[3]);
    const diff0_180 = computeFrameDiffRatio(cells[0], cells[6]);
    const diff90_270 = computeFrameDiffRatio(cells[3], cells[9]);
    assert.ok(diff0_90 > 0.03, `${spinName} 0° vs 90° not rotated (diff=${diff0_90})`);
    assert.ok(diff0_180 > 0.03, `${spinName} 0° vs 180° not rotated (diff=${diff0_180})`);
    assert.ok(diff90_270 > 0.03, `${spinName} 90° vs 270° not rotated (diff=${diff90_270})`);
  }

  // Verify GroundPound windup front-flip somersault (0°, 90°, 180°, 270°) + dive poses
  const gpKeys = manifest.animations.GroundPound;
  assert.equal(gpKeys.length, 7);
  const gpCells = gpKeys.map((k) => {
    const r = manifest.frames[k];
    return extractSubImageRGBA(decoded.data, decoded.width, r.x, r.y, r.w, r.h);
  });
  assert.ok(computeFrameDiffRatio(gpCells[0], gpCells[1]) > 0.04, 'GroundPound 0° vs 90° pitch flip must differ');
  assert.ok(computeFrameDiffRatio(gpCells[0], gpCells[2]) > 0.04, 'GroundPound 0° vs 180° pitch flip must differ');
  assert.ok(computeFrameDiffRatio(gpCells[1], gpCells[3]) > 0.04, 'GroundPound 90° vs 270° pitch flip must differ');
});
