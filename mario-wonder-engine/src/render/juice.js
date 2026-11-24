/**
 * Stage 20: Multi-Sensory "Juice" Engine (`src/render/juice.js`)
 * ==============================================================
 * World-class tactile platformer feel engineered with zero GC allocations inside the
 * fixed 60 Hz simulation & rAF render loops:
 *
 *   1. Procedural Hitstop (HitstopController):
 *      - Enemy stomp:             3 frames (50ms)
 *      - Shell kick / throw:      4 frames (66ms)
 *      - Player damage:           8 frames (133ms) + 1.5s (90f) invulnerability flashing
 *      - Solid block head-bonk:   2 frames (33ms)
 *      - Freezes simulation & 3D skeletal pose while audio chimes fire immediately.
 *      - Latches & replays input press edges during hitstop so zero input-buffer events
 *        are ever dropped and the 60 Hz clock never de-synchronizes.
 *
 *   2. Non-Linear Trauma Screen Shake (TraumaShake — T² Model):
 *      - Trauma T ∈ [0.0, 1.0]:
 *          * Heavy block smash:   +0.3
 *          * Shell wall rebound:  +0.4
 *          * Boss ground slam:    +0.8
 *      - Linear decay: T = max(0, T - 1.2 * dt)
 *      - Quadratic camera translation offset (MaxOffset = 12px):
 *          Δx = T² * MaxOffset * noise(t)
 *          Δy = T² * MaxOffset * noise(t + 100)
 *
 *   3. Directional Particle Emitter (DirectionalParticlePool — Zero-GC 256-slot Ring Buffer):
 *      - Turnaround / Skid:       Spawns 4 small white/smoke dust puffs shooting forward from feet.
 *      - Hard Ground Pound Land:  Bilateral dust shockwaves expanding left & right at 6.0 tiles/s.
 *      - Wall Slide:              Continuous upward-scraping friction particles along wall plane.
 *
 *   4. Presentation-Only Squash & Stretch Spring (SquashStretchSpring):
 *      - Damped harmonic volume-preserving squash/stretch. Reads simulation state only;
 *        NEVER writes to or mutates physics positions, velocities, or AABB hitboxes.
 */

import MovementProfile from '../game/config/MovementProfile.js';
import { Actions } from '../engine/input/InputManager.js';

