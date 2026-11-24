/**
 * Stage 21: Multi-Phase Boss Encounter — "The Dread-Shell Golem" (`src/entities/boss.js`)
 * ========================================================================================
 * Kishōtenketsu Capstone Boss Arena & 3-Phase Deterministic State Machine:
 *
 *   Arena:
 *     - Enclosed 20-tile wide stone chamber (interior x = 2..22, floor y = 3, initial ceiling y = 14)
 *     - Closed mechanical blast doors on left (x = 1) and right (x = 22)
 *     - Upper wall-jump alcoves at y = 7 (left x = 2..4, right x = 19..21) for Phase 2 Spin Dash evasion
 *     - World Exit Portal at right chamber wall (unlocks when Strike 3 shatters the Golem)
 *
 *   Phase 1 (The Patrol & Slam — HP 3):
 *     - Patrols -> leaps into air -> hovers exact 20 frames -> slams down onto chamber floor
 *     - Slam fires +0.8 trauma and room-wide bilateral ground shockwaves (dodgeable by jumping)
 *     - Vulnerability window: drops a dormant Hoplite shell into the arena & exposes glowing power core
 *     - Kicked/thrown Hoplite shell impacting exposed core deals Strike 1 -> Phase 2
 *
 *   Phase 2 (Enraged Spin Dash — HP 2):
 *     - Carapace glows warning crimson; Golem retracts into spiked boulder
 *     - Rolls back and forth across the 20-tile chamber at exact 14.0 tiles/s (4 wall rebounds)
 *     - Player wall-jumps to upper alcove to evade until Steam Exhaust Cooldown
 *     - Steam cooldown drops a dormant Hoplite shell & exposes core -> Strike 2 -> Phase 3
 *
 *   Phase 3 (Overdrive Climax — HP 1):
 *     - Arena ceiling drops by exact 2 tiles (y = 14 -> y = 12) in TileMap with heavy trauma
 *     - Alternates 20f hover slams (with twin-shell spawns!) and bursts
 *     - Strike 3 shatters Golem into harmless geometric debris, unlocks World Exit Portal,
 *       opens the right blast door, and plays victory fanfare.
 */

import MovementProfile from '../game/config/MovementProfile.js';
import TileMap from '../engine/physics/TileMap.js';
import Entity from '../game/entities/Entity.js';
import { HopliteEnemy, HopliteState } from '../game/entities/EnemyArchetypes.js';

const { tileTypes } = MovementProfile;

export const BossPhase = {
  PHASE_1_SLAM: 1,
  PHASE_2_SPIN_DASH: 2,
  PHASE_3_OVERDRIVE: 3,
  DEFEATED: 4,
};

export const BossState = {
  PATROL: 'PATROL',
  LEAP: 'LEAP',
  HOVER: 'HOVER',
  SLAM_FALL: 'SLAM_FALL',
  VULNERABLE: 'VULNERABLE',
  SPIN_WINDUP: 'SPIN_WINDUP',
  SPIN_DASH: 'SPIN_DASH',
  STEAM_COOLDOWN: 'STEAM_COOLDOWN',
  HIT_STUN: 'HIT_STUN',
  SHATTERED: 'SHATTERED',
};

function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Room-wide ground shockwave hazard emitted on Golem Slam impact.
 * Low height (0.72t) so players can cleanly jump over it across the 20-tile stone chamber.
 */
export class BossShockwave {
  constructor(x, y, dir, arenaLeftX, arenaRightX) {
    const cfg = MovementProfile.boss;
    this.x = x;
    this.y = y;
    this.dir = dir >= 0 ? 1 : -1;
    this.width = cfg.shockwaveWidth;
    this.height = cfg.shockwaveHeight;
    this.vx = this.dir * cfg.shockwaveSpeed;
    this.arenaLeftX = arenaLeftX;
    this.arenaRightX = arenaRightX;
    this.active = true;
    this.age = 0;
  }

  update(dt) {
    if (!this.active) return;
    this.age += dt;
    this.x += this.vx * dt;
    if (this.x + this.width < this.arenaLeftX - 0.1 || this.x > this.arenaRightX + 0.1) {
      this.active = false;
    }
  }
}

/**
 * Harmless geometric debris shard emitted when Strike 3 shatters the Dread-Shell Golem.
 */
