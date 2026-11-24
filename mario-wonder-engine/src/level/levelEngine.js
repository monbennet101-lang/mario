/**
 * Level Progression & Kishōtenketsu Engine (`src/level/levelEngine.js`)
 * =====================================================================
 * Data-driven Level & Gimmick Framework grounded in Nintendo Level Design Wisdom:
 *   - Axiom 1: Strict separation of Invariant Transcendental Mechanics vs. Per-Level Gimmicks
 *   - Axiom 2: 4-Act Kishōtenketsu Architecture (Ki → Shō → Ten → Ketsu)
 *   - Axiom 3: Dual-Skill Routing (Miyamoto Floor |vx| <= 4.50 t/s vs. Ceiling |vx| >= 9.20 t/s)
 *   - Axiom 4: Subconscious Guidance (Rightward Vector, Visual Landmark Demo, Safeguard Ledges,
 *              Graduated Gap Pacing, Miyamoto 6-Enemy Shell Corridor)
 *   - Axiom 5: Automated 10-Point Architectural Audit & Headless Level Validator
 *
 * Strictly deterministic fixed-60 Hz simulation. Zero physics mutation: per-level gimmicks
 * (Water Geysers, Anti-Phase Platforms, Twist Heralds) layer atop standard swept-AABB
 * platforms, shells, and stomp rebounds without altering MovementProfile constants.
 */

import TileMap from '../engine/physics/TileMap.js';
import { lintTileMapGeometry } from '../engine/physics/GeometryLint.js';
import MovementProfile from '../game/config/MovementProfile.js';
import { PlatformMode } from '../entities/props.js';

const { tileTypes } = MovementProfile;
const S = tileTypes.SOLID;
const SEMI = tileTypes.SEMISOLID;
const HAZ = tileTypes.HAZARD;
const Q = tileTypes.QUESTION_BLOCK;
const B = tileTypes.BRICK_BLOCK;
const H = tileTypes.HARD_BLOCK;
const P = tileTypes.PIPE;
const M = tileTypes.MUSHROOM_PLATFORM;

// ─── 1. KISHŌTENKETSU 4-ACT TAXONOMY ─────────────────────────────────────────

export const KISHOTENKETSU_ACTS = Object.freeze({
  KI: Object.freeze({
    id: 'KI',
    order: 1,
    kanji: '起',
    name: 'Ki · Introduction',
    shortLabel: '1 · Ki (Intro)',
    role: 'Safe Playpen — non-fatal mechanic introduction with visual landmark',
    accentColor: '#38BDF8',
  }),
  SHO: Object.freeze({
    id: 'SHO',
    order: 2,
    kanji: '承',
    name: 'Shō · Development',
    shortLabel: '2 · Shō (Dev)',
    role: 'Extension — mechanic combined with hazards, Sproutling patrols & elevated platforming',
    accentColor: '#4ADE80',
  }),
  TEN: Object.freeze({
    id: 'TEN',
    order: 3,
    kanji: '転',
    name: 'Ten · The Twist',
    shortLabel: '3 · Ten (Twist)',
    role: 'Anticipated Inversion — reversed geysers, anti-phase platforms & shell-corridor synthesis',
    accentColor: '#F59E0B',
  }),
  KETSU: Object.freeze({
    id: 'KETSU',
    order: 4,
    kanji: '結',
    name: 'Ketsu · Climax',
    shortLabel: '4 · Ketsu (Climax)',
    role: 'Mastery Gauntlet — peak expression launching directly into the Goal Flagpole',
    accentColor: '#FACC15',
  }),
});

export const ACT_ORDER = Object.freeze(['KI', 'SHO', 'TEN', 'KETSU']);

// ─── 2. INVARIANT TRANSCENDENTAL BASELINE (AXIOM 1) ──────────────────────────

/**
 * Snapshot the universal transcendental physics contract from MovementProfile.
 * Per-level gimmicks MUST NEVER mutate any of these values.
 */
export function captureTranscendentalSnapshot() {
  return Object.freeze({
    locomotion: Object.freeze({
      walkTopSpeed: MovementProfile.locomotion.walkTopSpeed,
      runTopSpeed: MovementProfile.locomotion.runTopSpeed,
      startImpulse: MovementProfile.locomotion.startImpulse,
      groundAccel: MovementProfile.locomotion.groundAccel,
      groundFriction: MovementProfile.locomotion.groundFriction,
      skidDecel: MovementProfile.skid.decel,
      skidThreshold: MovementProfile.skid.threshold,
    }),
    jump: Object.freeze({
      apexHeight: MovementProfile.jump.apexHeight,
      launchVelocity: MovementProfile.jump.launchVelocity,
      gravityRising: MovementProfile.jump.gravityRising,
      gravityFalling: MovementProfile.jump.gravityFalling,
      terminalFallSpeed: MovementProfile.jump.terminalFallSpeed,
      runBoostFactor: MovementProfile.jump.runBoostFactor,
      earlyReleaseMult: MovementProfile.jump.earlyReleaseMult,
    }),
    forgiveness: Object.freeze({
      coyoteFrames: MovementProfile.forgiveness.coyoteFrames,
      jumpBufferFrames: MovementProfile.forgiveness.jumpBufferFrames,
      ceilingCornerNudge: MovementProfile.forgiveness.ceilingCornerNudge,
      ledgeStepUp: MovementProfile.forgiveness.ledgeStepUp,
    }),
    combatAndShells: Object.freeze({
      stompPassiveVy: MovementProfile.combat.stompPassiveVy,
      stompActiveVy: MovementProfile.combat.stompActiveVy,
      stompHitstopFrames: MovementProfile.combat.stompHitstopFrames,
      koopaShellSpeed: MovementProfile.enemies.koopashellSpeed,
      hopliteShellSpeed: MovementProfile.enemyGallery.hoplite.shellSpeed,
      multiKillOneUpThreshold: MovementProfile.enemyGallery.hoplite.multiKillOneUpThreshold,
    }),
    geometricBlocks: Object.freeze({
      tileSize: MovementProfile.tilemap.tileSize,
      blockBumpHeight: MovementProfile.stage6.blockBumpHeight,
      blockBumpFrames: MovementProfile.stage6.blockBumpFrames,
      brickBreakMinHorizSpeed: MovementProfile.stage6.brickBreakMinHorizSpeed,
    }),
  });
}

export const TRANSCENDENTAL_BASELINE = captureTranscendentalSnapshot();

/**
 * Verify that two transcendental snapshots are bit-for-bit identical.
 * Proves that per-level gimmicks & Act 3 twists never mutate universal physics.
 */
export function verifyTranscendentalInvariance(before, after) {
  const diffs = [];
  for (const group of Object.keys(before)) {
    const aGroup = before[group];
    const bGroup = after?.[group];
    if (!bGroup) {
      diffs.push(`Missing group: ${group}`);
      continue;
    }
    for (const key of Object.keys(aGroup)) {
      if (aGroup[key] !== bGroup[key]) {
        diffs.push(`${group}.${key} drifted: ${aGroup[key]} -> ${bGroup[key]}`);
      }
    }
  }
  return {
    invariant: diffs.length === 0,
    passed: diffs.length === 0,
    diffs,
  };
}

// ─── 3. PER-LEVEL GIMMICK ACTORS (ZERO PHYSICS MUTATION) ─────────────────────

/**
 * WaterGeyserGimmick — Rhythmic Rising/Falling Water Column
 * Implements the standard MovingPlatform interface (`pos`, `prevPos`, `width`,
 * `height`, `vel`, `deltaX`, `deltaY`, `oneWay`, `solidActive`) so PlayerController
 * rides and jump-boosts off the crest via 100% invariant swept-AABB collision!
 *
 * In Act 3 (Ten — Twist), `invertFlow()` flips `flowDirection` (+1 -> -1),
 * reversing wave phase and stepping cadence into an inverted tide cascade while
 * leaving player jump/gravity/movement physics completely untouched.
 */
export class WaterGeyserGimmick {
  constructor(config = {}) {
    const gCfg = MovementProfile.levelEngine.geyser;
    this.id = config.id || 'water_geyser';
    this.actId = config.actId || 'KI';
    this.x = config.x ?? 0;
    this.baseY = config.baseY ?? 2.0;
    this.width = config.width ?? gCfg.defaultWidth;
    this.height = config.crestHeight ?? gCfg.crestHeight;
    this.minHeight = Math.max(0.4, config.minHeight ?? 1.2);
    this.maxHeight = Math.max(this.minHeight + 0.5, config.maxHeight ?? 5.0);
    this.periodSec = Math.max(0.5, config.periodSec ?? gCfg.defaultPeriodSec);
    this.initialPhase = config.phase ?? 0;
    this.invertible = Boolean(config.invertible);
    this.pulsing = Boolean(config.pulsing);
    this.demoVisual = Boolean(config.demoVisual);
    this.label = config.label || '';
    this.isGeyser = true;

    // Platform interface fields consumed by CollisionSystem / PlayerController
    this.oneWay = true;
    this.solidActive = true;
    this.pos = { x: this.x, y: this.baseY + this.minHeight - this.height };
    this.prevPos = { x: this.pos.x, y: this.pos.y };
    this.vel = { x: 0, y: 0 };
    this.deltaX = 0;
    this.deltaY = 0;

    // Geyser-specific runtime fields
    this.columnHeight = this.minHeight;
    this.phase = this.initialPhase;
    this.flowDirection = 1; // +1 normal upward spout, -1 Act 3 Ten reversed cascade
    this.inverted = false;
    this.demoCoinY = this.baseY + this.minHeight + gCfg.demoCoinHoverOffset;

    this.reset();
  }

  _sampleColumnHeight(phase) {
    const p = ((phase % 1) + 1) % 1;
    if (this.pulsing) {
      // Rhythmic 3.0s hydraulic pulse: crisp rise -> buoyant crest hold -> brisk retract -> brief lull
      let wave = 0;
      if (p < 0.22) {
        const u = p / 0.22;
        wave = 0.5 - 0.5 * Math.cos(u * Math.PI);
      } else if (p < 0.62) {
        wave = 1.0;
      } else if (p < 0.84) {
        const u = (p - 0.62) / 0.22;
        wave = 0.5 + 0.5 * Math.cos(u * Math.PI);
      } else {
        wave = 0.0;
      }
      return this.minHeight + (this.maxHeight - this.minHeight) * wave;
    }
    // Smooth harmonic spout wave: 0 -> 1 -> 0 with gentle crest hang
    const wave = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    return this.minHeight + (this.maxHeight - this.minHeight) * wave;
  }

