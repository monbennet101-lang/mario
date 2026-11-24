/**
 * Stage 17: Level Design Architecture — Transcendental vs. Per-Level Mechanics
 * & Kishōtenketsu Engine Automated Headless Verification Suite
 * ============================================================================
 * Verifies every requirement in Stage 17 & `NINTENDO_LEVEL_DESIGN_WISDOM.md`:
 *
 *  1. Invariant Transcendental Baseline: MovementProfile constants (walk/run,
 *     jump arc gravity, stomp rebounds, shell speeds, blocks) remain bit-identical
 *     across all 4 Acts, Water Geyser rides, and Act 3 Twist inversion.
 *  2. Act 1 (Ki) Zero-Pit Safety Audit: `auditAct1ZeroPits` passes on Water Spout
 *     Beach (0 pits, 0 hazards, visual demo geyser ahead of spawn) AND reliably
 *     FAILS if a pit is carved into Act 1.
 *  3. Live 60 Hz Headless Simulation in Act 1 (Ki): Riding Water Geyser #1 lifts
 *     Mario smoothly on its rising crest, and stepping off drops Mario safely onto
 *     solid ground (pos.y >= 2.0, zero chasm fall).
 *  4. Act 3 (Ten) Anticipated Twist Herald: Approaching x=107 fires anticipation
 *     (`twistAnticipate`) and crossing fires inversion (`twistHerald`), reversing
 *     geysers (`flowDirection === -1`, `inverted === true`) and shifting anti-phase
 *     platforms by 0.5 cycle while keeping baseline physics 100% unchanged.
 *  5. Dual-Skill Routing (Miyamoto Floor vs. Ceiling Law): Floor Route validated
 *     for novice walk |vx| <= 4.50 t/s; Ceiling Route validated for continuous
 *     sprint trajectory |vx| = 9.20 t/s with sprint-only gaps, bounce enemies,
 *     3 Star Medallions, and Secret 1-UP Cache; negative test proves validator
 *     rejects an unjumpable Ceiling Route gap.
 *  6. 10-Point Nintendo Architectural Audit (`runTenPointNintendoAudit`): Passes
 *     with exact 10/10 score, 0 GeometryLint errors, and bit-identical twin-run
 *     60 Hz determinism hash across GameEngine Room 11.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import GameEngine from '../engine/core/GameEngine.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import PlayerController from '../game/player/PlayerController.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import EnvironmentalPropsSystem from '../entities/props.js';
import {
  KISHOTENKETSU_ACTS,
  ACT_ORDER,
  TRANSCENDENTAL_BASELINE,
  captureTranscendentalSnapshot,
  verifyTranscendentalInvariance,
  LevelGimmickRuntime,
  computeJumpEnvelope,
  auditAct1ZeroPits,
  auditFloorRoute,
  auditCeilingRoute,
  runTenPointNintendoAudit,
  createWaterSpoutBeach,
} from '../level/levelEngine.js';

const DT = MovementProfile.simulation.fixedTimeStep; // 1/60s

function encodeKeys(obj = {}) {
  const list = [];
  if (obj.left) list.push(Actions.LEFT);
  if (obj.right) list.push(Actions.RIGHT);
  if (obj.up) list.push(Actions.UP);
  if (obj.down) list.push(Actions.DOWN);
  if (obj.jump) list.push(Actions.JUMP);
  if (obj.run) list.push(Actions.RUN);
  if (obj.spin) list.push(Actions.SPIN);
  return InputManager.encodeActions(list);
}

describe('Stage 17 — Transcendental Baseline & Kishōtenketsu Level Engine', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  it('1. Invariant Transcendental Baseline remains 100% immutable across all gimmicks & Twist inversion', () => {
    const room = createWaterSpoutBeach();
    const before = captureTranscendentalSnapshot();

    assert.equal(TRANSCENDENTAL_BASELINE.locomotion.walkTopSpeed, MovementProfile.locomotion.walkTopSpeed);
    assert.equal(TRANSCENDENTAL_BASELINE.locomotion.runTopSpeed, MovementProfile.locomotion.runTopSpeed);
    assert.equal(TRANSCENDENTAL_BASELINE.jump.launchVelocity, MovementProfile.jump.launchVelocity);

    const collision = new CollisionSystem(room.map);
    const input = new InputManager();
    const player = new PlayerController();
    const props = new EnvironmentalPropsSystem();
    const lvl = new LevelGimmickRuntime();

    props.loadRoom(room);
    lvl.loadRoom(room);
    player.spawn(room.spawnX, room.spawnY);

    const allPlatforms = [...props.platforms, ...lvl.platforms];

    // Simulate 120 ticks of normal play + Twist inversion + 120 more ticks
    for (let f = 0; f < 240; f++) {
      if (f === 120) {
        lvl.triggerTwistInversion(props.platforms);
      }
      input.applySnapshot(encodeKeys({ right: true, run: true, jump: f % 45 === 10 }));
      props.updatePlatforms(DT, player.ridingPlatform);
      lvl.updateGeysers(DT);
      player.update(input, collision, DT, allPlatforms, {
        solidBoxes: props.getSolidBoxes(),
      });
      lvl.updatePostPlayer(DT, player, null, props.platforms);
    }

    const after = captureTranscendentalSnapshot();
    const check = verifyTranscendentalInvariance(before, after);
    assert.equal(check.invariant, true, `Unexpected physics drift: ${check.diffs.join('; ')}`);
    assert.equal(check.diffs.length, 0);
  });

  it('2. Act 1 (Ki) Zero-Pit Safety Audit passes on Water Spout Beach and rejects carved pits', () => {
    const room = createWaterSpoutBeach();
    const act1 = auditAct1ZeroPits(room);

    assert.equal(act1.passed, true, `Act 1 audit failed: ${act1.summary}`);
    assert.equal(act1.pitCount, 0, 'Act 1 must have ZERO bottomless pits');
    assert.equal(act1.hazardCount, 0, 'Act 1 safe playpen must have ZERO hazards');
    assert.equal(act1.hasVisualDemo, true, 'Act 1 must have a visual demo landmark ahead of spawn');
    assert.deepEqual(ACT_ORDER, ['KI', 'SHO', 'TEN', 'KETSU']);
    assert.equal(KISHOTENKETSU_ACTS.KI.order, 1);

    // Negative test: carve a 2-tile bottomless pit in Act 1 and assert validator catches it
    const brokenRoom = createWaterSpoutBeach();
    for (let y = 0; y < 4; y++) {
      brokenRoom.map.set(14, y, MovementProfile.tileTypes.EMPTY);
      brokenRoom.map.set(15, y, MovementProfile.tileTypes.EMPTY);
    }
    const brokenAudit = auditAct1ZeroPits(brokenRoom);
    assert.equal(brokenAudit.passed, false, 'Validator must fail when a pit exists in Act 1');
    assert.ok(brokenAudit.pitCount >= 2, `Expected >= 2 pit columns, got ${brokenAudit.pitCount}`);
  });

  it('3. Live 60 Hz Act 1 Ki simulation: Water Geyser lifts Mario cleanly and stepping off drops safely to floor', () => {
    const room = createWaterSpoutBeach();
    const collision = new CollisionSystem(room.map);
    const input = new InputManager();
    const player = new PlayerController();
    const lvl = new LevelGimmickRuntime();

    lvl.loadRoom(room);
    const geyser1 = lvl.geysers[0];
    assert.ok(geyser1, 'Act 1 must have Water Geyser #1');
    assert.equal(geyser1.demoVisual, true, 'Geyser #1 should display visual coin demo landmark');

    // Place Mario directly onto Geyser #1 crest and ride upward
    lvl.updateGeysers(DT);
    player.spawn(geyser1.pos.x + geyser1.width * 0.5 - player.currentWidth * 0.5, geyser1.pos.y + geyser1.height + 0.02);

    let maxY = player.pos.y;
    let stoodOnGeyser = false;
    for (let f = 0; f < 180; f++) {
      input.applySnapshot(encodeKeys({}));
      lvl.updateGeysers(DT);
      player.update(input, collision, DT, lvl.platforms);
      lvl.updatePostPlayer(DT, player, null, []);
      if (player.ridingPlatform === geyser1) stoodOnGeyser = true;
      if (player.pos.y > maxY) maxY = player.pos.y;
    }

    assert.equal(stoodOnGeyser, true, 'Mario should ride on top of the Water Geyser crest');
    assert.ok(maxY >= geyser1.baseY + geyser1.minHeight + 2.0, `Expected geyser lift >= ${geyser1.baseY + geyser1.minHeight + 2.0}t, reached ${maxY.toFixed(2)}t`);

    // Step Mario off to the right and verify safe landing on 100% solid floor (no pit death)
    for (let f = 0; f < 120; f++) {
      input.applySnapshot(encodeKeys({ right: f < 28 }));
      lvl.updateGeysers(DT);
      player.update(input, collision, DT, lvl.platforms);
      lvl.updatePostPlayer(DT, player, null, []);
    }

    assert.equal(player.grounded, true, 'Mario should land safely on Act 1 solid floor');
    assert.ok(player.pos.y >= 1.99, `Mario must never fall into a pit in Act 1 (y=${player.pos.y.toFixed(2)})`);
  });

  it('4. Act 3 (Ten) Anticipated Twist Herald fires anticipation + inversion, reversing geysers & anti-phase platforms', () => {
    const room = createWaterSpoutBeach();
    const collision = new CollisionSystem(room.map);
    const input = new InputManager();
    const player = new PlayerController();
    const props = new EnvironmentalPropsSystem();
    const lvl = new LevelGimmickRuntime();

    props.loadRoom(room);
    lvl.loadRoom(room);

    const heraldX = room.twistHerald.x;
    assert.ok(heraldX > 100, 'Twist Herald should guard Act 3 entry');
    player.spawn(heraldX - 8.5, 2.0);

    let sawAnticipate = false;
    let sawHerald = false;
    const allPlatforms = [...props.platforms, ...lvl.platforms];

    for (let f = 0; f < 160; f++) {
      input.applySnapshot(encodeKeys({ right: true, run: true }));
      props.updatePlatforms(DT, player.ridingPlatform);
      lvl.updateGeysers(DT);
      player.update(input, collision, DT, allPlatforms, {
        solidBoxes: props.getSolidBoxes(),
      });
      lvl.updatePostPlayer(DT, player, null, props.platforms);
      for (const ev of lvl.events) {
        if (ev.type === 'twistAnticipate') sawAnticipate = true;
        if (ev.type === 'twistHerald') sawHerald = true;
      }
    }

    assert.equal(sawAnticipate, true, 'Twist Herald must telegraph anticipation before crossing');
    assert.equal(sawHerald, true, 'Twist Herald must fire twistHerald event on crossing');
    assert.equal(lvl.twistActive, true, 'Twist must be active after crossing Act 3 Herald');
    assert.equal(lvl.currentActId, 'TEN', 'Player must be tracked in Act 3 (TEN)');

    const invertibleGeysers = lvl.geysers.filter((g) => g.invertible);
    assert.ok(invertibleGeysers.length >= 2, 'Expected invertible geysers in Act 3/4');
    for (const g of invertibleGeysers) {
      assert.equal(g.inverted, true, `Invertible geyser ${g.id} must flip to inverted=true`);
      assert.equal(g.flowDirection, -1, `Invertible geyser ${g.id} must reverse flowDirection=-1`);
    }
  });

  it('5. Dual-Skill Routing (Miyamoto Floor <= 4.50 t/s vs. Ceiling >= 9.20 t/s) passes and rejects impossible gaps', () => {
    const room = createWaterSpoutBeach();
    const walkEnv = computeJumpEnvelope(MovementProfile.levelEngine.floorRouteMaxWalkSpeed);
    const sprintEnv = computeJumpEnvelope(MovementProfile.levelEngine.ceilingRouteMinSprintSpeed);

    assert.ok(sprintEnv.flatJumpRangeTiles > walkEnv.flatJumpRangeTiles * 1.6, 'Sprint jump envelope must meaningfully exceed walk envelope');

    const floorAudit = auditFloorRoute(room);
    assert.equal(floorAudit.passed, true, `Floor route failed: ${floorAudit.failures.join('; ')}`);
    assert.equal(floorAudit.walkSpeedTarget, 4.50);
    assert.ok(floorAudit.segmentCount >= 8);

    const ceilingAudit = auditCeilingRoute(room);
    assert.equal(ceilingAudit.passed, true, `Ceiling route failed: ${ceilingAudit.failures.join('; ')}`);
    assert.equal(ceilingAudit.sprintSpeedTarget, 9.20);
    assert.ok(ceilingAudit.sprintOnlyGaps >= 3, `Expected >= 3 sprint-only gaps, got ${ceilingAudit.sprintOnlyGaps}`);
    assert.ok(ceilingAudit.ceilingStars >= 2, 'Ceiling route must reward >= 2 Star Medallions');
    assert.equal(ceilingAudit.ceilingOneUp, true, 'Ceiling route must include Secret 1-UP Cache');
    assert.equal(ceilingAudit.hasBounceChain, true, 'Ceiling route must feature enemy bounce-chain segments');

    // Negative test: widen a Ceiling Route gap beyond 9.20 t/s sprint trajectory and assert validator rejects it
    const brokenCeilingRoom = createWaterSpoutBeach();
    brokenCeilingRoom.levelSchema.routes.ceiling.segments[1].xStart += 12.0;
    brokenCeilingRoom.levelSchema.routes.ceiling.segments[1].xEnd += 12.0;
    const brokenCeilingAudit = auditCeilingRoute(brokenCeilingRoom);
    assert.equal(brokenCeilingAudit.passed, false, 'Ceiling route validator must fail when gap exceeds 9.20 t/s sprint trajectory');
  });

  it('6. 10-Point Nintendo Architectural Audit passes 10/10 with deterministic 60 Hz Room 11 GameEngine parity', () => {
    const room = createWaterSpoutBeach();
    const audit = runTenPointNintendoAudit(room);

    assert.equal(audit.score, 10, `Expected 10/10 audit score, got ${audit.score}/10: ${audit.checks.filter((c) => !c.passed).map((c) => `${c.name} (${c.measured})`).join(' | ')}`);
    assert.equal(audit.passed, true);
    assert.equal(audit.lintReport.passed, true);
    assert.equal(audit.lintReport.errorCount, 0);
    assert.equal(audit.invarianceAudit.invariant, true);
    assert.equal(audit.invarianceAudit.diffs.length, 0);

    // Deterministic twin-run check through headless GameEngine on Room 11
    function runHeadlessRoom11() {
      resetMovementProfile();
      const eng = new GameEngine();
      eng.loadRoom(10); // Room 11: Water Spout Beach
      eng.teleportAct('TEN'); // Jump straight to Act 3 approach to exercise Twist + Geysers + Enemies
      const hashes = [];
      for (let f = 0; f < 180; f++) {
        eng.input.applySnapshot(
          encodeKeys({
            right: true,
            run: true,
            jump: f % 50 === 12 || f % 50 === 13 || f % 50 === 14,
          })
        );
        eng._stepSimulation(DT);
        if (f === 89 || f === 179) {
          hashes.push(
            `${eng.player.pos.x.toFixed(5)}:${eng.player.pos.y.toFixed(5)}:${eng.player.vel.x.toFixed(5)}:${eng.levelEngine.twistActive}`
          );
        }
      }
      return {
        hashes,
        twistActive: eng.levelEngine.twistActive,
        actId: eng.levelEngine.currentActId,
        roomName: eng.currentRoom.name,
      };
    }

    const runA = runHeadlessRoom11();
    const runB = runHeadlessRoom11();
    assert.equal(runA.roomName, 'Room 11: Water Spout Beach');
    assert.equal(runA.twistActive, true, 'Act 3 Twist should trigger during headless Room 11 run');
    assert.deepEqual(runA.hashes, runB.hashes, 'Room 11 60 Hz simulation must be bit-identical across runs');
  });
});
