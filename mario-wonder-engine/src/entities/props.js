/**
 * Environmental Props — Moving Platforms, Compression Springs & Warp Access Tubes
 * ==============================================================================
 * Deterministic fixed-60 Hz interactive environmental actors grounded in swept
 * AABB kinematic physics. Zero rigidbodies, zero magic numbers (all constants
 * sourced from MovementProfile.props).
 */

import MovementProfile from '../game/config/MovementProfile.js';
import { Actions } from '../engine/input/InputManager.js';
import { PlayerState } from '../game/player/PlayerState.js';

export const PlatformMode = {
  LINEAR: 'linear',
  SINE: 'sine',
  CIRCULAR_ORBIT: 'circular',
  FALL_AWAY: 'fall_away',
};

export const FallAwayState = {
  IDLE: 'IDLE',
  SHAKING: 'SHAKING',
  FALLING: 'FALLING',
  RESPAWNING: 'RESPAWNING',
};

export const SpringState = {
  IDLE: 'IDLE',
  COMPRESSING: 'COMPRESSING',
  REBOUND: 'REBOUND',
};

export const WarpEntryVector = {
  DOWN: 'DOWN',
  UP: 'UP',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
};

export const WarpTransitionPhase = {
  SLIDING_IN: 'SLIDING_IN',
  FADE_OUT: 'FADE_OUT',
  HOLD_BLACK: 'HOLD_BLACK',
  FADE_IN: 'FADE_IN',
  SLIDING_OUT: 'SLIDING_OUT',
};

/**
 * Analytical jump apex height for a spring launch (no early-release cutoff):
 *   H = v0^2 / (2 * g_rise)
 */
export function computeSpringTargetApex(vy, gRise = MovementProfile.jump.gravityRising) {
  return (vy * vy) / (2 * gRise);
}

/**
 * MovingPlatformProp — Swept Solid Carry Platform
 * Modes:
 *   - 'linear'    : Oscillates between waypoints at exact constant speed or periodSec
 *   - 'sine'      : Smooth sinusoidal oscillation between start and end
 *   - 'circular'  : Circular/elliptical orbit around (centerX, centerY)
 *   - 'fall_away' : Drops 1.0s (60 frames) after player weight is detected, then respawns
 */
export class MovingPlatformProp {
  constructor(config = {}) {
    this.id = config.id || 'platform_prop';
    this.mode = config.mode || PlatformMode.LINEAR;
    this.width = config.width ?? 3.0;
    this.height = config.height ?? 0.5;
    this.oneWay = config.oneWay ?? false;
    this.label = config.label || '';
    this.theme = config.theme || 'prop';

    // Linear / Sine waypoints
    if (Array.isArray(config.waypoints) && config.waypoints.length >= 2) {
      this.waypoints = config.waypoints.map((pt) => ({ x: pt.x, y: pt.y }));
      this.startX = this.waypoints[0].x;
      this.startY = this.waypoints[0].y;
      this.endX = this.waypoints[this.waypoints.length - 1].x;
      this.endY = this.waypoints[this.waypoints.length - 1].y;
    } else {
      this.startX = config.startX ?? 0;
      this.startY = config.startY ?? 0;
      this.endX = config.endX ?? this.startX;
      this.endY = config.endY ?? this.startY;
      this.waypoints = [
        { x: this.startX, y: this.startY },
        { x: this.endX, y: this.endY },
      ];
    }

    this.speed = config.speed ?? null; // Exact constant tiles/s if specified for linear mode
    this.periodSec = Math.max(0.1, config.periodSec ?? 4.0);
    this.initialPhase = config.phase ?? 0;
    this.loopWaypoints = Boolean(config.loopWaypoints);

    // Circular Orbit parameters
    this.centerX = config.centerX ?? (this.startX + this.width * 0.5);
    this.centerY = config.centerY ?? (this.startY + this.height * 0.5);
    this.radiusX = config.radiusX ?? config.radius ?? 2.5;
    this.radiusY = config.radiusY ?? config.radius ?? 2.5;
    this.startAngle = config.startAngle ?? 0;
    this.clockwise = Boolean(config.clockwise);
    this.angularSpeed = config.angularSpeed ?? ((Math.PI * 2) / this.periodSec);

    // Fall-Away parameters (sourced from MovementProfile.props.platform)
    const pCfg = MovementProfile.props.platform;
    this.fallAwayDelayFrames = config.fallAwayDelayFrames ?? pCfg.fallAwayDelayFrames;
    this.fallAwayRespawnFrames = config.fallAwayRespawnFrames ?? pCfg.fallAwayRespawnFrames;
    this.oscillateAmpX = config.oscillateAmpX ?? 0;
    this.oscillateAmpY = config.oscillateAmpY ?? 0;
    this.oscillatePeriodSec = Math.max(0.2, config.oscillatePeriodSec ?? MovementProfile.world1.fallAwayOscPeriodSec);

    // Runtime kinematic state
    this.pos = { x: this.startX, y: this.startY };
    this.prevPos = { x: this.startX, y: this.startY };
    this.vel = { x: 0, y: 0 };
    this.deltaX = 0;
    this.deltaY = 0;
    this.solidActive = true;

    // Mode-specific runtime fields
    this.elapsed = 0;
    this.angle = this.startAngle;
    this._linearDist = 0;
    this._linearDir = 1;
    this._linearTotalLen = this._computePathLength();

    // Fall-Away state
    this.fallState = FallAwayState.IDLE;
    this.weightDetected = false;
    this.weightFrames = 0;
    this.fallVy = 0;
    this.respawnTimer = 0;
    this.shakeOffsetPx = 0;
    this._justDetached = false;

    this.reset();
  }

