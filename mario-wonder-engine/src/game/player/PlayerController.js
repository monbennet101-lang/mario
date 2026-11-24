/**
 * PlayerController — Stage 5 Terrain Slopes, Butt-Slide, Semisolids & Platforms
 * =============================================================================
 * Stage 1: Fixed 60 Hz swept AABB collision, deterministic state hashing.
 * Stage 2: Frame-1 start impulse (1.25 t/s), non-linear walk/run acceleration ramp,
 *          release friction (22.0 t/s²), high-speed skid (>4.50 t/s @ 44.0 t/s²) with
 *          preserved slide facing, 4-frame low-speed pivot turn (3x accel), and
 *          crouch/crouch-slide (50% hitbox height) with ceiling clearance raycast.
 * Stage 3: Two-phase asymmetric jump arc (v0=18.60, g_rise=42.80, g_fall=62.00),
 *          running sprint boost (+10% v0), 6-frame buoyant apex float (0.65x),
 *          variable height early cutoff (3.20x), coyote time (5f), jump buffer (6f),
 *          ceiling corner nudge (0.25t), ledge step-up (0.20t), air control, and
 *          non-mutating jump arc telemetry.
 * Stage 4: Mid-Air Spin Twirl (+1.60 t/s, [-1.50,+1.50] 18f helicopter hover, 1080° spin,
 *          combat flag), Wall Slide (4.20 t/s clamp), Wall Jump (8.50 vx, 16.80 vy,
 *          8f steering lockout, 5f wall coyote), Ground Pound (10f frozen windup,
 *          28.00 t/s dive, 10f recovery w/ buffered jump, 0.65 trauma), and strict
 *          State Arbitration Matrix.
 * Stage 5: 45° / 26.57° exact slopes, 0.40t downhill ground adhesion, Slope Butt-Slide
 *          (theta >= 14°, g*sin - 0.04*g*cos, cap 14.50 t/s, flat runout 11.20 t/s²,
 *          enemy-defeat flag >= 6.00 t/s, slide jump preserving velocity), One-Way
 *          Semisolid Down+Jump drop-through, and Moving Platform carry + velocity inherit.
 */

import MovementProfile, { applyCharacterProfile } from '../../game/config/MovementProfile.js';
import { Actions } from '../../engine/input/InputManager.js';
import { computeAnalogTargetVelocity } from '../../engine/input/AnalogMath.js';
import { PlayerState, StateGroups } from './PlayerState.js';
import { clamp, moveToward } from '../../utils/MathUtils.js';
import { PowerUpForm, PowerUpType } from '../powerups/PowerUp.js';

export const SpeedTier = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  RUN: 'RUN',
  SPRINT: 'SPRINT',
  MAX: 'MAX',
};

class PlayerController {
  constructor() {
    // ── Position & Velocity (tiles, tiles/s) ──
    this.pos = { x: 2.0, y: 10.0 };
    this.prevPos = { x: 2.0, y: 10.0 };
    this.vel = { x: 0.0, y: 0.0 };

    // ── Hitbox ──
    this.width = MovementProfile.hitbox.width;
    this.height = MovementProfile.hitbox.height;
    this.isCrouched = false;
    this.standingBlocked = false;

    // ── State Machine ──
    this.state = PlayerState.FALL;
    this.prevState = PlayerState.FALL;
    this.stateFrames = 0;

    // ── Flags & Counters ──
    this.grounded = false;
    this.wasGrounded = false;
    this.facingRight = true;

    // Stage 2 locomotion counters
    this.pivotTimer = 0;
    this.pivotDir = 0;
    this.isSkidding = false;
    this.skidSlideDir = 0;
    this.strideDistance = 0;
    this._nextFootstepDist = 0;
    this._skidVfxTimer = 0;
    this._sprintVfxTimer = 0;

    // Stage 3 jump, apex float & forgiveness counters
    this.coyoteFramesRemaining = 0;
    this.coyoteElapsed = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isJumping = false;
    this.jumpFrames = 0;
    this.jumpCutApplied = false;
    this.apexFloatRemaining = 0;
    this.apexFloatFramesUsed = 0;
    this.inApexFloat = false;
    this.takeoffMaxSpeed = MovementProfile.locomotion.runTopSpeed;
    this.takeoffLaunchVy = MovementProfile.jump.launchVelocity;

    // Presentation-only per-tick events & telemetry (never affect physics hash)
    this.events = [];
    this.jumpMetrics = this._createEmptyJumpMetrics();

    // Stage 4 Acrobatic Move Set counters
    this.hasSpunThisAirtime = false;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinTwirlElapsed = 0;
    this.spinJumpFrames = 0;

    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallContactDirection = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this._wallSlideVfxTimer = 0;

    this.groundPoundPhase = null;
    this.groundPoundWindupTimer = 0;
    this.groundPoundRecoveryTimer = 0;
    this.groundPoundBufferedJump = false;

    // Stage 5 Slopes, Butt-Slide, Semisolids & Moving Platforms
    this.isOnSlope = false;
    this.slopeAngleDeg = 0;
    this.slopeDerivative = 0;
    this.slopeAdhesionActive = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.standingOnSemisolid = false;
    this.standingOnSolid = false;
    this.dropThroughTimer = 0;
    this.dropThroughFloorY = null;
    this.ridingPlatform = null;
    this._coyotePlatform = null;
    this._slideVfxTimer = 0;

    this.invulnerabilityTimer = 0;
    this.ceilingHit = false;
    this.groundNormal = { x: 0, y: 1 };

    // Stage 8 Character & Presentation-only skeletal animation counters (never affect physics hash!)
    this.characterId = MovementProfile.activeCharacter || 'mario';
    this.isFluttering = false;
    this.flutterFramesRemaining = MovementProfile.characters[this.characterId]?.flutterMaxFrames ?? 0;
    this.jumpComboCount = 1;
    this._jumpComboGraceTimer = 0;
    this._canAdvanceJumpCombo = false;
    this.turnAroundTimer = 0;
    this.isVictory = false;

    // Stage 9 Power-Ups, Stomp Rebound, Carry, Fireball Throw & Damage/Defeat
    this.powerUpForm = PowerUpForm.SMALL;
    this.damageRecoilTimer = 0;
    this.defeatTimer = 0;
    this.defeatTriggerReset = false;
    this.growthTimer = 0;
    this.growthTotalFrames = MovementProfile.powerups.growthOscillationFrames;
    this.carriedEntity = null;
    this.fireWindupTimer = 0;
    this.fireCooldownTimer = 0;
    this.fireThrowAnimTimer = 0;
    this.shellThrowAnimTimer = 0;
    this.isStompRebound = false;
    this.isPassiveRebound = false;
    this._stompActiveVy = MovementProfile.combat.stompActiveVy;

    // Stage 10 Warp Pipe suction state
    this.warpPipeTimer = 0;
    this.warpPipeData = null;

    // Interactive Environmental Props: Springs & Warp Access Tubes
    this.isSpringLaunch = false;
    this.activeSpring = null;
    this.warpTransition = null;
    this.warpCooldownTimer = 0;

    // Stage 18 Horizontal Hydro-Geyser Jet & Hazard contact flags (zero physics constant mutation)
    this.hydroJetTimer = 0;
    this.hydroJetFlutterWindow = 0;
    this.hitHazard = false;

    // State hash for deterministic verification
    this._tickHash = 0;
  }

  _createEmptyJumpMetrics() {
    return {
      active: false,
      isJump: false,
      startX: 0,
      startY: 0,
      takeoffVx: 0,
      launchVy: 0,
      frames: 0,
      apexFrame: 0,
      peakHeight: 0,
      timeToApex: 0,
      airtime: 0,
      apexFloatFrames: 0,
      wasCoyote: false,
      wasBuffered: false,
      cornerNudged: false,
      stepUpUsed: false,
      samples: [],
    };
  }

  get centerX() { return this.pos.x + this.currentWidth / 2; }
  get centerY() { return this.pos.y + this.currentHeight / 2; }

  get hands() {
    const cfg = MovementProfile.enemyGallery.hoplite;
    const dir = this.facingRight ? 1 : -1;
    return {
      x: this.centerX + dir * cfg.handsOffsetX,
      y: this.pos.y + cfg.handsOffsetY,
    };
  }

  get currentHeight() {
    return this.isCrouched
      ? this.height * (1 - MovementProfile.crouch.heightReduction)
      : this.height;
  }

  get currentWidth() {
    return this.width;
  }

  get speedTier() {
    const absVx = Math.abs(this.vel.x);
    if (absVx <= 0.05) return SpeedTier.IDLE;
    if (absVx >= MovementProfile.locomotion.runTopSpeed - 0.35) return SpeedTier.MAX;
    if (absVx >= MovementProfile.vfx.sprintDustMinSpeed) return SpeedTier.SPRINT;
    if (absVx > MovementProfile.locomotion.walkTopSpeed + 0.05) return SpeedTier.RUN;
    return SpeedTier.WALK;
  }

  setState(newState) {
    if (newState === this.state) return;
    this.prevState = this.state;
    this.state = newState;
    this.stateFrames = 0;
  }

  /**
   * Stage 8: Live zero-hitch character switch (Mario <-> Luigi).
   * Preserves position, velocity, and collision state while switching kinematic profile.
   */
  setCharacter(characterId) {
    const charCfg = applyCharacterProfile(characterId);
    this.characterId = charCfg.id;
    if (!charCfg.canFlutterJump) {
      this.isFluttering = false;
      this.flutterFramesRemaining = 0;
    } else if (this.grounded) {
      this.flutterFramesRemaining = charCfg.flutterMaxFrames;
    }
    return charCfg;
  }

  // ── Stage 9 Power-Up & Combat Actions ────────────────────────

  applyPowerUp(type) {
    if (type === PowerUpType.SUPER_MUSHROOM) {
      if (this.powerUpForm === PowerUpForm.SMALL) {
        this.powerUpForm = PowerUpForm.SUPER;
      }
      this.growthTimer = MovementProfile.powerups.growthOscillationFrames;
      this.growthTotalFrames = MovementProfile.powerups.growthOscillationFrames;
      this.vel.y = Math.max(this.vel.y, MovementProfile.powerups.mushroomHopVy);
      this.grounded = false;
      this.isJumping = false;
      this.isStompRebound = false;
      this.isPassiveRebound = false;
      this.events.push({ type: 'powerUp', powerUpType: type, form: this.powerUpForm });
    } else if (type === PowerUpType.FIRE_FLOWER) {
      this.powerUpForm = PowerUpForm.FIRE;
      this.vel.y = Math.max(this.vel.y, MovementProfile.powerups.fireUpgradeLeapVy);
      this.grounded = false;
      this.isJumping = false;
      this.isStompRebound = false;
      this.isPassiveRebound = false;
      this.events.push({ type: 'powerUp', powerUpType: type, form: this.powerUpForm });
    }
  }

  applyStompRebound(jumpHeld, enemyTopY = null, reboundOverrides = null) {
    if (enemyTopY !== null && this.pos.y < enemyTopY) {
      this.pos.y = Math.max(this.pos.y, enemyTopY + 0.02);
    }
    const passiveVy = reboundOverrides?.passiveVy ?? MovementProfile.combat.stompPassiveVy;
    const activeVy = reboundOverrides?.activeVy ?? MovementProfile.combat.stompActiveVy;
    this._stompActiveVy = activeVy;
    const active = Boolean(jumpHeld);
    this.vel.y = active ? activeVy : passiveVy;
    this.grounded = false;
    this.isCrouched = false;
    this.standingBlocked = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.groundPoundPhase = null;
    this.groundPoundRecoveryTimer = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this.hasSpunThisAirtime = false;
    this._canAdvanceJumpCombo = false;
    this.jumpComboCount = 1;
    this.isJumping = true;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this.jumpFrames = 0;
    this.jumpCutApplied = false;
    this.isStompRebound = true;
    this.isPassiveRebound = !active;
    this.apexFloatRemaining = MovementProfile.apexFloat.maxFrames;
    this.apexFloatFramesUsed = 0;
    this.inApexFloat = false;
    this.takeoffMaxSpeed = Math.max(MovementProfile.locomotion.walkTopSpeed, Math.abs(this.vel.x));
    const charCfg = MovementProfile.characters[this.characterId] || MovementProfile.characters.mario;
    this.flutterFramesRemaining = charCfg.canFlutterJump ? charCfg.flutterMaxFrames : 0;
    this.isFluttering = false;
    this.setState(PlayerState.JUMP);
  }

