/**
 * Stage 5 Automated Headless Verification Suite
 * ==============================================
 * Run with: node --test src/tests/stage5.test.js
 *
 * Verifies all Stage 5 Terrain Slopes, Butt-Slide, Semisolids & Moving Platform exit criteria:
 *  1. SLOPE_MATH_AND_NORMALS: Exact 45° (±1.0) & 26.57° (±0.5) height profiles & unit normals
 *  2. DOWNHILL_ADHESION_100_TRAVERSALS: 100 traversals across 45° & 26.5° hills — 0 disconnects, vy <= 1.0
 *  3. BUTT_SLIDE_RUNOUT_AND_JUMP: 8-tile 26.5° slide > 12.0 t/s (cap 14.50), uphill lock, flat runout decel (11.20),
 *     lethal flag (>= 6.00 t/s), and slide jump preserving horizontal velocity
 *  4. SEMISOLIDS_100_PASS_LAND_DROP: 100/100 pass-through from below, 100/100 land from above,
 *     and stacked Down + Jump single-layer drop-through
 *  5. MOVING_PLATFORM_CARRY_AND_INHERIT: Horizontal delta carry, jump velocity inheritance, and vertical sine carry
 *  6. MIXED_TERRAIN_FUZZ_10000_FRAMES: 10,000 deterministic random-input frames across Room 5 — 0 NaN, 0 tunneling, 0 stuck states
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import { PlayerState } from '../game/player/PlayerState.js';
import MovingPlatform from '../game/entities/MovingPlatform.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { createSlopeRamps } from '../game/levels/benchmark/BenchmarkRooms.js';

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

test('Stage 5 [1/6] SLOPE_MATH_AND_NORMALS — exact 45° & 26.57° height functions & unit normals', () => {
  resetMovementProfile();
  const map = new TileMap(20, 10);
  map.set(2, 2, tileTypes.SLOPE_45);
  map.set(3, 2, tileTypes.SLOPE_45_DOWN);
  map.set(5, 2, tileTypes.SLOPE_26_UP_1);
  map.set(6, 2, tileTypes.SLOPE_26_UP_2);
  map.set(8, 2, tileTypes.SLOPE_26_DOWN_1);
  map.set(9, 2, tileTypes.SLOPE_26_DOWN_2);
  map.set(11, 2, tileTypes.SLOPE_26);
  map.set(12, 2, tileTypes.SLOPE_26);

  const s45Up = map.getSlopeInfo(2, 2);
  const s45Dn = map.getSlopeInfo(3, 2);
  const s26Up1 = map.getSlopeInfo(5, 2);
  const s26Up2 = map.getSlopeInfo(6, 2);
  const s26Dn1 = map.getSlopeInfo(8, 2);
  const s26Dn2 = map.getSlopeInfo(9, 2);
  const s26Auto1 = map.getSlopeInfo(11, 2);
  const s26Auto2 = map.getSlopeInfo(12, 2);

  assert.ok(Math.abs(s45Up.angleDeg - 45.0) < 1e-6);
  assert.ok(Math.abs(s45Up.heightAt(0) - 0) < 1e-6 && Math.abs(s45Up.heightAt(1) - 1) < 1e-6);
  assert.ok(Math.abs(s45Up.normal[0] + Math.SQRT1_2) < 1e-6 && Math.abs(s45Up.normal[1] - Math.SQRT1_2) < 1e-6);

  assert.ok(Math.abs(s45Dn.angleDeg + 45.0) < 1e-6);
  assert.ok(Math.abs(s45Dn.heightAt(0) - 1) < 1e-6 && Math.abs(s45Dn.heightAt(1) - 0) < 1e-6);
  assert.ok(Math.abs(s45Dn.normal[0] - Math.SQRT1_2) < 1e-6 && Math.abs(s45Dn.normal[1] - Math.SQRT1_2) < 1e-6);

  const expected26Deg = (Math.atan(0.5) * 180) / Math.PI; // ~26.565°
  const invLen26 = 1 / Math.hypot(-0.5, 1);
  assert.ok(Math.abs(s26Up1.angleDeg - expected26Deg) < 1e-6);
  assert.ok(Math.abs(s26Up1.heightAt(0) - 0.0) < 1e-6 && Math.abs(s26Up1.heightAt(1) - 0.5) < 1e-6);
  assert.ok(Math.abs(s26Up2.heightAt(0) - 0.5) < 1e-6 && Math.abs(s26Up2.heightAt(1) - 1.0) < 1e-6);
  assert.ok(Math.abs(s26Up1.normal[0] + 0.5 * invLen26) < 1e-6 && Math.abs(s26Up1.normal[1] - invLen26) < 1e-6);

  assert.ok(Math.abs(s26Dn1.angleDeg + expected26Deg) < 1e-6);
  assert.ok(Math.abs(s26Dn1.heightAt(0) - 1.0) < 1e-6 && Math.abs(s26Dn1.heightAt(1) - 0.5) < 1e-6);
  assert.ok(Math.abs(s26Dn2.heightAt(0) - 0.5) < 1e-6 && Math.abs(s26Dn2.heightAt(1) - 0.0) < 1e-6);
  assert.ok(Math.abs(s26Dn1.normal[0] - 0.5 * invLen26) < 1e-6 && Math.abs(s26Dn1.normal[1] - invLen26) < 1e-6);

  assert.ok(Math.abs(s26Auto1.heightAt(1) - 0.5) < 1e-6 && Math.abs(s26Auto2.heightAt(1) - 1.0) < 1e-6);
});

test('Stage 5 [2/6] DOWNHILL_ADHESION_100_TRAVERSALS — 100 traversals on 45° & 26.5° slopes with zero disconnects & vy <= 1.0', () => {
  resetMovementProfile();
  const room5 = createSlopeRamps();
  const collision = new CollisionSystem(room5.map);
  const input = new InputManager();
  const player = new PlayerController();
  const rightMask = InputManager.encodeActions([Actions.RIGHT]);
  const sprintMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);

  // First verify full uphill + downhill walk/sprint across Room 5's 45° and 26.57° hills
  player.spawn(room5.spawnX, room5.floorY);
  player.update(null, collision, DT);
  player.update(null, collision, DT);

  let reached45Summit = false;
  let reached26Summit = false;
  let disconnectCount = 0;
  let maxAbsVy = 0;

  for (let f = 0; f < 550; f++) {
    input.applySnapshot(f % 2 === 0 ? sprintMask : rightMask);
    player.update(input, collision, DT, room5.platforms);
    if (!player.grounded) disconnectCount++;
    if (Math.abs(player.vel.y) > maxAbsVy) maxAbsVy = Math.abs(player.vel.y);
    if (player.pos.x >= 11.0 && player.pos.x <= 13.0 && player.pos.y >= 6.95) reached45Summit = true;
    if (player.pos.x >= 30.0 && player.pos.x <= 32.0 && player.pos.y >= 5.95) reached26Summit = true;
    if (player.pos.x > 42.0) break;
  }

  assert.equal(reached45Summit, true, 'Player must climb seamlessly over 45° hill summit (Y=7.0)');
  assert.equal(reached26Summit, true, 'Player must climb seamlessly over 26.5° hill summit (Y=6.0)');
  assert.equal(disconnectCount, 0, `Full Room 5 hill traversal had ${disconnectCount} airborne disconnects`);
  assert.ok(maxAbsVy <= 1.0, `Room 5 traversal max |vy|=${maxAbsVy.toFixed(3)} exceeded 1.0 t/s`);

  // 100 dedicated downhill traversals (50 on 45° descent, 50 on 26.57° descent) at varying speeds 3.0..11.0 t/s
  for (let trial = 0; trial < 100; trial++) {
    const is45 = trial < 50;
    const targetSpeed = 3.0 + ((trial % 50) / 49) * 8.0; // 3.0 .. 11.0 t/s
    const startX = is45 ? 11.2 : 30.2;
    const startY = is45 ? 7.0 : 6.0;
    const endX = is45 ? 19.0 : 41.5;

    player.spawn(startX, startY);
    player.grounded = true;
    player.vel.x = targetSpeed;

    for (let f = 0; f < 300; f++) {
      // Hold direction/run proportional to target trial speed
      input.applySnapshot(targetSpeed > 5.2 ? sprintMask : rightMask);
      player.vel.x = targetSpeed; // Maintain exact trial downhill speed across every seam
      player.update(input, collision, DT, room5.platforms);

      assert.equal(
        player.grounded,
        true,
        `Trial ${trial} (${is45 ? '45°' : '26.5°'} @ ${targetSpeed.toFixed(2)} t/s) lost ground contact at x=${player.pos.x.toFixed(2)}, y=${player.pos.y.toFixed(2)}`
      );
      assert.ok(
        Math.abs(player.vel.y) <= 1.0,
        `Trial ${trial} spiked vy=${player.vel.y.toFixed(3)} > 1.0 across slope seam`
      );
      if (player.pos.x >= endX) break;
    }
    assert.ok(player.pos.x >= endX, `Trial ${trial} did not finish downhill traversal`);
  }
});

test('Stage 5 [3/6] BUTT_SLIDE_RUNOUT_AND_JUMP — 8-tile 26.5° accel > 12 t/s, uphill ignored, flat runout decel (11.20), lethal flag, & slide jump', () => {
  resetMovementProfile();
  const room5 = createSlopeRamps();
  const collision = new CollisionSystem(room5.map);
  const input = new InputManager();
  const player = new PlayerController();

  const downMask = InputManager.encodeActions([Actions.DOWN]);
  const downLeftMask = InputManager.encodeActions([Actions.DOWN, Actions.LEFT]);
  const downJumpMask = InputManager.encodeActions([Actions.DOWN, Actions.JUMP]);

  // Spawn just inside the top of the 8-tile descending 26.57° slope (cols 32..39)
  player.spawn(31.8, 6.0);
  player.update(null, collision, DT);

  let peakSlideSpeed = 0;
  let sawLethalAt6 = false;
  let sawUphillIgnored = false;
  let enteredFlatRunout = false;
  let flatStartX = 0;
  let flatStartVx = 0;
  let flatDecelFrames = 0;
  let haltedCleanly = false;

  for (let f = 1; f <= 300; f++) {
    // Hold Down + Left during frames 20..30 to verify uphill input is ignored while sliding
    const mask = (f >= 20 && f <= 30) ? downLeftMask : downMask;
    const prevVx = player.vel.x;
    input.applySnapshot(mask);
    player.update(input, collision, DT, room5.platforms);

    if (f >= 20 && f <= 30 && player.vel.x >= prevVx) {
      sawUphillIgnored = true;
    }

    if (player.state === PlayerState.BUTT_SLIDE) {
      peakSlideSpeed = Math.max(peakSlideSpeed, Math.abs(player.vel.x));
      if (Math.abs(player.vel.x) >= 6.0 && player.isSlideLethal) {
        sawLethalAt6 = true;
      }
    }

    if (!enteredFlatRunout && player.centerX >= 40.0 && !player.isOnSlope) {
      enteredFlatRunout = true;
      flatStartX = player.pos.x;
      flatStartVx = Math.abs(player.vel.x);
    } else if (enteredFlatRunout && player.vel.x > 0) {
      flatDecelFrames++;
    }

    if (enteredFlatRunout && player.vel.x === 0) {
      haltedCleanly = true;
      break;
    }
  }

  assert.ok(peakSlideSpeed > 12.0, `Expected butt-slide > 12.0 t/s on 8-tile 26.5° slope, got ${peakSlideSpeed.toFixed(2)}`);
  assert.ok(peakSlideSpeed <= MovementProfile.slopes.buttSlideMaxSpeed + 0.01, `Exceeded max slide cap 14.50 t/s: ${peakSlideSpeed}`);
  assert.equal(sawUphillIgnored, true, 'Uphill input must be ignored during slope butt-slide');
  assert.equal(sawLethalAt6, true, 'isSlideLethal must activate once slide speed >= 6.00 t/s');
  assert.equal(haltedCleanly, true, 'Flat runout must decelerate butt-slide cleanly to halt');
  assert.equal(player.isSlideLethal, false, 'isSlideLethal must reset once halted');

  // Verify flat runout deceleration rate matches 11.20 t/s² (expected frames ≈ flatStartVx / (11.20 * DT))
  const expectedRunoutFrames = flatStartVx / (MovementProfile.slopes.flatRunoutDecel * DT);
  assert.ok(
    Math.abs(flatDecelFrames - expectedRunoutFrames) <= 3,
    `Flat runout decel frames ${flatDecelFrames} mismatched 11.20 t/s² rate (expected ~${expectedRunoutFrames.toFixed(1)})`
  );
  assert.ok(player.pos.x > flatStartX + 2.0, 'Flat runout should glide smoothly across flat floor');

  // Slide Jump test: crouch-slide down the 26.5° slope, press Jump while > 12 t/s -> preserves slide velocity!
  player.spawn(31.8, 6.0);
  player.update(null, collision, DT);
  for (let f = 1; f <= 80; f++) {
    if (player.vel.x >= 12.2) {
      const slideVxBeforeJump = player.vel.x;
      input.applySnapshot(downJumpMask);
      player.update(input, collision, DT, room5.platforms);
      assert.equal(player.state, PlayerState.JUMP, 'Jump during butt-slide must launch Jump');
      assert.ok(
        Math.abs(player.vel.x - slideVxBeforeJump) < 0.05,
        `Slide jump must preserve slide vx (${player.vel.x.toFixed(2)} vs ${slideVxBeforeJump.toFixed(2)})`
      );
      break;
    }
    input.applySnapshot(downMask);
    player.update(input, collision, DT, room5.platforms);
  }
});

test('Stage 5 [4/6] SEMISOLIDS_100_PASS_LAND_DROP — 100/100 from below, 100/100 from above, stacked Down+Jump drop-through', () => {
  resetMovementProfile();
  const map = new TileMap(30, 20);
  map.fillRect(0, 0, 30, 2, tileTypes.SOLID);           // Ground floor top Y=2.0
  map.fillRect(6, 4, 18, 1, tileTypes.SEMISOLID);      // Lower semisolid top Y=5.0
  map.fillRect(6, 8, 18, 1, tileTypes.SEMISOLID);      // Upper semisolid top Y=9.0
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);
  const downJumpMask = InputManager.encodeActions([Actions.DOWN, Actions.JUMP]);

  // A) 100/100 pass through from below without bonking, and clear Y=5.0 cleanly
  for (let i = 0; i < 100; i++) {
    const x = 6.5 + (i / 99) * 16.0;
    input.applySnapshot(0);
    player.spawn(x, 2.0);
    player.grounded = true;
    let passedThrough = false;
    for (let f = 0; f < 35; f++) {
      input.applySnapshot(jumpMask);
      player.update(input, collision, DT);
      assert.equal(player.ceilingHit, false, `Semisolid trial ${i} triggered ceiling bonk from below`);
      if (player.pos.y > 5.5) {
        passedThrough = true;
        break;
      }
    }
    assert.equal(passedThrough, true, `Trial ${i} failed to pass through semisolid from below`);
  }

  // B) 100/100 land cleanly from above across varying heights & fall speeds
  for (let i = 0; i < 100; i++) {
    const x = 6.5 + (i / 99) * 16.0;
    const startY = 5.2 + (i % 10) * 0.25;
    player.spawn(x, startY);
    player.grounded = false;
    player.vel.y = -2.0 - (i % 20);
    let landed = false;
    for (let f = 0; f < 60; f++) {
      input.applySnapshot(0);
      player.update(input, collision, DT);
      if (player.grounded && Math.abs(player.pos.y - 5.0) < 1e-4) {
        landed = true;
        break;
      }
    }
    assert.equal(landed, true, `Trial ${i} tunneled or missed landing on semisolid top Y=5.0`);
  }

  // C) Stacked Semisolid Drop-Through: Stand on Upper (Y=9.0), press Down + Jump -> lands on Lower (Y=5.0)
  input.applySnapshot(0);
  player.spawn(12.0, 9.0);
  player.update(null, collision, DT);
  assert.equal(player.grounded, true);
  assert.equal(player.standingOnSemisolid, true);

  input.applySnapshot(downJumpMask);
  player.update(input, collision, DT);
  assert.equal(player.grounded, false, 'Down+Jump on semisolid must initiate drop-through');
  assert.ok(player.events.some((e) => e.type === 'semisolidDrop'), 'Must emit semisolidDrop event');

  let landedLower = false;
  for (let f = 0; f < 60; f++) {
    input.applySnapshot(0);
    player.update(input, collision, DT);
    if (player.grounded) {
      assert.ok(Math.abs(player.pos.y - 5.0) < 1e-4, `Expected landing on lower semisolid Y=5.0, got ${player.pos.y}`);
      landedLower = true;
      break;
    }
  }
  assert.equal(landedLower, true, 'Drop-through must drop cleanly through upper semisolid and catch lower semisolid');
});

test('Stage 5 [5/6] MOVING_PLATFORM_CARRY_AND_INHERIT — delta transfer & jump velocity inheritance', () => {
  resetMovementProfile();
  const map = new TileMap(40, 20);
  map.fillRect(0, 0, 40, 2, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);

  const horizPlat = new MovingPlatform({
    id: 'h_test',
    startX: 5.0,
    startY: 5.0,
    endX: 15.0,
    endY: 5.0,
    width: 4.0,
    height: 0.5,
    periodSec: 4.0,
    mode: 'linear',
    oneWay: true,
  });

  // Spawn standing on horizontal moving platform (top = 5.5)
  player.spawn(6.5, 5.5);
  player.update(null, collision, DT, [horizPlat]);
  assert.equal(player.grounded, true);
  assert.equal(player.ridingPlatform, horizPlat);

  const initialOffsetFromPlat = player.pos.x - horizPlat.pos.x;

  // Ride horizontally for 60 frames with ZERO input -> player stays locked at exact offset
  for (let f = 0; f < 60; f++) {
    horizPlat.update(DT);
    input.applySnapshot(0);
    player.update(input, collision, DT, [horizPlat]);
    assert.equal(player.grounded, true, `Frame ${f}: lost contact with moving platform`);
    assert.ok(
      Math.abs((player.pos.x - horizPlat.pos.x) - initialOffsetFromPlat) < 1e-5,
      `Frame ${f}: rider slipped relative to moving platform`
    );
  }

  // Jump straight up off the moving platform -> inherits platform's horizontal velocity vector
  horizPlat.update(DT);
  const expectedInheritedVx = horizPlat.vel.x; // +5.0 tiles/s (10t in 2s)
  assert.ok(Math.abs(expectedInheritedVx - 5.0) < 0.05);

  input.applySnapshot(jumpMask);
  player.update(input, collision, DT, [horizPlat]);
  assert.equal(player.state, PlayerState.JUMP);
  assert.ok(
    Math.abs(player.vel.x - expectedInheritedVx) < 0.05,
    `Jump off moving platform must inherit vx=${expectedInheritedVx.toFixed(2)}, got ${player.vel.x.toFixed(2)}`
  );

  // Vertical sinusoidal elevator carry across full cycle (270 frames)
  const vertPlat = new MovingPlatform({
    id: 'v_test',
    startX: 22.0,
    startY: 3.0,
    endX: 22.0,
    endY: 10.0,
    width: 3.5,
    height: 0.5,
    periodSec: 4.5,
    mode: 'sine',
    oneWay: true,
  });

  player.spawn(23.0, 3.5);
  player.update(null, collision, DT, [vertPlat]);
  for (let f = 0; f < 270; f++) {
    vertPlat.update(DT);
    input.applySnapshot(0);
    player.update(input, collision, DT, [vertPlat]);
    assert.equal(player.grounded, true, `Vertical elevator frame ${f} bounced off platform`);
    assert.ok(Math.abs(player.pos.y - (vertPlat.pos.y + vertPlat.height)) < 1e-5);
  }
});

test('Stage 5 [6/6] MIXED_TERRAIN_FUZZ_10000_FRAMES — zero tunneling, zero NaN, zero stuck states, deterministic', () => {
  resetMovementProfile();

  const runFuzz = () => {
    const room5 = createSlopeRamps();
    const collision = new CollisionSystem(room5.map);
    const input = new InputManager();
    const player = new PlayerController();
    player.spawn(room5.spawnX, room5.spawnY);

    let seed = 0x5f3759df;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const actionPool = [Actions.LEFT, Actions.RIGHT, Actions.RUN, Actions.DOWN, Actions.JUMP, Actions.SPIN];
    let currentMask = 0;

    for (let f = 0; f < 10000; f++) {
      // Hold realistic random combinations for 4–24 frames
      if (f % 7 === 0) {
        currentMask = 0;
        if (rand() < 0.72) currentMask |= rand() < 0.52 ? Actions.RIGHT : Actions.LEFT;
        if (rand() < 0.55) currentMask |= Actions.RUN;
        if (rand() < 0.25) currentMask |= Actions.DOWN;
        if (rand() < 0.30) currentMask |= Actions.JUMP;
        if (rand() < 0.10) currentMask |= Actions.SPIN;
      }

      for (let i = 0; i < room5.platforms.length; i++) {
        room5.platforms[i].update(DT);
      }
      input.applySnapshot(currentMask);
      player.update(input, collision, DT, room5.platforms);

      assert.ok(
        Number.isFinite(player.pos.x) &&
        Number.isFinite(player.pos.y) &&
        Number.isFinite(player.vel.x) &&
        Number.isFinite(player.vel.y),
        `Frame ${f}: NaN/Infinity detected`
      );
      assert.ok(
        player.pos.y >= 1.9999 && player.pos.y <= 30.0,
        `Frame ${f}: Tunneled out of vertical bounds (y=${player.pos.y})`
      );
      assert.ok(
        player.pos.x >= 0.9999 && player.pos.x + player.currentWidth <= 67.0001,
        `Frame ${f}: Tunneled outside level walls (x=${player.pos.x})`
      );
      assert.equal(
        collision.overlapsSolid(
          player.pos.x + 0.01,
          player.pos.y + 0.01,
          player.currentWidth - 0.02,
          player.currentHeight - 0.02
        ),
        false,
        `Frame ${f}: Stuck overlapping solid geometry at (${player.pos.x.toFixed(3)}, ${player.pos.y.toFixed(3)})`
      );
    }

    return { hash: player.stateHash, x: player.pos.x, y: player.pos.y };
  };

  const r1 = runFuzz();
  const r2 = runFuzz();
  assert.equal(r1.hash, r2.hash, '10,000-frame fuzz run must remain 100% deterministic');
  assert.equal(r1.x, r2.x);
  assert.equal(r1.y, r2.y);
});
