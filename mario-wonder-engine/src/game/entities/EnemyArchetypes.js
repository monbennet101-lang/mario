/**
 * EnemyArchetypes — Original Enemy Gallery 1: The Sproutling & The Hoplite
 * =========================================================================
 * Deterministic 60 Hz state machines and swept AABB kinematics for:
 *
 *   1. SproutlingEnemy (Patrol Walker Archetype)
 *      - Dimensions: 40×44px (0.625t × 0.6875t); SQUASHED: 56×14px for 15 frames
 *      - Patrol vx = 1.25 tiles/s; optional turnAtLedges (default false); 0-frame wall bounce
 *      - Stomp from above -> SQUASHED (15f then despawn), rebound +11.50/+15.50 t/s, +200 pts
 *      - Side/underbody contact -> 1 damage point
 *      - Projectile strike (Fireball/Shell) -> LAUNCH_DEATH (inverted, vx=±2.5 t/s, vy=+8.0 t/s, falls through floor)
 *
 *   2. HopliteEnemy (Armored Shell / Recoil Projectile Archetype)
 *      - Dimensions: 44×44px walking, 40×36px retracted shell
 *      - Phase 1 WALK: vx = 1.00 tiles/s; wall reverses direction
 *      - Stomp 1 -> DORMANT_SHELL (vx=0, 300f dormancy, ±2px wakeup shake starting at frame 240, wakes at frame 300)
 *      - Kick / Shell Slide -> SHELL_MOVING at vx = 12.00 tiles/s, 4-substep swept AABB carve-through,
 *        100% elastic wall rebound maintaining |vx| === 12.00 t/s + 2px camera trauma shake,
 *        multi-kill score chain culminating in 1-UP on 6 consecutive enemies
 *      - Stomp 2 on moving shell -> halts immediately back into DORMANT_SHELL without hurting player
 *      - Carry & Throw -> RUN held aligns shell to player.hands, release hurls at 12.00 t/s
 */

import MovementProfile from '../config/MovementProfile.js';
import Entity from './Entity.js';

export const SproutlingState = {
  WALK: 'WALK',
  SQUASHED: 'SQUASHED',
  LAUNCH_DEATH: 'LAUNCH_DEATH',
};

export const HopliteState = {
  WALK: 'WALK',
  DORMANT_SHELL: 'DORMANT_SHELL',
  SHELL_MOVING: 'SHELL_MOVING',
  CARRIED: 'CARRIED',
  LAUNCH_DEATH: 'LAUNCH_DEATH',
};

export class SproutlingEnemy extends Entity {
  constructor(x, y, dir = -1, options = {}) {
    const cfg = MovementProfile.enemyGallery.sproutling;
    super(x, y, cfg.width, cfg.height, 'sproutling');
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.state = SproutlingState.WALK;
    this.turnAtLedges = Boolean(options.turnAtLedges);
    this.squashTimer = 0;
    this.squashElapsed = 0;
    this.launchDeathTimer = 0;
    this.inverted = false;
    this.animFrameTimer = 0;
    this.walkFrame = 0;
    this.vel.x = this.dir * cfg.patrolSpeed;
  }

  get isThreat() {
    return this.active && this.state === SproutlingState.WALK;
  }

  get isDefeated() {
    return this.state === SproutlingState.SQUASHED || this.state === SproutlingState.LAUNCH_DEATH;
  }

  /**
   * Pixel AABB centered horizontally: [cx - w/2, y, cx + w/2, y + h] in px.
   */
  getPixelAABB() {
    const ppt = MovementProfile.simulation.pixelsPerTile;
    const cx = this.centerX * ppt;
    const halfW = (this.width * ppt) * 0.5;
    const bottom = this.pos.y * ppt;
    return {
      left: cx - halfW,
      bottom,
      right: cx + halfW,
      top: bottom + this.height * ppt,
      width: this.width * ppt,
      height: this.height * ppt,
    };
  }

  squash() {
    const cfg = MovementProfile.enemyGallery.sproutling;
    const cx = this.centerX;
    this.state = SproutlingState.SQUASHED;
    this.width = cfg.squashedWidth;
    this.height = cfg.squashedHeight;
    this.pos.x = cx - this.width * 0.5;
    this.prevPos.x = this.pos.x;
    this.vel.x = 0;
    this.vel.y = 0;
    this.squashTimer = cfg.squashFrames;
    this.squashElapsed = 0;
  }