  _computePathLength() {
    let total = 0;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const dx = this.waypoints[i + 1].x - this.waypoints[i].x;
      const dy = this.waypoints[i + 1].y - this.waypoints[i].y;
      total += Math.hypot(dx, dy);
    }
    return total;
  }

  _samplePathAtDistance(dist) {
    if (this._linearTotalLen <= 1e-6) {
      return { x: this.startX, y: this.startY };
    }
    let remaining = Math.max(0, Math.min(this._linearTotalLen, dist));
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this.waypoints[i];
      const b = this.waypoints[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen <= 1e-6) continue;
      if (remaining <= segLen || i === this.waypoints.length - 2) {
        const t = Math.max(0, Math.min(1, remaining / segLen));
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
      }
      remaining -= segLen;
    }
    const last = this.waypoints[this.waypoints.length - 1];
    return { x: last.x, y: last.y };
  }

  _samplePeriodPosition(phase) {
    const p = ((phase % 1) + 1) % 1;
    let t = 0;
    if (this.mode === PlatformMode.SINE) {
      t = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    } else {
      // Linear triangle wave 0 -> 1 -> 0
      t = p < 0.5 ? p * 2 : 2 - p * 2;
    }
    return this._samplePathAtDistance(t * this._linearTotalLen);
  }

  _sampleOrbitPosition(angle) {
    return {
      x: this.centerX + this.radiusX * Math.cos(angle) - this.width * 0.5,
      y: this.centerY + this.radiusY * Math.sin(angle) - this.height * 0.5,
    };
  }

  reset() {
    this.elapsed = this.initialPhase * this.periodSec;
    this.angle = this.startAngle;
    this._linearDist = Math.max(0, Math.min(this._linearTotalLen, this.initialPhase * this._linearTotalLen));
    this._linearDir = 1;
    this.solidActive = true;

    this.fallState = FallAwayState.IDLE;
    this.weightDetected = false;
    this.weightFrames = 0;
    this.fallVy = 0;
    this.respawnTimer = 0;
    this.shakeOffsetPx = 0;
    this._justDetached = false;

    let initial;
    if (this.mode === PlatformMode.CIRCULAR_ORBIT) {
      initial = this._sampleOrbitPosition(this.angle);
    } else if (this.mode === PlatformMode.FALL_AWAY) {
      const oscPhase = this.initialPhase * Math.PI * 2;
      initial = {
        x: this.startX + (this.oscillateAmpX ? Math.sin(oscPhase) * this.oscillateAmpX : 0),
        y: this.startY + (this.oscillateAmpY ? Math.sin(oscPhase) * this.oscillateAmpY : 0),
      };
    } else if (this.mode === PlatformMode.LINEAR && this.speed !== null) {
      initial = this._samplePathAtDistance(this._linearDist);
    } else {
      initial = this._samplePeriodPosition(this.initialPhase);
    }

    this.pos.x = initial.x;
    this.pos.y = initial.y;
    this.prevPos.x = initial.x;
    this.prevPos.y = initial.y;
    this.vel.x = 0;
    this.vel.y = 0;
    this.deltaX = 0;
    this.deltaY = 0;
  }

  /**
   * Notify a Fall-Away platform that the player is currently standing on it.
   */
  notifyRider(isRiding) {
    if (this.mode !== PlatformMode.FALL_AWAY) return;
    if (isRiding && this.fallState === FallAwayState.IDLE) {
      this.weightDetected = true;
      this.fallState = FallAwayState.SHAKING;
      this.weightFrames = 0;
    }
  }

  /**
   * Advance platform position by one fixed 60 Hz step.
   */
  update(dt) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    this._justDetached = false;

    if (this.mode === PlatformMode.CIRCULAR_ORBIT) {
      const dir = this.clockwise ? -1 : 1;
      this.angle += dir * this.angularSpeed * dt;
      const next = this._sampleOrbitPosition(this.angle);
      this.pos.x = next.x;
      this.pos.y = next.y;
    } else if (this.mode === PlatformMode.FALL_AWAY) {
      const pCfg = MovementProfile.props.platform;
      const hasOsc = this.oscillateAmpX !== 0 || this.oscillateAmpY !== 0;
      if (this.fallState === FallAwayState.IDLE) {
        if (hasOsc) {
          this.elapsed += dt;
          const oscPhase = ((this.elapsed / this.oscillatePeriodSec) + this.initialPhase) * Math.PI * 2;
          this.pos.x = this.startX + Math.sin(oscPhase) * this.oscillateAmpX;
          this.pos.y = this.startY + Math.sin(oscPhase) * this.oscillateAmpY;
        }
      } else if (this.fallState === FallAwayState.SHAKING) {
        if (hasOsc) {
          this.elapsed += dt;
          const oscPhase = ((this.elapsed / this.oscillatePeriodSec) + this.initialPhase) * Math.PI * 2;
          this.pos.x = this.startX + Math.sin(oscPhase) * this.oscillateAmpX;
          this.pos.y = this.startY + Math.sin(oscPhase) * this.oscillateAmpY;
        }
        this.weightFrames++;
        if (this.weightFrames >= pCfg.fallAwayShakeStartFrame) {
          this.shakeOffsetPx = Math.sin(this.weightFrames * 1.9) * pCfg.fallAwayShakeAmpPx;
        }
        if (this.weightFrames >= this.fallAwayDelayFrames) {
          this.fallState = FallAwayState.FALLING;
          this.shakeOffsetPx = 0;
          this.fallVy = 0;
          this._justDetached = true;
        }
      } else if (this.fallState === FallAwayState.FALLING) {
        const prevVy = this.fallVy;
        this.fallVy = Math.min(pCfg.fallAwayTerminalVy, this.fallVy + pCfg.fallAwayGravity * dt);
        const stepVy = 0.5 * (prevVy + this.fallVy);
        this.pos.y -= stepVy * dt;
        if (this.startY - this.pos.y >= pCfg.fallAwayMaxDropDist) {
          this.fallState = FallAwayState.RESPAWNING;
          this.solidActive = false;
          this.fallVy = 0;
          this.respawnTimer = this.fallAwayRespawnFrames;
        }
      } else if (this.fallState === FallAwayState.RESPAWNING) {
        this.solidActive = false;
        this.respawnTimer--;
        if (this.respawnTimer <= 0) {
          this.reset();
        }
      }
    } else if (this.mode === PlatformMode.LINEAR && this.speed !== null && this._linearTotalLen > 1e-6) {
      const step = this.speed * dt * this._linearDir;
      let nextDist = this._linearDist + step;
      if (nextDist >= this._linearTotalLen) {
        nextDist = this._linearTotalLen - (nextDist - this._linearTotalLen);
        this._linearDir = -1;
      } else if (nextDist <= 0) {
        nextDist = -nextDist;
        this._linearDir = 1;
      }
      this._linearDist = Math.max(0, Math.min(this._linearTotalLen, nextDist));
      const next = this._samplePathAtDistance(this._linearDist);
      this.pos.x = next.x;
      this.pos.y = next.y;
    } else {
      this.elapsed += dt;
      const phase = this.elapsed / this.periodSec;
      const next = this._samplePeriodPosition(phase);
      this.pos.x = next.x;
      this.pos.y = next.y;
    }

    this.deltaX = this.pos.x - this.prevPos.x;
    this.deltaY = this.pos.y - this.prevPos.y;
    this.vel.x = dt > 0 ? this.deltaX / dt : 0;
    this.vel.y = dt > 0 ? this.deltaY / dt : 0;
  }

  getRenderPos(alpha) {
    return {
      x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
      y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha,
    };
  }
}

