/**
 * Original Enemy Gallery 1: The Sproutling Walker & The Hoplite Roller
 * =====================================================================
 * Deterministic 60 Hz headless verification tests proving:
 *   Test 1: Sproutling stomped from above -> player rebound vy === 11.50 t/s (+15.50 held),
 *           state === 'SQUASHED', 56x14px for 15f then despawn, +200 score popup.
 *   Test 2: Hoplite stomped once -> vx === 0, state === 'DORMANT_SHELL', 40x36px,
 *           shakes +-2px at frame 240, wakes up to WALK at frame 300.
 *   Test 3: Hoplite shell kicked into 6 consecutive Sproutlings -> score escalation
 *           (100 -> 200 -> 400 -> 800 -> 1000 -> 2000 -> 4000 -> 1-UP) culminating in 1-UP award.
 *   Test 4: Wall collision for kicked Hoplite shell inverts vx sign and maintains
 *           |vx| === 12.00 tiles/s without embedding in tile geometry + 2px camera trauma.
 *   Plus: Ledge sensor (false vs true), side damage, fireball launch death, Stomp 2 halt,
 *         Carry & Throw aligned to player.hands, and Sprite Generation Matrix verification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import GameEngine from '../engine/core/GameEngine.js';
import TileMap from '../engine/physics/TileMap.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { EnemyKind } from '../game/entities/CombatSystem.js';
import { SproutlingState, HopliteState } from '../game/entities/EnemyArchetypes.js';
import { ENEMY_SPRITE_MATRIX } from '../game/entities/EnemySpriteMatrix.js';
import { PowerUpForm } from '../game/powerups/PowerUp.js';

const DT = MovementProfile.simulation.fixedTimeStep; // 1/60 s
const S = MovementProfile.tileTypes.SOLID;

function createArenaEngine(cols = 48, rows = 16, buildMap = null) {
  resetMovementProfile();
  const engine = new GameEngine();
  engine.initHeadless(0);

  const map = new TileMap(cols, rows);
  map.fillRect(0, 0, cols, 2, S); // solid floor at Y = 2.0
  map.fillRect(0, 0, 1, rows, S); // left boundary wall (col 0)
  map.fillRect(cols - 1, 0, 1, rows, S); // right boundary wall
  if (buildMap) buildMap(map);

  engine.tileMap = map;
  engine.platforms = [];
  engine.combat.loadRoom(null, true);
  engine.player.spawn(3, 2.0, { initialPowerUp: 'super' });
  engine.player.grounded = true;
  engine.player.vel.x = 0;
  engine.player.vel.y = 0;
  engine.hitstopFrames = 0;
  return engine;
}

test('VERIFY Test 1: Sproutling stomped from above -> player rebound vy === 11.50 t/s, SQUASHED 56x14px for 15f, +200 popup', () => {
  const engine = createArenaEngine();
  const sprout = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 10.0, 2.0, -1, { turnAtLedges: false });

  // Verify initial Sproutling dimensions (40x44px) & patrol speed (1.25 t/s)
  const aabbPx = sprout.getPixelAABB();
  assert.equal(aabbPx.width, 40, 'Sproutling width should be 40px');
  assert.equal(aabbPx.height, 44, 'Sproutling height should be 44px');
  assert.equal(Math.abs(sprout.vel.x), 1.25, 'Sproutling patrol speed should be 1.25 tiles/s');

  // Position player descending right onto Sproutling top 8px stomp band (no JUMP held)
  const p = engine.player;
  p.pos.x = sprout.centerX - p.currentWidth * 0.5;
  p.pos.y = sprout.pos.y + sprout.height + 0.08;
  p.prevPos.x = p.pos.x;
  p.prevPos.y = p.pos.y + 0.15;
  p.vel.x = 0;
  p.vel.y = -6.0;
  p.grounded = false;

  const scoreBefore = engine.combat.score;
  let stompedFrame = -1;
  let reboundVyAtStomp = null;

  for (let f = 0; f < 10; f++) {
    engine.stepHeadless({});
    if (sprout.state === SproutlingState.SQUASHED && stompedFrame === -1) {
      stompedFrame = f;
      reboundVyAtStomp = p.vel.y;
      break;
    }
  }

  assert.notEqual(stompedFrame, -1, 'Player should stomp Sproutling from above');
  assert.equal(sprout.state, SproutlingState.SQUASHED, 'Sproutling must enter SQUASHED state');
  assert.equal(reboundVyAtStomp, 11.50, 'Standard stomp rebound vy must equal +11.50 tiles/s');
  assert.equal(engine.combat.score - scoreBefore, 200, 'Stomping Sproutling must award 200 points');
  assert.ok(
    engine.combat.popups.some((pop) => pop.text === '+200'),
    'Floating +200 score pop-up must spawn'
  );

  // Verify squashed hitbox dimensions (56x14px)
  const sqPx = sprout.getPixelAABB();
  assert.equal(sqPx.width, 56, 'Squashed Sproutling width must expand to 56px');
  assert.equal(sqPx.height, 14, 'Squashed Sproutling height must compress to 14px');

  // Clear hitstop, then advance 14 frames (still alive), then 15th frame (despawned)
  engine.hitstopFrames = 0;
  for (let f = 0; f < 14; f++) {
    engine.stepHeadless({});
  }
  assert.equal(sprout.active, true, 'Squashed Sproutling should remain visible through frame 14');
  engine.stepHeadless({});
  assert.equal(sprout.active, false, 'Squashed Sproutling must despawn after 15 frames');

  // Also verify JUMP-held rebound (+15.50 tiles/s)
  const sprout2 = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 14.0, 2.0, -1);
  p.pos.x = sprout2.centerX - p.currentWidth * 0.5;
  p.pos.y = sprout2.pos.y + sprout2.height + 0.08;
  p.prevPos.x = p.pos.x;
  p.prevPos.y = p.pos.y + 0.15;
  p.vel.x = 0;
  p.vel.y = -6.0;
  p.grounded = false;

  for (let f = 0; f < 10; f++) {
    engine.stepHeadless({ jump: true });
    if (sprout2.state === SproutlingState.SQUASHED) break;
  }
  assert.equal(sprout2.state, SproutlingState.SQUASHED);
  assert.equal(p.vel.y, 15.50, 'JUMP-held stomp rebound vy must equal +15.50 tiles/s');
});

test('VERIFY Test 2: Hoplite stomped once -> vx === 0, state === DORMANT_SHELL, frame 240 ±2px shake, wakes at frame 300', () => {
  const engine = createArenaEngine();
  const hoplite = engine.combat.spawnEnemy(EnemyKind.HOPLITE, 12.0, 2.0, -1);

  assert.equal(Math.round(hoplite.width * 64), 44, 'Walking Hoplite width should be 44px');
  assert.equal(Math.round(hoplite.height * 64), 44, 'Walking Hoplite height should be 44px');
  assert.equal(Math.abs(hoplite.vel.x), 1.00, 'Walking Hoplite speed should be 1.00 tiles/s');

  // Stomp Hoplite from above
  const p = engine.player;
  p.pos.x = hoplite.centerX - p.currentWidth * 0.5;
  p.pos.y = hoplite.pos.y + hoplite.height + 0.08;
  p.prevPos.x = p.pos.x;
  p.prevPos.y = p.pos.y + 0.15;
  p.vel.x = 0;
  p.vel.y = -6.0;
  p.grounded = false;

  for (let f = 0; f < 10; f++) {
    engine.stepHeadless({});
    if (hoplite.state === HopliteState.DORMANT_SHELL) break;
  }

  assert.equal(hoplite.state, HopliteState.DORMANT_SHELL, 'Hoplite must enter DORMANT_SHELL on first stomp');
  assert.equal(hoplite.vel.x, 0, 'Dormant Hoplite shell vx must equal 0');
  assert.equal(Math.round(hoplite.width * 64), 40, 'Retracted shell width must be 40px');
  assert.equal(Math.round(hoplite.height * 64), 36, 'Retracted shell height must be 36px');

  // Move player away so shell can sit undisturbed for full 300-frame dormancy
  engine.hitstopFrames = 0;
  p.pos.x = 2.5;
  p.pos.y = 2.0;
  p.vel.x = 0;
  p.vel.y = 0;
  p.grounded = true;

  // Step to frame 239: no shake yet
  for (let f = 0; f < 239; f++) engine.stepHeadless({});
  assert.equal(hoplite.state, HopliteState.DORMANT_SHELL);
  assert.equal(hoplite.isTelegraphingWakeup, false, 'Should not shake before frame 240');

  // Frame 240: begins ±2px lateral shake telegraph
  engine.stepHeadless({});
  assert.equal(hoplite.dormancyFrames, 240);
  assert.equal(hoplite.isTelegraphingWakeup, true, 'Must telegraph wakeup shake at frame 240');
  assert.equal(Math.abs(hoplite.wakeupShakeOffsetPx), 2, 'Wakeup shake amplitude must be ±2px');

  // Step remaining 60 frames -> frame 300 wakes up to WALK
  for (let f = 0; f < 60; f++) engine.stepHeadless({});
  assert.equal(hoplite.state, HopliteState.WALK, 'Hoplite must wake back up into WALK at frame 300');
  assert.equal(Math.round(hoplite.width * 64), 44, 'Awakened Hoplite width restores to 44px');
  assert.equal(Math.round(hoplite.height * 64), 44, 'Awakened Hoplite height restores to 44px');
  assert.equal(Math.abs(hoplite.vel.x), 1.00, 'Awakened Hoplite resumes 1.00 t/s walk speed');
});

test('VERIFY Test 3: Hoplite shell kicked into 6 consecutive Sproutlings -> score escalation culminating in 1-UP award', () => {
  const engine = createArenaEngine(64, 16);

  // Place dormant Hoplite shell at x = 8.0 and 6 consecutive Sproutlings ahead to the right
  const hoplite = engine.combat.spawnEnemy(EnemyKind.HOPLITE, 8.0, 2.0, 1, {
    initialState: HopliteState.DORMANT_SHELL,
  });

  const sproutlings = [];
  for (let i = 0; i < 6; i++) {
    sproutlings.push(
      engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 13.0 + i * 2.4, 2.0, -1, { turnAtLedges: false })
    );
  }

  // Player walks right into dormant shell to kick it in facing direction (+1)
  const p = engine.player;
  p.pos.x = 6.4;
  p.pos.y = 2.0;
  p.facingRight = true;
  p.grounded = true;

  const livesBefore = engine.combat.lives;
  let kicked = false;
  let sawOneUpPopup = false;

  for (let f = 0; f < 220; f++) {
    // Walk right until shell is kicked, then stand still and watch the carve-through
    engine.stepHeadless(kicked ? {} : { right: true });
    if (!kicked && hoplite.state === HopliteState.SHELL_MOVING) {
      kicked = true;
      assert.equal(hoplite.vel.x, 12.00, 'Kicked Hoplite shell must launch at +12.00 tiles/s');
    }
    if (engine.combat.popups.some((pop) => pop.text === '1-UP!')) {
      sawOneUpPopup = true;
    }
    if (hoplite.comboCount >= 6) break;
  }

  assert.equal(kicked, true, 'Player walking into dormant shell must kick it');
  assert.equal(hoplite.comboCount, 6, 'Shell must carve through all 6 consecutive Sproutlings');

  for (const sp of sproutlings) {
    assert.equal(sp.state, SproutlingState.LAUNCH_DEATH, 'Each struck Sproutling must enter LAUNCH_DEATH');
    assert.equal(sp.inverted, true, 'Struck Sproutlings must be vertically inverted');
  }

  // Verify exact score escalation chain: 100 (kick) -> 200 -> 400 -> 800 -> 1000 -> 2000 -> 4000 -> 1-UP
  assert.deepEqual(
    hoplite.scoreChainLog,
    [100, 200, 400, 800, 1000, 2000, 4000, '1-UP'],
    'Multi-kill score chain must follow exact escalation culminating in 1-UP'
  );
  assert.equal(hoplite.oneUpAwarded, true, '1-UP flag must be awarded on 6th consecutive kill');
  assert.equal(engine.combat.lives, livesBefore + 1, 'Player lives must increment by 1 on 1-UP');
  assert.equal(sawOneUpPopup, true, 'Floating 1-UP! popup must be spawned');
  assert.equal(engine.combat.score, 100 + 200 + 400 + 800 + 1000 + 2000 + 4000, 'Total score must match exact chain sum');
});

test('VERIFY Test 4: Wall collision for kicked Hoplite shell inverts vx sign, keeps |vx| === 12.00 t/s, no wall embedding, 2px trauma', () => {
  // Build enclosed 12-tile chamber between col 5 (right edge x=6) and col 18 (left edge x=18)
  const engine = createArenaEngine(26, 16, (map) => {
    map.fillRect(5, 2, 1, 5, S);  // left wall: col 5 -> solid [5, 6)
    map.fillRect(18, 2, 1, 5, S); // right wall: col 18 -> solid [18, 19)
  });

  // Park player outside chamber on left
  engine.player.pos.x = 2.0;
  engine.player.pos.y = 2.0;

  const hoplite = engine.combat.spawnEnemy(EnemyKind.HOPLITE, 10.0, 2.0, 1, {
    initialState: HopliteState.DORMANT_SHELL,
  });
  hoplite.kickShell(1, 12.00);
  assert.equal(hoplite.vel.x, 12.00);

  let rightWallBounceSeen = false;
  let leftWallBounceSeen = false;
  let peakTraumaOnBounce = 0;

  for (let f = 0; f < 180; f++) {
    const prevDir = hoplite.dir;
    engine.stepHeadless({});

    // Assert zero embedding into either solid wall on every single 60 Hz tick
    assert.ok(
      hoplite.pos.x >= 6.0 - 1e-4,
      `Shell embedded in left wall: x=${hoplite.pos.x}`
    );
    assert.ok(
      hoplite.pos.x + hoplite.width <= 18.0 + 1e-4,
      `Shell embedded in right wall: right=${hoplite.pos.x + hoplite.width}`
    );

    // Assert exact 100% elastic speed preservation on every tick
    assert.equal(
      Math.abs(hoplite.vel.x),
      12.00,
      `Shell |vx| must remain 12.00 t/s on frame ${f}, got ${hoplite.vel.x}`
    );

    if (prevDir === 1 && hoplite.dir === -1) {
      rightWallBounceSeen = true;
      assert.equal(hoplite.vel.x, -12.00, 'Right wall bounce must invert vx to -12.00');
      peakTraumaOnBounce = Math.max(peakTraumaOnBounce, engine.camera.shake.trauma);
    }
    if (prevDir === -1 && hoplite.dir === 1) {
      leftWallBounceSeen = true;
      assert.equal(hoplite.vel.x, 12.00, 'Left wall bounce must invert vx to +12.00');
    }
  }

  assert.equal(rightWallBounceSeen, true, 'Shell must rebound cleanly off right wall');
  assert.equal(leftWallBounceSeen, true, 'Shell must rebound cleanly off left wall');
  assert.ok(hoplite.bounceCount >= 2, `Expected >=2 bounces, got ${hoplite.bounceCount}`);
  assert.ok(
    peakTraumaOnBounce >= MovementProfile.enemyGallery.hoplite.wallBounceTrauma * 0.9,
    `Wall bounce should trigger 2px camera trauma shake (got trauma=${peakTraumaOnBounce})`
  );
});

test('Sproutling edge detection (turnAtLedges false vs true), 0-frame wall bounce, side damage & fireball launch death', () => {
  // Platform from cols 8..13 at row 5 (surface Y = 6.0)
  const engine = createArenaEngine(36, 16, (map) => {
    map.fillRect(8, 5, 6, 1, S);
    map.fillRect(28, 2, 1, 4, S); // wall for 0-frame wall bounce check
  });

  const patrol = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 12.8, 6.0, 1, { turnAtLedges: true });
  const dropper = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 12.8, 6.0, 1, { turnAtLedges: false });
  const wallBouncer = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 26.8, 2.0, 1, { turnAtLedges: false });

  // Keep player out of the way
  engine.player.pos.x = 2.0;
  engine.player.pos.y = 2.0;

  let wallReversalChecked = false;
  for (let f = 0; f < 100; f++) {
    const prevDir = wallBouncer.dir;
    engine.stepHeadless({});
    if (prevDir === 1 && wallBouncer.dir === -1) {
      assert.equal(wallBouncer.vel.x, -1.25, '0-frame wall bounce must immediately invert vx to -1.25');
      wallReversalChecked = true;
    }
  }

  assert.ok(patrol.pos.y >= 5.95 && patrol.pos.x >= 8.0 && patrol.pos.x <= 14.0, 'turnAtLedges=true Sproutling must stay on platform');
  assert.ok(dropper.pos.y < 4.5, 'turnAtLedges=false Sproutling must walk off ledge');
  assert.equal(wallReversalChecked, true, 'Sproutling must invert direction on solid wall contact');

  // Side contact deals 1 damage point (Super -> Small recoil + i-frames)
  const sideSprout = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 4.0, 2.0, -1);
  engine.player.pos.x = 3.0;
  engine.player.pos.y = 2.0;
  engine.player.powerUpForm = PowerUpForm.SUPER;
  engine.player.invulnerabilityTimer = 0;
  const dmgBefore = engine.combat.damageTakenCount;

  for (let f = 0; f < 40; f++) {
    engine.stepHeadless({});
    if (engine.combat.damageTakenCount > dmgBefore) break;
  }
  assert.equal(engine.combat.damageTakenCount, dmgBefore + 1, 'Side contact must deal 1 damage point');
  assert.equal(engine.player.powerUpForm, PowerUpForm.SMALL, 'Super player must downgrade on 1 damage');
  assert.ok(engine.player.invulnerabilityTimer > 0, 'Damage must trigger invulnerability frames');

  // Fireball strike -> LAUNCH_DEATH (inverted, vx = sign * 2.5, vy = +8.0, falls through floor)
  engine.combat.enemies.length = 0;
  const fbTarget = engine.combat.spawnEnemy(EnemyKind.SPROUTLING, 16.0, 2.0, -1);
  engine.hitstopFrames = 0;
  engine.player.pos.x = 12.0;
  engine.player.pos.y = 2.0;
  engine.player.vel.x = 0;
  engine.player.vel.y = 0;
  engine.player.facingRight = true;
  engine.player.damageRecoilTimer = 0;
  engine.player.invulnerabilityTimer = 0;
  engine.player.powerUpForm = PowerUpForm.FIRE;
  engine.player.fireWindupTimer = 0;
  engine.player.fireCooldownTimer = 0;

  let hitLaunched = false;
  for (let f = 0; f < 45; f++) {
    engine.stepHeadless(f === 0 ? { run: true } : {});
    if (!hitLaunched && fbTarget.state === SproutlingState.LAUNCH_DEATH) {
      hitLaunched = true;
      assert.equal(fbTarget.inverted, true, 'Fireball strike must invert Sproutling');
      assert.equal(fbTarget.vel.x, 2.5, 'Launch Death vx must equal sign * 2.5 tiles/s');
      assert.ok(
        Math.abs(fbTarget.vel.y - (8.0 - MovementProfile.jump.gravityFalling * DT)) < 1e-6,
        `Launch Death vy after 1 tick of gravity must equal 8.0 - g*dt, got ${fbTarget.vel.y}`
      );
    }
  }
  assert.equal(hitLaunched, true, 'Fireball must trigger Sproutling LAUNCH_DEATH');

  // Continue advancing until it falls through the solid floor (Y < 2.0)
  let fellThroughFloor = false;
  for (let f = 0; f < 70; f++) {
    engine.stepHeadless({});
    if (fbTarget.pos.y < 1.5) {
      fellThroughFloor = true;
      break;
    }
  }
  assert.equal(fellThroughFloor, true, 'LAUNCH_DEATH Sproutling must fall through floor with gravity');
});

test('Hoplite Stomp 2 halts moving shell without hurting player + Carry & Throw aligns to player.hands', () => {
  const engine = createArenaEngine(48, 16);
  const p = engine.player;

  // Stomp 2: Moving Hoplite shell stomped from above -> halts cleanly to DORMANT_SHELL without damage
  const moving = engine.combat.spawnEnemy(EnemyKind.HOPLITE, 10.0, 2.0, 1, {
    initialState: HopliteState.DORMANT_SHELL,
  });
  moving.kickShell(1, 12.00);
  moving.kickSafetyTimer = 0;

  p.pos.x = moving.centerX + 0.25 - p.currentWidth * 0.5;
  p.pos.y = moving.pos.y + moving.height + 0.08;
  p.prevPos.x = p.pos.x;
  p.prevPos.y = p.pos.y + 0.15;
  p.vel.x = 0;
  p.vel.y = -6.0;
  p.grounded = false;

  const dmgBefore = engine.combat.damageTakenCount;
  for (let f = 0; f < 8; f++) {
    engine.stepHeadless({});
    if (moving.state === HopliteState.DORMANT_SHELL) break;
  }

  assert.equal(moving.state, HopliteState.DORMANT_SHELL, 'Stomp 2 must halt moving shell back to DORMANT_SHELL');
  assert.equal(moving.vel.x, 0, 'Halted shell vx must equal 0');
  assert.equal(engine.combat.damageTakenCount, dmgBefore, 'Stomping moving shell must not hurt player');

  // Carry & Throw: Hold RUN walking into dormant shell -> aligns to player.hands -> release RUN hurls at 12.00 t/s
  engine.hitstopFrames = 0;
  moving.stompGraceTimer = 0;
  p.pos.x = moving.pos.x - p.currentWidth - 0.15;
  p.pos.y = 2.0;
  p.vel.x = 0;
  p.vel.y = 0;
  p.grounded = true;
  p.facingRight = true;

  let pickedUp = false;
  for (let f = 0; f < 30; f++) {
    engine.stepHeadless({ right: true, run: true });
    if (p.carriedEntity === moving) {
      pickedUp = true;
      break;
    }
  }
  assert.equal(pickedUp, true, 'Holding RUN into dormant Hoplite shell must pick it up');
  assert.equal(moving.state, HopliteState.CARRIED, 'Picked-up Hoplite must enter CARRIED state');

  // Step 1 more frame holding RUN and verify exact alignment to player.hands
  engine.stepHeadless({ run: true });
  const hands = p.hands;
  assert.ok(
    Math.abs(moving.centerX - hands.x) < 1e-4 && Math.abs(moving.pos.y - hands.y) < 1e-4,
    `Carried Hoplite (${moving.centerX.toFixed(3)}, ${moving.pos.y.toFixed(3)}) must align to player.hands (${hands.x.toFixed(3)}, ${hands.y.toFixed(3)})`
  );

  // Release RUN -> hurls shell at 12.00 t/s
  engine.stepHeadless({});
  assert.equal(p.carriedEntity, null, 'Releasing RUN must release carried shell');
  assert.equal(moving.state, HopliteState.SHELL_MOVING, 'Thrown Hoplite must enter SHELL_MOVING');
  assert.equal(moving.vel.x, 12.00, 'Thrown Hoplite shell must launch at 12.00 tiles/s');
});

test('Enemy Sprite Generation Matrix defines explicit frame counts and dimensions for all Sproutling & Hoplite actions', () => {
  const s = ENEMY_SPRITE_MATRIX.sproutling.actions;
  assert.equal(s.walk.frames, 4);
  assert.equal(s.walk.loop, true);
  assert.equal(s.walk.frameWidth, 40);
  assert.equal(s.walk.frameHeight, 44);
  assert.equal(s.squash.frames, 2);
  assert.equal(s.squash.frameWidth, 56);
  assert.equal(s.squash.frameHeight, 14);
  assert.equal(s.launch_death.frames, 1);
  assert.equal(s.launch_death.inverted, true);

  const h = ENEMY_SPRITE_MATRIX.hoplite.actions;
  assert.equal(h.walk.frames, 4);
  assert.equal(h.walk.loop, true);
  assert.equal(h.walk.frameWidth, 44);
  assert.equal(h.walk.frameHeight, 44);
  assert.equal(h.retract.frames, 2);
  assert.equal(h.shell_idle.frames, 1);
  assert.equal(h.shell_idle.frameWidth, 40);
  assert.equal(h.shell_idle.frameHeight, 36);
  assert.equal(h.shell_spin.frames, 4);
  assert.equal(h.shell_spin.loop, true);
  assert.equal(h.wakeup_shake.frames, 2);
  assert.equal(h.wakeup_shake.shakePx, 2);
});