  upgradeStompReboundToActive() {
    if (this.isStompRebound && this.isPassiveRebound) {
      this.vel.y = this._stompActiveVy ?? MovementProfile.combat.stompActiveVy;
      this.isPassiveRebound = false;
    }
  }

  /**
   * Stage 18: Horizontal Hydraulic Geyser Jet propulsion (vx = ±14.0 tiles/s).
   * Raises airborne takeoffMaxSpeed cap for the current jet flight and arms the
   * jet-exit Flutter Jump window without mutating MovementProfile constants.
   */
  applyHorizontalJetBoost(jetVx, liftVy = MovementProfile.world1.horizontalJetLiftVy, jet = null) {
    if (this.state === PlayerState.DEFEAT || this.state === PlayerState.IN_WARP_TRANSITION) return false;
    const absVx = Math.abs(jetVx);
    this.vel.x = jetVx;
    this.vel.y = Math.max(this.vel.y, liftVy);
    this.facingRight = jetVx >= 0;
    this.grounded = false;
    this.ridingPlatform = null;
    this.isCrouched = false;
    this.isSkidding = false;
    this.isButtSliding = false;
    this.isWallSliding = false;
    this.groundPoundPhase = null;
    this.takeoffMaxSpeed = Math.max(this.takeoffMaxSpeed, absVx);
    this.hydroJetTimer = 3;
    const w1 = MovementProfile.world1;
    this.hydroJetFlutterWindow = w1.horizontalJetExitFlutterFrames;
    this.flutterFramesRemaining = Math.max(
      this.flutterFramesRemaining,
      w1.horizontalJetExitFlutterFrames
    );
    this.hasSpunThisAirtime = false;
    this.setState(PlayerState.JUMP);
    this.events.push({
      type: 'horizontalJet',
      x: this.centerX,
      y: this.centerY,
      vx: jetVx,
      jetId: jet?.id || null,
    });
    return true;
  }

  throwCarriedShell() {
    if (!this.carriedEntity) return false;
    const shell = this.carriedEntity;
    this.carriedEntity = null;
    const dir = this.facingRight ? 1 : -1;
    const throwSpeed = shell.throwSpeed ?? MovementProfile.combat.shellThrowSpeed;
    shell.pos.x = this.centerX + dir * 0.65 - shell.width * 0.5;
    shell.pos.y = this.pos.y + 0.05;
    shell.syncPrevPos();
    shell.kickShell(dir, throwSpeed);
    this.shellThrowAnimTimer = MovementProfile.combat.throwAnimFrames;
    this.events.push({ type: 'shellThrow', x: shell.centerX, y: shell.centerY, dir });
    return true;
  }

  startWarpPipe(pipeSpec) {
    if (!pipeSpec || this.state === PlayerState.WARP_PIPE) return false;
    this.warpPipeData = pipeSpec;
    this.warpPipeTimer = MovementProfile.warpPipe.enterFrames;
    this.vel.x = 0;
    this.vel.y = 0;
    this.pos.x = pipeSpec.enterX - this.currentWidth * 0.5;
    this.isCrouched = true;
    this.standingBlocked = false;
    this.isSkidding = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isWallSliding = false;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinJumpFrames = 0;
    this._canAdvanceJumpCombo = false;
    this.jumpComboCount = 1;
    this.groundPoundPhase = null;
    this.setState(PlayerState.WARP_PIPE);
    this.events.push({ type: 'warpPipeEnter', x: pipeSpec.enterX, y: pipeSpec.enterY });
    return true;
  }

  /**
   * Mechanical Compression Spring Launch (Normal +16.00 t/s or Timed Power Bounce +22.50 t/s).
   * Disables variable early-release cutoff and apex float so launch reaches exact analytical elevation.
   */
  applySpringLaunch(launchVy, isSuper = false, spring = null) {
    this.activeSpring = null;
    this.isCrouched = false;
    this.standingBlocked = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isSkidding = false;
    this.pivotTimer = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this.hasSpunThisAirtime = false;
    this.groundPoundPhase = null;
    this.groundPoundRecoveryTimer = 0;
    this.groundPoundBufferedJump = false;
    this.ridingPlatform = null;
    this._coyotePlatform = null;
    this.isStompRebound = false;
    this.isPassiveRebound = false;
    this.jumpComboCount = 1;
    this._jumpComboGraceTimer = 0;
    this._canAdvanceJumpCombo = false;

    const charCfg = MovementProfile.characters[this.characterId] || MovementProfile.characters.mario;
    this.isFluttering = false;
    this.flutterFramesRemaining = charCfg.canFlutterJump ? charCfg.flutterMaxFrames : 0;

    this.vel.y = launchVy;
    this.grounded = false;
    this.coyoteFramesRemaining = 0;
    this.jumpBufferTimer = 0;
    this.isJumping = true;
    this.isSpringLaunch = true;
    this.jumpFrames = 0;
    this.jumpCutApplied = false;
    this.apexFloatRemaining = 0;
    this.apexFloatFramesUsed = 0;
    this.inApexFloat = false;
    this.takeoffMaxSpeed = Math.max(MovementProfile.locomotion.runTopSpeed, Math.abs(this.vel.x));
    this.takeoffLaunchVy = launchVy;

    this.jumpMetrics = {
      active: true,
      isJump: true,
      startX: this.centerX,
      startY: this.pos.y,
      takeoffVx: this.vel.x,
      launchVy,
      frames: 0,
      apexFrame: 0,
      peakHeight: 0,
      timeToApex: 0,
      airtime: 0,
      apexFloatFrames: 0,
      wasCoyote: false,
      wasBuffered: false,
      cornerNudged: false,
      stepUpUsed: false,
      samples: [{ t: 0, dy: 0, vy: launchVy }],
    };

    this.setState(PlayerState.JUMP);
    this.events.push({
      type: 'springLaunch',
      launchVy,
      isSuper,
      springId: spring?.id || null,
      x: this.centerX,
      y: this.pos.y,
    });
  }

  /**
   * Enter a 128×128px Warp Access Tube (DOWN / UP / LEFT / RIGHT).
   * Disables user input, transitions into IN_WARP_TRANSITION, and slides smoothly
   * over 45 frames into the pipe interior behind the foreground mouth mask.
   */
  startWarpTransition(tube) {
    if (
      !tube ||
      this.state === PlayerState.IN_WARP_TRANSITION ||
      this.state === PlayerState.DEFEAT ||
      this.warpCooldownTimer > 0
    ) {
      return false;
    }

    const wCfg = MovementProfile.props.warpTube;
    const track = tube.computeSlideTrack(this);

    this.vel.x = 0;
    this.vel.y = 0;
    this.pos.x = track.startX;
    this.pos.y = track.startY;
    this.prevPos.x = track.startX;
    this.prevPos.y = track.startY;
    this.grounded = false;
    this.activeSpring = null;
    this.isSpringLaunch = false;
    this.ridingPlatform = null;
    this._coyotePlatform = null;
    this.isCrouched = tube.entryVector === 'DOWN';
    this.standingBlocked = false;
    this.isSkidding = false;
    this.pivotTimer = 0;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this.groundPoundPhase = null;
    this.jumpComboCount = 1;
    this._canAdvanceJumpCombo = false;

    if (tube.entryVector === 'RIGHT') this.facingRight = true;
    else if (tube.entryVector === 'LEFT') this.facingRight = false;

    this.warpTransition = {
      tube,
      phase: 'SLIDING_IN',
      frame: 0,
      phaseFrames: wCfg.slideInFrames,
      fadeAlpha: 0,
      startX: track.startX,
      startY: track.startY,
      endX: track.endX,
      endY: track.endY,
      entryVector: tube.entryVector,
      relocated: false,
    };

    this.setState(PlayerState.IN_WARP_TRANSITION);
    this.events.push({
      type: 'warpTransitionStart',
      tube,
      entryVector: tube.entryVector,
      x: tube.centerX,
      y: tube.centerY,
    });
    return true;
  }

  takeDamage(_sourceX = null) {
    if (this.invulnerabilityTimer > 0 || this.state === PlayerState.DEFEAT) return null;

    this.isCrouched = false;
    this.standingBlocked = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isSkidding = false;
    this.pivotTimer = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this._canAdvanceJumpCombo = false;
    this.jumpComboCount = 1;
    this.groundPoundPhase = null;
    this.isStompRebound = false;
    this.isPassiveRebound = false;
    this.isJumping = false;
    this.fireWindupTimer = 0;

    if (this.powerUpForm === PowerUpForm.FIRE || this.powerUpForm === PowerUpForm.SUPER) {
      this.powerUpForm = PowerUpForm.SMALL;
      const facingSign = this.facingRight ? 1 : -1;
      this.vel.x = facingSign * MovementProfile.combat.damageRecoilVx;
      this.vel.y = MovementProfile.combat.damageRecoilVy;
      this.grounded = false;
      this.invulnerabilityTimer = MovementProfile.combat.invulnerabilityFrames;
      this.damageRecoilTimer = MovementProfile.combat.damageRecoilLockFrames;
      this.setState(PlayerState.DAMAGE);
      return 'downgrade';
    }

    this.vel.x = 0;
    this.vel.y = MovementProfile.combat.defeatPopVy;
    this.grounded = false;
    this.defeatTimer = MovementProfile.combat.defeatResetFrames;
    this.defeatTriggerReset = false;
    this.setState(PlayerState.DEFEAT);
    return 'defeat';
  }

  getRenderAlpha() {
    if (this.invulnerabilityTimer <= 0 || this.state === PlayerState.DEFEAT) return 1.0;
    const elapsed = MovementProfile.combat.invulnerabilityFrames - this.invulnerabilityTimer;
    const period = Math.max(1, MovementProfile.combat.invulnerabilityFlickerFrames);
    return Math.floor(elapsed / period) % 2 === 0
      ? MovementProfile.combat.invulnerabilityAlphaLow
      : MovementProfile.combat.invulnerabilityAlphaHigh;
  }

  getGrowthPresentationScale() {
    if (this.growthTimer <= 0) {
      const s = this.powerUpForm === PowerUpForm.SMALL ? MovementProfile.powerups.smallVisualScale : 1.0;
      return { sx: s, sy: s, sz: s };
    }
    const pCfg = MovementProfile.powerups;
    const total = Math.max(1, this.growthTotalFrames);
    const t = clamp((total - this.growthTimer + 1) / total, 0, 1);

    let sx = 1.0;
    let sy = 1.0;
    if (t <= 1 / 3) {
      const k = t * 3;
      const ease = 1 - (1 - k) * (1 - k);
      sx = 1.0 + (pCfg.growthStage1Sx - 1.0) * ease;
      sy = 1.0 + (pCfg.growthStage1Sy - 1.0) * ease;
    } else if (t <= 2 / 3) {
      const k = (t - 1 / 3) * 3;
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      sx = pCfg.growthStage1Sx + (pCfg.growthStage2Sx - pCfg.growthStage1Sx) * ease;
      sy = pCfg.growthStage1Sy + (pCfg.growthStage2Sy - pCfg.growthStage1Sy) * ease;
    } else {
      const k = (t - 2 / 3) * 3;
      const ease = 1 - Math.pow(1 - k, 2);
      sx = pCfg.growthStage2Sx + (1.0 - pCfg.growthStage2Sx) * ease;
      sy = pCfg.growthStage2Sy + (1.0 - pCfg.growthStage2Sy) * ease;
    }
    const sz = clamp(1 / Math.max(0.25, sx * sy), 0.75, 1.35);
    return { sx, sy, sz };
  }