/**
 * CompressionSpring — 64×32px Mechanical Launch Spring
 *   - Compresses downward by 16px (0.25t) over 4 frames (squash ratio 0.50).
 *   - Normal Bounce: automatically launches upward at +16.00 tiles/s.
 *   - Timed Power Bounce: pressing JUMP within the 4-frame compression/rebound
 *     window triggers Super Spring Launch at +22.50 tiles/s.
 */
export class CompressionSpring {
  constructor(config = {}) {
    const sCfg = MovementProfile.props.spring;
    this.id = config.id || 'spring';
    this.pos = { x: config.x ?? 0, y: config.y ?? 0 };
    this.width = config.width ?? sCfg.width;   // 1.00t (64px)
    this.height = config.height ?? sCfg.height; // 0.50t (32px)
    this.label = config.label || '';

    this.reset();
  }

  reset() {
    this.state = SpringState.IDLE;
    this.compressFrame = 0;
    this.squashRatio = 1.0;
    this.prevSquashRatio = 1.0;
    this.powerBounceQueued = false;
    this.reboundVisualTimer = 0;
    this.lastWasSuper = false;
    this.riderActive = false;
  }

  get x() {
    return this.pos.x;
  }

  get y() {
    return this.pos.y;
  }

  get currentHeight() {
    return this.height * this.squashRatio;
  }

