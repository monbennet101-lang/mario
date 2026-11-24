/**
 * Interactive Environmental Props — Headless Kinematic Integrity Test Suite
 * =========================================================================
 * Directly verifies every architectural requirement & VERIFY test for
 * `src/entities/props.js`:
 *
 *   VERIFY Test 1: Player stands on platform moving at vx = 3.0 tiles/s ->
 *                  asserts player position updates identically without sliding off.
 *   VERIFY Test 2: Player jumps from upward-moving platform (vy = 4.0 tiles/s) ->
 *                  asserts launch velocity equals v_jump + 4.0 tiles/s, descending
 *                  platform adds 0, and jumping off horizontal platform preserves
 *                  platform vx as additive residual inertia.
 *   VERIFY Test 3: Compression Launch Spring (64×32px) compresses 16px over 4 frames
 *                  (squash ratio 0.50); Normal Bounce fires at +16.00 t/s; Timed
 *                  Power Bounce on compression rebound frame fires Super Spring at
 *                  +22.50 t/s reaching targeted elevation within 0.1 tile margin.
 *   Test 4:        Circular Orbit carry & Fall-Away Platform (drops 1.0s / 60f after
 *                  player weight detected, then respawns cleanly).
 *   Test 5:        Warp Access Tubes (128×128px) — DOWN, UP, RIGHT, LEFT entry
 *                  vectors, IN_WARP_TRANSITION input lock, 45-frame sliding
 *                  interpolation, fade-to-black, and subterranean relocation.
 *   Test 6:        Room 10 (Interactive Props Lab) geometry lint & determinism.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import GameEngine from '../engine/core/GameEngine.js';
import TileMap from '../engine/physics/TileMap.js';
import CollisionSystem from '../engine/physics/CollisionSystem.js';
import InputManager, { Actions } from '../engine/input/InputManager.js';
import PlayerController from '../game/player/PlayerController.js';
import { PlayerState } from '../game/player/PlayerState.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';
import EnvironmentalPropsSystem, {
  PlatformMode,
  FallAwayState,
  SpringState,
  WarpEntryVector,
  WarpTransitionPhase,
  MovingPlatformProp,
  CompressionSpring,
  WarpAccessTube,
  computeSpringTargetApex,
} from '../entities/props.js';

const DT = MovementProfile.simulation.fixedTimeStep; // 1/60s
const S = MovementProfile.tileTypes.SOLID;

/**
 * Minimal deterministic sandbox harness for isolated prop kinematic verification.
 */
function createPropSandbox({
  cols = 40,
  rows = 24,
  propPlatforms = [],
  springs = [],
  warpTubes = [],
  subAreaBounds = null,
  floorCols = true,
} = {}) {
  const map = new TileMap(cols, rows);
  if (floorCols) {
    map.fillRect(0, 0, cols, 2, S);
  }
  const collision = new CollisionSystem(map);
  const input = new InputManager();
  const player = new PlayerController();
  const props = new EnvironmentalPropsSystem();
  props.loadRoom({ propPlatforms, springs, warpTubes, subAreaBounds });

  function step(frameInput = {}) {
    const list = [];
    if (frameInput.left) list.push(Actions.LEFT);
    if (frameInput.right) list.push(Actions.RIGHT);
    if (frameInput.up) list.push(Actions.UP);
    if (frameInput.down) list.push(Actions.DOWN);
    if (frameInput.jump) list.push(Actions.JUMP);
    if (frameInput.run) list.push(Actions.RUN);
    if (frameInput.spin) list.push(Actions.SPIN);
    input.applySnapshot(InputManager.encodeActions(list));
    props.updatePlatforms(DT, player.ridingPlatform);
    props.checkWarpTubeEntry(player, input);
    props.stepActiveSprings(player, input);
    player.update(input, collision, DT, props.platforms, {
      solidBoxes: props.getSolidBoxes(),
    });
    props.captureIdleSprings(player, input);

    for (const ev of player.events) {
      if (ev.type === 'warpRelocate') {
        props.inSubArea = Boolean(ev.destSubArea);
      }
    }
  }

  return { map, collision, input, player, props, step };
}