const BUFFERED_ACTIONS = [
  Actions.JUMP,
  Actions.SPIN,
  Actions.DOWN,
  Actions.RUN,
  Actions.LEFT,
  Actions.RIGHT,
  Actions.UP,
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic, zero-allocation 1D lattice hash returning [-1, 1].
 */
function hash1D(n) {
  let x = (n | 0) * 374761393;
  x = ((x << 13) ^ x) | 0;
  x = (Math.imul(x, Math.imul(x, x) * 15731 + 789221) + 1376312589) | 0;
  return 1.0 - ((x & 0x7fffffff) / 1073741824.0);
}

/**
 * Smooth, continuous, deterministic 1D value noise in [-1, 1].
 * Used for Δx = T² * MaxOffset * noise(t) and Δy = T² * MaxOffset * noise(t + 100).
 */
export function noise1D(t) {
  const i0 = Math.floor(t);
  const f = t - i0;
  const u = f * f * (3.0 - 2.0 * f); // smoothstep C1 curve
  const v0 = hash1D(i0);
  const v1 = hash1D(i0 + 1);
  return v0 + (v1 - v0) * u;
}

/**
 * 1. Procedural Hitstop Controller with Zero-Drop Input Buffer Preservation
 */
export class HitstopController {
  constructor() {
    this.remainingFrames = 0;
    this.lastReason = 'none';
    this.lastTriggeredFrames = 0;
    this.totalTriggerCount = 0;
    this.totalFrozenTicks = 0;

    // Pre-allocated edge-latch map (zero GC during gameplay)
    this._bufferedPresses = {};
    for (let i = 0; i < BUFFERED_ACTIONS.length; i++) {
      this._bufferedPresses[BUFFERED_ACTIONS[i]] = false;
    }
    this._hasBufferedPresses = false;
    this.bufferedEventsCaptured = 0;
  }

  get active() {
    return this.remainingFrames > 0;
  }

  /**
   * Arm a hitstop freeze for `frames` fixed 60 Hz ticks.
   * Uses Math.max so a minor freeze never shortens a heavier active freeze.
   */
  trigger(frames, reason = 'impact') {
    const count = Math.max(0, Math.round(frames));
    if (count <= 0) return false;
    if (count >= this.remainingFrames) {
      this.remainingFrames = count;
      this.lastReason = reason;
      this.lastTriggeredFrames = count;
    }
    this.totalTriggerCount++;
    return true;
  }

  triggerEnemyStomp(reason = 'stomp') {
    return this.trigger(MovementProfile.juice.hitstop.enemyStompFrames, reason);
  }

  triggerShellKick(reason = 'shellKick') {
    return this.trigger(MovementProfile.juice.hitstop.shellKickFrames, reason);
  }

  triggerPlayerDamage(reason = 'damage') {
    return this.trigger(MovementProfile.juice.hitstop.playerDamageFrames, reason);
  }

  triggerSolidBlockBonk(reason = 'solidBlockBonk') {
    return this.trigger(MovementProfile.juice.hitstop.solidBlockBonkFrames, reason);
  }

  /**
   * Called once per frozen 60 Hz tick AFTER `input.poll()`.
   * Latches any rising button presses so zero input-buffer events are lost during hitstop.
   */
  captureFrozenInput(input) {
    if (!input) return;
    for (let i = 0; i < BUFFERED_ACTIONS.length; i++) {
      const action = BUFFERED_ACTIONS[i];
      if (input.pressedThisFrame(action)) {
        if (!this._bufferedPresses[action]) {
          this._bufferedPresses[action] = true;
          this._hasBufferedPresses = true;
          this.bufferedEventsCaptured++;
        }
      }
    }
  }

  /**
   * Consume one frozen 60 Hz tick. Returns true if a frozen tick was consumed.
   */
  consumeTick(input = null) {
    if (this.remainingFrames <= 0) return false;
    if (input) this.captureFrozenInput(input);
    this.remainingFrames--;
    this.totalFrozenTicks++;
    return true;
  }

  /**
   * Replay any buffered input presses captured during hitstop onto `input`
   * on the very first unfrozen 60 Hz tick.
   */
  flushBufferedInputTo(input) {
    if (!this._hasBufferedPresses || !input?.injectBufferedPresses) return false;
    input.injectBufferedPresses(this._bufferedPresses);
    for (let i = 0; i < BUFFERED_ACTIONS.length; i++) {
      this._bufferedPresses[BUFFERED_ACTIONS[i]] = false;
    }
    this._hasBufferedPresses = false;
    return true;
  }

  reset() {
    this.remainingFrames = 0;
    this.lastReason = 'none';
    this.lastTriggeredFrames = 0;
    this._hasBufferedPresses = false;
    for (let i = 0; i < BUFFERED_ACTIONS.length; i++) {
      this._bufferedPresses[BUFFERED_ACTIONS[i]] = false;
    }
  }
}

/**
 * 2. Non-Linear Trauma Screen Shake (T² Model)
 * --------------------------------------------
 * Implements the exact Stage 20 quadratic shake equations and also conforms to the
 * PlatformerCamera shake adapter interface (`offsetX`/`offsetY` in tiles, `rollDeg`, `pitchDeg`).
 */
export class TraumaShake {
  constructor() {
    this.trauma = 0;
    this.time = 0;
    this.noiseX = 0;
    this.noiseY = 0;
    this.offsetXPx = 0;
    this.offsetYPx = 0;
    this.offsetX = 0; // tiles (= offsetXPx / 64)
    this.offsetY = 0; // tiles (= offsetYPx / 64)
    this.rollDeg = 0;
    this.pitchDeg = 0;
    this._dirBiasX = 0;
    this._dirBiasY = 0;
    this.lastSource = 'none';
  }

  get shakeIntensity() {
    return this.trauma * this.trauma;
  }

  addTrauma(amount, dirX = 0, dirY = 0, source = 'generic') {
    if (amount <= 0) return this.trauma;
    this.trauma = clamp(this.trauma + amount, 0.0, 1.0);
    if (dirX !== 0 || dirY !== 0) {
      const len = Math.hypot(dirX, dirY) || 1;
      this._dirBiasX = dirX / len;
      this._dirBiasY = dirY / len;
    }
    this.lastSource = source;
    this._computeOffsets();
    return this.trauma;
  }

  addHeavyBlockSmash() {
    return this.addTrauma(MovementProfile.juice.trauma.heavyBlockSmash, 0, -1, 'heavyBlockSmash');
  }

  addShellWallRebound(dirX = 1) {
    return this.addTrauma(MovementProfile.juice.trauma.shellWallRebound, dirX, 0, 'shellWallRebound');
  }

  addBossGroundSlam() {
    return this.addTrauma(MovementProfile.juice.trauma.bossGroundSlam, 0, -1, 'bossGroundSlam');
  }

  _computeOffsets() {
    if (this.trauma <= 1e-6) {
      this.trauma = 0;
      this.noiseX = 0;
      this.noiseY = 0;
      this.offsetXPx = 0;
      this.offsetYPx = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      this.rollDeg = 0;
      this.pitchDeg = 0;
      return;
    }

    const cfg = MovementProfile.juice.trauma;
    const ppt = MovementProfile.simulation.pixelsPerTile; // 64 px/tile
    const shake = this.trauma * this.trauma; // Quadratic T² falloff
    const maxOffsetPx = cfg.maxOffsetPx; // 12 px
    const sampleT = this.time * cfg.noiseFrequencyHz;

    this.noiseX = noise1D(sampleT);
    this.noiseY = noise1D(sampleT + 100);

    // Exact Stage 20 quadratic camera translation equations:
    //   Δx = Trauma² * MaxOffset * noise(t)
    //   Δy = Trauma² * MaxOffset * noise(t + 100)
    this.offsetXPx = shake * maxOffsetPx * this.noiseX;
    this.offsetYPx = shake * maxOffsetPx * this.noiseY;
    this.offsetX = this.offsetXPx / ppt;
    this.offsetY = this.offsetYPx / ppt;

    // Subtle micro-roll for 2.5D depth feel (stays zero when trauma is zero)
    this.rollDeg = shake * 0.85 * noise1D(sampleT + 200);
    this.pitchDeg = 0;
  }

  /**
   * Advance clock and decay trauma linearly: T = max(0, T - 1.2 * dt).
   */
  update(dt) {
    const stepDt = dt > 0 ? dt : MovementProfile.simulation.fixedTimeStep;
    this.time += stepDt;

    if (this.trauma <= 0) {
      this._computeOffsets();
      return;
    }

    const decayRate = MovementProfile.juice.trauma.decayRatePerSec; // 1.2 / s
    this.trauma = Math.max(0.0, this.trauma - decayRate * stepDt);
    this._computeOffsets();
  }

  reset() {
    this.trauma = 0;
    this.time = 0;
    this.noiseX = 0;
    this.noiseY = 0;
    this.offsetXPx = 0;
    this.offsetYPx = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rollDeg = 0;
    this.pitchDeg = 0;
    this._dirBiasX = 0;
    this._dirBiasY = 0;
    this.lastSource = 'none';
  }
}

/**
 * 3. Directional Particle Emitter — Zero-GC Fixed Ring Buffer (256 Slots)
 * -----------------------------------------------------------------------
 * Pre-allocates all particle slots up front so 50+ concurrent particles
 * execute at rock-solid 60 FPS with zero per-frame object allocations.
 */
export class DirectionalParticlePool {
  constructor(capacity = MovementProfile.juice.particles.poolCapacity) {
    this.capacity = Math.max(64, capacity);
    this._pool = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this._pool[i] = {
        active: false,
        kind: 'dust', // 'turnaround' | 'shockwave' | 'wallFriction' | 'spark'
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        dragX: 0.92,
        dragY: 0.94,
        gravity: 0,
        radius: 0.12,
        growth: 0.18,
        life: 0,
        maxLife: 0.30,
        color: '#F8FAFC',
        rimColor: 'rgba(148, 163, 184, 0.6)',
      };
    }
    this._cursor = 0;
    this._activeCount = 0;
    this._totalSpawned = 0;
    this._wallSlidePhase = 0;
  }

  get activeCount() {
    return this._activeCount;
  }

  get totalSpawned() {
    return this._totalSpawned;
  }

  _alloc(kind, x, y, vx, vy, radius, growth, maxLife, color, rimColor, dragX = 0.92, dragY = 0.94, gravity = 0) {
    const p = this._pool[this._cursor];
    this._cursor = (this._cursor + 1) % this.capacity;
    if (!p.active) {
      this._activeCount++;
    }
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.dragX = dragX;
    p.dragY = dragY;
    p.gravity = gravity;
    p.radius = radius;
    p.growth = growth;
    p.life = 0;
    p.maxLife = maxLife;
    p.color = color;
    p.rimColor = rimColor;
    this._totalSpawned++;
    return p;
  }

  /**
   * Turnaround / Skid: Spawns exact 4 small white/smoke dust puffs shooting forward
   * from the player's feet when reversing direction.
   *
   * @param {number} x — Player feet center X (tiles)
   * @param {number} y — Player feet bottom Y (tiles)
   * @param {number} forwardDir — +1 or -1 forward momentum direction
   */
  spawnTurnaroundDust(x, y, forwardDir = 1) {
    const dir = forwardDir >= 0 ? 1 : -1;
    const cfg = MovementProfile.juice.particles;
    const count = cfg.turnaroundDustCount; // 4
    const minSpd = cfg.turnaroundForwardSpeedMin;
    const maxSpd = cfg.turnaroundForwardSpeedMax;

    for (let i = 0; i < count; i++) {
      const frac = count > 1 ? i / (count - 1) : 0.5;
      const forwardSpeed = minSpd + (maxSpd - minSpd) * frac;
      const upwardSpeed = 0.55 + (i % 2) * 0.45 + frac * 0.35;
      const offsetX = dir * (0.06 + frac * 0.18);
      const offsetY = 0.04 + (i % 2) * 0.04;
      const radius = 0.085 + (1 - frac) * 0.055;
      const color = i % 2 === 0 ? '#FFFFFF' : '#E2E8F0';
      const rim = i % 2 === 0 ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.50)';
      this._alloc(
        'turnaround',
        x + offsetX,
        y + offsetY,
        dir * forwardSpeed,
        upwardSpeed,
        radius,
        0.24,
        0.24 + (1 - frac) * 0.10,
        color,
        rim,
        0.92,
        0.94,
        0
      );
    }
    return count;
  }

  /**
   * Hard Ground Pound Land: Spawns bilateral dust shockwaves expanding left and right
   * at exact 6.0 tiles/s (`MovementProfile.juice.particles.groundPoundShockwaveSpeed`),
   * paired with trailing golden impact sparks & ground clouds.
   */
  spawnGroundPoundShockwave(x, y) {
    const speed = MovementProfile.juice.particles.groundPoundShockwaveSpeed; // 6.0 tiles/s
    let spawned = 0;

    for (let d = 0; d < 2; d++) {
      const dir = d === 0 ? -1 : 1;
      // Primary bilateral shockwave crest expanding at exact ±6.0 tiles/s
      this._alloc(
        'shockwave',
        x + dir * 0.24,
        y + 0.09,
        dir * speed,
        0.38,
        0.19,
        0.32,
        0.34,
        '#FFFFFF',
        'rgba(148, 163, 184, 0.78)',
        0.985,
        0.90,
        0
      );
      // Secondary shockwave wave right behind crest (also expanding outward)
      this._alloc(
        'shockwave',
        x + dir * 0.14,
        y + 0.06,
        dir * (speed * 0.72),
        1.15,
        0.14,
        0.26,
        0.30,
        '#E2E8F0',
        'rgba(100, 116, 139, 0.60)',
        0.95,
        0.92,
        0
      );
      // Impact golden spark burst
      this._alloc(
        'spark',
        x + dir * 0.18,
        y + 0.10,
        dir * (speed * 0.50),
        2.35,
        0.10,
        0.14,
        0.26,
        '#FDE047',
        'rgba(249, 115, 22, 0.80)',
        0.93,
        0.90,
        -6.0
      );
      spawned += 3;
    }
    return spawned;
  }

  /**
   * Wall Slide: Emits continuous upward-scraping friction particles along the wall
   * contact plane (`wallX`), alternating hot friction sparks and cool stone/smoke wisps.
   *
   * @param {number} wallX — Exact world X of the wall contact plane (tiles)
   * @param {number} y — Contact height along player flank (tiles)
   * @param {number} wallDir — -1 if wall is on left, +1 if wall is on right
   */
  spawnWallSlideFriction(wallX, y, wallDir = 1) {
    const outDir = wallDir < 0 ? 1 : -1;
    const cfg = MovementProfile.juice.particles;
    const phase = this._wallSlidePhase++;
    const t = (phase % 5) / 4;
    const upVy = cfg.wallSlideUpwardSpeedMin + (cfg.wallSlideUpwardSpeedMax - cfg.wallSlideUpwardSpeedMin) * t;
    const isSpark = phase % 2 === 0;

    this._alloc(
      'wallFriction',
      wallX + outDir * 0.03,
      y + ((phase % 3) - 1) * 0.08,
      outDir * (isSpark ? 0.85 : 0.45),
      upVy,
      isSpark ? 0.065 : 0.09,
      isSpark ? 0.06 : 0.16,
      isSpark ? 0.18 : 0.24,
      isSpark ? '#FDE047' : '#F1F5F9',
      isSpark ? 'rgba(249, 115, 22, 0.80)' : 'rgba(148, 163, 184, 0.58)',
      0.92,
      0.96,
      0
    );
    return 1;
  }

  /**
   * Spawn a deterministic radial burst of `count` pooled particles (zero heap allocs).
   * Useful for Boss Ground Slam shockwaves and 50+ concurrent particle stress benchmarks.
   */
  spawnStressBurst(x, y, count = 60) {
    const n = Math.min(this.capacity, Math.max(1, count));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const spd = 2.2 + (i % 5) * 0.95;
      const isGold = i % 3 === 0;
      this._alloc(
        'spark',
        x + Math.cos(ang) * 0.15,
        y + Math.sin(ang) * 0.15,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd + 1.1,
        isGold ? 0.095 : 0.12,
        0.16,
        0.45 + (i % 4) * 0.08,
        isGold ? '#FEF08A' : '#F8FAFC',
        isGold ? 'rgba(245, 158, 11, 0.80)' : 'rgba(148, 163, 184, 0.55)',
        0.95,
        0.95,
        -2.5
      );
    }
    return n;
  }

  /**
   * Update all active pooled particles in-place (zero allocations).
   */
  update(dt) {
    let active = 0;
    for (let i = 0; i < this.capacity; i++) {
      const p = this._pool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.dragX;
      p.vy = p.vy * p.dragY + p.gravity * dt;
      p.radius += p.growth * dt;
      active++;
    }
    this._activeCount = active;
  }

  /**
   * Draw all active directional juice particles on the 2D world canvas.
   */
  draw(ctx, worldToScreen, ppt) {
    if (this._activeCount === 0 || !ctx) return;
    ctx.save();
    for (let i = 0; i < this.capacity; i++) {
      const p = this._pool[i];
      if (!p.active) continue;

      const t = p.life / p.maxLife;
      const alpha = Math.max(0, 1 - t * t);
      const { x, y } = worldToScreen(p.x, p.y);
      const r = Math.max(1.5, p.radius * ppt);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.rimColor;
      ctx.lineWidth = 1.25;

      if (p.kind === 'shockwave') {
        // Horizontal ground-hugging shockwave puff ellipse
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.45, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (p.kind === 'wallFriction') {
        // Upward-streaked friction scrape droplet
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.78, r * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Copy references of currently active particles into `outArray` (optional reuse for tests).
   */
  collectActive(outArray = []) {
    outArray.length = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this._pool[i].active) outArray.push(this._pool[i]);
    }
    return outArray;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this._pool[i].active = false;
    }
    this._activeCount = 0;
    this._wallSlidePhase = 0;
  }
}

