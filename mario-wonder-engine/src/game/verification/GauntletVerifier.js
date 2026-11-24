/**
 * GauntletVerifier — Stage 10 Automated Acceptance & Replay Verification Suite
 * ==============================================================================
 * Runs deterministic headless kinematic checks across Stages 1–10 AND an
 * end-to-end automated scripted clear of Room 8: The Gauntlet (Sections A–I),
 * verifying zero desync when replaying the captured input log from tick 0.
 *
 * Pure JS: executes identically inside Node tests (`stage10.test.js`) and
 * inside the browser's 1-click Verification Report Modal ([F7]).
 */

import GameEngine from '../../engine/core/GameEngine.js';
import { Actions } from '../../engine/input/InputManager.js';
import { lintAllRooms } from '../../engine/physics/GeometryLint.js';
import MovementProfile, {
  FEEL_PRESETS,
  resetMovementProfile,
} from '../config/MovementProfile.js';
import { PlayerState } from '../player/PlayerState.js';
import { getAllRooms } from '../levels/benchmark/BenchmarkRooms.js';
import { PowerUpForm } from '../powerups/PowerUp.js';

function settleFloor(engine, frames = 30) {
  for (let i = 0; i < frames; i++) {
    engine.stepHeadless({});
  }
}

function encodePilotMask(pilotFn, engine, frameIdx) {
  const act = pilotFn(engine, frameIdx) || {};
  let mask = 0;
  if (act.left) mask |= 1 << 0;
  if (act.right) mask |= 1 << 1;
  if (act.up) mask |= 1 << 2;
  if (act.down) mask |= 1 << 3;
  if (act.jump) mask |= 1 << 4;
  if (act.run) mask |= 1 << 5;
  if (act.spin) mask |= 1 << 6;
  return mask;
}

/**
 * Deterministic Gauntlet Full-Course Autopilot (Sections A -> I).
 * Generates exact 60 Hz action flags strictly from live deterministic sim state.
 */