  reset() {
    const gCfg = MovementProfile.levelEngine.geyser;
    this.phase = this.initialPhase;
    this.flowDirection = 1;
    this.inverted = false;
    this.columnHeight = this._sampleColumnHeight(this.phase);
    const crestBottomY = this.baseY + this.columnHeight - this.height;
    this.pos.x = this.x;
    this.pos.y = crestBottomY;
    this.prevPos.x = this.x;
    this.prevPos.y = crestBottomY;
    this.vel.x = 0;
    this.vel.y = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.demoCoinY = this.baseY + this.columnHeight + gCfg.demoCoinHoverOffset;
  }

  /**
   * Act 3 (Ten — Twist): Reverse water column flow direction & shift into anti-phase cascade.
   */
  invertFlow() {
    if (!this.invertible || this.inverted) return false;
    this.inverted = true;
    this.flowDirection = -1;
    this.phase = (this.phase + MovementProfile.levelEngine.antiPhaseOffset) % 1;
    return true;
  }

  update(dt) {
    const gCfg = MovementProfile.levelEngine.geyser;
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;

    const speedMult = this.inverted ? gCfg.invertedSpeedMult : 1.0;
    this.phase = (this.phase + (this.flowDirection * speedMult * dt) / this.periodSec) % 1;
    if (this.phase < 0) this.phase += 1;

    this.columnHeight = this._sampleColumnHeight(this.phase);
    this.pos.x = this.x;
    this.pos.y = this.baseY + this.columnHeight - this.height;

    this.deltaX = this.pos.x - this.prevPos.x;
    this.deltaY = this.pos.y - this.prevPos.y;
    this.vel.x = dt > 0 ? this.deltaX / dt : 0;
    this.vel.y = dt > 0 ? this.deltaY / dt : 0;
    this.demoCoinY = this.baseY + this.columnHeight + gCfg.demoCoinHoverOffset;
  }

  getRenderPos(alpha) {
    return {
      x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
      y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha,
    };
  }
}

/**
 * HorizontalGeyserJet — Stage 18 Course 1-3 Act 3 (Ten) Twist Gimmick
 * Pressurized horizontal water jet propelling the player forward at ultra-high
 * velocity (vx = 14.0 tiles/s) across a massive spike abyss without mutating
 * any universal MovementProfile physics constants.
 */
export class HorizontalGeyserJet {
  constructor(config = {}) {
    const w1 = MovementProfile.world1;
    this.id = config.id || 'horizontal_geyser_jet';
    this.actId = config.actId || 'TEN';
    this.x = config.x ?? 0;
    this.y = config.y ?? 5.0;
    this.length = Math.max(2.0, config.length ?? 11.0);
    this.height = Math.max(1.0, config.height ?? 2.2);
    this.dir = (config.dir ?? 1) >= 0 ? 1 : -1;
    this.jetSpeed = config.jetSpeed ?? w1.horizontalJetSpeed; // 14.00 tiles/s
    this.liftVy = config.liftVy ?? w1.horizontalJetLiftVy;
    this.alwaysActive = config.alwaysActive !== false;
    this.periodSec = Math.max(0.5, config.periodSec ?? w1.geyserPulsePeriodSec);
    this.initialPhase = config.phase ?? 0;
    this.label = config.label || 'HYDRO JET 14 t/s';
    this.reset();
  }

  reset() {
    this.phase = this.initialPhase;
    this.activeRatio = 1.0;
    this.isActive = true;
  }

  update(dt) {
    if (this.alwaysActive) {
      this.phase = (this.phase + dt / this.periodSec) % 1;
      this.activeRatio = 1.0;
      this.isActive = true;
      return;
    }
    this.phase = (this.phase + dt / this.periodSec) % 1;
    this.isActive = this.phase < 0.72;
    this.activeRatio = this.isActive ? 1.0 : 0.15;
  }

  overlapsPlayer(player) {
    if (!this.isActive || !player) return false;
    const minX = this.dir > 0 ? this.x : this.x - this.length;
    const maxX = this.dir > 0 ? this.x + this.length : this.x;
    const minY = this.y;
    const maxY = this.y + this.height;
    return (
      player.pos.x + player.currentWidth > minX &&
      player.pos.x < maxX &&
      player.pos.y + player.currentHeight > minY &&
      player.pos.y < maxY
    );
  }
}

/**
 * TwistHerald — Act 3 (Ten) Anticipated Signpost & Inversion Trigger
 * Visually telegraphs the upcoming twist while player is within `anticipationRangeTiles`,
 * then triggers the twist inversion cleanly when crossed.
 */
export class TwistHerald {
  constructor(config = {}) {
    const leCfg = MovementProfile.levelEngine;
    this.id = config.id || 'act3_twist_herald';
    this.x = config.x ?? 107.0;
    this.baseY = config.baseY ?? 2.0;
    this.height = config.height ?? 5.5;
    this.label = config.label || 'TWIST HERALD · TIDE INVERSION';
    this.anticipationRangeTiles = config.anticipationRangeTiles ?? leCfg.heraldAnticipationRangeTiles;
    this.triggerHalfWidth = config.triggerHalfWidth ?? leCfg.heraldTriggerHalfWidth;
    this.reset();
  }

  reset() {
    this.state = 'IDLE'; // 'IDLE' | 'ANTICIPATING' | 'TRIGGERED'
    this.anticipationRatio = 0;
    this.pulseTime = 0;
    this.triggeredAtSec = null;
  }

  update(player, dt) {
    this.pulseTime += dt;
    if (this.state === 'TRIGGERED') {
      this.anticipationRatio = 1;
      return null;
    }

    const dx = this.x - player.centerX;
    if (dx <= this.triggerHalfWidth) {
      this.state = 'TRIGGERED';
      this.anticipationRatio = 1;
      this.triggeredAtSec = this.pulseTime;
      return {
        type: 'twistHerald',
        id: this.id,
        x: this.x,
        y: this.baseY + this.height * 0.5,
        label: this.label,
      };
    }

    if (dx <= this.anticipationRangeTiles && dx > this.triggerHalfWidth) {
      const wasIdle = this.state === 'IDLE';
      this.state = 'ANTICIPATING';
      this.anticipationRatio = Math.max(
        0,
        Math.min(1, 1 - (dx - this.triggerHalfWidth) / Math.max(0.5, this.anticipationRangeTiles - this.triggerHalfWidth))
      );
      if (wasIdle) {
        return {
          type: 'twistAnticipate',
          id: this.id,
          x: this.x,
          y: this.baseY + this.height * 0.5,
          label: this.label,
        };
      }
    } else {
      this.anticipationRatio = 0;
    }
    return null;
  }
}

/**
 * LevelGimmickRuntime — Deterministic Room-Level Kishōtenketsu Orchestrator
 * Manages Water Geysers, Twist Herald, Anti-Phase Platforms, Star Medallions,
 * Secret 1-UP Caches, and live Act/Route telemetry without ever touching physics constants.
 */
export class LevelGimmickRuntime {
  constructor() {
    this.active = false;
    this.schema = null;
    this.acts = [];
    this.geysers = [];
    this.horizontalJets = [];
    this.pinnacleGoal = null;
    this.twistHerald = null;
    this.starMedallions = [];
    this.secretCaches = [];
    this.actSignposts = [];
    this.twistActive = false;
    this.currentActId = 'KI';
    this.currentRoute = 'floor'; // 'floor' | 'ceiling'
    this.starMedallionsCollected = 0;
    this.secretCachesCollected = 0;
    this.events = [];
  }

  loadRoom(room) {
    this.events.length = 0;
    this.geysers = [];
    this.horizontalJets = [];
    this.pinnacleGoal = null;
    this.starMedallions = [];
    this.secretCaches = [];
    this.actSignposts = [];
    this.twistHerald = null;
    this.twistActive = false;
    this.currentActId = 'KI';
    this.currentRoute = 'floor';
    this.starMedallionsCollected = 0;
    this.secretCachesCollected = 0;

    if (!room?.levelSchema) {
      this.active = false;
      this.schema = null;
      this.acts = [];
      return;
    }

    this.active = true;
    this.schema = room.levelSchema;
    this.acts = room.levelSchema.acts || [];

    if (Array.isArray(room.geysers)) {
      for (let i = 0; i < room.geysers.length; i++) {
        const g = room.geysers[i];
        const inst = g instanceof WaterGeyserGimmick ? g : new WaterGeyserGimmick(g);
        inst.reset();
        this.geysers.push(inst);
      }
    }

    if (Array.isArray(room.horizontalJets)) {
      for (let i = 0; i < room.horizontalJets.length; i++) {
        const j = room.horizontalJets[i];
        const inst = j instanceof HorizontalGeyserJet ? j : new HorizontalGeyserJet(j);
        inst.reset();
        this.horizontalJets.push(inst);
      }
    }

    if (room.pinnacleGoal) {
      const pg = room.pinnacleGoal;
      this.pinnacleGoal = {
        id: pg.id || 'pinnacle_goal',
        x: pg.x,
        y: pg.y,
        radius: pg.radius ?? MovementProfile.world1.pinnacleGoalRadius,
        label: pg.label || 'PINNACLE GOAL MEDALLION',
        reached: false,
        collected: false,
        collectAge: 0,
      };
    }

    if (room.twistHerald) {
      this.twistHerald =
        room.twistHerald instanceof TwistHerald
          ? room.twistHerald
          : new TwistHerald(room.twistHerald);
      this.twistHerald.reset();
    }

    if (Array.isArray(room.starMedallions)) {
      this.starMedallions = room.starMedallions.map((m, idx) => ({
        id: m.id || `star_${idx + 1}`,
        index: idx + 1,
        slotIndex: m.slotIndex ?? idx,
        x: m.x,
        y: m.y,
        actId: m.actId || 'SHO',
        route: m.route || 'ceiling',
        archetype: m.archetype || null,
        hint: m.hint || '',
        collected: false,
        persisted: false,
        collectAge: 0,
      }));
    }

    if (Array.isArray(room.secretCaches)) {
      this.secretCaches = room.secretCaches.map((c, idx) => ({
        id: c.id || `cache_${idx + 1}`,
        x: c.x,
        y: c.y,
        actId: c.actId || 'SHO',
        route: c.route || 'ceiling',
        rewardType: c.rewardType || '1UP',
        collected: false,
        collectAge: 0,
      }));
    }

    this.actSignposts = this.acts.map((act) => ({
      id: act.id,
      kanji: act.kanji,
      name: act.name,
      shortLabel: act.shortLabel,
      x: act.xStart + 1.5,
      y: act.signpostY ?? 2.0,
      accentColor: act.accentColor,
    }));
  }

