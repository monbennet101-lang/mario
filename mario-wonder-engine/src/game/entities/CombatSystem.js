/**
 * CombatSystem — Stage 9 Enemies, Projectiles, Stomp/Recoil & Score Popups
 * ===========================================================================
 * Deterministic 60 Hz management for:
 *   - GoombaEnemy (1.80 t/s patrol, top 20% stomp pancake to 15%, passive/active rebound)
 *   - KoopaEnemy (patrol -> retracted shell_idle -> 9.00 t/s wall-bouncing shell -> Carry & Throw)
 *   - SpinyEnemy (spiked shell hazard: Spin Twirl bounce, Fireball/Shell/Slide/Pound defeat)
 *   - FireballProjectile (14.0 t/s, g = 38.0 t/s², e = 0.85 bounce, wall sparks, max 2 active)
 *   - PowerUpItem spawning from [?] blocks + collection events
 *   - Floating score popups & Golden Comic Starburst ("Good!")
 */

import MovementProfile from '../config/MovementProfile.js';
import { Actions } from '../../engine/input/InputManager.js';
import { PlayerState } from '../player/PlayerState.js';
import Entity from './Entity.js';
import { PowerUpType, PowerUpForm, PowerUpItem } from '../powerups/PowerUp.js';
import {
  SproutlingEnemy,
  HopliteEnemy,
  SproutlingState,
  HopliteState,
} from './EnemyArchetypes.js';
import {
  createFloatingCombatText,
  stepFloatingCombatTexts,
} from '../../entities/collectibles.js';

export const EnemyKind = {
  GOOMBA: 'goomba',
  KOOPA: 'koopa',
  SPINY: 'spiny',
  SPROUTLING: 'sproutling',
  HOPLITE: 'hoplite',
};

export class FireballProjectile extends Entity {
  constructor(x, y, dir = 1) {
    const r = MovementProfile.fireball.radius;
    super(x - r, y - r, r * 2, r * 2, 'fireball');
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.vel.x = this.dir * MovementProfile.fireball.speed;
    this.vel.y = MovementProfile.fireball.initialVy;
    this.spinAngle = 0;
    this.bounceCount = 0;
    this.age = 0;
    this.preBounceVy = this.vel.y;
    this.lastBounceVy = 0;
  }

  update(dt, collision, platforms = []) {
    if (!this.active) return { hitWall: false, bounced: false };
    this.syncPrevPos();
    this.age += dt;
    this.spinAngle += this.dir * 16.0 * dt;

    const fbCfg = MovementProfile.fireball;
    const prevVy = this.vel.y;
    this.vel.y = Math.max(-24.0, this.vel.y - fbCfg.gravity * dt);
    this.vel.x = this.dir * fbCfg.speed;

    const stepVel = { x: this.vel.x, y: 0.5 * (prevVy + this.vel.y) };
    const res = collision.moveAndCollide(
      this.pos,
      stepVel,
      this.width,
      this.height,
      dt,
      { wasGrounded: false, platforms }
    );

    if (res.wallLeft || res.wallRight || res.hazardHit) {
      this.destroy();
      return { hitWall: true, bounced: false, x: this.centerX, y: this.centerY };
    }

    let bounced = false;
    if (res.grounded) {
      const impactSpeed = Math.abs(Math.min(prevVy, this.vel.y));
      this.preBounceVy = -impactSpeed;
      const bounceVy = Math.max(4.5, impactSpeed * fbCfg.bounceRestitution);
      this.vel.y = bounceVy;
      this.lastBounceVy = bounceVy;
      this.grounded = false;
      this.bounceCount++;
      bounced = true;
    } else if (res.ceilingHit) {
      this.vel.y = -Math.abs(this.vel.y) * 0.5;
    }

    if (this.pos.y < -4 || this.pos.x < -2 || this.pos.x > collision.tilemap.cols + 2) {
      this.destroy();
    }

    return { hitWall: false, bounced, x: this.centerX, y: this.centerY };
  }
}

export class GoombaEnemy extends Entity {
  constructor(x, y, dir = -1, options = {}) {
    const cfg = MovementProfile.enemies;
    super(x, y, cfg.goombaWidth, cfg.goombaHeight, EnemyKind.GOOMBA);
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.state = 'walk'; // 'walk' | 'squashed' | 'knockedOut'
    this.squashTimer = 0;
    this.knockoutTimer = 0;
    this.walkAnim = 0;
    this.turnAtLedges = Boolean(options.turnAtLedges);
    this.vel.x = this.dir * cfg.goombaSpeed;
  }

  get isThreat() {
    return this.active && this.state === 'walk';
  }

  get visualHeightScale() {
    return this.state === 'squashed' ? MovementProfile.enemies.goombaFlattenRatio : 1.0;
  }

  squash() {
    this.state = 'squashed';
    this.vel.x = 0;
    this.vel.y = 0;
    this.squashTimer = MovementProfile.enemies.goombaSquashFrames;
  }

  knockOut(awayDir = 1) {
    this.state = 'knockedOut';
    this.vel.x = (awayDir >= 0 ? 1 : -1) * 4.5;
    this.vel.y = 9.5;
    this.knockoutTimer = MovementProfile.enemies.knockoutFrames;
  }