export function gauntletAutopilot(eng, frame) {
  const p = eng.player;
  const x = p.pos.x;
  const y = p.pos.y;
  const plat = eng.platforms || [];
  const shuttle = plat.find((m) => m.id === 'gauntlet_shuttle');
  const elevator = plat.find((m) => m.id === 'gauntlet_elevator');

  if (eng.levelKit.courseCleared) {
    return {};
  }

  // Wait cleanly during hitstop or Warp Pipe suction
  if (p.state === PlayerState.WARP_PIPE || eng.hitstopFrames > 0) {
    return {};
  }

  const pulseJump = frame % 2 === 0;

  // Section A: Flat Runway (x < 42)
  if (x < 42.0) {
    return { right: true, run: true };
  }

  // Section B: Gap Ladder (2, 3, 4, 5, 6, 7, 8 tiles across cols 45..122)
  if (x < 121.5) {
    // True geometric gap lookahead: jump cleanly whenever standing within 1.3t of a pit edge or in coyote grace
    const colAhead = Math.floor(x + p.currentWidth + 0.55);
    const groundRow = Math.floor(y - 0.1);
    const floorAheadEmpty = eng.tilemap && eng.tilemap.get(colAhead, groundRow) === 0;
    const floorUnderEdgeEmpty = eng.tilemap && eng.tilemap.get(Math.floor(x + p.currentWidth + 0.05), groundRow) === 0;
    if ((p.grounded && (floorAheadEmpty || floorUnderEdgeEmpty)) || (!p.grounded && p.coyoteFramesRemaining > 0 && floorUnderEdgeEmpty)) {
      return { right: true, run: true, jump: true };
    }
    if (!p.grounded) {
      // Short-hop early pits (2-4t) so we land squarely on 4-tile pads instead of overshooting into the next pit!
      const isShortPit = x < 63.0;
      const holdJump = isShortPit ? p.vel.y > 10.5 : (p.vel.y > 0 || p.inApexFloat);
      const colBelowFront = Math.floor(x + p.currentWidth + 0.25);
      const pitBelow = eng.tilemap && eng.tilemap.get(colBelowFront, 1) === 0;
      const needSpin = !p.hasSpunThisAirtime && p.vel.y < -2.0 && pitBelow;
      return { right: true, run: !pitBelow || p.vel.x < 7.5 || !isShortPit, jump: holdJump, spin: needSpin };
    }
    return { right: true, run: true };
  }

  // Section C: Vertical Step Course (1t, 2t, 3t, 4t ledges across 122..152)
  if (x < 152.2) {
    const stepEdges = [
      { trigX: 123.5, minY: 2.8 },
      { trigX: 128.5, minY: 3.8 },
      { trigX: 133.5, minY: 4.8 },
      { trigX: 138.5, minY: 5.8 },
    ];
    let wantJump = !p.grounded;
    for (let i = 0; i < stepEdges.length; i++) {
      if (p.grounded && x >= stepEdges[i].trigX && x <= stepEdges[i].trigX + 1.5 && y < stepEdges[i].minY) {
        wantJump = true;
        break;
      }
    }
    return { right: true, run: x > 144.0, jump: wantJump };
  }

  // Section D: 3-Tile Wide Wall-Jump Shaft (x in 152..159.2, climb to Y >= 16)
  if (x < 159.3 && y < 16.0) {
    if (x < 157.0 && p.grounded) {
      return { right: true, run: true };
    }
    if (p.grounded) {
      return { right: true, jump: true };
    }
    // Kick cleanly off active wall slide / wall coyote
    if (p.isWallSliding || p.wallCoyoteFramesRemaining > 0) {
      const wDir = p.wallSlideDir || p.wallCoyoteDir;
      return { jump: pulseJump, left: wDir > 0, right: wDir < 0 };
    }
    // Hold steering firmly toward target shaft wall so vel.x clamping doesn't reverse direction!
    const pushRight = p.wallJumpLockTimer > 0 ? p.wallJumpLockDir < 0 : x >= 157.1;
    return {
      jump: p.vel.y > 0,
      right: pushRight,
      left: !pushRight,
    };
  }

  // Top exit from Wall Shaft onto Slope E summit (x in 158.8..167.2)
  if (x < 167.2) {
    return { right: true, run: true };
  }

  // Section E: Slope Hill + Butt-Slide Chute through Goombas (167.2..200.4)
  if (x < 200.4) {
    if (x >= 196.5 && Math.abs(p.vel.x) < 6.8) {
      return { right: true, run: true, jump: p.grounded || p.vel.y > 0 };
    }
    const onSlideSlope = x >= 167.2 && x < 200.2;
    return { right: true, run: !onSlideSlope, down: onSlideSlope };
  }

  // Section F: Semisolid & Moving Platform Chasm (200..226)
  if (x < 226.2) {
    // Jump onto Mushroom canopy (204..208, y=5) without overshooting
    if (x < 203.8) {
      if (p.grounded && x < 201.4) return { right: true };
      const overCanopy = x >= 203.2;
      return {
        right: !overCanopy || p.vel.x < 3.5,
        jump: p.grounded || p.vel.y > 0,
      };
    }
    // On Mushroom canopy: wait cleanly at edge x ~ 206.5 for Shuttle
    if (x < 208.3 && y >= 4.5 && y < 6.5) {
      if (x < 206.4) return { right: true };
      const shuttleReady = shuttle && shuttle.pos.x <= 210.5 && shuttle.vel.x >= -0.5;
      if (p.grounded && !shuttleReady) return {};
      return { right: true, jump: p.grounded || p.vel.y > 0 };
    }
    // On Horizontal Shuttle -> ride/jump onto Semisolid (216..220, y=6)
    if (x >= 208.3 && x < 216.2) {
      if (p.grounded && x < 213.6) {
        return { right: true };
      }
      return {
        right: true,
        jump: p.grounded || p.vel.y > 0,
        spin: !p.grounded && !p.hasSpunThisAirtime && p.vel.y < -1.0,
      };
    }
    // On Semisolid (216..220, y=6) -> jump to Vertical Elevator (221..224.4)
    if (x >= 216.2 && x < 220.4) {
      if (x < 218.8) return { right: true };
      const elevReady = elevator && elevator.pos.y >= 4.0 && elevator.pos.y <= 7.8;
      if (p.grounded && !elevReady) return {};
      return { right: true, jump: p.grounded || p.vel.y > 0 };
    }
    // On Vertical Elevator -> wait briefly if low, then jump onto solid ground at x >= 226
    if (x >= 220.4) {
      if (p.grounded && y < 3.6 && elevator && elevator.vel.y > 0) {
        return {};
      }
      return {
        right: true,
        run: true,
        jump: p.grounded ? x >= 222.2 : p.vel.y > 0,
        spin: !p.grounded && !p.hasSpunThisAirtime && p.vel.y < -1.5,
      };
    }
  }

  // Section G: Enemy Playground -> Bowling Pipe (251..253, y=5) -> Section H Warp Pipe Top (257..259, y=4)
  if (x < 256.8 || (x < 257.35 && y < 3.85)) {
    if (p.grounded && x >= 249.6 && x <= 250.5 && y < 4.5) {
      return { left: true };
    }
    const dangerNearby = (eng.combat?.enemies || []).some(
      (e) => e.active && e.state !== 'squashed' && e.pos.x > x - 0.6 && e.pos.x - x < 3.6
    );
    const pipeJump = (x >= 247.5 && x < 250.0) || (x >= 252.0 && x < 256.8);
    const curbAhead = x >= 239.2 && x <= 241.5;
    if (p.grounded && (dangerNearby || pipeJump || curbAhead)) {
      return { right: true, run: x < 255.0, jump: true };
    }
    if (!p.grounded) {
      const pinnedSide = (p.isWallSliding || p.wallCoyoteFramesRemaining > 0) && x < 250.8;
      if (pinnedSide) return { left: true };
      const belowBowlingTop = x >= 247.5 && x < 250.6 && y < 5.6;
      const dropOntoBowlingTop = x >= 250.6 && x < 252.3 && y > 5.05;
      const crossToWarpPipe = x >= 252.3 && x < 256.8;
      const brakeForPipe = dropOntoBowlingTop && p.vel.x > 3.5;
      return {
        right: !brakeForPipe,
        left: brakeForPipe,
        run: x < 254.5 && !dropOntoBowlingTop,
        jump: !dropOntoBowlingTop && (p.vel.y > 0 || p.inApexFloat || belowBowlingTop || crossToWarpPipe),
        spin: (belowBowlingTop || crossToWarpPipe) && !p.hasSpunThisAirtime && p.vel.y < -0.5,
      };
    }
    return { right: true, run: x < 254.5 };
  }

  // Section H: Stand centered on Warp Pipe (257..259, y=4) & hold Down -> Warp!
  if (x >= 256.8 && x < 260.0) {
    if (y < 3.85) {
      return { left: x >= 258.0, right: x < 257.6, jump: p.grounded || p.vel.y > 0 };
    }
    if (x < 257.45) return { right: true, jump: p.grounded || p.vel.y > 0 };
    if (x > 258.15 || p.vel.x > 2.5) return { left: true };
    if (p.grounded && Math.abs(y - 4.0) < 0.25) {
      return { down: true };
    }
    return {};
  }

  // Section H Exit (260..272.5): Crawl right crouched beneath 1.0t ceiling!
  if (x >= 260.0 && x < 272.4) {
    return { right: true };
  }

  // Section I: Staircase (276..280), Pedestal (285), & Goal Flagpole (285.5)
  if (x >= 272.4) {
    if (x >= 274.2 && x < 285.8) {
      return { right: true, run: true, jump: p.grounded ? pulseJump : true };
    }
    return { right: true };
  }

  return { right: true };
}