  reset() {
    this.events.length = 0;
    this.twistActive = false;
    this.currentActId = this.acts[0]?.id || 'KI';
    this.currentRoute = 'floor';
    this.starMedallionsCollected = 0;
    this.secretCachesCollected = 0;
    for (let i = 0; i < this.geysers.length; i++) this.geysers[i].reset();
    for (let i = 0; i < this.horizontalJets.length; i++) this.horizontalJets[i].reset();
    if (this.pinnacleGoal) {
      this.pinnacleGoal.reached = false;
      this.pinnacleGoal.collected = false;
      this.pinnacleGoal.collectAge = 0;
    }
    if (this.twistHerald) this.twistHerald.reset();
    for (let i = 0; i < this.starMedallions.length; i++) {
      this.starMedallions[i].collected = false;
      this.starMedallions[i].collectAge = 0;
    }
    for (let i = 0; i < this.secretCaches.length; i++) {
      this.secretCaches[i].collected = false;
      this.secretCaches[i].collectAge = 0;
    }
  }

  get platforms() {
    return this.geysers;
  }

  /**
   * Step 1 (Pre-Player): Advance rhythmic Water Geysers & Horizontal Jets so player
   * carry & jump boost resolve on the exact same swept-AABB platform path.
   */
  updateGeysers(dt) {
    this.events.length = 0;
    if (!this.active) return;
    for (let i = 0; i < this.geysers.length; i++) {
      this.geysers[i].update(dt);
    }
    for (let i = 0; i < this.horizontalJets.length; i++) {
      this.horizontalJets[i].update(dt);
    }
  }

  /**
   * Step 2 (Post-Player): Advance Twist Herald, Horizontal Jets, Pinnacle Goal Medallion,
   * Star Medallions & Secret 1-UP Caches, and track current Kishōtenketsu Act + route.
   */
  updatePostPlayer(dt, player, combat = null, propPlatforms = [], levelKit = null) {
    if (!this.active || !player) return;

    // 1. Track active Kishōtenketsu Act by player horizontal progression
    const prevAct = this.currentActId;
    for (let i = 0; i < this.acts.length; i++) {
      const act = this.acts[i];
      if (player.centerX >= act.xStart && player.centerX <= act.xEnd + 0.5) {
        this.currentActId = act.id;
        break;
      }
    }
    if (this.currentActId !== prevAct) {
      const meta = KISHOTENKETSU_ACTS[this.currentActId];
      this.events.push({
        type: 'actEnter',
        actId: this.currentActId,
        label: meta ? meta.name : this.currentActId,
        x: player.centerX,
        y: player.centerY,
      });
    }

    // 2. Track Miyamoto Floor vs. Ceiling Route elevation
    const ceilingThresholdY =
      (this.schema?.floorBaselineY ?? 2.0) +
      MovementProfile.levelEngine.ceilingRouteMinElevationDelta +
      4.5;
    this.currentRoute = player.pos.y >= ceilingThresholdY ? 'ceiling' : 'floor';

    // 3. Twist Herald anticipation & Act 3 Ten inversion trigger
    if (this.twistHerald) {
      const hEv = this.twistHerald.update(player, dt);
      if (hEv) {
        this.events.push(hEv);
        if (hEv.type === 'twistHerald') {
          this.triggerTwistInversion(propPlatforms);
        }
      }
    }

    // 4. Star Medallions (3 mastery collectibles)
    const pxMin = player.pos.x - 0.14;
    const pxMax = player.pos.x + player.currentWidth + 0.14;
    const pyMin = player.pos.y - 0.10;
    const pyMax = player.pos.y + player.currentHeight + 0.10;
    const starR = MovementProfile.levelEngine.starMedallionRadius;

    for (let i = 0; i < this.starMedallions.length; i++) {
      const m = this.starMedallions[i];
      if (m.collected) {
        if (m.collectAge < 0.45) m.collectAge += dt;
        continue;
      }
      if (m.x + starR >= pxMin && m.x - starR <= pxMax && m.y + starR >= pyMin && m.y - starR <= pyMax) {
        m.collected = true;
        m.collectAge = 0;
        if (!m.persisted) {
          this.starMedallionsCollected = Math.min(this.starMedallions.length, this.starMedallionsCollected + 1);
        }
        const pts = MovementProfile.levelEngine.starMedallionScore;
        combat?.addScore?.(pts, m.x, m.y + 0.4, `+${pts}`, '#FDE047');
        this.events.push({
          type: 'starMedallion',
          index: m.index,
          slotIndex: m.slotIndex ?? i,
          archetype: m.archetype,
          totalCollected: this.starMedallionsCollected,
          x: m.x,
          y: m.y,
        });
      }
    }

    // 5. Secret 1-UP Caches (Ceiling Route incentive)
    const cacheR = MovementProfile.levelEngine.secretCacheRadius;
    for (let i = 0; i < this.secretCaches.length; i++) {
      const c = this.secretCaches[i];
      if (c.collected) {
        if (c.collectAge < 0.45) c.collectAge += dt;
        continue;
      }
      if (c.x + cacheR >= pxMin && c.x - cacheR <= pxMax && c.y + cacheR >= pyMin && c.y - cacheR <= pyMax) {
        c.collected = true;
        c.collectAge = 0;
        this.secretCachesCollected++;
        if (combat) {
          combat.lives = Math.min(99, (combat.lives ?? 3) + 1);
          combat.addScore?.(1000, c.x, c.y + 0.45, '1-UP SECRET!', '#4ADE80');
        }
        this.events.push({
          type: 'secretOneUp',
          id: c.id,
          x: c.x,
          y: c.y,
        });
      }
    }

    // 6. Stage 18 Horizontal Hydraulic Geyser Jets (vx = 14.0 tiles/s)
    for (let i = 0; i < this.horizontalJets.length; i++) {
      const jet = this.horizontalJets[i];
      if (jet.overlapsPlayer(player)) {
        const applied = player.applyHorizontalJetBoost?.(jet.dir * jet.jetSpeed, jet.liftVy, jet);
        if (applied) {
          this.events.push({
            type: 'horizontalJet',
            id: jet.id,
            vx: jet.dir * jet.jetSpeed,
            x: player.centerX,
            y: player.centerY,
          });
        }
      }
    }

    // 7. Stage 18 Pinnacle Goal Medallion (Course 1-3 Ketsu Summit Finish)
    if (this.pinnacleGoal) {
      const pg = this.pinnacleGoal;
      if (pg.reached) {
        if (pg.collectAge < 0.8) pg.collectAge += dt;
      } else {
        const pr = pg.radius;
        if (
          pg.x + pr >= pxMin &&
          pg.x - pr <= pxMax &&
          pg.y + pr >= pyMin &&
          pg.y - pr <= pyMax
        ) {
          pg.reached = true;
          pg.collected = true;
          pg.collectAge = 0;
          if (levelKit) {
            levelKit.courseCleared = true;
          }
          const pts = MovementProfile.world1.pinnacleGoalBonus;
          combat?.addScore?.(pts, pg.x, pg.y + 0.65, `PINNACLE +${pts}!`, '#FDE047');
          this.events.push({
            type: 'pinnacleGoal',
            id: pg.id,
            x: pg.x,
            y: pg.y,
            points: pts,
          });
        }
      }
    }
  }

  /**
   * Execute Act 3 (Ten) Twist Inversion:
   *  - Reverses all invertible Water Geysers into inverted tide cascade
   *  - Shifts paired anti-phase platforms into exact 180° (0.5 cycle) opposition
   *  - Zero mutation to MovementProfile or player physics!
   */
  triggerTwistInversion(propPlatforms = []) {
    if (this.twistActive) return false;
    this.twistActive = true;
    for (let i = 0; i < this.geysers.length; i++) {
      this.geysers[i].invertFlow();
    }
    const antiOffset = MovementProfile.levelEngine.antiPhaseOffset;
    for (let i = 0; i < propPlatforms.length; i++) {
      const plat = propPlatforms[i];
      if (plat.id && plat.id.includes('antiphase_b')) {
        plat.elapsed = (plat.elapsed + plat.periodSec * antiOffset) % plat.periodSec;
      }
    }
    return true;
  }
}

// ─── 4. ANALYTICAL JUMP ENVELOPE & DUAL-SKILL KINEMATIC VALIDATORS ───────────

/**
 * Compute exact analytical jump envelope for a given horizontal velocity |vx|
 * using MovementProfile's invariant asymmetric gravity & run-boost equations.
 */
export function computeJumpEnvelope(vx = 0) {
  const jCfg = MovementProfile.jump;
  const fCfg = MovementProfile.forgiveness;
  const lCfg = MovementProfile.locomotion;
  const speed = Math.abs(vx);
  const runRatio = Math.min(1, speed / lCfg.runTopSpeed);
  const launchVy = jCfg.launchVelocity * (1 + jCfg.runBoostFactor * runRatio);
  const gRise = jCfg.gravityRising;
  const gFall = jCfg.gravityFalling;

  const apexHeight = (launchVy * launchVy) / (2 * gRise);
  const timeToApex = launchVy / gRise;
  const apexFloatBonusSec = MovementProfile.apexFloat.maxFrames * MovementProfile.simulation.fixedTimeStep * 0.35;
  const coyoteBonusTiles = fCfg.coyoteFrames * MovementProfile.simulation.fixedTimeStep * speed;
  const bodyWidthBonus = MovementProfile.hitbox.width * 0.75;

  /**
   * Maximum horizontal gap clearable for a given vertical elevation change `deltaY = targetY - startY`.
   */
  function maxHorizontalGapForDeltaY(deltaY = 0) {
    if (deltaY > apexHeight - 0.15) return -1; // Unreachable height
    const dropFromApex = Math.max(0.05, apexHeight - deltaY);
    const timeFall = Math.sqrt((2 * dropFromApex) / gFall);
    const totalAirTime = timeToApex + apexFloatBonusSec + timeFall;
    return speed * totalAirTime + coyoteBonusTiles + bodyWidthBonus;
  }

  return {
    vx: speed,
    launchVy,
    apexHeight,
    timeToApex,
    flatJumpRangeTiles: maxHorizontalGapForDeltaY(0),
    maxHorizontalGapForDeltaY,
  };
}

/**
 * Headless Validator #1: Act 1 (Ki — Safe Playpen) Zero-Pit & Zero-Hazard Audit
 * Scans every column inside [act1.xStart, act1.xEnd] and asserts 100% solid floor
 * continuity with zero bottomless pits and zero fatal hazard tiles.
 */