export class BossDebrisShard {
  constructor(x, y, vx, vy, size, color, rimColor, sides = 4) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.angle = 0;
    this.angularVel = (vx >= 0 ? 1 : -1) * (4.5 + (size * 18));
    this.color = color;
    this.rimColor = rimColor;
    this.sides = sides;
    this.harmless = true;
    this.active = true;
    this.life = 0;
    this.maxLife = 3.2;
  }

  update(dt, floorY, arenaLeftX, arenaRightX) {
    if (!this.active) return;
    this.life += dt;
    if (this.life >= this.maxLife) {
      this.active = false;
      return;
    }
    this.vy -= 36.0 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angularVel * dt;

    if (this.y < floorY + this.size * 0.5) {
      this.y = floorY + this.size * 0.5;
      this.vy = Math.abs(this.vy) * 0.42;
      this.vx *= 0.84;
      if (Math.abs(this.vy) < 0.8) this.vy = 0;
    }
    if (this.x < arenaLeftX + 0.2) {
      this.x = arenaLeftX + 0.2;
      this.vx = Math.abs(this.vx) * 0.65;
    } else if (this.x > arenaRightX - 0.2) {
      this.x = arenaRightX - 0.2;
      this.vx = -Math.abs(this.vx) * 0.65;
    }
  }
}

/**
 * DreadShellGolem — 3-Phase Boss Kinematic Entity
 */
export class DreadShellGolem extends Entity {
  constructor(x, y) {
    const cfg = MovementProfile.boss;
    super(x, y, cfg.width, cfg.height, 'boss');
    this.hp = cfg.maxHp;
    this.maxHp = cfg.maxHp;
    this.phase = BossPhase.PHASE_1_SLAM;
    this.state = BossState.PATROL;
    this.dir = -1;
    this.facingRight = false;

    this.stateTimer = cfg.patrolFramesPhase1;
    this.hoverFramesElapsed = 0;
    this.spinBouncesRemaining = 0;
    this.spinAngle = 0;
    this.coreExposed = false;
    this.carapaceGlow = 'none'; // 'none' | 'amber' | 'crimson' | 'overdrive'
    this.isSpikedBoulder = false;
    this.steamTimer = 0;
    this.hitFlashFrames = 0;
    this.overdriveCycleIndex = 0;
    this.invulnerableFrames = 0;
    this.shellsDroppedTotal = 0;
    this.ceilingDropped = false;
    this.defeated = false;
    this.grounded = true;
  }

  get isThreat() {
    return this.active && !this.defeated && this.state !== BossState.SHATTERED;
  }

  get isVulnerableToShell() {
    return (
      this.active &&
      !this.defeated &&
      this.coreExposed &&
      this.invulnerableFrames <= 0 &&
      (this.state === BossState.VULNERABLE || this.state === BossState.STEAM_COOLDOWN)
    );
  }

  getCoreHitbox() {
    // Exposed glowing power core sits at the lower-center front chest of the Golem
    const coreW = this.width * 0.82;
    const coreH = 1.15;
    return {
      x: this.centerX - coreW * 0.5,
      y: this.pos.y + 0.08,
      width: coreW,
      height: coreH,
    };
  }
}

/**
 * BossEncounterSystem — Manages the Dread-Shell Golem, shockwaves, blast doors,
 * Phase 3 ceiling drop, Hoplite shell spawning, shatter debris, and World Exit Portal.
 */
export class BossEncounterSystem {
  constructor() {
    this.active = false;
    this.golem = null;
    this.shockwaves = [];
    this.debris = [];
    this.events = [];

    const cfg = MovementProfile.boss;
    this.arenaLeftX = cfg.arenaLeftX;
    this.arenaRightX = cfg.arenaRightX;
    this.floorY = cfg.floorY;
    this.ceilingY = cfg.initialCeilingY;
    this.leftDoorClosed = true;
    this.rightDoorClosed = true;
    this.ceilingDropApplied = false;
    this.exitPortal = {
      x: cfg.exitPortalX,
      y: cfg.exitPortalY,
      width: cfg.exitPortalWidth,
      height: cfg.exitPortalHeight,
      unlocked: false,
      entered: false,
      pulseTime: 0,
    };
  }

