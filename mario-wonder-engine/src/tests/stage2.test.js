/**
 * Stage 2 Automated Headless Verification Suite
 * ==============================================
 * Run with: node --test src/tests/stage2.test.js
 *
 * Verifies all Stage 2 kinematic exit criteria:
 *  1. FRAME1_IMPULSE: Snaps vx immediately to 1.25 tiles/s on frame 1 from rest
 *  2. WALK_RAMP: Reaches 5.20 +/- 0.05 tiles/s in 0.19–0.23s without overshoot
 *  3. RUN_RAMP: Reaches 9.20 +/- 0.05 tiles/s in 0.40–0.46s without overshoot
 *  4. RELEASE_FRICTION: Halts from full run within 1.85–2.05 tiles and 0.40–0.45s
 *  5. SKID_BRAKE: Halts from full run within 0.90–1.05 tiles and 0.19–0.23s without instant facing flip
 *  6. LOW_SPEED_PIVOT: Reversing <= 4.50 tiles/s executes 4-frame pivot at 3x accel without skid
 *  7. SINGLE_FRAME_TAP: Consistently advances 0.02–0.08 tiles deterministically
 *  8. CROUCH_TUNNEL: Shrinks hitbox 1.80 -> 0.90, pins feet, blocks standing inside 1-tile gap, auto-stands on exit
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import { PlayerState } from '../game/player/PlayerState.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function makeFlatHarness(cols = 80, rows = 15) {
  const map = new TileMap(cols, rows);
  map.fillRect(0, 0, cols, 4, tileTypes.SOLID); // Floor top Y = 4.0
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(3.0, 4.0);
  // Settle 2 ticks onto floor
  player.update(null, collision, DT);
  player.update(null, collision, DT);
  return { map, collision, input, player };
}

test('Stage 2 [1/8] FRAME1_IMPULSE — snaps immediately to 1.25 tiles/s on frame 1 from rest', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  assert.equal(player.grounded, true);
  assert.equal(player.vel.x, 0);

  const rightMask = InputManager.encodeActions([Actions.RIGHT]);
  input.applySnapshot(rightMask);
  player.update(input, collision, DT);

  assert.equal(player.vel.x, 1.25, `Expected frame-1 impulse 1.25, got ${player.vel.x}`);
  assert.equal(player.facingRight, true);
});

test('Stage 2 [2/8] WALK_RAMP — reaches 5.20 +/- 0.05 tiles/s in 0.19–0.23s without overshoot', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const rightMask = InputManager.encodeActions([Actions.RIGHT]);

  let reachFrame = -1;
  let maxVx = 0;
  for (let f = 1; f <= 60; f++) {
    input.applySnapshot(rightMask);
    player.update(input, collision, DT);
    maxVx = Math.max(maxVx, player.vel.x);
    if (reachFrame === -1 && Math.abs(player.vel.x - 5.20) <= 0.05) {
      reachFrame = f;
    }
  }

  const reachTime = reachFrame / 60;
  assert.ok(reachFrame > 0, 'Never reached walk top speed 5.20');
  assert.ok(
    reachTime >= 0.19 && reachTime <= 0.23,
    `Walk top speed time ${reachTime.toFixed(4)}s (${reachFrame}f) outside 0.19–0.23s`
  );
  assert.ok(maxVx <= 5.2001, `Walk speed overshot 5.20: ${maxVx}`);
  assert.ok(Math.abs(player.vel.x - 5.20) < 0.001, `Steady walk speed ${player.vel.x} != 5.20`);
});

test('Stage 2 [3/8] RUN_RAMP — Hold Right + Run reaches 9.20 +/- 0.05 tiles/s in 0.40–0.46s without overshoot', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);

  let reachFrame = -1;
  let maxVx = 0;
  for (let f = 1; f <= 90; f++) {
    input.applySnapshot(runRightMask);
    player.update(input, collision, DT);
    maxVx = Math.max(maxVx, player.vel.x);
    if (reachFrame === -1 && Math.abs(player.vel.x - 9.20) <= 0.05) {
      reachFrame = f;
    }
  }

  const reachTime = reachFrame / 60;
  assert.ok(reachFrame > 0, 'Never reached run top speed 9.20');
  assert.ok(
    reachTime >= 0.40 && reachTime <= 0.46,
    `Run top speed time ${reachTime.toFixed(4)}s (${reachFrame}f) outside 0.40–0.46s`
  );
  assert.ok(maxVx <= 9.2001, `Run speed overshot 9.20: ${maxVx}`);
  assert.ok(Math.abs(player.vel.x - 9.20) < 0.001, `Steady run speed ${player.vel.x} != 9.20`);
});

test('Stage 2 [4/8] RELEASE_FRICTION — release from full run halts within 1.85–2.05 tiles and 0.40–0.45s', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);

  for (let f = 0; f < 40; f++) {
    input.applySnapshot(runRightMask);
    player.update(input, collision, DT);
  }
  assert.ok(Math.abs(player.vel.x - 9.20) < 0.01);

  const releaseX = player.pos.x;
  let stopFrame = -1;
  for (let f = 1; f <= 60; f++) {
    input.applySnapshot(0);
    player.update(input, collision, DT);
    if (player.vel.x === 0) {
      stopFrame = f;
      break;
    }
  }

  const stopDist = player.pos.x - releaseX;
  const stopTime = stopFrame / 60;

  assert.ok(stopFrame > 0, 'Player failed to halt after release');
  assert.ok(
    stopDist >= 1.85 && stopDist <= 2.05,
    `Release stop distance ${stopDist.toFixed(4)}t outside 1.85–2.05t`
  );
  assert.ok(
    stopTime >= 0.40 && stopTime <= 0.45,
    `Release stop time ${stopTime.toFixed(4)}s (${stopFrame}f) outside 0.40–0.45s`
  );
});

test('Stage 2 [5/8] SKID_BRAKE — skid from full run halts within 0.90–1.05 tiles and 0.19–0.23s without instant facing flip', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const runLeftMask = InputManager.encodeActions([Actions.LEFT, Actions.RUN]);

  for (let f = 0; f < 40; f++) {
    input.applySnapshot(runRightMask);
    player.update(input, collision, DT);
  }

  const skidStartX = player.pos.x;
  let stopFrame = -1;
  let stopX = skidStartX;
  let flippedEarly = false;
  let enteredSkid = false;

  for (let f = 1; f <= 40; f++) {
    input.applySnapshot(runLeftMask);
    player.update(input, collision, DT);

    if (player.state === PlayerState.SKID) {
      enteredSkid = true;
    }
    if (player.vel.x > 0 && !player.facingRight) {
      flippedEarly = true;
    }
    if (player.vel.x <= 0) {
      stopFrame = f;
      stopX = player.pos.x;
      break;
    }
  }

  const skidDist = stopX - skidStartX;
  const skidTime = stopFrame / 60;

  assert.equal(enteredSkid, true, 'Never entered Skid state');
  assert.equal(flippedEarly, false, 'Facing flipped before vx crossed zero during skid');
  assert.equal(player.facingRight, false, 'Facing should flip to Left when vx reaches zero');
  assert.ok(
    skidDist >= 0.90 && skidDist <= 1.05,
    `Skid stop distance ${skidDist.toFixed(4)}t outside 0.90–1.05t`
  );
  assert.ok(
    skidTime >= 0.19 && skidTime <= 0.23,
    `Skid stop time ${skidTime.toFixed(4)}s (${stopFrame}f) outside 0.19–0.23s`
  );
});

test('Stage 2 [6/8] LOW_SPEED_PIVOT — reversing <= 4.50 tiles/s executes 4-frame pivot without skidding', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness();
  const rightMask = InputManager.encodeActions([Actions.RIGHT]);
  const leftMask = InputManager.encodeActions([Actions.LEFT]);

  // Accelerate to ~3.5 t/s (below 4.50 skid threshold)
  for (let f = 0; f < 8; f++) {
    input.applySnapshot(rightMask);
    player.update(input, collision, DT);
  }
  assert.ok(player.vel.x > 2.0 && player.vel.x < 4.50, `Expected pre-pivot vx in (2.0, 4.50), got ${player.vel.x}`);

  let sawSkid = false;
  let sawPivot = false;
  for (let f = 0; f < 6; f++) {
    input.applySnapshot(leftMask);
    player.update(input, collision, DT);
    if (player.state === PlayerState.SKID) sawSkid = true;
    if (player.state === PlayerState.PIVOT) sawPivot = true;
  }

  assert.equal(sawSkid, false, 'Low-speed reverse should not enter Skid');
  assert.equal(sawPivot, true, 'Low-speed reverse should enter Pivot');
  assert.ok(player.vel.x < 0, `Expected player to reverse cleanly into negative vx, got ${player.vel.x}`);
});

test('Stage 2 [7/8] SINGLE_FRAME_TAP — consistently advances 0.02–0.08 tiles deterministically', () => {
  resetMovementProfile();
  const runTap = () => {
    const { collision, input, player } = makeFlatHarness();
    const startX = player.pos.x;
    const rightMask = InputManager.encodeActions([Actions.RIGHT]);

    input.applySnapshot(rightMask);
    player.update(input, collision, DT);

    for (let f = 0; f < 20; f++) {
      input.applySnapshot(0);
      player.update(input, collision, DT);
    }
    return {
      dist: player.pos.x - startX,
      vx: player.vel.x,
      hash: player.stateHash,
    };
  };

  const runA = runTap();
  const runB = runTap();

  assert.equal(runA.vx, 0, 'Player should settle to vx=0 after tap');
  assert.equal(runA.dist, runB.dist, 'Single-frame tap was non-deterministic');
  assert.equal(runA.hash, runB.hash, 'Single-frame tap hash was non-deterministic');
  assert.ok(
    runA.dist >= 0.02 && runA.dist <= 0.08,
    `Single-frame tap distance ${runA.dist.toFixed(4)}t outside 0.02–0.08t`
  );
});

test('Stage 2 [8/8] CROUCH_TUNNEL — shrinks hitbox 50%, pins feet, blocks standing inside 1-tile gap, auto-stands on exit', () => {
  resetMovementProfile();
  const { map, collision, input, player } = makeFlatHarness(40, 15);
  // 1-tile-high tunnel from col 14 to col 17 (row 5 solid => ceiling bottom Y = 5.0, floor top Y = 4.0)
  map.fillRect(14, 5, 3, 2, tileTypes.SOLID);

  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const crouchMask = InputManager.encodeActions([Actions.DOWN]);

  // Sprint until close to tunnel entrance (x ~ 12.5)
  for (let f = 0; f < 90; f++) {
    input.applySnapshot(runRightMask);
    player.update(input, collision, DT);
    if (player.pos.x >= 12.2) break;
  }
  assert.ok(player.pos.x >= 12.0 && player.pos.x < 13.2, `Unexpected pre-crouch x=${player.pos.x}`);

  // Initiate crouch slide into tunnel
  const floorYBeforeCrouch = player.pos.y;
  input.applySnapshot(crouchMask);
  player.update(input, collision, DT);

  assert.equal(player.isCrouched, true);
  assert.equal(player.currentHeight, 0.90);
  assert.equal(player.pos.y, floorYBeforeCrouch, 'Feet must remain pinned to floor when crouching');
  assert.equal(player.state, PlayerState.CROUCH_SLIDE);

  // Slide into tunnel (keep Down held until inside cols 14..17, then release Down inside tunnel)
  let enteredTunnel = false;
  let stayedCrouchedOnReleaseInside = false;
  for (let f = 0; f < 40; f++) {
    const insideTunnel = player.pos.x >= 14.0 && player.pos.x + player.currentWidth <= 17.0;
    if (insideTunnel) {
      enteredTunnel = true;
      input.applySnapshot(0);
    } else {
      input.applySnapshot(crouchMask);
    }
    player.update(input, collision, DT);
    if (insideTunnel && player.isCrouched && player.standingBlocked) {
      stayedCrouchedOnReleaseInside = true;
    }
  }

  assert.equal(enteredTunnel, true, `Player failed to slide into 1-tile tunnel (x=${player.pos.x})`);
  assert.equal(
    stayedCrouchedOnReleaseInside,
    true,
    'Standing should be blocked inside 1-tile tunnel when Down is released'
  );

  // Now crawl/move right out of the tunnel without holding Down -> should auto-uncrouch upon exit
  let autoUncrouched = false;
  for (let f = 0; f < 90; f++) {
    input.applySnapshot(InputManager.encodeActions([Actions.RIGHT]));
    player.update(input, collision, DT);
    if (player.pos.x > 17.1 && !player.isCrouched) {
      autoUncrouched = true;
      break;
    }
  }

  assert.equal(autoUncrouched, true, `Player did not auto-uncrouch after exiting tunnel (x=${player.pos.x})`);
  assert.equal(player.currentHeight, 1.80);
});
