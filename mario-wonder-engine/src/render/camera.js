/**
 * src/render/camera.js — Dynamic Platformer Camera Kinematics Engine
 * ===================================================================
 * Elastic, multi-zone virtual camera inspired by Super Mario World and modern
 * 2D platformers. Replaces rigid player-centered tracking with:
 *
 *   1. Dual-Axis Deadzone (Focus Window):
 *      - Horizontal Deadzone: 48px wide (±24px = ±0.375t) centered on focus anchor.
 *        Slow walking within this window produces zero camera scroll.
 *      - Vertical Deadzone: 64px tall (1.00t) window. Normal walking over minor
 *        1-block steps or micro-bumps leaves camera vertical position locked.
 *
 *   2. Dynamic Velocity Look-Ahead (Lead Bias):
 *      - Target offset: Lx = sign(vx) * min(|vx| * 18.0, 160px) (up to 2.50 tiles).
 *      - Variable exponential smoothing: alpha = 0.05 during normal run,
 *        alpha = 0.12 during skid/turnaround, paired with turnaround hysteresis
 *        so rapid left-right skidding never causes violent oscillation.
 *      - Critically damped elastic horizontal follow keeps d²x/dt² strictly bounded.
 *
 *   3. Vertical Fall Catch & Ceiling Tracking:
 *      - Upward Jump Damping: Smooth exponential lag (alpha = 0.08) during upward ascents.
 *      - Downward Descent Anticipation: When vy < -6.0 tiles/s for > 12 consecutive frames,
 *        expands downward look window by 120px (1.875 tiles) to prevent blind pit drops.
 *      - Ground Snap: Upon grounded contact, gently restores standard eye-level baseline
 *        over 15 frames via cubic Hermite smoothstep.
 *
 *   4. Sprint Momentum Lens Expansion:
 *      - Sustaining |vx| >= 9.20 tiles/s for > 30 frames smoothly expands viewport width
 *        by ~8% (zoom factor Z = 0.925 applied via Canvas 2D transform).
 *      - Restores smoothly to Z = 1.000 over 20 frames upon decelerating below sprint speed.
 *
 *   5. Level Boundary Clamping & Room Partitions (Camera Locks):
 *      - Strict AABB clamping to level boundaries (zero off-map void, zero sub-pixel jitter).
 *      - First-class Camera Locks: vertical divider lines, horizontal divider lines, and
 *        arena/chamber bounding locks that hold scrolling until cleared.
 *
 * Units:
 *   - World coordinates are Y-up in tiles (1 tile = 64px).
 *   - Fixed 60 Hz deterministic update; render interpolation via getRenderState(alpha).
 */

import { PerspectiveCamera } from 'three';
import MovementProfile from '../game/config/MovementProfile.js';
import { smoothDamp, clamp, lerp, degToRad } from '../utils/MathUtils.js';
import ScreenShake from '../engine/camera/ScreenShake.js';

const BASE_VIEWPORT_WIDTH_TILES = 22.0;
const ASPECT_16_9 = 16 / 9;
const BASE_VIEWPORT_HEIGHT_TILES = BASE_VIEWPORT_WIDTH_TILES / ASPECT_16_9; // 12.375 tiles

/**
 * Pure helper: Compute target horizontal look-ahead lead in pixels.
 *   Lx = sign(vx) * min(|vx| * 18.0, 160px)
 * @param {number} vxTilesPerSec
 * @param {number} [gainPx=18.0]
 * @param {number} [maxPx=160]
 * @returns {number} Look-ahead lead in pixels
 */
export function computeTargetLookAheadPx(
  vxTilesPerSec,
  gainPx = MovementProfile.camera.lookAheadVelocityGainPx,
  maxPx = MovementProfile.camera.lookAheadMaxPx
) {
  if (!Number.isFinite(vxTilesPerSec) || Math.abs(vxTilesPerSec) < 1e-4) return 0;
  return Math.sign(vxTilesPerSec) * Math.min(Math.abs(vxTilesPerSec) * gainPx, maxPx);
}

/**
 * Pure helper: Resolve effective camera AABB bounds from level tilemap dimensions
 * intersected with all active, non-cleared Camera Locks (vertical/horizontal dividers & boxes).
 *
 * @param {object|null} tilemap
 * @param {number} viewW
 * @param {number} viewH
 * @param {Array<object>} locks
 * @param {number} playerX
 * @param {number} playerY
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, activeLockIds: string[] }}
 */
