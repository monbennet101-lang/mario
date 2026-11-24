/**
 * Stage 18 — Benchmark World 1: 3 Calibrated Courses Verification Suite
 * ======================================================================
 * Verifies all 3 declarative Master Courses authored in `src/data/world1.json`:
 *   1. Course 1-1: "Verdant Outskirts" (Stomp, 6-Enemy Shell Run 1-UP, Pyramid Flagpole)
 *   2. Course 1-2: "Deep Slate Cavern" (Compression Springs, 3-Block Spikes, Wall Chimney, Fall-Away Exit Pipe)
 *   3. Course 1-3: "Hydro-Pulse Ridge" (3.0s Pulsing Geysers, 14.0 t/s Horizontal Jet + Flutter, Pinnacle Goal)
 *
 * Also executes the Stage 18 Automated Test Bot:
 *   - 100 deterministic headless simulations per course (300 total runs) verifying
 *     zero NaN, zero inescapable pits, zero softlocks, and 60 FPS lock budget.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile from '../game/config/MovementProfile.js';
import { lintTileMapGeometry } from '../engine/physics/GeometryLint.js';
import {
  runTenPointNintendoAudit,
  verifyTranscendentalInvariance,
  captureTranscendentalSnapshot,
} from '../level/levelEngine.js';
import {
  WORLD1_RAW_DATA,
  createCourse1_1,
  createCourse1_2,
  createCourse1_3,
  getAllWorld1Courses,
} from '../level/world1Loader.js';
import { EnemyKind } from '../game/entities/CombatSystem.js';
import { HopliteState, SproutlingState } from '../game/entities/EnemyArchetypes.js';
import { PlayerState } from '../game/player/PlayerState.js';

const DT = MovementProfile.simulation.fixedTimeStep;

/**
 * Deterministic Mulberry32 PRNG for reproducible 100-run stress bots.
 */
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Stage 18 — Benchmark World 1: 3 Calibrated Courses (1-1, 1-2, 1-3)', () => {
  it('loads all 3 master courses from src/data/world1.json with 10/10 Nintendo Audit & zero geometry lint errors', () => {
    assert.equal(WORLD1_RAW_DATA.world, 1);
    assert.equal(WORLD1_RAW_DATA.courses.length, 3);

    const courses = getAllWorld1Courses();
    assert.equal(courses.length, 3);
    assert.equal(courses[0].name, '1-1: Verdant Outskirts');
    assert.equal(courses[1].name, '1-2: Deep Slate Cavern');
    assert.equal(courses[2].name, '1-3: Hydro-Pulse Ridge');

    const baselineSig = captureTranscendentalSnapshot();

    for (const course of courses) {
      const lint = lintTileMapGeometry(course.map, course.name);
      assert.equal(lint.errorCount, 0, `${course.name} must have 0 GeometryLint errors`);

      const audit = runTenPointNintendoAudit(course);
      assert.equal(
        audit.score,
        10,
        `${course.name} failed 10-Point Audit: ${audit.checks
          .filter((c) => !c.passed)
          .map((c) => `${c.name} (${c.measured})`)
          .join('; ')}`
      );
      assert.equal(audit.passed, true);
    }

    const inv = verifyTranscendentalInvariance(baselineSig, captureTranscendentalSnapshot());
    assert.equal(inv.passed, true, `Physics drift detected: ${inv.diffs.join(', ')}`);
  });

  it('Course 1-1 ("Verdant Outskirts"): Ki [?] block, Shō 2-block gap, Ten 6-Enemy Shell Run -> 1-UP, and Ketsu Pyramid Flagpole Max Bonus', () => {
    const engine = new GameEngine();
    engine.initHeadless(11);
    assert.equal(engine.currentRoom.name, '1-1: Verdant Outskirts');
    assert.equal(engine.currentRoom.theme, 'plains');

    // 1. Ki: Safe Sproutling on solid floor & [?] block yields power coin
    const kiSprout = engine.combat.enemies.find((e) => e.type === EnemyKind.SPROUTLING && e.pos.x < 30);
    assert.ok(kiSprout, 'Act 1 Ki must contain a safe Sproutling');

    const startCoins = engine.levelKit.coins;
    engine.player.spawn(8.1, 2.0, { initialPowerUp: 'super' });
    for (let f = 0; f < 45; f++) {
      engine.stepHeadless({ jump: f < 22 });
    }
    assert.ok(engine.levelKit.coins > startCoins, 'Ki [?] block at (8,5) must yield power coin on head bump');

    // 2. Shō: 2-block gap (cols 56..57 empty at row 0..1) + elevated Sproutlings + Hoplite intro
    assert.equal(engine.tilemap.get(56, 0), MovementProfile.tileTypes.EMPTY);
    assert.equal(engine.tilemap.get(57, 0), MovementProfile.tileTypes.EMPTY);
    assert.equal(engine.tilemap.get(58, 0), MovementProfile.tileTypes.SOLID);
    const shoHoplite = engine.combat.enemies.find((e) => e.type === EnemyKind.HOPLITE && e.pos.x >= 55 && e.pos.x <= 80);
    assert.ok(shoHoplite, 'Act 2 Shō must introduce the first Hoplite beetle');

    // 3. Ten: The 6-Enemy Shell Run -> 1-UP!
    engine.loadRoom(11);
    const corridorHoplite = engine.combat.enemies.find(
      (e) => e.type === EnemyKind.HOPLITE && e.pos.x >= 108 && e.pos.x <= 114
    );
    const corridorSproutlings = engine.combat.enemies.filter(
      (e) => e.type === EnemyKind.SPROUTLING && e.pos.x >= 114 && e.pos.x <= 140
    );
    assert.ok(corridorHoplite, 'Act 3 Ten must place a Hoplite at the start of the bounded corridor');
    assert.equal(corridorSproutlings.length, 6, 'Act 3 Ten corridor must contain exactly 6 consecutive Sproutlings');

    const initialLives = engine.combat.lives;
    const initialScore = engine.combat.score;

    // Stomp Hoplite from directly above into DORMANT_SHELL
    engine.player.pos.x = corridorHoplite.pos.x;
    engine.player.pos.y = corridorHoplite.pos.y + corridorHoplite.height + 0.55;
    engine.player.prevPos.x = engine.player.pos.x;
    engine.player.prevPos.y = engine.player.pos.y + 0.3;
    engine.player.vel.x = 0;
    engine.player.vel.y = -11.0;
    engine.player.grounded = false;

    let stomped = false;
    for (let f = 0; f < 18; f++) {
      engine.stepHeadless({});
      if (corridorHoplite.state === HopliteState.DORMANT_SHELL) {
        stomped = true;
        break;
      }
    }
    assert.ok(stomped, 'Stomping Ten corridor Hoplite must enter DORMANT_SHELL');

    // Move player cleanly to left of dormant shell and kick it rightward down the corridor
    engine.player.pos.x = corridorHoplite.pos.x - 1.1;
    engine.player.pos.y = 2.0;
    engine.player.prevPos.x = engine.player.pos.x;
    engine.player.prevPos.y = engine.player.pos.y;
    engine.player.vel.x = 4.0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;
    engine.player.facingRight = true;

    let kicked = false;
    let oneUpSeen = false;
    for (let f = 0; f < 220; f++) {
      engine.stepHeadless({ right: !kicked });
      if (corridorHoplite.state === HopliteState.SHELL_MOVING) {
        kicked = true;
      }
      if (engine.combat.events.some((ev) => ev.oneUp)) {
        oneUpSeen = true;
      }
    }
    assert.ok(kicked, 'Kicking the dormant Hoplite shell must launch it down the corridor');
    const defeatedCount = corridorSproutlings.filter(
      (s) => s.state === SproutlingState.LAUNCH_DEATH || s.state === SproutlingState.STOMPED || s.removed
    ).length;
    assert.equal(defeatedCount, 6, `All 6 corridor Sproutlings must be bowled over (got ${defeatedCount})`);
    assert.ok(oneUpSeen || engine.combat.lives > initialLives, '6-Enemy Shell Run must escalate to a 1-UP');
    assert.ok(engine.combat.lives > initialLives, 'Player lives must increment from 6-Enemy Shell Run 1-UP');
    assert.ok(engine.combat.score > initialScore, 'Score must escalate during shell combo');

    // 4. Ketsu: Ascending stair pyramid jump hits top of Goal Flagpole for max elevation bonus (5000)
    engine.teleportAct('KETSU');
    engine.player.pos.x = 166.2;
    engine.player.pos.y = 8.0;
    engine.player.prevPos.x = 166.2;
    engine.player.prevPos.y = 8.0;
    engine.player.vel.x = 9.2;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    for (let f = 0; f < 95; f++) {
      const doJump = f >= 6 && f <= 36;
      engine.stepHeadless({ right: true, run: true, jump: doJump });
      if (engine.levelKit.courseCleared) break;
    }
    assert.equal(engine.levelKit.courseCleared, true, 'Pyramid leap must reach Goal Flagpole and clear Course 1-1');
    assert.equal(
      engine.levelKit.flagpole.elevationBonus,
      MovementProfile.world1.flagpoleMaxBonus,
      `High-altitude pyramid leap must award maximum ${MovementProfile.world1.flagpoleMaxBonus} flagpole bonus`
    );
  });

  it('Course 1-2 ("Deep Slate Cavern"): Ki Normal vs Super Spring, Shō 3-Block Spikes, Ten Wall Chimney, and Ketsu Oscillating Fall-Away -> Exit Pipe', () => {
    const engine = new GameEngine();
    engine.initHeadless(12);
    assert.equal(engine.currentRoom.name, '1-2: Deep Slate Cavern');
    assert.equal(engine.currentRoom.theme, 'cavern');

    // 1. Ki: Safe spring alcove Normal Bounce (+16.0) vs Timed Super Bounce (+22.5)
    const kiSpring = engine.props.springs.find((s) => s.id === 'cavern_ki_spring_1');
    assert.ok(kiSpring, 'Act 1 Ki must have safe alcove compression spring');

    // Normal bounce (no jump held)
    engine.player.spawn(kiSpring.x + 0.1, kiSpring.y + 1.8);
    engine.player.vel.y = -6.0;
    let normalBounceVy = 0;
    for (let f = 0; f < 40; f++) {
      engine.stepHeadless({});
      const bounceEv = engine.props.events.find((ev) => ev.type === 'springBounce');
      if (bounceEv) {
        normalBounceVy = bounceEv.launchVy;
        break;
      }
    }
    assert.equal(normalBounceVy, MovementProfile.props.spring.normalBounceVy, 'Normal spring bounce must be +16.0 t/s');

    // Timed super bounce (JUMP held during compression release)
    engine.loadRoom(12);
    engine.player.spawn(kiSpring.x + 0.1, kiSpring.y + 1.8);
    engine.player.vel.y = -6.0;
    let superBounceVy = 0;
    for (let f = 0; f < 40; f++) {
      engine.stepHeadless({ jump: f >= 8 && f <= 26 });
      const superEv = engine.props.events.find((ev) => ev.type === 'springBounce' && ev.isSuper);
      if (superEv) {
        superBounceVy = superEv.launchVy;
        break;
      }
    }
    assert.equal(superBounceVy, MovementProfile.props.spring.superBounceVy, 'Timed super spring bounce must be +22.5 t/s');

    // 2. Shō: Three 3-block spike pits at cols [52..54], [67..69], [83..85]
    for (const startCol of [52, 67, 83]) {
      for (let dc = 0; dc < 3; dc++) {
        assert.equal(
          engine.tilemap.get(startCol + dc, 1),
          MovementProfile.tileTypes.HAZARD,
          `Spike pit starting at col ${startCol} must be 3 consecutive HAZARD tiles`
        );
      }
    }

    // 3. Ten: 3-tile vertical wall-jump chimney (cols 111..113) + ascending elevator platform
    for (let row = 5; row <= 14; row++) {
      assert.equal(engine.tilemap.get(110, row), MovementProfile.tileTypes.SOLID, 'Left chimney wall solid');
      assert.equal(engine.tilemap.get(111, row), MovementProfile.tileTypes.EMPTY, 'Chimney interior open');
      assert.equal(engine.tilemap.get(112, row), MovementProfile.tileTypes.EMPTY, 'Chimney interior open');
      assert.equal(engine.tilemap.get(113, row), MovementProfile.tileTypes.EMPTY, 'Chimney interior open');
      assert.equal(engine.tilemap.get(114, row), MovementProfile.tileTypes.SOLID, 'Right chimney wall solid');
    }

    engine.teleportAct('TEN');
    // Test genuine alternating Wall-Slide & Wall-Jump ascent inside the 3-tile chimney
    engine.player.pos.x = 113.0;
    engine.player.pos.y = 6.5;
    engine.player.prevPos.x = 113.0;
    engine.player.prevPos.y = 6.5;
    engine.player.vel.x = 2.0;
    engine.player.vel.y = -2.0;
    engine.player.grounded = false;

    let sawWallSlide = false;
    let sawWallJump = false;
    let maxChimneyY = engine.player.pos.y;
    let pushDir = 1; // push into right wall first, then alternate on each wall jump

    for (let f = 0; f < 220; f++) {
      const doWallKick = engine.player.state === PlayerState.WALL_SLIDE;
      engine.stepHeadless({
        right: pushDir === 1,
        left: pushDir === -1,
        jump: doWallKick,
      });
      if (engine.player.state === PlayerState.WALL_SLIDE) sawWallSlide = true;
      if (engine.player.events.some((ev) => ev.type === 'wallJump')) {
        sawWallJump = true;
        pushDir = -pushDir;
      }
      if (engine.player.pos.y > maxChimneyY) maxChimneyY = engine.player.pos.y;
      if (maxChimneyY >= 16.0) break;
    }
    assert.ok(sawWallSlide, 'Player must engage WALL_SLIDE inside 3-tile cavern chimney');
    assert.ok(sawWallJump, 'Player must execute WALL_JUMP inside 3-tile cavern chimney');
    assert.ok(maxChimneyY >= 16.0, `Wall-jumping chimney must reach summit >= 16.0 (reached ${maxChimneyY.toFixed(2)})`);

    // 4. Ketsu: 3 oscillating fall-away platforms + Exit Pipe course clear
    engine.teleportAct('KETSU');
    const fallPlats = engine.props.platforms.filter((p) => p.mode === 'fall_away');
    assert.equal(fallPlats.length, 3, 'Course 1-2 Ketsu must have 3 oscillating fall-away platforms');

    const yBefore = fallPlats[0].pos.y;
    let maxDeltaY = 0;
    for (let f = 0; f < 45; f++) {
      engine.stepHeadless({});
      maxDeltaY = Math.max(maxDeltaY, Math.abs(fallPlats[0].pos.y - yBefore));
    }
    assert.ok(maxDeltaY > 0.25, `Fall-away platforms must oscillate vertically before trigger (delta=${maxDeltaY.toFixed(3)})`);

    // Stand on fallPlats[0] for > 1.0s to verify detachment
    engine.player.pos.x = fallPlats[0].pos.x + 1.0;
    engine.player.pos.y = fallPlats[0].pos.y + fallPlats[0].height + 0.05;
    engine.player.vel.x = 0;
    engine.player.vel.y = -2.0;
    let fellAway = false;
    for (let f = 0; f < 90; f++) {
      engine.stepHeadless({});
      if (fallPlats[0].fallState === 'FALLING') {
        fellAway = true;
        break;
      }
    }
    assert.ok(fellAway, 'Oscillating fall-away platform must detach after 1.0s under player weight');

    // Walk into Exit Pipe (RIGHT vector, x=180.0, y=8.0) and verify Course Clear
    engine.teleportAct('KETSU');
    engine.player.pos.x = 178.4;
    engine.player.pos.y = 8.0;
    engine.player.prevPos.x = 178.4;
    engine.player.prevPos.y = 8.0;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    for (let f = 0; f < 90; f++) {
      engine.stepHeadless({ right: true });
      if (engine.levelKit.courseCleared) break;
    }
    assert.equal(engine.levelKit.courseCleared, true, 'Entering Course 1-2 Exit Pipe must trigger Course Clear');
  });

  it('Course 1-3 ("Hydro-Pulse Ridge"): Ki Safe Geyser, Shō 3.0s Pulse, Ten 14.0 t/s Horizontal Jet + Exit Flutter, and Ketsu Pinnacle Medallion', () => {
    const engine = new GameEngine();
    engine.initHeadless(13);
    assert.equal(engine.currentRoom.name, '1-3: Hydro-Pulse Ridge');
    assert.equal(engine.currentRoom.theme, 'ridge');

    // 1. Ki: Safe vertical geyser lifts player to stone bridge (y=7.0) with zero hazards
    const kiGeyser = engine.levelEngine.geysers.find((g) => g.id === 'ridge_ki_geyser_1');
    assert.ok(kiGeyser, 'Course 1-3 Ki must have safe vertical geyser');
    assert.equal(kiGeyser.periodSec, 3.0);

    // 2. Shō: Pulsing geysers run on exact 3.0-second cycle
    const shoGeysers = engine.levelEngine.geysers.filter((g) => g.actId === 'SHO');
    assert.ok(shoGeysers.length >= 6, 'Course 1-3 Shō must have pulsing geyser chain');
    for (const g of shoGeysers) {
      assert.equal(g.periodSec, 3.0, `${g.id} must pulse on exact 3.0s period`);
      assert.equal(g.pulsing, true, `${g.id} must use pulsing hydraulic cycle`);
    }

    // 3. Ten (The Twist): Horizontal Geyser Jet propels at vx = 14.0 t/s across massive spike abyss + timed flutter jump lands on far ridge
    engine.teleportAct('TEN');
    const abyssJet = engine.levelEngine.horizontalJets.find((j) => j.id === 'ridge_ten_jet_abyss');
    assert.ok(abyssJet, 'Course 1-3 Ten must have Horizontal Geyser Jet over spike abyss');
    assert.equal(abyssJet.jetSpeed, 14.0, 'Horizontal Geyser Jet target speed must be exact 14.0 t/s');

    // Approach and enter the horizontal jet stream from the Act 3 staging deck
    engine.player.pos.x = 107.0;
    engine.player.pos.y = 5.0;
    engine.player.prevPos.x = 107.0;
    engine.player.prevPos.y = 5.0;
    engine.player.vel.x = 6.0;
    engine.player.vel.y = 0;
    engine.player.grounded = true;

    let peakVx = 0;
    let touchedSpikes = false;
    let landedFarRidge = false;
    let usedFlutterAtExit = false;

    for (let f = 0; f < 160; f++) {
      // Hop slightly into jet at edge (x ~ 109), then hold JUMP at jet exit (x >= 122) to flutter across abyss
      const inApproachJump = engine.player.pos.x >= 108.4 && engine.player.pos.x <= 110.2;
      const inExitFlutter = engine.player.pos.x >= 121.8 && !engine.player.grounded;
      engine.stepHeadless({
        right: true,
        run: true,
        jump: inApproachJump || inExitFlutter,
      });

      if (engine.player.vel.x > peakVx) peakVx = engine.player.vel.x;
      if (engine.player.events.some((ev) => ev.type === 'hazardSpike')) touchedSpikes = true;
      if (engine.player.pos.x >= 122.0 && engine.player.isFluttering) usedFlutterAtExit = true;
      if (engine.player.grounded && engine.player.pos.x >= 134.0 && engine.player.pos.y >= 3.9) {
        landedFarRidge = true;
        break;
      }
    }

    assert.ok(
      Math.abs(peakVx - 14.0) < 0.01,
      `Horizontal Geyser Jet must propel player at exact vx = 14.0 t/s (measured ${peakVx.toFixed(3)})`
    );
    assert.equal(touchedSpikes, false, 'Player crossing Horizontal Geyser Jet + exit flutter must clear spike abyss cleanly');
    assert.ok(usedFlutterAtExit, 'Player must engage buoyant flutter jump upon exiting the Horizontal Geyser Jet');
    assert.ok(landedFarRidge, `Player must land safely on the far ridge x >= 134 (ended at x=${engine.player.pos.x.toFixed(2)}, y=${engine.player.pos.y.toFixed(2)})`);

    // 4. Ketsu: Climax Geyser Elevator ascends to Pinnacle Goal Medallion (y=18.6) -> Course Clear + 5000
    engine.teleportAct('KETSU');
    const climaxElev = engine.levelEngine.geysers.find((g) => g.id === 'ridge_ketsu_elevator');
    assert.ok(climaxElev, 'Course 1-3 Ketsu must include the Climax Geyser Elevator');

    // Ride Climax Elevator to apex, then leap to Pinnacle Goal Medallion
    engine.player.pos.x = climaxElev.x + 1.2;
    engine.player.pos.y = climaxElev.pos.y + climaxElev.height + 0.05;
    engine.player.prevPos.x = engine.player.pos.x;
    engine.player.prevPos.y = engine.player.pos.y;
    engine.player.vel.x = 0;
    engine.player.vel.y = 0;

    let maxElevY = 0;
    for (let f = 0; f < 340; f++) {
      if (engine.player.pos.y > maxElevY) maxElevY = engine.player.pos.y;
      const readyToJump = engine.player.pos.y >= 15.2 && engine.player.pos.x < 186.5;
      const onPinnacle = engine.player.pos.x >= 186.0;
      engine.stepHeadless({
        right: readyToJump || onPinnacle,
        run: readyToJump || onPinnacle,
        jump:
          (readyToJump && engine.player.pos.x < 186.2) ||
          (onPinnacle && engine.player.pos.x >= 190.0 && engine.player.pos.x <= 193.5),
      });
      if (engine.levelKit.courseCleared) break;
    }

    assert.ok(maxElevY >= 15.5, `Climax elevator must lift player to pinnacle height >= 15.5 (reached ${maxElevY.toFixed(2)})`);
    assert.equal(engine.levelEngine.pinnacleGoal.collected, true, 'Pinnacle Goal Medallion must be collected');
    assert.equal(engine.levelKit.courseCleared, true, 'Collecting Pinnacle Goal Medallion must trigger Course Clear');
  });

  it('VERIFY BOT: runs 100 headless simulations of EACH course (300 runs total) with zero softlocks, zero inescapable pits, and 60 FPS lock budget', () => {
    const courseIndices = [11, 12, 13];
    const RUNS_PER_COURSE = 100;
    const TICKS_PER_RUN = 180; // 3.0 seconds of active playtesting per simulated run (54,000 total 60 Hz frames)
    const ACT_IDS = ['KI', 'SHO', 'TEN', 'KETSU'];
    const engine = new GameEngine();

    for (const roomIndex of courseIndices) {
      let totalFrames = 0;
      let softlocks = 0;
      let nanViolations = 0;
      let outOfBoundsViolations = 0;
      let stuckInPitViolations = 0;

      const tStart = performance.now();

      for (let run = 0; run < RUNS_PER_COURSE; run++) {
        const rng = createRng(roomIndex * 10000 + run * 97 + 13);
        engine.initHeadless(roomIndex);

        // Spread runs evenly across all 4 Kishōtenketsu Acts + full start
        const actChoice = ACT_IDS[run % ACT_IDS.length];
        if (actChoice !== 'KI') {
          engine.teleportAct(actChoice);
        }

        // Apply slight deterministic horizontal spawn perturbation within safe act zone
        const style = run % 4; // 0: steady walker, 1: full sprinter, 2: erratic jumper, 3: hazard/pit stress probe
        let minProgressX = engine.player.pos.x;
        let maxProgressX = engine.player.pos.x;
        let belowFloorStreak = 0;
        let frozenFrames = 0;
        let lastX = engine.player.pos.x;
        let lastY = engine.player.pos.y;

        for (let f = 0; f < TICKS_PER_RUN; f++) {
          let actions = {};
          if (style === 0) {
            actions = {
              right: true,
              jump: f % 38 < 14,
            };
          } else if (style === 1) {
            actions = {
              right: true,
              run: true,
              jump: f % 28 < 15,
            };
          } else if (style === 2) {
            actions = {
              right: rng() > 0.14,
              left: rng() < 0.08,
              run: rng() > 0.35,
              jump: rng() > 0.58,
              spin: rng() > 0.92,
            };
          } else {
            // Stress probe: occasionally walk left/right, drop down, test recovery
            actions = {
              right: f % 60 < 48,
              left: f % 60 >= 48 && f % 60 < 56,
              down: f % 75 === 0,
              run: f % 2 === 0,
              jump: f % 24 < 10,
            };
          }

          engine.stepHeadless(actions, DT);
          totalFrames++;

          const px = engine.player.pos.x;
          const py = engine.player.pos.y;
          const vx = engine.player.vel.x;
          const vy = engine.player.vel.y;

          if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
            nanViolations++;
            break;
          }

          if (px < -1 || px > engine.tilemap.cols + 2 || py > engine.tilemap.rows + 8) {
            outOfBoundsViolations++;
            break;
          }

          if (py < -2.4) {
            belowFloorStreak++;
            if (belowFloorStreak > 12) {
              stuckInPitViolations++;
              break;
            }
          } else {
            belowFloorStreak = 0;
          }

          if (px < minProgressX) minProgressX = px;
          if (px > maxProgressX) maxProgressX = px;

          // Detect if player is permanently wedged (zero displacement for 120 consecutive frames while not victory/defeat)
          if (
            !engine.levelKit.courseCleared &&
            engine.player.state !== PlayerState.DEFEAT &&
            Math.abs(px - lastX) < 1e-4 &&
            Math.abs(py - lastY) < 1e-4
          ) {
            frozenFrames++;
            if (frozenFrames > 120) {
              softlocks++;
              break;
            }
          } else {
            frozenFrames = 0;
          }

          lastX = px;
          lastY = py;
        }
      }

      const elapsedMs = performance.now() - tStart;
      const msPerFrame = elapsedMs / Math.max(1, totalFrames);

      assert.equal(nanViolations, 0, `${engine.currentRoom.name}: 0 NaN states across 100 runs`);
      assert.equal(outOfBoundsViolations, 0, `${engine.currentRoom.name}: 0 OOB states across 100 runs`);
      assert.equal(stuckInPitViolations, 0, `${engine.currentRoom.name}: 0 inescapable pits across 100 runs`);
      assert.equal(softlocks, 0, `${engine.currentRoom.name}: 0 game-breaking softlocks across 100 runs`);
      // 60 FPS budget is 16.67ms/frame; headless simulation tick must be << 2.0ms/frame (leaves >14ms for rendering)
      assert.ok(
        msPerFrame < 2.0,
        `${engine.currentRoom.name}: simulation frame time ${msPerFrame.toFixed(3)}ms/frame must lock comfortably inside 60 FPS budget (< 2.0ms)`
      );
    }
  });
});
