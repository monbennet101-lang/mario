/**
 * PowerUp — Super Mushroom & Fire Flower Entities & Form Progression
 * =====================================================================
 * Stage 9:
 *   - PowerUpForm progression: Small -> Super -> Fire
 *   - Super Mushroom: Emerges from bumped [?] block, moves horizontally at 2.50 tiles/s,
 *     reverses cleanly on solid walls, and follows swept gravity.
 *   - Fire Flower: Emerges atop bumped [?] block, pulses warmly awaiting collection.
 */

import MovementProfile from '../config/MovementProfile.js';
import Entity from '../entities/Entity.js';

export const PowerUpType = {
  NONE: 'none',
  SUPER_MUSHROOM: 'super_mushroom',
  FIRE_FLOWER: 'fire_flower',
};

export const PowerUpForm = {
  SMALL: 'small',
  SUPER: 'super',
  FIRE: 'fire',
};

export class PowerUpItem extends Entity {
  constructor(x, y, powerUpType = PowerUpType.SUPER_MUSHROOM, dir = 1, emerge = true) {
    const size = MovementProfile.enemies.itemSize;
    super(x, y, size, size, powerUpType);
    this.powerUpType = powerUpType;
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.emerging = emerge;
    this.emergeStartY = y;
    this.emergeTargetY = y + 1.0;
    this.emergeFrame = 0;
    this.emergeTotalFrames = MovementProfile.powerups.emergeFrames;
    this.age = 0;

    if (!emerge && powerUpType === PowerUpType.SUPER_MUSHROOM) {
      this.vel.x = this.dir * MovementProfile.enemies.mushroomSpeed;
    }
  }

  update(dt, collision, platforms = []) {
    if (!this.active) return;
    this.syncPrevPos();
    this.age += dt;

    if (this.emerging) {
      this.emergeFrame++;
      const t = Math.min(1, this.emergeFrame / Math.max(1, this.emergeTotalFrames));
      this.pos.y = this.emergeStartY + (this.emergeTargetY - this.emergeStartY) * t;
      if (this.emergeFrame >= this.emergeTotalFrames) {
        this.emerging = false;
        this.pos.y = this.emergeTargetY;
        if (this.powerUpType === PowerUpType.SUPER_MUSHROOM) {
          this.vel.x = this.dir * MovementProfile.enemies.mushroomSpeed;
        }
      }
      return;
    }

    if (this.powerUpType === PowerUpType.FIRE_FLOWER) {
      // Gently settles onto block top via gravity if block shattered below
      const prevVy = this.vel.y;
      this.vel.y = Math.max(
        -MovementProfile.jump.terminalFallSpeed,
        this.vel.y - MovementProfile.jump.gravityFalling * dt
      );
      const stepVel = { x: 0, y: 0.5 * (prevVy + this.vel.y) };
      const res = collision.moveAndCollide(
        this.pos,
        stepVel,
        this.width,
        this.height,
        dt,
        { wasGrounded: this.grounded, platforms }
      );
      this.grounded = res.grounded;
      if (res.grounded) this.vel.y = 0;
      return;
    }

    // Super Mushroom horizontal drift (2.50 tiles/s) + solid wall reversal + swept gravity
    const speed = MovementProfile.enemies.mushroomSpeed;
    const prevDir = this.dir;
    this.vel.x = prevDir * speed;
    const prevVy = this.vel.y;
    if (!this.grounded) {
      this.vel.y = Math.max(
        -MovementProfile.jump.terminalFallSpeed,
        this.vel.y - MovementProfile.jump.gravityFalling * dt
      );
    }

    const stepVel = {
      x: this.vel.x,
      y: this.grounded ? -0.5 : 0.5 * (prevVy + this.vel.y),
    };

    const res = collision.moveAndCollide(
      this.pos,
      stepVel,
      this.width,
      this.height,
      dt,
      { wasGrounded: this.grounded, platforms }
    );

    if (res.wallLeft || res.wallRight) {
      this.dir = res.wallRight ? -1 : 1;
      this.facingRight = this.dir > 0;
      this.vel.x = this.dir * speed;
    }

    this.grounded = res.grounded;
    if (res.grounded) {
      this.vel.y = 0;
    }

    if (this.pos.y < -4) {
      this.destroy();
    }
  }
}

class PowerUp {
  constructor(type) {
    this.type = type;
    this.active = false;
  }

  apply(player) {
    if (this.type === PowerUpType.SUPER_MUSHROOM) {
      player.applyPowerUp(PowerUpType.SUPER_MUSHROOM);
    } else if (this.type === PowerUpType.FIRE_FLOWER) {
      player.applyPowerUp(PowerUpType.FIRE_FLOWER);
    }
    this.active = true;
  }

  remove(player) {
    player.powerUpForm = PowerUpForm.SMALL;
    this.active = false;
  }
}

export default PowerUp;