export function computeEffectiveCameraBounds(tilemap, viewW, viewH, locks = [], playerX = 0, playerY = 0) {
  const mapW = tilemap ? (tilemap.cols ?? tilemap.width ?? 0) : 0;
  const mapH = tilemap ? (tilemap.rows ?? tilemap.height ?? 0) : 0;
  let minX = 0;
  let maxX = tilemap ? Math.max(0, mapW - viewW) : Infinity;
  let minY = 0;
  let maxY = tilemap ? Math.max(0, mapH - viewH) : Infinity;
  const activeLockIds = [];

  if (!tilemap) {
    minX = -Infinity;
    minY = -Infinity;
  }

  for (let i = 0; i < locks.length; i++) {
    const lock = locks[i];
    if (!lock || lock.cleared || lock.active === false) continue;

    if (lock.axis === 'vertical' && Number.isFinite(lock.x)) {
      // Vertical divider line at world x = lock.x
      const side = lock.side || 'auto';
      let enforceMin = false;
      let enforceMax = false;
      if (side === 'min' || side === 'left') {
        enforceMin = true;
      } else if (side === 'max' || side === 'right') {
        enforceMax = true;
      } else {
        // 'auto': barrier sits between player's current side and the far side
        if (playerX >= lock.x) enforceMin = true;
        else enforceMax = true;
      }

      if (enforceMin) {
        minX = Math.max(minX, lock.x);
        activeLockIds.push(lock.id);
      } else if (enforceMax) {
        maxX = Math.min(maxX, lock.x - viewW);
        activeLockIds.push(lock.id);
      }
    } else if (lock.axis === 'horizontal' && Number.isFinite(lock.y)) {
      // Horizontal divider line at world y = lock.y
      const side = lock.side || 'auto';
      let enforceMin = false;
      let enforceMax = false;
      if (side === 'min' || side === 'bottom') {
        enforceMin = true;
      } else if (side === 'max' || side === 'top') {
        enforceMax = true;
      } else {
        if (playerY >= lock.y) enforceMin = true;
        else enforceMax = true;
      }

      if (enforceMin) {
        minY = Math.max(minY, lock.y);
        activeLockIds.push(lock.id);
      } else if (enforceMax) {
        maxY = Math.min(maxY, lock.y - viewH);
        activeLockIds.push(lock.id);
      }
    } else if (lock.axis === 'box') {
      // Full 2D arena/chamber bounding lock
      if (Number.isFinite(lock.minX)) minX = Math.max(minX, lock.minX);
      if (Number.isFinite(lock.maxX)) maxX = Math.min(maxX, lock.maxX - viewW);
      if (Number.isFinite(lock.minY)) minY = Math.max(minY, lock.minY);
      if (Number.isFinite(lock.maxY)) maxY = Math.min(maxY, lock.maxY - viewH);
      activeLockIds.push(lock.id);
    }
  }

  // Guard against chambers narrower/shorter than the current zoomed viewport
  if (Number.isFinite(minX) && Number.isFinite(maxX) && maxX < minX) {
    const midX = tilemap ? clamp((minX + maxX) * 0.5, 0, Math.max(0, mapW - viewW)) : minX;
    minX = midX;
    maxX = midX;
  }
  if (Number.isFinite(minY) && Number.isFinite(maxY) && maxY < minY) {
    const midY = tilemap ? clamp((minY + maxY) * 0.5, 0, Math.max(0, mapH - viewH)) : minY;
    minY = midY;
    maxY = midY;
  }

  return { minX, maxX, minY, maxY, activeLockIds };
}

/**
 * Pure helper: Apply camera zoom (Z = 0.925..1.000) & unified screen-shake transform
 * onto a CanvasRenderingContext2D around the viewport center.
 * Returns true if ctx.save() was invoked (caller must pair with ctx.restore()).
 */
export function applyCanvasCameraTransform(ctx, displayWidth, displayHeight, camState, pptBase) {
  if (!ctx || !camState) return false;
  const zoom = camState.zoom ?? 1.0;
  const hasZoom = Math.abs(zoom - 1.0) > 1e-5;
  const hasShake =
    Math.abs(camState.shakeX || 0) > 1e-5 ||
    Math.abs(camState.shakeY || 0) > 1e-5 ||
    Math.abs(camState.shakeRollDeg || 0) > 1e-5 ||
    Math.abs(camState.shakePitchDeg || 0) > 1e-5;

  if (!hasZoom && !hasShake) return false;

  const cx = displayWidth * 0.5;
  const cy = displayHeight * 0.5;
  const ppt = pptBase * zoom;
  const sx = (camState.shakeX || 0) * ppt;
  const sy = -((camState.shakeY || 0) + (camState.shakePitchDeg || 0) * 0.18) * ppt;
  const rad = ((camState.shakeRollDeg || 0) * Math.PI) / 180;

  ctx.save();
  ctx.translate(cx + sx, cy + sy);
  if (rad !== 0) ctx.rotate(rad);
  if (hasZoom) ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);
  return true;
}

export class PlatformerCamera {
  constructor() {
    const camCfg = MovementProfile.camera;

    // Bottom-left frustum origin on the Z = 0.0 gameplay plane (in world tiles)
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;

    // Elastic follow velocities (tiles/s)
    this.velX = 0;
    this.velY = 0;
    this._filteredVx = 0;

    // 1. Dual-Axis Deadzone (48px horizontal × 64px vertical focus window)
    this.deadzoneCenterX = 0;
    this.deadzoneBottomY = 0;
    this.inHorizontalDeadzone = true;
    this.inVerticalDeadzone = true;
    this._scrollEngagedX = false;

    // 2. Dynamic Velocity Look-Ahead (Lx = sign(vx) * min(|vx| * 18, 160px)) + Hysteresis
    this.lookAheadPx = 0;
    this.lookAheadOffset = 0; // tiles (= lookAheadPx / 64)
    this.targetLookAheadPx = 0;
    this.lookAheadAlpha = camCfg.lookAheadAlphaNormal;
    this.facingLookAhead = 1;
    this._committedDir = 1;
    this._reversalFrames = 0;
    this._reversalOriginX = 0;
    this._isSkidTurnaround = false;

    // 3. Vertical Fall Catch, Upward Damping & 15-Frame Ground Snap
    this.anchorElevationY = 0;
    this.verticalFocusY = 0;
    this.fallFastFrames = 0;
    this.fallAnticipationActive = false;
    this.fallLookDownPx = 0;
    this.fastFallOffset = 0; // tiles (= fallLookDownPx / 64)
    this.groundSnapActive = false;
    this.groundSnapFrame = 0;
    this._groundSnapStartY = 0;
    this._groundSnapTargetY = 0;
    this._groundSnapStartFallPx = 0;
    this._wasGrounded = true;
    this._airborneMovedVertical = false;
    this.aerialClampActive = false;

    // 4. Sprint Momentum Lens Expansion (Z = 0.925 after > 30 frames at |vx| >= 9.20 t/s)
    this.zoom = 1.0;
    this.prevZoom = 1.0;
    this.sprintSustainFrames = 0;
    this.sprintZoomActive = false;
    this._zoomRestoreActive = false;
    this._zoomRestoreFrame = 0;
    this._zoomRestoreStartZoom = 1.0;

    // Perspective FOV & peripheral vignette telemetry synced with zoom
    this.fov = camCfg.fov;
    this.prevFov = camCfg.fov;
    this.sprintIntensity = 0;
    this.prevSprintIntensity = 0;
    this._sprintIntensityVel = 0;

    // 5. Level Boundary Clamping & Room Partition Camera Locks
    this.locks = [];
    this.activeLockIds = [];
    this.clampedLeft = false;
    this.clampedRight = false;
    this.clampedBottom = false;
    this.clampedTop = false;

    // Tracked player coordinates & normalized screen position
    this.lastPlayerX = 0;
    this.lastPlayerY = 0;
    this.playerScreenX = 0.5;
    this.playerScreenY = camCfg.baselineScreenY;

    // Debug overlay toggle ([F4])
    this.debugOverlay = false;

    // Unified Trauma Screen Shake (can be delegated to Stage 20 JuiceEngine TraumaShake)
    this.shake = new ScreenShake();
    this._externalShakeUpdate = false;

    // Real 3D PerspectiveCamera (30° vertical FOV at Z = +18.0 tiles, 4° downward pitch)
    this.perspectiveCamera = new PerspectiveCamera(camCfg.fov, ASPECT_16_9, 0.1, 500);
    this._syncPerspectiveCamera(camCfg.fov, 0, 0);
  }

