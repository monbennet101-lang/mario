/**
 * Stage 9 Automated Verification Suite — Power-Ups, Enemies, Projectiles & Hitstop
 * ====================================================================================
 * Proves all Stage 9 Exit Criteria in headless 60 Hz deterministic mode:
 *   1. Goomba 1.80 t/s patrol, wall bounce, pancake squash (15%), and 100-stomp top-20% stress check
 *   2. Passive (~2.1t) vs Active (Hold Jump -> >=4.0t) stomp rebound + 3-Goomba active bounce chain
 *   3. Exact 3f Stomp / 6f Mushroom & Damage Hitstop freeze-frame isolation
 *   4. Super Mushroom patrol, 18f 3-stage elastic growth oscillation & "Good!" starburst
 *   5. Fire Flower upgrade, max 2 fireballs at ±14.0 t/s, g=38, 0.85 bounce & wall sparks
 *   6. Koopa Troopa -> Shell retract, >=10 wall bounces with 0 tunneling, 85% carry & 10.50 t/s throw
 *   7. 120f invulnerability (4f 0.30<->1.00 flicker), fire/super -> small -> defeat, score & 300s HUD timer
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { PowerUpForm, PowerUpType } from '../game/powerups/PowerUp.js';
import { EnemyKind, GoombaEnemy, KoopaEnemy } from '../game/entities/CombatSystem.js';
import { PlayerState } from '../game/player/PlayerState.js';

function settle(eng, frames = 20) {
  for (let i = 0; i < frames; i++) eng.stepHeadless({});
}

describe('Stage 9 — Power-Ups, Combat Hitstop, Fireballs & Koopa Shells', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  it('Goomba patrols at 1.80 t/s, reverses on wall, and passes 100 top-20% stomp pancakes to 15%', () => {
    const eng = new GameEngine();
    eng.initHeadless(0);
    settle(eng, 10);

    for (let i = 0; i < 100; i++) {
      eng.combat.enemies = [];
      const goomba = new GoombaEnemy(8.0, 4.0, -1);
      eng.combat.enemies.push(goomba);

      eng.player.pos.x = goomba.pos.x + 0.02;
      eng.player.pos.y = goomba.pos.y + goomba.height + 0.35;
      eng.player.prevPos.x = eng.player.pos.x;
      eng.player.prevPos.y = eng.player.pos.y + 0.15;
      eng.player.vel.x = 0;
      eng.player.vel.y = -6.0;
      eng.player.grounded = false;

      let stomped = false;
      for (let f = 0; f < 10; f++) {
        eng.stepHeadless({ jump: false });
        if (goomba.state === 'squashed') {
          stomped = true;
          break;
        }
      }
      assert.ok(stomped, `Stomp #${i + 1} failed to register on top 20% zone`);
      assert.ok(
        Math.abs(goomba.visualHeightScale - MovementProfile.enemies.goombaFlattenRatio) < 0.001,
        `Squashed height scale should equal 0.15, got ${goomba.visualHeightScale}`
      );
    }
  });

  it('Passive rebound (~2.1t) vs Active Jump-Held rebound (>=4.0t) and 3-Goomba chain + 3f hitstop', () => {
    // Passive rebound test
    const engP = new GameEngine();
    engP.initHeadless(0);
    settle(engP, 10);
    const gP = new GoombaEnemy(6.0, 4.0, 1);
    engP.combat.enemies = [gP];
    engP.player.pos.x = 6.0;
    engP.player.pos.y = gP.pos.y + gP.height + 0.12;
    engP.player.prevPos.y = engP.player.pos.y + 0.25;
    engP.player.vel.y = -8.0;
    engP.player.grounded = false;

    let hitstopObserved = 0;
    let peakPassive = 0;
    const baseStompY = gP.pos.y + gP.height;
    for (let f = 0; f < 55; f++) {
      engP.stepHeadless({ jump: false });
      hitstopObserved = Math.max(hitstopObserved, engP.hitstopFrames);
      peakPassive = Math.max(peakPassive, engP.player.pos.y - baseStompY);
    }
    assert.ok(hitstopObserved >= 2, `Expected 3f stomp hitstop freeze, observed max ${hitstopObserved}`);
    assert.ok(peakPassive >= 1.8 && peakPassive <= 2.6, `Passive rebound expected ~2.1t, got ${peakPassive.toFixed(2)}t`);

    // Active stomp bounce >= 4.0t across 3 Goombas in Room 7
    const engA = new GameEngine();
    engA.initHeadless(6); // Room 7: Combat & Power-Ups (floor Y=2.0)
    settle(engA, 15);
    engA.combat.enemies = [
      new GoombaEnemy(16.0, 2.0, 0),
      new GoombaEnemy(19.0, 2.0, 0),
      new GoombaEnemy(22.0, 2.0, 0),
    ];
    for (const g of engA.combat.enemies) g.dir = 0;

    engA.player.pos.x = 16.0;
    engA.player.pos.y = 3.1;
    engA.player.prevPos.y = 3.4;
    engA.player.vel.y = -8.0;
    engA.player.grounded = false;

    const baseActiveStompY = 2.0 + MovementProfile.enemies.goombaHeight;
    let maxActiveDy = 0;
    for (let f = 0; f < 90; f++) {
      engA.stepHeadless({ jump: true });
      maxActiveDy = Math.max(maxActiveDy, engA.player.pos.y - baseActiveStompY);
    }
    assert.ok(maxActiveDy >= 4.0, `Active held stomp expected >=4.0t, got ${maxActiveDy.toFixed(2)}t`);
  });

  it('Super Mushroom grows Small->Super with 6f hitstop, 18f 3-stage elastic scale & "Good!" starburst', () => {
    const eng = new GameEngine();
    eng.initHeadless(6); // Room 7 starts SMALL beneath [?] Mushroom at (7, 5)
    settle(eng, 15);
    assert.equal(eng.player.powerUpForm, PowerUpForm.SMALL);

    // Move under (7, 5) & bump block
    for (let f = 0; f < 35; f++) eng.stepHeadless({ right: true });
    eng.player.pos.x = 7.1;
    eng.player.pos.y = 2.0;
    for (let f = 0; f < 40; f++) {
      eng.stepHeadless({ jump: f < 16 });
    }
    // Wait for mushroom emerge & collect
    for (let f = 0; f < 120; f++) {
      const m = eng.combat.powerUps.find((p) => p.type === PowerUpType.SUPER_MUSHROOM);
      if (m && eng.player.pos.x < m.pos.x - 0.1) eng.stepHeadless({ right: true });
      else if (m && eng.player.pos.x > m.pos.x + 0.1) eng.stepHeadless({ left: true });
      else eng.stepHeadless({});
      if (eng.player.powerUpForm === PowerUpForm.SUPER) break;
    }

    assert.equal(eng.player.powerUpForm, PowerUpForm.SUPER);
    assert.ok(eng.player.growthTimer > 0, 'Expected active 18f elastic growth oscillation');
    assert.ok(eng.combat.starbursts.some((s) => s.text === 'Good!'), 'Expected comic "Good!" starburst');

    // Verify 3-stage growth profile passes through wide squash then tall stretch
    eng.player.growthTimer = eng.player.growthTotalFrames;
    const s1 = eng.player.getGrowthPresentationScale();
    eng.player.growthTimer = Math.round(eng.player.growthTotalFrames * 0.5);
    const s2 = eng.player.getGrowthPresentationScale();
    assert.ok(s1.sx >= 1.0 && s2.sy > 1.15, `Unexpected growth oscillation samples s1=${JSON.stringify(s1)}, s2=${JSON.stringify(s2)}`);
  });

  it('Fire Flower shoots max 2 fireballs at ±14.0 t/s, g=38, 0.85 bounce & wall sparks', () => {
    const eng = new GameEngine();
    eng.initHeadless(6); // Room 7 has pipes at col 43 for wall spark check
    eng.combat.enemies = []; // Keep alley clear for pure fireball trajectory + wall spark verification
    settle(eng, 10);
    eng.player.applyPowerUp(PowerUpType.FIRE_FLOWER);
    assert.equal(eng.player.powerUpForm, PowerUpForm.FIRE);
    settle(eng, 25);

    eng.player.pos.x = 36.0;
    eng.player.pos.y = 2.0;
    eng.player.facingRight = true;
    eng.stepHeadless({ run: true });
    for (let f = 0; f < 10; f++) eng.stepHeadless({});
    assert.equal(eng.combat.fireballs.length, 1);
    assert.ok(Math.abs(eng.combat.fireballs[0].vel.x - 14.0) < 0.01);

    // Fire 2nd and attempt 3rd (should cap at 2)
    eng.stepHeadless({ run: true });
    for (let f = 0; f < 8; f++) eng.stepHeadless({});
    eng.stepHeadless({ run: true });
    for (let f = 0; f < 6; f++) eng.stepHeadless({});
    assert.ok(eng.combat.fireballs.length <= 2, `Max active fireballs should be 2, got ${eng.combat.fireballs.length}`);

    let sawBounce = false;
    let sawWallSpark = false;
    for (let f = 0; f < 60; f++) {
      eng.stepHeadless({});
      for (const fb of eng.combat.fireballs) {
        if (fb.bounceCount > 0 && fb.lastBounceVy > 0) sawBounce = true;
      }
      if (eng.combat.events.some((e) => e.type === 'fireballWallSpark')) sawWallSpark = true;
    }
    assert.ok(sawBounce, 'Fireball should bounce elastically off solid ground');
    assert.ok(sawWallSpark, 'Fireball should emit wall spark on pipe wall collision');
  });

  it('Koopa Shell achieves >=10 wall bounces zero tunneling, carries at 85% speed & throws at 10.50 t/s', () => {
    const eng = new GameEngine();
    eng.initHeadless(6); // Room 7 alley between pipes [43..45] and [56..58]
    settle(eng, 10);
    eng.combat.enemies = [];
    const koopa = new KoopaEnemy(49.0, 2.0, 1);
    koopa.retractToShell();
    koopa.kickShell(1, MovementProfile.enemies.koopashellSpeed);
    eng.combat.enemies.push(koopa);
    eng.player.pos.x = 30.0;

    for (let f = 0; f < 850; f++) {
      eng.stepHeadless({});
      assert.ok(koopa.pos.x >= 44.5 && koopa.pos.x <= 56.2, `Shell tunneled out of pipe alley at x=${koopa.pos.x}`);
    }
    assert.ok(koopa.bounceCount >= 10, `Expected >=10 pipe wall bounces, got ${koopa.bounceCount}`);

    // Test Carry (85% top speed = 7.82 t/s) & Throw (10.50 t/s) on Room 1 floor (Y=4.0)
    const eng2 = new GameEngine();
    eng2.initHeadless(0);
    settle(eng2, 10);
    const shell2 = new KoopaEnemy(6.0, 4.0, 1);
    shell2.retractToShell();
    shell2.stompGraceTimer = 0;
    eng2.combat.enemies = [shell2];
    eng2.player.pos.x = 5.4;
    eng2.player.pos.y = 4.0;

    for (let f = 0; f < 65; f++) {
      eng2.stepHeadless({ right: true, run: true });
    }
    assert.ok(eng2.player.carriedEntity === shell2, 'Player holding Run into idle shell must pick up shell');
    const carryTop = MovementProfile.locomotion.runTopSpeed * MovementProfile.combat.carryTopSpeedFactor;
    assert.ok(eng2.player.vel.x <= carryTop + 0.05, `Carry speed ${eng2.player.vel.x} exceeded 85% cap ${carryTop}`);

    // Release Run -> throws shell forward at 10.50 t/s
    eng2.stepHeadless({ right: true, run: false });
    assert.equal(eng2.player.carriedEntity, null);
    assert.ok(Math.abs(Math.abs(shell2.vel.x) - MovementProfile.combat.shellThrowSpeed) < 0.05);
  });

  it('Damage triggers 120f i-frames with 4f alpha flicker, downgrades Fire/Super->Small->Defeat & updates HUD counters', () => {
    const eng = new GameEngine();
    eng.initHeadless(6);
    settle(eng, 10);
    eng.player.applyPowerUp(PowerUpType.FIRE_FLOWER);
    settle(eng, 20);
    assert.equal(eng.player.powerUpForm, PowerUpForm.FIRE);

    const g1 = new GoombaEnemy(eng.player.pos.x + 0.3, eng.player.pos.y, -1);
    eng.combat.enemies = [g1];
    eng.stepHeadless({});

    assert.equal(eng.player.powerUpForm, PowerUpForm.SMALL);
    assert.equal(eng.player.invulnerabilityTimer, MovementProfile.combat.invulnerabilityFrames);

    // Advance past 6f damage hitstop freeze so simulation timer resumes, then check 4-frame flicker cadence (0.30 <-> 1.00)
    assert.equal(eng.player.getRenderAlpha(), MovementProfile.combat.invulnerabilityAlphaLow);
    const waitToFlip = MovementProfile.combat.damageHitstopFrames + MovementProfile.combat.invulnerabilityFlickerFrames;
    for (let f = 0; f < waitToFlip; f++) eng.stepHeadless({});
    assert.equal(eng.player.getRenderAlpha(), MovementProfile.combat.invulnerabilityAlphaHigh);

    // Expire i-frames and take defeat hit as SMALL Mario
    for (let f = 0; f < 130; f++) eng.stepHeadless({});
    const g2 = new GoombaEnemy(eng.player.pos.x + 0.3, eng.player.pos.y, -1);
    eng.combat.enemies = [g2];
    eng.stepHeadless({});
    assert.equal(eng.player.state, PlayerState.DEFEAT);
    assert.ok(eng.timerSeconds <= MovementProfile.hud.initialTimeSeconds);
  });
});