  launchDeath(awayDir = 1) {
    const cfg = MovementProfile.enemyGallery.sproutling;
    const sign = awayDir >= 0 ? 1 : -1;
    this.state = SproutlingState.LAUNCH_DEATH;
    this.inverted = true;
    this.grounded = false;
    this.vel.x = sign * cfg.launchDeathVx;
    this.vel.y = cfg.launchDeathVy;
    this.launchDeathTimer = cfg.launchDeathFrames;
  }

  knockOut(awayDir = 1) {
    this.launchDeath(awayDir);
  }

  getSpriteFrameInfo() {
    const cfg = MovementProfile.enemyGallery.sproutling;
    if (this.state === SproutlingState.SQUASHED) {
      const frameIndex = this.squashElapsed < Math.ceil(cfg.squashFrames * 0.45) ? 0 : 1;
      return {
        action: 'squash',
        frameIndex,
        totalFrames: 2,
        widthPx: cfg.squashedWidthPx,
        heightPx: cfg.squashedHeightPx,
        inverted: false,
      };
    }
    if (this.state === SproutlingState.LAUNCH_DEATH) {
      return {
        action: 'launch_death',
        frameIndex: 0,
        totalFrames: 1,
        widthPx: cfg.widthPx,
        heightPx: cfg.heightPx,
        inverted: true,
      };
    }
    return {
      action: 'walk',
      frameIndex: this.walkFrame,
      totalFrames: 4,
      widthPx: cfg.widthPx,
      heightPx: cfg.heightPx,
      inverted: false,
    };
  }

  update(dt, collision, platforms = []) {
    if (!this.active) return;
    this.syncPrevPos();

    if (this.state === SproutlingState.SQUASHED) {
      this.squashElapsed++;
      this.squashTimer--;
      if (this.squashTimer <= 0) {
        this.destroy();
      }
      return;
    }

    if (this.state === SproutlingState.LAUNCH_DEATH) {
      this.launchDeathTimer--;
      this.vel.y -= MovementProfile.jump.gravityFalling * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.launchDeathTimer <= 0 || this.pos.y < -8) {
        this.destroy();
      }
      return;
    }

    const cfg = MovementProfile.enemyGallery.sproutling;
    const speed = cfg.patrolSpeed;
    this.animFrameTimer += dt * 8; // 8 FPS 4-frame walk cycle
    this.walkFrame = Math.floor(this.animFrameTimer) % 4;
    this.vel.x = this.dir * speed;

    const prevVy = this.vel.y;
    if (!this.grounded) {
      this.vel.y = Math.max(
        -MovementProfile.jump.terminalFallSpeed,
        this.vel.y - MovementProfile.jump.gravityFalling * dt
      );
    }

    // Optional ledge-turning sensor (false = basic cliff drop, true = patrol platforms)
    if (this.turnAtLedges && this.grounded) {
      const probeX = this.dir > 0 ? this.pos.x + this.width + 0.06 : this.pos.x - 0.06;
      if (collision.groundClearance(probeX - 0.05, this.pos.y, 0.1, 0.25, platforms) > 0.2) {
        this.dir *= -1;
        this.facingRight = this.dir > 0;
        this.vel.x = this.dir * speed;
      }
    }

    const stepVel = { x: this.vel.x, y: this.grounded ? -0.5 : 0.5 * (prevVy + this.vel.y) };
    const res = collision.moveAndCollide(
      this.pos,
      stepVel,
      this.width,
      this.height,
      dt,
      { wasGrounded: this.grounded, platforms }
    );

    // 0-frame debounce wall collision inversion
    if (res.wallLeft || res.wallRight) {
      this.dir = res.wallRight ? -1 : 1;
      this.facingRight = this.dir > 0;
      this.vel.x = this.dir * speed;
    }

    this.grounded = res.grounded;
    if (res.grounded) this.vel.y = 0;

    if (this.pos.y < -4) {
      this.destroy();
    }
  }
}

export class HopliteEnemy extends Entity {
  constructor(x, y, dir = -1, options = {}) {
    const cfg = MovementProfile.enemyGallery.hoplite;
    const initState = options.initialState || HopliteState.WALK;
    const isShellInit = initState !== HopliteState.WALK;
    super(
      x,
      y,
      isShellInit ? cfg.shellWidth : cfg.walkWidth,
      isShellInit ? cfg.shellHeight : cfg.walkHeight,
      'hoplite'
    );
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.state = initState;
    this.turnAtLedges = Boolean(options.turnAtLedges);

    this.dormancyFrames = 0;
    this.retractAnimFramesRemaining = 0;
    this.isTelegraphingWakeup = false;
    this.wakeupShakeOffsetPx = 0;

    this.bounceCount = 0;
    this.comboCount = 0;
    this.oneUpAwarded = false;
    this.scoreChainLog = [];
    this.stompGraceTimer = 0;
    this.kickSafetyTimer = 0;
    this.launchDeathTimer = 0;
    this.inverted = false;

    this.animFrameTimer = 0;
    this.walkFrame = 0;
    this.spinFrame = 0;
    this.wakeupFrame = 0;

    this.throwSpeed = cfg.shellSpeed;
    this.vel.x = this.state === HopliteState.WALK ? this.dir * cfg.walkSpeed : 0;

    // Swept bounding box covering full tick travel for fast carve-through enemy checks
    this._sweptMinX = this.pos.x;
    this._sweptMaxX = this.pos.x + this.width;
    this._sweptMinY = this.pos.y;
    this._sweptMaxY = this.pos.y + this.height;
  }