export function auditAct1ZeroPits(room) {
  const act1 = room?.levelSchema?.acts?.find((a) => a.id === 'KI');
  const map = room?.map;
  if (!act1 || !map) {
    return { passed: false, pitColumns: [], hazardTiles: [], reason: 'Missing Act 1 or TileMap' };
  }

  const startCol = Math.max(1, Math.floor(act1.xStart));
  const endCol = Math.min(map.cols - 2, Math.floor(act1.xEnd));
  const pitColumns = [];
  const hazardTiles = [];

  for (let col = startCol; col <= endCol; col++) {
    // Must have solid ground support at floor rows (row 0 and row 1)
    let hasFloor = false;
    for (let row = 0; row <= Math.min(2, map.rows - 1); row++) {
      if (TileMap.isSolidType(map.get(col, row)) && map.get(col, row) !== tileTypes.HAZARD) {
        hasFloor = true;
        break;
      }
    }
    if (!hasFloor) {
      pitColumns.push(col);
    }

    for (let row = 0; row < map.rows; row++) {
      if (map.get(col, row) === tileTypes.HAZARD) {
        hazardTiles.push({ col, row });
      }
    }
  }

  const hasVisualDemo = Boolean(
    room.geysers?.some((g) => g.actId === 'KI' && g.demoVisual && g.x > room.spawnX) ||
    room.levelSchema?.kiVisualDemo ||
    room.springs?.some((sp) => sp.x > room.spawnX && sp.x <= endCol) ||
    room.enemies?.some((e) => e.x > room.spawnX && e.x <= endCol)
  );

  return {
    passed: pitColumns.length === 0 && hazardTiles.length === 0 && hasVisualDemo,
    checkedCols: endCol - startCol + 1,
    pitCount: pitColumns.length,
    hazardCount: hazardTiles.length,
    pitColumns,
    hazardTiles,
    hasVisualDemo,
    summary:
      pitColumns.length === 0 && hazardTiles.length === 0
        ? `0 pits, 0 hazards across ${endCol - startCol + 1} Act 1 cols`
        : `${pitColumns.length} pit cols, ${hazardTiles.length} hazards in Act 1`,
  };
}

/**
 * Headless Validator #2: Miyamoto Floor Route Audit (Novice Accessibility, |vx| <= 4.50 t/s)
 * Checks every floor-route transition (solid ground, geyser crests, platforms) against the
 * walking envelope at vx = 4.50 t/s.
 */
export function auditFloorRoute(room) {
  const floorRoute = room?.levelSchema?.routes?.floor;
  if (!floorRoute || !Array.isArray(floorRoute.segments) || floorRoute.segments.length < 2) {
    return { passed: false, failures: ['Missing floor route segments'], maxGap: 0 };
  }

  const maxWalkSpeed = MovementProfile.levelEngine.floorRouteMaxWalkSpeed; // 4.50 t/s
  const env = computeJumpEnvelope(maxWalkSpeed);
  const safetyMargin = 0.85; // 15% novice comfort margin
  const failures = [];
  let maxGap = 0;

  for (let i = 0; i < floorRoute.segments.length - 1; i++) {
    const a = floorRoute.segments[i];
    const b = floorRoute.segments[i + 1];
    const gapX = Math.max(0, b.xStart - a.xEnd);
    const deltaY = b.y - a.y;
    if (gapX > maxGap) maxGap = gapX;

    const allowedGap = env.maxHorizontalGapForDeltaY(deltaY) * safetyMargin;
    if (allowedGap < 0 || gapX > allowedGap) {
      failures.push(
        `Floor seg ${i}->${i + 1} (${a.id}->${b.id}): gap=${gapX.toFixed(2)}t, dy=${deltaY.toFixed(2)}t exceeds walk limit ${allowedGap.toFixed(2)}t`
      );
    }
  }

  return {
    passed: failures.length === 0,
    walkSpeedTarget: maxWalkSpeed,
    walkFlatRange: Number(env.flatJumpRangeTiles.toFixed(2)),
    segmentCount: floorRoute.segments.length,
    maxGap: Number(maxGap.toFixed(2)),
    failures,
    summary:
      failures.length === 0
        ? `${floorRoute.segments.length} segs · max gap ${maxGap.toFixed(1)}t ≤ walk range ${(env.flatJumpRangeTiles * safetyMargin).toFixed(1)}t`
        : `${failures.length} floor route failure(s)`,
  };
}

/**
 * Headless Validator #3: Miyamoto Ceiling Route Audit (Momentum Mastery, |vx| = 9.20 t/s)
 * Verifies a continuous traversable high-altitude trajectory at full sprint speed (9.20 t/s),
 * verifies every block exists in TileMap or enemy bounce-chain, and verifies rewards exist.
 */
export function auditCeilingRoute(room) {
  const ceilingRoute = room?.levelSchema?.routes?.ceiling;
  const map = room?.map;
  if (!ceilingRoute || !map || !Array.isArray(ceilingRoute.segments) || ceilingRoute.segments.length < 3) {
    return { passed: false, failures: ['Missing ceiling route segments'], maxGap: 0 };
  }

  const sprintSpeed = MovementProfile.levelEngine.ceilingRouteMinSprintSpeed; // 9.20 t/s
  const walkSpeed = MovementProfile.levelEngine.floorRouteMaxWalkSpeed; // 4.50 t/s
  const sprintEnv = computeJumpEnvelope(sprintSpeed);
  const walkEnv = computeJumpEnvelope(walkSpeed);
  const minElevDelta = MovementProfile.levelEngine.ceilingRouteMinElevationDelta;
  const floorY = room.levelSchema.floorBaselineY ?? 2.0;

  const failures = [];
  let maxGap = 0;
  let sprintOnlyGaps = 0;

  for (let i = 0; i < ceilingRoute.segments.length; i++) {
    const seg = ceilingRoute.segments[i];
    // Verify high-altitude elevation above floor route
    if (seg.y - floorY < minElevDelta) {
      failures.push(`Ceiling seg ${seg.id} at y=${seg.y} is not elevated >= ${minElevDelta}t above floor`);
    }

    // Verify physical terrain support exists at segment coordinates (unless geyser/bounce node)
    if (seg.kind === 'tile') {
      const supportRow = Math.floor(seg.y) - 1;
      let solidCount = 0;
      for (let col = Math.floor(seg.xStart); col < Math.ceil(seg.xEnd); col++) {
        const t = map.get(col, supportRow);
        if (TileMap.isSolidType(t) || TileMap.isSemisolidType(t)) solidCount++;
      }
      if (solidCount === 0) {
        failures.push(`Ceiling seg ${seg.id} (${seg.xStart}..${seg.xEnd} @ y=${seg.y}) has no backing tiles`);
      }
    }

    if (i < ceilingRoute.segments.length - 1) {
      const next = ceilingRoute.segments[i + 1];
      const gapX = Math.max(0, next.xStart - seg.xEnd);
      const deltaY = next.y - seg.y;
      if (gapX > maxGap) maxGap = gapX;

      const sprintLimit = sprintEnv.maxHorizontalGapForDeltaY(deltaY) * 0.92;
      const walkLimit = walkEnv.maxHorizontalGapForDeltaY(deltaY);
      if (sprintLimit < 0 || gapX > sprintLimit) {
        failures.push(
          `Ceiling seg ${seg.id}->${next.id}: gap=${gapX.toFixed(2)}t, dy=${deltaY.toFixed(2)}t exceeds 9.20 t/s sprint limit ${sprintLimit.toFixed(2)}t`
        );
      }
      if (gapX > walkLimit) {
        sprintOnlyGaps++;
      }
    }
  }

  const ceilingStars = (room.starMedallions || []).filter((m) => m.route === 'ceiling').length;
  const highSkillStars = (room.starMedallions || []).filter(
    (m) => m.route === 'ceiling' || m.route === 'mastery' || m.route === 'observation' || m.route === 'secret'
  ).length;
  const ceilingOneUp = (room.secretCaches || []).some((c) => c.route === 'ceiling' && c.rewardType === '1UP');
  const hasBounceChain = ceilingRoute.segments.some((s) => Boolean(s.bounceEnemy));

  if (ceilingStars < 2 && !(ceilingStars >= 1 && highSkillStars >= 3)) {
    failures.push(`Ceiling route should reward >= 2 Star Medallions (found ${ceilingStars})`);
  }
  if (!ceilingOneUp) {
    failures.push('Ceiling route must include a Secret 1-UP Cache');
  }

  return {
    passed: failures.length === 0 && sprintOnlyGaps >= 3,
    sprintSpeedTarget: sprintSpeed,
    sprintFlatRange: Number(sprintEnv.flatJumpRangeTiles.toFixed(2)),
    segmentCount: ceilingRoute.segments.length,
    maxGap: Number(maxGap.toFixed(2)),
    sprintOnlyGaps,
    ceilingStars,
    ceilingOneUp,
    hasBounceChain,
    failures,
    summary:
      failures.length === 0
        ? `${ceilingRoute.segments.length} segs · max gap ${maxGap.toFixed(1)}t ≤ sprint ${sprintEnv.flatJumpRangeTiles.toFixed(1)}t · ${sprintOnlyGaps} sprint-only leaps`
        : `${failures.length} ceiling route failure(s)`,
  };
}

/**
 * Headless Validator #4: Complete 10-Point Nintendo Architectural Audit
 * Directly evaluates all 10 checks from `NINTENDO_LEVEL_DESIGN_WISDOM.md` Section 5.
 */
