/**
 * LevelKitSystem — Stage 6 Interactive Blocks, Coins & Flagpole State
 * =====================================================================
 * Deterministic fixed-60Hz update for:
 *   - 6-frame sine-wave block bump animation (12px = 0.1875t peak)
 *   - Question Block -> Used Block conversion + 2.5-tile hopping coin
 *   - Brick Block bump vs. 4-fragment shatter when struck at speed or Ground Pounded
 *   - Spinning world coin pickup tracking & shimmer fade
 *   - End-of-course Goal Flagpole trigger & flag descent
 *
 * Zero heap churn during normal no-op ticks; strictly 60 Hz deterministic.
 */

import MovementProfile from '../config/MovementProfile.js';

const { tileTypes, stage6 } = MovementProfile;

class LevelKitSystem {
  constructor() {
    this.activeBumps = [];      // { col, row, frame, totalFrames, offsetY }
    this.hoppingCoins = [];     // { x, y, startY, frame, totalFrames, maxHeight }
    this.brickDebris = [];      // { x, y, vx, vy, rot, vRot, life, maxLife }
    this.worldCoins = [];       // { id, x, y, collected, collectAge }
    this.flagpole = null;       // { x, baseY, topY, reached, flagY, flagDropDone }

    this.coinsCollected = 0;
    this.totalWorldCoins = 0;
    this.blocksBumped = 0;
    this.bricksBroken = 0;
    this.courseCleared = false;
    this.tilemapDirty = false;
    this.events = [];           // Transient per-tick audio/HUD/VFX triggers
  }

  get coins() {
    return this.coinsCollected;
  }

  /**
   * Reset & populate dynamic level kit entities from a room blueprint.
   */
  loadRoom(room) {
    this.activeBumps.length = 0;
    this.hoppingCoins.length = 0;
    this.brickDebris.length = 0;
    this.events.length = 0;
    this.coinsCollected = 0;
    this.blocksBumped = 0;
    this.bricksBroken = 0;
    this.courseCleared = false;
    this.tilemapDirty = false;

    const coins = room?.coins || [];
    this.worldCoins = coins.map((c, idx) => ({
      id: idx,
      x: c.x,
      y: c.y,
      isShard: Boolean(c.isShard),
      arcId: c.arcId || null,
      collected: false,
      collectAge: 0,
    }));
    this.totalWorldCoins = this.worldCoins.length;

    if (room?.flagpole) {
      this.flagpole = {
        x: room.flagpole.x,
        baseY: room.flagpole.baseY,
        topY: room.flagpole.topY,
        reached: false,
        flagY: room.flagpole.topY - 0.55,
        flagDropDone: false,
      };
    } else {
      this.flagpole = null;
    }
  }