/**
 * 4. Presentation-Only Squash & Stretch Damped Spring
 * ---------------------------------------------------
 * Reads simulation state and events; NEVER mutates physics hitboxes or positions.
 */
export class SquashStretchSpring {
  constructor() {
    this.sy = 1.0;
    this.sx = 1.0;
    this.syVel = 0.0;
    this.wasCrouched = false;
  }

  impulse(targetSy, velocityKick = 0) {
    const cfg = MovementProfile.juice.squashStretch;
    this.sy = clamp(targetSy, cfg.minSy, cfg.maxSy);
    this.syVel = velocityKick;
    this.sx = clamp(1.0 / Math.sqrt(this.sy), 0.76, 1.42);
  }

  onJump() {
    this.impulse(MovementProfile.presentation.jumpStretchSy, -1.6);
  }

  onLand(impactSpeed = 12) {
    const norm = clamp(impactSpeed / 20, 0, 1);
    const sy = 1.0 - (1.0 - MovementProfile.presentation.landingSquashSy) * norm;
    this.impulse(sy, 2.8 * norm);
  }

  onGroundPoundLand() {
    this.impulse(MovementProfile.juice.squashStretch.groundPoundSquashSy, 3.8);
  }

  onBlockBonk() {
    this.impulse(MovementProfile.juice.squashStretch.blockBonkSquashSy, 2.4);
  }