  _executeJump(collision, viaCoyote, viaBuffer) {
    const canJump = !this.isCrouched || collision.hasStandingClearance(
      this.pos.x,
      this.pos.y,
      this.currentWidth,
      this.height
    );
    if (!canJump) return false;

    const wasButtSliding = this.isButtSliding;
    const plat = this.ridingPlatform || (viaCoyote ? this._coyotePlatform : null);
    const inheritedPlatVx = plat ? plat.vel.x : 0;
    const inheritedPlatVy = plat ? Math.max(0, plat.vel.y) : 0;
    const prePlatAbsVx = Math.abs(this.vel.x);

    const wasSkidding = this.isSkidding;
    this.isCrouched = false;
    this.standingBlocked = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isSkidding = false;
    this.pivotTimer = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this.hasSpunThisAirtime = false;
    this.groundPoundPhase = null;
    this.groundPoundRecoveryTimer = 0;
    this.groundPoundBufferedJump = false;
    this.ridingPlatform = null;
    this._coyotePlatform = null;
    this.isSpringLaunch = false;
    this.activeSpring = null;

    if (inheritedPlatVx !== 0) {
      this.vel.x += inheritedPlatVx;
    }

    const jCfg = MovementProfile.jump;
    const runTop = Math.max(0.01, MovementProfile.locomotion.runTopSpeed);
    const speedRatio = clamp(prePlatAbsVx / runTop, 0, 1);

    // Triple Jump progression: Jump 1 -> land -> DoubleJump -> land -> TripleJump -> Jump 1
    if (
      this._jumpComboGraceTimer > 0 &&
      this._canAdvanceJumpCombo &&
      Math.abs(this.vel.x) >= jCfg.comboMinSpeed &&
      !wasButtSliding &&
      !wasSkidding
    ) {
      this.jumpComboCount = (this.jumpComboCount % 3) + 1;
    } else {
      this.jumpComboCount = 1;
    }
    this._jumpComboGraceTimer = 0;
    this._canAdvanceJumpCombo = true;

    const vyMult =
      this.jumpComboCount === 3
        ? jCfg.tripleJumpVyMult
        : this.jumpComboCount === 2
          ? jCfg.doubleJumpVyMult
          : 1.0;
    const vxMult =
      this.jumpComboCount === 3
        ? jCfg.tripleJumpVxMult
        : this.jumpComboCount === 2
          ? jCfg.doubleJumpVxMult
          : 1.0;
    const vxImpulse =
      this.jumpComboCount === 3
        ? jCfg.tripleJumpVxImpulse
        : this.jumpComboCount === 2
          ? jCfg.doubleJumpVxImpulse
          : 0.0;

    const boostedMaxSpeed =
      Math.max(MovementProfile.locomotion.walkTopSpeed, Math.abs(this.vel.x)) * vxMult;
    if (vxImpulse > 0 && Math.abs(this.vel.x) > MovementProfile.locomotion.stopThreshold) {
      const dirSign = Math.sign(this.vel.x);
      this.vel.x = clamp(this.vel.x + dirSign * vxImpulse, -boostedMaxSpeed, boostedMaxSpeed);
    }

    // Momentum Transfer Physics: v_y,launch = v_y,jump + max(0, v_plat,y)
    const baseJumpVy = jCfg.launchVelocity * (1.0 + jCfg.runBoostFactor * speedRatio) * vyMult;
    const v0 = baseJumpVy + inheritedPlatVy;

    // Stage 8: Reset Luigi flutter allowance on jump launch
    const charCfg = MovementProfile.characters[this.characterId] || MovementProfile.characters.mario;
    this.isFluttering = false;
    this.flutterFramesRemaining = charCfg.canFlutterJump ? charCfg.flutterMaxFrames : 0;

    this.vel.y = v0;
    this.grounded = false;
    this.coyoteFramesRemaining = 0;
    this.jumpBufferTimer = 0;
    this.isJumping = true;
    this.jumpFrames = 0;
    this.jumpCutApplied = false;
    this.apexFloatRemaining = MovementProfile.apexFloat.maxFrames;
    this.apexFloatFramesUsed = 0;
    this.inApexFloat = false;
    this.takeoffMaxSpeed = boostedMaxSpeed;
    this.takeoffLaunchVy = v0;

    this.jumpMetrics = {
      active: true,
      isJump: true,
      startX: this.centerX,
      startY: this.pos.y,
      takeoffVx: this.vel.x,
      launchVy: v0,
      frames: 0,
      apexFrame: 0,
      peakHeight: 0,
      timeToApex: 0,
      airtime: 0,
      apexFloatFrames: 0,
      wasCoyote: viaCoyote,
      wasBuffered: viaBuffer,
      cornerNudged: false,
      stepUpUsed: false,
      samples: [{ t: 0, dy: 0, vy: v0 }],
    };

    this.events.push({
      type: 'jump',
      combo: this.jumpComboCount,
      launchVy: v0,
      baseVy: jCfg.launchVelocity,
      viaCoyote,
      viaBuffer,
      viaButtSlide: wasButtSliding,
      x: this.centerX,
      y: this.pos.y,
    });

    this.setState(PlayerState.JUMP);
    return true;
  }

  _executeSpinJump(collision) {
    const canJump = !this.isCrouched || collision.hasStandingClearance(
      this.pos.x,
      this.pos.y,
      this.currentWidth,
      this.height
    );
    if (!canJump) return false;

    const plat = this.ridingPlatform;
    const inheritedPlatVx = plat ? plat.vel.x : 0;
    const inheritedPlatVy = plat ? Math.max(0, plat.vel.y) : 0;
    const prePlatAbsVx = Math.abs(this.vel.x);

    this.isCrouched = false;
    this.standingBlocked = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isSkidding = false;
    this.pivotTimer = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this.groundPoundPhase = null;
    this.groundPoundRecoveryTimer = 0;
    this.groundPoundBufferedJump = false;
    this.ridingPlatform = null;
    this._coyotePlatform = null;
    this.isSpringLaunch = false;
    this.activeSpring = null;
    this.jumpComboCount = 1;
    this._jumpComboGraceTimer = 0;
    this._canAdvanceJumpCombo = false;

    if (inheritedPlatVx !== 0) {
      this.vel.x += inheritedPlatVx;
    }

    const sjCfg = MovementProfile.spinJump;
    const runTop = Math.max(0.01, MovementProfile.locomotion.runTopSpeed);
    const speedRatio = clamp(prePlatAbsVx / runTop, 0, 1);
    const v0 = sjCfg.launchVelocity * (1.0 + sjCfg.runBoostFactor * speedRatio) + inheritedPlatVy;
    const capBoost = 1.0 + sjCfg.horizontalBoostFactor * speedRatio;
    const boostedMaxSpeed = Math.max(MovementProfile.locomotion.walkTopSpeed, Math.abs(this.vel.x)) * capBoost;
    if (speedRatio > 0.25 && Math.abs(this.vel.x) > MovementProfile.locomotion.stopThreshold) {
      this.vel.x = clamp(this.vel.x * (1.0 + sjCfg.horizontalBoostFactor * 0.5 * speedRatio), -boostedMaxSpeed, boostedMaxSpeed);
    }

    const charCfg = MovementProfile.characters[this.characterId] || MovementProfile.characters.mario;
    this.isFluttering = false;
    this.flutterFramesRemaining = charCfg.canFlutterJump ? charCfg.flutterMaxFrames : 0;

    this.vel.y = v0;
    this.grounded = false;
    this.coyoteFramesRemaining = 0;
    this.jumpBufferTimer = 0;
    this.isJumping = true;
    this.jumpFrames = 0;
    this.jumpCutApplied = false;
    this.apexFloatRemaining = MovementProfile.apexFloat.maxFrames;
    this.apexFloatFramesUsed = 0;
    this.inApexFloat = false;
    this.takeoffMaxSpeed = boostedMaxSpeed;
    this.takeoffLaunchVy = v0;

    this.isSpinJumping = true;
    this.isSpinning = true;
    this.isSpinningCombat = true;
    this.hasSpunThisAirtime = true;
    this.spinTwirlTimer = 0;
    this.spinTwirlElapsed = 0;
    this.spinJumpFrames = 0;

    this.jumpMetrics = {
      active: true,
      isJump: true,
      startX: this.centerX,
      startY: this.pos.y,
      takeoffVx: this.vel.x,
      launchVy: v0,
      frames: 0,
      apexFrame: 0,
      peakHeight: 0,
      timeToApex: 0,
      airtime: 0,
      apexFloatFrames: 0,
      wasCoyote: false,
      wasBuffered: false,
      cornerNudged: false,
      stepUpUsed: false,
      samples: [{ t: 0, dy: 0, vy: v0 }],
    };

    this.events.push({
      type: 'spinJump',
      launchVy: v0,
      baseVy: sjCfg.launchVelocity,
      x: this.centerX,
      y: this.pos.y,
    });

    this.setState(PlayerState.SPIN_JUMP);
    return true;
  }

  _executeWallJump(wallDir, heldLeft = false, heldRight = false) {
    const awayDir = -wallDir;
    this.isCrouched = false;
    this.standingBlocked = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.isSkidding = false;
    this.pivotTimer = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.coyoteFramesRemaining = 0;
    this.jumpBufferTimer = 0;
    this.ridingPlatform = null;
    this._coyotePlatform = null;

    this.isJumping = false;
    this.isWallJumping = true;
    this.jumpCutApplied = false;
    this.inApexFloat = false;
    this.apexFloatRemaining = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this._canAdvanceJumpCombo = false;
    this.jumpComboCount = 1;

    this.vel.x = awayDir * MovementProfile.wall.jumpVx;
    this.vel.y = MovementProfile.wall.jumpVy;
    this.facingRight = awayDir > 0;
    this.takeoffMaxSpeed = Math.max(
      MovementProfile.locomotion.walkTopSpeed,
      Math.abs(this.vel.x)
    );

    this.wallJumpLockTimer = MovementProfile.wall.steeringLockFrames;
    this.wallJumpLockDir = wallDir;
    this.wallJumpHeldDirLock =
      (wallDir < 0 && heldLeft) ? -1 :
      (wallDir > 0 && heldRight) ? 1 : 0;

    this.events.push({
      type: 'wallJump',
      x: wallDir < 0 ? this.pos.x : this.pos.x + this.currentWidth,
      y: this.pos.y + this.currentHeight * 0.45,
      wallDir,
      awayDir,
    });

    this.setState(PlayerState.WALL_JUMP);
    return true;
  }

  _startSpinTwirl() {
    this.hasSpunThisAirtime = true;
    this.isSpinning = true;
    this.isSpinningCombat = true;
    this.spinTwirlTimer = MovementProfile.spinTwirl.hoverDuration;
    this.spinTwirlElapsed = 0;
    this.isJumping = false;
    this.isWallJumping = false;
    this.jumpCutApplied = false;
    this.inApexFloat = false;
    this.coyoteFramesRemaining = 0;

    const { upwardImpulse, hoverVyClampMin, hoverVyClampMax } = MovementProfile.spinTwirl;
    this.vel.y = clamp(Math.max(0, this.vel.y) + upwardImpulse, hoverVyClampMin, hoverVyClampMax);

    this.events.push({
      type: 'spinTwirl',
      x: this.centerX,
      y: this.centerY,
    });
    this.setState(PlayerState.SPIN_TWIRL);
  }

  _startGroundPound() {
    this.groundPoundPhase = 'windup';
    this.groundPoundWindupTimer = MovementProfile.groundPound.windupFrames;
    this.groundPoundRecoveryTimer = 0;
    this.groundPoundBufferedJump = false;
    this.vel.x = 0;
    this.vel.y = 0;
    this.isJumping = false;
    this.isWallJumping = false;
    this.jumpCutApplied = false;
    this.inApexFloat = false;
    this.coyoteFramesRemaining = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinJumpFrames = 0;
    this._canAdvanceJumpCombo = false;
    this.jumpComboCount = 1;
    this.isButtSliding = false;
    this.isSlideLethal = false;

    this.events.push({
      type: 'groundPoundWindup',
      x: this.centerX,
      y: this.centerY,
    });
    this.setState(PlayerState.GROUND_POUND_WINDUP);
  }

