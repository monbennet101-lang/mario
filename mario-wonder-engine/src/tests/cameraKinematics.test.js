/**
 * Dynamic Platformer Camera Kinematics — Headless Verification Suite
 * ====================================================================
 * Directly verifies all 5 architectural pillars and 3 explicit VERIFY tests
 * of `src/render/camera.js`:
 *
 *   VERIFY Test 1: Step input from 0 to max sprint -> camera x smoothly accelerates
 *                  without sudden frame-to-frame delta spikes (d²x/dt² bounded) and
 *                  achieves up to 2.50 tiles (160px) forward lead.
 *   VERIFY Test 2: Rapid left-right directional skidding -> camera does not oscillate
 *                  violently, maintaining stable turnaround hysteresis and variable alpha
 *                  (0.05 normal run vs 0.12 skid/turnaround).
 *   VERIFY Test 3: Player lands at boundary x = 0 -> camera strictly clamps to world
 *                  origin without sub-pixel jitter across ticks and render alpha values.
 *
 *   Plus dedicated pillar assertions for:
 *     - Pillar 1: Dual-Axis Deadzone (48px horizontal zero-scroll; 64px vertical step lock).
 *     - Pillar 2: Look-Ahead target formula Lx = sign(vx) * min(|vx| * 18.0, 160px).
 *     - Pillar 3: Upward Jump Damping (α=0.08), Downward Descent Anticipation
 *                 (vy < -6.0 t/s for > 12 consecutive frames -> +120px), and 15f Ground Snap.
 *     - Pillar 4: Sprint Momentum Lens Expansion (|vx| >= 9.20 t/s for > 30 frames -> Z=0.925
 *                 via Canvas 2D transform; smooth 20f restore to Z=1.000 on deceleration).
 *     - Pillar 5: Strict Level Boundary Clamping & Room Partition Camera Locks
 *                 (vertical divider, horizontal divider, arena box, autoTrigger, clearLock).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import PlatformerCamera, {
  computeTargetLookAheadPx,
  computeEffectiveCameraBounds,
  applyCanvasCameraTransform,
} from '../render/camera.js';
import GameEngine from '../engine/core/GameEngine.js';
import TileMap from '../engine/physics/TileMap.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';

const DT = MovementProfile.simulation.fixedTimeStep; // 1/60s
const TILE_TYPE = MovementProfile.tileTypes;

describe('Dynamic Platformer Camera Kinematics (src/render/camera.js)', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  // ─── VERIFY TEST 1 ──────────────────────────────────────────────────────────
  it('VERIFY Test 1: Step input 0 -> max sprint smoothly accelerates camera X with strictly bounded d²x/dt² and +160px (2.50t) lead', () => {
    const cam = new PlatformerCamera();
    const map = new TileMap(240, 24);
    let px = 20.0;
    const py = 4.0;
    const maxSprintVx = MovementProfile.locomotion.runTopSpeed; // 9.20 t/s

    cam.snapTo(px - cam.viewW * 0.5, 0, px, py, map);

    const xs = [cam.x];
    // Hard step input: velocity jumps instantaneously from 0 to 9.20 tiles/s at frame 0
    for (let f = 0; f < 150; f++) {
      px += maxSprintVx * DT;
      cam.update(px, py, maxSprintVx, 0, true, DT, map);
      xs.push(cam.x);
    }

    // Compute first-difference (dx/dt) and second-difference (d²x/dt²) across the entire step response
    let maxFrameDelta = 0;
    let maxAccelTilesPerSec2 = 0;
    let firstFrameDelta = xs[1] - xs[0];

    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1];
      if (Math.abs(dx) > maxFrameDelta) maxFrameDelta = Math.abs(dx);
      if (i >= 2) {
        const prevDx = xs[i - 1] - xs[i - 2];
        const d2xDt2 = Math.abs((dx - prevDx) / (DT * DT));
        if (d2xDt2 > maxAccelTilesPerSec2) maxAccelTilesPerSec2 = d2xDt2;
      }
    }

    // Camera must accelerate smoothly (not jump instantaneously on frame 1)
    assert.ok(
      firstFrameDelta < 0.15,
      `Frame-1 step delta must be smoothly damped, not a jump (got ${firstFrameDelta.toFixed(4)}t)`
    );
    // Frame-to-frame delta must stay bounded without sudden spikes
    assert.ok(
      maxFrameDelta < 0.35,
      `Max frame-to-frame camera X delta must stay bounded (got ${maxFrameDelta.toFixed(4)}t/f)`
    );
    // Second derivative d²x/dt² must remain strictly bounded
    assert.ok(
      maxAccelTilesPerSec2 < 120.0,
      `Camera acceleration d²x/dt² must stay strictly bounded during 0->sprint step (got ${maxAccelTilesPerSec2.toFixed(2)} t/s²)`
    );
    // Steady-state lead reaches 160px = 2.50 tiles
    assert.ok(
      Math.abs(cam.lookAheadPx - 160) < 1.5,
      `Full sprint look-ahead must converge to 160px (got ${cam.lookAheadPx.toFixed(2)}px)`
    );
    assert.ok(
      Math.abs(cam.lookAheadOffset - 2.5) < 0.03,
      `Full sprint look-ahead must provide 2.50 tiles advance visibility (got ${cam.lookAheadOffset.toFixed(3)}t)`
    );

    // Also verify with full GameEngine physics step from rest to sprint on Room 1
    const engine = new GameEngine();
    engine.initHeadless(0);
    engine.player.spawn(14.0, 4.0);
    for (let i = 0; i < 4; i++) engine.stepHeadless({});
    engine.camera.snapToPlayer(engine.player, engine.tileMap);

    let engPrevX = engine.camera.x;
    let engPrevDx = 0;
    let engMaxAccel = 0;
    for (let f = 0; f < 100; f++) {
      engine.stepHeadless({ right: true, run: true });
      const dx = engine.camera.x - engPrevX;
      if (f > 0) {
        const accel = Math.abs((dx - engPrevDx) / (DT * DT));
        if (accel > engMaxAccel) engMaxAccel = accel;
      }
      engPrevDx = dx;
      engPrevX = engine.camera.x;
    }
    assert.ok(
      engMaxAccel < 90.0,
      `Live engine sprint start d²x/dt² must stay smoothly bounded (got ${engMaxAccel.toFixed(2)} t/s²)`
    );
  });

  // ─── VERIFY TEST 2 ──────────────────────────────────────────────────────────
  it('VERIFY Test 2: Rapid left-right directional skidding maintains stable hysteresis without violent oscillation', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);
    engine.player.spawn(28.0, 4.0);
    for (let i = 0; i < 4; i++) engine.stepHeadless({});
    engine.camera.snapToPlayer(engine.player, engine.tileMap);

    // Build moderate sprint right first
    for (let f = 0; f < 25; f++) {
      engine.stepHeadless({ right: true, run: true });
    }

    // Rapidly alternate left/right skid inputs every 6 frames for 120 frames (starting with opposite direction left!)
    const camXs = [];
    const playerXs = [];
    const lookPxTrace = [];
    let observedSkidAlpha = false;
    let observedNormalAlpha = false;
    let maxPerFrameCamDelta = 0;
    let directionFlips = 0;
    let lastDeltaSign = 0;

    for (let f = 0; f < 120; f++) {
      const goLeft = Math.floor(f / 6) % 2 === 0;
      const prevX = engine.camera.x;
      engine.stepHeadless({ left: goLeft, right: !goLeft, run: true });
      const dx = engine.camera.x - prevX;

      if (Math.abs(dx) > maxPerFrameCamDelta) maxPerFrameCamDelta = Math.abs(dx);
      if (Math.abs(dx) > 0.04) {
        const s = Math.sign(dx);
        if (lastDeltaSign !== 0 && s !== lastDeltaSign) directionFlips++;
        lastDeltaSign = s;
      }

      if (Math.abs(engine.camera.lookAheadAlpha - 0.12) < 1e-4) observedSkidAlpha = true;
      if (Math.abs(engine.camera.lookAheadAlpha - 0.05) < 1e-4) observedNormalAlpha = true;

      camXs.push(engine.camera.x);
      playerXs.push(engine.player.pos.x);
      lookPxTrace.push(engine.camera.lookAheadPx);
    }

    const playerSwing = Math.max(...playerXs) - Math.min(...playerXs);
    const camSwing = Math.max(...camXs) - Math.min(...camXs);

    // Late-phase (after initial sprint momentum settles): camera oscillation during rapid 6f taps
    const lateCamSlice = camXs.slice(45);
    const lateCamSwing = Math.max(...lateCamSlice) - Math.min(...lateCamSlice);
    const lateLookSlice = lookPxTrace.slice(45);
    const lateLookSwingPx = Math.max(...lateLookSlice) - Math.min(...lateLookSlice);

    assert.ok(observedSkidAlpha, 'Camera must engage alpha = 0.12 during skid/turnaround');
    assert.ok(observedNormalAlpha, 'Camera must use alpha = 0.05 during normal run');
    assert.ok(
      maxPerFrameCamDelta < 0.25,
      `Rapid left-right skidding must never produce violent per-frame camera jumps (max delta = ${maxPerFrameCamDelta.toFixed(4)}t/f)`
    );
    assert.ok(
      camSwing <= playerSwing + 1.25,
      `Camera X excursion (${camSwing.toFixed(2)}t) must not amplify player travel (${playerSwing.toFixed(2)}t)`
    );
    assert.ok(
      lateCamSwing < 2.0,
      `Steady-state rapid left-right skidding camera oscillation must remain calm (late swing = ${lateCamSwing.toFixed(2)}t)`
    );
    assert.ok(
      lateLookSwingPx < 100,
      `Hysteresis must prevent ±160px (320px p-p) look-ahead whipping during rapid left-right taps (got ${lateLookSwingPx.toFixed(1)}px p-p)`
    );
    assert.ok(
      directionFlips <= 12,
      `Camera should not thrash direction on every rapid tap (flips = ${directionFlips})`
    );
  });

  // ─── VERIFY TEST 3 ──────────────────────────────────────────────────────────
  it('VERIFY Test 3: Player landing at boundary x = 0 strictly clamps camera to world origin with zero sub-pixel jitter', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    // Approach world origin x = 0 from the air with leftward momentum and land right on the left wall
    engine.player.spawn(0.6, 8.0);
    engine.player.grounded = false;
    engine.player.vel.x = -8.0;
    engine.player.vel.y = -4.0;
    engine.camera.snapToPlayer(engine.player, engine.tileMap);

    // Descend while holding left against x = 0 wall until grounded, then continue holding left & idling
    for (let f = 0; f < 90; f++) {
      engine.stepHeadless({ left: f < 60, run: f < 60 });
      assert.ok(
        engine.camera.x >= 0,
        `Frame ${f}: Camera X must never cross below world origin 0 (got ${engine.camera.x})`
      );
      assert.ok(
        engine.camera.y >= 0,
        `Frame ${f}: Camera Y must never cross below world bottom 0 (got ${engine.camera.y})`
      );
    }

    assert.equal(engine.player.grounded, true, 'Player must be grounded near x = 0');
    assert.equal(engine.camera.x, 0, 'Camera X must be strictly clamped to exact 0 at world origin');
    assert.equal(engine.camera.clampedLeft, true, 'Camera clampedLeft flag must be active at origin');

    // Verify zero sub-pixel jitter across 30 consecutive ticks and arbitrary render alpha values
    for (let f = 0; f < 30; f++) {
      engine.stepHeadless({ left: f % 2 === 0 });
      assert.equal(engine.camera.x, 0, `Tick ${f}: Camera X must remain strictly 0.0 (no jitter)`);
      assert.equal(engine.camera.prevX, 0, `Tick ${f}: Camera prevX must remain strictly 0.0 (no jitter)`);
      for (const alpha of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        const rs = engine.camera.getRenderState(alpha);
        assert.equal(rs.x, 0, `Interpolated renderState.x at alpha=${alpha} must be strictly 0`);
      }
    }
  });

  // ─── PILLAR 1: DUAL-AXIS DEADZONE ──────────────────────────────────────────
  it('Pillar 1: 48px Horizontal Deadzone (zero scroll on slow walk) & 64px Vertical Deadzone (zero scroll over 1-block steps)', () => {
    const cam = new PlatformerCamera();
    const map = new TileMap(120, 30);

    // Place player in middle of open world away from edges
    let px = 30.0;
    let py = 6.0;
    cam.snapTo(px - cam.viewW * 0.5, py - 0.35 * cam.viewH, px, py, map);
    const startCamX = cam.x;
    const startCamY = cam.y;

    // Slow walk within 48px horizontal deadzone (±24px = ±0.375 tiles)
    // Walk +0.30 tiles right at 2.0 t/s, then -0.55 tiles left (still inside [29.625, 30.375])
    const slowWalkVx = 1.8;
    for (let f = 0; f < 10; f++) {
      px += slowWalkVx * DT; // total +0.30t (< 0.375t)
      cam.update(px, py, slowWalkVx, 0, true, DT, map);
      assert.equal(
        cam.x,
        startCamX,
        `Frame ${f}: Slow walk inside 48px deadzone (dx=${(px - 30).toFixed(3)}t) must produce ZERO camera X scroll`
      );
    }

    // Step up a 1-block (64px = 1.00t) micro-bump while walking inside vertical deadzone [6.0, 7.0]
    for (let f = 0; f < 20; f++) {
      const bumpY = f < 10 ? 6.0 + (f / 9) * 1.0 : 7.0 - ((f - 10) / 9) * 1.0; // 0..1.00 tile (64px)
      cam.update(px, bumpY, 0, 0, true, DT, map);
      assert.ok(
        Math.abs(cam.y - startCamY) < 1e-6,
        `Frame ${f}: 1-block step (dy=${(bumpY - 6).toFixed(3)}t <= 64px) must keep camera Y strictly locked (drift=${Math.abs(cam.y - startCamY)})`
      );
    }

    // Now walk past the +24px horizontal deadzone boundary and verify scrolling smoothly engages
    for (let f = 0; f < 20; f++) {
      px += 4.0 * DT;
      cam.update(px, py, 4.0, 0, true, DT, map);
    }
    assert.ok(
      cam.x > startCamX + 0.1,
      `Walking outside the 48px horizontal deadzone must engage camera scroll (dx=${(cam.x - startCamX).toFixed(3)}t)`
    );
  });

  // ─── PILLAR 2: DYNAMIC VELOCITY LOOK-AHEAD FORMULA ──────────────────────────
  it('Pillar 2: Look-Ahead formula Lx = sign(vx) * min(|vx| * 18.0, 160px) clamps cleanly at ±160px (2.50t)', () => {
    assert.equal(computeTargetLookAheadPx(0), 0);
    assert.equal(computeTargetLookAheadPx(5.0), 90.0);
    assert.equal(computeTargetLookAheadPx(-5.0), -90.0);
    assert.equal(computeTargetLookAheadPx(9.2), 160.0);
    assert.equal(computeTargetLookAheadPx(-9.2), -160.0);
    assert.equal(computeTargetLookAheadPx(14.0), 160.0);
  });

  // ─── PILLAR 3: UPWARD DAMPING, FALL ANTICIPATION & 15f GROUND SNAP ─────────
  it('Pillar 3: Upward jump damping (α=0.08), downward fall anticipation (-6 t/s > 12f -> +120px), and 15-frame Ground Snap', () => {
    const cam = new PlatformerCamera();
    const map = new TileMap(80, 40);
    const px = 30.0;
    let py = 14.0;
    cam.snapTo(px - cam.viewW * 0.5, py - 0.35 * cam.viewH, px, py, map);
    const initialCamY = cam.y;

    // 3a. Upward jump ascent: player jumps +4.0 tiles above baseline
    // Camera must follow smoothly with α=0.08 exponential lag (no single-frame jerk)
    let maxUpStep = 0;
    for (let f = 0; f < 18; f++) {
      py += 0.22; // rising
      const prevY = cam.y;
      cam.update(px, py, 0, 13.0, false, DT, map);
      const step = cam.y - prevY;
      if (step > maxUpStep) maxUpStep = step;
    }
    assert.ok(cam.y > initialCamY + 0.3, `Camera Y should smoothly track upward jump above 64px deadzone (dy=${(cam.y - initialCamY).toFixed(2)}t)`);
    assert.ok(maxUpStep < 0.35, `Upward jump tracking must be smoothly damped with α=0.08 (max step=${maxUpStep.toFixed(3)}t/f)`);

    // 3b. Downward descent anticipation: falling at vy = -8.0 t/s (< -6.0)
    // Must NOT activate during first 12 consecutive frames, then MUST expand by 120px (1.875t) after frame 12
    for (let f = 1; f <= 12; f++) {
      py -= 8.0 * DT;
      cam.update(px, py, 0, -8.0, false, DT, map);
      assert.equal(
        cam.fallAnticipationActive,
        false,
        `Frame ${f} (<= 12): Fall anticipation must not trigger before 12 consecutive frames`
      );
    }

    // Frames 13..50: fall anticipation engages and approaches 120px downward window expansion
    for (let f = 13; f <= 55; f++) {
      py = Math.max(6.0, py - 8.0 * DT);
      cam.update(px, py, 0, -8.0, false, DT, map);
    }
    assert.equal(cam.fallAnticipationActive, true, 'Fall anticipation must engage after > 12 consecutive frames at vy < -6.0 t/s');
    assert.ok(
      cam.fallLookDownPx > 110 && cam.fallLookDownPx <= 120.1,
      `Downward fall window must expand toward 120px (got ${cam.fallLookDownPx.toFixed(1)}px)`
    );

    // 3c. Ground Snap: upon grounded contact, gently restore eye-level baseline over 15 frames
    const landY = 8.0;
    const expectedBaselineCamY = landY - MovementProfile.camera.baselineScreenY * cam.viewH;
    cam.update(px, landY, 0, 0, true, DT, map);
    assert.equal(cam.groundSnapActive, true, 'Landing after vertical travel/fall anticipation must activate 15-frame Ground Snap');

    // Mid-way (frame 7 of 15): still actively restoring
    for (let f = 2; f <= 7; f++) {
      cam.update(px, landY, 0, 0, true, DT, map);
    }
    assert.equal(cam.groundSnapActive, true, 'Ground Snap should still be smoothly easing at frame 7/15');
    assert.ok(cam.fallLookDownPx > 10 && cam.fallLookDownPx < 110, `Fall look-down should be midway restoring at frame 7 (got ${cam.fallLookDownPx.toFixed(1)}px)`);

    // Complete remaining 8 frames (total 15 frames)
    for (let f = 8; f <= 15; f++) {
      cam.update(px, landY, 0, 0, true, DT, map);
    }
    assert.equal(cam.groundSnapActive, false, 'Ground Snap must finish cleanly after 15 frames');
    assert.equal(cam.fallLookDownPx, 0, 'Fall look-down offset must be fully restored to 0px');
    assert.ok(
      Math.abs(cam.y - expectedBaselineCamY) < 0.02,
      `Camera Y must return to standard eye-level baseline ${expectedBaselineCamY.toFixed(2)}t after 15 frames (got ${cam.y.toFixed(2)}t)`
    );
  });

  // ─── PILLAR 4: SPRINT MOMENTUM LENS EXPANSION (Z = 0.925) ──────────────────
  it('Pillar 4: Sprint Momentum Lens Expansion activates after > 30 frames at |vx| >= 9.20 t/s (Z = 0.925), restores over 20 frames, and scales Canvas 2D transform', () => {
    const cam = new PlatformerCamera();
    const map = new TileMap(300, 24);
    let px = 30.0;
    const py = 4.0;
    const sprintVx = 9.20;
    cam.snapTo(px - cam.viewW * 0.5, 0, px, py, map);

    const restViewW = cam.viewW;

    // First 30 frames at >= 9.20 t/s: zoom must remain 1.000 (delay gate)
    for (let f = 1; f <= 30; f++) {
      px += sprintVx * DT;
      cam.update(px, py, sprintVx, 0, true, DT, map);
      assert.equal(
        cam.zoom,
        1.0,
        `Frame ${f} (<= 30): Sprint zoom must wait until > 30 sustained sprint frames (got Z=${cam.zoom})`
      );
      assert.equal(cam.sprintZoomActive, false);
    }

    // Frame 31+: zoom smoothly expands toward Z = 0.925 (+8.1% viewport width)
    for (let f = 31; f <= 120; f++) {
      px += sprintVx * DT;
      cam.update(px, py, sprintVx, 0, true, DT, map);
    }
    assert.equal(cam.sprintZoomActive, true, 'Sprint zoom must be active after > 30 sustained sprint frames');
    assert.ok(
      Math.abs(cam.zoom - 0.925) < 0.002,
      `Sustained sprint zoom must converge to Z = 0.925 (got ${cam.zoom.toFixed(4)})`
    );
    const expandedRatio = cam.viewW / restViewW;
    assert.ok(
      expandedRatio >= 1.078 && expandedRatio <= 1.084,
      `Viewport width must expand by ~8% at Z = 0.925 (ratio = ${expandedRatio.toFixed(4)})`
    );

    // Verify Canvas 2D transform helper applies ctx.scale(Z, Z)
    const calls = [];
    const mockCtx = {
      save: () => calls.push(['save']),
      translate: (x, y) => calls.push(['translate', x, y]),
      rotate: (r) => calls.push(['rotate', r]),
      scale: (sx, sy) => calls.push(['scale', sx, sy]),
    };
    const renderState = cam.getRenderState(1.0);
    const applied = applyCanvasCameraTransform(mockCtx, 1280, 720, renderState, 1280 / 22);
    assert.equal(applied, true, 'applyCanvasCameraTransform must apply transform when Z < 1.0');
    const scaleCall = calls.find((c) => c[0] === 'scale');
    assert.ok(scaleCall, 'Canvas 2D context must receive ctx.scale(Z, Z)');
    assert.ok(Math.abs(scaleCall[1] - 0.925) < 0.002 && Math.abs(scaleCall[2] - 0.925) < 0.002);

    // Decelerate below 9.20 t/s -> zoom restores smoothly to Z = 1.000 over 20 frames
    for (let f = 1; f <= 10; f++) {
      px += 4.0 * DT;
      cam.update(px, py, 4.0, 0, true, DT, map);
    }
    assert.ok(
      cam.zoom > 0.94 && cam.zoom < 0.99,
      `At frame 10/20 of restore, zoom must be midway back to 1.000 (got ${cam.zoom.toFixed(4)})`
    );

    for (let f = 11; f <= 20; f++) {
      px += 4.0 * DT;
      cam.update(px, py, 4.0, 0, true, DT, map);
    }
    assert.equal(cam.zoom, 1.0, 'After 20 frames below sprint threshold, zoom must restore strictly to Z = 1.000');
  });

  // ─── PILLAR 5: LEVEL BOUNDARY CLAMPING & CAMERA LOCKS ─────────────────────
  it('Pillar 5: Camera Locks enforce vertical/horizontal divider lines & arena boxes until cleared', () => {
    const cam = new PlatformerCamera();
    const map = new TileMap(120, 40);

    // 5a. Vertical divider line at x = 40.0 blocking scroll rightward past x = 40.0
    cam.addLock({ id: 'gate-right', axis: 'vertical', x: 40.0, side: 'max' });
    cam.snapTo(10, 0, 20, 4, map);

    // Sprint rightward up to x = 38.0 -> camera right edge must never cross x = 40.0
    for (let f = 0; f < 80; f++) {
      const px = Math.min(38.0, 20 + f * 0.35);
      cam.update(px, 4, 9.2, 0, true, DT, map);
      assert.ok(
        cam.x + cam.viewW <= 40.0 + 1e-4,
        `Vertical divider lock at x=40 must prevent camera right edge crossing 40 (got ${(cam.x + cam.viewW).toFixed(3)})`
      );
    }

    // Clear the divider lock -> camera smoothly scrolls past x = 40.0
    assert.equal(cam.clearLock('gate-right'), true);
    for (let f = 0; f < 40; f++) {
      cam.update(44.0, 4, 5.0, 0, true, DT, map);
    }
    assert.ok(
      cam.x + cam.viewW > 42.0,
      `After clearing vertical lock, camera must smoothly resume scrolling past x=40 (right=${(cam.x + cam.viewW).toFixed(2)})`
    );

    // 5b. Horizontal divider line at y = 18.0 preventing scrolling above y = 18.0
    cam.setLocks([{ id: 'ceiling-lock', axis: 'horizontal', y: 18.0, side: 'max' }]);
    for (let f = 0; f < 40; f++) {
      cam.update(44.0, 17.0, 0, 10.0, false, DT, map);
      assert.ok(
        cam.y + cam.viewH <= 18.0 + 1e-4,
        `Horizontal divider lock at y=18 must cap camera top edge <= 18 (got ${(cam.y + cam.viewH).toFixed(3)})`
      );
    }

    // 5c. Auto-triggering Arena Box lock [60..86] × [0..16]
    cam.setLocks([
      {
        id: 'boss-arena',
        axis: 'box',
        minX: 60,
        maxX: 86,
        minY: 0,
        maxY: 16,
        autoTrigger: true,
      },
    ]);
    assert.equal(cam.getActiveLocks().length, 0, 'Auto-trigger arena lock must start inactive');

    // Enter arena at x = 65, y = 4 -> lock triggers and clamps viewport inside [60..86]
    for (let f = 0; f < 50; f++) {
      cam.update(73, 4, 9.2, 0, true, DT, map);
    }
    assert.equal(cam.getActiveLocks().length, 1, 'Arena lock must auto-trigger upon player entry');
    assert.ok(cam.x >= 60 - 1e-4 && cam.x + cam.viewW <= 86 + 1e-4, 'Arena lock must clamp camera X within [60, 86]');
    assert.ok(cam.y >= 0 - 1e-4 && cam.y + cam.viewH <= 16 + 1e-4, 'Arena lock must clamp camera Y within [0, 16]');

    // Pure bounds helper sanity check
    const bounds = computeEffectiveCameraBounds(map, 22, 12.375, cam.locks, 73, 4);
    assert.equal(bounds.minX, 60);
    assert.equal(bounds.maxX, 86 - 22);
    assert.equal(bounds.maxY, 16 - 12.375);
  });
});