  get currentTopY() {
    return this.pos.y + this.currentHeight;
  }

  get restTopY() {
    return this.pos.y + this.height;
  }

  get compressionPx() {
    return (1.0 - this.squashRatio) * this.height * MovementProfile.tilemap.tileSize;
  }

  /**
   * True when the spring is inside the 4-frame Timed Power Bounce input window.
   */
  get isInPowerBounceWindow() {
    if (this.state !== SpringState.COMPRESSING) return false;
    const sCfg = MovementProfile.props.spring;
    const windowStart = Math.max(1, sCfg.compressFrames + 1 - sCfg.powerBounceWindowFrames);
    return this.compressFrame >= windowStart;
  }

  /**
   * Test whether the player lands on or steps onto the idle spring pad.
   */
  canCapturePlayer(player) {
    if (this.state === SpringState.COMPRESSING) return false;
    if (player.state === PlayerState.DEFEAT || player.state === PlayerState.IN_WARP_TRANSITION) {
      return false;
    }

    const horizForgive = 0.12;
    const overlapsX =
      player.pos.x + player.currentWidth > this.pos.x - horizForgive &&
      player.pos.x < this.pos.x + this.width + horizForgive;
    if (!overlapsX) return false;

    // Must be descending or resting at the spring top plate (anti-tunneling for fast falls up to 28 t/s)
    const topY = this.restTopY;
    const fallingOrResting = player.vel.y <= 0.1;
    const fromAbove = player.prevPos.y >= topY - 0.45 && (!player.grounded || player.pos.y >= topY - 0.18);
    const crossedTop =
      fromAbove &&
      player.pos.y <= topY + 0.08 &&
      player.pos.y >= this.pos.y - 0.05;

    return fallingOrResting && crossedTop;
  }

