/**
 * Collectible Economy, Risk-Reward Secrets & World-Space Combat Text
 * ==================================================================
 * Stage 19 Subsystem (`src/entities/collectibles.js`):
 *   1. Sparking Gold Shards (Standard Coins):
 *      - Parabolic jump-arc trajectory generator derived from MovementProfile.jump
 *      - 100 shards -> automatic +1 Life (1-UP) rollover, harmonic chime & particle ring
 *   2. Star Medallions (3 Secret Big Collectibles per Course):
 *      - Slot 0 (Observation): Visible behind breakable BRICK_BLOCK wall requiring kicked Hoplite shell
 *      - Slot 1 (Execution): High-momentum sprint ceiling route (|vx| >= 9.20 t/s) + wall-jumps
 *      - Slot 2 (Risk / Secret): Hidden subterranean crevice beneath a fall-away platform
 *   3. Cross-Level & Cross-Restart Persistence:
 *      - Persists shard tally toward 100, lives, and per-course 3-socket medallion state
 *        across loadRoom(), resetRoom(), and defeat resets (with localStorage backing in browser
 *        and clean deterministic in-memory storage in headless Node).
 *   4. Floating World-Space Combat Text Kinematics:
 *      - Pure deterministic 24px vertical rise over 20 frames (fade 1.0 -> 0.0)
 */

import MovementProfile from '../game/config/MovementProfile.js';

export const STAR_MEDALLION_ARCHETYPES = {
  OBSERVATION: 'observation',
  EXECUTION: 'execution',
  RISK_SECRET: 'risk_secret',
};

const STORAGE_KEY = 'mwe_stage19_collectible_economy_v1';

/**
 * Derive a parabolic shard trajectory matching the player's true jump kinematics
 * (`MovementProfile.jump.launchVelocity`, `gravityRising`, `gravityFalling`).
 * Placing shards along this parabola subconsciously teaches optimal takeoff and apex angles.
 *
 * @param {object} config
 * @param {number} config.startX      Takeoff X in tiles
 * @param {number} config.startY      Baseline ground/start Y in tiles
 * @param {number} config.endX        Landing X in tiles
 * @param {number} [config.endY]      Landing Y in tiles (defaults to startY)
 * @param {number} [config.count=5]   Number of Sparking Gold Shards along the arc
 * @param {number} [config.launchVx]  Horizontal speed for parabola calibration (tiles/s)
 * @param {number} [config.apexHeight] Optional explicit apex offset above baseline (tiles)
 * @param {string} [config.arcId]     Identifier tag for debug/audit
 * @returns {Array<{x: number, y: number, isShard: true, arcId: string, arcIndex: number, arcCount: number}>}
 */
export function generateParabolicShardArc(config = {}) {
  const {
    startX = 0,
    startY = 2.0,
    endX = startX + 4.0,
    endY = startY,
    count = 5,
    launchVx = MovementProfile.collectibles.arcDefaultLaunchVx,
    apexHeight = null,
    arcId = 'shard_arc',
  } = config;

  const n = Math.max(2, Math.floor(count));
  const jCfg = MovementProfile.jump;
  const cCfg = MovementProfile.collectibles;

  const spanX = Math.abs(endX - startX);
  const speed = Math.max(2.0, Math.abs(launchVx));
  const gEff = 0.5 * (jCfg.gravityRising + jCfg.gravityFalling);

  // Natural ballistic peak height h = g * (T/2)^2 / 2 = g * spanX^2 / (8 * vx^2),
  // bounded cleanly within Mario's comfortable jump envelope.
  const naturalPeak = (gEff * spanX * spanX) / (8 * speed * speed);
  const maxAllowedPeak = jCfg.apexHeight * cCfg.arcMaxHeightRatio;
  const peakOffset = apexHeight !== null
    ? Math.max(0.4, Math.min(maxAllowedPeak, apexHeight))
    : Math.max(0.85, Math.min(maxAllowedPeak, naturalPeak));

  const shards = [];
  for (let i = 0; i < n; i++) {
    // Sample strictly across [0.10 .. 0.90] or [0 .. 1] so the first/last shards guide takeoff & touchdown
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = startX + (endX - startX) * t;
    const baseY = startY + (endY - startY) * t;
    // Exact symmetric parabola peaking at t = 0.5 with height = peakOffset
    const parabola = 4 * t * (1 - t) * peakOffset;
    const y = baseY + parabola;

    shards.push({
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      isShard: true,
      arcId,
      arcIndex: i,
      arcCount: n,
    });
  }
  return shards;
}