  onDamage() {
    this.impulse(MovementProfile.juice.squashStretch.damageSquashSy, 3.0);
  }

  update(isCrouched, dt) {
    const cfg = MovementProfile.juice.squashStretch;
    const targetSy = isCrouched ? MovementProfile.presentation.crouchSquashSy : 1.0;
    if (!this.wasCrouched && isCrouched) {
      this.syVel = -4.2;
    } else if (this.wasCrouched && !isCrouched) {
      this.syVel = 3.6;
    }
    this.wasCrouched = Boolean(isCrouched);

    const force = (targetSy - this.sy) * cfg.stiffness - this.syVel * cfg.damping;
    this.syVel += force * dt;
    this.sy = clamp(this.sy + this.syVel * dt, cfg.minSy, cfg.maxSy);
    this.sx = clamp(1.0 / Math.sqrt(this.sy), 0.76, 1.42);
  }

  reset() {
    this.sy = 1.0;
    this.sx = 1.0;
    this.syVel = 0.0;
    this.wasCrouched = false;
  }
}

/**
 * Unified Multi-Sensory Juice Engine Facade
 */
export class JuiceEngine {
  constructor(options = {}) {
    this.hitstop = new HitstopController();
    this.trauma = new TraumaShake();
    this.particles = new DirectionalParticlePool(
      options.particlePoolCapacity ?? MovementProfile.juice.particles.poolCapacity
    );
    this.squash = new SquashStretchSpring();

    // Reusable read-only telemetry object (zero GC per frame)
    this._telemetry = {
      hitstopFrames: 0,
      hitstopReason: 'none',
      isPresentationFrozen: false,
      trauma: 0,
      shakeIntensity: 0,
      offsetXPx: 0,
      offsetYPx: 0,
      activeParticles: 0,
      poolCapacity: this.particles.capacity,
      squashSy: 1.0,
      squashSx: 1.0,
      bufferedPressesCaptured: 0,
    };
  }