  get isThreat() {
    if (!this.active) return false;
    if (this.state === HopliteState.WALK) return true;
    if (this.state === HopliteState.SHELL_MOVING && this.kickSafetyTimer <= 0) return true;
    return false;
  }

  get isShell() {
    return (
      this.state === HopliteState.DORMANT_SHELL ||
      this.state === HopliteState.SHELL_MOVING ||
      this.state === HopliteState.CARRIED
    );
  }

  get isDefeated() {
    return this.state === HopliteState.LAUNCH_DEATH;
  }

  getSweptAABB() {
    return {
      x: this._sweptMinX,
      y: this._sweptMinY,
      width: Math.max(this.width, this._sweptMaxX - this._sweptMinX),
      height: Math.max(this.height, this._sweptMaxY - this._sweptMinY),
    };
  }

  _resizeCentered(newWidth, newHeight) {
    const cx = this.centerX;
    this.width = newWidth;
    this.height = newHeight;
    this.pos.x = cx - newWidth * 0.5;
  }

  retractToShell() {
    const cfg = MovementProfile.enemyGallery.hoplite;
    this.state = HopliteState.DORMANT_SHELL;
    this._resizeCentered(cfg.shellWidth, cfg.shellHeight);
    this.prevPos.x = this.pos.x;
    this.vel.x = 0;
    this.vel.y = 0;
    this.dormancyFrames = 0;
    this.retractAnimFramesRemaining = cfg.retractAnimFrames;
    this.isTelegraphingWakeup = false;
    this.wakeupShakeOffsetPx = 0;
    this.comboCount = 0;
    this.oneUpAwarded = false;
    this.scoreChainLog = [];
    this.stompGraceTimer = 6;
  }

  haltToDormant() {
    this.retractToShell();
    // Moving shell already has retracted legs
    this.retractAnimFramesRemaining = 0;
  }

  kickShell(dir, speed = MovementProfile.enemyGallery.hoplite.shellSpeed) {
    const cfg = MovementProfile.enemyGallery.hoplite;
    this.state = HopliteState.SHELL_MOVING;
    this._resizeCentered(cfg.shellWidth, cfg.shellHeight);
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.vel.x = this.dir * speed;
    this.dormancyFrames = 0;
    this.retractAnimFramesRemaining = 0;
    this.isTelegraphingWakeup = false;
    this.wakeupShakeOffsetPx = 0;
    this.comboCount = 0;
    this.oneUpAwarded = false;
    this.scoreChainLog = [cfg.kickScore];
    this.kickSafetyTimer = 8;
  }

  startCarry() {
    const cfg = MovementProfile.enemyGallery.hoplite;
    this.state = HopliteState.CARRIED;
    this._resizeCentered(cfg.shellWidth, cfg.shellHeight);
    this.vel.x = 0;
    this.vel.y = 0;
    this.dormancyFrames = 0;
    this.retractAnimFramesRemaining = 0;
    this.isTelegraphingWakeup = false;
    this.wakeupShakeOffsetPx = 0;
  }

  wakeUp(collision = null) {
    const cfg = MovementProfile.enemyGallery.hoplite;
    this.state = HopliteState.WALK;
    this._resizeCentered(cfg.walkWidth, cfg.walkHeight);
    // Prevent waking up overlapping an adjacent solid wall
    if (collision) {
      const leftCol = Math.floor(this.pos.x);
      const rightCol = Math.floor(this.pos.x + this.width - 1e-4);
      const row = Math.floor(this.pos.y + 0.1);
      if (collision.tilemap.isSolid(leftCol, row)) {
        this.pos.x = leftCol + 1 + 0.001;
      } else if (collision.tilemap.isSolid(rightCol, row)) {
        this.pos.x = rightCol - this.width - 0.001;
      }
    }
    this.dormancyFrames = 0;
    this.isTelegraphingWakeup = false;
    this.wakeupShakeOffsetPx = 0;
    this.vel.x = this.dir * cfg.walkSpeed;
  }