  loadFromRoom(room) {
    this.reset();
    if (!room?.bossConfig) return;

    const cfg = MovementProfile.boss;
    const bc = room.bossConfig;
    this.active = true;
    this.arenaLeftX = bc.arenaLeftX ?? cfg.arenaLeftX;
    this.arenaRightX = bc.arenaRightX ?? cfg.arenaRightX;
    this.floorY = bc.floorY ?? cfg.floorY;
    this.ceilingY = bc.initialCeilingY ?? cfg.initialCeilingY;
    this.leftDoorClosed = true;
    this.rightDoorClosed = true;
    this.ceilingDropApplied = false;

    this.exitPortal.x = bc.exitPortalX ?? cfg.exitPortalX;
    this.exitPortal.y = bc.exitPortalY ?? cfg.exitPortalY;
    this.exitPortal.width = cfg.exitPortalWidth;
    this.exitPortal.height = cfg.exitPortalHeight;
    this.exitPortal.unlocked = false;
    this.exitPortal.entered = false;
    this.exitPortal.pulseTime = 0;

    const spawnX = bc.spawnX ?? (this.arenaLeftX + this.arenaRightX) * 0.5 + 3.0;
    const spawnY = bc.spawnY ?? this.floorY;
    this.golem = new DreadShellGolem(spawnX, spawnY);
  }

  reset() {
    this.active = false;
    this.golem = null;
    this.shockwaves = [];
    this.debris = [];
    this.events = [];
    this.leftDoorClosed = true;
    this.rightDoorClosed = true;
    this.ceilingDropApplied = false;
    this.ceilingY = MovementProfile.boss.initialCeilingY;
    this.exitPortal.unlocked = false;
    this.exitPortal.entered = false;
    this.exitPortal.pulseTime = 0;
  }

  /**
   * Spawn 1 (or 2 in Phase 3 Twin-Shell Overdrive) dormant Hoplite shell(s) inside the arena
   * so the player can kick or carry-throw them into the Golem's exposed power core.
   */
  _spawnDormantHopliteShells(combat, count = 1) {
    if (!combat || !this.golem) return;
    // Cap active arena shells at 3 so the chamber stays readable and clean
    let existingShells = 0;
    for (let i = 0; i < combat.enemies.length; i++) {
      const e = combat.enemies[i];
      if (e.active && e.type === 'hoplite') existingShells++;
    }
    const toSpawn = Math.min(count, Math.max(0, 3 - existingShells));
    if (toSpawn <= 0) return;

    const gCx = this.golem.centerX;
    const offsets =
      toSpawn === 1
        ? [gCx > (this.arenaLeftX + this.arenaRightX) * 0.5 ? -4.2 : 4.2]
        : [-4.4, 4.4];

    for (let i = 0; i < toSpawn; i++) {
      let sx = gCx + offsets[i];
      sx = Math.max(this.arenaLeftX + 1.2, Math.min(this.arenaRightX - 2.0, sx));
      const hop = new HopliteEnemy(sx, this.floorY + 0.05, offsets[i] < 0 ? -1 : 1, {
        initialState: HopliteState.DORMANT_SHELL,
      });
      hop.dormancyFrames = 0; // Fresh 300f dormancy window for boss strike
      hop.vel.x = 0;
      hop.vel.y = 5.5; // Satisfying hop pop on spawn
      hop.grounded = false;
      combat.enemies.push(hop);
      this.golem.shellsDroppedTotal++;
      this.events.push({
        type: 'bossShellSpawn',
        x: hop.centerX,
        y: hop.pos.y,
        phase: this.golem.phase,
        count: toSpawn,
      });
    }
  }

  /**
   * Physically drop the stone chamber ceiling by exact 2 tiles for Phase 3 Overdrive Climax!
   */
  _applyPhase3CeilingDrop(tilemap, levelKit) {
    if (this.ceilingDropApplied || !tilemap) return;
    const cfg = MovementProfile.boss;
    const oldCeil = this.ceilingY;
    const dropTiles = cfg.phase3CeilingDropTiles; // 2
    const newCeil = oldCeil - dropTiles;

    for (let y = newCeil; y < oldCeil; y++) {
      for (let x = this.arenaLeftX; x < this.arenaRightX; x++) {
        tilemap.set(x, y, tileTypes.SOLID);
      }
    }

    this.ceilingY = newCeil;
    this.ceilingDropApplied = true;
    if (this.golem) {
      this.golem.ceilingDropped = true;
    }
    if (levelKit) {
      levelKit.tilemapDirty = true;
    }

    // Spawn dust rubble falling from the dropped ceiling
    for (let i = 0; i < 12; i++) {
      const rx = this.arenaLeftX + 1.0 + (i / 11) * (this.arenaRightX - this.arenaLeftX - 2.0);
      this.debris.push(
        new BossDebrisShard(
          rx,
          newCeil - 0.15,
          ((i % 2 === 0 ? 1 : -1) * (0.8 + (i % 3) * 0.4)),
          -1.5,
          0.18,
          '#64748B',
          '#334155',
          4
        )
      );
    }

    this.events.push({
      type: 'bossCeilingDrop',
      oldCeilingY: oldCeil,
      newCeilingY: newCeil,
      dropTiles,
    });
  }