  /**
   * True whenever a procedural hitstop freeze is active and the 3D skeletal rig / sprite
   * should hold its impact frame while audio chimes play immediately.
   */
  get isPresentationFrozen() {
    return this.hitstop.active;
  }

  /**
   * Process simulation events from PlayerController, LevelKitSystem, and CombatSystem
   * to arm hitstops, add quadratic trauma, spawn directional particles, and trigger squash/stretch.
   */
  processSimulationEvents({ playerEvents = [], levelKitEvents = [], combatEvents = [] } = {}) {
    const tCfg = MovementProfile.juice.trauma;

    // 1. Player kinematic & impact events
    for (let i = 0; i < playerEvents.length; i++) {
      const ev = playerEvents[i];
      if (ev.type === 'skid' || ev.type === 'turnaround') {
        this.particles.spawnTurnaroundDust(ev.x, ev.y, ev.dir ?? 1);
      } else if (ev.type === 'groundPoundImpact') {
        this.particles.spawnGroundPoundShockwave(ev.x, ev.y);
        this.trauma.addTrauma(ev.trauma ?? tCfg.groundPoundImpact, 0, -1, 'groundPoundImpact');
        this.squash.onGroundPoundLand();
      } else if (ev.type === 'wallSlide') {
        this.particles.spawnWallSlideFriction(ev.x, ev.y, ev.wallDir ?? 1);
      } else if (ev.type === 'blockHit') {
        this.hitstop.triggerSolidBlockBonk('solidBlockBonk');
        this.squash.onBlockBonk();
      } else if (ev.type === 'jump' || ev.type === 'spinJump' || ev.type === 'wallJump') {
        this.squash.onJump();
      } else if (ev.type === 'land' && ev.impactSpeed >= MovementProfile.vfx.landingDustMinSpeed) {
        this.squash.onLand(ev.impactSpeed);
      } else if (ev.type === 'bossGroundSlam') {
        this.triggerBossGroundSlam(ev.x ?? 0, ev.y ?? 0);
      }
    }

    // 2. Level Kit events (brick smash, etc.)
    for (let i = 0; i < levelKitEvents.length; i++) {
      const lev = levelKitEvents[i];
      if (lev.type === 'brickBreak') {
        this.trauma.addHeavyBlockSmash();
      }
    }

    // 3. Combat events (stomp, shell kick, shell wall rebound, damage, brick smash)
    for (let i = 0; i < combatEvents.length; i++) {
      const cev = combatEvents[i];
      if (cev.type === 'hitstop') {
        this.hitstop.trigger(cev.frames, cev.reason || 'combat');
      } else if (cev.type === 'stomp') {
        this.hitstop.triggerEnemyStomp('stomp');
        this.trauma.addTrauma(tCfg.enemyStomp, 0, -0.6, 'stomp');
      } else if (cev.type === 'shellKick') {
        this.hitstop.triggerShellKick(cev.isThrow ? 'shellThrow' : 'shellKick');
      } else if (cev.type === 'shellRicochet' || cev.type === 'hopliteWallBounce') {
        this.trauma.addShellWallRebound(cev.dir || 1);
      } else if (cev.type === 'shellBrickBreak') {
        this.trauma.addHeavyBlockSmash();
      } else if (cev.type === 'damage') {
        this.hitstop.triggerPlayerDamage('damage');
        this.trauma.addTrauma(tCfg.playerDamage, 0, 0.35, 'damage');
        this.squash.onDamage();
      } else if (cev.type === 'bossGroundSlam') {
        this.triggerBossGroundSlam(cev.x ?? 0, cev.y ?? 0);
      }
    }
  }

