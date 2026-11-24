/**
 * ParticleSystem — Zero-GC Pooled Cartoon Particle VFX
 * ======================================================
 * Pre-allocated fixed ring buffer (128 particles) updated in-place.
 * Never allocates particle objects inside the 60 Hz / rAF loop.
 *
 * Stage 2 VFX:
 *   - Skid smoke puffs: Trailing white cartoon clouds bursting at feet during skid
 *   - Sprint foot-dust: Intermittent 3-puff dust kick behind player (> 7.0 tiles/s)
 *   - Crouch slide puff: Subtle ground puff on high-speed duck
 */

const POOL_CAPACITY = 256;

class ParticleSystem {
  constructor() {
    this._pool = new Array(POOL_CAPACITY);
    for (let i = 0; i < POOL_CAPACITY; i++) {
      this._pool[i] = {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 0.15,
        growth: 0.2,
        life: 0,
        maxLife: 0.3,
        color: '#FFFFFF',
        rimColor: 'rgba(148, 163, 184, 0.55)',
      };
    }
    this._cursor = 0;
    this._activeCount = 0;
  }

  _alloc(x, y, vx, vy, radius, growth, maxLife, color, rimColor) {
    const p = this._pool[this._cursor];
    this._cursor = (this._cursor + 1) % POOL_CAPACITY;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.radius = radius;
    p.growth = growth;
    p.life = 0;
    p.maxLife = maxLife;
    p.color = color;
    p.rimColor = rimColor;
  }