export function runTenPointNintendoAudit(room, options = {}) {
  const schema = room?.levelSchema;
  const rawLintReport = room?.map ? lintTileMapGeometry(room.map, room.name || 'Level') : { passed: false, mismatches: [{ reason: 'Missing TileMap' }] };
  const lintReport = {
    ...rawLintReport,
    errorCount: rawLintReport.mismatches?.length ?? (rawLintReport.passed ? 0 : 1),
  };
  const act1Audit = auditAct1ZeroPits(room);
  const floorAudit = auditFloorRoute(room);
  const ceilingAudit = auditCeilingRoute(room);

  // Check #4 & #10: Prove Twist activation keeps Transcendental Physics 100% invariant
  const snapBefore = captureTranscendentalSnapshot();
  const runtimeProbe = new LevelGimmickRuntime();
  runtimeProbe.loadRoom(room);
  runtimeProbe.updateGeysers(MovementProfile.simulation.fixedTimeStep);
  runtimeProbe.triggerTwistInversion([]);
  runtimeProbe.updateGeysers(MovementProfile.simulation.fixedTimeStep);
  const snapAfter = captureTranscendentalSnapshot();
  const invarianceAudit = verifyTranscendentalInvariance(snapBefore, snapAfter);

  // Check #1: Single-Concept Focus (exact 3-word concept)
  const conceptWords = (schema?.conceptThreeWords || '').trim().split(/\s+/).filter(Boolean);
  const check1Pass = conceptWords.length === 3 && Boolean(schema?.perLevelGimmick?.id);

  // Check #2: Safe Introduction (Ki) — Zero pits, zero hazards, visual demo landmark
  const check2Pass = act1Audit.passed;

  // Check #3: Transcendental Layering — Gimmick combined with stomps, shells, geometric blocks & course mechanics
  const hasEnemies = (room?.enemies?.length || 0) >= 2;
  const hasHopliteShell = Boolean(room?.enemies?.some((e) => e.kind === 'hoplite' || e.kind === 'koopa'));
  const hasInteractiveBlocks = Boolean(room?.powerUpBlocks?.length || schema?.singleTiles?.some((t) => t.type === tileTypes.QUESTION_BLOCK || t.type === 'QUESTION_BLOCK'));
  const gimmickCount =
    (room?.geysers?.length || 0) +
    (room?.horizontalJets?.length || 0) +
    (room?.springs?.length || 0) +
    (room?.propPlatforms?.length || 0);
  const hasCourseGimmick = gimmickCount >= 2 || Boolean(schema?.perLevelGimmick?.id);
  const check3Pass = hasEnemies && (hasHopliteShell || (room?.springs?.length || 0) >= 2) && hasInteractiveBlocks && hasCourseGimmick;

  // Check #4: The Valid Twist (Ten) — Course-specific Act 3 twist activates cleanly with 0 physics drift
  const hasInvertibleGeysers = (room?.geysers || []).some((g) => g.invertible);
  const hasAntiPhasePlats = (room?.propPlatforms || []).filter((p) => p.antiPhaseGroup).length >= 2;
  const hasHorizontalJets = (room?.horizontalJets?.length || 0) >= 1;
  const hasShellCorridorTwist = Boolean(schema?.twistKind === 'shell_corridor' && (room?.enemies?.length || 0) >= 8);
  const hasChimneyTwist = Boolean(schema?.twistKind === 'wall_chimney' && (room?.propPlatforms?.length || 0) >= 1);
  const hasTwistFeature =
    (hasInvertibleGeysers && hasAntiPhasePlats) ||
    hasHorizontalJets ||
    hasShellCorridorTwist ||
    hasChimneyTwist;
  const check4Pass =
    hasTwistFeature &&
    runtimeProbe.twistActive &&
    invarianceAudit.invariant;

  // Check #5: Anticipated Herald — Signpost/Gate placed at Act 3 entry with >= 4t anticipation sightline
  const act3 = schema?.acts?.find((a) => a.id === 'TEN');
  const herald = room?.twistHerald;
  const check5Pass = Boolean(
    herald &&
      act3 &&
      herald.x >= act3.xStart &&
      herald.x <= act3.xStart + 8 &&
      (herald.anticipationRangeTiles ?? MovementProfile.levelEngine.heraldAnticipationRangeTiles) >= 4.0
  );

  // Check #6: Dual-Skill Routing — Both Floor (<= 4.50 t/s) and Ceiling (>= 9.20 t/s) pass validation
  const check6Pass = floorAudit.passed && ceilingAudit.passed;

  // Check #7: Safeguarded Surprises — All elevated/falling threats have buffer ledges with >= 24f telegraph
  const minTelegraph = MovementProfile.levelEngine.safeguardMinTelegraphFrames;
  const safeguards = schema?.safeguardLedges || [];
  const check7Pass =
    safeguards.length >= 2 &&
    safeguards.every((sg) => sg.telegraphFrames >= minTelegraph);

  // Check #8: Star Coin / Secret Incentives — Exactly 3 Star Medallions + Secret 1-UP on high-skill paths
  const stars = room?.starMedallions || [];
  const caches = room?.secretCaches || [];
  const validStarRoutes = new Set(['ceiling', 'mastery', 'observation', 'secret']);
  const check8Pass =
    stars.length === MovementProfile.levelEngine.starMedallionCount &&
    stars.every((m) => validStarRoutes.has(m.route)) &&
    caches.some((c) => c.rewardType === '1UP' && c.route === 'ceiling');

  // Check #9: Rewarding Climax (Ketsu) — Flagpole, Exit Pipe, or Pinnacle Goal Medallion in Act 4
  const act4 = schema?.acts?.find((a) => a.id === 'KETSU');
  const fp = room?.flagpole;
  const goalPipe = (room?.warpTubes || []).find((t) => t.isGoalPipe && act4 && t.x >= act4.xStart);
  const pinnacleGoal = room?.pinnacleGoal && act4 && room.pinnacleGoal.x >= act4.xStart ? room.pinnacleGoal : null;
  const climaxGeyser = (room?.geysers || []).find(
    (g) => g.actId === 'KETSU' && (
      (fp && fp.x - (g.x + g.width) <= 6.5 && fp.x - g.x > 1.5) ||
      (pinnacleGoal && pinnacleGoal.x - g.x <= 16.0 && pinnacleGoal.x > g.x)
    )
  );
  const climaxPyramid = Boolean(schema?.climaxKind === 'stair_pyramid' && fp && act4 && fp.x >= act4.xStart);
  const climaxFallAway = Boolean(goalPipe && (room?.propPlatforms || []).filter((p) => p.mode === PlatformMode.FALL_AWAY).length >= 3);
  const check9Pass = Boolean(
    act4 && (
      (fp && fp.x >= act4.xStart && (climaxGeyser || climaxPyramid)) ||
      (pinnacleGoal && climaxGeyser) ||
      climaxFallAway
    )
  );

  // Check #10: Zero Physics Drift — GeometryLint 0 errors + Transcendental invariance 0 diffs + optional determinism hash check
  const deterministicOk = options.deterministicHashMatch !== false;
  const check10Pass = Boolean(lintReport.passed) && invarianceAudit.invariant && deterministicOk;

  const climaxMeasured = climaxGeyser && fp
    ? `Climax Geyser @ x=${climaxGeyser.x}t -> Flagpole @ x=${fp.x}t`
    : climaxGeyser && pinnacleGoal
      ? `Climax Geyser Elevator @ x=${climaxGeyser.x}t -> Pinnacle Goal @ x=${pinnacleGoal.x}t`
      : climaxPyramid && fp
        ? `Stair Pyramid Launch -> High-Altitude Flagpole @ x=${fp.x}t`
        : climaxFallAway && goalPipe
          ? `3× Oscillating Fall-Away Gauntlet -> Exit Pipe @ x=${goalPipe.x}t`
          : 'Missing climax launch';

  const twistMeasured = hasHorizontalJets
    ? `Horizontal Hydro-Jets (vx=${MovementProfile.world1.horizontalJetSpeed.toFixed(1)} t/s) · 0 diffs`
    : hasShellCorridorTwist
      ? '6-Enemy Hoplite Shell Corridor (1-UP) · 0 diffs'
      : hasChimneyTwist
        ? 'Wall-Jump Chimney + Ascending Platform · 0 diffs'
        : check4Pass
          ? 'Inverted geysers + 180° anti-phase · 0 diffs'
          : 'Twist invalid or physics drifted';

  const checks = [
    {
      id: 1,
      key: 'single_concept',
      name: '1. Single-Concept Focus',
      axiom: 'Axiom 1',
      passed: check1Pass,
      target: '3-word level identity + cohesive gimmick',
      measured: `"${schema?.conceptThreeWords || 'N/A'}" (${conceptWords.length} words)`,
    },
    {
      id: 2,
      key: 'safe_intro_ki',
      name: '2. Safe Introduction (Ki)',
      axiom: 'Axiom 2 · Act 1',
      passed: check2Pass,
      target: '0 pits, 0 hazards, visual demo landmark',
      measured: act1Audit.summary,
    },
    {
      id: 3,
      key: 'transcendental_layering',
      name: '3. Transcendental Layering',
      axiom: 'Axiom 1',
      passed: check3Pass,
      target: 'Gimmick layered atop stomps, shells & blocks',
      measured: `${gimmickCount} gimmick props · ${room?.enemies?.length || 0} enemies · blocks`,
    },
    {
      id: 4,
      key: 'valid_twist_ten',
      name: '4. The Valid Twist (Ten)',
      axiom: 'Axiom 2 · Act 3',
      passed: check4Pass,
      target: 'Anticipated mechanic twist with 0 physics drift',
      measured: twistMeasured,
    },
    {
      id: 5,
      key: 'anticipated_herald',
      name: '5. Anticipated Herald',
      axiom: 'Axiom 2 · Act 3',
      passed: check5Pass,
      target: 'Visual signpost + rumble >= 4.0t ahead',
      measured: herald
        ? `Herald @ x=${herald.x}t · ${(herald.anticipationRangeTiles ?? MovementProfile.levelEngine.heraldAnticipationRangeTiles).toFixed(1)}t sightline`
        : 'Missing Twist Herald',
    },
    {
      id: 6,
      key: 'dual_skill_routing',
      name: '6. Dual-Skill Routing',
      axiom: 'Axiom 3',
      passed: check6Pass,
      target: 'Floor <=4.50 t/s & Ceiling >=9.20 t/s',
      measured: `Floor max ${floorAudit.maxGap}t · Ceiling max ${ceilingAudit.maxGap}t (${ceilingAudit.sprintOnlyGaps} sprint leaps)`,
    },
    {
      id: 7,
      key: 'safeguarded_surprises',
      name: '7. Safeguarded Surprises',
      axiom: 'Axiom 4',
      passed: check7Pass,
      target: `Intermediate ledges >= ${minTelegraph}f telegraph`,
      measured: safeguards.length
        ? `${safeguards.length} safeguard ledges · min ${Math.min(...safeguards.map((s) => s.telegraphFrames))}f`
        : 'None',
    },
    {
      id: 8,
      key: 'star_incentives',
      name: '8. Star Coin / Secret Incentives',
      axiom: 'Axiom 3',
      passed: check8Pass,
      target: '3 Star Medallions + 1-UP on high/mastery path',
      measured: `${stars.length} Star Medallions · ${caches.length} Secret 1-UP Cache`,
    },
    {
      id: 9,
      key: 'rewarding_climax_ketsu',
      name: '9. Rewarding Climax (Ketsu)',
      axiom: 'Axiom 2 · Act 4',
      passed: check9Pass,
      target: 'Climactic gimmick finale to Course Goal',
      measured: climaxMeasured,
    },
    {
      id: 10,
      key: 'zero_physics_drift',
      name: '10. Zero Physics Drift',
      axiom: 'Axiom 1 & 5',
      passed: check10Pass,
      target: '0 GeometryLint errors · 0 physics diffs',
      measured: `Lint errors: ${lintReport.errorCount} · Physics diffs: ${invarianceAudit.diffs.length}`,
    },
  ];

  const score = checks.filter((c) => c.passed).length;

  return {
    levelTitle: room?.name || schema?.title || 'Untitled Level',
    conceptThreeWords: schema?.conceptThreeWords || '',
    score,
    maxScore: 10,
    passed: score === 10,
    checks,
    act1Audit,
    floorAudit,
    ceilingAudit,
    invarianceAudit,
    lintReport,
  };
}

// ─── 5. DATA-DRIVEN KISHŌTENKETSU LEVEL BUILDER ──────────────────────────────

/**
 * Compile a declarative Kishōtenketsu Level Schema into a playable GameEngine Room.
 */