  /**
   * Fixed-timestep update — called at exactly 60 Hz.
   *
   * @param {import('../../engine/input/InputManager.js').default | null} input
   * @param {import('../../engine/physics/CollisionSystem.js').default} collision
   * @param {number} dt — Fixed timestep (1/60 s)
   * @param {Array} [platforms=[]] — Moving platforms updated prior to this tick
   */
  update(input, collision, dt, platforms = [], context = {}) {
    this.wasGrounded = this.grounded;
    const wasOnSlopePrior = this.isOnSlope;
    const priorPlatform = this.ridingPlatform;
    this.events.length = 0;

    // Keep hitbox synced with live-tunable MovementProfile
    this.width = MovementProfile.hitbox.width;
    this.height = MovementProfile.hitbox.height;

    // Store previous position for render interpolation BEFORE platform carry
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;

    // Stage 9: Defeat ballistic fall bypasses level collisions & input
    if (this.state === PlayerState.DEFEAT) {
      this.vel.y -= MovementProfile.jump.gravityFalling * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.defeatTimer > 0) {
        this.defeatTimer--;
        if (this.defeatTimer === 0) {
          this.defeatTriggerReset = true;
        }
      }
      this.stateFrames++;
      this._computeHash();
      return;
    }

    // Stage 10: Warp Pipe suction transition -> teleports cleanly into exit passage
    if (this.state === PlayerState.WARP_PIPE) {
      this.vel.x = 0;
      this.vel.y = -MovementProfile.warpPipe.sinkSpeed;
      this.pos.y += this.vel.y * dt;
      if (this.warpPipeTimer > 0) {
        this.warpPipeTimer--;
      }
      if (this.warpPipeTimer <= 0 && this.warpPipeData) {
        const wp = this.warpPipeData;
        this.warpPipeData = null;
        this.pos.x = wp.exitX;
        this.pos.y = wp.exitY;
        this.prevPos.x = wp.exitX;
        this.prevPos.y = wp.exitY;
        this.vel.x = wp.exitVx ?? 0;
        this.vel.y = 0;
        this.facingRight = (wp.exitDir ?? 1) >= 0;
        this.grounded = true;
        const crouched = Boolean(wp.exitCrouched);
        this.isCrouched = crouched;
        this.standingBlocked = crouched;
        this.setState(crouched ? PlayerState.CROUCH : PlayerState.IDLE);
        this.events.push({ type: 'warpPipeExit', x: wp.exitX, y: wp.exitY });
      }
      this.stateFrames++;
      this._computeHash();
      return;
    }

    // Warp Access Tube transition pipeline (IN_WARP_TRANSITION):
    // Disables user input -> 45-frame smooth slide -> fade to black -> relocate -> fade in.
    if (this.state === PlayerState.IN_WARP_TRANSITION && this.warpTransition) {
      const wt = this.warpTransition;
      const wCfg = MovementProfile.props.warpTube;
      this.vel.x = 0;
      this.vel.y = 0;

      if (wt.phase === 'SLIDING_IN') {
        wt.frame++;
        const t = Math.min(1, wt.frame / Math.max(1, wt.phaseFrames));
        this.pos.x = wt.startX + (wt.endX - wt.startX) * t;
        this.pos.y = wt.startY + (wt.endY - wt.startY) * t;
        wt.fadeAlpha = 0;
        if (wt.frame >= wt.phaseFrames) {
          if (wt.tube?.isGoalPipe) {
            const tube = wt.tube;
            this.warpTransition = null;
            this.warpCooldownTimer = wCfg.cooldownFrames;
            this.grounded = true;
            this.isVictory = true;
            this.setState(PlayerState.IDLE);
            this.events.push({
              type: 'goalPipeClear',
              tube,
              x: tube.centerX,
              y: tube.centerY,
            });
            this.stateFrames++;
            this._computeHash();
            return;
          }
          wt.phase = 'FADE_OUT';
          wt.frame = 0;
          wt.phaseFrames = wCfg.fadeOutFrames;
        }
      } else if (wt.phase === 'FADE_OUT') {
        wt.frame++;
        wt.fadeAlpha = Math.min(1, wt.frame / Math.max(1, wt.phaseFrames));
        if (wt.frame >= wt.phaseFrames) {
          const tube = wt.tube;
          this.pos.x = tube.destX;
          this.pos.y = tube.destY;
          this.prevPos.x = tube.destX;
          this.prevPos.y = tube.destY;
          this.vel.x = 0;
          this.vel.y = 0;
          this.isCrouched = false;
          this.facingRight = tube.exitFacingRight ?? true;
          wt.relocated = true;
          wt.phase = 'HOLD_BLACK';
          wt.frame = 0;
          wt.phaseFrames = wCfg.holdBlackFrames;
          this.events.push({
            type: 'warpRelocate',
            tube,
            x: tube.destX,
            y: tube.destY,
            destSubArea: Boolean(tube.destSubArea),
          });
        }
      } else if (wt.phase === 'HOLD_BLACK') {
        wt.fadeAlpha = 1.0;
        wt.frame++;
        if (wt.frame >= wt.phaseFrames) {
          wt.phase = 'FADE_IN';
          wt.frame = 0;
          wt.phaseFrames = wCfg.fadeInFrames;
        }
      } else if (wt.phase === 'FADE_IN') {
        wt.frame++;
        wt.fadeAlpha = Math.max(0, 1.0 - wt.frame / Math.max(1, wt.phaseFrames));
        if (wt.frame >= wt.phaseFrames) {
          const tube = wt.tube;
          this.warpTransition = null;
          this.warpCooldownTimer = wCfg.cooldownFrames;
          this.grounded = true;
          this.setState(PlayerState.IDLE);
          this.events.push({
            type: 'warpTransitionEnd',
            tube,
            x: this.pos.x,
            y: this.pos.y,
            destSubArea: Boolean(tube.destSubArea),
          });
        }
      }

      this.stateFrames++;
      this._computeHash();
      return;
    }

    if (this.warpCooldownTimer > 0) this.warpCooldownTimer--;

    // Active Compression Launch Spring ride: keep feet locked to compressing plate
    // and suppress normal ground jump so the spring owns the 4-frame Timed Power Bounce window.
    if (this.activeSpring && this.activeSpring.state === 'COMPRESSING') {
      this.vel.x = moveToward(this.vel.x, 0, MovementProfile.locomotion.groundFriction * dt);
      this.vel.y = 0;
      this.pos.y = this.activeSpring.currentTopY;
      this.grounded = true;
      this.isJumping = false;
      this.isCrouched = true;
      this.setState(PlayerState.CROUCH);
      this.stateFrames++;
      this._computeHash();
      return;
    }

    // Stage 8 presentation & Stage 9 timers
    if (this.turnAroundTimer > 0) this.turnAroundTimer--;
    if (this.grounded && this._jumpComboGraceTimer > 0) {
      this._jumpComboGraceTimer--;
      if (this._jumpComboGraceTimer === 0) {
        this.jumpComboCount = 1;
        this._canAdvanceJumpCombo = false;
      }
    }
    if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer--;
    if (this.damageRecoilTimer > 0) this.damageRecoilTimer--;
    if (this.growthTimer > 0) this.growthTimer--;
    if (this.fireCooldownTimer > 0) this.fireCooldownTimer--;
    if (this.fireThrowAnimTimer > 0) this.fireThrowAnimTimer--;
    if (this.shellThrowAnimTimer > 0) this.shellThrowAnimTimer--;

    if (this.fireWindupTimer > 0) {
      this.fireWindupTimer--;
      if (this.fireWindupTimer === 0) {
        const dir = this.facingRight ? 1 : -1;
        this.events.push({
          type: 'fireballRelease',
          x: this.centerX + dir * MovementProfile.fireball.spawnOffsetX,
          y: this.pos.y + MovementProfile.fireball.spawnOffsetY,
          dir,
        });
        this.fireCooldownTimer = MovementProfile.fireball.recoveryFrames;
      }
    }

    const solidBoxes = context?.solidBoxes || [];

    // Stage 5: Apply moving platform displacement delta before player velocity
    if (this.grounded && this.ridingPlatform) {
      collision.applyPlatformCarry(
        this.pos,
        this.currentWidth,
        this.currentHeight,
        this.ridingPlatform.deltaX,
        this.ridingPlatform.deltaY,
        solidBoxes
      );
    }

    // Advance active semisolid drop-through window
    if (this.dropThroughTimer > 0) {
      this.dropThroughTimer--;
      if (
        this.dropThroughTimer === 0 ||
        (this.dropThroughFloorY !== null && this.pos.y < this.dropThroughFloorY - 0.25)
      ) {
        this.dropThroughTimer = 0;
        this.dropThroughFloorY = null;
      }
    }

    // Clear spin flags only when mid-air SpinTwirl completes its 18th hover frame
    // (Grounded SpinJump stays spinning in SpinAir until touchdown!)
    if (this.isSpinning && !this.isSpinJumping && this.spinTwirlTimer <= 0) {
      this.isSpinning = false;
      this.isSpinningCombat = false;
    }

    const prevVx = this.vel.x;
    let stepVx = this.vel.x;
    let usedTrapezoidalX = false;

    const inRecoilLock = this.damageRecoilTimer > 0;
    const heldLeft = Boolean(input && !inRecoilLock && input.held(Actions.LEFT));
    const heldRight = Boolean(input && !inRecoilLock && input.held(Actions.RIGHT));
    const moveDir = (heldRight ? 1 : 0) - (heldLeft ? 1 : 0);
    const isRunning = input && !inRecoilLock ? input.held(Actions.RUN) : false;
    const runPressed = input && !inRecoilLock ? input.pressedThisFrame(Actions.RUN) : false;
    const downHeld = input && !inRecoilLock ? input.held(Actions.DOWN) : false;
    const downPressed = input && !inRecoilLock ? input.pressedThisFrame(Actions.DOWN) : false;
    const jumpPressed = input && !inRecoilLock ? input.pressedThisFrame(Actions.JUMP) : false;
    const jumpHeld = input && !inRecoilLock ? input.held(Actions.JUMP) : false;
    const spinPressed = input && !inRecoilLock ? input.pressedThisFrame(Actions.SPIN) : false;
    const spinHeld = input && !inRecoilLock ? input.held(Actions.SPIN) : false;

    // Stage 9: Fire Mario / Fire Luigi fireball 3-frame throw anticipation trigger
    const activeFireballs = context?.activeFireballsCount ?? 0;
    if (
      runPressed &&
      this.powerUpForm === PowerUpForm.FIRE &&
      !this.isCrouched &&
      !this.carriedEntity &&
      !this.isWallSliding &&
      this.groundPoundPhase === null &&
      this.fireWindupTimer === 0 &&
      this.fireCooldownTimer === 0 &&
      activeFireballs < MovementProfile.fireball.maxActive
    ) {
      this.fireWindupTimer = MovementProfile.fireball.windupFrames;
      this.fireThrowAnimTimer =
        MovementProfile.fireball.windupFrames + MovementProfile.fireball.recoveryFrames + 4;
      this.events.push({ type: 'fireballWindup', x: this.centerX, y: this.centerY });
    }

    // ── Ground Pound Recovery Lockout (grounded, 10 frames, buffered jump allowed) ──
    let inPoundRecovery = false;
    let executeRecoveryJump = false;
    if (this.grounded && this.groundPoundPhase === 'land') {
      if (jumpPressed) {
        this.groundPoundBufferedJump = true;
      }
      if (this.groundPoundRecoveryTimer > 0) {
        inPoundRecovery = true;
        this.groundPoundRecoveryTimer--;
        this.vel.x = 0;
        stepVx = 0;
        if (this.groundPoundRecoveryTimer === 0) {
          this.groundPoundPhase = null;
          inPoundRecovery = false;
          if (this.groundPoundBufferedJump) {
            this.groundPoundBufferedJump = false;
            executeRecoveryJump = true;
          }
        }
      } else {
        this.groundPoundPhase = null;
      }
    }