  /**
   * Unlock the World Exit Portal and retract the right blast door upon Boss Shatter (Strike 3).
   */
  _unlockExitPortal(tilemap, levelKit) {
    this.exitPortal.unlocked = true;
    this.rightDoorClosed = false;
    if (tilemap) {
      // Visually open the right blast door passage (keep outer boundary wall at cols-1 solid)
      for (let y = this.floorY; y < this.floorY + 4; y++) {
        tilemap.set(this.arenaRightX, y, tileTypes.EMPTY);
      }
    }
    if (levelKit) {
      levelKit.tilemapDirty = true;
    }
    this.events.push({
      type: 'bossExitPortalUnlocked',
      x: this.exitPortal.x + this.exitPortal.width * 0.5,
      y: this.exitPortal.y + this.exitPortal.height * 0.5,
    });
  }

  /**
   * Apply a shell core strike to the Dread-Shell Golem (Strike 1 -> Phase 2, Strike 2 -> Phase 3, Strike 3 -> Shatter).
   */
  applyCoreStrike(combat, tilemap, levelKit) {
    const g = this.golem;
    if (!g || g.defeated || g.hp <= 0) return false;
    const cfg = MovementProfile.boss;

    g.hp = Math.max(0, g.hp - 1);
    g.hitFlashFrames = 24;
    g.invulnerableFrames = 36;
    g.coreExposed = false;
    g.isSpikedBoulder = false;

    const strikeNumber = g.maxHp - g.hp;

    if (combat) {
      combat.addScore(
        g.hp === 0 ? cfg.defeatScore : cfg.strikeScore,
        g.centerX,
        g.pos.y + g.height + 0.4,
        g.hp === 0 ? '#FDE047' : '#38BDF8'
      );
    }

    this.events.push({
      type: 'bossCoreStrike',
      strikeNumber,
      remainingHp: g.hp,
      x: g.centerX,
      y: g.centerY,
      hitstopFrames: cfg.strikeHitstopFrames,
      trauma: g.hp === 0 ? 0.85 : 0.55,
    });

    if (g.hp === 2) {
      // Transition to Phase 2: Enraged Spin Dash
      g.phase = BossPhase.PHASE_2_SPIN_DASH;
      g.state = BossState.HIT_STUN;
      g.stateTimer = cfg.hitStunFrames;
      g.carapaceGlow = 'crimson';
      g.vel.x = 0;
      g.vel.y = 0;
      this.events.push({ type: 'bossPhaseChange', phase: BossPhase.PHASE_2_SPIN_DASH });
    } else if (g.hp === 1) {
      // Transition to Phase 3: Overdrive Climax + 2-tile Ceiling Drop!
      g.phase = BossPhase.PHASE_3_OVERDRIVE;
      g.state = BossState.HIT_STUN;
      g.stateTimer = cfg.hitStunFrames;
      g.carapaceGlow = 'overdrive';
      g.height = cfg.height;
      g.vel.x = 0;
      g.vel.y = 0;
      this._applyPhase3CeilingDrop(tilemap, levelKit);
      this.events.push({ type: 'bossPhaseChange', phase: BossPhase.PHASE_3_OVERDRIVE });
    } else if (g.hp === 0) {
      // Strike 3: Shatter Golem into harmless geometric debris & unlock World Exit Portal!
      g.phase = BossPhase.DEFEATED;
      g.state = BossState.SHATTERED;
      g.defeated = true;
      g.active = false;
      g.vel.x = 0;
      g.vel.y = 0;
      this.shockwaves.length = 0;

      // Clear any remaining shells cleanly
      if (combat) {
        for (let i = 0; i < combat.enemies.length; i++) {
          if (combat.enemies[i].type === 'hoplite') {
            combat.enemies[i].destroy();
          }
        }
      }

      // Spawn harmless geometric debris shards
      const palette = [
        ['#94A3B8', '#334155'],
        ['#D97706', '#78350F'],
        ['#F59E0B', '#B45309'],
        ['#38BDF8', '#0284C7'],
        ['#EF4444', '#991B1B'],
      ];
      for (let i = 0; i < cfg.debrisCount; i++) {
        const angle = (i / cfg.debrisCount) * Math.PI * 2;
        const speed = 3.5 + (i % 5) * 1.9;
        const pal = palette[i % palette.length];
        this.debris.push(
          new BossDebrisShard(
            g.centerX + Math.cos(angle) * 0.55,
            g.centerY + Math.sin(angle) * 0.45,
            Math.cos(angle) * speed,
            Math.abs(Math.sin(angle)) * speed + 5.0 + (i % 3) * 1.8,
            0.16 + (i % 4) * 0.055,
            pal[0],
            pal[1],
            3 + (i % 3)
          )
        );
      }

      this._unlockExitPortal(tilemap, levelKit);
      this.events.push({
        type: 'bossDefeated',
        x: g.centerX,
        y: g.centerY,
        debrisCount: cfg.debrisCount,
      });
    }

    return true;
  }