  /**
   * Step spring compression, timed JUMP window check, and impulse launch.
   * Returns an event descriptor or null.
   */
  update(player, input) {
    const sCfg = MovementProfile.props.spring;
    this.prevSquashRatio = this.squashRatio;

    // Visual overshoot decay after rebound fire
    if (this.state === SpringState.REBOUND) {
      this.reboundVisualTimer--;
      if (this.reboundVisualTimer <= 0) {
        this.state = SpringState.IDLE;
        this.squashRatio = 1.0;
        this.reboundVisualTimer = 0;
      } else {
        const t = this.reboundVisualTimer / Math.max(1, sCfg.reboundVisualFrames);
        // Damped harmonic spring oscillation settling to 1.0
        const overshoot = (sCfg.reboundStretchRatio - 1.0) * t * Math.sin(t * Math.PI * 2.5);
        this.squashRatio = Math.max(0.75, 1.0 + overshoot);
      }
      // Allow re-capture once coil settles near idle
      if (this.reboundVisualTimer <= 4 && this.canCapturePlayer(player)) {
        this._beginCompression(player, input);
        return { type: 'springCompress', spring: this, x: this.pos.x + this.width * 0.5, y: this.currentTopY };
      }
      return null;
    }

    if (this.state === SpringState.IDLE) {
      if (this.canCapturePlayer(player)) {
        this._beginCompression(player, input);
        return { type: 'springCompress', spring: this, x: this.pos.x + this.width * 0.5, y: this.currentTopY };
      }
      this.squashRatio = 1.0;
      return null;
    }

    // State === COMPRESSING
    const jumpPressed = Boolean(input && input.pressedThisFrame(Actions.JUMP));

    // Check if we already completed the 4 compression frames -> fire on rebound frame!
    if (this.compressFrame >= sCfg.compressFrames) {
      // Final rebound frame is included in the 4-frame Power Bounce window
      if (jumpPressed) {
        this.powerBounceQueued = true;
      }
      const isSuper = this.powerBounceQueued;
      const launchVy = isSuper ? sCfg.superBounceVy : sCfg.normalBounceVy;

      // Launch cleanly from the top of the 64×32px spring pad
      player.pos.y = this.restTopY;
      player.applySpringLaunch(launchVy, isSuper, this);

      this.state = SpringState.REBOUND;
      this.reboundVisualTimer = sCfg.reboundVisualFrames;
      this.squashRatio = sCfg.reboundStretchRatio;
      this.lastWasSuper = isSuper;
      this.riderActive = false;
      this.powerBounceQueued = false;
      this.compressFrame = 0;

      return {
        type: 'springBounce',
        spring: this,
        isSuper,
        launchVy,
        x: this.pos.x + this.width * 0.5,
        y: this.restTopY,
      };
    }

    // Advance compression frame (frames 1..4 -> reaches 0.50 squash / 16px on frame 4)
    this.compressFrame++;
    const windowStart = Math.max(1, sCfg.compressFrames + 1 - sCfg.powerBounceWindowFrames);
    if (jumpPressed && this.compressFrame >= windowStart) {
      this.powerBounceQueued = true;
    }

    const progress = Math.min(1, this.compressFrame / sCfg.compressFrames);
    this.squashRatio = 1.0 - (1.0 - sCfg.squashRatio) * progress;

    // Keep player's feet smoothly locked to the compressing top plate
    player.pos.y = this.currentTopY;
    player.vel.y = 0;
    player.grounded = true;
    player.isJumping = false;
    player.activeSpring = this;

    return null;
  }