  get camera() {
    return this.perspectiveCamera;
  }

  get viewW() {
    return this.getViewportSizeTiles().viewW;
  }

  get viewH() {
    return this.getViewportSizeTiles().viewH;
  }

  get frustumWidthTiles() {
    return this.viewW;
  }

  get centerX() {
    return this.x + this.viewW * 0.5;
  }

  get centerY() {
    return this.y + this.viewH * 0.5;
  }

  get sprintVignetteIntensity() {
    return this.sprintIntensity;
  }

  get verticalSafetyClampActive() {
    return this.aerialClampActive;
  }

  get fastFallActive() {
    return this.fallAnticipationActive;
  }

  get deadzoneTopY() {
    const ppt = MovementProfile.simulation.pixelsPerTile;
    return this.deadzoneBottomY + MovementProfile.camera.deadzoneHeightPx / ppt;
  }

  // ─── Camera Locks & Room Partition API ───────────────────────

  /**
   * Register a Camera Lock (vertical divider, horizontal divider, or arena box).
   * @param {object} lockSpec - { id, axis: 'vertical'|'horizontal'|'box', x?, y?, side?, minX?, maxX?, minY?, maxY?, triggerBox?, autoTrigger?, active? }
   */
  addLock(lockSpec) {
    if (!lockSpec || !lockSpec.id) return null;
    const existingIdx = this.locks.findIndex((l) => l.id === lockSpec.id);
    const normalized = {
      active: lockSpec.autoTrigger ? false : lockSpec.active !== false,
      cleared: false,
      autoTrigger: Boolean(lockSpec.autoTrigger),
      ...lockSpec,
    };
    if (existingIdx >= 0) {
      this.locks[existingIdx] = normalized;
    } else {
      this.locks.push(normalized);
    }
    return normalized;
  }

  /**
   * Replace all room camera locks (called on room load/reset).
   */
  setLocks(lockList = []) {
    this.locks = [];
    this.activeLockIds = [];
    if (!Array.isArray(lockList)) return;
    for (let i = 0; i < lockList.length; i++) {
      this.addLock(lockList[i]);
    }
  }

  /**
   * Clear/unlock a camera lock (e.g. after arena encounter or puzzle chamber is cleared).
   * Scrolling resumes smoothly via elastic follow without snapping.
   */
  clearLock(id) {
    const lock = this.locks.find((l) => l.id === id);
    if (!lock) return false;
    lock.cleared = true;
    lock.active = false;
    this.activeLockIds = this.activeLockIds.filter((lid) => lid !== id);
    return true;
  }

  /**
   * Remove a camera lock entirely.
   */
  removeLock(id) {
    const before = this.locks.length;
    this.locks = this.locks.filter((l) => l.id !== id);
    this.activeLockIds = this.activeLockIds.filter((lid) => lid !== id);
    return this.locks.length !== before;
  }

  /**
   * Return currently active, non-cleared camera locks.
   */
  getActiveLocks() {
    return this.locks.filter((l) => l && !l.cleared && l.active !== false);
  }

  /**
   * Bind an external trauma shake controller (e.g. Stage 20 JuiceEngine.trauma).
   * When externalUpdate=true, caller ticks update(dt) once per 60 Hz frame so decay is never doubled.
   */
  setTraumaSource(shakeAdapter, externalUpdate = true) {
    if (!shakeAdapter) return;
    this.shake = shakeAdapter;
    this._externalShakeUpdate = Boolean(externalUpdate);
  }

  /**
   * Add trauma to the unified camera shake controller.
   */
  addTrauma(amount, dirX = 0, dirY = -1) {
    this.shake.addTrauma(amount, dirX, dirY);
  }

  /**
   * Compute viewport width & height in tiles on the Z = 0.0 gameplay plane,
   * incorporating zoom factor Z (0.925 expands viewport width by 1/0.925 ≈ +8.1%).
   */
  getViewportSizeTiles(
    displayWidth = 1280,
    displayHeight = 720,
    scale = 1280 / (22 * 64),
    zoom = this.zoom
  ) {
    const safeZoom = clamp(Number.isFinite(zoom) ? zoom : 1.0, 0.5, 2.0);
    const invZoom = 1 / safeZoom;

    if (displayWidth > 0 && displayHeight > 0 && scale > 0) {
      const ppt = MovementProfile.tilemap.tileSize * scale;
      const baseW = displayWidth / ppt;
      const baseH = displayHeight / ppt;
      return {
        viewW: Math.max(1, baseW * invZoom),
        viewH: Math.max(1, baseH * invZoom),
        baseViewW: Math.max(1, baseW),
        baseViewH: Math.max(1, baseH),
        zoom: safeZoom,
        fovScale: safeZoom,
      };
    }

    return {
      viewW: BASE_VIEWPORT_WIDTH_TILES * invZoom,
      viewH: BASE_VIEWPORT_HEIGHT_TILES * invZoom,
      baseViewW: BASE_VIEWPORT_WIDTH_TILES,
      baseViewH: BASE_VIEWPORT_HEIGHT_TILES,
      zoom: safeZoom,
      fovScale: safeZoom,
    };
  }