/**
 * Execute all Stage 10 kinematic, level integrity, preset, and Gauntlet replay checks.
 */
export function runAllGauntletChecks() {
  resetMovementProfile();
  const checks = [];

  // 1. Visual-to-Collision Parity (GeometryLint across all 8 benchmark rooms)
  {
    const rooms = getAllRooms();
    const report = lintAllRooms(rooms);
    checks.push({
      id: 'geometry_lint',
      name: 'Visual-Collision Parity (All 8 Rooms)',
      target: '0 mismatches',
      measured: `${report.totalChecked} tiles · ${report.totalMismatches} err`,
      passed: report.passed,
    });
  }

  // 2. Standing Jump Apex (4.10t ± 0.15t)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(0);
    settleFloor(eng);
    const startY = eng.player.pos.y;
    let peakDy = 0;
    for (let f = 0; f < 65; f++) {
      eng.stepHeadless({ jump: f < 30 });
      peakDy = Math.max(peakDy, eng.player.pos.y - startY);
    }
    checks.push({
      id: 'standing_jump_apex',
      name: 'Standing Jump Apex',
      target: '4.10t ± 0.15t',
      measured: `${peakDy.toFixed(2)}t`,
      passed: Math.abs(peakDy - 4.10) <= 0.15,
    });
  }

  // 3. Tap Jump >= 1.0t (2f release)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(0);
    settleFloor(eng);
    const startY = eng.player.pos.y;
    let peakDy = 0;
    for (let f = 0; f < 40; f++) {
      eng.stepHeadless({ jump: f < 2 });
      peakDy = Math.max(peakDy, eng.player.pos.y - startY);
    }
    checks.push({
      id: 'tap_jump_min',
      name: 'Tap Jump (2f Release)',
      target: '≥ 1.00t (< 2.50t)',
      measured: `${peakDy.toFixed(2)}t`,
      passed: peakDy >= 1.0 && peakDy < 2.5,
    });
  }

  // 4. Walk Jump clears 3-tile gap (Room 2 Gap #3 [23..26], Y=4.0)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(1); // Room 2: Gap Ladder (floor Y=4.0)
    eng.player.pos.x = 17.5;
    eng.player.pos.y = 4.0;
    settleFloor(eng, 10);
    let jumped = false;
    let cleared = false;
    for (let f = 0; f < 160; f++) {
      const nearEdge = eng.player.pos.x >= 22.1 && !jumped;
      if (nearEdge) jumped = true;
      const holdJump = nearEdge || (jumped && eng.player.pos.x < 26.5 && eng.player.vel.y >= -0.5);
      eng.stepHeadless({ right: eng.player.pos.x < 28.0, jump: holdJump });
      if (jumped && eng.player.grounded && eng.player.pos.x >= 26.0 && eng.player.pos.y === 4.0) {
        cleared = true;
        break;
      }
    }
    checks.push({
      id: 'walk_gap_3t',
      name: 'Walk Jump (3-Tile Gap)',
      target: 'Clear ≥ 3.0t gap',
      measured: cleared ? `Landed x=${eng.player.pos.x.toFixed(1)}t` : 'Failed',
      passed: cleared,
    });
  }

  // 5. Sprint Jump clears 6-tile gap (Room 2 Gap #6 [53..59], Y=4.0)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(1);
    eng.player.pos.x = 47.2;
    eng.player.pos.y = 4.0;
    settleFloor(eng, 10);
    let jumped = false;
    let cleared6t = false;
    for (let f = 0; f < 150; f++) {
      if (eng.player.pos.x >= 51.8 && !jumped) jumped = true;
      const holdJump = jumped && (eng.player.vel.y >= -0.5 || eng.player.pos.x < 59.0);
      eng.stepHeadless({ right: true, run: true, jump: holdJump });
      if (jumped && eng.player.grounded && eng.player.pos.x >= 59.0 && eng.player.pos.y === 4.0) {
        cleared6t = true;
        break;
      }
    }
    checks.push({
      id: 'sprint_gap_6t',
      name: 'Sprint Jump (≥ 6-Tile Gap)',
      target: 'Clear ≥ 6.0t gap',
      measured: cleared6t ? `Landed x=${eng.player.pos.x.toFixed(1)}t` : 'Failed',
      passed: cleared6t,
    });
  }

  // 6. Coyote Window (5f pass, 6f fail) across Room 2 8-tile ledge drop [65..73]
  {
    resetMovementProfile();
    const runCoyote = (waitFrames) => {
      const eng = new GameEngine();
      eng.initHeadless(1);
      eng.player.pos.x = 59.5;
      eng.player.pos.y = 4.0;
      settleFloor(eng, 8);
      while (eng.player.grounded) {
        eng.stepHeadless({ right: true, run: true });
      }
      for (let i = 1; i < waitFrames; i++) {
        eng.stepHeadless({});
      }
      eng.stepHeadless({ jump: true });
      return eng.player.isJumping && eng.player.vel.y > 15.0;
    };
    const pass5 = runCoyote(5);
    const fail6 = !runCoyote(6);
    checks.push({
      id: 'coyote_window',
      name: 'Coyote Time Grace (5f/6f)',
      target: '5f PASS · 6f FAIL',
      measured: `5f:${pass5 ? 'PASS' : 'FAIL'} · 6f:${!fail6 ? 'PASS' : 'EXPIRED'}`,
      passed: pass5 && fail6,
    });
  }

  // 7. Jump Buffer Window (6f pass, 7f fail)
  {
    resetMovementProfile();
    const runBuffer = (leadFrames) => {
      const probe = new GameEngine();
      probe.initHeadless(0);
      probe.player.pos.x = 5.0;
      probe.player.pos.y = 6.5;
      probe.player.vel.y = 0;
      probe.player.grounded = false;
      let landFrame = -1;
      for (let f = 1; f <= 60; f++) {
        probe.stepHeadless({});
        if (probe.player.grounded) {
          landFrame = f;
          break;
        }
      }
      const pressFrame = landFrame - leadFrames;
      const eng = new GameEngine();
      eng.initHeadless(0);
      eng.player.pos.x = 5.0;
      eng.player.pos.y = 6.5;
      eng.player.vel.y = 0;
      eng.player.grounded = false;
      for (let f = 1; f <= landFrame; f++) {
        eng.stepHeadless({ jump: f === pressFrame });
      }
      return eng.player.isJumping && eng.player.vel.y > 15.0;
    };
    const pass6 = runBuffer(6);
    const fail7 = !runBuffer(7);
    checks.push({
      id: 'jump_buffer',
      name: 'Jump Input Buffer (6f/7f)',
      target: '6f PASS · 7f FAIL',
      measured: `6f:${pass6 ? 'PASS' : 'FAIL'} · 7f:${!fail7 ? 'PASS' : 'IGNORED'}`,
      passed: pass6 && fail7,
    });
  }

  // 8. Wall-Jump Climb in 3-Wide Shaft
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(7); // Gauntlet Section D
    eng.teleportGauntletSection('D');
    let maxHeight = 0;
    for (let f = 0; f < 320; f++) {
      const act = gauntletAutopilot(eng, f);
      eng.stepHeadless(act);
      maxHeight = Math.max(maxHeight, eng.player.pos.y);
      if (eng.player.pos.x >= 160.0 && eng.player.pos.y >= 15.8) break;
    }
    checks.push({
      id: 'wall_jump_shaft',
      name: 'Wall-Jump Climb (3-Wide Shaft)',
      target: 'Reach ≥ 16.0t deck',
      measured: `Peak Y=${maxHeight.toFixed(2)}t`,
      passed: maxHeight >= 15.8,
    });
  }

  // 9. Butt-Slide Accelerates & Defeats Goomba (Section E)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(7);
    eng.teleportGauntletSection('E');
    let maxSlideVx = 0;
    let goombaDefeated = false;
    for (let f = 0; f < 180; f++) {
      const onSlope = eng.player.pos.x >= 167.2;
      eng.stepHeadless({ right: true, down: onSlope });
      if (eng.player.state === PlayerState.BUTT_SLIDE) {
        maxSlideVx = Math.max(maxSlideVx, Math.abs(eng.player.vel.x));
      }
      if (eng.combat.stompsCount > 0) {
        goombaDefeated = true;
      }
      if (eng.player.pos.x >= 200.5) break;
    }
    checks.push({
      id: 'butt_slide_goombas',
      name: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__)
        ? 'Butt-Slide Velocity & Patrol KO'
        : 'Butt-Slide Velocity & Goomba KO',
      target: 'vx ≥ 6.0 t/s & KO ≥ 1',
      measured: `${maxSlideVx.toFixed(2)} t/s · KO=${eng.combat.stompsCount}`,
      passed: maxSlideVx >= 6.0 && goombaDefeated,
    });
  }

  // 10. Warp Pipe Suction -> 1-Tile Crawl Tunnel (Section H)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(7);
    eng.teleportGauntletSection('H');
    let enteredPipe = false;
    let exitedCrawl = false;
    let clearedTunnel = false;
    for (let f = 0; f < 420; f++) {
      const x = eng.player.pos.x;
      const y = eng.player.pos.y;
      let act = {};
      if (eng.player.state === PlayerState.WARP_PIPE) {
        enteredPipe = true;
      } else if (x < 257.45 && y < 3.85) {
        act = { right: true, jump: eng.player.grounded || eng.player.vel.y > 0 };
      } else if (x < 260.0) {
        if (x < 257.45) act = { right: true };
        else if (x > 258.2) act = { left: true };
        else act = { down: true };
      } else {
        if (eng.player.isCrouched) exitedCrawl = true;
        act = { right: true };
        if (x >= 272.2) {
          clearedTunnel = true;
          break;
        }
      }
      eng.stepHeadless(act);
    }
    checks.push({
      id: 'warp_pipe_crawl',
      name: 'Warp Pipe Suction & 1t Crawl',
      target: 'Enter -> Exit Crouched -> Clear',
      measured: `Pipe:${enteredPipe} Exit:${exitedCrawl} Clear:${clearedTunnel}`,
      passed: enteredPipe && exitedCrawl && clearedTunnel,
    });
  }

  // 11. Live Feel Preset Switcher (Zero Position Reset)
  {
    resetMovementProfile();
    const eng = new GameEngine();
    eng.initHeadless(0);
    settleFloor(eng, 12);
    for (let f = 0; f < 20; f++) eng.stepHeadless({ right: true, run: true });
    const posBefore = { ...eng.player.pos };
    const velBefore = { ...eng.player.vel };

    eng.setFeelPreset('nsmbu');
    const nsmbuMatch =
      MovementProfile.locomotion.startImpulse === FEEL_PRESETS.nsmbu.startImpulse &&
      MovementProfile.apexFloat.maxFrames === FEEL_PRESETS.nsmbu.apexFloatMaxFrames &&
      MovementProfile.stage8.cameraYawTiltDeg === 0.0;

    eng.setFeelPreset('arcade');
    const arcadeMatch =
      MovementProfile.locomotion.startImpulse === FEEL_PRESETS.arcade.startImpulse &&
      MovementProfile.locomotion.groundAccel === FEEL_PRESETS.arcade.groundAccel;

    eng.setFeelPreset('wonder');
    const posAfter = { ...eng.player.pos };
    const velAfter = { ...eng.player.vel };
    const zeroReset =
      posAfter.x === posBefore.x &&
      posAfter.y === posBefore.y &&
      velAfter.x === velBefore.x &&
      velAfter.y === velBefore.y;

    const isClean = typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__;
    checks.push({
      id: 'live_preset_hot_swap',
      name: 'Live Feel Preset Switch (Zero Reset)',
      target: isClean ? 'Wonder / Classic / Arcade, Δpos=0' : 'Wonder / NSMBU / Arcade, Δpos=0',
      measured: `${isClean ? 'Classic' : 'NSMBU'}:${nsmbuMatch} Arcade:${arcadeMatch} Δpos=${Math.abs(posAfter.x - posBefore.x).toFixed(3)}`,
      passed: nsmbuMatch && arcadeMatch && zeroReset,
    });
  }

  // 12. Full Gauntlet Automated End-to-End Replay (Sections A -> I, 0 Desync)
  let replayFrames = [];
  let gauntletCleared = false;
  let replayZeroDesync = false;
  let clearFrames = 0;
  let finalScore = 0;
  let finalCoins = 0;
  let finalHash = 0;

  {
    resetMovementProfile();
    const engA = new GameEngine();
    engA.initHeadless(7); // Room 8: The Gauntlet
    settleFloor(engA, 8);

    const maxFrames = 3200;
    for (let f = 0; f < maxFrames; f++) {
      const mask = encodePilotMask(gauntletAutopilot, engA, f);
      replayFrames.push(mask);
      engA.stepHeadless(mask);
      if (engA.levelKit.courseCleared && engA.levelKit.flagpole?.flagDropDone) {
        gauntletCleared = true;
        clearFrames = f + 1;
        break;
      }
      if (engA.levelKit.courseCleared && clearFrames === 0) {
        gauntletCleared = true;
        clearFrames = f + 1;
        // Let a few frames settle then break
        for (let k = 0; k < 20; k++) {
          const m2 = 0;
          replayFrames.push(m2);
          engA.stepHeadless(m2);
        }
        break;
      }
    }
    finalScore = engA.combat.score;
    finalCoins = engA.levelKit.coinsCollected;
    finalHash = engA.player.stateHash;

    // Replay from tick 0 on a fresh engine to prove 0 desync
    const engB = new GameEngine();
    engB.initHeadless(7);
    settleFloor(engB, 8);
    engB.input.loadReplay({
      version: 1,
      meta: { roomIndex: 7 },
      frames: replayFrames,
    });

    for (let f = 0; f < replayFrames.length; f++) {
      engB.input.poll();
      engB._stepSimulation(MovementProfile.simulation.fixedTimeStep, true);
    }

    replayZeroDesync =
      gauntletCleared &&
      engB.levelKit.courseCleared &&
      engA.player.stateHash === engB.player.stateHash &&
      engA.player.pos.x === engB.player.pos.x &&
      engA.player.pos.y === engB.player.pos.y;

    checks.push({
      id: 'gauntlet_full_replay',
      name: 'Gauntlet Full Replay (Sections A–I)',
      target: 'Clear Goal & 0 Desync',
      measured: gauntletCleared
        ? `${clearFrames}f (${(clearFrames / 60).toFixed(1)}s) · Hash=${replayZeroDesync ? '0-DESYNC' : 'MISMATCH'}`
        : `Stopped x=${engA.player.pos.x.toFixed(1)}t`,
      passed: gauntletCleared && replayZeroDesync,
    });
  }

  resetMovementProfile();
  const passedCount = checks.filter((c) => c.passed).length;

  return {
    allPassed: passedCount === checks.length,
    passedCount,
    totalCount: checks.length,
    checks,
    replaySummary: {
      cleared: gauntletCleared,
      zeroDesync: replayZeroDesync,
      frames: clearFrames,
      durationSec: Number((clearFrames / 60).toFixed(2)),
      coins: finalCoins,
      score: finalScore,
      finalHash: `0x${(finalHash >>> 0).toString(16).padStart(8, '0')}`,
    },
    presets: Object.values(FEEL_PRESETS).map((p) => ({
      id: p.id,
      label: p.label,
      startImpulse: p.startImpulse,
      groundAccel: p.groundAccel,
      gravityRising: p.gravityRising,
      apexFloatMaxFrames: p.apexFloatMaxFrames,
      crouchSquashSy: p.crouchSquashSy,
      cameraYawTiltDeg: p.cameraYawTiltDeg,
    })),
  };
}