  /**
   * Trigger a heavy Boss Ground Slam (+0.8 trauma + bilateral dust shockwaves).
   */
  triggerBossGroundSlam(x = 0, y = 0) {
    this.trauma.addBossGroundSlam();
    this.particles.spawnGroundPoundShockwave(x, y);
  }

  /**
   * Step one fixed 60 Hz tick while frozen in hitstop:
   * Captures input buffer presses, decrements freeze counter, keeps trauma & particles alive.
   */
  stepFrozenTick(dt, input = null) {
    this.hitstop.consumeTick(input);
    this.trauma.update(dt);
    this.particles.update(dt);
  }

  /**
   * Advance presentation juice during a normal (unfrozen) 60 Hz tick.
   */
  update(dt, player = null) {
    this.trauma.update(dt);
    this.particles.update(dt);
    if (player) {
      this.squash.update(Boolean(player.isCrouched), dt);
    }
  }

  /**
   * Return a zero-GC telemetry snapshot for the HUD and automated tests.
   */
  getTelemetry() {
    const t = this._telemetry;
    t.hitstopFrames = this.hitstop.remainingFrames;
    t.hitstopReason = this.hitstop.lastReason;
    t.isPresentationFrozen = this.hitstop.active;
    t.trauma = this.trauma.trauma;
    t.shakeIntensity = this.trauma.shakeIntensity;
    t.offsetXPx = this.trauma.offsetXPx;
    t.offsetYPx = this.trauma.offsetYPx;
    t.activeParticles = this.particles.activeCount;
    t.poolCapacity = this.particles.capacity;
    t.squashSy = this.squash.sy;
    t.squashSx = this.squash.sx;
    t.bufferedPressesCaptured = this.hitstop.bufferedEventsCaptured;
    return t;
  }

  reset() {
    this.hitstop.reset();
    this.trauma.reset();
    this.particles.clear();
    this.squash.reset();
  }
}

export default JuiceEngine;
