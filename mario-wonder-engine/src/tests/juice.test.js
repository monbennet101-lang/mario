/**
 * Stage 20 Automated Headless Verification Suite — Multi-Sensory "Juice"
 * ======================================================================
 * Run with: node --test src/tests/juice.test.js
 *
 * Verifies all Stage 20 deliverables & measurable impact benchmarks:
 *  1. PROCEDURAL_HITSTOP_DURATIONS_AND_AUDIO:
 *     - Enemy stomp = 3f (50ms), Shell kick = 4f (66ms), Player damage = 8f (133ms) + 90f (1.5s) flashing,
 *       Solid block head-bonk = 2f (33ms); presentation freezes while audio chime fires immediately.
 *  2. CLOCK_SYNC_AND_INPUT_BUFFER_INTEGRITY:
 *     - Hitstop freezes do NOT de-synchronize the 60 Hz physics clock or drop input buffer events.
 *  3. NON_LINEAR_TRAUMA_T2_MODEL:
 *     - Impulses (+0.3 block smash, +0.4 shell rebound, +0.8 boss slam), clamp [0,1],
 *       decay T = max(0, T - 1.2 * dt), quadratic Δx = T² * 12px * noise(t) & Δy = T² * 12px * noise(t + 100).
 *  4. DIRECTIONAL_PARTICLE_EMITTER:
 *     - Turnaround/Skid = exact 4 forward dust puffs from feet;
 *       Ground Pound Land = bilateral ±6.0 tiles/s dust shockwaves;
 *       Wall Slide = continuous upward-scraping friction particles along wall contact plane.
 *  5. FRAME_PACING_AND_ZERO_GC_STRESS:
 *     - 60 FPS budget maintained with zero pool reallocations during 50+ concurrent particles
 *       and zero mutation of simulation state hashes by presentation-only squash & stretch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import GameEngine from '../engine/core/GameEngine.js';
import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { PowerUpForm } from '../game/powerups/PowerUp.js';
import { GoombaEnemy, KoopaEnemy } from '../game/entities/CombatSystem.js';
import { HopliteEnemy } from '../game/entities/EnemyArchetypes.js';
import JuiceEngine, {
  HitstopController,
  TraumaShake,
  DirectionalParticlePool,
  SquashStretchSpring,
  noise1D,
} from '../render/juice.js';

const DT = MovementProfile.simulation.fixedTimeStep; // 1/60s
const { tileTypes } = MovementProfile;

function makeFlatEngine(cols = 40, rows = 18) {
  resetMovementProfile();
  const engine = new GameEngine();
  engine.initHeadless(0);
  const map = new TileMap(cols, rows);
  map.fillRect(0, 0, cols, 3, tileTypes.SOLID); // Floor top Y = 3.0
  engine.tilemap = map;
  engine.collision = new CollisionSystem(map);
  engine.platforms = [];
  engine.combat.enemies = [];
  engine.combat.powerUps = [];
  engine.combat.fireballs = [];
  engine.levelKit.loadRoom({ map });
  engine.juice.reset();
  engine.audio.lastPlayedCue = null;
  engine.audio.cueCount = 0;
  engine.player.spawn(6.0, 3.0, { initialPowerUp: PowerUpForm.SUPER });
  // Settle 2 ticks onto floor
  engine.stepHeadless({});
  engine.stepHeadless({});
  return engine;
}

test('Stage 20 [1/5] PROCEDURAL_HITSTOP_DURATIONS_AND_AUDIO — 3f stomp, 4f shell kick, 8f damage + 1.5s flash, 2f bonk', () => {
  // A) Enemy stomp: exact 3 frames (50ms) + immediate stomp audio
  {
    const engine = makeFlatEngine();
    const goomba = new GoombaEnemy(10.0, 3.0, -1);
    engine.combat.enemies.push(goomba);

    // Position Mario descending directly onto Goomba's top stomp band
    engine.player.spawn(10.02, 4.15, { initialPowerUp: PowerUpForm.SUPER });
    engine.player.grounded = false;
    engine.player.vel.y = -10.0;
    engine.audio.lastPlayedCue = null;

    let stompTick = -1;
    for (let f = 0; f < 10; f++) {
      engine.stepHeadless({});
      if (engine.juice.hitstop.lastReason === 'stomp' && engine.hitstopFrames > 0) {
        stompTick = f;
        break;
      }
    }

    assert.ok(stompTick >= 0, 'Descending onto Goomba must trigger stomp hitstop');
    assert.equal(engine.hitstopFrames, 3, 'Enemy stomp hitstop must be exact 3 frames (50ms)');
    assert.equal(engine.juice.isPresentationFrozen, true, 'Presentation must flag frozen during hitstop');
    assert.equal(engine.audio.lastPlayedCue, 'stomp', 'Stomp audio chime must fire immediately on impact tick');

    // Verify player physics stays frozen across all 3 hitstop frames, then resumes on frame 4
    const frozenX = engine.player.pos.x;
    const frozenY = engine.player.pos.y;
    for (let h = 0; h < 3; h++) {
      engine.stepHeadless({});
      assert.equal(engine.player.pos.x, frozenX, `Player X must remain frozen on hitstop tick ${h + 1}`);
      assert.equal(engine.player.pos.y, frozenY, `Player Y must remain frozen on hitstop tick ${h + 1}`);
    }
    assert.equal(engine.hitstopFrames, 0, 'Hitstop must expire cleanly after 3 frozen frames');
    assert.equal(engine.juice.isPresentationFrozen, false);

    // Next tick resumes rebound motion
    engine.stepHeadless({});
    assert.ok(engine.player.pos.y > frozenY, 'Player must resume upward stomp rebound on first unfrozen tick');
  }

  // B) Shell kick: exact 4 frames (66ms) + immediate shellKick audio
  {
    const engine = makeFlatEngine();
    const shell = new KoopaEnemy(9.0, 3.0, -1, { initialState: 'shell_idle' });
    engine.combat.enemies.push(shell);

    engine.player.spawn(7.8, 3.0, { initialPowerUp: PowerUpForm.SUPER });
    engine.stepHeadless({});
    engine.audio.lastPlayedCue = null;

    let kicked = false;
    for (let f = 0; f < 25; f++) {
      engine.stepHeadless({ right: true });
      if (engine.juice.hitstop.lastReason === 'shellKick' && engine.hitstopFrames > 0) {
        kicked = true;
        break;
      }
    }
    assert.equal(kicked, true, 'Walking into dormant Koopa shell must trigger shell kick');
    assert.equal(engine.hitstopFrames, 4, 'Shell kick hitstop must be exact 4 frames (66ms)');
    assert.equal(engine.audio.lastPlayedCue, 'shellKick', 'Shell kick audio must fire immediately on impact tick');
  }

  // C) Player damage: exact 8 frames (133ms) + 1.5s (90 frames) invulnerability flashing
  {
    const engine = makeFlatEngine();
    const goomba = new GoombaEnemy(9.2, 3.0, -1);
    engine.combat.enemies.push(goomba);

    engine.player.spawn(7.6, 3.0, { initialPowerUp: PowerUpForm.SUPER });
    engine.stepHeadless({});
    engine.audio.lastPlayedCue = null;

    let damaged = false;
    for (let f = 0; f < 25; f++) {
      engine.stepHeadless({ right: true });
      if (engine.juice.hitstop.lastReason === 'damage' && engine.hitstopFrames > 0) {
        damaged = true;
        break;
      }
    }
    assert.equal(damaged, true, 'Side contact with Goomba must trigger damage hitstop');
    assert.equal(engine.hitstopFrames, 8, 'Player damage hitstop must be exact 8 frames (133ms)');
    assert.equal(engine.audio.lastPlayedCue, 'damage', 'Damage audio must fire immediately on impact tick');
    assert.equal(
      engine.player.invulnerabilityTimer,
      90,
      'Invulnerability window must be exact 90 frames (1.5s at 60 Hz)'
    );

    // Exhaust 8 frozen frames
    for (let h = 0; h < 8; h++) engine.stepHeadless({});
    assert.equal(engine.hitstopFrames, 0);

    // Step through 90 unfrozen i-frames and confirm alpha flashing toggles between 0.30 and 1.00
    let sawLowAlpha = false;
    let sawHighAlpha = false;
    for (let i = 0; i < 89; i++) {
      engine.stepHeadless({});
      const a = engine.player.getRenderAlpha();
      if (Math.abs(a - MovementProfile.combat.invulnerabilityAlphaLow) < 1e-6) sawLowAlpha = true;
      if (Math.abs(a - MovementProfile.combat.invulnerabilityAlphaHigh) < 1e-6) sawHighAlpha = true;
    }
    assert.equal(sawLowAlpha && sawHighAlpha, true, 'Invulnerability window must visibly flash between low and high alpha');

    // Step 2 more ticks so 1.5s invulnerability finishes cleanly
    engine.stepHeadless({});
    engine.stepHeadless({});
    assert.equal(engine.player.invulnerabilityTimer, 0, 'Invulnerability must expire after 1.5s (90 frames)');
    assert.equal(engine.player.getRenderAlpha(), 1.0, 'Alpha must restore to 1.0 after invulnerability ends');
  }

  // D) Head-bonking solid block: exact 2 frames (33ms) + immediate blockHit audio
  {
    const engine = makeFlatEngine();
    // Place solid overhead block at col 6, row 6 (bottom Y = 6.0)
    engine.tilemap.set(6, 6, tileTypes.SOLID);
    engine.player.spawn(6.1, 3.0, { initialPowerUp: PowerUpForm.SUPER });
    engine.stepHeadless({});
    engine.audio.lastPlayedCue = null;

    let bonked = false;
    for (let f = 0; f < 30; f++) {
      engine.stepHeadless({ jump: true });
      if (engine.juice.hitstop.lastReason === 'solidBlockBonk' && engine.hitstopFrames > 0) {
        bonked = true;
        break;
      }
    }
    assert.equal(bonked, true, 'Jumping into solid overhead block must trigger head-bonk hitstop');
    assert.equal(engine.hitstopFrames, 2, 'Solid block head-bonk hitstop must be exact 2 frames (33ms)');
    assert.equal(engine.audio.lastPlayedCue, 'blockHit', 'Block hit audio must fire immediately on bonk tick');
  }
});

test('Stage 20 [2/5] CLOCK_SYNC_AND_INPUT_BUFFER_INTEGRITY — 60 Hz clock never drifts & inputs during hitstop never drop', () => {
  // Part A: Verify fixed 60 Hz GameLoop clock stays strictly synchronized across hitstops
  {
    const engine = makeFlatEngine();
    engine.loop.onFixedUpdate = (dt) => {
      engine._stepSimulation(dt, true);
    };

    // Trigger an 8-frame hitstop and drive exact 60 Hz steps through GameLoop's accumulator
    engine.juice.hitstop.triggerPlayerDamage('clockSyncTest');
    assert.equal(engine.hitstopFrames, 8);

    for (let i = 1; i <= 20; i++) {
      engine.loop.advanceByDelta(DT);
    }

    assert.equal(engine.loop.tickCount, 20, 'GameLoop tickCount must advance 1:1 at 60 Hz without skipping during hitstop');
    assert.ok(engine.loop.accumulator < DT, 'GameLoop accumulator must remain bounded below 1/60s');
    assert.equal(engine.hitstopFrames, 0, '8-frame hitstop must have expired cleanly within 20 clock ticks');
  }

  // Part B: Verify Jump pressed DURING hitstop is captured and executed on the very first unfrozen tick
  {
    const engine = makeFlatEngine();
    assert.equal(engine.player.grounded, true);

    // Arm a 4-frame shell-kick hitstop while grounded
    engine.juice.hitstop.triggerShellKick('bufferTest');
    assert.equal(engine.hitstopFrames, 4);

    // Tick 1 (frozen): no input
    engine.stepHeadless({});
    assert.equal(engine.hitstopFrames, 3);
    assert.equal(engine.player.grounded, true);

    // Tick 2 (frozen): player taps JUMP mid-hitstop, then releases on tick 3!
    engine.stepHeadless({ jump: true });
    assert.equal(engine.hitstopFrames, 2);
    assert.equal(engine.player.grounded, true, 'Player stays frozen during hitstop');

    // Tick 3 & 4 (frozen): player releases JUMP before hitstop ends
    engine.stepHeadless({});
    engine.stepHeadless({});
    assert.equal(engine.hitstopFrames, 0);

    // Tick 5 (first unfrozen tick): buffered JUMP tap MUST execute without being dropped!
    engine.stepHeadless({});
    assert.equal(engine.player.grounded, false, 'Jump tap pressed during hitstop must execute on unfreeze');
    assert.ok(engine.player.vel.y > 10.0, `Expected upward jump launch after hitstop unfreeze, got vy=${engine.player.vel.y}`);
    assert.ok(engine.juice.hitstop.bufferedEventsCaptured >= 1, 'HitstopController must record captured buffered input');
  }

  // Part C: Verify airborne Jump pressed DURING hitstop right before landing arms jumpBufferTimer cleanly
  {
    const engine = makeFlatEngine();
    engine.player.spawn(6.0, 4.1, { initialPowerUp: PowerUpForm.SUPER });
    engine.player.grounded = false;
    engine.player.vel.y = -14.0;

    engine.juice.hitstop.triggerSolidBlockBonk('airBufferTest');
    // Tap Jump on frozen tick 1, release on frozen tick 2
    engine.stepHeadless({ jump: true });
    engine.stepHeadless({});
    assert.equal(engine.hitstopFrames, 0);

    // Now step a few frames as player lands -> buffered jump must fire on landing!
    let bouncedOffFloor = false;
    for (let f = 0; f < 10; f++) {
      engine.stepHeadless({});
      if (engine.player.vel.y > 12.0 && engine.player.events.some((e) => e.type === 'jump' && e.viaBuffer)) {
        bouncedOffFloor = true;
        break;
      }
    }
    assert.equal(bouncedOffFloor, true, 'Airborne jump tapped during hitstop must arm jumpBufferTimer and fire on landing');
  }
});

test('Stage 20 [3/5] NON_LINEAR_TRAUMA_T2_MODEL — +0.3/+0.4/+0.8 impulses, 1.2/s decay, 12px quadratic formula', () => {
  resetMovementProfile();
  const shake = new TraumaShake();

  // 1. Exact impulse values & clamping to [0.0, 1.0]
  shake.addHeavyBlockSmash();
  assert.ok(Math.abs(shake.trauma - 0.3) < 1e-9, `Heavy block smash must add +0.3 trauma, got ${shake.trauma}`);

  shake.addShellWallRebound(1);
  assert.ok(Math.abs(shake.trauma - 0.7) < 1e-9, `Adding +0.4 shell rebound to 0.3 must yield 0.7, got ${shake.trauma}`);

  shake.addBossGroundSlam();
  assert.equal(shake.trauma, 1.0, 'Trauma must clamp strictly at 1.0 (0.7 + 0.8 -> 1.0)');

  shake.reset();
  shake.addBossGroundSlam();
  assert.ok(Math.abs(shake.trauma - 0.8) < 1e-9, `Boss ground slam must add +0.8 trauma, got ${shake.trauma}`);

  // 2. Exact linear decay rate: T = max(0, T - 1.2 * dt)
  let expectedT = 0.8;
  for (let f = 1; f <= 45; f++) {
    shake.update(DT);
    expectedT = Math.max(0, expectedT - 1.2 * DT);
    assert.ok(
      Math.abs(shake.trauma - expectedT) < 1e-9,
      `Frame ${f}: trauma ${shake.trauma} != expected ${expectedT}`
    );

    // 3. Exact quadratic offset equations: Δx = T² * 12px * noise(t), Δy = T² * 12px * noise(t + 100)
    const sampleT = shake.time * MovementProfile.juice.trauma.noiseFrequencyHz;
    const expectedDx = expectedT * expectedT * 12 * noise1D(sampleT);
    const expectedDy = expectedT * expectedT * 12 * noise1D(sampleT + 100);
    assert.ok(Math.abs(shake.offsetXPx - expectedDx) < 1e-9, `Δx mismatch at frame ${f}`);
    assert.ok(Math.abs(shake.offsetYPx - expectedDy) < 1e-9, `Δy mismatch at frame ${f}`);
    assert.ok(Math.abs(shake.offsetXPx) <= 12.0 + 1e-9, 'Δx must never exceed MaxOffset 12px');
    assert.ok(Math.abs(shake.offsetYPx) <= 12.0 + 1e-9, 'Δy must never exceed MaxOffset 12px');
  }
  assert.equal(shake.trauma, 0, 'Trauma must settle cleanly to 0 after 0.8 / 1.2 ≈ 40 frames');
  assert.equal(shake.offsetXPx, 0);
  assert.equal(shake.offsetYPx, 0);

  // 4. Quadratic non-linearity check: T=0.5 yields exact 0.25x amplitude of T=1.0 at identical noise time
  const sFull = new TraumaShake();
  const sHalf = new TraumaShake();
  sFull.time = 0.137;
  sHalf.time = 0.137;
  sFull.addTrauma(1.0);
  sHalf.addTrauma(0.5);
  assert.ok(Math.abs(sHalf.offsetXPx - sFull.offsetXPx * 0.25) < 1e-9, 'T=0.5 must produce 0.25× peak offset of T=1.0');
  assert.ok(Math.abs(sHalf.offsetYPx - sFull.offsetYPx * 0.25) < 1e-9, 'T=0.5 must produce 0.25× peak offset of T=1.0');

  // 5. End-to-end GameEngine wiring for shell wall rebound (+0.4) & brick break (+0.3)
  const engine = makeFlatEngine(30, 18);
  // Wall on right at col 14
  engine.tilemap.fillRect(14, 3, 2, 6, tileTypes.SOLID);
  const hoplite = new HopliteEnemy(12.2, 3.0, 1);
  hoplite.retractToShell();
  hoplite.kickShell(1, MovementProfile.enemyGallery.hoplite.shellSpeed);
  engine.combat.enemies.push(hoplite);

  let peakTrauma = 0;
  for (let f = 0; f < 25; f++) {
    engine.stepHeadless({});
    if (engine.juice.trauma.trauma > peakTrauma) {
      peakTrauma = engine.juice.trauma.trauma;
    }
  }
  assert.ok(
    Math.abs(peakTrauma - 0.4) < 0.03,
    `Shell wall rebound in GameEngine must inject +0.4 trauma (got peak=${peakTrauma.toFixed(3)})`
  );
});

test('Stage 20 [4/5] DIRECTIONAL_PARTICLE_EMITTER — 4 forward turnaround puffs, ±6.0 t/s pound shockwaves, continuous wall slide', () => {
  resetMovementProfile();

  // A) Turnaround / Skid: exact 4 small white/smoke dust puffs shooting forward from player's feet
  {
    const engine = makeFlatEngine(50, 18);
    // Sprint right for 25 frames, then slam Left to reverse direction
    for (let f = 0; f < 25; f++) {
      engine.stepHeadless({ right: true, run: true });
    }
    engine.juice.particles.clear();
    const feetY = engine.player.pos.y;

    // Reverse input -> triggers skid turnaround dust
    engine.stepHeadless({ left: true, run: true });
    const active = engine.juice.particles.collectActive();
    const turnaroundPuffs = active.filter((p) => p.kind === 'turnaround');
    assert.equal(turnaroundPuffs.length, 4, `Turnaround/skid must spawn exact 4 dust puffs, got ${turnaroundPuffs.length}`);
    for (const p of turnaroundPuffs) {
      assert.ok(p.vx > 0, `Forward turnaround puff when reversing from +X must shoot forward (vx > 0), got ${p.vx}`);
      assert.ok(Math.abs(p.y - feetY) < 0.35, `Turnaround puff must spawn at player feet (y=${p.y}, feetY=${feetY})`);
    }
  }

  // B) Hard Ground Pound Land: bilateral dust shockwaves expanding left & right at 6.0 tiles/s
  {
    const engine = makeFlatEngine(40, 20);
    engine.player.spawn(10.0, 9.0, { initialPowerUp: PowerUpForm.SUPER });
    engine.player.grounded = false;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.juice.particles.clear();

    let sawShockwave = false;
    for (let f = 0; f < 40; f++) {
      engine.stepHeadless(f === 0 ? { down: true } : {});
      const active = engine.juice.particles.collectActive();
      const waves = active.filter((p) => p.kind === 'shockwave');
      if (waves.length > 0) {
        const leftFast = waves.find((p) => Math.abs(p.vx - -6.0) < 0.05);
        const rightFast = waves.find((p) => Math.abs(p.vx - 6.0) < 0.05);
        assert.ok(leftFast, 'Ground Pound land must spawn left-expanding shockwave at -6.0 tiles/s');
        assert.ok(rightFast, 'Ground Pound land must spawn right-expanding shockwave at +6.0 tiles/s');
        sawShockwave = true;
        break;
      }
    }
    assert.equal(sawShockwave, true, 'Ground Pound impact must trigger bilateral 6.0 tiles/s shockwaves');
  }

  // C) Wall Slide: continuous upward-scraping friction particles along the wall contact plane
  {
    const engine = makeFlatEngine(30, 22);
    // Tall wall on right at col 12, rows 3..18 (wall contact plane X = 12.0)
    engine.tilemap.fillRect(12, 3, 2, 16, tileTypes.SOLID);
    engine.player.spawn(12.0 - engine.player.currentWidth, 14.0, { initialPowerUp: PowerUpForm.SUPER });
    engine.player.grounded = false;
    engine.player.vel.y = -3.0;
    engine.juice.particles.clear();

    let consecutiveWallSlideTicks = 0;
    let prevSpawned = engine.juice.particles.totalSpawned;
    for (let f = 0; f < 10; f++) {
      engine.stepHeadless({ right: true });
      if (engine.player.isWallSliding) {
        const deltaSpawned = engine.juice.particles.totalSpawned - prevSpawned;
        assert.ok(deltaSpawned >= 1, `Wall slide tick ${f} must continuously emit friction particles`);
        consecutiveWallSlideTicks++;
      }
      prevSpawned = engine.juice.particles.totalSpawned;
    }
    assert.ok(consecutiveWallSlideTicks >= 6, 'Should observe sustained wall slide across multiple ticks');

    const wallParts = engine.juice.particles.collectActive().filter((p) => p.kind === 'wallFriction');
    assert.ok(wallParts.length >= 5, `Expected continuous stream of wall friction particles, got ${wallParts.length}`);
    for (const p of wallParts) {
      assert.ok(p.vy > 0, `Wall slide friction particle must scrape upward (vy > 0), got ${p.vy}`);
      assert.ok(Math.abs(p.x - 12.0) < 0.35, `Wall slide particle must stay along wall contact plane x≈12.0, got ${p.x}`);
    }
  }
});

test('Stage 20 [5/5] FRAME_PACING_AND_ZERO_GC_STRESS — 60 FPS budget with 50+ concurrent particles & zero physics mutation', () => {
  resetMovementProfile();

  // A) Zero-GC fixed pool reference stability + 60 FPS pacing with 64+ concurrent particles over 600 frames
  const juice = new JuiceEngine({ particlePoolCapacity: 256 });
  const initialSlotRefs = juice.particles._pool.slice();

  let peakConcurrent = 0;
  let maxTickMs = 0;
  let totalMs = 0;

  for (let f = 0; f < 600; f++) {
    const t0 = performance.now();

    // Sustain 50+ concurrent particles continuously (spawn fresh waves every 8 frames)
    if (f % 8 === 0) {
      juice.particles.spawnStressBurst(10.0, 5.0, 64);
      juice.trauma.addTrauma(0.35, 1, -1);
    }
    if (f % 15 === 0) {
      juice.particles.spawnTurnaroundDust(10.0, 3.0, f % 30 === 0 ? 1 : -1);
      juice.particles.spawnGroundPoundShockwave(10.0, 3.0);
    }
    juice.particles.spawnWallSlideFriction(12.0, 6.0, 1);

    juice.update(DT, { isCrouched: f % 60 < 20 });
    juice.getTelemetry();

    const elapsed = performance.now() - t0;
    if (elapsed > maxTickMs) maxTickMs = elapsed;
    totalMs += elapsed;
    if (juice.particles.activeCount > peakConcurrent) {
      peakConcurrent = juice.particles.activeCount;
    }
  }

  const avgTickMs = totalMs / 600;

  assert.ok(peakConcurrent >= 60, `Expected >= 60 concurrent active particles, got ${peakConcurrent}`);
  assert.ok(avgTickMs < 2.0, `Average juice frame cost ${avgTickMs.toFixed(4)}ms must stay far under 16.67ms 60 FPS budget`);
  assert.ok(maxTickMs < 16.67, `Max single-frame time ${maxTickMs.toFixed(4)}ms exceeded 16.67ms 60 FPS budget`);

  // Assert ZERO pool slot reallocations (every slot object identity preserved)
  assert.equal(juice.particles._pool.length, initialSlotRefs.length);
  for (let i = 0; i < initialSlotRefs.length; i++) {
    assert.strictEqual(
      juice.particles._pool[i],
      initialSlotRefs[i],
      `Pool slot ${i} was reallocated — zero-GC invariant violated`
    );
  }

  // B) Presentation separation proof: extreme squash/stretch impulses NEVER mutate simulation stateHash
  const runDeterministicSim = (injectPresentationJuice) => {
    const engine = makeFlatEngine(40, 18);
    for (let f = 0; f < 120; f++) {
      if (injectPresentationJuice && f % 10 === 0) {
        engine.juice.squash.onGroundPoundLand();
        engine.juice.trauma.addBossGroundSlam();
        engine.juice.particles.spawnStressBurst(engine.player.centerX, engine.player.centerY, 55);
      }
      const actions = f < 40 ? { right: true, run: true } : f < 55 ? { right: true, run: true, jump: true } : { left: true };
      engine.stepHeadless(actions);
    }
    return {
      hash: engine.player.stateHash,
      x: engine.player.pos.x,
      y: engine.player.pos.y,
      w: engine.player.currentWidth,
      h: engine.player.currentHeight,
    };
  };

  const clean = runDeterministicSim(false);
  const juiced = runDeterministicSim(true);
  assert.equal(juiced.hash, clean.hash, 'Presentation-only squash/trauma/particles must NEVER mutate simulation stateHash');
  assert.equal(juiced.x, clean.x);
  assert.equal(juiced.y, clean.y);
  assert.equal(juiced.w, clean.w);
  assert.equal(juiced.h, clean.h);
});