  update(dt, collision, platforms = []) {
    if (!this.active) return;
    this.syncPrevPos();

    if (this.state === 'squashed') {
      this.squashTimer--;
      if (this.squashTimer <= 0) this.destroy();
      return;
    }

    if (this.state === 'knockedOut') {
      this.knockoutTimer--;
      this.vel.y -= MovementProfile.jump.gravityFalling * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.knockoutTimer <= 0 || this.pos.y < -6) this.destroy();
      return;
    }

    const speed = MovementProfile.enemies.goombaSpeed;
    this.walkAnim += dt * 10;
    this.vel.x = this.dir * speed;

    const prevVy = this.vel.y;
    if (!this.grounded) {
      this.vel.y = Math.max(
        -MovementProfile.jump.terminalFallSpeed,
        this.vel.y - MovementProfile.jump.gravityFalling * dt
      );
    }

    // Optional ledge turn-around check before moving off platform
    if (this.turnAtLedges && this.grounded) {
      const probeX = this.dir > 0 ? this.pos.x + this.width + 0.08 : this.pos.x - 0.08;
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

    if (res.wallLeft || res.wallRight) {
      this.dir = res.wallRight ? -1 : 1;
      this.facingRight = this.dir > 0;
      this.vel.x = this.dir * speed;
    }
    this.grounded = res.grounded;
    if (res.grounded) this.vel.y = 0;

    if (this.pos.y < -4) this.destroy();
  }
}

export class KoopaEnemy extends Entity {
  constructor(x, y, dir = -1, options = {}) {
    const cfg = MovementProfile.enemies;
    super(x, y, cfg.koopaWidth, cfg.koopaHeight, EnemyKind.KOOPA);
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.state = options.initialState || 'walk'; // 'walk' | 'shell_idle' | 'shell_moving' | 'carried' | 'knockedOut'
    if (this.state !== 'walk') {
      this.height = cfg.shellHeight;
    }
    this.turnAtLedges = Boolean(options.turnAtLedges);
    this.bounceCount = 0;
    this.comboCount = 0;
    this.stompGraceTimer = 0;
    this.kickSafetyTimer = 0;
    this.knockoutTimer = 0;
    this.spinAnim = 0;
    this.walkAnim = 0;
    this.vel.x = this.state === 'walk' ? this.dir * cfg.koopaSpeed : 0;
  }

  get isThreat() {
    if (!this.active) return false;
    if (this.state === 'walk') return true;
    if (this.state === 'shell_moving' && this.kickSafetyTimer <= 0) return true;
    return false;
  }

  get isShell() {
    return this.state === 'shell_idle' || this.state === 'shell_moving' || this.state === 'carried';
  }

  retractToShell() {
    this.state = 'shell_idle';
    this.height = MovementProfile.enemies.shellHeight;
    this.vel.x = 0;
    this.vel.y = 0;
    this.comboCount = 0;
    this.stompGraceTimer = MovementProfile.combat.shellStompGraceFrames;
  }

  kickShell(dir, speed = MovementProfile.enemies.koopashellSpeed) {
    this.state = 'shell_moving';
    this.height = MovementProfile.enemies.shellHeight;
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.vel.x = this.dir * speed;
    this.comboCount = 0;
    this.kickSafetyTimer = MovementProfile.combat.shellKickSafetyFrames;
  }

  startCarry() {
    this.state = 'carried';
    this.height = MovementProfile.enemies.shellHeight;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  knockOut(awayDir = 1) {
    this.state = 'knockedOut';
    this.vel.x = (awayDir >= 0 ? 1 : -1) * 4.5;
    this.vel.y = 9.5;
    this.knockoutTimer = MovementProfile.enemies.knockoutFrames;
  }

  update(dt, collision, platforms = []) {
    if (!this.active) return { wallBounces: 0 };
    this.syncPrevPos();

    if (this.stompGraceTimer > 0) this.stompGraceTimer--;
    if (this.kickSafetyTimer > 0) this.kickSafetyTimer--;

    if (this.state === 'carried') {
      return { wallBounces: 0 };
    }

    if (this.state === 'knockedOut') {
      this.knockoutTimer--;
      this.vel.y -= MovementProfile.jump.gravityFalling * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.knockoutTimer <= 0 || this.pos.y < -6) this.destroy();
      return { wallBounces: 0 };
    }

    const cfg = MovementProfile.enemies;
    let wallBounces = 0;

    if (this.state === 'walk') {
      this.walkAnim += dt * 8.5;
      this.vel.x = this.dir * cfg.koopaSpeed;
      if (this.turnAtLedges && this.grounded) {
        const probeX = this.dir > 0 ? this.pos.x + this.width + 0.08 : this.pos.x - 0.08;
        if (collision.groundClearance(probeX - 0.05, this.pos.y, 0.1, 0.25, platforms) > 0.2) {
          this.dir *= -1;
          this.facingRight = this.dir > 0;
          this.vel.x = this.dir * cfg.koopaSpeed;
        }
      }
    } else if (this.state === 'shell_idle') {
      this.vel.x = 0;
    } else if (this.state === 'shell_moving') {
      this.spinAnim += dt * 22 * this.dir;
      if (Math.abs(this.vel.x) < cfg.koopashellSpeed) {
        this.vel.x = this.dir * cfg.koopashellSpeed;
      }
    }

    // Sub-step moving shells (2 substeps) so 9.0–12.0 t/s never tunnels thin seams
    const subSteps = this.state === 'shell_moving' ? 2 : 1;
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

      if (res.wallLeft || res.wallRight) {
        this.dir = res.wallRight ? -1 : 1;
        this.facingRight = this.dir > 0;
        const speedAbs = Math.max(
          this.state === 'shell_moving' ? cfg.koopashellSpeed : cfg.koopaSpeed,
          Math.abs(speedX)
        );
        this.vel.x = this.dir * speedAbs;
        if (this.state === 'shell_moving') {
          this.bounceCount++;
          wallBounces++;
        }
      }

      this.grounded = res.grounded;
      if (res.grounded) this.vel.y = 0;
    }