export function buildKishotenketsuLevel(schema) {
  const map = new TileMap(schema.cols, schema.rows);

  // Outer perimeter walls
  map.fillRect(0, 0, 1, schema.rows, S);
  map.fillRect(schema.cols - 1, 0, 1, schema.rows, S);

  // Stamp rectangular tile regions
  for (const rect of schema.tileRects || []) {
    map.fillRect(rect.x, rect.y, rect.w, rect.h, rect.type);
  }

  // Stamp single tiles (Question blocks, Brick blocks, Hard blocks, Hazards)
  for (const cell of schema.singleTiles || []) {
    map.set(cell.x, cell.y, cell.type);
  }

  return {
    name: schema.roomName,
    courseCode: schema.code || null,
    theme: schema.theme || 'plains',
    isKishotenketsu: true,
    isWorld1Course: Boolean(schema.isWorld1Course),
    levelSchema: schema,
    map,
    spawnX: schema.spawnX,
    spawnY: schema.spawnY,
    floorY: schema.floorBaselineY,
    chasmRescue: true,
    initialPowerUp: schema.initialPowerUp || 'super',
    acts: schema.acts,
    geysers: schema.geysers || [],
    horizontalJets: schema.horizontalJets || [],
    pinnacleGoal: schema.pinnacleGoal || null,
    twistHerald: schema.twistHerald,
    propPlatforms: schema.propPlatforms || [],
    springs: schema.springs || [],
    warpTubes: schema.warpTubes || [],
    powerUpBlocks: schema.powerUpBlocks || [],
    enemies: schema.enemies || [],
    coins: schema.coins || [],
    starMedallions: schema.starMedallions || [],
    secretCaches: schema.secretCaches || [],
    flagpole: schema.flagpole || null,
    foregroundProps: schema.foregroundProps || [],
    slopeCues: schema.slopeCues || [],
    description: schema.description,
  };
}

// ─── 6. FLAGSHIP STAGE 17 COURSE: WATER SPOUT BEACH ──────────────────────────

/**
 * Create Room 11: "Water Spout Beach" — Flagship Stage 17 Kishōtenketsu Course
 * ============================================================================
 * 3-Word Identity: "Water Spout Beach"
 * Length: 216 tiles × 24 rows
 *
 * Act 1 · Ki (cols 0..50):
 *   100% solid floor (ZERO pits, ZERO hazards). Visual Water Geyser #1 lifts a golden
 *   coin column right inside the opening viewport. Safe Observation Deck + Geyser #2
 *   introduce geyser rising jump-boost alongside transcendental Sproutling & [?] blocks.
 *
 * Act 2 · Shō (cols 51..104):
 *   Real chasms & crimson spikes bridged by rhythmic Water Geysers (#3, #4, #5) and
 *   Sproutling patrols with Safeguard Ledges (>= 24f telegraph). Elevated Ceiling Route
 *   requires full sprint (9.20 t/s) and yields Star Medallion #1 + Secret 1-UP Cache!
 *
 * Act 3 · Ten (cols 105..159):
 *   Anticipated Twist Herald at x=107 triggers Tide Inversion (6.5t anticipation sightline,
 *   audio rumble + visual gate): Water Geysers (#6, #7, #8) reverse flow into an inverted
 *   cascade while Anti-Phase Platforms oscillate in 180° opposition, leading into Miyamoto's
 *   6-Sproutling Hoplite Shell Corridor! Ceiling Route yields Star Medallion #2 + Skip Lane.
 *
 * Act 4 · Ketsu (cols 160..215):
 *   High-energy mastery cascade of climax Water Geysers (#9, #10, #11) with Star Medallion #3
 *   suspended at peak mastery arc, culminating in Climax Geyser #12 launching directly onto
 *   the golden finial of the Goal Flagpole (x = 203.5)!
 */