  /**
   * Apply the Canvas 2D transform (Sprint Zoom Z + Trauma Shake) around viewport center.
   */
  applyCanvasTransform(ctx, displayWidth, displayHeight, camState, pptBase) {
    return applyCanvasCameraTransform(ctx, displayWidth, displayHeight, camState, pptBase);
  }

  /**
   * Synchronize the Three.js PerspectiveCamera transform & projection matrix
   * for Z = +18.0 tiles and downward pitch = 4.0° toward the Z = 0.0 gameplay plane.
   */
  _syncPerspectiveCamera(fovDeg, camCenterX, camCenterY) {
    const config = MovementProfile.camera;
    const posZ = config.positionZ;
    const pitchRad = -degToRad(config.downPitch) + degToRad(this.shake.pitchDeg);
    const rollRad = degToRad(this.shake.rollDeg);

    const pitchCompensationY = posZ * Math.tan(degToRad(config.downPitch));
    const eyeX = camCenterX + this.shake.offsetX;
    const eyeY = camCenterY + pitchCompensationY + this.shake.offsetY;

    if (Math.abs(this.perspectiveCamera.fov - fovDeg) > 1e-5) {
      this.perspectiveCamera.fov = fovDeg;
      this.perspectiveCamera.updateProjectionMatrix();
    }
    this.perspectiveCamera.position.set(eyeX, eyeY, posZ);
    this.perspectiveCamera.rotation.order = 'YXZ';
    this.perspectiveCamera.rotation.set(pitchRad, 0, rollRad);
    this.perspectiveCamera.updateMatrixWorld();
  }

  /**
   * Evaluate auto-trigger arena/chamber camera locks against player world position.
   */
  _evaluateLockTriggers(playerX, playerY) {
    for (let i = 0; i < this.locks.length; i++) {
      const lock = this.locks[i];
      if (!lock || lock.cleared || lock.active) continue;
      if (!lock.autoTrigger) continue;

      const tb = lock.triggerBox || lock;
      const inX =
        (!Number.isFinite(tb.minX) || playerX >= tb.minX) &&
        (!Number.isFinite(tb.maxX) || playerX <= tb.maxX);
      const inY =
        (!Number.isFinite(tb.minY) || playerY >= tb.minY) &&
        (!Number.isFinite(tb.maxY) || playerY <= tb.maxY);
      if (inX && inY) {
        lock.active = true;
      }
    }
  }

  /**
   * Convenience wrapper updating directly from PlayerController in 60 Hz fixed update.
   */
  updateFromPlayer(player, dt, tilemap, displayWidth = 1280, displayHeight = 720, scale = 1280 / (22 * 64)) {
    if (!player) return;
    const px = player.centerX ?? player.pos.x;
    const py = player.pos?.y ?? player.centerY ?? 0;
    const vx = player.vel.x;
    const vy = player.vel.y;
    const grounded = Boolean(player.grounded);
    const isGroundPound = Boolean(player.groundPoundPhase) || player.state === 'GroundPound';
    const isSkidding = Boolean(player.isSkidding) || player.state === 'Skid' || player.state === 'Pivot';
    this.update(
      px,
      py,
      vx,
      vy,
      grounded,
      dt,
      tilemap,
      displayWidth,
      displayHeight,
      scale,
      isGroundPound,
      isSkidding
    );
  }