  launchDeath(awayDir = 1) {
    const cfg = MovementProfile.enemyGallery.hoplite;
    const sign = awayDir >= 0 ? 1 : -1;
    this.state = HopliteState.LAUNCH_DEATH;
    this.inverted = true;
    this.grounded = false;
    this.vel.x = sign * cfg.launchDeathVx;
    this.vel.y = cfg.launchDeathVy;
    this.launchDeathTimer = cfg.launchDeathFrames;
  }

  knockOut(awayDir = 1) {
    this.launchDeath(awayDir);
  }

  getSpriteFrameInfo() {
    const cfg = MovementProfile.enemyGallery.hoplite;
    if (this.state === HopliteState.WALK) {
      return {
        action: 'walk',
        frameIndex: this.walkFrame,
        totalFrames: 4,
        widthPx: cfg.walkWidthPx,
        heightPx: cfg.walkHeightPx,
        shakeOffsetPx: 0,
        inverted: false,
      };
    }
    if (this.state === HopliteState.LAUNCH_DEATH) {
      return {
        action: 'shell_idle',
        frameIndex: 0,
        totalFrames: 1,
        widthPx: cfg.shellWidthPx,
        heightPx: cfg.shellHeightPx,
        shakeOffsetPx: 0,
        inverted: true,
      };
    }
    if (this.state === HopliteState.SHELL_MOVING) {
      return {
        action: 'shell_spin',
        frameIndex: this.spinFrame,
        totalFrames: 4,
        widthPx: cfg.shellWidthPx,
        heightPx: cfg.shellHeightPx,
        shakeOffsetPx: 0,
        inverted: false,
      };
    }
    if (this.state === HopliteState.DORMANT_SHELL && this.retractAnimFramesRemaining > 0) {
      const idx = this.retractAnimFramesRemaining >= cfg.retractAnimFrames ? 0 : 1;
      return {
        action: 'retract',
        frameIndex: idx,
        totalFrames: 2,
        widthPx: cfg.shellWidthPx,
        heightPx: cfg.shellHeightPx,
        shakeOffsetPx: 0,
        inverted: false,
      };
    }
    if (this.state === HopliteState.DORMANT_SHELL && this.isTelegraphingWakeup) {
      return {
        action: 'wakeup_shake',
        frameIndex: this.wakeupFrame,
        totalFrames: 2,
        widthPx: cfg.shellWidthPx,
        heightPx: cfg.shellHeightPx,
        shakeOffsetPx: this.wakeupShakeOffsetPx,
        inverted: false,
      };
    }
    return {
      action: 'shell_idle',
      frameIndex: 0,
      totalFrames: 1,
      widthPx: cfg.shellWidthPx,
      heightPx: cfg.shellHeightPx,
      shakeOffsetPx: 0,
      inverted: false,
    };
  }

  update(dt, collision, platforms = [], levelKit = null) {
    if (!this.active) return { wallBounces: 0, bricksBroken: 0 };
    this.syncPrevPos();

    this._sweptMinX = this.pos.x;
    this._sweptMaxX = this.pos.x + this.width;
    this._sweptMinY = this.pos.y;
    this._sweptMaxY = this.pos.y + this.height;

    if (this.stompGraceTimer > 0) this.stompGraceTimer--;
    if (this.kickSafetyTimer > 0) this.kickSafetyTimer--;

    if (this.state === HopliteState.CARRIED) {
      return { wallBounces: 0, bricksBroken: 0 };
    }

    if (this.state === HopliteState.LAUNCH_DEATH) {
      this.launchDeathTimer--;
      this.vel.y -= MovementProfile.jump.gravityFalling * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.launchDeathTimer <= 0 || this.pos.y < -8) {
        this.destroy();
      }
      return { wallBounces: 0, bricksBroken: 0 };
    }

    const cfg = MovementProfile.enemyGallery.hoplite;
    const brickType = MovementProfile.tileTypes.BRICK_BLOCK;
    let wallBounces = 0;
    let bricksBroken = 0;

    if (this.state === HopliteState.DORMANT_SHELL) {
      this.vel.x = 0;
      if (this.retractAnimFramesRemaining > 0) {
        this.retractAnimFramesRemaining--;
      }
      this.dormancyFrames++;

      if (this.dormancyFrames >= cfg.dormancyFrames) {
        this.wakeUp(collision);
      } else if (this.dormancyFrames >= cfg.wakeupTelegraphFrame) {
        this.isTelegraphingWakeup = true;
        const phase = Math.floor((this.dormancyFrames - cfg.wakeupTelegraphFrame) / 2) % 2;
        this.wakeupFrame = phase;
        this.wakeupShakeOffsetPx = phase === 0 ? cfg.wakeupShakePx : -cfg.wakeupShakePx;
      } else {
        this.isTelegraphingWakeup = false;
        this.wakeupShakeOffsetPx = 0;
      }
    }