describe('Interactive Environmental Props (src/entities/props.js)', () => {
  beforeEach(() => {
    resetMovementProfile();
  });

  // ─── VERIFY TEST 1 ──────────────────────────────────────────────────────────
  it('VERIFY Test 1: Player standing on platform moving at vx = 3.0 tiles/s tracks platform position identically without sliding off', () => {
    const plat = new MovingPlatformProp({
      id: 'test_linear_h',
      mode: PlatformMode.LINEAR,
      startX: 4.0,
      startY: 4.0,
      endX: 28.0,
      endY: 4.0,
      speed: 3.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
    });

    const { player, step } = createPropSandbox({ propPlatforms: [plat] });
    // Spawn player centered directly atop the platform (platform top = 4.5)
    player.spawn(plat.pos.x + 1.0, plat.pos.y + plat.height);
    // Settle 2 ticks so grounded & ridingPlatform lock cleanly
    step({});
    step({});

    assert.equal(player.grounded, true, 'Player should be grounded on the moving platform');
    assert.equal(player.ridingPlatform, plat, 'Player ridingPlatform should reference the moving platform');

    const startPlayerX = player.pos.x;
    const startPlatX = plat.pos.x;
    const expectedDxPerFrame = 3.0 * DT;

    for (let f = 0; f < 60; f++) {
      const prevPlayerX = player.pos.x;
      step({});
      assert.equal(
        player.ridingPlatform,
        plat,
        `Frame ${f}: player must remain locked on moving platform without sliding off`
      );
      assert.equal(player.grounded, true, `Frame ${f}: player must stay grounded`);

      const actualDx = player.pos.x - prevPlayerX;
      assert.ok(
        Math.abs(actualDx - expectedDxPerFrame) < 1e-6,
        `Frame ${f}: player dx (${actualDx.toFixed(6)}) must equal vx*dt (${expectedDxPerFrame.toFixed(6)})`
      );
      assert.ok(
        Math.abs(plat.vel.x - 3.0) < 1e-6,
        `Frame ${f}: platform vx must remain 3.0 tiles/s (got ${plat.vel.x.toFixed(6)})`
      );
    }

    const totalPlayerDelta = player.pos.x - startPlayerX;
    const totalPlatDelta = plat.pos.x - startPlatX;
    assert.ok(
      Math.abs(totalPlayerDelta - 3.0) < 1e-5,
      `After 1.0s (60 frames), player must travel exactly 3.0 tiles (got ${totalPlayerDelta.toFixed(6)})`
    );
    assert.ok(
      Math.abs(totalPlayerDelta - totalPlatDelta) < 1e-6,
      `Player displacement (${totalPlayerDelta.toFixed(6)}) must match platform displacement (${totalPlatDelta.toFixed(6)}) identically`
    );
  });

  // ─── VERIFY TEST 2 ──────────────────────────────────────────────────────────
  it('VERIFY Test 2: Jumping from upward-moving platform (vy = 4.0 t/s) adds +4.0 t/s to v_jump, downward adds 0, and horizontal platform ejects additive vx', () => {
    // 2A. Rising platform (vy = +4.0 tiles/s)
    const risingPlat = new MovingPlatformProp({
      id: 'test_rising',
      mode: PlatformMode.LINEAR,
      startX: 8.0,
      startY: 3.0,
      endX: 8.0,
      endY: 18.0,
      speed: 4.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
    });

    const riseBox = createPropSandbox({ propPlatforms: [risingPlat] });
    riseBox.player.spawn(risingPlat.pos.x + 1.0, risingPlat.pos.y + risingPlat.height);
    for (let f = 0; f < 5; f++) riseBox.step({});

    assert.equal(riseBox.player.ridingPlatform, risingPlat, 'Player must be riding rising platform');
    assert.ok(
      Math.abs(risingPlat.vel.y - 4.0) < 1e-6,
      `Rising platform vel.y must be +4.0 tiles/s (got ${risingPlat.vel.y.toFixed(6)})`
    );

    // Press JUMP while standing still on the rising platform
    riseBox.step({ jump: true });

    const expectedLaunchVy = MovementProfile.jump.launchVelocity + 4.0; // 18.60 + 4.0 = 22.60 tiles/s
    const jumpEv = riseBox.player.events.find((e) => e.type === 'jump');

    assert.ok(jumpEv, 'Jump event must fire on rising platform takeoff');
    assert.ok(
      Math.abs(riseBox.player.takeoffLaunchVy - expectedLaunchVy) < 1e-4,
      `takeoffLaunchVy (${riseBox.player.takeoffLaunchVy.toFixed(4)}) must equal v_jump + 4.0 (${expectedLaunchVy.toFixed(4)})`
    );
    assert.ok(
      Math.abs(riseBox.player.jumpMetrics.launchVy - expectedLaunchVy) < 1e-4,
      `jumpMetrics.launchVy (${riseBox.player.jumpMetrics.launchVy.toFixed(4)}) must equal v_jump + 4.0 (${expectedLaunchVy.toFixed(4)})`
    );
    assert.ok(
      Math.abs(jumpEv.launchVy - expectedLaunchVy) < 1e-4,
      `Jump event launchVy (${jumpEv.launchVy.toFixed(4)}) must equal v_jump + 4.0 (${expectedLaunchVy.toFixed(4)})`
    );

    // 2B. Descending platform (vy = -4.0 tiles/s) -> max(0, v_plat,y) = 0
    const fallingPlat = new MovingPlatformProp({
      id: 'test_descending',
      mode: PlatformMode.LINEAR,
      startX: 8.0,
      startY: 16.0,
      endX: 8.0,
      endY: 3.0,
      speed: 4.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
    });
    const fallBox = createPropSandbox({ propPlatforms: [fallingPlat] });
    fallBox.player.spawn(fallingPlat.pos.x + 1.0, fallingPlat.pos.y + fallingPlat.height);
    for (let f = 0; f < 14; f++) fallBox.step({});

    assert.equal(fallBox.player.ridingPlatform, fallingPlat);
    assert.ok(Math.abs(fallingPlat.vel.y - -4.0) < 1e-6, `Descending vel.y must be -4.0 (got ${fallingPlat.vel.y})`);
    fallBox.step({ jump: true });

    assert.ok(
      Math.abs(fallBox.player.takeoffLaunchVy - MovementProfile.jump.launchVelocity) < 1e-4,
      `Descending platform jump must add max(0, vy) = 0 (got ${fallBox.player.takeoffLaunchVy.toFixed(4)})`
    );

    // 2C. Horizontal Momentum Ejection (jumping off vx = +3.0 tiles/s platform preserves residual inertia)
    const horizPlat = new MovingPlatformProp({
      id: 'test_horiz_eject',
      mode: PlatformMode.LINEAR,
      startX: 4.0,
      startY: 4.0,
      endX: 28.0,
      endY: 4.0,
      speed: 3.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
    });
    const ejectBox = createPropSandbox({ propPlatforms: [horizPlat] });
    ejectBox.player.spawn(horizPlat.pos.x + 1.0, horizPlat.pos.y + horizPlat.height);
    for (let f = 0; f < 5; f++) ejectBox.step({});
    assert.equal(ejectBox.player.ridingPlatform, horizPlat);

    // Jump with NO horizontal directional input -> inherits platform vx = +3.0 as residual inertia!
    ejectBox.step({ jump: true });
    assert.equal(ejectBox.player.grounded, false, 'Player should be airborne after jump');
    assert.ok(
      Math.abs(ejectBox.player.vel.x - 3.0) < 0.05,
      `Horizontal Momentum Ejection must preserve platform vx = 3.0 tiles/s (got ${ejectBox.player.vel.x.toFixed(4)})`
    );
  });

  // ─── VERIFY TEST 3 ──────────────────────────────────────────────────────────
  it('VERIFY Test 3: Compression Spring (64×32px) compresses 16px over 4 frames (squash 0.50); Timed Power Bounce triggers Super Spring (+22.50 t/s) reaching target apex within 0.1t', () => {
    const springCfg = MovementProfile.props.spring;

    // 3A. Geometry & Normal Bounce (+16.00 t/s) with NO jump press
    const normalSpring = new CompressionSpring({ id: 'sp_norm', x: 8.0, y: 2.0 });
    assert.equal(normalSpring.width, 1.0, 'Spring pad width must be 64px (1.00 tile)');
    assert.equal(normalSpring.height, 0.5, 'Spring pad height must be 32px (0.50 tile)');

    const normBox = createPropSandbox({ springs: [normalSpring] });
    // Drop player onto spring from directly above
    normBox.player.spawn(8.15, 3.4);

    let sawCompressFrame4 = false;
    let normalBounceEv = null;
    let launchYNormal = 0;
    let peakYNormal = 0;

    for (let f = 0; f < 100; f++) {
      normBox.step({});
      if (normalSpring.state === SpringState.COMPRESSING && normalSpring.compressFrame === 4) {
        sawCompressFrame4 = true;
        assert.ok(
          Math.abs(normalSpring.squashRatio - 0.50) < 1e-6,
          `On compression frame 4, squashRatio must be 0.50 (got ${normalSpring.squashRatio})`
        );
        assert.ok(
          Math.abs(normalSpring.compressionPx - 16.0) < 1e-6,
          `On compression frame 4, compression travel must be 16px (got ${normalSpring.compressionPx}px)`
        );
      }
      const ev = normBox.props.events.find((e) => e.type === 'springBounce');
      if (ev && !normalBounceEv) {
        normalBounceEv = ev;
        launchYNormal = ev.y;
        peakYNormal = normBox.player.pos.y;
      }
      if (normalBounceEv && normBox.player.pos.y > peakYNormal) {
        peakYNormal = normBox.player.pos.y;
      }
    }

    assert.equal(sawCompressFrame4, true, 'Spring must progress through all 4 compression frames to 0.50 squash');
    assert.ok(normalBounceEv, 'Normal Bounce must fire automatically after 4-frame compression');
    assert.equal(normalBounceEv.isSuper, false, 'Without JUMP input, bounce must be Normal Bounce');
    assert.equal(normalBounceEv.launchVy, 16.00, 'Normal Bounce must fire at +16.00 tiles/s');

    const targetNormalApex = computeSpringTargetApex(springCfg.normalBounceVy);
    const actualNormalApex = peakYNormal - launchYNormal;
    assert.ok(
      Math.abs(actualNormalApex - targetNormalApex) <= 0.1,
      `Normal Spring apex (${actualNormalApex.toFixed(4)}t) must match analytical target (${targetNormalApex.toFixed(4)}t) within 0.1t`
    );

    // 3B. Timed Power Bounce -> Super Spring Launch (+22.50 t/s) on exact compression rebound frame
    const superSpring = new CompressionSpring({ id: 'sp_super', x: 8.0, y: 2.0 });
    const superBox = createPropSandbox({ springs: [superSpring] });
    superBox.player.spawn(8.15, 3.4);

    let superBounceEv = null;
    let launchYSuper = 0;
    let peakYSuper = 0;

    for (let f = 0; f < 120; f++) {
      // Press JUMP on the exact compression rebound frame (when compressFrame === 4 -> next step fires rebound!)
      const pressJumpNow =
        superSpring.state === SpringState.COMPRESSING &&
        superSpring.compressFrame === springCfg.compressFrames;

      superBox.step({ jump: pressJumpNow });

      const ev = superBox.props.events.find((e) => e.type === 'springBounce');
      if (ev && !superBounceEv) {
        superBounceEv = ev;
        launchYSuper = ev.y;
        peakYSuper = superBox.player.pos.y;
      }
      if (superBounceEv && superBox.player.pos.y > peakYSuper) {
        peakYSuper = superBox.player.pos.y;
      }
    }

    assert.ok(superBounceEv, 'Timed Power Bounce must fire Super Spring event');
    assert.equal(superBounceEv.isSuper, true, 'Timed JUMP on rebound frame must trigger Super Spring');
    assert.equal(superBounceEv.launchVy, 22.50, 'Super Spring Launch must fire at +22.50 tiles/s');

    const targetSuperApex = computeSpringTargetApex(springCfg.superBounceVy); // 22.5^2 / (2 * 42.8) = 5.9141t
    const actualSuperApex = peakYSuper - launchYSuper;
    assert.ok(
      Math.abs(actualSuperApex - targetSuperApex) <= 0.1,
      `Super Spring apex (${actualSuperApex.toFixed(4)}t) must reach targeted elevation (${targetSuperApex.toFixed(4)}t) within 0.1 tile margin of error`
    );
  });

  // ─── TEST 4: CIRCULAR ORBIT & FALL-AWAY PLATFORMS ───────────────────────────
  it('Test 4: Circular Orbit carries player along curved path; Fall-Away drops 1.0s (60f) after weight detected and respawns cleanly', () => {
    // 4A. Circular Orbit
    const orbitPlat = new MovingPlatformProp({
      id: 'test_orbit',
      mode: PlatformMode.CIRCULAR_ORBIT,
      centerX: 16.0,
      centerY: 8.0,
      radius: 3.0,
      periodSec: 4.0,
      startAngle: 0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
    });
    const orbitBox = createPropSandbox({ propPlatforms: [orbitPlat] });
    orbitBox.player.spawn(orbitPlat.pos.x + 1.0, orbitPlat.pos.y + orbitPlat.height);
    orbitBox.step({});
    orbitBox.step({});

    assert.equal(orbitBox.player.ridingPlatform, orbitPlat, 'Player must lock onto circular orbit platform');
    const relX0 = orbitBox.player.pos.x - orbitPlat.pos.x;

    // Ride a full quarter-circle (60 frames = 1.0s of 4.0s orbit)
    for (let f = 0; f < 60; f++) {
      orbitBox.step({});
      assert.equal(orbitBox.player.ridingPlatform, orbitPlat, `Orbit frame ${f}: player must stay locked`);
      const relX = orbitBox.player.pos.x - orbitPlat.pos.x;
      assert.ok(
        Math.abs(relX - relX0) < 1e-4,
        `Orbit frame ${f}: player X offset on platform must remain invariant (${relX.toFixed(5)} vs ${relX0.toFixed(5)})`
      );
    }

    // 4B. Fall-Away Platform (1.0s / 60 frames after weight detected)
    const fallPlat = new MovingPlatformProp({
      id: 'test_fall_away',
      mode: PlatformMode.FALL_AWAY,
      startX: 12.0,
      startY: 8.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
    });
    const fallBox = createPropSandbox({ propPlatforms: [fallPlat], floorCols: false });

    // Before player lands, platform stays completely idle
    for (let f = 0; f < 20; f++) {
      fallBox.step({});
    }
    assert.equal(fallPlat.fallState, FallAwayState.IDLE, 'Fall-Away platform must stay IDLE before weight detected');
    assert.equal(fallPlat.pos.y, 8.0);

    // Place player onto Fall-Away platform
    fallBox.player.spawn(13.0, 8.5);
    fallBox.step({}); // Player settles and ridingPlatform = fallPlat
    assert.equal(fallBox.player.ridingPlatform, fallPlat);

    // Step 59 frames -> must remain SHAKING at original Y (not dropped early)
    let detachedOnFrame = -1;
    for (let f = 1; f <= 62; f++) {
      fallBox.step({});
      if (fallPlat.fallState === FallAwayState.FALLING && detachedOnFrame === -1) {
        detachedOnFrame = f;
      }
    }

    assert.equal(
      detachedOnFrame,
      MovementProfile.props.platform.fallAwayDelayFrames,
      `Fall-Away platform must detach at exact frame ${MovementProfile.props.platform.fallAwayDelayFrames} (1.0s), got frame ${detachedOnFrame}`
    );

    // Continue stepping until platform falls out and respawns
    let sawRespawning = false;
    let respawned = false;
    for (let f = 0; f < 300; f++) {
      fallBox.step({});
      if (fallPlat.fallState === FallAwayState.RESPAWNING) {
        sawRespawning = true;
        assert.equal(fallPlat.solidActive, false, 'Respawning Fall-Away platform must be non-solid');
      } else if (sawRespawning && fallPlat.fallState === FallAwayState.IDLE) {
        respawned = true;
        break;
      }
    }

    assert.equal(sawRespawning, true, 'Fall-Away platform must enter RESPAWNING state after falling');
    assert.equal(respawned, true, 'Fall-Away platform must respawn back to IDLE');
    assert.equal(fallPlat.solidActive, true, 'Respawned Fall-Away platform must re-enable collision');
    assert.equal(fallPlat.pos.y, 8.0, 'Respawned Fall-Away platform must return to startY');
  });

  // ─── TEST 5: WARP ACCESS TUBES (ALL ENTRY VECTORS + 45f PIPELINE) ────────────
  it('Test 5: Warp Access Tubes (128×128px) support DOWN/UP/RIGHT/LEFT entry, lock input in IN_WARP_TRANSITION, slide 45 frames, fade to black, and relocate to sub-level', () => {
    const wCfg = MovementProfile.props.warpTube;

    // 5A. DOWN vertical entry + full 45-frame slide -> fade -> subterranean relocation
    const downTube = new WarpAccessTube({
      id: 'tube_down',
      x: 10.0,
      y: 2.0,
      entryVector: WarpEntryVector.DOWN,
      destX: 30.0,
      destY: 2.0,
      destSubArea: true,
    });
    assert.equal(downTube.headWidth, 2.0, 'Warp tube head width must be 128px (2.00 tiles)');
    assert.equal(downTube.headHeight, 2.0, 'Warp tube head height must be 128px (2.00 tiles)');

    const downBox = createPropSandbox({ warpTubes: [downTube] });
    // Stand centered atop pipe mouth (top = y + headHeight = 4.0)
    downBox.player.spawn(downTube.centerX - downBox.player.currentWidth * 0.5, 4.0);
    downBox.step({});
    assert.equal(downBox.player.grounded, true, 'Player should stand solidly atop 128×128px pipe');

    // Crouch atop pipe to trigger DOWN entry
    downBox.step({ down: true });
    assert.equal(
      downBox.player.state,
      PlayerState.IN_WARP_TRANSITION,
      'Crouching atop DOWN tube must enter IN_WARP_TRANSITION'
    );
    assert.equal(downBox.player.warpTransition.phase, WarpTransitionPhase.SLIDING_IN);

    const lockedSlideX = downBox.player.pos.x;
    let slideFramesCounted = 1; // frame 1 already ticked on entry step
    let maxFadeAlpha = 0;
    let sawRelocate = false;

    // Spam conflicting user inputs (right + jump) during transition -> must be completely ignored!
    for (let f = 0; f < 110; f++) {
      const wasSliding = downBox.player.warpTransition?.phase === WarpTransitionPhase.SLIDING_IN;
      downBox.step({ right: true, jump: true });
      const wt = downBox.player.warpTransition;
      if (wasSliding) {
        slideFramesCounted++;
        assert.ok(
          Math.abs(downBox.player.pos.x - lockedSlideX) < 1e-6,
          'User input must be completely disabled during IN_WARP_TRANSITION (zero lateral drift)'
        );
      }
      if (wt && wt.fadeAlpha > maxFadeAlpha) maxFadeAlpha = wt.fadeAlpha;
      if (downBox.player.events.some((e) => e.type === 'warpRelocate')) {
        sawRelocate = true;
      }
      if (!wt && sawRelocate) break;
    }

    assert.equal(
      slideFramesCounted,
      wCfg.slideInFrames,
      `Slide-in interpolation must run for exact ${wCfg.slideInFrames} frames (counted ${slideFramesCounted})`
    );
    assert.ok(maxFadeAlpha >= 0.99, `Screen fade-to-black must reach 1.0 (got ${maxFadeAlpha})`);
    assert.equal(sawRelocate, true, 'Warp pipeline must emit warpRelocate at peak black');
    assert.equal(downBox.props.inSubArea, true, 'Subterranean flag must switch to true on sub-level arrival');
    assert.ok(
      Math.abs(downBox.player.pos.x - 30.0) < 0.05 && Math.abs(downBox.player.pos.y - 2.0) < 0.05,
      `Player must relocate cleanly to subterranean (30.0, 2.0), got (${downBox.player.pos.x.toFixed(2)}, ${downBox.player.pos.y.toFixed(2)})`
    );
    assert.notEqual(
      downBox.player.state,
      PlayerState.IN_WARP_TRANSITION,
      'Player must exit IN_WARP_TRANSITION and regain control after fade-in'
    );

    // 5B. UP overhead entry
    const upTube = new WarpAccessTube({
      id: 'tube_up',
      x: 12.0,
      y: 6.0,
      entryVector: WarpEntryVector.UP,
      destX: 25.0,
      destY: 2.0,
      destSubArea: true,
    });
    const upBox = createPropSandbox({ warpTubes: [upTube] });
    // Position player right beneath overhead pipe mouth moving upward while holding UP
    upBox.player.spawn(upTube.centerX - upBox.player.currentWidth * 0.5, upTube.y - upBox.player.currentHeight);
    upBox.player.grounded = false;
    upBox.player.vel.y = 4.0;
    upBox.step({ up: true });
    assert.equal(
      upBox.player.state,
      PlayerState.IN_WARP_TRANSITION,
      'Holding UP under overhead UP tube must enter IN_WARP_TRANSITION'
    );
    assert.equal(upBox.player.warpTransition.entryVector, WarpEntryVector.UP);

    // 5C. RIGHT lateral entry
    const rightTube = new WarpAccessTube({
      id: 'tube_right',
      x: 15.0,
      y: 2.0,
      entryVector: WarpEntryVector.RIGHT,
      destX: 28.0,
      destY: 2.0,
      destSubArea: true,
    });
    const rightBox = createPropSandbox({ warpTubes: [rightTube] });
    rightBox.player.spawn(rightTube.x - rightBox.player.currentWidth - 0.02, 2.0);
    rightBox.step({});
    rightBox.step({ right: true });
    assert.equal(
      rightBox.player.state,
      PlayerState.IN_WARP_TRANSITION,
      'Pressing RIGHT against lateral RIGHT tube mouth must enter IN_WARP_TRANSITION'
    );
    assert.equal(rightBox.player.warpTransition.entryVector, WarpEntryVector.RIGHT);

    // 5D. LEFT lateral entry
    const leftTube = new WarpAccessTube({
      id: 'tube_left',
      x: 10.0,
      y: 2.0,
      entryVector: WarpEntryVector.LEFT,
      destX: 28.0,
      destY: 2.0,
      destSubArea: true,
    });
    const leftBox = createPropSandbox({ warpTubes: [leftTube] });
    leftBox.player.spawn(leftTube.x + leftTube.headWidth + 0.02, 2.0);
    leftBox.step({});
    leftBox.step({ left: true });
    assert.equal(
      leftBox.player.state,
      PlayerState.IN_WARP_TRANSITION,
      'Pressing LEFT against lateral LEFT tube mouth must enter IN_WARP_TRANSITION'
    );
    assert.equal(leftBox.player.warpTransition.entryVector, WarpEntryVector.LEFT);
  });

  // ─── TEST 6: ROOM 10 INTEGRATION & DETERMINISM ──────────────────────────────
  it('Test 6: Room 10 (Interactive Props Lab) passes geometry lint, populates all prop types, and runs deterministically', () => {
    const engA = new GameEngine();
    engA.initHeadless(9);

    assert.equal(engA.currentRoomIndex, 9, 'Room 10 must load at index 9');
    assert.match(engA.currentRoom.name, /Props Lab/i);
    assert.equal(
      engA.geometryLintReport.passed,
      true,
      `Room 10 must pass geometry lint: ${JSON.stringify(engA.geometryLintReport)}`
    );
    assert.ok(engA.props.platforms.length >= 6, 'Room 10 must contain Linear, Orbit, and Fall-Away platforms');
    assert.ok(engA.props.springs.length >= 3, 'Room 10 must contain Compression Launch Springs');
    assert.ok(engA.props.warpTubes.length >= 4, 'Room 10 must contain DOWN, UP, and Lateral Warp Access Tubes');

    const engB = new GameEngine();
    engB.initHeadless(9);

    // Run identical 180-frame input sequence (run right onto opening spring + timed jump)
    for (let f = 0; f < 180; f++) {
      const inp = { right: f < 75, jump: f === 55 || f === 56 };
      engA.stepHeadless(inp);
      engB.stepHeadless(inp);
    }

    assert.equal(
      engA.player.stateHash,
      engB.player.stateHash,
      'Identical headless Room 10 runs must produce identical deterministic stateHash'
    );
    assert.equal(engA.player.pos.x, engB.player.pos.x);
    assert.equal(engA.player.pos.y, engB.player.pos.y);
  });
});