    // ── Stage 5: Semisolid / One-Way Platform Drop-Through (Down + Jump) ──
    let justDroppedThroughThisTick = false;
    if (
      this.grounded &&
      !inPoundRecovery &&
      !executeRecoveryJump &&
      downHeld &&
      jumpPressed &&
      this.standingOnSemisolid &&
      !this.standingOnSolid
    ) {
      this.dropThroughFloorY = this.pos.y;
      this.dropThroughTimer = MovementProfile.platforms.dropThroughFrames;
      this.pos.y -= MovementProfile.platforms.dropThroughNudgeY;
      this.vel.y = -2.0;
      this.grounded = false;
      this.coyoteFramesRemaining = 0;
      this.jumpBufferTimer = 0;
      this.isCrouched = false;
      this.standingBlocked = false;
      this.isButtSliding = false;
      this.isSlideLethal = false;
      this.ridingPlatform = null;
      this._coyotePlatform = null;
      justDroppedThroughThisTick = true;

      this.events.push({
        type: 'semisolidDrop',
        x: this.centerX,
        y: this.dropThroughFloorY,
      });
    }

    // ── Jump Buffer (6 frames prior to landing) ──
    let justSetBufferThisFrame = false;
    if (
      jumpPressed &&
      !this.grounded &&
      !justDroppedThroughThisTick &&
      !this.isWallSliding &&
      this.wallCoyoteFramesRemaining <= 0 &&
      this.coyoteFramesRemaining <= 0
    ) {
      this.jumpBufferTimer = MovementProfile.forgiveness.jumpBufferFrames;
      justSetBufferThisFrame = true;
    }

    // ── Crouch & Ceiling Clearance Arbitration ──
    const wasCrouched = this.isCrouched;
    if (!justDroppedThroughThisTick) {
      if (this.grounded && !inPoundRecovery && !executeRecoveryJump && downHeld) {
        this.isCrouched = true;
        this.standingBlocked = false;
      } else if (this.isCrouched) {
        const canStand = collision.hasStandingClearance(
          this.pos.x,
          this.pos.y,
          this.currentWidth,
          this.height
        );
        this.standingBlocked = !canStand;
        if (canStand) {
          this.isCrouched = false;
          this.isButtSliding = false;
        }
      } else {
        this.standingBlocked = false;
        this.isButtSliding = false;
      }
    }

    if (!wasCrouched && this.isCrouched) {
      this.events.push({ type: 'crouch', vx: this.vel.x });
    } else if (wasCrouched && !this.isCrouched) {
      this.events.push({ type: 'uncrouch' });
    }

    // ── Stage 4 Airborne Move Arbitration (Ground Pound, Wall Jump, Spin Twirl) ──
    let justLaunchedThisTick = false;
    let justWallJumpedThisTick = false;

    if (!this.grounded && !justDroppedThroughThisTick) {
      if (
        downPressed &&
        this.groundPoundPhase === null &&
        StateGroups.canGroundPound.has(this.state)
      ) {
        const clearance = collision.groundClearance(
          this.pos.x,
          this.pos.y,
          this.currentWidth,
          20,
          platforms
        );
        if (clearance >= MovementProfile.groundPound.minClearance) {
          this._startGroundPound();
        }
      }

      if (
        jumpPressed &&
        this.groundPoundPhase === null &&
        (this.isWallSliding || this.wallCoyoteFramesRemaining > 0)
      ) {
        const wallDir = this.isWallSliding ? this.wallSlideDir : this.wallCoyoteDir;
        if (wallDir !== 0) {
          justWallJumpedThisTick = this._executeWallJump(wallDir, heldLeft, heldRight);
          justLaunchedThisTick = true;
        }
      }

      if (
        !justWallJumpedThisTick &&
        spinPressed &&
        !this.hasSpunThisAirtime &&
        this.groundPoundPhase === null &&
        StateGroups.canSpin.has(this.state)
      ) {
        this._startSpinTwirl();
      }
    }

    // ── Horizontal Locomotion ──
    if (this.grounded) {
      if (executeRecoveryJump) {
        this.vel.x = 0;
        stepVx = 0;
        justLaunchedThisTick = this._executeJump(collision, false, true);
      } else if (inPoundRecovery) {
        this.isSkidding = false;
        this.pivotTimer = 0;
        this.isButtSliding = false;
        this.vel.x = 0;
        stepVx = 0;
      } else {
        const {
          walkTopSpeed,
          runTopSpeed,
          startImpulse,
          groundAccel,
          lowSpeedAccelBoost,
          highSpeedAccelTaper,
          groundFriction,
          stopThreshold,
          crouchCrawlSpeed,
        } = MovementProfile.locomotion;

        const {
          threshold: skidThreshold,
          decel: skidDecel,
          pivotAccelMultiplier,
          pivotFrames,
        } = MovementProfile.skid;

        const {
          buttSlideMinAngle,
          buttSlideFrictionCoeff,
          buttSlideMaxSpeed,
          flatRunoutDecel,
          uphillSpeedMult,
          downhillSpeedMult,
        } = MovementProfile.slopes;

        const onButtSlideSlope =
          this.isOnSlope && Math.abs(this.slopeAngleDeg) >= buttSlideMinAngle;

        if (this.isCrouched) {
          this.isSkidding = false;
          this.pivotTimer = 0;

          if (onButtSlideSlope) {
            this.isButtSliding = true;
          }

          if (this.isButtSliding) {
            if (onButtSlideSlope) {
              const launchingSlideJump =
                jumpPressed &&
                !executeRecoveryJump &&
                collision.hasStandingClearance(this.pos.x, this.pos.y, this.currentWidth, this.height);
              if (!launchingSlideJump) {
                // Slope Butt-Slide: a = g*sin(theta) - mu*g*cos(theta), ignore uphill input
                const downhillDir = -Math.sign(this.slopeDerivative);
                const thetaRad = (Math.abs(this.slopeAngleDeg) * Math.PI) / 180;
                const g = MovementProfile.jump.gravityRising;
                const accelSlope = Math.max(
                  0,
                  g * Math.sin(thetaRad) - buttSlideFrictionCoeff * g * Math.cos(thetaRad)
                );
                const accelX = accelSlope * Math.cos(thetaRad);

                this.vel.x = moveToward(this.vel.x, downhillDir * buttSlideMaxSpeed, accelX * dt);
              }
              const downhillDir = -Math.sign(this.slopeDerivative);
              this.facingRight = this.vel.x !== 0 ? this.vel.x > 0 : downhillDir > 0;
              stepVx = 0.5 * (prevVx + this.vel.x);
              usedTrapezoidalX = true;
            } else {
              // Flat Runout Deceleration (11.20 tiles/s²)
              this.vel.x = moveToward(this.vel.x, 0, flatRunoutDecel * dt);
              if (Math.abs(this.vel.x) < stopThreshold) {
                this.vel.x = 0;
                this.isButtSliding = false;
              }
              stepVx = 0.5 * (prevVx + this.vel.x);
              usedTrapezoidalX = true;
            }
          } else if (downHeld || moveDir === 0) {
            this.vel.x = moveToward(this.vel.x, 0, MovementProfile.crouch.flatSlideDecel * dt);
            if (Math.abs(this.vel.x) < stopThreshold) {
              this.vel.x = 0;
              if (moveDir !== 0) this.facingRight = moveDir > 0;
            }
            stepVx = 0.5 * (prevVx + this.vel.x);
            usedTrapezoidalX = true;
          } else {
            this.facingRight = moveDir > 0;
            this.vel.x = moveToward(this.vel.x, moveDir * crouchCrawlSpeed, groundAccel * dt);
            stepVx = this.vel.x;
          }
        } else if (moveDir !== 0) {
          this.isButtSliding = false;
          const carryMult = this.carriedEntity ? MovementProfile.combat.carryTopSpeedFactor : 1.0;
          let topSpeed = (isRunning ? runTopSpeed : walkTopSpeed) * carryMult;
          if (input?.isAnalogHorizontal?.()) {
            const analogVel = Math.abs(
              computeAnalogTargetVelocity(
                input.getHorizontalAxis(),
                topSpeed,
                MovementProfile.input.analogResponseGamma
              )
            );
            topSpeed = Math.max(stopThreshold + 0.05, analogVel);
          }

          // Stage 5: Uphill/downhill walk/run scaling on slopes (leaves flat ground untouched)
          if (this.isOnSlope && this.slopeDerivative !== 0) {
            const downhillDir = -Math.sign(this.slopeDerivative);
            const steepness = Math.min(1, Math.abs(this.slopeAngleDeg) / 45.0);
            if (moveDir === -downhillDir) {
              topSpeed *= 1 - (1 - uphillSpeedMult) * steepness;
            } else if (moveDir === downhillDir) {
              topSpeed *= 1 + (downhillSpeedMult - 1) * steepness;
            }
          }

          const velSign = Math.sign(this.vel.x);
          const isReversing = this.vel.x !== 0 && velSign !== moveDir;

          if (isReversing && (Math.abs(this.vel.x) > skidThreshold || this.isSkidding)) {
            this.isSkidding = true;
            this.pivotTimer = 0;
            this.skidSlideDir = velSign;
            this.facingRight = velSign > 0;

            const decelStep = skidDecel * dt;
            const nextVx = this.vel.x - velSign * decelStep;
            if (Math.sign(nextVx) !== velSign || Math.abs(nextVx) < stopThreshold) {
              this.vel.x = 0;
              this.isSkidding = false;
              this.facingRight = moveDir > 0;
            } else {
              this.vel.x = nextVx;
            }
            stepVx = 0.5 * (prevVx + this.vel.x);
            usedTrapezoidalX = true;
          } else if (isReversing) {
            const wasPivoting = this.pivotTimer > 0;
            this.isSkidding = false;
            this.pivotTimer = pivotFrames;
            this.pivotDir = moveDir;
            this.turnAroundTimer = pivotFrames + 4;
            if (!wasPivoting) {
              this.events.push({
                type: 'turnaround',
                x: this.centerX,
                y: this.pos.y,
                dir: velSign,
              });
            }
            const pivotAccel = groundAccel * pivotAccelMultiplier;
            this.vel.x = moveToward(this.vel.x, moveDir * topSpeed, pivotAccel * dt);
            if (this.vel.x === 0 || Math.sign(this.vel.x) === moveDir) {
              this.facingRight = moveDir > 0;
            }
            stepVx = this.vel.x;
          } else if (this.pivotTimer > 0 && moveDir === this.pivotDir) {
            this.isSkidding = false;
            this.facingRight = moveDir > 0;
            const pivotAccel = groundAccel * pivotAccelMultiplier;
            this.vel.x = moveToward(this.vel.x, moveDir * topSpeed, pivotAccel * dt);
            this.pivotTimer--;
            stepVx = this.vel.x;
          } else {
            this.isSkidding = false;
            this.pivotTimer = 0;
            this.facingRight = moveDir > 0;

            if (this.vel.x === 0) {
              this.vel.x = moveDir * Math.min(startImpulse, topSpeed);
            } else if (Math.abs(this.vel.x) > topSpeed) {
              this.vel.x = moveToward(this.vel.x, moveDir * topSpeed, groundFriction * dt);
              stepVx = 0.5 * (prevVx + this.vel.x);
              usedTrapezoidalX = true;
            } else {
              const speed = Math.abs(this.vel.x);
              let accel = groundAccel;
              if (speed < walkTopSpeed) {
                const t = speed / Math.max(0.01, walkTopSpeed);
                accel *= 1 + lowSpeedAccelBoost * (1 - t);
              } else {
                const span = Math.max(0.01, runTopSpeed - walkTopSpeed);
                const t = clamp((speed - walkTopSpeed) / span, 0, 1);
                accel *= 1 - highSpeedAccelTaper * t;
              }
              this.vel.x = moveToward(this.vel.x, moveDir * topSpeed, accel * dt);
            }
            if (!usedTrapezoidalX) stepVx = this.vel.x;
          }
        } else {
          this.isButtSliding = false;
          this.isSkidding = false;
          this.pivotTimer = 0;

          if (this.vel.x !== 0) {
            this.vel.x = moveToward(this.vel.x, 0, groundFriction * dt);
            if (Math.abs(this.vel.x) < stopThreshold) {
              this.vel.x = 0;
            }
            stepVx = 0.5 * (prevVx + this.vel.x);
            usedTrapezoidalX = true;
          } else {
            stepVx = 0;
          }
        }

        // ── Grounded Jump & Spin Jump Launch ──
        if (
          spinPressed &&
          !executeRecoveryJump &&
          !(downHeld && this.standingOnSemisolid && !this.standingOnSolid)
        ) {
          justLaunchedThisTick = this._executeSpinJump(collision);
        } else if (jumpPressed && !executeRecoveryJump) {
          justLaunchedThisTick = this._executeJump(collision, false, false);
        }
      }
    } else {
      // ── Coyote Time Jump Launch (while airborne within 5 frames of ledge drop) ──
      if (
        !justDroppedThroughThisTick &&
        !justWallJumpedThisTick &&
        jumpPressed &&
        this.groundPoundPhase === null &&
        this.coyoteFramesRemaining > 0
      ) {
        justLaunchedThisTick = this._executeJump(collision, true, false);
      }

      // ── Airborne Horizontal Control ──
      this.isSkidding = false;
      this.pivotTimer = 0;
      this.isButtSliding = false;
      this.isSlideLethal = false;

      if (inRecoilLock) {
        stepVx = this.vel.x;
      } else if (this.groundPoundPhase === 'windup' || this.groundPoundPhase === 'fall') {
        this.vel.x = 0;
        stepVx = 0;
      } else if (justWallJumpedThisTick) {
        stepVx = this.vel.x;
      } else {
        const carryMult = this.carriedEntity ? MovementProfile.combat.carryTopSpeedFactor : 1.0;
        const airCap = Math.max(MovementProfile.locomotion.walkTopSpeed, this.takeoffMaxSpeed) * carryMult;

        // Clear held-direction lock only once the player releases the direction held at wall-jump launch
        if (
          (this.wallJumpHeldDirLock < 0 && !heldLeft) ||
          (this.wallJumpHeldDirLock > 0 && !heldRight)
        ) {
          this.wallJumpHeldDirLock = 0;
        }

        const effectiveLeft = heldLeft && this.wallJumpHeldDirLock >= 0;
        const effectiveRight = heldRight && this.wallJumpHeldDirLock <= 0;
        let effectiveMoveDir = (effectiveRight ? 1 : 0) - (effectiveLeft ? 1 : 0);

        if (this.wallJumpLockTimer > 0) {
          if (effectiveMoveDir === this.wallJumpLockDir) {
            effectiveMoveDir = 0;
          }
          this.wallJumpLockTimer--;
          if (this.wallJumpLockTimer === 0) {
            this.wallJumpLockDir = 0;
          }
        }

        if (effectiveMoveDir !== 0) {
          if (!this.isWallSliding) {
            this.facingRight = effectiveMoveDir > 0;
          }
          let airTargetSpeed = airCap;
          if (input?.isAnalogHorizontal?.()) {
            const analogAir = Math.abs(
              computeAnalogTargetVelocity(
                input.getHorizontalAxis(),
                airCap,
                MovementProfile.input.analogResponseGamma
              )
            );
            airTargetSpeed = Math.max(MovementProfile.locomotion.stopThreshold + 0.05, analogAir);
          }
          const isPushingWithVel = this.vel.x !== 0 && Math.sign(this.vel.x) === effectiveMoveDir;
          const accelMult = isPushingWithVel
            ? MovementProfile.airControl.withVelocityMult
            : MovementProfile.airControl.reverseInAirMult;
          const accel = MovementProfile.locomotion.groundAccel * accelMult;
          this.vel.x = moveToward(this.vel.x, effectiveMoveDir * airTargetSpeed, accel * dt);
          this.vel.x = clamp(this.vel.x, -airCap, airCap);
        } else if (this.wallJumpLockTimer === 0) {
          this.vel.x = moveToward(this.vel.x, 0, MovementProfile.airControl.noDragDecel * dt);
        }
        stepVx = this.vel.x;
      }
    }

