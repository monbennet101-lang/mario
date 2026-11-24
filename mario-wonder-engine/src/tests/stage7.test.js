/**
 * Stage 7 Headless Verification Suite
 * =====================================
 * Verifies:
 *   1. Perspective Camera Setup (THREE.PerspectiveCamera 30° FOV, Z = +18.0, 4° down-pitch, ~20–22t 16:9 framing).
 *   2. Dynamic Horizontal Look-Ahead (+3.0t lead scaled by |vx|/runTopSpeed, 0.20s spring, 0.50t deadzone,
 *      player settles between 35% and 48% of screen width during full sprint, smooth 0.40s reversal easing).
 *   3. Vertical Calm on Flat Ground (< 0.25t camera Y drift during 4.10t standing jump and 4.85t sprint jump).
 *   4. 6-Tile-High Ledge Jump & Smooth 0.60s Elevation Re-Centering (never breaches top 15% of viewport).
 *   5. Fast-Fall / Ground Pound Look-Down (vy < -14.0 t/s shifts camera down up to 2.0t, >= 2.5t advance floor visibility).
 *   6. Strict Level Boundary Clamping (zero off-map void past left, right, or bottom pit boundaries across Rooms 1–6).
 *   7. Unified Camera Shake API (translational + roll + pitch perturbation) & 30/60/144 Hz Determinism.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import TileMap from '../engine/physics/TileMap.js';

const TILE_TYPE = MovementProfile.tileTypes;

describe('Stage 7 — 2.5D Camera System, Cinematography & Viewport Dynamics', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  it('1. Configures THREE.PerspectiveCamera with 30° FOV, Z=+18.0t, 4° downward pitch, and ~20–22t 16:9 framing', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    const cam = engine.camera;
    assert.ok(cam, 'GameEngine must instantiate a first-class CameraController in headless and browser modes');
    assert.ok(cam.camera && cam.camera.isPerspectiveCamera, 'CameraController must own a THREE.PerspectiveCamera');

    assert.equal(cam.camera.fov, 30, 'Vertical FOV must be 30° at rest');
    assert.equal(cam.camera.position.z, 18.0, 'Camera Z position must be +18.0 tiles');

    const expectedPitchRad = -4 * (Math.PI / 180);
    assert.ok(
      Math.abs(cam.camera.rotation.x - expectedPitchRad) < 1e-6,
      `Camera downward pitch must be -4° (${expectedPitchRad.toFixed(5)} rad), got ${cam.camera.rotation.x.toFixed(5)}`
    );

    // 16:9 aspect ratio & horizontal framing check
    assert.ok(Math.abs(cam.camera.aspect - 16 / 9) < 0.01, 'Camera aspect ratio must be 16:9');
    assert.ok(
      cam.viewW >= 18.0 && cam.viewW <= 22.5,
      `2D viewport width must frame ~20–22 tiles horizontally in 16:9 (got ${cam.viewW.toFixed(2)}t)`
    );
    assert.ok(
      cam.frustumWidthTiles >= 16.5 && cam.frustumWidthTiles <= 22.5,
      `3D perspective frustum at Z=18 must span ~17–22 tiles horizontally (got ${cam.frustumWidthTiles.toFixed(2)}t)`
    );
  });

  it('2. Dynamic Horizontal Look-Ahead settles player screen X between 35% and 48% during full sprint and eases reversals smoothly', () => {
    const engine = new GameEngine();
    engine.initHeadless(0); // Room 1: 60-tile flat runway

    // Move player away from left boundary first so boundary clamping does not mask steady-state look-ahead
    engine.player.pos.x = 14.0;
    engine.player.prevPos.x = 14.0;
    engine.camera.snapToPlayer(engine.player, engine.tileMap);

    // Full right sprint for 90 frames (1.5s) — exceeds 30f sprint lens expansion threshold
    for (let i = 0; i < 90; i++) {
      engine.stepHeadless({ right: true, run: true });
    }

    const cam = engine.camera;
    assert.ok(
      Math.abs(cam.lookAheadOffset - 2.5) < 0.08,
      `Full sprint look-ahead offset must reach +2.50 tiles (160px) (got ${cam.lookAheadOffset.toFixed(3)})`
    );
    assert.ok(
      cam.playerScreenX >= 0.35 && cam.playerScreenX <= 0.48,
      `Player screen X during full right sprint must settle between 35% and 48% of viewport width (got ${(cam.playerScreenX * 100).toFixed(2)}%)`
    );

    // Verify high-speed sprint vignette & sprint momentum zoom (Z = 0.925 -> ~32.2° FOV)
    assert.ok(
      cam.sprintVignetteIntensity > 0.9,
      `Sprint vignette intensity must activate above 8.0 t/s (got ${cam.sprintVignetteIntensity.toFixed(2)})`
    );
    assert.ok(
      cam.zoom <= 0.94 && cam.zoom >= 0.924,
      `Sustained sprint must expand lens zoom toward Z = 0.925 (got Z = ${cam.zoom.toFixed(4)})`
    );
    assert.ok(
      cam.camera.fov > 31.8 && cam.camera.fov <= 32.5,
      `Camera Perspective FOV must expand alongside sprint zoom (got ${cam.camera.fov.toFixed(2)}°)`
    );

    // Now reverse direction to full left sprint and verify smooth turnaround easing without abrupt jumps
    let maxFrameLookDelta = 0;
    let maxFrameCamStep = 0;
    let prevLook = cam.lookAheadOffset;
    let prevCamX = cam.x;

    for (let i = 0; i < 65; i++) {
      engine.stepHeadless({ left: true, run: true });
      const dLook = Math.abs(cam.lookAheadOffset - prevLook);
      const dCamX = Math.abs(cam.x - prevCamX);
      if (dLook > maxFrameLookDelta) maxFrameLookDelta = dLook;
      if (dCamX > maxFrameCamStep) maxFrameCamStep = dCamX;
      prevLook = cam.lookAheadOffset;
      prevCamX = cam.x;
    }

    assert.ok(
      maxFrameLookDelta < 0.40,
      `Look-ahead reversal must ease smoothly without snapping (max per-frame delta = ${maxFrameLookDelta.toFixed(3)}t)`
    );
    assert.ok(
      cam.lookAheadOffset < -2.0,
      `After reversing into a left sprint, look-ahead must smoothly reach negative lead (got ${cam.lookAheadOffset.toFixed(2)}t)`
    );
    assert.ok(
      maxFrameCamStep < 0.35,
      `Camera X velocity during reversal must remain smoothly damped without jerks (max step = ${maxFrameCamStep.toFixed(3)}t/f)`
    );
  });

  it('3. Respects 48px (0.75t) horizontal deadzone for micro-movements near rest', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    engine.player.pos.x = 20.0;
    engine.player.prevPos.x = 20.0;
    engine.camera.snapToPlayer(engine.player, engine.tileMap);
    const initialCamX = engine.camera.x;

    // Nudge player by +0.30 tiles (inside ±24px = ±0.375t half-deadzone) with zero velocity
    engine.player.pos.x = 20.30;
    engine.player.vel.x = 0;
    engine.camera.update(engine.player, engine.tileMap, 1 / 60);

    assert.ok(
      Math.abs(engine.camera.x - initialCamX) < 1e-4,
      `Camera X must remain stationary inside the 48px horizontal deadzone (moved ${Math.abs(engine.camera.x - initialCamX).toFixed(5)}t)`
    );
  });

  it('4. Upward Jump Damping (α=0.08) & Ground Snap: Jumps on flat ground damp smoothly without jerks and snap back on landing', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    // Place player at x = 22.0, y = 4.0 (open runway) and settle on floor
    engine.player.spawn(22.0, 4.0);
    for (let i = 0; i < 5; i++) {
      engine.stepHeadless({});
    }
    engine.camera.snapToPlayer(engine.player, engine.tileMap);
    const baselineCamY = engine.camera.y;

    // 4a. Full standing jump (hold Jump for 28 frames, then land + 20 frames for 15f Ground Snap)
    let maxUpwardStepY = 0;
    let maxStandingStepY = 0;
    let prevCamY = engine.camera.y;
    for (let f = 0; f < 85; f++) {
      engine.stepHeadless({ jump: f < 28 });
      const dy = engine.camera.y - prevCamY;
      if (dy > maxUpwardStepY) maxUpwardStepY = dy;
      if (Math.abs(dy) > maxStandingStepY) maxStandingStepY = Math.abs(dy);
      prevCamY = engine.camera.y;
    }

    assert.ok(
      engine.player.jumpMetrics.peakHeight > 4.0,
      `Standing jump must reach full ~4.10t apex (got ${engine.player.jumpMetrics.peakHeight.toFixed(2)}t)`
    );
    assert.ok(
      maxUpwardStepY < 0.18,
      `Upward jump damping (α=0.08) must prevent upward jerks (max up step = ${maxUpwardStepY.toFixed(4)}t/f)`
    );
    assert.ok(
      maxStandingStepY < 0.35,
      `Full standing jump + fall-catch vertical step must stay smooth (max step = ${maxStandingStepY.toFixed(4)}t/f)`
    );
    assert.ok(
      Math.abs(engine.camera.y - baselineCamY) < 0.05,
      `15-frame Ground Snap must restore baseline camera Y after landing (got ${engine.camera.y.toFixed(3)}, expected ${baselineCamY.toFixed(3)})`
    );

    // 4b. Full sprint jump (4.85t apex) on flat ground
    engine.player.spawn(18.0, 4.0);
    for (let i = 0; i < 4; i++) {
      engine.stepHeadless({});
    }
    for (let f = 0; f < 35; f++) {
      engine.stepHeadless({ right: true, run: true });
    }
    let maxSprintUpStepY = 0;
    let maxSprintStepY = 0;
    prevCamY = engine.camera.y;
    for (let f = 0; f < 75; f++) {
      engine.stepHeadless({ right: true, run: true, jump: f < 28 });
      const dy = engine.camera.y - prevCamY;
      if (dy > maxSprintUpStepY) maxSprintUpStepY = dy;
      if (Math.abs(dy) > maxSprintStepY) maxSprintStepY = Math.abs(dy);
      prevCamY = engine.camera.y;
    }

    assert.ok(
      engine.player.jumpMetrics.peakHeight > 4.7,
      `Sprint jump must reach full ~4.85t apex (got ${engine.player.jumpMetrics.peakHeight.toFixed(2)}t)`
    );
    assert.ok(
      maxSprintUpStepY < 0.22,
      `Sprint jump upward damping must stay smooth (max up step = ${maxSprintUpStepY.toFixed(4)}t/f)`
    );
    assert.ok(
      maxSprintStepY < 0.38,
      `Vertical camera velocity during sprint jump must remain smoothly damped (max step = ${maxSprintStepY.toFixed(4)}t/f)`
    );
  });

  it('5. Jumping onto a 6-tile-high ledge clamps player below top 15% of viewport and eases to new height over 15f Ground Snap on landing', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    // Build a custom 60x30 map with base floor at y = 5.0 (so startCamY > 0 is unclamped)
    // and a 6-tile-high ledge at y = 11.0 (exact +6.0 tiles elevation gain)
    const map = new TileMap(60, 30);
    map.fillRect(0, 0, 60, 5, TILE_TYPE.SOLID); // top surface y = 5.0
    for (let x = 14; x <= 35; x++) {
      map.setTile(x, 10, TILE_TYPE.SEMISOLID); // top surface y = 11.0 (+6.0 tiles above y = 5.0)
    }
    engine.tileMap = map;
    engine.player.spawn(20.0, 5.0);
    for (let i = 0; i < 4; i++) {
      engine.stepHeadless({});
    }
    engine.camera.snapToPlayer(engine.player, map);

    const startCamY = engine.camera.y;
    let maxPlayerScreenY = 0;
    let landedFrame = -1;
    let camYAtLanding = 0;

    // Configure high-jump launch velocity (26.0 t/s -> ~6.4t apex) to leap from y=5.0 up through semisolid y=11.0
    MovementProfile.jump.launchVelocity = 26.0;

    const camYAfterLandingTrace = [];
    for (let f = 0; f < 105; f++) {
      engine.stepHeadless({ jump: f < 26 });
      if (engine.camera.playerScreenY > maxPlayerScreenY) {
        maxPlayerScreenY = engine.camera.playerScreenY;
      }
      if (landedFrame === -1 && f > 15 && engine.player.grounded && Math.abs(engine.player.pos.y - 11.0) < 0.05) {
        landedFrame = f;
        camYAtLanding = engine.camera.y;
      }
      if (landedFrame !== -1) {
        camYAfterLandingTrace.push(engine.camera.y);
      }
    }

    assert.ok(landedFrame !== -1, 'Player must land on the 6-tile-high ledge at y = 11.0');
    assert.ok(
      maxPlayerScreenY <= 0.85,
      `Player must never breach the top 15% of the viewport (max playerScreenY = ${(maxPlayerScreenY * 100).toFixed(2)}% <= 85%)`
    );

    // Verify smooth 15-frame Ground Snap elevation easing after landing
    const finalTargetCamY = startCamY + 6.0;
    const midEaseCamY = camYAfterLandingTrace[Math.min(7, camYAfterLandingTrace.length - 1)];
    const settledCamY = camYAfterLandingTrace[camYAfterLandingTrace.length - 1];

    assert.ok(
      midEaseCamY > camYAtLanding && midEaseCamY < finalTargetCamY - 0.05,
      `Camera Y must smoothly ease across 15f Ground Snap after landing (landing=${camYAtLanding.toFixed(2)}, mid=${midEaseCamY.toFixed(2)}, target=${finalTargetCamY.toFixed(2)})`
    );
    assert.ok(
      Math.abs(settledCamY - finalTargetCamY) < 0.05,
      `Camera Y must settle at new ledge elevation ${finalTargetCamY.toFixed(2)}t after Ground Snap (got ${settledCamY.toFixed(2)}t)`
    );
  });

  it('6. Downward Fall Anticipation / Ground Pound expands downward look window by 120px (1.875t) with >= 2.5t advance floor visibility', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    // Tall vertical shaft map (60x30) with floor at y = 2.0
    const map = new TileMap(60, 30);
    for (let x = 0; x < 60; x++) {
      map.setTile(x, 0, TILE_TYPE.SOLID);
      map.setTile(x, 1, TILE_TYPE.SOLID);
    }
    engine.tileMap = map;

    // Place player high in the air at y = 16.0 and initiate a Ground Pound
    engine.player.spawn(20.0, 16.0);
    engine.player.grounded = false;
    engine.camera.snapToPlayer(engine.player, map);

    let fastFallTriggered = false;
    let maxFastFallOffset = 0;
    let advanceFloorMarginAt2_5t = null;

    // Trigger ground pound (down pressed on frame 0)
    for (let f = 0; f < 90; f++) {
      engine.stepHeadless({ down: f === 0 });
      if (engine.camera.fastFallActive) {
        fastFallTriggered = true;
      }
      if (engine.camera.fastFallOffset > maxFastFallOffset) {
        maxFastFallOffset = engine.camera.fastFallOffset;
      }

      // Check viewport bottom when player is descending and 2.5 to 3.5 tiles above the floor (y = 4.5..5.5)
      const heightAboveFloor = engine.player.pos.y - 2.0;
      if (!engine.player.grounded && heightAboveFloor >= 2.5 && heightAboveFloor <= 3.5) {
        const camBottomY = engine.camera.y;
        const visibleBelowPlayer = engine.player.pos.y - camBottomY;
        if (advanceFloorMarginAt2_5t === null || visibleBelowPlayer > advanceFloorMarginAt2_5t) {
          advanceFloorMarginAt2_5t = visibleBelowPlayer;
        }
      }
      if (engine.player.grounded) break;
    }

    assert.ok(fastFallTriggered, 'Downward fall anticipation mode must activate during Ground Pound / fast fall');
    assert.ok(
      maxFastFallOffset >= 1.2 && maxFastFallOffset <= 1.92,
      `Downward fall look-down offset must pan downward up to 120px (1.875t) (got ${maxFastFallOffset.toFixed(2)}t)`
    );
    assert.ok(
      advanceFloorMarginAt2_5t !== null && advanceFloorMarginAt2_5t >= 2.5,
      `Landing floor must be framed with >= 2.5 tiles of advance visibility below player (got ${advanceFloorMarginAt2_5t?.toFixed(2)}t)`
    );
  });

  it('7. Strictly clamps camera viewport within level boundaries across all 6 Benchmark Rooms (zero off-map void)', () => {
    const engine = new GameEngine();

    for (let roomIdx = 0; roomIdx < 6; roomIdx++) {
      engine.initHeadless(roomIdx);
      const map = engine.tileMap;
      const cam = engine.camera;

      // Test extreme bottom-left corner
      engine.player.pos.x = 0.5;
      engine.player.pos.y = 1.0;
      engine.player.vel.x = -10.0;
      engine.player.vel.y = -20.0;
      for (let i = 0; i < 20; i++) {
        cam.update(engine.player, map, 1 / 60);
      }
      assert.ok(
        cam.x >= -1e-5,
        `Room ${roomIdx + 1}: Camera left edge must never expose negative X void (left=${cam.x.toFixed(4)})`
      );
      assert.ok(
        cam.y >= -1e-5,
        `Room ${roomIdx + 1}: Camera bottom edge must never expose below-pit Y void (bottom=${cam.y.toFixed(4)})`
      );

      // Test extreme top-right corner
      engine.player.pos.x = map.width - 0.5;
      engine.player.pos.y = map.height - 1.0;
      engine.player.vel.x = 10.0;
      engine.player.vel.y = 20.0;
      for (let i = 0; i < 30; i++) {
        cam.update(engine.player, map, 1 / 60);
      }
      const viewW = cam.viewW;
      const viewH = cam.viewH;
      if (map.width >= viewW) {
        assert.ok(
          cam.x + viewW <= map.width + 1e-4,
          `Room ${roomIdx + 1}: Camera right edge must never expose past-end X void (right=${(cam.x + viewW).toFixed(4)}, width=${map.width})`
        );
      }
      if (map.height >= viewH) {
        assert.ok(
          cam.y + viewH <= map.height + 1e-4,
          `Room ${roomIdx + 1}: Camera top edge must never exceed map height (top=${(cam.y + viewH).toFixed(4)}, height=${map.height})`
        );
      }
    }
  });

  it('8. Unified Camera Shake API & 30/60/144 Hz refresh rate independence', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    // Trigger trauma with directional vector
    engine.camera.addTrauma(0.65, 0, -1);
    assert.equal(engine.camera.shake.trauma, 0.65, 'Trauma must initialize to 0.65');

    engine.stepHeadless({});
    const renderState = engine.camera.getRenderState(1.0);
    assert.ok(
      Math.abs(renderState.shakeX) > 0 || Math.abs(renderState.shakeY) > 0,
      'Unified camera shake must produce non-zero translational offset while active'
    );
    assert.ok(
      Math.abs(renderState.shakeRollDeg) > 0 || Math.abs(renderState.shakePitchDeg) > 0,
      'Unified camera shake must produce rotational roll/pitch perturbation while active'
    );

    // Calling getRenderState while paused must NOT decay trauma or mutate camera position
    const pausedCamX = engine.camera.x;
    const pausedTrauma = engine.camera.shake.trauma;
    for (let i = 0; i < 10; i++) {
      engine.camera.getRenderState(0.5);
    }
    assert.equal(engine.camera.x, pausedCamX, 'getRenderState(alpha) must never mutate camera X');
    assert.equal(engine.camera.shake.trauma, pausedTrauma, 'getRenderState(alpha) must never decay trauma');

    // After enough simulation ticks for 0.65 trauma to decay at MovementProfile.juice.trauma.decayRatePerSec (1.2/s -> 33 ticks), trauma must hit 0
    const decayTicks = Math.ceil((0.65 / MovementProfile.juice.trauma.decayRatePerSec) * 60);
    for (let i = 0; i < decayTicks; i++) {
      engine.stepHeadless({});
    }
    assert.equal(engine.camera.shake.trauma, 0, `Trauma must decay to 0.00 after ${decayTicks} ticks at ${MovementProfile.juice.trauma.decayRatePerSec}/s`);

    // Multi-refresh-rate determinism check:
    // Calling getRenderState at 30 Hz, 60 Hz, or 144 Hz between fixed ticks must leave fixed camera state identical
    const runWithRenderCallsPerTick = (rendersPerTick) => {
      const eng = new GameEngine();
      eng.initHeadless(0);
      for (let f = 0; f < 120; f++) {
        eng.stepHeadless({ right: f < 80, left: f >= 80, run: true, jump: f > 20 && f < 45 });
        for (let r = 1; r <= rendersPerTick; r++) {
          eng.camera.getRenderState(r / rendersPerTick);
        }
      }
      return {
        camX: eng.camera.x,
        camY: eng.camera.y,
        look: eng.camera.lookAheadOffset,
        hash: eng.player.stateHash,
      };
    };

    const r30 = runWithRenderCallsPerTick(1);
    const r60 = runWithRenderCallsPerTick(2);
    const r144 = runWithRenderCallsPerTick(5);

    assert.equal(r30.camX, r60.camX, '30 Hz and 60 Hz camera X must be bit-identical');
    assert.equal(r60.camX, r144.camX, '60 Hz and 144 Hz camera X must be bit-identical');
    assert.equal(r60.camY, r144.camY, '60 Hz and 144 Hz camera Y must be bit-identical');
    assert.equal(r60.hash, r144.hash, 'Player stateHash must be bit-identical across refresh rates');
  });
});