  _beginCompression(player, input) {
    const sCfg = MovementProfile.props.spring;
    this.state = SpringState.COMPRESSING;
    this.compressFrame = 1;
    this.riderActive = true;
    this.powerBounceQueued = false;

    const windowStart = Math.max(1, sCfg.compressFrames + 1 - sCfg.powerBounceWindowFrames);
    if (input && input.pressedThisFrame(Actions.JUMP) && this.compressFrame >= windowStart) {
      this.powerBounceQueued = true;
    }

    const progress = Math.min(1, this.compressFrame / sCfg.compressFrames);
    this.squashRatio = 1.0 - (1.0 - sCfg.squashRatio) * progress;
    player.pos.y = this.currentTopY;
    player.vel.y = 0;
    player.grounded = true;
    player.isJumping = false;
    player.activeSpring = this;
  }

  getRenderSquash(alpha) {
    return this.prevSquashRatio + (this.squashRatio - this.prevSquashRatio) * alpha;
  }
}

/**
 * WarpAccessTube — 128×128px Sub-Area Conduit Pipe
 *   - Supports DOWN (crouch atop), UP (overhead pipe), LEFT & RIGHT (lateral entry).
 *   - Triggers PlayerState.IN_WARP_TRANSITION with 45-frame sliding interpolation,
 *     pipe-mouth foreground z-ordering mask, fade-to-black, and subterranean relocation.
 */
export class WarpAccessTube {
  constructor(config = {}) {
    const wCfg = MovementProfile.props.warpTube;
    this.id = config.id || 'warp_tube';
    this.x = config.x ?? 0;
    this.y = config.y ?? 0;
    this.headWidth = config.headWidth ?? wCfg.headWidth;   // 2.00t (128px)
    this.headHeight = config.headHeight ?? wCfg.headHeight; // 2.00t (128px)
    this.entryVector = config.entryVector || WarpEntryVector.DOWN;
    this.stemLength = config.stemLength ?? 0;
    this.destX = config.destX ?? this.x;
    this.destY = config.destY ?? this.y;
    this.destSubArea = config.destSubArea ?? true;
    this.exitVector = config.exitVector ?? null; // Optional emergence direction at destination
    this.exitFacingRight = config.exitFacingRight ?? true;
    this.isGoalPipe = Boolean(config.isGoalPipe);
    this.label = config.label || '';
    this.color = config.color || '#10b981';
    this.accentColor = config.accentColor || '#34d399';
  }

  get centerX() {
    return this.x + this.headWidth * 0.5;
  }

  get centerY() {
    return this.y + this.headHeight * 0.5;
  }

  /**
   * Solid AABB boxes for swept collision against the pipe body.
   */
  getSolidBoxes() {
    const boxes = [
      {
        x: this.x,
        y: this.y,
        width: this.headWidth,
        height: this.headHeight,
        source: this,
      },
    ];
    if (this.stemLength > 0) {
      const inset = 0.12;
      if (this.entryVector === WarpEntryVector.DOWN) {
        boxes.push({
          x: this.x + inset,
          y: this.y - this.stemLength,
          width: this.headWidth - inset * 2,
          height: this.stemLength,
          source: this,
        });
      } else if (this.entryVector === WarpEntryVector.UP) {
        boxes.push({
          x: this.x + inset,
          y: this.y + this.headHeight,
          width: this.headWidth - inset * 2,
          height: this.stemLength,
          source: this,
        });
      } else if (this.entryVector === WarpEntryVector.RIGHT) {
        boxes.push({
          x: this.x + this.headWidth,
          y: this.y + inset,
          width: this.stemLength,
          height: this.headHeight - inset * 2,
          source: this,
        });
      } else if (this.entryVector === WarpEntryVector.LEFT) {
        boxes.push({
          x: this.x - this.stemLength,
          y: this.y + inset,
          width: this.stemLength,
          height: this.headHeight - inset * 2,
          source: this,
        });
      }
    }
    return boxes;
  }