    if (this.state === HopliteState.WALK) {
      this.animFrameTimer += dt * 7; // 7 FPS 4-frame mechanical walk
      this.walkFrame = Math.floor(this.animFrameTimer) % 4;
      this.vel.x = this.dir * cfg.walkSpeed;

      if (this.turnAtLedges && this.grounded) {
        const probeX = this.dir > 0 ? this.pos.x + this.width + 0.06 : this.pos.x - 0.06;
        if (collision.groundClearance(probeX - 0.05, this.pos.y, 0.1, 0.25, platforms) > 0.2) {
          this.dir *= -1;
          this.facingRight = this.dir > 0;
          this.vel.x = this.dir * cfg.walkSpeed;
        }
      }
    } else if (this.state === HopliteState.SHELL_MOVING) {
      this.animFrameTimer += dt * 20; // 20 FPS fast 4-frame rolling spin
      this.spinFrame = Math.floor(this.animFrameTimer) % 4;
      this.vel.x = this.dir * cfg.shellSpeed;
    }

    const subSteps = this.state === HopliteState.SHELL_MOVING ? cfg.shellSubsteps : 1;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      const prevVy = this.vel.y;
      if (!this.grounded) {
        this.vel.y = Math.max(
          -MovementProfile.jump.terminalFallSpeed,
          this.vel.y - MovementProfile.jump.gravityFalling * subDt
        );
      }

      const speedX = this.vel.x;
      const stepVel = { x: speedX, y: this.grounded ? -0.5 : 0.5 * (prevVy + this.vel.y) };
      const res = collision.moveAndCollide(
        this.pos,
        stepVel,
        this.width,
        this.height,
        subDt,
        { wasGrounded: this.grounded, platforms }
      );

      this._sweptMinX = Math.min(this._sweptMinX, this.pos.x);
      this._sweptMaxX = Math.max(this._sweptMaxX, this.pos.x + this.width);
      this._sweptMinY = Math.min(this._sweptMinY, this.pos.y);
      this._sweptMaxY = Math.max(this._sweptMaxY, this.pos.y + this.height);

      if (res.wallLeft || res.wallRight) {
        // Stage 19 (Medallion 1 — Observation): Kicked Hoplite shell shatters BRICK_BLOCK barriers
        if (
          this.state === HopliteState.SHELL_MOVING &&
          MovementProfile.collectibles.shellBrickBreakEnabled &&
          levelKit &&
          collision?.tilemap
        ) {
          const hitCol = res.wallRight
            ? Math.floor(this.pos.x + this.width + 0.05)
            : Math.floor(this.pos.x - 0.05);
          const minRow = Math.floor(this.pos.y + 0.05);
          const maxRow = Math.floor(this.pos.y + this.height - 0.05);
          for (let r = minRow; r <= maxRow; r++) {
            if (collision.tilemap.get(hitCol, r) === brickType) {
              const outcome = levelKit.triggerBlockHit(hitCol, r, collision.tilemap, {
                fromShell: true,
              });
              if (outcome === 'shatter') {
                bricksBroken++;
                // Propagate impact shatter cleanly to an immediately stacked brick doorway block
                if (collision.tilemap.get(hitCol, r + 1) === brickType) {
                  const above = levelKit.triggerBlockHit(hitCol, r + 1, collision.tilemap, {
                    fromShell: true,
                  });
                  if (above === 'shatter') bricksBroken++;
                }
              }
            }
          }
        }

        this.dir = res.wallRight ? -1 : 1;
        this.facingRight = this.dir > 0;
        if (this.state === HopliteState.SHELL_MOVING) {
          // 100% elastic rebound maintaining exact |vx| === 12.00 tiles/s
          this.vel.x = this.dir * cfg.shellSpeed * cfg.wallBounceRestitution;
          this.bounceCount++;
          wallBounces++;
        } else if (this.state === HopliteState.WALK) {
          this.vel.x = this.dir * cfg.walkSpeed;
        }
      }

      this.grounded = res.grounded;
      if (res.grounded) this.vel.y = 0;
    }

    if (this.pos.y < -4) {
      this.destroy();
    }
    return { wallBounces, bricksBroken };
  }
}

export default {
  SproutlingState,
  HopliteState,
  SproutlingEnemy,
  HopliteEnemy,
};