/**
 * Resolve a stable persistence key for any room or World 1 course.
 */
export function resolveCoursePersistenceKey(room) {
  if (!room) return 'unknown_room';
  return (
    room.levelSchema?.id ||
    room.levelSchema?.code ||
    room.courseCode ||
    room.name ||
    'unknown_room'
  );
}

/**
 * Create a world-space floating combat text entry calibrated to Stage 19 spec:
 * rises exact 24px (0.375 tiles) and fades smoothly to 0 over exact 20 frames.
 */
export function createFloatingCombatText(text, x, y, color = '#FEF08A') {
  const cCfg = MovementProfile.collectibles;
  const ppt = MovementProfile.simulation.pixelsPerTile;
  const totalFrames = Math.max(1, Math.round(cCfg.combatTextFrames));
  const riseTiles = cCfg.combatTextRisePx / ppt;
  const dt = MovementProfile.simulation.fixedTimeStep;

  return {
    text: String(text),
    x,
    y,
    startY: y,
    riseTiles,
    risePx: cCfg.combatTextRisePx,
    frame: 0,
    totalFrames,
    age: 0,
    maxAge: totalFrames * dt,
    alpha: 1.0,
    color,
  };
}

/**
 * Step an array of floating combat text entries by one fixed 60 Hz frame.
 * Guarantees exact 24px total displacement and fade completion at frame 20.
 */
export function stepFloatingCombatTexts(popups, dt = MovementProfile.simulation.fixedTimeStep) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    const totalFrames = p.totalFrames ?? MovementProfile.collectibles.combatTextFrames;
    const riseTiles = p.riseTiles ?? (MovementProfile.collectibles.combatTextRisePx / MovementProfile.simulation.pixelsPerTile);
    if (p.startY === undefined) p.startY = p.y;
    if (p.frame === undefined) p.frame = 0;

    p.frame += 1;
    p.age += dt;

    if (p.frame >= totalFrames) {
      p.y = p.startY + riseTiles;
      p.alpha = 0;
      popups.splice(i, 1);
    } else {
      const progress = p.frame / totalFrames;
      p.y = p.startY + riseTiles * progress;
      p.alpha = Math.max(0, 1 - progress);
    }
  }
}

/**
 * CollectibleEconomySystem
 * ========================
 * Persistent economy ledger & Star Medallion vault that survives level transitions
 * and room restarts cleanly.
 */
export class CollectibleEconomySystem {
  constructor(options = {}) {
    this.persistToStorage = Boolean(options.persistToStorage && typeof window !== 'undefined' && window.localStorage);
    this.storageKey = options.storageKey || STORAGE_KEY;

    this.lives = 3;
    this.shardCount = 0;            // 0..99 toward next 1-UP
    this.totalShardsLifetime = 0;
    this.oneUpsFromShards = 0;
    this.medallionsByCourse = {};   // { [courseKey]: [bool, bool, bool] }
    this.activeCourseKey = null;
    this.events = [];               // Per-tick transient events (oneUpFromShards, medallionCollected, shardCollected)

    if (this.persistToStorage) {
      this._loadFromStorage();
    }
  }

  _ensureCourseSlots(courseKey) {
    const count = MovementProfile.collectibles.starMedallionCount;
    if (!Array.isArray(this.medallionsByCourse[courseKey]) || this.medallionsByCourse[courseKey].length !== count) {
      this.medallionsByCourse[courseKey] = Array(count).fill(false);
    }
    return this.medallionsByCourse[courseKey];
  }