  /**
   * Fixed 60 Hz deterministic simulation update for the Dread-Shell Golem encounter.
   */
  update(dt, player, combat, tilemap, levelKit) {
    this.events.length = 0;
    if (!this.active) return;

    const cfg = MovementProfile.boss;

    // 1. Update geometric debris shards (always harmless)
    for (let i = this.debris.length - 1; i >= 0; i--) {
      this.debris[i].update(dt, this.floorY, this.arenaLeftX, this.arenaRightX);
      if (!this.debris[i].active) {
        this.debris.splice(i, 1);
      }
    }

    // 2. Update room-wide ground shockwaves & player collision
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.update(dt);
      if (!sw.active) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      if (
        player &&
        player.invulnerabilityTimer === 0 &&
        player.state !== 'DEFEAT' &&
        aabbOverlap(player.pos.x, player.pos.y, player.width, player.height, sw.x, sw.y, sw.width, sw.height)
      ) {
        const damaged = player.takeDamage();
        if (damaged) {
          player.vel.y = Math.max(player.vel.y, 7.5);
          player.vel.x = sw.dir * 4.5;
          player.grounded = false;
          this.events.push({
            type: 'bossPlayerHit',
            source: 'shockwave',
            defeated: player.state === 'DEFEAT',
          });
        }
      }
    }

    // 3. Update unlocked World Exit Portal & detect player completion
    if (this.exitPortal.unlocked) {
      this.exitPortal.pulseTime += dt;
      if (
        player &&
        !this.exitPortal.entered &&
        player.state !== 'DEFEAT' &&
        aabbOverlap(
          player.pos.x,
          player.pos.y,
          player.width,
          player.height,
          this.exitPortal.x,
          this.exitPortal.y,
          this.exitPortal.width,
          this.exitPortal.height
        )
      ) {
        this.exitPortal.entered = true;
        if (levelKit) {
          levelKit.courseCleared = true;
        }
        this.events.push({
          type: 'worldExitPortalEntered',
          x: this.exitPortal.x + this.exitPortal.width * 0.5,
          y: this.exitPortal.y + this.exitPortal.height * 0.5,
        });
      }
    }

    // 4. Advance Golem 3-Phase State Machine
    const g = this.golem;
    if (!g || g.defeated || !g.active) return;

    g.syncPrevPos();
    if (g.hitFlashFrames > 0) g.hitFlashFrames--;
    if (g.invulnerableFrames > 0) g.invulnerableFrames--;

    switch (g.state) {
      case BossState.HIT_STUN: {
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          if (g.phase === BossPhase.PHASE_2_SPIN_DASH) {
            g.state = BossState.SPIN_WINDUP;
            g.stateTimer = cfg.spinWindupFrames;
            g.carapaceGlow = 'crimson';
            g.isSpikedBoulder = true;
            g.height = cfg.boulderHeight;
            this.events.push({ type: 'bossRoar', phase: g.phase });
          } else {
            // Phase 3 Overdrive starts right into aggressive patrol -> leap/slam
            g.state = BossState.PATROL;
            g.stateTimer = cfg.patrolFramesPhase3;
            g.carapaceGlow = 'overdrive';
            g.isSpikedBoulder = false;
            g.height = cfg.height;
            this.events.push({ type: 'bossRoar', phase: g.phase });
          }
        }
        break;
      }

      case BossState.PATROL: {
        g.coreExposed = false;
        g.isSpikedBoulder = false;
        g.height = cfg.height;
        const spd = g.phase === BossPhase.PHASE_3_OVERDRIVE ? cfg.patrolSpeed * 1.45 : cfg.patrolSpeed;
        g.vel.x = g.dir * spd;
        g.pos.x += g.vel.x * dt;
        if (g.pos.x <= this.arenaLeftX + 0.5) {
          g.pos.x = this.arenaLeftX + 0.5;
          g.dir = 1;
        } else if (g.pos.x + g.width >= this.arenaRightX - 0.5) {
          g.pos.x = this.arenaRightX - 0.5 - g.width;
          g.dir = -1;
        }
        g.facingRight = g.dir > 0;
        g.pos.y = this.floorY;
        g.grounded = true;

        g.stateTimer--;
        if (g.stateTimer <= 0) {
          // Face toward player and leap!
          if (player) {
            g.dir = player.centerX >= g.centerX ? 1 : -1;
            g.facingRight = g.dir > 0;
          }
          g.state = BossState.LEAP;
          g.vel.y = cfg.leapVy;
          g.vel.x = g.dir * 3.2;
          g.grounded = false;
          this.events.push({ type: 'bossLeap', x: g.centerX, y: g.pos.y, phase: g.phase });
        }
        break;
      }

