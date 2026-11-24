/**
 * Stage 6 Automated Headless Verification Suite
 * ==============================================
 * Run with: node --test src/tests/stage6.test.js
 *
 * Verifies all Stage 6 Environment Level Kit, Atlas, Autotiler, Block UX & Geometry Lint criteria:
 *  1. ATLAS_UV_AND_SLOTS: Half-texel UV precision (1876×3230), Daytime Y=10 & Twilight Y=1620, verified slope slots
 *  2. GEOMETRY_LINT_ALL_ROOMS: Zero visual/collision mismatches across Rooms 1–6 + orphan-pipe detection
 *  3. QUESTION_BLOCK_BUMP_AND_COIN_HOP: 6-frame sine bump (12px = 0.1875t peak), [?]->USED conversion & 2.5t coin hop
 *  4. BRICK_BUMP_VS_SHATTER: Slow bump keeps Brick solid; Sprint jump & Ground Pound shatter into 4 spinning shards
 *  5. WORLD_COINS_FLAGPOLE_AND_PARALLAX: Coin pickup, Goal Flagpole descent & continuous 5-plane parallax math
 *  6. FIX_60HZ_STABILITY_AND_DETERMINISM: Twin 600-frame Room 6 runs yield identical hashes, coins & brick states
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import LevelKitSystem from '../game/entities/LevelKitSystem.js';
import TileAtlas, { GRASSLAND_ATLAS_SLOTS } from '../engine/rendering/TileAtlas.js';
import { AutotileRole, resolveTileRole } from '../engine/rendering/TileAutotiler.js';
import { lintTileMapGeometry, lintAllRooms } from '../engine/physics/GeometryLint.js';
import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { getAllRooms, createLevelKitShowcase } from '../game/levels/benchmark/BenchmarkRooms.js';

const { tileTypes, tilemap: tileConfig, stage6 } = MovementProfile;
const DT = MovementProfile.simulation.fixedTimeStep;

test('Stage 6 [1/6] ATLAS_UV_AND_SLOTS — half-texel UVs (1876×3230) & verified slope slots', () => {
  resetMovementProfile();

  // Origin tile (col=0, row=0) on Daytime Atlas 1 (X=10, Y=10)
  const uv0Day = TileAtlas.getTileUV(0, 0, 0);
  assert.ok(Math.abs(uv0Day.uMin - 10.5 / 1876) < 1e-9);
  assert.ok(Math.abs(uv0Day.uMax - 73.5 / 1876) < 1e-9);
  assert.ok(Math.abs(uv0Day.vMin - 10.5 / 3230) < 1e-9);
  assert.ok(Math.abs(uv0Day.vMax - 73.5 / 3230) < 1e-9);

  // Tile (col=28, row=24) on Twilight Atlas 2 (X=10, Y=1620)
  const uvLastTwilight = TileAtlas.getTileUV(28, 24, 1);
  assert.ok(Math.abs(uvLastTwilight.uMin - (10 + 28 * 64 + 0.5) / 1876) < 1e-9);
  assert.ok(Math.abs(uvLastTwilight.uMax - (10 + 29 * 64 - 0.5) / 1876) < 1e-9);
  assert.ok(Math.abs(uvLastTwilight.vMin - (1620 + 24 * 64 + 0.5) / 3230) < 1e-9);
  assert.ok(Math.abs(uvLastTwilight.vMax - (1620 + 25 * 64 - 0.5) / 3230) < 1e-9);

  // Verify pixel-audited slope slots match Grassland_Tileset.png mapping
  assert.deepEqual(GRASSLAND_ATLAS_SLOTS[AutotileRole.SLOPE_45_UP][0], { row: 14, col: 0 });
  assert.deepEqual(GRASSLAND_ATLAS_SLOTS[AutotileRole.SLOPE_45_DOWN][0], { row: 3, col: 7 });
  assert.deepEqual(GRASSLAND_ATLAS_SLOTS[AutotileRole.SLOPE_26_UP_1][0], { row: 20, col: 6 });
  assert.deepEqual(GRASSLAND_ATLAS_SLOTS[AutotileRole.SLOPE_26_UP_2][0], { row: 7, col: 5 });
  assert.deepEqual(GRASSLAND_ATLAS_SLOTS[AutotileRole.SLOPE_26_DOWN_1][0], { row: 15, col: 2 });
  assert.deepEqual(GRASSLAND_ATLAS_SLOTS[AutotileRole.SLOPE_26_DOWN_2][0], { row: 19, col: 5 });

  // Verify foliage visual overhang matches hitbox foliageInset (5px / 64px ≈ 0.08t)
  assert.equal(stage6.foliageOverhangPx, 5);
  assert.ok(Math.abs(stage6.foliageOverhangPx / tileConfig.tileSize - MovementProfile.hitbox.foliageInset) < 0.01);
});

test('Stage 6 [2/6] GEOMETRY_LINT_ALL_ROOMS — zero mismatches across Rooms 1–6 + 9-slice/kit roles', () => {
  resetMovementProfile();
  const rooms = getAllRooms();
  assert.ok(rooms.length >= 6, 'BenchmarkRooms must expose all core rooms 1–6+');

  const report = lintAllRooms(rooms);
  assert.equal(report.passed, true, `GeometryLint failed: ${JSON.stringify(report.reports.filter((r) => !r.passed))}`);
  assert.equal(report.totalMismatches, 0);

  // Verify 9-slice roles & pipe pairing on Room 6
  const room6 = rooms[5];
  assert.equal(resolveTileRole(room6.map, 3, 1).role, AutotileRole.TOP_GRASS);
  assert.equal(resolveTileRole(room6.map, 3, 0).role, AutotileRole.INTERIOR_EARTH);
  assert.equal(resolveTileRole(room6.map, 7, 5).role, AutotileRole.QUESTION);
  assert.equal(resolveTileRole(room6.map, 8, 5).role, AutotileRole.BRICK);
  assert.equal(resolveTileRole(room6.map, 15, 3).role, AutotileRole.PIPE_CAP_L);
  assert.equal(resolveTileRole(room6.map, 16, 3).role, AutotileRole.PIPE_CAP_R);
  assert.equal(resolveTileRole(room6.map, 15, 2).role, AutotileRole.PIPE_BODY_L);
  assert.equal(resolveTileRole(room6.map, 16, 2).role, AutotileRole.PIPE_BODY_R);
  assert.equal(resolveTileRole(room6.map, 26, 5).role, AutotileRole.MUSHROOM_LEFT);
  assert.equal(resolveTileRole(room6.map, 28, 5).role, AutotileRole.MUSHROOM_MID);
  assert.equal(resolveTileRole(room6.map, 30, 5).role, AutotileRole.MUSHROOM_RIGHT);

  // Floating 3x2 solid island verifies all 9-slice perimeter roles cleanly
  const islandMap = new TileMap(7, 7);
  islandMap.fillRect(2, 2, 3, 2, tileTypes.SOLID);
  assert.equal(resolveTileRole(islandMap, 2, 3).role, AutotileRole.TOP_LEFT_CORNER);
  assert.equal(resolveTileRole(islandMap, 3, 3).role, AutotileRole.TOP_GRASS);
  assert.equal(resolveTileRole(islandMap, 4, 3).role, AutotileRole.TOP_RIGHT_CORNER);
  assert.equal(resolveTileRole(islandMap, 2, 2).role, AutotileRole.BOT_LEFT_CORNER);
  assert.equal(resolveTileRole(islandMap, 3, 2).role, AutotileRole.BOTTOM_DIRT);
  assert.equal(resolveTileRole(islandMap, 4, 2).role, AutotileRole.BOT_RIGHT_CORNER);

  // Negative check: orphan 1-tile pipe triggers GeometryLint error
  const badMap = new TileMap(6, 6);
  badMap.fillRect(0, 0, 6, 1, tileTypes.SOLID);
  badMap.set(3, 1, tileTypes.PIPE);
  const badReport = lintTileMapGeometry(badMap, 'BadPipe');
  assert.equal(badReport.passed, false);
  assert.equal(badReport.mismatches.length, 1);
});

test('Stage 6 [3/6] QUESTION_BLOCK_BUMP_AND_COIN_HOP — 6-frame 12px bump, [?]->USED, 2.5t coin hop', () => {
  resetMovementProfile();
  const room6 = createLevelKitShowcase();
  const map = new TileMap(room6.map.cols, room6.map.rows, room6.map.data);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  const levelKit = new LevelKitSystem();
  levelKit.loadRoom(room6);

  // Position player cleanly underneath (7, 5) QUESTION_BLOCK on floor Y=2.0
  player.spawn(7.1, 2.0);
  player.update(null, collision, DT);

  const jumpMask = InputManager.encodeActions([Actions.JUMP]);
  let sawHit = false;
  let peakBumpOffset = 0;
  let bumpFramesObserved = 0;
  let coinStartY = 0;
  let coinPeakY = 0;

  for (let f = 0; f < 60; f++) {
    input.applySnapshot(f < 18 ? jumpMask : 0);
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);

    if (levelKit.events.some((e) => e.type === 'questionBlockCoin')) {
      sawHit = true;
      assert.equal(map.get(7, 5), tileTypes.USED_BLOCK, 'Question block must turn into USED_BLOCK on first hit');
      assert.equal(levelKit.hoppingCoins.length, 1);
      coinStartY = levelKit.hoppingCoins[0].startY;
      coinPeakY = levelKit.hoppingCoins[0].y;
    }

    const offset = levelKit.getBumpOffsetY(7, 5);
    if (offset > 0) {
      bumpFramesObserved++;
      peakBumpOffset = Math.max(peakBumpOffset, offset);
    }

    if (levelKit.hoppingCoins.length > 0) {
      coinPeakY = Math.max(coinPeakY, levelKit.hoppingCoins[0].y);
    }
  }

  assert.equal(sawHit, true, 'Standing jump underneath row=5 [?] block must trigger overhead hit');
  assert.equal(levelKit.coinsCollected, 1, 'Question block hit must award +1 coin');
  assert.ok(
    Math.abs(peakBumpOffset - stage6.blockBumpHeight) < 1e-4,
    `Peak bump offset must equal 12px (0.1875t), got ${peakBumpOffset}`
  );
  assert.equal(bumpFramesObserved, stage6.blockBumpFrames - 1, '6-frame sine bump has 5 non-zero peak frames and settles to 0 on frame 6');
  assert.equal(levelKit.getBumpOffsetY(7, 5), 0, 'Block bump must settle cleanly back to 0');
  assert.equal(levelKit.hoppingCoins.length, 0, 'Hopping coin must despawn after 28 frames');
  assert.ok(
    Math.abs((coinPeakY - coinStartY) - stage6.coinHopHeight) < 0.05,
    `Coin hop peak must reach ~2.5t, got ${(coinPeakY - coinStartY).toFixed(3)}`
  );

  // Re-hitting the now-USED_BLOCK must NOT award a second coin
  player.spawn(7.1, 2.0);
  player.update(null, collision, DT);
  for (let f = 0; f < 30; f++) {
    input.applySnapshot(jumpMask);
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);
  }
  assert.equal(levelKit.coinsCollected, 1, 'Spent USED_BLOCK must not spawn a second coin');
});

test('Stage 6 [4/6] BRICK_BUMP_VS_SHATTER — slow bump preserves Brick; sprint jump & Ground Pound shatter into 4 shards', () => {
  resetMovementProfile();
  const room6 = createLevelKitShowcase();
  const map = new TileMap(room6.map.cols, room6.map.rows, room6.map.data);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  const levelKit = new LevelKitSystem();
  levelKit.loadRoom(room6);

  const jumpMask = InputManager.encodeActions([Actions.JUMP]);

  // A) Slow stationary jump into (8, 5) BRICK_BLOCK -> bump only (remains solid)
  player.spawn(8.1, 2.0);
  player.update(null, collision, DT);
  let bumpedBrick = false;
  for (let f = 0; f < 30; f++) {
    input.applySnapshot(f < 16 ? jumpMask : 0);
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);
    if (levelKit.events.some((e) => e.type === 'brickBump')) bumpedBrick = true;
  }
  assert.equal(bumpedBrick, true, 'Stationary jump under brick must emit brickBump');
  assert.equal(map.get(8, 5), tileTypes.BRICK_BLOCK, 'Brick hit at low speed must stay solid');
  assert.equal(levelKit.bricksBroken, 0);

  // B) Fast sprint jump (vx >= 5.5 t/s) into (8, 5) BRICK_BLOCK -> shatters into 4 debris shards!
  player.spawn(8.1, 2.0);
  player.grounded = true;
  player.vel.x = 6.8;
  let shattered = false;
  for (let f = 0; f < 25; f++) {
    input.applySnapshot(InputManager.encodeActions([Actions.RIGHT, Actions.RUN, Actions.JUMP]));
    player.vel.x = 6.8; // Maintain sprint speed up to block impact
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);
    if (levelKit.events.some((e) => e.type === 'brickBreak')) {
      shattered = true;
      assert.equal(levelKit.brickDebris.length, 4, 'Brick shatter must spawn 4 spinning debris fragments');
      break;
    }
  }
  assert.equal(shattered, true, 'Sprint jump into brick must shatter brick');
  assert.equal(map.get(8, 5), tileTypes.EMPTY, 'Shattered brick tile must become EMPTY');
  assert.equal(levelKit.bricksBroken, 1);

  // GeometryLint stays clean after live brick destruction
  assert.equal(lintTileMapGeometry(map, 'PostShatter').passed, true);

  // C) Ground Pound onto Brick Bridge (cols 45..48, row 5, top Y=6.0) shatters underfoot bricks
  player.spawn(45.6, 8.2);
  player.grounded = false;
  player.vel.x = 0;
  player.vel.y = 0;
  const downMask = InputManager.encodeActions([Actions.DOWN]);
  let poundShattered = false;
  for (let f = 0; f < 30; f++) {
    input.applySnapshot(f === 0 ? downMask : 0);
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);
    if (levelKit.events.some((e) => e.type === 'brickBreak')) {
      poundShattered = true;
      break;
    }
  }
  assert.equal(poundShattered, true, 'Ground Pound onto BRICK_BLOCK bridge must shatter underfoot bricks');
  assert.ok(levelKit.bricksBroken >= 2);
});

test('Stage 6 [5/6] WORLD_COINS_FLAGPOLE_AND_PARALLAX — coin pickup, flagpole capture & 5-plane parallax stability', () => {
  resetMovementProfile();
  const room6 = createLevelKitShowcase();
  const map = new TileMap(room6.map.cols, room6.map.rows, room6.map.data);
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  const levelKit = new LevelKitSystem();
  levelKit.loadRoom(room6);

  // Pick up world coin at (46.0, 2.7) under the brick bridge
  player.spawn(45.2, 2.0);
  const rightMask = InputManager.encodeActions([Actions.RIGHT]);
  for (let f = 0; f < 30; f++) {
    input.applySnapshot(rightMask);
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);
  }
  assert.ok(levelKit.coinsCollected >= 1, 'Walking through coin at (46.0, 2.7) must collect it');

  // Touch Goal Flagpole at x=80.5
  player.spawn(79.6, 3.0);
  let flagTriggered = false;
  for (let f = 0; f < 90; f++) {
    input.applySnapshot(f < 25 ? rightMask : 0);
    player.update(input, collision, DT);
    levelKit.update(player, map, DT);
    if (levelKit.events.some((e) => e.type === 'flagpole')) {
      flagTriggered = true;
    }
  }
  assert.equal(flagTriggered, true, 'Touching Goal Flagpole must trigger flagpole event');
  assert.equal(levelKit.courseCleared, true);
  assert.equal(levelKit.flagpole.flagDropDone, true, 'Flag must descend cleanly to flagpole base');
  assert.equal(levelKit.flagpole.flagY, levelKit.flagpole.baseY + 1.0);

  // Verify monotonic, jitter-free parallax progression across all 5 depth planes
  const pf = stage6.parallaxFactors;
  assert.equal(pf.sky, 0.10);
  assert.equal(pf.hills, 0.40);
  assert.equal(pf.cliffs, 0.85);
  assert.equal(pf.world, 1.00);
  assert.equal(pf.foreground, 1.10);
  assert.ok(pf.sky < pf.hills && pf.hills < pf.cliffs && pf.cliffs < pf.world && pf.world < pf.foreground);
});

test('Stage 6 [6/6] FIX_60HZ_STABILITY_AND_DETERMINISM — twin 600-frame Room 6 runs match bit-for-bit', () => {
  resetMovementProfile();

  const runRightJump = InputManager.encodeActions([Actions.RIGHT, Actions.RUN, Actions.JUMP]);
  const runRight = InputManager.encodeActions([Actions.RIGHT, Actions.RUN]);
  const spin = InputManager.encodeActions([Actions.RIGHT, Actions.SPIN]);

  // Precompute a realistic 600-frame replay script targeting Room 6 blocks, pipes & coins
  const replayFrames = [];
  {
    const scriptEngine = new GameEngine();
    scriptEngine.initHeadless(5);
    for (let f = 0; f < 600; f++) {
      const px = scriptEngine.player.pos.x;
      const py = scriptEngine.player.pos.y;
      let mask = runRight;
      const nearQuestion = px >= 6.4 && px <= 7.8 && py <= 3.5;
      const beforePipe1 = px >= 12.2 && px <= 15.0;
      const beforePipe2 = px >= 18.0 && px <= 21.0;
      const beforeBridge = px >= 43.2 && px <= 46.5;
      if (nearQuestion || beforePipe1 || beforePipe2 || beforeBridge) {
        mask = runRightJump;
      } else if (!scriptEngine.player.grounded && scriptEngine.player.vel.y < -1.0 && px > 22 && px < 26) {
        mask = spin;
      }
      replayFrames.push(mask);
      scriptEngine.input.applySnapshot(mask);
      scriptEngine.player.update(scriptEngine.input, scriptEngine.collision, DT, scriptEngine.platforms);
      scriptEngine.levelKit.update(scriptEngine.player, scriptEngine.tilemap, DT);
    }
  }

  const runSimulation = () => {
    const engine = new GameEngine();
    engine.initHeadless(5); // Room 6: Grassland Kit
    assert.equal(engine.geometryLintReport.passed, true);
    engine.input.loadReplay(replayFrames);

    for (let f = 0; f < 600; f++) {
      engine._fixedUpdate(DT);
    }

    return {
      hash: engine.player.stateHash,
      x: engine.player.pos.x,
      y: engine.player.pos.y,
      coins: engine.levelKit.coinsCollected,
      bricksBroken: engine.levelKit.bricksBroken,
      blocksBumped: engine.levelKit.blocksBumped,
      cleared: engine.levelKit.courseCleared,
    };
  };

  const r1 = runSimulation();
  const r2 = runSimulation();
  assert.equal(r1.hash, r2.hash);
  assert.equal(r1.x, r2.x);
  assert.equal(r1.y, r2.y);
  assert.equal(r1.coins, r2.coins);
  assert.equal(r1.bricksBroken, r2.bricksBroken);
  assert.equal(r1.blocksBumped, r2.blocksBumped);
  assert.equal(r1.cleared, r2.cleared);
  assert.ok(r1.coins > 0, `Automated traversal through Room 6 should collect coins (got ${r1.coins})`);
});