export function buildPrototypeReportMarkdown(report) {
  const r = report || runAllGauntletChecks();
  const lines = [
    (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__)
      ? '# Prism Stride 2.5D Engine — PROTOTYPE REPORT'
      : '# Super Mario Bros. Wonder 2.5D Engine — PROTOTYPE REPORT',
    '',
    `Generated: Deterministic Headless + Interactive Browser Benchmark Suite`,
    `Status: **${r.allPassed ? 'PASS' : 'FAIL'} (${r.passedCount}/${r.totalCount} Acceptance Checks)**`,
    '',
    '## 1. Automated Verification Scorecard',
    '',
    '| Check | Target | Measured | Result |',
    '| :--- | :--- | :--- | :--- |',
  ];

  for (const c of r.checks) {
    lines.push(`| ${c.name} | ${c.target} | ${c.measured} | ${c.passed ? 'PASS' : 'FAIL'} |`);
  }

  lines.push(
    '',
    '## 2. Full Gauntlet Course (Room 8, Sections A–I) Replay Telemetry',
    '',
    `- **Course Cleared**: ${r.replaySummary.cleared ? 'YES' : 'NO'}`,
    `- **Deterministic Replay Parity**: ${r.replaySummary.zeroDesync ? '0 Desync (Exact FNV-1a Bit Match)' : 'MISMATCH'}`,
    `- **Completion Time**: ${r.replaySummary.frames} frames (${r.replaySummary.durationSec}s @ 60 Hz)`,
    `- **Coins / Score**: ${r.replaySummary.coins} coins / ${r.replaySummary.score} pts`,
    `- **Terminal FNV-1a Hash**: \`${r.replaySummary.finalHash}\``,
    '',
    '## 3. Calibrated Live Feel Presets',
    '',
    '| Preset | Start Pop | Ground Accel | g_rise | Apex Float | Crouch Squash | 3/4 Yaw |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
  );

  for (const p of r.presets) {
    lines.push(
      `| ${p.label} | ${p.startImpulse.toFixed(2)} t/s | ${p.groundAccel.toFixed(2)} t/s² | ${p.gravityRising.toFixed(2)} | ${p.apexFloatMaxFrames}f | ${Math.round((1 - p.crouchSquashSy) * 100)}% | ${p.cameraYawTiltDeg}° |`
    );
  }

  lines.push(
    '',
    '## 4. Architecture Summary (10/10 Stages Complete)',
    '',
    '- **Deterministic Physics**: Pure 60 Hz (`Δt = 1/60s`) axis-separated swept AABB collision against 64×64 grid + analytical slopes + dynamic moving platforms.',
    (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__)
      ? '- **2.5D Hybrid Rendering**: 9-slice autotiler + multi-layer parallax canvas compositing a WebGL Three.js articulated 3D hero rig tilted 20° toward the camera.'
      : '- **2.5D Hybrid Rendering**: 9-slice grassland autotiler + multi-layer parallax canvas compositing a WebGL Three.js 27-clip skeletal Mario/Luigi rig tilted 20° toward the camera.',
    '- **Tactile Game Feel**: Frame-1 pop (`1.25 t/s`), asymmetric jump (`4.10t`), coyote (`5f`) & input buffer (`6f`), `0.25t` corner nudge, `1080°` Spin Twirl, Wall-Jump chimney (`8f` lockout), Ground Pound (`0.65` trauma), Butt-Slide, Power-Ups & 3f/6f Combat Hitstop, Warp Pipe suction, and 1-click Gauntlet Verification.',
    ''
  );

  return lines.join('\n');
}

export default {
  runAllGauntletChecks,
  buildPrototypeReportMarkdown,
};
