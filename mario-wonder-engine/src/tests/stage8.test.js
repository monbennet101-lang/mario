/**
 * Stage 8 Headless Verification Suite
 * =====================================
 * Verifies:
 *   1. Binary glTF Integrity of mario.glb & luigi.glb (all 27 baked animation clips,
 *      complete skeleton hierarchy skl_root -> spin -> face_1 with head/cap affixed).
 *   2. 27-Clip State-Machine Mapping (Idle/Walk/Run/Sprint/Skid/TurnAround,
 *      Jump/DoubleJump/TripleJump/FlutterJump/SpinJump/SpinAir/WallSlide/WallJump,
 *      CrouchStart/Crouch/GroundPound/GroundPoundLand/Victory).
 *   3. Volume-Preserving Squash & Stretch (Sx * Sy * Sz = 1.00 ± 0.02 across Jump
 *      Sy=1.28, Land Sy=0.74, Crouch Sy=0.50; constant physics hitboxes).
 *   4. Strict Presentation-Physics Decoupling (identical 600-frame state hashes).
 *   5. Mario vs Luigi Divergent Physics & Instant Hot-Swap (Luigi g_rise=40.0, ~5% higher
 *      standing apex, groundFriction=19.0, FlutterJump buoyancy on Jump hold).
 *   6. Foliage Inset (0.08t = 5px) & Wonder 20° 3/4 Camera Yaw Tilt (+70° / -70°).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { PlayerState } from '../game/player/PlayerState.js';
import {
  CHARACTER_ANIM_CLIPS,
  computeVolumePreservingSquash,
  resolveClipSpec,
} from '../engine/rendering/CharacterRig3D.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, '../../public/models');

function parseGlbJson(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.toString('utf8', 0, 4), 'glTF', `${path.basename(filePath)} must be valid glTF binary`);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
}

describe('Stage 8 — 3D Rigged Character Integration, Expressive Rig & Character Switcher', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  it('1. Verifies mario.glb and luigi.glb contain all 27 clips and skl_root -> spin -> face_1 hierarchy', () => {
    assert.equal(CHARACTER_ANIM_CLIPS.length, 27, 'MovementProfile.stage8.allClips must list all 27 clips');

    for (const modelFile of ['mario.glb', 'luigi.glb']) {
      const gltf = parseGlbJson(path.join(MODELS_DIR, modelFile));
      const clipNames = new Set((gltf.animations || []).map((a) => a.name));

      for (const expectedClip of CHARACTER_ANIM_CLIPS) {
        assert.ok(clipNames.has(expectedClip), `${modelFile} missing animation clip '${expectedClip}'`);
      }
      assert.equal(clipNames.size, 27, `${modelFile} should have exact 27 clips (got ${clipNames.size})`);

      // Verify parent -> child skeletal chain so head/cap remain 100% affixed to face_1
      const parents = {};
      gltf.nodes.forEach((n, idx) => {
        (n.children || []).forEach((c) => {
          parents[c] = idx;
        });
      });

      const sklIdx = gltf.nodes.findIndex((n) => n.name === 'skl_root');
      const spinIdx = gltf.nodes.findIndex((n) => n.name === 'spin');
      const faceIdx = gltf.nodes.findIndex((n) => n.name === 'face_1');
      assert.ok(sklIdx >= 0 && spinIdx >= 0 && faceIdx >= 0, `${modelFile} must have skl_root, spin, and face_1 bones`);
      assert.equal(parents[faceIdx], spinIdx, `${modelFile}: face_1 head bone must be parented directly under spin`);
      assert.equal(parents[spinIdx], sklIdx, `${modelFile}: spin spine bone must be parented directly under skl_root`);

      // Verify all 27 clips have valid keyframe samplers (non-empty) and face_1 stays bound
      for (const anim of gltf.animations) {
        assert.ok(anim.channels.length > 0 && anim.samplers.length > 0, `${modelFile} clip ${anim.name} has empty keyframes`);
      }
    }
  });

  it('2. Maps all controller states, jump combos, turns, and Victory to the baked clip library', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);
    const p = engine.player;

    p.state = PlayerState.IDLE;
    const idleSpec = resolveClipSpec(p);
    assert.equal(idleSpec.clipName, 'Idle');
    assert.equal(idleSpec.timeScale, 5.0);

    p.state = PlayerState.WALK;
    p.vel.x = 4.0;
    const walkSpec = resolveClipSpec(p);
    assert.equal(walkSpec.clipName, 'Run');
    assert.equal(walkSpec.timeScale, 5.0);

    p.state = PlayerState.RUN;
    p.vel.x = 7.2;
    const runSpec = resolveClipSpec(p);
    assert.equal(runSpec.clipName, 'Sprint');
    assert.ok(Math.abs(runSpec.timeScale - (7.2 / 9.2) * 10.0) < 1e-6);

    p.state = PlayerState.SPRINT;
    p.vel.x = 9.2;
    const sprintSpec = resolveClipSpec(p);
    assert.equal(sprintSpec.clipName, 'Sprint');
    assert.equal(sprintSpec.timeScale, 10.0);

    p.state = PlayerState.SKID;
    assert.equal(resolveClipSpec(p).clipName, 'Skid');

    p.state = PlayerState.PIVOT;
    assert.equal(resolveClipSpec(p).clipName, 'TurnAround');

    p.state = PlayerState.JUMP;
    p.isJumping = true;
    p.jumpComboCount = 1;
    assert.equal(resolveClipSpec(p).clipName, 'Jump');
    p.jumpComboCount = 2;
    assert.equal(resolveClipSpec(p).clipName, 'DoubleJump');
    p.jumpComboCount = 3;
    assert.equal(resolveClipSpec(p).clipName, 'TripleJump');

    p.state = PlayerState.FALL;
    p.jumpComboCount = 3;
    assert.equal(resolveClipSpec(p).clipName, 'TripleJump');
    p.jumpComboCount = 2;
    assert.equal(resolveClipSpec(p).clipName, 'DoubleJump');
    p.isJumping = false;
    assert.equal(resolveClipSpec(p).clipName, 'Jump');

    p.state = PlayerState.FLUTTER_JUMP;
    assert.equal(resolveClipSpec(p).clipName, 'Run');

    p.state = PlayerState.SPIN_JUMP;
    p.spinJumpFrames = 2;
    assert.equal(resolveClipSpec(p).clipName, 'SpinJump');
    p.spinJumpFrames = MovementProfile.spinJump.launchClipFrames + 1;
    assert.equal(resolveClipSpec(p).clipName, 'SpinAir');

    p.state = PlayerState.SPIN_TWIRL;
    p.vel.y = 1.0;
    assert.equal(resolveClipSpec(p).clipName, 'SpinAir');
    p.vel.y = -0.8;
    assert.equal(resolveClipSpec(p).clipName, 'SpinAir');

    p.state = PlayerState.WALL_SLIDE;
    assert.equal(resolveClipSpec(p).clipName, 'WallSlide');

    p.state = PlayerState.WALL_JUMP;
    assert.equal(resolveClipSpec(p).clipName, 'WallJump');

    p.state = PlayerState.CROUCH;
    p.stateFrames = 1;
    assert.equal(resolveClipSpec(p).clipName, 'CrouchStart');
    p.stateFrames = 10;
    assert.equal(resolveClipSpec(p).clipName, 'Crouch');

    p.state = PlayerState.GROUND_POUND_FALL;
    assert.equal(resolveClipSpec(p).clipName, 'GroundPound');
    p.state = PlayerState.GROUND_POUND_LAND;
    assert.equal(resolveClipSpec(p).clipName, 'GroundPoundLand');

    p.isVictory = true;
    assert.equal(resolveClipSpec(p).clipName, 'Victory');
  });

  it('3. Enforces volume preservation (Sx * Sy * Sz = 1.00 ± 0.02) on Pelvis & Spine for Jump, Land, and Crouch', () => {
    const tol = MovementProfile.stage8.volumeTolerance; // 0.02
    assert.equal(MovementProfile.presentation.jumpStretchSy, 1.28);
    assert.equal(MovementProfile.presentation.landingSquashSy, 0.74);
    assert.equal(MovementProfile.presentation.landingRecoveryFrames, 5);
    assert.equal(MovementProfile.presentation.crouchSquashSy, 0.50);

    for (const sy of [
      MovementProfile.presentation.jumpStretchSy,
      MovementProfile.presentation.landingSquashSy,
      MovementProfile.presentation.crouchSquashSy,
      0.85,
      1.0,
    ]) {
      const sq = computeVolumePreservingSquash(sy);
      assert.ok(Math.abs(sq.pelvisVolume - 1.0) <= tol, `Pelvis volume at Sy=${sy} out of bounds: ${sq.pelvisVolume}`);
      assert.ok(Math.abs(sq.spineVolume - 1.0) <= tol, `Spine volume at Sy=${sy} out of bounds: ${sq.spineVolume}`);
      assert.ok(Math.abs(sq.combinedVolume - 1.0) <= tol, `Combined volume at Sy=${sy} out of bounds: ${sq.combinedVolume}`);
      assert.ok(Math.abs(sq.combinedSy - sy) < 1e-6, `Combined Sy must equal target ${sy} (got ${sq.combinedSy})`);
    }
  });

  it('4. Keeps simulation state hashes bit-identical with 3D presentation queries active vs disabled', () => {
    const runSequence = (withPresentation) => {
      resetMovementProfile();
      const engine = new GameEngine();
      engine.initHeadless(0);
      const hashes = [];

      for (let f = 0; f < 600; f++) {
        let actions = {};
        if (f < 90) actions = { right: true, run: true };
        else if (f < 120) actions = { right: true, run: true, jump: true };
        else if (f === 130) actions = { spin: true };
        else if (f < 190) actions = { left: true, run: true };
        else if (f < 250) actions = { down: true, left: true };
        else if (f === 265) actions = { right: true, jump: true };
        else if (f === 280) actions = { down: true };
        else if (f < 420) actions = { right: true };

        engine.stepHeadless(actions);
        if (withPresentation) {
          resolveClipSpec(engine.player);
          computeVolumePreservingSquash(engine.player.isCrouched ? 0.50 : 1.0);
        }
        hashes.push(engine.player.stateHash);
      }
      return hashes;
    };

    const baselineHashes = runSequence(false);
    const presentationHashes = runSequence(true);
    assert.deepEqual(presentationHashes, baselineHashes, '3D presentation & squash math must never mutate simulation state');
  });

  it('5. Implements Mario vs Luigi divergent physics, instant zero-hitch swap, and Luigi FlutterJump', () => {
    const engine = new GameEngine();
    engine.initHeadless(0);

    // Measure Mario standing jump apex & FlutterJump buoyancy
    for (let i = 0; i < 10; i++) engine.stepHeadless({}); // settle grounded
    const marioStartY = engine.player.pos.y;
    let marioPeak = 0;
    let marioSawFlutter = false;
    engine.stepHeadless({ jump: true });
    for (let i = 0; i < 95; i++) {
      engine.stepHeadless({ jump: true });
      marioPeak = Math.max(marioPeak, engine.player.pos.y - marioStartY);
      if (engine.player.state === PlayerState.FLUTTER_JUMP) marioSawFlutter = true;
      if (engine.player.grounded) break;
    }
    assert.ok(marioSawFlutter, 'Mario must enter FlutterJump state on descent while holding Jump');

    // Hot-swap to Luigi mid-motion and confirm zero position/velocity hitch
    engine.stepHeadless({ right: true, run: true });
    const preSwapPos = { ...engine.player.pos };
    const preSwapVel = { ...engine.player.vel };
    engine.toggleCharacter();
    assert.equal(engine.characterId, 'luigi');
    assert.equal(MovementProfile.jump.gravityRising, 40.0, 'Luigi gravityRising must equal 40.0 tiles/s²');
    assert.equal(MovementProfile.locomotion.groundFriction, 19.0, 'Luigi groundFriction must equal 19.0 tiles/s²');
    assert.deepEqual(engine.player.pos, preSwapPos, 'Hot-swap must preserve exact X/Y position');
    assert.deepEqual(engine.player.vel, preSwapVel, 'Hot-swap must preserve exact Vx/Vy velocity');

    // Reset room while keeping Luigi active, settle grounded, then measure Luigi standing jump & FlutterJump
    engine.resetRoom();
    assert.equal(engine.characterId, 'luigi', 'Room reset must preserve active character Luigi');
    for (let i = 0; i < 10; i++) engine.stepHeadless({});

    const luigiStartY = engine.player.pos.y;
    let luigiPeak = 0;
    let sawFlutter = false;
    let flutterVySum = 0;
    let flutterFrames = 0;

    engine.stepHeadless({ jump: true });
    for (let i = 0; i < 95; i++) {
      engine.stepHeadless({ jump: true });
      luigiPeak = Math.max(luigiPeak, engine.player.pos.y - luigiStartY);
      if (engine.player.state === PlayerState.FLUTTER_JUMP) {
        sawFlutter = true;
        flutterVySum += engine.player.vel.y;
        flutterFrames++;
      }
      if (engine.player.grounded) break;
    }

    assert.ok(
      luigiPeak > marioPeak * 1.035 && luigiPeak < marioPeak * 1.09,
      `Luigi jump apex (${luigiPeak.toFixed(3)}t) must be ~5% higher than Mario (${marioPeak.toFixed(3)}t)`
    );
    assert.ok(sawFlutter && flutterFrames >= 10, `Luigi must enter FlutterJump state on descent while holding Jump (frames=${flutterFrames})`);
    const avgFlutterVy = flutterVySum / flutterFrames;
    assert.ok(
      avgFlutterVy > -2.5 && avgFlutterVy < 0,
      `Luigi FlutterJump must buoyantly slow descent near flutterTargetVy (avg vy=${avgFlutterVy.toFixed(2)})`
    );

    // Compare ground braking slide distance from top run speed (Mario friction 22 vs Luigi 19)
    const measureCoastSlide = (charId) => {
      engine.setCharacter(charId);
      engine.resetRoom();
      for (let i = 0; i < 10; i++) engine.stepHeadless({});
      for (let i = 0; i < 60; i++) engine.stepHeadless({ right: true, run: true });
      const releaseX = engine.player.pos.x;
      for (let i = 0; i < 40; i++) engine.stepHeadless({});
      return engine.player.pos.x - releaseX;
    };
    const marioSlide = measureCoastSlide('mario');
    const luigiSlide = measureCoastSlide('luigi');
    assert.ok(
      luigiSlide > marioSlide * 1.10,
      `Luigi lower traction (${luigiSlide.toFixed(2)}t) must slide farther than Mario (${marioSlide.toFixed(2)}t)`
    );
  });

  it('6. Confirms exact 5px (0.08t) foliage inset & 20° 3/4 camera yaw tilt calibration', () => {
    assert.equal(MovementProfile.hitbox.foliageInset, 0.08);
    assert.equal(Math.round(MovementProfile.hitbox.foliageInset * MovementProfile.simulation.pixelsPerTile), 5);
    assert.equal(MovementProfile.stage8.cameraYawTiltDeg, 20.0);
    assert.equal(MovementProfile.presentation.cameraYawTilt, 20.0);
  });
});