  _loadFromStorage() {
    if (!this.persistToStorage) return;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Number.isFinite(parsed.lives)) {
        this.lives = Math.max(1, Math.min(99, Math.floor(parsed.lives)));
      }
      if (Number.isFinite(parsed.shardCount)) {
        const cap = MovementProfile.collectibles.shardsPerOneUp;
        this.shardCount = Math.max(0, Math.min(cap - 1, Math.floor(parsed.shardCount)));
      }
      if (Number.isFinite(parsed.totalShardsLifetime)) {
        this.totalShardsLifetime = Math.max(0, Math.floor(parsed.totalShardsLifetime));
      }
      if (parsed.medallionsByCourse && typeof parsed.medallionsByCourse === 'object') {
        const count = MovementProfile.collectibles.starMedallionCount;
        for (const [key, arr] of Object.entries(parsed.medallionsByCourse)) {
          if (Array.isArray(arr)) {
            this.medallionsByCourse[key] = Array.from({ length: count }, (_, idx) => Boolean(arr[idx]));
          }
        }
      }
    } catch {
      // Ignore corrupted browser storage gracefully
    }
  }

  _saveToStorage() {
    if (!this.persistToStorage) return;
    try {
      const payload = {
        lives: this.lives,
        shardCount: this.shardCount,
        totalShardsLifetime: this.totalShardsLifetime,
        medallionsByCourse: this.medallionsByCourse,
      };
      window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  /**
   * Explicitly reset all persistent collectible progress (used by tests or "New Run").
   */
  resetPersistentProgress() {
    this.lives = 3;
    this.shardCount = 0;
    this.totalShardsLifetime = 0;
    this.oneUpsFromShards = 0;
    this.medallionsByCourse = {};
    this.events.length = 0;
    if (this.persistToStorage) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Bind the economy system to a newly loaded or restarted room without wiping
   * persisted shards, lives, or collected Star Medallions.
   */
  bindRoom(room, levelEngine = null, combat = null) {
    this.events.length = 0;
    this.activeCourseKey = resolveCoursePersistenceKey(room);
    const sockets = this._ensureCourseSlots(this.activeCourseKey);

    if (combat) {
      combat.lives = this.lives;
    }

    if (levelEngine?.starMedallions?.length) {
      let persistedCount = 0;
      for (let i = 0; i < levelEngine.starMedallions.length; i++) {
        const m = levelEngine.starMedallions[i];
        const slotIndex = m.slotIndex ?? i;
        m.slotIndex = slotIndex;
        const alreadyCollected = Boolean(sockets[slotIndex]);
        m.persisted = alreadyCollected;
        if (alreadyCollected) {
          persistedCount++;
        }
      }
      levelEngine.starMedallionsCollected = persistedCount;
    }
  }

  /**
   * Clear per-tick transient events at start of frame.
   */
  beginTick() {
    this.events.length = 0;
  }

  /**
   * Sync life gains/losses originating from CombatSystem or LevelEngine (e.g., 6-enemy shell 1-UP,
   * secret 1-UP cache, or Small Mario defeat).
   */
  syncLives(livesValue) {
    if (!Number.isFinite(livesValue)) return;
    const clamped = Math.max(1, Math.min(99, Math.floor(livesValue)));
    if (clamped !== this.lives) {
      this.lives = clamped;
      this._saveToStorage();
    }
  }

  /**
   * Award one or more Sparking Gold Shards; automatically rolls over at 100 shards -> +1 Life (1-UP).
   */
  collectShards(amount = 1, x = 0, y = 0, combat = null) {
    const count = Math.max(1, Math.floor(amount));
    const threshold = MovementProfile.collectibles.shardsPerOneUp;

    this.shardCount += count;
    this.totalShardsLifetime += count;

    this.events.push({
      type: 'shardCollected',
      amount: count,
      shardCount: this.shardCount % threshold,
      x,
      y,
    });

    let oneUpsAwarded = 0;
    while (this.shardCount >= threshold) {
      this.shardCount -= threshold;
      this.lives = Math.min(99, this.lives + 1);
      this.oneUpsFromShards++;
      oneUpsAwarded++;
      if (combat) {
        combat.lives = this.lives;
        combat.spawnPopup('+1-UP', x, y + 0.65, '#4ADE80');
      }
      this.events.push({
        type: 'oneUpFromShards',
        lives: this.lives,
        shardCount: this.shardCount,
        x,
        y,
      });
    }

    this._saveToStorage();
    return {
      shardCount: this.shardCount,
      lives: this.lives,
      oneUpsAwarded,
    };
  }

  /**
   * Record collection of a Star Medallion for the current (or specified) course.
   * Persists cleanly across room transitions and restarts.
   */
  collectStarMedallion(slotIndex, x = 0, y = 0, courseKey = this.activeCourseKey) {
    const key = courseKey || this.activeCourseKey || 'unknown_room';
    const sockets = this._ensureCourseSlots(key);
    const idx = Math.max(0, Math.min(sockets.length - 1, Math.floor(slotIndex)));
    const wasNew = !sockets[idx];
    sockets[idx] = true;

    this.events.push({
      type: 'starMedallionCollected',
      courseKey: key,
      slotIndex: idx,
      wasNew,
      sockets: [...sockets],
      x,
      y,
    });

    this._saveToStorage();
    return {
      wasNew,
      sockets: [...sockets],
      collectedCount: sockets.filter(Boolean).length,
    };
  }

  /**
   * Process events emitted by LevelKitSystem & LevelGimmickRuntime during a 60 Hz tick.
   */
  processTickEvents({ levelKit = null, levelEngine = null, combat = null } = {}) {
    if (levelKit?.events?.length) {
      for (let i = 0; i < levelKit.events.length; i++) {
        const lev = levelKit.events[i];
        if (lev.type === 'coinCollect' || lev.type === 'questionBlockCoin') {
          this.collectShards(1, lev.x, lev.y, combat);
        }
      }
    }

    if (levelEngine?.events?.length) {
      for (let i = 0; i < levelEngine.events.length; i++) {
        const leEv = levelEngine.events[i];
        if (leEv.type === 'starMedallion') {
          const slotIdx = leEv.slotIndex ?? Math.max(0, (leEv.index ?? 1) - 1);
          const res = this.collectStarMedallion(slotIdx, leEv.x, leEv.y);
          if (levelEngine) {
            levelEngine.starMedallionsCollected = res.collectedCount;
            const med = levelEngine.starMedallions?.[slotIdx];
            if (med) med.persisted = true;
          }
        }
      }
    }

    // Keep lives synchronized with combat (e.g. 6-enemy shell 1-UP or secret cache 1-UP)
    if (combat && combat.lives !== this.lives) {
      this.syncLives(combat.lives);
    }
  }

  /**
   * Return persistent 3-socket boolean status `[bool, bool, bool]` for a given course.
   */
  getCourseSockets(courseKey = this.activeCourseKey) {
    if (!courseKey) {
      return Array(MovementProfile.collectibles.starMedallionCount).fill(false);
    }
    const sockets = this._ensureCourseSlots(courseKey);
    return [...sockets];
  }

  getTotalMedallionsCollected() {
    let total = 0;
    for (const arr of Object.values(this.medallionsByCourse)) {
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i]) total++;
        }
      }
    }
    return total;
  }

  getSnapshot(courseKey = this.activeCourseKey) {
    const sockets = this.getCourseSockets(courseKey);
    return {
      courseKey: courseKey || 'unknown_room',
      lives: this.lives,
      shardCount: this.shardCount,
      shardsPerOneUp: MovementProfile.collectibles.shardsPerOneUp,
      totalShardsLifetime: this.totalShardsLifetime,
      oneUpsFromShards: this.oneUpsFromShards,
      sockets,
      courseMedallionsCollected: sockets.filter(Boolean).length,
      totalMedallionsCollected: this.getTotalMedallionsCollected(),
    };
  }
}

export default CollectibleEconomySystem;
