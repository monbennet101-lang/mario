/**
 * Stage 3 Automated Headless Verification Suite
 * ==============================================
 * Run with: node --test src/tests/stage3.test.js
 *
 * Verifies all Stage 3 kinematic & forgiveness exit criteria:
 *  1. STANDING_JUMP_APEX: Reaches 4.05–4.15 tiles, ~0.43–0.45s apex, ~0.76–0.85s airtime
 *  2. SPRINT_JUMP_APEX_AND_GAP: Boosts v0 (+10%) to reach 4.80–4.90 tiles & clear Room 2's 6-tile gap
 *  3. TAP_JUMP_CUTOFF: Releasing jump after 1–3 frames cuts height cleanly to 1.65–1.90 tiles
 *  4. BUOYANT_APEX_FLOAT: Holds 0.65x gravity inside |vy| < 1.80 t/s for up to 6 frames (not when released)
 *  5. COYOTE_TIME: 5-frame grace after walking off ledge succeeds (k=1..5); k=6 fails; no double jump
 *  6. JUMP_BUFFER: 6-frame pre-land buffer executes on exact landing frame (j=0..6); j=7 fails
 *  7. CEILING_CORNER_NUDGE_AND_BONK: 0.20t overlap nudges around block preserving vy; 0.35t bonks to -2.0 t/s
 *  8. LEDGE_STEP_UP: Feet <= 0.20t below platform top snap up keeping horizontal velocity; 0.35t stops at wall
 *  9. AIR_CONTROL: 0.85x accel with vel, 1.0x reverse, 3.0 t/s^2 no-input drag, horizontal cap at takeoff speed
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import { PlayerState } from '../game/player/PlayerState.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { createGapLadder } from '../game/levels/benchmark/BenchmarkRooms.js';

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function makeFlatHarness(cols = 80, rows = 20) {
  const map = new TileMap(cols, rows);
  map.fillRect(0, 0, cols, 4, tileTypes.SOLID); // Floor top Y = 4.0
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(5.0, 4.0);
  player.update(null, collision, DT);
  player.update(null, collision, DT);
  return { map, collision, input, player };
}

test('Stage 3 [1/9] STANDING_JUMP_APEX — reaches 4.05–4.15t apex with asymmetric gravity & 6f apex float', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);

  const startY = player.pos.y;
  let peakDy = 0;
  let apexFrame = -1;
  let landFrame = -1;
  let sawFloatState = false;

  for (let f = 1; f <= 80; f++) {
    // Hold jump through ascent and all 6 apex float frames; release on descent to measure baseline fall gravity
    const holdJump = f === 1 || player.vel.y >= 0 || player.apexFloatRemaining > 0;
    input.applySnapshot(holdJump ? jumpMask : 0);
    player.update(input, collision, DT);
    const dy = player.pos.y - startY;
    if (dy > peakDy) {
      peakDy = dy;
      apexFrame = f;
    }
    if (player.state === PlayerState.APEX_FLOAT) {
      sawFloatState = true;
    }
    if (f > 2 && player.grounded) {
      landFrame = f;
      break;
    }
  }

  const timeToApex = apexFrame / 60;
  const airtime = landFrame / 60;

  assert.ok(peakDy >= 4.05 && peakDy <= 4.15, `Standing apex ${peakDy.toFixed(4)}t outside 4.05–4.15t`);
  assert.ok(timeToApex >= 0.42 && timeToApex <= 0.46, `Time to apex ${timeToApex.toFixed(4)}s outside 0.42–0.46s`);
  assert.ok(airtime >= 0.76 && airtime <= 0.86, `Standing airtime ${airtime.toFixed(4)}s outside 0.76–0.86s`);
  assert.equal(sawFloatState, true, 'Standing held jump should enter ApexFloat state near peak');
  assert.equal(player.jumpMetrics.apexFloatFrames, 6, 'Should consume 6 apex float frames');
  assert.ok(
    Math.abs(player.jumpMetrics.peakHeight - peakDy) < 1e-6,
    `Telemetry peakHeight (${player.jumpMetrics.peakHeight}) != measured (${peakDy})`
  );
});

test('Stage 3 [2/9] SPRINT_JUMP_APEX_AND_GAP — full sprint jump reaches 4.80–4.90t & clears Room 2 6-tile gap', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness(100, 20);
  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const runJumpMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN, Actions.JUMP]);

  for (let f = 0; f < 45; f++) {
    input.applySnapshot(runRightMask);
    player.update(input, collision, DT);
  }
  assert.ok(Math.abs(player.vel.x - 9.20) < 0.01);

  const startX = player.pos.x;
  const startY = player.pos.y;
  let peakDy = 0;
  let spanX = 0;

  for (let f = 1; f <= 90; f++) {
    input.applySnapshot(runJumpMask);
    player.update(input, collision, DT);
    peakDy = Math.max(peakDy, player.pos.y - startY);
    if (f > 2 && player.grounded) {
      spanX = player.pos.x - startX;
      break;
    }
  }

  assert.ok(peakDy >= 4.80 && peakDy <= 4.90, `Sprint apex ${peakDy.toFixed(4)}t outside 4.80–4.90t`);
  assert.ok(spanX >= 7.5, `Sprint jump horizontal span ${spanX.toFixed(2)}t should exceed 7.5t`);

  // Also test directly on Room 2 (Gap Ladder) across the 6-tile pit (cols 53..59 -> land at >= 59)
  const room2 = createGapLadder();
  const r2Collision = new CollisionSystem(room2.map);
  const r2Input = new InputManager();
  const r2Player = new PlayerController();
  r2Player.spawn(47.2, 4.0);
  r2Player.update(null, r2Collision, DT);

  // Sprint across the 6-tile approach platform (x=47..53) and jump right before gap edge x=53
  let jumped = false;
  let landedAcrossGap6 = false;
  for (let f = 1; f <= 150; f++) {
    const nearEdge = r2Player.pos.x >= 51.8;
    const holdJump = !jumped ? nearEdge : r2Player.vel.y >= -0.5;
    const mask = (jumped || nearEdge) ? (holdJump ? runJumpMask : runRightMask) : runRightMask;
    if (nearEdge) jumped = true;
    r2Input.applySnapshot(mask);
    r2Player.update(r2Input, r2Collision, DT);
    if (jumped && r2Player.grounded && r2Player.pos.x >= 59.0 && r2Player.pos.y === 4.0) {
      landedAcrossGap6 = true;
      break;
    }
  }
  assert.equal(landedAcrossGap6, true, `Failed to clear Room 2 6-tile gap (x=${r2Player.pos.x.toFixed(2)}, y=${r2Player.pos.y.toFixed(2)})`);
});

test('Stage 3 [3/9] TAP_JUMP_CUTOFF — 1-frame and 3-frame tap jumps peak within 1.65–1.90 tiles', () => {
  resetMovementProfile();
  for (const holdFrames of [1, 2, 3]) {
    const { collision, input, player } = makeFlatHarness();
    const jumpMask = InputManager.encodeActions([Actions.JUMP]);
    const startY = player.pos.y;
    let peakDy = 0;

    for (let f = 1; f <= 50; f++) {
      input.applySnapshot(f <= holdFrames ? jumpMask : 0);
      player.update(input, collision, DT);
      peakDy = Math.max(peakDy, player.pos.y - startY);
      if (f > 2 && player.grounded) break;
    }

    assert.ok(
      peakDy >= 1.65 && peakDy <= 1.90,
      `Tap jump (${holdFrames}f hold) apex ${peakDy.toFixed(4)}t outside 1.65–1.90t`
    );
  }
});

test('Stage 3 [4/9] BUOYANT_APEX_FLOAT — applies 0.65x gravity when Jump held near apex and not when released', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);

  // Step until entering apex float window
  let enteredFloat = false;
  let measuredFloatGravity = null;
  for (let f = 1; f <= 40; f++) {
    const prevVy = player.vel.y;
    input.applySnapshot(jumpMask);
    player.update(input, collision, DT);
    if (player.inApexFloat) {
      enteredFloat = true;
      const expectedG = (prevVy > 0 ? MovementProfile.jump.gravityRising : MovementProfile.jump.gravityFalling)
        * MovementProfile.apexFloat.gravityMultiplier;
      const actualG = (prevVy - player.vel.y) / DT;
      measuredFloatGravity = { actualG, expectedG };
      break;
    }
  }
  assert.equal(enteredFloat, true, 'Did not enter apex float window with Jump held');
  assert.ok(
    Math.abs(measuredFloatGravity.actualG - measuredFloatGravity.expectedG) < 0.05,
    `Apex float gravity ${measuredFloatGravity.actualG.toFixed(2)} != expected ${measuredFloatGravity.expectedG.toFixed(2)}`
  );

  // Tap jump released early must NOT activate apex float
  const tapHarness = makeFlatHarness();
  let tapFloatFrames = 0;
  for (let f = 1; f <= 45; f++) {
    tapHarness.input.applySnapshot(f === 1 ? jumpMask : 0);
    tapHarness.player.update(tapHarness.input, tapHarness.collision, DT);
    if (tapHarness.player.inApexFloat) tapFloatFrames++;
  }
  assert.equal(tapFloatFrames, 0, 'Tap-released jump should not trigger apex float');
});

test('Stage 3 [5/9] COYOTE_TIME — k <= 5 frames after ledge drop jumps; k = 6 fails; no double jump', () => {
  resetMovementProfile();

  function testCoyoteAfter(delayFrames) {
    const map = new TileMap(30, 15);
    map.fillRect(0, 0, 8, 6, tileTypes.SOLID); // Elevated ledge top Y=6 ending at X=8.0
    const collision = new CollisionSystem(map);
    const input = new InputManager();
    const player = new PlayerController();
    player.spawn(6.5, 6.0);
    player.update(null, collision, DT);

    const runRight = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
    // Run off ledge until first airborne frame
    while (player.grounded) {
      input.applySnapshot(runRight);
      player.update(input, collision, DT);
    }
    // Wait (delayFrames - 1) additional airborne frames (k=1 means pressing immediately on frame 1 off ledge)
    for (let i = 1; i < delayFrames; i++) {
      input.applySnapshot(0);
      player.update(input, collision, DT);
    }

    input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
    player.update(input, collision, DT);
    return {
      jumped: player.isJumping && player.vel.y > 15.0,
      wasCoyote: player.jumpMetrics.wasCoyote,
    };
  }

  for (const k of [1, 3, 5]) {
    const res = testCoyoteAfter(k);
    assert.equal(res.jumped, true, `Coyote jump at k=${k} frames should succeed`);
    assert.equal(res.wasCoyote, true, `Jump at k=${k} should mark wasCoyote=true`);
  }

  const k6 = testCoyoteAfter(6);
  assert.equal(k6.jumped, false, 'Coyote jump at k=6 frames must fail (outside 5f window)');

  // Verify no double-jump on next frame after a grounded jump
  const { collision, input, player } = makeFlatHarness();
  input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
  player.update(input, collision, DT);
  assert.equal(player.coyoteFramesRemaining, 0, 'Grounded jump must clear coyoteFramesRemaining');
  input.applySnapshot(0);
  player.update(input, collision, DT);
  const vyBeforeSecondPress = player.vel.y;
  input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
  player.update(input, collision, DT);
  assert.ok(player.vel.y < vyBeforeSecondPress, 'Mid-air jump press after jumping must not double jump');
});

test('Stage 3 [6/9] JUMP_BUFFER — pressing Jump <= 6 frames before landing fires on exact landing frame; j=7 fails', () => {
  resetMovementProfile();

  function testBufferBeforeLanding(framesBeforeLand) {
    const { collision, input, player } = makeFlatHarness();
    // Place Mario falling from a known height and count exact frames to ground
    player.spawn(5.0, 10.0);
    player.vel.y = -12.0;

    // Simulate a clone run first to measure exact frame index of landing without input
    const probe = new PlayerController();
    probe.spawn(5.0, 10.0);
    probe.vel.y = -12.0;
    let exactLandFrame = -1;
    for (let f = 1; f <= 60; f++) {
      probe.update(null, collision, DT);
      if (probe.grounded) {
        exactLandFrame = f;
        break;
      }
    }
    assert.ok(exactLandFrame > 8, 'Probe must take > 8 frames to land');

    const pressFrame = exactLandFrame - framesBeforeLand;
    let firedOnLandFrame = false;
    let wasBuffered = false;

    for (let f = 1; f <= exactLandFrame; f++) {
      const mask = f === pressFrame ? InputManager.encodeActions([Actions.JUMP]) : 0;
      input.applySnapshot(mask);
      player.update(input, collision, DT);
      if (f === exactLandFrame) {
        firedOnLandFrame = !player.grounded && player.vel.y > 18.0;
        wasBuffered = player.jumpMetrics.wasBuffered;
      }
    }

    return { firedOnLandFrame, wasBuffered };
  }

  for (const j of [1, 3, 6]) {
    const res = testBufferBeforeLanding(j);
    assert.equal(res.firedOnLandFrame, true, `Jump pressed j=${j} frames before landing should fire on landing frame`);
    assert.equal(res.wasBuffered, true, `Buffered jump j=${j} should mark wasBuffered=true`);
  }

  const j7 = testBufferBeforeLanding(7);
  assert.equal(j7.firedOnLandFrame, false, 'Jump pressed j=7 frames before landing must expire before landing');
});

test('Stage 3 [7/9] CEILING_CORNER_NUDGE_AND_BONK — 0.20t nudges cleanly around corner; 0.35t bonks head', () => {
  resetMovementProfile();

  // Case A: 0.20t overlap on left side of block (col 10, row 6 -> tile X [10,11], Y [6,7])
  {
    const map = new TileMap(25, 15);
    map.fillRect(0, 0, 25, 2, tileTypes.SOLID);
    map.set(10, 6, tileTypes.SOLID);
    const collision = new CollisionSystem(map);
    const input = new InputManager();
    const player = new PlayerController();

    // Player right edge = 10.20 -> pos.x = 10.20 - 0.80 = 9.40, top right below 6.0
    player.spawn(9.40, 4.10);
    player.grounded = false;
    player.vel.y = 14.0;
    player.isJumping = true;

    input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
    player.update(input, collision, DT);

    assert.equal(player.ceilingHit, false, '0.20t corner overlap should NOT trigger ceiling bonk');
    assert.ok(player.vel.y > 10.0, `Corner nudge should preserve upward velocity (got vy=${player.vel.y})`);
    assert.ok(Math.abs(player.pos.x - 9.20) < 1e-5, `Expected nudge left to x=9.20, got ${player.pos.x}`);
    assert.equal(player.events.some((e) => e.type === 'cornerNudge'), true, 'Should emit cornerNudge event');
  }

  // Case B: 0.35t overlap (> 0.25t threshold) -> bonks head
  {
    const map = new TileMap(25, 15);
    map.fillRect(0, 0, 25, 2, tileTypes.SOLID);
    map.set(10, 6, tileTypes.SOLID);
    const collision = new CollisionSystem(map);
    const input = new InputManager();
    const player = new PlayerController();

    // Player right edge = 10.35 -> pos.x = 10.35 - 0.80 = 9.55
    player.spawn(9.55, 4.10);
    player.grounded = false;
    player.vel.y = 14.0;
    player.isJumping = true;

    input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
    player.update(input, collision, DT);

    assert.equal(player.ceilingHit, true, '0.35t overlap should trigger ceiling bonk');
    assert.equal(player.vel.y, MovementProfile.forgiveness.ceilingBonkVy, 'Bonk should clamp vy to ceilingBonkVy (-2.0)');
    assert.equal(player.events.some((e) => e.type === 'blockHit'), true, 'Ceiling bonk should emit blockHit event');
  }
});

test('Stage 3 [8/9] LEDGE_STEP_UP — 0.15t step snaps onto platform preserving vel.x; 0.35t stops flush at wall', () => {
  resetMovementProfile();

  // Case A: Platform top at Y = 5.0 (row 4 solid from col 12..18), feet at Y = 4.85 (0.15t below top)
  {
    const map = new TileMap(25, 15);
    map.fillRect(12, 0, 8, 5, tileTypes.SOLID); // top = 5.0
    const collision = new CollisionSystem(map);
    const pos = { x: 11.15, y: 4.85 }; // right edge = 11.95
    const vel = { x: 6.0, y: 0.0 };

    const res = collision.moveAndCollide(pos, vel, 0.80, 1.80, DT);
    assert.equal(res.steppedUp, true, '0.15t ledge overlap should step up');
    assert.equal(res.wallRight, false, 'Step-up should not trigger wall stop');
    assert.equal(pos.y, 5.0, 'Feet should snap cleanly to platform top Y=5.0');
    assert.equal(vel.x, 6.0, 'Step-up must preserve horizontal velocity');
  }

  // Case B: Feet at Y = 4.65 (0.35t below top > 0.20t threshold) -> flush wall stop
  {
    const map = new TileMap(25, 15);
    map.fillRect(12, 0, 8, 5, tileTypes.SOLID);
    const collision = new CollisionSystem(map);
    const pos = { x: 11.15, y: 4.65 };
    const vel = { x: 6.0, y: 0.0 };

    const res = collision.moveAndCollide(pos, vel, 0.80, 1.80, DT);
    assert.equal(res.steppedUp, false, '0.35t overlap should NOT step up');
    assert.equal(res.wallRight, true, '0.35t overlap should stop flush against wall');
    assert.equal(vel.x, 0, 'Wall collision should zero horizontal velocity');
    assert.ok(Math.abs(pos.x - 11.20) < 1e-6, `Expected flush stop at x=11.20, got ${pos.x}`);
  }
});

test('Stage 3 [9/9] AIR_CONTROL — 0.85x forward accel, 1.0x reverse, 3.0 t/s^2 no-input drag, takeoff speed cap', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();

  // Launch a standing jump (takeoff vx = 0, so air cap = walkTopSpeed = 5.20)
  input.applySnapshot(InputManager.encodeActions([Actions.JUMP, Actions.RIGHT, Actions.RUN]));
  player.update(input, collision, DT);

  // Measure airborne acceleration pushing with velocity over several ticks
  const vxBefore = player.vel.x;
  input.applySnapshot(InputManager.encodeActions([Actions.JUMP, Actions.RIGHT, Actions.RUN]));
  player.update(input, collision, DT);
  const deltaForward = player.vel.x - vxBefore;
  const expectedForward = MovementProfile.locomotion.groundAccel * MovementProfile.airControl.withVelocityMult * DT;
  assert.ok(
    Math.abs(deltaForward - expectedForward) < 1e-5,
    `Air accel with velocity ${deltaForward.toFixed(5)} != expected ${expectedForward.toFixed(5)}`
  );

  // Hold Right through apex to verify air speed caps at walkTopSpeed (5.20), not sprint speed (9.20)
  let maxAirVx = 0;
  for (let f = 0; f < 25; f++) {
    input.applySnapshot(InputManager.encodeActions([Actions.JUMP, Actions.RIGHT, Actions.RUN]));
    player.update(input, collision, DT);
    maxAirVx = Math.max(maxAirVx, player.vel.x);
  }
  assert.ok(
    maxAirVx <= MovementProfile.locomotion.walkTopSpeed + 1e-5,
    `Standing-jump air vx (${maxAirVx}) exceeded walkTopSpeed cap (5.20)`
  );

  // Release horizontal input -> verify subtle 3.00 t/s^2 drag
  const vxPreRelease = player.vel.x;
  input.applySnapshot(InputManager.encodeActions([Actions.JUMP]));
  player.update(input, collision, DT);
  const actualDrag = (vxPreRelease - player.vel.x) / DT;
  assert.ok(
    Math.abs(actualDrag - MovementProfile.airControl.noDragDecel) < 1e-4,
    `No-input air drag ${actualDrag.toFixed(3)} != ${MovementProfile.airControl.noDragDecel}`
  );

  // Reverse direction mid-air -> verify 1.0x groundAccel authority
  const vxPreReverse = player.vel.x;
  input.applySnapshot(InputManager.encodeActions([Actions.JUMP, Actions.LEFT]));
  player.update(input, collision, DT);
  const reverseDecel = (vxPreReverse - player.vel.x) / DT;
  assert.ok(
    Math.abs(reverseDecel - MovementProfile.locomotion.groundAccel * MovementProfile.airControl.reverseInAirMult) < 1e-4,
    `Air reverse decel ${reverseDecel.toFixed(3)} != ${MovementProfile.locomotion.groundAccel}`
  );
});

test('Stage 3 [10/10] TRIPLE_JUMP_PROGRESSION — sprint tap/held Jump 1 -> DoubleJump -> TripleJump scales height & distance', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness(220, 25);
  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const runJumpMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN, Actions.JUMP]);

  // Helper: execute one jump sequence and record peak height, horizontal span, and combo count
  function performSprintJump(holdDurationFrames, waitLandingFrames = 1) {
    const startX = player.pos.x;
    const startY = player.pos.y;
    let peakDy = 0;
    let launchCombo = null;
    for (let f = 1; f <= 120; f++) {
      const hold = f <= holdDurationFrames;
      input.applySnapshot(hold ? runJumpMask : runRightMask);
      player.update(input, collision, DT);
      if (f === 1) launchCombo = player.jumpComboCount;
      peakDy = Math.max(peakDy, player.pos.y - startY);
      if (f > 2 && player.grounded) break;
    }
    for (let w = 0; w < waitLandingFrames; w++) {
      input.applySnapshot(runRightMask);
      player.update(input, collision, DT);
    }
    return {
      combo: launchCombo,
      peakDy,
      spanX: player.pos.x - startX,
    };
  }

  // Reach full sprint speed before starting the Triple Jump chain
  for (let f = 0; f < 45; f++) {
    input.applySnapshot(runRightMask);
    player.update(input, collision, DT);
  }

  // Case A: Full-held 1 -> 2 -> 3 chain
  const j1 = performSprintJump(50, 2);
  const j2 = performSprintJump(50, 2);
  const j3 = performSprintJump(60, 2);
  const j4 = performSprintJump(50, 2); // Cycles back to 1

  assert.equal(j1.combo, 1, 'First jump must be combo 1');
  assert.equal(j2.combo, 2, 'Second consecutive sprint jump must trigger DoubleJump (combo 2)');
  assert.equal(j3.combo, 3, 'Third consecutive sprint jump must trigger TripleJump (combo 3)');
  assert.equal(j4.combo, 1, 'Fourth jump must cycle cleanly back to combo 1');

  assert.ok(
    j2.peakDy > j1.peakDy + 0.35 && j3.peakDy > j2.peakDy + 0.70,
    `Peak heights must escalate cleanly: J1=${j1.peakDy.toFixed(2)}t, J2=${j2.peakDy.toFixed(2)}t, J3=${j3.peakDy.toFixed(2)}t`
  );
  assert.ok(
    j2.spanX > j1.spanX + 0.8 && j3.spanX > j2.spanX + 1.5,
    `Horizontal distance must escalate cleanly: J1=${j1.spanX.toFixed(2)}t, J2=${j2.spanX.toFixed(2)}t, J3=${j3.spanX.toFixed(2)}t`
  );

  // Case B: Short tap Jump 1 (4f) & tap Jump 2 (4f) STILL retain DoubleJump -> TripleJump progression!
  const tapH = makeFlatHarness(220, 25);
  for (let f = 0; f < 45; f++) {
    tapH.input.applySnapshot(runRightMask);
    tapH.player.update(tapH.input, tapH.collision, DT);
  }
  const runTapStep = (holdFrames) => {
    let combo = 0;
    for (let f = 1; f <= 90; f++) {
      tapH.input.applySnapshot(f <= holdFrames ? runJumpMask : runRightMask);
      tapH.player.update(tapH.input, tapH.collision, DT);
      if (f === 1) combo = tapH.player.jumpComboCount;
      if (f > 2 && tapH.player.grounded) break;
    }
    return combo;
  };
  const t1 = runTapStep(4);
  const t2 = runTapStep(4); // Not held long, still DoubleJump
  const t3 = runTapStep(60); // Third jump still triggers TripleJump!
  assert.equal(t1, 1);
  assert.equal(t2, 2, 'Tap-released Jump 1 must still unlock DoubleJump on landing');
  assert.equal(t3, 3, 'Tap-released DoubleJump must still retain combo state to trigger TripleJump');

  // Case C: Stationary jumps without horizontal speed stay combo = 1
  const statH = makeFlatHarness(60, 20);
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let f = 1; f <= 60; f++) {
      statH.input.applySnapshot(f <= 4 ? jumpMask : 0);
      statH.player.update(statH.input, statH.collision, DT);
      if (f === 1) assert.equal(statH.player.jumpComboCount, 1, 'Stationary jumps must not advance Triple Jump');
      if (f > 2 && statH.player.grounded) break;
    }
  }

  // Case D: Jump Buffer pressed 3 frames BEFORE landing from Jump 1 must advance into DoubleJump (combo 2)
  const bufH = makeFlatHarness(160, 25);
  for (let f = 0; f < 45; f++) {
    bufH.input.applySnapshot(runRightMask);
    bufH.player.update(bufH.input, bufH.collision, DT);
  }
  bufH.input.applySnapshot(runJumpMask);
  bufH.player.update(bufH.input, bufH.collision, DT);
  assert.equal(bufH.player.jumpComboCount, 1);
  // Let tap jump rise and descend until close to ground (y <= 4.6 while vy < 0), then buffer Jump
  let sawBufferedDouble = false;
  for (let f = 1; f <= 60; f++) {
    const nearLand = !bufH.player.grounded && bufH.player.vel.y < 0 && bufH.player.pos.y <= 4.85;
    bufH.input.applySnapshot(nearLand ? runJumpMask : runRightMask);
    bufH.player.update(bufH.input, bufH.collision, DT);
    if (bufH.player.events.some((e) => e.type === 'jump' && e.combo === 2 && e.viaBuffer)) {
      sawBufferedDouble = true;
      break;
    }
  }
  assert.equal(sawBufferedDouble, true, 'Buffered Jump before landing from Jump 1 must chain into DoubleJump (combo 2)');
});