  /**
   * Skid / Turnaround smoke puffs: 4 small white/smoke dust clouds bursting forward from feet.
   */
  spawnSkidSmoke(x, y, slideDir) {
    const dir = slideDir >= 0 ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const frac = i / 3;
      this._alloc(
        x + dir * (0.06 + frac * 0.18),
        y + 0.04 + (i % 2) * 0.04,
        dir * (1.8 + frac * 1.6),
        0.55 + (i % 2) * 0.45 + frac * 0.35,
        0.085 + (1 - frac) * 0.055,
        0.24,
        0.24 + (1 - frac) * 0.10,
        i % 2 === 0 ? '#FFFFFF' : '#E2E8F0',
        i % 2 === 0 ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.50)'
      );
    }
  }

  /**
   * Sprint foot-dust: 3-puff dust kick behind player (> 7.0 tiles/s).
   */
  spawnSprintDust(x, y, moveDir) {
    const backDir = -moveDir;
    this._alloc(
      x,
      y + 0.07,
      backDir * 1.6,
      0.95,
      0.13,
      0.20,
      0.24,
      '#F8FAFC',
      'rgba(148, 163, 184, 0.5)'
    );
    this._alloc(
      x + backDir * 0.14,
      y + 0.12,
      backDir * 2.1,
      1.35,
      0.09,
      0.16,
      0.20,
      '#E2E8F0',
      'rgba(148, 163, 184, 0.4)'
    );
    this._alloc(
      x + backDir * 0.06,
      y + 0.04,
      backDir * 1.0,
      0.55,
      0.07,
      0.14,
      0.17,
      '#CBD5E1',
      'rgba(100, 116, 139, 0.35)'
    );
  }

  /**
   * Crouch slide puff when ducking at speed.
   */
  spawnCrouchPuff(x, y, vx) {
    const dir = vx >= 0 ? 1 : -1;
    this._alloc(
      x - dir * 0.15,
      y + 0.06,
      -dir * 1.1,
      0.7,
      0.11,
      0.2,
      0.22,
      '#F1F5F9',
      'rgba(148, 163, 184, 0.45)'
    );
  }

  /**
   * Landing shockwave dust: symmetric left and right horizontal cartoon puffs on ground contact.
   */
  spawnLandingDust(x, y, impactSpeed = 12) {
    const scale = Math.min(1.4, Math.max(0.6, impactSpeed / 16));
    for (const dir of [-1, 1]) {
      this._alloc(
        x + dir * 0.22,
        y + 0.06,
        dir * (2.2 * scale),
        0.75 * scale,
        0.13 * scale,
        0.26,
        0.28,
        '#F8FAFC',
        'rgba(148, 163, 184, 0.6)'
      );
      this._alloc(
        x + dir * 0.10,
        y + 0.04,
        dir * (1.25 * scale),
        0.45,
        0.09 * scale,
        0.18,
        0.22,
        '#E2E8F0',
        'rgba(100, 116, 139, 0.45)'
      );
    }
  }

  /**
   * Apex float sparkle: faint sky-blue/gold wind glint during the 6-frame buoyant hang.
   */
  spawnApexSparkle(x, y) {
    this._alloc(
      x - 0.32,
      y + 0.12,
      -1.35,
      0.25,
      0.075,
      0.08,
      0.22,
      '#FEF08A',
      'rgba(56, 189, 248, 0.75)'
    );
    this._alloc(
      x + 0.32,
      y + 0.12,
      1.35,
      0.25,
      0.075,
      0.08,
      0.22,
      '#E0F2FE',
      'rgba(56, 189, 248, 0.75)'
    );
  }

  /**
   * Spin Twirl wisps: horizontal air swirl puffs emitted around the spinning character.
   */
  spawnSpinWisps(x, y, frameIdx = 0) {
    const dir = frameIdx % 2 === 0 ? 1 : -1;
    this._alloc(
      x + dir * 0.45,
      y + (dir > 0 ? 0.08 : -0.08),
      dir * 2.6,
      0.35,
      0.08,
      0.14,
      0.20,
      '#E0F2FE',
      'rgba(56, 189, 248, 0.75)'
    );
    this._alloc(
      x - dir * 0.45,
      y - (dir > 0 ? 0.08 : -0.08),
      -dir * 2.6,
      0.15,
      0.065,
      0.12,
      0.18,
      '#FEF08A',
      'rgba(250, 204, 21, 0.65)'
    );
  }

  /**
   * Wall Slide friction sparks & stone dust scraping upward along wall contact line.
   */
  spawnWallSlideSparks(wallX, y, wallDir) {
    const outDir = -wallDir;
    this._alloc(
      wallX + outDir * 0.04,
      y + 0.05,
      outDir * 1.15,
      2.3,
      0.08,
      0.12,
      0.22,
      '#FDE047',
      'rgba(249, 115, 22, 0.75)'
    );
    this._alloc(
      wallX + outDir * 0.08,
      y - 0.12,
      outDir * 0.65,
      1.4,
      0.10,
      0.18,
      0.24,
      '#CBD5E1',
      'rgba(100, 116, 139, 0.55)'
    );
  }

  /**
   * Wall Jump kick burst off the wall.
   */
  spawnWallJumpBurst(wallX, y, awayDir) {
    for (let i = 0; i < 4; i++) {
      this._alloc(
        wallX + awayDir * 0.06,
        y + (i - 1.5) * 0.12,
        awayDir * (1.8 + i * 0.4),
        1.1 - Math.abs(i - 1.5) * 0.5,
        0.11,
        0.22,
        0.25,
        i % 2 === 0 ? '#F8FAFC' : '#BAE6FD',
        'rgba(56, 189, 248, 0.55)'
      );
    }
  }

  /**
   * Ground Pound impact burst: bilateral dust shockwaves expanding left/right at 6.0 tiles/s.
   */
  spawnGroundPoundImpact(x, y) {
    for (const dir of [-1, 1]) {
      this._alloc(
        x + dir * 0.24,
        y + 0.09,
        dir * 6.0,
        0.38,
        0.19,
        0.32,
        0.34,
        '#FFFFFF',
        'rgba(148, 163, 184, 0.78)'
      );
      this._alloc(
        x + dir * 0.16,
        y + 0.06,
        dir * 3.0,
        2.15,
        0.11,
        0.20,
        0.26,
        '#FDE047',
        'rgba(249, 115, 22, 0.75)'
      );
      this._alloc(
        x + dir * 0.12,
        y + 0.04,
        dir * 4.3,
        1.05,
        0.14,
        0.26,
        0.30,
        '#E2E8F0',
        'rgba(100, 116, 139, 0.58)'
      );
    }
  }

  /**
   * Stage 5: Butt-Slide trailing dirt spray + lethal green/gold friction sparks.
   */
  spawnSlideDirtSpray(x, y, slideDir, speedRatio = 0.6, isLethal = false) {
    const backDir = -slideDir;
    const boost = 0.7 + speedRatio * 1.1;
    this._alloc(
      x,
      y + 0.08,
      backDir * (2.2 * boost),
      1.65 * boost,
      0.11,
      0.16,
      0.26,
      '#B45309',
      'rgba(120, 53, 15, 0.7)'
    );
    this._alloc(
      x + backDir * 0.10,
      y + 0.12,
      backDir * (3.0 * boost),
      2.15 * boost,
      0.085,
      0.14,
      0.22,
      isLethal ? '#4ADE80' : '#FACC15',
      isLethal ? 'rgba(22, 163, 74, 0.8)' : 'rgba(217, 119, 6, 0.7)'
    );
  }

  /**
   * Stage 5: Semisolid drop-through soft mist trail.
   */
  spawnSemisolidDropTrail(x, y) {
    for (const dir of [-1, 1]) {
      this._alloc(
        x + dir * 0.22,
        y,
        dir * 0.85,
        0.55,
        0.10,
        0.16,
        0.22,
        '#E0F2FE',
        'rgba(56, 189, 248, 0.65)'
      );
    }
  }

  /**
   * Stage 6: Golden sparkle burst when collecting a coin or hitting a [?] block.
   */
  spawnCoinBurst(x, y) {
    const dirs = [
      [-1.8, 2.2],
      [1.8, 2.2],
      [-2.4, 0.6],
      [2.4, 0.6],
      [0.0, 2.9],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const [vx, vy] = dirs[i];
      this._alloc(
        x,
        y,
        vx,
        vy,
        0.09,
        0.08,
        0.26,
        i % 2 === 0 ? '#FEF08A' : '#FACC15',
        'rgba(245, 158, 11, 0.85)'
      );
    }
  }

  /**
   * Stage 6: Crisp dust pop when bumping an overhead brick or used block.
   */
  spawnBlockBumpDust(x, y) {
    for (const dir of [-1, 1]) {
      this._alloc(
        x + dir * 0.25,
        y + 0.1,
        dir * 1.4,
        0.9,
        0.11,
        0.18,
        0.22,
        '#F8FAFC',
        'rgba(148, 163, 184, 0.6)'
      );
    }
  }

  /**
   * Stage 9: Radial gold/white star puffs emitted on enemy stomp or damage impact.
   */
  spawnStompStars(x, y) {
    const dirs = [
      [-2.5, 2.2],
      [2.5, 2.2],
      [-3.1, 0.5],
      [3.1, 0.5],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const [vx, vy] = dirs[i];
      this._alloc(
        x,
        y,
        vx,
        vy,
        0.11,
        0.09,
        0.28,
        i % 2 === 0 ? '#FEF08A' : '#FFFFFF',
        'rgba(245, 158, 11, 0.88)'
      );
    }
  }

  /**
   * Stage 9: Warm celebratory sparkle burst on Super Mushroom / Fire Flower emerge or collection.
   */
  spawnPowerUpBurst(x, y, powerUpType = 'super_mushroom') {
    const isFire = powerUpType === 'fire_flower';
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spd = 2.6 + (i % 2) * 1.1;
      this._alloc(
        x,
        y + 0.35,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd + 0.8,
        0.11,
        0.12,
        0.34,
        isFire ? (i % 2 === 0 ? '#FB923C' : '#FEF08A') : (i % 2 === 0 ? '#FACC15' : '#F8FAFC'),
        isFire ? 'rgba(239, 68, 68, 0.85)' : 'rgba(234, 179, 8, 0.85)'
      );
    }
  }

  /**
   * Stage 9: Ember sparks flaring on fireball launch, enemy hit, or wall detonation.
   */
  spawnFireballSparks(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const spd = 2.2 + (i % 3) * 1.1;
      this._alloc(
        x,
        y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd + 0.9,
        0.09,
        0.06,
        0.24,
        i % 2 === 0 ? '#FEF08A' : '#FB923C',
        'rgba(239, 68, 68, 0.9)'
      );
    }
  }

  /**
   * Stage 9: Crisp green/gold sparks on Koopa shell kick & wall ricochet.
   */
  spawnShellRicochetSparks(x, y) {
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this._alloc(
        x,
        y,
        dir * (1.8 + i * 0.45),
        1.2 + (i % 3) * 0.65,
        0.095,
        0.10,
        0.22,
        i % 2 === 0 ? '#86EFAC' : '#FEF08A',
        'rgba(22, 163, 74, 0.85)'
      );
    }
  }

  /**
   * Environmental Props: Compression Launch Spring rebound burst.
   * Super Spring emits a rich 14-particle golden + cyan starburst plume.
   */
  spawnSpringBurst(x, y, isSuper = false) {
    const count = isSuper ? 14 : 7;
    for (let i = 0; i < count; i++) {
      const spread = ((i / Math.max(1, count - 1)) - 0.5) * Math.PI * 0.88;
      const spd = isSuper ? (3.8 + (i % 3) * 1.45) : (2.2 + (i % 2) * 0.9);
      const vx = Math.sin(spread) * spd;
      const vy = Math.cos(spread) * spd + (isSuper ? 1.8 : 0.8);
      this._alloc(
        x + (Math.sin(spread) * 0.22),
        y + 0.08,
        vx,
        vy,
        isSuper ? 0.13 : 0.095,
        isSuper ? 0.14 : 0.09,
        isSuper ? 0.42 : 0.26,
        isSuper
          ? (i % 2 === 0 ? '#FDE047' : '#38BDF8')
          : (i % 2 === 0 ? '#E0F2FE' : '#38BDF8'),
        isSuper ? 'rgba(245, 158, 11, 0.92)' : 'rgba(14, 165, 233, 0.80)'
      );
    }
  }

  /**
   * Environmental Props: Fall-Away platform detachment rubble & dust puffs.
   */
  spawnPlatformCrumble(x, y, width = 3.0) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const frac = count > 1 ? i / (count - 1) - 0.5 : 0;
      this._alloc(
        x + frac * width * 0.85,
        y + 0.1,
        frac * 2.4,
        0.9 + (i % 3) * 0.45,
        0.11,
        0.15,
        0.32,
        i % 2 === 0 ? '#F59E0B' : '#94A3B8',
        'rgba(180, 83, 9, 0.75)'
      );
    }
  }

  /**
   * Stage 19: Expanding emerald & gold harmonic particle ring awarded on 100-shard 1-UP.
   */
  spawnOneUpRing(x, y, count = 18) {
    const n = Math.max(8, count);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const spd = 4.4 + (i % 2) * 0.65;
      const isEmerald = i % 2 === 0;
      this._alloc(
        x + Math.cos(angle) * 0.16,
        y + 0.45 + Math.sin(angle) * 0.16,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        0.13,
        0.16,
        0.48,
        isEmerald ? '#4ADE80' : '#FEF08A',
        isEmerald ? 'rgba(22, 163, 74, 0.92)' : 'rgba(245, 158, 11, 0.92)'
      );
    }
  }

  update(dt) {
    let count = 0;
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this._pool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.94;
      p.radius += p.growth * dt;
      count++;
    }
    this._activeCount = count;
  }

  draw(ctx, worldToScreen, ppt) {
    if (this._activeCount === 0) return;
    ctx.save();
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this._pool[i];
      if (!p.active) continue;

      const t = p.life / p.maxLife;
      const alpha = Math.max(0, 1 - t * t);
      const { x, y } = worldToScreen(p.x, p.y);
      const r = Math.max(1.5, p.radius * ppt);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = p.rimColor;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    ctx.restore();
  }

  clear() {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      this._pool[i].active = false;
    }
    this._activeCount = 0;
  }

  get activeCount() {
    return this._activeCount;
  }
}

export default ParticleSystem;