    // ── Vertical Gravity, Spin Hover, Ground Pound & Wall Slide Clamp ──
    let stepVy = this.vel.y;
    const preCollisionVy = this.vel.y;
    this.inApexFloat = false;
    let enteredPoundFallEndOfTick = false;

    if (!this.grounded) {
      if (this.groundPoundPhase === 'windup') {
        this.vel.y = 0;
        stepVy = 0;
        this.groundPoundWindupTimer--;
        if (this.groundPoundWindupTimer <= 0) {
          enteredPoundFallEndOfTick = true;
        }
      } else if (this.groundPoundPhase === 'fall') {
        this.vel.y = -MovementProfile.groundPound.diveSpeed;
        stepVy = this.vel.y;
      } else if (justWallJumpedThisTick) {
        stepVy = this.vel.y;
      } else if (this.isSpinning && !this.isSpinJumping && this.spinTwirlTimer > 0) {
        const prevVy = this.vel.y;
        const baseG = this.vel.y > 0
          ? MovementProfile.jump.gravityRising
          : MovementProfile.jump.gravityFalling;
        const hoverG = baseG * MovementProfile.spinTwirl.hoverGravityMult;
        this.vel.y = clamp(
          this.vel.y - hoverG * dt,
          MovementProfile.spinTwirl.hoverVyClampMin,
          MovementProfile.spinTwirl.hoverVyClampMax
        );
        this.spinTwirlTimer--;
        this.spinTwirlElapsed++;
        stepVy = 0.5 * (prevVy + this.vel.y);
      } else {
        const prevVy = this.vel.y;
        if (this.isJumping) {
          this.jumpFrames++;
        }
        if (this.isSpinJumping) {
          this.spinJumpFrames++;
        }

        let gravity = this.vel.y > 0
          ? MovementProfile.jump.gravityRising
          : MovementProfile.jump.gravityFalling;

        if (this.vel.y <= 0 && this.isSpinJumping) {
          gravity *= MovementProfile.spinJump.fallGravityMult;
        }

        if (this.isStompRebound && this.vel.y > 0) {
          gravity *= this.isPassiveRebound
            ? MovementProfile.combat.stompPassiveGravityMult
            : MovementProfile.combat.stompActiveGravityMult;
        }

        const charCfg = MovementProfile.characters[this.characterId] || MovementProfile.characters.mario;
        this.isFluttering = false;
        const holdRise = this.isSpinJumping ? (spinHeld || jumpHeld) : jumpHeld;

        const canJetFlutter = this.hydroJetFlutterWindow > 0 && this.hydroJetTimer <= 0;
        if (this.hydroJetTimer > 0) {
          this.hydroJetTimer--;
          // Buoyant hydro-stream suspension while riding inside the horizontal water jet
          gravity *= 0.16;
        } else if (
          this.isJumping &&
          !this.isSpringLaunch &&
          !this.isPassiveRebound &&
          this.vel.y > 0 &&
          !holdRise &&
          this.jumpFrames >= MovementProfile.jump.minRiseFrames
        ) {
          this.jumpCutApplied = true;
          gravity *= this.isSpinJumping
            ? MovementProfile.spinJump.earlyReleaseMult
            : MovementProfile.jump.earlyReleaseMult;
        } else if (
          this.isJumping &&
          holdRise &&
          !this.jumpCutApplied &&
          Math.abs(this.vel.y) < MovementProfile.apexFloat.vyThreshold &&
          this.apexFloatRemaining > 0
        ) {
          gravity *= MovementProfile.apexFloat.gravityMultiplier;
          this.apexFloatRemaining--;
          this.apexFloatFramesUsed++;
          this.inApexFloat = true;
        } else if (
          (charCfg.canFlutterJump || canJetFlutter) &&
          !this.isSpinJumping &&
          jumpHeld &&
          this.vel.y < (canJetFlutter ? 1.5 : -0.5) &&
          !this.isWallSliding &&
          this.flutterFramesRemaining > 0
        ) {
          this.isFluttering = true;
          this.flutterFramesRemaining--;
          gravity *= canJetFlutter
            ? MovementProfile.world1.horizontalJetExitFlutterGravityMult
            : charCfg.flutterGravityMult;
        }

        if (this.hydroJetFlutterWindow > 0 && this.hydroJetTimer <= 0) {
          this.hydroJetFlutterWindow--;
        }

        this.vel.y -= gravity * dt;

        if (this.isFluttering) {
          const flutterTargetVy = canJetFlutter
            ? MovementProfile.world1.horizontalJetExitFlutterTargetVy
            : charCfg.flutterTargetVy;
          if (this.vel.y < flutterTargetVy) {
            this.vel.y = moveToward(this.vel.y, flutterTargetVy, 34.0 * dt);
          }
        }

        if (this.vel.y < -MovementProfile.jump.terminalFallSpeed) {
          this.vel.y = -MovementProfile.jump.terminalFallSpeed;
        }
        if (this.vel.y <= 0) {
          this.jumpCutApplied = false;
          this.isStompRebound = false;
          this.isPassiveRebound = false;
          this.isSpringLaunch = false;
        }

        stepVy = 0.5 * (prevVy + this.vel.y);
      }
    }

    // ── Axis-Separated Swept AABB Collision ──
    const stepVel = { x: stepVx, y: stepVy };
    const result = collision.moveAndCollide(
      this.pos,
      stepVel,
      this.currentWidth,
      this.currentHeight,
      dt,
      {
        wasGrounded: this.wasGrounded && !justLaunchedThisTick && !justDroppedThroughThisTick,
        wasOnSlope: wasOnSlopePrior,
        dropThroughFloorY: this.dropThroughFloorY,
        platforms,
        ridingPlatform: priorPlatform,
        solidBoxes,
      }
    );

    if (result.wallLeft || result.wallRight) {
      this.vel.x = 0;
      this.isSkidding = false;
      this.pivotTimer = 0;
      this.isButtSliding = false;
    }

    if (result.grounded || result.steppedUp) {
      this.vel.y = 0;
      this.isSpringLaunch = false;
    } else if (result.ceilingHit) {
      this.vel.y = stepVel.y;
      this.isJumping = false;
      this.isWallJumping = false;
      this.jumpCutApplied = false;
      this.isSpringLaunch = false;
    }

    this.grounded = result.grounded;
    this.ceilingHit = result.ceilingHit;
    this.groundNormal.x = result.groundNormalX;
    this.groundNormal.y = result.groundNormalY;
    this.isOnSlope = result.onSlope;
    this.slopeAngleDeg = result.slopeAngleDeg;
    this.slopeDerivative = result.slopeDerivative;
    this.slopeAdhesionActive = result.slopeAdhesion;
    this.standingOnSemisolid = result.standingOnSemisolid;
    this.standingOnSolid = result.standingOnSolid;
    this.ridingPlatform = result.ridingPlatform;
    this.hitHazard = Boolean(result.hazardHit);

    if (this.grounded) {
      this.hydroJetTimer = 0;
      this.hydroJetFlutterWindow = 0;
    }

    if (this.hitHazard && this.state !== PlayerState.DEFEAT) {
      this.events.push({
        type: 'hazardSpike',
        x: this.centerX,
        y: this.pos.y,
      });
    }

    // Engage Butt-Slide immediately if landing crouched on an eligible slope
    if (
      this.grounded &&
      !this.wasGrounded &&
      this.isCrouched &&
      this.isOnSlope &&
      Math.abs(this.slopeAngleDeg) >= MovementProfile.slopes.buttSlideMinAngle
    ) {
      this.isButtSliding = true;
    }