  /**
   * Advance camera kinematics by one fixed timestep `dt` (1/60s).
   * Supports both `(playerObj, tilemap, dt)` and `(px, py, vx, vy, grounded, dt, tilemap, ...)`.
   */
  update(
    playerX,
    playerY,
    playerVx,
    playerVy,
    grounded,
    dt,
    tilemap = null,
    displayWidth = 1280,
    displayHeight = 720,
    scale = 1280 / (22 * 64),
    isGroundPound = false,
    isSkidding = false
  ) {
    if (typeof playerX === 'object' && playerX !== null) {
      const playerObj = playerX;
      const mapObj = playerY || null;
      const stepDt = typeof playerVx === 'number' ? playerVx : MovementProfile.simulation.fixedTimeStep;
      this.updateFromPlayer(playerObj, stepDt, mapObj, displayWidth, displayHeight, scale);
      return;
    }

    const config = MovementProfile.camera;
    const ppt = MovementProfile.simulation.pixelsPerTile; // 64 px/tile
    const runTop = Math.max(0.1, MovementProfile.locomotion.runTopSpeed);
    const walkTop = Math.max(0.1, MovementProfile.locomotion.walkTopSpeed);
    const absVx = Math.abs(playerVx);
    const stepDt = dt > 0 ? dt : MovementProfile.simulation.fixedTimeStep;
    const frameScale = stepDt * 60; // 1.0 at fixed 60 Hz

    // Snapshot previous tick state for sub-frame render interpolation
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZoom = this.zoom;
    this.prevFov = this.fov;
    this.prevSprintIntensity = this.sprintIntensity;
    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;

    // Evaluate any auto-triggered Camera Locks
    this._evaluateLockTriggers(playerX, playerY);

    // ─── 4. Sprint Momentum Lens Expansion (|vx| >= 9.20 t/s for > 30 frames -> Z = 0.925) ─
    const sprintThreshold = config.sprintZoomSpeedThreshold ?? 9.20;
    const atSprintSpeed = absVx >= sprintThreshold - 1e-4;
    if (atSprintSpeed) {
      this.sprintSustainFrames += frameScale;
      this._zoomRestoreActive = false;
      this._zoomRestoreFrame = 0;

      if (this.sprintSustainFrames > config.sprintZoomDelayFrames) {
        this.sprintZoomActive = true;
        const alphaIn = 1 - Math.pow(1 - config.sprintZoomInAlpha, frameScale);
        this.zoom = lerp(this.zoom, config.sprintZoomTarget, alphaIn);
        if (Math.abs(this.zoom - config.sprintZoomTarget) < 1e-4) {
          this.zoom = config.sprintZoomTarget;
        }
      }
    } else {
      if (this.sprintZoomActive || this.zoom < 1.0 - 1e-5) {
        if (!this._zoomRestoreActive) {
          this._zoomRestoreActive = true;
          this._zoomRestoreFrame = 0;
          this._zoomRestoreStartZoom = this.zoom;
        }
        this._zoomRestoreFrame += frameScale;
        const restoreDur = Math.max(1, config.sprintZoomRestoreFrames);
        const t = clamp(this._zoomRestoreFrame / restoreDur, 0, 1);
        const smoothT = t * t * (3 - 2 * t);
        this.zoom = lerp(this._zoomRestoreStartZoom, 1.0, smoothT);
        if (t >= 1) {
          this.zoom = 1.0;
          this._zoomRestoreActive = false;
        }
      }
      this.sprintSustainFrames = 0;
      this.sprintZoomActive = false;
    }

    // Peripheral sprint vignette intensity (> 8.0 t/s) & 3D PerspectiveCamera FOV sync
    const vignetteThreshold = config.sprintVignetteSpeed;
    const targetSprintIntensity =
      absVx > vignetteThreshold
        ? clamp((absVx - vignetteThreshold) / Math.max(0.2, runTop - vignetteThreshold), 0, 1)
        : 0;
    const [nextSprint, nextSprintVel] = smoothDamp(
      this.sprintIntensity,
      targetSprintIntensity,
      this._sprintIntensityVel,
      0.12,
      stepDt
    );
    this.sprintIntensity = clamp(nextSprint, 0, 1);
    this._sprintIntensityVel = nextSprintVel;

    // Sync PerspectiveCamera FOV cleanly with the canvas zoom expansion (30° at Z=1.0 -> ~32.28° at Z=0.925)
    const baseHalfTan = Math.tan(degToRad(config.fov) * 0.5);
    const zoomedFovDeg = (2 * Math.atan(baseHalfTan / this.zoom) * 180) / Math.PI;
    this.fov = zoomedFovDeg;

    const vp = this.getViewportSizeTiles(displayWidth, displayHeight, scale, this.zoom);
    const { viewW, viewH, baseViewH } = vp;

    // ─── 1. Horizontal Deadzone (48px wide = ±24px = ±0.375 tiles) ──────────
    const dzHalfX = (config.deadzoneWidthPx * 0.5) / ppt; // 0.375 tiles
    let exitedHorizontalDeadzone = false;

    if (playerX > this.deadzoneCenterX + dzHalfX) {
      this.deadzoneCenterX = playerX - dzHalfX;
      exitedHorizontalDeadzone = true;
      this._scrollEngagedX = true;
    } else if (playerX < this.deadzoneCenterX - dzHalfX) {
      this.deadzoneCenterX = playerX + dzHalfX;
      exitedHorizontalDeadzone = true;
      this._scrollEngagedX = true;
    }

    this.inHorizontalDeadzone = !exitedHorizontalDeadzone;
    if (absVx < 0.05 && Math.abs(this.lookAheadPx) < 0.5 && Math.abs(this.velX) < 0.05) {
      this._scrollEngagedX = false;
    }

    // ─── 2. Dynamic Velocity Look-Ahead (Lx = sign(vx) * min(|vx|*18, 160px)) ─
    //     + Variable Smoothing (0.05 normal, 0.12 skid/turnaround) + Hysteresis
    const velDir = absVx > 0.05 ? Math.sign(playerVx) : 0;
    const opposingLead =
      velDir !== 0 &&
      Math.abs(this.lookAheadPx) > 4.0 &&
      velDir !== Math.sign(this.lookAheadPx);
    const opposingCommitted = velDir !== 0 && velDir !== this._committedDir;

    this._isSkidTurnaround = Boolean(isSkidding) || opposingLead;

    // Turnaround hysteresis gate: rapid alternating left-right skids damp smoothly to neutral
    // rather than whipping the camera across ±160px every few frames.
    if (opposingCommitted) {
      if (this._reversalFrames === 0) {
        this._reversalOriginX = playerX;
      }
      this._reversalFrames += frameScale;
      const reversedDist = Math.abs(playerX - this._reversalOriginX);
      const hysteresisFrames = Math.max(1, config.skidHysteresisFrames ?? 8);
      if (this._reversalFrames >= hysteresisFrames || reversedDist >= dzHalfX * 2.0) {
        this._committedDir = velDir;
        this._reversalFrames = 0;
      }
    } else if (velDir === this._committedDir) {
      this._reversalFrames = 0;
    }

    if (velDir !== 0) {
      this.facingLookAhead = this._committedDir;
    }

    // Slow walking strictly inside the 48px horizontal deadzone produces ZERO camera scroll
    const insideCalmHorizontalWindow =
      this.inHorizontalDeadzone &&
      !this._scrollEngagedX &&
      absVx <= walkTop + 0.05 &&
      Math.abs(this.lookAheadPx) < 0.5;

    let desiredLookAheadPx = 0;
    if (insideCalmHorizontalWindow) {
      desiredLookAheadPx = 0;
    } else if (Boolean(isSkidding) || (opposingCommitted && this._reversalFrames > 0)) {
      // During active skid braking or uncommitted rapid direction reversal,
      // bleed lead smoothly toward neutral 0 with alpha = 0.12 for stable hysteresis.
      desiredLookAheadPx = 0;
    } else {
      desiredLookAheadPx = computeTargetLookAheadPx(
        playerVx,
        config.lookAheadVelocityGainPx,
        config.lookAheadMaxPx
      );
    }

    this.targetLookAheadPx = desiredLookAheadPx;
    const rawAlpha = this._isSkidTurnaround
      ? config.lookAheadAlphaSkid
      : config.lookAheadAlphaNormal;
    this.lookAheadAlpha = rawAlpha;
    const effectiveLookAlpha = 1 - Math.pow(1 - clamp(rawAlpha, 0.001, 1), frameScale);

    if (insideCalmHorizontalWindow) {
      this.lookAheadPx = 0;
    } else {
      this.lookAheadPx = lerp(this.lookAheadPx, desiredLookAheadPx, effectiveLookAlpha);
      if (Math.abs(this.lookAheadPx) < 0.05 && desiredLookAheadPx === 0) {
        this.lookAheadPx = 0;
      }
    }
    this.lookAheadOffset = this.lookAheadPx / ppt; // in tiles (up to ±2.50 tiles)

    // Smoothly compensate horizontal deadzone lag at high speed so full sprint grants the
    // full 2.50-tile (160px) forward lead without losing 24px to the trailing deadzone edge.
    const sprintLeadBlend = clamp(Math.abs(this.lookAheadPx) / Math.max(1, config.lookAheadMaxPx), 0, 1);
    const focusAnchorX = lerp(this.deadzoneCenterX, playerX, sprintLeadBlend);
    const targetCamX = focusAnchorX + this.lookAheadOffset - viewW * 0.5;

    // Smoothly filtered velocity feedforward eliminates steady-state spring lag while
    // keeping d²x/dt² strictly bounded on step inputs from 0 -> max sprint!
    const filterAlpha = 1 - Math.pow(1 - 0.10, frameScale);
    const targetFilteredVx = insideCalmHorizontalWindow ? 0 : playerVx;
    this._filteredVx = lerp(this._filteredVx, targetFilteredVx, filterAlpha);

    if (insideCalmHorizontalWindow && Math.abs(this.velX) < 1e-4 && Math.abs(this.x - targetCamX) < 1e-4) {
      this.velX = 0;
    } else {
      const smoothTimeX = Math.max(0.04, config.springTimeConstant);
      const feedforwardX = this.x + this._filteredVx * stepDt;
      const [newX, newVelX] = smoothDamp(feedforwardX, targetCamX, this.velX, smoothTimeX, stepDt);
      this.x = newX;
      this.velX = newVelX;
    }

    // ─── 3. Vertical Deadzone (64px), Upward Jump Damping (α=0.08),
    //        Downward Descent Anticipation (-6.0 t/s > 12f -> +120px),
    //        & 15-Frame Ground Snap ──────────────────────────────────────────
    const dzHeightY = config.deadzoneHeightPx / ppt; // 64px = 1.00 tile
    const baselineScreenY = config.baselineScreenY ?? 0.35;
    const justLanded = grounded && !this._wasGrounded;

    // Check if player is inside the 64px vertical deadzone window [deadzoneBottomY, deadzoneBottomY + 1.0t]
    const dzTopY = this.deadzoneBottomY + dzHeightY;
    const insideVertDeadzone = playerY >= this.deadzoneBottomY - 1e-4 && playerY <= dzTopY + 1e-4;
    this.inVerticalDeadzone = insideVertDeadzone;

    if (!grounded) {
      // Cancel active ground snap if player jumps or walks off a ledge
      this.groundSnapActive = false;

      // Track consecutive fast-fall frames (vy < -6.0 tiles/s for > 12 frames)
      if (playerVy < config.fallAnticipationVy || isGroundPound) {
        this.fallFastFrames += frameScale;
      } else {
        this.fallFastFrames = 0;
      }

      if (this.fallFastFrames > config.fallAnticipationFrames || isGroundPound) {
        this.fallAnticipationActive = true;
        const fallAlpha = 1 - Math.pow(1 - (config.fallAnticipationAlpha ?? 0.09), frameScale);
        this.fallLookDownPx = lerp(this.fallLookDownPx, config.fallAnticipationOffsetPx, fallAlpha);
        this._airborneMovedVertical = true;
      } else {
        this.fallAnticipationActive = false;
      }

      // Upward Jump Damping (alpha = 0.08) once player rises above the 64px vertical deadzone
      if (playerVy > 0 && playerY > dzTopY) {
        const upAlpha = 1 - Math.pow(1 - config.upwardJumpAlpha, frameScale);
        const desiredBottomY = playerY - dzHeightY;
        this.deadzoneBottomY = lerp(this.deadzoneBottomY, desiredBottomY, upAlpha);
        this.verticalFocusY = this.deadzoneBottomY;
        this.anchorElevationY = this.verticalFocusY;
        this._airborneMovedVertical = true;
      } else if (playerY < this.deadzoneBottomY) {
        // Falling below deadzone bottom: smooth damped descent tracking (matches upward jump smoothness)
        const downAlpha = this.fallAnticipationActive ? 0.11 : 0.08;
        const effDownAlpha = 1 - Math.pow(1 - downAlpha, frameScale);
        this.deadzoneBottomY = lerp(this.deadzoneBottomY, playerY, effDownAlpha);
        this.verticalFocusY = this.deadzoneBottomY;
        this.anchorElevationY = this.verticalFocusY;
        this._airborneMovedVertical = true;
      }
    } else {
      // Grounded
      this.fallFastFrames = 0;
      this.fallAnticipationActive = false;

      if (justLanded) {
        // Upon grounded contact, gently restore standard eye-level baseline over 15 frames
        const needsSnap =
          Math.abs(this.verticalFocusY - playerY) > 0.02 ||
          this.fallLookDownPx > 0.5 ||
          this._airborneMovedVertical;
        if (needsSnap) {
          this.groundSnapActive = true;
          this.groundSnapFrame = 0;
          this._groundSnapStartY = this.verticalFocusY;
          this._groundSnapTargetY = playerY;
          this._groundSnapStartFallPx = this.fallLookDownPx;
        }
        this._airborneMovedVertical = false;
      } else if (this.groundSnapActive) {
        // Update target if walking onto a new floor while ground-snapping
        if (Math.abs(playerY - this._groundSnapTargetY) > dzHeightY) {
          this._groundSnapTargetY = playerY;
        }
      } else if (!insideVertDeadzone) {
        // Walking continuously up/down stairs or slopes beyond the 64px vertical deadzone window
        if (playerY > dzTopY) {
          const stepUpTarget = playerY - dzHeightY;
          const upAlpha = 1 - Math.pow(1 - config.upwardJumpAlpha, frameScale);
          this.deadzoneBottomY = lerp(this.deadzoneBottomY, stepUpTarget, upAlpha);
          this.verticalFocusY = this.deadzoneBottomY;
          this.anchorElevationY = this.verticalFocusY;
        } else if (playerY < this.deadzoneBottomY) {
          const downAlpha = 1 - Math.pow(1 - 0.12, frameScale);
          this.deadzoneBottomY = lerp(this.deadzoneBottomY, playerY, downAlpha);
          this.verticalFocusY = this.deadzoneBottomY;
          this.anchorElevationY = this.verticalFocusY;
        }
      }

      if (this.groundSnapActive) {
        this.groundSnapFrame += frameScale;
        const snapFrames = Math.max(1, config.groundSnapFrames ?? 15);
        const t = clamp(this.groundSnapFrame / snapFrames, 0, 1);
        const smoothT = t * t * (3 - 2 * t);
        this.verticalFocusY = lerp(this._groundSnapStartY, this._groundSnapTargetY, smoothT);
        this.deadzoneBottomY = this.verticalFocusY;
        this.anchorElevationY = this.verticalFocusY;
        this.fallLookDownPx = lerp(this._groundSnapStartFallPx, 0, smoothT);
        if (t >= 1) {
          this.verticalFocusY = this._groundSnapTargetY;
          this.deadzoneBottomY = this._groundSnapTargetY;
          this.anchorElevationY = this._groundSnapTargetY;
          this.fallLookDownPx = 0;
          this.groundSnapActive = false;
        }
      }
    }

    this._wasGrounded = grounded;
    this.fastFallOffset = this.fallLookDownPx / ppt; // in tiles (up to 1.875t = 120px)

    // Compute camera bottom Y using baseViewH so sprint zoom expands symmetrically around baseline
    // without shifting vertical framing on flat ground
    const zoomCenterAdjustY = (viewH - baseViewH) * 0.5;
    let targetCamY = this.verticalFocusY - baselineScreenY * baseViewH - this.fastFallOffset - zoomCenterAdjustY;

    // Aerial safety clamps so extreme high jumps or deep falls never let the player leave viewport
    const upperClampRatio = clamp(config.verticalUpperClamp, 0.60, 0.90);
    const lowerClampRatio = clamp(config.verticalLowerClamp, 0.10, 0.45);
    this.aerialClampActive = false;

    if (playerY - targetCamY > upperClampRatio * viewH) {
      this.aerialClampActive = true;
      targetCamY = playerY - upperClampRatio * viewH;
      this.verticalFocusY = Math.max(
        this.verticalFocusY,
        targetCamY + baselineScreenY * baseViewH + zoomCenterAdjustY
      );
      this.deadzoneBottomY = this.verticalFocusY;
      this.anchorElevationY = this.verticalFocusY;
    } else if (playerY - targetCamY < lowerClampRatio * viewH) {
      this.aerialClampActive = true;
      targetCamY = playerY - lowerClampRatio * viewH;
    }

    // Apply vertical camera position (direct follow of already-damped verticalFocusY & smooth fall offset
    // so zero vertical jitter occurs inside the 64px vertical deadzone!)
    this.y = targetCamY;
    this.velY = (this.y - this.prevY) / stepDt;

    // ─── 5. Strict Level Boundary Clamping & Camera Locks (Zero Void, Zero Jitter) ─
    this._clampToBoundsAndLocks(tilemap, viewW, viewH, playerX, playerY);

    // Update normalized screen coordinates of the player
    this.playerScreenX = (playerX - this.x) / Math.max(1e-4, viewW);
    this.playerScreenY = (playerY - this.y) / Math.max(1e-4, viewH);

    // ─── 6. Advance Unified Trauma Shake & Sync 3D Perspective Camera ───────
    if (!this._externalShakeUpdate) {
      this.shake.update(stepDt);
    }
    this._syncPerspectiveCamera(this.fov, this.x + viewW * 0.5, this.y + viewH * 0.5);
  }

