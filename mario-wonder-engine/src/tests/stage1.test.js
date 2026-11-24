/**
 * Stage 1 Automated Headless Verification Suite
 * ==============================================
 * Run with: node --test src/tests/stage1.test.js
 *
 * Verifies all Stage 1 kinematic exit criteria:
 *  1. REST_JITTER: 0.0000 tolerance & 0 jitter over 600 settled frames
 *  2. WALL_FLUSH: Zero oscillation / penetration against solid walls (left & right)
 *  3. NO_TUNNELING: Falling at >= 25 tiles/s onto a 1-tile floor never tunnels
 *  4. DETERMINISM: 600-frame JSON replay yields 100% identical state hashes
 *  5. FRAMERATE_INDEPENDENCE: Identical trajectory at 30, 60, and 144 Hz
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import GameEngine from '../engine/core/GameEngine.js';
import PlayerController from '../game/player/PlayerController.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function makeScriptedInput(frame) {
  const actions = [];
  if (frame >= 10 && frame < 140) actions.push(Actions.RIGHT, Actions.RUN);
  if (frame === 30 || frame === 90 || frame === 260) actions.push(Actions.JUMP);
  if (frame >= 30 && frame < 55) actions.push(Actions.JUMP);
  if (frame >= 180 && frame < 320) actions.push(Actions.LEFT);
  if (frame >= 350 && frame < 500) actions.push(Actions.RIGHT);
  return InputManager.encodeActions(actions);
}

test('Stage 1 [1/5] REST_JITTER — settles cleanly on flat floor with 0 jitter over 600 frames', () => {
  resetMovementProfile();
  const map = new TileMap(20, 15);
  map.fillRect(0, 0, 20, 1, tileTypes.SOLID); // Floor top at Y = 1.0000
  const floorY = 1.0;

  const collision = new CollisionSystem(map);
  const player = new PlayerController();
  player.spawn(5.0, 10.0);

  // Drop until grounded
  for (let i = 0; i < 120; i++) {
    player.update(null, collision, DT);
    if (player.grounded) break;
  }
  assert.equal(player.grounded, true, 'Player should land on floor');
  assert.ok(Math.abs(player.pos.y - floorY) < 0.0001, `Expected Y=${floorY}, got ${player.pos.y}`);

  // Verify 600 settled frames have 0 jitter and remain grounded
  let maxDeltaY = 0;
  for (let i = 0; i < 600; i++) {
    player.update(null, collision, DT);
    assert.equal(player.grounded, true, `Lost grounded state on settled frame ${i}`);
    assert.equal(player.vel.y, 0, `Non-zero vy on settled frame ${i}`);
    maxDeltaY = Math.max(maxDeltaY, Math.abs(player.pos.y - floorY));
  }
  assert.equal(maxDeltaY, 0, `Expected 0 jitter over 600 frames, got ${maxDeltaY}`);
});

test('Stage 1 [2/5] WALL_FLUSH — pushing against left and right walls stops flush with 0 oscillation', () => {
  resetMovementProfile();
  const map = new TileMap(20, 15);
  map.fillRect(0, 0, 20, 2, tileTypes.SOLID); // Floor top Y = 2
  map.fillRect(0, 2, 1, 10, tileTypes.SOLID); // Left wall right face = 1.0
  map.fillRect(15, 2, 1, 10, tileTypes.SOLID); // Right wall left face = 15.0

  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(8.0, 2.0);

  const rightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const positionsRight = [];
  for (let i = 0; i < 180; i++) {
    input.applySnapshot(rightMask);
    player.update(input, collision, DT);
    if (i >= 120) positionsRight.push(player.pos.x);
  }

  const expectedRightX = 15.0 - player.width;
  assert.ok(
    Math.abs(player.pos.x - expectedRightX) < 0.0001,
    `Right wall flush expected ${expectedRightX}, got ${player.pos.x}`
  );
  assert.equal(player.vel.x, 0);
  assert.equal(player.wallContactDirection, 1);
  for (const x of positionsRight) {
    assert.equal(x, expectedRightX, 'Right wall position oscillated or penetrated');
  }

  // Push left into left wall (face at x = 1.0)
  const leftMask = InputManager.encodeActions([Actions.LEFT, Actions.RUN]);
  const positionsLeft = [];
  for (let i = 0; i < 240; i++) {
    input.applySnapshot(leftMask);
    player.update(input, collision, DT);
    if (i >= 180) positionsLeft.push(player.pos.x);
  }

  assert.ok(
    Math.abs(player.pos.x - 1.0) < 0.0001,
    `Left wall flush expected 1.0, got ${player.pos.x}`
  );
  assert.equal(player.vel.x, 0);
  assert.equal(player.wallContactDirection, -1);
  for (const x of positionsLeft) {
    assert.equal(x, 1.0, 'Left wall position oscillated or penetrated');
  }
});

test('Stage 1 [3/5] NO_TUNNELING — falling at 25+ tiles/s onto 1-tile floor never passes through', () => {
  resetMovementProfile();
  const map = new TileMap(20, 20);
  // 1-tile-thick suspended floor at row 4 (top = 5.0), empty below
  map.fillRect(0, 4, 20, 1, tileTypes.SOLID);

  for (const initialVy of [-25, -60]) {
    const collision = new CollisionSystem(map);
    const player = new PlayerController();
    player.spawn(10.0, 5.2);
    player.vel.y = initialVy;

    let everBelowFloor = false;
    for (let i = 0; i < 30; i++) {
      player.update(null, collision, DT);
      if (player.pos.y < 5.0 - 1e-6) {
        everBelowFloor = true;
      }
    }

    assert.equal(everBelowFloor, false, `Tunneled through 1-tile floor at vy=${initialVy}`);
    assert.equal(player.pos.y, 5.0);
    assert.equal(player.grounded, true);
  }
});

test('Stage 1 [4/5] DETERMINISM — replaying 600 recorded frames via JSON produces identical hashes', () => {
  resetMovementProfile();
  const engineA = new GameEngine();
  engineA.initHeadless(0);
  engineA.input.startRecording({ roomIndex: 0 });

  const hashesA = [];
  for (let f = 0; f < 600; f++) {
    const mask = makeScriptedInput(f);
    engineA.input.applySnapshot(mask);
    engineA.input._recordFrame();
    engineA.player.update(engineA.input, engineA.collision, DT);
    engineA.loop.tickCount++;
    hashesA.push(engineA.player.stateHash);
  }
  const replayJson = engineA.input.exportReplayJSON();

  // Replay on a brand new engine instance from serialized JSON
  const engineB = new GameEngine();
  engineB.initHeadless(0);
  engineB.input.loadReplayJSON(replayJson);

  const hashesB = [];
  for (let f = 0; f < 600; f++) {
    engineB.loop.stepFixed(1);
    hashesB.push(engineB.player.stateHash);
  }

  assert.deepEqual(hashesB, hashesA, '600-frame replay hashes diverged from recording');
  assert.equal(engineB.player.pos.x, engineA.player.pos.x);
  assert.equal(engineB.player.pos.y, engineA.player.pos.y);
});

test('Stage 1 [5/5] FRAMERATE_INDEPENDENCE — identical trajectory at 30 Hz, 60 Hz, and 144 Hz', () => {
  resetMovementProfile();

  const frames = [];
  for (let f = 0; f < 600; f++) {
    frames.push(makeScriptedInput(f));
  }

  const runAtRefreshRate = (hz) => {
    const engine = new GameEngine();
    engine.initHeadless(0);
    engine.input.loadReplay({ version: 1, meta: { roomIndex: 0 }, frames });

    const totalFrames = hz * 10; // Exactly 10 seconds -> 600 simulation ticks
    const stepDelta = 1 / hz;
    for (let i = 0; i < totalFrames; i++) {
      engine.loop.advanceByDelta(stepDelta);
    }
    // Account for tiny IEEE-754 remainder if any (e.g. 1440 * (1/144))
    if (engine.loop.tickCount < 600) {
      engine.loop.advanceByDelta(1e-6);
    }

    return {
      ticks: engine.loop.tickCount,
      x: engine.player.pos.x,
      y: engine.player.pos.y,
      vx: engine.player.vel.x,
      vy: engine.player.vel.y,
      grounded: engine.player.grounded,
      hash: engine.player.stateHash,
    };
  };

  const res30 = runAtRefreshRate(30);
  const res60 = runAtRefreshRate(60);
  const res144 = runAtRefreshRate(144);

  assert.equal(res30.ticks, 600);
  assert.equal(res60.ticks, 600);
  assert.equal(res144.ticks, 600);
  assert.deepEqual(res30, res60, '30 Hz diverged from 60 Hz');
  assert.deepEqual(res144, res60, '144 Hz diverged from 60 Hz');
});

test('Stage 1 Live Tuning — MovementProfile mutations affect simulation and reset restores defaults', () => {
  resetMovementProfile();
  const originalWidth = MovementProfile.hitbox.width;
  MovementProfile.hitbox.width = 1.0;

  const map = new TileMap(20, 15);
  map.fillRect(0, 0, 20, 2, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const player = new PlayerController();
  player.spawn(4.0, 2.0);
  player.update(null, collision, DT);

  assert.equal(player.currentWidth, 1.0);
  resetMovementProfile();
  assert.equal(MovementProfile.hitbox.width, originalWidth);
});