    if (this.pos.y < -4) this.destroy();
    return { wallBounces };
  }
}

export class SpinyEnemy extends Entity {
  constructor(x, y, dir = -1) {
    const cfg = MovementProfile.enemies;
    super(x, y, cfg.goombaWidth, cfg.goombaHeight, EnemyKind.SPINY);
    this.dir = dir >= 0 ? 1 : -1;
    this.facingRight = this.dir > 0;
    this.state = 'walk'; // 'walk' | 'knockedOut'
    this.knockoutTimer = 0;
    this.walkAnim = 0;
    this.vel.x = this.dir * cfg.spinySpeed;
  }

  get isThreat() {
    return this.active && this.state === 'walk';
  }

  knockOut(awayDir = 1) {
    this.state = 'knockedOut';
    this.vel.x = (awayDir >= 0 ? 1 : -1) * 4.5;
    this.vel.y = 9.5;
    this.knockoutTimer = MovementProfile.enemies.knockoutFrames;
  }

  update(dt, collision, platforms = []) {
    if (!this.active) return;
    this.syncPrevPos();

    if (this.state === 'knockedOut') {
      this.knockoutTimer--;
      this.vel.y -= MovementProfile.jump.gravityFalling * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      if (this.knockoutTimer <= 0 || this.pos.y < -6) this.destroy();
      return;
    }

    this.walkAnim += dt * 9;
    this.vel.x = this.dir * MovementProfile.enemies.spinySpeed;
    const prevVy = this.vel.y;
    if (!this.grounded) {
      this.vel.y = Math.max(
        -MovementProfile.jump.terminalFallSpeed,
        this.vel.y - MovementProfile.jump.gravityFalling * dt
      );
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
    if (res.wallLeft || res.wallRight) {
      this.dir = res.wallRight ? -1 : 1;
      this.facingRight = this.dir > 0;
      this.vel.x = this.dir * MovementProfile.enemies.spinySpeed;
    }
    this.grounded = res.grounded;
    if (res.grounded) this.vel.y = 0;
    if (this.pos.y < -4) this.destroy();
  }
}

class CombatSystem {
  constructor() {
    this.enemies = [];
    this.powerUps = [];
    this.fireballs = [];
    this.popups = [];       // { text, x, y, age, maxAge, color, accent }
    this.starbursts = [];   // { x, y, text, age, maxAge }
    this.powerUpBlocks = new Map();
    this.events = [];

    this.score = 0;
    this.lives = 3;
    this.stompsCount = 0;
    this.fireballsThrown = 0;
    this.powerUpsCollected = 0;
    this.damageTakenCount = 0;
    this.stompCombo = 0;
  }

  loadRoom(room, resetScore = false) {
    this.enemies.length = 0;
    this.powerUps.length = 0;
    this.fireballs.length = 0;
    this.popups.length = 0;
    this.starbursts.length = 0;
    this.events.length = 0;
    this.powerUpBlocks.clear();
    this.stompCombo = 0;

    if (resetScore) {
      this.score = 0;
      this.lives = 3;
      this.stompsCount = 0;
      this.fireballsThrown = 0;
      this.powerUpsCollected = 0;
      this.damageTakenCount = 0;
    }

    if (!room) return;

    if (Array.isArray(room.powerUpBlocks)) {
      for (const blk of room.powerUpBlocks) {
        this.powerUpBlocks.set(`${blk.col},${blk.row}`, blk.item || 'adaptive_powerup');
      }
    }

    if (Array.isArray(room.enemies)) {
      for (const spec of room.enemies) {
        this.spawnEnemy(spec.kind || spec.type, spec.x, spec.y, spec.dir ?? -1, spec);
      }
    }
  }

  spawnEnemy(kind, x, y, dir = -1, options = {}) {
    let entity = null;
    if (kind === EnemyKind.GOOMBA) {
      entity = new GoombaEnemy(x, y, dir, options);
    } else if (kind === EnemyKind.KOOPA) {
      entity = new KoopaEnemy(x, y, dir, options);
    } else if (kind === EnemyKind.SPINY) {
      entity = new SpinyEnemy(x, y, dir);
    } else if (kind === EnemyKind.SPROUTLING) {
      entity = new SproutlingEnemy(x, y, dir, options);
    } else if (kind === EnemyKind.HOPLITE) {
      entity = new HopliteEnemy(x, y, dir, options);
    }
    if (entity) this.enemies.push(entity);
    return entity;
  }

  spawnPowerUp(powerUpType, x, y, dir = 1, emerge = true) {
    const item = new PowerUpItem(x, y, powerUpType, dir, emerge);
    this.powerUps.push(item);
    return item;
  }