  _clampToBoundsAndLocks(tilemap, viewW, viewH, playerX = this.lastPlayerX, playerY = this.lastPlayerY) {
    const bounds = computeEffectiveCameraBounds(tilemap, viewW, viewH, this.locks, playerX, playerY);
    this.activeLockIds = bounds.activeLockIds;

    this.clampedLeft = false;
    this.clampedRight = false;
    this.clampedBottom = false;
    this.clampedTop = false;

    if (Number.isFinite(bounds.minX) && this.x <= bounds.minX + 1e-6) {
      this.x = bounds.minX;
      if (this.velX < 0) this.velX = 0;
      if (Math.abs(this.prevX - bounds.minX) < 1e-4) this.prevX = bounds.minX;
      this.clampedLeft = true;
    }
    if (Number.isFinite(bounds.maxX) && this.x >= bounds.maxX - 1e-6) {
      this.x = bounds.maxX;
      if (this.velX > 0) this.velX = 0;
      if (Math.abs(this.prevX - bounds.maxX) < 1e-4) this.prevX = bounds.maxX;
      this.clampedRight = true;
    }

    if (Number.isFinite(bounds.minY) && this.y <= bounds.minY + 1e-6) {
      this.y = bounds.minY;
      if (this.velY < 0) this.velY = 0;
      if (Math.abs(this.prevY - bounds.minY) < 1e-4) this.prevY = bounds.minY;
      this.clampedBottom = true;
    }
    if (Number.isFinite(bounds.maxY) && this.y >= bounds.maxY - 1e-6) {
      this.y = bounds.maxY;
      if (this.velY > 0) this.velY = 0;
      if (Math.abs(this.prevY - bounds.maxY) < 1e-4) this.prevY = bounds.maxY;
      this.clampedTop = true;
    }
  }

