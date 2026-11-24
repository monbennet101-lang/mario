/**
 * GameLoop — Fixed 60 Hz Simulation with Render Interpolation
 * ============================================================
 * Accumulator-based fixed timestep loop with spiral-of-death clamp.
 * renderPos = lerp(prevSimPos, currentSimPos, alpha)
 *
 * Time controls: Pause, frame-step, slow-motion toggle.
 * Tracks real-time FPS and simulation delta drift for telemetry.
 */

import MovementProfile from '../../game/config/MovementProfile.js';

const { fixedTimeStep, maxTicksPerFrame } = MovementProfile.simulation;

class GameLoop {
  constructor() {
    this.accumulator = 0;
    this.lastTimestamp = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.timeScale = 1.0;               // 0.25x, 0.5x, 1.0x, 2.0x
    this.frameStepRequested = false;
    this.tickCount = 0;                  // Total simulation ticks
    this.renderFrameCount = 0;           // Total render frames

    // Telemetry metrics
    this.fps = 60;
    this.frameDeltaMs = 16.67;
    this.simDriftMs = 0;
    this.lastTicksThisFrame = 0;
    this._fpsWindowFrames = 0;
    this._fpsWindowStart = 0;

    // Callbacks
    this.onFixedUpdate = null;           // (dt) => void — Physics tick at 60 Hz
    this.onRender = null;                // (alpha) => void — Render with interpolation factor
    this.onPreRender = null;             // () => void
    this.scheduleFrame = null;           // Optional pacing wrapper (e.g. gl.fenceSync afterDraw)

    this._needsPausedRender = true;
    this.keepRenderingWhilePaused = false;
    this._rafId = null;
    this._pendingPace = false;
    this._boundLoop = this._loop.bind(this);
  }

  _scheduleRaf() {
    if (!this.isRunning || this._rafId !== null || this._pendingPace || typeof requestAnimationFrame === 'undefined') {
      return;
    }
    if (this.scheduleFrame) {
      this._pendingPace = true;
      this.scheduleFrame(() => {
        this._pendingPace = false;
        if (this.isRunning && this._rafId === null) {
          this._rafId = requestAnimationFrame(this._boundLoop);
        }
      });
    } else {
      this._rafId = requestAnimationFrame(this._boundLoop);
    }
  }

  requestRender() {
    this._needsPausedRender = true;
    if (this.isPaused) {
      this._scheduleRaf();
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lastTimestamp = now;
    this._fpsWindowStart = now;
    this._fpsWindowFrames = 0;
    this._scheduleRaf();
  }

  stop() {
    this.isRunning = false;
    this._pendingPace = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this._needsPausedRender = true;
    if (!this.isPaused) {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      this.lastTimestamp = now;
      this._fpsWindowStart = now;
      this._fpsWindowFrames = 0;
      this.accumulator = 0;
    }
    this._scheduleRaf();
    return this.isPaused;
  }

  /**
   * Step exactly one simulation frame (while paused).
   */
  stepFrame() {
    if (!this.isPaused) return;
    this.frameStepRequested = true;
    this._needsPausedRender = true;
    this._scheduleRaf();
  }

  /**
   * Cycle through slow-motion presets: 1.0x → 0.5x → 0.25x → 2.0x → 1.0x
   */
  cycleTimeScale() {
    const presets = [1.0, 0.5, 0.25, 2.0];
    const idx = presets.indexOf(this.timeScale);
    this.timeScale = presets[(idx + 1) % presets.length];
    return this.timeScale;
  }

  /**
   * Advance the accumulator loop manually by `rawDeltaSec` (used by headless/framerate tests).
   * Identical accumulator & spiral-of-death logic as `_loop`.
   */
  advanceByDelta(rawDeltaSec) {
    const clampedRaw = Math.max(0, Math.min(rawDeltaSec, 0.25));
    this.frameDeltaMs = clampedRaw * 1000;

    const scaledDelta = clampedRaw * this.timeScale;
    this.accumulator += scaledDelta;

    const maxAccumulator = fixedTimeStep * maxTicksPerFrame;
    if (this.accumulator > maxAccumulator) {
      this.accumulator = maxAccumulator;
    }

    let ticksThisFrame = 0;
    while (this.accumulator >= fixedTimeStep - 1e-9) {
      if (this.onFixedUpdate) this.onFixedUpdate(fixedTimeStep);
      this.accumulator = Math.max(0, this.accumulator - fixedTimeStep);
      this.tickCount++;
      ticksThisFrame++;
    }

    this.lastTicksThisFrame = ticksThisFrame;
    this.simDriftMs = this.accumulator * 1000;
    return this.accumulator / fixedTimeStep;
  }

  /**
   * Step an exact integer number of 60 Hz ticks (headless deterministic helper).
   */
  stepFixed(ticks = 1) {
    for (let i = 0; i < ticks; i++) {
      if (this.onFixedUpdate) this.onFixedUpdate(fixedTimeStep);
      this.tickCount++;
    }
  }

  _loop(timestamp) {
    this._rafId = null;
    if (!this.isRunning) return;

    const rawDelta = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    // Update FPS window every 250ms
    this._fpsWindowFrames++;
    const elapsedMs = timestamp - this._fpsWindowStart;
    if (elapsedMs >= 250) {
      this.fps = (this._fpsWindowFrames * 1000) / elapsedMs;
      this._fpsWindowFrames = 0;
      this._fpsWindowStart = timestamp;
    }

    if (this.onPreRender) this.onPreRender();

    // Handle pause (only render when dirty or when Pose Inspector playback is active)
    if (this.isPaused && !this.frameStepRequested) {
      this.simDriftMs = 0;
      if (this._needsPausedRender || this.keepRenderingWhilePaused) {
        this._needsPausedRender = false;
        if (this.onRender) this.onRender(1.0);
      }
      if (this.keepRenderingWhilePaused) {
        this._scheduleRaf();
      }
      return;
    }

    if (this.frameStepRequested) {
      this.frameStepRequested = false;
      this._needsPausedRender = false;
      if (this.onFixedUpdate) this.onFixedUpdate(fixedTimeStep);
      this.tickCount++;
      this.lastTicksThisFrame = 1;
      if (this.onRender) this.onRender(1.0);
      this.renderFrameCount++;
      return;
    }

    const alpha = this.advanceByDelta(rawDelta);

    if (this.onRender) this.onRender(alpha);
    this.renderFrameCount++;
    this._scheduleRaf();
  }

  /**
   * Reset loop state (for room transitions, etc.)
   */
  reset() {
    this.accumulator = 0;
    this.tickCount = 0;
    this.renderFrameCount = 0;
    this.simDriftMs = 0;
    this.lastTicksThisFrame = 0;
    this.lastTimestamp = typeof performance !== 'undefined' ? performance.now() : 0;
  }
}

export default GameLoop;