export function createWaterSpoutBeach() {
  const cols = 216;
  const rows = 24;

  const acts = [
    {
      ...KISHOTENKETSU_ACTS.KI,
      xStart: 1,
      xEnd: 50,
      spawnX: 3.0,
      spawnY: 2.5,
      signpostY: 2.0,
      safetyGuarantee: '100% solid floor below; zero bottomless pits, zero hazards',
    },
    {
      ...KISHOTENKETSU_ACTS.SHO,
      xStart: 51,
      xEnd: 102,
      spawnX: 52.0,
      spawnY: 2.5,
      signpostY: 2.0,
      safetyGuarantee: 'Graduated chasms bridged by geysers + safeguard ledges (>= 24f telegraph)',
    },
    {
      ...KISHOTENKETSU_ACTS.TEN,
      xStart: 103,
      xEnd: 159,
      spawnX: 103.2,
      spawnY: 2.5,
      signpostY: 2.0,
      safetyGuarantee: 'Anticipated Twist Herald reverses geysers & engages 180° anti-phase platforms',
    },
    {
      ...KISHOTENKETSU_ACTS.KETSU,
      xStart: 160,
      xEnd: 214,
      spawnX: 161.5,
      spawnY: 2.5,
      signpostY: 2.0,
      safetyGuarantee: 'Peak mastery water-spout cascade launching directly into the Goal Flagpole',
    },
  ];

  // ── Solid Terrain, Semisolids, Pipes & Hazards ─────────────────────────────
  const tileRects = [
    // ── ACT 1: KI (cols 1..50) — 100% SOLID FLOOR, ZERO PITS, ZERO HAZARDS ──
    { x: 1, y: 0, w: 50, h: 2, type: S },
    // Safe observation semisolid deck beside Geyser #1 (guides player up cleanly)
    { x: 19, y: 5, w: 6, h: 1, type: SEMI },
    // Act 1 interactive Brick / Question practice deck (cols 34..38 @ row 5)
    { x: 34, y: 5, w: 5, h: 1, type: B },
    // Act 1 Ceiling Route On-Ramp (reachable from Geyser #2 peak or Sprint jump)
    { x: 36, y: 9, w: 6, h: 1, type: M },
    { x: 46, y: 10, w: 5, h: 1, type: M },

    // ── ACT 2: SHŌ (cols 51..104) — DEVELOPMENT & ESCALATION ────────────────
    // Floor Island 2A (cols 51..60) + Safeguard Ledge #1 (cols 55..59 @ row 5)
    { x: 51, y: 0, w: 10, h: 2, type: S },
    { x: 55, y: 5, w: 5, h: 1, type: SEMI },
    // Chasm 2A (cols 61..68) bridged by Water Geyser #3 (x=63.2)
    // Floor Island 2B (cols 69..80) with 2-tile spike hazard pocket & safe semisolid bypass
    { x: 69, y: 0, w: 12, h: 2, type: S },
    { x: 73, y: 2, w: 2, h: 1, type: HAZ }, // 2t spike bed on solid backing
    { x: 72, y: 4, w: 5, h: 1, type: SEMI }, // Safe novice hop-over bridge
    // Chasm 2B (cols 81..92) bridged by Water Geysers #4 (x=83.0) & #5 (x=88.2)
    // Floor Island 2C (cols 93..109) leading cleanly into Act 3 Twist Herald
    { x: 93, y: 0, w: 17, h: 2, type: S },
    // Safeguard Ledge #2 (cols 97..101 @ row 5) before Act 3 entry
    { x: 97, y: 5, w: 5, h: 1, type: SEMI },

    // Act 2 Ceiling Route (Momentum Mastery |vx| = 9.20 t/s, 5.0–5.5t sprint leaps)
    { x: 55, y: 10, w: 5, h: 1, type: M }, // Gap 4.0t from col 51
    { x: 65, y: 11, w: 5, h: 1, type: M }, // Gap 5.0t -> Star Medallion #1!
    { x: 75, y: 10, w: 5, h: 1, type: M }, // Gap 5.0t -> Sproutling bounce node
    { x: 85, y: 11, w: 5, h: 1, type: M }, // Gap 5.0t
    { x: 95, y: 10, w: 5, h: 1, type: M }, // Gap 5.0t -> Secret 1-UP Cache!

    // ── ACT 3: TEN (cols 105..159) — THE ANTICIPATED TWIST ──────────────────
    // Tide Inversion Canyon (cols 110..132) with Inverted Geysers #6,#7,#8 + Anti-Phase Platforms
    // Safe floor island mid-canyon (cols 119..124) with guarded crimson spike pocket underneath anti-phase bridge
    { x: 119, y: 0, w: 6, h: 2, type: S },
    { x: 121, y: 2, w: 2, h: 1, type: HAZ }, // Spike pocket bypassed by anti-phase platforms / inverted geysers
    // Shell-Bowling & Spike-Synthesis Corridor (cols 133..159)
    { x: 133, y: 0, w: 27, h: 2, type: S },
    { x: 134, y: 2, w: 2, h: 2, type: P }, // Entry 2t Emerald Pipe
    { x: 156, y: 2, w: 2, h: 2, type: P }, // Backstop 2t Emerald Pipe (ricochet arena for 6 Sproutlings!)
    // Safe Floor Bypass Semisolid Canopy above bowling lane for cautious novices
    { x: 140, y: 5, w: 12, h: 1, type: SEMI },

    // Act 3 Ceiling Route (Sprint Momentum Chain over Twist Canyon & Shell Corridor)
    { x: 105, y: 10, w: 5, h: 1, type: SEMI }, // Stemless sky bridge cleanly clearing Twist Herald gate below!
    { x: 115, y: 11, w: 5, h: 1, type: M }, // Gap 5.0t
    { x: 125, y: 12, w: 5, h: 1, type: M }, // Gap 5.0t -> Star Medallion #2!
    { x: 135, y: 11, w: 5, h: 1, type: M }, // Gap 5.0t -> Sproutling bounce node
    { x: 145, y: 11, w: 5, h: 1, type: M }, // Gap 5.0t -> High shortcut lane
    { x: 155, y: 10, w: 5, h: 1, type: M }, // Gap 5.0t

    // ── ACT 4: KETSU (cols 160..215) — CLIMAX & GOAL FLAGPOLE ───────────────
    // Alternating Landing Islands + Peak Water Geyser Cascade (#9, #10, #11)
    { x: 160, y: 0, w: 6, h: 2, type: S },
    { x: 170, y: 0, w: 4, h: 2, type: S },
    { x: 178, y: 0, w: 4, h: 2, type: S },
    // Final Climax Deck & Flagpole Plaza (cols 187..214)
    { x: 187, y: 0, w: 28, h: 2, type: S },

    // Act 4 Ceiling Mastery Platforms -> Star Medallion #3 -> Flagpole Summit!
    { x: 165, y: 10, w: 5, h: 1, type: M }, // Gap 5.0t
    { x: 175, y: 11, w: 5, h: 1, type: M }, // Gap 5.0t -> Star Medallion #3!
    { x: 185, y: 10, w: 5, h: 1, type: M }, // Gap 5.0t -> Launches onto Climax Geyser #12 / Flagpole!

    // Classic Hard-Block Flagpole Staircase (cols 189..193) + Pedestal (col 203)
    { x: 189, y: 2, w: 1, h: 1, type: H },
    { x: 190, y: 2, w: 1, h: 2, type: H },
    { x: 191, y: 2, w: 1, h: 3, type: H },
    { x: 192, y: 2, w: 2, h: 4, type: H },
    { x: 203, y: 2, w: 1, h: 1, type: H }, // Flagpole anchor pedestal (baseY = 3.0)
  ];

  // Interactive Question & Brick blocks (Miyamoto Self-Inflicted Teaching Bait!)
  const singleTiles = [
    { x: 8, y: 5, type: Q },   // Act 1 Question Mark Bait -> Super Mushroom!
    { x: 9, y: 5, type: B },
    { x: 10, y: 5, type: Q },  // Coin block
    { x: 36, y: 5, type: Q },  // Act 1 second [?] block
    { x: 70, y: 5, type: Q },  // Act 2 Fire Flower [?] block
    { x: 102, y: 5, type: Q }, // Pre-Twist Adaptive Power-Up
    { x: 162, y: 5, type: Q }, // Act 4 Climax Power-Up
  ];

  const powerUpBlocks = [
    { col: 8, row: 5, item: 'super_mushroom' },
    { col: 70, row: 5, item: 'fire_flower' },
    { col: 102, row: 5, item: 'adaptive_powerup' },
    { col: 162, row: 5, item: 'fire_flower' },
  ];

  // ── Per-Level Gimmick: Water Geysers (Layer cleanly atop invariant platforms) ──
  const geysers = [
    // Act 1 Ki: Visual Demonstration Geyser #1 right in opening viewport (zero pit below!)
    {
      id: 'geyser_ki_demo',
      actId: 'KI',
      x: 14.2,
      baseY: 2.0,
      width: 2.6,
      minHeight: 1.2,
      maxHeight: 4.5,
      periodSec: 3.2,
      phase: 0.15,
      invertible: false,
      demoVisual: true,
      label: 'WATER SPOUT',
    },
    // Act 1 Ki: Second safe practice geyser feeding Ceiling Route on-ramp
    {
      id: 'geyser_ki_ramp',
      actId: 'KI',
      x: 28.5,
      baseY: 2.0,
      width: 2.6,
      minHeight: 1.4,
      maxHeight: 5.4,
      periodSec: 3.4,
      phase: 0.55,
      invertible: false,
      demoVisual: false,
      label: 'HIGH ROUTE',
    },
    // Act 2 Shō: Chasm 2A bridge geyser (novice walkable <= 4.50 t/s!)
    {
      id: 'geyser_sho_1',
      actId: 'SHO',
      x: 63.2,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.2,
      maxHeight: 6.4,
      periodSec: 3.4,
      phase: 0.1,
      invertible: false,
    },
    // Act 2 Shō: Chasm 2B twin rhythmic geysers
    {
      id: 'geyser_sho_2',
      actId: 'SHO',
      x: 82.8,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.2,
      maxHeight: 6.0,
      periodSec: 3.4,
      phase: 0.0,
      invertible: false,
    },
    {
      id: 'geyser_sho_3',
      actId: 'SHO',
      x: 88.0,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.4,
      maxHeight: 6.6,
      periodSec: 3.4,
      phase: 0.4,
      invertible: false,
    },
    // Act 3 Ten: Invertible Tide Canyon Geysers (reverse flow on Twist Herald!)
    {
      id: 'geyser_ten_1',
      actId: 'TEN',
      x: 111.5,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.3,
      maxHeight: 6.8,
      periodSec: 3.2,
      phase: 0.0,
      invertible: true,
      label: 'INVERTIBLE',
    },
    {
      id: 'geyser_ten_2',
      actId: 'TEN',
      x: 115.6,
      baseY: 0.0,
      width: 2.6,
      minHeight: 2.5,
      maxHeight: 7.2,
      periodSec: 3.2,
      phase: 0.5,
      invertible: true,
    },
    {
      id: 'geyser_ten_3',
      actId: 'TEN',
      x: 126.2,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.3,
      maxHeight: 6.8,
      periodSec: 3.2,
      phase: 0.25,
      invertible: true,
    },
    {
      id: 'geyser_ten_4',
      actId: 'TEN',
      x: 129.8,
      baseY: 0.0,
      width: 2.6,
      minHeight: 2.3,
      maxHeight: 6.5,
      periodSec: 3.2,
      phase: 0.75,
      invertible: true,
    },
    // Act 4 Ketsu: Peak Mastery Cascade & Flagpole Launch Geyser!
    {
      id: 'geyser_ketsu_1',
      actId: 'KETSU',
      x: 166.6,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.4,
      maxHeight: 7.4,
      periodSec: 3.0,
      phase: 0.0,
      invertible: true,
    },
    {
      id: 'geyser_ketsu_2',
      actId: 'KETSU',
      x: 174.6,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.4,
      maxHeight: 7.6,
      periodSec: 3.0,
      phase: 0.5,
      invertible: true,
    },
    {
      id: 'geyser_ketsu_3',
      actId: 'KETSU',
      x: 183.0,
      baseY: 0.0,
      width: 2.8,
      minHeight: 2.4,
      maxHeight: 7.8,
      periodSec: 3.0,
      phase: 0.2,
      invertible: true,
    },
    // Final Flagpole Climax Geyser (launches straight onto top golden finial of Flagpole x=203.5!)
    {
      id: 'geyser_ketsu_finale',
      actId: 'KETSU',
      x: 196.2,
      baseY: 2.0,
      width: 2.8,
      minHeight: 1.6,
      maxHeight: 7.4,
      periodSec: 2.8,
      phase: 0.1,
      invertible: true,
      label: 'GOAL LAUNCH!',
    },
  ];

  // ── Act 3 Anti-Phase Oscillating Platform Pair (180° Opposition) ───────────
  const propPlatforms = [
    {
      id: 'plat_antiphase_a',
      antiPhaseGroup: 'ten_canyon',
      mode: PlatformMode.SINE,
      startX: 118.2,
      startY: 5.0,
      endX: 118.2,
      endY: 8.2,
      periodSec: 3.2,
      phase: 0.0,
      width: 3.0,
      height: 0.45,
      oneWay: true,
      label: 'ANTI-PHASE A',
    },
    {
      id: 'plat_antiphase_b',
      antiPhaseGroup: 'ten_canyon',
      mode: PlatformMode.SINE,
      startX: 122.4,
      startY: 5.0,
      endX: 122.4,
      endY: 8.2,
      periodSec: 3.2,
      phase: 0.5, // Exact 180° anti-phase!
      width: 3.0,
      height: 0.45,
      oneWay: true,
      label: 'ANTI-PHASE B',
    },
  ];

  // ── Act 3 Anticipated Twist Herald ─────────────────────────────────────────
  const twistHerald = {
    id: 'herald_tide_inversion',
    x: 108.0,
    baseY: 2.0,
    height: 6.0,
    anticipationRangeTiles: MovementProfile.levelEngine.heraldAnticipationRangeTiles,
    triggerHalfWidth: MovementProfile.levelEngine.heraldTriggerHalfWidth,
    label: 'ACT 3 · TEN: TIDE INVERSION!',
  };

  // ── Safeguard Ledges Metadata (Axiom 4.4 & Audit Check #7: >= 24f telegraph) ──
  const safeguardLedges = [
    {
      id: 'safeguard_sho_1',
      actId: 'SHO',
      xStart: 55,
      xEnd: 60,
      y: 6.0,
      enemyKind: 'sproutling',
      telegraphFrames: 36, // Sproutling walks at 1.25 t/s across 5t ledge before approaching edge
    },
    {
      id: 'safeguard_sho_2',
      actId: 'SHO',
      xStart: 97,
      xEnd: 102,
      y: 6.0,
      enemyKind: 'sproutling',
      telegraphFrames: 36,
    },
    {
      id: 'safeguard_ten_canopy',
      actId: 'TEN',
      xStart: 140,
      xEnd: 152,
      y: 6.0,
      enemyKind: 'sproutling',
      telegraphFrames: 42,
    },
  ];

  // ── Transcendental Enemies (Sproutlings & Hoplite 6-Enemy 1-UP Bowling Corridor) ──
  const enemies = [
    // Act 1 Ki: Single friendly Sproutling on wide solid floor (safe stomp warmup)
    { kind: 'sproutling', x: 42.0, y: 2.0, dir: -1, turnAtLedges: true },

    // Act 2 Shō: Safeguard ledge patrols + Island 2B patrol + Ceiling Route bounce-chain node
    { kind: 'sproutling', x: 57.5, y: 6.0, dir: -1, turnAtLedges: true },
    { kind: 'sproutling', x: 78.2, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'sproutling', x: 99.5, y: 6.0, dir: -1, turnAtLedges: true },
    // Ceiling Route bounce-chain enemy (Act 2)
    { kind: 'sproutling', x: 77.5, y: 11.0, dir: -1, turnAtLedges: true },

    // Act 3 Ten: Miyamoto's 6-Sproutling Hoplite Shell Corridor (cols 136..155)
    // Stomp Hoplite -> Kick right @ 12.00 t/s -> 200->400->800->1000->2000->4000 + 1-UP!
    { kind: 'hoplite', x: 138.0, y: 2.0, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 142.0, y: 2.0, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 144.2, y: 2.0, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 146.4, y: 2.0, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 148.6, y: 2.0, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 150.8, y: 2.0, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 153.0, y: 2.0, dir: -1, turnAtLedges: false },
    // Ceiling Route bounce-chain enemy (Act 3)
    { kind: 'sproutling', x: 137.5, y: 12.0, dir: -1, turnAtLedges: true },

    // Act 4 Ketsu: Climax guard Sproutling on landing island
    { kind: 'sproutling', x: 180.0, y: 2.0, dir: -1, turnAtLedges: true },
  ];

  // ── 3 Secret Star Medallions (Audit #8: exclusively on Mastery / Ceiling Route!) ──
  const starMedallions = [
    { id: 'star_1_sho', x: 67.5, y: 12.8, actId: 'SHO', route: 'ceiling' },
    { id: 'star_2_ten', x: 127.5, y: 13.8, actId: 'TEN', route: 'ceiling' },
    { id: 'star_3_ketsu', x: 177.5, y: 12.8, actId: 'KETSU', route: 'ceiling' },
  ];

  // ── Secret 1-UP Cache (Axiom 3 Incentive Rule on Ceiling Route!) ──────────
  const secretCaches = [
    { id: 'cache_1up_ceiling', x: 97.5, y: 11.8, actId: 'SHO', route: 'ceiling', rewardType: '1UP' },
  ];

  // ── Sightline Guidance Coins (Miyamoto Affordance Breadcrumbs) ────────────
  const coins = [
    // Act 1 Ki: Rightward vector bait & geyser visual arc (Geyser #1 has its own dedicated demo buoy)
    { x: 17.6, y: 7.6 },
    { x: 20.5, y: 6.8 },
    { x: 22.0, y: 6.8 },
    { x: 23.5, y: 6.8 },
    { x: 29.8, y: 8.2 },
    { x: 38.0, y: 10.6 },
    { x: 40.0, y: 10.6 },
    // Act 2 Shō: Floor & Ceiling sightlines
    { x: 64.6, y: 6.8 },
    { x: 74.0, y: 5.6 },
    { x: 84.2, y: 6.6 },
    { x: 89.4, y: 7.0 },
    { x: 57.5, y: 11.6 },
    { x: 87.5, y: 12.6 },
    // Act 3 Ten: Tide canyon & bowling lane sightline
    { x: 112.9, y: 7.2 },
    { x: 119.7, y: 9.0 },
    { x: 123.9, y: 9.0 },
    { x: 145.0, y: 6.8 },
    { x: 147.0, y: 6.8 },
    { x: 147.5, y: 12.6 },
    // Act 4 Ketsu: Climax launch arc right toward Goal Flagpole top!
    { x: 168.0, y: 8.2 },
    { x: 176.0, y: 8.4 },
    { x: 184.4, y: 8.6 },
    { x: 197.6, y: 10.4 },
    { x: 200.2, y: 11.8 },
    { x: 202.2, y: 12.6 },
  ];

  // ── Dual-Skill Route Descriptors (Consumed by Headless Validators) ────────
  const routes = {
    floor: {
      label: 'Floor Route (Accessible · |vx| <= 4.50 t/s)',
      maxWalkSpeed: MovementProfile.levelEngine.floorRouteMaxWalkSpeed,
      segments: [
        { id: 'ki_floor', kind: 'tile', xStart: 1, xEnd: 51, y: 2.0 },
        { id: 'sho_island_2a', kind: 'tile', xStart: 51, xEnd: 61, y: 2.0 },
        { id: 'sho_geyser_3', kind: 'geyser', xStart: 63.2, xEnd: 66.0, y: 3.5 },
        { id: 'sho_island_2b', kind: 'tile', xStart: 69, xEnd: 81, y: 2.0 },
        { id: 'sho_geyser_4', kind: 'geyser', xStart: 82.8, xEnd: 85.6, y: 3.5 },
        { id: 'sho_geyser_5', kind: 'geyser', xStart: 88.0, xEnd: 90.8, y: 3.5 },
        { id: 'sho_island_2c', kind: 'tile', xStart: 93, xEnd: 110, y: 2.0 },
        { id: 'ten_geyser_6', kind: 'geyser', xStart: 111.5, xEnd: 114.3, y: 3.8 },
        { id: 'ten_geyser_7', kind: 'geyser', xStart: 115.6, xEnd: 118.2, y: 4.0 },
        { id: 'ten_plat_a', kind: 'platform', xStart: 118.2, xEnd: 121.2, y: 5.5 },
        { id: 'ten_plat_b', kind: 'platform', xStart: 122.4, xEnd: 125.4, y: 5.5 },
        { id: 'ten_geyser_8', kind: 'geyser', xStart: 126.2, xEnd: 129.0, y: 3.8 },
        { id: 'ten_geyser_9', kind: 'geyser', xStart: 129.8, xEnd: 132.4, y: 3.5 },
        { id: 'ten_corridor', kind: 'tile', xStart: 133, xEnd: 160, y: 2.0 },
        { id: 'ketsu_island_1', kind: 'tile', xStart: 160, xEnd: 166, y: 2.0 },
        { id: 'ketsu_geyser_1', kind: 'geyser', xStart: 166.6, xEnd: 169.4, y: 3.5 },
        { id: 'ketsu_island_2', kind: 'tile', xStart: 170, xEnd: 174, y: 2.0 },
        { id: 'ketsu_geyser_2', kind: 'geyser', xStart: 174.6, xEnd: 177.4, y: 3.5 },
        { id: 'ketsu_island_3', kind: 'tile', xStart: 178, xEnd: 182, y: 2.0 },
        { id: 'ketsu_geyser_3', kind: 'geyser', xStart: 183.0, xEnd: 185.8, y: 3.5 },
        { id: 'ketsu_goal_plaza', kind: 'tile', xStart: 187, xEnd: 205, y: 2.0 },
      ],
    },
    ceiling: {
      label: 'Ceiling Route (Momentum Mastery · |vx| >= 9.20 t/s)',
      minSprintSpeed: MovementProfile.levelEngine.ceilingRouteMinSprintSpeed,
      rewards: ['3× Star Medallions', 'Secret 1-UP Cache', 'Act 3 High-Lane Shortcut'],
      segments: [
        { id: 'ceil_ki_ramp', kind: 'tile', xStart: 36, xEnd: 42, y: 10.0 },
        { id: 'ceil_ki_exit', kind: 'tile', xStart: 46, xEnd: 51, y: 11.0 },
        { id: 'ceil_sho_1', kind: 'tile', xStart: 55, xEnd: 60, y: 11.0 },
        { id: 'ceil_sho_2_star1', kind: 'tile', xStart: 65, xEnd: 70, y: 12.0, reward: 'star_1_sho' },
        { id: 'ceil_sho_3_bounce', kind: 'tile', xStart: 75, xEnd: 80, y: 11.0, bounceEnemy: 'sproutling' },
        { id: 'ceil_sho_4', kind: 'tile', xStart: 85, xEnd: 90, y: 12.0 },
        { id: 'ceil_sho_5_1up', kind: 'tile', xStart: 95, xEnd: 100, y: 11.0, reward: 'cache_1up_ceiling' },
        { id: 'ceil_ten_1_herald', kind: 'tile', xStart: 105, xEnd: 110, y: 11.0 },
        { id: 'ceil_ten_2', kind: 'tile', xStart: 115, xEnd: 120, y: 12.0 },
        { id: 'ceil_ten_3_star2', kind: 'tile', xStart: 125, xEnd: 130, y: 13.0, reward: 'star_2_ten' },
        { id: 'ceil_ten_4_bounce', kind: 'tile', xStart: 135, xEnd: 140, y: 12.0, bounceEnemy: 'sproutling' },
        { id: 'ceil_ten_5_shortcut', kind: 'tile', xStart: 145, xEnd: 150, y: 12.0, shortcut: true },
        { id: 'ceil_ten_6', kind: 'tile', xStart: 155, xEnd: 160, y: 11.0 },
        { id: 'ceil_ketsu_1', kind: 'tile', xStart: 165, xEnd: 170, y: 11.0 },
        { id: 'ceil_ketsu_2_star3', kind: 'tile', xStart: 175, xEnd: 180, y: 12.0, reward: 'star_3_ketsu' },
        { id: 'ceil_ketsu_3_launch', kind: 'tile', xStart: 185, xEnd: 190, y: 11.0 },
        { id: 'ceil_ketsu_finale', kind: 'geyser', xStart: 196.2, xEnd: 199.0, y: 9.4 },
      ],
    },
  };

  const schema = {
    id: 'water_spout_beach',
    title: 'Water Spout Beach',
    roomName: 'Room 11: Water Spout Beach',
    conceptThreeWords: 'Water Spout Beach',
    transcendentalBaseline: TRANSCENDENTAL_BASELINE,
    perLevelGimmick: {
      id: 'water_geysers',
      name: 'Rhythmic Water Spout Geysers',
      visualDemoX: 14.2,
      heraldX: 108.0,
      twistDescription: 'Tide Inversion reverses geyser cascade & engages 180° anti-phase lifts with zero physics drift',
    },
    environmentalContrast: {
      spatialDensity: 'open_coastal_tiered',
      verticality: 'dual_tier_skyway',
      cadence: 'rhythmic_wave_pulse',
    },
    cols,
    rows,
    spawnX: 3.0,
    spawnY: 2.5,
    floorBaselineY: 2.0,
    initialPowerUp: 'super',
    acts,
    routes,
    safeguardLedges,
    tileRects,
    singleTiles,
    powerUpBlocks,
    geysers,
    propPlatforms,
    twistHerald,
    enemies,
    coins,
    starMedallions,
    secretCaches,
    flagpole: { x: 203.5, baseY: 3.0, topY: 13.0 },
    foregroundProps: [
      { x: 5.5, y: 2.0 },
      { x: 26.0, y: 2.0 },
      { x: 53.0, y: 2.0 },
      { x: 95.0, y: 2.0 },
      { x: 137.0, y: 2.0 },
      { x: 190.0, y: 2.0 },
      { x: 207.5, y: 2.0 },
    ],
    slopeCues: [
      { x: 15.5, y: 8.6, text: 'ACT 1 · KI: SAFE WATER SPOUT PLAYPEN (0 PITS)', color: '#38BDF8' },
      { x: 39.0, y: 11.4, text: 'CEILING ROUTE · SPRINT ≥ 9.20 t/s → ★ MEDALLIONS', color: '#FDE047' },
      { x: 64.6, y: 8.2, text: 'ACT 2 · SHŌ: GEYSER CHASMS & SAFEGUARD LEDGES', color: '#4ADE80' },
      { x: 107.0, y: 8.8, text: 'ACT 3 · TEN: TWIST HERALD · TIDE INVERSION!', color: '#F59E0B' },
      { x: 146.0, y: 7.4, text: 'HOPLITE 6-SPROUTLING 1-UP CORRIDOR (12.0 t/s)', color: '#38BDF8' },
      { x: 197.6, y: 11.5, text: 'ACT 4 · KETSU: CLIMAX SPOUT → GOAL POLE!', color: '#FACC15' },
    ],
    description:
      'Stage 17 Kishōtenketsu Course ("Water Spout Beach"): Act 1 Ki (0-pit safe playpen) → Act 2 Shō (hazards & patrols) → Act 3 Ten (Anticipated Twist Herald, inverted geysers, 180° anti-phase lifts & 6-enemy shell corridor) → Act 4 Ketsu (Climax Flagpole launch), with Floor (≤4.50 t/s) & Ceiling (≥9.20 t/s) Dual-Skill Routes.',
  };

  return buildKishotenketsuLevel(schema);
}

export default {
  KISHOTENKETSU_ACTS,
  ACT_ORDER,
  TRANSCENDENTAL_BASELINE,
  captureTranscendentalSnapshot,
  verifyTranscendentalInvariance,
  WaterGeyserGimmick,
  TwistHerald,
  LevelGimmickRuntime,
  computeJumpEnvelope,
  auditAct1ZeroPits,
  auditFloorRoute,
  auditCeilingRoute,
  runTenPointNintendoAudit,
  buildKishotenketsuLevel,
  createWaterSpoutBeach,
};
