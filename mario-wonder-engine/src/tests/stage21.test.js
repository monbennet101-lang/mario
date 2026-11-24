/**
 * Stage 21 Automated Verification & End-to-End Acceptance Suite
 * =============================================================
 * Proves:
 *  1. Dread-Shell Golem 3-Phase Boss Encounter in enclosed 20-tile stone chamber:
 *     - Phase 1: Patrol -> Leap -> exact 20f Hover -> Slam (+0.8 trauma, jump-dodgeable
 *       room-wide ground shockwaves, dormant Hoplite shell spawn, core exposed) -> Strike 1
 *     - Phase 2: Warning crimson carapace -> spiked boulder Spin Dash at exact 14.0 tiles/s
 *       rebounding off chamber walls while player evades on upper wall-jump alcove ->
 *       Steam Exhaust Cooldown -> shell drop -> Strike 2
 *     - Phase 3: Arena ceiling physically drops by exact 2 tiles in TileMap (14 -> 12),
 *       twin-shell slam spawns -> Strike 3 shatters Golem into harmless geometric debris,
 *       opens right blast door, unlocks World Exit Portal, fires Victory Fanfare
 *  2. Full End-to-End Playthrough & Lifecycle State Machine:
 *     - All 7 states (TITLE_SCREEN, LEVEL_INTRO, GAMEPLAY_ACTIVE, PAUSE_MENU,
 *       PLAYER_DEATH_RESPAWN, GAME_OVER, STAGE_CLEAR) with deterministic screen wipes & audio ducking
 *     - Seamless zero-crash campaign run: TITLE_SCREEN -> 1-1 -> 1-2 -> 1-3 -> 1-4 Boss -> Victory Screen
 *  3. Clean Demo Packaging & Release Build:
 *     - Self-contained dist/ (dist/index.html, dist/bundle.js, dist/assets/)
 *     - Total uncompressed bundle size strictly < 1.5 MB (< 1,572,864 bytes)
 *     - Local file:// compatibility (classic defer script, relative ./ paths, zero crossorigin/CDNs)
 *     - 100% legal clearance (zero .glb/copyrighted assets, zero third-party Nintendo IP strings)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import { BossPhase, BossState } from '../entities/boss.js';
import { HopliteState } from '../game/entities/EnemyArchetypes.js';
import { GameLifecycleState, WORLD1_CAMPAIGN_COURSES } from '../core/gameLoop.js';
import { PlayerState } from '../game/player/PlayerState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../../../dist');

function findActiveHopliteShell(engine) {
  return engine.combat.enemies.find(
    (e) => e.active && e.type === 'hoplite' && e.state === HopliteState.DORMANT_SHELL
  );
}

/**
 * Deterministically position and kick a dormant Hoplite shell cleanly into the Golem's exposed core.
 */
function kickShellIntoExposedCore(engine, stepFn) {
  const g = engine.boss.golem;
  assert.ok(g && g.isVulnerableToShell, 'Golem must have core exposed before shell kick');

  const shell = findActiveHopliteShell(engine);
  assert.ok(shell, 'A dormant Hoplite shell must be spawned in the boss chamber');

  // Settle shell on floor & place player on the side opposite the Golem to kick toward core
  const kickDir = g.centerX >= shell.centerX ? 1 : -1;
  shell.pos.y = engine.boss.floorY;
  shell.vel.y = 0;
  shell.grounded = true;
  shell.kickShell(kickDir);

  let struck = false;
  for (let f = 0; f < 160; f++) {
    stepFn({});
    if (engine.boss.events.some((ev) => ev.type === 'bossCoreStrike')) {
      struck = true;
      break;
    }
  }
  assert.equal(struck, true, 'Kicked Hoplite shell must impact the Golem exposed power core');
}