  /**
   * Snap camera immediately to frame a player at `(playerX, playerY)` (used on room load/reset).
   */
  snapToPlayer(player, tilemap = null, displayWidth = 1280, displayHeight = 720, scale = 1280 / (22 * 64)) {
    if (!player) return;
    const px = player.centerX ?? player.pos.x;
    const py = player.pos?.y ?? player.centerY ?? 0;
    const dir = player.facingRight === false ? -1 : 1;
    this.facingLookAhead = dir;
    this._committedDir = dir;

    const { viewW, viewH } = this.getViewportSizeTiles(displayWidth, displayHeight, scale, 1.0);
    const baselineScreenY = MovementProfile.camera.baselineScreenY ?? 0.35;

    const camX = px - viewW * 0.5;
    const camY = py - baselineScreenY * viewH;
    this.snapTo(camX, camY, px, py, tilemap, viewW, viewH);
  }

  /**
   * Snap camera bottom-left frustum origin directly to `(x, y)`.
   */
  snapTo(
    x,
    y,
    playerX = null,
    playerY = null,
    tilemap = null,
    viewW = BASE_VIEWPORT_WIDTH_TILES,
    viewH = BASE_VIEWPORT_HEIGHT_TILES
  ) {
    const config = MovementProfile.camera;
    const baselineScreenY = config.baselineScreenY ?? 0.35;

    this.zoom = 1.0;
    this.prevZoom = 1.0;
    this.sprintSustainFrames = 0;
    this.sprintZoomActive = false;
    this._zoomRestoreActive = false;
    this._zoomRestoreFrame = 0;
    this._zoomRestoreStartZoom = 1.0;

    this.x = x;
    this.y = y;
    this._clampToBoundsAndLocks(tilemap, viewW, viewH, playerX ?? x + viewW * 0.5, playerY ?? y + baselineScreenY * viewH);
    this.prevX = this.x;
    this.prevY = this.y;
    this.velX = 0;
    this.velY = 0;
    this._filteredVx = 0;

    this.lookAheadPx = 0;
    this.lookAheadOffset = 0;
    this.targetLookAheadPx = 0;
    this.lookAheadAlpha = config.lookAheadAlphaNormal;
    this._reversalFrames = 0;
    this._isSkidTurnaround = false;

    this.deadzoneCenterX = playerX !== null ? playerX : this.x + viewW * 0.5;
    this.inHorizontalDeadzone = true;
    this._scrollEngagedX = false;

    const anchorY = playerY !== null ? playerY : this.y + baselineScreenY * viewH;
    this.deadzoneBottomY = anchorY;
    this.verticalFocusY = anchorY;
    this.anchorElevationY = anchorY;
    this.inVerticalDeadzone = true;

    this.fallFastFrames = 0;
    this.fallAnticipationActive = false;
    this.fallLookDownPx = 0;
    this.fastFallOffset = 0;
    this.groundSnapActive = false;
    this.groundSnapFrame = 0;
    this._wasGrounded = true;
    this._airborneMovedVertical = false;
    this.aerialClampActive = false;

    this.fov = config.fov;
    this.prevFov = config.fov;
    this.sprintIntensity = 0;
    this.prevSprintIntensity = 0;
    this._sprintIntensityVel = 0;

    if (playerX !== null) this.lastPlayerX = playerX;
    if (playerY !== null) this.lastPlayerY = playerY;
    this.playerScreenX = (this.lastPlayerX - this.x) / Math.max(1e-4, viewW);
    this.playerScreenY = (this.lastPlayerY - this.y) / Math.max(1e-4, viewH);

    this.shake.reset();
    this._syncPerspectiveCamera(this.fov, this.x + viewW * 0.5, this.y + viewH * 0.5);
  }

