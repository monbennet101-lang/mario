/**
 * Stage 10 Automated Verification Suite — The Gauntlet & Master Integration
 * =========================================================================
 * Proves every Stage 10 Exit Criterion in deterministic headless 60 Hz mode:
 *   1. Room 8 ("Room 8: The Gauntlet") exists with all 9 seamless sections A–I
 *   2. GeometryLint passes with 0 visual-to-collision mismatches across all 8 rooms
 *   3. Section Teleport Bar warps cleanly between A..I and advances tracking cursor
 *   4. Live Feel Preset Switcher (Wonder / NSMBU / Arcade) hot-swaps kinematics with 0 reset
 *   5. Warp Pipe suction enters WARP_PIPE & deposits player crouched into 1-tile crawl tunnel
 *   6. All 12 GauntletVerifier exit criteria (incl. full A->I scripted clear w/ 0 desync) pass
 *   7. PROTOTYPE_REPORT.md builder generates valid structured metrics markdown
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, {
  FEEL_PRESETS,
  resetMovementProfile,
} from '../game/config/MovementProfile.js';
import { getAllRooms } from '../game/levels/benchmark/BenchmarkRooms.js';
import {
  buildPrototypeReportMarkdown,
  runAllGauntletChecks,
} from '../game/verification/GauntletVerifier.js';

describe('Stage 10 — The Gauntlet, Feel Presets & Verification Suite', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  it('Room 8 (The Gauntlet) contains all 9 Sections A–I and teleports cleanly', () => {
    const rooms = getAllRooms();
    assert.equal(rooms.length, 8);
    const gauntlet = rooms[7];
    assert.equal(gauntlet.name, 'Room 8: The Gauntlet');
    assert.equal(gauntlet.isGauntlet, true);
    assert.deepEqual(
      gauntlet.sections.map((s) => s.id),
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    );

    const eng = new GameEngine();
    eng.initHeadless(7);
    for (const sec of gauntlet.sections) {
      const target = eng.teleportGauntletSection(sec.id);
      assert.ok(target);
      assert.equal(eng.currentGauntletSectionId, sec.id);
      assert.equal(eng.player.pos.x, sec.spawnX);
      assert.equal(eng.player.pos.y, sec.spawnY);
    }
  });

  it('Live Feel Preset Switcher toggles Wonder Momentum / NSMBU Classic / Snappy Arcade cleanly', () => {
    const eng = new GameEngine();
    eng.initHeadless(0);
    for (let f = 0; f < 25; f++) eng.stepHeadless({ right: true, run: true });

    const snapPos = { ...eng.player.pos };
    const snapVel = { ...eng.player.vel };

    eng.setFeelPreset('nsmbu');
    assert.equal(eng.feelPresetId, 'nsmbu');
    assert.equal(MovementProfile.locomotion.startImpulse, 0.0);
    assert.equal(MovementProfile.apexFloat.maxFrames, 3);
    assert.equal(MovementProfile.presentation.crouchSquashSy, 0.72);
    assert.equal(MovementProfile.stage8.cameraYawTiltDeg, 0.0);
    assert.deepEqual(eng.player.pos, snapPos);
    assert.deepEqual(eng.player.vel, snapVel);

    eng.setFeelPreset('arcade');
    assert.equal(eng.feelPresetId, 'arcade');
    assert.equal(MovementProfile.locomotion.startImpulse, 2.0);
    assert.equal(MovementProfile.locomotion.groundAccel, 24.0);
    assert.equal(MovementProfile.jump.gravityFalling, 52.0);
    assert.equal(MovementProfile.skid.threshold, FEEL_PRESETS.arcade.skidThreshold);

    const cycled = eng.cycleFeelPreset();
    assert.equal(cycled.id, 'wonder');
    assert.equal(MovementProfile.stage8.cameraYawTiltDeg, 20.0);
  });

  it('All 12 GauntletVerifier acceptance benchmarks & A->I zero-desync replay pass', () => {
    const report = runAllGauntletChecks();
    for (const chk of report.checks) {
      assert.ok(chk.passed, `Check "${chk.name}" failed: target=${chk.target}, measured=${chk.measured}`);
    }
    assert.equal(report.allPassed, true);
    assert.equal(report.replaySummary.cleared, true);
    assert.equal(report.replaySummary.zeroDesync, true);

    const md = buildPrototypeReportMarkdown(report);
    assert.ok(md.includes('PASS (12/12 Acceptance Checks)'));
    assert.ok(md.includes('Wonder Momentum'));
    assert.ok(md.includes('NSMBU Classic'));
    assert.ok(md.includes('Snappy Arcade'));
  });
});