describe('Stage 21 — Dread-Shell Golem Boss, Full Game Lifecycle, & Clean Release Build', () => {
  it('1. Dread-Shell Golem executes full 3-phase battle (20f hover slam, 14.0 t/s spin dash, 2t ceiling drop, twin shells, shatter & Exit Portal)', () => {
    resetMovementProfile();
    const engine = new GameEngine();
    const bossRoomIndex = engine.rooms.findIndex((r) => r.id === '1-4-dread-shell-sanctum');
    assert.ok(bossRoomIndex >= 0, 'Room 15 (1-4-dread-shell-sanctum) must be registered');
    engine.initHeadless(bossRoomIndex);

    const boss = engine.boss;
    const cfg = MovementProfile.boss;
    const { tileTypes } = MovementProfile;

    // Verify enclosed 20-tile stone chamber & closed blast doors
    assert.equal(boss.active, true, 'Boss encounter must activate on Room 15 load');
    assert.equal(boss.arenaRightX - boss.arenaLeftX, 20, 'Stone chamber interior width must be exactly 20 tiles');
    assert.equal(boss.leftDoorClosed, true, 'Left blast door must be closed during encounter');
    assert.equal(boss.rightDoorClosed, true, 'Right blast door must be closed during encounter');
    assert.equal(boss.ceilingY, 14, 'Initial chamber ceiling must be at y = 14');
    assert.equal(boss.exitPortal.unlocked, false, 'World Exit Portal must remain locked until Boss defeat');

    // Verify upper wall-jump alcoves exist at y = 7
    assert.equal(engine.tilemap.get(2, 7), tileTypes.SEMISOLID, 'Left upper alcove must exist at y = 7');
    assert.equal(engine.tilemap.get(20, 7), tileTypes.SEMISOLID, 'Right upper alcove must exist at y = 7');

    // ── PHASE 1: Patrol -> Leap -> Exact 20-frame Hover -> Slam -> Shockwave Jump Dodge -> Shell Strike 1 ──
    assert.equal(boss.golem.phase, BossPhase.PHASE_1_SLAM);
    assert.equal(boss.golem.hp, 3);

    // Move player to safe left side to observe hover & jump-dodge shockwave
    engine.player.pos.x = boss.arenaLeftX + 1.5;
    engine.player.pos.y = boss.floorY;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    let hoverFrameCount = 0;
    let sawSlamEvent = false;
    let slamTraumaPeak = 0;
    let sawBilateralShockwaves = false;
    let jumpedOverShockwave = false;
    const livesBeforeShockwave = engine.combat.lives;

    for (let f = 0; f < 320; f++) {
      // Jump cleanly when a left-moving shockwave approaches the player
      const incoming = boss.shockwaves.find(
        (sw) => sw.active && sw.dir < 0 && sw.x - (engine.player.pos.x + engine.player.width) < 2.2 && sw.x + sw.width > engine.player.pos.x - 0.5
      );
      const shouldJump = Boolean(incoming && engine.player.grounded);
      engine.stepHeadless({ jump: shouldJump || (!engine.player.grounded && engine.player.vel.y > 0) });

      if (boss.golem.state === BossState.HOVER) {
        hoverFrameCount++;
      }
      if (boss.events.some((ev) => ev.type === 'bossGroundSlam')) {
        sawSlamEvent = true;
        slamTraumaPeak = Math.max(slamTraumaPeak, engine.juice.trauma.trauma);
      }
      if (boss.shockwaves.length >= 2) {
        sawBilateralShockwaves = true;
      }
      if (
        !engine.player.grounded &&
        boss.shockwaves.some((sw) => sw.active && Math.abs(sw.x - engine.player.pos.x) < 1.2 && engine.player.pos.y > sw.y + sw.height)
      ) {
        jumpedOverShockwave = true;
      }

      if (boss.golem.state === BossState.VULNERABLE && boss.golem.coreExposed && boss.shockwaves.length === 0) {
        break;
      }
    }

    assert.equal(hoverFrameCount, cfg.hoverFrames, `Golem Phase 1 hover must last exact ${cfg.hoverFrames} frames`);
    assert.equal(sawSlamEvent, true, 'Golem must execute ground slam after 20f hover');
    assert.ok(slamTraumaPeak >= 0.75, `Boss ground slam must inject ~0.8 trauma (got ${slamTraumaPeak.toFixed(2)})`);
    assert.equal(sawBilateralShockwaves, true, 'Slam must emit room-wide bilateral ground shockwaves');
    assert.equal(jumpedOverShockwave, true, 'Player must be able to jump cleanly over ground shockwaves');
    assert.equal(engine.combat.lives, livesBeforeShockwave, 'Jumping over shockwave must deal zero damage');
    assert.equal(boss.golem.coreExposed, true, 'Golem power core must be exposed during vulnerability window');
    assert.ok(findActiveHopliteShell(engine), 'Slam must drop a dormant Hoplite shell into the arena');

    // Deliver Strike 1 -> Phase 2
    kickShellIntoExposedCore(engine, (a) => engine.stepHeadless(a));
    assert.equal(boss.golem.hp, 2, 'Strike 1 must reduce Golem HP from 3 to 2');
    assert.equal(boss.golem.phase, BossPhase.PHASE_2_SPIN_DASH, 'Strike 1 must transition Golem to Phase 2');
    assert.equal(boss.golem.carapaceGlow, 'crimson', 'Phase 2 carapace must glow warning crimson');

    // ── PHASE 2: Enraged Spin Dash (14.0 tiles/s) + Alcove Evasion + Steam Exhaust Cooldown -> Strike 2 ──
    // Place player perched on left upper wall-jump alcove top surface (alcoveY + 1 = 8.0) to evade floor Spin Dash
    engine.player.pos.x = boss.arenaLeftX + 0.6;
    engine.player.pos.y = cfg.alcoveY + 1;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    let sawSpikedBoulder = false;
    let peakSpinDashSpeed = 0;
    let wallSlamCount = 0;
    let enteredSteamCooldown = false;

    for (let f = 0; f < 460; f++) {
      engine.stepHeadless({});
      if (boss.golem.state === BossState.SPIN_DASH) {
        if (boss.golem.isSpikedBoulder) sawSpikedBoulder = true;
        peakSpinDashSpeed = Math.max(peakSpinDashSpeed, Math.abs(boss.golem.vel.x));
      }
      if (boss.events.some((ev) => ev.type === 'bossWallSlam')) {
        wallSlamCount++;
      }
      if (boss.golem.state === BossState.STEAM_COOLDOWN && boss.golem.coreExposed) {
        enteredSteamCooldown = true;
        break;
      }
    }

    assert.equal(sawSpikedBoulder, true, 'Phase 2 must retract Golem into spiked boulder');
    assert.ok(
      Math.abs(peakSpinDashSpeed - cfg.spinDashSpeed) < 0.01,
      `Phase 2 Spin Dash speed must equal exact 14.0 tiles/s (got ${peakSpinDashSpeed.toFixed(2)})`
    );
    assert.ok(wallSlamCount >= cfg.spinDashBounces, `Spin Dash must rebound across chamber walls (got ${wallSlamCount})`);
    assert.equal(enteredSteamCooldown, true, 'Golem must enter Steam Exhaust Cooldown after Spin Dash');
    assert.equal(engine.player.state !== PlayerState.DEFEAT, true, 'Player evading on upper alcove must survive Spin Dash untouched');
    assert.ok(findActiveHopliteShell(engine), 'Steam Exhaust Cooldown must drop a dormant Hoplite shell');

    // Deliver Strike 2 -> Phase 3 Overdrive Climax + 2-tile Ceiling Drop
    kickShellIntoExposedCore(engine, (a) => engine.stepHeadless(a));
    assert.equal(boss.golem.hp, 1, 'Strike 2 must reduce Golem HP from 2 to 1');
    assert.equal(boss.golem.phase, BossPhase.PHASE_3_OVERDRIVE, 'Strike 2 must transition Golem to Phase 3');
    assert.equal(boss.ceilingDropApplied, true, 'Phase 3 must trigger physical arena ceiling drop');
    assert.equal(boss.ceilingY, 12, 'Arena ceiling must drop by exact 2 tiles (14 -> 12)');
    assert.equal(engine.tilemap.get(10, 12), tileTypes.SOLID, 'Dropped ceiling row y = 12 must be SOLID in TileMap');
    assert.equal(engine.tilemap.get(10, 13), tileTypes.SOLID, 'Dropped ceiling row y = 13 must be SOLID in TileMap');

    // ── PHASE 3: Overdrive Climax (Twin-Shell Spawns) -> Strike 3 Shatter -> Harmless Debris & Exit Portal ──
    engine.player.pos.x = boss.arenaLeftX + 0.6;
    engine.player.pos.y = cfg.alcoveY + 1;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    let sawTwinShellSpawn = false;
    for (let f = 0; f < 340; f++) {
      engine.stepHeadless({});
      const dormantCount = engine.combat.enemies.filter(
        (e) => e.active && e.type === 'hoplite' && e.state === HopliteState.DORMANT_SHELL
      ).length;
      if (dormantCount >= 2) {
        sawTwinShellSpawn = true;
      }
      if (boss.golem.state === BossState.VULNERABLE && boss.golem.coreExposed && dormantCount >= 2) {
        break;
      }
    }
    assert.equal(sawTwinShellSpawn, true, 'Phase 3 Overdrive slam must spawn twin Hoplite shells (>= 2 dormant shells)');

    // Deliver Strike 3 -> Shatter into harmless geometric debris & unlock World Exit Portal
    let sawDefeatedEvent = false;
    const shell3 = findActiveHopliteShell(engine);
    const kickDir3 = boss.golem.centerX >= shell3.centerX ? 1 : -1;
    shell3.pos.y = boss.floorY;
    shell3.vel.y = 0;
    shell3.grounded = true;
    shell3.kickShell(kickDir3);

    for (let f = 0; f < 160; f++) {
      engine.stepHeadless({});
      if (boss.events.some((ev) => ev.type === 'bossDefeated')) {
        sawDefeatedEvent = true;
        break;
      }
    }

    assert.equal(sawDefeatedEvent, true, 'Strike 3 must emit bossDefeated event & play Victory Fanfare');
    assert.equal(boss.golem.hp, 0);
    assert.equal(boss.golem.defeated, true);
    assert.equal(boss.golem.state, BossState.SHATTERED);
    assert.ok(boss.debris.length >= cfg.debrisCount, `Golem shatter must emit >= ${cfg.debrisCount} geometric debris shards`);
    assert.ok(boss.debris.every((d) => d.harmless === true), 'Every shatter debris shard must be harmless');
    assert.equal(boss.exitPortal.unlocked, true, 'World Exit Portal must unlock upon Boss defeat');
    assert.equal(boss.rightDoorClosed, false, 'Right blast door must open upon Boss defeat');
    assert.equal(engine.tilemap.get(boss.arenaRightX, boss.floorY), tileTypes.EMPTY, 'Right blast door TileMap passage must open');

    // Walk player through harmless debris into the unlocked World Exit Portal
    engine.player.pos.x = boss.exitPortal.x - 1.2;
    engine.player.pos.y = boss.floorY;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;
    const prePortalLives = engine.combat.lives;

    let enteredPortal = false;
    for (let f = 0; f < 90; f++) {
      engine.stepHeadless({ right: true });
      if (boss.exitPortal.entered && engine.levelKit.courseCleared) {
        enteredPortal = true;
        break;
      }
    }

    assert.equal(enteredPortal, true, 'Walking into unlocked World Exit Portal must complete the boss course');
    assert.equal(engine.combat.lives, prePortalLives, 'Harmless debris shards must deal zero damage to the player');
  });

  it('2. End-to-End Playthrough: TITLE_SCREEN -> 1-1 -> 1-2 -> 1-3 -> 1-4 Boss -> Victory Screen + Pause, Ducking, Death & Game Over', () => {
    resetMovementProfile();
    const engine = new GameEngine();
    engine.initCampaignHeadless();

    const lc = engine.lifecycle;
    const cfg = MovementProfile.lifecycle;

    // 1. Title Screen initial state & audio ducking
    assert.equal(lc.state, GameLifecycleState.TITLE_SCREEN);
    assert.equal(lc.isSimulationAllowed, false, 'Simulation must stay gated on TITLE_SCREEN');
    assert.equal(engine.audio.duckingFactor, cfg.duckMenuGain, 'Title screen must duck audio to 0.35');

    // 2. Start Campaign -> smooth iris screen wipe -> LEVEL_INTRO (1-1) -> GAMEPLAY_ACTIVE
    engine.startCampaign(0);
    assert.equal(lc.wipe.phase, 'closing', 'startCampaign must trigger smooth closing screen wipe');

    let sawHold = false;
    let sawOpening = false;
    let sawLevelIntro = false;
    for (let f = 0; f < 160; f++) {
      engine.stepCampaignHeadless({});
      if (lc.wipe.phase === 'hold') sawHold = true;
      if (lc.wipe.phase === 'opening') sawOpening = true;
      if (lc.state === GameLifecycleState.LEVEL_INTRO) sawLevelIntro = true;
      if (lc.state === GameLifecycleState.GAMEPLAY_ACTIVE && lc.wipe.phase === 'none') break;
    }

    assert.equal(sawHold, true, 'Screen wipe must pass cleanly through hold peak');
    assert.equal(sawOpening, true, 'Screen wipe must open cleanly after loading course');
    assert.equal(sawLevelIntro, true, 'Campaign start must transition through LEVEL_INTRO');
    assert.equal(lc.state, GameLifecycleState.GAMEPLAY_ACTIVE, 'LEVEL_INTRO must auto-enter GAMEPLAY_ACTIVE');
    assert.equal(engine.currentRoom.courseCode, '1-1', 'Campaign must begin on Course 1-1');
    assert.equal(engine.audio.duckingFactor, cfg.duckActiveGain, 'Active gameplay must restore full audio gain (1.0)');

    // 3. Pause Menu toggle & audio ducking
    engine.togglePause();
    assert.equal(lc.state, GameLifecycleState.PAUSE_MENU);
    assert.equal(engine.audio.duckingFactor, cfg.duckMenuGain, 'PAUSE_MENU must duck audio cleanly');
    const pausedX = engine.player.pos.x;
    for (let f = 0; f < 15; f++) engine.stepCampaignHeadless({ right: true });
    assert.equal(engine.player.pos.x, pausedX, 'Player simulation must remain strictly frozen while in PAUSE_MENU');

    engine.togglePause();
    assert.equal(lc.state, GameLifecycleState.GAMEPLAY_ACTIVE);
    assert.equal(engine.audio.duckingFactor, cfg.duckActiveGain, 'Resuming from pause must restore 1.0 audio gain');

    // 4. Death -> PLAYER_DEATH_RESPAWN (respawn) -> Final Death -> GAME_OVER
    engine.combat.lives = 2;
    engine.player.defeatTriggerReset = true;
    engine.stepCampaignHeadless({});
    assert.equal(lc.state, GameLifecycleState.PLAYER_DEATH_RESPAWN, 'Player defeat must enter PLAYER_DEATH_RESPAWN');
    assert.equal(engine.combat.lives, 1, 'Defeat must decrement lives from 2 to 1');

    // Advance respawn sequence -> returns to LEVEL_INTRO -> GAMEPLAY_ACTIVE on 1-1
    for (let f = 0; f < 220; f++) {
      engine.stepCampaignHeadless({});
      if (lc.state === GameLifecycleState.GAMEPLAY_ACTIVE && lc.wipe.phase === 'none') break;
    }
    assert.equal(lc.state, GameLifecycleState.GAMEPLAY_ACTIVE, 'Respawn with lives > 0 must return to active gameplay');
    assert.equal(engine.currentRoom.courseCode, '1-1');

    // Lose final life -> GAME_OVER
    engine.player.defeatTriggerReset = true;
    engine.stepCampaignHeadless({});
    assert.equal(lc.state, GameLifecycleState.PLAYER_DEATH_RESPAWN);
    assert.equal(engine.combat.lives, 0);

    for (let f = 0; f < 180; f++) {
      engine.stepCampaignHeadless({});
      if (lc.state === GameLifecycleState.GAME_OVER && lc.wipe.phase === 'none') break;
    }
    assert.equal(lc.state, GameLifecycleState.GAME_OVER, 'Zero remaining lives must transition to GAME_OVER');
    assert.equal(engine.audio.duckingFactor, cfg.duckMenuGain, 'GAME_OVER must duck audio');

    // Return to Title Screen -> Start fresh full World 1 playthrough (1-1 -> 1-2 -> 1-3 -> 1-4 Boss -> Victory)
    engine.returnToTitle();
    for (let f = 0; f < 90; f++) {
      engine.stepCampaignHeadless({});
      if (lc.state === GameLifecycleState.TITLE_SCREEN && lc.wipe.phase === 'none') break;
    }
    assert.equal(lc.state, GameLifecycleState.TITLE_SCREEN);

    engine.startCampaign(0);
    const waitActive = () => {
      for (let f = 0; f < 180; f++) {
        engine.stepCampaignHeadless({});
        if (lc.state === GameLifecycleState.GAMEPLAY_ACTIVE && lc.wipe.phase === 'none') return;
      }
      throw new Error(`Timed out waiting for GAMEPLAY_ACTIVE (state=${lc.state}, wipe=${lc.wipe.phase})`);
    };

    // ── Course 1-1: Verdant Outskirts -> Touch Goal Flagpole ──
    waitActive();
    assert.equal(engine.currentRoom.courseCode, '1-1');
    assert.ok(engine.levelKit.flagpole, 'Course 1-1 must have a Goal Flagpole');
    engine.player.pos.x = engine.levelKit.flagpole.x - 1.2;
    engine.player.pos.y = engine.levelKit.flagpole.baseY;
    engine.player.grounded = true;
    for (let f = 0; f < 90; f++) {
      engine.stepCampaignHeadless({ right: true });
      if (lc.state === GameLifecycleState.STAGE_CLEAR) break;
    }
    assert.equal(lc.state, GameLifecycleState.STAGE_CLEAR, 'Clearing 1-1 flagpole must enter STAGE_CLEAR');
    assert.equal(lc.isWorldVictory, false, '1-1 clear is stage clear, not final World Victory');

    // ── Course 1-2: Deep Slate Cavern -> Enter Goal Exit Pipe (RIGHT entry at x=180, y=8) ──
    assert.equal(engine.advanceToNextStage(), true);
    waitActive();
    assert.equal(engine.currentRoom.courseCode, '1-2');
    engine.teleportAct('KETSU');
    engine.player.pos.x = 178.4;
    engine.player.pos.y = 8.0;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;
    for (let f = 0; f < 140; f++) {
      engine.stepCampaignHeadless({ right: true });
      if (lc.state === GameLifecycleState.STAGE_CLEAR) break;
    }
    assert.equal(lc.state, GameLifecycleState.STAGE_CLEAR, 'Clearing 1-2 Goal Exit Pipe must enter STAGE_CLEAR');
    assert.equal(lc.isWorldVictory, false);

    // ── Course 1-3: Hydro-Pulse Ridge -> Touch Pinnacle Goal ──
    assert.equal(engine.advanceToNextStage(), true);
    waitActive();
    assert.equal(engine.currentRoom.courseCode, '1-3');
    const goal = engine.levelEngine.pinnacleGoal;
    assert.ok(goal, 'Course 1-3 must have a Pinnacle Goal');
    engine.player.pos.x = goal.x - 1.0;
    engine.player.pos.y = goal.y;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;
    for (let f = 0; f < 90; f++) {
      engine.stepCampaignHeadless({ right: true });
      if (lc.state === GameLifecycleState.STAGE_CLEAR) break;
    }
    assert.equal(lc.state, GameLifecycleState.STAGE_CLEAR, 'Clearing 1-3 Pinnacle Goal must enter STAGE_CLEAR');
    assert.equal(lc.isWorldVictory, false);

    // ── Course 1-4: Dread-Shell Sanctum (3-Phase Boss -> World Exit Portal -> World 1 Victory Screen!) ──
    assert.equal(engine.advanceToNextStage(), true);
    waitActive();
    assert.equal(engine.currentRoom.courseCode, '1-4');
    assert.equal(engine.boss.active, true);

    const waitBossVulnerable = () => {
      // Keep player safely perched on left alcove top surface (alcoveY + 1 = 8.0) while boss cycles attacks
      engine.player.pos.x = engine.boss.arenaLeftX + 0.6;
      engine.player.pos.y = MovementProfile.boss.alcoveY + 1;
      engine.player.vel.x = 0;
      engine.player.vel.y = 0;
      engine.player.grounded = true;
      for (let f = 0; f < 480; f++) {
        engine.stepCampaignHeadless({});
        if (engine.boss.golem.isVulnerableToShell && findActiveHopliteShell(engine)) return;
      }
      throw new Error(`Timed out waiting for Boss vulnerability (phase=${engine.boss.golem.phase}, state=${engine.boss.golem.state})`);
    };

    // Deliver all 3 phase strikes in live campaign mode
    for (let strike = 1; strike <= 3; strike++) {
      waitBossVulnerable();
      kickShellIntoExposedCore(engine, (a) => engine.stepCampaignHeadless(a));
    }

    assert.equal(engine.boss.golem.defeated, true);
    assert.equal(engine.boss.exitPortal.unlocked, true);

    // Enter World Exit Portal -> triggers STAGE_CLEAR with isWorldVictory === true
    engine.player.pos.x = engine.boss.exitPortal.x - 1.0;
    engine.player.pos.y = engine.boss.floorY;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    for (let f = 0; f < 90; f++) {
      engine.stepCampaignHeadless({ right: true });
      if (lc.state === GameLifecycleState.STAGE_CLEAR && lc.isWorldVictory) break;
    }

    assert.equal(lc.state, GameLifecycleState.STAGE_CLEAR, 'Entering unlocked World Exit Portal must enter STAGE_CLEAR');
    assert.equal(lc.isWorldVictory, true, 'Completing 1-4 Boss must trigger World 1 Victory Screen');
    assert.deepEqual(
      lc.stagesCleared,
      WORLD1_CAMPAIGN_COURSES.map((c) => c.courseCode),
      'Full campaign playthrough must record all 4 courses cleared: 1-1, 1-2, 1-3, 1-4'
    );
  });

  it('3. Clean Release Package: self-contained dist/ < 1.5 MB uncompressed, file:// compatible, & 100% legal/IP cleared', () => {
    assert.ok(fs.existsSync(DIST_DIR), 'dist/ directory must exist (run npm run build first)');

    const indexPath = path.join(DIST_DIR, 'index.html');
    const bundlePath = path.join(DIST_DIR, 'bundle.js');
    const manifestPath = path.join(DIST_DIR, 'assets/RELEASE_MANIFEST.json');
    const licensePath = path.join(DIST_DIR, 'assets/LICENSE.txt');

    assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');
    assert.ok(fs.existsSync(bundlePath), 'dist/bundle.js must exist');
    assert.ok(fs.existsSync(manifestPath), 'dist/assets/RELEASE_MANIFEST.json must exist');
    assert.ok(fs.existsSync(licensePath), 'dist/assets/LICENSE.txt must exist');

    // Compute exact uncompressed total size across all files in dist/
    let totalBytes = 0;
    const allFiles = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const size = fs.statSync(full).size;
          totalBytes += size;
          allFiles.push(path.relative(DIST_DIR, full).replace(/\\/g, '/'));
        }
      }
    };
    walk(DIST_DIR);

    const MAX_BYTES = Math.floor(1.5 * 1024 * 1024); // 1,572,864 bytes (1.5 MB)
    assert.ok(
      totalBytes < MAX_BYTES,
      `Uncompressed release bundle (${(totalBytes / (1024 * 1024)).toFixed(3)} MB) must be strictly < 1.500 MB`
    );

    // Verify zero copyrighted binary assets (.glb, .gltf, .png, .jpg, .mp3) inside dist/
    const forbiddenAssets = allFiles.filter((f) => /\.(glb|gltf|png|jpg|jpeg|webp|mp3|ogg|wav)$/i.test(f));
    assert.deepEqual(forbiddenAssets, [], `Zero copyrighted binary assets may exist in dist/ (found: ${forbiddenAssets.join(', ')})`);

    // Verify file:// compatibility in dist/index.html
    const html = fs.readFileSync(indexPath, 'utf8');
    assert.ok(html.includes('<script defer src="./bundle.js"></script>'), 'dist/index.html must load ./bundle.js via file://-safe defer script');
    assert.equal(html.includes('type="module"'), false, 'dist/index.html must not use type="module" (blocked on file:// CORS)');
    assert.equal(html.includes('crossorigin'), false, 'dist/index.html must not contain crossorigin attributes');
    assert.equal(/https?:\/\//i.test(html), false, 'dist/index.html must contain zero external CDN URLs');

    // Verify 100% legal/IP clearance across dist/index.html, dist/bundle.js, and dist/assets/*
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const ipAuditRegex = /(nintendo|super mario|mario\.glb|luigi\.glb|grassland_tileset|wii u|\bNSMBU\b|\bmiyamoto\b|\bMario\b|\bLuigi\b|\bGoomba\b|\bKoopa\b|\bSpiny\b)/g;
    const htmlIpHits = html.match(ipAuditRegex) || [];
    const bundleIpHits = bundle.match(ipAuditRegex) || [];
    assert.deepEqual(htmlIpHits, [], `dist/index.html must have zero third-party IP strings (found: ${htmlIpHits.join(', ')})`);
    assert.deepEqual(bundleIpHits, [], `dist/bundle.js must have zero third-party IP strings (found: ${[...new Set(bundleIpHits)].join(', ')})`);

    // Verify zero external CDN script/font/asset fetches in bundle.js
    const cdnRegex = /(cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|fonts\.googleapis|fonts\.gstatic|esm\.sh)/i;
    assert.equal(cdnRegex.test(bundle), false, 'dist/bundle.js must have zero external CDN dependencies');

    // Verify RELEASE_MANIFEST.json metadata
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.fileProtocolCompatible, true);
    assert.equal(manifest.externalCdnCount, 0);
    assert.equal(manifest.thirdPartyIpPurged, true);
    assert.ok(manifest.totalUncompressedBytes < MAX_BYTES);
  });
});