  /**
   * Process one fixed 60 Hz tick: advance animations, check pickups & player events.
   */
  update(player, tilemap, dt, combat = null) {
    this.events.length = 0;
    this.tilemapDirty = false;

    // 1. Handle PlayerController blockHit & groundPoundImpact events
    for (let i = 0; i < player.events.length; i++) {
      const ev = player.events[i];
      if (ev.type === 'blockHit' && ev.col !== null && ev.row !== null) {
        this.triggerBlockHit(ev.col, ev.row, tilemap, {
          absVx: ev.absVx ?? Math.abs(player.vel.x),
          impactVy: ev.impactVy ?? 0,
          fromGroundPound: false,
          combat,
          player,
        });
      } else if (ev.type === 'groundPoundImpact' && ev.poundTiles?.length) {
        for (let k = 0; k < ev.poundTiles.length; k++) {
          const pt = ev.poundTiles[k];
          this.triggerBlockHit(pt.col, pt.row, tilemap, {
            absVx: Math.abs(player.vel.x),
            impactVy: MovementProfile.groundPound.diveSpeed,
            fromGroundPound: true,
            combat,
            player,
          });
        }
      }
    }

    // 2. Advance active 6-frame sine-wave block bumps
    for (let i = this.activeBumps.length - 1; i >= 0; i--) {
      const bump = this.activeBumps[i];
      bump.frame++;
      if (bump.frame >= bump.totalFrames) {
        this.activeBumps.splice(i, 1);
      } else {
        const progress = bump.frame / bump.totalFrames;
        bump.offsetY = Math.sin(progress * Math.PI) * stage6.blockBumpHeight;
      }
    }

    // 3. Advance Question-Block spawned hopping coins (2.5 tiles upward parabolic hop)
    for (let i = this.hoppingCoins.length - 1; i >= 0; i--) {
      const hc = this.hoppingCoins[i];
      hc.frame++;
      const p = hc.frame / hc.totalFrames;
      // Peak of 2.5 tiles reached smoothly around p=0.55 then drops partway before shimmering out
      const arc = 4 * p * (1 - p);
      hc.y = hc.startY + hc.maxHeight * arc;
      if (hc.frame >= hc.totalFrames) {
        this.hoppingCoins.splice(i, 1);
      }
    }

    // 4. Advance spinning Brick debris fragments
    const g = MovementProfile.jump.gravityFalling;
    for (let i = this.brickDebris.length - 1; i >= 0; i--) {
      const d = this.brickDebris[i];
      d.life += dt;
      if (d.life >= d.maxLife) {
        this.brickDebris.splice(i, 1);
        continue;
      }
      d.vy -= g * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vRot * dt;
    }

    // 5. Check Collectible World Coin AABB pickups
    const pxMin = player.pos.x - 0.12;
    const pxMax = player.pos.x + player.currentWidth + 0.12;
    const pyMin = player.pos.y - 0.08;
    const pyMax = player.pos.y + player.currentHeight + 0.08;
    const r = stage6.coinPickupRadius * 0.55;

    for (let i = 0; i < this.worldCoins.length; i++) {
      const c = this.worldCoins[i];
      if (c.collected) {
        if (c.collectAge < 0.25) c.collectAge += dt;
        continue;
      }
      if (c.x + r >= pxMin && c.x - r <= pxMax && c.y + r >= pyMin && c.y - r <= pyMax) {
        c.collected = true;
        c.collectAge = 0;
        this.coinsCollected++;
        if (combat) {
          const pts = MovementProfile.collectibles.shardScore;
          combat.addScore?.(pts, c.x, c.y + 0.32, `+${pts}`, '#FDE047');
        }
        this.events.push({ type: 'coinCollect', x: c.x, y: c.y, total: this.coinsCollected, isShard: c.isShard });
      }
    }

    // 6. Check Goal Flagpole capture & flag descent animation
    if (this.flagpole) {
      const fp = this.flagpole;
      if (!fp.reached) {
        const hitX = pxMax >= fp.x - 0.35 && pxMin <= fp.x + 0.35;
        const hitY = pyMax >= fp.baseY && pyMin <= fp.topY + 0.5;
        if (hitX && hitY) {
          fp.reached = true;
          this.courseCleared = true;
          const grabY = Math.min(fp.topY, Math.max(fp.baseY, player.pos.y + player.currentHeight * 0.5));
          const span = Math.max(1.0, fp.topY - fp.baseY);
          const heightRatio = Math.max(0, Math.min(1, (grabY - fp.baseY) / span));
          const w1 = MovementProfile.world1;
          const rawBonus = w1.flagpoleMinBonus + (w1.flagpoleMaxBonus - w1.flagpoleMinBonus) * heightRatio;
          const elevationBonus = heightRatio >= 0.88
            ? w1.flagpoleMaxBonus
            : Math.round(rawBonus / 100) * 100;
          fp.heightRatio = heightRatio;
          fp.elevationBonus = elevationBonus;
          if (combat) {
            const label = heightRatio >= 0.88 ? `TOP FLAG +${elevationBonus}!` : `GOAL +${elevationBonus}`;
            combat.addScore?.(elevationBonus, fp.x, grabY + 0.6, label, heightRatio >= 0.88 ? '#FDE047' : '#4ADE80');
          }
          this.events.push({
            type: 'flagpole',
            x: fp.x,
            y: grabY,
            heightRatio,
            elevationBonus,
          });
        }
      } else if (!fp.flagDropDone) {
        fp.flagY -= stage6.flagpoleSlideSpeed * dt;
        const targetBottom = fp.baseY + 1.0;
        if (fp.flagY <= targetBottom) {
          fp.flagY = targetBottom;
          fp.flagDropDone = true;
        }
      }
    }
  }

