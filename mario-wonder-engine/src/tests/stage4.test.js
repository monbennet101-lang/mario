/**
 * Stage 4 Automated Headless Verification Suite
 * ==============================================
 * Run with: node --test src/tests/stage4.test.js
 *
 * Verifies all Stage 4 Acrobatic Move Set, Combat UI Flag & Screen Trauma exit criteria:
 *  1. SPIN_TWIRL_HOVER: +1.60 impulse, [-1.50, +1.50] clamp for exact 18f (0.30s),
 *     +0.28–0.32s airtime extension, isSpinningCombat active, 1x per airtime until landing
 *  2. WALL_SLIDE_CLAMP: Clamps descent to 4.20 (4.10–4.30) t/s when pressing into SOLID wall;
 *     releases cleanly into Fall; ignores HAZARD walls
 *  3. WALL_JUMP_AND_LOCKOUT: Launches away at vx = ±8.50 ± 0.20, vy = 16.80 ± 0.20,
 *     8f toward-wall steering lockout, 5f wall coyote window (k=1..5 pass, k=6 fail)
 *  4. WALL_SHAFT_CLIMB: Room 4 (3-tile wide Wall Shaft) chain climb gains >= 12 vertical tiles in < 7s
 *  5. GROUND_POUND_PHASES: Rejects < 1.0t clearance; 10f frozen windup; -28.00 t/s dive;
 *     groundPoundImpact event on landing; 10f recovery lock with buffered jump execution
 *  6. STATE_ARBITRATION_MATRIX: Rejects illegal transitions (GP during WallSlide, WallSlide during GP,
 *     Spin during WallSlide or after GP, double Spin in one airtime)
 *  7. SCREEN_TRAUMA_SHAKE: 0.65 trauma added on groundPoundImpact decays linearly to 0 in 0.40s (24f)
 *     with quadratic trauma^2 offset curve
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import { PlayerState } from '../game/player/PlayerState.js';
import ScreenShake from '../engine/camera/ScreenShake.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { createWallShaft } from '../game/levels/benchmark/BenchmarkRooms.js';

const { tileTypes } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

function makeFlatHarness(cols = 60, rows = 30, floorTopY = 4) {
  const map = new TileMap(cols, rows);
  map.fillRect(0, 0, cols, floorTopY, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(8.0, floorTopY);
  player.update(null, collision, DT);
  player.update(null, collision, DT);
  return { map, collision, input, player };
}

test('Stage 4 [1/7] SPIN_TWIRL_HOVER — exact 18f hover inside [-1.50, +1.50], +0.28–0.32s airtime, 1x per airtime', () => {
  resetMovementProfile();
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);
  const jumpSpinMask = InputManager.encodeActions([Actions.JUMP, Actions.SPIN]);

  // Baseline standing jump airtime
  const base = makeFlatHarness();
  let baseFrames = 0;
  for (let f = 1; f <= 100; f++) {
    base.input.applySnapshot(jumpMask);
    base.player.update(base.input, base.collision, DT);
    if (f > 2 && base.player.grounded) {
      baseFrames = f;
      break;
    }
  }

  // Standing jump + Spin Twirl near apex (frame 27)
  const spin = makeFlatHarness();
  let spinFrames = 0;
  let spinFrameCount = 0;
  let sawCombatFlag = false;
  const hoverVelocities = [];

  for (let f = 1; f <= 140; f++) {
    const mask = f === 27 ? jumpSpinMask : jumpMask;
    spin.input.applySnapshot(mask);
    spin.player.update(spin.input, spin.collision, DT);

    if (spin.player.state === PlayerState.SPIN_TWIRL) {
      spinFrameCount++;
      hoverVelocities.push(spin.player.vel.y);
      if (spin.player.isSpinningCombat) sawCombatFlag = true;
    }

    // Attempt illegal second spin on frame 52 while still airborne
    if (f === 52) {
      assert.equal(spin.player.grounded, false, 'Player should still be airborne at frame 52');
      spin.input.applySnapshot(jumpSpinMask);
      spin.player.update(spin.input, spin.collision, DT);
      assert.notEqual(
        spin.player.state,
        PlayerState.SPIN_TWIRL,
        'Second Spin Twirl must be blocked within same airtime'
      );
      f++;
      if (spin.player.grounded) {
        spinFrames = f;
        break;
      }
      continue;
    }

    if (f > 2 && spin.player.grounded) {
      spinFrames = f;
      break;
    }
  }

  const extensionSec = (spinFrames - baseFrames) * DT;
  assert.equal(spinFrameCount, 18, `Expected exact 18 SpinTwirl hover frames, got ${spinFrameCount}`);
  assert.equal(sawCombatFlag, true, 'isSpinningCombat must be true during Spin Twirl');
  for (const vy of hoverVelocities) {
    assert.ok(vy >= -1.5001 && vy <= 1.5001, `Hover vy=${vy} exceeded [-1.50, +1.50] clamp`);
  }
  assert.ok(
    extensionSec >= 0.28 && extensionSec <= 0.32,
    `Airtime extension ${extensionSec.toFixed(4)}s outside 0.28–0.32s`
  );

  // Landing resets hasSpunThisAirtime so Spin Twirl works on next jump
  assert.equal(spin.player.hasSpunThisAirtime, false, 'Landing must reset hasSpunThisAirtime');
  spin.input.applySnapshot(0);
  spin.player.update(spin.input, spin.collision, DT);
  spin.input.applySnapshot(jumpMask);
  spin.player.update(spin.input, spin.collision, DT);
  spin.input.applySnapshot(jumpSpinMask);
  spin.player.update(spin.input, spin.collision, DT);
  assert.equal(spin.player.state, PlayerState.SPIN_TWIRL, 'Spin Twirl should trigger again after landing');
});

test('Stage 4 [2/7] WALL_SLIDE_CLAMP — clamps descent to 4.20 t/s on SOLID wall, releases into Fall, ignores HAZARD', () => {
  resetMovementProfile();
  const map = new TileMap(30, 30);
  map.fillRect(0, 0, 30, 2, tileTypes.SOLID);
  map.fillRect(10, 2, 1, 20, tileTypes.SOLID); // Solid wall facing left at x=10
  map.fillRect(20, 2, 1, 20, tileTypes.HAZARD); // Hazard wall facing left at x=20
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();

  // Spawn high flush beside solid wall right at x = 10 - width = 9.20, falling downward
  player.spawn(10.0 - player.width, 18.0);
  player.vel.y = -12.0;

  const rightMask = InputManager.encodeActions([Actions.RIGHT]);
  for (let f = 0; f < 10; f++) {
    input.applySnapshot(rightMask);
    player.update(input, collision, DT);
  }

  assert.equal(player.state, PlayerState.WALL_SLIDE, 'Should be in WallSlide when falling and pressing toward solid wall');
  assert.ok(
    Math.abs(-player.vel.y - 4.20) <= 0.10,
    `Wall slide descent ${(-player.vel.y).toFixed(3)} t/s outside 4.10–4.30 tolerance`
  );

  // Release direction -> cleanly disengages into normal FALL
  input.applySnapshot(0);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.FALL, 'Releasing direction must disengage WallSlide into Fall');
  assert.equal(player.isWallSliding, false);

  // Hazard wall must NOT trigger WallSlide
  player.spawn(20.0 - player.width, 18.0);
  player.vel.y = -8.0;
  for (let f = 0; f < 5; f++) {
    input.applySnapshot(rightMask);
    player.update(input, collision, DT);
  }
  assert.notEqual(player.state, PlayerState.WALL_SLIDE, 'Hazard tiles must never trigger WallSlide');
});

test('Stage 4 [3/7] WALL_JUMP_AND_LOCKOUT — launch vx/vy, 8f toward-wall lockout & 5f wall coyote window', () => {
  resetMovementProfile();
  const map = new TileMap(25, 30);
  map.fillRect(0, 0, 25, 2, tileTypes.SOLID);
  map.fillRect(5, 2, 1, 20, tileTypes.SOLID); // Left wall right face = x 6.0
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();

  const leftMask = InputManager.encodeActions([Actions.LEFT]);
  const leftJumpMask = InputManager.encodeActions([Actions.LEFT, Actions.JUMP]);

  // Enter wall slide on left wall (x = 6.0)
  player.spawn(6.0, 14.0);
  player.vel.y = -5.0;
  input.applySnapshot(leftMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.WALL_SLIDE);

  // Wall Jump while holding Left + Jump -> must kick RIGHT at vx=+8.50, vy=+16.80, lock Left for 8f, AND ignore held Left until released
  input.applySnapshot(leftJumpMask);
  player.update(input, collision, DT);

  assert.equal(player.state, PlayerState.WALL_JUMP);
  assert.ok(Math.abs(player.vel.x - 8.50) <= 0.20, `Wall jump vx=${player.vel.x} != 8.50 ± 0.20`);
  assert.ok(Math.abs(player.vel.y - 16.80) <= 0.20, `Wall jump vy=${player.vel.y} != 16.80 ± 0.20`);
  assert.equal(player.wallJumpLockTimer, 8, 'Must set exact 8-frame toward-wall steering lockout');
  assert.equal(player.wallJumpHeldDirLock, -1, 'Must latch pre-held LEFT direction until released');
  assert.equal(player.facingRight, true, 'Wall jump off left wall must face right');

  // Hold LEFT continuously through the 8f lockout AND 14 extra frames: player must keep moving RIGHT and NEVER turn left
  for (let f = 1; f <= 22; f++) {
    input.applySnapshot(leftMask);
    player.update(input, collision, DT);
    assert.ok(player.vel.x > 7.0, `Frame ${f} pre-held LEFT leaked backward steering (vx=${player.vel.x})`);
    assert.equal(player.facingRight, true, `Frame ${f} must not turn left while initial LEFT hold is unbroken`);
    assert.equal(player.wallJumpHeldDirLock, -1, `Frame ${f} held-dir lock must stay active until LEFT is released`);
  }
  assert.equal(player.wallJumpLockTimer, 0, 'Timed lockout should reach 0 after 8 frames');

  // Releasing LEFT clears the held-dir lock, and then pressing LEFT immediately turns & steers left
  input.applySnapshot(0);
  player.update(input, collision, DT);
  assert.equal(player.wallJumpHeldDirLock, 0, 'Releasing LEFT must clear held-dir lock');

  const vxBeforeRepress = player.vel.x;
  input.applySnapshot(leftMask);
  player.update(input, collision, DT);
  assert.equal(player.facingRight, false, 'Fresh LEFT press after release must turn character left');
  assert.ok(player.vel.x < vxBeforeRepress - 0.1, 'Fresh LEFT press after release must steer back toward wall');

  // Key-overlap test: holding LEFT at jump, then pressing RIGHT while LEFT is still briefly held immediately steers RIGHT
  const rightMask = InputManager.encodeActions([Actions.RIGHT]);
  const bothDirsMask = InputManager.encodeActions([Actions.LEFT, Actions.RIGHT]);
  player.spawn(6.0, 14.0);
  player.vel.y = -5.0;
  input.applySnapshot(leftMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.WALL_SLIDE);

  input.applySnapshot(leftJumpMask);
  player.update(input, collision, DT);
  assert.equal(player.wallJumpHeldDirLock, -1);

  for (let f = 1; f <= 10; f++) {
    input.applySnapshot(leftMask);
    player.update(input, collision, DT);
  }
  // Roll finger onto RIGHT before releasing LEFT
  input.applySnapshot(bothDirsMask);
  player.update(input, collision, DT);
  assert.equal(player.facingRight, true, 'Overlapping RIGHT while pre-held LEFT is ignored must keep facing right');
  assert.ok(player.vel.x > 8.0, `Overlapping RIGHT must actively push right (vx=${player.vel.x})`);

  // Finish releasing LEFT so only RIGHT is held
  input.applySnapshot(rightMask);
  player.update(input, collision, DT);
  assert.equal(player.wallJumpHeldDirLock, 0);
  assert.equal(player.facingRight, true);

  // Mirror symmetry on RIGHT wall: holding RIGHT on right wall -> kicks LEFT and keeps pushing LEFT until RIGHT is released
  const rightMap = new TileMap(25, 30);
  rightMap.fillRect(0, 0, 25, 2, tileTypes.SOLID);
  rightMap.fillRect(18, 2, 1, 20, tileTypes.SOLID); // Right wall left face = x 18.0
  const rightCol = new CollisionSystem(rightMap);
  const rightJumpMask = InputManager.encodeActions([Actions.RIGHT, Actions.JUMP]);

  player.spawn(18.0 - player.width, 14.0);
  player.vel.y = -5.0;
  input.applySnapshot(rightMask);
  player.update(input, rightCol, DT);
  assert.equal(player.state, PlayerState.WALL_SLIDE);

  input.applySnapshot(rightJumpMask);
  player.update(input, rightCol, DT);
  assert.equal(player.state, PlayerState.WALL_JUMP);
  assert.ok(player.vel.x < -8.0, `Right wall jump must kick left (vx=${player.vel.x})`);
  assert.equal(player.facingRight, false);
  assert.equal(player.wallJumpHeldDirLock, 1);

  for (let f = 1; f <= 20; f++) {
    input.applySnapshot(rightMask);
    player.update(input, rightCol, DT);
    assert.ok(player.vel.x < -7.0, `Frame ${f} pre-held RIGHT leaked toward right wall (vx=${player.vel.x})`);
    assert.equal(player.facingRight, false, `Frame ${f} must not turn right while initial RIGHT hold is unbroken`);
  }

  // Landing on the floor while still holding RIGHT must clear wallJumpHeldDirLock so ground movement resumes
  for (let f = 0; f < 120; f++) {
    input.applySnapshot(rightMask);
    player.update(input, rightCol, DT);
    if (player.grounded) break;
  }
  assert.equal(player.grounded, true, 'Player should land on floor');
  assert.equal(player.wallJumpHeldDirLock, 0, 'Landing must clear wallJumpHeldDirLock');
  const velAtLand = player.vel.x;
  for (let f = 0; f < 15; f++) {
    input.applySnapshot(rightMask);
    player.update(input, rightCol, DT);
  }
  assert.ok(player.vel.x > velAtLand, 'Once landed, held direction must actively accelerate/skid right');
  assert.equal(player.facingRight, true, 'Once skid completes on ground, character must face right');

  // Wall Coyote Window: k=1..5 frames after releasing wall passes, k=6 fails
  const jumpOnlyMask = InputManager.encodeActions([Actions.JUMP]);
  for (let k = 1; k <= 6; k++) {
    player.spawn(6.0, 16.0);
    player.vel.y = -5.0;
    input.applySnapshot(leftMask);
    player.update(input, collision, DT);
    assert.equal(player.state, PlayerState.WALL_SLIDE);

    // Move away for (k - 1) airborne ticks (k=1 presses Jump on 1st frame off wall, k=5 on 5th, k=6 on 6th)
    for (let f = 1; f < k; f++) {
      input.applySnapshot(f === 1 ? rightMask : 0);
      player.update(input, collision, DT);
    }

    input.applySnapshot(jumpOnlyMask);
    player.update(input, collision, DT);

    if (k <= 5) {
      assert.equal(player.state, PlayerState.WALL_JUMP, `Wall coyote at k=${k}f should succeed`);
      assert.ok(Math.abs(player.vel.x - 8.50) <= 0.20);
    } else {
      assert.notEqual(player.state, PlayerState.WALL_JUMP, 'Wall coyote at k=6f must fail');
    }
  }
});

test('Stage 4 [4/7] WALL_SHAFT_CLIMB — Room 4 Wall Shaft chain climb gains >= 12 vertical tiles in < 7.0s', () => {
  resetMovementProfile();
  const room4 = createWallShaft();
  const collision = new CollisionSystem(room4.map);
  const input = new InputManager();
  const player = new PlayerController();
  player.spawn(room4.spawnX, room4.spawnY);
  player.update(null, collision, DT);
  player.update(null, collision, DT);

  const startY = player.pos.y;
  let maxY = startY;
  let wallJumps = 0;

  // Scripted human-like Room 4 wall-climb strategy:
  // 1. Run right to right wall, jump onto wall, then alternate Left/Right climbs on wall contact/slide
  let targetDir = 1; // 1 = right wall, -1 = left wall
  let jumpNextRelease = false;

  for (let f = 1; f <= 420; f++) {
    const acts = [targetDir > 0 ? Actions.RIGHT : Actions.LEFT];
    let wantJump = false;

    if (player.grounded) {
      if (player.wallContactDirection === targetDir || f === 15) {
        wantJump = true;
      }
    } else if (player.isWallSliding || (player.wallContactDirection === targetDir && player.vel.y <= 1.0)) {
      wantJump = true;
      targetDir = -targetDir; // Kick off to opposite shaft wall!
    }

    if (wantJump && !jumpNextRelease) {
      acts.push(Actions.JUMP);
      jumpNextRelease = true;
    } else {
      jumpNextRelease = false;
    }

    input.applySnapshot(InputManager.encodeActions(acts));
    player.update(input, collision, DT);

    if (player.events.some((e) => e.type === 'wallJump')) {
      wallJumps++;
    }
    if (player.pos.y > maxY) {
      maxY = player.pos.y;
    }
    if (maxY - startY >= 12.0) {
      break;
    }
  }

  const gained = maxY - startY;
  assert.ok(gained >= 12.0, `Expected >= 12 vertical tiles gained in < 7s, got ${gained.toFixed(2)}t`);
  assert.ok(wallJumps >= 3, `Expected wall-jump chain climb (>=3 kicks), got ${wallJumps}`);
});

test('Stage 4 [5/7] GROUND_POUND_PHASES — 1.0t guard, 10f windup, 28 t/s dive, impact event, 10f recovery w/ jump buffer', () => {
  resetMovementProfile();
  const { collision, input, player } = makeFlatHarness(40, 30, 4);
  const downMask = InputManager.encodeActions([Actions.DOWN]);
  const jumpMask = InputManager.encodeActions([Actions.JUMP]);

  // 1. Rejection below 1.0t clearance (at y = 4.5, floor = 4.0 -> 0.5t clearance)
  player.spawn(8.0, 4.5);
  player.grounded = false;
  player.state = PlayerState.FALL;
  input.applySnapshot(downMask);
  player.update(input, collision, DT);
  assert.notEqual(
    player.state,
    PlayerState.GROUND_POUND_WINDUP,
    'Ground Pound must be rejected with < 1.0t ground clearance'
  );

  // Clear input edge before initiating Ground Pound at y = 14.0
  input.applySnapshot(0);
  player.update(input, collision, DT);

  // 2. High initiation at y = 14.0 (10.0t clearance)
  player.spawn(8.0, 14.0);
  player.grounded = false;
  player.state = PlayerState.FALL;
  player.vel.x = 4.5;
  player.vel.y = -2.0;

  let windupFrames = 0;
  let fallFrames = 0;
  let diveSpeedReached = 0;
  let impactEvent = null;
  let recoveryFrames = 0;

  for (let f = 1; f <= 80; f++) {
    const mask = f === 1 ? downMask : (recoveryFrames === 5 ? jumpMask : 0);
    input.applySnapshot(mask);
    player.update(input, collision, DT);

    if (player.state === PlayerState.GROUND_POUND_WINDUP) {
      windupFrames++;
      assert.equal(player.vel.x, 0, 'Windup must zero horizontal velocity');
      assert.equal(player.vel.y, 0, 'Windup must zero vertical velocity');
    } else if (player.state === PlayerState.GROUND_POUND_FALL) {
      fallFrames++;
      diveSpeedReached = Math.max(diveSpeedReached, -player.vel.y);
    } else if (player.state === PlayerState.GROUND_POUND_LAND) {
      recoveryFrames++;
      if (!impactEvent) {
        impactEvent = player.events.find((e) => e.type === 'groundPoundImpact');
      }
    }

    if (recoveryFrames >= 10 && player.state === PlayerState.JUMP) {
      break;
    }
  }

  assert.equal(windupFrames, 10, `Expected 10f GroundPoundWindup, got ${windupFrames}f`);
  assert.ok(fallFrames > 0 && Math.abs(diveSpeedReached - 28.0) < 0.01, `Dive speed ${diveSpeedReached} != 28.00 t/s`);
  assert.ok(impactEvent && Math.abs(impactEvent.trauma - 0.65) < 1e-6, 'Missing groundPoundImpact event with 0.65 trauma');
  assert.equal(recoveryFrames, 10, `Expected 10f GroundPoundLand recovery, got ${recoveryFrames}f`);
  assert.equal(player.state, PlayerState.JUMP, 'Buffered Jump during Ground Pound recovery must launch right after 10f lock');
});

test('Stage 4 [6/7] STATE_ARBITRATION_MATRIX — blocks all illegal move transitions', () => {
  resetMovementProfile();
  const map = new TileMap(25, 30);
  map.fillRect(0, 0, 25, 2, tileTypes.SOLID);
  map.fillRect(5, 2, 1, 20, tileTypes.SOLID);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();

  const leftMask = InputManager.encodeActions([Actions.LEFT]);
  const leftDownMask = InputManager.encodeActions([Actions.LEFT, Actions.DOWN]);
  const leftSpinMask = InputManager.encodeActions([Actions.LEFT, Actions.SPIN]);
  const downMask = InputManager.encodeActions([Actions.DOWN]);
  const spinMask = InputManager.encodeActions([Actions.SPIN]);

  // Enter WallSlide on wall at x=6.0
  player.spawn(6.0, 16.0);
  player.vel.y = -5.0;
  input.applySnapshot(leftMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.WALL_SLIDE);

  // Rule A: No Ground Pound during WallSlide
  input.applySnapshot(leftDownMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.WALL_SLIDE, 'Ground Pound must not interrupt WallSlide');

  // Rule B: No Spin Twirl during WallSlide
  input.applySnapshot(leftSpinMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.WALL_SLIDE, 'Spin Twirl must not trigger during WallSlide');

  // Rule C & D: After Ground Pound starts, neither WallSlide nor Spin Twirl can interrupt windup or fall
  player.spawn(6.0, 18.0);
  player.grounded = false;
  player.state = PlayerState.FALL;
  input.applySnapshot(downMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.GROUND_POUND_WINDUP);

  input.applySnapshot(leftSpinMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.GROUND_POUND_WINDUP, 'Spin/WallSlide cannot interrupt GroundPoundWindup');

  // Step through remaining windup frames into GroundPoundFall
  for (let f = 0; f < 9; f++) {
    input.applySnapshot(leftMask);
    player.update(input, collision, DT);
  }
  assert.equal(player.state, PlayerState.GROUND_POUND_FALL, 'WallSlide must be blocked during GroundPoundFall');

  input.applySnapshot(spinMask);
  player.update(input, collision, DT);
  assert.equal(player.state, PlayerState.GROUND_POUND_FALL, 'Spin Twirl must be blocked during GroundPoundFall');
});

test('Stage 4 [7/7] SCREEN_TRAUMA_SHAKE — 0.65 trauma decays linearly to 0 in 0.40s with quadratic offset', () => {
  resetMovementProfile();
  const shake = new ScreenShake();
  shake.addTrauma(0.65);

  assert.ok(Math.abs(shake.trauma - 0.65) < 1e-6);
  const initialMag = Math.hypot(shake.offsetX, shake.offsetY);
  assert.ok(initialMag > 0, 'Initial trauma must produce non-zero shake offset');

  // After 12 frames (0.20s = half of 0.40s), trauma should be ~0.325 and offset magnitude scales ~0.25x (trauma^2)
  for (let f = 0; f < 12; f++) {
    shake.update(DT);
  }
  assert.ok(
    Math.abs(shake.trauma - 0.325) < 0.005,
    `Mid-decay trauma=${shake.trauma.toFixed(4)} expected ~0.325`
  );
  const maxPossibleMid = (0.325 * 0.325) * MovementProfile.groundPound.traumaMaxOffset * Math.SQRT2;
  assert.ok(Math.hypot(shake.offsetX, shake.offsetY) <= maxPossibleMid + 1e-5);

  // Remaining 12 frames -> exact 24 frames = 0.40s -> trauma = 0
  for (let f = 0; f < 12; f++) {
    shake.update(DT);
  }
  assert.equal(shake.trauma, 0, 'Trauma must decay cleanly to 0 after 0.40s (24 frames)');
  assert.equal(shake.offsetX, 0);
  assert.equal(shake.offsetY, 0);
  assert.equal(shake.angleDeg, 0);
});

test('Stage 4 [8/8] GROUNDED_SPIN_JUMP — Spin on ground plays SpinJump -> SpinAir all the way until landing & beats running Jump', () => {
  resetMovementProfile();
  const spinMask = InputManager.encodeActions([Actions.SPIN]);
  const runRightMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const runJumpMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN, Actions.JUMP]);
  const runSpinMask = InputManager.encodeActions([Actions.RIGHT, Actions.RUN, Actions.SPIN]);

  // 1. Standing grounded Spin Jump: enters SPIN_JUMP, stays spinning in SPIN_JUMP throughout airtime until touchdown
  const h1 = makeFlatHarness(80, 30, 4);
  const startY = h1.player.pos.y;
  let totalAirFrames = 0;
  let spinJumpStateFrames = 0;
  let sawMidAirTwirlSwitch = false;
  let peakSpinDy = 0;

  h1.input.applySnapshot(spinMask);
  h1.player.update(h1.input, h1.collision, DT);
  assert.equal(h1.player.state, PlayerState.SPIN_JUMP, 'Pressing Spin on ground must enter SPIN_JUMP');
  assert.equal(h1.player.isSpinJumping, true);
  assert.equal(h1.player.isSpinningCombat, true);
  assert.equal(h1.player.events.some((e) => e.type === 'spinJump'), true, 'Must emit spinJump launch event');

  for (let f = 2; f <= 120; f++) {
    // Hold for initial rise, release Spin at f=20, then press Spin again at f=25 to verify it stays SPIN_JUMP (not SPIN_TWIRL)
    const holdSpin = f < 20 || f === 25;
    h1.input.applySnapshot(holdSpin ? spinMask : 0);
    h1.player.update(h1.input, h1.collision, DT);
    peakSpinDy = Math.max(peakSpinDy, h1.player.pos.y - startY);
    if (!h1.player.grounded) {
      totalAirFrames++;
      if (h1.player.state === PlayerState.SPIN_JUMP) {
        spinJumpStateFrames++;
        assert.equal(h1.player.isSpinningCombat, true, 'isSpinningCombat must stay active throughout SpinJump airtime');
      }
      if (h1.player.state === PlayerState.SPIN_TWIRL) {
        sawMidAirTwirlSwitch = true;
      }
    } else {
      break;
    }
  }

  assert.equal(h1.player.grounded, true, 'Must land cleanly back on floor');
  assert.equal(h1.player.isSpinJumping, false, 'Landing must clear isSpinJumping');
  assert.equal(h1.player.isSpinning, false, 'Landing must clear isSpinning');
  assert.equal(sawMidAirTwirlSwitch, false, 'Grounded Spin Jump must stay SPIN_JUMP (SpinAir), not switch to SPIN_TWIRL');
  assert.equal(
    spinJumpStateFrames,
    totalAirFrames,
    `Spin Jump must remain continuously spinning all the way until landing (${spinJumpStateFrames}/${totalAirFrames})`
  );

  // 2. Running Spin Jump reaches higher & farther than a regular single running Jump
  const measureRunningMove = (useSpin) => {
    const h = makeFlatHarness(140, 30, 4);
    for (let f = 0; f < 45; f++) {
      h.input.applySnapshot(runRightMask);
      h.player.update(h.input, h.collision, DT);
    }
    const sx = h.player.pos.x;
    const sy = h.player.pos.y;
    let peak = 0;
    const mask = useSpin ? runSpinMask : runJumpMask;
    for (let f = 1; f <= 110; f++) {
      h.input.applySnapshot(mask);
      h.player.update(h.input, h.collision, DT);
      peak = Math.max(peak, h.player.pos.y - sy);
      if (f > 2 && h.player.grounded) break;
    }
    return { peak, spanX: h.player.pos.x - sx };
  };

  const regRun = measureRunningMove(false);
  const spinRun = measureRunningMove(true);
  assert.ok(
    spinRun.peak > regRun.peak + 0.45,
    `Running Spin Jump peak (${spinRun.peak.toFixed(2)}t) must propel higher than regular running Jump (${regRun.peak.toFixed(2)}t)`
  );
  assert.ok(
    spinRun.spanX > regRun.spanX + 0.50,
    `Running Spin Jump distance (${spinRun.spanX.toFixed(2)}t) must propel farther than regular running Jump (${regRun.spanX.toFixed(2)}t)`
  );

  // 3. Contrast with mid-air Spin button: spins for 18f hover (SPIN_TWIRL -> SpinAir) then stops back to FALL
  const hAir = makeFlatHarness(60, 30, 12);
  hAir.player.spawn(8.0, 22.0);
  hAir.player.grounded = false;
  hAir.player.vel.y = -1.0;
  hAir.input.applySnapshot(spinMask);
  hAir.player.update(hAir.input, hAir.collision, DT);
  assert.equal(hAir.player.state, PlayerState.SPIN_TWIRL);
  for (let f = 0; f < 22; f++) {
    hAir.input.applySnapshot(0);
    hAir.player.update(hAir.input, hAir.collision, DT);
  }
  assert.equal(hAir.player.state, PlayerState.FALL, 'Mid-air spin must spin and stop back to FALL');
  assert.equal(hAir.player.isSpinning, false);
});