  /**
   * Check whether the player satisfies the entry vector & alignment to enter this tube.
   */
  canPlayerEnter(player, input) {
    if (!input) return false;
    if (
      player.warpCooldownTimer > 0 ||
      player.state === PlayerState.IN_WARP_TRANSITION ||
      player.state === PlayerState.WARP_PIPE ||
      player.state === PlayerState.DEFEAT
    ) {
      return false;
    }

    const wCfg = MovementProfile.props.warpTube;

    if (this.entryVector === WarpEntryVector.DOWN) {
      if (!player.grounded || !input.held(Actions.DOWN)) return false;
      const dx = Math.abs(player.centerX - this.centerX);
      const dy = Math.abs(player.pos.y - (this.y + this.headHeight));
      return dx <= wCfg.verticalToleranceX && dy <= wCfg.verticalToleranceY;
    }

    if (this.entryVector === WarpEntryVector.UP) {
      if (!input.held(Actions.UP)) return false;
      const dx = Math.abs(player.centerX - this.centerX);
      const playerTop = player.pos.y + player.currentHeight;
      const dy = Math.abs(playerTop - this.y);
      return dx <= wCfg.verticalToleranceX && dy <= wCfg.verticalToleranceY + 0.12 && player.vel.y >= -2.5;
    }

    if (this.entryVector === WarpEntryVector.RIGHT) {
      if (!player.grounded || !input.held(Actions.RIGHT)) return false;
      const playerRight = player.pos.x + player.currentWidth;
      const dx = Math.abs(playerRight - this.x);
      const inY = player.pos.y >= this.y - 0.18 && player.pos.y <= this.y + wCfg.lateralToleranceY;
      return dx <= wCfg.lateralToleranceX && inY;
    }

    if (this.entryVector === WarpEntryVector.LEFT) {
      if (!player.grounded || !input.held(Actions.LEFT)) return false;
      const dx = Math.abs(player.pos.x - (this.x + this.headWidth));
      const inY = player.pos.y >= this.y - 0.18 && player.pos.y <= this.y + wCfg.lateralToleranceY;
      return dx <= wCfg.lateralToleranceX && inY;
    }

    return false;
  }

  /**
   * Compute exact start & end bottom-left coordinates for the 45-frame slide-in interpolation.
   */
  computeSlideTrack(player) {
    const depth = MovementProfile.props.warpTube.slideDepthTiles;
    const w = player.currentWidth;
    const h = player.height;

    if (this.entryVector === WarpEntryVector.DOWN) {
      const alignedX = this.centerX - w * 0.5;
      const startY = this.y + this.headHeight;
      return {
        startX: alignedX,
        startY,
        endX: alignedX,
        endY: startY - depth,
      };
    }

    if (this.entryVector === WarpEntryVector.UP) {
      const alignedX = this.centerX - w * 0.5;
      const startY = this.y - h;
      return {
        startX: alignedX,
        startY,
        endX: alignedX,
        endY: startY + depth,
      };
    }

    if (this.entryVector === WarpEntryVector.RIGHT) {
      const startX = this.x - w;
      const alignedY = this.y + 0.08;
      return {
        startX,
        startY: alignedY,
        endX: startX + depth,
        endY: alignedY,
      };
    }

    // LEFT
    const startX = this.x + this.headWidth;
    const alignedY = this.y + 0.08;
    return {
      startX,
      startY: alignedY,
      endX: startX - depth,
      endY: alignedY,
    };
  }
}

/**
 * EnvironmentalPropsSystem — Room-level manager for Moving Platforms,
 * Compression Springs, and Warp Access Tubes.
 */
export class EnvironmentalPropsSystem {
  constructor() {
    this.platforms = [];
    this.springs = [];
    this.warpTubes = [];
    this.events = [];
    this.inSubArea = false;
    this.activeSubAreaBounds = null;
    this._solidBoxesCache = [];
  }

  loadRoom(room) {
    this.platforms = [];
    this.springs = [];
    this.warpTubes = [];
    this.events.length = 0;
    this.inSubArea = false;
    this.activeSubAreaBounds = room?.subAreaBounds || null;

    if (room?.propPlatforms) {
      for (let i = 0; i < room.propPlatforms.length; i++) {
        const item = room.propPlatforms[i];
        const plat = item instanceof MovingPlatformProp ? item : new MovingPlatformProp(item);
        plat.reset();
        this.platforms.push(plat);
      }
    }

    if (room?.springs) {
      for (let i = 0; i < room.springs.length; i++) {
        const item = room.springs[i];
        const spring = item instanceof CompressionSpring ? item : new CompressionSpring(item);
        spring.reset();
        this.springs.push(spring);
      }
    }

    if (room?.warpTubes) {
      for (let i = 0; i < room.warpTubes.length; i++) {
        const item = room.warpTubes[i];
        const tube = item instanceof WarpAccessTube ? item : new WarpAccessTube(item);
        this.warpTubes.push(tube);
      }
    }

    this._rebuildSolidBoxes();
  }

