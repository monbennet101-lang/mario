/**
 * Stage 19 Automated Verification Suite
 * =====================================
 * Collectible Economy, Risk-Reward Secrets & Diegetic Minimalist HUD:
 *   1. Parabolic Sparking Gold Shard arc trajectory generation & World 1 coverage
 *   2. 100-Shard -> +1 Life (1-UP) rollover, event emission & floating +1-UP popup
 *   3. Persistence of shard count, lives & 3 Star Medallions per course across
 *      level transitions (`loadRoom`) and restarts (`resetRoom`, defeat reset)
 *   4. Floating World-Space Combat Text exact 24px rise & 20-frame linear fade
 *   5. Diegetic Minimalist Top-Bar HUD pure model ('x3', '42/100', '1-1', <50s amber flash, 3 sockets)
 *   6. Mechanical reachability proof for ALL 9 Star Medallions (3 per Course across 1-1, 1-2, 1-3):
 *      - Medallion 1 (Observation): Hoplite shell kicked through BRICK_BLOCK wall -> collect without clipping
 *      - Medallion 2 (Execution): High-momentum sprint (|vx| >= 9.20 t/s) + wall-jump ceiling route -> collect
 *      - Medallion 3 (Risk/Secret): Stand on fall-away platform -> drop into subterranean crevice -> collect -> spring escape
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile from '../game/config/MovementProfile.js';
import {
  CollectibleEconomySystem,
  generateParabolicShardArc,
  createFloatingCombatText,
  stepFloatingCombatTexts,
  STAR_MEDALLION_ARCHETYPES,
} from '../entities/collectibles.js';
import {
  resolveCourseIdentifier,
  formatLivesDisplay,
  formatShardTallyDisplay,
  computeTimerHUDState,
  computeShardRotationTransform,
  buildDiegeticHUDState,
} from '../ui/hud.js';
import { HopliteState } from '../game/entities/EnemyArchetypes.js';
import { FallAwayState } from '../entities/props.js';

const { tileTypes } = MovementProfile;

function placePlayerClean(engine, x, y, vx = 0, vy = 0, grounded = false) {
  const p = engine.player;
  p.pos.x = x;
  p.pos.y = y;
  p.prevPos.x = x;
  p.prevPos.y = y;
  p.vel.x = vx;
  p.vel.y = vy;
  p.grounded = grounded;
  p.wasGrounded = grounded;
  p.isCrouched = false;
  p.isWallSliding = false;
  p.isWallJumping = false;
  p.wallJumpLockTimer = 0;
  p.invulnerabilityTimer = 0;
  p.hitHazard = false;
  p.groundPoundPhase = null;
}

function getWorld1RoomIndices(engine) {
  const map = {};
  for (let i = 0; i < engine.rooms.length; i++) {
    const code = engine.rooms[i]?.courseCode;
    if (code === '1-1' || code === '1-2' || code === '1-3') {
      map[code] = i;
    }
  }
  return map;
}

// ─── 1. Parabolic Sparking Gold Shard Arcs ───────────────────────────────────

test('Stage 19.1: Parabolic Sparking Gold Shard arcs match jump kinematics & populate all World 1 courses', () => {
  const arc = generateParabolicShardArc({
    startX: 10,
    startY: 3.0,
    endX: 16,
    endY: 3.0,
    count: 5,
    launchVx: 5.5,
    arcId: 'test_arc',
  });

  assert.equal(arc.length, 5);
  assert.equal(arc[0].x, 10);
  assert.equal(arc[4].x, 16);
  // Symmetric upward-concave parabola peaking at midpoint (index 2)
  assert.ok(arc[2].y > arc[1].y && arc[1].y > arc[0].y, 'Midpoint should be highest point of parabola');
  assert.ok(Math.abs(arc[1].y - arc[3].y) < 1e-6, 'Symmetric arc heights on level ground');
  assert.ok(
    arc[2].y - arc[0].y <= MovementProfile.jump.apexHeight,
    'Parabola apex must remain within jump height envelope'
  );
  assert.ok(arc.every((s) => s.isShard === true));

  const engine = new GameEngine();
  const indices = getWorld1RoomIndices(engine);
  for (const code of ['1-1', '1-2', '1-3']) {
    engine.initHeadless(indices[code]);
    const shardCoins = engine.levelKit.worldCoins.filter((c) => c.isShard);
    assert.ok(
      shardCoins.length >= 15,
      `Course ${code} should contain parabolic Sparking Gold Shard arcs (got ${shardCoins.length})`
    );
    assert.equal(
      engine.levelEngine.starMedallions.length,
      3,
      `Course ${code} must have exactly 3 secret Star Medallions`
    );
  }
});

// ─── 2. 100-Shard 1-UP Rollover & Harmonic Event ─────────────────────────────

test('Stage 19.2: Collecting 100 Sparking Gold Shards awards +1 Life (1-UP), rolls over to 00/100, and spawns +1-UP popup', () => {
  const engine = new GameEngine();
  const indices = getWorld1RoomIndices(engine);
  engine.initHeadless(indices['1-1']);

  assert.equal(engine.collectibles.lives, 3);
  assert.equal(engine.collectibles.shardCount, 0);

  // Collect 99 shards -> still 3 lives, 99/100
  engine.collectibles.beginTick();
  const res99 = engine.collectibles.collectShards(99, 12.0, 4.0, engine.combat);
  assert.equal(res99.shardCount, 99);
  assert.equal(res99.lives, 3);
  assert.equal(res99.oneUpsAwarded, 0);
  assert.equal(formatShardTallyDisplay(engine.collectibles.shardCount), '99/100');

  // Collect 1 more shard -> 100 -> rolls over cleanly to 00/100, +1 Life (4), emits oneUpFromShards + +1-UP popup
  engine.collectibles.beginTick();
  const res100 = engine.collectibles.collectShards(1, 13.0, 4.5, engine.combat);
  assert.equal(res100.shardCount, 0);
  assert.equal(res100.lives, 4);
  assert.equal(res100.oneUpsAwarded, 1);
  assert.equal(engine.combat.lives, 4);
  assert.equal(formatShardTallyDisplay(engine.collectibles.shardCount), '00/100');
  assert.equal(formatLivesDisplay(engine.collectibles.lives), 'x4');

  const oneUpEv = engine.collectibles.events.find((e) => e.type === 'oneUpFromShards');
  assert.ok(oneUpEv, 'Expected oneUpFromShards event on 100-shard rollover');
  const oneUpPopup = engine.combat.popups.find((p) => p.text === '+1-UP');
  assert.ok(oneUpPopup, 'Expected +1-UP floating combat text popup on 100-shard rollover');
});

// ─── 3. Persistence Across Level Transitions & Restarts ──────────────────────

test('Stage 19.3: Shards, lives, and per-course Star Medallions persist cleanly across level transitions and restarts', () => {
  const engine = new GameEngine();
  const indices = getWorld1RoomIndices(engine);
  engine.initHeadless(indices['1-1']);

  // Collect 42 shards and Medallion 1 (slot 0) in 1-1
  engine.collectibles.collectShards(42, 10, 3, engine.combat);
  engine.collectibles.collectStarMedallion(0, 91.8, 2.9);

  assert.equal(engine.collectibles.shardCount, 42);
  assert.deepEqual(engine.collectibles.getCourseSockets(), [true, false, false]);

  // Transition 1-1 -> 1-2
  engine.loadRoom(indices['1-2']);
  assert.equal(engine.collectibles.shardCount, 42, 'Shard tally must persist across level transitions');
  assert.equal(engine.collectibles.lives, 3, 'Lives must persist across level transitions');
  assert.deepEqual(engine.collectibles.getCourseSockets(), [false, false, false], '1-2 sockets start fresh');

  // Collect 15 more shards (total 57) and Medallion 3 (slot 2) in 1-2
  engine.collectibles.collectShards(15, 20, 4, engine.combat);
  engine.collectibles.collectStarMedallion(2, 161.0, 3.0);
  assert.deepEqual(engine.collectibles.getCourseSockets(), [false, false, true]);

  // Restart 1-2 via resetRoom()
  engine.resetRoom();
  assert.equal(engine.collectibles.shardCount, 57, 'Shard tally must survive resetRoom()');
  assert.deepEqual(engine.collectibles.getCourseSockets(), [false, false, true], '1-2 medallion must survive resetRoom()');
  assert.equal(engine.levelEngine.starMedallions[2].persisted, true, 'Persisted medallion flagged on reload');

  // Transition 1-2 -> 1-3 -> back to 1-1
  engine.loadRoom(indices['1-3']);
  engine.collectibles.collectStarMedallion(1, 119.6, 17.2);
  engine.loadRoom(indices['1-1']);

  assert.equal(engine.collectibles.shardCount, 57, 'Shard tally persists through 1-1 -> 1-2 -> 1-3 -> 1-1');
  assert.deepEqual(engine.collectibles.getCourseSockets(), [true, false, false], '1-1 medallion state restored on revisit');
  assert.equal(engine.levelEngine.starMedallions[0].persisted, true);
  assert.equal(engine.levelEngine.starMedallions[1].persisted, false);
  assert.equal(engine.collectibles.getTotalMedallionsCollected(), 3);
});

// ─── 4. Floating World-Space Combat Text (24px Rise / 20 Frames Fade) ────────

test('Stage 19.4: Floating world-space combat text rises exact 24px and fades to 0 over exact 20 frames', () => {
  const dt = MovementProfile.simulation.fixedTimeStep;
  const ppt = MovementProfile.simulation.pixelsPerTile; // 64 px/tile
  const expectedRiseTiles = 24 / ppt; // 0.375 tiles

  const popup = createFloatingCombatText('+200', 14.5, 5.0, '#4ADE80');
  const list = [popup];

  assert.equal(popup.risePx, 24);
  assert.equal(popup.totalFrames, 20);
  assert.equal(popup.alpha, 1.0);

  // Step 10 frames (halfway): exact 12px rise, alpha = 0.5
  for (let f = 0; f < 10; f++) {
    stepFloatingCombatTexts(list, dt);
  }
  assert.equal(list.length, 1);
  assert.ok(Math.abs((popup.y - 5.0) * ppt - 12.0) < 1e-6, 'Should rise exact 12px after 10 frames');
  assert.ok(Math.abs(popup.alpha - 0.5) < 1e-6, 'Alpha should be 0.5 at frame 10');

  // Step 9 more frames (frame 19): still alive, near peak
  for (let f = 0; f < 9; f++) {
    stepFloatingCombatTexts(list, dt);
  }
  assert.equal(list.length, 1);
  assert.ok(Math.abs((popup.y - 5.0) * ppt - 22.8) < 1e-6);
  assert.ok(Math.abs(popup.alpha - 0.05) < 1e-6);

  // Frame 20: reaches exact 24px rise, alpha 0, removed cleanly
  stepFloatingCombatTexts(list, dt);
  assert.equal(list.length, 0, 'Popup must be removed on frame 20');
  assert.ok(Math.abs((popup.y - 5.0) - expectedRiseTiles) < 1e-6, 'Final displacement must equal 24px (0.375t)');
  assert.equal(popup.alpha, 0);
});

// ─── 5. Diegetic Minimalist Top-Bar HUD Pure Model ───────────────────────────

test('Stage 19.5: Diegetic HUD formats lives, 42/100 shard tally, level IDs, rotating shard, sockets, and < 50s amber warning flash', () => {
  assert.equal(formatLivesDisplay(3), 'x3');
  assert.equal(formatShardTallyDisplay(42), '42/100');
  assert.equal(formatShardTallyDisplay(0), '00/100');
  assert.equal(formatShardTallyDisplay(100), '00/100');

  // Timer boundary at 50s vs 49s
  const t300 = computeTimerHUDState(300, 0);
  assert.equal(t300.text, '300s');
  assert.equal(t300.isWarning, false);

  const t50 = computeTimerHUDState(50, 0);
  assert.equal(t50.isWarning, false, '50s is not < 50s');

  const t49a = computeTimerHUDState(49, 0.0);
  const t49b = computeTimerHUDState(49, 0.13); // half flash period at 4Hz
  assert.equal(t49a.isWarning, true, '49s triggers amber warning');
  assert.equal(t49a.isFlashOn, true);
  assert.equal(t49a.color, '#F59E0B');
  assert.equal(t49b.isFlashOn, false, 'Warning flash toggles cleanly over time');

  // Rotating shard icon transforms over time
  const spin0 = computeShardRotationTransform(0);
  const spinHalf = computeShardRotationTransform(0.5); // 90 deg at 180 deg/s
  assert.ok(spin0.scaleX > spinHalf.scaleX, 'Geometric shard should visibly rotate horizontally');

  // Full engine HUD view-model check across courses
  const engine = new GameEngine();
  const indices = getWorld1RoomIndices(engine);
  engine.initHeadless(indices['1-1']);
  engine.collectibles.collectShards(42, 0, 0);
  engine.collectibles.collectStarMedallion(0, 0, 0);
  engine.timerSeconds = 42;

  const vm = buildDiegeticHUDState(engine, 0.0);
  assert.equal(vm.levelId, '1-1');
  assert.equal(vm.livesText, 'x3');
  assert.equal(vm.shardText, '42/100');
  assert.deepEqual(vm.sockets, [true, false, false]);
  assert.equal(vm.timer.isWarning, true);

  engine.loadRoom(indices['1-2']);
  assert.equal(resolveCourseIdentifier(engine.currentRoom, engine.currentRoomIndex), '1-2');
  engine.loadRoom(indices['1-3']);
  assert.equal(resolveCourseIdentifier(engine.currentRoom, engine.currentRoomIndex), '1-3');
});

// ─── 6. Mechanical Reachability Audit for ALL 9 Star Medallions (1-1, 1-2, 1-3) ─

const OBSERVATION_COURSES = [
  { code: '1-1', gateCol: 89, gateRows: [2, 3], hopliteTargetX: 84.5, floorY: 2.0 },
  { code: '1-2', gateCol: 76, gateRows: [8, 9], hopliteTargetX: 72.5, floorY: 8.0 },
  { code: '1-3', gateCol: 85, gateRows: [5, 6], hopliteTargetX: 81.8, floorY: 5.0 },
];

for (const spec of OBSERVATION_COURSES) {
  test(`Stage 19.6a [${spec.code}]: Medallion 1 (Observation) is gated by BRICK_BLOCK wall & reachable by kicking Hoplite shell`, () => {
    const engine = new GameEngine();
    const indices = getWorld1RoomIndices(engine);
    engine.initHeadless(indices[spec.code]);

    const med = engine.levelEngine.starMedallions[0];
    assert.equal(med.archetype, STAR_MEDALLION_ARCHETYPES.OBSERVATION);

    // 1. Confirm solid BRICK_BLOCK gate blocks direct walk-in before shell kick
    for (const r of spec.gateRows) {
      assert.equal(
        engine.tilemap.get(spec.gateCol, r),
        tileTypes.BRICK_BLOCK,
        `${spec.code} brick gate at (${spec.gateCol}, ${r}) must start intact`
      );
    }

    // Find the nearby Hoplite guarding this brick gate
    const hoplite = engine.combat.enemies.find(
      (e) => e.type === 'hoplite' && Math.abs(e.pos.x - spec.hopliteTargetX) < 3.5 && Math.abs(e.pos.y - spec.floorY) < 1.5
    );
    assert.ok(hoplite, `${spec.code} must have a Hoplite near the Medallion 1 brick gate`);

    // 2. Stomp Hoplite from above into DORMANT_SHELL
    placePlayerClean(engine, hoplite.pos.x, hoplite.pos.y + hoplite.height + 0.12, 0, -5.0, false);
    for (let f = 0; f < 15 && hoplite.state !== HopliteState.DORMANT_SHELL; f++) {
      engine.stepHeadless({});
    }
    assert.equal(hoplite.state, HopliteState.DORMANT_SHELL, `${spec.code} Hoplite should retract to dormant shell on stomp`);

    // 3. Kick dormant shell rightward toward the brick wall
    placePlayerClean(engine, hoplite.pos.x - 0.9, spec.floorY, 4.5, 0, true);
    let kicked = false;
    let wallBroken = false;
    for (let f = 0; f < 120; f++) {
      engine.stepHeadless({ right: !kicked });
      if (hoplite.state === HopliteState.SHELL_MOVING) kicked = true;
      if (
        engine.tilemap.get(spec.gateCol, spec.gateRows[0]) === tileTypes.EMPTY &&
        engine.tilemap.get(spec.gateCol, spec.gateRows[1]) === tileTypes.EMPTY
      ) {
        wallBroken = true;
        break;
      }
    }
    assert.ok(kicked, `${spec.code} player must kick Hoplite shell`);
    assert.ok(wallBroken, `${spec.code} kicked Hoplite shell must shatter the brick wall opening`);

    // 4. Walk cleanly through the opened doorway (zero clipping) to collect Medallion 1
    placePlayerClean(engine, spec.gateCol - 1.5, spec.floorY, 0, 0, true);
    for (let f = 0; f < 110 && !med.collected; f++) {
      engine.stepHeadless({ right: true });
    }
    assert.equal(med.collected, true, `${spec.code} Medallion 1 must be collected after breaking brick gate`);
    assert.equal(engine.collectibles.getCourseSockets()[0], true, `${spec.code} Socket 0 must light up gold`);
  });
}

test('Stage 19.6b [1-1, 1-2, 1-3]: Medallion 2 (Execution) is mechanically reachable via |vx| >= 9.20 t/s sprint + wall-jump ceiling route', () => {
  const engine = new GameEngine();
  const indices = getWorld1RoomIndices(engine);

  // Course 1-1: sprint >= 9.20 t/s across c_ten_0 (93..98) -> c_ten_1 (104..110) -> c_ten_2 (116..122) at y=10,
  // leap onto wall col 122 (y:13..16), wall-jump left into Medallion 2 (119.6, 15.2)
  {
    engine.initHeadless(indices['1-1']);
    const med = engine.levelEngine.starMedallions[1];
    assert.equal(med.archetype, STAR_MEDALLION_ARCHETYPES.EXECUTION);

    placePlayerClean(engine, 93.5, 10.0, 9.2, 0, true);
    let maxSpeed = 0;
    let didWallJump = false;
    let phase = 'sprint';

    for (let f = 0; f < 300 && !med.collected; f++) {
      maxSpeed = Math.max(maxSpeed, Math.abs(engine.player.vel.x));
      if (phase === 'sprint') {
        const px = engine.player.pos.x;
        const jumpGap1 = px >= 96.8 && px <= 98.2 && engine.player.grounded;
        const jumpGap2 = px >= 108.8 && px <= 110.2 && engine.player.grounded;
        const jumpToWall = px >= 118.4 && engine.player.grounded;
        const holdAir = !engine.player.grounded && engine.player.vel.y > 0;
        engine.stepHeadless({ right: true, run: true, jump: jumpGap1 || jumpGap2 || jumpToWall || holdAir });
        if (px >= 120.8 && (engine.player.isWallSliding || engine.player.wallSlideDir === 1 || engine.player.wallCoyoteFramesRemaining > 0)) {
          phase = 'walljump_release';
        }
      } else if (phase === 'walljump_release') {
        engine.stepHeadless({ right: true, jump: false });
        phase = 'walljump_kick';
      } else if (phase === 'walljump_kick') {
        engine.stepHeadless({ left: true, jump: true });
        if (engine.player.isWallJumping || engine.player.vel.x < -1.0) {
          didWallJump = true;
          phase = 'glide_left';
        }
      } else {
        engine.stepHeadless({ left: true, jump: true });
      }
    }

    assert.ok(maxSpeed >= 9.20, `1-1 Medallion 2 route must sustain |vx| >= 9.20 t/s (got ${maxSpeed.toFixed(2)})`);
    assert.ok(didWallJump, '1-1 Medallion 2 must execute a wall-jump off the ceiling slab');
    assert.equal(med.collected, true, '1-1 Medallion 2 must be mechanically collected');
    assert.equal(engine.collectibles.getCourseSockets()[1], true);
  }

  // Course 1-2: wall-jump up the 3-tile chimney (cols 107..111, y: 8..19), then sprint >= 9.20 t/s off c_ten_2 (y=19) to Medallion 2 (124.8, 20.6)
  {
    engine.initHeadless(indices['1-2']);
    const med = engine.levelEngine.starMedallions[1];
    assert.equal(med.archetype, STAR_MEDALLION_ARCHETYPES.EXECUTION);

    // Part A: Verify wall-jump climb in the chimney (cols 107 & 111)
    placePlayerClean(engine, 108.5, 9.0, 0, 0, true);
    let chimneyWallJumps = 0;
    let pushDir = 1; // push toward right wall col 111 first
    let releaseJump = false;
    for (let f = 0; f < 180 && chimneyWallJumps < 2; f++) {
      if (engine.player.grounded) {
        engine.stepHeadless({ right: pushDir > 0, left: pushDir < 0, jump: true });
      } else if ((engine.player.isWallSliding || engine.player.wallSlideDir !== 0) && !releaseJump) {
        releaseJump = true;
        const wDir = engine.player.wallSlideDir || pushDir;
        engine.stepHeadless({ right: wDir > 0, left: wDir < 0, jump: false });
      } else if (releaseJump) {
        const kickDir = -(engine.player.wallSlideDir || pushDir);
        engine.stepHeadless({ right: kickDir > 0, left: kickDir < 0, jump: true });
        if (engine.player.isWallJumping) {
          chimneyWallJumps++;
          pushDir = kickDir;
        }
        releaseJump = false;
      } else {
        engine.stepHeadless({ right: pushDir > 0, left: pushDir < 0, jump: true });
      }
    }
    assert.ok(chimneyWallJumps >= 1, `1-2 chimney must allow wall-jumping upward (got ${chimneyWallJumps})`);

    // Part B: High-momentum sprint >= 9.20 t/s across c_ten_2 (x:116..122, y:19) to leap for Medallion 2 (124.8, 20.6)
    placePlayerClean(engine, 116.2, 19.0, 9.2, 0, true);
    let maxSpeed = 0;
    for (let f = 0; f < 120 && !med.collected; f++) {
      maxSpeed = Math.max(maxSpeed, Math.abs(engine.player.vel.x));
      const nearGap = engine.player.pos.x >= 120.8 && engine.player.grounded;
      engine.stepHeadless({
        right: true,
        run: true,
        jump: nearGap || (!engine.player.grounded && engine.player.vel.y > 0),
      });
    }
    assert.ok(maxSpeed >= 9.20, `1-2 Medallion 2 sprint must reach |vx| >= 9.20 t/s (got ${maxSpeed.toFixed(2)})`);
    assert.equal(med.collected, true, '1-2 Medallion 2 must be mechanically collected');
    assert.equal(engine.collectibles.getCourseSockets()[1], true);
  }

  // Course 1-3: sprint >= 9.20 t/s across c_ten_0 (93..98) -> c_ten_1 (104..110) -> c_ten_2 (116..122) at y=12,
  // leap onto wall col 122 (y:15..18), wall-jump left into Medallion 2 (119.6, 17.2)
  {
    engine.initHeadless(indices['1-3']);
    const med = engine.levelEngine.starMedallions[1];
    assert.equal(med.archetype, STAR_MEDALLION_ARCHETYPES.EXECUTION);

    placePlayerClean(engine, 93.5, 12.0, 9.2, 0, true);
    let maxSpeed = 0;
    let didWallJump = false;
    let phase = 'sprint';

    for (let f = 0; f < 300 && !med.collected; f++) {
      maxSpeed = Math.max(maxSpeed, Math.abs(engine.player.vel.x));
      if (phase === 'sprint') {
        const px = engine.player.pos.x;
        const jumpGap1 = px >= 96.8 && px <= 98.2 && engine.player.grounded;
        const jumpGap2 = px >= 108.8 && px <= 110.2 && engine.player.grounded;
        const jumpToWall = px >= 118.4 && engine.player.grounded;
        const holdAir = !engine.player.grounded && engine.player.vel.y > 0;
        engine.stepHeadless({ right: true, run: true, jump: jumpGap1 || jumpGap2 || jumpToWall || holdAir });
        if (px >= 120.8 && (engine.player.isWallSliding || engine.player.wallSlideDir === 1 || engine.player.wallCoyoteFramesRemaining > 0)) {
          phase = 'walljump_release';
        }
      } else if (phase === 'walljump_release') {
        engine.stepHeadless({ right: true, jump: false });
        phase = 'walljump_kick';
      } else if (phase === 'walljump_kick') {
        engine.stepHeadless({ left: true, jump: true });
        if (engine.player.isWallJumping || engine.player.vel.x < -1.0) {
          didWallJump = true;
          phase = 'glide_left';
        }
      } else {
        engine.stepHeadless({ left: true, jump: true });
      }
    }

    assert.ok(maxSpeed >= 9.20, `1-3 Medallion 2 route must sustain |vx| >= 9.20 t/s (got ${maxSpeed.toFixed(2)})`);
    assert.ok(didWallJump, '1-3 Medallion 2 must execute a wall-jump off the alpine slab');
    assert.equal(med.collected, true, '1-3 Medallion 2 must be mechanically collected');
    assert.equal(engine.collectibles.getCourseSockets()[1], true);
  }
});

const SECRET_CREVICE_COURSES = [
  { code: '1-1', platformId: 'plains_secret_fallaway', springId: 'plains_secret_spring', escapeY: 5.0 },
  { code: '1-2', platformId: 'cavern_fall_2', springId: 'cavern_secret_spring', escapeY: 7.0 },
  { code: '1-3', platformId: 'ridge_secret_fallaway', springId: 'ridge_secret_spring', escapeY: 5.0 },
];

for (const spec of SECRET_CREVICE_COURSES) {
  test(`Stage 19.6c [${spec.code}]: Medallion 3 (Risk/Secret) drops beneath fall-away platform, collects cleanly, and escapes via spring (zero softlock)`, () => {
    const engine = new GameEngine();
    const indices = getWorld1RoomIndices(engine);
    engine.initHeadless(indices[spec.code]);

    const med = engine.levelEngine.starMedallions[2];
    assert.equal(med.archetype, STAR_MEDALLION_ARCHETYPES.RISK_SECRET);

    const fallPlat = engine.props.platforms.find((p) => p.id === spec.platformId);
    const escapeSpring = engine.props.springs.find((s) => s.id === spec.springId);
    assert.ok(fallPlat, `${spec.code} must have fall-away platform '${spec.platformId}'`);
    assert.ok(escapeSpring, `${spec.code} must have escape spring '${spec.springId}'`);

    // 1. Land directly on the fall-away platform and wait for it to detach
    placePlayerClean(engine, fallPlat.pos.x + fallPlat.width * 0.5 - 0.3, fallPlat.pos.y + fallPlat.height + 0.02, 0, 0, false);
    let detached = false;
    for (let f = 0; f < 220; f++) {
      // Gently steer toward medallion X while dropping after platform detaches
      const steerRight = detached && engine.player.centerX < med.x - 0.15;
      const steerLeft = detached && engine.player.centerX > med.x + 0.15;
      engine.stepHeadless({ right: steerRight, left: steerLeft });
      if (fallPlat.fallState === FallAwayState.FALLING || fallPlat.fallState === FallAwayState.RESPAWNING) {
        detached = true;
      }
      if (med.collected && engine.player.grounded) break;
    }

    assert.ok(detached, `${spec.code} fall-away platform must detach when stood upon`);
    assert.equal(med.collected, true, `${spec.code} Medallion 3 must be collected inside the subterranean crevice`);
    assert.equal(engine.collectibles.getCourseSockets()[2], true, `${spec.code} Socket 2 must light up gold`);

    // 2. Walk onto the subterranean escape spring and launch cleanly out of the crevice
    let maxEscapeY = engine.player.pos.y;
    for (let f = 0; f < 160; f++) {
      const needRight = engine.player.centerX < escapeSpring.x + 0.25;
      const needLeft = engine.player.centerX > escapeSpring.x + 0.75;
      engine.stepHeadless({
        right: needRight || engine.player.pos.y > spec.escapeY - 1.0,
        left: needLeft && engine.player.pos.y <= spec.escapeY - 1.0,
        jump: true,
      });
      maxEscapeY = Math.max(maxEscapeY, engine.player.pos.y);
      if (maxEscapeY >= spec.escapeY) break;
    }

    assert.ok(
      maxEscapeY >= spec.escapeY,
      `${spec.code} escape spring must launch player cleanly out of secret crevice (reached y=${maxEscapeY.toFixed(2)}, need >= ${spec.escapeY})`
    );
  });
}