      case BossState.LEAP: {
        g.vel.y -= cfg.leapGravity * dt;
        g.pos.x += g.vel.x * dt;
        g.pos.y += g.vel.y * dt;

        // Clamp inside 20-tile stone chamber & below current ceiling
        if (g.pos.x < this.arenaLeftX + 0.4) {
          g.pos.x = this.arenaLeftX + 0.4;
          g.vel.x = 0;
        } else if (g.pos.x + g.width > this.arenaRightX - 0.4) {
          g.pos.x = this.arenaRightX - 0.4 - g.width;
          g.vel.x = 0;
        }

        const maxTopY = this.ceilingY - g.height - 0.35;
        if (g.pos.y >= maxTopY || g.vel.y <= 0) {
          if (g.pos.y > maxTopY) g.pos.y = maxTopY;
          g.vel.x = 0;
          g.vel.y = 0;
          g.state = BossState.HOVER;
          g.stateTimer = cfg.hoverFrames; // Exact 20 frames!
          g.hoverFramesElapsed = 0;
          this.events.push({ type: 'bossHoverStart', x: g.centerX, y: g.pos.y, hoverFrames: cfg.hoverFrames });
        }
        break;
      }

      case BossState.HOVER: {
        g.vel.x = 0;
        g.vel.y = 0;
        g.hoverFramesElapsed++;
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          g.state = BossState.SLAM_FALL;
          g.vel.y = cfg.slamVy;
        }
        break;
      }

      case BossState.SLAM_FALL: {
        g.vel.y = cfg.slamVy;
        g.pos.y += g.vel.y * dt;
        if (g.pos.y <= this.floorY) {
          g.pos.y = this.floorY;
          g.vel.y = 0;
          g.grounded = true;

          // Emit bilateral room-wide ground shockwaves (dodgeable by jumping!)
          this.shockwaves.push(
            new BossShockwave(g.pos.x - cfg.shockwaveWidth * 0.5, this.floorY, -1, this.arenaLeftX, this.arenaRightX),
            new BossShockwave(g.pos.x + g.width - cfg.shockwaveWidth * 0.5, this.floorY, 1, this.arenaLeftX, this.arenaRightX)
          );

          // Phase 1 drops 1 dormant Hoplite shell; Phase 3 Overdrive spawns TWIN shells!
          const shellCount = g.phase === BossPhase.PHASE_3_OVERDRIVE ? 2 : 1;
          this._spawnDormantHopliteShells(combat, shellCount);

          g.state = BossState.VULNERABLE;
          g.stateTimer = cfg.vulnerabilityFrames;
          g.coreExposed = true;
          g.carapaceGlow = g.phase === BossPhase.PHASE_3_OVERDRIVE ? 'overdrive' : 'amber';

          this.events.push({
            type: 'bossGroundSlam',
            x: g.centerX,
            y: this.floorY,
            phase: g.phase,
            shellCount,
            trauma: MovementProfile.juice.trauma.bossGroundSlam, // +0.8
          });
        }
        break;
      }

      case BossState.VULNERABLE: {
        g.vel.x = 0;
        g.coreExposed = true;
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          g.coreExposed = false;
          if (g.phase === BossPhase.PHASE_3_OVERDRIVE) {
            g.overdriveCycleIndex++;
            // Alternate overdrive slams with a swift 2-pass spin dash burst
            if (g.overdriveCycleIndex % 2 === 1) {
              g.state = BossState.SPIN_WINDUP;
              g.stateTimer = Math.round(cfg.spinWindupFrames * 0.75);
              g.carapaceGlow = 'crimson';
              g.isSpikedBoulder = true;
              g.height = cfg.boulderHeight;
            } else {
              g.state = BossState.PATROL;
              g.stateTimer = cfg.patrolFramesPhase3;
            }
          } else {
            g.state = BossState.PATROL;
            g.stateTimer = cfg.patrolFramesPhase1;
            g.carapaceGlow = 'none';
          }
        }
        break;
      }

      case BossState.SPIN_WINDUP: {
        g.vel.x = 0;
        g.coreExposed = false;
        g.carapaceGlow = 'crimson';
        g.isSpikedBoulder = true;
        g.height = cfg.boulderHeight;
        g.spinAngle += dt * 18.0;
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          if (player) {
            g.dir = player.centerX >= g.centerX ? 1 : -1;
          }
          g.facingRight = g.dir > 0;
          g.state = BossState.SPIN_DASH;
          g.vel.x = g.dir * cfg.spinDashSpeed; // Exact 14.0 tiles/s!
          g.spinBouncesRemaining = g.phase === BossPhase.PHASE_3_OVERDRIVE ? 2 : cfg.spinDashBounces;
          this.events.push({
            type: 'bossSpinDashStart',
            x: g.centerX,
            y: g.centerY,
            speed: cfg.spinDashSpeed,
          });
        }
        break;
      }

      case BossState.SPIN_DASH: {
        g.coreExposed = false;
        g.carapaceGlow = 'crimson';
        g.isSpikedBoulder = true;
        g.vel.x = g.dir * cfg.spinDashSpeed; // Exact 14.0 tiles/s
        g.pos.x += g.vel.x * dt;
        g.pos.y = this.floorY;
        g.spinAngle += g.dir * cfg.spinDashSpeed * dt * 2.2;

        let bounced = false;
        if (g.pos.x <= this.arenaLeftX) {
          g.pos.x = this.arenaLeftX;
          g.dir = 1;
          g.facingRight = true;
          bounced = true;
        } else if (g.pos.x + g.width >= this.arenaRightX) {
          g.pos.x = this.arenaRightX - g.width;
          g.dir = -1;
          g.facingRight = false;
          bounced = true;
        }

        if (bounced) {
          g.spinBouncesRemaining--;
          this.events.push({
            type: 'bossWallSlam',
            x: g.dir > 0 ? this.arenaLeftX : this.arenaRightX,
            y: g.centerY,
            dir: g.dir,
            trauma: MovementProfile.juice.trauma.shellWallRebound, // +0.4
          });

          if (g.spinBouncesRemaining <= 0) {
            // Enter Steam Exhaust Cooldown -> drop Hoplite shell(s) & expose power core!
            g.state = BossState.STEAM_COOLDOWN;
            g.stateTimer = cfg.steamCooldownFrames;
            g.vel.x = 0;
            g.isSpikedBoulder = false;
            g.height = cfg.height;
            g.coreExposed = true;
            g.carapaceGlow = 'amber';
            g.steamTimer = 0;
            const shellCount = g.phase === BossPhase.PHASE_3_OVERDRIVE ? 2 : 1;
            this._spawnDormantHopliteShells(combat, shellCount);
            this.events.push({
              type: 'bossSteamCooldownStart',
              x: g.centerX,
              y: g.pos.y + g.height,
              phase: g.phase,
            });
          }
        }
        break;
      }

      case BossState.STEAM_COOLDOWN: {
        g.vel.x = 0;
        g.coreExposed = true;
        g.isSpikedBoulder = false;
        g.steamTimer += dt;
        g.stateTimer--;
        if (g.stateTimer <= 0) {
          g.coreExposed = false;
          if (g.phase === BossPhase.PHASE_3_OVERDRIVE) {
            g.state = BossState.PATROL;
            g.stateTimer = cfg.patrolFramesPhase3;
            g.carapaceGlow = 'overdrive';
          } else {
            g.state = BossState.SPIN_WINDUP;
            g.stateTimer = cfg.spinWindupFrames;
            g.carapaceGlow = 'crimson';
          }
        }
        break;
      }

      default:
        break;
    }

    // 5. Moving Hoplite shell -> Golem Exposed Power Core strike detection
    if (combat && g.active && !g.defeated) {
      const coreBox = g.getCoreHitbox();
      for (let i = 0; i < combat.enemies.length; i++) {
        const enemy = combat.enemies[i];
        if (!enemy.active || enemy.type !== 'hoplite') continue;
        if (enemy.state !== HopliteState.SHELL_MOVING) continue;

        if (
          aabbOverlap(
            enemy.pos.x,
            enemy.pos.y,
            enemy.width,
            enemy.height,
            coreBox.x,
            coreBox.y,
            coreBox.width,
            coreBox.height
          )
        ) {
          if (g.isVulnerableToShell) {
            enemy.destroy();
            this.applyCoreStrike(combat, tilemap, levelKit);
            break;
          } else {
            // Deflect off closed armored carapace with metallic clang
            enemy.dir = enemy.centerX < g.centerX ? -1 : 1;
            enemy.vel.x = enemy.dir * MovementProfile.enemyGallery.hoplite.shellMoveSpeed;
            enemy.pos.x = enemy.dir < 0 ? g.pos.x - enemy.width - 0.05 : g.pos.x + g.width + 0.05;
            this.events.push({ type: 'bossShellDeflect', x: enemy.centerX, y: enemy.centerY });
          }
        }
      }
    }

    // 6. Direct Golem body contact with Player
    if (
      player &&
      g.isThreat &&
      player.invulnerabilityTimer === 0 &&
      player.state !== 'DEFEAT' &&
      aabbOverlap(player.pos.x, player.pos.y, player.width, player.height, g.pos.x, g.pos.y, g.width, g.height)
    ) {
      const damaged = player.takeDamage();
      if (damaged) {
        const pushDir = player.centerX < g.centerX ? -1 : 1;
        player.vel.x = pushDir * 6.5;
        player.vel.y = 9.0;
        player.grounded = false;
        this.events.push({
          type: 'bossPlayerHit',
          source: g.isSpikedBoulder ? 'spinDash' : 'body',
          defeated: player.state === 'DEFEAT',
        });
      }
    }
  }
}