  reset() {
    this.events.length = 0;
    this.inSubArea = false;
    for (let i = 0; i < this.platforms.length; i++) this.platforms[i].reset();
    for (let i = 0; i < this.springs.length; i++) this.springs[i].reset();
    this._rebuildSolidBoxes();
  }

  _rebuildSolidBoxes() {
    this._solidBoxesCache.length = 0;
    for (let i = 0; i < this.warpTubes.length; i++) {
      const boxes = this.warpTubes[i].getSolidBoxes();
      for (let j = 0; j < boxes.length; j++) {
        this._solidBoxesCache.push(boxes[j]);
      }
    }
  }

  getSolidBoxes() {
    return this._solidBoxesCache;
  }

  /**
   * Step 1 (Pre-Player): Notify fall-away weight and advance prop platforms.
   */
  updatePlatforms(dt, ridingPlatform = null) {
    this.events.length = 0;
    for (let i = 0; i < this.platforms.length; i++) {
      const plat = this.platforms[i];
      if (plat === ridingPlatform) {
        plat.notifyRider(true);
      }
      plat.update(dt);
      if (plat._justDetached) {
        this.events.push({
          type: 'platformFallAway',
          platform: plat,
          x: plat.pos.x + plat.width * 0.5,
          y: plat.pos.y,
          width: plat.width,
        });
      }
    }
  }

  /**
   * Step 2 (Pre-Player): Check whether player initiates entry into any Warp Access Tube.
   */
  checkWarpTubeEntry(player, input) {
    if (!this.warpTubes.length) return null;
    for (let i = 0; i < this.warpTubes.length; i++) {
      const tube = this.warpTubes[i];
      if (tube.canPlayerEnter(player, input)) {
        if (player.startWarpTransition(tube)) {
          this.events.push({
            type: 'warpStart',
            tube,
            entryVector: tube.entryVector,
            x: tube.centerX,
            y: tube.centerY,
          });
          return tube;
        }
      }
    }
    return null;
  }

  /**
   * Step 2b (Pre-Player): Advance already-compressing springs (including rebound fire)
   * and decay rebounding spring coil animations before PlayerController.update runs.
   */
  stepActiveSprings(player, input) {
    if (!this.springs.length) return;
    if (player.state === PlayerState.IN_WARP_TRANSITION || player.state === PlayerState.DEFEAT) {
      return;
    }
    for (let i = 0; i < this.springs.length; i++) {
      const spring = this.springs[i];
      if (spring.state === SpringState.COMPRESSING || spring.state === SpringState.REBOUND) {
        const ev = spring.update(player, input);
        if (ev) {
          this.events.push(ev);
        }
      }
    }
  }

  /**
   * Step 3 (Post-Player): Capture landing players onto IDLE Compression Launch Springs.
   */
  captureIdleSprings(player, input) {
    if (!this.springs.length) return;
    if (
      player.activeSpring ||
      player.state === PlayerState.IN_WARP_TRANSITION ||
      player.state === PlayerState.DEFEAT
    ) {
      return;
    }
    for (let i = 0; i < this.springs.length; i++) {
      const spring = this.springs[i];
      if (spring.state === SpringState.IDLE) {
        const ev = spring.update(player, input);
        if (ev) {
          this.events.push(ev);
          break;
        }
      }
    }
  }

  /**
   * Combined helper for standalone/test usage.
   */
  updateSprings(player, input) {
    this.stepActiveSprings(player, input);
    this.captureIdleSprings(player, input);
  }
}

export default EnvironmentalPropsSystem;