    // Wall contact flags
    const touchingLeftWall = result.wallLeftSolid ||
      (!this.grounded && moveDir < 0 && collision.hasWallContact(this.pos.x, this.pos.y, this.currentWidth, this.currentHeight, -1));
    const touchingRightWall = result.wallRightSolid ||
      (!this.grounded && moveDir > 0 && collision.hasWallContact(this.pos.x, this.pos.y, this.currentWidth, this.currentHeight, 1));

    this.wallContactDirection = 0;
    if (result.wallLeft || touchingLeftWall) this.wallContactDirection = -1;
    if (result.wallRight || touchingRightWall) this.wallContactDirection = 1;

    // ── Stage 3 Forgiveness & BlockHit Events ──
    if (result.cornerCorrected) {
      if (this.jumpMetrics.active) this.jumpMetrics.cornerNudged = true;
      this.events.push({
        type: 'cornerNudge',
        dir: result.cornerNudgeDir,
        amount: result.cornerNudgeAmount,
        x: result.cornerNudgeX,
        y: result.cornerNudgeY,
      });
    }

    if (result.steppedUp) {
      if (this.jumpMetrics.active) this.jumpMetrics.stepUpUsed = true;
      this.events.push({
        type: 'stepUp',
        amount: result.stepUpAmount,
        x: this.centerX,
        y: this.pos.y,
      });
    }

    if (result.ceilingHit) {
      this.events.push({
        type: 'blockHit',
        x: result.ceilingHitTile ? result.ceilingHitTile.col + 0.5 : this.centerX,
        y: result.ceilingHitTile ? result.ceilingHitTile.row : this.pos.y + this.currentHeight,
        col: result.ceilingHitTile?.col ?? null,
        row: result.ceilingHitTile?.row ?? null,
        tileType: result.ceilingHitTile?.type ?? null,
        impactVy: preCollisionVy,
        absVx: Math.abs(this.vel.x),
      });
    }

    // ── Landing Detection, Ground Pound Impact & Jump Buffer Execution ──
    let bufferedJumpExecuted = false;
    if (this.grounded && !this.wasGrounded && !justLaunchedThisTick) {
      const impactSpeed = Math.abs(preCollisionVy);
      if (this.jumpMetrics.active) {
        this.jumpMetrics.frames++;
        this.jumpMetrics.airtime = this.jumpMetrics.frames * dt;
        this.jumpMetrics.apexFloatFrames = this.apexFloatFramesUsed;
        this.jumpMetrics.samples.push({
          t: this.jumpMetrics.airtime,
          dy: Math.max(0, this.pos.y - this.jumpMetrics.startY),
          vy: 0,
        });
        this.jumpMetrics.active = false;
      }

      if (this.groundPoundPhase === 'fall') {
        this.groundPoundPhase = 'land';
        this.groundPoundRecoveryTimer = MovementProfile.groundPound.recoveryFrames;
        this.groundPoundBufferedJump = this.jumpBufferTimer > 0 || jumpPressed;
        this.vel.x = 0;

        // Collect interactive blocks directly underfoot for Ground Pound break/activate
        const poundRow = Math.floor(this.pos.y - 0.05);
        const pLeft = Math.floor(this.pos.x + 1e-4);
        const pRight = Math.floor(this.pos.x + this.currentWidth - 1e-4);
        const poundTiles = [];
        for (let c = pLeft; c <= pRight; c++) {
          const t = collision.tilemap.get(c, poundRow);
          if (
            t === MovementProfile.tileTypes.BRICK_BLOCK ||
            t === MovementProfile.tileTypes.QUESTION_BLOCK
          ) {
            poundTiles.push({ col: c, row: poundRow, tileType: t });
          }
        }

        this.events.push({
          type: 'groundPoundImpact',
          x: this.centerX,
          y: this.pos.y,
          trauma: MovementProfile.groundPound.screenTrauma,
          poundTiles,
        });
      } else {
        // Arm Triple Jump grace BEFORE executing any buffered landing jump so buffered taps chain 1 -> 2 -> 3!
        if (this._canAdvanceJumpCombo && !this.isSpinJumping) {
          this._jumpComboGraceTimer = MovementProfile.jump.comboGraceFrames;
        } else {
          this._jumpComboGraceTimer = 0;
          this.jumpComboCount = 1;
          this._canAdvanceJumpCombo = false;
        }

        this.events.push({
          type: 'land',
          x: this.centerX,
          y: this.pos.y,
          impactSpeed,
        });

        if (this.jumpBufferTimer > 0) {
          bufferedJumpExecuted = this._executeJump(collision, false, true);
          if (bufferedJumpExecuted) {
            justLaunchedThisTick = true;
          }
        }
      }
    }

    // ── State Machine Updates, Telemetry & Audio/VFX Events ──
    if (this.grounded) {
      this.hasSpunThisAirtime = false;
      this.isSpinning = false;
      this.isSpinJumping = false;
      this.spinJumpFrames = 0;
      this.isSpinningCombat = false;
      this.spinTwirlTimer = 0;
      this.isFluttering = false;
      this.flutterFramesRemaining = MovementProfile.characters[this.characterId]?.flutterMaxFrames ?? 0;
      this.isWallSliding = false;
      this.wallSlideDir = 0;
      this.wallCoyoteFramesRemaining = 0;
      this.wallCoyoteDir = 0;
      this.isWallJumping = false;
      this.wallJumpLockTimer = 0;
      this.wallJumpLockDir = 0;
      this.wallJumpHeldDirLock = 0;
      this._wallSlideVfxTimer = 0;
      this._coyotePlatform = null;
      this.coyoteFramesRemaining = MovementProfile.forgiveness.coyoteFrames;
      this.coyoteElapsed = 0;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.isJumping = false;
      this.jumpCutApplied = false;
      this.inApexFloat = false;
      this.isStompRebound = false;
      this.isPassiveRebound = false;
      this.takeoffMaxSpeed = MovementProfile.locomotion.runTopSpeed;

      const absVx = Math.abs(this.vel.x);
      if (this.damageRecoilTimer > 0) {
        this.setState(PlayerState.DAMAGE);
      } else if (this.groundPoundPhase === 'land') {
        this.isButtSliding = false;
        this.setState(PlayerState.GROUND_POUND_LAND);
      } else if (this.isButtSliding && this.isCrouched) {
        this.setState(PlayerState.BUTT_SLIDE);
      } else if (this.isCrouched) {
        this.setState(absVx > MovementProfile.locomotion.stopThreshold
          ? PlayerState.CROUCH_SLIDE
          : PlayerState.CROUCH);
      } else if (this.isSkidding) {
        this.setState(PlayerState.SKID);
      } else if (this.pivotTimer > 0) {
        this.setState(PlayerState.PIVOT);
      } else if (absVx <= 0.01) {
        this.setState(PlayerState.IDLE);
      } else if (absVx >= MovementProfile.locomotion.runTopSpeed - 0.35) {
        this.setState(PlayerState.SPRINT);
      } else if (absVx > MovementProfile.locomotion.walkTopSpeed + 0.05) {
        this.setState(PlayerState.RUN);
      } else {
        this.setState(PlayerState.WALK);
      }

      this.isSlideLethal =
        (this.state === PlayerState.BUTT_SLIDE || this.state === PlayerState.CROUCH_SLIDE) &&
        absVx >= MovementProfile.slopes.enemyDefeatMinSpeed;

      if (this.groundPoundPhase !== 'land') {
        this._emitGroundFeedback(dt, absVx);
      }
    } else {
      this.isSlideLethal = false;
      this._slideVfxTimer = 0;

      if (this.wasGrounded && !justLaunchedThisTick && !justDroppedThroughThisTick) {
        this.isFluttering = false;
        this.flutterFramesRemaining = MovementProfile.characters[this.characterId]?.flutterMaxFrames ?? 0;
        this.coyoteFramesRemaining = MovementProfile.forgiveness.coyoteFrames;
        this.coyoteElapsed = 0;
        this.coyoteTimer = 0;
        this._coyotePlatform = priorPlatform;
        this.isJumping = false;
        this.isWallJumping = false;
        this._canAdvanceJumpCombo = false;
        this._jumpComboGraceTimer = 0;
        this.jumpComboCount = 1;
        this.apexFloatRemaining = MovementProfile.apexFloat.maxFrames;
        this.apexFloatFramesUsed = 0;
        this.takeoffMaxSpeed = Math.max(MovementProfile.locomotion.walkTopSpeed, Math.abs(this.vel.x));
        this.jumpMetrics = {
          ...this._createEmptyJumpMetrics(),
          active: true,
          isJump: false,
          startX: this.centerX,
          startY: this.pos.y,
          takeoffVx: this.vel.x,
          launchVy: this.vel.y,
          samples: [{ t: 0, dy: 0, vy: this.vel.y }],
        };
      } else if (!justLaunchedThisTick) {
        if (this.coyoteFramesRemaining > 0) {
          this.coyoteFramesRemaining--;
          if (this.coyoteFramesRemaining === 0) this._coyotePlatform = null;
        }
        this.coyoteElapsed++;
        this.coyoteTimer = this.coyoteElapsed;
      }

      if (!justSetBufferThisFrame && this.jumpBufferTimer > 0) {
        this.jumpBufferTimer--;
      }

      // Wall Slide check (locked pre-held direction cannot re-latch until released)
      const effWallLeft = heldLeft && this.wallJumpHeldDirLock >= 0;
      const effWallRight = heldRight && this.wallJumpHeldDirLock <= 0;
      const effWallMoveDir = (effWallRight ? 1 : 0) - (effWallLeft ? 1 : 0);
      const pressingLeftWall = effWallMoveDir < 0 && touchingLeftWall;
      const pressingRightWall = effWallMoveDir > 0 && touchingRightWall;
      const lockedTowardWall = this.wallJumpLockTimer > 0 && effWallMoveDir === this.wallJumpLockDir;
      const canEnterOrHoldWallSlide =
        this.groundPoundPhase === null &&
        this.vel.y < 0 &&
        !lockedTowardWall &&
        (pressingLeftWall || pressingRightWall) &&
        (this.isWallSliding || StateGroups.canWallSlide.has(this.state));

      if (canEnterOrHoldWallSlide) {
        const wallDir = pressingLeftWall ? -1 : 1;
        this.isWallSliding = true;
        this.wallSlideDir = wallDir;
        this.facingRight = wallDir > 0;
        this.isJumping = false;
        this.isWallJumping = false;
        this.jumpCutApplied = false;
        this.inApexFloat = false;
        this.coyoteFramesRemaining = 0;
        this.isSpinning = false;
        this.isSpinJumping = false;
        this.isSpinningCombat = false;
        this.spinTwirlTimer = 0;
        this.spinJumpFrames = 0;

        if (this.vel.y < -MovementProfile.wall.slideSpeed) {
          this.vel.y = -MovementProfile.wall.slideSpeed;
        }
        this.wallCoyoteFramesRemaining = MovementProfile.wall.coyoteFrames;
        this.wallCoyoteDir = wallDir;

        const wallEmitInterval = Math.max(1, MovementProfile.juice.particles.wallSlideEmitIntervalFrames);
        if (this._wallSlideVfxTimer % wallEmitInterval === 0) {
          this.events.push({
            type: 'wallSlide',
            x: wallDir < 0 ? this.pos.x : this.pos.x + this.currentWidth,
            y: this.pos.y + this.currentHeight * 0.35,
            wallDir,
          });
        }
        this._wallSlideVfxTimer++;
      } else {
        this.isWallSliding = false;
        this.wallSlideDir = 0;
        this._wallSlideVfxTimer = 0;
        if (!justWallJumpedThisTick && this.wallCoyoteFramesRemaining > 0) {
          this.wallCoyoteFramesRemaining--;
          if (this.wallCoyoteFramesRemaining === 0) {
            this.wallCoyoteDir = 0;
          }
        }
      }

      // Record airborne arc telemetry sample
      if (this.jumpMetrics.active && !bufferedJumpExecuted) {
        this.jumpMetrics.frames++;
        const dy = this.pos.y - this.jumpMetrics.startY;
        if (dy > this.jumpMetrics.peakHeight) {
          this.jumpMetrics.peakHeight = dy;
          this.jumpMetrics.apexFrame = this.jumpMetrics.frames;
          this.jumpMetrics.timeToApex = this.jumpMetrics.frames * dt;
        }
        this.jumpMetrics.airtime = this.jumpMetrics.frames * dt;
        this.jumpMetrics.apexFloatFrames = this.apexFloatFramesUsed;
        if (this.jumpMetrics.samples.length < 150) {
          this.jumpMetrics.samples.push({
            t: this.jumpMetrics.airtime,
            dy,
            vy: this.vel.y,
          });
        }
      }

      if (this.inApexFloat) {
        if (this.apexFloatFramesUsed % MovementProfile.vfx.apexSparkleIntervalFrames === 1) {
          this.events.push({
            type: 'apexSparkle',
            x: this.centerX,
            y: this.pos.y + this.currentHeight * 0.55,
          });
        }
      }

      this._skidVfxTimer = 0;
      this._sprintVfxTimer = 0;

      if (this.damageRecoilTimer > 0) {
        this.setState(PlayerState.DAMAGE);
      } else if (this.groundPoundPhase === 'windup') {
        this.setState(PlayerState.GROUND_POUND_WINDUP);
        if (enteredPoundFallEndOfTick) {
          this.groundPoundPhase = 'fall';
        }
      } else if (this.groundPoundPhase === 'fall') {
        this.setState(PlayerState.GROUND_POUND_FALL);
      } else if (this.isWallSliding) {
        this.setState(PlayerState.WALL_SLIDE);
      } else if (this.isSpinJumping) {
        this.setState(PlayerState.SPIN_JUMP);
      } else if (this.isSpinning) {
        this.setState(PlayerState.SPIN_TWIRL);
      } else if (this.isWallJumping && this.vel.y > 0) {
        this.setState(PlayerState.WALL_JUMP);
      } else if (this.inApexFloat) {
        this.setState(PlayerState.APEX_FLOAT);
      } else if (this.vel.y > 0) {
        this.setState(PlayerState.JUMP);
      } else if (this.isFluttering) {
        this.setState(PlayerState.FLUTTER_JUMP);
      } else {
        this.isWallJumping = false;
        this.setState(PlayerState.FALL);
      }
    }