  addScore(points, x = null, y = null, label = null, color = '#FEF08A') {
    if (points > 0) this.score += points;
    if (x !== null && y !== null) {
      this.spawnPopup(label || `+${points}`, x, y, color);
    }
  }

  spawnPopup(text, x, y, color = '#FEF08A') {
    if (this.popups.length >= 24) this.popups.shift();
    this.popups.push(createFloatingCombatText(text, x, y, color));
  }

  spawnStarburst(x, y, text = 'Good!') {
    this.starbursts.push({
      x,
      y,
      text,
      age: 0,
      maxAge: MovementProfile.powerups.goodStarburstDurationSec,
    });
  }

  /**
   * Advance only visual popups/starbursts during hitstop freeze.
   * Floating combat numerals rise exact 24px and fade over exact 20 frames.
   */
  updateVisualsOnly(dt) {
    stepFloatingCombatTexts(this.popups, dt);
    for (let i = this.starbursts.length - 1; i >= 0; i--) {
      const s = this.starbursts[i];
      s.age += dt;
      if (s.age >= s.maxAge) this.starbursts.splice(i, 1);
    }
  }

  consumeQuestionBlockLoot(col, row, player) {
    const key = `${col},${row}`;
    const loot = this.powerUpBlocks.get(key);
    if (!loot) return null;
    this.powerUpBlocks.delete(key);

    if (loot === 'adaptive_powerup') {
      return player.powerUpForm === PowerUpForm.SMALL
        ? PowerUpType.SUPER_MUSHROOM
        : PowerUpType.FIRE_FLOWER;
    }
    if (loot === PowerUpType.SUPER_MUSHROOM || loot === 'mushroom') {
      return PowerUpType.SUPER_MUSHROOM;
    }
    if (loot === PowerUpType.FIRE_FLOWER || loot === 'fire_flower') {
      return PowerUpType.FIRE_FLOWER;
    }
    return null;
  }

  update(player, input, collision, dt, platforms = [], levelKit = null) {
    this.events.length = 0;

    if (player.grounded) {
      this.stompCombo = 0;
    }

    // 1. LevelKit event rewards (Coins, Bricks) & Power-up block spawns
    if (levelKit?.events) {
      for (let i = 0; i < levelKit.events.length; i++) {
        const lev = levelKit.events[i];
        if (lev.type === 'coinCollect' || lev.type === 'questionBlockCoin') {
          this.addScore(MovementProfile.hud.scoreCoin, lev.x, lev.y + 0.4, '+100', '#FACC15');
        } else if (lev.type === 'brickBreak') {
          this.addScore(MovementProfile.hud.scoreBrick, lev.x, lev.y + 0.4, '+50', '#FDBA74');
        } else if (lev.type === 'questionBlockPowerUp') {
          const item = this.spawnPowerUp(lev.powerUpType, lev.col + 0.07, lev.row, player.facingRight ? 1 : -1, true);
          this.events.push({ type: 'powerUpSpawn', powerUpType: lev.powerUpType, x: item.centerX, y: item.centerY });
        }
      }
    }

    // 2. Player Fireball Throw Trigger (spawn event emitted after 3f windup by PlayerController)
    for (let i = 0; i < player.events.length; i++) {
      const pev = player.events[i];
      if (pev.type === 'fireballRelease') {
        if (this.fireballs.length < MovementProfile.fireball.maxActive) {
          const fb = new FireballProjectile(pev.x, pev.y, pev.dir);
          this.fireballs.push(fb);
          this.fireballsThrown++;
          this.events.push({ type: 'fireball', x: fb.centerX, y: fb.centerY, dir: fb.dir });
        }
      } else if (pev.type === 'shellThrow') {
        this.events.push({ type: 'hitstop', frames: MovementProfile.juice.hitstop.shellKickFrames, reason: 'shellThrow' });
        this.events.push({ type: 'shellKick', x: pev.x, y: pev.y, isThrow: true });
      }
    }

    // 3. Update Fireballs & Check Fireball vs Enemy Collisions
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      const fbRes = fb.update(dt, collision, platforms);
      if (fbRes.hitWall) {
        this.events.push({ type: 'fireballWallSpark', x: fbRes.x, y: fbRes.y });
      }
      if (!fb.active) {
        this.fireballs.splice(i, 1);
        continue;
      }

      const fbBox = fb.getAABB();
      for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
        const enemy = this.enemies[eIdx];
        if (
          !enemy.active ||
          enemy.isDefeated ||
          enemy.state === 'squashed' ||
          enemy.state === 'knockedOut' ||
          enemy.state === 'carried' ||
          enemy.state === HopliteState.CARRIED
        ) continue;
        if (enemy.overlapsAABB(fbBox)) {
          fb.destroy();
          if (typeof enemy.launchDeath === 'function') {
            enemy.launchDeath(fb.dir);
          } else {
            enemy.knockOut(fb.dir);
          }
          this.addScore(MovementProfile.hud.scoreFireballKill, enemy.centerX, enemy.pos.y + enemy.height + 0.2, '+200', '#FB923C');
          this.events.push({ type: 'fireballHitEnemy', x: enemy.centerX, y: enemy.centerY });
          break;
        }
      }
      if (!fb.active) {
        this.fireballs.splice(i, 1);
      }
    }