/**
 * Factory: Create Stage 21 Boss Chamber — "1-4: Dread-Shell Sanctum"
 * Enclosed 20-tile stone chamber (x = 2..22), closed left/right blast doors,
 * upper wall-jump alcoves at y = 7, and locked World Exit Portal at right chamber wall.
 */
export function createDreadShellBossRoom() {
  const cfg = MovementProfile.boss;
  const cols = 24; // x = 0..23; interior stone chamber is x = 2..21 (exact 20 tiles wide!)
  const rows = 18;
  const map = new TileMap(cols, rows);

  // Solid stone floor (y = 0..2 -> playable surface at floorY = 3)
  map.fillRect(0, 0, cols, cfg.floorY, tileTypes.SOLID);

  // Solid outer fortress walls + blast door columns (left x = 0..1, right x = 22..23)
  map.fillRect(0, cfg.floorY, cfg.arenaLeftX, rows - cfg.floorY, tileTypes.SOLID);
  map.fillRect(cfg.arenaRightX, cfg.floorY, cols - cfg.arenaRightX, rows - cfg.floorY, tileTypes.SOLID);

  // Initial stone ceiling at y = 14..17 (drops by 2 tiles to y = 12 in Phase 3 Overdrive!)
  map.fillRect(0, cfg.initialCeilingY, cols, rows - cfg.initialCeilingY, tileTypes.SOLID);

  // Upper Wall-Jump Alcoves at y = 7 (left x = 2..4, right x = 19..21) for Phase 2 Spin Dash evasion
  map.fillRect(cfg.arenaLeftX, cfg.alcoveY, cfg.alcoveWidth, 1, tileTypes.SEMISOLID);
  map.fillRect(cfg.arenaRightX - cfg.alcoveWidth, cfg.alcoveY, cfg.alcoveWidth, 1, tileTypes.SEMISOLID);

  return {
    id: '1-4-dread-shell-sanctum',
    courseCode: '1-4',
    name: '1-4: Dread-Shell Sanctum',
    subtitle: 'World 1 Climax · 20-Tile Stone Chamber · The Dread-Shell Golem',
    biome: 'sanctum',
    isWorld1Course: true,
    isBossRoom: true,
    chasmRescue: false,
    spawnX: 5.0,
    spawnY: cfg.floorY,
    map,
    tilemap: map,
    platforms: [],
    coins: [],
    enemies: [],
    markers: [
      { x: 3.5, y: cfg.alcoveY + 0.5, label: 'WALL-JUMP ALCOVE' },
      { x: 12.0, y: cfg.floorY, label: 'DREAD-SHELL CHAMBER (20t)' },
      { x: 20.2, y: cfg.alcoveY + 0.5, label: 'WALL-JUMP ALCOVE' },
    ],
    bossConfig: {
      arenaLeftX: cfg.arenaLeftX,
      arenaRightX: cfg.arenaRightX,
      arenaWidthTiles: cfg.arenaWidthTiles,
      floorY: cfg.floorY,
      initialCeilingY: cfg.initialCeilingY,
      alcoveY: cfg.alcoveY,
      spawnX: 14.5,
      spawnY: cfg.floorY,
      exitPortalX: cfg.exitPortalX,
      exitPortalY: cfg.exitPortalY,
    },
  };
}

export default BossEncounterSystem;
