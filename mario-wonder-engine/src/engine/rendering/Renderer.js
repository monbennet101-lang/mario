/**
 * Renderer — 2D Canvas Tilemap + Stage 2 Character Presentation & VFX
 * =====================================================================
 * Renders the 64×64px tilemap grid, Room 1 distance markers & crouch tunnel cues,
 * slope wedges, pooled cartoon dust/smoke particles, presentation-only spring squash
 * & stretch, dynamic momentum chevron meter beneath player, and debug hitbox overlays.
 * 3D character rendering via Three.js added in Stage 8.
 *
 * Coordinate system: Y-up, 1 tile = 64px on screen (at 1:1 zoom).
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import { PlayerState } from '../../game/player/PlayerState.js';
import { PowerUpForm, PowerUpType } from '../../game/powerups/PowerUp.js';
import { EnemyKind } from '../../game/entities/CombatSystem.js';
import ParticleSystem from './ParticleSystem.js';
import ScreenShake from '../camera/ScreenShake.js';
import CameraController from '../camera/CameraController.js';
import TileMap from '../physics/TileMap.js';
import TileAtlas from './TileAtlas.js';
import { AutotileRole, computeAutotileGrid } from './TileAutotiler.js';
import CharacterRig3D from './CharacterRig3D.js';
import EnemySpriteSheetBank from '../../game/entities/EnemySpriteMatrix.js';
import { SproutlingState, HopliteState } from '../../game/entities/EnemyArchetypes.js';

const { tileTypes, tilemap: tileConfig, stage6 } = MovementProfile;
const PPT = tileConfig.tileSize; // 64 px per tile

const TILE_COLORS = {
  [tileTypes.EMPTY]: null,
  [tileTypes.SOLID]: '#8B5E2A',
  [tileTypes.SEMISOLID]: '#5B8C2A',
  [tileTypes.SLOPE_45]: '#9B6B36',
  [tileTypes.SLOPE_45_DOWN]: '#9B6B36',
  [tileTypes.SLOPE_26]: '#AD7A42',
  [tileTypes.SLOPE_26_UP_1]: '#AD7A42',
  [tileTypes.SLOPE_26_UP_2]: '#AD7A42',
  [tileTypes.SLOPE_26_DOWN_1]: '#AD7A42',
  [tileTypes.SLOPE_26_DOWN_2]: '#AD7A42',
  [tileTypes.HAZARD]: '#D62839',
  [tileTypes.QUESTION_BLOCK]: '#FACC15',
  [tileTypes.BRICK_BLOCK]: '#C2410C',
  [tileTypes.HARD_BLOCK]: '#D97706',
  [tileTypes.USED_BLOCK]: '#78350F',
  [tileTypes.PIPE]: '#16A34A',
  [tileTypes.MUSHROOM_PLATFORM]: '#E11D48',
};

const GRASS_COLOR = '#42B814';
const GRASS_HIGHLIGHT = '#94E410';
const GRID_COLOR = 'rgba(255,255,255,0.08)';
const GROUNDPLANE_ROLES = new Set([
  AutotileRole.TOP_GRASS,
  AutotileRole.TOP_LEFT_CORNER,
  AutotileRole.TOP_RIGHT_CORNER,
  AutotileRole.ISLAND_SINGLE,
  AutotileRole.SLOPE_45_UP,
  AutotileRole.SLOPE_45_DOWN,
  AutotileRole.SLOPE_26_UP_1,
  AutotileRole.SLOPE_26_UP_2,
  AutotileRole.SLOPE_26_DOWN_1,
  AutotileRole.SLOPE_26_DOWN_2,
]);

class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas, camera = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showGrid = false;
    this.showHitboxes = true;

    this.cameraX = 0;
    this.cameraY = 0;
    this.baseScale = 0.55;
    this.scale = 0.55;
    this._zoom = 1.0;
    this._fovScale = 1.0;
    this._worldPassSaved = false;
    this._sprintIntensity = 0;
    this.displayWidth = 1280;
    this.displayHeight = 720;

    // Stage 6 Grassland Atlas & Autotile Cache (clean release & file:// use 100% procedural tiles)
    this.tileAtlas = new TileAtlas();
    const isCleanRelease =
      (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ||
      (typeof window !== 'undefined' && window.location?.protocol === 'file:');
    if (!isCleanRelease) {
      this.tileAtlas.load('/tilesets/Grassland_Tileset.png');
    }
    this._autotileGrid = null;
    this._autotileMapRef = null;
    this._animTime = 0;

    // Pooled VFX & 2.5D Camera Controller
    this.particles = new ParticleSystem();
    this.camera = camera || new CameraController();
    this.shake = this.camera.shake;

    // Presentation-only squash & stretch spring (never mutates physics!)
    this._pres = {
      sy: 1.0,
      syVel: 0.0,
      sx: 1.0,
      leanDeg: 0.0,
      wasCrouched: false,
    };

    // Stage 3 Forgiveness Indicator Cues & Stage 4 Shockwave Rings
    this._forgivenessCues = [];
    this._shockwaves = [];

    // Stage 8 3D Rigged Character Renderer (Mario / Luigi glTF + 27-clip mixer)
    this.rig3D = typeof document !== 'undefined' ? new CharacterRig3D() : null;
    this.enemySprites = typeof document !== 'undefined' ? new EnemySpriteSheetBank() : null;
    this.isSoftwareGl = Boolean(this.rig3D?.isSoftwareGl);
    this.afterDraw = this.rig3D ? (cb) => this.rig3D.afterDraw(cb) : null;
    this._camState = null;
    this._isPausedRender = false;
    this._isHitstopRender = false;
    this.juice = null;

    this._boundResize = () => this._resize();
    this._resizeObserver = null;

    this._resize();
    window.addEventListener('resize', this._boundResize);
    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this._resizeObserver = new ResizeObserver(this._boundResize);
      this._resizeObserver.observe(this.canvas.parentElement);
    }
  }

  destroy() {
    window.removeEventListener('resize', this._boundResize);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.rig3D) {
      this.rig3D.dispose();
      this.rig3D = null;
    }
  }

  setCharacter(characterId) {
    this.rig3D?.setCharacter(characterId);
  }

  invalidateTileGrid() {
    this._autotileGrid = null;
    this._autotileMapRef = null;
  }

  _getAutotileGrid(tilemap) {
    if (!tilemap) return null;
    if (this._autotileGrid && this._autotileMapRef === tilemap) {
      return this._autotileGrid;
    }
    this._autotileGrid = computeAutotileGrid(tilemap);
    this._autotileMapRef = tilemap;
    return this._autotileGrid;
  }

  resetPresentation() {
    this.particles.clear();
    this.shake.reset();
    this._forgivenessCues.length = 0;
    this._shockwaves.length = 0;
    this._pres.sy = 1.0;
    this._pres.syVel = 0.0;
    this._pres.sx = 1.0;
    this._pres.leanDeg = 0.0;
    this._pres.wasCrouched = false;
    this._animTime = 0;
    this.invalidateTileGrid();
  }

  attachJuice(juiceEngine) {
    this.juice = juiceEngine;
    if (juiceEngine?.trauma) {
      this.shake = juiceEngine.trauma;
    }
  }

  addTrauma(amount) {
    this.shake.addTrauma(amount);
  }

  /**
   * Advance only presentation lifetimes & visual time during global hitstop freeze.
   */
  advanceVisualEffectsOnly(dt) {
    this._animTime += dt;
    for (let i = this._forgivenessCues.length - 1; i >= 0; i--) {
      this._forgivenessCues[i].age += dt;
      if (this._forgivenessCues[i].age >= this._forgivenessCues[i].maxAge) {
        this._forgivenessCues.splice(i, 1);
      }
    }
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      this._shockwaves[i].age += dt;
      if (this._shockwaves[i].age >= this._shockwaves[i].maxAge) {
        this._shockwaves.splice(i, 1);
      }
    }
  }

  /**
   * Called once per 60 Hz simulation tick to advance VFX, trauma shake & presentation spring.
   */
  onSimTick(player, dt) {
    const pres = this._pres;
    this._animTime += dt;

    // Emit pooled particles, squash/stretch impulses & forgiveness cues from simulation events
    const hasJuiceParticles = Boolean(this.juice?.particles);
    for (let i = 0; i < player.events.length; i++) {
      const ev = player.events[i];
      if (ev.type === 'skid') {
        if (!hasJuiceParticles) this.particles.spawnSkidSmoke(ev.x, ev.y, ev.dir);
      } else if (ev.type === 'turnaround') {
        if (!hasJuiceParticles) this.particles.spawnSkidSmoke(ev.x, ev.y, ev.dir);
      } else if (ev.type === 'sprintDust') {
        this.particles.spawnSprintDust(ev.x, ev.y, ev.dir);
      } else if (ev.type === 'crouch' && Math.abs(ev.vx) > 2.5) {
        this.particles.spawnCrouchPuff(player.centerX, player.pos.y, ev.vx);
      } else if (ev.type === 'jump') {
        pres.sy = MovementProfile.presentation.jumpStretchSy;
        pres.syVel = -1.6;
        if (ev.viaCoyote) {
          this._pushForgivenessCue('coyote', ev.x, ev.y, 0, 0.55);
        }
        if (ev.viaBuffer) {
          this._pushForgivenessCue('buffer', ev.x, ev.y, 0, 0.45);
        }
      } else if (ev.type === 'land') {
        if (ev.impactSpeed >= MovementProfile.vfx.landingDustMinSpeed) {
          this.particles.spawnLandingDust(ev.x, ev.y, ev.impactSpeed);
          const impactNorm = Math.min(1, ev.impactSpeed / 20);
          pres.sy = 1 - (1 - MovementProfile.presentation.landingSquashSy) * impactNorm;
          pres.syVel = 2.8 * impactNorm;
        }
      } else if (ev.type === 'blockHit') {
        pres.sy = MovementProfile.juice.squashStretch.blockBonkSquashSy;
        pres.syVel = 2.4;
      } else if (ev.type === 'apexSparkle') {
        this.particles.spawnApexSparkle(ev.x, ev.y);
      } else if (ev.type === 'cornerNudge') {
        this._pushForgivenessCue('nudge', ev.x, ev.y, ev.dir, 0.65);
      } else if (ev.type === 'stepUp') {
        this._pushForgivenessCue('stepUp', ev.x, ev.y, 1, 0.45);
      } else if (ev.type === 'spinJump') {
        pres.sy = MovementProfile.presentation.jumpStretchSy;
        pres.syVel = -1.6;
        this.particles.spawnSpinWisps(ev.x, ev.y, 0);
      } else if (ev.type === 'spinTwirl') {
        pres.sy = 1.12;
        pres.syVel = -1.2;
        this.particles.spawnSpinWisps(ev.x, ev.y, 0);
      } else if (ev.type === 'wallSlide') {
        if (!hasJuiceParticles) this.particles.spawnWallSlideSparks(ev.x, ev.y, ev.wallDir);
      } else if (ev.type === 'wallJump') {
        pres.sy = MovementProfile.presentation.jumpStretchSy;
        pres.syVel = -1.6;
        this.particles.spawnWallJumpBurst(ev.x, ev.y, ev.awayDir);
      } else if (ev.type === 'groundPoundWindup') {
        pres.sy = 0.84;
        pres.syVel = -1.4;
      } else if (ev.type === 'groundPoundImpact') {
        if (!hasJuiceParticles) this.particles.spawnGroundPoundImpact(ev.x, ev.y);
        pres.sy = MovementProfile.juice.squashStretch.groundPoundSquashSy;
        pres.syVel = 3.8;
        if (this._shockwaves.length >= 8) this._shockwaves.shift();
        this._shockwaves.push({ x: ev.x, y: ev.y, age: 0, maxAge: 0.34 });
      } else if (ev.type === 'buttSlide') {
        const speedRatio = Math.min(1, ev.speed / MovementProfile.slopes.buttSlideMaxSpeed);
        this.particles.spawnSlideDirtSpray(ev.x, ev.y, ev.dir, speedRatio, ev.isLethal);
      } else if (ev.type === 'semisolidDrop') {
        this.particles.spawnSemisolidDropTrail(ev.x, ev.y);
        this._pushForgivenessCue('dropThrough', ev.x, ev.y, 0, 0.42);
      }
    }

    if (
      (player.state === PlayerState.SPIN_TWIRL && player.spinTwirlElapsed % 2 === 1) ||
      (player.state === PlayerState.SPIN_JUMP && player.spinJumpFrames % 3 === 1)
    ) {
      const spinTick = player.state === PlayerState.SPIN_JUMP ? player.spinJumpFrames : player.spinTwirlElapsed;
      this.particles.spawnSpinWisps(player.centerX, player.centerY, spinTick);
    }

    // Advance forgiveness cue & shockwave lifetimes
    for (let i = this._forgivenessCues.length - 1; i >= 0; i--) {
      const cue = this._forgivenessCues[i];
      cue.age += dt;
      if (cue.age >= cue.maxAge) {
        this._forgivenessCues.splice(i, 1);
      }
    }

    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      sw.age += dt;
      if (sw.age >= sw.maxAge) {
        this._shockwaves.splice(i, 1);
      }
    }

    this.particles.update(dt);

    // Stage 8: Synchronize cartoon dust puffs with Run/Sprint 3D gait footstep strike phases
    if (this.rig3D) {
      const strikes = this.rig3D.consumeFootstepStrikes();
      for (let i = 0; i < strikes.length; i++) {
        const s = strikes[i];
        this.particles.spawnSprintDust(s.x, s.y, s.dir);
      }
    }

    // Presentation-only spring squash & stretch
    const targetSy = player.isCrouched
      ? MovementProfile.presentation.crouchSquashSy
      : 1.0;

    // Trigger spring impulse on crouch entry/exit
    if (!pres.wasCrouched && player.isCrouched) {
      pres.syVel = -4.2;
    } else if (pres.wasCrouched && !player.isCrouched) {
      pres.syVel = 3.6;
    }
    pres.wasCrouched = player.isCrouched;

    // Damped spring integration (60 Hz)
    const stiffness = 240;
    const damping = 18;
    const force = (targetSy - pres.sy) * stiffness - pres.syVel * damping;
    pres.syVel += force * dt;
    pres.sy = Math.max(0.36, Math.min(1.38, pres.sy + pres.syVel * dt));

    // Volume-preserving horizontal bulge during crouch/squash/stretch
    pres.sx = Math.max(0.76, Math.min(1.42, 1.0 / Math.sqrt(pres.sy)));

    // Torso lean angle (Wonder style: 8° walk, 24° sprint, -14° skid, wall brace, butt-slide sitback)
    let targetLean = 0;
    if (player.state === PlayerState.WALL_SLIDE) {
      targetLean = -player.wallSlideDir * 16;
    } else if (player.state === PlayerState.BUTT_SLIDE) {
      const slideDir = Math.sign(player.vel.x) || (player.facingRight ? 1 : -1);
      targetLean = -slideDir * 24;
    } else if (player.state === PlayerState.SKID) {
      targetLean = -(player.skidSlideDir || 1) * 14;
    } else if (!player.grounded) {
      const vxRatio = Math.min(1, Math.abs(player.vel.x) / MovementProfile.locomotion.runTopSpeed);
      const dir = player.facingRight ? 1 : -1;
      targetLean = dir * (player.vel.y > 0 ? 10 * vxRatio : -6 * vxRatio);
    } else if (player.grounded && !player.isCrouched) {
      const speedRatio = Math.min(1, Math.abs(player.vel.x) / MovementProfile.locomotion.runTopSpeed);
      const dir = player.facingRight ? 1 : -1;
      targetLean = dir * (speedRatio > 0.6 ? 24 * speedRatio : 10 * speedRatio);
    }
    pres.leanDeg += (targetLean - pres.leanDeg) * 0.25;
  }

  _pushForgivenessCue(kind, x, y, dir, maxAge) {
    if (this._forgivenessCues.length >= 16) {
      this._forgivenessCues.shift();
    }
    this._forgivenessCues.push({ kind, x, y, dir, age: 0, maxAge });
  }

  _resize() {
    const container = this.canvas.parentElement;
    if (!container) return;

    const containerW = container.clientWidth || window.innerWidth;
    const containerH = container.clientHeight || window.innerHeight;
    const targetAspect = 16 / 9;
    const containerAspect = containerW / Math.max(1, containerH);

    let canvasW, canvasH;
    if (containerAspect > targetAspect) {
      canvasH = containerH;
      canvasW = canvasH * targetAspect;
    } else {
      canvasW = containerW;
      canvasH = canvasW / targetAspect;
    }

    canvasW = Math.max(320, Math.floor(canvasW));
    canvasH = Math.max(180, Math.floor(canvasH));

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(canvasW * dpr);
    this.canvas.height = Math.round(canvasH * dpr);
    this.canvas.style.width = `${canvasW}px`;
    this.canvas.style.height = `${canvasH}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayWidth = canvasW;
    this.displayHeight = canvasH;

    // Auto-scale so ~22 tiles fit horizontally across the 16:9 viewport at Z = 1.000
    this.baseScale = canvasW / (22 * PPT);
    this.scale = this.baseScale;
    this.rig3D?.resize(this.displayWidth, this.displayHeight);
    if (this.onResize) {
      this.onResize();
    }
  }

  get tilesPerScreen() {
    const z = this._zoom || 1.0;
    return this.displayWidth / (PPT * this.baseScale * z);
  }

  /**
   * Map world coordinates to world-pass canvas coordinates (un-zoomed around viewport center,
   * then scaled cleanly by the Canvas 2D transform ctx.scale(Z, Z) in beginWorldPass).
   */
  worldToScreen = (worldX, worldY) => {
    const basePpt = PPT * this.baseScale;
    const z = this._zoom || 1.0;
    const viewW = this._camState?.viewW ?? (this.displayWidth / (basePpt * z));
    const viewH = this._camState?.viewH ?? (this.displayHeight / (basePpt * z));
    const camCenterX = this.cameraX + viewW * 0.5;
    const camCenterY = this.cameraY + viewH * 0.5;
    const sx = this.displayWidth * 0.5 + (worldX - camCenterX) * basePpt;
    const sy = this.displayHeight * 0.5 - (worldY - camCenterY) * basePpt;
    return { x: sx, y: sy };
  };

  /**
   * Map world coordinates directly to final viewport CSS pixels (outside beginWorldPass,
   * accounting for active Canvas zoom Z).
   */
  worldToViewport = (worldX, worldY) => {
    const effPpt = PPT * this.baseScale * (this._zoom || 1.0);
    const sx = (worldX - this.cameraX) * effPpt;
    const sy = this.displayHeight - (worldY - this.cameraY) * effPpt;
    return { x: sx, y: sy };
  };

  clear(room = null) {
    this.drawBackgroundParallax(room);
  }

  /**
   * Stage 6 & 18 Multi-Layer Parallax Background (Layers 0, 1, 2):
   *   - Plains / Default: Atmospheric cyan -> horizon gold sky + rolling hills + terraces
   *   - Cavern (1-2): Subterranean dark slate vault + neon cyan architectural ribs & crystals
   *   - Ridge (1-3): High-altitude alpine cobalt sky + jagged snow-capped peaks + mist
   */
  drawBackgroundParallax(room = null) {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;
    const ppt = PPT * this.scale;
    const twilight = Boolean(this.tileAtlas?.useTwilight);
    const factors = stage6.parallaxFactors;
    const theme = room?.theme || 'plains';

    if (theme === 'cavern') {
      this._drawCavernParallax(ctx, w, h, ppt, factors);
      return;
    }
    if (theme === 'ridge') {
      this._drawRidgeParallax(ctx, w, h, ppt, factors, twilight);
      return;
    }

    // ── Layer 0: Atmospheric Sky Gradient (Cyan -> Horizon Gold or Twilight Dusk) ──
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (twilight) {
      skyGrad.addColorStop(0, '#13113A');
      skyGrad.addColorStop(0.55, '#432371');
      skyGrad.addColorStop(0.88, '#C2410C');
      skyGrad.addColorStop(1, '#FDBA74');
    } else {
      skyGrad.addColorStop(0, '#0284C7');
      skyGrad.addColorStop(0.42, '#38BDF8');
      skyGrad.addColorStop(0.82, '#BAE6FD');
      skyGrad.addColorStop(1, '#FEF08A');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Optional twinkling twilight stars at Layer 0
    if (twilight) {
      ctx.save();
      ctx.fillStyle = '#FEF9C3';
      const starPeriod = 420;
      const starShift = (this.cameraX * ppt * factors.sky * 0.5) % starPeriod;
      for (let i = 0; i < 24; i++) {
        const sx = ((i * 97 + 31) % starPeriod) - starShift;
        for (let wrap = -1; wrap <= 4; wrap++) {
          const px = sx + wrap * starPeriod;
          if (px < -10 || px > w + 10) continue;
          const py = ((i * 53 + 17) % Math.max(40, h * 0.52));
          ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(this._animTime * 2.2 + i));
          ctx.fillRect(px, py, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2);
        }
      }
      ctx.restore();
    }

    // Drifting clouds (0.10x scroll + subtle drift, pre-baked opaque sprite so Dusk alpha has zero circle overlap seams)
    const cloudSprite = this._getCloudSprite(twilight);
    if (cloudSprite) {
      ctx.save();
      ctx.globalAlpha = twilight ? 0.28 : 0.94;
      const cloudPeriod = Math.max(420, ppt * 14);
      const cloudScroll = ((this.cameraX * factors.sky + this._animTime * 0.18) * ppt) % cloudPeriod;
      const cloudYShift = Math.min(28, this.cameraY * ppt * 0.04);
      const numCloudWraps = Math.ceil(w / cloudPeriod) + 2;

      for (let wrap = -1; wrap < numCloudWraps; wrap++) {
        const baseX = wrap * cloudPeriod - cloudScroll;
        const clouds = [
          { ox: 0.08, y: h * 0.17 + cloudYShift, s: 1.0 },
          { ox: 0.44, y: h * 0.27 + cloudYShift, s: 0.78 },
          { ox: 0.76, y: h * 0.13 + cloudYShift, s: 1.15 },
        ];
        for (const cl of clouds) {
          const cx = baseX + cl.ox * cloudPeriod;
          const cw = Math.max(44, ppt * 1.95 * cl.s);
          const ch = cw * (96 / 180);
          ctx.drawImage(cloudSprite, cx - cw * 0.5, cl.y - ch * 0.52, cw, ch);
        }
      }
      ctx.restore();
    }

    // ── Layer 1 (Z = -75, 0.40x): Distant Rolling Hills ──
    ctx.save();
    const hillPeriod = Math.max(480, ppt * 16);
    const hillScroll = (this.cameraX * factors.hills * ppt) % hillPeriod;
    const hillBaseY = h * 0.92 + Math.min(50, this.cameraY * ppt * 0.16);
    const hillWraps = Math.ceil(w / hillPeriod) + 2;

    for (let wrap = -1; wrap < hillWraps; wrap++) {
      const bx = wrap * hillPeriod - hillScroll;
      // Back distant hill ridge
      ctx.fillStyle = twilight ? '#312E81' : '#34D399';
      ctx.beginPath();
      ctx.moveTo(bx, h);
      ctx.quadraticCurveTo(bx + hillPeriod * 0.25, hillBaseY - h * 0.30, bx + hillPeriod * 0.50, hillBaseY - h * 0.10);
      ctx.quadraticCurveTo(bx + hillPeriod * 0.75, hillBaseY - h * 0.36, bx + hillPeriod, h);
      ctx.closePath();
      ctx.fill();

      // Classic Nintendo pill-shaped background hills
      const drawPillHill = (xFrac, widthFrac, heightFrac, fill, highlight) => {
        const pw = hillPeriod * widthFrac;
        const ph = h * heightFrac;
        const px = bx + hillPeriod * xFrac;
        const py = hillBaseY - ph;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph + h * 0.2, [pw * 0.5, pw * 0.5, 0, 0]);
        ctx.fill();

        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(px + pw * 0.34, py + pw * 0.32, Math.max(4, pw * 0.08), 0, Math.PI * 2);
        ctx.arc(px + pw * 0.65, py + pw * 0.46, Math.max(3, pw * 0.06), 0, Math.PI * 2);
        ctx.fill();
      };

      drawPillHill(
        0.12,
        0.16,
        0.34,
        twilight ? '#3730A3' : '#10B981',
        twilight ? 'rgba(165, 180, 252, 0.18)' : 'rgba(167, 243, 208, 0.35)'
      );
      drawPillHill(
        0.62,
        0.13,
        0.26,
        twilight ? '#4338CA' : '#059669',
        twilight ? 'rgba(165, 180, 252, 0.16)' : 'rgba(167, 243, 208, 0.30)'
      );
    }
    ctx.restore();

    // ── Layer 2 (Z = -20, 0.85x): Cavern / Cliff Backdrops & Rolling Terraces ──
    ctx.save();
    const cliffPeriod = Math.max(540, ppt * 18);
    const cliffScroll = (this.cameraX * factors.cliffs * ppt) % cliffPeriod;
    const cliffBaseY = h * 0.96 + Math.min(70, this.cameraY * ppt * 0.34);
    const cliffWraps = Math.ceil(w / cliffPeriod) + 2;

    for (let wrap = -1; wrap < cliffWraps; wrap++) {
      const bx = wrap * cliffPeriod - cliffScroll;
      ctx.fillStyle = twilight ? '#1E1B4B' : '#15803D';
      ctx.beginPath();
      ctx.moveTo(bx, h);
      ctx.lineTo(bx, cliffBaseY - h * 0.12);
      ctx.quadraticCurveTo(bx + cliffPeriod * 0.18, cliffBaseY - h * 0.22, bx + cliffPeriod * 0.36, cliffBaseY - h * 0.11);
      ctx.quadraticCurveTo(bx + cliffPeriod * 0.56, cliffBaseY - h * 0.06, bx + cliffPeriod * 0.72, cliffBaseY - h * 0.20);
      ctx.quadraticCurveTo(bx + cliffPeriod * 0.88, cliffBaseY - h * 0.25, bx + cliffPeriod, cliffBaseY - h * 0.12);
      ctx.lineTo(bx + cliffPeriod, h);
      ctx.closePath();
      ctx.fill();

      // Subtle top turf highlight rim on Layer 2 cliff mesas
      ctx.strokeStyle = twilight ? 'rgba(129, 140, 248, 0.28)' : 'rgba(134, 239, 172, 0.38)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, cliffBaseY - h * 0.12);
      ctx.quadraticCurveTo(bx + cliffPeriod * 0.18, cliffBaseY - h * 0.22, bx + cliffPeriod * 0.36, cliffBaseY - h * 0.11);
      ctx.quadraticCurveTo(bx + cliffPeriod * 0.56, cliffBaseY - h * 0.06, bx + cliffPeriod * 0.72, cliffBaseY - h * 0.20);
      ctx.quadraticCurveTo(bx + cliffPeriod * 0.88, cliffBaseY - h * 0.25, bx + cliffPeriod, cliffBaseY - h * 0.12);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCavernParallax(ctx, w, h, ppt, factors) {
    const pal = MovementProfile.world1.themes.cavern;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(0.52, pal.skyMid);
    grad.addColorStop(0.84, pal.skyLow);
    grad.addColorStop(1, pal.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Layer 0 (0.12x): Subtle subterranean architectural cyan lattice & crystalline glints
    ctx.save();
    const gridPeriod = Math.max(220, ppt * 6);
    const gridShift = ((this.cameraX * factors.sky * 1.2 * ppt) % gridPeriod + gridPeriod) % gridPeriod;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.lineWidth = 1;
    for (let x = -gridShift; x < w + gridPeriod; x += gridPeriod * 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridPeriod * 0.5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Layer 1 (0.35x): Deep slate cavern ribs & neon cyan vertical conduit veins
    ctx.save();
    const ribPeriod = Math.max(320, ppt * 10);
    const ribShift = ((this.cameraX * factors.hills * ppt) % ribPeriod + ribPeriod) % ribPeriod;
    const wraps = Math.ceil(w / ribPeriod) + 2;
    for (let wrap = -1; wrap < wraps; wrap++) {
      const bx = wrap * ribPeriod - ribShift;
      // Dark geometric rock pillar
      ctx.fillStyle = '#0D1528';
      ctx.fillRect(bx + ribPeriod * 0.14, 0, ribPeriod * 0.14, h);
      ctx.fillStyle = '#121E36';
      ctx.fillRect(bx + ribPeriod * 0.62, 0, ribPeriod * 0.10, h);

      // Glowing neon cyan energy conduit vein down pillar face
      const pulse = 0.45 + 0.35 * Math.sin(this._animTime * 2.4 + wrap * 1.7);
      ctx.fillStyle = `rgba(34, 211, 238, ${(0.24 * pulse).toFixed(3)})`;
      ctx.fillRect(bx + ribPeriod * 0.20, 0, 4, h);
      ctx.fillStyle = `rgba(103, 232, 249, ${(0.52 * pulse).toFixed(3)})`;
      ctx.fillRect(bx + ribPeriod * 0.205, 0, 1.5, h);

      // Glowing cyan crystal clusters along cavern ceiling and lower walls
      const drawCrystal = (cx, cy, ch, cw) => {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.22)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - ch);
        ctx.lineTo(cx + cw, cy);
        ctx.lineTo(cx, cy + ch * 0.35);
        ctx.lineTo(cx - cw, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.50)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      };
      drawCrystal(bx + ribPeriod * 0.42, h * 0.26, 26, 12);
      drawCrystal(bx + ribPeriod * 0.46, h * 0.29, 18, 8);
      drawCrystal(bx + ribPeriod * 0.84, h * 0.72, 24, 11);
    }
    ctx.restore();

    // Layer 2 (0.70x): Dark slate subterranean ridge silhouettes
    ctx.save();
    const ridgePeriod = Math.max(480, ppt * 16);
    const ridgeShift = ((this.cameraX * 0.65 * ppt) % ridgePeriod + ridgePeriod) % ridgePeriod;
    const ridgeWraps = Math.ceil(w / ridgePeriod) + 2;
    for (let wrap = -1; wrap < ridgeWraps; wrap++) {
      const bx = wrap * ridgePeriod - ridgeShift;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.beginPath();
      ctx.moveTo(bx, h);
      ctx.lineTo(bx, h * 0.82);
      ctx.lineTo(bx + ridgePeriod * 0.22, h * 0.70);
      ctx.lineTo(bx + ridgePeriod * 0.45, h * 0.84);
      ctx.lineTo(bx + ridgePeriod * 0.72, h * 0.66);
      ctx.lineTo(bx + ridgePeriod, h * 0.82);
      ctx.lineTo(bx + ridgePeriod, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawRidgeParallax(ctx, w, h, ppt, factors, twilight) {
    const pal = MovementProfile.world1.themes.ridge;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (twilight) {
      skyGrad.addColorStop(0, '#0F172A');
      skyGrad.addColorStop(0.55, '#1E3A8A');
      skyGrad.addColorStop(1, '#38BDF8');
    } else {
      skyGrad.addColorStop(0, pal.skyTop);
      skyGrad.addColorStop(0.45, pal.skyMid);
      skyGrad.addColorStop(0.84, pal.skyLow);
      skyGrad.addColorStop(1, '#F0F9FF');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // High-altitude drifting clouds
    const cloudSprite = this._getCloudSprite(twilight);
    if (cloudSprite) {
      ctx.save();
      ctx.globalAlpha = twilight ? 0.34 : 0.88;
      const cloudPeriod = Math.max(420, ppt * 14);
      const cloudScroll = ((this.cameraX * factors.sky + this._animTime * 0.22) * ppt) % cloudPeriod;
      const wraps = Math.ceil(w / cloudPeriod) + 2;
      for (let wrap = -1; wrap < wraps; wrap++) {
        const baseX = wrap * cloudPeriod - cloudScroll;
        for (const cl of [
          { ox: 0.12, y: h * 0.16, s: 1.05 },
          { ox: 0.56, y: h * 0.24, s: 0.82 },
          { ox: 0.84, y: h * 0.12, s: 1.12 },
        ]) {
          const cx = baseX + cl.ox * cloudPeriod;
          const cw = Math.max(44, ppt * 1.95 * cl.s);
          const ch = cw * (96 / 180);
          ctx.drawImage(cloudSprite, cx - cw * 0.5, cl.y - ch * 0.52, cw, ch);
        }
      }
      ctx.restore();
    }

    // Layer 1 (0.30x): Distant snow-capped alpine mountain range
    ctx.save();
    const peakPeriod = Math.max(520, ppt * 18);
    const peakShift = ((this.cameraX * 0.30 * ppt) % peakPeriod + peakPeriod) % peakPeriod;
    const wraps = Math.ceil(w / peakPeriod) + 2;
    const baseY = h * 0.94 + Math.min(48, this.cameraY * ppt * 0.14);
    for (let wrap = -1; wrap < wraps; wrap++) {
      const bx = wrap * peakPeriod - peakShift;
      const peaks = [
        { cx: 0.20, peakH: h * 0.54, halfW: peakPeriod * 0.26 },
        { cx: 0.58, peakH: h * 0.64, halfW: peakPeriod * 0.32 },
        { cx: 0.88, peakH: h * 0.46, halfW: peakPeriod * 0.24 },
      ];
      for (const pk of peaks) {
        const px = bx + pk.cx * peakPeriod;
        const py = baseY - pk.peakH;
        ctx.fillStyle = twilight ? '#1E3A5F' : '#1E40AF';
        ctx.beginPath();
        ctx.moveTo(px - pk.halfW, h);
        ctx.lineTo(px, py);
        ctx.lineTo(px + pk.halfW, h);
        ctx.closePath();
        ctx.fill();

        // Sunlit snow cap facet
        ctx.fillStyle = twilight ? '#93C5FD' : '#E0F2FE';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - pk.halfW * 0.28, py + pk.peakH * 0.28);
        ctx.lineTo(px - pk.halfW * 0.06, py + pk.peakH * 0.22);
        ctx.lineTo(px + pk.halfW * 0.08, py + pk.peakH * 0.30);
        ctx.lineTo(px + pk.halfW * 0.28, py + pk.peakH * 0.28);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Layer 2 (0.65x): Closer slate-teal alpine crags & mist band
    ctx.save();
    const cragPeriod = Math.max(540, ppt * 18);
    const cragShift = ((this.cameraX * 0.65 * ppt) % cragPeriod + cragPeriod) % cragPeriod;
    const cragWraps = Math.ceil(w / cragPeriod) + 2;
    const cragY = h * 0.96 + Math.min(60, this.cameraY * ppt * 0.26);
    for (let wrap = -1; wrap < cragWraps; wrap++) {
      const bx = wrap * cragPeriod - cragShift;
      ctx.fillStyle = twilight ? '#0F2942' : '#0F4C81';
      ctx.beginPath();
      ctx.moveTo(bx, h);
      ctx.lineTo(bx, cragY - h * 0.16);
      ctx.lineTo(bx + cragPeriod * 0.24, cragY - h * 0.30);
      ctx.lineTo(bx + cragPeriod * 0.48, cragY - h * 0.15);
      ctx.lineTo(bx + cragPeriod * 0.74, cragY - h * 0.34);
      ctx.lineTo(bx + cragPeriod, cragY - h * 0.16);
      ctx.lineTo(bx + cragPeriod, h);
      ctx.closePath();
      ctx.fill();
    }
    // Lower alpine mist glow
    const mistGrad = ctx.createLinearGradient(0, h * 0.76, 0, h);
    mistGrad.addColorStop(0, 'rgba(224, 242, 254, 0.0)');
    mistGrad.addColorStop(1, twilight ? 'rgba(56, 189, 248, 0.18)' : 'rgba(224, 242, 254, 0.32)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, h * 0.76, w, h * 0.24);
    ctx.restore();
  }

  _getCloudSprite(twilight) {
    const key = twilight ? '_cloudDuskSprite' : '_cloudDaySprite';
    if (this[key]) return this[key];
    if (typeof document === 'undefined') return null;

    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 96;
    const g = c.getContext('2d');
    const cx = 90;
    const cy = 50;
    const r = 28;

    g.fillStyle = twilight ? '#E9D5FF' : '#FFFFFF';
    const puffs = [
      [cx, cy, r],
      [cx - r * 0.85, cy + r * 0.22, r * 0.72],
      [cx + r * 0.88, cy + r * 0.20, r * 0.76],
    ];
    for (const [px, py, pr] of puffs) {
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.roundRect(cx - r * 1.45, cy + r * 0.16, r * 2.95, r * 0.78, r * 0.35);
    g.fill();

    if (!twilight) {
      g.fillStyle = '#DCF2FE';
      g.beginPath();
      g.roundRect(cx - r * 1.32, cy + r * 0.62, r * 2.68, r * 0.26, r * 0.12);
      g.fill();
    }

    this[key] = c;
    return c;
  }

  /**
   * Stage 6 Layer 4 foreground hook (foreground bushes on top of tile plane removed).
   */
  drawForegroundParallax(_tilemap, _room = null) {
    // Bushes drawn on top of the tile plane intentionally omitted.
  }

  /**
   * Stage 6 & 7: Atmospheric border vignette + High-Speed Sprint Speed-Line Vignette (> 8.0 tiles/s).
   */
  drawVignette() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const innerR = Math.min(w, h) * 0.42;
    const outerR = Math.hypot(cx, cy);

    const sprint = this._sprintIntensity || 0;
    const vig = ctx.createRadialGradient(cx, cy, innerR * (1 - sprint * 0.12), cx, cy, outerR);
    vig.addColorStop(0, 'rgba(6, 10, 26, 0.0)');
    vig.addColorStop(0.75, `rgba(6, 18, 42, ${(0.12 + sprint * 0.08).toFixed(3)})`);
    vig.addColorStop(1, `rgba(4, 14, 36, ${(0.34 + sprint * 0.16).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Stage 7 High-Speed Sprint Speed-Line Vignette (> 8.0 tiles/s)
    if (sprint > 0.02) {
      ctx.save();
      const dir = this.camera?.facingLookAhead || 1;
      const vanishX = cx + dir * w * 0.16;
      const vanishY = cy;
      const lineCount = 24;

      for (let i = 0; i < lineCount; i++) {
        const angle = (i / lineCount) * Math.PI * 2 + ((i % 2 === 0 ? 1 : -1) * 0.04);
        // Emphasize left/right horizontal peripheral edges over top/bottom center
        const horizWeight = Math.pow(Math.abs(Math.cos(angle)), 0.65);
        if (horizWeight < 0.25) continue;

        const phase = (this._animTime * 11.5 + i * 1.37) % 1;
        const rOuter = outerR * 1.04;
        const streakLen = Math.min(w, h) * (0.10 + 0.14 * sprint * horizWeight) * (0.65 + 0.35 * Math.sin(phase * Math.PI * 2));
        const rInner = rOuter - streakLen;

        const x0 = vanishX + Math.cos(angle) * rInner;
        const y0 = vanishY + Math.sin(angle) * rInner * 0.72;
        const x1 = vanishX + Math.cos(angle) * rOuter;
        const y1 = vanishY + Math.sin(angle) * rOuter * 0.72;

        ctx.strokeStyle = i % 3 === 0
          ? `rgba(56, 189, 248, ${(sprint * 0.34 * horizWeight).toFixed(3)})`
          : `rgba(248, 250, 252, ${(sprint * 0.26 * horizWeight).toFixed(3)})`;
        ctx.lineWidth = (i % 3 === 0 ? 2.2 : 1.4) * (0.7 + 0.5 * sprint);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  beginWorldPass() {
    const state = this._camState || this.camera.getRenderState(1.0, this.displayWidth, this.displayHeight, this.baseScale);
    this._worldPassSaved = Boolean(
      this.camera.applyCanvasTransform(
        this.ctx,
        this.displayWidth,
        this.displayHeight,
        state,
        PPT * this.baseScale
      )
    );
  }

  endWorldPass() {
    if (this._worldPassSaved) {
      this.ctx.restore();
      this._worldPassSaved = false;
    }
  }

  /**
   * Render sprite tilemap, 9-slice autotiled earth, slopes, modular kit blocks,
   * coins, brick debris, goal flagpole, and benchmark cues.
   */
  drawTileMap(tilemap, room = null, levelKit = null) {
    const ctx = this.ctx;
    const ppt = PPT * this.scale;
    const grid = this._getAutotileGrid(tilemap);
    const atlasReady = Boolean(this.tileAtlas?.loaded && this.tileAtlas?.atlasCanvas);
    const atlasIdx = this.tileAtlas?.useTwilight ? 1 : 0;
    const kit = this.tileAtlas?.kitSprites;

    const viewW = this._camState?.viewW ?? (this.displayWidth / (ppt * (this._zoom || 1.0)));
    const viewH = this._camState?.viewH ?? (this.displayHeight / (ppt * (this._zoom || 1.0)));
    const startCol = Math.max(0, Math.floor(this.cameraX) - 1);
    const endCol = Math.min(tilemap.cols, Math.ceil(this.cameraX + viewW) + 1);
    const startRow = Math.max(0, Math.floor(this.cameraY) - 1);
    const endRow = Math.min(tilemap.rows, Math.ceil(this.cameraY + viewH) + 1);

    // 1. Background Pass: Mushroom Platform Stalks (drawn behind solid terrain & player)
    if (kit?.mushroomStalk) {
      this._drawMushroomStalks(ctx, tilemap, grid, startCol, endCol, kit.mushroomStalk, ppt);
    }

    // 2. Background Layer 3 Prop: Goal Flagpole (pole + golden finial + sliding flag)
    if (levelKit?.flagpole) {
      this._drawFlagpole(ctx, levelKit.flagpole, ppt);
    }

    // 3. Two-Pass Grid Tile Render:
    //    Pass 3A: Underlying earth/cliffs/bottoms, kit blocks, pipes, mushrooms & semisolids
    //    Pass 3B: Groundplane surface tiles (top grass, top corners, islands & slopes) on top
    //             so earth tiles beneath never crop or clip groundplane tiles.
    const qFrame = Math.floor(this._animTime * 5) % 3;

    const drawTileCell = (col, row, type, role, cell) => {
      const bumpOffset = levelKit ? levelKit.getBumpOffsetY(col, row) : 0;
      const { x, y: baseY } = this.worldToScreen(col, row + 1);
      const y = baseY - bumpOffset * ppt;

      // A) Modular Kit Sprites ([?] Block, Brick, Hard, Used, Warp Pipe, Mushroom Cap)
      if (role === AutotileRole.QUESTION && kit?.question) {
        ctx.drawImage(kit.question[qFrame], x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.BRICK && kit?.brick) {
        ctx.drawImage(kit.brick, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.HARD && kit?.hard) {
        ctx.drawImage(kit.hard, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.USED && kit?.used) {
        ctx.drawImage(kit.used, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.PIPE_CAP_L && kit?.pipeCapL) {
        ctx.drawImage(kit.pipeCapL, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.PIPE_CAP_R && kit?.pipeCapR) {
        ctx.drawImage(kit.pipeCapR, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.PIPE_BODY_L && kit?.pipeBodyL) {
        ctx.drawImage(kit.pipeBodyL, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.PIPE_BODY_R && kit?.pipeBodyR) {
        ctx.drawImage(kit.pipeBodyR, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.MUSHROOM_LEFT && kit?.mushroomLeft) {
        ctx.drawImage(kit.mushroomLeft, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.MUSHROOM_MID && kit?.mushroomMid) {
        ctx.drawImage(kit.mushroomMid, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }
      if (role === AutotileRole.MUSHROOM_RIGHT && kit?.mushroomRight) {
        ctx.drawImage(kit.mushroomRight, x, y, ppt + 0.5, ppt + 0.5);
        return;
      }

      // A2) Sharp Metallic-Crimson Hazard Spikes (always crisp & legible in every theme)
      if (type === tileTypes.HAZARD) {
        this._drawHazardSpikes(ctx, x, y, ppt, room?.theme === 'cavern');
        return;
      }

      // A3) Course 1-2 Cavern Theme: Dark Slate Tiles with Neon Cyan Walkable Accents
      if (room?.theme === 'cavern' && (type === tileTypes.SOLID || type === tileTypes.SEMISOLID)) {
        const pal = MovementProfile.world1.themes.cavern;
        if (type === tileTypes.SEMISOLID) {
          ctx.fillStyle = pal.semisolidFill;
          ctx.fillRect(x, y, ppt + 0.6, ppt * 0.34);
          ctx.fillStyle = pal.semisolidTopLine;
          ctx.fillRect(x, y, ppt + 0.6, Math.max(3, ppt * 0.09));
          ctx.strokeStyle = pal.solidBevel;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(x + 0.5, y + 0.5, ppt - 1, ppt * 0.34 - 1);
          return;
        }
        const aboveEmpty = tilemap.get(col, row + 1) === tileTypes.EMPTY;
        const leftEmpty = tilemap.get(col - 1, row) === tileTypes.EMPTY;
        const rightEmpty = tilemap.get(col + 1, row) === tileTypes.EMPTY;
        ctx.fillStyle = pal.solidFill;
        ctx.fillRect(x, y, ppt + 0.6, ppt + 0.6);
        // Inner architectural slate bevel
        ctx.strokeStyle = pal.solidBevel;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 1, y + 1, ppt - 2, ppt - 2);
        // Subtle neon cyan interior micro-seam
        ctx.fillStyle = pal.solidInteriorGrid;
        ctx.fillRect(x + ppt * 0.16, y + ppt * 0.48, ppt * 0.68, Math.max(1.5, ppt * 0.04));
        if (aboveEmpty) {
          ctx.fillStyle = pal.solidTopStripe;
          ctx.fillRect(x, y, ppt + 0.6, Math.max(3.5, ppt * 0.10));
          ctx.fillStyle = '#CFFAFE';
          ctx.fillRect(x + 1, y, ppt - 2, Math.max(1.5, ppt * 0.04));
        }
        if (leftEmpty) {
          ctx.fillStyle = 'rgba(34, 211, 238, 0.55)';
          ctx.fillRect(x, y, Math.max(2, ppt * 0.06), ppt + 0.6);
        }
        if (rightEmpty) {
          ctx.fillStyle = 'rgba(34, 211, 238, 0.55)';
          ctx.fillRect(x + ppt - Math.max(2, ppt * 0.06), y, Math.max(2, ppt * 0.06), ppt + 0.6);
        }
        return;
      }

      // B) Atlas 2D Sprites for 9-Slice Grassland Earth & 45° / 26.57° Slopes
      const slot = TileAtlas.getSlotForRole(role, cell?.variant ?? 0);
      const atlasSprite = atlasReady && slot
        ? this.tileAtlas.getAtlasTileSprite(slot.col, slot.row, atlasIdx)
        : null;
      if (atlasSprite) {
        ctx.drawImage(atlasSprite, x, y, ppt + 0.6, ppt + 0.6);
        return;
      }

      // C) Clean Geometric Fallbacks (while atlas PNG decodes or for legacy SEMISOLID/HAZARD)
      const color = TILE_COLORS[type] || '#8B5E2A';
      if (TileMap.isSlopeType(type)) {
        const slope = tilemap.getSlopeInfo(col, row);
        if (slope) {
          this._drawSlope(ctx, x, y, ppt, slope.hLeft, slope.hRight, color);
        }
        return;
      }

      if (type === tileTypes.SEMISOLID) {
        const isDusk = atlasIdx === 1;
        ctx.fillStyle = isDusk ? '#134E4A' : color;
        ctx.fillRect(x, y, ppt + 0.5, ppt * 0.28);
        ctx.fillStyle = isDusk ? '#2DD4BF' : GRASS_HIGHLIGHT;
        ctx.fillRect(x, y, ppt + 0.5, Math.max(2, ppt * 0.07));
        return;
      }

      ctx.fillStyle = color;
      ctx.fillRect(x, y, ppt + 0.5, ppt + 0.5);
      if (type === tileTypes.SOLID && tilemap.get(col, row + 1) === tileTypes.EMPTY) {
        const grassH = ppt * 0.28;
        ctx.fillStyle = GRASS_COLOR;
        ctx.fillRect(x, y, ppt + 0.5, grassH);
        ctx.fillStyle = GRASS_HIGHLIGHT;
        ctx.fillRect(x, y, ppt + 0.5, Math.max(2, ppt * 0.06));
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, ppt, ppt);
    };

    const groundplaneQueue = [];

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const type = tilemap.get(col, row);
        if (type === tileTypes.EMPTY) continue;
        const cell = grid?.get(col, row);
        const role = cell?.role ?? AutotileRole.INTERIOR_EARTH;

        if (GROUNDPLANE_ROLES.has(role)) {
          groundplaneQueue.push({ col, row, type, role, cell });
          continue;
        }
        drawTileCell(col, row, type, role, cell);
      }
    }

    for (let i = 0; i < groundplaneQueue.length; i++) {
      const item = groundplaneQueue[i];
      drawTileCell(item.col, item.row, item.type, item.role, item.cell);
    }

    // 4. Collectible World Spinning Coins, Block-Hopping Coins & Brick Shatter Debris
    if (levelKit) {
      this._drawLevelKitEntities(ctx, levelKit, kit, ppt);
    }

    // Room 1 distance markers every 5 tiles
    if (room?.showDistanceMarkers) {
      this._drawDistanceMarkers(ctx, tilemap, room, startCol, endCol, ppt);
    }

    // Room 1 crouch tunnel clearance sign
    if (room?.crouchTunnel) {
      this._drawCrouchTunnelCue(ctx, room.crouchTunnel, ppt);
    }

    // Room 1 ceiling corner nudge / bonk test block label
    if (room?.ceilingTestBlock) {
      this._drawCeilingTestCue(ctx, room.ceilingTestBlock, ppt);
    }

    // Room 2 gap width markers (1t..8t)
    if (room?.gapMarkers) {
      this._drawGapMarkers(ctx, room.gapMarkers, ppt);
    }

    // Room 4 wall shaft elevation markers (+4t, +8t, +12t, +16t)
    if (room?.wallHeightMarkers) {
      this._drawWallHeightMarkers(ctx, room.wallHeightMarkers, ppt);
    }

    // Room 5, 6, 7 & 8 slope/kit/combat cues
    if (room?.slopeCues) {
      this._drawSlopeCues(ctx, room.slopeCues, ppt);
    }

    // Stage 10 Warp Pipe entrance directional suction indicators
    if (room?.warpPipes?.length) {
      this._drawWarpPipeCues(ctx, room.warpPipes, ppt);
    }

    // Optional 64px grid overlay [G]
    if (this.showGrid) {
      const topLeft = this.worldToScreen(startCol, endRow);
      const botRight = this.worldToScreen(endCol, startRow);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.75;
      for (let col = startCol; col <= endCol; col++) {
        const { x } = this.worldToScreen(col, 0);
        ctx.beginPath();
        ctx.moveTo(x, topLeft.y);
        ctx.lineTo(x, botRight.y);
        ctx.stroke();
      }
      for (let row = startRow; row <= endRow; row++) {
        const { y } = this.worldToScreen(0, row);
        ctx.beginPath();
        ctx.moveTo(topLeft.x, y);
        ctx.lineTo(botRight.x, y);
        ctx.stroke();
      }
    }
  }

  /**
   * Stage 18: Crisp metallic-crimson spike hazards (3 sharp teeth per 1-tile cell).
   */
  _drawHazardSpikes(ctx, x, y, ppt, isCavern = false) {
    const baseH = Math.max(5, ppt * 0.22);
    const toothCount = 3;
    const toothW = ppt / toothCount;

    // Subtle warning glow behind tips
    ctx.fillStyle = isCavern ? 'rgba(244, 63, 94, 0.20)' : 'rgba(239, 68, 68, 0.16)';
    ctx.fillRect(x, y + ppt * 0.12, ppt, ppt * 0.88);

    for (let i = 0; i < toothCount; i++) {
      const tx = x + i * toothW;
      const tipX = tx + toothW * 0.5;
      const tipY = y + ppt * 0.10;
      const botY = y + ppt - baseH * 0.6;

      // Left sunlit steel-crimson facet
      ctx.fillStyle = '#FB7185';
      ctx.beginPath();
      ctx.moveTo(tx + 1, botY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX, botY);
      ctx.closePath();
      ctx.fill();

      // Right shaded crimson facet
      ctx.fillStyle = '#BE123C';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tx + toothW - 1, botY);
      ctx.lineTo(tipX, botY);
      ctx.closePath();
      ctx.fill();

      // Razor outline & bright gleam tip
      ctx.strokeStyle = '#4C0519';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(tx + 1, botY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tx + toothW - 1, botY);
      ctx.stroke();

      ctx.fillStyle = '#FFF1F2';
      ctx.beginPath();
      ctx.arc(tipX, tipY + 1.5, Math.max(1.3, ppt * 0.03), 0, Math.PI * 2);
      ctx.fill();
    }

    // Heavy iron base plate
    ctx.fillStyle = isCavern ? '#1E293B' : '#334155';
    ctx.fillRect(x, y + ppt - baseH, ppt + 0.5, baseH);
    ctx.fillStyle = '#F43F5E';
    ctx.fillRect(x, y + ppt - baseH, ppt + 0.5, Math.max(2, baseH * 0.25));
  }

  /**
   * 5px visual grass overhang above solid collision line Y = 0
   * so boots nestle naturally into NSMBU-matched grass blade tips.
   */
  _drawFoliageOverhang(ctx, x, y, ppt, overhangPx, col, twilight) {
    const bladeDark = twilight ? '#0F766E' : '#2AA818';
    const bladeTip = twilight ? '#2DD4BF' : '#58D628';
    const count = 4;
    const segW = ppt / count;

    for (let i = 0; i < count; i++) {
      const bx = x + i * segW + segW * 0.5;
      const peakH = overhangPx * (((col + i) % 2 === 0) ? 1.1 : 0.82);

      ctx.fillStyle = bladeDark;
      ctx.beginPath();
      ctx.moveTo(bx - segW * 0.48, y + 1.5);
      ctx.quadraticCurveTo(bx - segW * 0.12, y - peakH * 0.9, bx, y - peakH);
      ctx.quadraticCurveTo(bx + segW * 0.12, y - peakH * 0.9, bx + segW * 0.48, y + 1.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = bladeTip;
      ctx.beginPath();
      ctx.moveTo(bx - segW * 0.30, y + 1.0);
      ctx.lineTo(bx, y - peakH * 0.88);
      ctx.lineTo(bx + segW * 0.30, y + 1.0);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawMushroomStalks(ctx, tilemap, grid, startCol, endCol, stalkSprite, ppt) {
    for (let row = 1; row < tilemap.rows; row++) {
      let col = Math.max(0, startCol - 4);
      const limit = Math.min(tilemap.cols, endCol + 4);
      while (col < limit) {
        const cell = grid?.get(col, row);
        if (cell?.role === AutotileRole.MUSHROOM_LEFT ||
            (tilemap.get(col, row) === tileTypes.MUSHROOM_PLATFORM &&
             tilemap.get(col - 1, row) !== tileTypes.MUSHROOM_PLATFORM)) {
          let runEnd = col;
          while (runEnd + 1 < tilemap.cols && tilemap.get(runEnd + 1, row) === tileTypes.MUSHROOM_PLATFORM) {
            runEnd++;
          }
          const stemCol = Math.floor((col + runEnd) * 0.5);
          const centerOffset = ((col + runEnd) % 2 === 1) ? 0.5 : 0;
          for (let r = row - 1; r >= 0; r--) {
            if (TileMap.isSolidType(tilemap.get(stemCol, r))) break;
            const { x, y } = this.worldToScreen(stemCol + centerOffset, r + 1);
            ctx.drawImage(stalkSprite, x, y, ppt, ppt + 0.5);
          }
          col = runEnd + 1;
        } else {
          col++;
        }
      }
    }
  }

  _drawFlagpole(ctx, fp, ppt) {
    const topPos = this.worldToScreen(fp.x, fp.topY);
    const botPos = this.worldToScreen(fp.x, fp.baseY);
    const flagPos = this.worldToScreen(fp.x, fp.flagY);

    ctx.save();
    // Metallic pole
    const poleW = Math.max(5, ppt * 0.14);
    const poleGrad = ctx.createLinearGradient(topPos.x - poleW * 0.5, 0, topPos.x + poleW * 0.5, 0);
    poleGrad.addColorStop(0, '#94A3B8');
    poleGrad.addColorStop(0.35, '#F8FAFC');
    poleGrad.addColorStop(1, '#475569');
    ctx.fillStyle = poleGrad;
    ctx.fillRect(topPos.x - poleW * 0.5, topPos.y, poleW, botPos.y - topPos.y);

    // Fluttering Goal Flag
    const flagW = ppt * 1.15;
    const flagH = ppt * 0.78;
    const wave = Math.sin(this._animTime * 6.5) * 3;
    ctx.fillStyle = fp.reached ? '#FACC15' : '#22C55E';
    ctx.strokeStyle = '#14532D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(flagPos.x, flagPos.y);
    ctx.lineTo(flagPos.x - flagW, flagPos.y + flagH * 0.35 + wave);
    ctx.lineTo(flagPos.x, flagPos.y + flagH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Star emblem inside flag
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(flagPos.x - flagW * 0.36, flagPos.y + flagH * 0.45 + wave * 0.4, Math.max(3, ppt * 0.12), 0, Math.PI * 2);
    ctx.fill();

    // Golden Finial Orb on top
    const orbR = Math.max(6, ppt * 0.22);
    const orbGrad = ctx.createRadialGradient(topPos.x - orbR * 0.3, topPos.y - orbR * 0.3, 1, topPos.x, topPos.y, orbR);
    orbGrad.addColorStop(0, '#FEF9C3');
    orbGrad.addColorStop(0.6, '#FACC15');
    orbGrad.addColorStop(1, '#B45309');
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(topPos.x, topPos.y, orbR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  _drawLevelKitEntities(ctx, levelKit, kit, ppt) {
    const coinFrames = kit?.coinFrames;

    // 1. World Spinning Sparking Gold Shards / Coins
    const cCfg = MovementProfile.collectibles;
    for (let i = 0; i < levelKit.worldCoins.length; i++) {
      const c = levelKit.worldCoins[i];
      if (c.collected && c.collectAge >= 0.25) continue;

      const bob = c.collected ? c.collectAge * 3.5 : Math.sin(this._animTime * 4.2 + c.id * 0.8) * 0.06;
      const { x, y } = this.worldToScreen(c.x, c.y + bob);
      if (x < -48 || x > this.displayWidth + 48) continue;

      ctx.save();
      if (c.collected) {
        ctx.globalAlpha = Math.max(0, 1 - c.collectAge / 0.25);
      }

      if (c.isShard || true) {
        // Faceted Sparking Gold Shard crystal with continuous spin + star glint
        const rY = Math.max(8, ppt * 0.30);
        const phase = this._animTime * ((cCfg.shardRotateDegPerSec * Math.PI) / 180) + c.id * 0.55;
        const spinX = Math.max(0.26, Math.abs(Math.cos(phase)));
        const rX = rY * 0.66 * spinX;
        const glint = 0.5 + 0.5 * Math.sin(this._animTime * cCfg.shardGlintHz * Math.PI * 2 + c.id * 1.1);

        ctx.translate(x, y);

        // Warm subtle aura behind shard
        ctx.fillStyle = `rgba(250, 204, 21, ${0.14 + glint * 0.14})`;
        ctx.beginPath();
        ctx.arc(0, 0, rY * 1.12, 0, Math.PI * 2);
        ctx.fill();

        // Outer diamond facet
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#92400E';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -rY);
        ctx.lineTo(rX, 0);
        ctx.lineTo(0, rY);
        ctx.lineTo(-rX, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left bright bevel facet
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.moveTo(0, -rY * 0.86);
        ctx.lineTo(0, rY * 0.86);
        ctx.lineTo(-rX * 0.78, 0);
        ctx.closePath();
        ctx.fill();

        // Center crisp highlight core
        ctx.fillStyle = '#FFFBEB';
        ctx.beginPath();
        ctx.moveTo(0, -rY * 0.44);
        ctx.lineTo(rX * 0.36, 0);
        ctx.lineTo(0, rY * 0.44);
        ctx.lineTo(-rX * 0.36, 0);
        ctx.closePath();
        ctx.fill();

        // Specular 4-point spark glint at peak phase
        if (glint > 0.62) {
          const spark = ((glint - 0.62) / 0.38) * (rY * 0.55);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-rX * 0.4 - spark, -rY * 0.45);
          ctx.lineTo(-rX * 0.4 + spark, -rY * 0.45);
          ctx.moveTo(-rX * 0.4, -rY * 0.45 - spark);
          ctx.lineTo(-rX * 0.4, -rY * 0.45 + spark);
          ctx.stroke();
        }
      } else if (coinFrames?.[0]) {
        const size = ppt * 0.72;
        const frameIdx = Math.floor(this._animTime * stage6.coinSpinFps + c.id * 0.7) % stage6.coinSpinFrames;
        ctx.drawImage(coinFrames[frameIdx], x - size * 0.5, y - size * 0.5, size, size);
      }
      ctx.restore();
    }

    // 2. Question-Block Hopping Coins (2.5t arc)
    for (let i = 0; i < levelKit.hoppingCoins.length; i++) {
      const hc = levelKit.hoppingCoins[i];
      const p = hc.frame / hc.totalFrames;
      const { x, y } = this.worldToScreen(hc.x, hc.y);
      const size = ppt * 0.78;
      const frameIdx = Math.floor((this._animTime * stage6.coinSpinFps * 2.4) + hc.frame * 0.5) % stage6.coinSpinFrames;

      ctx.save();
      if (p > 0.75) {
        ctx.globalAlpha = Math.max(0, 1 - (p - 0.75) / 0.25);
      }
      if (coinFrames?.[frameIdx]) {
        ctx.drawImage(coinFrames[frameIdx], x - size * 0.5, y - size * 0.5, size, size);
      }
      ctx.restore();
    }

    // 3. Spinning Brick Debris Fragments (4 shards per broken brick)
    if (levelKit.brickDebris.length > 0) {
      const fragSize = ppt * 0.34;
      ctx.save();
      for (let i = 0; i < levelKit.brickDebris.length; i++) {
        const d = levelKit.brickDebris[i];
        const { x, y } = this.worldToScreen(d.x, d.y);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - (d.life / d.maxLife) * 0.65);
        ctx.translate(x, y);
        ctx.rotate(d.rot);
        ctx.fillStyle = '#EA580C';
        ctx.fillRect(-fragSize * 0.5, -fragSize * 0.5, fragSize, fragSize);
        ctx.fillStyle = '#FDBA74';
        ctx.fillRect(-fragSize * 0.5, -fragSize * 0.5, fragSize, fragSize * 0.28);
        ctx.strokeStyle = '#451A03';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-fragSize * 0.5, -fragSize * 0.5, fragSize, fragSize);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  _drawCrouchTunnelCue(ctx, tunnel, ppt) {
    const { xStart, xEnd, ceilingY } = tunnel;
    const midX = (xStart + xEnd) / 2;
    const { x, y } = this.worldToScreen(midX, ceilingY + 2.15);
    const { x: leftX, y: ceilScreenY } = this.worldToScreen(xStart, ceilingY);
    const widthPx = (xEnd - xStart) * ppt;

    ctx.save();
    ctx.fillStyle = 'rgba(250, 204, 21, 0.24)';
    ctx.fillRect(leftX, ceilScreenY - 4, widthPx, 4);

    ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.24))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#FACC15';
    ctx.fillText('1.0t CROUCH SLIDE [↓/S]', x, y);
    ctx.restore();
  }

  _drawCeilingTestCue(ctx, block, ppt) {
    const { x, y } = this.worldToScreen(block.x + 0.5, block.y + 1.15);
    ctx.save();
    ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.22))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText('NUDGE / BONK', x, y);
    ctx.restore();
  }

  _drawGapMarkers(ctx, gapMarkers, ppt) {
    ctx.save();
    ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.28))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const g of gapMarkers) {
      const { x, y } = this.worldToScreen(g.xStart + g.width * 0.5, g.floorY);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
      ctx.fillText(`${g.width}t GAP`, x, y + ppt * 0.25);
    }
    ctx.restore();
  }

  _drawWallHeightMarkers(ctx, markers, ppt) {
    const { leftWallX, rightWallX, floorY, maxHeight } = markers;
    const midX = (leftWallX + rightWallX) * 0.5;
    ctx.save();
    ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.26))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let h = 4; h < maxHeight; h += 4) {
      const worldY = floorY + h;
      const { x: lx, y } = this.worldToScreen(leftWallX, worldY);
      const { x: rx } = this.worldToScreen(rightWallX, worldY);
      const { x: mx } = this.worldToScreen(midX, worldY);

      ctx.strokeStyle = h === 12 ? 'rgba(74, 222, 128, 0.55)' : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = h === 12 ? 2 : 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(rx, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = h === 12 ? '#4ADE80' : 'rgba(203, 213, 225, 0.65)';
      ctx.fillText(`+${h}t`, mx, y - ppt * 0.22);
    }
    ctx.restore();
  }

  _drawSlope(ctx, x, y, ppt, hLeftNorm, hRightNorm, color) {
    const yBottom = y + ppt;
    const yLeft = yBottom - hLeftNorm * ppt;
    const yRight = yBottom - hRightNorm * ppt;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, yBottom);
    ctx.lineTo(x, yLeft);
    ctx.lineTo(x + ppt, yRight);
    ctx.lineTo(x + ppt, yBottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = GRASS_COLOR;
    ctx.lineWidth = Math.max(3, ppt * 0.14);
    ctx.beginPath();
    ctx.moveTo(x, yLeft);
    ctx.lineTo(x + ppt, yRight);
    ctx.stroke();

    ctx.strokeStyle = GRASS_HIGHLIGHT;
    ctx.lineWidth = Math.max(1.5, ppt * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, yLeft - 1);
    ctx.lineTo(x + ppt, yRight - 1);
    ctx.stroke();
  }

  _drawSlopeCues(ctx, cues, ppt) {
    ctx.save();
    ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.24))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const cue of cues) {
      const { x, y } = this.worldToScreen(cue.x, cue.y);
      ctx.fillStyle = 'rgba(6, 10, 26, 0.72)';
      const w = ctx.measureText(cue.text).width + 10;
      ctx.fillRect(x - w * 0.5, y - Math.max(13, ppt * 0.28), w, Math.max(14, ppt * 0.30));
      ctx.fillStyle = cue.color || '#FACC15';
      ctx.fillText(cue.text, x, y);
    }
    ctx.restore();
  }

  _drawWarpPipeCues(ctx, warpPipes, ppt) {
    ctx.save();
    const bob = Math.sin(this._animTime * 5.0) * (ppt * 0.08);
    ctx.font = `bold ${Math.max(9, Math.round(ppt * 0.21))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    for (const wp of warpPipes) {
      const { x, y } = this.worldToScreen(wp.enterX, wp.enterY + 0.55);
      ctx.fillStyle = '#4ADE80';
      ctx.fillText('▼ WARP [↓/S]', x, y - ppt * 0.25 + bob);
    }
    ctx.restore();
  }

  /**
   * Stage 17: Render Kishōtenketsu Per-Level Gimmicks (Water Geysers, Twist Herald Gate,
   * Mastery Star Medallions, Secret 1-UP Caches, and Act Signposts).
   */
  drawLevelGimmicks(levelEngine, alpha = 1.0, player = null) {
    if (!levelEngine?.active) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;
    const t = this._animTime;

    ctx.save();

    // 1. Subtle In-World Act Boundary Signposts (Ki / Shō / Ten / Ketsu)
    if (levelEngine.actSignposts?.length) {
      ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.21))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < levelEngine.actSignposts.length; i++) {
        const sp = levelEngine.actSignposts[i];
        const base = this.worldToScreen(sp.x, sp.y);
        if (base.x < -160 || base.x > this.displayWidth + 160) continue;

        const postH = ppt * 1.45;
        const boardW = ppt * 1.95;
        const boardH = ppt * 0.62;
        // Post
        ctx.fillStyle = '#334155';
        ctx.fillRect(base.x - 3, base.y - postH, 6, postH);
        // Signboard
        ctx.fillStyle = 'rgba(10, 14, 34, 0.90)';
        ctx.strokeStyle = sp.accentColor || '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(base.x - boardW * 0.5, base.y - postH - boardH * 0.6, boardW, boardH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = sp.accentColor || '#38BDF8';
        ctx.fillText(`${sp.kanji} ${sp.id}`, base.x, base.y - postH - boardH * 0.1);
      }
    }

    // 2. Rhythmic Water Geysers (Layer cleanly atop invariant swept-AABB platforms)
    if (levelEngine.geysers?.length) {
      for (let i = 0; i < levelEngine.geysers.length; i++) {
        const g = levelEngine.geysers[i];
        const rpos = g.getRenderPos ? g.getRenderPos(alpha) : g.pos;
        const topScreen = this.worldToScreen(rpos.x, rpos.y + g.height);
        const botScreen = this.worldToScreen(rpos.x, g.baseY);
        const w = g.width * ppt;
        const colH = Math.max(8, botScreen.y - topScreen.y);

        if (topScreen.x + w < -60 || topScreen.x > this.displayWidth + 60) continue;

        const isInverted = Boolean(g.inverted);
        const isRidden = player?.ridingPlatform === g;

        // Water column gradient body (cerulean normal -> amber-violet inverted tide in Act 3 Ten)
        const grad = ctx.createLinearGradient(topScreen.x, topScreen.y, topScreen.x + w, topScreen.y);
        if (isInverted) {
          grad.addColorStop(0, 'rgba(245, 158, 11, 0.72)');
          grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.85)');
          grad.addColorStop(1, 'rgba(245, 158, 11, 0.72)');
        } else {
          grad.addColorStop(0, 'rgba(2, 132, 199, 0.74)');
          grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.88)');
          grad.addColorStop(1, 'rgba(2, 132, 199, 0.74)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(topScreen.x + 2, topScreen.y + 4, w - 4, colH - 4);

        // Animated vertical flow chevrons inside the column (upward normal, downward when inverted!)
        ctx.save();
        ctx.beginPath();
        ctx.rect(topScreen.x + 3, topScreen.y + 8, w - 6, Math.max(4, colH - 12));
        ctx.clip();
        const stepPx = Math.max(18, ppt * 0.42);
        const dirSign = isInverted ? 1 : -1;
        const scrollOffset = ((t * 72 * dirSign) % stepPx + stepPx) % stepPx;
        ctx.strokeStyle = isInverted ? 'rgba(254, 240, 138, 0.65)' : 'rgba(224, 242, 254, 0.58)';
        ctx.lineWidth = 2;
        for (let cy = topScreen.y - stepPx + scrollOffset; cy < botScreen.y + stepPx; cy += stepPx) {
          const midX = topScreen.x + w * 0.5;
          const tipOff = isInverted ? 6 : -6;
          ctx.beginPath();
          ctx.moveTo(midX - w * 0.24, cy - tipOff);
          ctx.lineTo(midX, cy + tipOff);
          ctx.lineTo(midX + w * 0.24, cy - tipOff);
          ctx.stroke();
        }
        ctx.restore();

        // Crisp foam crest solid footing platform (exact collision top line!)
        const crestH = Math.max(8, g.height * ppt);
        ctx.fillStyle = isInverted ? '#FEF3C7' : '#E0F2FE';
        ctx.strokeStyle = isRidden ? '#FACC15' : isInverted ? '#F59E0B' : '#0EA5E9';
        ctx.lineWidth = isRidden ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(topScreen.x, topScreen.y, w, crestH, 6);
        ctx.fill();
        ctx.stroke();

        // Top cyan/gold walkability stripe
        ctx.fillStyle = isRidden ? '#FACC15' : isInverted ? '#F59E0B' : '#00D2D3';
        ctx.fillRect(topScreen.x + 3, topScreen.y + 1, w - 6, 3.5);

        // Base nozzle emitter collar
        const nozzleH = Math.max(6, ppt * 0.22);
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = isInverted ? '#F59E0B' : '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(topScreen.x - 3, botScreen.y - nozzleH, w + 6, nozzleH, 4);
        ctx.fill();
        ctx.stroke();

        // Act 1 Ki Visual Demo Marker (gleaming bobbing buoy coin above geyser before player touches it)
        if (g.demoVisual) {
          const buoy = this.worldToScreen(g.x + g.width * 0.5, g.demoCoinY);
          const br = Math.max(7, ppt * 0.20);
          ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
          ctx.beginPath();
          ctx.arc(buoy.x, buoy.y, br * 1.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FACC15';
          ctx.strokeStyle = '#92400E';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(buoy.x, buoy.y, br * Math.max(0.35, Math.abs(Math.cos(t * 4.5))), br, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 3. Act 3 (Ten) Anticipated Twist Herald Gate
    if (levelEngine.twistHerald) {
      const h = levelEngine.twistHerald;
      const top = this.worldToScreen(h.x, h.baseY + h.height);
      const bot = this.worldToScreen(h.x, h.baseY);
      if (top.x > -180 && top.x < this.displayWidth + 180) {
        const triggered = h.state === 'TRIGGERED';
        const anticipating = h.state === 'ANTICIPATING';
        const gateW = ppt * 1.3;
        const gateH = bot.y - top.y;
        const pulse = 0.5 + 0.5 * Math.sin(t * (anticipating ? 12 : 4.5));

        // Shimmering portal field
        ctx.fillStyle = triggered
          ? 'rgba(245, 158, 11, 0.16)'
          : anticipating
            ? `rgba(250, 204, 21, ${0.14 + pulse * 0.18})`
            : 'rgba(56, 189, 248, 0.12)';
        ctx.fillRect(top.x - gateW * 0.5, top.y, gateW, gateH);

        // Twin architectural arch pillars
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = triggered ? '#F59E0B' : anticipating ? '#FDE047' : '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.fillRect(top.x - gateW * 0.5 - 6, top.y, 8, gateH);
        ctx.strokeRect(top.x - gateW * 0.5 - 6, top.y, 8, gateH);
        ctx.fillRect(top.x + gateW * 0.5 - 2, top.y, 8, gateH);
        ctx.strokeRect(top.x + gateW * 0.5 - 2, top.y, 8, gateH);

        // Wonder Herald Crest Orb at top of arch
        const orbR = Math.max(10, ppt * 0.30 + pulse * 2.5);
        ctx.fillStyle = triggered ? '#F59E0B' : '#38BDF8';
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(top.x, top.y, orbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // High-contrast status label badge
        const statusText = triggered ? 'TWIST ACTIVE!' : 'TWIST HERALD';
        ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.21))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(statusText).width + 14;
        const th = Math.max(18, ppt * 0.36);
        const ly = top.y - orbR - th * 0.7 - 4;
        ctx.fillStyle = 'rgba(10, 14, 34, 0.90)';
        ctx.strokeStyle = triggered ? '#F59E0B' : '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(top.x - tw * 0.5, ly - th * 0.5, tw, th, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = triggered ? '#FDE047' : '#E0F2FE';
        ctx.fillText(statusText, top.x, ly);
      }
    }

    // 4. Mastery Star Medallions (3 per level)
    if (levelEngine.starMedallions?.length) {
      for (let i = 0; i < levelEngine.starMedallions.length; i++) {
        const m = levelEngine.starMedallions[i];
        if (m.collected && m.collectAge >= 0.45) continue;
        const bob = Math.sin(t * 3.8 + i * 1.4) * 0.14;
        const sc = this.worldToScreen(m.x, m.y + bob);
        if (sc.x < -80 || sc.x > this.displayWidth + 80) continue;

        const isPersistedGhost = Boolean(m.persisted && !m.collected);
        const baseAlpha = isPersistedGhost ? MovementProfile.collectibles.medallionGhostAlpha : 1;
        const alphaFade = m.collected ? Math.max(0, 1 - m.collectAge / 0.45) : baseAlpha;
        const scalePop = m.collected ? 1 + (m.collectAge / 0.45) * 0.65 : 1;
        const spinX = Math.max(0.32, Math.abs(Math.cos(t * 2.8 + i)));
        const R = Math.max(13, ppt * 0.42) * scalePop;

        ctx.save();
        ctx.globalAlpha = alphaFade;
        ctx.translate(sc.x, sc.y);
        if (isPersistedGhost) {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.scale(spinX, 1);

        // Halo
        ctx.fillStyle = 'rgba(250, 204, 21, 0.26)';
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.38, 0, Math.PI * 2);
        ctx.fill();

        // Faceted 5-point Star Medallion
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#92400E';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let p = 0; p < 10; p++) {
          const ang = -Math.PI / 2 + (p * Math.PI) / 5;
          const rad = p % 2 === 0 ? R : R * 0.46;
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner gleam
        ctx.fillStyle = '#FEF9C3';
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 5. Secret 1-UP Caches (Ceiling Route Incentive)
    if (levelEngine.secretCaches?.length) {
      for (let i = 0; i < levelEngine.secretCaches.length; i++) {
        const c = levelEngine.secretCaches[i];
        if (c.collected && c.collectAge >= 0.45) continue;
        const bob = Math.sin(t * 4.2 + 0.9) * 0.12;
        const sc = this.worldToScreen(c.x, c.y + bob);
        if (sc.x < -80 || sc.x > this.displayWidth + 80) continue;

        const alphaFade = c.collected ? Math.max(0, 1 - c.collectAge / 0.45) : 1;
        const r = Math.max(12, ppt * 0.36);

        ctx.save();
        ctx.globalAlpha = alphaFade;
        ctx.fillStyle = 'rgba(74, 222, 128, 0.26)';
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, r * 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#16A34A';
        ctx.strokeStyle = '#BBF7D0';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = `900 ${Math.max(9, Math.round(r * 0.72))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('1UP', sc.x, sc.y + 0.5);
        ctx.restore();
      }
    }

    // 6. Stage 18 Course 1-3: Horizontal Hydraulic Geyser Jets (vx = 14.0 t/s)
    if (levelEngine.horizontalJets?.length) {
      for (let i = 0; i < levelEngine.horizontalJets.length; i++) {
        const jet = levelEngine.horizontalJets[i];
        const tl = this.worldToScreen(jet.x, jet.y + jet.height);
        const jetW = jet.length * ppt;
        const jetH = jet.height * ppt;
        if (tl.x + jetW < -80 || tl.x > this.displayWidth + 80) continue;

        ctx.save();
        // Pressurized horizontal water plume gradient
        const jetGrad = ctx.createLinearGradient(tl.x, tl.y, tl.x, tl.y + jetH);
        jetGrad.addColorStop(0, 'rgba(224, 242, 254, 0.86)');
        jetGrad.addColorStop(0.22, 'rgba(56, 189, 248, 0.80)');
        jetGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.86)');
        jetGrad.addColorStop(0.78, 'rgba(56, 189, 248, 0.80)');
        jetGrad.addColorStop(1, 'rgba(224, 242, 254, 0.86)');
        ctx.fillStyle = jetGrad;
        ctx.beginPath();
        ctx.roundRect(tl.x, tl.y + 3, jetW, Math.max(8, jetH - 6), [6, jetH * 0.45, jetH * 0.45, 6]);
        ctx.fill();

        // Rapid directional velocity chevrons streaming right at 14.0 t/s feel
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(tl.x + 4, tl.y + 4, Math.max(8, jetW - 8), Math.max(6, jetH - 8), 8);
        ctx.clip();
        const chevStep = Math.max(24, ppt * 0.65);
        const scrollX = ((t * 210 * (jet.dir || 1)) % chevStep + chevStep) % chevStep;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.lineWidth = 2.5;
        const midY = tl.y + jetH * 0.5;
        for (let cx = tl.x - chevStep + scrollX; cx < tl.x + jetW + chevStep; cx += chevStep) {
          ctx.beginPath();
          ctx.moveTo(cx - 7, midY - jetH * 0.24);
          ctx.lineTo(cx + 7, midY);
          ctx.lineTo(cx - 7, midY + jetH * 0.24);
          ctx.stroke();
        }
        ctx.restore();

        // Pressurized metal emitter nozzle on source edge
        const nozW = Math.max(10, ppt * 0.34);
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(tl.x - nozW * 0.4, tl.y - 3, nozW, jetH + 6, 5);
        ctx.fill();
        ctx.stroke();

        // Exit spray mist puffs
        const exitX = tl.x + jetW;
        for (let m = 0; m < 3; m++) {
          const phase = (t * 5.2 + m * 0.33) % 1;
          const mx = exitX + phase * ppt * 0.85;
          const my = tl.y + jetH * (0.25 + m * 0.25) + Math.sin(t * 9 + m) * 5;
          ctx.fillStyle = `rgba(224, 242, 254, ${(0.55 * (1 - phase)).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(mx, my, Math.max(4, ppt * 0.16 * (1 + phase * 0.6)), 0, Math.PI * 2);
          ctx.fill();
        }

        // Crisp velocity indicator badge
        ctx.font = `800 ${Math.max(9, Math.round(ppt * 0.20))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#E0F2FE';
        ctx.fillText(`HYDRO JET ${jet.jetSpeed.toFixed(1)} t/s →`, tl.x + 8, tl.y - 6);
        ctx.restore();
      }
    }

    // 7. Stage 18 Course 1-3: Highest Alpine Pinnacle Goal Medallion
    if (levelEngine.pinnacleGoal) {
      const pg = levelEngine.pinnacleGoal;
      const bob = Math.sin(t * 3.4) * 0.16;
      const sc = this.worldToScreen(pg.x, pg.y + bob);
      if (sc.x > -120 && sc.x < this.displayWidth + 120) {
        const R = Math.max(20, ppt * 0.66);
        ctx.save();
        ctx.translate(sc.x, sc.y);

        // Rotating alpine summit sunbeams
        ctx.save();
        ctx.rotate(t * 0.65);
        for (let r = 0; r < 8; r++) {
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = pg.collected ? 'rgba(74, 222, 128, 0.28)' : 'rgba(250, 204, 21, 0.22)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-R * 0.22, -R * 1.95);
          ctx.lineTo(R * 0.22, -R * 1.95);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Outer luminous cyan-gold shrine ring
        ctx.strokeStyle = pg.collected ? '#4ADE80' : '#38BDF8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.25 + Math.sin(t * 5) * 2.5, 0, Math.PI * 2);
        ctx.stroke();

        // Main faceted Pinnacle Goal Medallion
        const grad = ctx.createRadialGradient(-R * 0.25, -R * 0.25, 2, 0, 0, R);
        grad.addColorStop(0, '#FEF9C3');
        grad.addColorStop(0.55, '#FACC15');
        grad.addColorStop(1, '#D97706');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#78350F';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let p = 0; p < 10; p++) {
          const ang = -Math.PI / 2 + (p * Math.PI) / 5;
          const rad = p % 2 === 0 ? R : R * 0.48;
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner cyan hydro gem core
        ctx.fillStyle = '#38BDF8';
        ctx.strokeStyle = '#E0F2FE';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label badge
        ctx.font = `900 ${Math.max(10, Math.round(ppt * 0.22))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = pg.collected ? '#4ADE80' : '#FEF08A';
        ctx.fillText(pg.collected ? 'COURSE CLEAR! +5000' : 'PINNACLE GOAL', 0, -R * 1.48);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * Draw moving platforms (legacy & Interactive Environmental Props: Linear, Circular Orbit, Fall-Away)
   * with track rails, orbital hubs, fall-away countdown shudder, and interpolated positions.
   */
  drawPlatforms(platforms, alpha, player = null) {
    if (!platforms || platforms.length === 0) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;

    ctx.save();
    for (let i = 0; i < platforms.length; i++) {
      const plat = platforms[i];
      if (plat.isGeyser) continue;

      if (plat.mode === 'circular') {
        // Circular orbit guide ring & central mechanical hub
        const hub = this.worldToScreen(plat.centerX, plat.centerY);
        const rx = (plat.radiusX ?? plat.radius ?? 2.5) * ppt;
        const ry = (plat.radiusY ?? plat.radius ?? 2.5) * ppt;

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.ellipse(hub.x, hub.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const rpos = plat.getRenderPos(alpha);
        const platCenter = this.worldToScreen(rpos.x + plat.width * 0.5, rpos.y + plat.height * 0.5);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.lineTo(platCenter.x, platCenter.y);
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, Math.max(5, ppt * 0.14), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (plat.mode === 'fall_away') {
        // Anchor bracket showing original position for Fall-Away platform
        const anchor = this.worldToScreen(plat.startX, plat.startY + plat.height);
        const aw = plat.width * ppt;
        const ah = plat.height * ppt;
        if (plat.fallState !== 'IDLE') {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(anchor.x, anchor.y, aw, ah);
          ctx.setLineDash([]);
        }
      } else {
        const trackStart = this.worldToScreen(plat.startX + plat.width * 0.5, plat.startY + plat.height * 0.5);
        const trackEnd = this.worldToScreen(plat.endX + plat.width * 0.5, plat.endY + plat.height * 0.5);

        // Rail track guide
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(trackStart.x, trackStart.y);
        ctx.lineTo(trackEnd.x, trackEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        for (const pt of [trackStart, trackEnd]) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (plat.solidActive === false) continue;

      // Interpolated platform body
      const rpos = plat.getRenderPos(alpha);
      const { x: rawX, y } = this.worldToScreen(rpos.x, rpos.y + plat.height);
      const x = rawX + (plat.shakeOffsetPx || 0) * this.scale;
      const w = plat.width * ppt;
      const h = plat.height * ppt;
      const isRidden = player?.ridingPlatform === plat;
      const isFallAway = plat.mode === 'fall_away';
      const isShaking = isFallAway && plat.fallState === 'SHAKING';
      const isFalling = isFallAway && plat.fallState === 'FALLING';

      let fill = isRidden ? '#0284C7' : '#334155';
      let deck = isRidden ? '#38BDF8' : '#94E410';
      let stroke = isRidden ? '#BAE6FD' : 'rgba(148, 163, 184, 0.55)';

      if (isFallAway) {
        fill = isFalling ? '#7F1D1D' : isShaking ? '#92400E' : '#451A03';
        deck = isFalling ? '#EF4444' : isShaking ? '#F59E0B' : '#FBBF24';
        stroke = isShaking ? '#FDE047' : '#F59E0B';
      } else if (plat.mode === 'circular') {
        fill = isRidden ? '#1D4ED8' : '#1E293B';
        deck = isRidden ? '#60A5FA' : '#38BDF8';
        stroke = '#38BDF8';
      }

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(6, h * 0.4));
      ctx.fill();

      // Top highlight deck
      ctx.fillStyle = deck;
      ctx.fillRect(x + 2, y, Math.max(4, w - 4), Math.max(3, h * 0.25));

      // Fall-Away 1.0s countdown progress bar
      if (isShaking && plat.fallAwayDelayFrames > 0) {
        const remain = Math.max(0, 1 - plat.weightFrames / plat.fallAwayDelayFrames);
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(x + 3, y + h - Math.max(4, h * 0.22), Math.max(0, (w - 6) * remain), Math.max(3, h * 0.18));
      }

      ctx.strokeStyle = stroke;
      ctx.lineWidth = isRidden || isShaking ? 2 : 1.25;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(6, h * 0.4));
      ctx.stroke();

      // Rivet bolts for swept-solid visual affordance
      ctx.fillStyle = 'rgba(248, 250, 252, 0.45)';
      const rBolt = Math.max(1.5, ppt * 0.04);
      ctx.beginPath();
      ctx.arc(x + rBolt * 3, y + h * 0.62, rBolt, 0, Math.PI * 2);
      ctx.arc(x + w - rBolt * 3, y + h * 0.62, rBolt, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Subterranean Sub-Area Backdrop Pass (drawn BEFORE TileMap so terrain tiles
   * render crisply on top of the cavern wall).
   */
  drawSubAreaBackdrop(props) {
    if (!props?.activeSubAreaBounds) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;
    const b = props.activeSubAreaBounds;
    const topLeft = this.worldToScreen(b.x, b.y + b.height);
    const w = b.width * ppt;
    const h = b.height * ppt;

    ctx.save();
    const grad = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, topLeft.y + h);
    grad.addColorStop(0, '#090D1F');
    grad.addColorStop(0.55, '#111834');
    grad.addColorStop(1, '#0B1120');
    ctx.fillStyle = grad;
    ctx.fillRect(topLeft.x, topLeft.y, w, h);

    // Subtle subterranean brickwork & glowing crystal grid accents
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.10)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= b.width; gx += 2) {
      const px = topLeft.x + gx * ppt;
      ctx.beginPath();
      ctx.moveTo(px, topLeft.y);
      ctx.lineTo(px, topLeft.y + h);
      ctx.stroke();
    }
    for (let gy = 0; gy <= b.height; gy += 2) {
      const py = topLeft.y + gy * ppt;
      ctx.beginPath();
      ctx.moveTo(topLeft.x, py);
      ctx.lineTo(topLeft.x + w, py);
      ctx.stroke();
    }

    // Header badge inside subterranean cavern
    ctx.font = `bold ${Math.max(11, Math.round(ppt * 0.26))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.fillText('SUBTERRANEAN SUB-LEVEL', topLeft.x + w * 0.5, topLeft.y + ppt * 2.25);
    ctx.restore();
  }

  /**
   * Environmental Props Back Pass (drawn AFTER TileMap and BEFORE Player so springs
   * and warp tube throats render crisply in front of tiles and behind the player).
   */
  drawPropsBack(props, alpha, player = null) {
    if (!props) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;

    // 1. Compression Launch Springs (64×32px base pad, 16px / 0.50 squash coil)
    if (props.springs?.length) {
      ctx.save();
      for (let i = 0; i < props.springs.length; i++) {
        const sp = props.springs[i];
        const squash = sp.getRenderSquash ? sp.getRenderSquash(alpha) : sp.squashRatio;
        const w = sp.width * ppt;
        const restH = sp.height * ppt;
        const curH = Math.max(restH * 0.42, restH * squash);
        const { x: baseX, y: baseBottomY } = this.worldToScreen(sp.pos.x, sp.pos.y);
        const topY = baseBottomY - curH;

        const basePlateH = Math.max(4, restH * 0.22);
        const topPlateH = Math.max(6, restH * 0.28);

        // Ground anchor plate
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(baseX + w * 0.06, baseBottomY - basePlateH, w * 0.88, basePlateH, 3);
        ctx.fill();
        ctx.stroke();

        // Coiled steel helix (3 zig-zag turns compressing cleanly)
        const coilTop = topY + topPlateH - 1;
        const coilBot = baseBottomY - basePlateH + 1;
        const coilSpan = Math.max(3, coilBot - coilTop);
        const coilLeft = baseX + w * 0.20;
        const coilRight = baseX + w * 0.80;
        const turns = 4;

        ctx.strokeStyle = sp.isInPowerBounceWindow ? '#FDE047' : '#CBD5E1';
        ctx.lineWidth = Math.max(2.5, ppt * 0.065);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseX + w * 0.5, coilBot);
        for (let t = 1; t <= turns; t++) {
          const ty = coilBot - (t / turns) * coilSpan;
          const tx = t % 2 === 1 ? coilLeft : coilRight;
          ctx.lineTo(tx, ty);
        }
        ctx.lineTo(baseX + w * 0.5, coilTop);
        ctx.stroke();

        // Top crimson/gold rebound pad
        const superGlow = sp.isInPowerBounceWindow || (sp.state === 'REBOUND' && sp.lastWasSuper);
        ctx.fillStyle = superGlow ? '#F59E0B' : '#EF4444';
        ctx.strokeStyle = superGlow ? '#FEF08A' : '#FCA5A5';
        ctx.lineWidth = superGlow ? 2.2 : 1.5;
        ctx.beginPath();
        ctx.roundRect(baseX, topY, w, topPlateH, 4);
        ctx.fill();
        ctx.stroke();

        // Top specular highlight
        ctx.fillStyle = superGlow ? '#FEF9C3' : 'rgba(255,255,255,0.45)';
        ctx.fillRect(baseX + 4, topY + 2, Math.max(4, w - 8), Math.max(2, topPlateH * 0.25));

        // Upward chevron icon on pad
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.6;
        const midX = baseX + w * 0.5;
        const midY = topY + topPlateH * 0.56;
        ctx.beginPath();
        ctx.moveTo(midX - w * 0.12, midY + 2);
        ctx.lineTo(midX, midY - 3);
        ctx.lineTo(midX + w * 0.12, midY + 2);
        ctx.stroke();

        // Super Bounce timing ring when compressed
        if (sp.isInPowerBounceWindow) {
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(midX, topY, w * 0.62, ppt * 0.14, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. Warp Access Tubes Back Pass (dark interior throat + floating entry prompt cues)
    if (props.warpTubes?.length) {
      ctx.save();
      const bob = Math.sin(this._animTime * 4.6) * (ppt * 0.08);
      ctx.font = `bold ${Math.max(9, Math.round(ppt * 0.20))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < props.warpTubes.length; i++) {
        const tube = props.warpTubes[i];
        const { x, y } = this.worldToScreen(tube.x, tube.y + tube.headHeight);
        const w = tube.headWidth * ppt;
        const h = tube.headHeight * ppt;

        // Dark recessed pipe throat interior (drawn behind player)
        ctx.fillStyle = '#040812';
        ctx.fillRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.84);

        // Directional entry affordance badge
        let cueX = x + w * 0.5;
        let cueY = y - ppt * 0.42 + bob;
        let cueText = '▼ WARP [↓]';
        if (tube.entryVector === 'UP') {
          cueY = y + h + ppt * 0.42 - bob;
          cueText = '▲ WARP [↑]';
        } else if (tube.entryVector === 'RIGHT') {
          cueX = x - ppt * 0.72 + bob;
          cueY = y + h * 0.5;
          cueText = '▶ WARP';
        } else if (tube.entryVector === 'LEFT') {
          cueX = x + w + ppt * 0.72 - bob;
          cueY = y + h * 0.5;
          cueText = '◀ WARP';
        }

        const badgeW = ctx.measureText(cueText).width + 12;
        ctx.fillStyle = 'rgba(6, 12, 26, 0.82)';
        ctx.beginPath();
        ctx.roundRect(cueX - badgeW * 0.5, cueY - 9, badgeW, 18, 4);
        ctx.fill();
        ctx.fillStyle = tube.accentColor || '#34D399';
        ctx.fillText(cueText, cueX, cueY + 0.5);
      }
      ctx.restore();
    }
  }

  /**
   * Environmental Props Front Pass (drawn AFTER Player — provides true 2.5D z-order
   * occlusion mask so player sprite slides cleanly BEHIND the 128×128px pipe mouth!).
   */
  drawPropsFront(props, _alpha, _player = null) {
    if (!props?.warpTubes?.length) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;

    ctx.save();
    for (let i = 0; i < props.warpTubes.length; i++) {
      const tube = props.warpTubes[i];
      const { x, y } = this.worldToScreen(tube.x, tube.y + tube.headHeight);
      const w = tube.headWidth * ppt;
      const h = tube.headHeight * ppt;
      const baseColor = tube.color || '#10B981';
      const hiColor = tube.accentColor || '#6EE7B7';

      // Optional pipe stem extending behind head
      if (tube.stemLength > 0) {
        const inset = ppt * 0.12;
        const sLen = tube.stemLength * ppt;
        let sx = x + inset;
        let sy = y + h;
        let sw = w - inset * 2;
        let sh = sLen;
        if (tube.entryVector === 'UP') {
          sy = y - sLen;
        } else if (tube.entryVector === 'RIGHT') {
          sx = x + w;
          sy = y + inset;
          sw = sLen;
          sh = h - inset * 2;
        } else if (tube.entryVector === 'LEFT') {
          sx = x - sLen;
          sy = y + inset;
          sw = sLen;
          sh = h - inset * 2;
        }

        const stemVertical = tube.entryVector === 'DOWN' || tube.entryVector === 'UP';
        const sGrad = stemVertical
          ? ctx.createLinearGradient(sx, sy, sx + sw, sy)
          : ctx.createLinearGradient(sx, sy, sx, sy + sh);
        sGrad.addColorStop(0, '#064E3B');
        sGrad.addColorStop(0.24, hiColor);
        sGrad.addColorStop(0.48, baseColor);
        sGrad.addColorStop(0.84, '#065F46');
        sGrad.addColorStop(1, '#022C22');
        ctx.fillStyle = sGrad;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#022C22';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);
      }

      // 128×128px Entrance Pipe Head (drawn OVER player for true z-order mask!)
      const isVertical = tube.entryVector === 'DOWN' || tube.entryVector === 'UP';
      const grad = isVertical
        ? ctx.createLinearGradient(x, y, x + w, y)
        : ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#064E3B');
      grad.addColorStop(0.22, hiColor);
      grad.addColorStop(0.45, baseColor);
      grad.addColorStop(0.82, '#065F46');
      grad.addColorStop(1, '#022C22');

      // Main 128×128px pipe head barrel + flared mouth collar
      const lipThick = Math.max(14, ppt * 0.42);
      const barrelInset = Math.max(4, ppt * 0.09);

      if (tube.entryVector === 'DOWN') {
        // Barrel below collar
        ctx.fillStyle = grad;
        ctx.fillRect(x + barrelInset, y + lipThick, w - barrelInset * 2, h - lipThick);
        ctx.strokeStyle = '#022C22';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + barrelInset, y + lipThick, w - barrelInset * 2, h - lipThick);
        // Flared top collar
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, w, lipThick, 4);
        ctx.fill();
        ctx.stroke();
        // Top rim highlight
        ctx.fillStyle = 'rgba(236, 253, 245, 0.52)';
        ctx.fillRect(x + 3, y + 3, w - 6, 3);
      } else if (tube.entryVector === 'UP') {
        ctx.fillStyle = grad;
        ctx.fillRect(x + barrelInset, y, w - barrelInset * 2, h - lipThick);
        ctx.strokeStyle = '#022C22';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + barrelInset, y, w - barrelInset * 2, h - lipThick);
        // Flared bottom collar
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y + h - lipThick, w, lipThick, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(236, 253, 245, 0.45)';
        ctx.fillRect(x + 3, y + h - lipThick + 3, w - 6, 3);
      } else if (tube.entryVector === 'RIGHT') {
        // Barrel to the right of left-facing mouth collar
        ctx.fillStyle = grad;
        ctx.fillRect(x + lipThick, y + barrelInset, w - lipThick, h - barrelInset * 2);
        ctx.strokeStyle = '#022C22';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + lipThick, y + barrelInset, w - lipThick, h - barrelInset * 2);
        // Flared left collar
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, lipThick, h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(236, 253, 245, 0.45)';
        ctx.fillRect(x + 3, y + 3, 3, h - 6);
      } else {
        // LEFT: barrel to left of right-facing mouth collar
        ctx.fillStyle = grad;
        ctx.fillRect(x, y + barrelInset, w - lipThick, h - barrelInset * 2);
        ctx.strokeStyle = '#022C22';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y + barrelInset, w - lipThick, h - barrelInset * 2);
        // Flared right collar
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x + w - lipThick, y, lipThick, h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(236, 253, 245, 0.45)';
        ctx.fillRect(x + w - lipThick + 3, y + 3, 3, h - 6);
      }

      // Optional pipe label stamped on barrel
      if (tube.label) {
        ctx.font = `bold ${Math.max(8, Math.round(ppt * 0.17))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(236, 253, 245, 0.88)';
        ctx.fillText(tube.label, x + w * 0.5, y + h * 0.62);
      }
    }
    ctx.restore();
  }

  /**
   * Full-screen fade-to-black overlay driven by IN_WARP_TRANSITION pipeline.
   */
  drawWarpFade(player) {
    const alpha = player?.warpTransition?.fadeAlpha ?? 0;
    if (alpha <= 0.002) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = `rgba(4, 6, 14, ${Math.min(1, alpha).toFixed(3)})`;
    ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    ctx.restore();
  }

  _drawDistanceMarkers(ctx, tilemap, room, startCol, endCol, ppt) {
    const floorY = room.floorY ?? 4;
    const spawnX = room.spawnX ?? 3;

    ctx.save();
    ctx.font = `bold ${Math.max(10, Math.round(ppt * 0.28))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let col = Math.max(1, startCol); col < Math.min(tilemap.cols - 1, endCol); col++) {
      const relTiles = col - spawnX;
      if (relTiles >= 0 && relTiles % 5 === 0) {
        const { x, y } = this.worldToScreen(col + 0.5, floorY);
        ctx.fillStyle = relTiles === 0 ? '#FFD700' : 'rgba(255, 255, 255, 0.55)';
        ctx.fillRect(x - 1, y, 2, ppt * 0.34);

        const label = `${relTiles}t`;
        ctx.fillStyle = relTiles === 0 ? '#FEF08A' : 'rgba(248, 250, 252, 0.88)';
        ctx.fillText(label, x, y + ppt * 0.38);
      }
    }
    ctx.restore();
  }

  drawParticles() {
    const ppt = PPT * this.scale;
    this._drawShockwaves(this.ctx, ppt);
    this.particles.draw(this.ctx, this.worldToScreen, ppt);
    this.juice?.particles?.draw(this.ctx, this.worldToScreen, ppt);
    this._drawForgivenessCues(this.ctx, ppt);
  }

  _drawShockwaves(ctx, ppt) {
    if (this._shockwaves.length === 0) return;
    ctx.save();
    for (let i = 0; i < this._shockwaves.length; i++) {
      const sw = this._shockwaves[i];
      const t = sw.age / sw.maxAge;
      const alpha = Math.max(0, 1 - t);
      const { x, y } = this.worldToScreen(sw.x, sw.y);
      const rx = ppt * (0.45 + t * 2.65);
      const ry = ppt * (0.14 + t * 0.34);

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = Math.max(1.5, 4.5 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = Math.max(1, 2.2 * (1 - t));
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawForgivenessCues(ctx, ppt) {
    if (this._forgivenessCues.length === 0) return;

    ctx.save();
    ctx.font = `bold ${Math.max(9, Math.round(ppt * 0.22))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';

    for (let i = 0; i < this._forgivenessCues.length; i++) {
      const cue = this._forgivenessCues[i];
      const t = cue.age / cue.maxAge;
      const alpha = Math.max(0, 1 - t);
      const { x, y } = this.worldToScreen(cue.x, cue.y);

      ctx.globalAlpha = alpha;

      if (cue.kind === 'coyote') {
        // Green ghost silhouette at coyote ledge takeoff
        const gw = MovementProfile.hitbox.width * ppt;
        const gh = MovementProfile.hitbox.height * ppt;
        ctx.fillStyle = 'rgba(74, 222, 128, 0.38)';
        ctx.strokeStyle = '#4ADE80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - gw * 0.5, y - gh, gw, gh, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#86EFAC';
        ctx.fillText('COYOTE!', x, y - gh - 6);
      } else if (cue.kind === 'buffer') {
        // Yellow landing buffer shockwave ring
        const r = ppt * (0.25 + t * 0.65);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 3 * (1 - t * 0.5);
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#FEF08A';
        ctx.fillText('BUFFERED!', x, y - ppt * 0.45 - t * 14);
      } else if (cue.kind === 'nudge') {
        // Micro-nudge directional vector arrow at ceiling corner
        const dir = cue.dir || 1;
        const len = ppt * 0.65;
        ctx.strokeStyle = '#38BDF8';
        ctx.fillStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x - dir * len * 0.4, y + ppt * 0.15);
        ctx.lineTo(x + dir * len * 0.6, y + ppt * 0.15);
        ctx.stroke();

        // Arrowhead
        const tipX = x + dir * len * 0.6;
        const tipY = y + ppt * 0.15;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - dir * 7, tipY - 5);
        ctx.lineTo(tipX - dir * 7, tipY + 5);
        ctx.closePath();
        ctx.fill();

        ctx.fillText('NUDGE', x + dir * len * 0.2, y - 6);
      } else if (cue.kind === 'stepUp') {
        // Emerald upward micro-snap arrow at ledge step
        ctx.strokeStyle = '#34D399';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y + ppt * 0.2);
        ctx.lineTo(x, y - ppt * 0.35);
        ctx.stroke();

        ctx.fillStyle = '#6EE7B7';
        ctx.fillText('STEP-UP', x, y - ppt * 0.45);
      } else if (cue.kind === 'dropThrough') {
        // Sky-blue ghost silhouette & downward arrow on semisolid drop-through
        const gw = MovementProfile.hitbox.width * ppt;
        const gh = MovementProfile.hitbox.height * ppt * 0.85;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x - gw * 0.5, y - gh, gw, gh, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#7DD3FC';
        ctx.fillText('▼ DROP', x, y + ppt * 0.32 + t * 14);
      }
    }
    ctx.restore();
  }

  /**
   * Render the player with spring-damped crouch/jump/land squash, stride bounce, torso lean,
   * apex float wind halo, dynamic momentum chevron meter beneath feet, and exact physics AABB outline.
   */
  drawPlayer(player, alpha, poseInspector = null) {
    const ctx = this.ctx;
    const renderPos = player.getRenderPos(alpha);
    const ppt = PPT * this.scale;
    const hitboxW = player.currentWidth * ppt;
    const hitboxH = player.currentHeight * ppt;
    const { x: boxX, y: boxY } = this.worldToScreen(renderPos.x, renderPos.y + player.currentHeight);

    const standingW = MovementProfile.hitbox.width * ppt;
    const standingH = MovementProfile.hitbox.height * ppt;

    // Feet anchor (planted flush on top of groundplane tile / hitbox bottom)
    const feetX = boxX + hitboxW * 0.5;
    const feetY = boxY + hitboxH;

    // Presentation spring dimensions + Small/Growth scale (never mutates physics!)
    const growth = player.getGrowthPresentationScale
      ? player.getGrowthPresentationScale()
      : { sx: 1, sy: 1, sz: 1 };
    let drawW = standingW * this._pres.sx * growth.sx;
    let drawH = standingH * this._pres.sy * growth.sy;
    const absVx = Math.abs(player.vel.x);
    const strideBob = (player.grounded && !player.isCrouched && absVx > 0.3 && !player.isSkidding)
      ? Math.abs(Math.sin(player.strideDistance * 3.1)) * (ppt * 0.08)
      : 0;

    // Subtle wind halo during Buoyant Apex Float or Luigi Flutter Jump
    if (player.state === PlayerState.APEX_FLOAT || player.state === PlayerState.FLUTTER_JUMP) {
      ctx.save();
      ctx.strokeStyle = player.state === PlayerState.FLUTTER_JUMP
        ? 'rgba(74, 222, 128, 0.78)'
        : 'rgba(125, 211, 252, 0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(feetX, feetY - drawH * 0.48, drawW * 0.85, drawH * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Stage 4: Ground Pound speed-lines & windup anticipation ring
    if (player.state === PlayerState.GROUND_POUND_WINDUP) {
      const progress = 1 - player.groundPoundWindupTimer / Math.max(1, MovementProfile.groundPound.windupFrames);
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(feetX, feetY - drawH * 0.5, ppt * (0.85 - progress * 0.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (player.state === PlayerState.GROUND_POUND_FALL) {
      drawW *= 0.84;
      drawH *= 1.12;
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = 2;
      for (const ox of [-0.32, 0, 0.32]) {
        ctx.beginPath();
        ctx.moveTo(feetX + ox * ppt, feetY - drawH * 0.85);
        ctx.lineTo(feetX + ox * ppt, feetY - drawH * 1.65);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Stage 4: Spin Twirl & Grounded Spin Jump dual horizontal ribbon trail / blur disk
    if (player.state === PlayerState.SPIN_TWIRL || player.state === PlayerState.SPIN_JUMP) {
      let angle;
      if (player.state === PlayerState.SPIN_JUMP) {
        angle = ((player.spinJumpFrames || 0) * MovementProfile.spinJump.spinDegPerFrame * Math.PI) / 180;
      } else {
        const totalRotRad = (MovementProfile.spinTwirl.totalRotationDeg * Math.PI) / 180;
        const spinProgress = player.spinTwirlElapsed / Math.max(1, MovementProfile.spinTwirl.hoverDuration);
        angle = spinProgress * totalRotRad;
      }
      const cosWidth = Math.max(0.28, Math.abs(Math.cos(angle)));
      drawW *= cosWidth;

      ctx.save();
      ctx.strokeStyle = player.state === PlayerState.SPIN_JUMP
        ? 'rgba(250, 204, 21, 0.85)'
        : 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(feetX, feetY - drawH * 0.52, standingW * 1.18, ppt * 0.24, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = player.state === PlayerState.SPIN_JUMP
        ? 'rgba(56, 189, 248, 0.90)'
        : 'rgba(250, 204, 21, 0.90)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(feetX, feetY - drawH * 0.42, standingW * 0.96, ppt * 0.17, 0, angle, angle + Math.PI * 1.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(feetX, feetY - drawH * 0.62, standingW * 0.96, ppt * 0.17, 0, angle + Math.PI, angle + Math.PI * 2.15);
      ctx.stroke();
      ctx.restore();
    }

    // Stage 8 & 9: 3D Rigged Skeletal Character Pass + 4f Invulnerability Alpha Flicker (0.30 <-> 1.00)
    const camState = this._camState || this.camera.getRenderState(alpha, this.displayWidth, this.displayHeight, this.baseScale);
    const drew3D = this.rig3D
      ? this.rig3D.render({
          player,
          alpha,
          pres: this._pres,
          camState,
          displayWidth: this.displayWidth,
          displayHeight: this.displayHeight,
          poseInspector,
          isPaused: this._isPausedRender,
          isHitstop: this._isHitstopRender,
        })
      : false;

    const renderAlpha = player.getRenderAlpha ? player.getRenderAlpha() : 1.0;

    // Warp Access Tube mouth-plane exterior clip during SLIDING_IN so character
    // disappears cleanly inside the 128×128px pipe mouth and never pokes past the barrel.
    let warpClipApplied = false;
    if (player.state === PlayerState.IN_WARP_TRANSITION && player.warpTransition?.phase === 'SLIDING_IN') {
      const tube = player.warpTransition.tube;
      const mouthTL = this.worldToScreen(tube.x, tube.y + tube.headHeight);
      const tw = tube.headWidth * ppt;
      const th = tube.headHeight * ppt;
      const pad = 4000;
      ctx.save();
      ctx.beginPath();
      if (tube.entryVector === 'DOWN') {
        ctx.rect(-pad, -pad, pad * 2, mouthTL.y + pad);
      } else if (tube.entryVector === 'UP') {
        ctx.rect(-pad, mouthTL.y + th, pad * 2, pad * 2);
      } else if (tube.entryVector === 'RIGHT') {
        ctx.rect(-pad, -pad, mouthTL.x + pad, pad * 2);
      } else {
        ctx.rect(mouthTL.x + tw, -pad, pad * 2, pad * 2);
      }
      ctx.clip();
      warpClipApplied = true;
    }

    if (drew3D && this.rig3D.domElement) {
      ctx.save();
      const z = this._zoom || 1.0;
      if (Math.abs(z - 1.0) > 1e-5) {
        const cx = this.displayWidth * 0.5;
        const cy = this.displayHeight * 0.5;
        ctx.translate(cx, cy);
        ctx.scale(1 / z, 1 / z);
        ctx.translate(-cx, -cy);
      }
      ctx.globalAlpha = renderAlpha;
      ctx.drawImage(this.rig3D.domElement, 0, 0, this.displayWidth, this.displayHeight);
      ctx.restore();
    } else {
      // Lightweight fallback while glTF binary finishes first-frame decode
      ctx.save();
      ctx.globalAlpha = renderAlpha;
      if (player.state === PlayerState.GROUND_POUND_WINDUP) {
        const progress = 1 - player.groundPoundWindupTimer / Math.max(1, MovementProfile.groundPound.windupFrames);
        const flipDir = player.facingRight ? 1 : -1;
        ctx.translate(feetX, feetY - drawH * 0.5);
        ctx.rotate(flipDir * progress * Math.PI * 2);
        ctx.translate(0, drawH * 0.5);
      } else {
        ctx.translate(feetX, feetY - strideBob);
        ctx.rotate((this._pres.leanDeg * Math.PI) / 180);
      }

      const left = -drawW * 0.5;
      const top = -drawH;
      const isLuigi = player.characterId === 'luigi';
      const isFire = player.powerUpForm === PowerUpForm.FIRE;
      let bodyColor = isFire ? '#F8FAFC' : (isLuigi ? '#22C55E' : '#E83A3A');
      if (player.state === PlayerState.SKID) bodyColor = '#F97316';
      else if (player.state === PlayerState.GROUND_POUND_FALL) bodyColor = '#FB7185';
      else if (player.state === PlayerState.DAMAGE || player.state === PlayerState.DEFEAT) bodyColor = '#EF4444';
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(left, top, drawW, drawH, Math.min(8, drawW * 0.18));
      ctx.fill();

      ctx.fillStyle = isFire
        ? (isLuigi ? '#16A34A' : '#DC2626')
        : (isLuigi ? '#1D4ED8' : '#2563EB');
      ctx.beginPath();
      ctx.roundRect(left + drawW * 0.08, top + drawH * 0.52, drawW * 0.84, drawH * 0.44, 4);
      ctx.fill();

      ctx.fillStyle = '#FFD700';
      const eyeX = player.facingRight ? left + drawW * 0.60 : left + drawW * 0.16;
      ctx.fillRect(eyeX, top + drawH * 0.16, drawW * 0.24, Math.max(3, drawH * 0.11));
      ctx.restore();
    }

    if (warpClipApplied) {
      ctx.restore();
    }

    // Dynamic Momentum Chevron Meter beneath character
    this._drawMomentumChevrons(ctx, player, feetX, boxY + hitboxH + ppt * 0.24, ppt);

    // Stage 5: Butt-Slide flank friction speed lines & Lethal Bulldoze aura
    if (player.state === PlayerState.BUTT_SLIDE && Math.abs(player.vel.x) > 1.5) {
      const slideDir = Math.sign(player.vel.x) || (player.facingRight ? 1 : -1);
      const speedNorm = Math.min(1, Math.abs(player.vel.x) / MovementProfile.slopes.buttSlideMaxSpeed);
      ctx.save();
      if (player.isSlideLethal) {
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)';
        ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(feetX, feetY - drawH * 0.48, drawW * 0.92, drawH * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = player.isSlideLethal ? '#4ADE80' : '#FACC15';
      ctx.lineWidth = 2;
      const lineLen = ppt * (0.45 + 0.55 * speedNorm);
      for (const oy of [0.22, 0.52, 0.80]) {
        const ly = feetY - drawH * oy;
        const startX = feetX - slideDir * drawW * 0.55;
        ctx.beginPath();
        ctx.moveTo(startX, ly);
        ctx.lineTo(startX - slideDir * lineLen, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Exact physics AABB outline [B]
    if (this.showHitboxes) {
      let outlineColor = '#00FF88';
      if (player.isSlideLethal) outlineColor = '#22C55E';
      else if (player.isCrouched) outlineColor = '#38BDF8';
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = player.isSlideLethal ? 2.2 : 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(boxX, boxY, hitboxW, hitboxH);
      ctx.setLineDash([]);
    }

    // Semisolid drop-through prompt (▼ ↓+Z) when standing on one-way platform
    if (player.grounded && player.standingOnSemisolid && !player.standingOnSolid) {
      ctx.save();
      ctx.font = `bold ${Math.max(9, Math.round(ppt * 0.21))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(125, 211, 252, 0.92)';
      ctx.fillText('▼ ↓+Z', feetX, boxY + hitboxH + ppt * 0.36);
      ctx.restore();
    }

    // Grounded foliage inset reference line
    if (player.grounded) {
      ctx.strokeStyle = GRASS_HIGHLIGHT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxX - 4, boxY + hitboxH);
      ctx.lineTo(boxX + hitboxW + 4, boxY + hitboxH);
      ctx.stroke();
    }
  }

  /**
   * Subtle 5-chevron dynamic speed gauge beneath character:
   * Soft white (Walk) -> Amber (Run) -> Electric Cyan (Max Dash).
   */
  _drawMomentumChevrons(ctx, player, cx, cy, ppt) {
    const absVx = Math.abs(player.vel.x);
    if (absVx <= 0.15) return;

    const maxSpeed = MovementProfile.locomotion.runTopSpeed;
    const walkTop = MovementProfile.locomotion.walkTopSpeed;
    const ratio = Math.min(1, absVx / maxSpeed);
    const activeCount = Math.max(1, Math.ceil(ratio * 5));
    const dir = player.vel.x >= 0 ? 1 : -1;

    let activeColor = 'rgba(248, 250, 252, 0.92)'; // Soft white (Walk)
    if (absVx >= maxSpeed - 0.35) {
      activeColor = '#22D3EE'; // Electric cyan (Max Dash)
    } else if (absVx > walkTop + 0.15) {
      activeColor = '#F59E0B'; // Amber (Run/Sprint)
    }

    const spacing = Math.max(6, ppt * 0.20);
    const size = Math.max(3, ppt * 0.09);
    const startX = cx - ((5 - 1) * spacing) / 2;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < 5; i++) {
      const idx = dir > 0 ? i : 4 - i;
      const lit = idx < activeCount;
      const px = startX + i * spacing;

      ctx.strokeStyle = lit ? activeColor : 'rgba(148, 163, 184, 0.28)';
      ctx.beginPath();
      ctx.moveTo(px - dir * size * 0.6, cy - size);
      ctx.lineTo(px + dir * size * 0.6, cy);
      ctx.lineTo(px - dir * size * 0.6, cy + size);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Sync interpolated camera state for rendering at sub-frame factor `alpha` (zero mutation).
   */
  syncCameraRenderState(alpha = 1.0) {
    const state = this.camera.getRenderState(alpha, this.displayWidth, this.displayHeight, this.baseScale);
    this._camState = state;
    this.cameraX = state.x;
    this.cameraY = state.y;
    this._zoom = state.zoom ?? 1.0;
    this._fovScale = state.fovScale ?? this._zoom;
    // Keep world-pass base scale constant while Canvas 2D transform applies Z = 0.925..1.000
    this.scale = this.baseScale;
    this._sprintIntensity = state.sprintIntensity;
    this.shake = this.camera.shake;
  }

  centerCamera(playerX, playerY, playerVx, playerVy, grounded, dt, tilemap = null) {
    this.camera.update(
      playerX,
      playerY,
      playerVx,
      playerVy,
      grounded,
      dt,
      tilemap,
      this.displayWidth,
      this.displayHeight,
      this.baseScale
    );
    this.syncCameraRenderState(1.0);
  }

  /**
   * Camera Debug Visualization Mode ([F4] toggle):
   * Displays:
   *   1. Dual-Axis Deadzone Focus Window (48px wide × 64px tall)
   *   2. Dynamic Velocity Look-Ahead crosshair & lead vector (Lx in px/t, α=0.05 vs α=0.12)
   *   3. Downward Fall Anticipation (+120px) & 15-frame Ground Snap indicator
   *   4. Active Camera Lock divider lines / arena boxes
   *   5. Live telemetry bar (Zoom Z, FOV, LookAhead, Deadzone, Fall Catch, ScreenX/Y)
   */
  drawCameraDebug(player = null) {
    if (!this.camera?.debugOverlay) return;
    const ctx = this.ctx;
    const effPpt = PPT * this.baseScale * (this._zoom || 1.0);
    const w = this.displayWidth;
    const h = this.displayHeight;
    const cam = this.camera;
    const cfg = MovementProfile.camera;

    const upperY = h * (1 - cfg.verticalUpperClamp);
    const lowerY = h * (1 - cfg.verticalLowerClamp);

    ctx.save();
    // 1. Aerial upper/lower safety rails
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, upperY);
    ctx.lineTo(w, upperY);
    ctx.moveTo(0, lowerY);
    ctx.lineTo(w, lowerY);
    ctx.stroke();

    // 2. Dual-Axis Deadzone Box (48px wide × 64px tall in world units)
    const dzHalfW = (cfg.deadzoneWidthPx * 0.5 / PPT) * effPpt;
    const dzHeightTiles = cfg.deadzoneHeightPx / PPT;
    const dzTopLeft = this.worldToViewport(cam.deadzoneCenterX, cam.deadzoneBottomY + dzHeightTiles);
    const dzBotLeft = this.worldToViewport(cam.deadzoneCenterX, cam.deadzoneBottomY);
    const dzBoxX = dzTopLeft.x - dzHalfW;
    const dzBoxY = dzTopLeft.y;
    const dzBoxW = dzHalfW * 2;
    const dzBoxH = Math.max(4, dzBotLeft.y - dzTopLeft.y);

    ctx.fillStyle = cam.inHorizontalDeadzone && cam.inVerticalDeadzone
      ? 'rgba(250, 204, 21, 0.14)'
      : 'rgba(250, 204, 21, 0.06)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.90)';
    ctx.lineWidth = 1.75;
    ctx.setLineDash([5, 3]);
    ctx.fillRect(dzBoxX, dzBoxY, dzBoxW, dzBoxH);
    ctx.strokeRect(dzBoxX, dzBoxY, dzBoxW, dzBoxH);
    ctx.setLineDash([]);

    // 3. Eye-Level Baseline Anchor Line (anchorElevationY)
    const { y: anchorScreenY } = this.worldToViewport(0, cam.anchorElevationY);
    ctx.strokeStyle = cam.groundSnapActive ? '#38BDF8' : 'rgba(74, 222, 128, 0.85)';
    ctx.lineWidth = cam.groundSnapActive ? 2.2 : 1.75;
    ctx.beginPath();
    ctx.moveTo(0, anchorScreenY);
    ctx.lineTo(w, anchorScreenY);
    ctx.stroke();

    // 4. Downward Fall Anticipation (+120px) band when active
    if (cam.fallLookDownPx > 1) {
      const lookDownScreenY = anchorScreenY + (cam.fallLookDownPx / PPT) * effPpt;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(0, anchorScreenY, w, lookDownScreenY - anchorScreenY);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, lookDownScreenY);
      ctx.lineTo(w, lookDownScreenY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. Active Room Partition Camera Locks (vertical/horizontal dividers & boxes)
    const activeLocks = cam.getActiveLocks ? cam.getActiveLocks() : [];
    for (let i = 0; i < activeLocks.length; i++) {
      const lock = activeLocks[i];
      ctx.strokeStyle = '#E879F9';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      if (lock.axis === 'vertical' && Number.isFinite(lock.x)) {
        const { x: lx } = this.worldToViewport(lock.x, 0);
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, h);
        ctx.stroke();
      } else if (lock.axis === 'horizontal' && Number.isFinite(lock.y)) {
        const { y: ly } = this.worldToViewport(0, lock.y);
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(w, ly);
        ctx.stroke();
      } else if (lock.axis === 'box') {
        const tl = this.worldToViewport(lock.minX ?? 0, lock.maxY ?? 20);
        const br = this.worldToViewport(lock.maxX ?? 22, lock.minY ?? 0);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      }
      ctx.setLineDash([]);
    }

    // 6. Look-Ahead Target Crosshair & Lead Vector
    const px = player ? player.centerX : cam.lastPlayerX;
    const py = player ? player.centerY : cam.lastPlayerY;
    const playerScreen = this.worldToViewport(px, py);
    const targetWorldX = px + cam.lookAheadOffset;
    const targetWorldY = cam.anchorElevationY - cam.fastFallOffset;
    const targetScreen = this.worldToViewport(targetWorldX, targetWorldY);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.80)';
    ctx.lineWidth = 1.75;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(playerScreen.x, playerScreen.y);
    ctx.lineTo(targetScreen.x, targetScreen.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#38BDF8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetScreen.x, targetScreen.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(targetScreen.x - 14, targetScreen.y);
    ctx.lineTo(targetScreen.x + 14, targetScreen.y);
    ctx.moveTo(targetScreen.x, targetScreen.y - 14);
    ctx.lineTo(targetScreen.x, targetScreen.y + 14);
    ctx.stroke();

    // Guide Labels
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const drawPillLabel = (text, x, y, color, align = 'left') => {
      const tw = ctx.measureText(text).width;
      const padX = 5;
      const boxW = tw + padX * 2;
      const boxH = 15;
      const boxX = align === 'right' ? x - boxW : (align === 'center' ? x - boxW * 0.5 : x);
      const boxY = y - 11;
      ctx.fillStyle = 'rgba(7, 11, 25, 0.84)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(text, boxX + padX, y);
    };

    const dzLabelY = Math.max(24, dzBoxY - effPpt * 1.15);
    drawPillLabel(`DEADZONE (${cfg.deadzoneWidthPx}×${cfg.deadzoneHeightPx}px)`, dzTopLeft.x, dzLabelY, '#FACC15', 'center');
    drawPillLabel(
      `BASELINE (${cam.anchorElevationY.toFixed(2)}t)${cam.groundSnapActive ? ` · SNAP ${Math.round(cam.groundSnapFrame)}/${cfg.groundSnapFrames}f` : ''}`,
      w - 12,
      anchorScreenY - 6,
      cam.groundSnapActive ? '#38BDF8' : '#4ADE80',
      'right'
    );
    const leadRight = cam.lookAheadPx >= 0;
    drawPillLabel(
      `LEAD ${cam.lookAheadPx >= 0 ? '+' : ''}${Math.round(cam.lookAheadPx)}px (${cam.lookAheadOffset >= 0 ? '+' : ''}${cam.lookAheadOffset.toFixed(2)}t · α=${cam.lookAheadAlpha.toFixed(2)})`,
      leadRight ? targetScreen.x + 14 : targetScreen.x - 14,
      targetScreen.y - 10,
      '#38BDF8',
      leadRight ? 'left' : 'right'
    );
    if (cam.fallLookDownPx > 1) {
      drawPillLabel(
        `FALL CATCH -${Math.round(cam.fallLookDownPx)}px`,
        w - 12,
        anchorScreenY + (cam.fallLookDownPx / PPT) * effPpt + 14,
        '#F59E0B',
        'right'
      );
    }

    // Compact Camera Kinematics Banner at bottom center above hint
    const scrX = (cam.playerScreenX * 100).toFixed(1);
    const scrY = (cam.playerScreenY * 100).toFixed(1);
    const lockTag = activeLocks.length > 0 ? ` · LOCKS ${activeLocks.length}` : '';
    const bannerText = `CAM [F4] · Z ${cam.zoom.toFixed(3)}× · Look ${cam.lookAheadPx >= 0 ? '+' : ''}${Math.round(cam.lookAheadPx)}px (α=${cam.lookAheadAlpha.toFixed(2)}) · Fall -${Math.round(cam.fallLookDownPx)}px · Scr (${scrX}%, ${scrY}%)${lockTag}`;
    ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
    const barW = Math.min(w - 24, Math.max(520, ctx.measureText(bannerText).width + 24));
    const barH = 24;
    const barX = (w - barW) * 0.5;
    const barY = h - 58;
    ctx.fillStyle = 'rgba(10, 14, 34, 0.88)';
    ctx.strokeStyle = cam.sprintZoomActive ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#E2E8F0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bannerText, w * 0.5, barY + barH * 0.5);
    ctx.restore();
  }

  /**
   * Stage 9: Comic Golden Starburst ("Good!" / "Fire!") rendered behind Mario/Luigi.
   */
  drawCombatStarbursts(combat, _alpha = 1.0) {
    if (!combat?.starbursts?.length) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;

    ctx.save();
    for (let i = 0; i < combat.starbursts.length; i++) {
      const sb = combat.starbursts[i];
      const p = Math.min(1, sb.age / Math.max(0.01, sb.maxAge));
      const pop = p < 0.22 ? (p / 0.22) * 1.12 : 1.12 - (p - 0.22) * 0.16;
      const fade = p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1.0;
      const { x, y } = this.worldToScreen(sb.x, sb.y);
      const outerR = ppt * 1.38 * pop;
      const innerR = outerR * 0.58;
      const spikes = 12;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x, y);
      ctx.rotate(this._animTime * 1.4);

      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = Math.max(2, ppt * 0.05);
      ctx.beginPath();
      for (let s = 0; s < spikes * 2; s++) {
        const ang = (s / (spikes * 2)) * Math.PI * 2;
        const r = s % 2 === 0 ? outerR : innerR;
        const px = Math.cos(ang) * r;
        const py = Math.sin(ang) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-this._animTime * 1.4);
      ctx.font = `900 ${Math.max(14, Math.round(ppt * 0.44 * pop))}px "JetBrains Mono", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#451A03';
      ctx.strokeText(sb.text, 0, -ppt * 0.06);
      ctx.fillStyle = '#FEF9C3';
      ctx.fillText(sb.text, 0, -ppt * 0.06);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Stage 9: Super Mushroom, Fire Flower, Goombas (incl. 15% pancake squash),
   * Koopa Troopas / spinning shells, and Spinies with debug hitbox overlay.
   */
  drawCombatEntities(combat, alpha = 1.0, player = null) {
    if (!combat) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;

    // 1. Power-Ups
    for (let i = 0; i < combat.powerUps.length; i++) {
      const item = combat.powerUps[i];
      if (!item.active) continue;
      const rpos = item.getRenderPos(alpha);
      const { x, y } = this.worldToScreen(rpos.x, rpos.y + item.height);
      const w = item.width * ppt;
      const h = item.height * ppt;

      ctx.save();
      if (item.powerUpType === PowerUpType.SUPER_MUSHROOM) {
        this._drawMushroomSprite(ctx, x, y, w, h);
      } else {
        this._drawFireFlowerSprite(ctx, x, y, w, h);
      }
      ctx.restore();
    }

    // 2. Enemies (Goomba, Koopa, Spiny, Sproutling, Hoplite)
    for (let i = 0; i < combat.enemies.length; i++) {
      const e = combat.enemies[i];
      if (!e.active) continue;
      const rpos = e.getRenderPos(alpha);
      let { x, y } = this.worldToScreen(rpos.x, rpos.y + e.height);
      const w = e.width * ppt;
      const h = e.height * ppt;

      if (e.type === EnemyKind.SPROUTLING || e.type === EnemyKind.HOPLITE) {
        if (e.state === HopliteState.CARRIED && player) {
          const pRender = player.getRenderPos(alpha);
          const cfg = MovementProfile.enemyGallery.hoplite;
          const handDir = player.facingRight ? 1 : -1;
          const handX = pRender.x + player.currentWidth * 0.5 + handDir * cfg.handsOffsetX;
          const handY = pRender.y + cfg.handsOffsetY;
          const carriedScreen = this.worldToScreen(handX - e.width * 0.5, handY + e.height);
          x = carriedScreen.x;
          y = carriedScreen.y;
        }
        this._drawGalleryEnemySprite(ctx, e, x, y, w, h, ppt);
        continue;
      }

      ctx.save();
      if (e.state === 'knockedOut') {
        ctx.translate(x + w * 0.5, y + h * 0.5);
        ctx.scale(1, -1);
        ctx.translate(-(x + w * 0.5), -(y + h * 0.5));
      }

      if (e.type === EnemyKind.GOOMBA) {
        this._drawGoombaSprite(ctx, e, x, y, w, h);
      } else if (e.type === EnemyKind.KOOPA) {
        const drawPos = e.state === 'carried' && player
          ? {
              x: this.worldToScreen(
                player.getRenderPos(alpha).x + player.currentWidth * 0.5 + (player.facingRight ? 1 : -1) * 0.56 - e.width * 0.5,
                player.getRenderPos(alpha).y + 0.36 + e.height
              ).x,
              y: this.worldToScreen(0, player.getRenderPos(alpha).y + 0.36 + e.height).y,
            }
          : { x, y };
        this._drawKoopaSprite(ctx, e, drawPos.x, drawPos.y, w, h);
      } else if (e.type === EnemyKind.SPINY) {
        this._drawSpinySprite(ctx, e, x, y, w, h);
      }
      ctx.restore();

      // Debug AABB + top 20% stomp zone overlay [B]
      if (this.showHitboxes && e.state !== 'squashed' && e.state !== 'knockedOut') {
        ctx.save();
        ctx.strokeStyle = e.type === EnemyKind.SPINY ? '#FB7185' : '#FACC15';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        if (e.type !== EnemyKind.SPINY) {
          const stompH = h * MovementProfile.combat.stompZonePercent;
          ctx.fillStyle = 'rgba(74, 222, 128, 0.25)';
          ctx.fillRect(x, y, w, stompH);
        }
        ctx.restore();
      }
    }
  }

  _drawGalleryEnemySprite(ctx, e, x, y, w, h, ppt) {
    const info = e.getSpriteFrameInfo();
    const enemyKey = e.type === EnemyKind.SPROUTLING ? 'sproutling' : 'hoplite';
    const frameCanvas = this.enemySprites?.getFrameCanvas(enemyKey, info.action, info.frameIndex);

    const shakePx = (info.shakeOffsetPx || 0) * this.scale;
    const drawX = x + shakePx;
    const drawY = y;

    // Ground contact shadow (only when not inverted in launch death or carried)
    if (!info.inverted && e.state !== HopliteState.CARRIED && e.grounded) {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 18, 12, 0.30)';
      ctx.beginPath();
      ctx.ellipse(drawX + w * 0.5, drawY + h + 1, w * 0.44, Math.max(2.5, h * 0.11), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(drawX + w * 0.5, drawY + h * 0.5);
    const scaleX = e.facingRight ? 1 : -1;
    const scaleY = (info.inverted && info.action !== 'launch_death') ? -1 : 1;
    ctx.scale(scaleX, scaleY);
    if (frameCanvas) {
      ctx.drawImage(frameCanvas, -w * 0.5, -h * 0.5, w, h);
    } else {
      ctx.fillStyle = enemyKey === 'sproutling' ? '#4ADE80' : '#C9833C';
      ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    }
    ctx.restore();

    // Motion streak wake behind high-velocity 12.00 t/s Hoplite shell
    if (e.type === EnemyKind.HOPLITE && e.state === HopliteState.SHELL_MOVING) {
      const trailDir = -Math.sign(e.vel.x || e.dir || 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 224, 115, 0.72)';
      ctx.lineWidth = 2;
      for (const oy of [0.28, 0.55, 0.78]) {
        const ly = drawY + h * oy;
        const sx = drawX + w * 0.5 + trailDir * w * 0.48;
        ctx.beginPath();
        ctx.moveTo(sx, ly);
        ctx.lineTo(sx + trailDir * ppt * 0.45, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Debug Hitbox & 8px Top Stomp Band Overlay [B]
    if (this.showHitboxes && !e.isDefeated) {
      ctx.save();
      const isShellMoving = e.state === HopliteState.SHELL_MOVING;
      const isDormant = e.state === HopliteState.DORMANT_SHELL;
      ctx.strokeStyle = isShellMoving ? '#F97316' : (isDormant ? '#38BDF8' : '#FACC15');
      ctx.lineWidth = 1.35;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Exact 8px top stomp margin visualization
      const stompBandPx = MovementProfile.enemyGallery.sproutling.stompMarginTiles * ppt;
      ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
      ctx.fillRect(x, y, w, Math.min(h, stompBandPx));

      // Compact state badge above hitbox
      let tag = e.state;
      if (e.type === EnemyKind.HOPLITE) {
        if (e.state === HopliteState.DORMANT_SHELL) {
          tag = e.isTelegraphingWakeup ? 'WAKE SHAKE' : 'DORMANT';
        } else if (e.state === HopliteState.SHELL_MOVING) {
          tag = '12.0t/s';
        }
      }
      ctx.font = `700 ${Math.max(8, Math.round(ppt * 0.16))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(7, 10, 26, 0.78)';
      const tw = ctx.measureText(tag).width + 6;
      ctx.fillRect(x + w * 0.5 - tw * 0.5, y - 13, tw, 11);
      ctx.fillStyle = isShellMoving ? '#FDBA74' : (isDormant ? '#7DD3FC' : '#BEF264');
      ctx.fillText(tag, x + w * 0.5, y - 2);
      ctx.restore();
    }
  }

  /**
   * Stage 9: Spinning Fireballs + Floating Score Popups ("+100", "+200", "+1000", "1-UP!").
   */
  drawCombatOverlay(combat, alpha = 1.0) {
    if (!combat) return;
    const ctx = this.ctx;
    const ppt = PPT * this.scale;

    // 1. Fireball Projectiles
    for (let i = 0; i < combat.fireballs.length; i++) {
      const fb = combat.fireballs[i];
      if (!fb.active) continue;
      const rpos = fb.getRenderPos(alpha);
      const { x, y } = this.worldToScreen(rpos.x + fb.width * 0.5, rpos.y + fb.height * 0.5);
      const r = Math.max(5, fb.width * 0.5 * ppt);

      ctx.save();
      // Trailing flame glow
      const tailX = x - fb.dir * r * 1.15;
      const glow = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * 1.55);
      glow.addColorStop(0, '#FEF9C3');
      glow.addColorStop(0.45, '#FB923C');
      glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(249, 115, 22, 0.65)';
      ctx.beginPath();
      ctx.ellipse(tailX, y, r * 0.72, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Core spinning fireball
      ctx.translate(x, y);
      ctx.rotate(fb.spinAngle);
      ctx.fillStyle = '#EA580C';
      ctx.strokeStyle = '#7C2D12';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.ellipse(r * 0.15, -r * 0.12, r * 0.45, r * 0.30, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Floating World-Space Combat Text ("+100", "+200", "+1-UP", "+1000")
    // Rises exact 24px (0.375 tiles) and fades smoothly over 20 frames.
    if (combat.popups?.length) {
      ctx.save();
      ctx.font = `900 ${Math.max(12, Math.round(ppt * 0.30))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < combat.popups.length; i++) {
        const p = combat.popups[i];
        const fade = typeof p.alpha === 'number'
          ? Math.max(0, Math.min(1, p.alpha))
          : Math.max(0, 1 - p.age / Math.max(0.01, p.maxAge));
        const { x, y } = this.worldToScreen(p.x, p.y);
        ctx.globalAlpha = fade;
        ctx.lineWidth = 3.8;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#090D1F';
        ctx.strokeText(p.text, x, y);
        ctx.fillStyle = p.color || '#FEF08A';
        ctx.fillText(p.text, x, y);
      }
      ctx.restore();
    }
  }

  _drawMushroomSprite(ctx, x, y, w, h) {
    // Tan stem
    ctx.fillStyle = '#FDE68A';
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x + w * 0.22, y + h * 0.48, w * 0.56, h * 0.50, [0, 0, w * 0.18, w * 0.18]);
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.38, y + h * 0.72, w * 0.045, h * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.62, y + h * 0.72, w * 0.045, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Red cap with white spots
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.03, y + h * 0.03, w * 0.94, h * 0.54, [w * 0.46, w * 0.46, w * 0.14, w * 0.14]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x + w * 0.50, y + h * 0.23, w * 0.14, 0, Math.PI * 2);
    ctx.arc(x + w * 0.20, y + h * 0.34, w * 0.09, 0, Math.PI * 2);
    ctx.arc(x + w * 0.80, y + h * 0.34, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawFireFlowerSprite(ctx, x, y, w, h) {
    const cx = x + w * 0.5;
    // Green stem & leaves
    ctx.fillStyle = '#22C55E';
    ctx.strokeStyle = '#14532D';
    ctx.lineWidth = 1.5;
    ctx.fillRect(cx - w * 0.09, y + h * 0.52, w * 0.18, h * 0.45);
    ctx.strokeRect(cx - w * 0.09, y + h * 0.52, w * 0.18, h * 0.45);

    ctx.beginPath();
    ctx.ellipse(x + w * 0.24, y + h * 0.80, w * 0.18, h * 0.10, -0.35, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.76, y + h * 0.80, w * 0.18, h * 0.10, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing flower head (alternating shimmer)
    const pulse = 1 + 0.06 * Math.sin(this._animTime * 10);
    const rx = w * 0.45 * pulse;
    const ry = h * 0.30 * pulse;
    const headY = y + h * 0.31;

    ctx.fillStyle = '#EF4444';
    ctx.strokeStyle = '#7C2D12';
    ctx.beginPath();
    ctx.ellipse(cx, headY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.ellipse(cx, headY, rx * 0.68, ry * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFBEB';
    ctx.beginPath();
    ctx.ellipse(cx, headY, rx * 0.38, ry * 0.40, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(cx - w * 0.10, headY - h * 0.06, w * 0.05, h * 0.11);
    ctx.fillRect(cx + w * 0.05, headY - h * 0.06, w * 0.05, h * 0.11);
  }

  _drawGoombaSprite(ctx, g, x, y, w, h) {
    if (g.state === 'squashed') {
      const sh = Math.max(4, h * MovementProfile.enemies.goombaFlattenRatio);
      const sy = y + h - sh;
      ctx.fillStyle = '#92400E';
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - w * 0.12, sy, w * 1.24, sh, sh * 0.45);
      ctx.fill();
      ctx.stroke();

      // Wide dizzy cartoon eyes on pancaked Goomba
      ctx.fillStyle = '#FEF9C3';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.32, sy + sh * 0.42, w * 0.10, sh * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.68, sy + sh * 0.42, w * 0.10, sh * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(x + w * 0.30, sy + sh * 0.32, 2.5, Math.max(2, sh * 0.22));
      ctx.fillRect(x + w * 0.66, sy + sh * 0.32, 2.5, Math.max(2, sh * 0.22));
      return;
    }

    const stride = Math.sin(g.walkAnim) * w * 0.08;
    // Alternating dark feet
    ctx.fillStyle = '#291509';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.28 + stride, y + h * 0.90, w * 0.19, h * 0.11, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.72 - stride, y + h * 0.90, w * 0.19, h * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stem torso
    ctx.fillStyle = '#FDE68A';
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + w * 0.24, y + h * 0.56, w * 0.52, h * 0.30, 5);
    ctx.fill();
    ctx.stroke();

    // Chestnut mushroom dome
    ctx.fillStyle = '#A16207';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.04, y + h * 0.62);
    ctx.quadraticCurveTo(x + w * 0.10, y + h * 0.02, x + w * 0.50, y + h * 0.02);
    ctx.quadraticCurveTo(x + w * 0.90, y + h * 0.02, x + w * 0.96, y + h * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Expressive eyes & furrowed brow
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.35, y + h * 0.40, w * 0.09, h * 0.13, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.65, y + h * 0.40, w * 0.09, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(x + w * 0.37, y + h * 0.42, w * 0.045, 0, Math.PI * 2);
    ctx.arc(x + w * 0.63, y + h * 0.42, w * 0.045, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1E1B18';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.22, y + h * 0.24);
    ctx.lineTo(x + w * 0.46, y + h * 0.33);
    ctx.lineTo(x + w * 0.54, y + h * 0.33);
    ctx.lineTo(x + w * 0.78, y + h * 0.24);
    ctx.stroke();
  }

  _drawKoopaSprite(ctx, k, x, y, w, h) {
    if (k.isShell) {
      // Green Koopa Shell (idle / spinning / carried)
      ctx.fillStyle = '#FEF9C3';
      ctx.strokeStyle = '#14532D';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(x + w * 0.05, y + h * 0.56, w * 0.90, h * 0.40, h * 0.18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = k.state === 'shell_moving' ? '#22C55E' : '#16A34A';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.50, y + h * 0.46, w * 0.47, h * 0.42, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(x + w * 0.97, y + h * 0.62);
      ctx.lineTo(x + w * 0.03, y + h * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rim lip + rotating vertical ridges when spinning
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(x + w * 0.03, y + h * 0.54, w * 0.94, Math.max(3, h * 0.11));

      const phase = k.state === 'shell_moving' ? ((k.spinAnim % 1 + 1) % 1) : 0.5;
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(x + w * (0.20 + phase * 0.48), y + h * 0.16, w * 0.14, h * 0.35);
      return;
    }

    // Standing / Walking Green Koopa Troopa
    const stride = Math.sin(k.walkAnim) * w * 0.08;
    const face = k.facingRight ? 1 : -1;

    // Boots
    ctx.fillStyle = '#16A34A';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.34 + stride, y + h * 0.92, w * 0.17, h * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.66 - stride, y + h * 0.92, w * 0.17, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Yellow belly/neck
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#713F12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + w * 0.25, y + h * 0.28, w * 0.50, h * 0.58, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    const hx = x + w * (0.50 + face * 0.18);
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.ellipse(hx, y + h * 0.20, w * 0.22, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(hx + face * w * 0.08, y + h * 0.17, w * 0.045, 0, Math.PI * 2);
    ctx.fill();

    // Green back shell
    const sx = x + w * (0.50 - face * 0.14);
    ctx.fillStyle = '#16A34A';
    ctx.strokeStyle = '#14532D';
    ctx.beginPath();
    ctx.ellipse(sx, y + h * 0.56, w * 0.30, h * 0.28, face * -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  _drawSpinySprite(ctx, sp, x, y, w, h) {
    const face = sp.facingRight ? 1 : -1;
    // Spikes along red shell
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#450A0A';
    ctx.lineWidth = 1.4;
    for (const sx of [0.22, 0.50, 0.78]) {
      ctx.beginPath();
      ctx.moveTo(x + w * (sx - 0.12), y + h * 0.30);
      ctx.lineTo(x + w * sx, y + h * 0.02);
      ctx.lineTo(x + w * (sx + 0.12), y + h * 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Crimson shell dome
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.06, y + h * 0.24, w * 0.88, h * 0.62, [w * 0.42, w * 0.42, w * 0.16, w * 0.16]);
    ctx.fill();
    ctx.stroke();

    // Belly + glowing angry eye
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.14, y + h * 0.66, w * 0.72, h * 0.26, 4);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    const eyeX = x + w * (0.50 + face * 0.24);
    ctx.beginPath();
    ctx.arc(eyeX, y + h * 0.52, w * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(eyeX + face * 1.5, y + h * 0.52, w * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Stage 21: Render the Dread-Shell Sanctum Boss Encounter:
   *   - Left/Right mechanical blast doors
   *   - World Exit Portal (locked vs radiant unlocked)
   *   - Dread-Shell Golem (armored shell, crimson spin dash, exposed amber core, steam, HP bar)
   *   - Room-wide bilateral ground shockwaves & harmless geometric shatter debris
   */
  drawBossEncounter(boss, alpha = 1.0) {
    if (!boss || !boss.active) return;
    const ctx = this.ctx;
    const t = this._animTime;

    ctx.save();

    // 1. Mechanical Blast Doors on left (x = arenaLeftX - 1) and right (x = arenaRightX)
    const drawBlastDoor = (tileX, closed) => {
      const doorH = 4.0;
      const slideOffset = closed ? 0 : 3.6;
      const topLeft = this.worldToScreen(tileX, boss.floorY + doorH + slideOffset);
      const wPx = 1.0 * PPT;
      const hPx = doorH * PPT;
      ctx.save();
      ctx.fillStyle = closed ? '#334155' : '#1E293B';
      ctx.strokeStyle = closed ? '#94A3B8' : '#38BDF8';
      ctx.lineWidth = 2.5;
      ctx.fillRect(topLeft.x, topLeft.y, wPx, hPx);
      ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, wPx - 2, hPx - 2);
      // Hazard chevron stripes on sealed door
      ctx.strokeStyle = closed ? '#F59E0B' : '#22D3EE';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const sy = topLeft.y + 18 + i * (hPx * 0.22);
        ctx.beginPath();
        ctx.moveTo(topLeft.x + 8, sy);
        ctx.lineTo(topLeft.x + wPx - 8, sy + 14);
        ctx.stroke();
      }
      ctx.restore();
    };
    drawBlastDoor(boss.arenaLeftX - 1, boss.leftDoorClosed);
    drawBlastDoor(boss.arenaRightX, boss.rightDoorClosed);

    // 2. World Exit Portal (right chamber end)
    const ep = boss.exitPortal;
    if (ep) {
      const pTop = this.worldToScreen(ep.x, ep.y + ep.height);
      const pw = ep.width * PPT;
      const ph = ep.height * PPT;
      const cx = pTop.x + pw * 0.5;
      const cy = pTop.y + ph * 0.52;

      ctx.save();
      // Stone portal arch
      ctx.fillStyle = ep.unlocked ? '#0F172A' : '#1E293B';
      ctx.strokeStyle = ep.unlocked ? '#38BDF8' : '#475569';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(pTop.x, pTop.y, pw, ph, [pw * 0.45, pw * 0.45, 6, 6]);
      ctx.fill();
      ctx.stroke();

      if (ep.unlocked) {
        const pulse = 0.85 + Math.sin(t * 7.5) * 0.15;
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, pw * 0.55 * pulse);
        grad.addColorStop(0, '#FEF08A');
        grad.addColorStop(0.45, '#38BDF8');
        grad.addColorStop(1, 'rgba(14, 165, 233, 0.08)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, pw * 0.36 * pulse, ph * 0.40 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#FEF08A';
        ctx.textAlign = 'center';
        ctx.fillText('WORLD EXIT', cx, pTop.y - 10);
      } else {
        ctx.font = '600 11px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.fillText('SEALED', cx, cy + 4);
      }
      ctx.restore();
    }

    // 3. Room-wide Ground Shockwaves
    for (let i = 0; i < boss.shockwaves.length; i++) {
      const sw = boss.shockwaves[i];
      const swTop = this.worldToScreen(sw.x, sw.y + sw.height);
      const swW = sw.width * PPT;
      const swH = sw.height * PPT;
      ctx.save();
      const grad = ctx.createLinearGradient(swTop.x, swTop.y, swTop.x, swTop.y + swH);
      grad.addColorStop(0, '#FEF08A');
      grad.addColorStop(0.55, '#F97316');
      grad.addColorStop(1, '#DC2626');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(swTop.x, swTop.y + swH);
      ctx.quadraticCurveTo(swTop.x + swW * 0.5, swTop.y - swH * 0.35, swTop.x + swW, swTop.y + swH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 4. Harmless Geometric Shatter Debris
    for (let i = 0; i < boss.debris.length; i++) {
      const d = boss.debris[i];
      const pos = this.worldToScreen(d.x, d.y);
      const r = d.size * PPT;
      const alphaFade = Math.max(0, 1 - Math.pow(d.life / d.maxLife, 2));
      ctx.save();
      ctx.globalAlpha = alphaFade;
      ctx.translate(pos.x, pos.y);
      ctx.rotate(d.angle);
      ctx.fillStyle = d.color;
      ctx.strokeStyle = d.rimColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let s = 0; s < d.sides; s++) {
        const a = (s / d.sides) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 5. The Dread-Shell Golem
    const g = boss.golem;
    if (g && g.active && !g.defeated) {
      const gx = g.prevPos.x + (g.pos.x - g.prevPos.x) * alpha;
      const gy = g.prevPos.y + (g.pos.y - g.prevPos.y) * alpha;
      const topLeft = this.worldToScreen(gx, gy + g.height);
      const wPx = g.width * PPT;
      const hPx = g.height * PPT;
      const cx = topLeft.x + wPx * 0.5;
      const cy = topLeft.y + hPx * 0.5;
      const flash = g.hitFlashFrames > 0 && Math.floor(g.hitFlashFrames / 2) % 2 === 0;

      ctx.save();
      if (g.isSpikedBoulder) {
        // Phase 2 Enraged Crimson Spiked Boulder
        ctx.translate(cx, cy);
        ctx.rotate(g.spinAngle);
        const radius = Math.min(wPx, hPx) * 0.48;
        ctx.fillStyle = flash ? '#FFFFFF' : '#7F1D1D';
        ctx.strokeStyle = '#F87171';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Armored rim spikes
        ctx.fillStyle = '#FEF2F2';
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.16) * radius, Math.sin(a - 0.16) * radius);
          ctx.lineTo(Math.cos(a) * (radius + 14), Math.sin(a) * (radius + 14));
          ctx.lineTo(Math.cos(a + 0.16) * radius, Math.sin(a + 0.16) * radius);
          ctx.closePath();
          ctx.fill();
        }

        // Inner crimson spiral rune
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.52, 0, Math.PI * 1.4);
        ctx.stroke();
      } else {
        // Armored Dread-Shell Golem Standing Chassis
        const hullFill =
          flash
            ? '#FFFFFF'
            : g.carapaceGlow === 'crimson'
              ? '#991B1B'
              : g.carapaceGlow === 'overdrive'
                ? '#7C2D12'
                : '#334155';
        const trimColor =
          g.carapaceGlow === 'crimson'
            ? '#EF4444'
            : g.carapaceGlow === 'overdrive'
              ? '#F59E0B'
              : '#D97706';

        // Heavy stone/bronze armored shell dome
        ctx.fillStyle = hullFill;
        ctx.strokeStyle = trimColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(topLeft.x + 6, topLeft.y + 8, wPx - 12, hPx - 18, [wPx * 0.42, wPx * 0.42, 14, 14]);
        ctx.fill();
        ctx.stroke();

        // Crown carapace plates + dorsal spikes
        ctx.fillStyle = '#E2E8F0';
        for (const frac of [0.28, 0.50, 0.72]) {
          ctx.beginPath();
          ctx.moveTo(topLeft.x + wPx * (frac - 0.08), topLeft.y + 14);
          ctx.lineTo(topLeft.x + wPx * frac, topLeft.y - 8);
          ctx.lineTo(topLeft.x + wPx * (frac + 0.08), topLeft.y + 14);
          ctx.closePath();
          ctx.fill();
        }

        // Expressive glowing visor eyes
        const faceDir = g.facingRight ? 1 : -1;
        const eyeY = topLeft.y + hPx * 0.30;
        ctx.fillStyle = g.carapaceGlow === 'crimson' || g.carapaceGlow === 'overdrive' ? '#EF4444' : '#38BDF8';
        ctx.fillRect(cx + faceDir * 10 - 16, eyeY, 12, 7);
        ctx.fillRect(cx + faceDir * 10 + 4, eyeY, 12, 7);

        // Exposed Power Core (glowing amber target during vulnerability / steam cooldown)
        if (g.coreExposed) {
          const pulse = 0.85 + Math.sin(t * 14) * 0.15;
          const coreY = topLeft.y + hPx * 0.66;
          ctx.fillStyle = '#FEF08A';
          ctx.strokeStyle = '#F97316';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(cx, coreY, wPx * 0.26 * pulse, hPx * 0.16 * pulse, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.fillStyle = '#FEF08A';
          ctx.textAlign = 'center';
          ctx.fillText('KICK SHELL INTO CORE!', cx, topLeft.y - 28);
        }

        // Steam Exhaust Plumes during Phase 2 cooldown
        if (g.state === 'STEAM_COOLDOWN') {
          ctx.fillStyle = 'rgba(241, 245, 249, 0.68)';
          for (let p = 0; p < 3; p++) {
            const phase = (t * 2.2 + p * 0.33) % 1;
            const sx = cx + (p - 1) * 26;
            const sy = topLeft.y - 8 - phase * 42;
            ctx.beginPath();
            ctx.arc(sx, sy, 8 + phase * 10, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // Overhead 3-Pip Boss Health Bar (World-anchored above Golem)
      ctx.save();
      const pipW = 24;
      const pipH = 7;
      const gap = 6;
      const totalW = g.maxHp * pipW + (g.maxHp - 1) * gap;
      const startX = cx - totalW * 0.5;
      const barY = topLeft.y - 20;
      for (let p = 0; p < g.maxHp; p++) {
        ctx.fillStyle = p < g.hp ? (g.phase === 3 ? '#F59E0B' : g.phase === 2 ? '#EF4444' : '#38BDF8') : 'rgba(15, 23, 42, 0.72)';
        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = 1.4;
        ctx.fillRect(startX + p * (pipW + gap), barY, pipW, pipH);
        ctx.strokeRect(startX + p * (pipW + gap), barY, pipW, pipH);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Stage 21: Deterministic 60 Hz Iris / Curtain Screen Wipe Overlay for Lifecycle Transitions.
   */
  drawScreenWipe(wipe) {
    if (!wipe || wipe.phase === 'none' || wipe.progress <= 0.001) return;
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;
    const p = Math.max(0, Math.min(1, wipe.progress));

    ctx.save();
    if (wipe.style === 'curtain') {
      const halfH = (h * 0.52) * p;
      ctx.fillStyle = '#070B19';
      ctx.fillRect(0, 0, w, halfH);
      ctx.fillRect(0, h - halfH, w, halfH);
    } else {
      // Iris wipe closing toward screen center
      const maxR = Math.hypot(w, h) * 0.55;
      const openR = Math.max(0, maxR * (1 - p));
      ctx.fillStyle = '#070B19';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      if (openR > 1) {
        ctx.moveTo(w * 0.5 + openR, h * 0.5);
        ctx.arc(w * 0.5, h * 0.5, openR, 0, Math.PI * 2, true);
      }
      ctx.fill('evenodd');
    }
    ctx.restore();
  }
}

export default Renderer;