    this.stateFrames++;
    this._computeHash();
  }

  _emitGroundFeedback(dt, absVx) {
    const dx = Math.abs(this.pos.x - this.prevPos.x);
    this.strideDistance += dx;

    if (
      !this.isCrouched &&
      !this.isSkidding &&
      absVx > MovementProfile.locomotion.stopThreshold
    ) {
      const isSprint = absVx > MovementProfile.locomotion.walkTopSpeed + 0.5;
      const strideLen = isSprint
        ? MovementProfile.vfx.footstepStrideRun
        : MovementProfile.vfx.footstepStrideWalk;

      if (this.strideDistance >= this._nextFootstepDist) {
        this._nextFootstepDist = this.strideDistance + strideLen;
        this.events.push({
          type: 'footstep',
          speedRatio: clamp(absVx / MovementProfile.locomotion.runTopSpeed, 0, 1),
          isSprint,
        });
      }
    } else {
      this._nextFootstepDist = this.strideDistance + 0.35;
    }

    // Skid smoke & screech
    if (this.state === PlayerState.SKID) {
      if (this._skidVfxTimer % MovementProfile.vfx.skidSmokeIntervalFrames === 0) {
        this.events.push({
          type: 'skid',
          x: this.centerX,
          y: this.pos.y,
          dir: this.skidSlideDir || (this.vel.x >= 0 ? 1 : -1),
        });
      }
      this._skidVfxTimer++;
    } else {
      this._skidVfxTimer = 0;
    }

    // Stage 5: Butt-Slide dirt spray & speed-modulated friction grind
    if (this.state === PlayerState.BUTT_SLIDE && absVx > 0.5) {
      if (this._slideVfxTimer % 2 === 0) {
        const dir = Math.sign(this.vel.x) || (this.facingRight ? 1 : -1);
        this.events.push({
          type: 'buttSlide',
          x: this.centerX - dir * (this.currentWidth * 0.42),
          y: this.pos.y,
          dir,
          speed: absVx,
          isLethal: this.isSlideLethal,
        });
      }
      this._slideVfxTimer++;
    } else {
      this._slideVfxTimer = 0;
    }

    // Sprint 3-puff dust kick (> 7.0 tiles/s)
    if (!this.isCrouched && !this.isSkidding && absVx > MovementProfile.vfx.sprintDustMinSpeed) {
      if (this._sprintVfxTimer % MovementProfile.vfx.sprintDustIntervalFrames === 0) {
        this.events.push({
          type: 'sprintDust',
          x: this.centerX - Math.sign(this.vel.x) * (this.currentWidth * 0.45),
          y: this.pos.y,
          dir: Math.sign(this.vel.x),
        });
      }
      this._sprintVfxTimer++;
    } else {
      this._sprintVfxTimer = 0;
    }
  }

  /**
   * Reset player to spawn position.
   */
  spawn(x, y, options = {}) {
    this.width = MovementProfile.hitbox.width;
    this.height = MovementProfile.hitbox.height;
    this.pos.x = x;
    this.pos.y = y;
    this.prevPos.x = x;
    this.prevPos.y = y;
    this.vel.x = 0;
    this.vel.y = 0;
    this.grounded = false;
    this.wasGrounded = false;
    this.ceilingHit = false;
    this.wallContactDirection = 0;
    this.groundNormal.x = 0;
    this.groundNormal.y = 1;
    this.state = PlayerState.FALL;
    this.prevState = PlayerState.FALL;
    this.stateFrames = 0;
    this.facingRight = true;
    this.isCrouched = false;
    this.standingBlocked = false;
    this.pivotTimer = 0;
    this.pivotDir = 0;
    this.isSkidding = false;
    this.skidSlideDir = 0;
    this.strideDistance = 0;
    this._nextFootstepDist = 0.35;
    this._skidVfxTimer = 0;
    this._sprintVfxTimer = 0;
    this.events.length = 0;
    this.coyoteFramesRemaining = 0;
    this.coyoteElapsed = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.isJumping = false;
    this.jumpFrames = 0;
    this.jumpCutApplied = false;
    this.apexFloatRemaining = 0;
    this.apexFloatFramesUsed = 0;
    this.inApexFloat = false;
    this.takeoffMaxSpeed = MovementProfile.locomotion.runTopSpeed;
    this.takeoffLaunchVy = MovementProfile.jump.launchVelocity;
    this.jumpMetrics = this._createEmptyJumpMetrics();
    this.hasSpunThisAirtime = false;
    this.isSpinning = false;
    this.isSpinJumping = false;
    this.isSpinningCombat = false;
    this.spinTwirlTimer = 0;
    this.spinTwirlElapsed = 0;
    this.spinJumpFrames = 0;
    this.isWallSliding = false;
    this.wallSlideDir = 0;
    this.wallCoyoteFramesRemaining = 0;
    this.wallCoyoteDir = 0;
    this.isWallJumping = false;
    this.wallJumpLockTimer = 0;
    this.wallJumpLockDir = 0;
    this.wallJumpHeldDirLock = 0;
    this._wallSlideVfxTimer = 0;
    this.groundPoundPhase = null;
    this.groundPoundWindupTimer = 0;
    this.groundPoundRecoveryTimer = 0;
    this.groundPoundBufferedJump = false;
    this.isOnSlope = false;
    this.slopeAngleDeg = 0;
    this.slopeDerivative = 0;
    this.slopeAdhesionActive = false;
    this.isButtSliding = false;
    this.isSlideLethal = false;
    this.standingOnSemisolid = false;
    this.standingOnSolid = false;
    this.dropThroughTimer = 0;
    this.dropThroughFloorY = null;
    this.ridingPlatform = null;
    this._coyotePlatform = null;
    this._slideVfxTimer = 0;
    this.isFluttering = false;
    this.flutterFramesRemaining = MovementProfile.characters[this.characterId]?.flutterMaxFrames ?? 0;
    this.jumpComboCount = 1;
    this._jumpComboGraceTimer = 0;
    this._canAdvanceJumpCombo = false;
    this.turnAroundTimer = 0;
    this.isVictory = false;
    this.powerUpForm = options.initialPowerUp || PowerUpForm.SMALL;
    this.invulnerabilityTimer = 0;
    this.damageRecoilTimer = 0;
    this.defeatTimer = 0;
    this.defeatTriggerReset = false;
    this.growthTimer = 0;
    this.growthTotalFrames = MovementProfile.powerups.growthOscillationFrames;
    this.carriedEntity = null;
    this.fireWindupTimer = 0;
    this.fireCooldownTimer = 0;
    this.fireThrowAnimTimer = 0;
    this.shellThrowAnimTimer = 0;
    this.isStompRebound = false;
    this.isPassiveRebound = false;
    this.warpPipeTimer = 0;
    this.warpPipeData = null;
    this.isSpringLaunch = false;
    this.activeSpring = null;
    this.warpTransition = null;
    this.warpCooldownTimer = 0;
    this.hydroJetTimer = 0;
    this.hydroJetFlutterWindow = 0;
    this.hitHazard = false;
    this._computeHash();
  }

  /**
   * Get interpolated render position.
   * renderPos = lerp(prevSimPos, currentSimPos, alpha)
   */
  getRenderPos(alpha) {
    return {
      x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
      y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha,
    };
  }

  /**
   * Compute a deterministic 32-bit FNV-1a hash of the quantized player state.
   */
  _computeHash() {
    const quantize = (v) => Math.round(v * 10000);
    let h = 0x811c9dc5;
    const mix = (val) => {
      h ^= val;
      h = Math.imul(h, 0x01000193);
    };
    mix(quantize(this.pos.x));
    mix(quantize(this.pos.y));
    mix(quantize(this.vel.x));
    mix(quantize(this.vel.y));
    mix(this.grounded ? 1 : 0);
    mix(this.facingRight ? 1 : 0);
    mix(this.isCrouched ? 1 : 0);
    mix(this.wallContactDirection);
    mix(this.isSpinning ? 1 : 0);
    mix(this.isSpinJumping ? 1 : 0);
    mix(this.jumpComboCount || 1);
    mix(this.isWallSliding ? 1 : 0);
    mix(this.wallJumpLockTimer);
    if (this.wallJumpHeldDirLock !== 0) {
      mix(this.wallJumpHeldDirLock);
    }
    mix(this.groundPoundWindupTimer);
    mix(this.groundPoundRecoveryTimer);
    mix(this.isOnSlope ? 1 : 0);
    mix(this.isButtSliding ? 1 : 0);
    mix(this.dropThroughTimer);
    if (this.characterId === 'luigi') {
      mix(this.isFluttering ? 1 : 0);
    }
    if (
      this.invulnerabilityTimer > 0 ||
      this.damageRecoilTimer > 0 ||
      this.carriedEntity !== null ||
      this.fireWindupTimer > 0 ||
      this.state === PlayerState.DEFEAT ||
      this.state === PlayerState.WARP_PIPE ||
      this.state === PlayerState.IN_WARP_TRANSITION
    ) {
      mix(this.invulnerabilityTimer);
      mix(this.damageRecoilTimer);
      mix(this.carriedEntity ? 1 : 0);
      mix(this.fireWindupTimer);
      mix(this.state === PlayerState.DEFEAT ? 1 : 0);
      mix(this.state === PlayerState.WARP_PIPE ? this.warpPipeTimer : 0);
      if (this.state === PlayerState.IN_WARP_TRANSITION && this.warpTransition) {
        mix(this.warpTransition.frame);
      }
    }
    this._tickHash = h >>> 0;
  }

  get stateHash() { return this._tickHash; }
}

export default PlayerController;