    // 4. Update PowerUp Items & Check Collection
    const playerBox = {
      x: player.pos.x,
      y: player.pos.y,
      width: player.currentWidth,
      height: player.currentHeight,
    };

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const item = this.powerUps[i];
      item.update(dt, collision, platforms);
      if (!item.active) {
        this.powerUps.splice(i, 1);
        continue;
      }
      if (!item.emerging && player.state !== PlayerState.DEFEAT && item.overlapsAABB(playerBox)) {
        this._collectPowerUp(player, item);
        this.powerUps.splice(i, 1);
      }
    }

    // 5. Update Carried Shell Position & Check Carried Shell vs Enemy Collision
    if (player.carriedEntity) {
      const carried = player.carriedEntity;
      const isCarriedState =
        carried.state === 'carried' || carried.state === HopliteState.CARRIED;
      if (!carried.active || !isCarriedState) {
        player.carriedEntity = null;
      } else {
        const dir = player.facingRight ? 1 : -1;
        const hand = player.hands;
        carried.syncPrevPos();
        carried.pos.x = hand.x - carried.width * 0.5;
        carried.pos.y = hand.y;
        carried.dir = dir;
        carried.facingRight = player.facingRight;

        // Release Run -> throw shell forward!
        if (!input?.held(Actions.RUN)) {
          player.throwCarriedShell();
        }
      }
    }

    // 6. Update Enemies & Resolve Shell vs Enemy, Player vs Enemy
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const eRes = enemy.update(dt, collision, platforms, levelKit);
      if (!enemy.active) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (eRes?.bricksBroken > 0) {
        this.addScore(
          MovementProfile.hud.scoreBrick * eRes.bricksBroken,
          enemy.centerX,
          enemy.pos.y + enemy.height + 0.35,
          `+${MovementProfile.hud.scoreBrick * eRes.bricksBroken}`,
          '#FDBA74'
        );
        this.events.push({
          type: 'shellBrickBreak',
          x: enemy.centerX,
          y: enemy.centerY,
          count: eRes.bricksBroken,
        });
      }
      if (eRes?.wallBounces > 0) {
        if (enemy.type === EnemyKind.KOOPA) {
          this.events.push({ type: 'shellRicochet', x: enemy.centerX, y: enemy.centerY, bounces: enemy.bounceCount });
        } else if (enemy.type === EnemyKind.HOPLITE) {
          this.events.push({
            type: 'hopliteWallBounce',
            x: enemy.centerX,
            y: enemy.centerY,
            dir: enemy.dir,
            bounces: enemy.bounceCount,
          });
        }
      }
    }

    // Moving Shell vs Other Enemies (Koopa & Hoplite Swept Carve-Through)
    for (let i = 0; i < this.enemies.length; i++) {
      const shell = this.enemies[i];
      if (!shell.active) continue;
      const isKoopaShell =
        shell.type === EnemyKind.KOOPA &&
        (shell.state === 'shell_moving' || shell.state === 'carried');
      const isHopliteShell =
        shell.type === EnemyKind.HOPLITE &&
        (shell.state === HopliteState.SHELL_MOVING || shell.state === HopliteState.CARRIED);
      if (!isKoopaShell && !isHopliteShell) continue;

      const sBox = isHopliteShell && typeof shell.getSweptAABB === 'function'
        ? shell.getSweptAABB()
        : shell.getAABB();

      const targets = [];
      for (let j = 0; j < this.enemies.length; j++) {
        if (i === j) continue;
        const target = this.enemies[j];
        if (
          !target.active ||
          target.isDefeated ||
          target.state === 'squashed' ||
          target.state === 'knockedOut' ||
          target.state === 'carried' ||
          target.state === HopliteState.CARRIED
        ) continue;
        if (target.overlapsAABB(sBox)) {
          targets.push(target);
        }
      }

      if (targets.length > 1) {
        targets.sort((a, b) => (shell.dir > 0 ? a.pos.x - b.pos.x : b.pos.x - a.pos.x));
      }

      for (let tIdx = 0; tIdx < targets.length; tIdx++) {
        const target = targets[tIdx];
        if (typeof target.launchDeath === 'function') {
          target.launchDeath(shell.dir);
        } else {
          target.knockOut(shell.dir);
        }

        if (isHopliteShell) {
          const hCfg = MovementProfile.enemyGallery.hoplite;
          const idx = shell.comboCount;
          const hitNum = idx + 1;
          shell.comboCount++;
          if (hitNum < hCfg.multiKillOneUpThreshold) {
            const pts = hCfg.multiKillScores[Math.min(idx, hCfg.multiKillScores.length - 1)];
            shell.scoreChainLog.push(pts);
            this.addScore(pts, target.centerX, target.pos.y + target.height + 0.3, `+${pts}`, '#FDE047');
            this.events.push({ type: 'shellHitEnemy', x: target.centerX, y: target.centerY, combo: shell.comboCount, points: pts, oneUp: false });
          } else if (hitNum === hCfg.multiKillOneUpThreshold) {
            const pts = hCfg.multiKillScores[Math.min(idx, hCfg.multiKillScores.length - 1)];
            shell.oneUpAwarded = true;
            shell.scoreChainLog.push(pts, '1-UP');
            this.score += pts;
            this.lives++;
            this.spawnPopup('1-UP!', target.centerX, target.pos.y + target.height + 0.35, '#4ADE80');
            this.events.push({ type: 'shellHitEnemy', x: target.centerX, y: target.centerY, combo: shell.comboCount, points: pts, oneUp: true });
          } else {
            shell.oneUpAwarded = true;
            shell.scoreChainLog.push('1-UP');
            this.lives++;
            this.spawnPopup('1-UP!', target.centerX, target.pos.y + target.height + 0.35, '#4ADE80');
            this.events.push({ type: 'shellHitEnemy', x: target.centerX, y: target.centerY, combo: shell.comboCount, points: 0, oneUp: true });
          }

          if (shell.state === HopliteState.CARRIED) {
            player.carriedEntity = null;
            shell.launchDeath(-shell.dir);
            break;
          }
        } else {
          const ladder = MovementProfile.hud.scoreShellCombo;
          const idx = Math.min(shell.comboCount, ladder.length - 1);
          const pts = ladder[idx];
          const isOneUp = shell.comboCount >= ladder.length;
          shell.comboCount++;
          if (isOneUp) {
            this.lives++;
            this.spawnPopup('1-UP!', target.centerX, target.pos.y + target.height + 0.3, '#4ADE80');
          } else {
            this.addScore(pts, target.centerX, target.pos.y + target.height + 0.3, `+${pts}`, '#FDE047');
          }
          this.events.push({ type: 'shellHitEnemy', x: target.centerX, y: target.centerY, combo: shell.comboCount, oneUp: isOneUp });

          // Carried shell drops & knocks both out cleanly on head-on shield impact
          if (shell.state === 'carried') {
            player.carriedEntity = null;
            shell.knockOut(-shell.dir);
            break;
          }
        }
      }
    }

    // Player vs Enemies Resolution (Stomp / Spin / Slide / GroundPound / Shell Pickup / Damage)
    if (player.state !== PlayerState.DEFEAT && !player.isVictory) {
      const pBox = {
        x: player.pos.x,
        y: player.pos.y,
        width: player.currentWidth,
        height: player.currentHeight,
      };
      const jumpHeld = Boolean(input?.held(Actions.JUMP));
      const runHeld = Boolean(input?.held(Actions.RUN));

      for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i];
        if (
          !enemy.active ||
          enemy.isDefeated ||
          enemy.state === 'squashed' ||
          enemy.state === 'knockedOut' ||
          enemy.state === 'carried' ||
          enemy.state === HopliteState.CARRIED
        ) {
          continue;
        }
        if ((enemy.type === EnemyKind.KOOPA || enemy.type === EnemyKind.HOPLITE) && enemy.stompGraceTimer > 0 && player.vel.y > 0) {
          continue;
        }
        if (!enemy.overlapsAABB(pBox)) continue;

        this._resolvePlayerEnemyContact(player, enemy, jumpHeld, runHeld);
        if (player.state === PlayerState.DEFEAT || player.damageRecoilTimer > 0) {
          break;
        }
      }
    }

    // 7. Update Visual Popups & Comic Starbursts
    this.updateVisualsOnly(dt);

    // Prune inactive enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].active) this.enemies.splice(i, 1);
    }
  }

  _collectPowerUp(player, item) {
    this.powerUpsCollected++;
    const isMushroom = item.powerUpType === PowerUpType.SUPER_MUSHROOM;
    const prevForm = player.powerUpForm;

    player.applyPowerUp(item.powerUpType);

    if (isMushroom) {
      this.addScore(MovementProfile.hud.scoreMushroom, player.centerX, player.pos.y + player.currentHeight + 0.35, '+1000', '#FACC15');
      if (prevForm === PowerUpForm.SMALL) {
        this.spawnStarburst(player.centerX, player.centerY + 0.3, 'Good!');
        this.events.push({
          type: 'hitstop',
          frames: MovementProfile.powerups.mushroomHitstopFrames,
          reason: 'mushroom',
        });
      }
      this.events.push({ type: 'powerUp', powerUpType: PowerUpType.SUPER_MUSHROOM, x: player.centerX, y: player.centerY });
    } else {
      this.addScore(MovementProfile.hud.scoreFireFlower, player.centerX, player.pos.y + player.currentHeight + 0.35, '+1000', '#FB923C');
      this.spawnStarburst(player.centerX, player.centerY + 0.3, 'Fire!');
      this.events.push({
        type: 'hitstop',
        frames: MovementProfile.powerups.fireUpgradeHitstopFrames,
        reason: 'fire_flower',
      });
      this.events.push({ type: 'powerUp', powerUpType: PowerUpType.FIRE_FLOWER, x: player.centerX, y: player.centerY });
    }
  }

  _resolvePlayerEnemyContact(player, enemy, jumpHeld, runHeld) {
    // 0. Original Enemy Gallery 1: Sproutling & Hoplite Interaction Matrix
    if (enemy.type === EnemyKind.SPROUTLING || enemy.type === EnemyKind.HOPLITE) {
      this._resolveGalleryEnemyContact(player, enemy, jumpHeld, runHeld);
      return;
    }

    // 1. Stationary Koopa Shell -> Carry (Run held) or Kick (No Run / Stomp)
    if (enemy.type === EnemyKind.KOOPA && enemy.state === 'shell_idle') {
      if (enemy.stompGraceTimer > 0 && !runHeld) return;

      const stompZoneBottom = enemy.pos.y + enemy.height * (1 - MovementProfile.combat.stompZonePercent);
      const isFromAbove =
        player.vel.y <= 0 &&
        (player.pos.y >= stompZoneBottom - 0.12 || player.prevPos.y >= stompZoneBottom - 0.16);

      if (runHeld && !player.carriedEntity && !player.isCrouched && !isFromAbove) {
        enemy.startCarry();
        player.carriedEntity = enemy;
        this.events.push({ type: 'shellPickup', x: enemy.centerX, y: enemy.centerY });
        return;
      }

      const kickDir = enemy.centerX >= player.centerX ? 1 : -1;
      enemy.kickShell(kickDir, MovementProfile.enemies.koopashellSpeed);
      if (isFromAbove) {
        player.applyStompRebound(jumpHeld, enemy.pos.y + enemy.height);
      }
      this.events.push({ type: 'hitstop', frames: MovementProfile.juice.hitstop.shellKickFrames, reason: 'shellKick' });
      this.addScore(MovementProfile.hud.scoreStompBase, enemy.centerX, enemy.pos.y + enemy.height + 0.25, '+100', '#FEF08A');
      this.events.push({ type: 'shellKick', x: enemy.centerX, y: enemy.centerY });
      return;
    }

    // 2. Lethal Ground Pound / Butt-Slide / Spin Twirl Override
    if (
      player.groundPoundPhase === 'fall' ||
      player.isSlideLethal
    ) {
      enemy.knockOut(player.vel.x !== 0 ? Math.sign(player.vel.x) : (player.facingRight ? 1 : -1));
      this.stompsCount++;
      this.addScore(200, enemy.centerX, enemy.pos.y + enemy.height + 0.3, '+200', '#4ADE80');
      this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'bulldoze' });
      this.events.push({ type: 'stomp', x: enemy.centerX, y: enemy.centerY, combo: 1 });
      return;
    }

    // 3. Top 20% Stomp Detection
    const stompZoneBottom = enemy.pos.y + enemy.height * (1 - MovementProfile.combat.stompZonePercent);
    const feetAtStomp =
      player.pos.y >= stompZoneBottom - 0.05 ||
      (player.prevPos.y >= stompZoneBottom - 0.15 && player.vel.y <= 0.6);

    const isDescendingOrStomping =
      !player.grounded &&
      (player.vel.y <= 0.6 || player.prevPos.y > player.pos.y || player.isSpinningCombat);

    if (feetAtStomp && isDescendingOrStomping) {
      // Spiny hurts normal stomps, but Spin Twirl safely bounces off Spiny!
      if (enemy.type === EnemyKind.SPINY) {
        if (player.isSpinningCombat) {
          player.applyStompRebound(jumpHeld, enemy.pos.y + enemy.height);
          this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'spinBounce' });
          this.events.push({ type: 'stomp', x: enemy.centerX, y: enemy.pos.y + enemy.height, combo: 1, spinDeflect: true });
          return;
        }
        // Normal stomp on Spiny damages Mario
        this._applyDamage(player, enemy);
        return;
      }

      if (enemy.type === EnemyKind.GOOMBA) {
        enemy.squash();
      } else if (enemy.type === EnemyKind.KOOPA) {
        if (enemy.state === 'walk' || enemy.state === 'shell_moving') {
          enemy.retractToShell();
        }
      }

      player.applyStompRebound(jumpHeld, enemy.pos.y + enemy.height);
      this.stompsCount++;
      const ladder = MovementProfile.hud.scoreComboLadder;
      const pts = ladder[Math.min(this.stompCombo, ladder.length - 1)];
      this.stompCombo++;
      this.addScore(pts, enemy.centerX, enemy.pos.y + enemy.height + 0.25, `+${pts}`, '#FEF08A');
      this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'stomp' });
      this.events.push({ type: 'stomp', x: enemy.centerX, y: enemy.pos.y + enemy.height, combo: this.stompCombo });
      return;
    }

    // 4. Spin Twirl side brush on Goomba/Koopa knocks them out cleanly
    if (player.isSpinningCombat && enemy.type !== EnemyKind.SPINY) {
      const away = enemy.centerX >= player.centerX ? 1 : -1;
      enemy.knockOut(away);
      this.stompsCount++;
      this.addScore(200, enemy.centerX, enemy.pos.y + enemy.height + 0.25, '+200', '#38BDF8');
      this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'spin' });
      this.events.push({ type: 'stomp', x: enemy.centerX, y: enemy.centerY, combo: 1 });
      return;
    }

    // 5. Otherwise: Side/Under Enemy Contact -> Damage!
    if (enemy.isThreat) {
      this._applyDamage(player, enemy);
    }
  }

  _resolveGalleryEnemyContact(player, enemy, jumpHeld, runHeld) {
    const sCfg = MovementProfile.enemyGallery.sproutling;
    const hCfg = MovementProfile.enemyGallery.hoplite;
    const stompMargin = enemy.type === EnemyKind.SPROUTLING ? sCfg.stompMarginTiles : hCfg.stompMarginTiles;
    const enemyTop = enemy.pos.y + enemy.height;

    // Stomp from Above: player.vel.y < 0 (or airborne descending) AND player.bottom >= enemy.top - 8px
    const isDescending =
      player.vel.y < 0 ||
      (!player.grounded && player.vel.y <= 0 && player.prevPos.y > player.pos.y);
    const feetAboveBand =
      player.pos.y >= enemyTop - stompMargin ||
      player.prevPos.y >= enemyTop - stompMargin;
    const isStompFromAbove = isDescending && feetAboveBand;

    // 1. Dormant Hoplite Shell -> Carry (RUN held) or Kick at 12.00 t/s in player facing direction
    if (enemy.type === EnemyKind.HOPLITE && enemy.state === HopliteState.DORMANT_SHELL) {
      if (enemy.stompGraceTimer > 0 && !runHeld) return;

      if (runHeld && !player.carriedEntity && !player.isCrouched && !isStompFromAbove) {
        enemy.startCarry();
        player.carriedEntity = enemy;
        this.events.push({ type: 'shellPickup', x: enemy.centerX, y: enemy.centerY });
        return;
      }

      const kickDir = player.facingRight ? 1 : -1;
      enemy.kickShell(kickDir, hCfg.shellSpeed);
      if (isStompFromAbove) {
        player.applyStompRebound(jumpHeld, enemyTop, {
          passiveVy: hCfg.reboundPassiveVy,
          activeVy: hCfg.reboundActiveVy,
        });
      }
      this.events.push({ type: 'hitstop', frames: MovementProfile.juice.hitstop.shellKickFrames, reason: 'shellKick' });
      this.addScore(hCfg.kickScore, enemy.centerX, enemyTop + 0.25, `+${hCfg.kickScore}`, '#FEF08A');
      this.events.push({ type: 'shellKick', x: enemy.centerX, y: enemy.centerY, dir: kickDir });
      return;
    }

    // 2. Lethal Ground Pound / Butt-Slide Bulldoze
    if (player.groundPoundPhase === 'fall' || player.isSlideLethal) {
      const dir = player.vel.x !== 0 ? Math.sign(player.vel.x) : (player.facingRight ? 1 : -1);
      enemy.launchDeath(dir);
      this.stompsCount++;
      this.addScore(200, enemy.centerX, enemyTop + 0.3, '+200', '#4ADE80');
      this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'bulldoze' });
      this.events.push({ type: 'stomp', x: enemy.centerX, y: enemy.centerY, combo: 1 });
      return;
    }

    // 3. Stomp from Above (Sproutling SQUASHED / Hoplite Retract or Halt Moving Shell)
    if (isStompFromAbove) {
      if (enemy.type === EnemyKind.SPROUTLING) {
        enemy.squash();
        player.applyStompRebound(jumpHeld, enemyTop, {
          passiveVy: sCfg.reboundPassiveVy,
          activeVy: sCfg.reboundActiveVy,
        });
        this.stompsCount++;
        this.stompCombo++;
        this.addScore(sCfg.stompScore, enemy.centerX, enemyTop + 0.25, `+${sCfg.stompScore}`, '#FEF08A');
        this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'stomp' });
        this.events.push({ type: 'stomp', x: enemy.centerX, y: enemyTop, combo: this.stompCombo });
        return;
      }

      if (enemy.type === EnemyKind.HOPLITE) {
        if (enemy.state === HopliteState.WALK) {
          enemy.retractToShell();
        } else if (enemy.state === HopliteState.SHELL_MOVING) {
          enemy.haltToDormant();
        }
        player.applyStompRebound(jumpHeld, enemyTop, {
          passiveVy: hCfg.reboundPassiveVy,
          activeVy: hCfg.reboundActiveVy,
        });
        this.stompsCount++;
        this.stompCombo++;
        this.addScore(hCfg.stompScore, enemy.centerX, enemyTop + 0.25, `+${hCfg.stompScore}`, '#FEF08A');
        this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'stomp' });
        this.events.push({ type: 'stomp', x: enemy.centerX, y: enemyTop, combo: this.stompCombo });
        return;
      }
    }

    // 4. Spin Twirl side brush
    if (player.isSpinningCombat) {
      const away = enemy.centerX >= player.centerX ? 1 : -1;
      enemy.launchDeath(away);
      this.stompsCount++;
      this.addScore(200, enemy.centerX, enemyTop + 0.25, '+200', '#38BDF8');
      this.events.push({ type: 'hitstop', frames: MovementProfile.combat.stompHitstopFrames, reason: 'spin' });
      this.events.push({ type: 'stomp', x: enemy.centerX, y: enemy.centerY, combo: 1 });
      return;
    }

    // 5. Side / Underbody Contact -> 1 Damage Point (Recoil + Invulnerability Frames)
    if (enemy.isThreat) {
      this._applyDamage(player, enemy);
    }
  }

  _applyDamage(player, enemy) {
    if (player.invulnerabilityTimer > 0 || player.state === PlayerState.DEFEAT) return;

    this.damageTakenCount++;
    this.stompCombo = 0;

    if (player.carriedEntity) {
      if (player.carriedEntity.type === EnemyKind.HOPLITE && typeof player.carriedEntity.haltToDormant === 'function') {
        player.carriedEntity.haltToDormant();
      } else {
        player.carriedEntity.state = 'shell_idle';
      }
      player.carriedEntity = null;
    }

    const prevForm = player.powerUpForm;
    const outcome = player.takeDamage(enemy.centerX);

    this.events.push({
      type: 'hitstop',
      frames: MovementProfile.combat.damageHitstopFrames,
      reason: 'damage',
    });
    this.events.push({
      type: 'damage',
      prevForm,
      nextForm: player.powerUpForm,
      defeated: outcome === 'defeat',
      x: player.centerX,
      y: player.centerY,
    });
  }
}

export default CombatSystem;