  /**
   * Get interpolated camera state for rendering at sub-frame factor `alpha` in [0, 1].
   * Strictly read-only (never mutates simulation or shake state).
   */
  getRenderState(alpha = 1.0, displayWidth = 1280, displayHeight = 720, scale = 1280 / (22 * 64)) {
    const t = clamp(alpha, 0, 1);
    const rx = this.clampedLeft && this.prevX === this.x ? this.x : lerp(this.prevX, this.x, t);
    const ry = this.clampedBottom && this.prevY === this.y ? this.y : lerp(this.prevY, this.y, t);
    const rzoom = lerp(this.prevZoom, this.zoom, t);
    const rfov = lerp(this.prevFov, this.fov, t);
    const rsprint = lerp(this.prevSprintIntensity, this.sprintIntensity, t);
    const { viewW, viewH, baseViewW, baseViewH, fovScale } = this.getViewportSizeTiles(
      displayWidth,
      displayHeight,
      scale,
      rzoom
    );

    return {
      x: rx,
      y: ry,
      zoom: rzoom,
      fov: rfov,
      fovScale,
      viewW,
      viewH,
      baseViewW,
      baseViewH,
      sprintIntensity: rsprint,
      lookAheadPx: this.lookAheadPx,
      lookAheadOffset: this.lookAheadOffset,
      fallLookDownPx: this.fallLookDownPx,
      fallAnticipationActive: this.fallAnticipationActive,
      groundSnapActive: this.groundSnapActive,
      sprintZoomActive: this.sprintZoomActive,
      shakeX: this.shake.offsetX,
      shakeY: this.shake.offsetY,
      shakeRollDeg: this.shake.rollDeg,
      shakePitchDeg: this.shake.pitchDeg,
    };
  }
}

export default PlatformerCamera;