  /**
   * Interact with a tile at (col, row):
   *   - QUESTION_BLOCK -> becomes USED_BLOCK, starts 6-frame bump, spawns 2.5t hopping coin
   *   - BRICK_BLOCK -> shatters into 4 spinning fragments if sprinting or ground-pounded, else 6-frame bump
   */
  triggerBlockHit(col, row, tilemap, meta = {}) {
    const type = tilemap.get(col, row);
    const { absVx = 0, fromGroundPound = false, fromShell = false, combat = null, player = null } = meta;

    if (type === tileTypes.QUESTION_BLOCK) {
      tilemap.set(col, row, tileTypes.USED_BLOCK);
      this.tilemapDirty = true;
      this.blocksBumped++;
      this._pushBump(col, row);

      const powerUpType = combat?.consumeQuestionBlockLoot?.(col, row, player) ?? null;
      if (powerUpType) {
        this.events.push({
          type: 'questionBlockPowerUp',
          col,
          row,
          x: col + 0.5,
          y: row + 1.0,
          powerUpType,
        });
        return 'powerup';
      }

      // Spawn hopping gold coin ascending 2.5 tiles
      this.hoppingCoins.push({
        x: col + 0.5,
        y: row + 1.1,
        startY: row + 1.1,
        frame: 0,
        totalFrames: stage6.coinHopDurationFrames,
        maxHeight: stage6.coinHopHeight,
      });

      this.coinsCollected++;
      if (combat) {
        const pts = MovementProfile.collectibles.shardScore;
        combat.addScore?.(pts, col + 0.5, row + 1.35, `+${pts}`, '#FDE047');
      }
      this.events.push({
        type: 'questionBlockCoin',
        col,
        row,
        x: col + 0.5,
        y: row + 1.1,
        total: this.coinsCollected,
      });
      return 'question';
    }

    if (type === tileTypes.BRICK_BLOCK) {
      const shouldShatter =
        fromGroundPound ||
        fromShell ||
        absVx >= stage6.brickBreakMinHorizSpeed;

      if (shouldShatter) {
        tilemap.set(col, row, tileTypes.EMPTY);
        this.tilemapDirty = true;
        this.bricksBroken++;
        this._spawnBrickDebris(col, row);
        this.events.push({
          type: 'brickBreak',
          col,
          row,
          x: col + 0.5,
          y: row + 0.5,
        });
        return 'shatter';
      }

      this.blocksBumped++;
      this._pushBump(col, row);
      this.events.push({
        type: 'brickBump',
        col,
        row,
        x: col + 0.5,
        y: row + 0.5,
      });
      return 'bump';
    }

    if (type === tileTypes.USED_BLOCK || type === tileTypes.HARD_BLOCK) {
      this.events.push({ type: 'solidBonk', col, row, x: col + 0.5, y: row });
    }
    return null;
  }

  _pushBump(col, row) {
    for (let i = 0; i < this.activeBumps.length; i++) {
      if (this.activeBumps[i].col === col && this.activeBumps[i].row === row) {
        this.activeBumps[i].frame = 0;
        this.activeBumps[i].offsetY = 0;
        return;
      }
    }
    this.activeBumps.push({
      col,
      row,
      frame: 0,
      totalFrames: stage6.blockBumpFrames,
      offsetY: 0,
    });
  }

  getBumpOffsetY(col, row) {
    for (let i = 0; i < this.activeBumps.length; i++) {
      const b = this.activeBumps[i];
      if (b.col === col && b.row === row) return b.offsetY;
    }
    return 0;
  }

  _spawnBrickDebris(col, row) {
    const cx = col + 0.5;
    const cy = row + 0.5;
    const shards = [
      { ox: -0.22, oy: 0.22, vx: -4.2, vy: 12.5, vRot: -11.0 },
      { ox: 0.22, oy: 0.22, vx: 4.2, vy: 12.5, vRot: 11.0 },
      { ox: -0.22, oy: -0.22, vx: -3.2, vy: 8.5, vRot: -9.0 },
      { ox: 0.22, oy: -0.22, vx: 3.2, vy: 8.5, vRot: 9.0 },
    ];
    for (let i = 0; i < shards.length; i++) {
      const s = shards[i];
      this.brickDebris.push({
        x: cx + s.ox,
        y: cy + s.oy,
        vx: s.vx,
        vy: s.vy,
        rot: 0,
        vRot: s.vRot,
        life: 0,
        maxLife: 0.85,
      });
    }
  }
}

export default LevelKitSystem;
